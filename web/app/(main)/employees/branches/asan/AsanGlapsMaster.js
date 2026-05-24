'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './glapsMaster.module.css';

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

export default function AsanGlapsMaster({ refreshToken = 0 }) {
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
    }, [activeTable]);

    const routes = data?.routes || [];
    const aliases = (data?.aliases || []).filter(row => !ROUTE_ALIAS_TYPES.has(String(row.alias_type || '').trim()));
    const sheetRows = data?.sheetRows || [];
    const sheetSummary = data?.sheetSummary || [];
    const summary = data?.summary || { total: 0, ready: 0, needsMapping: 0, missingRouteCode: 0 };

    const tableRows = activeTable === 'routes' ? routes : (activeTable === 'aliases' ? aliases : sheetRows);
    const version = data?.version || null;

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
            setMessage({ type: 'success', text: `${suffix} 반영 완료` });
            await fetchData();
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
        event.preventDefault();
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
        } catch (error) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setSaving(false);
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
        } catch (error) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setSaving(false);
        }
    }, [activeTable, editor?.id, fetchData]);

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
                { key: 'status', label: '상태', value: row => statusLabel(row.review_status), render: row => <span className={`${styles.statusPill} ${styles[row.review_status] || ''}`}>{statusLabel(row.review_status)}</span> },
                { key: 'route_code', label: '운송경로코드', value: row => row.route_code, className: styles.protectedCell },
                { key: 'route_name', label: '운송경로명', value: row => row.route_name, className: styles.protectedCell },
                { key: 'route_key', label: '연결키', value: routeMatchKey },
                { key: 'start_location_name', label: '상차지', value: row => row.start_location_name },
                { key: 'waypoint_els_name', label: '경유지(ELS)', value: row => row.waypoint_els_name || row.waypoint_name },
                { key: 'destination_name', label: '하차지', value: row => row.destination_name },
                { key: 'review_note', label: '조정안내', value: row => row.review_note },
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
                { key: 'status', label: '상태', value: row => statusLabel(row.review_status), render: row => <span className={`${styles.statusPill} ${styles[row.review_status] || ''}`}>{statusLabel(row.review_status)}</span> },
                { key: 'alias_type', label: '항목', value: row => row.alias_type },
                { key: 'source_name', label: '배차판 매칭용', value: row => row.source_name },
                { key: 'els_name', label: 'ELS명', value: row => row.els_name },
                { key: 'glaps_name', label: 'GLAPS명', value: row => row.glaps_name, className: styles.protectedCell },
                { key: 'glaps_code', label: '코드', value: row => row.glaps_code, className: styles.protectedCell },
                { key: 'review_note', label: '조정안내', value: row => row.review_note },
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
    }, [activeTable, beginEditRow, deleteRow, saving]);

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
        const filteredRows = tableRows.filter(row => filterableColumns.every(column => {
            const filterValue = activeTableFilters[column.key];
            if (!filterValue) return true;
            return tableFilterKey(column.value?.(row)) === filterValue;
        }));
        if (!activeSort.key) return filteredRows;
        const sortColumn = tableColumns.find(column => column.key === activeSort.key && column.sortable !== false);
        if (!sortColumn) return filteredRows;
        return [...filteredRows].sort((a, b) => {
            const direction = activeSort.direction === 'desc' ? -1 : 1;
            return compareTableValues(sortColumn.value?.(a), sortColumn.value?.(b)) * direction;
        });
    }, [activeSort.direction, activeSort.key, activeTableFilters, tableColumns, tableRows]);

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
                    <span>운송경로코드 · 운송경로명 · 매칭상태</span>
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
                <span className={styles.tableMeta}>표시 {visibleTableRows.length.toLocaleString()} / 전체 {tableRows.length.toLocaleString()}</span>
                {hasTableFilters && (
                    <button type="button" onClick={clearTableFilters}>테이블 필터해제</button>
                )}
            </div>

            {editor && (
                <form className={styles.editorPanel} onSubmit={submitEditor}>
                    {editor.mode === 'routes' ? (
                        <div className={styles.editorGrid}>
                            <label className={`${styles.editorField} ${styles.protectedField}`}>
                                <span>운송경로코드</span>
                                <input value={editor.values.routeCode} onChange={(event) => updateEditorValue('routeCode', event.target.value)} autoFocus />
                            </label>
                            <label className={`${styles.editorField} ${styles.protectedField}`}>
                                <span>운송경로명</span>
                                <input value={editor.values.routeName} onChange={(event) => updateEditorValue('routeName', event.target.value)} />
                            </label>
                            <label className={styles.editorField}>
                                <span>상차지</span>
                                <input value={editor.values.startLocationName} onChange={(event) => updateEditorValue('startLocationName', event.target.value)} />
                            </label>
                            <label className={`${styles.editorField} ${styles.protectedField}`}>
                                <span>경유지</span>
                                <input value={editor.values.waypointName} onChange={(event) => updateEditorValue('waypointName', event.target.value)} />
                            </label>
                            <label className={styles.editorField}>
                                <span>경유지(ELS)</span>
                                <input value={editor.values.waypointElsName} onChange={(event) => updateEditorValue('waypointElsName', event.target.value)} />
                            </label>
                            <label className={styles.editorField}>
                                <span>하차지(선적)</span>
                                <input value={editor.values.destinationName} onChange={(event) => updateEditorValue('destinationName', event.target.value)} />
                            </label>
                            <label className={styles.editorField}>
                                <span>매칭상태</span>
                                <select value={editor.values.reviewStatus} onChange={(event) => updateEditorValue('reviewStatus', event.target.value)}>
                                    {REVIEW_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                            </label>
                            <label className={styles.editorField}>
                                <span>조정안내</span>
                                <input value={editor.values.reviewNote} onChange={(event) => updateEditorValue('reviewNote', event.target.value)} />
                            </label>
                        </div>
                    ) : (
                        <div className={styles.editorGrid}>
                            <label className={styles.editorField}>
                                <span>항목</span>
                                <select value={editor.values.aliasType} onChange={(event) => updateEditorValue('aliasType', event.target.value)} autoFocus>
                                    {ALIAS_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                            </label>
                            <label className={styles.editorField}>
                                <span>배차판 매칭용</span>
                                <input value={editor.values.sourceName} onChange={(event) => updateEditorValue('sourceName', event.target.value)} />
                            </label>
                            <label className={styles.editorField}>
                                <span>ELS명</span>
                                <input value={editor.values.elsName} onChange={(event) => updateEditorValue('elsName', event.target.value)} />
                            </label>
                            <label className={`${styles.editorField} ${styles.protectedField}`}>
                                <span>GLAPS명</span>
                                <input value={editor.values.glapsName} onChange={(event) => updateEditorValue('glapsName', event.target.value)} />
                            </label>
                            <label className={`${styles.editorField} ${styles.protectedField}`}>
                                <span>GLAPS코드</span>
                                <input value={editor.values.glapsCode} onChange={(event) => updateEditorValue('glapsCode', event.target.value)} />
                            </label>
                            <label className={styles.editorField}>
                                <span>매칭상태</span>
                                <select value={editor.values.reviewStatus} onChange={(event) => updateEditorValue('reviewStatus', event.target.value)}>
                                    {REVIEW_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                            </label>
                            <label className={styles.editorField}>
                                <span>조정안내</span>
                                <input value={editor.values.reviewNote} onChange={(event) => updateEditorValue('reviewNote', event.target.value)} />
                            </label>
                        </div>
                    )}
                    <div className={styles.editorActions}>
                        <button type="submit" disabled={saving}>저장</button>
                        <button type="button" onClick={() => setEditor(null)} disabled={saving}>취소</button>
                    </div>
                </form>
            )}

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
                            {visibleTableRows.map((row, rowIndex) => (
                                <tr key={row.id || `${activeTable}-${rowIndex}`}>
                                    {tableColumns.map(column => (
                                        <td key={column.key} className={column.className || ''}>
                                            {column.render ? column.render(row) : tableText(column.value?.(row))}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {!loading && visibleTableRows.length === 0 && <div className={styles.emptyState}>표시할 데이터가 없습니다.</div>}
            </div>
        </div>
    );
}
