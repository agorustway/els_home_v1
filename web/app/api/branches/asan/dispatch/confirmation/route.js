import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/utils/supabase/server';
import { decorateActorFields, getCurrentUserActorName } from '../actorName';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BRANCH_ID = 'asan';
const VALID_TYPES = new Set(['glovis', 'mobis', 'integrated']);

function isMissingConfirmationTableError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return code === '42P01'
        || code === 'PGRST205'
        || message.includes('branch_dispatch_confirmations')
        || message.includes('branch_dispatch_confirmation_history');
}

function normalizePayload(input = {}) {
    return {
        dispatchType: String(input.dispatchType || input.dispatch_type || input.type || '').trim(),
        targetDate: String(input.targetDate || input.target_date || '').trim(),
        action: String(input.action || '').trim(),
    };
}

function validateScope(payload) {
    if (!VALID_TYPES.has(payload.dispatchType)) return '배차 구분이 올바르지 않습니다.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.targetDate)) return '대상 날짜가 올바르지 않습니다.';
    return '';
}

async function requireUser(request) {
    const sessionSupabase = await createClient();
    const authHeader = request.headers.get('authorization') || '';
    const bearerToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
    const { data: { user } } = await sessionSupabase.auth.getUser(bearerToken);
    if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
    return { user, adminSupabase: await createAdminClient() };
}

async function fetchConfirmation(adminSupabase, payload) {
    const { data, error } = await adminSupabase
        .from('branch_dispatch_confirmations')
        .select('*')
        .eq('branch_id', BRANCH_ID)
        .eq('dispatch_type', payload.dispatchType)
        .eq('target_date', payload.targetDate)
        .maybeSingle();
    if (error) throw error;
    return data || null;
}

async function decorateConfirmation(adminSupabase, row) {
    return decorateActorFields(adminSupabase, row, ['confirmed_by', 'canceled_by', 'created_by', 'updated_by']);
}

export async function GET(request) {
    const access = await requireUser(request);
    if (access.error) return access.error;

    const { searchParams } = new URL(request.url);
    const payload = normalizePayload({
        dispatchType: searchParams.get('dispatchType'),
        targetDate: searchParams.get('targetDate'),
    });
    const validationError = validateScope(payload);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    try {
        const data = await fetchConfirmation(access.adminSupabase, payload);
        return NextResponse.json({ data: await decorateConfirmation(access.adminSupabase, data) });
    } catch (error) {
        if (isMissingConfirmationTableError(error)) {
            return NextResponse.json({
                setupRequired: true,
                data: null,
                sqlFile: 'web/supabase_sql/20260524_asan_dispatch_confirmations.sql',
            });
        }
        return NextResponse.json({ error: error.message || '배차확정 조회 실패' }, { status: 500 });
    }
}

export async function POST(request) {
    const access = await requireUser(request);
    if (access.error) return access.error;

    try {
        const payload = normalizePayload(await request.json());
        const validationError = validateScope(payload);
        if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
        if (!['confirm', 'cancel'].includes(payload.action)) {
            return NextResponse.json({ error: '확정 또는 확정취소 작업이 필요합니다.' }, { status: 400 });
        }

        const actor = await getCurrentUserActorName(access.adminSupabase, access.user);
        const now = new Date().toISOString();
        const existing = await fetchConfirmation(access.adminSupabase, payload);
        const baseMatch = {
            branch_id: BRANCH_ID,
            dispatch_type: payload.dispatchType,
            target_date: payload.targetDate,
        };
        const nextRow = payload.action === 'confirm'
            ? {
                ...baseMatch,
                active: true,
                confirmed_at: now,
                confirmed_by: actor,
                canceled_at: null,
                canceled_by: null,
                updated_by: actor,
                updated_at: now,
            }
            : {
                ...baseMatch,
                active: false,
                canceled_at: now,
                canceled_by: actor,
                updated_by: actor,
                updated_at: now,
            };

        const result = existing?.id
            ? await access.adminSupabase
                .from('branch_dispatch_confirmations')
                .update(nextRow)
                .eq('id', existing.id)
                .select()
                .single()
            : await access.adminSupabase
                .from('branch_dispatch_confirmations')
                .insert({
                    ...nextRow,
                    created_by: actor,
                    created_at: now,
                })
                .select()
                .single();

        if (result.error) throw result.error;

        const { error: historyError } = await access.adminSupabase
            .from('branch_dispatch_confirmation_history')
            .insert({
                confirmation_id: result.data.id,
                ...baseMatch,
                action: payload.action,
                old_active: existing?.active ?? null,
                new_active: result.data.active,
                changed_by: actor,
                changed_at: now,
            });
        if (historyError) throw historyError;

        return NextResponse.json({ success: true, data: await decorateConfirmation(access.adminSupabase, result.data) });
    } catch (error) {
        if (isMissingConfirmationTableError(error)) {
            return NextResponse.json({
                setupRequired: true,
                error: '배차확정 DB 스키마가 아직 적용되지 않았습니다.',
                sqlFile: 'web/supabase_sql/20260524_asan_dispatch_confirmations.sql',
            }, { status: 503 });
        }
        console.error('[asan-dispatch-confirmation] failed:', error);
        return NextResponse.json({ error: error.message || '배차확정 처리 실패' }, { status: 500 });
    }
}
