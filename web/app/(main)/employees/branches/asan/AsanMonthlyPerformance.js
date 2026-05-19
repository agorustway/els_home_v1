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
const REPORT_ALL_KEY = 'all';
const REPORT_METRIC_KEYS = [
    'netRevenue',
    'netPurchase',
    'netProfit',
    'invoiceRevenue',
    'invoicePurchase',
    'invoiceProfit',
    'carryoverRevenue',
    'carryoverPurchase',
    'carryoverProfit',
];
const DIMENSION_HINTS = [
    { key: 'client', label: '청구처별', words: ['청구처', '거래처', '화주'] },
    { key: 'work_site', label: '작업지별', words: ['작업지', '상차', '하차'] },
    { key: 'carrier', label: '운송사(명의)별', words: ['운송사', '명의'] },
    { key: 'category', label: '구분별', words: ['구분', '계약'] },
    { key: 'pickup', label: '청구픽업별', words: ['픽업', '청구픽업'] },
    { key: 'port', label: '포트별', words: ['포트', 'port'] },
    { key: 'route', label: '노선별', words: ['노선', '구간'] },
    { key: 'vehicle', label: '차량별', words: ['영업넘버', '차량'] },
];
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

function formatReportPeriod(period) {
    const match = String(period || '').match(/^(\d{4})-(\d{1,2})$/);
    if (!match) return period || '월간';
    return `${match[1]}년 ${Number(match[2])}월`;
}

function formatReportTitle(period) {
    return `${formatReportPeriod(period)} 아산매출보고서`;
}

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function finalizeReportMetric(metric) {
    const next = { ...metric };
    if (!next.netProfit && (next.netRevenue || next.netPurchase)) next.netProfit = next.netRevenue - next.netPurchase;
    if (!next.invoiceProfit && (next.invoiceRevenue || next.invoicePurchase)) next.invoiceProfit = next.invoiceRevenue - next.invoicePurchase;
    next.carryoverProfit = next.carryoverRevenue - next.carryoverPurchase;
    next.netProfitRate = next.netRevenue ? (next.netProfit / next.netRevenue) * 100 : 0;
    next.invoiceProfitRate = next.invoiceRevenue ? (next.invoiceProfit / next.invoiceRevenue) * 100 : 0;
    REPORT_METRIC_KEYS.forEach((key) => { next[key] = roundMoney(next[key]); });
    next.netProfitRate = Math.round(next.netProfitRate * 100) / 100;
    next.invoiceProfitRate = Math.round(next.invoiceProfitRate * 100) / 100;
    return next;
}

function aggregateMonthlyReports(reports = []) {
    const validReports = (reports || []).filter(report => Array.isArray(report.groups) && report.groups.length);
    if (!validReports.length) return null;

    const groups = new Map();
    const totals = { name: '매출합계' };
    const carryover = { revenue: 0, purchase: 0, profit: 0 };
    REPORT_METRIC_KEYS.forEach((key) => { totals[key] = 0; });

    validReports.forEach((report) => {
        (report.groups || []).forEach((group) => {
            const name = group.name || '미분류';
            if (!groups.has(name)) {
                const seed = { name };
                REPORT_METRIC_KEYS.forEach((key) => { seed[key] = 0; });
                groups.set(name, seed);
            }
            const bucket = groups.get(name);
            REPORT_METRIC_KEYS.forEach((key) => { bucket[key] += safeNumber(group[key]); });
        });

        REPORT_METRIC_KEYS.forEach((key) => { totals[key] += safeNumber(report.totals?.[key]); });
        carryover.revenue += safeNumber(report.carryover?.revenue);
        carryover.purchase += safeNumber(report.carryover?.purchase);
        carryover.profit += safeNumber(report.carryover?.profit);
    });

    if (!totals.netRevenue) totals.netRevenue = Array.from(groups.values()).reduce((sum, item) => sum + safeNumber(item.netRevenue), 0);
    if (!totals.netPurchase) totals.netPurchase = Array.from(groups.values()).reduce((sum, item) => sum + safeNumber(item.netPurchase), 0);
    if (!totals.invoiceRevenue) totals.invoiceRevenue = Array.from(groups.values()).reduce((sum, item) => sum + safeNumber(item.invoiceRevenue), 0);
    if (!totals.invoicePurchase) totals.invoicePurchase = Array.from(groups.values()).reduce((sum, item) => sum + safeNumber(item.invoicePurchase), 0);
    totals.carryoverRevenue = carryover.revenue;
    totals.carryoverPurchase = carryover.purchase;
    totals.carryoverProfit = carryover.profit || carryover.revenue - carryover.purchase;

    return {
        period: REPORT_ALL_KEY,
        groups: Array.from(groups.values()).map(finalizeReportMetric).sort((a, b) => Math.abs(safeNumber(b.netRevenue)) - Math.abs(safeNumber(a.netRevenue))),
        totals: finalizeReportMetric(totals),
        carryover: {
            revenue: roundMoney(carryover.revenue),
            purchase: roundMoney(carryover.purchase),
            profit: roundMoney(carryover.profit || carryover.revenue - carryover.purchase),
        },
        hasReportRows: true,
    };
}

