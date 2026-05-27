import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/utils/supabase/server';
import { decorateActorFields, getCurrentUserActorName } from '../actorName';
import { normalizeDispatchChangeLineRecord } from '@/utils/asanDispatchChangeEvents.mjs';

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
        || message.includes('branch_dispatch_confirmation_history')
        || message.includes('branch_dispatch_detail_snapshots');
}

function normalizePayload(input = {}) {
    return {
        dispatchType: String(input.dispatchType || input.dispatch_type || input.type || '').trim(),
        targetDate: String(input.targetDate || input.target_date || '').trim(),
        action: String(input.action || '').trim(),
        snapshotLines: Array.isArray(input.snapshotLines || input.snapshot_lines) ? (input.snapshotLines || input.snapshot_lines) : [],
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
    if (!row) return null;
    const decorated = await decorateActorFields(adminSupabase, row, ['confirmed_by', 'canceled_by', 'created_by', 'updated_by']);
    const { data, error } = await adminSupabase
        .from('branch_dispatch_detail_snapshots')
        .select('detail_line_key,row_values,row_context')
        .eq('confirmation_id', row.id)
        .eq('active', true);
    if (error) throw error;
    return {
        ...decorated,
        snapshot_lines: (data || []).map(snapshot => ({
            detailLineKey: snapshot.detail_line_key || '',
            rowValues: snapshot.row_values?.values || snapshot.row_values || [],
            rowContext: snapshot.row_context || {},
        })),
    };
}

function toSnapshotDbRow(line, resultRow, actor, now) {
    const normalized = normalizeDispatchChangeLineRecord(line);
    return {
        confirmation_id: resultRow.id,
        branch_id: BRANCH_ID,
        dispatch_type: resultRow.dispatch_type,
        target_date: resultRow.target_date,
        detail_line_key: normalized.detailLineKey,
        identity_key: normalized.identityKey,
        group_key: normalized.groupKey,
        row_fingerprint: normalized.rowFingerprint,
        row_values: { values: normalized.rowValues },
        row_context: normalized.rowContext,
        active: true,
        created_by: actor,
        created_at: now,
    };
}

async function ensureConfirmationSnapshot(adminSupabase, resultRow, snapshotLines, actor, now) {
    if (!resultRow?.id || !Array.isArray(snapshotLines) || snapshotLines.length === 0) return;
    const { count, error: countError } = await adminSupabase
        .from('branch_dispatch_detail_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('confirmation_id', resultRow.id)
        .eq('active', true);
    if (countError) throw countError;
    if ((count || 0) > 0) return;

    const rows = snapshotLines
        .map(line => toSnapshotDbRow(line, resultRow, actor, now))
        .filter(row => row.detail_line_key);
    if (rows.length === 0) return;

    const { error } = await adminSupabase
        .from('branch_dispatch_detail_snapshots')
        .insert(rows);
    if (error) throw error;
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

        if (payload.action === 'confirm') {
            await ensureConfirmationSnapshot(access.adminSupabase, result.data, payload.snapshotLines, actor, now);
        }

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
