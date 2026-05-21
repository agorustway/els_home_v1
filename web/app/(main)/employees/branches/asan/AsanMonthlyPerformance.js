'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
const ANALYSIS_SCOPE_ALL = 'all';
const ANALYSIS_SCOPE_MONTH = 'month';
const ANALYSIS_SCOPE_WEEK = 'week';
const ANALYSIS_SCOPE_DAY = 'day';
const WEEKDAY_LABELS = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
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
    { key: 'sales', label: '매출', words: ['매출', '순매출', '운송수입', '청구금액'] },
    { key: 'client', label: '청구처별', words: ['청구처', '거래처', '화주', '업체', '고객', '상호'] },
    { key: 'work_site', label: '작업지별', words: ['작업지', '작업지명', '작업장', '현장', '상차지', '하차지', '출발지', '도착지'] },
    { key: 'payee', label: '지급처별', words: ['지급처', '운송사', '명의', '기사', '차주', '협력사', '배차처'] },
    { key: 'port', label: '포트별', words: ['포트명', '포트', '터미널', 'port', 'pod', 'pol'] },
    { key: 'carryover_type', label: '이월구분별', words: ['이월구분', '이월 구분', '이월', '전월', '차월'] },
    { key: 'shipping', label: '선적별', words: ['선적', '선사', '선명', '모선', '항차', 'vessel', 'voyage'] },
    { key: 'invoice', label: '계산서', words: ['계산서'] },
];
const DIMENSION_ORDER = [
    'sales',
    'client',
    'work_site',
    'payee',
    'port',
    'carryover_type',
    'shipping',
    'carryover_client',
    'invoice',
];
const EMPTY_LIST = Object.freeze([]);

class MonthlyAnalysisErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidUpdate(prevProps) {
        if (this.props.resetKey !== prevProps.resetKey && this.state.hasError) {
            this.setState({ hasError: false });
        }
    }

    render() {
        if (this.state.hasError) return this.props.fallback;
        return this.props.children;
    }
}

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

function safeObjectList(value) {
    const list = Array.isArray(value)
        ? value
        : (value && typeof value === 'object' ? Object.values(value) : EMPTY_LIST);
    return list.filter(item => item && typeof item === 'object');
}

function formatPercent(value, digits = 1) {
    return `${(Number(value) || 0).toLocaleString('ko-KR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })}%`;
}

function formatDimensionCount(item = {}) {
    const count = safeNumber(item.rowCount);
    return count ? `${count.toLocaleString('ko-KR')}건` : '-';
}

function profitRate(item = {}) {
    const revenue = safeNumber(item.revenue);
    return revenue ? (safeNumber(item.profit) / revenue) * 100 : 0;
}

function isMetricActive(item = {}) {
    if (!item || typeof item !== 'object') return false;
    return Boolean(
        safeNumber(item.rowCount)
        || safeNumber(item.revenue)
        || safeNumber(item.purchase)
        || safeNumber(item.profit),
    );
}

function metricSeries(item = {}, field) {
    return safeObjectList(item?.[field]);
}

function sumMetricItems(items = []) {
    return safeObjectList(items).reduce((sum, item) => ({
        revenue: sum.revenue + safeNumber(item.revenue),
        purchase: sum.purchase + safeNumber(item.purchase),
        profit: sum.profit + safeNumber(item.profit),
        rowCount: sum.rowCount + safeNumber(item.rowCount),
    }), { revenue: 0, purchase: 0, profit: 0, rowCount: 0 });
}

function aggregateFlowByYear(items = []) {
    const byYear = new Map();
    safeObjectList(items).filter(isMetricActive).forEach((item) => {
        const year = String(item.year || String(item.period || '').slice(0, 4) || '').trim();
        if (!year) return;
        const bucket = byYear.get(year) || {
            year,
            period: year,
            revenue: 0,
            purchase: 0,
            profit: 0,
            rowCount: 0,
        };
        bucket.revenue += safeNumber(item.revenue);
        bucket.purchase += safeNumber(item.purchase);
        bucket.profit += safeNumber(item.profit);
        bucket.rowCount += safeNumber(item.rowCount);
        byYear.set(year, bucket);
    });
    return Array.from(byYear.values()).sort((a, b) => String(a.year).localeCompare(String(b.year)));
}

function maxBy(items = [], key) {
    return safeObjectList(items).reduce((best, item) => (
        !best || safeNumber(item?.[key]) > safeNumber(best?.[key]) ? item : best
    ), null);
}

function metricWidth(value, max, minimum = 3) {
    const size = Math.abs(safeNumber(value));
    const base = Math.max(1, Math.abs(safeNumber(max)));
    if (!size) return '2%';
    return `${Math.max(minimum, Math.min(100, (size / base) * 100))}%`;
}

function metricDelta(current, previous, key) {
    if (!current || !previous) return { amount: 0, rate: 0 };
    const amount = safeNumber(current[key]) - safeNumber(previous[key]);
    const base = Math.abs(safeNumber(previous[key]));
    return {
        amount,
        rate: base ? (amount / base) * 100 : 0,
    };
}

function previousMetricItem(items = [], current = null, keyField = 'period') {
    if (!current) return null;
    const currentKey = String(current[keyField] || '');
    const list = safeObjectList(items);
    const index = list.findIndex(item => String(item?.[keyField] || '') === currentKey);
    return index > 0 ? list[index - 1] : null;
}

function scopedMetricFromSeries(item = {}, metric = {}, totalForShare = 0) {
    const revenue = safeNumber(metric.revenue);
    const purchase = safeNumber(metric.purchase);
    const profit = safeNumber(metric.profit);
    return {
        ...item,
        ...metric,
        label: item.label || metric.label || item.name,
        name: item.name || metric.name || item.label,
        revenue,
        purchase,
        profit,
        rowCount: safeNumber(metric.rowCount),
        profitRate: revenue ? Math.round((profit / revenue) * 10000) / 100 : 0,
        revenueShare: totalForShare ? Math.round((revenue / totalForShare) * 10000) / 100 : 0,
    };
}

function findScopedMetric(item = {}, scope, selectedMonth, selectedDay, selectedWeek) {
    if (scope === ANALYSIS_SCOPE_MONTH) {
        return metricSeries(item, 'monthly').find(metric => metric.period === selectedMonth) || null;
    }
    if (scope === ANALYSIS_SCOPE_WEEK) {
        const weekDates = selectedWeek?.dateSet;
        const weekDateOnly = selectedWeek?.dateOnlySet;
        const dailyMetrics = metricSeries(item, 'daily').filter((metric) => {
            const date = String(metric.date || '').trim();
            if (!date) return false;
            const period = String(metric.period || selectedWeek?.period || '').trim();
            return weekDates?.has(`${period}::${date}`) || (!metric.period && weekDateOnly?.has(date));
        });
        if (dailyMetrics.length) {
            return {
                ...sumMetricItems(dailyMetrics),
                period: selectedWeek?.period,
                date: selectedWeek?.key,
                label: selectedWeek?.label,
            };
        }
        return null;
    }
    if (scope === ANALYSIS_SCOPE_DAY) {
        const selectedDate = typeof selectedDay === 'object' ? selectedDay?.date : selectedDay;
        const selectedPeriod = typeof selectedDay === 'object' ? selectedDay?.period : String(selectedDay || '').slice(0, 7);
        const dailyMetric = metricSeries(item, 'daily').find(metric => (
            metric.date === selectedDate
            && (!metric.period || !selectedPeriod || metric.period === selectedPeriod)
        ));
        if (dailyMetric) return dailyMetric;
        return null;
    }
    return item;
}

function scopeMetricList(items = [], scope, selectedMonth, selectedDay, selectedWeek, totalForShare = 0, limit = 999) {
    const list = safeObjectList(items).map((item) => {
        if (scope === ANALYSIS_SCOPE_ALL) return item;
        const metric = findScopedMetric(item, scope, selectedMonth, selectedDay, selectedWeek);
        return metric ? scopedMetricFromSeries(item, metric, totalForShare) : null;
    }).filter(isMetricActive);
    return list
        .sort((a, b) => Math.abs(safeNumber(b.revenue)) - Math.abs(safeNumber(a.revenue)))
        .slice(0, limit);
}

function normalizeStrategicSegment(segment = {}) {
    if (segment.key === 'own_direct') {
        return { ...segment, label: 'ELS직계약차량', name: 'ELS직계약차량' };
    }
    if (segment.key === 'external_carrier') {
        return { ...segment, label: '외부/타운송사', name: '외부/타운송사' };
    }
    return null;
}

function vehicleCarrierLabel(vehicle = {}) {
    const label = String(vehicle.carriers || vehicle.carrier || vehicle.carrierName || vehicle.payee || '').split(',')[0]?.trim() || '';
    return label && label !== '-' ? label : '';
}

function vehicleDisplayName(vehicle = {}) {
    const vehicleNo = String(vehicle.vehicleNo || vehicle.name || '').trim();
    const carrier = vehicleCarrierLabel(vehicle);
    if (carrier && vehicleNo && !vehicleNo.startsWith(carrier)) return `${carrier} ${vehicleNo}`;
    return vehicleNo || carrier || '-';
}

