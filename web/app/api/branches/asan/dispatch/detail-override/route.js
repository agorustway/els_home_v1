import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/utils/supabase/server';
import { decorateActorFields, getCurrentUserActorName } from '../actorName';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BRANCH_ID = 'asan';
const VALID_TYPES = new Set(['glovis', 'mobis', 'integrated']);
const VALID_FIELDS = new Set(['confirmed_bkg', 'start_location', 'glaps_port_code', 'dg', 'rf', 'dg_rf']);
const VALID_SOURCES = new Set(['BKG1', 'BKG2', 'BKG3', 'manual']);

function isMissingOverrideTableError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return code === '42P01'
        || code === 'PGRST205'
        || message.includes('branch_dispatch_detail_overrides')
        || message.includes('branch_dispatch_detail_override_history');
}

function cleanText(value = '') {
    return String(value ?? '').trim();
}

function normalizePayload(input = {}) {
    return {
        dispatchType: cleanText(input.dispatchType || input.dispatch_type || input.type),
        targetDate: cleanText(input.targetDate || input.target_date),
        detailLineKey: cleanText(input.detailLineKey || input.detail_line_key),
        fieldKey: cleanText(input.fieldKey || input.field_key),
        value: cleanText(input.value),
        source: cleanText(input.source) || 'manual',
        rowContext: input.rowContext || input.row_context || {},
    };
}

function validateScope(payload, { requireLine = false } = {}) {
    if (!VALID_TYPES.has(payload.dispatchType)) return '배차 구분이 올바르지 않습니다.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.targetDate)) return '대상 날짜가 올바르지 않습니다.';
    if (requireLine && !payload.detailLineKey) return '상세배차 행 식별값이 없습니다.';
    if (requireLine && !VALID_FIELDS.has(payload.fieldKey)) return '수정 항목이 올바르지 않습니다.';
    if (requireLine && !VALID_SOURCES.has(payload.source)) return '수정 출처가 올바르지 않습니다.';
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
        const { data, error } = await access.adminSupabase
            .from('branch_dispatch_detail_overrides')
            .select('*')
            .eq('branch_id', BRANCH_ID)
            .eq('dispatch_type', payload.dispatchType)
            .eq('target_date', payload.targetDate)
            .eq('active', true);
        if (error) throw error;
        const decorated = [];
        for (const row of data || []) {
            decorated.push(await decorateActorFields(access.adminSupabase, row, ['created_by', 'updated_by']));
        }
        return NextResponse.json({ data: decorated });
    } catch (error) {
        if (isMissingOverrideTableError(error)) {
            return NextResponse.json({
                setupRequired: true,
                data: [],
                sqlFile: 'web/supabase_sql/20260524_asan_dispatch_confirmations.sql',
            });
        }
        return NextResponse.json({ error: error.message || '상세배차 보정값 조회 실패' }, { status: 500 });
    }
}

export async function POST(request) {
    const access = await requireUser(request);
    if (access.error) return access.error;

    try {
        const payload = normalizePayload(await request.json());
        const validationError = validateScope(payload, { requireLine: true });
        if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

        const actor = await getCurrentUserActorName(access.adminSupabase, access.user);
        const now = new Date().toISOString();
        const baseMatch = {
            branch_id: BRANCH_ID,
            dispatch_type: payload.dispatchType,
            target_date: payload.targetDate,
            detail_line_key: payload.detailLineKey,
            field_key: payload.fieldKey,
        };

        const { data: existing, error: existingError } = await access.adminSupabase
            .from('branch_dispatch_detail_overrides')
            .select('*')
            .match(baseMatch)
            .maybeSingle();
        if (existingError) throw existingError;

        const overridePayload = {
            ...baseMatch,
            value: payload.value,
            source: payload.source,
            row_context: payload.rowContext,
            active: true,
            updated_by: actor,
            updated_at: now,
        };

        const result = existing?.id
            ? await access.adminSupabase
                .from('branch_dispatch_detail_overrides')
                .update(overridePayload)
                .eq('id', existing.id)
                .select()
                .single()
            : await access.adminSupabase
                .from('branch_dispatch_detail_overrides')
                .insert({
                    ...overridePayload,
                    created_by: actor,
                    created_at: now,
                })
                .select()
                .single();

        if (result.error) throw result.error;

        const { error: historyError } = await access.adminSupabase
            .from('branch_dispatch_detail_override_history')
            .insert({
                override_id: result.data.id,
                ...baseMatch,
                old_value: existing?.value ?? '',
                new_value: payload.value,
                old_source: existing?.source ?? '',
                new_source: payload.source,
                row_context: payload.rowContext,
                changed_by: actor,
                changed_at: now,
            });
        if (historyError) throw historyError;

        return NextResponse.json({ success: true, data: result.data });
    } catch (error) {
        if (isMissingOverrideTableError(error)) {
            return NextResponse.json({
                setupRequired: true,
                error: '상세배차 보정값 DB 스키마가 아직 적용되지 않았습니다.',
                sqlFile: 'web/supabase_sql/20260524_asan_dispatch_confirmations.sql',
            }, { status: 503 });
        }
        console.error('[asan-dispatch-detail-override] failed:', error);
        return NextResponse.json({ error: error.message || '상세배차 보정값 저장 실패' }, { status: 500 });
    }
}
