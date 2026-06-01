import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/utils/supabase/server';
import { decorateActorFields, getCurrentUserActorName } from '../actorName';
import {
    DISPATCH_CHANGE_SCHEMA_VERSION,
    diffDispatchChangeLines,
    diffDispatchMemoOnlyChanges,
    filterMemoOnlyDispatchChangeEvents,
    filterNeutralizedDispatchChangeEvents,
    mergeDispatchMemoOnlyPayload,
    normalizeDispatchChangeLineRecord,
} from '@/utils/asanDispatchChangeEvents.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BRANCH_ID = 'asan';
const VALID_TYPES = new Set(['glovis', 'mobis', 'integrated']);
const CHANGE_SQL_FILE = 'web/supabase_sql/20260524_asan_dispatch_change_events.sql';

function cleanText(value = '') {
    return String(value ?? '').trim();
}

function eventSnapshotPayload(row = {}) {
    return [row.editable_payload, row.after_snapshot, row.before_snapshot]
        .find(payload => payload && Object.keys(payload).length > 0)
        || {};
}

function detectEventDispatchType(row = {}) {
    const payload = eventSnapshotPayload(row);
    const context = payload.rowContext || {};
    const explicitType = cleanText(context.dispatchType || context.sourceType || context.type);
    if (VALID_TYPES.has(explicitType) && explicitType !== 'integrated') return explicitType;

    const shipper = cleanText(context.shipper || '');
    if (shipper.includes('글로비스')) return 'glovis';
    if (shipper.includes('모비스')) return 'mobis';
    return '';
}

function eventMatchesRequestedScope(row = {}, payload = {}) {
    if (payload.dispatchType === 'integrated') {
        return ['integrated', 'glovis', 'mobis'].includes(row.dispatch_type);
    }
    if (row.dispatch_type === payload.dispatchType) return true;
    if (row.dispatch_type !== 'integrated') return false;
    return detectEventDispatchType(row) === payload.dispatchType;
}

function isMissingChangeTableError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return code === '42P01'
        || code === 'PGRST205'
        || message.includes('branch_dispatch_detail_snapshots')
        || message.includes('branch_dispatch_detail_change_events')
        || message.includes('branch_dispatch_detail_change_history');
}

