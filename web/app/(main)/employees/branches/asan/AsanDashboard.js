'use client';
import { useEffect, useMemo, useState } from 'react';
import styles from './dashboard.module.css';
import {
    ASAN_DASHBOARD_CHART_MODES,
    buildAsanDashboardBasisDiffSummary,
    buildAsanDashboardTimeline,
    buildAsanDashboardScope,
    buildAsanDashboardWeekdayComparison,
    buildSelectableAsanDashboardPeriods,
    toSortedChartEntries,
    toSortedMapEntries,
} from '@/utils/asanDashboardView.mjs';

const CHART_COLORS = ['#2563eb', '#14b8a6', '#f97316', '#d946ef', '#22c55e', '#ef4444', '#64748b'];

function formatQty(value) {
    const num = Number(value) || 0;
    if (Number.isInteger(num)) return num.toLocaleString();
    return num.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatDecimal(value) {
    const num = Number(value) || 0;
    return num.toLocaleString(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    });
}

function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getPct(value, total) {
    if (!total) return 0;
    return Math.round((value / total) * 100);
}

function getHashColor(str) {
    let hash = 0;
    const text = String(str || '');
    for (let i = 0; i < text.length; i++) hash = text.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 62%, 54%)`;
}

function topEntry(map) {
    return toSortedMapEntries(map, 1)[0] || null;
}

export default function AsanDashboard({
    data,
    headers,
    viewType,
    sourceItems = [],
    activeDate = '',
    selectedMonth = '',
    dateControlsSlot = null,
    onOpenDailyGrid = null,
    onIssueSelect = null,
}) {
    const [viewMode, setViewMode] = useState('customer');
    const [chartMode, setChartMode] = useState('작업지');
    const [periodSelection, setPeriodSelection] = useState({ day: '', week: '', month: '' });

    const chartModes = ASAN_DASHBOARD_CHART_MODES[viewMode] || ASAN_DASHBOARD_CHART_MODES.customer;
    const activeChartMode = chartModes.includes(chartMode) ? chartMode : chartModes[0];

    const handleViewModeChange = (mode) => {
        setViewMode(mode);
        setChartMode(ASAN_DASHBOARD_CHART_MODES[mode][0]);
    };

    useEffect(() => {
        if (!activeDate) return;
        setPeriodSelection((prev) => ({ ...prev, day: activeDate }));
    }, [activeDate]);

    useEffect(() => {
        if (!selectedMonth) return;
        setPeriodSelection((prev) => ({ ...prev, month: selectedMonth }));
    }, [selectedMonth]);

    const dashboardData = useMemo(() => {
        const activeScope = buildAsanDashboardScope({
            rows: data,
            headers,
            viewType,
            viewMode,
        });
        const selectablePeriods = buildSelectableAsanDashboardPeriods({
            sourceItems,
            fallbackRows: data,
            fallbackHeaders: headers,
            viewType,
            viewMode,
            selectedDay: periodSelection.day || activeDate,
            selectedWeek: periodSelection.week,
            selectedMonth: periodSelection.month || selectedMonth,
        });
        const timeline = buildAsanDashboardTimeline({ sourceItems, viewType, viewMode });
        const weeklyPeriod = selectablePeriods.periods.find((period) => period.key === 'weekly');
        const monthlyPeriod = selectablePeriods.periods.find((period) => period.key === 'monthly');
        const weekdayComparison = buildAsanDashboardWeekdayComparison({
            sourceItems,
            viewType,
            weekKey: weeklyPeriod?.selectedKey || '',
            monthKey: monthlyPeriod?.selectedKey || '',
        });
        const basisDiff = buildAsanDashboardBasisDiffSummary({
            sourceItems,
            fallbackRows: data,
            fallbackHeaders: headers,
            viewType,
            selectedDay: periodSelection.day || activeDate,
            selectedWeek: periodSelection.week,
            selectedMonth: periodSelection.month || selectedMonth,
        });
        return {
            activeScope,
            periods: selectablePeriods.periods,
            periodOptions: selectablePeriods.options,
            timeline,
            weekdayComparison,
            basisDiff,
        };
    }, [data, headers, viewType, viewMode, sourceItems, activeDate, selectedMonth, periodSelection]);

    const displayChartData = useMemo(() => {
        return toSortedChartEntries(dashboardData.activeScope.chartAggs[activeChartMode]);
    }, [dashboardData, activeChartMode]);
    const summaryPeriods = useMemo(
        () => dashboardData.periods.filter((period) => period.key !== 'total'),
        [dashboardData.periods],
    );

    const insightModes = viewMode === 'customer'
        ? ['고객사', '작업지', '라인/선사']
        : ['업체명', '고객사', '작업지'];

    const handlePeriodSelect = (periodKey, value) => {
        const keyMap = { daily: 'day', weekly: 'week', monthly: 'month' };
        const targetKey = keyMap[periodKey];
        if (!targetKey) return;
        setPeriodSelection((prev) => ({ ...prev, [targetKey]: value }));
    };

    if (!dashboardData.activeScope || dashboardData.activeScope.total === 0) {
        return <div className={styles.empty}>데이터가 부족합니다.</div>;
    }

    return (
        <div className={styles.dashboard}>
            <div className={styles.dashHeader}>
                <div className={styles.switchTabs}>
                    <button
                        className={`${styles.switchBtn} ${viewMode === 'customer' ? styles.active : ''}`}
                        onClick={() => handleViewModeChange('customer')}
                    >
                        고객사(화주) 기준
                    </button>
                    <button
                        className={`${styles.switchBtn} ${viewMode === 'dispatcher' ? styles.active : ''}`}
                        onClick={() => handleViewModeChange('dispatcher')}
                    >
                        실행사(협력업체) 기준
                    </button>
                </div>
                <BasisDiffPanel data={dashboardData.basisDiff} onIssueSelect={onIssueSelect} />
                <div className={styles.dashTotal}>
                    현재 선택 총계 <b>{formatQty(dashboardData.activeScope.total)}</b>
                </div>
            </div>

            <div className={styles.periodGrid}>
                {summaryPeriods.map((period) => (
                    <PeriodCard
                        key={period.key}
                        period={period}
                        chartMode={activeChartMode}
                        onSelect={handlePeriodSelect}
                    />
                ))}
            </div>

            <div className={styles.analysisRow}>
                <TrendPanel
                    items={dashboardData.timeline}
                    title={viewMode === 'customer' ? '일자별 오더 추세' : '일자별 실행 배차 추세'}
                />
                <WeekdayOrderPanel
                    data={dashboardData.weekdayComparison}
                    periods={dashboardData.periods}
                    onSelect={handlePeriodSelect}
                />
            </div>

            {dateControlsSlot && (
                <div className={styles.dateBridge}>
                    {onOpenDailyGrid && (
                        <div className={styles.mobileDateActionBar}>
                            <span>선택한 날짜의 상세 배차 자료를 바로 확인합니다.</span>
                            <button type="button" onClick={onOpenDailyGrid}>
                                선택일 배차판 검색
                            </button>
                        </div>
                    )}
                    {dateControlsSlot}
                </div>
            )}

            <div className={styles.mixModules}>
                <ShareDonut data={dashboardData.activeScope.pieAggs.shipper} title="화주 점유율" />
                <ShareDonut data={dashboardData.activeScope.pieAggs.region} title="상차지별 비율" />
                <MiniSplitCard data={dashboardData.activeScope.pieAggs.direction} title="수출입 구분" />
                <MiniSplitCard data={dashboardData.activeScope.pieAggs.container} title="컨테이너 TYPE" />
            </div>

            <div className={styles.dashContent}>
                <div className={styles.chartPanel}>
                    <div className={styles.panelHeaderWrap}>
                        <h3 className={styles.panelTitle}>비중 차트 ({activeChartMode} 기준)</h3>
                        <div className={styles.chartTabs}>
                            {chartModes.map((mode) => (
                                <button
                                    key={mode}
                                    className={`${styles.chartTabBtn} ${activeChartMode === mode ? styles.chartTabBtnActive : ''}`}
                                    onClick={() => setChartMode(mode)}
                                >
                                    {mode}별
                                </button>
                            ))}
                        </div>
                    </div>
                    <RankedBarChart
                        items={displayChartData}
                        total={dashboardData.activeScope.total}
                    />
                </div>

                <div className={styles.insightPanel}>
                    <div className={styles.panelHeaderWrap}>
                        <h3 className={styles.panelTitle}>
                            {viewMode === 'customer' ? '고객사 구분표' : '실행사 구분표'}
                        </h3>
                        <span className={styles.panelSub}>상위 항목 빠른 확인</span>
                    </div>
                    <div className={styles.insightGrid}>
                        {insightModes.map((mode) => (
                            <InsightBlock
                                key={mode}
                                title={`${mode} TOP`}
                                items={toSortedChartEntries(dashboardData.activeScope.chartAggs[mode], 5)}
                                total={dashboardData.activeScope.total}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function formatSignedQty(value) {
    if (!value) return '0';
    return `${value > 0 ? '+' : ''}${formatQty(value)}`;
}

function getDiffToneClass(value) {
    if (value > 0) return styles.basisDiffUp;
    if (value < 0) return styles.basisDiffDown;
    return styles.basisDiffFlat;
}

function BasisDiffPanel({ data, onIssueSelect }) {
    const [activePeriodKey, setActivePeriodKey] = useState('daily');
    const periods = (data?.periods || []).filter((period) => period.key !== 'total');
    const issueGroups = data?.issueGroups || {};
    const defaultPeriod = periods.find((period) => Math.abs(period.diff) >= 0.01 && (issueGroups[period.key] || []).length > 0)
        || periods.find((period) => Math.abs(period.diff) >= 0.01)
        || periods[0];
    const activePeriod = periods.find((period) => period.key === activePeriodKey) || defaultPeriod;
    const issues = issueGroups[activePeriod?.key] || data?.issues || [];
    const hasDiff = periods.some((period) => Math.abs(period.diff) >= 0.01);

    useEffect(() => {
        if (periods.some((period) => period.key === activePeriodKey)) return;
        setActivePeriodKey(defaultPeriod?.key || 'daily');
    }, [activePeriodKey, defaultPeriod?.key, periods]);

    if (periods.length === 0) return null;

    return (
        <div className={styles.basisDiffPanel}>
            <div className={styles.basisDiffHead}>
                <strong>기준차이</strong>
                <span>실행-고객</span>
            </div>
            <div className={styles.basisDiffStats}>
                {periods.map((period) => (
                    <button
                        type="button"
                        key={period.key}
                        className={`${styles.basisDiffChip} ${activePeriod?.key === period.key ? styles.basisDiffChipActive : ''} ${getDiffToneClass(period.diff)}`}
                        onClick={() => setActivePeriodKey(period.key)}
                        title={`${period.title} 고객 ${formatQty(period.customerTotal)} / 실행 ${formatQty(period.dispatcherTotal)}`}
                    >
                        <em>{period.label}</em>
                        <b>{formatSignedQty(period.diff)}</b>
                    </button>
                ))}
            </div>
            {issues.length > 0 ? (
                <div className={styles.basisIssueList}>
                    {issues.slice(0, 2).map((issue) => (
                        <div key={issue.id} className={styles.basisIssue}>
                            <div className={styles.basisIssueText}>
                                <strong title={issue.subtitle || issue.title}>{issue.dateLabel} · {issue.title} · {issue.rowIndex}행</strong>
                                <span title={issue.regionSummary || issue.reason}>
                                    {issue.reason} · 고객 {formatQty(issue.customerTotal)} / 실행 {formatQty(issue.dispatcherTotal)}
                                    <b className={getDiffToneClass(issue.diff)}> {formatSignedQty(issue.diff)}</b>
                                </span>
                            </div>
                            <button
                                type="button"
                                className={styles.basisIssueLink}
                                onClick={() => onIssueSelect?.(issue)}
                                disabled={!onIssueSelect}
                                title={`${issue.dateLabel} 탭에서 ${issue.search || issue.title} 검색`}
                            >
                                보기
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className={styles.basisDiffOk}>
                    {hasDiff ? '기간 합계 차이는 있으나 행 단위 원인 없음' : '선택 기간 기준 차이 없음'}
                </div>
            )}
        </div>
    );
}

function RankedBarChart({ items, total }) {
    if (!items || items.length === 0) {
        return <div className={styles.emptyInline}>표시할 비중 데이터가 없습니다.</div>;
    }

    const maxTotal = items[0]?.total || 1;
    return (
        <div className={styles.barChart}>
            {items.map((item, idx) => {
                const pctOfTotal = getPct(item.total, total);
                const breakdown = Object.entries(item.breakdown || {}).sort((a, b) => b[1] - a[1]);
                const topBreakdown = breakdown.slice(0, 2).map(([name, value]) => `${name} ${formatQty(value)}`).join(' · ');

                return (
                    <div key={item.name} className={styles.barItem}>
                        <div className={styles.barLabel}>
                            <span className={styles.bName}>{item.name}</span>
                            <span className={styles.bVal}>
                                {formatQty(item.total)} <small>({pctOfTotal}%)</small>
                            </span>
                        </div>
                        <div className={styles.barTrack}>
                            {breakdown.length > 0 ? breakdown.map(([bdName, bdCount]) => {
                                const segmentPct = Math.max(0.8, (bdCount / maxTotal) * 100);
                                const bdTotalPct = getPct(bdCount, item.total);
                                const titleStr = `${bdName} ${formatQty(bdCount)}대 (${bdTotalPct}%)`;
                                return (
                                    <div
                                        key={bdName}
                                        className={styles.barFill}
                                        data-tooltip={titleStr}
                                        style={{ width: `${segmentPct}%`, background: getHashColor(bdName) }}
                                    />
                                );
                            }) : (
                                <div
                                    className={styles.barFill}
                                    data-tooltip={`${item.name} ${formatQty(item.total)}대`}
                                    style={{ width: `${Math.max(0.8, (item.total / maxTotal) * 100)}%`, background: CHART_COLORS[idx % CHART_COLORS.length] }}
                                />
                            )}
                        </div>
                        {topBreakdown && <div className={styles.barHint}>{topBreakdown}</div>}
                    </div>
                );
            })}
        </div>
    );
}

function getTrend(current, previous) {
    if (!previous || previous.total <= 0) return null;
    const diff = current.total - previous.total;
    return {
        diff,
        pct: Math.round((diff / previous.total) * 100),
        tone: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
    };
}

function PeriodCard({ period, chartMode, onSelect }) {
    const entries = toSortedChartEntries(period.scope.chartAggs[chartMode], 4);
    const direction = topEntry(period.scope.pieAggs.direction);
    const trend = getTrend(period.scope, period.previousScope);
    const focusPct = entries[0] ? getPct(entries[0].total, period.scope.total) : 0;
    const mismatchTone = period.scope.mismatchTotal > 0 ? styles.metricWarn : '';

    return (
        <div className={`${styles.periodCard} ${styles[`period_${period.key}`] || ''}`}>
            <div className={styles.periodHead}>
                <div>
                    <span className={styles.periodLabel}>{period.label}</span>
                    {period.options?.length > 0 ? (
                        <select
                            className={styles.periodSelect}
                            value={period.selectedKey}
                            onChange={(event) => onSelect(period.key, event.target.value)}
                        >
                            {period.options.map((option) => (
                                <option key={option.key} value={option.key}>{option.label}</option>
                            ))}
                        </select>
                    ) : (
                        <strong>{period.title}</strong>
                    )}
                </div>
                <div className={styles.periodTotalWrap}>
                    <span className={styles.periodTotal}>{formatQty(period.scope.total)}</span>
                    {trend && (
                        <em className={`${styles.periodTrend} ${styles[`trend_${trend.tone}`] || ''}`}>
                            {trend.diff > 0 ? '+' : ''}{formatQty(trend.diff)} · {trend.pct > 0 ? '+' : ''}{trend.pct}%
                        </em>
                    )}
                </div>
            </div>

            <div className={styles.periodMetrics}>
                <span><b>오더</b>{formatQty(period.scope.orderTotal)}</span>
                <span><b>배차</b>{formatQty(period.scope.sheetDispatchTotal || period.scope.total)}</span>
                <span className={mismatchTone}><b>언매치</b>{formatQty(period.scope.mismatchTotal)}</span>
            </div>

            <div className={styles.periodMeter} aria-hidden="true">
                {entries.length > 0 ? entries.map((entry, idx) => (
                    <span
                        key={entry.name}
                        className={styles.periodMeterFill}
                        data-tooltip={`${entry.name} ${formatQty(entry.total)}대 (${getPct(entry.total, period.scope.total)}%)`}
                        style={{
                            width: `${Math.max(5, (entry.total / period.scope.total) * 100)}%`,
                            background: getHashColor(entry.name || idx),
                        }}
                    />
                )) : <span style={{ width: '100%', background: '#cbd5e1' }} />}
            </div>

            <div className={styles.periodRanks}>
                {entries.slice(0, 3).map((entry) => (
                    <div key={entry.name} className={styles.periodRankRow}>
                        <span className={styles.periodRankName} title={entry.name}>
                            <i style={{ background: getHashColor(entry.name) }} />
                            {entry.name}
                        </span>
                        <b>{formatQty(entry.total)}</b>
                    </div>
                ))}
            </div>

            <div className={styles.periodChips}>
                {direction && (
                    <span title="현재 카드 기준 수출입 구분별 최상위 수량입니다.">
                        {direction[0]}: {formatQty(direction[1])} van
                    </span>
                )}
                {period.scope.feuTotal > 0 && (
                    <span title="20FT 기준 환산값입니다. 20FT=1, 40FT/40HC=2, 45FT=2.25로 계산합니다.">
                        FEU: {formatQty(period.scope.feuTotal)}
                    </span>
                )}
                {focusPct > 0 && (
                    <span title="현재 카드 기준에서 1위 항목 수량을 전체 수량으로 나눈 비율입니다.">
                        톱1점유: {focusPct}%
                    </span>
                )}
            </div>
        </div>
    );
}

function TrendPanel({ items, title }) {
    const [hoverPoint, setHoverPoint] = useState(null);
    const visibleItems = (items || []).filter((item) => item.total > 0);
    if (visibleItems.length < 2) return null;

    const width = 820;
    const height = 224;
    const padLeft = 52;
    const padRight = 24;
    const padTop = 20;
    const padBottom = 38;
    const chartWidth = width - padLeft - padRight;
    const chartHeight = height - padTop - padBottom;
    const totals = visibleItems.map((item) => item.total);
    const min = Math.min(...totals);
    const max = Math.max(...totals);
    const average = totals.reduce((sum, value) => sum + value, 0) / totals.length;
    const axisMin = Math.max(0, Math.floor((Math.min(min, average) * 0.85) / 10) * 10);
    const axisMax = Math.max(axisMin + 10, Math.ceil((Math.max(max, average) * 1.08) / 10) * 10);
    const range = Math.max(1, axisMax - axisMin);
    const getY = (value) => padTop + ((axisMax - value) * chartHeight) / range;
    const points = visibleItems.map((item, idx) => {
        const x = padLeft + (idx * chartWidth) / Math.max(1, visibleItems.length - 1);
        const y = getY(item.total);
        return { ...item, x, y };
    });
    const linePath = points.map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    const baselineY = height - padBottom;
    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${baselineY} L ${points[0].x.toFixed(1)} ${baselineY} Z`;
    const first = visibleItems[0];
    const last = visibleItems[visibleItems.length - 1];
    const startDelta = last.total - first.total;
    const startDeltaPct = first.total ? Math.round((startDelta / first.total) * 100) : 0;
    const averageGap = last.total - average;
    const averageGapPct = average ? Math.round((averageGap / average) * 100) : 0;
    const peak = visibleItems.reduce((best, item) => item.total > best.total ? item : best, visibleItems[0]);
    const low = visibleItems.reduce((best, item) => item.total < best.total ? item : best, visibleItems[0]);
    const deltas = visibleItems.slice(1).map((item, idx) => item.total - visibleItems[idx].total);
    const avgAbsDelta = deltas.length
        ? deltas.reduce((sum, value) => sum + Math.abs(value), 0) / deltas.length
        : 0;
    const averageY = getY(average);
    const gridValues = Array.from(new Set([
        axisMax,
        Math.round((axisMax + axisMin) / 2),
        axisMin,
    ]));
    const xTicks = [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]]
        .filter((point, idx, arr) => point && arr.findIndex((item) => item.date === point.date) === idx);
    const peakPoint = points.find((point) => point.date === peak.date);
    const lowPoint = points.find((point) => point.date === low.date);
    const getToneClass = (value) => {
        if (value > 0) return styles.trendLensUp;
        if (value < 0) return styles.trendLensDown;
        return '';
    };
    const getPointToneClass = (point) => getToneClass(point?.delta || 0);
    const getLensTransform = (point) => {
        const x = point.x < 150 ? '0' : point.x > width - 150 ? '-100%' : '-50%';
        const y = point.y < 105 ? '14px' : 'calc(-100% - 16px)';
        return `translate(${x}, ${y})`;
    };
    const clampLensCoord = (value, min, max) => Math.min(max, Math.max(min, value));
    const handlePointerMove = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * width;
        const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * height;
        const nearest = points.reduce((best, point) => (
            Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best
        ), points[0]);
        setHoverPoint({
            ...nearest,
            cursorX: clampLensCoord(x, padLeft, width - padRight),
            cursorY: clampLensCoord(y, padTop, baselineY),
        });
    };

    return (
        <div className={styles.trendPanel}>
            <div className={styles.trendHeader}>
                <div>
                    <h3 className={styles.panelTitle}>{title}</h3>
                    <span className={styles.panelSub}>배차판 기입 시작일부터 현재까지 영업일 기준 변동</span>
                </div>
                <div className={styles.trendStats}>
                    <span><b>최신 영업일</b>{formatDecimal(last.total)}</span>
                    <span className={startDelta >= 0 ? styles.trendStatUp : styles.trendStatDown}>
                        <b>시작 대비</b>{startDelta >= 0 ? '+' : ''}{formatDecimal(startDelta)} ({startDeltaPct >= 0 ? '+' : ''}{formatDecimal(startDeltaPct)}%)
                    </span>
                    <span><b>영업일 평균</b>{formatDecimal(average)}</span>
                    <span className={averageGap >= 0 ? styles.trendStatUp : styles.trendStatDown}>
                        <b>평균 대비</b>{averageGap >= 0 ? '+' : ''}{formatDecimal(averageGap)} ({averageGapPct >= 0 ? '+' : ''}{formatDecimal(averageGapPct)}%)
                    </span>
                </div>
            </div>

            <div className={styles.trendChartWrap}>
                <svg
                    className={styles.trendSvg}
                    viewBox={`0 0 ${width} ${height}`}
                    role="img"
                    aria-label={title}
                    onPointerDown={handlePointerMove}
                    onPointerMove={handlePointerMove}
                    onPointerLeave={() => setHoverPoint(null)}
                >
                    <defs>
                        <linearGradient id="asanTrendFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.28" />
                            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
                        </linearGradient>
                    </defs>
                    {gridValues.map((value) => {
                        const y = getY(value);
                        return (
                            <g key={value}>
                                <line x1={padLeft} y1={y} x2={width - padRight} y2={y} className={styles.trendGrid} />
                                <text x={padLeft - 10} y={y + 4} className={styles.trendTick} textAnchor="end">{formatDecimal(value)}</text>
                            </g>
                        );
                    })}
                    <line x1={padLeft} y1={baselineY} x2={width - padRight} y2={baselineY} className={styles.trendAxis} />
                    <line x1={padLeft} y1={padTop} x2={padLeft} y2={baselineY} className={styles.trendAxis} />
                    <line x1={padLeft} y1={averageY} x2={width - padRight} y2={averageY} className={styles.trendAverageLine} />
                    <text x={width - padRight - 2} y={averageY - 6} className={styles.trendAverageLabel} textAnchor="end">
                        평균 {formatDecimal(average)}
                    </text>
                    <path d={areaPath} className={styles.trendArea} />
                    <path d={linePath} className={styles.trendLine} />
                    {peakPoint && (
                        <text x={Math.min(width - 92, peakPoint.x + 8)} y={Math.max(14, peakPoint.y - 10)} className={styles.trendMarkerLabel}>
                            고점 {peak.label} · {formatDecimal(peak.total)}
                        </text>
                    )}
                    {lowPoint && (
                        <text x={Math.min(width - 92, lowPoint.x + 8)} y={Math.min(baselineY - 8, lowPoint.y + 18)} className={styles.trendMarkerLabel}>
                            저점 {low.label} · {formatDecimal(low.total)}
                        </text>
                    )}
                    {points.map((point, idx) => (
                        <g key={point.date}>
                            <circle
                                cx={point.x}
                                cy={point.y}
                                r={hoverPoint?.date === point.date ? 5.8 : idx === points.length - 1 ? 4.8 : 3.3}
                                className={point.delta >= 0 ? styles.trendPointUp : styles.trendPointDown}
                            />
                        </g>
                    ))}
                    {hoverPoint && (
                        <>
                            <line x1={hoverPoint.x} y1={padTop} x2={hoverPoint.x} y2={baselineY} className={styles.trendFocusLine} />
                            <circle cx={hoverPoint.x} cy={hoverPoint.y} r="16" className={styles.trendFocusHalo} />
                            <circle cx={hoverPoint.x} cy={hoverPoint.y} r="6.5" className={styles.trendFocusPoint} />
                        </>
                    )}
                    {xTicks.map((point) => (
                        <text key={point.date} x={point.x} y={height - 11} className={styles.trendTick} textAnchor="middle">
                            {point.label}
                        </text>
                    ))}
                    <text x={(padLeft + width - padRight) / 2} y={height - 1} className={styles.trendAxisLabel} textAnchor="middle">
                        X축: 영업일
                    </text>
                    <text x={14} y={(padTop + baselineY) / 2} className={styles.trendAxisLabel} textAnchor="middle" transform={`rotate(-90 14 ${(padTop + baselineY) / 2})`}>
                        Y축: 대수
                    </text>
                </svg>
                {hoverPoint && (
                    <div
                        className={styles.trendLens}
                        style={{
                            left: `${((hoverPoint.cursorX ?? hoverPoint.x) / width) * 100}%`,
                            top: `${((hoverPoint.cursorY ?? hoverPoint.y) / height) * 100}%`,
                            transform: getLensTransform({
                                x: hoverPoint.cursorX ?? hoverPoint.x,
                                y: hoverPoint.cursorY ?? hoverPoint.y,
                            }),
                        }}
                    >
                        <strong>{hoverPoint.label}</strong>
                        <span className={styles.trendLensMetric}>
                            <em>총량</em>
                            <b className={getPointToneClass(hoverPoint)}>{formatDecimal(hoverPoint.total)}</b>
                        </span>
                        <span className={styles.trendLensMetric}>
                            <em>전영업일</em>
                            <b className={getToneClass(hoverPoint.delta)}>
                                {hoverPoint.delta >= 0 ? '+' : ''}{formatDecimal(hoverPoint.delta)}
                            </b>
                        </span>
                        <span className={styles.trendLensMetric}>
                            <em>평균 대비</em>
                            <b className={getToneClass(hoverPoint.total - average)}>
                                {hoverPoint.total - average >= 0 ? '+' : ''}{formatDecimal(hoverPoint.total - average)}
                            </b>
                        </span>
                    </div>
                )}
            </div>

            <div className={styles.trendFooter}>
                <span><b>분석 범위</b>{first.label} - {last.label} · 영업일 {visibleItems.length}일</span>
                <span><b>고점</b>{peak.label} · {formatDecimal(peak.total)}</span>
                <span><b>저점</b>{low.label} · {formatDecimal(low.total)}</span>
                <span><b>평균 변동폭</b>{formatDecimal(avgAbsDelta)}</span>
            </div>
        </div>
    );
}

