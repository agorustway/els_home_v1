'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    DEFAULT_MONTHLY_PERFORMANCE_EXTRA_MONTHS,
    FIRST_SHEET_TOKEN,
    buildMonthlyPerformanceFileSlots,
    formatPerformanceAmount,
    formatPerformanceCellValue,
    getPerformanceChartMax,
    normalizePerformanceColumnOrder,
    normalizePerformancePath,
    reconcilePerformanceLayoutPrefs,
} from '@/utils/asanPerformanceView.mjs';
import styles from './annualPerformance.module.css';

const PREFS_KEY = 'asan_monthly_performance_prefs';
const PAGE_SIZE = 300;
const SEARCH_DEBOUNCE_MS = 700;
const DEFAULT_MONTHLY_BASE_YEAR = 2026;
const DEFAULT_MONTHLY_RANGE_HINT = '2026-01 ~ 2027-03';
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
            throw new Error(`${fallbackMessage}: HTTP ${res.status}`);
        }
    }
    if (!res.ok) throw new Error(json?.error || fallbackMessage);
    return json || {};
}

function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function formatPercent(value, digits = 1) {
    return `${(Number(value) || 0).toLocaleString('ko-KR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })}%`;
}

function profitRate(item = {}) {
    const revenue = safeNumber(item.revenue);
    return revenue ? (safeNumber(item.profit) / revenue) * 100 : 0;
}

function normalizeSlot(slot) {
    const year = Number.parseInt(slot.year, 10);
    const month = Number.parseInt(slot.month, 10);
    const period = slot.period || `${year}-${String(month).padStart(2, '0')}`;
    return {
        year,
        month,
        period,
        carryover: Boolean(slot.carryover || year > DEFAULT_MONTHLY_BASE_YEAR),
        enabled: slot.enabled !== false,
        path: normalizePerformancePath(slot.path || ''),
        sheetName: slot.sheetName || slot.sheet_name || FIRST_SHEET_TOKEN,
        headerRow: slot.headerRow || slot.header_row || '',
    };
}

function mergeSavedSlots(baseYear, extraMonths, savedSlots = []) {
    const savedByPeriod = new Map((savedSlots || []).map(item => [item.period, item]));
    return buildMonthlyPerformanceFileSlots(baseYear, { extraMonths }).map((slot) => (
        normalizeSlot({ ...slot, ...(savedByPeriod.get(slot.period) || {}) })
    ));
}

function slotsForApi(slots) {
    return slots.map(slot => ({
        period: slot.period,
        year: slot.year,
        month: slot.month,
        enabled: slot.enabled,
        path: normalizePerformancePath(slot.path),
        sheet_name: slot.sheetName || FIRST_SHEET_TOKEN,
        header_row: slot.headerRow || null,
    }));
}

function fileName(path) {
    return String(path || '').split('/').filter(Boolean).pop() || '-';
}

