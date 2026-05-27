'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    DEFAULT_ANNUAL_PERFORMANCE_PATH,
    DEFAULT_ANNUAL_PERFORMANCE_SHEET,
    formatPerformanceAmount,
    formatPerformanceCellValue,
    getPerformanceChartMax,
    normalizePerformancePath,
    normalizePerformanceColumnOrder,
    reconcilePerformanceLayoutPrefs,
} from '@/utils/asanPerformanceView.mjs';
import { downloadPerformanceTableExcel } from '@/utils/asanPerformanceTableExport.mjs';
import styles from './annualPerformance.module.css';

const PREFS_KEY = 'asan_annual_performance_prefs';
const PAGE_SIZE = 300;
const SEARCH_DEBOUNCE_MS = 700;
const DIMENSION_PRIORITY = ['청구처', '작업지', '운송사', '노선', '구분', '지급처', '포트', '하차', '계약', '픽업', '지역'];
const EMPTY_LIST = Object.freeze([]);
const ANALYSIS_VIEWS = [
    { key: 'overview', label: '개요' },
    { key: 'matrix', label: '연도×월' },
    { key: 'route-unit', label: '구간단가' },
    { key: 'segments', label: '계약/차량' },
    { key: 'calendar', label: '요일' },
    { key: 'evidence', label: '검증·근거' },
];
const SCOPE_PRESETS = [
    { key: 'all', label: '전체' },
    { key: 'recent12', label: '최근 12개월' },
    { key: 'recent24', label: '최근 24개월' },
    { key: 'recent36', label: '최근 3년' },
    { key: 'recent60', label: '최근 5년' },
    { key: 'custom', label: '직접' },
];

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

function isMissingToken(value) {
    const text = String(value ?? '').trim();
    return !text || text === '-';
}

function displayVehicleName(item = {}) {
    const raw = item.vehicleNo || item.name || item.label || '';
    return isMissingToken(raw) ? '차량번호 미기재' : raw;
}

function displayDriverName(value) {
    return isMissingToken(value) ? '기사 미기재' : value;
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
    return { label: '이익 위험', tone: 'danger' };
}

function getPeriodRange(monthly = []) {
    if (!monthly.length) return '-';
    const first = monthly[0]?.period || '-';
    const last = monthly[monthly.length - 1]?.period || '-';
    return first === last ? first : `${first} ~ ${last}`;
}

function normalizePeriodKey(value) {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{4})[-./]?(0[1-9]|1[0-2])(?:[-./]\d{1,2})?/);
    return match ? `${match[1]}-${match[2]}` : '';
}

function getSeriesPeriod(item = {}) {
    return normalizePeriodKey(item.period || item.weekStart || item.monthKey || item.label || '');
}

function getPeriodOptions(monthly = []) {
    return Array.from(new Set(monthly.map(item => normalizePeriodKey(item.period)).filter(Boolean))).sort();
}

function getScopeBounds({ mode, periods, start, end }) {
    if (!periods.length) return { start: '', end: '', label: '-' };
    const first = periods[0];
    const last = periods[periods.length - 1];
    const normalizedStart = normalizePeriodKey(start);
    const normalizedEnd = normalizePeriodKey(end);
    let nextStart = first;
    let nextEnd = last;

    if (mode === 'recent12') {
        nextStart = periods[Math.max(0, periods.length - 12)];
    } else if (mode === 'recent24') {
        nextStart = periods[Math.max(0, periods.length - 24)];
    } else if (mode === 'recent36') {
        nextStart = periods[Math.max(0, periods.length - 36)];
    } else if (mode === 'recent60') {
        nextStart = periods[Math.max(0, periods.length - 60)];
    } else if (mode === 'custom') {
        nextStart = normalizedStart || first;
        nextEnd = normalizedEnd || last;
        if (nextStart > nextEnd) [nextStart, nextEnd] = [nextEnd, nextStart];
    }

    return {
        start: nextStart,
        end: nextEnd,
        label: nextStart === nextEnd ? nextStart : `${nextStart} ~ ${nextEnd}`,
        isFullRange: nextStart === first && nextEnd === last,
    };
}

function filterSeriesByScope(items = [], scopeBounds = {}) {
    if (!scopeBounds.start || !scopeBounds.end) return Array.isArray(items) ? items : [];
    return (Array.isArray(items) ? items : []).filter(item => {
        const period = getSeriesPeriod(item);
        return period && period >= scopeBounds.start && period <= scopeBounds.end;
    });
}

function sumSeriesMetrics(items = []) {
    return items.reduce((acc, item) => {
        acc.revenue += safeNumber(item.revenue);
        acc.purchase += safeNumber(item.purchase);
        acc.profit += safeNumber(item.profit);
        acc.rowCount += safeNumber(item.rowCount);
        return acc;
    }, { revenue: 0, purchase: 0, profit: 0, rowCount: 0 });
}

function weekdaySortValue(item = {}) {
    const label = String(item.label || '').replace(/요일$/, '');
    const labelIndex = ['일', '월', '화', '수', '목', '금', '토'].indexOf(label);
    if (labelIndex >= 0) return labelIndex;
    const day = Number(item.day);
    return Number.isFinite(day) ? day : 99;
}

function buildWeekdaySeries({ daily = [], weekday = [], scopeBounds = {} }) {
    const scopedDaily = filterSeriesByScope(daily, scopeBounds);
    if (scopedDaily.length) {
        const map = new Map();
        scopedDaily.forEach(item => {
            const date = new Date(`${item.date || item.dateKey || ''}T00:00:00`);
            const dateDay = Number.isNaN(date.getTime()) ? null : date.getDay();
            const dayNo = Number.isFinite(Number(item.day)) ? Number(item.day) : (dateDay ?? weekdaySortValue(item));
            const key = String(dayNo);
            const label = String(item.label || ['일', '월', '화', '수', '목', '금', '토'][dayNo] || key).replace(/요일$/, '');
            const prev = map.get(key) || { day: Number(key), label, revenue: 0, purchase: 0, profit: 0, rowCount: 0 };
            prev.revenue += safeNumber(item.revenue);
            prev.purchase += safeNumber(item.purchase);
            prev.profit += safeNumber(item.profit);
            prev.rowCount += safeNumber(item.rowCount);
            map.set(key, prev);
        });
        return Array.from(map.values()).sort((a, b) => weekdaySortValue(a) - weekdaySortValue(b));
    }
    return (Array.isArray(weekday) ? weekday : []).slice().sort((a, b) => weekdaySortValue(a) - weekdaySortValue(b));
}

function getFlowItemLabel(item = {}) {
    return item.label || item.period || item.weekStart || item.year || '-';
}

function aggregateMonthlyByBucket(monthly = [], bucket = 'month') {
    const map = new Map();
    normalizeSeries(monthly).forEach(item => {
        const period = normalizePeriodKey(item.period);
        if (!period) return;
        const [year, monthText] = period.split('-');
        const month = Number(monthText) || 1;
        let key = period;
        let label = period;
        let sortKey = period;

        if (bucket === 'year') {
            key = year;
            label = `${year}년`;
            sortKey = `${year}-00`;
        } else if (bucket === 'quarter') {
            const quarter = Math.ceil(month / 3);
            key = `${year}-Q${quarter}`;
            label = `${year} ${quarter}분기`;
            sortKey = `${year}-${String(quarter * 3).padStart(2, '0')}`;
        }

        const prev = map.get(key) || {
            period: key,
            label,
            sortKey,
            revenue: 0,
            purchase: 0,
            profit: 0,
            rowCount: 0,
        };
        prev.revenue += safeNumber(item.revenue);
        prev.purchase += safeNumber(item.purchase);
        prev.profit += safeNumber(item.profit);
        prev.rowCount += safeNumber(item.rowCount);
        map.set(key, prev);
    });
    return Array.from(map.values()).sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
}

function getTimeFlowBucket(monthly = [], scopeBounds = {}) {
    const count = monthly.length;
    if (!count) return 'month';
    if (scopeBounds.isFullRange && count > 60) return 'year';
    if (count <= 24) return 'month';
    if (count <= 60) return 'quarter';
    return 'year';
}

function buildScopedTimeFlow(monthly = [], scopeBounds = {}) {
    const bucket = getTimeFlowBucket(monthly, scopeBounds);
    const items = aggregateMonthlyByBucket(monthly, bucket);
    const labelMap = {
        month: '월별',
        quarter: '3개월별',
        year: '연도별',
    };
    return {
        bucket,
        items,
        label: labelMap[bucket] || '월별',
        countLabel: `${items.length.toLocaleString('ko-KR')}개 구간`,
    };
}

function scopeStrategicSegment(segment = {}, scopeBounds = {}, scopedRevenue = 0) {
    const scopedMonthly = filterSeriesByScope(segment.monthly || [], scopeBounds);
    if (!scopedMonthly.length) return { ...segment, monthly: [], revenue: 0, purchase: 0, profit: 0, rowCount: 0, revenueShare: 0, profitRate: 0 };
    const totals = sumSeriesMetrics(scopedMonthly);
    return {
        ...segment,
        monthly: scopedMonthly,
        revenue: totals.revenue,
        purchase: totals.purchase,
        profit: totals.profit,
        rowCount: totals.rowCount,
        revenueShare: rate(totals.revenue, scopedRevenue),
        profitRate: rate(totals.profit, totals.revenue),
    };
}

function scopePerformanceItem(item = {}, scopeBounds = {}, scopedRevenue = 0) {
    if (!Array.isArray(item.monthly)) {
        if (scopeBounds.isFullRange || !scopeBounds.start || !scopeBounds.end) return item;
        return { ...item, monthly: [], revenue: 0, purchase: 0, profit: 0, rowCount: 0, revenueShare: 0, profitRate: 0, scopeUnavailable: true };
    }
    const scopedMonthly = filterSeriesByScope(item.monthly, scopeBounds);
    if (!scopedMonthly.length) return { ...item, monthly: [], revenue: 0, purchase: 0, profit: 0, rowCount: 0, revenueShare: 0, profitRate: 0 };
    const totals = sumSeriesMetrics(scopedMonthly);
    return {
        ...item,
        monthly: scopedMonthly,
        revenue: totals.revenue,
        purchase: totals.purchase,
        profit: totals.profit,
        rowCount: totals.rowCount,
        revenueShare: rate(totals.revenue, scopedRevenue),
        profitRate: rate(totals.profit, totals.revenue),
    };
}

function buildExecutiveNotes({ profitRate, purchaseRate, latestMonth, previousMonth, topSegment, top3Share, lowMarginItems }) {
    const notes = [];
    if (latestMonth && previousMonth) {
        notes.push(`최근월 매출은 전월 대비 ${formatSignedAmount(safeNumber(latestMonth.revenue) - safeNumber(previousMonth.revenue))}, 이익은 ${formatSignedAmount(safeNumber(latestMonth.profit) - safeNumber(previousMonth.profit))}입니다.`);
    }
    notes.push(`전체 이익률은 ${formatPercent(profitRate)}이고 원가율은 ${formatPercent(purchaseRate)}입니다.`);
    if (topSegment) {
        notes.push(`최대 기여 항목은 ${topSegment.name || '미분류'}이며 매출 비중 ${formatPercent(topSegment.revenueShare)}입니다.`);
    }
    if (top3Share) {
        notes.push(`상위 3개 집중도는 ${formatPercent(top3Share)}입니다.`);
    }
    if (lowMarginItems.length) {
        notes.push(`매출 상위권 중 이익률이 낮은 항목 ${lowMarginItems.length.toLocaleString('ko-KR')}개를 우선 점검 대상으로 표시했습니다.`);
    }
    return notes.slice(0, 5);
}

function normalizeSeries(items = []) {
    return (Array.isArray(items) ? items : []).filter(item => item && (safeNumber(item.revenue) || safeNumber(item.purchase) || safeNumber(item.profit)));
}

