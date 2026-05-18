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
const ANALYSIS_VIEWS = [
    { key: 'overview', label: '개요' },
    { key: 'flow', label: '10년 흐름' },
    { key: 'matrix', label: '연도×월' },
    { key: 'segments', label: '계약/차량' },
    { key: 'calendar', label: '주차·요일' },
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
    return { label: '손익 위험', tone: 'danger' };
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

function aggregateYearlyFromMonthly(monthly = []) {
    const map = new Map();
    monthly.forEach(item => {
        const period = normalizePeriodKey(item.period);
        const year = String(item.year || period.slice(0, 4) || '');
        if (!year) return;
        const prev = map.get(year) || { year: Number(year), revenue: 0, purchase: 0, profit: 0, rowCount: 0 };
        prev.revenue += safeNumber(item.revenue);
        prev.purchase += safeNumber(item.purchase);
        prev.profit += safeNumber(item.profit);
        prev.rowCount += safeNumber(item.rowCount);
        map.set(year, prev);
    });
    return Array.from(map.values()).sort((a, b) => String(a.year).localeCompare(String(b.year)));
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

function normalizeSeries(items = []) {
    return (Array.isArray(items) ? items : []).filter(item => item && (safeNumber(item.revenue) || safeNumber(item.purchase) || safeNumber(item.profit)));
}

function ScopeControls({ mode, setMode, start, end, setStart, setEnd, periods, bounds, rowCount }) {
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
    const width = 1800;
    const height = 260;
    const pad = { left: 62, right: 38, top: 28, bottom: 42 };
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
    const last = series[series.length - 1] || null;
    const avgRevenueY = yAt(avgRevenue);
    const avgPurchaseY = yAt(avgPurchase);
    const gradientId = `annualRevenueArea-${String(title).replace(/[^a-zA-Z0-9가-힣]/g, '-')}`;
    const grid = [0.25, 0.5, 0.75, 1].map(ratio => ({
        y: pad.top + chartH - chartH * ratio,
        value: maxValue * ratio,
    }));

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
                        <svg
                            className={styles.marketFlowSvg}
                            viewBox={`0 0 ${width} ${height}`}
                            preserveAspectRatio="none"
                            role="img"
                            aria-label={`${title} 매출 매입 흐름`}
                        >
                            <defs>
                                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                                    <stop offset="0%" stopColor="#0f766e" stopOpacity="0.22" />
                                    <stop offset="100%" stopColor="#0f766e" stopOpacity="0.02" />
                                </linearGradient>
                            </defs>
                            {grid.map(item => (
                                <g key={item.y}>
                                    <line x1={pad.left} x2={pad.left + chartW} y1={item.y} y2={item.y} className={styles.marketGridLine} />
                                    <text x={pad.left - 8} y={item.y + 3} className={styles.marketAxisText} textAnchor="end">{formatPerformanceAmount(item.value)}</text>
                                </g>
                            ))}
                            <polygon points={revenueArea} className={styles.marketRevenueArea} style={{ fill: `url(#${gradientId})` }} />
                            <polyline points={revenuePoints} className={styles.marketRevenueLine} />
                            <polyline points={purchasePoints} className={styles.marketPurchaseLine} />
                            <line x1={pad.left} x2={pad.left + chartW} y1={avgRevenueY} y2={avgRevenueY} className={styles.marketRevenueAvgLine} />
                            <line x1={pad.left} x2={pad.left + chartW} y1={avgPurchaseY} y2={avgPurchaseY} className={styles.marketPurchaseAvgLine} />
                            <text x={pad.left + chartW - 4} y={avgRevenueY - 6} className={styles.marketAvgText} textAnchor="end">매출 평균 {formatPerformanceAmount(avgRevenue)}</text>
                            <text x={pad.left + chartW - 4} y={avgPurchaseY + 14} className={styles.marketAvgText} textAnchor="end">매입 평균 {formatPerformanceAmount(avgPurchase)}</text>
                            {series.map((item, idx) => {
                                const showTick = idx === 0 || idx === series.length - 1 || idx % Math.max(1, Math.ceil(series.length / 10)) === 0;
                                return showTick ? (
                                    <text key={item.period} x={xAt(idx)} y={height - 16} className={styles.marketAxisText} textAnchor="middle">{item.period}</text>
                                ) : null;
                            })}
                        </svg>
                    </div>
                    <div className={styles.marketFlowStats}>
                        <div><span>최고 매출월</span><strong>{high?.period || '-'}</strong><em>{high ? formatPerformanceAmount(high.revenue) : '-'}</em></div>
                        <div><span>최근월</span><strong>{last?.period || '-'}</strong><em>매출 {last ? formatPerformanceAmount(last.revenue) : '-'}</em></div>
                        <div><span>매출 평균</span><strong>{formatPerformanceAmount(avgRevenue)}</strong><em>월 평균</em></div>
                        <div><span>매입 평균</span><strong>{formatPerformanceAmount(avgPurchase)}</strong><em>월 평균</em></div>
                    </div>
                </>
            )}
        </section>
    );
}

