'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    DEFAULT_ANNUAL_PERFORMANCE_PATH,
    DEFAULT_ANNUAL_PERFORMANCE_SHEET,
    formatPerformanceAmount,
    formatPerformanceCellValue,
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
const DIMENSION_PRIORITY = ['청구처', '작업지', '운송사', '노선', '구분', '지급처', '포트', '하차', '계약', '픽업', '지역'];
const EMPTY_LIST = Object.freeze([]);

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

function rate(numerator, denominator) {
    const top = Number(numerator) || 0;
    const bottom = Number(denominator) || 0;
    return bottom ? Math.round((top / bottom) * 10000) / 100 : 0;
}

function safeNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function formatPercent(value, digits = 1) {
    return `${safeNumber(value).toLocaleString('ko-KR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
    })}%`;
}

function formatSignedAmount(value) {
    const num = safeNumber(value);
    if (!num) return '0원';
    return `${num > 0 ? '+' : ''}${formatPerformanceAmount(num)}`;
}

function profitRateOf(item) {
    return rate(item?.profit, item?.revenue);
}

function getDimensionScore(column = '') {
    const idx = DIMENSION_PRIORITY.findIndex(word => String(column).includes(word));
    return idx >= 0 ? idx : DIMENSION_PRIORITY.length;
}

function sumField(items = [], field) {
    return items.reduce((sum, item) => sum + safeNumber(item?.[field]), 0);
}

function getPerformanceGrade(profitRate) {
    if (profitRate >= 10) return { label: '수익성 양호', tone: 'good' };
    if (profitRate >= 5) return { label: '마진 관리', tone: 'watch' };
    if (profitRate > 0) return { label: '저마진 주의', tone: 'warn' };
    return { label: '손익 위험', tone: 'danger' };
}

function getPeriodRange(monthly = []) {
    if (!monthly.length) return '-';
    const first = monthly[0]?.period || '-';
    const last = monthly[monthly.length - 1]?.period || '-';
    return first === last ? first : `${first} ~ ${last}`;
}

function buildExecutiveNotes({ profitRate, purchaseRate, latestMonth, previousMonth, topSegment, top3Share, lowMarginItems }) {
    const notes = [];
    if (latestMonth && previousMonth) {
        notes.push(`최근월 매출은 전월 대비 ${formatSignedAmount(safeNumber(latestMonth.revenue) - safeNumber(previousMonth.revenue))}, 손익은 ${formatSignedAmount(safeNumber(latestMonth.profit) - safeNumber(previousMonth.profit))}입니다.`);
    }
    notes.push(`전체 손익률은 ${formatPercent(profitRate)}이고 매입률은 ${formatPercent(purchaseRate)}입니다.`);
    if (topSegment) {
        notes.push(`최대 기여 항목은 ${topSegment.name || '미분류'}이며 매출 비중 ${formatPercent(topSegment.revenueShare)}입니다.`);
    }
    if (top3Share) {
        notes.push(`상위 3개 집중도는 ${formatPercent(top3Share)}입니다.`);
    }
    if (lowMarginItems.length) {
        notes.push(`매출 상위권 중 손익률이 낮은 항목 ${lowMarginItems.length.toLocaleString('ko-KR')}개를 우선 점검 대상으로 표시했습니다.`);
    }
    return notes.slice(0, 5);
}