function ScopeControls({ mode, setMode, start, end, setStart, setEnd, periods, bounds, rowCount }) {
    const isCustomScope = mode === 'custom';

    return (
        <section className={styles.scopePanel}>
            <div className={styles.scopeTitle}>
                <span>조사범위</span>
                <strong>{bounds.label}</strong>
                <em>{safeNumber(rowCount).toLocaleString('ko-KR')}건 기준</em>
            </div>
            <div className={styles.scopePresets}>
                {SCOPE_PRESETS.map(preset => (
                    <button
                        key={preset.key}
                        className={mode === preset.key ? styles.scopeActive : ''}
                        onClick={() => setMode(preset.key)}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>
            <div className={styles.scopeSelects}>
                <select
                    aria-label="조사 시작월"
                    disabled={!isCustomScope}
                    value={start || periods[0] || ''}
                    onChange={e => {
                        setStart(e.target.value);
                        setMode('custom');
                    }}
                >
                    {periods.map(period => <option key={period} value={period}>{period}</option>)}
                </select>
                <span>~</span>
                <select
                    aria-label="조사 종료월"
                    disabled={!isCustomScope}
                    value={end || periods[periods.length - 1] || ''}
                    onChange={e => {
                        setEnd(e.target.value);
                        setMode('custom');
                    }}
                >
                    {periods.map(period => <option key={period} value={period}>{period}</option>)}
                </select>
            </div>
        </section>
    );
}

function LedgerFlowChart({ items = [], title = '장기 흐름', scopeLabel = '-' }) {
    const series = normalizeSeries(items);
    const width = 1280;
    const height = 286;
    const pad = { left: 72, right: 92, top: 30, bottom: 54 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const maxValue = Math.max(1, ...series.flatMap(item => [safeNumber(item.revenue), safeNumber(item.purchase)]));
    const avgRevenue = series.length ? sumField(series, 'revenue') / series.length : 0;
    const avgPurchase = series.length ? sumField(series, 'purchase') / series.length : 0;
    const xAt = idx => pad.left + (series.length <= 1 ? 0 : (idx / (series.length - 1)) * chartW);
    const yAt = value => pad.top + chartH - (safeNumber(value) / maxValue) * chartH;
    const toPoints = field => series.map((item, idx) => `${xAt(idx).toFixed(1)},${yAt(item[field]).toFixed(1)}`).join(' ');
    const revenuePoints = toPoints('revenue');
    const purchasePoints = toPoints('purchase');
    const revenueArea = series.length ? `${pad.left},${pad.top + chartH} ${revenuePoints} ${pad.left + chartW},${pad.top + chartH}` : '';
    const start = series[0]?.period || '-';
    const end = series[series.length - 1]?.period || '-';
    const high = series.reduce((best, item) => safeNumber(item.revenue) > safeNumber(best?.revenue) ? item : best, null);
    const highPurchase = series.reduce((best, item) => safeNumber(item.purchase) > safeNumber(best?.purchase) ? item : best, null);
    const highProfit = series.reduce((best, item) => safeNumber(item.profit) > safeNumber(best?.profit) ? item : best, null);
    const lowProfit = series.reduce((best, item) => safeNumber(item.profit) < safeNumber(best?.profit) ? item : best, series[0] || null);
    const last = series[series.length - 1] || null;
    const avgRevenueY = yAt(avgRevenue);
    const avgPurchaseY = yAt(avgPurchase);
    const gradientId = `annualRevenueArea-${String(title).replace(/[^a-zA-Z0-9가-힣]/g, '-')}`;
    const grid = [0.25, 0.5, 0.75, 1].map(ratio => ({
        y: pad.top + chartH - chartH * ratio,
        value: maxValue * ratio,
    }));
    const markerDefs = [
        { key: 'high', item: high, field: 'revenue', label: '최고 매출', tone: 'revenue' },
        { key: 'profit', item: highProfit, field: 'revenue', label: '최고 이익', tone: 'profit', valueField: 'profit' },
        { key: 'recent', item: last, field: 'revenue', label: '최근', tone: 'recent' },
    ].filter(marker => marker.item);
    const tickEvery = Math.max(1, Math.ceil(series.length / 8));

    return (
        <section className={styles.marketFlowPanel}>
            <div className={styles.marketFlowHeader}>
                <div>
                    <h3>{title}</h3>
                    <span>{start} ~ {end} · 조사범위 {scopeLabel}</span>
                </div>
                <div className={styles.marketFlowLegend}>
                    <span><i className={styles.revenueDot} />매출</span>
                    <span><i className={styles.purchaseDot} />매입</span>
                    <span><i className={styles.avgRevenueDot} />매출 평균</span>
                    <span><i className={styles.avgPurchaseDot} />매입 평균</span>
                </div>
            </div>
            {series.length < 2 ? (
                <div className={styles.emptyPanel}>장기 흐름을 그릴 월별 데이터가 부족합니다.</div>
            ) : (
                <>
                    <div className={styles.marketFlowChartWrap}>
                        <svg className={styles.marketFlowSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} 매출 매입 흐름`}>
                            <defs>
                                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                                    <stop offset="0%" stopColor="#0f766e" stopOpacity="0.18" />
                                    <stop offset="64%" stopColor="#14b8a6" stopOpacity="0.08" />
                                    <stop offset="100%" stopColor="#0f766e" stopOpacity="0.01" />
                                </linearGradient>
                                <filter id="annualFlowGlow" x="-20%" y="-20%" width="140%" height="140%">
                                    <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#0f766e" floodOpacity="0.16" />
                                </filter>
                            </defs>
                            {grid.map(item => (
                                <g key={item.y}>
                                    <line x1={pad.left} x2={pad.left + chartW} y1={item.y} y2={item.y} className={styles.marketGridLine} />
                                    <text x={pad.left - 8} y={item.y + 3} className={styles.marketAxisText} textAnchor="end">{formatPerformanceAmount(item.value)}</text>
                                </g>
                            ))}
                            <polygon points={revenueArea} className={styles.marketRevenueArea} style={{ fill: `url(#${gradientId})` }} />
                            <polyline points={revenuePoints} className={styles.marketRevenueLine} filter="url(#annualFlowGlow)" />
                            <polyline points={purchasePoints} className={styles.marketPurchaseLine} />
                            <line x1={pad.left} x2={pad.left + chartW} y1={avgRevenueY} y2={avgRevenueY} className={styles.marketRevenueAvgLine} />
                            <line x1={pad.left} x2={pad.left + chartW} y1={avgPurchaseY} y2={avgPurchaseY} className={styles.marketPurchaseAvgLine} />
                            <text x={pad.left + chartW - 8} y={Math.max(14, avgRevenueY - 7)} className={styles.marketAvgText} textAnchor="end">매출 평균 {formatPerformanceAmount(avgRevenue)}</text>
                            <text x={pad.left + chartW - 8} y={Math.min(height - 34, avgPurchaseY + 16)} className={styles.marketAvgText} textAnchor="end">매입 평균 {formatPerformanceAmount(avgPurchase)}</text>
                            {series.map((item, idx) => {
                                const showTick = idx === 0 || idx === series.length - 1 || idx % tickEvery === 0;
                                return showTick ? (
                                    <text key={item.period} x={xAt(idx)} y={height - 16} className={styles.marketAxisText} textAnchor="middle">{item.period}</text>
                                ) : null;
                            })}
                            {markerDefs.map((marker, order) => {
                                const idx = Math.max(0, series.indexOf(marker.item));
                                const x = xAt(idx);
                                const y = yAt(marker.item[marker.field]);
                                const labelX = Math.min(width - 112, Math.max(100, x));
                                const labelY = Math.max(20, y - 23 - (order % 2) * 14);
                                return (
                                    <g key={marker.key}>
                                        <line x1={x} x2={x} y1={y + 8} y2={pad.top + chartH} className={styles.marketMarkerGuide} />
                                        <circle cx={x} cy={y} r="6" className={styles[`marketMarker_${marker.tone}`] || styles.marketMarker_recent}>
                                            <title>{`${getFlowItemLabel(marker.item)} ${marker.label} ${formatPerformanceAmount(marker.item[marker.valueField || marker.field])}`}</title>
                                        </circle>
                                        <text x={labelX} y={labelY} className={styles.marketMarkerLabel} textAnchor="middle">
                                            {marker.label} {formatPerformanceAmount(marker.item[marker.valueField || marker.field])}
                                        </text>
                                    </g>
                                );
                            })}
                        </svg>
                    </div>
                    <div className={styles.marketFlowStats}>
                        <div><span>최고 매출월</span><strong>{high?.period || '-'}</strong><em>{high ? formatPerformanceAmount(high.revenue) : '-'}</em></div>
                        <div><span>최고 매입월</span><strong>{highPurchase?.period || '-'}</strong><em>{highPurchase ? formatPerformanceAmount(highPurchase.purchase) : '-'}</em></div>
                        <div><span>최고 이익월</span><strong>{highProfit?.period || '-'}</strong><em>{highProfit ? formatPerformanceAmount(highProfit.profit) : '-'}</em></div>
                        <div><span>최저 이익월</span><strong>{lowProfit?.period || '-'}</strong><em>{lowProfit ? formatPerformanceAmount(lowProfit.profit) : '-'}</em></div>
                        <div><span>최근월</span><strong>{last?.period || '-'}</strong><em>매출 {last ? formatPerformanceAmount(last.revenue) : '-'}</em></div>
                        <div><span>매출 평균</span><strong>{formatPerformanceAmount(avgRevenue)}</strong><em>월 평균</em></div>
                        <div><span>매입 평균</span><strong>{formatPerformanceAmount(avgPurchase)}</strong><em>월 평균</em></div>
                    </div>
                </>
            )}
        </section>
    );
}

function MiniTrendChart({ items = [], title = '흐름', basis = '월', scopeLabel = '-' }) {
    const series = normalizeSeries(items);
    const maxRevenue = Math.max(1, ...series.map(item => Math.abs(safeNumber(item.revenue))));
    const maxProfit = Math.max(1, ...series.map(item => Math.abs(safeNumber(item.profit))));
    const width = 760;
    const height = 212;
    const padX = 38;
    const xAt = idx => (series.length <= 1 ? padX : padX + (idx / (series.length - 1)) * (width - padX * 2));
    const revenueY = value => 28 + (1 - (safeNumber(value) / maxRevenue)) * 92;
    const profitY = value => Math.max(112, Math.min(182, 158 - (safeNumber(value) / maxProfit) * 46));
    const revenuePoints = series.map((item, idx) => `${xAt(idx).toFixed(1)},${revenueY(item.revenue).toFixed(1)}`).join(' ');
    const profitPoints = series.map((item, idx) => `${xAt(idx).toFixed(1)},${profitY(item.profit).toFixed(1)}`).join(' ');
    const revenueArea = series.length ? `${padX},188 ${revenuePoints} ${width - padX},188` : '';
    const first = getFlowItemLabel(series[0]);
    const last = getFlowItemLabel(series[series.length - 1]);
    const recent = series[series.length - 1] || null;
    const totalRevenue = sumField(series, 'revenue');
    const totalProfit = sumField(series, 'profit');
    const avgRevenue = series.length ? totalRevenue / series.length : 0;
    const avgProfit = series.length ? totalProfit / series.length : 0;
    const avgProfitRate = rate(totalProfit, totalRevenue, 2);
    const highRevenue = series.reduce((best, item) => (!best || safeNumber(item.revenue) > safeNumber(best.revenue) ? item : best), null);
    const highProfit = series.reduce((best, item) => (!best || safeNumber(item.profit) > safeNumber(best.profit) ? item : best), null);
    const lowProfit = series.reduce((best, item) => (!best || safeNumber(item.profit) < safeNumber(best.profit) ? item : best), null);
    const highRevenueIndex = Math.max(0, series.indexOf(highRevenue));
    const highProfitIndex = Math.max(0, series.indexOf(highProfit));
    const lowProfitIndex = Math.max(0, series.indexOf(lowProfit));
    const recentIndex = Math.max(0, series.length - 1);

    return (
        <div className={styles.trendCard}>
            <div className={styles.trendTitle}>
                <div>
                    <h3>{title}</h3>
                    <span>{scopeLabel} · {basis} {first} ~ {last}</span>
                </div>
                <div className={styles.trendLegend}>
                    <span><i className={styles.revenueDot} />매출</span>
                    <span><i className={styles.profitDot} />이익</span>
                    <span><i className={styles.avgRevenueDot} />매출 평균</span>
                    <span><i className={styles.avgProfitDot} />이익 평균</span>
                </div>
            </div>
            {series.length < 2 ? (
                <div className={styles.emptyPanel}>흐름 데이터가 부족합니다.</div>
            ) : (
                <>
                    <svg className={styles.trendSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} 차트`}>
                        <defs>
                            <linearGradient id="miniTrendRevenueArea" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="#0f766e" stopOpacity="0.16" />
                                <stop offset="100%" stopColor="#0f766e" stopOpacity="0.01" />
                            </linearGradient>
                        </defs>
                        {[58, 108, 158].map(y => <line key={y} x1={padX} y1={y} x2={width - padX} y2={y} className={styles.axisLine} />)}
                        <line x1={padX} y1="158" x2={width - padX} y2="158" className={styles.zeroLine} />
                        <polygon points={revenueArea} className={styles.trendRevenueArea} />
                        <line x1={padX} y1={revenueY(avgRevenue)} x2={width - padX} y2={revenueY(avgRevenue)} className={styles.trendAvgRevenueLine} />
                        <line x1={padX} y1={profitY(avgProfit)} x2={width - padX} y2={profitY(avgProfit)} className={styles.trendAvgProfitLine} />
                        <text x={width - padX} y={Math.max(14, revenueY(avgRevenue) - 7)} className={styles.trendAvgLabel} textAnchor="end">매출 평균 {formatPerformanceAmount(avgRevenue)}</text>
                        <text x={width - padX} y={Math.min(height - 8, profitY(avgProfit) + 14)} className={styles.trendAvgLabel} textAnchor="end">이익 평균 {formatPerformanceAmount(avgProfit)}</text>
                        <polyline points={revenuePoints} className={styles.revenueLine} />
                        <polyline points={profitPoints} className={styles.profitLine} />
                        {highRevenue && (
                            <g>
                                <circle cx={xAt(highRevenueIndex)} cy={revenueY(highRevenue.revenue)} r="5" className={styles.trendRevenuePoint}>
                                    <title>{`${getFlowItemLabel(highRevenue)} 최고 매출 ${formatPerformanceAmount(highRevenue.revenue)}`}</title>
                                </circle>
                                <text x={xAt(highRevenueIndex)} y={Math.max(14, revenueY(highRevenue.revenue) - 10)} className={styles.trendMarkerLabel} textAnchor="middle">매출 최고</text>
                            </g>
                        )}
                        {highProfit && (
                            <g>
                                <circle cx={xAt(highProfitIndex)} cy={profitY(highProfit.profit)} r="4.8" className={styles.trendProfitPoint}>
                                    <title>{`${getFlowItemLabel(highProfit)} 최고 이익 ${formatPerformanceAmount(highProfit.profit)}`}</title>
                                </circle>
                                <text x={xAt(highProfitIndex)} y={Math.max(96, profitY(highProfit.profit) - 8)} className={styles.trendMarkerLabel} textAnchor="middle">이익 최고</text>
                            </g>
                        )}
                        {lowProfit && lowProfit !== highProfit && (
                            <g>
                                <circle cx={xAt(lowProfitIndex)} cy={profitY(lowProfit.profit)} r="4.8" className={styles.trendLossPoint}>
                                    <title>{`${getFlowItemLabel(lowProfit)} 최저 이익 ${formatPerformanceAmount(lowProfit.profit)}`}</title>
                                </circle>
                                <text x={xAt(lowProfitIndex)} y={Math.min(height - 10, profitY(lowProfit.profit) + 18)} className={styles.trendMarkerLabel} textAnchor="middle">이익 최저</text>
                            </g>
                        )}
                        {recent && (
                            <g>
                                <circle cx={xAt(recentIndex)} cy={revenueY(recent.revenue)} r="4.5" className={styles.trendRecentPoint}>
                                    <title>{`${getFlowItemLabel(recent)} 최근 매출 ${formatPerformanceAmount(recent.revenue)}, 이익 ${formatPerformanceAmount(recent.profit)}`}</title>
                                </circle>
                                <text x={Math.min(width - 36, xAt(recentIndex) - 8)} y={revenueY(recent.revenue) - 10} className={styles.trendMarkerLabel} textAnchor="end">최근 {formatPerformanceAmount(recent.revenue)}</text>
                            </g>
                        )}
                    </svg>
                    <div className={styles.trendSummaryGrid}>
                        <div><span>최근 구간</span><strong>{getFlowItemLabel(recent)}</strong><em>매출 {formatPerformanceAmount(recent?.revenue)}</em></div>
                        <div><span>최고 매출 구간</span><strong>{getFlowItemLabel(highRevenue)}</strong><em>{formatPerformanceAmount(highRevenue?.revenue)}</em></div>
                        <div><span>최고 이익 구간</span><strong>{getFlowItemLabel(highProfit)}</strong><em>{formatPerformanceAmount(highProfit?.profit)}</em></div>
                        <div><span>평균 이익률</span><strong>{formatPercent(avgProfitRate, 2)}</strong><em>기간 평균선 기준</em></div>
                    </div>
                    <div className={styles.trendFoot}>
                        <span>월평균 매출 {formatPerformanceAmount(avgRevenue)}, 월평균 이익 {formatPerformanceAmount(avgProfit)}</span>
                        <span>원장 summary 기반, 금액은 원 단위 집계 후 화면에서 축약 표시</span>
                    </div>
                </>
            )}
        </div>
    );
}

function WeekdayPerformanceDiagram({ items = [], scopeLabel = '-' }) {
    const series = (Array.isArray(items) ? items : []).filter(item => safeNumber(item.revenue) || safeNumber(item.profit) || safeNumber(item.rowCount));
    const totals = series.reduce((acc, item) => {
        acc.revenue += Math.max(0, safeNumber(item.revenue));
        acc.profitMagnitude += Math.abs(safeNumber(item.profit));
        acc.rows += Math.max(0, safeNumber(item.rowCount));
        return acc;
    }, { revenue: 0, profitMagnitude: 0, rows: 0 });
    const shareOf = (value, total) => (total > 0 ? safeNumber(value) / total * 100 : 0);
    const enriched = series.map(item => ({
        ...item,
        revenueShare: shareOf(Math.max(0, safeNumber(item.revenue)), totals.revenue),
        profitShare: shareOf(safeNumber(item.profit), totals.profitMagnitude),
        rowShare: shareOf(Math.max(0, safeNumber(item.rowCount)), totals.rows),
    }));
    const bestRevenue = enriched.reduce((best, item) => (!best || item.revenueShare > best.revenueShare ? item : best), null);
    const bestProfitRate = enriched.reduce((best, item) => (!best || profitRateOf(item) > profitRateOf(best) ? item : best), null);
    const weakProfitRate = enriched.reduce((best, item) => (!best || profitRateOf(item) < profitRateOf(best) ? item : best), null);
    const bestRows = enriched.reduce((best, item) => (!best || item.rowShare > best.rowShare ? item : best), null);
    const maxRevenueShare = Math.max(1, ...enriched.map(item => item.revenueShare));
    const revenueRank = new Map([...enriched].sort((a, b) => b.revenueShare - a.revenueShare).map((item, idx) => [item.label || item.day, idx + 1]));
    const tones = ['#ef4444', '#0f766e', '#2563eb', '#7c3aed', '#0891b2', '#ea580c', '#475569'];
    const summaryCards = [
        { label: '매출 중심', item: bestRevenue, value: bestRevenue ? formatPercent(bestRevenue.revenueShare, 1) : '-', note: bestRevenue ? formatPerformanceAmount(bestRevenue.revenue) : '-' },
        { label: '업무량 중심', item: bestRows, value: bestRows ? formatPercent(bestRows.rowShare, 1) : '-', note: bestRows ? `${safeNumber(bestRows.rowCount).toLocaleString('ko-KR')}건` : '-' },
        { label: '수익성 최고', item: bestProfitRate, value: bestProfitRate ? formatPercent(profitRateOf(bestProfitRate), 1) : '-', note: bestProfitRate ? formatPerformanceAmount(bestProfitRate.profit) : '-' },
        { label: '점검 요일', item: weakProfitRate, value: weakProfitRate ? formatPercent(profitRateOf(weakProfitRate), 1) : '-', note: weakProfitRate ? formatPerformanceAmount(weakProfitRate.profit) : '-' },
    ];

    return (
        <section className={styles.panel}>
            <div className={styles.panelHeader}>
                <h3>요일별 매출·이익 지도</h3>
                <span>{scopeLabel} · 작업일자 기준</span>
            </div>
            {series.length === 0 ? (
                <div className={styles.emptyPanel}>요일별 원장 분석 데이터가 아직 없습니다.</div>
            ) : (
                <>
                    <div className={styles.weekdaySummaryGrid}>
                        {summaryCards.map(card => (
                            <div className={styles.weekdaySummaryCard} key={card.label}>
                                <span>{card.label}</span>
                                <strong>{card.item?.label || '-'}</strong>
                                <b>{card.value}</b>
                                <em>{card.note}</em>
                            </div>
                        ))}
                    </div>
                    <div className={styles.weekdayRevenueRibbon}>
                        <strong>매출 분포</strong>
                        <div>
                            {enriched.map((item, idx) => (
                                <span
                                    key={item.label || item.day}
                                    style={{ width: `${Math.max(2.5, item.revenueShare)}%`, '--weekday-accent': tones[idx % tones.length] }}
                                    title={`${item.label}요일 매출 비중 ${formatPercent(item.revenueShare, 1)} · ${formatPerformanceAmount(item.revenue)}`}
                                >
                                    {item.revenueShare >= 7 ? `${item.label} ${formatPercent(item.revenueShare, 1)}` : item.label}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className={styles.weekdayDiagram}>
                        {enriched.map((item, idx) => {
                            const profitRate = profitRateOf(item);
                            const isPeak = bestRevenue && (bestRevenue.label || bestRevenue.day) === (item.label || item.day);
                            const isWeak = weakProfitRate && (weakProfitRate.label || weakProfitRate.day) === (item.label || item.day);
                            const barHeight = Math.max(10, Math.min(100, item.revenueShare / maxRevenueShare * 100));
                            const accent = tones[idx % tones.length];
                            const rank = revenueRank.get(item.label || item.day) || idx + 1;
                            return (
                                <article
                                    key={item.label || item.day}
                                    className={`${styles.weekdayDiagramRow} ${isPeak ? styles.weekdayPeak : ''} ${isWeak ? styles.weekdayWeak : ''}`}
                                    style={{ '--weekday-accent': accent, '--weekday-bar-height': `${barHeight}%` }}
                                    title={`${item.label}요일 매출 ${formatPerformanceAmount(item.revenue)} / 이익 ${formatPerformanceAmount(item.profit)} / ${safeNumber(item.rowCount).toLocaleString('ko-KR')}건`}
                                >
                                    <div className={styles.weekdayCardHead}>
                                        <strong>{item.label}요일</strong>
                                        <em>{rank}위</em>
                                    </div>
                                    <div className={styles.weekdayColumnStage}>
                                        <div className={styles.weekdayColumnFill}>
                                            <b>{formatPercent(item.revenueShare, 1)}</b>
                                            <span>매출 비중</span>
                                        </div>
                                    </div>
                                    <div className={styles.weekdayMetricGrid}>
                                        <span>이익 기여 <strong className={item.profitShare < 0 ? styles.warningText : styles.positive}>{formatPercent(item.profitShare, 1)}</strong></span>
                                        <span>건수 비중 <strong>{formatPercent(item.rowShare, 1)}</strong></span>
                                        <span>이익률 <strong className={profitRate < 5 ? styles.warningText : styles.positive}>{formatPercent(profitRate, 1)}</strong></span>
                                    </div>
                                    <p>{formatPerformanceAmount(item.revenue)} · 이익 {formatPerformanceAmount(item.profit)} · {safeNumber(item.rowCount).toLocaleString('ko-KR')}건</p>
                                </article>
                            );
                        })}
                    </div>
                </>
            )}
        </section>
    );
}

function YearMonthHeatmap({ monthly = [], onSelectPeriod = null }) {
    const series = normalizeSeries(monthly);
    const years = Array.from(new Set(series.map(item => String(item.year || String(item.period || '').slice(0, 4))))).filter(Boolean);
    const byPeriod = new Map(series.map(item => [item.period, item]));
    const maxRevenue = Math.max(1, ...series.map(item => Math.abs(safeNumber(item.revenue))));

    return (
        <div className={styles.heatmap}>
            <div className={styles.heatHead}>
                <span>연도</span>
                {Array.from({ length: 12 }, (_, idx) => <span key={idx}>{idx + 1}월</span>)}
            </div>
            {years.map(year => (
                <div className={styles.heatRow} key={year}>
                    <strong>{year}</strong>
                    {Array.from({ length: 12 }, (_, idx) => {
                        const period = `${year}-${String(idx + 1).padStart(2, '0')}`;
                        const item = byPeriod.get(period);
                        const intensity = item ? Math.max(0.08, Math.min(1, Math.abs(safeNumber(item.revenue)) / maxRevenue)) : 0;
                        const margin = profitRateOf(item);
                        return (
                            <button
                                key={period}
                                className={styles.heatCell}
                                style={{ '--heat': intensity }}
                                onClick={() => item && onSelectPeriod?.(period)}
                                title={`${period}\n매출 ${formatPerformanceAmount(item?.revenue)}\n이익 ${formatPerformanceAmount(item?.profit)}\n이익률 ${formatPercent(margin)}`}
                                disabled={!item}
                            >
                                <span>{item ? formatPerformanceAmount(item.revenue, { unit: '' }) : '-'}</span>
                                <em className={margin < 5 ? styles.warningText : ''}>{item ? formatPercent(margin, 0) : '-'}</em>
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

function EvidenceHelp() {
    return (
        <div className={styles.evidenceHelp}>
            <strong>등급 기준</strong>
            <span>수익성 양호: 전체 이익률 10% 이상. 마진 관리: 5~10%. 저마진 주의: 0~5%. 이익 위험: 0% 이하.</span>
            <strong>금액 기준</strong>
            <span>매출은 청구, 매입은 하불, 이익은 청구 - 하불로 집계합니다. 모든 합계는 원장 행의 원 단위 값을 합산한 뒤 화면에서만 억/만 원으로 축약합니다.</span>
            <strong>상세 보기 기준</strong>
            <span>분석 항목의 상세 버튼은 테이블 탭으로 이동해 AND 검색을 적용합니다. 예: ELS솔루션 + 직계약은 두 단어가 모두 있는 원장 행만 보여줍니다.</span>
        </div>
    );
}

function SegmentEvidenceTable({ label, items = [], filterTerms = [], onOpen }) {
    const visibleItems = (Array.isArray(items) ? items : []).slice(0, 12);
    return (
        <section className={styles.panel}>
            <div className={styles.panelHeader}>
                <h3>{label} 근거</h3>
                <span>상위 12</span>
            </div>
            <div className={styles.evidenceTable}>
                <div className={styles.evidenceTableHead}>
                    <span>항목</span>
                    <span>매출</span>
                    <span>매입</span>
                    <span>이익</span>
                    <span>이익률</span>
                </div>
                {visibleItems.length === 0 ? (
                    <div className={styles.emptyMini}>근거 데이터 없음</div>
                ) : visibleItems.map((item, idx) => (
                    <button
                        className={styles.evidenceTableRow}
                        key={`${label}-${item.name}-${idx}`}
                        onClick={() => onOpen([...(filterTerms || []), item.name], 'and')}
                    >
                        <span title={item.name}>{item.name || '-'}</span>
                        <b>{formatPerformanceAmount(item.revenue)}</b>
                        <b>{formatPerformanceAmount(item.purchase)}</b>
                        <em className={safeNumber(item.profit) < 0 ? styles.negative : styles.positive}>
                            {formatPerformanceAmount(item.profit)}
                        </em>
                        <i className={profitRateOf(item) < 5 ? styles.warningText : ''}>{formatPercent(profitRateOf(item), 1)}</i>
                    </button>
                ))}
            </div>
        </section>
    );
}

function RouteUnitUnitTrendChart({ item = null, scopeLabel = '-', basis = '연도별' }) {
    const series = normalizeSeries(item?.series || []);
    const width = 940;
    const height = 246;
    const pad = { left: 58, right: 42, top: 30, bottom: 46 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const maxUnit = Math.max(1, ...series.flatMap(row => [safeNumber(row.unitRevenue), safeNumber(row.unitPurchase)]));
    const xAt = idx => pad.left + (series.length <= 1 ? 0 : (idx / (series.length - 1)) * chartW);
    const yAt = value => pad.top + chartH - (safeNumber(value) / maxUnit) * chartH;
    const linePoints = field => series.map((row, idx) => `${xAt(idx).toFixed(1)},${yAt(row[field]).toFixed(1)}`).join(' ');
    const avgRevenue = series.length ? sumField(series, 'unitRevenue') / series.length : 0;
    const avgPurchase = series.length ? sumField(series, 'unitPurchase') / series.length : 0;
    const recent = series[series.length - 1] || null;
    const highRevenue = series.reduce((best, row) => (!best || safeNumber(row.unitRevenue) > safeNumber(best.unitRevenue) ? row : best), null);
    const lowProfit = series.reduce((best, row) => (!best || safeNumber(row.unitProfit) < safeNumber(best.unitProfit) ? row : best), null);
    const tickEvery = Math.max(1, Math.ceil(series.length / 7));

    return (
        <section className={styles.routeUnitTrend}>
            <div className={styles.panelHeader}>
                <h3>선택 구간 단가 변동</h3>
                <span>{scopeLabel} · {basis} · 건당 청구/하불</span>
            </div>
            {!item || series.length < 2 ? (
                <div className={styles.emptyPanel}>선택 구간의 기간별 단가 변동 데이터가 부족합니다.</div>
            ) : (
                <>
                    <svg className={styles.routeUnitTrendSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="구간단가 변동 차트">
                        {[0.25, 0.5, 0.75, 1].map(ratio => (
                            <line
                                key={ratio}
                                x1={pad.left}
                                y1={pad.top + chartH - chartH * ratio}
                                x2={width - pad.right}
                                y2={pad.top + chartH - chartH * ratio}
                                className={styles.axisLine}
                            />
                        ))}
                        <line x1={pad.left} y1={yAt(avgRevenue)} x2={width - pad.right} y2={yAt(avgRevenue)} className={styles.trendAvgRevenueLine} />
                        <line x1={pad.left} y1={yAt(avgPurchase)} x2={width - pad.right} y2={yAt(avgPurchase)} className={styles.trendAvgProfitLine} />
                        <polyline points={linePoints('unitRevenue')} className={styles.revenueLine} />
                        <polyline points={linePoints('unitPurchase')} className={styles.purchaseLine} />
                        <text x={width - pad.right} y={Math.max(14, yAt(avgRevenue) - 7)} textAnchor="end" className={styles.trendAvgLabel}>
                            청구 평균 {formatPerformanceAmount(avgRevenue)}
                        </text>
                        <text x={width - pad.right} y={Math.min(height - 10, yAt(avgPurchase) + 16)} textAnchor="end" className={styles.trendAvgLabel}>
                            하불 평균 {formatPerformanceAmount(avgPurchase)}
                        </text>
                        {highRevenue && (
                            <g>
                                <circle cx={xAt(series.indexOf(highRevenue))} cy={yAt(highRevenue.unitRevenue)} r="5" className={styles.trendRevenuePoint}>
                                    <title>{`${highRevenue.label || highRevenue.key} 최고 청구단가 ${formatPerformanceAmount(highRevenue.unitRevenue)}`}</title>
                                </circle>
                                <text x={xAt(series.indexOf(highRevenue))} y={Math.max(14, yAt(highRevenue.unitRevenue) - 10)} className={styles.trendMarkerLabel} textAnchor="middle">청구 최고</text>
                            </g>
                        )}
                        {lowProfit && (
                            <g>
                                <circle cx={xAt(series.indexOf(lowProfit))} cy={yAt(Math.max(0, lowProfit.unitPurchase))} r="4.5" className={styles.trendLossPoint}>
                                    <title>{`${lowProfit.label || lowProfit.key} 최저 차액 ${formatPerformanceAmount(lowProfit.unitProfit)}`}</title>
                                </circle>
                                <text x={xAt(series.indexOf(lowProfit))} y={Math.min(height - 10, yAt(Math.max(0, lowProfit.unitPurchase)) + 18)} className={styles.trendMarkerLabel} textAnchor="middle">차액 최저</text>
                            </g>
                        )}
                        {recent && (
                            <g>
                                <circle cx={xAt(series.length - 1)} cy={yAt(recent.unitRevenue)} r="4.5" className={styles.trendRecentPoint}>
                                    <title>{`${recent.label || recent.key} 최근 청구 ${formatPerformanceAmount(recent.unitRevenue)}, 하불 ${formatPerformanceAmount(recent.unitPurchase)}`}</title>
                                </circle>
                                <text x={Math.min(width - 40, xAt(series.length - 1))} y={Math.max(14, yAt(recent.unitRevenue) - 10)} className={styles.trendMarkerLabel} textAnchor="end">최근</text>
                            </g>
                        )}
                        {series.filter((_, idx) => idx % tickEvery === 0 || idx === series.length - 1).map((row, idx) => (
                            <text key={`${row.key}-${idx}`} x={xAt(series.indexOf(row))} y={height - 16} className={styles.axisLabel} textAnchor="middle">
                                {row.label || row.key}
                            </text>
                        ))}
                    </svg>
                    <div className={styles.routeUnitTrendSummary}>
                        <div><span>최근 청구단가</span><strong>{formatPerformanceAmount(recent?.unitRevenue)}</strong><em>{recent?.label || '-'}</em></div>
                        <div><span>최근 하불단가</span><strong>{formatPerformanceAmount(recent?.unitPurchase)}</strong><em>건당 기준</em></div>
                        <div><span>최고 청구단가</span><strong>{formatPerformanceAmount(highRevenue?.unitRevenue)}</strong><em>{highRevenue?.label || '-'}</em></div>
                        <div><span>최저 차액</span><strong>{formatPerformanceAmount(lowProfit?.unitProfit)}</strong><em>{lowProfit?.label || '-'}</em></div>
                    </div>
                </>
            )}
        </section>
    );
}

function RouteUnitPricePanel({
    data,
    loading,
    error,
    scope,
    setScope,
    years,
    year,
    setYear,
    months,
    month,
    setMonth,
    selectedKey,
    setSelectedKey,
    onRefresh,
    onOpenDetail,
}) {
    const groups = Array.isArray(data?.groups) ? data.groups : EMPTY_LIST;
    const selected = groups.find(item => item.key === selectedKey) || groups[0] || null;
    const totals = data?.totals || {};
    const maxRevenue = Math.max(1, ...groups.map(item => Math.abs(safeNumber(item.revenue))));
    const scopeButtons = [
        { key: 'all', label: '전체' },
        { key: 'year', label: '연도별' },
        { key: 'month', label: '월별' },
    ];

    return (
        <div className={styles.routeUnitShell}>
            <section className={styles.routeUnitControls}>
                <div>
                    <span>수집범위</span>
                    <strong>{data?.scope?.label || (scope === 'all' ? '전체 기간' : '-')}</strong>
                    <em>마감월 기준 · 픽업-지역-작업지-하차</em>
                </div>
                <div className={styles.routeUnitScopeButtons}>
                    {scopeButtons.map(item => (
                        <button
                            key={item.key}
                            className={scope === item.key ? styles.scopeActive : ''}
                            onClick={() => setScope(item.key)}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
                <select
                    aria-label="구간단가 연도"
                    disabled={scope === 'all'}
                    value={year || ''}
                    onChange={event => setYear(event.target.value)}
                >
                    {years.map(item => <option key={item} value={item}>{item}년</option>)}
                </select>
                <select
                    aria-label="구간단가 마감월"
                    disabled={scope !== 'month'}
                    value={month || ''}
                    onChange={event => setMonth(event.target.value)}
                >
                    {months.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                <button className={styles.ghostBtn} onClick={() => onRefresh({ refresh: true })} disabled={loading}>
                    {loading ? '조회중' : '갱신'}
                </button>
            </section>

            {error && <div className={styles.errorBox}>{error}</div>}

            <div className={styles.routeUnitKpis}>
                <div><span>청구 합계</span><strong>{formatPerformanceAmount(totals.revenue)}</strong><em>{safeNumber(totals.rowCount).toLocaleString('ko-KR')}건</em></div>
                <div><span>하불 합계</span><strong>{formatPerformanceAmount(totals.purchase)}</strong><em>건당 {formatPerformanceAmount(totals.unitPurchase)}</em></div>
                <div><span>차액</span><strong className={safeNumber(totals.profit) < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(totals.profit)}</strong><em>건당 {formatPerformanceAmount(totals.unitProfit)}</em></div>
                <div><span>표시 구간</span><strong>{groups.length.toLocaleString('ko-KR')}</strong><em>{data?.engine || 'supabase'} 집계</em></div>
            </div>

            <div className={styles.routeUnitLayout}>
                <section className={styles.routeUnitListPanel}>
                    <div className={styles.panelHeader}>
                        <h3>구간별 단가 목록</h3>
                        <span>매출열 · 청구처 · 지급처 · TYPE · 청구/하불</span>
                    </div>
                    {loading && !groups.length ? (
                        <div className={styles.emptyPanel}>구간단가를 집계하는 중입니다...</div>
                    ) : !groups.length ? (
                        <div className={styles.emptyPanel}>구간단가 데이터가 없습니다.</div>
                    ) : (
                        <div className={styles.routeUnitRows}>
                            <div className={styles.routeUnitHead}>
                                <span>구간</span>
                                <span>매출열</span>
                                <span>청구처</span>
                                <span>지급처</span>
                                <span>TYPE</span>
                                <span>청구</span>
                                <span>하불</span>
                                <span>건당 청구</span>
                                <span>건수</span>
                            </div>
                            {groups.map(item => (
                                <button
                                    key={item.key}
                                    className={`${styles.routeUnitRow} ${selected?.key === item.key ? styles.routeUnitRowActive : ''}`}
                                    onClick={() => setSelectedKey(item.key)}
                                >
                                    <span title={item.routeLabel}>{item.routeLabel}</span>
                                    <span>{item.salesItem}</span>
                                    <span>{item.billTo}</span>
                                    <span>{item.payTo}</span>
                                    <span>{item.type}</span>
                                    <b>{formatPerformanceAmount(item.revenue)}</b>
                                    <b>{formatPerformanceAmount(item.purchase)}</b>
                                    <b>{formatPerformanceAmount(item.unitRevenue)}</b>
                                    <em>{safeNumber(item.rowCount).toLocaleString('ko-KR')}</em>
                                    <i><DataBar value={item.revenue} max={maxRevenue} tone="revenue" /></i>
                                </button>
                            ))}
                        </div>
                    )}
                </section>

                <div className={styles.routeUnitDetailStack}>
                    <section className={styles.routeUnitSelectedCard}>
                        <div className={styles.panelHeader}>
                            <h3>선택 구간</h3>
                            <button
                                className={styles.inlineAction}
                                disabled={!selected}
                                onClick={() => selected && onOpenDetail([
                                    selected.pickup,
                                    selected.region,
                                    selected.workSite,
                                    selected.unload,
                                    selected.salesItem,
                                    selected.billTo,
                                    selected.payTo,
                                    selected.type,
                                ].filter(Boolean), 'and')}
                            >
                                원장 상세
                            </button>
                        </div>
                        {selected ? (
                            <>
                                <strong className={styles.routeUnitRoute}>{selected.routeLabel}</strong>
                                <div className={styles.routeUnitMetaGrid}>
                                    <div><span>매출열</span><b>{selected.salesItem}</b></div>
                                    <div><span>청구처</span><b>{selected.billTo}</b></div>
                                    <div><span>지급처</span><b>{selected.payTo}</b></div>
                                    <div><span>TYPE</span><b>{selected.type}</b></div>
                                </div>
                                <div className={styles.routeUnitAmountGrid}>
                                    <div><span>청구</span><strong>{formatPerformanceAmount(selected.revenue)}</strong><em>건당 {formatPerformanceAmount(selected.unitRevenue)}</em></div>
                                    <div><span>하불</span><strong>{formatPerformanceAmount(selected.purchase)}</strong><em>건당 {formatPerformanceAmount(selected.unitPurchase)}</em></div>
                                    <div><span>차액</span><strong className={safeNumber(selected.profit) < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(selected.profit)}</strong><em>건당 {formatPerformanceAmount(selected.unitProfit)}</em></div>
                                </div>
                            </>
                        ) : (
                            <div className={styles.emptyPanel}>선택된 구간이 없습니다.</div>
                        )}
                    </section>
                    <RouteUnitUnitTrendChart item={selected} scopeLabel={data?.scope?.label || '-'} basis={data?.trendBasis || '연도별'} />
                </div>
            </div>
        </div>
    );
}

export default function AsanAnnualPerformance({ searchHandoff = null, initialAnalysisView = 'overview', title = '연간실적' }) {
    const [selectedPath, setSelectedPath] = useState(DEFAULT_ANNUAL_PERFORMANCE_PATH);
    const [sheetName, setSheetName] = useState(DEFAULT_ANNUAL_PERFORMANCE_SHEET);
    const [headerRow, setHeaderRow] = useState('');
    const [payload, setPayload] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [tableLoading, setTableLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState(null);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('analytics');
    const [analysisView, setAnalysisView] = useState(initialAnalysisView || 'overview');
    const [selectedSegmentKey, setSelectedSegmentKey] = useState('own_direct');
    const [scopeMode, setScopeMode] = useState('all');
    const [scopeStart, setScopeStart] = useState('');
    const [scopeEnd, setScopeEnd] = useState('');
    const [routeUnitScope, setRouteUnitScope] = useState('all');
    const [routeUnitYear, setRouteUnitYear] = useState('');
    const [routeUnitMonth, setRouteUnitMonth] = useState('');
    const [routeUnitData, setRouteUnitData] = useState(null);
    const [routeUnitLoading, setRouteUnitLoading] = useState(false);
    const [routeUnitError, setRouteUnitError] = useState('');
    const [selectedRouteUnitKey, setSelectedRouteUnitKey] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchMode, setSearchMode] = useState('or');
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
    const syncWasRunningRef = useRef(false);
    const searchEffectReadyRef = useRef(false);
    const appliedSearchHandoffRef = useRef(null);

    useEffect(() => {
        setAnalysisView(initialAnalysisView || 'overview');
    }, [initialAnalysisView]);

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

    const applySyncStatus = useCallback((status) => {
        if (!status) return { running: false, finished: false };
        const running = Boolean(status.running);
        const finished = syncWasRunningRef.current && !running;
        syncWasRunningRef.current = running;
        setSyncStatus(status);
        setSyncing(running);
        if (!running && status.last_error) {
            setError(status.last_error);
        }
        return { running, finished };
    }, []);

    const applyPayload = useCallback((nextPayload, options = {}) => {
        if (!nextPayload) return;
        if (nextPayload.sync_status) {
            applySyncStatus(nextPayload.sync_status);
        }
        if (nextPayload.sync_only) {
            setPayload(prev => prev || nextPayload);
            return;
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
        const tableRequest = !append && (activeTab === 'table' || Boolean(options.search) || Boolean(options.sortKey));
        const requestId = append ? requestIdRef.current : requestIdRef.current + 1;
        if (!append) requestIdRef.current = requestId;

        if (append) {
            setLoadingMore(true);
        } else if (!quiet) {
            setLoading(true);
        }
        if (tableRequest) setTableLoading(true);
        setError('');
        if (!append) setNotice('');

        try {
            const params = new URLSearchParams({
                path: normalizePerformancePath(options.path || selectedPath),
                sheet_name: options.sheetName || sheetName || DEFAULT_ANNUAL_PERFORMANCE_SHEET,
                aggregate: 'all',
                page: String(page),
                page_size: String(PAGE_SIZE),
                source: 'supabase',
            });
            const effectiveHeaderRow = options.headerRow ?? headerRow;
            if (effectiveHeaderRow) params.set('header_row', String(effectiveHeaderRow));
            const tableMode = activeTab === 'table' || append || Boolean(options.search) || Boolean(options.sortKey);
            const effectiveSearch = tableMode ? (options.search ?? searchTerm) : '';
            if (effectiveSearch) params.set('search', effectiveSearch);
            const effectiveSearchMode = options.searchMode ?? searchMode;
            if (effectiveSearch) params.set('search_mode', effectiveSearchMode || 'or');
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

            const res = await fetch(`/api/branches/asan/performance/annual?${params.toString()}`);
            const json = await readPerformanceJson(res, '연간실적 조회 실패');
            if (!append && requestId !== requestIdRef.current) return;
            applyPayload(json.data, { append });
        } catch (err) {
            setError(err.message || '연간실적 조회 실패');
        } finally {
            setLoading(false);
            setLoadingMore(false);
            if (tableRequest) setTableLoading(false);
        }
    }, [activeTab, selectedPath, sheetName, headerRow, searchTerm, searchMode, sortConfig, applyPayload]);

    useEffect(() => {
        if (!selectedPath) return;
        fetchData();
    }, [selectedPath, sheetName, headerRow, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const query = String(searchHandoff?.search || '').trim();
        if (!query) return;
        const key = searchHandoff?.id || `${query}:${searchHandoff?.searchMode || 'or'}`;
        if (appliedSearchHandoffRef.current === key) return;
        appliedSearchHandoffRef.current = key;
        const mode = searchHandoff?.searchMode || 'or';
        searchEffectReadyRef.current = true;
        setActiveTab('table');
        setSearchInput(query);
        setSearchTerm(query);
        setSearchMode(mode);
        fetchData({ page: 1, search: query, searchMode: mode, quiet: Boolean(payload) });
    }, [searchHandoff?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchSyncStatus = useCallback(async () => {
        if (!selectedPath) return null;
        try {
            const params = new URLSearchParams({
                source: 'status',
                path: normalizePerformancePath(selectedPath),
                sheet_name: sheetName || DEFAULT_ANNUAL_PERFORMANCE_SHEET,
                page: '1',
                page_size: '1',
            });
            if (headerRow) params.set('header_row', String(headerRow));
            const res = await fetch(`/api/branches/asan/performance/annual?${params.toString()}`, { cache: 'no-store' });
            const json = await readPerformanceJson(res, '연간실적 동기화 상태 조회 실패');
            return applySyncStatus(json.data?.sync_status);
        } catch (err) {
            if (syncWasRunningRef.current) setError(err.message || '연간실적 동기화 상태 조회 실패');
            return null;
        }
    }, [applySyncStatus, headerRow, selectedPath, sheetName]);

    useEffect(() => {
        const timer = setTimeout(fetchSyncStatus, 900);
        return () => clearTimeout(timer);
    }, [fetchSyncStatus]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setSearchTerm(searchInput.trim());
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        if (!selectedPath) return;
        if (!searchEffectReadyRef.current) {
            searchEffectReadyRef.current = true;
            return;
        }
        fetchData({ page: 1, search: searchTerm, searchMode, quiet: Boolean(payload) });
    }, [searchTerm, searchMode, selectedPath]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const vehicleDataQuality = summary.vehicleDataQuality || {};
    const missingVehicle = vehicleDataQuality.missingVehicle || {};
    const totalRows = Number(payload?.total ?? rows.length) || 0;
    const loadedRows = rows.length;
    const canLoadMore = payload?.source === 'supabase' && loadedRows < totalRows;
    const totalRowsLabel = `${totalRows.toLocaleString()}${payload?.total_is_estimated ? '+' : ''}`;
    const visibleColumns = useMemo(() => {
        const hidden = hiddenCols instanceof Set ? hiddenCols : new Set(hiddenCols || []);
        return normalizePerformanceColumnOrder(colOrder, headers).filter(col => !hidden.has(col));
    }, [colOrder, headers, hiddenCols]);
    const yearly = Array.isArray(summary.yearly) ? summary.yearly : EMPTY_LIST;
    const monthly = Array.isArray(summary.monthly) ? summary.monthly : EMPTY_LIST;
    const daily = Array.isArray(summary.daily) ? summary.daily : EMPTY_LIST;
    const weekday = Array.isArray(summary.weekday) ? summary.weekday : EMPTY_LIST;
    const strategicSegments = Array.isArray(summary.strategicSegments) ? summary.strategicSegments : EMPTY_LIST;
    const periodOptions = useMemo(() => getPeriodOptions(monthly), [monthly]);
    const routeUnitYears = useMemo(() => Array.from(new Set(periodOptions.map(period => period.slice(0, 4)).filter(Boolean))).sort(), [periodOptions]);
    const routeUnitMonths = useMemo(() => (
        routeUnitYear
            ? periodOptions.filter(period => period.startsWith(`${routeUnitYear}-`))
            : periodOptions
    ), [periodOptions, routeUnitYear]);
    const scopeBounds = useMemo(() => getScopeBounds({
        mode: scopeMode,
        periods: periodOptions,
        start: scopeStart,
        end: scopeEnd,
    }), [periodOptions, scopeEnd, scopeMode, scopeStart]);
    const scopedMonthly = useMemo(() => filterSeriesByScope(monthly, scopeBounds), [monthly, scopeBounds]);
    const scopedWeekday = useMemo(() => buildWeekdaySeries({ daily, weekday, scopeBounds }), [daily, scopeBounds, weekday]);
    const scopedTotals = useMemo(() => {
        const totals = sumSeriesMetrics(scopedMonthly);
        if (!monthly.length) {
            return {
                revenue: safeNumber(summary.totalRevenue),
                purchase: safeNumber(summary.totalPurchase),
                profit: safeNumber(summary.totalProfit),
                rowCount: safeNumber(summary.analysisRows || totalRows),
            };
        }
        return totals;
    }, [monthly.length, scopedMonthly, summary.analysisRows, summary.totalProfit, summary.totalPurchase, summary.totalRevenue, totalRows]);
    const scopedStrategicSegments = useMemo(() => (
        strategicSegments.map(segment => scopeStrategicSegment(segment, scopeBounds, scopedTotals.revenue))
    ), [scopeBounds, scopedTotals.revenue, strategicSegments]);
    const scopedTimeFlow = useMemo(() => buildScopedTimeFlow(scopedMonthly, scopeBounds), [scopeBounds, scopedMonthly]);
    const timeFlowItems = scopedTimeFlow.items;
    const breakdowns = Array.isArray(summary.breakdowns) ? summary.breakdowns : EMPTY_LIST;
    const topGroups = Array.isArray(summary.topGroups) ? summary.topGroups : EMPTY_LIST;
    const vehiclePerformance = Array.isArray(summary.vehiclePerformance)
        ? summary.vehiclePerformance
        : (breakdowns.find(section => String(section.column || '').includes('영업넘버'))?.items || EMPTY_LIST);
    const scopedVehiclePerformance = useMemo(() => (
        vehiclePerformance
            .map(item => scopePerformanceItem(item, scopeBounds, scopedTotals.revenue))
            .filter(item => safeNumber(item.revenue) || safeNumber(item.purchase) || safeNumber(item.profit))
            .sort((a, b) => Math.abs(safeNumber(b.revenue)) - Math.abs(safeNumber(a.revenue)))
    ), [scopeBounds, scopedTotals.revenue, vehiclePerformance]);
    const timeFlowChartMax = getPerformanceChartMax(timeFlowItems, ['revenue', 'purchase', 'profit']);
    const analysisRows = Number(scopedTotals.rowCount || 0) || 0;
    const avgRevenue = analysisRows ? scopedTotals.revenue / analysisRows : 0;
    const avgProfit = analysisRows ? scopedTotals.profit / analysisRows : 0;
    const purchaseRate = rate(scopedTotals.purchase, scopedTotals.revenue);
    const profitRate = rate(scopedTotals.profit, scopedTotals.revenue);
    const performanceGrade = getPerformanceGrade(profitRate);
    const latestMonth = scopedMonthly[scopedMonthly.length - 1] || null;
    const previousMonth = scopedMonthly[scopedMonthly.length - 2] || null;
    const dimensionOptions = useMemo(() => {
        return breakdowns
            .filter(section => Array.isArray(section.items) && section.items.length)
            .slice()
            .sort((a, b) => getDimensionScore(a.column) - getDimensionScore(b.column));
    }, [breakdowns]);
    const activeBreakdown = useMemo(() => (
        dimensionOptions.find(section => section.column === activeDimension) || dimensionOptions[0] || null
    ), [dimensionOptions, activeDimension]);
    const activeItems = useMemo(() => (
        (activeBreakdown?.items || [])
            .map(item => scopePerformanceItem(item, scopeBounds, scopedTotals.revenue))
            .filter(item => safeNumber(item.revenue) || safeNumber(item.purchase) || safeNumber(item.profit))
            .sort((a, b) => Math.abs(safeNumber(b.revenue)) - Math.abs(safeNumber(a.revenue)))
    ), [activeBreakdown, scopeBounds, scopedTotals.revenue]);
    const activeBreakdownHasMonthly = Boolean((activeBreakdown?.items || []).some(item => Array.isArray(item.monthly) && item.monthly.length));
    const activeBreakdownNeedsRefresh = Boolean(
        activeBreakdown?.items?.length
        && !scopeBounds.isFullRange
        && !activeBreakdownHasMonthly
    );
    const evidenceItems = activeItems;
    const evidenceBasisLabel = activeBreakdownNeedsRefresh ? '구간별 월별 근거 갱신 필요' : null;
    const topSegment = evidenceItems[0] || (scopeBounds.isFullRange ? topGroups[0] : null);
    const top3Share = sumField(evidenceItems.slice(0, 3), 'revenueShare');
    const top10Share = sumField(evidenceItems.slice(0, 10), 'revenueShare');
    const lowMarginItems = evidenceItems
        .filter(item => safeNumber(item.revenue) > 0 && profitRateOf(item) < Math.max(3, profitRate - 2))
        .slice(0, 5);
    const lossItems = evidenceItems
        .filter(item => safeNumber(item.profit) < 0)
        .sort((a, b) => safeNumber(a.profit) - safeNumber(b.profit))
        .slice(0, 5);
    const marginLeaders = evidenceItems
        .filter(item => safeNumber(item.revenue) > 0)
        .slice()
        .sort((a, b) => profitRateOf(b) - profitRateOf(a))
        .slice(0, 5);
    const bridgeMax = Math.max(1, Math.abs(scopedTotals.revenue), Math.abs(scopedTotals.purchase), Math.abs(scopedTotals.profit));
    const executiveNotes = buildExecutiveNotes({
        profitRate,
        purchaseRate,
        latestMonth,
        previousMonth,
        topSegment,
        top3Share,
        lowMarginItems,
    });
    const selectedSegment = scopedStrategicSegments.find(item => item.key === selectedSegmentKey) || scopedStrategicSegments.find(item => item.key === 'own_direct') || scopedStrategicSegments[0] || null;
    const ledgerValidation = summary.ledgerValidation || {};
    const amountQuality = summary.amountQuality || ledgerValidation.amountQuality || {};
    const dateQuality = summary.dateQuality || ledgerValidation.dateQuality || {};

    useEffect(() => {
        if (!dimensionOptions.length) return;
        if (!activeDimension || !dimensionOptions.some(section => section.column === activeDimension)) {
            setActiveDimension(dimensionOptions[0].column);
        }
    }, [activeDimension, dimensionOptions]);

    useEffect(() => {
        if (!strategicSegments.length) return;
        if (!strategicSegments.some(item => item.key === selectedSegmentKey)) {
            setSelectedSegmentKey(strategicSegments[0].key);
        }
    }, [strategicSegments, selectedSegmentKey]);

    useEffect(() => {
        if (!periodOptions.length) return;
        if (!scopeStart || !periodOptions.includes(scopeStart)) setScopeStart(periodOptions[0]);
        if (!scopeEnd || !periodOptions.includes(scopeEnd)) setScopeEnd(periodOptions[periodOptions.length - 1]);
    }, [periodOptions, scopeEnd, scopeStart]);

    useEffect(() => {
        if (!routeUnitYears.length) return;
        if (!routeUnitYear || !routeUnitYears.includes(routeUnitYear)) {
            setRouteUnitYear(routeUnitYears[routeUnitYears.length - 1]);
        }
    }, [routeUnitYear, routeUnitYears]);

    useEffect(() => {
        if (!routeUnitMonths.length) return;
        if (!routeUnitMonth || !routeUnitMonths.includes(routeUnitMonth)) {
            setRouteUnitMonth(routeUnitMonths[routeUnitMonths.length - 1]);
        }
    }, [routeUnitMonth, routeUnitMonths]);

    const fetchRouteUnitData = useCallback(async (options = {}) => {
        if (routeUnitScope === 'year' && !routeUnitYear) return;
        if (routeUnitScope === 'month' && !routeUnitMonth) return;
        setRouteUnitLoading(true);
        setRouteUnitError('');
        try {
            const params = new URLSearchParams({
                source: 'supabase',
                analysis: 'route-unit-price',
                unit_scope: routeUnitScope,
            });
            if (routeUnitScope === 'year') params.set('unit_year', routeUnitYear);
            if (routeUnitScope === 'month') {
                params.set('unit_month', routeUnitMonth);
                params.set('unit_year', routeUnitMonth.slice(0, 4));
            }
            if (options.refresh) params.set('refresh_snapshot', '1');
            const res = await fetch(`/api/branches/asan/performance/annual?${params.toString()}`, { cache: 'no-store' });
            const json = await readPerformanceJson(res, '구간단가 조회 실패');
            const nextData = json.data?.routeUnitPrice || null;
            setRouteUnitData(nextData);
            const nextGroups = Array.isArray(nextData?.groups) ? nextData.groups : [];
            setSelectedRouteUnitKey(prev => (
                nextGroups.some(item => item.key === prev) ? prev : (nextGroups[0]?.key || '')
            ));
        } catch (err) {
            setRouteUnitError(err.message || '구간단가 조회 실패');
        } finally {
            setRouteUnitLoading(false);
        }
    }, [routeUnitMonth, routeUnitScope, routeUnitYear]);

    useEffect(() => {
        if (activeTab !== 'analytics' || analysisView !== 'route-unit') return;
        fetchRouteUnitData();
    }, [activeTab, analysisView, fetchRouteUnitData]);

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
                    search_mode: searchMode,
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

    const openDetailSearch = (terms = [], mode = 'and') => {
        const query = terms.filter(Boolean).join(',');
        setSearchInput(query);
        setSearchTerm(query);
        setSearchMode(mode);
        setActiveTab('table');
        fetchData({ page: 1, search: query, searchMode: mode, quiet: true });
    };

    useEffect(() => {
        if (!syncing) return undefined;
        const timer = setInterval(async () => {
            const statusResult = await fetchSyncStatus();
            if (statusResult?.finished) fetchData({ page: 1, quiet: true });
        }, 5000);
        return () => clearInterval(timer);
    }, [syncing, fetchData, fetchSyncStatus]);

    const loadNextPage = () => {
        if (!canLoadMore || loadingMore) return;
        const nextPage = Math.floor(loadedRows / PAGE_SIZE) + 1;
        fetchData({ page: nextPage, append: true });
    };

    const downloadTableExcel = async () => {
        if (!headers.length || !visibleColumns.length) {
            setError('다운로드할 컬럼이 없습니다.');
            return;
        }
        setExporting(true);
        setError('');
        setNotice('');
        try {
            const params = new URLSearchParams({
                path: normalizePerformancePath(selectedPath),
                sheet_name: sheetName || DEFAULT_ANNUAL_PERFORMANCE_SHEET,
                aggregate: 'all',
            });
            if (headerRow) params.set('header_row', String(headerRow));
            if (searchTerm) {
                params.set('search', searchTerm);
                params.set('search_mode', searchMode || 'or');
            }
            if (sortConfig.key) {
                params.set('sort_key', sortConfig.key);
                params.set('sort_dir', sortConfig.direction || 'asc');
            }
            const result = await downloadPerformanceTableExcel({
                endpoint: '/api/branches/asan/performance/annual',
                params,
                headers,
                visibleColumns,
                title: '아산 연간실적 테이블',
                sheetName: '연간실적',
                fileNamePrefix: '아산_연간실적_테이블',
                searchTerm,
                searchMode,
            });
            setNotice(`엑셀 다운로드 완료: ${result.exportedRows.toLocaleString('ko-KR')}건${result.capped ? ' (최대 50,000건)' : ''}`);
        } catch (err) {
            setError(err.message || '연간실적 엑셀 다운로드 실패');
        } finally {
            setExporting(false);
        }
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
                    <h2 className={styles.title}>{title}</h2>
                    <div className={styles.metaLine}>
                        <span>파일 {fmtTs(payload?.file_modified_at)}</span>
                        {elapsed && <span className={styles.elapsed}>{elapsed}</span>}
                        <span>{payload?.source || '대기'}</span>
                        <span>{totalRowsLabel}행</span>
                        {syncStatus?.running && <span className={styles.syncBadge}>동기화 진행중</span>}
                        {syncStatus?.running && syncStatus.started_at && <span>시작 {fmtTs(syncStatus.started_at)}</span>}
                        {syncStatus?.finished_at && !syncStatus.running && <span>동기화 {fmtTs(syncStatus.finished_at)}</span>}
                    </div>
                </div>
                <div className={styles.actions}>
                    <div className={styles.segmented}>
                        <button className={activeTab === 'analytics' ? styles.segmentActive : ''} onClick={() => setActiveTab('analytics')}>분석</button>
                        <button className={activeTab === 'table' ? styles.segmentActive : ''} onClick={() => setActiveTab('table')}>테이블</button>
                    </div>
                    <button className={styles.ghostBtn} onClick={() => setShowSettings(true)}>설정</button>
                    <button className={styles.primaryBtn} onClick={syncNow} disabled={syncing}>{syncing ? '동기화 중' : 'NAS 동기화'}</button>
                </div>
            </div>

            {error && <div className={styles.errorBox}>{error}</div>}
            {notice && !error && <div className={styles.noticeBox}>{notice}</div>}

            {loading && !payload ? (
                <div className={styles.emptyState}>데이터를 불러오는 중입니다...</div>
            ) : activeTab === 'analytics' ? (
                <div className={`${styles.analytics} ${styles.annualAnalytics}`}>
                    <section className={styles.commandPanel}>
                        <div className={styles.commandMain}>
                            <div className={styles.commandTitleRow}>
                                <h3>연간 성과 리포트</h3>
                                <span className={`${styles.gradeBadge} ${styles[`grade_${performanceGrade.tone}`]}`}>
                                    {performanceGrade.label}
                                </span>
                            </div>
                            <div className={styles.commandMeta}>
                                <span>기간 {getPeriodRange(scopedMonthly)}</span>
                                <span>분석 {analysisRows.toLocaleString('ko-KR')}행</span>
                                <span>월별 {summary.monthlyBasis || '마감월'} 기준</span>
                                <span>파일 {safeNumber(summary.annualFileCount || 1).toLocaleString('ko-KR')}개 통합</span>
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

                    {analysisView !== 'route-unit' && (
                        <ScopeControls
                            mode={scopeMode}
                            setMode={setScopeMode}
                            start={scopeStart}
                            end={scopeEnd}
                            setStart={setScopeStart}
                            setEnd={setScopeEnd}
                            periods={periodOptions}
                            bounds={scopeBounds}
                            rowCount={analysisRows}
                        />
                    )}

                    <div className={styles.analysisTabs} aria-label="연간실적 분석 섹션">
                        {ANALYSIS_VIEWS.map(view => (
                            <button
                                key={view.key}
                                type="button"
                                className={analysisView === view.key ? styles.analysisTabActive : ''}
                                onClick={() => setAnalysisView(view.key)}
                            >
                                {view.label}
                            </button>
                        ))}
                    </div>

                    {analysisView === 'overview' && (
                        <>
                    <LedgerFlowChart
                        items={scopedMonthly}
                        title="원장 장기 흐름"
                        scopeLabel={scopeBounds.label}
                    />

                    <div className={styles.kpiGrid}>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>조사범위 매출</span>
                            <strong>{formatPerformanceAmount(scopedTotals.revenue)}</strong>
                            <em>건당 매출 {formatPerformanceAmount(avgRevenue)}</em>
                        </div>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>조사범위 매입</span>
                            <strong>{formatPerformanceAmount(scopedTotals.purchase)}</strong>
                            <em>원가율 {formatPercent(purchaseRate)}</em>
                        </div>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>이익</span>
                            <strong className={scopedTotals.profit < 0 ? styles.negative : styles.positive}>
                                {formatPerformanceAmount(scopedTotals.profit)}
                            </strong>
                            <em>건당 {formatPerformanceAmount(avgProfit)}</em>
                        </div>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>이익률</span>
                            <strong>{formatPercent(profitRate, 2)}</strong>
                            <em>{topSegment ? `최대 비중 ${formatPercent(topSegment.revenueShare)}` : '비중 자료 없음'}</em>
                        </div>
                    </div>

                    <div className={styles.reportGrid}>
                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <h3>이익 구조</h3>
                                <span>매출 → 매입 → 이익</span>
                            </div>
                            <div className={styles.bridgeList}>
                                {[
                                    { label: '매출', value: scopedTotals.revenue, tone: 'revenue', sub: '총 청구 기준' },
                                    { label: '매입', value: scopedTotals.purchase, tone: 'purchase', sub: `${formatPercent(purchaseRate)} 사용` },
                                    { label: '이익', value: scopedTotals.profit, tone: scopedTotals.profit < 0 ? 'loss' : 'profit', sub: `${formatPercent(profitRate, 2)} 잔여` },
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
                                    <span>이익 = 매출 - 매입</span>
                                    <strong>{formatPerformanceAmount(scopedTotals.revenue)} - {formatPerformanceAmount(scopedTotals.purchase)} = {formatPerformanceAmount(scopedTotals.profit)}</strong>
                                </div>
                            </div>
                        </section>

                        <section className={`${styles.panel} ${styles.monthPanel}`}>
                            <div className={styles.panelHeader}>
                                <h3>선택범위 성과 흐름</h3>
                                <span>{scopedTimeFlow.label} · {scopeBounds.label} · {scopedTimeFlow.countLabel}</span>
                            </div>
                            <div className={styles.timeFlowChart}>
                                {timeFlowItems.length === 0 ? (
                                    <div className={styles.emptyPanel}>선택범위 분석 데이터가 아직 없습니다.</div>
                                ) : (
                                    <>
                                        <div className={styles.timeFlowHeaderRow}>
                                            <span>구간</span>
                                            <span>매출</span>
                                            <span>매입</span>
                                            <span>이익</span>
                                            <span>이익률</span>
                                        </div>
                                        {timeFlowItems.map(item => (
                                            <div className={styles.timeFlowRow} key={item.period}>
                                                <span>{getFlowItemLabel(item)}</span>
                                                <div><DataBar value={item.revenue} max={timeFlowChartMax} tone="revenue" /><strong>{formatPerformanceAmount(item.revenue)}</strong></div>
                                                <div><DataBar value={item.purchase} max={timeFlowChartMax} tone="purchase" /><strong>{formatPerformanceAmount(item.purchase)}</strong></div>
                                                <div><DataBar value={item.profit} max={timeFlowChartMax} tone={(Number(item.profit) || 0) < 0 ? 'loss' : 'profit'} /><strong>{formatPerformanceAmount(item.profit)}</strong></div>
                                                <em>{formatPercent(profitRateOf(item))}</em>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        </section>
                    </div>

                    <div className={styles.portfolioGrid}>
                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <h3>고마진 항목</h3>
                                <span>{evidenceBasisLabel || '이익률 기준'}</span>
                            </div>
                            <div className={styles.compactList}>
                                {marginLeaders.length === 0 ? (
                                    <div className={styles.emptyMini}>{activeBreakdownNeedsRefresh ? '구간별 월별 근거 갱신 필요' : '고마진 항목 없음'}</div>
                                ) : marginLeaders.map((item, idx) => (
                                    <div className={styles.compactRow} key={`margin-${item.name}-${idx}`}>
                                        <span>{item.name || '미분류'}</span>
                                        <b className={styles.positive}>{formatPercent(profitRateOf(item))}</b>
                                        <em>{formatPerformanceAmount(item.profit)}</em>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <h3>저마진 주의</h3>
                                <span>{evidenceBasisLabel || '매출 상위 내 이익률 낮음'}</span>
                            </div>
                            <div className={styles.compactList}>
                                {lowMarginItems.length === 0 ? (
                                    <div className={styles.emptyMini}>{activeBreakdownNeedsRefresh ? '구간별 월별 근거 갱신 필요' : '주요 저마진 항목 없음'}</div>
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
                                <span>{evidenceBasisLabel || '이익 음수'}</span>
                            </div>
                            <div className={styles.compactList}>
                                {lossItems.length === 0 ? (
                                    <div className={styles.emptyMini}>{activeBreakdownNeedsRefresh ? '구간별 월별 근거 갱신 필요' : '손실 항목 없음'}</div>
                                ) : lossItems.map((item, idx) => (
                                    <div className={styles.compactRow} key={`loss-${item.name}-${idx}`}>
                                        <span>{item.name || '미분류'}</span>
                                        <b className={styles.negative}>{formatPerformanceAmount(item.profit)}</b>
                                        <em>{formatPercent(profitRateOf(item))}</em>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                    <section className={styles.detectPanel}>
                        <span>매출: {(summary.detected?.revenueColumns || []).join(', ') || '자동 후보 없음'}</span>
                        <span>매입: {(summary.detected?.purchaseColumns || []).join(', ') || '자동 후보 없음'}</span>
                        <span>이익: {(summary.detected?.profitColumns || []).join(', ') || '매출-매입'}</span>
                        <span>그룹: {(summary.detected?.groupColumns || []).join(', ') || '자동 후보 없음'}</span>
                        <span>조회: {summary.currentSnapshotId ? '현재 스냅샷 고정' : 'current 행 기준'}</span>
                        <span>원장: 삭제 없이 누적</span>
                    </section>
                        </>
                    )}

                    {analysisView === 'matrix' && (
                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <h3>연도×월 매출/이익 매트릭스</h3>
                                <span>{summary.monthlyBasis || '마감월'} 기준 · {scopedMonthly.length.toLocaleString('ko-KR')}개월</span>
                            </div>
                            <YearMonthHeatmap monthly={scopedMonthly} onSelectPeriod={period => openDetailSearch([period], 'and')} />
                        </section>
                    )}

                    {analysisView === 'route-unit' && (
                        <RouteUnitPricePanel
                            data={routeUnitData}
                            loading={routeUnitLoading}
                            error={routeUnitError}
                            scope={routeUnitScope}
                            setScope={setRouteUnitScope}
                            years={routeUnitYears}
                            year={routeUnitYear}
                            setYear={setRouteUnitYear}
                            months={routeUnitMonths}
                            month={routeUnitMonth}
                            setMonth={setRouteUnitMonth}
                            selectedKey={selectedRouteUnitKey}
                            setSelectedKey={setSelectedRouteUnitKey}
                            onRefresh={fetchRouteUnitData}
                            onOpenDetail={openDetailSearch}
                        />
                    )}

                    {analysisView === 'segments' && (
                        <div className={styles.deepGrid}>
                            <section className={styles.panel}>
                                <div className={styles.panelHeader}>
                                    <h3>계약/명의 세그먼트</h3>
                                    <span>{scopeBounds.label} · ELS솔루션은 외부 운송사와 분리</span>
                                </div>
                                <div className={styles.segmentCards}>
                                    {scopedStrategicSegments.map(segment => (
                                        <button
                                            key={segment.key}
                                            className={selectedSegment?.key === segment.key ? styles.segmentCardActive : ''}
                                            onClick={() => setSelectedSegmentKey(segment.key)}
                                        >
                                            <span>{segment.label}</span>
                                            <strong>{formatPerformanceAmount(segment.revenue)}</strong>
                                            <em>이익률 {formatPercent(segment.profitRate, 2)} · {safeNumber(segment.rowCount).toLocaleString('ko-KR')}건</em>
                                        </button>
                                    ))}
                                </div>
                            </section>
                            {selectedSegment && (
                                <>
                                    <section className={styles.panel}>
                                        <div className={styles.panelHeader}>
                                            <h3>{selectedSegment.label} 분석</h3>
                                            <button
                                                className={styles.inlineAction}
                                                onClick={() => openDetailSearch(selectedSegment.filterTerms || [], 'and')}
                                            >
                                                원장 상세
                                            </button>
                                        </div>
                                        <div className={styles.segmentSummary}>
                                            <p>{selectedSegment.description}</p>
                                            <div>
                                                <span>매출</span><strong>{formatPerformanceAmount(selectedSegment.revenue)}</strong>
                                                <span>매입</span><strong>{formatPerformanceAmount(selectedSegment.purchase)}</strong>
                                                <span>이익</span><strong>{formatPerformanceAmount(selectedSegment.profit)}</strong>
                                                <span>비중</span><strong>{formatPercent(selectedSegment.revenueShare, 2)}</strong>
                                            </div>
                                        </div>
                                    </section>
                                    <MiniTrendChart
                                        items={aggregateMonthlyByBucket(selectedSegment.monthly || [], scopedTimeFlow.bucket)}
                                        title={`${selectedSegment.label} 선택범위 흐름`}
                                        basis={scopedTimeFlow.label}
                                        scopeLabel={scopeBounds.label}
                                    />
                                    <div className={styles.segmentDetailGrid}>
                                        {[
                                            ['작업지', selectedSegment.topWorkSites || []],
                                            ['청구처', selectedSegment.topClients || []],
                                            ['노선', selectedSegment.topRoutes || []],
                                            ['구분', selectedSegment.topCategories || []],
                                        ].map(([label, items]) => (
                                            <SegmentEvidenceTable
                                                key={label}
                                                label={label}
                                                items={items}
                                                filterTerms={selectedSegment.filterTerms || []}
                                                onOpen={openDetailSearch}
                                            />
                                        ))}
                                    </div>
                                </>
                            )}
                            <section className={styles.panel}>
                                <div className={styles.panelHeader}>
                                    <h3>차량별 이익</h3>
                                    <span>{scopeBounds.label} · 영업넘버 기준</span>
                                </div>
                                {safeNumber(missingVehicle.rowCount) > 0 && (
                                    <div className={styles.vehicleQualityStrip}>
                                        <div>
                                            <span>차량번호 미기재</span>
                                            <strong>{safeNumber(missingVehicle.rowCount).toLocaleString('ko-KR')}건</strong>
                                        </div>
                                        <div>
                                            <span>매출</span>
                                            <strong>{formatPerformanceAmount(missingVehicle.revenue)}</strong>
                                        </div>
                                        <div>
                                            <span>매입</span>
                                            <strong>{formatPerformanceAmount(missingVehicle.purchase)}</strong>
                                        </div>
                                        <div>
                                            <span>이익</span>
                                            <strong className={safeNumber(missingVehicle.profit) < 0 ? styles.negative : styles.positive}>
                                                {formatPerformanceAmount(missingVehicle.profit)}
                                            </strong>
                                        </div>
                                        <em>영업넘버가 빈칸이거나 &apos;-&apos;로 입력된 원장입니다. 실제 차량 이익 순위에서는 분리했습니다.</em>
                                    </div>
                                )}
                                {scopedVehiclePerformance.length === 0 ? (
                                    <div className={styles.emptyPanel}>차량별 이익 summary가 아직 없습니다.</div>
                                ) : (
                                    <div className={styles.vehicleProfitTable}>
                                        <div className={styles.vehicleProfitHead}>
                                            <span>차량/영업넘버</span>
                                            <span>기사</span>
                                            <span>매출</span>
                                            <span>매입</span>
                                            <span>이익</span>
                                            <span>률</span>
                                            <span>건수</span>
                                        </div>
                                        {scopedVehiclePerformance.slice(0, 30).map((item, idx) => {
                                            const rawVehicleName = item.vehicleNo || item.name || item.label || '';
                                            const vehicleName = displayVehicleName(item);
                                            const missingVehicleRow = isMissingToken(rawVehicleName);
                                            return (
                                                <button
                                                    key={`${vehicleName}-${idx}`}
                                                    className={styles.vehicleProfitRow}
                                                    onClick={() => {
                                                        if (!missingVehicleRow) openDetailSearch([vehicleName], 'and');
                                                    }}
                                                    disabled={missingVehicleRow}
                                                    title={`${vehicleName} 원장 상세`}
                                                >
                                                    <strong>{vehicleName}</strong>
                                                    <span>{displayDriverName(item.drivers || item.driver)}</span>
                                                    <span>{formatPerformanceAmount(item.revenue)}</span>
                                                    <span>{formatPerformanceAmount(item.purchase)}</span>
                                                    <b className={safeNumber(item.profit) < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(item.profit)}</b>
                                                    <em className={profitRateOf(item) < profitRate ? styles.warningText : ''}>{formatPercent(profitRateOf(item), 1)}</em>
                                                    <span>{safeNumber(item.rowCount).toLocaleString('ko-KR')}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>
                        </div>
                    )}

                    {analysisView === 'calendar' && (
                        <div className={styles.deepGrid}>
                            <WeekdayPerformanceDiagram items={scopedWeekday} scopeLabel={scopeBounds.label} />
                        </div>
                    )}

                    {analysisView === 'evidence' && (
                        <div className={styles.deepGrid}>
                            <section className={styles.panel}>
                                <div className={styles.panelHeader}>
                                    <h3>원장 검증 상태</h3>
                                    <span>1원 단위</span>
                                </div>
                                <div className={styles.validationGrid}>
                                    <div><span>총 행수</span><strong>{safeNumber(ledgerValidation.rowCountActual || totalRows).toLocaleString('ko-KR')}</strong><em>메타 {safeNumber(ledgerValidation.rowCountMeta || totalRows).toLocaleString('ko-KR')}</em></div>
                                    <div><span>월별 불일치</span><strong>{safeNumber(ledgerValidation.monthlyMismatchCount || 0).toLocaleString('ko-KR')}</strong><em>0이어야 정상</em></div>
                                    <div><span>마감월 오류</span><strong>{safeNumber(dateQuality.invalidPeriodRows || 0).toLocaleString('ko-KR')}</strong><em>{dateQuality.minPeriod || '-'} ~ {dateQuality.maxPeriod || '-'}</em></div>
                                    <div><span>작업일자 오류</span><strong>{safeNumber(dateQuality.invalidWorkDateRows || 0).toLocaleString('ko-KR')}</strong><em>{dateQuality.minWorkDate || '-'} ~ {dateQuality.maxWorkDate || '-'}</em></div>
                                    <div><span>소수점 매출 행</span><strong>{safeNumber(amountQuality.revenueDecimalRows || 0).toLocaleString('ko-KR')}</strong><em>{formatPerformanceAmount(amountQuality.revenueDecimalSum)}</em></div>
                                    <div><span>소수점 매입 행</span><strong>{safeNumber(amountQuality.purchaseDecimalRows || 0).toLocaleString('ko-KR')}</strong><em>{formatPerformanceAmount(amountQuality.purchaseDecimalSum)}</em></div>
                                </div>
                            </section>
                            <section className={styles.panel}>
                                <div className={styles.panelHeader}>
                                    <h3>분석 기준 설명</h3>
                                    <span>마우스 도움말 대신 상시 표시</span>
                                </div>
                                <EvidenceHelp />
                            </section>
                            <section className={styles.detectPanel}>
                                <span>매출 컬럼: {(summary.detected?.revenueColumns || []).join(', ') || '자동 후보 없음'}</span>
                                <span>매입 컬럼: {(summary.detected?.purchaseColumns || []).join(', ') || '자동 후보 없음'}</span>
                                <span>이익 산식: {(summary.detected?.profitColumns || []).join(', ') || '매출-매입'}</span>
                                <span>월 기준: {summary.monthlyBasis || '마감월'}</span>
                                <span>검증: 원장 재집계와 summary 차이 0원 기준</span>
                            </section>
                        </div>
                    )}
                </div>
            ) : (
                <div className={styles.tableArea}>
                    <div className={styles.tableToolbar}>
                        <input
                            className={styles.searchInput}
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            placeholder="검색어 또는 금액 (, ; 로 조건 추가)"
                        />
                        <button
                            className={searchMode === 'and' ? styles.smallActiveBtn : styles.ghostBtn}
                            onClick={() => setSearchMode(prev => (prev === 'and' ? 'or' : 'and'))}
                            title=", 또는 ; 로 나눈 조건을 모두 포함할지, 하나라도 포함할지 선택합니다."
                        >
                            {searchMode === 'and' ? '모두 포함' : '하나라도 포함'}
                        </button>
                        <button className={styles.ghostBtn} onClick={() => setShowColPanel(prev => !prev)}>컬럼</button>
                        <button className={styles.ghostBtn} onClick={downloadTableExcel} disabled={exporting || tableLoading || !rows.length}>
                            {exporting ? '엑셀 생성중' : '엑셀'}
                        </button>
                        <span className={styles.rowCount}>조회 {loadedRows.toLocaleString()} / 전체 {totalRowsLabel}</span>
                    </div>

                    {(tableLoading || exporting) && (
                        <div className={styles.tableBusyNotice}>
                            <strong>{tableLoading ? '조회중 (빅데이터 검색 느림)' : '엑셀 생성중'}</strong>
                            <span>{tableLoading ? '원장 전체에서 조건을 확인하고 있습니다.' : '상세배차와 같은 형식으로 파일을 만들고 있습니다.'}</span>
                        </div>
                    )}

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
