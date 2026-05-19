'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatPerformanceAmount } from '@/utils/asanPerformanceView.mjs';
import styles from './annualPerformance.module.css';

const DEFAULT_SUMMARY_YEAR = 2026;
const DEFAULT_EXTRA_MONTHS = 3;

function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function formatPercent(value, digits = 1) {
    return `${safeNumber(value).toLocaleString('ko-KR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })}%`;
}

function formatSignedRate(value) {
    const number = safeNumber(value);
    return `${number > 0 ? '+' : ''}${formatPercent(number, 1)}`;
}

function fmtTs(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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

function metricTone(value) {
    const number = safeNumber(value);
    if (number >= 10) return 'good';
    if (number >= 5) return 'watch';
    return 'danger';
}

function trendTone(delta) {
    return safeNumber(delta?.amount) >= 0 ? 'good' : 'watch';
}

function KpiCard({ label, value, sub, tone = 'neutral' }) {
    return (
        <div className={`${styles.summaryKpiCard} ${styles[`summaryTone_${tone}`] || ''}`}>
            <span>{label}</span>
            <strong>{value}</strong>
            <em>{sub}</em>
        </div>
    );
}

function ExecutiveFlowDiagram({ summary }) {
    const sourceMix = summary?.sourceMix || {};
    const annual = sourceMix.annual || {};
    const monthly = sourceMix.monthly || {};
    const revenue = Math.max(1, safeNumber(summary?.totalRevenue));
    const purchaseWidth = Math.min(100, Math.max(3, (safeNumber(summary?.totalPurchase) / revenue) * 100));
    const profitWidth = Math.min(100, Math.max(3, Math.abs(safeNumber(summary?.totalProfit)) / revenue * 100));

    return (
        <section className={styles.summaryPanel}>
            <div className={styles.summaryPanelHead}>
                <div>
                    <h3>연간+월간 합산 흐름</h3>
                    <span>연간 원장과 월간 마감 원장의 순매출·매입·손익 합산</span>
                </div>
            </div>
            <div className={styles.summaryFlowDiagram}>
                <div className={styles.summarySourceStack}>
                    <div>
                        <span>연간실적</span>
                        <strong>{formatPerformanceAmount(annual.revenue)}</strong>
                        <i style={{ width: `${Math.max(4, safeNumber(annual.revenueShare))}%` }} />
                    </div>
                    <div>
                        <span>월간실적</span>
                        <strong>{formatPerformanceAmount(monthly.revenue)}</strong>
                        <i style={{ width: `${Math.max(4, safeNumber(monthly.revenueShare))}%` }} />
                    </div>
                </div>
                <div className={styles.summaryFlowArrow}>합산</div>
                <div className={styles.summaryFlowCore}>
                    <div className={styles.summaryFlowTotal}>
                        <span>통합 매출</span>
                        <strong>{formatPerformanceAmount(summary?.totalRevenue)}</strong>
                    </div>
                    <div className={styles.summaryFlowBars}>
                        <div>
                            <span>매입</span>
                            <b style={{ width: `${purchaseWidth}%` }} />
                            <em>{formatPerformanceAmount(summary?.totalPurchase)}</em>
                        </div>
                        <div>
                            <span>손익</span>
                            <b className={safeNumber(summary?.totalProfit) < 0 ? styles.summaryNegativeBar : styles.summaryPositiveBar} style={{ width: `${profitWidth}%` }} />
                            <em>{formatPerformanceAmount(summary?.totalProfit)}</em>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function ExecutiveTrendChart({ monthly = [] }) {
    const items = monthly.slice(-12);
    const width = 760;
    const height = 168;
    const maxRevenue = Math.max(1, ...items.map(item => Math.abs(safeNumber(item.revenue))));
    const maxProfit = Math.max(1, ...items.map(item => Math.abs(safeNumber(item.profit))));
    const xAt = idx => (items.length <= 1 ? 38 : 38 + (idx / (items.length - 1)) * (width - 76));
    const revenueY = value => 22 + (1 - safeNumber(value) / maxRevenue) * 82;
    const profitY = value => Math.max(38, Math.min(144, 118 - (safeNumber(value) / maxProfit) * 50));
    const profitPoints = items.map((item, idx) => `${xAt(idx).toFixed(1)},${profitY(item.profit).toFixed(1)}`).join(' ');

    return (
        <section className={`${styles.summaryPanel} ${styles.summaryTrendPanel}`}>
            <div className={styles.summaryPanelHead}>
                <div>
                    <h3>최근월 흐름</h3>
                    <span>통합 기준 최근 12개월</span>
                </div>
            </div>
            {items.length < 2 ? (
                <div className={styles.emptyPanel}>월별 추세를 만들 데이터가 아직 부족합니다.</div>
            ) : (
                <div className={styles.summaryTrendChart}>
                    <svg className={styles.summaryTrendSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="종합실적 최근월 차트">
                        <line x1="28" y1="118" x2="732" y2="118" className={styles.zeroLine} />
                        {items.map((item, idx) => {
                            const x = xAt(idx);
                            const barHeight = Math.max(3, 102 - revenueY(item.revenue));
                            return (
                                <g key={item.period || idx}>
                                    <rect
                                        x={x - 10}
                                        y={102 - barHeight}
                                        width="20"
                                        height={barHeight}
                                        rx="3"
                                        className={styles.summaryRevenueBar}
                                    >
                                        <title>{`${item.period} 매출 ${formatPerformanceAmount(item.revenue)}`}</title>
                                    </rect>
                                    <text x={x} y="158" textAnchor="middle" className={styles.summaryTrendLabel}>{String(item.period || '').slice(5) || item.period}</text>
                                </g>
                            );
                        })}
                        <polyline points={profitPoints} className={styles.summaryProfitLine} />
                        {items.map((item, idx) => (
                            <circle key={`${item.period || idx}-profit`} cx={xAt(idx)} cy={profitY(item.profit)} r="3.5" className={styles.summaryProfitPoint}>
                                <title>{`${item.period} 손익 ${formatPerformanceAmount(item.profit)}`}</title>
                            </circle>
                        ))}
                    </svg>
                    <div className={styles.summaryTrendLegend}>
                        <span><i className={styles.revenueDot} />매출</span>
                        <span><i className={styles.profitDot} />손익</span>
                    </div>
                </div>
            )}
        </section>
    );
}

function ExecutiveYearMatrix({ yearly = [], onOpenAnnual }) {
    const maxRevenue = Math.max(1, ...yearly.map(item => Math.abs(safeNumber(item.revenue))));
    return (
        <section className={styles.summaryPanel}>
            <div className={styles.summaryPanelHead}>
                <div>
                    <h3>연간 누적 매트릭스</h3>
                    <span>연도별 매출·매입·손익</span>
                </div>
                <button type="button" className={styles.smallBtn} onClick={onOpenAnnual}>연간실적 보기</button>
            </div>
            <div className={styles.summaryYearMatrix}>
                {yearly.slice(-8).map(item => (
                    <button type="button" key={item.year} onClick={onOpenAnnual}>
                        <span>{item.year}</span>
                        <strong>{formatPerformanceAmount(item.revenue)}</strong>
                        <em className={safeNumber(item.profit) < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(item.profit)} · {formatPercent(item.profitRate, 1)}</em>
                        <i style={{ width: `${Math.max(4, Math.min(100, Math.abs(safeNumber(item.revenue)) / maxRevenue * 100))}%` }} />
                    </button>
                ))}
            </div>
        </section>
    );
}

function ExecutiveSourceTable({ summary, onOpenAnnual, onOpenMonthly }) {
    const rows = [
        { label: '연간실적', action: onOpenAnnual, ...(summary?.sourceMix?.annual || {}) },
        { label: '월간실적', action: onOpenMonthly, ...(summary?.sourceMix?.monthly || {}) },
    ];
    return (
        <section className={styles.summaryPanel}>
            <div className={styles.summaryPanelHead}>
                <div>
                    <h3>원장 신뢰도</h3>
                    <span>상세는 월간실적·연간실적 탭에서 확인</span>
                </div>
            </div>
            <div className={styles.summarySourceRows}>
                <div className={styles.summarySourceHead}>
                    <span>구분</span>
                    <span>매출</span>
                    <span>손익률</span>
                    <span>행/파일</span>
                    <span>동기화</span>
                </div>
                {rows.map(row => (
                    <button type="button" className={styles.summarySourceRow} key={row.label} onClick={row.action}>
                        <span>{row.label}</span>
                        <strong>{formatPerformanceAmount(row.revenue)}</strong>
                        <em>{formatPercent(row.profitRate, 1)}</em>
                        <b>{safeNumber(row.rowCount).toLocaleString('ko-KR')}행 · {safeNumber(row.fileCount).toLocaleString('ko-KR')}개</b>
                        <small>{fmtTs(row.syncedAt)}</small>
                    </button>
                ))}
            </div>
        </section>
    );
}

function ExecutiveSignals({ signals = [] }) {
    return (
        <section className={styles.summaryPanel}>
            <div className={styles.summaryPanelHead}>
                <div>
                    <h3>경영 판단</h3>
                    <span>최근 방향, 수익성, 집중도, 데이터 신뢰</span>
                </div>
            </div>
            <div className={styles.summarySignalGrid}>
                {signals.map(signal => (
                    <div className={`${styles.summarySignal} ${styles[`summaryTone_${signal.tone}`] || ''}`} key={signal.title}>
                        <span>{signal.title}</span>
                        <strong>{signal.value}</strong>
                        <em>{signal.detail}</em>
                    </div>
                ))}
            </div>
        </section>
    );
}

function TopConcentration({ summary, openMonthly }) {
    const segment = summary?.strategicSegments?.[0] || null;
    const vehicles = (summary?.vehiclePerformance || []).slice(0, 5);
    return (
        <section className={styles.summaryPanel}>
            <div className={styles.summaryPanelHead}>
                <div>
                    <h3>계약/차량 집중도</h3>
                    <span>매출 상위 축과 차량</span>
                </div>
                <button type="button" className={styles.smallBtn} onClick={openMonthly}>상세는 월간실적</button>
            </div>
            <div className={styles.summaryConcentration}>
                <div>
                    <span>대표 축</span>
                    <strong>{segment?.label || segment?.name || '-'}</strong>
                    <em>{segment ? `${formatPerformanceAmount(segment.revenue)} · ${formatPercent(segment.revenueShare, 1)}` : '-'}</em>
                </div>
                <div className={styles.summaryVehicleList}>
                    {vehicles.map((vehicle, idx) => (
                        <button type="button" key={vehicle.vehicleNo || vehicle.name || idx} onClick={openMonthly}>
                            <span>{idx + 1}</span>
                            <strong>{vehicle.vehicleNo || vehicle.name || '-'}</strong>
                            <em>{formatPerformanceAmount(vehicle.revenue)}</em>
                            <b className={safeNumber(vehicle.profit) < 0 ? styles.negative : styles.positive}>{formatPercent(vehicle.profitRate, 1)}</b>
                        </button>
                    ))}
                </div>
            </div>
        </section>
    );
}

export default function AsanSummaryPerformance({ onOpenAnnual, onOpenMonthly }) {
    const [payload, setPayload] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [elapsedMs, setElapsedMs] = useState(0);

    const loadSummary = useCallback(async () => {
        const started = performance.now();
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({
                year: String(DEFAULT_SUMMARY_YEAR),
                extra_months: String(DEFAULT_EXTRA_MONTHS),
            });
            const res = await fetch(`/api/branches/asan/performance/summary?${params.toString()}`, { cache: 'no-store' });
            const json = await readPerformanceJson(res, '종합실적 조회 실패');
            setPayload(json.data || null);
        } catch (err) {
            setError(err.message || '종합실적 조회 실패');
        } finally {
            setElapsedMs(Math.round(performance.now() - started));
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSummary();
    }, [loadSummary]);

    const summary = payload?.summary || null;
    const kpis = useMemo(() => {
        if (!summary) return [];
        return [
            {
                label: '통합 매출',
                value: formatPerformanceAmount(summary.totalRevenue),
                sub: `연간 ${formatPercent(summary.sourceMix?.annual?.revenueShare, 1)} · 월간 ${formatPercent(summary.sourceMix?.monthly?.revenueShare, 1)}`,
                tone: 'good',
            },
            {
                label: '통합 손익',
                value: formatPerformanceAmount(summary.totalProfit),
                sub: `최근월 손익 ${formatPerformanceAmount(summary.latestMonth?.profit)}`,
                tone: safeNumber(summary.totalProfit) >= 0 ? 'good' : 'danger',
            },
            {
                label: '손익률',
                value: formatPercent(summary.profitRate, 2),
                sub: `최근월 ${formatPercent(summary.latestMonth?.profitRate, 1)} · ${formatSignedRate(summary.latestProfitDelta?.rate)}`,
                tone: metricTone(summary.profitRate),
            },
            {
                label: '매입률',
                value: formatPercent(summary.purchaseRate, 2),
                sub: `${safeNumber(summary.rowCount).toLocaleString('ko-KR')}행 · ${safeNumber(summary.fileCount).toLocaleString('ko-KR')}개 원장`,
                tone: safeNumber(summary.purchaseRate) <= 85 ? 'good' : 'watch',
            },
            {
                label: '최근월',
                value: summary.latestMonth?.period || '-',
                sub: `매출 ${formatSignedRate(summary.latestRevenueDelta?.rate)} · 손익 ${formatSignedRate(summary.latestProfitDelta?.rate)}`,
                tone: trendTone(summary.latestRevenueDelta),
            },
        ];
    }, [summary]);

    const openAnnual = onOpenAnnual || (() => {});
    const openMonthly = onOpenMonthly || (() => {});

    return (
        <div className={`${styles.container} ${styles.summaryExecutive}`}>
            <div className={styles.topBar}>
                <div className={styles.titleBlock}>
                    <h2 className={styles.title}>아산 종합 실적 지휘판</h2>
                    <div className={styles.metaLine}>
                        <span>연간+월간 합산</span>
                        <span>{summary?.periodStart && summary?.periodEnd ? `${summary.periodStart} ~ ${summary.periodEnd}` : '기간 산정 중'}</span>
                        <span className={styles.elapsed}>{loading ? '데이터를 불러오는 중입니다...' : `${elapsedMs.toLocaleString('ko-KR')}ms`}</span>
                        <span className={styles.syncBadge}>동기화 {fmtTs(summary?.syncedAt)}</span>
                    </div>
                </div>
                <div className={styles.actions}>
                    <button type="button" className={styles.ghostBtn} onClick={loadSummary} disabled={loading}>새로고침</button>
                    <button type="button" className={styles.smallBtn} onClick={openMonthly}>월간실적</button>
                    <button type="button" className={styles.smallBtn} onClick={openAnnual}>연간실적</button>
                </div>
            </div>

            {error && <div className={styles.errorBox}>{error}</div>}
            {!summary && !error && <div className={styles.emptyPanel}>데이터를 불러오는 중입니다...</div>}

            {summary && (
                <div className={styles.summaryDashboard}>
                    <div className={styles.summaryKpiGrid}>
                        {kpis.map(kpi => <KpiCard key={kpi.label} {...kpi} />)}
                    </div>

                    <div className={styles.summaryMainGrid}>
                        <ExecutiveFlowDiagram summary={summary} />
                        <ExecutiveSignals signals={summary.executiveSignals || []} />
                        <ExecutiveTrendChart monthly={summary.monthly || []} />
                        <ExecutiveYearMatrix yearly={summary.yearly || []} onOpenAnnual={openAnnual} />
                        <TopConcentration summary={summary} openMonthly={openMonthly} />
                        <ExecutiveSourceTable summary={summary} onOpenAnnual={openAnnual} onOpenMonthly={openMonthly} />
                    </div>
                </div>
            )}
        </div>
    );
}