export default function AsanAnnualPerformance() {
    const [selectedPath, setSelectedPath] = useState(DEFAULT_ANNUAL_PERFORMANCE_PATH);
    const [sheetName, setSheetName] = useState(DEFAULT_ANNUAL_PERFORMANCE_SHEET);
    const [headerRow, setHeaderRow] = useState('');
    const [payload, setPayload] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState(null);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('analytics');
    const [searchInput, setSearchInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });
    const [activeDimension, setActiveDimension] = useState('');
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
        if (nextPayload.sync_status) {
            setSyncStatus(nextPayload.sync_status);
            setSyncing(Boolean(nextPayload.sync_status.running));
            if (!nextPayload.sync_status.running && nextPayload.sync_status.last_error) {
                setError(nextPayload.sync_status.last_error);
            }
        }
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
        if (!append) setNotice('');

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
    const yearly = Array.isArray(summary.yearly) ? summary.yearly : EMPTY_LIST;
    const monthly = Array.isArray(summary.monthly) ? summary.monthly : EMPTY_LIST;
    const monthlyTrend = monthly.slice(-12);
    const breakdowns = Array.isArray(summary.breakdowns) ? summary.breakdowns : EMPTY_LIST;
    const topGroups = Array.isArray(summary.topGroups) ? summary.topGroups : EMPTY_LIST;
    const chartMax = getPerformanceChartMax(yearly, ['revenue', 'purchase', 'profit']);
    const monthChartMax = getPerformanceChartMax(monthlyTrend, ['revenue', 'purchase', 'profit']);
    const analysisRows = Number(summary.analysisRows || totalRows || 0) || 0;
    const avgRevenue = analysisRows ? (Number(summary.totalRevenue) || 0) / analysisRows : 0;
    const avgProfit = analysisRows ? (Number(summary.totalProfit) || 0) / analysisRows : 0;
    const purchaseRate = rate(summary.totalPurchase, summary.totalRevenue);
    const profitRate = Number(summary.profitRate || rate(summary.totalProfit, summary.totalRevenue)) || 0;
    const performanceGrade = getPerformanceGrade(profitRate);
    const bestProfitMonth = monthly.reduce((best, item) => (Number(item.profit) || 0) > (Number(best?.profit) || -Infinity) ? item : best, null);
    const worstProfitMonth = monthly.reduce((worst, item) => (Number(item.profit) || 0) < (Number(worst?.profit) || Infinity) ? item : worst, null);
    const bestRevenueMonth = monthly.reduce((best, item) => (Number(item.revenue) || 0) > (Number(best?.revenue) || -Infinity) ? item : best, null);
    const latestMonth = monthly[monthly.length - 1] || null;
    const previousMonth = monthly[monthly.length - 2] || null;
    const dimensionOptions = useMemo(() => {
        return breakdowns
            .filter(section => Array.isArray(section.items) && section.items.length)
            .slice()
            .sort((a, b) => getDimensionScore(a.column) - getDimensionScore(b.column));
    }, [breakdowns]);
    const activeBreakdown = useMemo(() => (
        dimensionOptions.find(section => section.column === activeDimension) || dimensionOptions[0] || null
    ), [dimensionOptions, activeDimension]);
    const activeItems = useMemo(() => (activeBreakdown?.items || []).filter(item => safeNumber(item.revenue) || safeNumber(item.purchase) || safeNumber(item.profit)), [activeBreakdown]);
    const topSegment = activeItems[0] || topGroups[0] || null;
    const top3Share = sumField(activeItems.slice(0, 3), 'revenueShare');
    const top10Share = sumField(activeItems.slice(0, 10), 'revenueShare');
    const lowMarginItems = activeItems
        .filter(item => safeNumber(item.revenue) > 0 && profitRateOf(item) < Math.max(3, profitRate - 2))
        .slice(0, 5);
    const lossItems = activeItems
        .filter(item => safeNumber(item.profit) < 0)
        .sort((a, b) => safeNumber(a.profit) - safeNumber(b.profit))
        .slice(0, 5);
    const marginLeaders = activeItems
        .filter(item => safeNumber(item.revenue) > 0)
        .slice()
        .sort((a, b) => profitRateOf(b) - profitRateOf(a))
        .slice(0, 5);
    const bridgeMax = Math.max(1, Math.abs(safeNumber(summary.totalRevenue)), Math.abs(safeNumber(summary.totalPurchase)), Math.abs(safeNumber(summary.totalProfit)));
    const executiveNotes = buildExecutiveNotes({
        profitRate,
        purchaseRate,
        latestMonth,
        previousMonth,
        topSegment,
        top3Share,
        lowMarginItems,
    });

    useEffect(() => {
        if (!dimensionOptions.length) return;
        if (!activeDimension || !dimensionOptions.some(section => section.column === activeDimension)) {
            setActiveDimension(dimensionOptions[0].column);
        }
    }, [activeDimension, dimensionOptions]);

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
                    async: true,
                    page: 1,
                    page_size: PAGE_SIZE,
                    search: searchTerm,
                    sort_key: sortConfig.key,
                    sort_dir: sortConfig.direction,
                }),
            });
            const json = await readPerformanceJson(res, '연간실적 동기화 실패');
            applyPayload(json.data);
            setNotice(json.message || '연간실적 NAS 동기화를 시작했습니다.');
            if (json.data?.headers?.length) {
                persistPrefs({ sourceHeaders: json.data.headers });
            }
        } catch (err) {
            setError(err.message || '연간실적 동기화 실패');
            setSyncing(false);
        }
    };

    useEffect(() => {
        if (!syncing) return undefined;
        const timer = setInterval(() => {
            fetchData({ page: 1, quiet: true });
        }, 5000);
        return () => clearInterval(timer);
    }, [syncing, fetchData]);

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
                        {syncStatus?.running && <span className={styles.syncBadge}>동기화 진행중</span>}
                        {syncStatus?.finished_at && !syncStatus.running && <span>동기화 {fmtTs(syncStatus.finished_at)}</span>}
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
            {notice && !error && <div className={styles.noticeBox}>{notice}</div>}

            {loading && !payload ? (
                <div className={styles.emptyState}>데이터를 불러오는 중입니다...</div>
            ) : activeTab === 'analytics' ? (
                <div className={styles.analytics}>
                    <section className={styles.commandPanel}>
                        <div className={styles.commandMain}>
                            <div className={styles.commandTitleRow}>
                                <h3>연간 성과 리포트</h3>
                                <span className={`${styles.gradeBadge} ${styles[`grade_${performanceGrade.tone}`]}`}>
                                    {performanceGrade.label}
                                </span>
                            </div>
                            <div className={styles.commandMeta}>
                                <span>기간 {getPeriodRange(monthly)}</span>
                                <span>분석 {analysisRows.toLocaleString('ko-KR')}행</span>
                                <span>현재 스냅샷 {summary.currentSnapshotId ? '고정' : '미확인'}</span>
                                <span>{summary.importMode || 'supabase'}</span>
                            </div>
                        </div>
                        <div className={styles.commandNotes}>
                            {executiveNotes.map((item, idx) => (
                                <div className={styles.noteLine} key={`${item}-${idx}`}>{item}</div>
                            ))}
                        </div>
                    </section>

                    <div className={styles.kpiGrid}>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>연간 매출</span>
                            <strong>{formatPerformanceAmount(summary.totalRevenue)}</strong>
                            <em>건당 매출 {formatPerformanceAmount(avgRevenue)}</em>
                        </div>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>연간 매입</span>
                            <strong>{formatPerformanceAmount(summary.totalPurchase)}</strong>
                            <em>매입률 {formatPercent(purchaseRate)}</em>
                        </div>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>손익</span>
                            <strong className={(Number(summary.totalProfit) || 0) < 0 ? styles.negative : styles.positive}>
                                {formatPerformanceAmount(summary.totalProfit)}
                            </strong>
                            <em>건당 {formatPerformanceAmount(avgProfit)}</em>
                        </div>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>손익률</span>
                            <strong>{formatPercent(profitRate, 2)}</strong>
                            <em>{topSegment ? `최대 비중 ${formatPercent(topSegment.revenueShare)}` : '비중 자료 없음'}</em>
                        </div>
                    </div>

                    <div className={styles.reportGrid}>
                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <h3>손익 구조</h3>
                                <span>매출 → 매입 → 손익</span>
                            </div>
                            <div className={styles.bridgeList}>
                                {[
                                    { label: '매출', value: summary.totalRevenue, tone: 'revenue', sub: '총 청구 기준' },
                                    { label: '매입', value: summary.totalPurchase, tone: 'purchase', sub: `${formatPercent(purchaseRate)} 사용` },
                                    { label: '손익', value: summary.totalProfit, tone: safeNumber(summary.totalProfit) < 0 ? 'loss' : 'profit', sub: `${formatPercent(profitRate, 2)} 잔여` },
                                ].map(item => (
                                    <div className={styles.bridgeRow} key={item.label}>
                                        <div>
                                            <strong>{item.label}</strong>
                                            <span>{item.sub}</span>
                                        </div>
                                        <div className={styles.bridgeBar}>
                                            <span
                                                className={`${styles.bridgeFill} ${styles[item.tone]}`}
                                                style={{ width: `${Math.max(2, Math.min(100, Math.abs(safeNumber(item.value)) / bridgeMax * 100))}%` }}
                                            />
                                        </div>
                                        <b>{formatPerformanceAmount(item.value)}</b>
                                    </div>
                                ))}
                                <div className={styles.bridgeFormula}>
                                    <span>손익 = 매출 - 매입</span>
                                    <strong>{formatPerformanceAmount(summary.totalRevenue)} - {formatPerformanceAmount(summary.totalPurchase)} = {formatPerformanceAmount(summary.totalProfit)}</strong>
                                </div>
                            </div>
                        </section>

                        <section className={`${styles.panel} ${styles.monthPanel}`}>
                            <div className={styles.panelHeader}>
                                <h3>월별 성과 흐름</h3>
                                <span>최근 {monthlyTrend.length.toLocaleString()}개월</span>
                            </div>
                            <div className={styles.monthChart}>
                                {monthlyTrend.length === 0 ? (
                                    <div className={styles.emptyPanel}>월별 분석 데이터가 아직 없습니다.</div>
                                ) : monthlyTrend.map(item => (
                                    <div className={styles.monthRow} key={item.period}>
                                        <span>{item.period}</span>
                                        <DataBar value={item.revenue} max={monthChartMax} tone="revenue" />
                                        <DataBar value={item.profit} max={monthChartMax} tone={(Number(item.profit) || 0) < 0 ? 'loss' : 'profit'} />
                                        <strong>{formatPerformanceAmount(item.profit)}</strong>
                                        <em>{formatPercent(profitRateOf(item))}</em>
                                    </div>
                                ))}
                            </div>
                        </section>
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

                        <section className={`${styles.panel} ${styles.signalPanel}`}>
                            <div className={styles.panelHeader}>
                                <h3>성과 경보</h3>
                                <span>월/집중도 기준</span>
                            </div>
                            <div className={styles.signalGrid}>
                                <div className={styles.signalItem}>
                                    <span>최고 매출월</span>
                                    <strong>{bestRevenueMonth?.period || '-'}</strong>
                                    <em>{bestRevenueMonth ? formatPerformanceAmount(bestRevenueMonth.revenue) : '-'}</em>
                                </div>
                                <div className={styles.signalItem}>
                                    <span>최고 손익월</span>
                                    <strong>{bestProfitMonth?.period || '-'}</strong>
                                    <em>{bestProfitMonth ? formatPerformanceAmount(bestProfitMonth.profit) : '-'}</em>
                                </div>
                                <div className={styles.signalItem}>
                                    <span>최저 손익월</span>
                                    <strong>{worstProfitMonth?.period || '-'}</strong>
                                    <em className={safeNumber(worstProfitMonth?.profit) < 0 ? styles.negative : ''}>{worstProfitMonth ? formatPerformanceAmount(worstProfitMonth.profit) : '-'}</em>
                                </div>
                                <div className={styles.signalItem}>
                                    <span>상위 10 집중도</span>
                                    <strong>{formatPercent(top10Share)}</strong>
                                    <em>{activeBreakdown?.column || '그룹'} 기준</em>
                                </div>
                            </div>
                        </section>
                    </div>

                    <section className={`${styles.panel} ${styles.matrixPanel}`}>
                        <div className={styles.panelHeader}>
                            <h3>공헌도 매트릭스</h3>
                            <span>{activeBreakdown?.column || '그룹'} 기준 상위 10</span>
                        </div>
                        <div className={styles.dimensionTabs}>
                            {dimensionOptions.map(section => (
                                <button
                                    key={section.column}
                                    className={activeBreakdown?.column === section.column ? styles.dimensionActive : ''}
                                    onClick={() => setActiveDimension(section.column)}
                                >
                                    {section.column}
                                </button>
                            ))}
                        </div>
                        {activeItems.length === 0 ? (
                            <div className={styles.emptyPanel}>세그먼트 분석 데이터가 아직 없습니다.</div>
                        ) : (
                            <div className={styles.matrixTable}>
                                <div className={styles.matrixHead}>
                                    <span>순위</span>
                                    <span>항목</span>
                                    <span>매출</span>
                                    <span>매입</span>
                                    <span>손익</span>
                                    <span>손익률</span>
                                    <span>비중</span>
                                    <span>건수</span>
                                </div>
                                {activeItems.slice(0, 10).map((item, idx) => (
                                    <div className={styles.matrixRow} key={`${activeBreakdown?.column}-${item.name}-${idx}`}>
                                        <span className={styles.rankNo}>{idx + 1}</span>
                                        <span className={styles.rankName}>{item.name || '미분류'}</span>
                                        <strong>{formatPerformanceAmount(item.revenue)}</strong>
                                        <span>{formatPerformanceAmount(item.purchase)}</span>
                                        <strong className={safeNumber(item.profit) < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(item.profit)}</strong>
                                        <span className={profitRateOf(item) < profitRate ? styles.warningText : ''}>{formatPercent(profitRateOf(item))}</span>
                                        <span>{formatPercent(item.revenueShare)}</span>
                                        <span>{safeNumber(item.rowCount).toLocaleString('ko-KR')}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <div className={styles.portfolioGrid}>
                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <h3>저마진 주의</h3>
                                <span>매출 상위 내 손익률 낮음</span>
                            </div>
                            <div className={styles.compactList}>
                                {lowMarginItems.length === 0 ? (
                                    <div className={styles.emptyMini}>주요 저마진 항목 없음</div>
                                ) : lowMarginItems.map((item, idx) => (
                                    <div className={styles.compactRow} key={`low-${item.name}-${idx}`}>
                                        <span>{item.name || '미분류'}</span>
                                        <b>{formatPercent(profitRateOf(item))}</b>
                                        <em>{formatPerformanceAmount(item.revenue)}</em>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <h3>손실 항목</h3>
                                <span>손익 음수</span>
                            </div>
                            <div className={styles.compactList}>
                                {lossItems.length === 0 ? (
                                    <div className={styles.emptyMini}>손실 항목 없음</div>
                                ) : lossItems.map((item, idx) => (
                                    <div className={styles.compactRow} key={`loss-${item.name}-${idx}`}>
                                        <span>{item.name || '미분류'}</span>
                                        <b className={styles.negative}>{formatPerformanceAmount(item.profit)}</b>
                                        <em>{formatPercent(profitRateOf(item))}</em>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <h3>고마진 항목</h3>
                                <span>손익률 기준</span>
                            </div>
                            <div className={styles.compactList}>
                                {marginLeaders.length === 0 ? (
                                    <div className={styles.emptyMini}>고마진 항목 없음</div>
                                ) : marginLeaders.map((item, idx) => (
                                    <div className={styles.compactRow} key={`margin-${item.name}-${idx}`}>
                                        <span>{item.name || '미분류'}</span>
                                        <b className={styles.positive}>{formatPercent(profitRateOf(item))}</b>
                                        <em>{formatPerformanceAmount(item.profit)}</em>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    <div className={styles.dimensionSummaryGrid}>
                        {dimensionOptions.slice(0, 6).map(section => {
                            const item = section.items?.[0];
                            return (
                                <section className={styles.dimensionCard} key={section.column}>
                                    <div>
                                        <span>{section.column}</span>
                                        <strong>{item?.name || '미분류'}</strong>
                                    </div>
                                    <div className={styles.dimensionStats}>
                                        <b>{item ? formatPerformanceAmount(item.revenue) : '-'}</b>
                                        <em>비중 {item ? formatPercent(item.revenueShare) : '-'}</em>
                                        <em>손익률 {item ? formatPercent(profitRateOf(item)) : '-'}</em>
                                    </div>
                                </section>
                            );
                        })}
                    </div>

                    <section className={styles.detectPanel}>
                        <span>매출: {(summary.detected?.revenueColumns || []).join(', ') || '자동 후보 없음'}</span>
                        <span>매입: {(summary.detected?.purchaseColumns || []).join(', ') || '자동 후보 없음'}</span>
                        <span>손익: {(summary.detected?.profitColumns || []).join(', ') || '매출-매입'}</span>
                        <span>그룹: {(summary.detected?.groupColumns || []).join(', ') || '자동 후보 없음'}</span>
                        <span>조회: {summary.currentSnapshotId ? '현재 스냅샷 고정' : 'current 행 기준'}</span>
                        <span>원장: 삭제 없이 누적</span>
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
                                            return <td key={col}>{idx >= 0 ? formatPerformanceCellValue(col, row[idx]) : ''}</td>;
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
