'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './glapsMaster.module.css';
import { buildGlapsDuplicateInfo } from '@/utils/glapsDuplicateGroups.mjs';
import { formatGlapsAliasType } from '@/utils/glapsMasterData.mjs';

const STATUS_LABELS = {
    ready: '확정',
    needs_mapping: '조정필요',
    missing_route_code: '코드없음',
};

const REVIEW_STATUS_OPTIONS = [
    ['ready', '확정'],
    ['needs_mapping', '조정필요'],
    ['missing_route_code', '코드없음'],
];

const ALIAS_TYPE_OPTIONS = [
    ['port', '포트'],
    ['line', '선사'],
    ['container_type', '컨테이너규격'],
    ['carrier', '운송사'],
    ['consignee', '컨샤이니'],
    ['generic', '기타'],
];

const ROUTE_ALIAS_TYPES = new Set(['start', 'waypoint', 'destination']);
const TABLE_COLLATOR = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' });
const EMPTY_TABLE_FILTER_VALUE = '__GLAPS_EMPTY_FILTER__';
const GLAPS_MASTER_PAGE_SIZE = 100;

const EMPTY_ROUTE_EDITOR = {
    routeCode: '',
    routeName: '',
    startLocationName: '',
    waypointName: '',
    waypointElsName: '',
    destinationName: '',
    reviewStatus: 'needs_mapping',
    reviewNote: '',
};

const EMPTY_ALIAS_EDITOR = {
    aliasType: 'port',
    sourceName: '',
    elsName: '',
    glapsName: '',
    glapsCode: '',
    routeCode: '',
    reviewStatus: 'needs_mapping',
    reviewNote: '',
};

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function statusLabel(status) {
    return STATUS_LABELS[status] || status || '-';
}

function sourceLabel(updatedBy = '') {
    const source = String(updatedBy || '').split(':')[0];
    if (source === 'web') return '웹수정';
    if (source === 'template_upload') return '업로드수정';
    if (source === 'master') return '마스터반영';
    return updatedBy ? '기존수정' : '-';
}

function sourceClass(updatedBy = '') {
    const source = String(updatedBy || '').split(':')[0];
    if (source === 'web') return styles.sourceWeb;
    if (source === 'template_upload') return styles.sourceUpload;
    if (source === 'master') return styles.sourceMaster;
    return '';
}

function routeMatchKey(row) {
    return [row.start_location_name, row.waypoint_els_name || row.waypoint_name, row.destination_name]
        .filter(Boolean)
        .join(' → ');
}

function tableText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function normalizeTableFilter(value) {
    return tableText(value).normalize('NFKC').toLowerCase().trim();
}

function tableFilterKey(value) {
    const normalized = normalizeTableFilter(value);
    return normalized || EMPTY_TABLE_FILTER_VALUE;
}

function tableFilterLabel(value) {
    const text = tableText(value).trim();
    return text || '(빈값)';
}

function compareTableValues(a, b) {
    return TABLE_COLLATOR.compare(tableText(a), tableText(b));
}

function buildDuplicateInfo(activeTable, rows = []) {
    return buildGlapsDuplicateInfo(activeTable, rows);
}

function routeToEditorValues(row = {}) {
    return {
        routeCode: row.route_code || '',
        routeName: row.route_name || '',
        startLocationName: row.start_location_name || '',
        waypointName: row.waypoint_name || '',
        waypointElsName: row.waypoint_els_name || '',
        destinationName: row.destination_name || '',
        reviewStatus: row.review_status || 'needs_mapping',
        reviewNote: row.review_note || '',
    };
}

function aliasToEditorValues(row = {}) {
    return {
        aliasType: row.alias_type || 'port',
        sourceName: row.source_name || '',
        elsName: row.els_name || '',
        glapsName: row.glaps_name || '',
        glapsCode: row.glaps_code || '',
        routeCode: row.route_code || '',
        reviewStatus: row.review_status || 'needs_mapping',
        reviewNote: row.review_note || '',
    };
}

function downloadTemplate() {
    window.location.href = '/api/branches/asan/glaps/master/template';
}