function normalizePayload(input = {}) {
    return {
        dispatchType: cleanText(input.dispatchType || input.dispatch_type || input.type),
        targetDate: cleanText(input.targetDate || input.target_date),
        action: cleanText(input.action || 'sync'),
        currentLines: Array.isArray(input.currentLines) ? input.currentLines : [],
        eventId: cleanText(input.eventId || input.event_id),
        eventIds: Array.isArray(input.eventIds || input.event_ids) ? (input.eventIds || input.event_ids).map(cleanText).filter(Boolean) : [],
        editablePayload: input.editablePayload || input.editable_payload || null,
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

async function fetchConfirmations(adminSupabase, payload) {
    const { data, error } = await adminSupabase
        .from('branch_dispatch_confirmations')
        .select('*')
        .eq('branch_id', BRANCH_ID)
        .in('dispatch_type', payload.dispatchTypes || [payload.dispatchType])
        .eq('target_date', payload.targetDate);
    if (error) throw error;
    return data || [];
}

function isActiveConfirmation(row) {
    return Boolean(row?.id && row.active);
}

function detectLineDispatchType(line = {}) {
    const context = line.rowContext || line.row_context || {};
    const explicitType = cleanText(context.dispatchType || context.sourceType || line.dispatchType || line.sourceType);
    if (VALID_TYPES.has(explicitType) && explicitType !== 'integrated') return explicitType;
    const shipper = cleanText(context.shipper || line.shipper || '');
    if (shipper.includes('글로비스')) return 'glovis';
    if (shipper.includes('모비스')) return 'mobis';
    return '';
}

function splitCurrentLinesByDispatchType(currentLines = []) {
    const groups = new Map();
    for (const type of ['glovis', 'mobis']) groups.set(type, []);
    currentLines.forEach((line) => {
        const type = detectLineDispatchType(line);
        if (groups.has(type)) groups.get(type).push(line);
    });
    return groups;
}

async function fetchSnapshots(adminSupabase, confirmationId) {
    if (!confirmationId) return [];
    const { data, error } = await adminSupabase
        .from('branch_dispatch_detail_snapshots')
        .select('*')
        .eq('confirmation_id', confirmationId)
        .eq('active', true);
    if (error) throw error;
    return data || [];
}

async function decorateEvent(adminSupabase, row) {
    return decorateActorFields(adminSupabase, row, ['confirmed_by', 'created_by', 'updated_by']);
}

function dbRowToNeutralFilterEvent(row = {}) {
    return {
        eventKey: row.event_key || '',
        changeType: row.change_type || '',
        editablePayload: row.editable_payload || null,
        afterSnapshot: row.after_snapshot || null,
        beforeSnapshot: row.before_snapshot || null,
        row,
    };
}

async function fetchEvents(adminSupabase, payload) {
    const directConfirmation = payload.dispatchType === 'integrated'
        ? await fetchConfirmation(adminSupabase, payload)
        : null;
    const integratedDirectActive = payload.dispatchType === 'integrated' && isActiveConfirmation(directConfirmation);

    let query = adminSupabase
        .from('branch_dispatch_detail_change_events')
        .select('*')
        .eq('branch_id', BRANCH_ID)
        .eq('target_date', payload.targetDate)
        .eq('active', true)
        .order('occurred_at', { ascending: true })
        .order('event_order', { ascending: true });

    if (payload.dispatchType === 'integrated') {
        query = integratedDirectActive
            ? query.eq('dispatch_type', payload.dispatchType)
            : query.in('dispatch_type', ['integrated', 'glovis', 'mobis']);
    } else {
        const sourceConfirmation = await fetchConfirmation(adminSupabase, payload);
        query = sourceConfirmation
            ? query.eq('dispatch_type', payload.dispatchType)
            : query.in('dispatch_type', [payload.dispatchType, 'integrated']);
    }

    const { data, error } = await query;
    if (error) throw error;
    const scopedRows = (data || []).filter(row => eventMatchesRequestedScope(row, payload));
    const visibleEvents = filterNeutralizedDispatchChangeEvents(
        scopedRows.map(dbRowToNeutralFilterEvent),
        { isConfirmedEvent: event => event.row?.event_status === 'confirmed' },
    );
    const decorated = [];
    for (const row of visibleEvents.map(event => event.row).filter(Boolean)) {
        decorated.push(await decorateEvent(adminSupabase, row));
    }
    return decorated;
}

function jsonPayload(value) {
    return JSON.stringify(value ?? null);
}

function currentLineSchemaVersion(line = {}) {
    const context = line.rowContext || line.row_context || {};
    return Number(context.changeSchemaVersion || context.dispatchChangeSchemaVersion || 0);
}

function hasSupportedCurrentLineSchema(currentLines = []) {
    if (!Array.isArray(currentLines) || currentLines.length === 0) return true;
    return currentLines.every(line => currentLineSchemaVersion(line) >= DISPATCH_CHANGE_SCHEMA_VERSION);
}

function snapshotRecordToLine(row = {}) {
    return normalizeDispatchChangeLineRecord({
        detailLineKey: row.detail_line_key,
        identityKey: row.identity_key,
        groupKey: row.group_key,
        rowFingerprint: row.row_fingerprint,
        rowValues: row.row_values?.values || row.row_values || [],
        rowContext: row.row_context || {},
    });
}

function snapshotDbRowFromLine(line, confirmation, actor, now) {
    const normalized = normalizeDispatchChangeLineRecord(line);
    return {
        confirmation_id: confirmation.id,
        branch_id: BRANCH_ID,
        dispatch_type: confirmation.dispatch_type,
        target_date: confirmation.target_date,
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

async function seedSnapshots(adminSupabase, confirmation, currentLines, actor, now) {
    if (!confirmation?.id || !currentLines?.length) return;
    const rows = currentLines
        .map(line => snapshotDbRowFromLine(line, confirmation, actor, now))
        .filter(row => row.detail_line_key);
    if (rows.length === 0) return;
    const { error } = await adminSupabase
        .from('branch_dispatch_detail_snapshots')
        .insert(rows);
    if (error) throw error;
}

function eventToDbPayload(event, confirmation, actor, now, existing = null) {
    const keepEditablePayload = existing?.editable_payload && Object.keys(existing.editable_payload || {}).length > 0
        ? mergeDispatchMemoOnlyPayload(existing.editable_payload, event.editablePayload)
        : event.editablePayload;
    const significantPayloadChanged = existing
        ? jsonPayload(existing.before_snapshot) !== jsonPayload(event.beforeSnapshot)
            || jsonPayload(existing.after_snapshot) !== jsonPayload(event.afterSnapshot)
            || existing.change_type !== event.changeType
            || Number(existing.quantity_delta || 0) !== Number(event.quantityDelta || 0)
        : true;
    const statusResetRequired = existing
        ? existing.change_type !== event.changeType
            || Number(existing.quantity_delta || 0) !== Number(event.quantityDelta || 0)
            || cleanText(existing.before_snapshot?.rowFingerprint) !== cleanText(event.beforeSnapshot?.rowFingerprint)
            || cleanText(existing.after_snapshot?.rowFingerprint) !== cleanText(event.afterSnapshot?.rowFingerprint)
        : true;
    return {
        confirmation_id: confirmation.id,
        branch_id: BRANCH_ID,
        dispatch_type: confirmation.dispatch_type,
        target_date: confirmation.target_date,
        event_key: event.eventKey,
        change_type: event.changeType,
        event_status: statusResetRequired ? 'pending' : existing?.event_status || 'pending',
        detail_line_key: event.detailLineKey || '',
        identity_key: event.identityKey || '',
        group_key: event.groupKey || '',
        quantity_delta: event.quantityDelta || 0,
        before_snapshot: event.beforeSnapshot,
        after_snapshot: event.afterSnapshot,
        editable_payload: keepEditablePayload,
        active: true,
        occurred_at: statusResetRequired ? now : existing?.occurred_at || event.occurredAt || now,
        confirmed_by: statusResetRequired ? null : existing?.confirmed_by || null,
        confirmed_at: statusResetRequired ? null : existing?.confirmed_at || null,
        updated_by: actor,
        updated_at: significantPayloadChanged || jsonPayload(existing?.editable_payload) !== jsonPayload(keepEditablePayload) ? now : existing?.updated_at || now,
    };
}

async function insertHistory(adminSupabase, event, confirmation, action, actor, now, oldPayload = null, newPayload = null) {
    if (action === 'refreshed' || action === 'resolved' || action.endsWith('_refreshed') || action.endsWith('_resolved')) {
        return;
    }

    const { error } = await adminSupabase
        .from('branch_dispatch_detail_change_history')
        .insert({
            event_id: event?.id || null,
            confirmation_id: confirmation?.id || event?.confirmation_id || null,
            branch_id: BRANCH_ID,
            dispatch_type: confirmation?.dispatch_type || event?.dispatch_type || '',
            target_date: confirmation?.target_date || event?.target_date || null,
            action,
            old_status: oldPayload?.event_status || null,
            new_status: newPayload?.event_status || event?.event_status || null,
            old_payload: oldPayload,
            new_payload: newPayload,
            changed_by: actor,
            changed_at: now,
        });
    if (error) throw error;
}

async function insertMemoOnlyHistory(adminSupabase, confirmation, memoChanges, actor, now) {
    if (!confirmation?.id || memoChanges.length === 0) return;
    const { data: existingRows, error } = await adminSupabase
        .from('branch_dispatch_detail_change_history')
        .select('old_payload, new_payload')
        .eq('confirmation_id', confirmation.id)
        .eq('action', 'memo_changed');
    if (error) throw error;

    const existingKeys = new Set((existingRows || []).map(row => `${jsonPayload(row.old_payload)}=>${jsonPayload(row.new_payload)}`));
    for (const change of memoChanges) {
        const oldPayload = {
            ...change.beforeSnapshot,
            memoDiffHeaders: change.diffHeaders,
        };
        const newPayload = {
            ...change.afterSnapshot,
            memoDiffHeaders: change.diffHeaders,
        };
        const historyKey = `${jsonPayload(oldPayload)}=>${jsonPayload(newPayload)}`;
        if (existingKeys.has(historyKey)) continue;
        existingKeys.add(historyKey);
        await insertHistory(adminSupabase, null, confirmation, 'memo_changed', actor, now, oldPayload, newPayload);
    }
}

async function syncChangeEvents(adminSupabase, confirmation, currentLines, actor, now) {
    if (!confirmation?.id) return;
    if (!confirmation.active) return;
    if (!hasSupportedCurrentLineSchema(currentLines)) return;

    const snapshots = await fetchSnapshots(adminSupabase, confirmation.id);
    if (snapshots.length === 0) {
        await seedSnapshots(adminSupabase, confirmation, currentLines, actor, now);
        return;
    }

    const normalizedSnapshots = snapshots.map(snapshotRecordToLine);
    const normalizedCurrent = currentLines.map(normalizeDispatchChangeLineRecord);
    const rawNextEvents = diffDispatchChangeLines(normalizedSnapshots, normalizedCurrent, { occurredAt: now });
    const memoChanges = diffDispatchMemoOnlyChanges(normalizedSnapshots, normalizedCurrent, { occurredAt: now });

    const { data: existingRows, error: existingError } = await adminSupabase
        .from('branch_dispatch_detail_change_events')
        .select('*')
        .eq('confirmation_id', confirmation.id);
    if (existingError) throw existingError;

    const existingByKey = new Map((existingRows || []).map(row => [row.event_key, row]));
    const structuralEvents = filterMemoOnlyDispatchChangeEvents(rawNextEvents, {
        isConfirmedEvent: event => existingByKey.get(event.eventKey)?.event_status === 'confirmed',
    });
    const nextEvents = filterNeutralizedDispatchChangeEvents(structuralEvents, {
        isConfirmedEvent: event => existingByKey.get(event.eventKey)?.event_status === 'confirmed',
    });
    const nextKeys = new Set(nextEvents.map(event => event.eventKey));

    for (const event of nextEvents) {
        const existing = existingByKey.get(event.eventKey) || null;
        const dbPayload = eventToDbPayload(event, confirmation, actor, now, existing);
        if (existing?.id) {
            const changed = jsonPayload(existing.before_snapshot) !== jsonPayload(dbPayload.before_snapshot)
                || jsonPayload(existing.after_snapshot) !== jsonPayload(dbPayload.after_snapshot)
                || jsonPayload(existing.editable_payload) !== jsonPayload(dbPayload.editable_payload)
                || existing.active !== true
                || existing.event_status !== dbPayload.event_status
                || Number(existing.quantity_delta || 0) !== Number(dbPayload.quantity_delta || 0);
            if (!changed) continue;
            const { data, error } = await adminSupabase
                .from('branch_dispatch_detail_change_events')
                .update(dbPayload)
                .eq('id', existing.id)
                .select()
                .single();
            if (error) throw error;
            await insertHistory(adminSupabase, data, confirmation, dbPayload.event_status === 'pending' && existing.event_status === 'confirmed' ? 'reopened' : 'refreshed', actor, now, existing, data);
        } else {
            const { data, error } = await adminSupabase
                .from('branch_dispatch_detail_change_events')
                .insert({
                    ...dbPayload,
                    created_by: actor,
                    created_at: now,
                })
                .select()
                .single();
            if (error) throw error;
            await insertHistory(adminSupabase, data, confirmation, 'detected', actor, now, null, data);
        }
    }

    for (const existing of existingRows || []) {
        if (!existing.active || nextKeys.has(existing.event_key)) continue;
        if (existing.event_status === 'confirmed') continue;
        const { data, error } = await adminSupabase
            .from('branch_dispatch_detail_change_events')
            .update({
                active: false,
                updated_by: actor,
                updated_at: now,
            })
            .eq('id', existing.id)
            .select()
            .single();
        if (error) throw error;
        await insertHistory(adminSupabase, data, confirmation, 'resolved', actor, now, existing, data);
    }

    await insertMemoOnlyHistory(adminSupabase, confirmation, memoChanges, actor, now);
}

async function syncChangeEventsForPayload(adminSupabase, payload, actor, now) {
    const directConfirmation = await fetchConfirmation(adminSupabase, payload);
    if (payload.dispatchType !== 'integrated' || isActiveConfirmation(directConfirmation)) {
        await syncChangeEvents(adminSupabase, directConfirmation, payload.currentLines, actor, now);
        return;
    }

    const sourceConfirmations = await fetchConfirmations(adminSupabase, {
        ...payload,
        dispatchTypes: ['glovis', 'mobis'],
    });
    const activeSourceConfirmations = sourceConfirmations.filter(isActiveConfirmation);
    if (activeSourceConfirmations.length === 0) return;

    const linesByType = splitCurrentLinesByDispatchType(payload.currentLines);
    for (const confirmation of activeSourceConfirmations) {
        await syncChangeEvents(adminSupabase, confirmation, linesByType.get(confirmation.dispatch_type) || [], actor, now);
    }
}

async function confirmEvents(adminSupabase, payload, actor, now, { bulk = false } = {}) {
    let query = adminSupabase
        .from('branch_dispatch_detail_change_events')
        .select('*')
        .eq('branch_id', BRANCH_ID)
        .eq('target_date', payload.targetDate)
        .eq('active', true)
        .eq('event_status', 'pending');

    if (payload.eventIds.length > 0) query = query.in('id', payload.eventIds);
    else if (payload.eventId) query = query.eq('id', payload.eventId);
    else if (payload.dispatchType === 'integrated') query = query.in('dispatch_type', ['integrated', 'glovis', 'mobis']);
    else query = query.eq('dispatch_type', payload.dispatchType);

    const { data: targets, error: targetError } = await query;
    if (targetError) throw targetError;
    const scopedTargets = (targets || []).filter(row => eventMatchesRequestedScope(row, payload));
    if (!scopedTargets.length) return 0;

    const targetIds = scopedTargets.map(row => row.id);
    const { data: updatedRows, error: updateError } = await adminSupabase
        .from('branch_dispatch_detail_change_events')
        .update({
            event_status: 'confirmed',
            confirmed_by: actor,
            confirmed_at: now,
            updated_by: actor,
            updated_at: now,
        })
        .in('id', targetIds)
        .select('*');
    if (updateError) throw updateError;

    const updatedById = new Map((updatedRows || []).map(row => [row.id, row]));
    for (const oldRow of scopedTargets) {
        const newRow = updatedById.get(oldRow.id);
        await insertHistory(adminSupabase, newRow, null, bulk ? 'bulk_confirmed' : 'confirmed', actor, now, oldRow, newRow);
    }
    return targetIds.length;
}

async function unconfirmEvents(adminSupabase, payload, actor, now) {
    let query = adminSupabase
        .from('branch_dispatch_detail_change_events')
        .select('*')
        .eq('branch_id', BRANCH_ID)
        .eq('target_date', payload.targetDate)
        .eq('active', true)
        .eq('event_status', 'confirmed');

    if (payload.eventIds.length > 0) query = query.in('id', payload.eventIds);
    else if (payload.eventId) query = query.eq('id', payload.eventId);
    else throw new Error('확인취소할 변동 이벤트를 선택해 주세요.');

    const { data: targets, error: targetError } = await query;
    if (targetError) throw targetError;
    const scopedTargets = (targets || []).filter(row => eventMatchesRequestedScope(row, payload));
    if (!scopedTargets.length) return 0;

    const targetIds = scopedTargets.map(row => row.id);
    const { data: updatedRows, error: updateError } = await adminSupabase
        .from('branch_dispatch_detail_change_events')
        .update({
            event_status: 'pending',
            confirmed_by: null,
            confirmed_at: null,
            updated_by: actor,
            updated_at: now,
        })
        .in('id', targetIds)
        .select('*');
    if (updateError) throw updateError;

    const updatedById = new Map((updatedRows || []).map(row => [row.id, row]));
    for (const oldRow of scopedTargets) {
        const newRow = updatedById.get(oldRow.id);
        await insertHistory(adminSupabase, newRow, null, 'unconfirmed', actor, now, oldRow, newRow);
    }
    return targetIds.length;
}

async function updateEventPayload(adminSupabase, payload, actor, now) {
    if (!payload.eventId) throw new Error('변동 이벤트 식별값이 없습니다.');
    const normalized = normalizeDispatchChangeLineRecord(payload.editablePayload || {});
    const nextEditablePayload = {
        detailLineKey: normalized.detailLineKey,
        identityKey: normalized.identityKey,
        groupKey: normalized.groupKey,
        rowFingerprint: normalized.rowFingerprint,
        rowValues: normalized.rowValues,
        rowContext: normalized.rowContext,
    };

    const { data: existing, error: existingError } = await adminSupabase
        .from('branch_dispatch_detail_change_events')
        .select('*')
        .eq('id', payload.eventId)
        .eq('branch_id', BRANCH_ID)
        .eq('target_date', payload.targetDate)
        .maybeSingle();
    if (existingError) throw existingError;
    if (!existing || !eventMatchesRequestedScope(existing, payload)) throw new Error('변동 이벤트를 찾을 수 없습니다.');
    if (existing.event_status === 'confirmed') throw new Error('확인완료된 변동은 확인취소 후 수정할 수 있습니다.');

    const { data, error } = await adminSupabase
        .from('branch_dispatch_detail_change_events')
        .update({
            editable_payload: nextEditablePayload,
            updated_by: actor,
            updated_at: now,
        })
        .eq('id', existing.id)
        .select()
        .single();
    if (error) throw error;
    await insertHistory(adminSupabase, data, null, 'edited', actor, now, existing, data);
    return data;
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
        const data = await fetchEvents(access.adminSupabase, payload);
        return NextResponse.json({ data });
    } catch (error) {
        if (isMissingChangeTableError(error)) {
            return NextResponse.json({ setupRequired: true, data: [], sqlFile: CHANGE_SQL_FILE });
        }
        return NextResponse.json({ error: error.message || '배차변동내역 조회 실패' }, { status: 500 });
    }
}

export async function POST(request) {
    const access = await requireUser(request);
    if (access.error) return access.error;

    try {
        const payload = normalizePayload(await request.json());
        const validationError = validateScope(payload);
        if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

        const actor = await getCurrentUserActorName(access.adminSupabase, access.user);
        const now = new Date().toISOString();

        if (payload.action === 'sync') {
            await syncChangeEventsForPayload(access.adminSupabase, payload, actor, now);
        } else if (payload.action === 'confirm') {
            await confirmEvents(access.adminSupabase, payload, actor, now);
        } else if (payload.action === 'confirm_all') {
            await confirmEvents(access.adminSupabase, payload, actor, now, { bulk: true });
        } else if (payload.action === 'unconfirm') {
            await unconfirmEvents(access.adminSupabase, payload, actor, now);
        } else if (payload.action === 'update') {
            await updateEventPayload(access.adminSupabase, payload, actor, now);
        } else {
            return NextResponse.json({ error: '지원하지 않는 변동내역 작업입니다.' }, { status: 400 });
        }

        const data = await fetchEvents(access.adminSupabase, payload);
        return NextResponse.json({ success: true, data });
    } catch (error) {
        if (isMissingChangeTableError(error)) {
            return NextResponse.json({
                setupRequired: true,
                error: '배차변동내역 DB 스키마가 아직 적용되지 않았습니다.',
                sqlFile: CHANGE_SQL_FILE,
            }, { status: 503 });
        }
        console.error('[asan-dispatch-change-events] failed:', error);
        return NextResponse.json({ error: error.message || '배차변동내역 처리 실패' }, { status: 500 });
    }
}