export default function AsanMonthlyPerformance() {
    const [baseYear, setBaseYear] = useState(DEFAULT_MONTHLY_BASE_YEAR);
    const [extraMonths, setExtraMonths] = useState(DEFAULT_MONTHLY_PERFORMANCE_EXTRA_MONTHS);
    const [fileSlots, setFileSlots] = useState(() => buildMonthlyPerformanceFileSlots(DEFAULT_MONTHLY_BASE_YEAR));
    const [payload, setPayload] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState(null);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('analytics');
    const [selectedReportPeriod, setSelectedReportPeriod] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchMode, setSearchMode] = useState('or');
    const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });
    const [colOrder, setColOrder] = useState([]);
    const [hiddenCols, setHiddenCols] = useState(new Set());
    const [showColPanel, setShowColPanel] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showBrowser, setShowBrowser] = useState(false);
    const [browserPath, setBrowserPath] = useState('/아산지점/B_총무/C_마감');
    const [browserFiles, setBrowserFiles] = useState([]);
    const [browserLoading, setBrowserLoading] = useState(false);
    const [browseTargetIndex, setBrowseTargetIndex] = useState(null);
    const requestIdRef = useRef(0);

    useEffect(() => {
        const prefs = readPrefs();
        const savedYear = Number.parseInt(prefs.baseYear, 10) || DEFAULT_MONTHLY_BASE_YEAR;
        const savedExtra = Number.parseInt(prefs.extraMonths, 10) || DEFAULT_MONTHLY_PERFORMANCE_EXTRA_MONTHS;
        setBaseYear(savedYear);
        setExtraMonths(savedExtra);
        setFileSlots(mergeSavedSlots(savedYear, savedExtra, prefs.files || []));
        setColOrder(prefs.colOrder || []);
        setHiddenCols(new Set(prefs.hiddenCols || []));
    }, []);

    const persistPrefs = useCallback((next = {}) => {
        const prefs = {
            ...readPrefs(),
            baseYear,
            extraMonths,
            files: fileSlots,
            colOrder,
            hiddenCols: Array.from(hiddenCols),
            sourceHeaders: payload?.headers || [],
            ...next,
        };
        writePrefs(prefs);
    }, [baseYear, colOrder, extraMonths, fileSlots, hiddenCols, payload?.headers]);

    const applyPayload = useCallback((nextPayload, options = {}) => {
        if (!nextPayload) return;
        if (nextPayload.sync_status) {
            setSyncStatus(nextPayload.sync_status);
            setSyncing(Boolean(nextPayload.sync_status.running));
            if (!nextPayload.sync_status.running && nextPayload.sync_status.last_error) setError(nextPayload.sync_status.last_error);
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
        if (append) setLoadingMore(true);
        else if (!quiet) setLoading(true);
        setError('');
        if (!append) setNotice('');

        try {
            const params = new URLSearchParams({
                year: String(options.baseYear || baseYear),
                extra_months: String(options.extraMonths ?? extraMonths),
                page: String(page),
                page_size: String(PAGE_SIZE),
                source: 'supabase',
            });
            const effectiveSearch = options.search ?? searchTerm;
            if (effectiveSearch) {
                params.set('search', effectiveSearch);
                params.set('search_mode', options.searchMode || searchMode || 'or');
            }
            const sortKey = options.sortKey ?? sortConfig.key;
            const sortDir = options.sortDir ?? sortConfig.direction;
            if (sortKey) {
                params.set('sort_key', sortKey);
                params.set('sort_dir', sortDir || 'asc');
            }
            const res = await fetch(`/api/branches/asan/performance/monthly?${params.toString()}`);
            const json = await readPerformanceJson(res, '월간실적 조회 실패');
            if (!append && requestId !== requestIdRef.current) return;
            applyPayload(json.data, { append });
        } catch (err) {
            setError(err.message || '월간실적 조회 실패');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [applyPayload, baseYear, extraMonths, searchMode, searchTerm, sortConfig]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        const timer = setTimeout(() => setSearchTerm(searchInput.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        fetchData({ page: 1, search: searchTerm, searchMode, quiet: Boolean(payload) });
    }, [searchTerm, searchMode]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!syncing) return undefined;
        const timer = setInterval(() => {
            fetchData({ page: 1, quiet: true });
        }, 5000);
        return () => clearInterval(timer);
    }, [fetchData, syncing]);

    const headers = useMemo(() => (Array.isArray(payload?.headers) ? payload.headers : []), [payload]);
    const rows = useMemo(() => (Array.isArray(payload?.data) ? payload.data : []), [payload]);
    const summary = payload?.summary || {};
    const monthly = Array.isArray(summary.monthly) ? summary.monthly : EMPTY_LIST;
    const daily = Array.isArray(summary.daily) ? summary.daily : EMPTY_LIST;
    const monthlyReports = Array.isArray(summary.monthlyReports) ? summary.monthlyReports : EMPTY_LIST;
    const totalRows = Number(payload?.total ?? rows.length) || 0;
    const loadedRows = rows.length;
    const canLoadMore = payload?.source === 'supabase' && loadedRows < totalRows;
    const totalRowsLabel = `${totalRows.toLocaleString()}${payload?.total_is_estimated ? '+' : ''}`;
    const visibleColumns = useMemo(() => {
        const hidden = hiddenCols instanceof Set ? hiddenCols : new Set(hiddenCols || []);
        return normalizePerformanceColumnOrder(colOrder, headers).filter(col => !hidden.has(col));
    }, [colOrder, headers, hiddenCols]);
    const chartMax = getPerformanceChartMax(monthly, ['revenue', 'purchase', 'profit']);
    const monthRange = monthly.length ? `${monthly[0].period} ~ ${monthly[monthly.length - 1].period}` : DEFAULT_MONTHLY_RANGE_HINT;
    const sourceSlots = Array.isArray(summary.monthlyFileSlots) ? summary.monthlyFileSlots : fileSlots;
    const syncedSlotCount = safeNumber(summary.monthlyFileCount);
    const totalRevenue = safeNumber(summary.totalRevenue);
    const totalPurchase = safeNumber(summary.totalPurchase);
    const totalProfit = safeNumber(summary.totalProfit);
    const totalProfitRate = totalRevenue ? (totalProfit / totalRevenue) * 100 : 0;
    const selectedReport = monthlyReports.find(item => item.period === selectedReportPeriod) || monthlyReports[monthlyReports.length - 1] || null;
    const reportGroups = Array.isArray(selectedReport?.groups) ? selectedReport.groups : EMPTY_LIST;
    const reportTotals = selectedReport?.totals || {};
    const carryover = selectedReport?.carryover || summary.carryover || {};
    const carryoverRevenue = safeNumber(carryover.revenue);
    const carryoverPurchase = safeNumber(carryover.purchase);
    const carryoverProfit = safeNumber(carryover.profit);
    const latestDaily = daily.slice(-31);

    useEffect(() => {
        if (!monthlyReports.length) {
            if (selectedReportPeriod) setSelectedReportPeriod('');
            return;
        }
        if (!selectedReportPeriod || !monthlyReports.some(item => item.period === selectedReportPeriod)) {
            setSelectedReportPeriod(monthlyReports[monthlyReports.length - 1].period || '');
        }
    }, [monthlyReports, selectedReportPeriod]);

    const renderReportRow = (label, metricKey, rateKey = '') => (
        <tr key={label}>
            <th>{label}</th>
            {reportGroups.map(group => (
                <td key={`${label}-${group.name}`}>{formatPerformanceAmount(group[metricKey])}</td>
            ))}
            <td>{formatPerformanceAmount(reportTotals[metricKey])}</td>
            <td>{rateKey ? formatPercent(reportTotals[rateKey], 2) : ''}</td>
        </tr>
    );

    const syncNow = async ({ force = true, nextSlots = fileSlots, nextBaseYear = baseYear, nextExtraMonths = extraMonths } = {}) => {
        setSyncing(true);
        setError('');
        try {
            const res = await fetch('/api/branches/asan/performance/monthly', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    base_year: nextBaseYear,
                    extra_months: nextExtraMonths,
                    files: slotsForApi(nextSlots),
                    force,
                    async: true,
                    page: 1,
                    page_size: PAGE_SIZE,
                }),
            });
            const json = await readPerformanceJson(res, '월간실적 동기화 실패');
            applyPayload(json.data);
            setNotice(json.message || '월간실적 NAS 동기화를 시작했습니다.');
            window.setTimeout(() => fetchData({ page: 1, quiet: true, baseYear: nextBaseYear, extraMonths: nextExtraMonths }), 2500);
        } catch (err) {
            setError(err.message || '월간실적 동기화 실패');
            setSyncing(false);
        }
    };

    const saveSettingsAndSync = () => {
        const normalizedSlots = fileSlots.map(normalizeSlot);
        setFileSlots(normalizedSlots);
        persistPrefs({
            baseYear,
            extraMonths,
            files: normalizedSlots,
        });
        setShowSettings(false);
        syncNow({
            force: false,
            nextSlots: normalizedSlots,
            nextBaseYear: baseYear,
            nextExtraMonths: extraMonths,
        });
    };

    const regenerateSlots = () => {
        const nextSlots = buildMonthlyPerformanceFileSlots(baseYear, { extraMonths }).map(normalizeSlot);
        setFileSlots(nextSlots);
    };

    const updateSlot = (idx, patch) => {
        setFileSlots(prev => prev.map((slot, slotIdx) => (
            slotIdx === idx ? normalizeSlot({ ...slot, ...patch }) : slot
        )));
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

    const openBrowser = (idx) => {
        setBrowseTargetIndex(idx);
        const currentPath = fileSlots[idx]?.path || '/아산지점/B_총무/C_마감';
        const folder = currentPath.split('/').slice(0, -1).join('/') || '/아산지점/B_총무/C_마감';
        loadNasFolder(folder);
        setShowSettings(false);
        setShowBrowser(true);
    };

    const selectFile = (file) => {
        if (file.type === 'directory') {
            loadNasFolder(file.path);
            return;
        }
        if (/\.xls[mx]?$/i.test(file.name) && browseTargetIndex != null) {
            updateSlot(browseTargetIndex, { path: normalizePerformancePath(file.path) });
            setShowBrowser(false);
            setShowSettings(true);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.topBar}>
                <div className={styles.titleBlock}>
                    <h2 className={styles.title}>월간실적</h2>
                    <div className={styles.metaLine}>
                        <span>{monthRange}</span>
                        <span>{payload?.source || '대기'}</span>
                        <span>{totalRowsLabel}행</span>
                        <span>파일 {syncedSlotCount.toLocaleString('ko-KR')} / {sourceSlots.length.toLocaleString('ko-KR')}</span>
                        <span>동기화 {fmtTs(payload?.synced_at)}</span>
                        {syncStatus?.running && <span className={styles.syncBadge}>동기화 진행중</span>}
                    </div>
                </div>
                <div className={styles.actions}>
                    <div className={styles.segmented}>
                        <button className={activeTab === 'analytics' ? styles.segmentActive : ''} onClick={() => setActiveTab('analytics')}>분석</button>
                        <button className={activeTab === 'table' ? styles.segmentActive : ''} onClick={() => setActiveTab('table')}>테이블</button>
                    </div>
                    <button className={styles.ghostBtn} onClick={() => setShowSettings(true)}>파일 설정</button>
                    <button className={styles.primaryBtn} onClick={() => syncNow({ force: true })} disabled={syncing}>{syncing ? '동기화 중' : 'NAS 동기화'}</button>
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
                                <h3>월간 성과 리포트</h3>
                                <span className={styles.gradeBadge}>{DEFAULT_MONTHLY_RANGE_HINT}</span>
                            </div>
                            <div className={styles.commandMeta}>
                                <span>기준연도 {baseYear}</span>
                                <span>정리기간 {extraMonths}개월</span>
                                <span>월별 {summary.monthlyBasis || '파일월'} 기준</span>
                            </div>
                        </div>
                        <div className={styles.commandNotes}>
                            <div className={styles.noteLine}>연간실적으로 넘기기 전 월별 마감 원장을 같은 DB 구조로 고정합니다.</div>
                            <div className={styles.noteLine}>이월 구간은 기준연도 다음 해 파일까지 별도 슬롯으로 보존합니다.</div>
                        </div>
                    </section>

                    <div className={styles.kpiGrid}>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>매출</span>
                            <strong>{formatPerformanceAmount(totalRevenue)}</strong>
                            <em>{safeNumber(summary.analysisRows).toLocaleString('ko-KR')}건</em>
                        </div>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>매입</span>
                            <strong>{formatPerformanceAmount(totalPurchase)}</strong>
                            <em>{totalRevenue ? formatPercent((totalPurchase / totalRevenue) * 100) : '-'}</em>
                        </div>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>손익</span>
                            <strong className={totalProfit < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(totalProfit)}</strong>
                            <em>손익률 {formatPercent(totalProfitRate, 2)}</em>
                        </div>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>이월금액</span>
                            <strong>{formatPerformanceAmount(carryoverRevenue)}</strong>
                            <em>매입 {formatPerformanceAmount(carryoverPurchase)} · 차액 {formatPerformanceAmount(carryoverProfit)}</em>
                        </div>
                    </div>

                    <section className={`${styles.panel} ${styles.monthlyReportPanel}`}>
                        <div className={styles.panelHeader}>
                            <h3>월별 보고서</h3>
                            <span>{selectedReport?.period || '보고서 데이터 없음'} · 이월금액 포함</span>
                        </div>
                        {monthlyReports.length > 0 && (
                            <div className={styles.reportPeriodTabs}>
                                {monthlyReports.map(report => (
                                    <button
                                        key={report.period}
                                        type="button"
                                        className={selectedReport?.period === report.period ? styles.reportPeriodActive : ''}
                                        onClick={() => setSelectedReportPeriod(report.period)}
                                    >
                                        {report.period}
                                    </button>
                                ))}
                            </div>
                        )}
                        {!selectedReport ? (
                            <div className={styles.emptyPanel}>월별 보고서 표를 감지하지 못했습니다. NAS 동기화 후 첫 번째 시트의 매출보고서 표를 확인해 주세요.</div>
                        ) : (
                            <div className={styles.monthlyReportScroll}>
                                <table className={styles.monthlyReportTable}>
                                    <thead>
                                        <tr>
                                            <th>구분</th>
                                            {reportGroups.map(group => <th key={group.name}>{group.name}</th>)}
                                            <th>매출합계</th>
                                            <th>이익율</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className={styles.reportSectionRow}><td colSpan={reportGroups.length + 3}>매출</td></tr>
                                        {renderReportRow('순매출', 'netRevenue', 'netProfitRate')}
                                        {renderReportRow('순매입', 'netPurchase')}
                                        {renderReportRow('매출이익/순매출', 'netProfit')}
                                        {renderReportRow('매출(계산서)', 'invoiceRevenue', 'invoiceProfitRate')}
                                        {renderReportRow('매입(계산서)', 'invoicePurchase')}
                                        {renderReportRow('매출이익(계산서)', 'invoiceProfit')}
                                        <tr className={styles.reportSectionRow}><td colSpan={reportGroups.length + 3}>이월</td></tr>
                                        {renderReportRow('매출 이월', 'carryoverRevenue')}
                                        {renderReportRow('매입 이월', 'carryoverPurchase')}
                                        {renderReportRow('이월 차액', 'carryoverProfit')}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    <section className={`${styles.panel} ${styles.monthPanel}`}>
                        <div className={styles.panelHeader}>
                            <h3>월별 성과 흐름</h3>
                            <span>{monthRange}</span>
                        </div>
                        <div className={styles.monthChart}>
                            {monthly.length === 0 ? (
                                <div className={styles.emptyPanel}>월별 분석 데이터가 아직 없습니다.</div>
                            ) : (
                                <>
                                    <div className={styles.monthHeaderRow}>
                                        <span>월</span>
                                        <span>매출</span>
                                        <span>매출액</span>
                                        <span>손익</span>
                                        <span>손익액</span>
                                        <span>률</span>
                                    </div>
                                    {monthly.map(item => (
                                        <div className={styles.monthRow} key={item.period}>
                                            <span>{item.period}</span>
                                            <span className={styles.inlineBar}><i style={{ width: `${Math.max(2, Math.min(100, Math.abs(safeNumber(item.revenue)) / chartMax * 100))}%` }} /></span>
                                            <strong>{formatPerformanceAmount(item.revenue)}</strong>
                                            <span className={styles.inlineBar}><i style={{ width: `${Math.max(2, Math.min(100, Math.abs(safeNumber(item.profit)) / chartMax * 100))}%` }} /></span>
                                            <strong className={safeNumber(item.profit) < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(item.profit)}</strong>
                                            <em>{formatPercent(profitRate(item), 1)}</em>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </section>

                    <section className={styles.panel}>
                        <div className={styles.panelHeader}>
                            <h3>일별 데이터</h3>
                            <span>{latestDaily.length.toLocaleString('ko-KR')}일 · 작업일자 기준</span>
                        </div>
                        {latestDaily.length === 0 ? (
                            <div className={styles.emptyPanel}>일별 원장 데이터를 아직 도출하지 못했습니다. 원본에 작업일자 컬럼이 있으면 동기화 후 자동 집계됩니다.</div>
                        ) : (
                            <div className={styles.dailyList}>
                                {latestDaily.map(item => (
                                    <div className={styles.dailyRow} key={item.date}>
                                        <span>{item.date}</span>
                                        <strong>{formatPerformanceAmount(item.revenue)}</strong>
                                        <em>{formatPerformanceAmount(item.purchase)}</em>
                                        <b className={safeNumber(item.profit) < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(item.profit)}</b>
                                        <small>{safeNumber(item.rowCount).toLocaleString('ko-KR')}건</small>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className={styles.panel}>
                        <div className={styles.panelHeader}>
                            <h3>월별 파일 공간</h3>
                            <span>{baseYear}년 + 이월 {extraMonths}개월</span>
                        </div>
                        <div className={styles.monthlySlotGrid}>
                            {sourceSlots.map((slot) => (
                                <div className={styles.monthlySlotCard} key={slot.period}>
                                    <div>
                                        <strong>{slot.period}</strong>
                                        {slot.carryover && <em>이월</em>}
                                    </div>
                                    <span>{fileName(slot.path)}</span>
                                </div>
                            ))}
                        </div>
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
                        <button
                            className={searchMode === 'and' ? styles.smallActiveBtn : styles.ghostBtn}
                            onClick={() => setSearchMode(prev => (prev === 'and' ? 'or' : 'and'))}
                        >
                            {searchMode === 'and' ? 'AND 검색' : 'OR 검색'}
                        </button>
                        <button className={styles.ghostBtn} onClick={() => setShowColPanel(prev => !prev)}>컬럼</button>
                        <span className={styles.rowCount}>조회 {loadedRows.toLocaleString()} / 전체 {totalRowsLabel}</span>
                    </div>

                    {showColPanel && (
                        <div className={styles.columnPanel}>
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
                    <div className={`${styles.modal} ${styles.monthlyModal}`}>
                        <h2>월간실적 파일 설정</h2>
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label>기준연도</label>
                                <input value={baseYear} onChange={e => setBaseYear(e.target.value.replace(/[^\d]/g, ''))} className={styles.pathInput} />
                            </div>
                            <div className={styles.formGroup}>
                                <label>정리기간</label>
                                <input value={extraMonths} onChange={e => setExtraMonths(e.target.value.replace(/[^\d]/g, ''))} className={styles.pathInput} />
                            </div>
                        </div>
                        <div className={styles.modalFooter}>
                            <button onClick={regenerateSlots} className={styles.ghostBtn}>기본 경로 재생성</button>
                        </div>
                        <div className={styles.monthlySettingsList}>
                            {fileSlots.map((slot, idx) => (
                                <div className={styles.monthlySettingsRow} key={slot.period}>
                                    <label>
                                        <input type="checkbox" checked={slot.enabled} onChange={e => updateSlot(idx, { enabled: e.target.checked })} />
                                        {slot.period}{slot.carryover ? ' 이월' : ''}
                                    </label>
                                    <input value={slot.path} onChange={e => updateSlot(idx, { path: e.target.value })} className={styles.pathInput} />
                                    <input value={slot.sheetName} onChange={e => updateSlot(idx, { sheetName: e.target.value || FIRST_SHEET_TOKEN })} className={styles.shortInput} />
                                    <input value={slot.headerRow} onChange={e => updateSlot(idx, { headerRow: e.target.value.replace(/[^\d]/g, '') })} placeholder="제목행" className={styles.shortInput} />
                                    <button onClick={() => openBrowser(idx)} className={styles.browseBtn}>찾기</button>
                                </div>
                            ))}
                        </div>
                        <div className={styles.modalFooter}>
                            <button onClick={() => setShowSettings(false)} className={styles.cancelBtn}>닫기</button>
                            <button onClick={saveSettingsAndSync} className={styles.saveBtn}>저장 후 동기화</button>
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