function uploadProtectionText(payload = {}) {
    const skipped = Number(
        payload.skippedWebProtected
        || (payload.routes?.skippedWebProtected || 0) + (payload.aliases?.skippedWebProtected || 0)
        || 0,
    );
    const preserved = Number(payload.webProtection?.preserved || 0);
    const skippedDuplicates = Number(
        (payload.skippedDuplicateRows?.routes || 0) + (payload.skippedDuplicateRows?.aliases || 0)
        || (payload.routes?.skippedDuplicateRows || 0) + (payload.aliases?.skippedDuplicateRows || 0)
        || 0,
    );
    const parts = [];
    if (skipped > 0) parts.push(`WEB수정 보호 ${skipped.toLocaleString()}건 업로드 제외`);
    if (preserved > 0) parts.push(`WEB수정 ${preserved.toLocaleString()}건 보존`);
    if (skippedDuplicates > 0) parts.push(`원장 중복행 ${skippedDuplicates.toLocaleString()}건 정리`);
    return parts.length ? ` / ${parts.join(' / ')}` : '';
}

export default function AsanGlapsMaster({ refreshToken = 0, onMasterChanged = null }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [data, setData] = useState(null);
    const [activeTable, setActiveTable] = useState('routes');
    const [statusFilter, setStatusFilter] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [message, setMessage] = useState(null);
    const [editor, setEditor] = useState(null);
    const [tableFilters, setTableFilters] = useState({});
    const [tableSort, setTableSort] = useState({ table: 'routes', key: '', direction: 'asc' });
    const [duplicateOnly, setDuplicateOnly] = useState(false);
    const [selectedDuplicateIds, setSelectedDuplicateIds] = useState([]);
    const [masterDisplayLimit, setMasterDisplayLimit] = useState(GLAPS_MASTER_PAGE_SIZE);
    const masterFileRef = useRef(null);
    const templateFileRef = useRef(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.set('status', statusFilter);
            if (searchInput.trim()) params.set('q', searchInput.trim());
            const response = await fetch(`/api/branches/asan/glaps/master?${params.toString()}`, { cache: 'no-store' });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'GLAPS 마스터 조회 실패');
            setData(payload);
            setMessage(null);
        } catch (error) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setLoading(false);
        }
    }, [searchInput, statusFilter]);

    useEffect(() => {
        const timer = setTimeout(fetchData, 250);
        return () => clearTimeout(timer);
    }, [fetchData, refreshToken]);

    useEffect(() => {
        setEditor(null);
        setDuplicateOnly(false);
        setSelectedDuplicateIds([]);
    }, [activeTable]);

    const routes = data?.routes || [];
    const aliases = (data?.aliases || []).filter(row => !ROUTE_ALIAS_TYPES.has(String(row.alias_type || '').trim()));
    const sheetRows = data?.sheetRows || [];
    const sheetSummary = data?.sheetSummary || [];
    const summary = data?.summary || { total: 0, ready: 0, needsMapping: 0, missingRouteCode: 0 };

    const tableRows = activeTable === 'routes' ? routes : (activeTable === 'aliases' ? aliases : sheetRows);
    const version = data?.version || null;
    const duplicateInfo = useMemo(() => buildDuplicateInfo(activeTable, tableRows), [activeTable, tableRows]);
    const hasDuplicateRows = duplicateInfo.rowCount > 0;
    const selectedDuplicateIdSet = useMemo(() => new Set(selectedDuplicateIds), [selectedDuplicateIds]);
    const selectedDuplicateCount = selectedDuplicateIds.filter(id => duplicateInfo.byId.has(id)).length;

    useEffect(() => {
        if (activeTable !== 'routes' && activeTable !== 'aliases') return;
        const validIds = new Set(tableRows.map(row => row.id).filter(Boolean));
        setSelectedDuplicateIds((prev) => {
            const next = prev.filter(id => validIds.has(id));
            return next.length === prev.length ? prev : next;
        });
    }, [activeTable, tableRows]);

    const tableInfo = useMemo(() => ({
        routes: {
            title: '운송경로',
            count: routes.length,
        },
        aliases: {
            title: '항목매핑',
            count: aliases.length,
        },
        sheets: {
            title: '원본시트',
            count: sheetRows.length,
        },
    }), [aliases.length, routes.length, sheetRows.length]);

    const postWorkbook = async ({ mode, source = 'upload', file = null }) => {
        const formData = new FormData();
        formData.set('mode', mode);
        formData.set('source', source);
        if (file) formData.set('file', file);
        setSaving(true);
        try {
            const response = await fetch('/api/branches/asan/glaps/master', { method: 'POST', body: formData });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'GLAPS 마스터 반영 실패');
            const suffix = payload.summary
                ? `운송경로 ${payload.summary.total}건`
                : (payload.mode === 'all'
                    ? `운송경로 수정 ${payload.routes?.updated || 0}건 / 항목 수정 ${payload.aliases?.updated || 0}건`
                    : `수정 ${payload.updated || 0}건 / 삭제 ${payload.deleted || 0}건`);
            setMessage({ type: 'success', text: `${suffix}${uploadProtectionText(payload)} 반영 완료` });
            await fetchData();
            onMasterChanged?.();
        } catch (error) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setSaving(false);
        }
    };

    const handleMasterFileChange = (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        postWorkbook({ mode: 'master', file });
    };

    const handleTemplateFileChange = (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        postWorkbook({ mode: 'all', file });
    };

    const openTemplateUpload = () => {
        templateFileRef.current?.click();
    };

    const beginNewRow = () => {
        if (activeTable === 'routes') {
            setEditor({ mode: 'routes', id: null, values: { ...EMPTY_ROUTE_EDITOR } });
        } else if (activeTable === 'aliases') {
            setEditor({ mode: 'aliases', id: null, values: { ...EMPTY_ALIAS_EDITOR } });
        }
    };

    const beginEditRow = useCallback((row) => {
        if (activeTable === 'routes') {
            setEditor({ mode: 'routes', id: row.id, values: routeToEditorValues(row) });
        } else if (activeTable === 'aliases') {
            setEditor({ mode: 'aliases', id: row.id, values: aliasToEditorValues(row) });
        }
    }, [activeTable]);

    const updateEditorValue = (field, value) => {
        setEditor(prev => (prev ? { ...prev, values: { ...prev.values, [field]: value } } : prev));
    };

    const submitEditor = async (event) => {
        event?.preventDefault?.();
        if (!editor) return;
        setSaving(true);
        try {
            const response = await fetch('/api/branches/asan/glaps/master', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: editor.mode,
                    action: 'upsert',
                    id: editor.id,
                    row: editor.values,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'GLAPS 웹수정 실패');
            setMessage({ type: 'success', text: '웹수정 1건 반영 완료' });
            setEditor(null);
            await fetchData();
            onMasterChanged?.();
        } catch (error) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setSaving(false);
        }
    };

    const handleInlineEditorKeyDown = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            setEditor(null);
            return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submitEditor(event);
        }
    };

    const deleteRow = useCallback(async (row) => {
        if (!row?.id) return;
        if (!window.confirm('선택 행을 삭제할까요?')) return;
        setSaving(true);
        try {
            const response = await fetch('/api/branches/asan/glaps/master', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: activeTable,
                    action: 'delete',
                    id: row.id,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'GLAPS 웹삭제 실패');
            setMessage({ type: 'success', text: '웹삭제 1건 반영 완료' });
            if (editor?.id === row.id) setEditor(null);
            await fetchData();
            onMasterChanged?.();
        } catch (error) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setSaving(false);
        }
    }, [activeTable, editor?.id, fetchData, onMasterChanged]);

    const toggleDuplicateSelection = useCallback((rowId) => {
        const id = tableText(rowId).trim();
        if (!id) return;
        setSelectedDuplicateIds(prev => (
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        ));
    }, []);

    const mergeDuplicateRows = useCallback(async ({ selectedOnly = false } = {}) => {
        if (activeTable !== 'routes' && activeTable !== 'aliases') return;
        const ids = selectedOnly ? selectedDuplicateIds : [];
        if (selectedOnly && ids.length === 0) {
            setMessage({ type: 'error', text: '병합할 항목을 먼저 선택해주세요.' });
            return;
        }
        const basis = activeTable === 'routes' ? '운송경로코드' : '최종코드(BP)';
        const label = selectedOnly ? `선택한 ${ids.length.toLocaleString()}건의 ${basis} 그룹` : `현재 ${basis} 중복 ${duplicateInfo.groupCount.toLocaleString()}그룹`;
        if (!window.confirm(`${label}을 병합할까요?`)) return;
        setSaving(true);
        try {
            const response = await fetch('/api/branches/asan/glaps/master', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: activeTable,
                    action: 'merge_by_key',
                    ids,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'GLAPS 중복 병합 실패');
            setMessage({
                type: 'success',
                text: `${basis} 병합 ${Number(payload.mergedGroups || 0).toLocaleString()}그룹 / ${Number(payload.mergedRows || 0).toLocaleString()}행 반영 완료`,
            });
            setSelectedDuplicateIds([]);
            await fetchData();
            onMasterChanged?.();
        } catch (error) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setSaving(false);
        }
    }, [activeTable, duplicateInfo.groupCount, fetchData, onMasterChanged, selectedDuplicateIds]);

    const updateTableFilter = (key, value) => {
        setTableFilters(prev => {
            const nextTableFilters = { ...(prev[activeTable] || {}) };
            if (value) nextTableFilters[key] = value;
            else delete nextTableFilters[key];
            return {
                ...prev,
                [activeTable]: nextTableFilters,
            };
        });
    };

    const clearTableFilters = () => {
        setTableFilters(prev => ({ ...prev, [activeTable]: {} }));
    };

    const toggleTableSort = (key) => {
        setTableSort(prev => {
            if (prev.table !== activeTable || prev.key !== key) {
                return { table: activeTable, key, direction: 'asc' };
            }
            if (prev.direction === 'asc') return { table: activeTable, key, direction: 'desc' };
            return { table: activeTable, key: '', direction: 'asc' };
        });
    };

    const tableColumns = useMemo(() => {
        if (activeTable === 'routes') {
            return [
                {
                    key: 'select',
                    label: '선택',
                    value: row => (selectedDuplicateIdSet.has(row.id) ? '선택' : ''),
                    filterable: false,
                    sortable: false,
                    className: styles.selectCell,
                    render: row => (
                        <input
                            type="checkbox"
                            className={styles.rowSelectCheckbox}
                            checked={selectedDuplicateIdSet.has(row.id)}
                            onChange={() => toggleDuplicateSelection(row.id)}
                            disabled={saving || !duplicateInfo.byId.has(row.id)}
                            aria-label="병합 항목 선택"
                        />
                    ),
                },
                { key: 'status', label: '상태', value: row => statusLabel(row.review_status), render: row => <span className={`${styles.statusPill} ${styles[row.review_status] || ''}`}>{statusLabel(row.review_status)}</span> },
                { key: 'start_location_name', label: '상차지', value: row => row.start_location_name },
                { key: 'waypoint_els_name', label: '경유지(ELS)', value: row => row.waypoint_els_name || row.waypoint_name },
                { key: 'destination_name', label: '하차지', value: row => row.destination_name },
                { key: 'route_key', label: '연결키', value: routeMatchKey },
                { key: 'route_name', label: '운송경로명', value: row => row.route_name, className: styles.protectedCell },
                { key: 'route_code', label: '운송경로코드', value: row => row.route_code, className: styles.protectedCell },
                { key: 'review_note', label: '검수메모', value: row => row.review_note },
                { key: 'source', label: '수정출처', value: row => sourceLabel(row.updated_by), render: row => <span className={`${styles.sourceBadge} ${sourceClass(row.updated_by)}`}>{sourceLabel(row.updated_by)}</span> },
                {
                    key: 'actions',
                    label: '관리',
                    filterable: false,
                    sortable: false,
                    render: row => (
                        <div className={styles.rowActions}>
                            <button type="button" onClick={() => beginEditRow(row)} disabled={saving}>수정</button>
                            <button type="button" onClick={() => deleteRow(row)} disabled={saving}>삭제</button>
                        </div>
                    ),
                },
            ];
        }
        if (activeTable === 'aliases') {
            return [
                {
                    key: 'select',
                    label: '선택',
                    value: row => (selectedDuplicateIdSet.has(row.id) ? '선택' : ''),
                    filterable: false,
                    sortable: false,
                    className: styles.selectCell,
                    render: row => (
                        <input
                            type="checkbox"
                            className={styles.rowSelectCheckbox}
                            checked={selectedDuplicateIdSet.has(row.id)}
                            onChange={() => toggleDuplicateSelection(row.id)}
                            disabled={saving || !duplicateInfo.byId.has(row.id)}
                            aria-label="병합 항목 선택"
                        />
                    ),
                },
                { key: 'status', label: '상태', value: row => statusLabel(row.review_status), render: row => <span className={`${styles.statusPill} ${styles[row.review_status] || ''}`}>{statusLabel(row.review_status)}</span> },
                { key: 'alias_type', label: '매핑항목', value: row => formatGlapsAliasType(row.alias_type) },
                { key: 'source_name', label: 'ELS 매치코드', value: row => row.source_name },
                { key: 'els_name', label: 'ELS 디스크립션(설명)', value: row => row.els_name },
                { key: 'glaps_name', label: 'GLAPS 디스크립션(설명)', value: row => row.glaps_name, className: styles.protectedCell },
                { key: 'glaps_code', label: '최종코드(BP)', value: row => row.glaps_code, className: styles.protectedCell },
                { key: 'review_note', label: '검수메모', value: row => row.review_note },
                { key: 'source', label: '수정출처', value: row => sourceLabel(row.updated_by), render: row => <span className={`${styles.sourceBadge} ${sourceClass(row.updated_by)}`}>{sourceLabel(row.updated_by)}</span> },
                {
                    key: 'actions',
                    label: '관리',
                    filterable: false,
                    sortable: false,
                    render: row => (
                        <div className={styles.rowActions}>
                            <button type="button" onClick={() => beginEditRow(row)} disabled={saving}>수정</button>
                            <button type="button" onClick={() => deleteRow(row)} disabled={saving}>삭제</button>
                        </div>
                    ),
                },
            ];
        }
        return [
            { key: 'sheet_name', label: '시트', value: row => row.sheet_name },
            { key: 'row_number', label: '행', value: row => row.row_number },
            { key: 'header_row', label: '헤더', value: row => (row.header_row ? '헤더' : '') },
            { key: 'payload', label: '원본값', value: row => row.row_payload || row.row_values || {} },
        ];
    }, [activeTable, beginEditRow, deleteRow, duplicateInfo.byId, saving, selectedDuplicateIdSet, toggleDuplicateSelection]);

    const activeTableFilters = useMemo(() => tableFilters[activeTable] || {}, [activeTable, tableFilters]);
    const hasTableFilters = Object.values(activeTableFilters).some(value => normalizeTableFilter(value));
    const activeSort = tableSort.table === activeTable ? tableSort : { table: activeTable, key: '', direction: 'asc' };
    const tableFilterOptions = useMemo(() => {
        return tableColumns.reduce((acc, column) => {
            if (column.filterable === false) return acc;
            const options = new Map();
            tableRows.forEach(row => {
                const rawValue = tableText(column.value?.(row));
                const optionValue = tableFilterKey(rawValue);
                if (!options.has(optionValue)) {
                    options.set(optionValue, tableFilterLabel(rawValue));
                }
            });
            acc[column.key] = Array.from(options, ([value, label]) => ({ value, label }))
                .sort((a, b) => {
                    if (a.value === EMPTY_TABLE_FILTER_VALUE) return -1;
                    if (b.value === EMPTY_TABLE_FILTER_VALUE) return 1;
                    return TABLE_COLLATOR.compare(a.label, b.label);
                });
            return acc;
        }, {});
    }, [tableColumns, tableRows]);
    const visibleTableRows = useMemo(() => {
        const filterableColumns = tableColumns.filter(column => column.filterable !== false);
        const filteredRows = tableRows.filter(row => {
            if (duplicateOnly && !duplicateInfo.byId.has(row.id)) return false;
            return filterableColumns.every(column => {
                const filterValue = activeTableFilters[column.key];
                if (!filterValue) return true;
                return tableFilterKey(column.value?.(row)) === filterValue;
            });
        });
        if (!activeSort.key) {
            if (duplicateOnly) {
                return [...filteredRows].sort((a, b) => (
                    compareTableValues(duplicateInfo.keyById?.get(a.id), duplicateInfo.keyById?.get(b.id))
                    || compareTableValues(activeTable === 'routes' ? a.route_code : a.source_name, activeTable === 'routes' ? b.route_code : b.source_name)
                    || compareTableValues(a.id, b.id)
                ));
            }
            return filteredRows;
        }
        const sortColumn = tableColumns.find(column => column.key === activeSort.key && column.sortable !== false);
        if (!sortColumn) return filteredRows;
        return [...filteredRows].sort((a, b) => {
            const direction = activeSort.direction === 'desc' ? -1 : 1;
            return compareTableValues(sortColumn.value?.(a), sortColumn.value?.(b)) * direction;
        });
    }, [activeSort.direction, activeSort.key, activeTable, activeTableFilters, duplicateInfo.byId, duplicateInfo.keyById, duplicateOnly, tableColumns, tableRows]);

    useEffect(() => {
        setMasterDisplayLimit(GLAPS_MASTER_PAGE_SIZE);
    }, [activeTable, statusFilter, searchInput, activeTableFilters, activeSort.key, activeSort.direction, duplicateOnly]);

    const visibleLimitedRows = useMemo(
        () => visibleTableRows.slice(0, masterDisplayLimit),
        [masterDisplayLimit, visibleTableRows],
    );
    const hasMoreTableRows = visibleTableRows.length > masterDisplayLimit;

    const inlineEditorFieldForColumn = (columnKey) => {
        if (editor?.mode === 'routes') {
            return ({
                status: 'reviewStatus',
                start_location_name: 'startLocationName',
                waypoint_els_name: 'waypointElsName',
                destination_name: 'destinationName',
                route_name: 'routeName',
                route_code: 'routeCode',
                review_note: 'reviewNote',
            })[columnKey] || '';
        }
        if (editor?.mode === 'aliases') {
            return ({
                status: 'reviewStatus',
                alias_type: 'aliasType',
                source_name: 'sourceName',
                els_name: 'elsName',
                glaps_name: 'glapsName',
                glaps_code: 'glapsCode',
                review_note: 'reviewNote',
            })[columnKey] || '';
        }
        return '';
    };

    const renderInlineEditorCell = (column, { autoFocus = false } = {}) => {
        if (!editor) return '';
        if (column.key === 'actions') {
            return (
                <div className={styles.rowActions}>
                    <button type="button" className={styles.inlineSaveButton} onClick={submitEditor} disabled={saving}>저장</button>
                    <button type="button" onClick={() => setEditor(null)} disabled={saving}>취소</button>
                </div>
            );
        }
        if (column.key === 'source') {
            return <span className={`${styles.sourceBadge} ${styles.sourceWeb}`}>웹수정</span>;
        }
        if (column.key === 'route_key') {
            return routeMatchKey({
                start_location_name: editor.values.startLocationName,
                waypoint_els_name: editor.values.waypointElsName,
                waypoint_name: editor.values.waypointName,
                destination_name: editor.values.destinationName,
            });
        }
        const field = inlineEditorFieldForColumn(column.key);
        if (!field) return '';
        if (field === 'reviewStatus') {
            return (
                <select
                    className={styles.inlineEditInput}
                    value={editor.values.reviewStatus}
                    onChange={(event) => updateEditorValue('reviewStatus', event.target.value)}
                    onKeyDown={handleInlineEditorKeyDown}
                    autoFocus={autoFocus}
                    disabled={saving}
                    aria-label="매칭상태"
                >
                    {REVIEW_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
            );
        }
        if (field === 'aliasType') {
            return (
                <select
                    className={styles.inlineEditInput}
                    value={editor.values.aliasType}
                    onChange={(event) => updateEditorValue('aliasType', event.target.value)}
                    onKeyDown={handleInlineEditorKeyDown}
                    autoFocus={autoFocus}
                    disabled={saving}
                    aria-label="매핑항목"
                >
                    {ALIAS_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
            );
        }
        return (
            <input
                className={styles.inlineEditInput}
                value={editor.values[field] || ''}
                onChange={(event) => updateEditorValue(field, event.target.value)}
                onKeyDown={handleInlineEditorKeyDown}
                autoFocus={autoFocus}
                disabled={saving}
                aria-label={column.label}
            />
        );
    };

    const renderInlineEditorRow = (key) => {
        if (!editor || editor.mode !== activeTable) return null;
        let didAutoFocus = false;
        return (
            <tr key={key} className={styles.inlineEditRow}>
                {tableColumns.map((column) => {
                    const field = inlineEditorFieldForColumn(column.key);
                    const shouldAutoFocus = !didAutoFocus && Boolean(field);
                    if (shouldAutoFocus) didAutoFocus = true;
                    return (
                        <td key={column.key} className={`${column.className || ''} ${field ? styles.inlineEditCell : ''}`}>
                            {renderInlineEditorCell(column, { autoFocus: shouldAutoFocus })}
                        </td>
                    );
                })}
            </tr>
        );
    };

    return (
        <div className={styles.shell}>
            <div className={styles.topPanel}>
                <div className={styles.titleBlock}>
                    <h2>GLAPS 코드</h2>
                    <p>{version ? `${version.source_name} · ${formatDateTime(version.imported_at)}` : '활성 마스터 없음'}</p>
                </div>
                <div className={styles.actionBar}>
                    <input ref={masterFileRef} type="file" accept=".xlsx,.xlsm" hidden onChange={handleMasterFileChange} />
                    <input ref={templateFileRef} type="file" accept=".xlsx" hidden onChange={handleTemplateFileChange} />
                    <button type="button" onClick={() => postWorkbook({ mode: 'master', source: 'nas' })} disabled={saving}>NAS 마스터 반영</button>
                    <button type="button" onClick={() => masterFileRef.current?.click()} disabled={saving}>마스터 업로드</button>
                    <button type="button" onClick={downloadTemplate} disabled={saving}>수정양식 내보내기</button>
                    <button type="button" onClick={openTemplateUpload} disabled={saving}>수정양식 업로드</button>
                </div>
            </div>

            {message && <div className={`${styles.message} ${message.type === 'error' ? styles.messageError : styles.messageSuccess}`}>{message.text}</div>}
            {data?.setupRequired && (
                <div className={`${styles.message} ${styles.messageError}`}>
                    DB 적용 필요: {data.sqlFile}
                </div>
            )}

            <div className={styles.metricGrid}>
                <div className={styles.metricCard}><span>운송경로</span><b>{summary.total.toLocaleString()}</b></div>
                <div className={styles.metricCard}><span>확정</span><b>{summary.ready.toLocaleString()}</b></div>
                <div className={styles.metricCard}><span>조정필요</span><b>{summary.needsMapping.toLocaleString()}</b></div>
                <div className={styles.metricCard}><span>코드없음</span><b>{summary.missingRouteCode.toLocaleString()}</b></div>
                <div className={styles.metricCard}><span>원본시트</span><b>{sheetSummary.length.toLocaleString()}</b></div>
            </div>

            <div className={styles.queryPanel}>
                <div className={styles.queryNode}>
                    <strong>상세배차</strong>
                    <span>상차지 · 경유지(ELS) · 하차지(선적)</span>
                </div>
                <div className={styles.queryArrow}>→</div>
                <div className={styles.queryNode}>
                    <strong>매칭쿼리</strong>
                    {(data?.matchQuery || []).slice(2).map((line) => <span key={line}>{line}</span>)}
                </div>
                <div className={styles.queryArrow}>→</div>
                <div className={styles.queryNode}>
                    <strong>운송경로</strong>
                    <span>상차지 · 경유지(ELS) · 하차지 · 원장 운송경로</span>
                </div>
            </div>

            <div className={styles.toolbar}>
                <div className={styles.segmented}>
                    {Object.entries(tableInfo).map(([key, info]) => (
                        <button
                            key={key}
                            type="button"
                            className={activeTable === key ? styles.segmentActive : ''}
                            onClick={() => setActiveTable(key)}
                        >
                            {info.title} {info.count.toLocaleString()}
                        </button>
                    ))}
                </div>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="매칭상태">
                    <option value="">전체상태</option>
                    <option value="ready">확정</option>
                    <option value="needs_mapping">조정필요</option>
                    <option value="missing_route_code">코드없음</option>
                </select>
                <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="코드, 작업지, 상차지 검색" />
                {(activeTable === 'routes' || activeTable === 'aliases') && (
                    <button type="button" className={styles.primaryButton} onClick={beginNewRow} disabled={saving}>추가</button>
                )}
                {(activeTable === 'routes' || activeTable === 'aliases') && (
                    <button
                        type="button"
                        className={`${styles.duplicateButton} ${duplicateOnly ? styles.duplicateButtonActive : ''}`}
                        onClick={() => setDuplicateOnly(value => !value)}
                        disabled={!hasDuplicateRows}
                    >
                        {duplicateOnly ? '중복해제' : '중복검출'} {duplicateInfo.rowCount.toLocaleString()}
                    </button>
                )}
                {(activeTable === 'routes' || activeTable === 'aliases') && (
                    <>
                        <button
                            type="button"
                            className={styles.mergeButton}
                            onClick={() => mergeDuplicateRows({ selectedOnly: true })}
                            disabled={saving || selectedDuplicateCount === 0}
                        >
                            선택병합 {selectedDuplicateCount.toLocaleString()}
                        </button>
                        <button
                            type="button"
                            className={styles.mergeButton}
                            onClick={() => mergeDuplicateRows({ selectedOnly: false })}
                            disabled={saving || duplicateInfo.groupCount === 0}
                        >
                            일괄병합 {duplicateInfo.groupCount.toLocaleString()}
                        </button>
                    </>
                )}
                <span className={styles.tableMeta}>표시 {Math.min(visibleTableRows.length, masterDisplayLimit).toLocaleString()} / 필터 {visibleTableRows.length.toLocaleString()} / 전체 {tableRows.length.toLocaleString()}</span>
                {hasTableFilters && (
                    <button type="button" onClick={clearTableFilters}>테이블 필터해제</button>
                )}
            </div>

            <div className={styles.tableWrap}>
                {loading ? (
                    <div className={styles.emptyState}>데이터를 불러오는 중입니다...</div>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                {tableColumns.map(column => {
                                    const sorted = activeSort.key === column.key;
                                    const sortLabel = sorted ? (activeSort.direction === 'desc' ? '↓' : '↑') : '↕';
                                    return (
                                        <th key={column.key}>
                                            {column.sortable === false ? (
                                                <span>{column.label}</span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className={`${styles.sortButton} ${sorted ? styles.sortButtonActive : ''}`}
                                                    onClick={() => toggleTableSort(column.key)}
                                                    title={`${column.label} 정렬`}
                                                >
                                                    <span>{column.label}</span>
                                                    <b>{sortLabel}</b>
                                                </button>
                                            )}
                                        </th>
                                    );
                                })}
                            </tr>
                            <tr className={styles.filterRow}>
                                {tableColumns.map(column => (
                                    <th key={column.key}>
                                        {column.filterable === false ? (
                                            <span className={styles.filterSkip}>-</span>
                                        ) : (
                                            <select
                                                value={activeTableFilters[column.key] || ''}
                                                onChange={(event) => updateTableFilter(column.key, event.target.value)}
                                                aria-label={`${column.label} 필터`}
                                            >
                                                <option value="">전체</option>
                                                {(tableFilterOptions[column.key] || []).map(option => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {editor?.mode === activeTable && !editor.id && renderInlineEditorRow(`${activeTable}-new-editor`)}
                            {visibleLimitedRows.map((row, rowIndex) => {
                                const duplicateMessages = duplicateInfo.byId.get(row.id) || [];
                                return editor?.mode === activeTable && editor.id === row.id
                                    ? renderInlineEditorRow(row.id || `${activeTable}-${rowIndex}-editor`)
                                    : (
                                        <tr
                                            key={row.id || `${activeTable}-${rowIndex}`}
                                            className={duplicateMessages.length ? styles.duplicateRow : ''}
                                            title={duplicateMessages.join(' / ') || undefined}
                                        >
                                            {tableColumns.map(column => (
                                                <td key={column.key} className={column.className || ''}>
                                                    {column.render ? column.render(row) : tableText(column.value?.(row))}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                            })}
                        </tbody>
                    </table>
                )}
                {!loading && visibleTableRows.length === 0 && <div className={styles.emptyState}>표시할 데이터가 없습니다.</div>}
            </div>
            {!loading && visibleTableRows.length > 0 && (
                <div className={styles.tableFooter}>
                    <span>
                        {visibleLimitedRows.length.toLocaleString()}건 표시
                        {' '} / 필터 {visibleTableRows.length.toLocaleString()}건
                        {' '} / 전체 {tableRows.length.toLocaleString()}건
                    </span>
                    {hasMoreTableRows && (
                        <span className={styles.loadMoreWrap}>
                            <button type="button" className={styles.loadMoreButton} onClick={() => setMasterDisplayLimit(limit => limit + GLAPS_MASTER_PAGE_SIZE)}>
                                +100건 더 보기
                            </button>
                            <button type="button" className={styles.loadMoreButton} onClick={() => setMasterDisplayLimit(visibleTableRows.length)}>
                                전체 표시
                            </button>
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