function WeekdayOrderPanel({ data, periods = [], onSelect }) {
    const [mode, setMode] = useState('week');
    if (!data?.month?.buckets && !data?.week?.buckets) return null;

    const todayKey = getTodayKey();
    const weeklyPeriod = periods.find((period) => period.key === 'weekly');
    const monthlyPeriod = periods.find((period) => period.key === 'monthly');
    const weekOptions = (weeklyPeriod?.options || []).filter((option) => !option.start || option.start <= todayKey);
    const monthOptions = (monthlyPeriod?.options || []).filter((option) => !option.key || option.key <= todayKey.slice(0, 7));
    const active = mode === 'week' ? data.week : data.month;
    const metricKey = mode === 'week' ? 'total' : 'average';
    const valueFormatter = mode === 'week' ? formatQty : formatDecimal;
    const maxValue = Math.max(1, ...active.buckets.map((bucket) => bucket[metricKey] || 0));
    const monthTotal = data.month.buckets.reduce((sum, bucket) => sum + bucket.total, 0);
    const monthAverageTotal = data.month.buckets.reduce((sum, bucket) => sum + bucket.average, 0);
    const weekTotal = data.week.buckets.reduce((sum, bucket) => sum + bucket.total, 0);
    const selectedWeekLabel = weeklyPeriod?.title || data.week.fullLabel || data.week.label;
    const selectedMonthLabel = monthlyPeriod?.title || data.month.label;
    const legendItems = toSortedMapEntries(
        active.buckets.reduce((acc, bucket) => {
            Object.entries(bucket.breakdown || {}).forEach(([name, value]) => {
                acc[name] = (acc[name] || 0) + value;
            });
            return acc;
        }, {}),
        4,
    );

    return (
        <div className={styles.weekdayPanel}>
            <div className={styles.weekdayHead}>
                <div>
                    <h3 className={styles.panelTitle}>요일별 작업지 비중</h3>
                    <span className={styles.panelSub}>요일별 오더 안에서 작업지 점유를 비교</span>
                </div>
                <div className={styles.weekdayTabs}>
                    <button
                        className={`${styles.weekdayTab} ${mode === 'week' ? styles.weekdayTabActive : ''}`}
                        onClick={() => setMode('week')}
                    >
                        주간 실적
                    </button>
                    <button
                        className={`${styles.weekdayTab} ${mode === 'month' ? styles.weekdayTabActive : ''}`}
                        onClick={() => setMode('month')}
                    >
                        월간 평균
                    </button>
                </div>
            </div>

            <div className={styles.weekdaySummary}>
                <label className={`${styles.weekdayChooser} ${mode === 'week' ? styles.weekdayChooserActive : ''}`}>
                    <span><b>{selectedWeekLabel}</b>주간 실적 {formatQty(weekTotal)}</span>
                    {weekOptions.length > 0 && (
                        <select
                            aria-label="요일별 작업지 비중 주간 선택"
                            value={weeklyPeriod?.selectedKey || data.week.key || ''}
                            onChange={(event) => {
                                setMode('week');
                                onSelect?.('weekly', event.target.value);
                            }}
                        >
                            {weekOptions.map((option) => (
                                <option key={option.key} value={option.key}>{option.label}</option>
                            ))}
                        </select>
                    )}
                </label>
                <label className={`${styles.weekdayChooser} ${mode === 'month' ? styles.weekdayChooserActive : ''}`}>
                    <span><b>{selectedMonthLabel}</b>월기준 주간평균합 {formatDecimal(monthAverageTotal)} <small>누적 {formatQty(monthTotal)}</small></span>
                    {monthOptions.length > 0 && (
                        <select
                            aria-label="요일별 작업지 비중 월 선택"
                            value={monthlyPeriod?.selectedKey || data.month.key || ''}
                            onChange={(event) => {
                                setMode('month');
                                onSelect?.('monthly', event.target.value);
                            }}
                        >
                            {monthOptions.map((option) => (
                                <option key={option.key} value={option.key}>{option.label}</option>
                            ))}
                        </select>
                    )}
                </label>
            </div>

            <div className={styles.weekdayBars}>
                {active.buckets.map((bucket) => {
                    const value = bucket[metricKey] || 0;
                    const width = `${Math.max(value > 0 ? 8 : 0, (value / maxValue) * 100)}%`;
                    const rawBreakdown = toSortedMapEntries(bucket.breakdown);
                    const otherTotal = rawBreakdown.slice(6).reduce((sum, [, count]) => sum + count, 0);
                    const breakdown = otherTotal > 0
                        ? [...rawBreakdown.slice(0, 6), ['기타', otherTotal]]
                        : rawBreakdown;
                    return (
                        <div key={bucket.dayIndex} className={styles.weekdayRow}>
                            <span className={styles.weekdayName}>{bucket.label}</span>
                            <div className={styles.weekdayTrack}>
                                <span className={styles.weekdayFill} style={{ width }}>
                                    {breakdown.length > 0 ? breakdown.map(([name, count]) => {
                                        const pct = bucket.total ? (count / bucket.total) * 100 : 0;
                                        const tooltip = mode === 'week'
                                            ? `${selectedWeekLabel} ${bucket.label}요일 · ${name} ${formatQty(count)}대 · 요일 내 ${formatDecimal(pct)}%`
                                            : `${active.label} ${bucket.label}요일 · ${name} 누적 ${formatDecimal(count)}대 · 요일 내 ${formatDecimal(pct)}% · 관측 ${bucket.count}일`;
                                        return (
                                            <i
                                                key={name}
                                                className={styles.weekdaySegment}
                                                data-tooltip={tooltip}
                                                style={{
                                                    width: `${Math.max(3, pct)}%`,
                                                    background: getHashColor(name),
                                                }}
                                            />
                                        );
                                    }) : <i className={styles.weekdaySegmentEmpty} />}
                                </span>
                            </div>
                            <b>{valueFormatter(value)}</b>
                        </div>
                    );
                })}
            </div>
            {legendItems.length > 0 && (
                <div className={styles.weekdayLegend}>
                    {legendItems.map(([name]) => (
                        <span key={name} title={name}>
                            <i style={{ background: getHashColor(name) }} />
                            {name}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

function ShareDonut({ data, title }) {
    const sorted = toSortedMapEntries(data);
    const top = sorted.slice(0, 5);
    const otherTotal = sorted.slice(5).reduce((sum, [, value]) => sum + value, 0);
    if (otherTotal > 0) top.push(['기타', otherTotal]);

    const total = top.reduce((sum, [, value]) => sum + value, 0);
    if (total === 0) return null;

    let accPct = 0;
    const gradientParts = top.map(([, value], idx) => {
        const pct = (value / total) * 100;
        const color = CHART_COLORS[idx % CHART_COLORS.length];
        const part = `${color} ${accPct}% ${accPct + pct}%`;
        accPct += pct;
        return part;
    });

    return (
        <div className={styles.shareCard}>
            <div className={styles.shareTitleRow}>
                <h4 className={styles.pieTitle}>{title}</h4>
                <span>{formatQty(total)}</span>
            </div>
            <div className={styles.shareBody}>
                <div
                    className={styles.donutCircle}
                    style={{ background: `conic-gradient(${gradientParts.join(', ')})` }}
                >
                    <div className={styles.donutCenter}>
                        <span>{getPct(top[0]?.[1] || 0, total)}%</span>
                        <small>톱1점유</small>
                    </div>
                </div>
                <div className={styles.pieLegend}>
                    {top.map(([name, value], idx) => (
                        <div key={name} className={styles.pieLegendRow}>
                            <span className={styles.pieDot} style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }} />
                            <span className={styles.pieLabel} title={name}>{name}</span>
                            <span className={styles.pieVal}>{formatQty(value)}</span>
                            <span className={styles.piePct}>{getPct(value, total)}%</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function MiniSplitCard({ data, title }) {
    const entries = toSortedMapEntries(data, 5);
    const total = entries.reduce((sum, [, value]) => sum + value, 0);
    if (total === 0) return null;

    return (
        <div className={styles.splitCard}>
            <div className={styles.shareTitleRow}>
                <h4 className={styles.pieTitle}>{title}</h4>
                <span>{formatQty(total)}</span>
            </div>
            <div className={styles.splitStack}>
                {entries.map(([name, value], idx) => (
                    <div key={name} className={styles.splitRow}>
                        <div className={styles.splitMeta}>
                            <span title={name}>{name}</span>
                            <b>
                                {formatQty(value)}
                                <small>{getPct(value, total)}%</small>
                            </b>
                        </div>
                        <div className={styles.splitTrack}>
                            <span
                                style={{
                                    width: `${Math.max(4, (value / total) * 100)}%`,
                                    background: CHART_COLORS[idx % CHART_COLORS.length],
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function InsightBlock({ title, items, total }) {
    return (
        <div className={styles.insightBlock}>
            <h4>{title}</h4>
            <div className={styles.insightRows}>
                {items.length === 0 ? (
                    <div className={styles.emptyInline}>데이터 없음</div>
                ) : items.map((item, idx) => (
                    <div key={item.name} className={styles.insightRow}>
                        <span className={styles.insightRank}>{idx + 1}</span>
                        <span className={styles.insightName} title={item.name}>{item.name}</span>
                        <strong>{formatQty(item.total)}</strong>
                        <em>{getPct(item.total, total)}%</em>
                    </div>
                ))}
            </div>
        </div>
    );
}
