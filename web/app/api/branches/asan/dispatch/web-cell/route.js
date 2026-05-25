import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/utils/supabase/server';
import {
    ASAN_DISPATCH_WEB_CELL_FIELDS,
    getDispatchWebCellFieldLabel,
    normalizeDispatchWebCellFieldKey,
    normalizeDispatchWebCellValue,
    validateDispatchWebCellValue,
} from '@/utils/asanDispatchWebCellFields.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BRANCH_ID = 'asan';
const VALID_TYPES = new Set(['glovis', 'mobis']);
const BKG_LOCK_FIELDS = new Set([
    ASAN_DISPATCH_WEB_CELL_FIELDS.BKG1,
    ASAN_DISPATCH_WEB_CELL_FIELDS.BKG2,
    ASAN_DISPATCH_WEB_CELL_FIELDS.BKG3,
]);

function isMissingWebCellTableError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return code === '42P01'
        || code === 'PGRST205'
        || message.includes('branch_dispatch_web_cells')
        || message.includes('branch_dispatch_web_column_settings');
}

function normalizePayload(body = {}) {
    const dispatchType = String(body.dispatchType || body.type || body.sourceType || '').trim();
    const targetDate = String(body.targetDate || body.target_date || '').trim();
    const rowSignature = String(body.rowSignature || body.row_signature || '').trim();
    const fieldKey = normalizeDispatchWebCellFieldKey(body.fieldKey || body.field_key || body.header);
    const rowIndex = Number.isFinite(Number(body.rowIndex ?? body.row_index))
        ? Number(body.rowIndex ?? body.row_index)
        : null;
    return {
        dispatchType,
        targetDate,
        rowSignature,
        fieldKey,
        rowIndex,
        rowContext: body.rowContext || body.row_context || {},
        previousValue: normalizeDispatchWebCellValue(body.previousValue || body.previous_value || ''),
        value: body.value,
    };
}

