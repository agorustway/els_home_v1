'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './glapsMaster.module.css';

const STATUS_LABELS = {
    ready: '확정',
    needs_mapping: '조정필요',
    missing_route_code: '코드없음',
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

function routeMatchKey(row) {
    return [row.start_location_name, row.waypoint_els_name || row.waypoint_name, row.destination_name]
        .filter(Boolean)
        .join(' → ');
}

function downloadTemplate(kind) {
    window.location.href = `/api/branches/asan/glaps/master/template?kind=${kind}`;
}

export default function AsanGlapsMaster() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [data, setData] = useState(null);
    const [activeTable, setActiveTable] = useState('routes');
    const [statusFilter, setStatusFilter] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [message, setMessage] = useState(null);
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
            const suffix = payload.summary ? `운송경로 ${payload.summary.total}건` : `수정 ${payload.updated || 0}건 / 삭제 ${payload.deleted || 0}건`;
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
        postWorkbook({ mode: activeTable, file });
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
                    <button type="button" onClick={() => downloadTemplate(activeTable)} disabled={saving || activeTable === 'sheets'}>수정양식 내보내기</button>
                    <button type="button" onClick={() => templateFileRef.current?.click()} disabled={saving || activeTable === 'sheets'}>수정양식 업로드</button>
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
            </div>

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
