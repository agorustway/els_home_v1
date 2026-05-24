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
    ['start', '상차지'],
    ['waypoint', '경유지'],
    ['destination', '하차지'],
    ['port', '포트'],
    ['line', '선사'],
    ['container_type', '컨테이너규격'],
    ['carrier', '운송사'],
    ['consignee', '컨샤이니'],
    ['generic', '기타'],
];

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
    aliasType: 'waypoint',
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
        aliasType: row.alias_type || 'waypoint',
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

export default function AsanGlapsMaster() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [data, setData] = useState(null);
    const [activeTable, setActiveTable] = useState('routes');
    const [statusFilter, setStatusFilter] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [message, setMessage] = useState(null);
    const [editor, setEditor] = useState(null);
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
    }, [fetchData]);

    useEffect(() => {
        setEditor(null);
    }, [activeTable]);

    const routes = data?.routes || [];
    const aliases = data?.aliases || [];
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

    const beginEditRow = (row) => {
        if (activeTable === 'routes') {
            setEditor({ mode: 'routes', id: row.id, values: routeToEditorValues(row) });
        } else if (activeTable === 'aliases') {
            setEditor({ mode: 'aliases', id: row.id, values: aliasToEditorValues(row) });
        }
    };

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

    const deleteRow = async (row) => {
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
            </div>

            {editor && (
                <form className={styles.editorPanel} onSubmit={submitEditor}>
                    {editor.mode === 'routes' ? (
                        <div className={styles.editorGrid}>
                            <label className={styles.editorField}>
                                <span>운송경로코드</span>
                                <input value={editor.values.routeCode} onChange={(event) => updateEditorValue('routeCode', event.target.value)} autoFocus />
                            </label>
                            <label className={styles.editorField}>
                                <span>운송경로명</span>
                                <input value={editor.values.routeName} onChange={(event) => updateEditorValue('routeName', event.target.value)} />
                            </label>
                            <label className={styles.editorField}>
                                <span>상차지</span>
                                <input value={editor.values.startLocationName} onChange={(event) => updateEditorValue('startLocationName', event.target.value)} />
                            </label>
                            <label className={styles.editorField}>
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
                                <span>원본명</span>
                                <input value={editor.values.sourceName} onChange={(event) => updateEditorValue('sourceName', event.target.value)} />
                            </label>
                            <label className={styles.editorField}>
                                <span>ELS명</span>
                                <input value={editor.values.elsName} onChange={(event) => updateEditorValue('elsName', event.target.value)} />
                            </label>
                            <label className={styles.editorField}>
                                <span>GLAPS명</span>
                                <input value={editor.values.glapsName} onChange={(event) => updateEditorValue('glapsName', event.target.value)} />
                            </label>
                            <label className={styles.editorField}>
                                <span>GLAPS코드</span>
                                <input value={editor.values.glapsCode} onChange={(event) => updateEditorValue('glapsCode', event.target.value)} />
                            </label>
                            <label className={styles.editorField}>
                                <span>운송경로코드</span>
                                <input value={editor.values.routeCode} onChange={(event) => updateEditorValue('routeCode', event.target.value)} />
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
                ) : activeTable === 'routes' ? (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>상태</th>
                                <th>운송경로코드</th>
                                <th>운송경로명</th>
                                <th>연결키</th>
                                <th>상차지</th>
                                <th>경유지(ELS)</th>
                                <th>하차지</th>
                                <th>조정안내</th>
                                <th>수정출처</th>
                                <th>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tableRows.map((row) => (
                                <tr key={row.id}>
                                    <td><span className={`${styles.statusPill} ${styles[row.review_status] || ''}`}>{statusLabel(row.review_status)}</span></td>
                                    <td>{row.route_code}</td>
                                    <td>{row.route_name}</td>
                                    <td>{routeMatchKey(row)}</td>
                                    <td>{row.start_location_name}</td>
                                    <td>{row.waypoint_els_name || row.waypoint_name}</td>
                                    <td>{row.destination_name}</td>
                                    <td>{row.review_note}</td>
                                    <td><span className={`${styles.sourceBadge} ${sourceClass(row.updated_by)}`}>{sourceLabel(row.updated_by)}</span></td>
                                    <td>
                                        <div className={styles.rowActions}>
                                            <button type="button" onClick={() => beginEditRow(row)} disabled={saving}>수정</button>
                                            <button type="button" onClick={() => deleteRow(row)} disabled={saving}>삭제</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : activeTable === 'aliases' ? (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>상태</th>
                                <th>항목</th>
                                <th>원본명</th>
                                <th>ELS명</th>
                                <th>GLAPS명</th>
                                <th>코드</th>
                                <th>운송경로코드</th>
                                <th>조정안내</th>
                                <th>수정출처</th>
                                <th>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tableRows.map((row) => (
                                <tr key={row.id}>
                                    <td><span className={`${styles.statusPill} ${styles[row.review_status] || ''}`}>{statusLabel(row.review_status)}</span></td>
                                    <td>{row.alias_type}</td>
                                    <td>{row.source_name}</td>
                                    <td>{row.els_name}</td>
                                    <td>{row.glaps_name}</td>
                                    <td>{row.glaps_code}</td>
                                    <td>{row.route_code}</td>
                                    <td>{row.review_note}</td>
                                    <td><span className={`${styles.sourceBadge} ${sourceClass(row.updated_by)}`}>{sourceLabel(row.updated_by)}</span></td>
                                    <td>
                                        <div className={styles.rowActions}>
                                            <button type="button" onClick={() => beginEditRow(row)} disabled={saving}>수정</button>
                                            <button type="button" onClick={() => deleteRow(row)} disabled={saving}>삭제</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>시트</th>
                                <th>행</th>
                                <th>헤더</th>
                                <th>원본값</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tableRows.map((row) => (
                                <tr key={row.id}>
                                    <td>{row.sheet_name}</td>
                                    <td>{row.row_number}</td>
                                    <td>{row.header_row ? '헤더' : ''}</td>
                                    <td>{JSON.stringify(row.row_payload || row.row_values || {})}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {!loading && tableRows.length === 0 && <div className={styles.emptyState}>표시할 데이터가 없습니다.</div>}
            </div>
        </div>
    );
}