async function readWebCellSettings(adminSupabase) {
    const { data, error } = await adminSupabase
        .from('branch_dispatch_web_column_settings')
        .select('*')
        .eq('branch_id', BRANCH_ID)
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function hasActiveDispatchConfirmation(adminSupabase, payload) {
    const { data, error } = await adminSupabase
        .from('branch_dispatch_confirmations')
        .select('id, dispatch_type, active')
        .eq('branch_id', BRANCH_ID)
        .eq('target_date', payload.targetDate)
        .eq('active', true)
        .in('dispatch_type', [payload.dispatchType, 'integrated']);
    if (error) throw error;
    return (data || []).length > 0;
}

export async function POST(request) {
    const sessionSupabase = await createClient();
    const { data: { user } } = await sessionSupabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    try {
        const payload = normalizePayload(await request.json());

        if (!VALID_TYPES.has(payload.dispatchType)) {
            return NextResponse.json({ error: '원본 구분(glovis/mobis)이 필요합니다.' }, { status: 400 });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.targetDate)) {
            return NextResponse.json({ error: '대상 날짜가 올바르지 않습니다.' }, { status: 400 });
        }
        if (!payload.rowSignature) {
            return NextResponse.json({ error: '행 식별값이 없습니다. 화면을 새로고침 후 다시 시도해 주세요.' }, { status: 400 });
        }

        const validation = validateDispatchWebCellValue(payload.fieldKey, payload.value);
        if (!validation.ok) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        const adminSupabase = await createAdminClient();
        let settings;
        try {
            settings = await readWebCellSettings(adminSupabase);
        } catch (error) {
            if (isMissingWebCellTableError(error)) {
                return NextResponse.json({ error: 'WEB 전용 컬럼 DB 스키마가 아직 적용되지 않았습니다.' }, { status: 503 });
            }
            throw error;
        }

        if (!settings?.enabled) {
            return NextResponse.json({ error: 'WEB 전용 컬럼 모드가 아직 활성화되지 않았습니다. 컷오버 백필을 먼저 실행해야 합니다.' }, { status: 409 });
        }

        const actor = user.email || user.id || 'unknown';
        const baseMatch = {
            branch_id: BRANCH_ID,
            dispatch_type: payload.dispatchType,
            target_date: payload.targetDate,
            row_signature: payload.rowSignature,
            field_key: payload.fieldKey,
        };

        const { data: signatureExisting, error: existingError } = await adminSupabase
            .from('branch_dispatch_web_cells')
            .select('*')
            .match(baseMatch)
            .maybeSingle();

        if (existingError) throw existingError;

        let rowIndexExisting = null;
        if (!signatureExisting && payload.rowIndex !== null) {
            const { data: rowIndexMatch, error: rowIndexError } = await adminSupabase
                .from('branch_dispatch_web_cells')
                .select('*')
                .eq('branch_id', BRANCH_ID)
                .eq('dispatch_type', payload.dispatchType)
                .eq('target_date', payload.targetDate)
                .eq('field_key', payload.fieldKey)
                .eq('row_index', payload.rowIndex)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (rowIndexError) throw rowIndexError;
            rowIndexExisting = rowIndexMatch;
        }

        const existing = signatureExisting || rowIndexExisting;
        const oldValue = existing?.value ?? '';
        const existingLockValue = normalizeDispatchWebCellValue(existing?.value || payload.previousValue || '');
        if (
            BKG_LOCK_FIELDS.has(payload.fieldKey)
            && existingLockValue
            && validation.value !== existingLockValue
            && await hasActiveDispatchConfirmation(adminSupabase, payload)
        ) {
            return NextResponse.json({
                error: '배차확정 이후 기존 BKG 값은 수정할 수 없습니다. 빈 BKG2/3 칸만 추가 입력할 수 있습니다.',
            }, { status: 409 });
        }
        const metadataChanged = Boolean(existing && (
            existing.row_signature !== payload.rowSignature
            || Number(existing.row_index ?? -1) !== Number(payload.rowIndex ?? -1)
            || JSON.stringify(existing.row_context || {}) !== JSON.stringify(payload.rowContext || {})
        ));
        if (oldValue === validation.value && !metadataChanged) {
            return NextResponse.json({
                success: true,
                unchanged: true,
                data: existing || { ...baseMatch, value: validation.value },
            });
        }

        const cellPayload = {
            ...baseMatch,
            value: validation.value,
            row_index: payload.rowIndex,
            row_context: payload.rowContext,
            source: 'web',
            updated_by: actor,
            updated_at: new Date().toISOString(),
        };

        const result = existing?.id
            ? await adminSupabase
                .from('branch_dispatch_web_cells')
                .update(cellPayload)
                .eq('id', existing.id)
                .select()
                .single()
            : await adminSupabase
                .from('branch_dispatch_web_cells')
                .insert({ ...cellPayload, created_by: actor })
                .select()
                .single();

        if (result.error) throw result.error;

        const action = validation.value
            ? (existing?.id ? 'update' : 'create')
            : 'clear';

        const { error: historyError } = await adminSupabase
            .from('branch_dispatch_web_cell_history')
            .insert({
                cell_id: result.data.id,
                ...baseMatch,
                row_index: payload.rowIndex,
                row_context: payload.rowContext,
                old_value: oldValue,
                new_value: validation.value,
                action,
                changed_by: actor,
            });

        if (historyError) throw historyError;

        return NextResponse.json({
            success: true,
            data: {
                ...result.data,
                field_label: getDispatchWebCellFieldLabel(payload.fieldKey),
            },
        });
    } catch (error) {
        console.error('[asan-dispatch-web-cell] save failed:', error);
        return NextResponse.json({ error: error.message || '저장 실패' }, { status: 500 });
    }
}

export async function GET(request) {
    const sessionSupabase = await createClient();
    const { data: { user } } = await sessionSupabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const payload = normalizePayload({
        dispatchType: searchParams.get('dispatchType'),
        targetDate: searchParams.get('targetDate'),
        rowSignature: searchParams.get('rowSignature'),
        fieldKey: searchParams.get('fieldKey'),
    });

    if (!VALID_TYPES.has(payload.dispatchType) || !payload.targetDate || !payload.rowSignature || !payload.fieldKey) {
        return NextResponse.json({ error: '조회 조건이 부족합니다.' }, { status: 400 });
    }

    try {
        const adminSupabase = await createAdminClient();
        const { data, error } = await adminSupabase
            .from('branch_dispatch_web_cell_history')
            .select('*')
            .eq('branch_id', BRANCH_ID)
            .eq('dispatch_type', payload.dispatchType)
            .eq('target_date', payload.targetDate)
            .eq('row_signature', payload.rowSignature)
            .eq('field_key', payload.fieldKey)
            .order('changed_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        return NextResponse.json({ data: data || [] });
    } catch (error) {
        if (isMissingWebCellTableError(error)) {
            return NextResponse.json({ data: [], warning: 'WEB 전용 컬럼 DB 스키마가 아직 적용되지 않았습니다.' });
        }
        return NextResponse.json({ error: error.message || '이력 조회 실패' }, { status: 500 });
    }
}
