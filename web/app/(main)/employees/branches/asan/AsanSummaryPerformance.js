'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatPerformanceAmount } from '@/utils/asanPerformanceView.mjs';
import styles from './annualPerformance.module.css';

const DEFAULT_SUMMARY_YEAR = 2026;
const DEFAULT_EXTRA_MONTHS = 3;
const SCOPE_BUTTONS = [
    { key: 'all', label: '전체' },
    { key: 'year', label: '연도별' },
    { key: 'month', label: '월별' },
    { key: 'day', label: '일별' },
];
const LEGACY_PROFIT_RATE_LABEL = '손익' + '률';
const LEGACY_PROFIT_SIGNAL_TITLE = '수익성 ' + '압력';
const LEGACY_OWN_SIGNAL_TITLE = 'ELS/외부 ' + '집중도';
const LEGACY_HIGH_MARGIN_LABEL = '고' + '마진';
const LEGACY_LOW_MARGIN_LABEL = '저' + '마진';
const EXECUTIVE_SIGNAL_TITLE_MAP = {
    [LEGACY_PROFIT_SIGNAL_TITLE]: '이익률',
    [LEGACY_OWN_SIGNAL_TITLE]: '자사 비율',
    [`${LEGACY_HIGH_MARGIN_LABEL} 청구처`]: '이익률 우수 청구처',
    [`${LEGACY_HIGH_MARGIN_LABEL} 지급처`]: '이익률 우수 지급처',
    [`${LEGACY_LOW_MARGIN_LABEL} 청구처`]: '이익률 점검 청구처',
    [`${LEGACY_LOW_MARGIN_LABEL} 지급처`]: '이익률 점검 지급처',
};

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

function formatScopeMonth(period = '') {
    const [year, month] = String(period || '').split('-');
    if (!year || !month) return period || '-';
    return `${year}년 ${Number(month)}월`;
}

function metricLabel(item = {}, basis = '월별') {
    if (basis === '연도별') {
        return item.year ? `${item.year}년` : String(item.period || item.scopeKey || '-');
    }
    if (basis === '일별') {
        return item.date ? String(item.date).slice(5) : String(item.period || '').slice(5);
    }
    return String(item.period || item.year || '').slice(5) || item.period || item.year || '-';
}

