'use client';
import { useEffect, useMemo, useState } from 'react';
import styles from './dashboard.module.css';
import {
    ASAN_DASHBOARD_CHART_MODES,
    buildAsanDashboardTimeline,
    buildAsanDashboardScope,
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
        return { activeScope, periods: selectablePeriods.periods, periodOptions: selectablePeriods.options, timeline };
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

            {dateControlsSlot && (
                <div className={styles.dateBridge}>
                    {dateControlsSlot}
                </div>
            )}

            <TrendPanel
                items={dashboardData.timeline}
                title={viewMode === 'customer' ? '일자별 오더 추세' : '일자별 실행 배차 추세'}
            />

            <div className={styles.mixModules}>
                <ShareDonut data={dashboardData.activeScope.pieAggs.shipper} title="화주 점유율" />
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
    const container = topEntry(period.scope.pieAggs.container);
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
                {direction && <span>{direction[0]} {formatQty(direction[1])}</span>}
                {container && <span>{container[0]} {formatQty(container[1])}</span>}
                {focusPct > 0 && <span>집중 {focusPct}%</span>}
            </div>
        </div>
    );
}

function TrendPanel({ items, title }) {
    const visibleItems = (items || []).filter((item) => item.total > 0);
    if (visibleItems.length < 2) return null;

    const width = 720;
    const height = 176;
    const padX = 18;
    const padY = 20;
    const totals = visibleItems.map((item) => item.total);
    const min = Math.min(...totals);
    const max = Math.max(...totals);
    const range = Math.max(1, max - min);
    const points = visibleItems.map((item, idx) => {
        const x = padX + (idx * (width - padX * 2)) / Math.max(1, visibleItems.length - 1);
        const y = padY + ((max - item.total) * (height - padY * 2)) / range;
        return { ...item, x, y };
    });
    const linePath = points.map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height - padY} L ${points[0].x.toFixed(1)} ${height - padY} Z`;
    const first = visibleItems[0];
    const last = visibleItems[visibleItems.length - 1];
    const delta = last.total - first.total;
    const deltaPct = first.total ? Math.round((delta / first.total) * 100) : 0;
    const peak = visibleItems.reduce((best, item) => item.total > best.total ? item : best, visibleItems[0]);
    const low = visibleItems.reduce((best, item) => item.total < best.total ? item : best, visibleItems[0]);
    const recent = visibleItems.slice(-7);
    const recentAvg = recent.reduce((sum, item) => sum + item.total, 0) / recent.length;

    return (
        <div className={styles.trendPanel}>
            <div className={styles.trendHeader}>
                <div>
                    <h3 className={styles.panelTitle}>{title}</h3>
                    <span className={styles.panelSub}>초기 적재일부터 현재까지 변동폭</span>
                </div>
                <div className={styles.trendStats}>
                    <span><b>현재</b>{formatQty(last.total)}</span>
                    <span className={delta >= 0 ? styles.trendStatUp : styles.trendStatDown}>
                        <b>누적 변동</b>{delta >= 0 ? '+' : ''}{formatQty(delta)} ({deltaPct >= 0 ? '+' : ''}{deltaPct}%)
                    </span>
                    <span><b>최근 7일 평균</b>{formatQty(recentAvg)}</span>
                </div>
            </div>

            <div className={styles.trendChartWrap}>
                <svg className={styles.trendSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
                    <defs>
                        <linearGradient id="asanTrendFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.28" />
                            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
                        </linearGradient>
                    </defs>
                    <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} className={styles.trendAxis} />
                    <line x1={padX} y1={padY} x2={padX} y2={height - padY} className={styles.trendAxis} />
                    <path d={areaPath} className={styles.trendArea} />
                    <path d={linePath} className={styles.trendLine} />
                    {points.map((point, idx) => (
                        <g key={point.date}>
                            <circle
                                cx={point.x}
                                cy={point.y}
                                r={idx === points.length - 1 ? 4.8 : 3.3}
                                className={point.delta >= 0 ? styles.trendPointUp : styles.trendPointDown}
                            >
                                <title>{`${point.label} ${formatQty(point.total)}대 (${point.delta >= 0 ? '+' : ''}${formatQty(point.delta)}, ${point.deltaPct >= 0 ? '+' : ''}${point.deltaPct}%)`}</title>
                            </circle>
                        </g>
                    ))}
                </svg>
            </div>

            <div className={styles.trendFooter}>
                <span><b>최초</b>{first.label} · {formatQty(first.total)}</span>
                <span><b>저점</b>{low.label} · {formatQty(low.total)}</span>
                <span><b>고점</b>{peak.label} · {formatQty(peak.total)}</span>
            </div>
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
                    <span>{getPct(top[0]?.[1] || 0, total)}%</span>
                </div>
                <div className={styles.pieLegend}>
                    {top.map(([name, value], idx) => (
                        <div key={name} className={styles.pieLegendRow}>
                            <span className={styles.pieDot} style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }} />
                            <span className={styles.pieLabel} title={name}>{name}</span>
                            <span className={styles.pieVal}>{formatQty(value)}</span>
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
                            <b>{formatQty(value)}</b>
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