function MiniTrendChart({ items = [], title = '흐름', basis = '월' }) {
    const series = normalizeSeries(items);
    const maxRevenue = Math.max(1, ...series.map(item => Math.abs(safeNumber(item.revenue))));
    const maxProfit = Math.max(1, ...series.map(item => Math.abs(safeNumber(item.profit))));
    const width = 720;
    const height = 168;
    const padX = 24;
    const revenuePoints = series.map((item, idx) => {
        const x = series.length <= 1 ? padX : padX + (idx / (series.length - 1)) * (width - padX * 2);
        const y = 18 + (1 - (safeNumber(item.revenue) / maxRevenue)) * 74;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const profitPoints = series.map((item, idx) => {
        const x = series.length <= 1 ? padX : padX + (idx / (series.length - 1)) * (width - padX * 2);
        const y = 118 - (safeNumber(item.profit) / maxProfit) * 42;
        return `${x.toFixed(1)},${Math.max(76, Math.min(154, y)).toFixed(1)}`;
    }).join(' ');
    const first = series[0]?.period || series[0]?.weekStart || series[0]?.year || '-';
    const last = series[series.length - 1]?.period || series[series.length - 1]?.weekStart || series[series.length - 1]?.year || '-';
    const recent = series[series.length - 1] || null;

    return (
        <div className={styles.trendCard}>
            <div className={styles.trendTitle}>
                <div>
                    <h3>{title}</h3>
                    <span>{basis} {first} ~ {last}</span>
                </div>
                <div className={styles.trendLegend}>
                    <span><i className={styles.revenueDot} />매출</span>
                    <span><i className={styles.profitDot} />손익</span>
                </div>
            </div>
            {series.length < 2 ? (
                <div className={styles.emptyPanel}>흐름 데이터가 부족합니다.</div>
            ) : (
                <>
                    <svg className={styles.trendSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} 차트`}>
                        <line x1="20" y1="92" x2="700" y2="92" className={styles.axisLine} />
                        <line x1="20" y1="118" x2="700" y2="118" className={styles.zeroLine} />
                        <polyline points={revenuePoints} className={styles.revenueLine} />
                        <polyline points={profitPoints} className={styles.profitLine} />
                    </svg>
                    <div className={styles.trendFoot}>
                        <span>최근 {recent?.period || recent?.weekStart || recent?.year}: 매출 {formatPerformanceAmount(recent?.revenue)}, 손익 {formatPerformanceAmount(recent?.profit)}</span>
                        <span>원장 summary 기반, 금액은 원 단위 집계 후 화면에서 축약 표시</span>
                    </div>
                </>
            )}
        </div>
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
                                title={`${period}\n매출 ${formatPerformanceAmount(item?.revenue)}\n손익 ${formatPerformanceAmount(item?.profit)}\n손익률 ${formatPercent(margin)}`}
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
            <span>수익성 양호: 전체 손익률 10% 이상. 마진 관리: 5~10%. 저마진 주의: 0~5%. 손익 위험: 0% 이하.</span>
            <strong>금액 기준</strong>
            <span>매출은 청구, 매입은 하불, 손익은 청구 - 하불로 집계합니다. 모든 합계는 원장 행의 원 단위 값을 합산한 뒤 화면에서만 억/만 원으로 축약합니다.</span>
            <strong>상세 보기 기준</strong>
            <span>분석 항목의 상세 버튼은 테이블 탭으로 이동해 AND 검색을 적용합니다. 예: ELS솔루션 + 직계약은 두 단어가 모두 있는 원장 행만 보여줍니다.</span>
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
    const [syncStatus, setSyncStatus] = useState(null);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('analytics');
    const [analysisView, setAnalysisView] = useState('overview');
    const [selectedSegmentKey, setSelectedSegmentKey] = useState('own_direct');
    const [scopeMode, setScopeMode] = useState('all');
    const [scopeStart, setScopeStart] = useState('');
    const [scopeEnd, setScopeEnd] = useState('');
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
            const effectiveSearchMode = options.searchMode ?? searchMode;
            if (effectiveSearch) params.set('search_mode', effectiveSearchMode || 'or');
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
    }, [selectedPath, sheetName, headerRow, searchTerm, searchMode, sortConfig, applyPayload]);

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
    const weekly = Array.isArray(summary.weekly) ? summary.weekly : EMPTY_LIST;
    const weekday = Array.isArray(summary.weekday) ? summary.weekday : EMPTY_LIST;
    const strategicSegments = Array.isArray(summary.strategicSegments) ? summary.strategicSegments : EMPTY_LIST;
    const periodOptions = useMemo(() => getPeriodOptions(monthly), [monthly]);
    const scopeBounds = useMemo(() => getScopeBounds({
        mode: scopeMode,
        periods: periodOptions,
        start: scopeStart,
        end: scopeEnd,
    }), [periodOptions, scopeEnd, scopeMode, scopeStart]);
    const scopedMonthly = useMemo(() => filterSeriesByScope(monthly, scopeBounds), [monthly, scopeBounds]);
    const scopedYearly = useMemo(() => aggregateYearlyFromMonthly(scopedMonthly), [scopedMonthly]);
    const scopedWeekly = useMemo(() => filterSeriesByScope(weekly, scopeBounds), [scopeBounds, weekly]);
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
    const monthlyTrend = scopedMonthly.slice(-12);
    const weeklyTrend = scopedWeekly.slice(-26);
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
    const chartMax = getPerformanceChartMax(scopedYearly, ['revenue', 'purchase', 'profit']);
    const monthChartMax = getPerformanceChartMax(monthlyTrend, ['revenue', 'purchase', 'profit']);
    const analysisRows = Number(scopedTotals.rowCount || 0) || 0;
    const avgRevenue = analysisRows ? scopedTotals.revenue / analysisRows : 0;
    const avgProfit = analysisRows ? scopedTotals.profit / analysisRows : 0;
    const purchaseRate = rate(scopedTotals.purchase, scopedTotals.revenue);
    const profitRate = rate(scopedTotals.profit, scopedTotals.revenue);
    const performanceGrade = getPerformanceGrade(profitRate);
    const bestProfitMonth = scopedMonthly.reduce((best, item) => (Number(item.profit) || 0) > (Number(best?.profit) || -Infinity) ? item : best, null);
    const worstProfitMonth = scopedMonthly.reduce((worst, item) => (Number(item.profit) || 0) < (Number(worst?.profit) || Infinity) ? item : worst, null);
    const bestRevenueMonth = scopedMonthly.reduce((best, item) => (Number(item.revenue) || 0) > (Number(best?.revenue) || -Infinity) ? item : best, null);
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
                        <span>{totalRowsLabel}행</span>
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
                                <span>기간 {getPeriodRange(scopedMonthly)}</span>
                                <span>분석 {analysisRows.toLocaleString('ko-KR')}행</span>
                                <span>월별 {summary.monthlyBasis || '마감월'} 기준</span>
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
                            <em>매입률 {formatPercent(purchaseRate)}</em>
                        </div>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>손익</span>
                            <strong className={scopedTotals.profit < 0 ? styles.negative : styles.positive}>
                                {formatPerformanceAmount(scopedTotals.profit)}
                            </strong>
                            <em>건당 {formatPerformanceAmount(avgProfit)}</em>
                        </div>
                        <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>손익률</span>
                            <strong>{formatPercent(profitRate, 2)}</strong>
                            <em>{topSegment ? `최대 비중 ${formatPercent(topSegment.revenueShare)}` : '비중 자료 없음'}</em>
                        </div>
                    </div>

                    {analysisView === 'overview' && (
                        <>
                    <div className={styles.reportGrid}>
                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <h3>손익 구조</h3>
                                <span>매출 → 매입 → 손익</span>
                            </div>
                            <div className={styles.bridgeList}>
                                {[
                                    { label: '매출', value: scopedTotals.revenue, tone: 'revenue', sub: '총 청구 기준' },
                                    { label: '매입', value: scopedTotals.purchase, tone: 'purchase', sub: `${formatPercent(purchaseRate)} 사용` },
                                    { label: '손익', value: scopedTotals.profit, tone: scopedTotals.profit < 0 ? 'loss' : 'profit', sub: `${formatPercent(profitRate, 2)} 잔여` },
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
                                    <strong>{formatPerformanceAmount(scopedTotals.revenue)} - {formatPerformanceAmount(scopedTotals.purchase)} = {formatPerformanceAmount(scopedTotals.profit)}</strong>
                                </div>
                            </div>
                        </section>

                        <section className={`${styles.panel} ${styles.monthPanel}`}>
                            <div className={styles.panelHeader}>
                                <h3>월별 성과 흐름</h3>
                                <span>{summary.monthlyBasis || '마감월'} 기준 · {scopeBounds.label}</span>
                            </div>
                            <div className={styles.monthChart}>
                                {monthlyTrend.length === 0 ? (
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
                                        {monthlyTrend.map(item => (
                                            <div className={styles.monthRow} key={item.period}>
                                                <span>{item.period}</span>
                                                <DataBar value={item.revenue} max={monthChartMax} tone="revenue" />
                                                <strong>{formatPerformanceAmount(item.revenue)}</strong>
                                                <DataBar value={item.profit} max={monthChartMax} tone={(Number(item.profit) || 0) < 0 ? 'loss' : 'profit'} />
                                                <strong>{formatPerformanceAmount(item.profit)}</strong>
                                                <em>{formatPercent(profitRateOf(item))}</em>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        </section>
                    </div>

                    <div className={styles.analysisGrid}>
                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <h3>연도별 매출·매입·손익</h3>
                                <span>{scopedYearly.length.toLocaleString()}개 연도 · {scopeBounds.label}</span>
                            </div>
                            <div className={styles.metricLegend}>
                                <span><i className={styles.revenueDot} />매출</span>
                                <span><i className={styles.purchaseDot} />매입</span>
                                <span><i className={styles.profitDot} />손익</span>
                            </div>
                            <div className={styles.yearChart}>
                                {scopedYearly.length === 0 ? (
                                    <div className={styles.emptyPanel}>분석 가능한 금액/연도 컬럼이 아직 없습니다.</div>
                                ) : scopedYearly.map(item => (
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
                    <section className={styles.detectPanel}>
                        <span>매출: {(summary.detected?.revenueColumns || []).join(', ') || '자동 후보 없음'}</span>
                        <span>매입: {(summary.detected?.purchaseColumns || []).join(', ') || '자동 후보 없음'}</span>
                        <span>손익: {(summary.detected?.profitColumns || []).join(', ') || '매출-매입'}</span>
                        <span>그룹: {(summary.detected?.groupColumns || []).join(', ') || '자동 후보 없음'}</span>
                        <span>조회: {summary.currentSnapshotId ? '현재 스냅샷 고정' : 'current 행 기준'}</span>
                        <span>원장: 삭제 없이 누적</span>
                    </section>
                        </>
                    )}

                    {analysisView === 'flow' && (
                        <div className={styles.deepGrid}>
                            <MiniTrendChart items={scopedYearly} title="연도별 장기 흐름" basis="연도" />
                            <section className={styles.panel}>
                                <div className={styles.panelHeader}>
                                    <h3>최근 변화 근거</h3>
                                    <span>전월 대비</span>
                                </div>
                                <div className={styles.changeGrid}>
                                    <div>
                                        <span>최근월</span>
                                        <strong>{latestMonth?.period || '-'}</strong>
                                        <em>매출 {formatPerformanceAmount(latestMonth?.revenue)}</em>
                                    </div>
                                    <div>
                                        <span>전월 대비 매출</span>
                                        <strong>{formatSignedAmount(safeNumber(latestMonth?.revenue) - safeNumber(previousMonth?.revenue))}</strong>
                                        <em>{previousMonth?.period || '-'} 기준</em>
                                    </div>
                                    <div>
                                        <span>전월 대비 손익</span>
                                        <strong>{formatSignedAmount(safeNumber(latestMonth?.profit) - safeNumber(previousMonth?.profit))}</strong>
                                        <em>손익률 {formatPercent(profitRateOf(latestMonth), 2)}</em>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}

                    {analysisView === 'matrix' && (
                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <h3>연도×월 매출/손익 매트릭스</h3>
                                <span>{summary.monthlyBasis || '마감월'} 기준 · {scopedMonthly.length.toLocaleString('ko-KR')}개월</span>
                            </div>
                            <YearMonthHeatmap monthly={scopedMonthly} onSelectPeriod={period => openDetailSearch([period], 'and')} />
                        </section>
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
                                            <em>손익률 {formatPercent(segment.profitRate, 2)} · {safeNumber(segment.rowCount).toLocaleString('ko-KR')}건</em>
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
                                                <span>손익</span><strong>{formatPerformanceAmount(selectedSegment.profit)}</strong>
                                                <span>비중</span><strong>{formatPercent(selectedSegment.revenueShare, 2)}</strong>
                                            </div>
                                        </div>
                                    </section>
                                    <MiniTrendChart items={selectedSegment.monthly || []} title={`${selectedSegment.label} 월별 흐름`} basis="마감월" />
                                    <div className={styles.segmentDetailGrid}>
                                        {[
                                            ['작업지', selectedSegment.topWorkSites || []],
                                            ['청구처', selectedSegment.topClients || []],
                                            ['노선', selectedSegment.topRoutes || []],
                                            ['구분', selectedSegment.topCategories || []],
                                        ].map(([label, items]) => (
                                            <section className={styles.panel} key={label}>
                                                <div className={styles.panelHeader}>
                                                    <h3>{label} 근거</h3>
                                                    <span>상위 12</span>
                                                </div>
                                                <div className={styles.compactList}>
                                                    {items.slice(0, 12).map((item, idx) => (
                                                        <button
                                                            className={styles.compactButtonRow}
                                                            key={`${label}-${item.name}-${idx}`}
                                                            onClick={() => openDetailSearch([...(selectedSegment.filterTerms || []), item.name], 'and')}
                                                        >
                                                            <span>{item.name}</span>
                                                            <b>{formatPerformanceAmount(item.revenue)}</b>
                                                            <em>{formatPercent(profitRateOf(item), 1)}</em>
                                                        </button>
                                                    ))}
                                                </div>
                                            </section>
                                        ))}
                                    </div>
                                </>
                            )}
                            <section className={styles.panel}>
                                <div className={styles.panelHeader}>
                                    <h3>차량별 손익</h3>
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
                                            <span>손익</span>
                                            <strong className={safeNumber(missingVehicle.profit) < 0 ? styles.negative : styles.positive}>
                                                {formatPerformanceAmount(missingVehicle.profit)}
                                            </strong>
                                        </div>
                                        <em>영업넘버가 빈칸이거나 &apos;-&apos;로 입력된 원장입니다. 실제 차량 손익 순위에서는 분리했습니다.</em>
                                    </div>
                                )}
                                {scopedVehiclePerformance.length === 0 ? (
                                    <div className={styles.emptyPanel}>차량별 손익 summary가 아직 없습니다.</div>
                                ) : (
                                    <div className={styles.vehicleProfitTable}>
                                        <div className={styles.vehicleProfitHead}>
                                            <span>차량/영업넘버</span>
                                            <span>기사</span>
                                            <span>매출</span>
                                            <span>매입</span>
                                            <span>손익</span>
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
                            <section className={styles.panel}>
                                <div className={styles.panelHeader}>
                                    <h3>주차별 금액/건수</h3>
                                    <span>{scopeBounds.label} · 최근 {weeklyTrend.length.toLocaleString('ko-KR')}주</span>
                                </div>
                                <div className={styles.weekList}>
                                    {weeklyTrend.map(item => (
                                        <div className={styles.weekRow} key={item.weekStart}>
                                            <span>{item.weekStart}</span>
                                            <DataBar value={item.revenue} max={getPerformanceChartMax(weeklyTrend, ['revenue'])} tone="revenue" />
                                            <strong>{formatPerformanceAmount(item.revenue)}</strong>
                                            <em>{safeNumber(item.rowCount).toLocaleString('ko-KR')}건</em>
                                            <b>{formatPerformanceAmount(item.profit)}</b>
                                        </div>
                                    ))}
                                </div>
                            </section>
                            <section className={styles.panel}>
                                <div className={styles.panelHeader}>
                                    <h3>요일별 원장 분석</h3>
                                    <span>전체 기간 summary 기준</span>
                                </div>
                                <div className={styles.weekdayGrid}>
                                    {weekday.map(item => (
                                        <div className={styles.weekdayCard} key={item.label || item.day}>
                                            <span>{item.label}요일</span>
                                            <strong>{formatPerformanceAmount(item.revenue)}</strong>
                                            <em>{safeNumber(item.rowCount).toLocaleString('ko-KR')}건 · 손익률 {formatPercent(profitRateOf(item), 1)}</em>
                                        </div>
                                    ))}
                                </div>
                            </section>
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
                                <span>손익 산식: {(summary.detected?.profitColumns || []).join(', ') || '매출-매입'}</span>
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
                            placeholder="검색어"
                        />
                        <button
                            className={searchMode === 'and' ? styles.smallActiveBtn : styles.ghostBtn}
                            onClick={() => setSearchMode(prev => (prev === 'and' ? 'or' : 'and'))}
                            title="쉼표로 나눈 검색어를 모두 포함할지, 하나라도 포함할지 선택합니다."
                        >
                            {searchMode === 'and' ? 'AND 검색' : 'OR 검색'}
                        </button>
                        <button className={styles.ghostBtn} onClick={() => setShowColPanel(prev => !prev)}>컬럼</button>
                        <span className={styles.rowCount}>조회 {loadedRows.toLocaleString()} / 전체 {totalRowsLabel}</span>
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