function metricTitleLabel(item = {}, basis = '월별') {
    if (basis === '연도별') return item.year ? `${item.year}년` : String(item.scopeKey || '-');
    if (basis === '일별') return item.date || item.scopeKey || '-';
    return item.period || item.scopeKey || '-';
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

function summaryScopeKey(scope = {}) {
    const mode = scope.mode || 'all';
    if (mode === 'year') return `year:${scope.year || ''}`;
    if (mode === 'month') return `month:${scope.month || ''}`;
    if (mode === 'day') return `day:${scope.dayKey || ''}`;
    return 'all';
}

function normalizeExecutiveText(value) {
    return String(value ?? '-').replaceAll(LEGACY_PROFIT_RATE_LABEL, '이익률');
}

function normalizeOwnRatioText(value) {
    return normalizeExecutiveText(value)
        .replace(/^ELS(\s|$)/, '자사$1')
        .replaceAll('ELS직계약차량', '자사 직계약')
        .replaceAll('ELS직계약', '자사 직계약')
        .replaceAll('ELS/', '자사/');
}

function normalizeExecutiveSignal(signal = {}) {
    const originalTitle = String(signal.title || '');
    const titleBase = normalizeExecutiveText(originalTitle);
    const title = EXECUTIVE_SIGNAL_TITLE_MAP[originalTitle] || EXECUTIVE_SIGNAL_TITLE_MAP[titleBase] || titleBase || '-';
    const isOwnRatio = originalTitle === LEGACY_OWN_SIGNAL_TITLE || title === '자사 비율';
    return {
        ...signal,
        title,
        value: isOwnRatio ? normalizeOwnRatioText(signal.value) : normalizeExecutiveText(signal.value),
        detail: isOwnRatio ? normalizeOwnRatioText(signal.detail) : normalizeExecutiveText(signal.detail),
    };
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

function ScopeControls({
    scopeMode,
    setScopeMode,
    selectedYear,
    setSelectedYear,
    selectedMonth,
    setSelectedMonth,
    selectedDayKey,
    setSelectedDayKey,
    options,
}) {
    const years = options?.yearly || [];
    const months = options?.monthly || [];
    const days = options?.daily || [];
    const yearSelectEnabled = scopeMode === 'year';
    const monthSelectEnabled = scopeMode === 'month';
    const daySelectEnabled = scopeMode === 'day';

    return (
        <section className={styles.summaryScopePanel}>
            <div className={styles.summaryScopeButtons}>
                {SCOPE_BUTTONS.map(item => (
                    <button
                        type="button"
                        key={item.key}
                        className={scopeMode === item.key ? styles.summaryScopeActive : ''}
                        onClick={() => setScopeMode(item.key)}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
            <div className={styles.summaryScopeSelects}>
                <label className={!yearSelectEnabled ? styles.summaryScopeDisabled : ''}>
                    <span>연도</span>
                    <select
                        value={selectedYear}
                        disabled={!yearSelectEnabled}
                        onChange={(event) => {
                            setSelectedYear(event.target.value);
                            setScopeMode('year');
                        }}
                    >
                        {years.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
                    </select>
                </label>
                <label className={!monthSelectEnabled ? styles.summaryScopeDisabled : ''}>
                    <span>월</span>
                    <select
                        value={selectedMonth}
                        disabled={!monthSelectEnabled}
                        onChange={(event) => {
                            setSelectedMonth(event.target.value);
                            setScopeMode('month');
                        }}
                    >
                        {months.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
                    </select>
                </label>
                <label className={!daySelectEnabled ? styles.summaryScopeDisabled : ''}>
                    <span>일</span>
                    <select
                        value={selectedDayKey}
                        disabled={!daySelectEnabled}
                        onChange={(event) => {
                            setSelectedDayKey(event.target.value);
                            setScopeMode('day');
                        }}
                    >
                        {days.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
                    </select>
                </label>
            </div>
        </section>
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
                    <h3>선택 범위 합산 구조</h3>
                    <span>{summary?.scope?.label || '전체'} 기준 · 연간실적과 월간실적을 더한 뒤 매입을 차감</span>
                </div>
            </div>
            <div className={styles.summaryFlowDiagram}>
                <div className={styles.summarySourceStack}>
                    <div>
                        <span>연간실적 매출</span>
                        <strong>{formatPerformanceAmount(annual.revenue)}</strong>
                        <i style={{ width: `${Math.max(4, safeNumber(annual.revenueShare))}%` }} />
                    </div>
                    <div>
                        <span>월간실적 매출</span>
                        <strong>{formatPerformanceAmount(monthly.revenue)}</strong>
                        <i style={{ width: `${Math.max(4, safeNumber(monthly.revenueShare))}%` }} />
                    </div>
                </div>
                <div className={styles.summaryFlowArrow}>합산</div>
                <div className={styles.summaryFlowCore}>
                    <div className={styles.summaryFlowTotal}>
                        <span>통합 매출</span>
                        <strong>{formatPerformanceAmount(summary?.totalRevenue)}</strong>
                        <em>연간 + 월간</em>
                    </div>
                    <div className={styles.summaryFlowBars}>
                        <div>
                            <span>매입 차감</span>
                            <b style={{ width: `${purchaseWidth}%` }} />
                            <em>{formatPerformanceAmount(summary?.totalPurchase)}</em>
                        </div>
                        <div>
                            <span>통합 손익</span>
                            <b className={safeNumber(summary?.totalProfit) < 0 ? styles.summaryNegativeBar : styles.summaryPositiveBar} style={{ width: `${profitWidth}%` }} />
                            <em>{formatPerformanceAmount(summary?.totalProfit)}</em>
                        </div>
                    </div>
                </div>
            </div>
            <div className={styles.summaryFormulaStrip}>
                <span>매출 = 연간실적 + 월간실적</span>
                <strong>{formatPerformanceAmount(annual.revenue)} + {formatPerformanceAmount(monthly.revenue)} = {formatPerformanceAmount(summary?.totalRevenue)}</strong>
                <span>손익 = 매출 - 매입</span>
                <strong>{formatPerformanceAmount(summary?.totalRevenue)} - {formatPerformanceAmount(summary?.totalPurchase)} = {formatPerformanceAmount(summary?.totalProfit)}</strong>
            </div>
        </section>
    );
}

function ExecutiveTrendChart({ summary }) {
    const rawItems = summary?.trendItems || summary?.monthly || [];
    const selectedIndex = rawItems.findIndex(item => item.isSelected);
    const visibleStart = rawItems.length <= 14
        ? 0
        : selectedIndex >= 0
            ? Math.max(0, Math.min(selectedIndex - 6, rawItems.length - 14))
            : rawItems.length - 14;
    const items = rawItems.slice(visibleStart, visibleStart + 14);
    const basis = summary?.trendBasis || '월별';
    const scopeMode = summary?.scope?.mode || 'all';
    const title = basis === '연도별'
        ? '연도별 매출·손익 흐름'
        : basis === '일별'
            ? '일별 매출·손익 흐름'
            : scopeMode === 'month'
                ? '월별 매출·손익 흐름'
                : '최근월 매출·손익 흐름';
    const width = 820;
    const height = 214;
    const maxRevenue = Math.max(1, ...items.map(item => Math.abs(safeNumber(item.revenue))));
    const maxProfit = Math.max(1, ...items.map(item => Math.abs(safeNumber(item.profit))));
    const xAt = idx => (items.length <= 1 ? 58 : 58 + (idx / (items.length - 1)) * (width - 116));
    const revenueY = value => 36 + (1 - safeNumber(value) / maxRevenue) * 102;
    const profitY = value => Math.max(46, Math.min(166, 140 - (safeNumber(value) / maxProfit) * 58));
    const profitPoints = items.map((item, idx) => `${xAt(idx).toFixed(1)},${profitY(item.profit).toFixed(1)}`).join(' ');
    const bestRevenue = items.reduce((best, item) => safeNumber(item.revenue) > safeNumber(best?.revenue) ? item : best, null);
    const worstProfit = items.reduce((worst, item) => safeNumber(item.profit) < safeNumber(worst?.profit ?? Infinity) ? item : worst, null);
    const latest = items.at(-1) || null;

    return (
        <section className={`${styles.summaryPanel} ${styles.summaryTrendPanel}`}>
            <div className={styles.summaryPanelHead}>
                <div>
                    <h3>{title}</h3>
                    <span>선택 기준 {summary?.scope?.label || '전체'} · 그래프 단위 {basis}</span>
                </div>
            </div>
            {items.length < 2 ? (
                <div className={styles.emptyPanel}>선택 범위 흐름을 만들 데이터가 아직 부족합니다.</div>
            ) : (
                <div className={styles.summaryTrendChart}>
                    <svg className={styles.summaryTrendSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="종합실적 매출 손익 흐름 차트">
                        <text x="18" y="28" className={styles.summaryAxisText}>매출 최대 {formatPerformanceAmount(maxRevenue)}</text>
                        <line x1="42" y1="140" x2="782" y2="140" className={styles.zeroLine} />
                        <text x="18" y="144" className={styles.summaryAxisText}>손익 0</text>
                        {items.map((item, idx) => {
                            const x = xAt(idx);
                            const barHeight = Math.max(4, 138 - revenueY(item.revenue));
                            const isBest = item === bestRevenue;
                            const isLatest = item === latest;
                            const isSelected = Boolean(item.isSelected);
                            return (
                                <g key={item.scopeKey || item.period || item.date || idx}>
                                    <rect
                                        x={x - 11}
                                        y={138 - barHeight}
                                        width="22"
                                        height={barHeight}
                                        rx="4"
                                        className={isSelected || isLatest ? styles.summaryRevenueBarActive : styles.summaryRevenueBar}
                                    >
                                        <title>{`${metricTitleLabel(item, basis)} 매출 ${formatPerformanceAmount(item.revenue)}`}</title>
                                    </rect>
                                    {(isSelected || isBest || isLatest) && (
                                        <text x={x} y={Math.max(20, 132 - barHeight)} textAnchor="middle" className={styles.summaryValueLabel}>
                                            {isSelected ? '현재' : (isBest ? '최고' : '최근')} {formatPerformanceAmount(item.revenue)}
                                        </text>
                                    )}
                                    <text x={x} y="194" textAnchor="middle" className={styles.summaryTrendLabel}>{metricLabel(item, basis)}</text>
                                </g>
                            );
                        })}
                        <polyline points={profitPoints} className={styles.summaryProfitLine} />
                        {items.map((item, idx) => {
                            const isWorst = item === worstProfit;
                            const isSelected = Boolean(item.isSelected);
                            return (
                                <g key={`${item.scopeKey || item.period || item.date || idx}-profit`}>
                                    <circle cx={xAt(idx)} cy={profitY(item.profit)} r={isSelected ? 5 : (isWorst ? 4.5 : 3.6)} className={isWorst ? styles.summaryProfitPointWarn : (isSelected ? styles.summaryProfitPointActive : styles.summaryProfitPoint)}>
                                        <title>{`${metricTitleLabel(item, basis)} 손익 ${formatPerformanceAmount(item.profit)}`}</title>
                                    </circle>
                                    {isWorst && (
                                        <text x={xAt(idx)} y={Math.min(184, profitY(item.profit) + 18)} textAnchor="middle" className={styles.summaryWarnLabel}>
                                            최저 손익 {formatPerformanceAmount(item.profit)}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                    </svg>
                    <div className={styles.summaryTrendLegend}>
                        <span><i className={styles.revenueDot} />청록 막대 = 매출</span>
                        <span><i className={styles.profitDot} />파란 선 = 손익</span>
                        <span>최고 매출 {bestRevenue ? `${metricLabel(bestRevenue, basis)} ${formatPerformanceAmount(bestRevenue.revenue)}` : '-'}</span>
                        <span>최저 손익 {worstProfit ? `${metricLabel(worstProfit, basis)} ${formatPerformanceAmount(worstProfit.profit)}` : '-'}</span>
                    </div>
                </div>
            )}
        </section>
    );
}

function yearProgressLabel(item = {}, periodEnd = '') {
    const year = Number(item.year) || item.year;
    const endYear = Number(String(periodEnd).slice(0, 4));
    const endMonth = Number(String(periodEnd).slice(5, 7));
    if (endYear && String(year) === String(endYear) && endMonth) return `${year}년 ${endMonth}월까지`;
    return `${year}년`;
}

function ExecutiveYearMatrix({ yearly = [], periodEnd, activeYear, onOpenAnnual }) {
    const maxRevenue = Math.max(1, ...yearly.map(item => Math.abs(safeNumber(item.revenue))));
    return (
        <section className={styles.summaryPanel}>
            <div className={styles.summaryPanelHead}>
                <div>
                    <h3>연도 선택 매트릭스</h3>
                    <span>2026년처럼 진행 중인 연도는 집계 완료 월까지 표시</span>
                </div>
                <button type="button" className={styles.smallBtn} onClick={onOpenAnnual}>연간실적 보기</button>
            </div>
            <div className={styles.summaryYearMatrix}>
                {yearly.slice(-8).map(item => {
                    const isActive = String(item.year) === String(activeYear);
                    return (
                        <button type="button" key={item.year} onClick={onOpenAnnual} className={isActive ? styles.summaryYearActive : ''}>
                            <span>{yearProgressLabel(item, periodEnd)}</span>
                            <strong>{formatPerformanceAmount(item.revenue)}</strong>
                            <em className={safeNumber(item.profit) < 0 ? styles.negative : styles.positive}>{formatPerformanceAmount(item.profit)} · {formatPercent(item.profitRate, 1)}</em>
                            <i style={{ width: `${Math.max(4, Math.min(100, Math.abs(safeNumber(item.revenue)) / maxRevenue * 100))}%` }} />
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

function ExecutiveSourceTable({ summary, onOpenAnnual, onOpenMonthly }) {
    const rows = [
        { ...(summary?.sourceMix?.annual || {}), label: '연간실적', action: onOpenAnnual },
        { ...(summary?.sourceMix?.monthly || {}), label: '월간실적', action: onOpenMonthly },
    ];
    return (
        <section className={styles.summaryPanel}>
            <div className={styles.summaryPanelHead}>
                <div>
                    <h3>원장 신뢰도</h3>
                    <span>{summary?.scope?.label || '전체'} 기준 · 상세는 월간실적·연간실적 탭에서 확인</span>
                </div>
            </div>
            <div className={styles.summarySourceRows}>
                <div className={styles.summarySourceHead}>
                    <span>구분</span>
                    <span>매출</span>
                    <span>이익률</span>
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

function executiveSignalSearch(signal = {}) {
    const title = String(signal.title || '');
    const value = String(signal.value || '').trim();
    if (!value || value === '-') return null;
    if (!title.includes('청구처') && !title.includes('지급처')) return null;
    return { search: value, searchMode: 'and' };
}

function ExecutiveSignals({ signals = [], openMonthly }) {
    return (
        <section className={styles.summaryPanel}>
            <div className={styles.summaryPanelHead}>
                <div>
                    <h3>경영 판단</h3>
                    <span>청구처는 매출 기준, 지급처는 매입 기준 · 이익률/차량 구성 함께 확인</span>
                </div>
            </div>
            <div className={styles.summarySignalGrid}>
                {signals.map((rawSignal, index) => {
                    const signal = normalizeExecutiveSignal(rawSignal);
                    const handoff = executiveSignalSearch(signal);
                    const SignalTag = handoff ? 'button' : 'div';
                    return (
                        <SignalTag
                            type={handoff ? 'button' : undefined}
                            className={`${styles.summarySignal} ${handoff ? styles.summarySignalButton : ''} ${styles[`summaryTone_${signal.tone}`] || ''}`}
                            key={`${signal.title}-${index}`}
                            onClick={handoff ? () => openMonthly?.(handoff) : undefined}
                            title={handoff ? '월간실적 테이블에서 해당 값을 검색합니다.' : undefined}
                        >
                            <span>{signal.title}</span>
                            <strong>{signal.value}</strong>
                            <em>{signal.detail}</em>
                        </SignalTag>
                    );
                })}
            </div>
        </section>
    );
}

function SegmentMiniRows({ title, items = [], openMonthly }) {
    const rows = items.slice(0, 4);
    return (
        <div className={styles.summaryMiniRows}>
            <span>{title}</span>
            {rows.length === 0 ? (
                <em>선택 범위 세부 항목 없음</em>
            ) : rows.map((item, idx) => (
                <button type="button" key={item.key || item.name || idx} onClick={openMonthly}>
                    <strong>{idx + 1}. {item.label || item.name || item.vehicleNo || '-'}</strong>
                    <b>{formatPerformanceAmount(item.revenue)}</b>
                    <small className={safeNumber(item.profit) < 0 ? styles.negative : styles.positive}>{formatPercent(item.profitRate, 1)}</small>
                </button>
            ))}
        </div>
    );
}

function SegmentFocusCard({ title, segment, evidenceTitle, evidenceItems, vehicles, openMonthly, tone, countTotal = 0 }) {
    const evidence = evidenceItems?.length ? evidenceItems : vehicles;
    const rowCount = safeNumber(segment?.rowCount);
    const countShare = countTotal > 0 ? (rowCount / countTotal) * 100 : 0;
    return (
        <div className={`${styles.summarySegmentCard} ${styles[`summarySegment_${tone}`] || ''}`}>
            <div className={styles.summarySegmentTitle}>
                <span>{title}</span>
                <strong>{formatPerformanceAmount(segment?.revenue)}</strong>
                <em>{formatPerformanceAmount(segment?.profit)} · {formatPercent(segment?.profitRate, 1)}</em>
            </div>
            <div className={styles.summarySegmentBars}>
                <div>
                    <span>매출 비중</span>
                    <b style={{ width: `${Math.max(3, Math.min(100, safeNumber(segment?.revenueShare)))}%` }} />
                    <em>{formatPercent(segment?.revenueShare, 1)}</em>
                </div>
                <div>
                    <span>건수 비중</span>
                    <b style={{ width: `${Math.max(3, Math.min(100, countShare))}%` }} />
                    <em>{formatPercent(countShare, 1)} · {rowCount.toLocaleString('ko-KR')}건</em>
                </div>
            </div>
            <SegmentMiniRows title={evidenceTitle} items={evidence || []} openMonthly={openMonthly} />
        </div>
    );
}

function TopConcentration({ summary, openMonthly }) {
    const segments = summary?.strategicSegments || [];
    const own = segments.find(item => item.key === 'own_direct') || { label: 'ELS직계약차량' };
    const external = segments.find(item => item.key === 'external_carrier') || { label: '외부/타운송사' };
    const segmentCountTotal = safeNumber(own.rowCount) + safeNumber(external.rowCount);
    const vehicles = (summary?.vehiclePerformance || []).slice(0, 5);
    return (
        <section className={styles.summaryPanel}>
            <div className={styles.summaryPanelHead}>
                <div>
                    <h3>당사 / 협력사 비교</h3>
                    <span>ELS직계약차량을 먼저 보고 외부/타운송사를 같은 폭으로 비교</span>
                </div>
                <button type="button" className={styles.smallBtn} onClick={openMonthly}>상세는 월간실적</button>
            </div>
            <div className={styles.summarySegmentSplitGrid}>
                <SegmentFocusCard
                    title="ELS직계약차량"
                    segment={own}
                    evidenceTitle="ELS 주요 거래처/작업지"
                    evidenceItems={(own.topClients || []).length ? own.topClients : own.topWorkSites}
                    openMonthly={openMonthly}
                    tone="own"
                    countTotal={segmentCountTotal}
                />
                <SegmentFocusCard
                    title="외부/타운송사"
                    segment={external}
                    evidenceTitle="외부 대표 차량 TOP"
                    evidenceItems={(external.topClients || []).length ? external.topClients : external.topWorkSites}
                    vehicles={vehicles}
                    openMonthly={openMonthly}
                    tone="external"
                    countTotal={segmentCountTotal}
                />
            </div>
        </section>
    );
}

export default function AsanSummaryPerformance({ onOpenAnnual, onOpenMonthly }) {
    const [payload, setPayload] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [elapsedMs, setElapsedMs] = useState(0);
    const [scopeMode, setScopeMode] = useState('all');
    const [selectedYear, setSelectedYear] = useState('');
    const [selectedMonth, setSelectedMonth] = useState('');
    const [selectedDayKey, setSelectedDayKey] = useState('');
    const syncStateRef = useRef({ annual: false, monthly: false });
    const requestIdRef = useRef(0);
    const lastSummaryQueryRef = useRef('');
    const currentScopeRef = useRef({ mode: 'all' });

    const loadSummary = useCallback(async (scope = currentScopeRef.current, options = {}) => {
        const nextScope = {
            mode: ['year', 'month', 'day'].includes(scope?.mode) ? scope.mode : 'all',
            year: scope?.year || '',
            month: scope?.month || '',
            dayKey: scope?.dayKey || '',
        };
        const queryKey = summaryScopeKey(nextScope);
        if (!options.force && lastSummaryQueryRef.current === queryKey) return;
        lastSummaryQueryRef.current = queryKey;
        currentScopeRef.current = nextScope;
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        const started = performance.now();
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({
                year: String(DEFAULT_SUMMARY_YEAR),
                extra_months: String(DEFAULT_EXTRA_MONTHS),
                view: 'dashboard',
                scope_mode: nextScope.mode,
            });
            if (nextScope.mode === 'year' && nextScope.year) params.set('scope_year', nextScope.year);
            if (nextScope.mode === 'month' && nextScope.month) params.set('scope_month', nextScope.month);
            if (nextScope.mode === 'day' && nextScope.dayKey) params.set('scope_day_key', nextScope.dayKey);
            const res = await fetch(`/api/branches/asan/performance/summary?${params.toString()}`, { cache: 'no-store' });
            const json = await readPerformanceJson(res, '종합실적 조회 실패');
            if (requestId !== requestIdRef.current) return;
            setPayload(json.data || null);
        } catch (err) {
            if (requestId !== requestIdRef.current) return;
            setError(err.message || '종합실적 조회 실패');
        } finally {
            if (requestId === requestIdRef.current) {
                setElapsedMs(Math.round(performance.now() - started));
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        loadSummary({ mode: 'all' }, { force: true });
    }, [loadSummary]);

    const checkSyncAndReload = useCallback(async () => {
        try {
            const [annualResult, monthlyResult] = await Promise.allSettled([
                fetch('/api/branches/asan/performance/annual?source=status&page_size=1', { cache: 'no-store' }),
                fetch(`/api/branches/asan/performance/monthly?${new URLSearchParams({
                    source: 'status',
                    year: String(DEFAULT_SUMMARY_YEAR),
                    extra_months: String(DEFAULT_EXTRA_MONTHS),
                }).toString()}`, { cache: 'no-store' }),
            ]);
            let shouldReload = false;
            for (const [key, result] of [['annual', annualResult], ['monthly', monthlyResult]]) {
                if (result.status !== 'fulfilled' || !result.value?.ok) continue;
                const json = await result.value.json().catch(() => null);
                const status = json?.data?.sync_status || {};
                const running = Boolean(status.running);
                const wasRunning = Boolean(syncStateRef.current[key]);
                if (wasRunning && !running && !status.last_error) shouldReload = true;
                syncStateRef.current[key] = running;
            }
            if (shouldReload) loadSummary(currentScopeRef.current, { force: true });
        } catch {
            // NAS 상태 조회 실패는 종합실적 DB 조회를 막지 않는다.
        }
    }, [loadSummary]);

    useEffect(() => {
        const firstCheckTimer = window.setTimeout(checkSyncAndReload, 1400);
        const timer = window.setInterval(checkSyncAndReload, 15000);
        return () => {
            window.clearTimeout(firstCheckTimer);
            window.clearInterval(timer);
        };
    }, [checkSyncAndReload]);

    const baseSummary = payload?.summary || null;
    const scopeOptions = baseSummary?.scopeOptions || {};
    const currentScope = useMemo(() => ({
        mode: scopeMode,
        year: selectedYear,
        month: selectedMonth,
        dayKey: selectedDayKey,
    }), [scopeMode, selectedDayKey, selectedMonth, selectedYear]);

    useEffect(() => {
        if (!baseSummary) return;
        const years = scopeOptions.yearly || [];
        const months = scopeOptions.monthly || [];
        const days = scopeOptions.daily || [];
        const latestMonth = baseSummary.periodEnd || months.at(-1)?.value || '';
        if (!selectedYear) setSelectedYear(String(latestMonth).slice(0, 4) || years.at(-1)?.value || '');
        if (!selectedMonth) setSelectedMonth(latestMonth || months.at(-1)?.value || '');
        if (!selectedDayKey) setSelectedDayKey(days.at(-1)?.value || '');
    }, [baseSummary, scopeOptions.daily, scopeOptions.monthly, scopeOptions.yearly, selectedDayKey, selectedMonth, selectedYear]);

    useEffect(() => {
        if (!baseSummary) return;
        if (currentScope.mode === 'year' && !currentScope.year) return;
        if (currentScope.mode === 'month' && !currentScope.month) return;
        if (currentScope.mode === 'day' && !currentScope.dayKey) return;
        loadSummary(currentScope);
    }, [baseSummary, currentScope, loadSummary]);

    const summary = baseSummary;

    const kpis = useMemo(() => {
        if (!summary) return [];
        const scopeLabel = summary.scope?.label || '전체';
        return [
            {
                label: '선택 범위 매출',
                value: formatPerformanceAmount(summary.totalRevenue),
                sub: `${scopeLabel} · 연간 ${formatPercent(summary.sourceMix?.annual?.revenueShare, 1)} / 월간 ${formatPercent(summary.sourceMix?.monthly?.revenueShare, 1)}`,
                tone: 'good',
            },
            {
                label: '선택 범위 손익',
                value: formatPerformanceAmount(summary.totalProfit),
                sub: `매입 차감 후 ${formatPercent(summary.profitRate, 2)}`,
                tone: safeNumber(summary.totalProfit) >= 0 ? 'good' : 'danger',
            },
            {
                label: '이익률',
                value: formatPercent(summary.profitRate, 2),
                sub: summary.latestMonth ? `최근월 ${formatPercent(summary.latestMonth.profitRate, 1)} · ${formatSignedRate(summary.latestProfitDelta?.rate)}` : '비교월 없음',
                tone: metricTone(summary.profitRate),
            },
            {
                label: '매입률',
                value: formatPercent(summary.purchaseRate, 2),
                sub: `${safeNumber(summary.rowCount).toLocaleString('ko-KR')}행 · ${safeNumber(summary.fileCount).toLocaleString('ko-KR')}개 원장`,
                tone: safeNumber(summary.purchaseRate) <= 85 ? 'good' : 'watch',
            },
            {
                label: summary.scope?.mode === 'day' ? '선택일' : '최근월',
                value: summary.scope?.mode === 'day' ? (summary.latestDay?.date || '-') : (summary.latestMonth?.period || '-'),
                sub: summary.scope?.mode === 'day'
                    ? `일 손익 ${formatPerformanceAmount(summary.latestDay?.profit)}`
                    : `매출 ${formatSignedRate(summary.latestRevenueDelta?.rate)} · 손익 ${formatSignedRate(summary.latestProfitDelta?.rate)}`,
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
                    <h2 className={styles.title}>컨테이너 운송 통합실적</h2>
                    <div className={styles.metaLine}>
                        <span>연간+월간 합산</span>
                        <span>{baseSummary?.periodStart && baseSummary?.periodEnd ? `${baseSummary.periodStart} ~ ${baseSummary.periodEnd}` : '기간 산정 중'}</span>
                        <span>{summary?.scope?.label ? `선택: ${summary.scope.label}` : '전체 기준'}</span>
                        <span className={styles.elapsed}>{loading ? '데이터를 불러오는 중입니다...' : `${elapsedMs.toLocaleString('ko-KR')}ms`}</span>
                        <span className={styles.syncBadge}>동기화 {fmtTs(summary?.syncedAt)}</span>
                    </div>
                </div>
                <div className={styles.actions}>
                    <button type="button" className={styles.ghostBtn} onClick={() => loadSummary(currentScope, { force: true })} disabled={loading}>새로고침</button>
                </div>
            </div>

            {error && <div className={styles.errorBox}>{error}</div>}
            {!baseSummary && !error && <div className={styles.emptyPanel}>데이터를 불러오는 중입니다...</div>}

            {summary && (
                <div className={styles.summaryDashboard}>
                    <ScopeControls
                        scopeMode={scopeMode}
                        setScopeMode={setScopeMode}
                        selectedYear={selectedYear}
                        setSelectedYear={setSelectedYear}
                        selectedMonth={selectedMonth}
                        setSelectedMonth={setSelectedMonth}
                        selectedDayKey={selectedDayKey}
                        setSelectedDayKey={setSelectedDayKey}
                        options={scopeOptions}
                    />
                    <div className={styles.summaryKpiGrid}>
                        {kpis.map(kpi => <KpiCard key={kpi.label} {...kpi} />)}
                    </div>

                    <div className={styles.summaryMainGrid}>
                        <ExecutiveFlowDiagram summary={summary} />
                        <ExecutiveSignals signals={summary.executiveSignals || []} openMonthly={openMonthly} />
                        <ExecutiveTrendChart summary={summary} />
                        <ExecutiveYearMatrix yearly={baseSummary?.yearly || []} periodEnd={baseSummary?.periodEnd} activeYear={selectedYear} onOpenAnnual={openAnnual} />
                        <TopConcentration summary={summary} openMonthly={openMonthly} />
                        <ExecutiveSourceTable summary={summary} onOpenAnnual={openAnnual} onOpenMonthly={openMonthly} />
                    </div>
                </div>
            )}
        </div>
    );
}