function summarizeMonthlySlots(slots = []) {
    const normalized = safeObjectList(slots).map(normalizeSlot);
    const active = normalized.filter(slot => slot.enabled);
    const main = normalized.filter(slot => !slot.carryover);
    const carryover = normalized.filter(slot => slot.carryover);
    const range = normalized.length
        ? `${normalized[0].period} ~ ${normalized[normalized.length - 1].period}`
        : '-';
    const mainRange = main.length
        ? `${main[0].period} ~ ${main[main.length - 1].period}`
        : '-';
    const carryoverRange = carryover.length
        ? `${carryover[0].period} ~ ${carryover[carryover.length - 1].period}`
        : '없음';
    return {
        activeCount: active.length,
        carryoverCount: carryover.length,
        totalCount: normalized.length,
        range,
        mainRange,
        carryoverRange,
    };
}

function scopeDimensionSections(sections = [], scope, selectedMonth, selectedDay, selectedWeek, totalForShare = 0) {
    const safeSections = safeObjectList(sections)
        .map(section => ({ ...section, items: safeObjectList(section.items) }))
        .filter(section => section.items.length);
    if (scope === ANALYSIS_SCOPE_ALL) return safeSections;
    return safeSections
        .map(section => ({
            ...section,
            items: scopeMetricList(section.items || [], scope, selectedMonth, selectedDay, selectedWeek, totalForShare, 60),
        }))
        .filter(section => section.items.length);
}

function normalizeSlot(slot, baseYear = DEFAULT_MONTHLY_BASE_YEAR) {
    const year = Number.parseInt(slot.year, 10);
    const month = Number.parseInt(slot.month, 10);
    const period = slot.period || `${year}-${String(month).padStart(2, '0')}`;
    const parsedBaseYear = Number.parseInt(baseYear, 10);
    const basisYear = Number.isFinite(parsedBaseYear) ? parsedBaseYear : DEFAULT_MONTHLY_BASE_YEAR;
    const carryover = typeof slot.carryover === 'boolean'
        ? slot.carryover
        : year > basisYear;
    return {
        year,
        month,
        period,
        carryover,
        enabled: slot.enabled !== false,
        path: normalizePerformancePath(slot.path || ''),
        sheetName: slot.sheetName ?? slot.sheet_name ?? FIRST_SHEET_TOKEN,
        headerRow: slot.headerRow || slot.header_row || '',
    };
}