function normalizeDimensionSections(breakdowns = []) {
    const sections = (breakdowns || [])
        .filter(section => Array.isArray(section.items) && section.items.length)
        .map(section => ({ ...section, label: section.column || '분류별' }));
    const selected = [];
    const used = new Set();

    DIMENSION_HINTS.forEach((hint) => {
        const match = sections.find((section, idx) => !used.has(idx) && hint.words.some(word => String(section.column || '').toLowerCase().includes(String(word).toLowerCase())));
        if (!match) return;
        const idx = sections.indexOf(match);
        used.add(idx);
        selected.push({ ...match, key: hint.key, label: hint.label });
    });

    sections.forEach((section, idx) => {
        if (used.has(idx)) return;
        selected.push({ ...section, key: `extra_${idx}`, label: `${section.column}별` });
    });

    return selected.slice(0, 10);
}

function groupDailyByMonth(monthly = [], daily = []) {
    const map = new Map();
    monthly.forEach((item) => {
        map.set(item.period, { ...item, days: [] });
    });
    daily.forEach((item) => {
        const period = item.period || String(item.date || '').slice(0, 7);
        if (!period) return;
        if (!map.has(period)) {
            const [yearText, monthText] = period.split('-');
            map.set(period, {
                period,
                year: Number(yearText),
                month: Number(monthText),
                revenue: 0,
                purchase: 0,
                profit: 0,
                rowCount: 0,
                days: [],
            });
        }
        map.get(period).days.push(item);
    });
    return Array.from(map.values()).sort((a, b) => String(a.period).localeCompare(String(b.period)));
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
    const [selectedReportPeriod, setSelectedReportPeriod] = useState(REPORT_ALL_KEY);
    const [expandedDailyMonths, setExpandedDailyMonths] = useState(new Set());
    const [activeDimensionKey, setActiveDimensionKey] = useState('');
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
    const syncWasRunningRef = useRef(false);

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

    const applySyncStatus = useCallback((status) => {
        if (!status) return { running: false, finished: false };
        const running = Boolean(status.running);
        const finished = syncWasRunningRef.current && !running;
        syncWasRunningRef.current = running;
        setSyncStatus(status);
        setSyncing(running);
        if (!running && status.last_error) setError(status.last_error);
        return { running, finished };
    }, []);

    const applyPayload = useCallback((nextPayload, options = {}) => {
        if (!nextPayload) return;
        if (nextPayload.sync_status) {
            applySyncStatus(nextPayload.sync_status);
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
    }, [applySyncStatus]);

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

    const fetchSyncStatus = useCallback(async () => {
        try {
            const params = new URLSearchParams({
                source: 'status',
                year: String(baseYear),
                extra_months: String(extraMonths),
            });
            const res = await fetch(`/api/branches/asan/performance/monthly?${params.toString()}`, { cache: 'no-store' });
            const json = await readPerformanceJson(res, '월간실적 동기화 상태 조회 실패');
            return applySyncStatus(json.data?.sync_status);
        } catch (err) {
            if (syncWasRunningRef.current) setError(err.message || '월간실적 동기화 상태 조회 실패');
            return null;
        }
    }, [applySyncStatus, baseYear, extraMonths]);

    useEffect(() => {
        fetchSyncStatus();
    }, [fetchSyncStatus]);

    useEffect(() => {
        if (!syncing) return undefined;
        const timer = setInterval(async () => {
            const statusResult = await fetchSyncStatus();
            if (statusResult?.finished) fetchData({ page: 1, quiet: true });
        }, 5000);
        return () => clearInterval(timer);
    }, [fetchData, fetchSyncStatus, syncing]);

    const headers = useMemo(() => (Array.isArray(payload?.headers) ? payload.headers : []), [payload]);
    const rows = useMemo(() => (Array.isArray(payload?.data) ? payload.data : []), [payload]);
    const summary = payload?.summary || {};
    const monthly = Array.isArray(summary.monthly) ? summary.monthly : EMPTY_LIST;
    const daily = Array.isArray(summary.daily) ? summary.daily : EMPTY_LIST;
    const monthlyReports = Array.isArray(summary.monthlyReports) ? summary.monthlyReports : EMPTY_LIST;
    const allReport = useMemo(() => aggregateMonthlyReports(monthlyReports), [monthlyReports]);
    const reportOptions = useMemo(() => (
        allReport ? [{ period: REPORT_ALL_KEY, label: '전체' }, ...monthlyReports.map(report => ({ period: report.period, label: report.period }))] : []
    ), [allReport, monthlyReports]);
    const dimensionSections = useMemo(() => normalizeDimensionSections(summary.breakdowns || []), [summary.breakdowns]);
    const activeDimension = dimensionSections.find(section => section.key === activeDimensionKey) || dimensionSections[0] || null;
    const dailyTree = useMemo(() => groupDailyByMonth(monthly, daily), [daily, monthly]);
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
    const totalRevenue = safeNumber(summary.totalRevenue);
    const totalPurchase = safeNumber(summary.totalPurchase);
    const totalProfit = safeNumber(summary.totalProfit);
    const totalProfitRate = totalRevenue ? (totalProfit / totalRevenue) * 100 : 0;
    const selectedReport = selectedReportPeriod === REPORT_ALL_KEY
        ? allReport
        : (monthlyReports.find(item => item.period === selectedReportPeriod) || allReport || monthlyReports[monthlyReports.length - 1] || null);
    const reportGroups = Array.isArray(selectedReport?.groups) ? selectedReport.groups : EMPTY_LIST;
    const reportTotals = selectedReport?.totals || {};
    const carryover = selectedReport?.carryover || summary.carryover || {};
    const carryoverRevenue = safeNumber(carryover.revenue);
    const carryoverPurchase = safeNumber(carryover.purchase);
    const carryoverProfit = safeNumber(carryover.profit);
    const reportPeriodText = selectedReport?.period === REPORT_ALL_KEY ? '전체' : formatReportPeriod(selectedReport?.period || selectedReportPeriod);
    const reportTitleText = selectedReport?.period === REPORT_ALL_KEY ? `${monthRange} 아산매출보고서` : formatReportTitle(selectedReport?.period || selectedReportPeriod);
    const reportColumnCount = reportGroups.length + 3;
    const diagramMax = Math.max(1, Math.abs(totalRevenue), Math.abs(totalPurchase), Math.abs(totalProfit), Math.abs(carryoverRevenue));
    const topDimensionItem = activeDimension?.items?.[0] || null;

    useEffect(() => {
        if (!monthlyReports.length) {
            if (selectedReportPeriod !== REPORT_ALL_KEY) setSelectedReportPeriod(REPORT_ALL_KEY);
            return;
        }
        if (!selectedReportPeriod || (selectedReportPeriod !== REPORT_ALL_KEY && !monthlyReports.some(item => item.period === selectedReportPeriod))) {
            setSelectedReportPeriod(REPORT_ALL_KEY);
        }
    }, [monthlyReports, selectedReportPeriod]);

    useEffect(() => {
        if (!dimensionSections.length) return;
        if (!activeDimensionKey || !dimensionSections.some(section => section.key === activeDimensionKey)) {
            setActiveDimensionKey(dimensionSections[0].key);
        }
    }, [activeDimensionKey, dimensionSections]);

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

    const toggleDailyMonth = (period) => {
        setExpandedDailyMonths(prev => {
            const next = new Set(prev);
            if (next.has(period)) next.delete(period);
            else next.add(period);
            return next;
        });
    };

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
                        <span>동기화 {fmtTs(payload?.synced_at)}</span>
                        {syncStatus?.running && <span className={styles.syncBadge}>동기화 진행중</span>}
                        {syncStatus?.running && syncStatus.started_at && <span>시작 {fmtTs(syncStatus.started_at)}</span>}
                        {syncStatus?.finished_at && !syncStatus.running && <span>완료 {fmtTs(syncStatus.finished_at)}</span>}
                    </div>
                </div>
                <div className={styles.actions}>
                    <div className={styles.segmented}>
                        <button className={activeTab === 'analytics' ? styles.segmentActive : ''} onClick={() => setActiveTab('analytics')}>분석</button>
                        <button className={activeTab === 'table' ? styles.segmentActive : ''} onClick={() => setActiveTab('table')}>테이블</button>
                    </div>
                    <button className={styles.ghostBtn} onClick={() => setShowSettings(true)}>설정</button>
                    <button className={styles.primaryBtn} onClick={() => syncNow({ force: true })} disabled={syncing}>{syncing ? '동기화 중' : 'NAS 동기화'}</button>
                </div>
            </div>

            {error && <div className={styles.errorBox}>{error}</div>}
            {notice && !error && <div className={styles.noticeBox}>{notice}</div>}

            {loading && !payload ? (
                <div className={styles.emptyState}>데이터를 불러오는 중입니다...</div>
            ) : activeTab === 'analytics' ? (
                <div className={styles.analytics}>
                    <section className={styles.monthlyReportSheet}>
                        <div className={styles.reportSheetTop}>
                            <div>
                                <h3>{reportTitleText}</h3>
                                <strong>통합 <span>IN/OUT-BOUND</span></strong>
                            </div>
                            <div>
                                <span>{monthRange || DEFAULT_MONTHLY_RANGE_HINT}</span>
                                <b>단위 : 원</b>
                            </div>
                        </div>
                        {reportOptions.length > 0 && (
                            <div className={styles.reportPeriodTabs}>
                                {reportOptions.map(report => (
                                    <button
                                        key={report.period}
                                        type="button"
                                        className={selectedReportPeriod === report.period ? styles.reportPeriodActive : ''}
                                        onClick={() => setSelectedReportPeriod(report.period)}
                                    >
                                        {report.label}
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
                                            <th>{reportPeriodText}</th>
                                            {reportGroups.map(group => <th key={group.name}>{group.name}</th>)}
                                            <th>매출합계</th>
                                            <th>이익율<br />(%)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className={styles.reportSectionRow}><td colSpan={reportColumnCount}>매 출</td></tr>
                                        {renderReportRow('순매출', 'netRevenue', 'netProfitRate')}
                                        {renderReportRow('순매입', 'netPurchase')}
                                        {renderReportRow('매출이익/순매출', 'netProfit')}
                                        {renderReportRow('매출(계산서)', 'invoiceRevenue', 'invoiceProfitRate')}
                                        {renderReportRow('매입(계산서)', 'invoicePurchase')}
                                        {renderReportRow('매출이익(계산서)', 'invoiceProfit')}
                                        <tr className={styles.reportSectionRow}><td colSpan={reportColumnCount}>이 월</td></tr>
                                        {renderReportRow('매출 이월', 'carryoverRevenue')}
                                        {renderReportRow('매입 이월', 'carryoverPurchase')}
                                        {renderReportRow('이월 차액', 'carryoverProfit')}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className={styles.reportSummaryStrip}>
                            <span>순매출 {formatPerformanceAmount(safeNumber(reportTotals.netRevenue) || totalRevenue)}</span>
                            <span>순매입 {formatPerformanceAmount(safeNumber(reportTotals.netPurchase) || totalPurchase)}</span>
                            <span>매출이익 {formatPerformanceAmount(safeNumber(reportTotals.netProfit) || totalProfit)}</span>
                            <span>이월금액 {formatPerformanceAmount(carryoverRevenue)}</span>
                            <span>손익률 {formatPercent(safeNumber(reportTotals.netProfitRate) || totalProfitRate, 2)}</span>
                        </div>
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
                            <h3>월별·일별 트리</h3>
                            <span>{daily.length.toLocaleString('ko-KR')}일 · 작업일자 기준</span>
                        </div>
                        {dailyTree.length === 0 ? (
                            <div className={styles.emptyPanel}>일별 원장 데이터를 아직 도출하지 못했습니다. 원본에 작업일자 컬럼이 있으면 동기화 후 자동 집계됩니다.</div>
                        ) : (
                            <div className={styles.dailyTree}>
                                <div className={styles.dailyTreeHead}>
                                    <span>월/일</span>
                                    <span>청구</span>
                                    <span>하불</span>
                                    <span>손익</span>
                                    <span>건수</span>
                                </div>
                                {dailyTree.map(item => (
                                    <div className={styles.dailyTreeGroup} key={item.period}>
                                        <button type="button" className={styles.dailyMonthRow} onClick={() => toggleDailyMonth(item.period)}>
                                            <span>{expandedDailyMonths.has(item.period) ? '접기' : '펼치기'} {item.period}</span>
                                            <strong>{formatPerformanceAmount(item.revenue)}</strong>
                                            <em>{formatPerformanceAmount(item.purchase)}</em>
                                            <b className={safeNumber(item.profit) < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(item.profit)}</b>
                                            <small>{safeNumber(item.rowCount).toLocaleString('ko-KR')}건</small>
                                        </button>
                                        {expandedDailyMonths.has(item.period) && (
                                            <div className={styles.dailyList}>
                                                {(item.days || []).map(day => (
                                                    <div className={styles.dailyRow} key={day.date}>
                                                        <span>{day.date}</span>
                                                        <strong>{formatPerformanceAmount(day.revenue)}</strong>
                                                        <em>{formatPerformanceAmount(day.purchase)}</em>
                                                        <b className={safeNumber(day.profit) < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(day.profit)}</b>
                                                        <small>{safeNumber(day.rowCount).toLocaleString('ko-KR')}건</small>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className={styles.panel}>
                        <div className={styles.panelHeader}>
                            <h3>세분화 분석</h3>
                            <span>청구·하불·손익·건수 기준</span>
                        </div>
                        <div className={styles.dimensionDiagram}>
                            <div>
                                <span>청구</span>
                                <strong>{formatPerformanceAmount(totalRevenue)}</strong>
                                <i style={{ width: `${Math.max(3, Math.min(100, Math.abs(totalRevenue) / diagramMax * 100))}%` }} />
                            </div>
                            <div>
                                <span>하불</span>
                                <strong>{formatPerformanceAmount(totalPurchase)}</strong>
                                <i style={{ width: `${Math.max(3, Math.min(100, Math.abs(totalPurchase) / diagramMax * 100))}%` }} />
                            </div>
                            <div>
                                <span>손익</span>
                                <strong className={totalProfit < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(totalProfit)}</strong>
                                <i style={{ width: `${Math.max(3, Math.min(100, Math.abs(totalProfit) / diagramMax * 100))}%` }} />
                            </div>
                            <div>
                                <span>이월</span>
                                <strong>{formatPerformanceAmount(carryoverRevenue)}</strong>
                                <i style={{ width: `${Math.max(3, Math.min(100, Math.abs(carryoverRevenue) / diagramMax * 100))}%` }} />
                            </div>
                        </div>
                        {dimensionSections.length === 0 ? (
                            <div className={styles.emptyPanel}>세분화 가능한 컬럼을 아직 찾지 못했습니다. 청구처, 작업지, 운송사, 구분, 픽업, 포트 컬럼이 있으면 동기화 후 자동 분석됩니다.</div>
                        ) : (
                            <>
                                <div className={styles.dimensionTabs}>
                                    {dimensionSections.map(section => (
                                        <button
                                            key={section.key}
                                            type="button"
                                            className={activeDimension?.key === section.key ? styles.dimensionTabActive : ''}
                                            onClick={() => setActiveDimensionKey(section.key)}
                                        >
                                            {section.label}
                                        </button>
                                    ))}
                                </div>
                                <div className={styles.dimensionSummary}>
                                    <span>대표 항목</span>
                                    <strong>{topDimensionItem?.name || '-'}</strong>
                                    <em>{topDimensionItem ? `${formatPerformanceAmount(topDimensionItem.revenue)} · ${safeNumber(topDimensionItem.rowCount).toLocaleString('ko-KR')}건` : '-'}</em>
                                </div>
                                <div className={styles.dimensionRows}>
                                    <div className={styles.dimensionHead}>
                                        <span>항목</span>
                                        <span>청구</span>
                                        <span>하불</span>
                                        <span>손익</span>
                                        <span>건수</span>
                                        <span>률</span>
                                    </div>
                                    {(activeDimension?.items || []).slice(0, 12).map(item => (
                                        <button
                                            type="button"
                                            className={styles.dimensionRow}
                                            key={`${activeDimension.key}-${item.name}`}
                                            onClick={() => openDetailSearch([item.name], 'and')}
                                        >
                                            <span>{item.name || '미분류'}</span>
                                            <strong>{formatPerformanceAmount(item.revenue)}</strong>
                                            <em>{formatPerformanceAmount(item.purchase)}</em>
                                            <b className={safeNumber(item.profit) < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(item.profit)}</b>
                                            <small>{safeNumber(item.rowCount).toLocaleString('ko-KR')}건</small>
                                            <i>{formatPercent(item.profitRate ?? profitRate(item), 1)}</i>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
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
