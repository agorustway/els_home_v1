'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    DEFAULT_ANNUAL_PERFORMANCE_PATH,
    DEFAULT_ANNUAL_PERFORMANCE_SHEET,
    formatPerformanceAmount,
    getPerformanceChartMax,
    normalizePerformancePath,
    getPerformanceYearLabel,
    normalizePerformanceColumnOrder,
    reconcilePerformanceLayoutPrefs,
} from '@/utils/asanPerformanceView.mjs';
import styles from './annualPerformance.module.css';

const PREFS_KEY = 'asan_annual_performance_prefs';
const PAGE_SIZE = 300;
const SEARCH_DEBOUNCE_MS = 700;

function fmtTs(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function readPrefs() {
    if (typeof window === 'undefined') return {};
    try {
        return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    } catch {
        return {};
    }
}

function writePrefs(prefs) {
    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch { /* ignore */ }
}

async function readPerformanceJson(res, fallbackMessage) {
    const text = await res.text();
    let json = null;

    if (text) {
        try {
            json = JSON.parse(text);
        } catch {
            const preview = text.replace(/\s+/g, ' ').trim().slice(0, 180);
            const htmlHint = preview.startsWith('<')
                ? 'HTML 에러 응답이 내려왔습니다. NAS Core 라우트 배포 또는 게이트웨이 연결을 확인해 주세요.'
                : 'JSON이 아닌 응답이 내려왔습니다.';
            throw new Error(`${fallbackMessage}: HTTP ${res.status} ${htmlHint}${preview ? ` (${preview})` : ''}`);
        }
    }

    if (!res.ok) {
        const checked = Array.isArray(json?.checked_paths) && json.checked_paths.length > 0
            ? ` 확인 경로: ${json.checked_paths.slice(0, 3).join(' / ')}`
            : '';
        throw new Error(`${json?.error || fallbackMessage}${checked}`);
    }

    return json || {};
}

function DataBar({ value, max, tone }) {
    const width = Math.max(2, Math.min(100, (Math.abs(Number(value) || 0) / max) * 100));
    return (
        <div className={styles.dataBarTrack}>
            <span className={`${styles.dataBarFill} ${styles[tone]}`} style={{ width: `${width}%` }} />
        </div>
    );
}

export default function AsanAnnualPerformance() {
    const [selectedPath, setSelectedPath] = useState(DEFAULT_ANNUAL_PERFORMANCE_PATH);
    const [sheetName, setSheetName] = useState(DEFAULT_ANNUAL_PERFORMANCE_SHEET);
    const [headerRow, setHeaderRow] = useState('');
    const [payload, setPayload] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('analytics');
    const [searchInput, setSearchInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });
    const [colOrder, setColOrder] = useState([]);
    const [hiddenCols, setHiddenCols] = useState(new Set());
    const [showColPanel, setShowColPanel] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showBrowser, setShowBrowser] = useState(false);
    const [browserPath, setBrowserPath] = useState('/아산지점/B_총무/C_마감/합계연간실적');
    const [browserFiles, setBrowserFiles] = useState([]);
    const [browserLoading, setBrowserLoading] = useState(false);
    const [elapsed, setElapsed] = useState('');
    const requestIdRef = useRef(0);

    useEffect(() => {
        const prefs = readPrefs();
        setSelectedPath(normalizePerformancePath(prefs.path || DEFAULT_ANNUAL_PERFORMANCE_PATH));
        setSheetName(prefs.sheetName || DEFAULT_ANNUAL_PERFORMANCE_SHEET);
        setHeaderRow(prefs.headerRow || '');
        setColOrder(prefs.colOrder || []);
        setHiddenCols(new Set(prefs.hiddenCols || []));
    }, []);

    const persistPrefs = useCallback((next = {}) => {
        const prefs = {
            ...readPrefs(),
            path: selectedPath,
            sheetName,
            headerRow,
            colOrder,
            hiddenCols: Array.from(hiddenCols),
            sourceHeaders: payload?.headers || [],
            ...next,
        };
        writePrefs(prefs);
    }, [selectedPath, sheetName, headerRow, colOrder, hiddenCols, payload?.headers]);

    const applyPayload = useCallback((nextPayload, options = {}) => {
        if (!nextPayload) return;
        if (options.append) {
            setPayload(prev => ({
                ...nextPayload,
                data: [...(prev?.data || []), ...(nextPayload.data || [])],
            }));
        } else {
            setPayload(nextPayload);
        }

        if (nextPayload.headers) {
            const prefs = readPrefs();
            const reconciled = reconcilePerformanceLayoutPrefs({
                order: prefs.colOrder || [],
                hiddenCols: prefs.hiddenCols || [],
                sourceHeaders: prefs.sourceHeaders || [],
                currentHeaders: nextPayload.headers,
            });
            setColOrder(reconciled.colOrder);
            setHiddenCols(reconciled.hiddenCols);
        }
    }, []);

    const fetchData = useCallback(async (options = {}) => {
        const page = options.page || 1;
        const append = Boolean(options.append);
        const quiet = Boolean(options.quiet);
        const requestId = append ? requestIdRef.current : requestIdRef.current + 1;
        if (!append) requestIdRef.current = requestId;

        if (append) {
            setLoadingMore(true);
        } else if (!quiet) {
            setLoading(true);
        }
        setError('');

        try {
            const params = new URLSearchParams({
                path: normalizePerformancePath(options.path || selectedPath),
                sheet_name: options.sheetName || sheetName || DEFAULT_ANNUAL_PERFORMANCE_SHEET,
                page: String(page),
                page_size: String(PAGE_SIZE),
                source: 'supabase',
            });
            const effectiveHeaderRow = options.headerRow ?? headerRow;
            if (effectiveHeaderRow) params.set('header_row', String(effectiveHeaderRow));
            const effectiveSearch = options.search ?? searchTerm;
            if (effectiveSearch) params.set('search', effectiveSearch);
            const sortKey = options.sortKey ?? sortConfig.key;
            const sortDir = options.sortDir ?? sortConfig.direction;
            if (sortKey) {
                params.set('sort_key', sortKey);
                params.set('sort_dir', sortDir || 'asc');
            }

            const res = await fetch(`/api/branches/asan/performance/annual?${params.toString()}`);
            const json = await readPerformanceJson(res, '연간실적 조회 실패');
            if (!append && requestId !== requestIdRef.current) return;
            applyPayload(json.data, { append });
        } catch (err) {
            setError(err.message || '연간실적 조회 실패');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [selectedPath, sheetName, headerRow, searchTerm, sortConfig, applyPayload]);

    useEffect(() => {
        if (!selectedPath) return;
        fetchData();
    }, [selectedPath, sheetName, headerRow, fetchData]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setSearchTerm(searchInput.trim());
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        if (!selectedPath) return;
        fetchData({ page: 1, search: searchTerm, quiet: Boolean(payload) });
    }, [searchTerm, selectedPath]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!payload?.file_modified_at) {
            setElapsed('');
            return;
        }
        const update = () => {
            const diff = Math.max(0, Date.now() - new Date(payload.file_modified_at).getTime());
            const d = Math.floor(diff / 86400000);
            const h = Math.floor((diff % 86400000) / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            setElapsed(`+${d > 0 ? `${d}d ` : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        };
        update();
        const iv = setInterval(update, 30000);
        return () => clearInterval(iv);
    }, [payload?.file_modified_at]);

    const headers = useMemo(() => (Array.isArray(payload?.headers) ? payload.headers : []), [payload]);
    const rows = useMemo(() => (Array.isArray(payload?.data) ? payload.data : []), [payload]);
    const summary = payload?.summary || {};
    const totalRows = Number(payload?.total ?? rows.length) || 0;
    const loadedRows = rows.length;
    const canLoadMore = payload?.source === 'supabase' && loadedRows < totalRows;
    const visibleColumns = useMemo(() => {
        const hidden = hiddenCols instanceof Set ? hiddenCols : new Set(hiddenCols || []);
        return normalizePerformanceColumnOrder(colOrder, headers).filter(col => !hidden.has(col));
    }, [colOrder, headers, hiddenCols]);
    const yearly = Array.isArray(summary.yearly) ? summary.yearly : [];
    const topGroups = Array.isArray(summary.topGroups) ? summary.topGroups : [];
    const chartMax = getPerformanceChartMax(yearly, ['revenue', 'purchase', 'profit']);

    const syncNow = async () => {
        setSyncing(true);
        setError('');
        try {
            const res = await fetch('/api/branches/asan/performance/annual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: selectedPath,
                    sheet_name: sheetName || DEFAULT_ANNUAL_PERFORMANCE_SHEET,
                    header_row: headerRow || null,
                    force: true,
                    page: 1,
                    page_size: PAGE_SIZE,
                    search: searchTerm,
                    sort_key: sortConfig.key,
                    sort_dir: sortConfig.direction,
                }),
            });
            const json = await readPerformanceJson(res, '연간실적 동기화 실패');
            applyPayload(json.data);
            persistPrefs({ sourceHeaders: json.data?.headers || [] });
        } catch (err) {
            setError(err.message || '연간실적 동기화 실패');
        } finally {
            setSyncing(false);
        }
    };

    const loadNextPage = () => {
        if (!canLoadMore || loadingMore) return;
        const nextPage = Math.floor(loadedRows / PAGE_SIZE) + 1;
        fetchData({ page: nextPage, append: true });
    };

    const requestSort = (col) => {
        const next = sortConfig.key === col && sortConfig.direction === 'asc'
            ? { key: col, direction: 'desc' }
            : { key: col, direction: 'asc' };
        setSortConfig(next);
        fetchData({ page: 1, sortKey: next.key, sortDir: next.direction, quiet: true });
    };

    const toggleColumn = (col) => {
        setHiddenCols(prev => {
            const next = new Set(prev);
            if (next.has(col)) next.delete(col);
            else next.add(col);
            persistPrefs({ hiddenCols: Array.from(next) });
            return next;
        });
    };

    const resetColumns = () => {
        const nextOrder = normalizePerformanceColumnOrder([], headers);
        setColOrder(nextOrder);
        setHiddenCols(new Set());
        persistPrefs({ colOrder: nextOrder, hiddenCols: [], sourceHeaders: headers });
    };

    const loadNasFolder = async (path) => {
        setBrowserLoading(true);
        try {
            const res = await fetch(`/api/nas/files?path=${encodeURIComponent(path)}`);
            const json = await readPerformanceJson(res, 'NAS 폴더 조회 실패');
            if (json.files) setBrowserFiles(json.files);
            setBrowserPath(path);
        } catch (err) {
            setError(err.message || 'NAS 폴더 조회 실패');
        } finally {
            setBrowserLoading(false);
        }
    };

    const openBrowser = () => {
        loadNasFolder(browserPath || '/');
        setShowSettings(false);
        setShowBrowser(true);
    };

    const selectFile = (file) => {
        if (file.type === 'directory') {
            loadNasFolder(file.path);
            return;
        }
        if (/\.xls[mx]?$/i.test(file.name)) {
            const nextPath = normalizePerformancePath(file.path);
            setSelectedPath(nextPath);
            persistPrefs({ path: nextPath });
            setShowBrowser(false);
            setShowSettings(true);
        }
    };

    const applySettings = () => {
        const nextPath = normalizePerformancePath(selectedPath);
        setSelectedPath(nextPath);
        persistPrefs({ path: nextPath });
        setShowSettings(false);
        fetchData({ page: 1, path: nextPath, sheetName, headerRow });
    };

    return (
        <div className={styles.container}>
            <div className={styles.topBar}>
                <div className={styles.titleBlock}>
                    <h2 className={styles.title}>연간실적</h2>
                    <div className={styles.metaLine}>
                        <span>파일 {fmtTs(payload?.file_modified_at)}</span>
                        {elapsed && <span className={styles.elapsed}>{elapsed}</span>}
                        <span>{payload?.source || '대기'}</span>
                        <span>{totalRows.toLocaleString()}행</span>
                    </div>
                </div>
                <div className={styles.actions}>
                    <div className={styles.segmented}>
                        <button className={activeTab === 'analytics' ? styles.segmentActive : ''} onClick={() => setActiveTab('analytics')}>분석</button>
                        <button className={activeTab === 'table' ? styles.segmentActive : ''} onClick={() => setActiveTab('table')}>테이블</button>
                    </div>
                    <button className={styles.ghostBtn} onClick={() => setShowSettings(true)}>파일 설정</button>
                    <button className={styles.primaryBtn} onClick={syncNow} disabled={syncing}>{syncing ? '동기화 중' : 'NAS 동기화'}</button>
                </div>
            </div>

            {error && <div className={styles.errorBox}>{error}</div>}

            {loading && !payload ? (
                <div className={styles.emptyState}>연간실적 자료 조회중...</div>
            ) : activeTab === 'analytics' ? (
                <div className={styles.analytics}>
                    <div className={styles.kpiGrid}>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>연간 매출</span>
                            <strong>{formatPerformanceAmount(summary.totalRevenue)}</strong>
                        </div>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>연간 매입</span>
                            <strong>{formatPerformanceAmount(summary.totalPurchase)}</strong>
                        </div>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>손익</span>
                            <strong className={(Number(summary.totalProfit) || 0) < 0 ? styles.negative : styles.positive}>
                                {formatPerformanceAmount(summary.totalProfit)}
                            </strong>
                        </div>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>손익률</span>
                            <strong>{Number(summary.profitRate || 0).toLocaleString('ko-KR')}%</strong>
                        </div>
                    </div>

                    <div className={styles.analysisGrid}>
                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <h3>연도별 매출·매입·손익</h3>
                                <span>{yearly.length.toLocaleString()}개 연도</span>
                            </div>
                            <div className={styles.yearChart}>
                                {yearly.length === 0 ? (
                                    <div className={styles.emptyPanel}>분석 가능한 금액/연도 컬럼이 아직 없습니다.</div>
                                ) : yearly.map(item => (
                                    <div className={styles.yearRow} key={getPerformanceYearLabel(item)}>
                                        <div className={styles.yearLabel}>{getPerformanceYearLabel(item)}</div>
                                        <div className={styles.barStack}>
                                            <div><DataBar value={item.revenue} max={chartMax} tone="revenue" /><span>{formatPerformanceAmount(item.revenue)}</span></div>
                                            <div><DataBar value={item.purchase} max={chartMax} tone="purchase" /><span>{formatPerformanceAmount(item.purchase)}</span></div>
                                            <div><DataBar value={item.profit} max={chartMax} tone={(Number(item.profit) || 0) < 0 ? 'loss' : 'profit'} /><span>{formatPerformanceAmount(item.profit)}</span></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <h3>상위 거래처/구분</h3>
                                <span>매출 기준</span>
                            </div>
                            <div className={styles.rankList}>
                                {topGroups.length === 0 ? (
                                    <div className={styles.emptyPanel}>그룹 기준 컬럼이 없으면 상위 집계가 비어 있습니다.</div>
                                ) : topGroups.slice(0, 10).map((item, idx) => (
                                    <div className={styles.rankRow} key={`${item.name}-${idx}`}>
                                        <span className={styles.rankNo}>{idx + 1}</span>
                                        <span className={styles.rankName}>{item.name || '미분류'}</span>
                                        <strong>{formatPerformanceAmount(item.revenue)}</strong>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    <section className={styles.detectPanel}>
                        <span>매출: {(summary.detected?.revenueColumns || []).join(', ') || '자동 후보 없음'}</span>
                        <span>매입: {(summary.detected?.purchaseColumns || []).join(', ') || '자동 후보 없음'}</span>
                        <span>손익: {(summary.detected?.profitColumns || []).join(', ') || '매출-매입'}</span>
                        <span>그룹: {(summary.detected?.groupColumns || []).join(', ') || '자동 후보 없음'}</span>
                    </section>
                </div>
            ) : (
                <div className={styles.tableArea}>
                    <div className={styles.tableToolbar}>
                        <input
                            className={styles.searchInput}
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            placeholder="검색어"
                        />
                        <button className={styles.ghostBtn} onClick={() => setShowColPanel(prev => !prev)}>컬럼</button>
                        <span className={styles.rowCount}>조회 {loadedRows.toLocaleString()} / 전체 {totalRows.toLocaleString()}</span>
                    </div>

                    {showColPanel && (
                        <div className={styles.columnPanel}>
                            <button className={styles.smallBtn} onClick={resetColumns}>초기화</button>
                            {headers.map(col => (
                                <label key={col}>
                                    <input type="checkbox" checked={!hiddenCols.has(col)} onChange={() => toggleColumn(col)} />
                                    {col}
                                </label>
                            ))}
                        </div>
                    )}

                    <div className={styles.tableScroll}>
                        <table className={styles.dataTable}>
                            <thead>
                                <tr>
                                    {visibleColumns.map(col => (
                                        <th key={col} onClick={() => requestSort(col)}>
                                            {col}
                                            {sortConfig.key === col && <span>{sortConfig.direction === 'desc' ? ' ↓' : ' ↑'}</span>}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, rowIdx) => (
                                    <tr key={`${payload?.page || 1}-${rowIdx}`}>
                                        {visibleColumns.map(col => {
                                            const idx = headers.indexOf(col);
                                            return <td key={col}>{idx >= 0 ? row[idx] : ''}</td>;
                                        })}
                                    </tr>
                                ))}
                                {rows.length === 0 && (
                                    <tr>
                                        <td className={styles.tableMessageCell} colSpan={Math.max(1, visibleColumns.length)}>
                                            조건에 맞는 자료가 없습니다.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className={styles.pageBar}>
                        <button className={styles.loadMoreBtn} onClick={loadNextPage} disabled={!canLoadMore || loadingMore}>
                            {loadingMore ? '불러오는 중' : canLoadMore ? '더 보기' : '전체 로드됨'}
                        </button>
                    </div>
                </div>
            )}

            {showSettings && (
                <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowSettings(false); }}>
                    <div className={styles.modal}>
                        <h2>연간실적 파일 설정</h2>
                        <div className={styles.formGroup}>
                            <label>엑셀 파일 경로</label>
                            <div className={styles.pathRow}>
                                <input value={selectedPath} onChange={e => setSelectedPath(e.target.value)} className={styles.pathInput} />
                                <button onClick={openBrowser} className={styles.browseBtn}>찾기</button>
                            </div>
                        </div>
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label>시트명</label>
                                <input value={sheetName} onChange={e => setSheetName(e.target.value)} className={styles.pathInput} />
                            </div>
                            <div className={styles.formGroup}>
                                <label>제목행</label>
                                <input value={headerRow} onChange={e => setHeaderRow(e.target.value.replace(/[^\d]/g, ''))} placeholder="자동" className={styles.pathInput} />
                            </div>
                        </div>
                        <div className={styles.modalFooter}>
                            <button onClick={() => setShowSettings(false)} className={styles.cancelBtn}>닫기</button>
                            <button onClick={applySettings} className={styles.saveBtn}>적용</button>
                        </div>
                    </div>
                </div>
            )}

            {showBrowser && (
                <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) { setShowBrowser(false); setShowSettings(true); } }}>
                    <div className={styles.modal}>
                        <h2>NAS 파일 선택</h2>
                        <p className={styles.browserPath}>{browserPath}</p>
                        <div className={styles.browserList}>
                            {browserLoading ? <div className={styles.browserLoading}>불러오는 중...</div> : <>
                                {browserPath !== '/' && <div className={styles.browserItem} onClick={() => loadNasFolder(browserPath.split('/').slice(0, -1).join('/') || '/')}>..</div>}
                                {browserFiles.map((file, idx) => (
                                    <div key={`${file.path}-${idx}`} className={styles.browserItem} onClick={() => selectFile(file)}>
                                        <span>{file.type === 'directory' ? '[폴더]' : '[파일]'}</span>
                                        {file.name}
                                    </div>
                                ))}
                            </>}
                        </div>
                        <div className={styles.modalFooter}>
                            <button onClick={() => { setShowBrowser(false); setShowSettings(true); }} className={styles.cancelBtn}>닫기</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