function mergeSavedSlots(baseYear, extraMonths, savedSlots = []) {
    const savedByPeriod = new Map((savedSlots || []).map(item => [item.period, item]));
    return buildMonthlyPerformanceFileSlots(baseYear, { extraMonths }).map((slot) => (
        normalizeSlot({ ...slot, ...(savedByPeriod.get(slot.period) || {}) }, baseYear)
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
    if (period === REPORT_ALL_KEY) return '전체';
    const match = String(period || '').match(/^(\d{4})-(\d{1,2})$/);
    if (!match) return period || '월간';
    return `${match[1]}년 ${Number(match[2])}월`;
}

function formatReportTitle(period) {
    if (period === REPORT_ALL_KEY) return '매출보고서';
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
    const validReports = safeObjectList(reports).filter(report => Array.isArray(report.groups) && report.groups.length);
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

function isHiddenDimensionColumn(value = '') {
    const compact = String(value || '').replace(/\s+/g, '').toLowerCase();
    if (!compact) return false;
    if (compact.includes('이월구분')) return false;
    if (compact.includes('odcy')) return true;
    if (compact === '구분' || compact === '구분별' || compact.endsWith('구분') || compact.endsWith('구분별') || compact.includes('작업구분') || compact.includes('운송구분')) return true;
    if (compact.includes('노선') || compact === '노선별' || compact === '라인' || compact === 'line' || compact.includes('route')) return true;
    if (compact.includes('계약') || compact === '계약별') return true;
    return false;
}

function normalizeDimensionSections(breakdowns = []) {
    const sections = safeObjectList(breakdowns)
        .map(section => ({ ...section, items: safeObjectList(section.items), label: section.column || '분류별' }))
        .filter(section => section.items.length)
        .filter(section => !isHiddenDimensionColumn(section.column || section.label));
    const selected = [];
    const used = new Set();

    DIMENSION_HINTS.forEach((hint) => {
        const match = sections.find((section, idx) => !used.has(idx) && hint.words.some((word) => {
            const column = String(section.column || section.label || '').toLowerCase();
            return column.includes(String(word).toLowerCase());
        }));
        if (!match) return;
        const idx = sections.indexOf(match);
        used.add(idx);
        selected.push({ ...match, key: hint.key, label: hint.label });
    });

    const extras = sections
        .map((section, idx) => ({ section, idx }))
        .filter(({ idx }) => !used.has(idx))
        .map(({ section, idx }) => ({
            ...section,
            key: `extra_${idx}_${String(section.column || 'dimension').replace(/\s+/g, '_')}`,
            label: String(section.column || section.label || '기타항목').endsWith('별')
                ? String(section.column || section.label || '기타항목')
                : `${section.column || section.label || '기타항목'}별`,
        }));

    const dedupedByLabel = new Map();
    [...selected, ...extras].forEach((section) => {
        const label = String(section.label || section.column || section.key || '').trim();
        const key = label || section.key;
        if (key) dedupedByLabel.set(key, section);
    });
    return Array.from(dedupedByLabel.values());
}

function buildReportDimensionSection(report = null, config = {}) {
    const groups = safeObjectList(report?.groups);
    if (!groups.length) return null;
    const {
        key,
        label,
        revenueKey,
        purchaseKey,
        profitKey,
        rateKey,
    } = config;
    const totalRevenue = safeNumber(report?.totals?.[revenueKey])
        || groups.reduce((sum, group) => sum + safeNumber(group[revenueKey]), 0);
    const items = groups.map((group) => {
        const revenue = safeNumber(group[revenueKey]);
        const purchase = safeNumber(group[purchaseKey]);
        const profit = safeNumber(group[profitKey] || revenue - purchase);
        return {
            name: group.name || '미분류',
            revenue,
            purchase,
            profit,
            rowCount: safeNumber(group.rowCount),
            profitRate: safeNumber(group[rateKey]) || (revenue ? Math.round((profit / revenue) * 10000) / 100 : 0),
            revenueShare: totalRevenue ? Math.round((revenue / totalRevenue) * 10000) / 100 : 0,
        };
    }).filter(isMetricActive).sort((a, b) => Math.abs(b.revenue) - Math.abs(a.revenue));
    if (!items.length) return null;
    return { key, label, column: label, items };
}

function buildReportDimensionSections(report = null) {
    return [
        buildReportDimensionSection(report, {
            key: 'sales',
            label: '매출',
            revenueKey: 'netRevenue',
            purchaseKey: 'netPurchase',
            profitKey: 'netProfit',
            rateKey: 'netProfitRate',
        }),
        buildReportDimensionSection(report, {
            key: 'invoice',
            label: '계산서',
            revenueKey: 'invoiceRevenue',
            purchaseKey: 'invoicePurchase',
            profitKey: 'invoiceProfit',
            rateKey: 'invoiceProfitRate',
        }),
    ].filter(Boolean);
}

function buildCarryoverDimensionSection(items = []) {
    const rows = safeObjectList(items);
    if (!rows.length) return null;
    const totalRevenue = rows.reduce((sum, item) => sum + safeNumber(item.carryoverRevenue), 0);
    const mapped = rows.map((item) => {
        const revenue = safeNumber(item.carryoverRevenue);
        const purchase = safeNumber(item.carryoverPurchase);
        const profit = safeNumber(item.carryoverProfit || revenue - purchase);
        return {
            name: item.name || '미분류',
            revenue,
            purchase,
            profit,
            rowCount: 0,
            profitRate: revenue ? Math.round((profit / revenue) * 10000) / 100 : 0,
            revenueShare: totalRevenue ? Math.round((revenue / totalRevenue) * 10000) / 100 : 0,
        };
    }).filter(isMetricActive).sort((a, b) => Math.abs(b.revenue) - Math.abs(a.revenue));
    if (!mapped.length) return null;
    return {
        key: 'carryover_client',
        label: '이월(청구처기준)',
        column: '이월(청구처기준)',
        items: mapped,
    };
}

function mergeDimensionSections(baseSections = [], reportSections = [], carryoverSection = null) {
    const byKey = new Map();
    safeObjectList(baseSections).forEach((section) => {
        if (section.key) byKey.set(section.key, section);
    });
    safeObjectList(reportSections).forEach((section) => {
        if (section.key) byKey.set(section.key, section);
    });
    if (carryoverSection?.key) byKey.set(carryoverSection.key, carryoverSection);
    const ordered = DIMENSION_ORDER.map(key => byKey.get(key)).filter(Boolean);
    const remaining = Array.from(byKey.values()).filter(section => !DIMENSION_ORDER.includes(section.key));
    return [...ordered, ...remaining];
}

function normalizeDailyOption(item = {}, index = 0) {
    const date = String(item.date || '').trim();
    const period = String(item.period || '').trim();
    const scopeKey = `${period || '마감월미지정'}::${date || index}`;
    return {
        ...item,
        date,
        period,
        scopeKey,
        label: period && date ? `${period} · ${date}` : (date || period || `일자 ${index + 1}`),
    };
}

function shortMonthLabel(period = '') {
    const match = String(period || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return period || '-';
    return `${match[1].slice(2)}.${match[2]}`;
}

function shortDateLabel(dateText = '') {
    const match = String(dateText || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return dateText || '-';
    return `${Number(match[3])}일`;
}

function shortDateRangeLabel(rangeLabel = '') {
    return String(rangeLabel || '')
        .split('~')
        .map(part => shortDateLabel(part.trim()))
        .join('~');
}

function shortWeekOptionLabel(item = {}) {
    const week = Number(item.weekIndex) || 0;
    const range = shortDateRangeLabel(item.rangeLabel);
    return `${week ? `${week}주` : (item.label || '주차')}${range ? ` ${range}` : ''}`;
}

function shortDayOptionLabel(item = {}) {
    const day = shortDateLabel(item.date);
    return item.label && item.label !== item.date ? `${day}` : day;
}

function buildWeekBuckets(daily = []) {
    const byPeriod = new Map();
    safeObjectList(daily).filter(isMetricActive).map(normalizeDailyOption).forEach((item) => {
        if (!item.period || !item.date) return;
        if (!byPeriod.has(item.period)) byPeriod.set(item.period, []);
        byPeriod.get(item.period).push(item);
    });

    const buckets = [];
    Array.from(byPeriod.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .forEach(([period, days]) => {
            const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
            sortedDays.forEach((day, index) => {
                const weekIndex = Math.floor(index / 7) + 1;
                const key = `${period}-W${String(weekIndex).padStart(2, '0')}`;
                let bucket = buckets.find(item => item.key === key);
                if (!bucket) {
                    bucket = {
                        key,
                        period,
                        weekIndex,
                        label: `${period} ${weekIndex}주차`,
                        revenue: 0,
                        purchase: 0,
                        profit: 0,
                        rowCount: 0,
                        days: [],
                        dateSet: new Set(),
                        dateOnlySet: new Set(),
                    };
                    buckets.push(bucket);
                }
                bucket.days.push(day);
                bucket.dateSet.add(day.scopeKey);
                bucket.dateOnlySet.add(day.date);
                bucket.revenue += safeNumber(day.revenue);
                bucket.purchase += safeNumber(day.purchase);
                bucket.profit += safeNumber(day.profit);
                bucket.rowCount += safeNumber(day.rowCount);
            });
        });

    return buckets.map((bucket) => {
        const first = bucket.days[0]?.date || '';
        const last = bucket.days[bucket.days.length - 1]?.date || '';
        return {
            ...bucket,
            rangeLabel: first && last && first !== last ? `${first}~${last}` : (first || last),
        };
    });
}

function buildWeekdayCards(daily = []) {
    const cards = WEEKDAY_LABELS.map((label, index) => ({
        key: String(index),
        label,
        revenue: 0,
        purchase: 0,
        profit: 0,
        rowCount: 0,
    }));
    safeObjectList(daily).filter(isMetricActive).forEach((item) => {
        const dateText = String(item.date || '').trim();
        const date = new Date(`${dateText}T00:00:00Z`);
        if (Number.isNaN(date.getTime())) return;
        const index = (date.getUTCDay() + 6) % 7;
        const bucket = cards[index];
        bucket.revenue += safeNumber(item.revenue);
        bucket.purchase += safeNumber(item.purchase);
        bucket.profit += safeNumber(item.profit);
        bucket.rowCount += safeNumber(item.rowCount);
    });
    return cards;
}

function carryoverClientItemsFromReport(report = null) {
    return safeObjectList(report?.groups)
        .map(group => ({
            name: group.name || '미분류',
            carryoverRevenue: safeNumber(group.carryoverRevenue),
            carryoverPurchase: safeNumber(group.carryoverPurchase),
            carryoverProfit: safeNumber(group.carryoverProfit || safeNumber(group.carryoverRevenue) - safeNumber(group.carryoverPurchase)),
        }))
        .filter(item => item.carryoverRevenue || item.carryoverPurchase || item.carryoverProfit)
        .sort((a, b) => Math.abs(b.carryoverRevenue) - Math.abs(a.carryoverRevenue));
}

function MetricDonut({ value = 0, max = 1, tone = 'revenue' }) {
    const size = 52;
    const radius = 22;
    const circumference = 2 * Math.PI * radius;
    const ratioValue = Math.max(0, Math.min(1, Math.abs(safeNumber(value)) / Math.max(1, Math.abs(safeNumber(max)))));
    const offset = circumference * (1 - ratioValue);
    return (
        <svg className={`${styles.metricDonut} ${styles[`metricDonut_${tone}`] || ''}`} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
            <circle cx="26" cy="26" r={radius} className={styles.metricDonutTrack} />
            <circle
                cx="26"
                cy="26"
                r={radius}
                className={styles.metricDonutValue}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
            />
        </svg>
    );
}

function MonthlyLedgerFlowChart({ items = [], scopeLabel = '-', basisLabel = '마감월', unitLabel = '건', highlightKey = '' }) {
    const series = safeObjectList(items)
        .filter(isMetricActive)
        .map(item => ({
            ...item,
            flowKey: item._scopeKey || item.key || item.scopeKey || item.date || item.period || item.label || '',
            isSelected: Boolean(item.isSelected || (highlightKey && [item._scopeKey, item.key, item.scopeKey, item.date, item.period].includes(highlightKey))),
            displayLabel: item.scopeLabel || item.label || item.period || item.date || item.key || '-',
        }));
    const width = 640;
    const height = 172;
    const pad = { left: 16, right: 18, top: 26, bottom: 18 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const totals = sumMetricItems(series);
    const avgRevenue = series.length ? totals.revenue / series.length : 0;
    const avgPurchase = series.length ? totals.purchase / series.length : 0;
    const avgProfit = series.length ? totals.profit / series.length : 0;
    const values = series.flatMap(item => [safeNumber(item.revenue), safeNumber(item.purchase), safeNumber(item.profit)]);
    const maxValue = Math.max(1, ...values);
    const minValue = Math.min(0, ...values);
    const valueRange = Math.max(1, maxValue - minValue);
    const xAt = idx => pad.left + (series.length <= 1 ? chartW / 2 : (idx / (series.length - 1)) * chartW);
    const yAt = value => pad.top + ((maxValue - safeNumber(value)) / valueRange) * chartH;
    const toPoints = field => series.map((item, idx) => `${xAt(idx).toFixed(1)},${yAt(item[field]).toFixed(1)}`).join(' ');
    const revenuePoints = toPoints('revenue');
    const purchasePoints = toPoints('purchase');
    const profitPoints = toPoints('profit');
    const baselineY = yAt(0);
    const revenueArea = series.length
        ? `${xAt(0).toFixed(1)},${baselineY.toFixed(1)} ${revenuePoints} ${xAt(series.length - 1).toFixed(1)},${baselineY.toFixed(1)}`
        : '';
    const start = series[0]?.displayLabel || '-';
    const end = series[series.length - 1]?.displayLabel || '-';
    const high = maxBy(series, 'revenue');
    const highIdx = Math.max(0, series.indexOf(high));
    const last = series[series.length - 1] || null;
    const previous = series.length >= 2 ? series[series.length - 2] : null;
    const recentDelta = last && previous ? safeNumber(last.revenue) - safeNumber(previous.revenue) : 0;
    const recentDeltaRate = previous?.revenue ? (recentDelta / Math.abs(previous.revenue)) * 100 : 0;
    const lastIdx = Math.max(0, series.length - 1);
    const grid = [0.25, 0.5, 0.75].map(ratio => pad.top + chartH * ratio);
    const axisStep = series.length <= 8 ? 1 : Math.ceil(series.length / 7);
    const axisLabels = series.map((item, idx) => ({
        label: item.displayLabel,
        visible: item.isSelected || idx === 0 || idx === series.length - 1 || idx % axisStep === 0,
    }));
    const pointLabelStep = series.length <= 7 ? 1 : Math.ceil(series.length / 6);
    const pointLabels = series.map((item, idx) => ({
        item,
        idx,
        x: xAt(idx),
        y: yAt(item.revenue),
        anchor: idx === 0 ? 'start' : (idx === series.length - 1 ? 'end' : 'middle'),
    })).filter(point => point.item.isSelected || point.idx === 0 || point.idx === lastIdx || point.idx === highIdx || point.idx % pointLabelStep === 0)
        .map(point => ({
            ...point,
            xPercent: Math.max(1, Math.min(99, (point.x / width) * 100)),
            yPercent: Math.max(8, Math.min(92, ((point.y < 44 ? point.y + 16 : point.y - 10) / height) * 100)),
            anchorClass: point.anchor === 'start' ? styles.monthlyTrendDataLabelLeft : (point.anchor === 'end' ? styles.monthlyTrendDataLabelRight : ''),
            placeClass: point.y < 44 ? styles.monthlyTrendDataLabelBelow : '',
        }));
    const avgRevenueYPercent = Math.max(8, Math.min(84, ((yAt(avgRevenue) - 6) / height) * 100));

    return (
        <section className={`${styles.panel} ${styles.monthlyTrendPanel}`}>
            <div className={styles.monthlyTrendHeader}>
                <div>
                    <h3>누적</h3>
                    <span>{start} ~ {end} · {scopeLabel} · {basisLabel} 기준</span>
                </div>
                <div className={styles.monthlyTrendLegend}>
                    <span><i className={styles.revenueDot} />청구</span>
                    <span><i className={styles.purchaseDot} />하불</span>
                    <span><i className={styles.profitDot} />손익</span>
                </div>
            </div>
            {series.length === 0 ? (
                <div className={styles.emptyPanel}>선택 범위의 누적 데이터를 아직 그릴 수 없습니다.</div>
            ) : (
                <>
                    <div className={styles.monthlyTrendChartShell}>
                        <div className={styles.monthlyTrendGraph}>
                            <svg
                                className={styles.monthlyTrendSvg}
                                viewBox={`0 0 ${width} ${height}`}
                                preserveAspectRatio="none"
                                role="img"
                                aria-label="누적 차트"
                            >
                                <defs>
                                    <linearGradient id="monthlyTrendRevenueArea" x1="0" x2="0" y1="0" y2="1">
                                        <stop offset="0%" stopColor="#0f766e" stopOpacity="0.18" />
                                        <stop offset="100%" stopColor="#0f766e" stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                                {grid.map(y => (
                                    <line key={y} x1={pad.left} x2={pad.left + chartW} y1={y} y2={y} className={styles.monthlyTrendGridLine} />
                                ))}
                                <line x1={pad.left} x2={pad.left + chartW} y1={baselineY} y2={baselineY} className={styles.zeroLine} />
                                {revenueArea && <polygon points={revenueArea} className={styles.monthlyTrendRevenueArea} style={{ fill: 'url(#monthlyTrendRevenueArea)' }} />}
                                <line x1={pad.left} x2={pad.left + chartW} y1={yAt(avgRevenue)} y2={yAt(avgRevenue)} className={styles.monthlyTrendRevenueAvgLine} />
                                <line x1={pad.left} x2={pad.left + chartW} y1={yAt(avgPurchase)} y2={yAt(avgPurchase)} className={styles.monthlyTrendPurchaseAvgLine} />
                                <line x1={pad.left} x2={pad.left + chartW} y1={yAt(avgProfit)} y2={yAt(avgProfit)} className={styles.monthlyTrendProfitAvgLine} />
                                <polyline points={revenuePoints} className={styles.monthlyTrendRevenueLine} />
                                <polyline points={purchasePoints} className={styles.monthlyTrendPurchaseLine} />
                                <polyline points={profitPoints} className={styles.monthlyTrendProfitLine} />
                                {series.map((item, idx) => (
                                    <g key={`${item.flowKey || item.displayLabel}-${idx}`}>
                                        <circle cx={xAt(idx)} cy={yAt(item.revenue)} r={item.isSelected ? '5.4' : (idx === highIdx ? '4.6' : '3.6')} className={`${styles.monthlyTrendRevenuePoint} ${item.isSelected ? styles.monthlyTrendPointActive : ''}`} />
                                        <circle cx={xAt(idx)} cy={yAt(item.purchase)} r={item.isSelected ? '4.4' : '3.2'} className={`${styles.monthlyTrendPurchasePoint} ${item.isSelected ? styles.monthlyTrendPointActive : ''}`} />
                                        <circle cx={xAt(idx)} cy={yAt(item.profit)} r={item.isSelected ? '4.4' : '3.2'} className={`${styles.monthlyTrendProfitPoint} ${item.isSelected ? styles.monthlyTrendPointActive : ''}`} />
                                    </g>
                                ))}
                            </svg>
                            <div
                                className={styles.monthlyTrendAvgBadge}
                                style={{ top: `${avgRevenueYPercent}%` }}
                            >
                                <span>청구평균</span>
                                <strong>{formatPerformanceAmount(avgRevenue)}</strong>
                            </div>
                            {pointLabels.map(point => (
                                <div
                                    key={`label-${point.item.displayLabel}-${point.idx}`}
                                    className={`${styles.monthlyTrendDataLabel} ${point.anchorClass} ${point.placeClass}`}
                                    style={{ left: `${point.xPercent}%`, top: `${point.yPercent}%` }}
                                >
                                    <strong>{formatPerformanceAmount(point.item.revenue)}</strong>
                                    <span>{safeNumber(point.item.rowCount).toLocaleString('ko-KR')}건</span>
                                </div>
                            ))}
                        </div>
                        <div
                            className={styles.monthlyTrendAxis}
                            style={{ gridTemplateColumns: `repeat(${Math.max(1, series.length)}, minmax(0, 1fr))` }}
                        >
                            {axisLabels.map((item, idx) => (
                                <span
                                    key={`${item.label}-${idx}`}
                                    className={!item.visible ? styles.monthlyTrendAxisBlank : ''}
                                    aria-hidden={!item.visible}
                                >
                                    {item.visible ? item.label : ''}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className={styles.monthlyTrendStats}>
                        <div><span>최고 청구</span><strong>{high?.displayLabel || '-'}</strong><em>{high ? formatPerformanceAmount(high.revenue) : '-'}</em></div>
                        <div><span>최근 항목</span><strong>{last?.displayLabel || '-'}</strong><em>{last ? formatPerformanceAmount(last.revenue) : '-'}</em></div>
                        <div><span>평균 청구</span><strong>{formatPerformanceAmount(avgRevenue)}</strong><em>{formatPerformanceAmount(avgProfit)} 손익</em></div>
                        <div><span>누적 청구</span><strong>{formatPerformanceAmount(totals.revenue)}</strong><em>{series.length.toLocaleString('ko-KR')}{unitLabel} · {totals.rowCount.toLocaleString('ko-KR')}건</em></div>
                        <div>
                            <span>최근 증감</span>
                            <strong className={recentDelta < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(recentDelta)}</strong>
                            <em>{formatPercent(recentDeltaRate, 1)}</em>
                        </div>
                    </div>
                </>
            )}
        </section>
    );
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
    const [analysisScope, setAnalysisScope] = useState(ANALYSIS_SCOPE_ALL);
    const [selectedAnalysisMonth, setSelectedAnalysisMonth] = useState('');
    const [selectedAnalysisWeek, setSelectedAnalysisWeek] = useState('');
    const [selectedAnalysisDay, setSelectedAnalysisDay] = useState('');
    const [activeDimensionKey, setActiveDimensionKey] = useState('');
    const [expandedDimensionKeys, setExpandedDimensionKeys] = useState(new Set());
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
    const searchEffectReadyRef = useRef(false);

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
            const tableMode = activeTab === 'table' || append;
            const effectiveSearch = tableMode ? (options.search ?? searchTerm) : '';
            if (effectiveSearch) {
                params.set('search', effectiveSearch);
                params.set('search_mode', options.searchMode || searchMode || 'or');
            }
            const sortKey = tableMode ? (options.sortKey ?? sortConfig.key) : '';
            const sortDir = tableMode ? (options.sortDir ?? sortConfig.direction) : 'asc';
            if (sortKey) {
                params.set('sort_key', sortKey);
                params.set('sort_dir', sortDir || 'asc');
            }
            const dashboard = options.dashboard ?? (!tableMode && page === 1);
            if (dashboard) {
                params.set('dashboard', '1');
                params.set('page_size', '1');
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
    }, [activeTab, applyPayload, baseYear, extraMonths, searchMode, searchTerm, sortConfig]);

    useEffect(() => {
        fetchData();
    }, [baseYear, extraMonths, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const timer = setTimeout(() => setSearchTerm(searchInput.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        if (!searchEffectReadyRef.current) {
            searchEffectReadyRef.current = true;
            return;
        }
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
        const timer = setTimeout(fetchSyncStatus, 900);
        return () => clearTimeout(timer);
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
    const settingsSlotSummary = useMemo(() => summarizeMonthlySlots(fileSlots), [fileSlots]);
    const settingsPreviewSummary = useMemo(() => (
        summarizeMonthlySlots(buildMonthlyPerformanceFileSlots(baseYear, { extraMonths }))
    ), [baseYear, extraMonths]);
    const monthly = safeObjectList(summary.monthly);
    const daily = safeObjectList(summary.daily);
    const monthlyReports = safeObjectList(summary.monthlyReports);
    const allReport = useMemo(() => aggregateMonthlyReports(monthlyReports), [monthlyReports]);
    const reportOptions = useMemo(() => (
        allReport ? [{ period: REPORT_ALL_KEY, label: '전체' }, ...monthlyReports.map(report => ({ period: report.period, label: report.period }))] : []
    ), [allReport, monthlyReports]);
    const dimensionSections = useMemo(() => normalizeDimensionSections(summary.breakdowns || []), [summary.breakdowns]);
    const totalRows = Number(payload?.total ?? rows.length) || 0;
    const loadedRows = rows.length;
    const canLoadMore = payload?.source === 'supabase' && loadedRows < totalRows;
    const totalRowsLabel = `${totalRows.toLocaleString()}${payload?.total_is_estimated ? '+' : ''}`;
    const visibleColumns = useMemo(() => {
        const hidden = hiddenCols instanceof Set ? hiddenCols : new Set(hiddenCols || []);
        return normalizePerformanceColumnOrder(colOrder, headers).filter(col => !hidden.has(col));
    }, [colOrder, headers, hiddenCols]);
    const availableMonths = useMemo(() => monthly.filter(isMetricActive), [monthly]);
    const availableDays = useMemo(() => daily
        .filter(isMetricActive)
        .map(normalizeDailyOption)
        .sort((a, b) => String(a.period || '').localeCompare(String(b.period || '')) || String(a.date || '').localeCompare(String(b.date || ''))), [daily]);
    const availableWeeks = useMemo(() => buildWeekBuckets(availableDays), [availableDays]);
    const fallbackAnalysisMonthValue = availableMonths[availableMonths.length - 1]?.period || '';
    const activeAnalysisMonthValue = availableMonths.some(item => item.period === selectedAnalysisMonth)
        ? selectedAnalysisMonth
        : fallbackAnalysisMonthValue;
    const monthWeeks = useMemo(() => (
        availableWeeks.filter(item => item.period === activeAnalysisMonthValue)
    ), [activeAnalysisMonthValue, availableWeeks]);
    const monthDays = useMemo(() => (
        availableDays.filter(item => item.period === activeAnalysisMonthValue)
    ), [activeAnalysisMonthValue, availableDays]);
    const fallbackAnalysisWeekValue = monthWeeks[monthWeeks.length - 1]?.key || '';
    const fallbackAnalysisDayValue = monthDays[monthDays.length - 1]?.scopeKey || '';
    const activeAnalysisWeekValue = monthWeeks.some(item => item.key === selectedAnalysisWeek)
        ? selectedAnalysisWeek
        : fallbackAnalysisWeekValue;
    const activeAnalysisWeek = monthWeeks.find(item => item.key === activeAnalysisWeekValue) || null;
    const activeAnalysisDayValue = monthDays.some(item => item.scopeKey === selectedAnalysisDay)
        ? selectedAnalysisDay
        : fallbackAnalysisDayValue;
    const activeAnalysisDay = monthDays.find(item => item.scopeKey === activeAnalysisDayValue) || null;
    const scopedMonthly = useMemo(() => {
        if (analysisScope === ANALYSIS_SCOPE_MONTH) return monthly.filter(item => item.period === activeAnalysisMonthValue && isMetricActive(item));
        if (analysisScope === ANALYSIS_SCOPE_WEEK) return monthly.filter(item => item.period === activeAnalysisWeek?.period && isMetricActive(item));
        if (analysisScope === ANALYSIS_SCOPE_DAY) {
            const dayMonth = activeAnalysisDay?.period || String(activeAnalysisDay?.date || '').slice(0, 7);
            return monthly.filter(item => item.period === dayMonth && isMetricActive(item));
        }
        return monthly.filter(isMetricActive);
    }, [activeAnalysisDay, activeAnalysisMonthValue, activeAnalysisWeek, analysisScope, monthly]);
    const scopedDaily = useMemo(() => {
        if (analysisScope === ANALYSIS_SCOPE_MONTH) return monthDays;
        if (analysisScope === ANALYSIS_SCOPE_WEEK) return monthDays.filter(item => activeAnalysisWeek?.dateSet?.has(item.scopeKey));
        if (analysisScope === ANALYSIS_SCOPE_DAY) return monthDays.filter(item => item.scopeKey === activeAnalysisDayValue);
        return availableDays;
    }, [activeAnalysisDayValue, activeAnalysisWeek, analysisScope, availableDays, monthDays]);
    const monthRange = monthly.length ? `${monthly[0].period} ~ ${monthly[monthly.length - 1].period}` : DEFAULT_MONTHLY_RANGE_HINT;
    const scopedMonthRange = scopedMonthly.length ? `${scopedMonthly[0].period} ~ ${scopedMonthly[scopedMonthly.length - 1].period}` : monthRange;
    const totalRevenue = safeNumber(summary.totalRevenue);
    const totalPurchase = safeNumber(summary.totalPurchase);
    const totalProfit = safeNumber(summary.totalProfit);
    const totalProfitRate = totalRevenue ? (totalProfit / totalRevenue) * 100 : 0;
    const analysisRows = safeNumber(summary.analysisRows) || totalRows;
    const scopedTotals = analysisScope === ANALYSIS_SCOPE_ALL
        ? { revenue: totalRevenue, purchase: totalPurchase, profit: totalProfit, rowCount: analysisRows }
        : sumMetricItems([ANALYSIS_SCOPE_WEEK, ANALYSIS_SCOPE_DAY].includes(analysisScope) ? scopedDaily : scopedMonthly);
    const scopeRevenue = safeNumber(scopedTotals.revenue);
    const scopePurchase = safeNumber(scopedTotals.purchase);
    const scopeProfit = safeNumber(scopedTotals.profit);
    const scopeRows = safeNumber(scopedTotals.rowCount);
    const scopeProfitRate = scopeRevenue ? (scopeProfit / scopeRevenue) * 100 : 0;
    const selectedScopePeriod = analysisScope === ANALYSIS_SCOPE_MONTH
        ? activeAnalysisMonthValue
        : (analysisScope === ANALYSIS_SCOPE_WEEK
            ? (activeAnalysisWeek?.period || '')
            : (analysisScope === ANALYSIS_SCOPE_DAY ? (activeAnalysisDay?.period || String(activeAnalysisDay?.date || '').slice(0, 7)) : ''));
    const selectedReport = selectedReportPeriod === REPORT_ALL_KEY
        ? allReport
        : (monthlyReports.find(item => item.period === selectedReportPeriod) || allReport || monthlyReports[monthlyReports.length - 1] || null);
    const reportGroups = Array.isArray(selectedReport?.groups) ? selectedReport.groups : EMPTY_LIST;
    const reportTotals = selectedReport?.totals || {};
    const reportCarryover = selectedReport?.carryover || summary.carryover || {};
    const scopeReport = selectedScopePeriod ? monthlyReports.find(report => report.period === selectedScopePeriod) : null;
    const scopeCarryover = analysisScope === ANALYSIS_SCOPE_ALL
        ? (allReport?.carryover || summary.carryover || {})
        : (analysisScope === ANALYSIS_SCOPE_MONTH ? (scopeReport?.carryover || {}) : {});
    const carryoverRevenue = safeNumber(scopeCarryover.revenue);
    const carryoverClientReport = analysisScope === ANALYSIS_SCOPE_ALL ? allReport : (scopeReport || null);
    const carryoverClientItems = useMemo(() => carryoverClientItemsFromReport(carryoverClientReport), [carryoverClientReport]);
    const reportDimensionSource = analysisScope === ANALYSIS_SCOPE_ALL ? allReport : (analysisScope === ANALYSIS_SCOPE_MONTH ? scopeReport : null);
    const reportDimensionSections = useMemo(() => buildReportDimensionSections(reportDimensionSource), [reportDimensionSource]);
    const carryoverDimensionSection = useMemo(() => buildCarryoverDimensionSection(carryoverClientItems), [carryoverClientItems]);
    const reportCarryoverRevenue = safeNumber(reportCarryover.revenue);
    const reportPeriodText = selectedReport?.period === REPORT_ALL_KEY ? '전체' : formatReportPeriod(selectedReport?.period || selectedReportPeriod);
    const reportTitleText = selectedReportPeriod === REPORT_ALL_KEY ? '매출보고서' : formatReportTitle(selectedReport?.period || selectedReportPeriod);
    const reportColumnCount = reportGroups.length + 3;
    const diagramMax = Math.max(1, Math.abs(scopeRevenue), Math.abs(scopePurchase), Math.abs(scopeProfit), Math.abs(carryoverRevenue));
    const reportTableReady = Boolean(selectedReport && reportGroups.length);
    const scopeFlowItems = useMemo(() => {
        if (analysisScope === ANALYSIS_SCOPE_MONTH) {
            return monthWeeks
                .filter(isMetricActive)
                .map(item => ({
                    ...item,
                    scopeLabel: `${Number(item.weekIndex) || '-'}주차`,
                    _scopeKey: item.key,
                    period: item.period,
                }));
        }
        if (analysisScope === ANALYSIS_SCOPE_WEEK) {
            return monthDays
                .filter(item => activeAnalysisWeek?.dateSet?.has(item.scopeKey))
                .map(item => ({
                    ...item,
                    scopeLabel: shortDateLabel(item.date),
                    _scopeKey: item.scopeKey || item.date,
                }));
        }
        if (analysisScope === ANALYSIS_SCOPE_DAY) {
            return scopedDaily.map(item => ({
                ...item,
                scopeLabel: shortDateLabel(item.date),
                _scopeKey: item.scopeKey || item.date,
            }));
        }
        return aggregateFlowByYear(scopedMonthly).map(item => ({
            ...item,
            scopeLabel: `${item.year}년`,
            _scopeKey: item.year,
        }));
    }, [activeAnalysisWeek, analysisScope, monthDays, monthWeeks, scopedDaily, scopedMonthly]);
    const scopeFlowRange = scopeFlowItems.length
        ? `${scopeFlowItems[0].scopeLabel || '-'} ~ ${scopeFlowItems[scopeFlowItems.length - 1].scopeLabel || '-'}`
        : scopedMonthRange;
    const scopeFlowBasisLabel = analysisScope === ANALYSIS_SCOPE_ALL ? '연도' : (analysisScope === ANALYSIS_SCOPE_MONTH ? '주차' : '작업일자');
    const scopeFlowUnitLabel = analysisScope === ANALYSIS_SCOPE_ALL ? '년' : (analysisScope === ANALYSIS_SCOPE_MONTH ? '주' : '일');
    const latestFlowItem = [...scopeFlowItems].reverse().find(isMetricActive) || null;
    const previousFlowItem = previousMetricItem(scopeFlowItems, latestFlowItem, '_scopeKey');
    const bestRevenueItem = maxBy(scopeFlowItems, 'revenue');
    const bestProfitItem = maxBy(scopeFlowItems, 'profit');
    const revenueDelta = metricDelta(latestFlowItem, previousFlowItem, 'revenue');
    const avgRevenuePerJob = scopeRows ? scopeRevenue / scopeRows : 0;
    const carryoverRate = scopeRevenue ? (carryoverRevenue / scopeRevenue) * 100 : 0;
    const segmentItems = safeObjectList(summary.strategicSegments)
        .map(normalizeStrategicSegment)
        .filter(Boolean);
    const scopedSegmentItems = scopeMetricList(segmentItems, analysisScope, activeAnalysisMonthValue, activeAnalysisDay, activeAnalysisWeek, scopeRevenue, 2);
    const scopedBreakdownDimensionSections = useMemo(() => (
        scopeDimensionSections(dimensionSections, analysisScope, activeAnalysisMonthValue, activeAnalysisDay, activeAnalysisWeek, scopeRevenue)
    ), [activeAnalysisDay, activeAnalysisMonthValue, activeAnalysisWeek, analysisScope, dimensionSections, scopeRevenue]);
    const scopedDimensionSections = useMemo(() => (
        mergeDimensionSections(scopedBreakdownDimensionSections, reportDimensionSections, carryoverDimensionSection)
    ), [carryoverDimensionSection, reportDimensionSections, scopedBreakdownDimensionSections]);
    const activeDimension = scopedDimensionSections.find(section => section.key === activeDimensionKey) || scopedDimensionSections[0] || null;
    const activeDimensionItems = safeObjectList(activeDimension?.items);
    const activeDimensionExpanded = Boolean(activeDimension?.key && expandedDimensionKeys.has(activeDimension.key));
    const visibleDimensionItems = activeDimensionExpanded ? activeDimensionItems : activeDimensionItems.slice(0, 12);
    const topDimensionItem = activeDimensionItems[0] || null;
    const scopedVehicleItems = scopeMetricList(safeObjectList(summary.vehiclePerformance), analysisScope, activeAnalysisMonthValue, activeAnalysisDay, activeAnalysisWeek, scopeRevenue, 999);
    const visibleVehicles = scopedVehicleItems.slice(0, 10);
    const segmentMax = Math.max(1, ...scopedSegmentItems.map(item => Math.abs(safeNumber(item.revenue))));
    const vehicleMax = Math.max(1, ...scopedVehicleItems.map(item => Math.abs(safeNumber(item.revenue))));
    const chartMax = getPerformanceChartMax(scopeFlowItems, ['revenue', 'purchase', 'profit']);
    const weekdayCards = useMemo(() => buildWeekdayCards(scopedDaily), [scopedDaily]);
    const weekdayMax = Math.max(1, ...weekdayCards.map(item => Math.abs(safeNumber(item.revenue))));
    const scopeLabel = analysisScope === ANALYSIS_SCOPE_MONTH
        ? `월별 ${activeAnalysisMonthValue || '-'}`
        : (analysisScope === ANALYSIS_SCOPE_WEEK
            ? `주간 ${activeAnalysisWeek?.label || '-'}`
            : (analysisScope === ANALYSIS_SCOPE_DAY ? `일별 ${activeAnalysisDay?.date || '-'}` : '전체'));
    const scopeBasisLabel = [ANALYSIS_SCOPE_WEEK, ANALYSIS_SCOPE_DAY].includes(analysisScope) ? '작업일자' : '마감월';
    const monthSelectDisabled = analysisScope === ANALYSIS_SCOPE_ALL || !availableMonths.length;
    const weekSelectDisabled = analysisScope !== ANALYSIS_SCOPE_WEEK || !monthWeeks.length;
    const daySelectDisabled = analysisScope !== ANALYSIS_SCOPE_DAY || !monthDays.length;
    const analysisResetKey = `${analysisScope}:${activeAnalysisMonthValue}:${activeAnalysisWeekValue}:${activeAnalysisDayValue}:${totalRows}:${payload?.synced_at || ''}`;
    const changeAnalysisScope = (nextScope) => {
        if (nextScope === ANALYSIS_SCOPE_MONTH && !activeAnalysisMonthValue) return;
        if (nextScope === ANALYSIS_SCOPE_WEEK && !activeAnalysisWeekValue) return;
        if (nextScope === ANALYSIS_SCOPE_DAY && !activeAnalysisDayValue) return;
        if (nextScope === ANALYSIS_SCOPE_MONTH) setSelectedAnalysisMonth(activeAnalysisMonthValue);
        if (nextScope === ANALYSIS_SCOPE_WEEK) setSelectedAnalysisWeek(activeAnalysisWeekValue);
        if (nextScope === ANALYSIS_SCOPE_DAY) setSelectedAnalysisDay(activeAnalysisDayValue);
        setAnalysisScope(nextScope);
    };

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
        const latest = availableMonths[availableMonths.length - 1]?.period || '';
        if (latest && (!selectedAnalysisMonth || !availableMonths.some(item => item.period === selectedAnalysisMonth))) {
            setSelectedAnalysisMonth(latest);
        }
    }, [availableMonths, selectedAnalysisMonth]);

    useEffect(() => {
        const latest = monthWeeks[monthWeeks.length - 1]?.key || '';
        if (latest && (!selectedAnalysisWeek || !monthWeeks.some(item => item.key === selectedAnalysisWeek))) {
            setSelectedAnalysisWeek(latest);
        }
    }, [monthWeeks, selectedAnalysisWeek]);

    useEffect(() => {
        const latest = monthDays[monthDays.length - 1]?.scopeKey || '';
        if (latest && (!selectedAnalysisDay || !monthDays.some(item => item.scopeKey === selectedAnalysisDay))) {
            setSelectedAnalysisDay(latest);
        }
    }, [monthDays, selectedAnalysisDay]);

    useEffect(() => {
        if (!scopedDimensionSections.length) return;
        if (!activeDimensionKey || !scopedDimensionSections.some(section => section.key === activeDimensionKey)) {
            setActiveDimensionKey(scopedDimensionSections[0].key);
        }
    }, [activeDimensionKey, scopedDimensionSections]);

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

    const toggleDimensionExpanded = (key = activeDimension?.key) => {
        if (!key) return;
        setExpandedDimensionKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const selectDimensionSection = (sectionKey) => {
        if (!sectionKey) return;
        if (activeDimension?.key === sectionKey) {
            toggleDimensionExpanded(sectionKey);
            return;
        }
        setActiveDimensionKey(sectionKey);
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
        const nextSlots = buildMonthlyPerformanceFileSlots(baseYear, { extraMonths }).map(slot => normalizeSlot(slot, baseYear));
        setFileSlots(nextSlots);
    };

    const updateSlot = (idx, patch) => {
        setFileSlots(prev => prev.map((slot, slotIdx) => (
            slotIdx === idx ? normalizeSlot({ ...slot, ...patch }, baseYear) : slot
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

    const openDetailSearch = (terms = [], mode = 'and') => {
        const list = Array.isArray(terms) ? terms : [terms];
        const text = list.map(term => String(term || '').trim()).filter(Boolean).join(', ');
        if (!text) return;
        setSearchMode(mode);
        setSearchInput(text);
        setSearchTerm(text);
        setActiveTab('table');
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
                <MonthlyAnalysisErrorBoundary
                    resetKey={analysisResetKey}
                    fallback={(
                        <div className={styles.emptyState}>
                            월간실적 분석 화면을 다시 정리하는 중입니다. 전체 기준으로 돌아가거나 NAS 동기화 후 다시 시도해 주세요.
                        </div>
                    )}
                >
                    <div className={styles.analytics}>
                    <section className={`${styles.panel} ${styles.analysisScopePanel}`}>
                        <div className={styles.analysisScopeLead}>
                            <div className={styles.analysisScopeTitle}>
                                <span>분석 기준</span>
                                <strong>{scopeLabel}</strong>
                                <em>{scopeRows.toLocaleString('ko-KR')}건 · {scopeBasisLabel} 기준</em>
                            </div>
                            <div className={styles.analysisScopeButtons}>
                                <button
                                    type="button"
                                    className={analysisScope === ANALYSIS_SCOPE_ALL ? styles.analysisScopeActive : ''}
                                    onClick={() => changeAnalysisScope(ANALYSIS_SCOPE_ALL)}
                                >
                                    전체
                                </button>
                                <button
                                    type="button"
                                    className={analysisScope === ANALYSIS_SCOPE_MONTH ? styles.analysisScopeActive : ''}
                                    onClick={() => changeAnalysisScope(ANALYSIS_SCOPE_MONTH)}
                                    disabled={!activeAnalysisMonthValue}
                                >
                                    월
                                </button>
                                <button
                                    type="button"
                                    className={analysisScope === ANALYSIS_SCOPE_WEEK ? styles.analysisScopeActive : ''}
                                    onClick={() => changeAnalysisScope(ANALYSIS_SCOPE_WEEK)}
                                    disabled={!activeAnalysisWeekValue}
                                >
                                    주차
                                </button>
                                <button
                                    type="button"
                                    className={analysisScope === ANALYSIS_SCOPE_DAY ? styles.analysisScopeActive : ''}
                                    onClick={() => changeAnalysisScope(ANALYSIS_SCOPE_DAY)}
                                    disabled={!activeAnalysisDayValue}
                                >
                                    일
                                </button>
                            </div>
                        </div>
                        <div className={styles.analysisScopeSelects}>
                            <select
                                aria-label="분석 월 선택"
                                disabled={monthSelectDisabled}
                                value={activeAnalysisMonthValue}
                                onChange={e => {
                                    setSelectedAnalysisMonth(e.target.value);
                                }}
                            >
                                {availableMonths.map(item => <option key={item.period} value={item.period}>{shortMonthLabel(item.period)}</option>)}
                            </select>
                            <select
                                aria-label="분석 주간 선택"
                                disabled={weekSelectDisabled}
                                value={activeAnalysisWeekValue}
                                onChange={e => {
                                    setSelectedAnalysisWeek(e.target.value);
                                }}
                            >
                                {monthWeeks.map(item => (
                                    <option key={item.key} value={item.key}>
                                        {shortWeekOptionLabel(item)}
                                    </option>
                                ))}
                            </select>
                            <select
                                aria-label="분석 일 선택"
                                disabled={daySelectDisabled}
                                value={activeAnalysisDayValue}
                                onChange={e => {
                                    setSelectedAnalysisDay(e.target.value);
                                }}
                            >
                                {monthDays.map(item => <option key={item.scopeKey} value={item.scopeKey}>{shortDayOptionLabel(item)}</option>)}
                            </select>
                        </div>
                    </section>

                    <MonthlyLedgerFlowChart
                        items={scopeFlowItems}
                        scopeLabel={scopeLabel}
                        basisLabel={scopeFlowBasisLabel}
                        unitLabel={scopeFlowUnitLabel}
                    />

                    <section className={`${styles.panel} ${styles.monthlySummaryPanel}`}>
                        <div className={styles.panelHeader}>
                            <h3>실적 인포그래픽</h3>
                            <span>{scopeFlowRange}</span>
                        </div>
                        <div className={styles.monthlyInfographicGrid}>
                            <div className={styles.monthlyInfoCard}>
                                <MetricDonut value={scopeRevenue} max={diagramMax} tone="revenue" />
                                <span>청구</span>
                                <strong>{formatPerformanceAmount(scopeRevenue)}</strong>
                                <em>{scopeRows.toLocaleString('ko-KR')}건</em>
                                <i style={{ width: metricWidth(scopeRevenue, diagramMax) }} />
                            </div>
                            <div className={styles.monthlyInfoCard}>
                                <MetricDonut value={scopePurchase} max={scopeRevenue || diagramMax} tone="purchase" />
                                <span>하불</span>
                                <strong>{formatPerformanceAmount(scopePurchase)}</strong>
                                <em>청구 대비 {formatPercent(scopeRevenue ? (scopePurchase / scopeRevenue) * 100 : 0, 1)}</em>
                                <i style={{ width: metricWidth(scopePurchase, diagramMax) }} />
                            </div>
                            <div className={styles.monthlyInfoCard}>
                                <MetricDonut value={scopeProfit} max={scopeRevenue || diagramMax} tone="profit" />
                                <span>손익</span>
                                <strong className={scopeProfit < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(scopeProfit)}</strong>
                                <em>{formatPercent(scopeProfitRate, 2)}</em>
                                <i style={{ width: metricWidth(scopeProfit, diagramMax) }} />
                            </div>
                            <div className={styles.monthlyInfoCard}>
                                <MetricDonut value={carryoverRevenue} max={scopeRevenue || diagramMax} tone="carryover" />
                                <span>이월</span>
                                <strong>{formatPerformanceAmount(carryoverRevenue)}</strong>
                                <em>청구 대비 {formatPercent(carryoverRate, 1)}</em>
                                <i style={{ width: metricWidth(carryoverRevenue, diagramMax) }} />
                            </div>
                            <div className={styles.monthlyInfoCard}>
                                <MetricDonut value={avgRevenuePerJob} max={Math.max(1, scopeRevenue)} tone="revenue" />
                                <span>건당 청구</span>
                                <strong>{formatPerformanceAmount(avgRevenuePerJob)}</strong>
                                <em>{scopeRows.toLocaleString('ko-KR')}건 기준</em>
                                <i style={{ width: metricWidth(avgRevenuePerJob, Math.max(1, scopeRevenue), 6) }} />
                            </div>
                        </div>
                        <div className={styles.performanceFunnel}>
                            <div>
                                <span>청구</span>
                                <strong>{formatPerformanceAmount(scopeRevenue)}</strong>
                            </div>
                            <b>→</b>
                            <div>
                                <span>하불</span>
                                <strong>{formatPerformanceAmount(scopePurchase)}</strong>
                            </div>
                            <b>→</b>
                            <div>
                                <span>손익</span>
                                <strong className={scopeProfit < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(scopeProfit)}</strong>
                            </div>
                        </div>
                        <div className={styles.monthlyInsightStrip}>
                            <div>
                                <span>최고 청구</span>
                                <strong>{bestRevenueItem?.scopeLabel || '-'}</strong>
                                <em>{bestRevenueItem ? formatPerformanceAmount(bestRevenueItem.revenue) : '-'}</em>
                            </div>
                            <div>
                                <span>최고 손익</span>
                                <strong>{bestProfitItem?.scopeLabel || '-'}</strong>
                                <em>{bestProfitItem ? formatPerformanceAmount(bestProfitItem.profit) : '-'}</em>
                            </div>
                            <div>
                                <span>최근 항목</span>
                                <strong>{latestFlowItem?.scopeLabel || '-'}</strong>
                                <em>{latestFlowItem ? formatPerformanceAmount(latestFlowItem.revenue) : '-'}</em>
                            </div>
                            <div>
                                <span>최근 증감</span>
                                <strong className={revenueDelta.amount < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(revenueDelta.amount)}</strong>
                                <em>{formatPercent(revenueDelta.rate, 1)}</em>
                            </div>
                        </div>
                    </section>

                    {(scopedSegmentItems.length > 0 || scopedVehicleItems.length > 0) && (
                        <section className={`${styles.panel} ${styles.segmentInsightPanel}`}>
                            <div className={styles.panelHeader}>
                                <h3>구성·차량 성과</h3>
                                <span>{scopeLabel} · 차량 TOP10 · 청구액 기준</span>
                            </div>
                            <div className={styles.compositionCardBody}>
                                {scopedSegmentItems.length > 0 && (
                                    <div className={styles.segmentInsightGrid}>
                                        {scopedSegmentItems.map(segment => (
                                            <button
                                                key={segment.key || segment.label}
                                                type="button"
                                                className={styles.segmentInsightCard}
                                                onClick={() => openDetailSearch((segment.filterTerms || []).length ? segment.filterTerms : [segment.label || segment.name], 'and')}
                                            >
                                                <span>{segment.label || segment.name}</span>
                                                <strong>{formatPerformanceAmount(segment.revenue)}</strong>
                                                <em>{formatPerformanceAmount(segment.profit)} · {safeNumber(segment.rowCount).toLocaleString('ko-KR')}건</em>
                                                <i style={{ width: metricWidth(segment.revenue, segmentMax) }} />
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {scopedVehicleItems.length > 0 && (
                                    <div className={styles.vehicleInsightRows}>
                                        <div className={styles.vehicleInsightHead}>
                                            <span>순위</span>
                                            <span>운송사/차량번호</span>
                                            <span>비중</span>
                                            <span>청구액</span>
                                            <span>손익·건수</span>
                                        </div>
                                        {visibleVehicles.map((vehicle, idx) => (
                                            <button
                                                key={`${vehicleCarrierLabel(vehicle)}-${vehicle.vehicleNo || vehicle.name || idx}`}
                                                type="button"
                                                className={styles.vehicleInsightRow}
                                                onClick={() => openDetailSearch([vehicleCarrierLabel(vehicle), vehicle.vehicleNo || vehicle.name].filter(Boolean), 'and')}
                                            >
                                                <span>{idx + 1}</span>
                                                <strong>{vehicleDisplayName(vehicle)}</strong>
                                                <i><b style={{ width: metricWidth(vehicle.revenue, vehicleMax) }} /></i>
                                                <em>{formatPerformanceAmount(vehicle.revenue)}</em>
                                                <small>{formatPerformanceAmount(vehicle.profit)} · {safeNumber(vehicle.rowCount).toLocaleString('ko-KR')}건</small>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    <section className={`${styles.panel} ${styles.monthPanel}`}>
                        <div className={styles.panelHeader}>
                            <h3>선택 기준 성과 흐름</h3>
                            <span>{scopeFlowRange} · {scopeFlowBasisLabel} 기준</span>
                        </div>
                        <div className={styles.monthChart}>
                            {scopeFlowItems.length === 0 ? (
                                <div className={styles.emptyPanel}>선택 범위 분석 데이터가 아직 없습니다.</div>
                            ) : (
                                <>
                                    <div className={styles.monthHeaderRow}>
                                        <span>범위</span>
                                        <span>매출</span>
                                        <span>매출액</span>
                                        <span>손익</span>
                                        <span>손익액</span>
                                        <span>률</span>
                                    </div>
                                    {scopeFlowItems.map(item => (
                                        <div className={styles.monthRow} key={item._scopeKey || item.scopeLabel}>
                                            <span>{item.scopeLabel || '-'}</span>
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

                    <section className={`${styles.panel} ${styles.weekdayPanel}`}>
                        <div className={styles.panelHeader}>
                            <h3>요일별 카드</h3>
                            <span>{scopeLabel} · 작업일자 기준</span>
                        </div>
                        <div className={styles.weekdayGrid}>
                            {weekdayCards.map(item => (
                                <div className={styles.weekdayCard} key={item.key}>
                                    <span>{item.label}</span>
                                    <strong>{formatPerformanceAmount(item.revenue)}</strong>
                                    <em>{formatPerformanceAmount(item.profit)} · {safeNumber(item.rowCount).toLocaleString('ko-KR')}건</em>
                                    <i style={{ width: metricWidth(item.revenue, weekdayMax) }} />
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className={`${styles.panel} ${styles.dimensionPanel}`}>
                        <div className={styles.panelHeader}>
                            <button
                                type="button"
                                className={styles.panelHeaderTitleButton}
                                onClick={() => toggleDimensionExpanded()}
                                disabled={!activeDimensionItems.length}
                            >
                                세분화 분석
                            </button>
                            <span>{activeDimensionExpanded ? `전체 ${activeDimensionItems.length.toLocaleString('ko-KR')}건` : `상위 ${Math.min(12, activeDimensionItems.length).toLocaleString('ko-KR')}건`} · {scopeLabel}</span>
                        </div>
                        <div className={styles.dimensionDiagram}>
                            <div>
                                <span>청구</span>
                                <strong>{formatPerformanceAmount(scopeRevenue)}</strong>
                                <i style={{ width: `${Math.max(3, Math.min(100, Math.abs(scopeRevenue) / diagramMax * 100))}%` }} />
                            </div>
                            <div>
                                <span>하불</span>
                                <strong>{formatPerformanceAmount(scopePurchase)}</strong>
                                <i style={{ width: `${Math.max(3, Math.min(100, Math.abs(scopePurchase) / diagramMax * 100))}%` }} />
                            </div>
                            <div>
                                <span>손익</span>
                                <strong className={scopeProfit < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(scopeProfit)}</strong>
                                <i style={{ width: `${Math.max(3, Math.min(100, Math.abs(scopeProfit) / diagramMax * 100))}%` }} />
                            </div>
                            <div>
                                <span>이월</span>
                                <strong>{formatPerformanceAmount(carryoverRevenue)}</strong>
                                <i style={{ width: `${Math.max(3, Math.min(100, Math.abs(carryoverRevenue) / diagramMax * 100))}%` }} />
                            </div>
                        </div>
                        {scopedDimensionSections.length === 0 ? (
                            <div className={styles.emptyPanel}>세분화 가능한 컬럼을 아직 찾지 못했습니다. 매출, 청구처별, 작업지별, 지급처별, 청구픽업별, 포트별, 이월구분별, 선적별, 이월(청구처기준), 계산서 데이터를 동기화 후 자동 분석합니다.</div>
                        ) : (
                            <>
                                <div className={styles.dimensionTabs}>
                                    {scopedDimensionSections.map(section => (
                                        <button
                                            key={section.key}
                                            type="button"
                                            className={activeDimension?.key === section.key ? styles.dimensionTabActive : ''}
                                            onClick={() => selectDimensionSection(section.key)}
                                        >
                                            {section.label}{expandedDimensionKeys.has(section.key) ? ' 전체' : ''}
                                        </button>
                                    ))}
                                </div>
                                <div className={styles.dimensionSummary}>
                                    <span>대표 항목</span>
                                    <strong>{topDimensionItem?.name || '-'}</strong>
                                    <em>{topDimensionItem ? `${formatPerformanceAmount(topDimensionItem.revenue)} · ${formatDimensionCount(topDimensionItem)}` : '-'}</em>
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
                                    {visibleDimensionItems.map(item => (
                                        <button
                                            type="button"
                                            className={styles.dimensionRow}
                                            key={`${activeDimension.key}-${item.name || item.label || 'item'}`}
                                            onClick={() => openDetailSearch([item.name], 'and')}
                                        >
                                            <span>{item.name || '미분류'}</span>
                                            <strong>{formatPerformanceAmount(item.revenue)}</strong>
                                            <em>{formatPerformanceAmount(item.purchase)}</em>
                                            <b className={safeNumber(item.profit) < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(item.profit)}</b>
                                            <small>{formatDimensionCount(item)}</small>
                                            <i>{formatPercent(item.profitRate ?? profitRate(item), 1)}</i>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </section>

                    {reportTableReady && (
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
                            <div className={styles.reportSummaryStrip}>
                                <span>순매출 {formatPerformanceAmount(safeNumber(reportTotals.netRevenue) || totalRevenue)}</span>
                                <span>순매입 {formatPerformanceAmount(safeNumber(reportTotals.netPurchase) || totalPurchase)}</span>
                                <span>매출이익 {formatPerformanceAmount(safeNumber(reportTotals.netProfit) || totalProfit)}</span>
                                <span>이월금액 {formatPerformanceAmount(reportCarryoverRevenue)}</span>
                                <span>손익률 {formatPercent(safeNumber(reportTotals.netProfitRate) || totalProfitRate, 2)}</span>
                            </div>
                        </section>
                    )}

                    </div>
                </MonthlyAnalysisErrorBoundary>
            ) : (
                <div className={styles.tableArea}>
                    <div className={styles.tableToolbar}>
                        <input
                            className={styles.searchInput}
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            placeholder="검색어 또는 금액"
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
                                        <th key={col} onClick={() => requestSort(col)} title="클릭하여 정렬">
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
                        <div className={styles.monthlySettingsGuide}>
                            <strong>기준연도 12개월 + 정리기간 파일을 월별로 연결합니다.</strong>
                            <span>읽을 시트는 기본값이 첫 번째 시트입니다. 표 제목 행은 엑셀에서 컬럼명이 있는 줄 번호이며, 비워두면 자동으로 찾습니다.</span>
                        </div>
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label>기준연도 <span>1월~12월</span></label>
                                <input value={baseYear} onChange={e => setBaseYear(e.target.value.replace(/[^\d]/g, ''))} className={styles.pathInput} />
                                <small>{baseYear || DEFAULT_MONTHLY_BASE_YEAR}년 실적 파일 12개월을 기본으로 만듭니다.</small>
                            </div>
                            <div className={styles.formGroup}>
                                <label>정리기간 <span>다음해 추가월</span></label>
                                <input value={extraMonths} onChange={e => setExtraMonths(e.target.value.replace(/[^\d]/g, ''))} className={styles.pathInput} />
                                <small>현재 값 {extraMonths || 0}: 다음해 {settingsPreviewSummary.carryoverRange}까지 이월 정리 파일을 추가합니다.</small>
                            </div>
                        </div>
                        <div className={styles.monthlySettingsSummary}>
                            <div>
                                <span>현재 파일 공간</span>
                                <strong>{settingsSlotSummary.range}</strong>
                                <em>{settingsSlotSummary.activeCount}/{settingsSlotSummary.totalCount}개월 사용</em>
                            </div>
                            <div>
                                <span>기준연도 구간</span>
                                <strong>{settingsPreviewSummary.mainRange}</strong>
                                <em>기본 12개월</em>
                            </div>
                            <div>
                                <span>정리기간 구간</span>
                                <strong>{settingsPreviewSummary.carryoverRange}</strong>
                                <em>{settingsPreviewSummary.carryoverCount}개월 이월 정리</em>
                            </div>
                        </div>
                        <div className={styles.modalFooter}>
                            <button onClick={regenerateSlots} className={styles.ghostBtn}>연도/정리기간으로 월 목록 다시 만들기</button>
                        </div>
                        <div className={styles.monthlySettingsList}>
                            <div className={styles.monthlySettingsHeader}>
                                <span>사용 월</span>
                                <span>월 파일 경로</span>
                                <span>읽을 시트</span>
                                <span>표 제목 행</span>
                                <span>파일 찾기</span>
                            </div>
                            {fileSlots.map((slot, idx) => (
                                <div className={styles.monthlySettingsRow} key={slot.period}>
                                    <label>
                                        <input type="checkbox" checked={slot.enabled} onChange={e => updateSlot(idx, { enabled: e.target.checked })} />
                                        {slot.period}{slot.carryover ? ' 이월' : ''}
                                    </label>
                                    <input
                                        value={slot.path}
                                        onChange={e => updateSlot(idx, { path: e.target.value })}
                                        className={styles.pathInput}
                                        aria-label={`${slot.period} 월 파일 경로`}
                                    />
                                    <div className={styles.sheetControl}>
                                        <select
                                            value={slot.sheetName === FIRST_SHEET_TOKEN ? FIRST_SHEET_TOKEN : 'custom'}
                                            onChange={e => updateSlot(idx, { sheetName: e.target.value === FIRST_SHEET_TOKEN ? FIRST_SHEET_TOKEN : '' })}
                                            aria-label={`${slot.period} 읽을 시트`}
                                        >
                                            <option value={FIRST_SHEET_TOKEN}>첫 번째 시트</option>
                                            <option value="custom">시트명 직접 입력</option>
                                        </select>
                                        {slot.sheetName !== FIRST_SHEET_TOKEN && (
                                            <input
                                                value={slot.sheetName}
                                                onChange={e => updateSlot(idx, { sheetName: e.target.value || FIRST_SHEET_TOKEN })}
                                                placeholder="시트명"
                                                className={styles.sheetNameInput}
                                                aria-label={`${slot.period} 시트명`}
                                            />
                                        )}
                                    </div>
                                    <input
                                        value={slot.headerRow}
                                        onChange={e => updateSlot(idx, { headerRow: e.target.value.replace(/[^\d]/g, '') })}
                                        placeholder="자동"
                                        title="엑셀 표 컬럼명이 있는 행 번호입니다. 비워두면 자동으로 찾습니다."
                                        className={styles.shortInput}
                                        aria-label={`${slot.period} 표 제목 행`}
                                    />
                                    <button onClick={() => openBrowser(idx)} className={styles.browseBtn}>월 파일명 찾기</button>
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
