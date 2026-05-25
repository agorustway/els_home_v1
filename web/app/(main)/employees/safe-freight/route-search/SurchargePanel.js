'use client';

import React, { useState, useMemo, useEffect } from 'react';
import styles from './surcharge-panel.module.css';

/**
 * SurchargePanel — 할증/부대비용 선택 패널 (구간조회 전용, 간소화 B안)
 * 
 * 고시 변경 대비: options.surcharges 데이터(JSON)만 수정하면 UI 자동 반영.
 * 항목 추가/삭제 시 코드 수정 불필요. 그룹 구분(group 필드)으로 드롭다운 자동 생성.
 * 
 * Props:
 *   options          - 안전운임 옵션 (surcharges, surchargeRegulation)
 *   onChange(info)   - 할증 정보 변경 콜백
 *     info = { totalPctMult, fixedAdd, appliedLabels, pctExcluded, surchargeIds }
 */
export default function SurchargePanel({ options, onChange }) {
    const [surchargeIds, setSurchargeIds] = useState(new Set());
    const [groupApply, setGroupApply] = useState({});
    const [roughPct, setRoughPct] = useState(20);
    const [collapsed, setCollapsed] = useState(true);

    const surchargesList = options?.surcharges || [];
    const regulation = options?.surchargeRegulation || { maxPctCount: 3, firstFull: true, restHalf: true };

    // 그룹별 분류 (고시 변경 시 자동 반영)
    const { checkboxItems, groupedItems, otherCostItems } = useMemo(() => {
        const costItems = surchargesList.filter(s => !s.otherCost);
        const otherCost = surchargesList.filter(s => s.otherCost);
        const checkbox = costItems.filter(s => !s.group);
        
        // 그룹별 자동 분류 (group 필드 기반)
        const groupMap = {};
        costItems.filter(s => s.group).forEach(s => {
            if (!groupMap[s.group]) groupMap[s.group] = [];
            groupMap[s.group].push(s);
        });

        return { checkboxItems: checkbox, groupedItems: groupMap, otherCostItems: otherCost };
    }, [surchargesList]);

    // 그룹 라벨 매핑
    const GROUP_LABELS = {
        flexibag: '플렉시백',
        hazard: '위험물',
        oversize: '활대품',
        heavy: '중량물',
    };

    // ── 토글 로직 ──
    const toggleSurcharge = (id) => {
        setSurchargeIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const setSurchargeByGroup = (group, selectedId) => {
        if (selectedId) setGroupApply(prev => ({ ...prev, [group]: true }));
        const groupIds = surchargesList.filter(s => s.group === group).map(s => s.id);
        setSurchargeIds(prev => {
            const next = new Set(prev);
            groupIds.forEach(id => next.delete(id));
            if (selectedId) next.add(selectedId);
            return next;
        });
    };

    const setGroupApplyEnabled = (group, enabled) => {
        setGroupApply(prev => ({ ...prev, [group]: enabled }));
        if (!enabled) {
            const groupIds = surchargesList.filter(s => s.group === group).map(s => s.id);
            setSurchargeIds(prev => {
                const next = new Set(prev);
                groupIds.forEach(id => next.delete(id));
                return next;
            });
        }
    };

    const selectedByGroup = (group) => {
        const opts = surchargesList.filter(s => s.group === group);
        return opts.find(s => surchargeIds.has(s.id))?.id ?? '';
    };

    // ── 할증 계산 (고시 제22조) ──
    const surchargeInfo = useMemo(() => {
        const maxPct = regulation.maxPctCount ?? 3;
        const pctItems = surchargesList
            .filter(s => !s.otherCost && !s.fixed && surchargeIds.has(s.id))
            .map(s => ({
                id: s.id,
                label: s.id === 'rough' ? `${s.label} ${roughPct}%` : s.label,
                pct: s.id === 'rough' ? roughPct : (s.pct || 0),
            }))
            .sort((a, b) => b.pct - a.pct);

        const fixedItems = surchargesList.filter(s => (s.fixed || s.otherCost) && surchargeIds.has(s.id));

        const pctApplied = pctItems.slice(0, maxPct).map((item, i) => ({
            ...item,
            effective: i === 0 && regulation.firstFull ? 100 : regulation.restHalf ? 50 : 100,
        }));
        const pctExcluded = pctItems.slice(maxPct).map(item => ({
            ...item,
            reason: regulation.excludedReason || '할증 항목이 3개를 초과하여 본 운송에는 적용되지 않습니다(고시 제22조 나목).',
        }));

        const totalPct = pctApplied.reduce((sum, item) => sum + (item.pct * item.effective) / 100, 0);
        const totalPctMult = 1 + totalPct / 100;
        const fixedAdd = fixedItems.reduce((sum, s) => sum + (s.fixed || 0), 0);

        const appliedLabels = [
            ...pctApplied.map(s => s.effective === 100 ? s.label : `${s.label} (50%적용)`),
            ...fixedItems.map(s => s.label),
        ];

        return { totalPctMult, fixedAdd, pctApplied, pctExcluded, fixedApplied: fixedItems, appliedLabels, surchargeIds };
    }, [surchargesList, surchargeIds, roughPct, regulation]);

    // 변경 시 부모에게 통지
    useEffect(() => {
        onChange?.(surchargeInfo);
    }, [surchargeInfo]);

    const activeCount = surchargeIds.size;

    return (
        <div className={styles.panel}>
            <button
                type="button"
                className={styles.panelHeader}
                onClick={() => setCollapsed(!collapsed)}
            >
                <span className={styles.panelTitle}>
                    할증/부대비용
                    {activeCount > 0 && (
                        <span className={styles.activeBadge}>{activeCount}개 적용</span>
                    )}
                </span>
                <span className={styles.panelToggle}>{collapsed ? '▼ 펼치기' : '▲ 접기'}</span>
            </button>

            {!collapsed && (
                <div className={styles.panelBody}>
                    {/* ── 운송 환경 (체크박스 항목) ── */}
                    {checkboxItems.length > 0 && (
                        <div className={styles.group}>
                            <div className={styles.groupTitle}>운송 환경</div>
                            <div className={styles.optionsGrid}>
                                {checkboxItems.map(s => (
                                    <label key={s.id} className={styles.checkLabel}>
                                        <input
                                            type="checkbox"
                                            checked={surchargeIds.has(s.id)}
                                            onChange={() => toggleSurcharge(s.id)}
                                        />
                                        {s.id === 'rough' ? (
                                            <span className={styles.roughRow}>
                                                험로
                                                <input
                                                    type="number"
                                                    className={styles.pctInput}
                                                    value={roughPct}
                                                    onChange={e => setRoughPct(parseInt(e.target.value, 10) || 0)}
                                                />%
                                            </span>
                                        ) : s.label.split('(')[0]}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── 그룹별 드롭다운 (장비/화물, 특수 할증) ── */}
                    {Object.keys(groupedItems).length > 0 && (
                        <div className={styles.group}>
                            <div className={styles.groupTitle}>장비/화물 · 특수 할증</div>
                            <div className={styles.optionsGrid}>
                                {Object.entries(groupedItems).map(([group, items]) => (
                                    <div key={group} className={styles.groupRow}>
                                        <label className={styles.checkLabel}>
                                            <input
                                                type="checkbox"
                                                checked={!!groupApply[group]}
                                                onChange={e => setGroupApplyEnabled(group, e.target.checked)}
                                            />
                                            {GROUP_LABELS[group] || group}
                                        </label>
                                        <select
                                            className={styles.groupSelect}
                                            value={selectedByGroup(group)}
                                            onChange={e => setSurchargeByGroup(group, e.target.value)}
                                            disabled={!groupApply[group]}
                                        >
                                            <option value="">선택</option>
                                            {items.map(s => (
                                                <option key={s.id} value={s.id}>
                                                    {s.label.replace(/플렉시백 컨테이너\s*/, '')}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── 부대 비용 (실비) ── */}
                    {otherCostItems.length > 0 && (
                        <div className={styles.group}>
                            <div className={styles.groupTitle}>부대 비용</div>
                            <div className={styles.optionsGrid}>
                                {otherCostItems.map(s => (
                                    <label key={s.id} className={styles.checkLabel}>
                                        <input
                                            type="checkbox"
                                            checked={surchargeIds.has(s.id)}
                                            onChange={() => toggleSurcharge(s.id)}
                                        />
                                        {s.label.split(':')[0]}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── 적용 요약 ── */}
                    {activeCount > 0 && (
                        <div className={styles.summary}>
                            <span className={styles.summaryLabel}>적용 할증:</span>
                            {surchargeInfo.appliedLabels.map((l, i) => (
                                <span key={i} className={styles.summaryTag}>{l}</span>
                            ))}
                            {surchargeInfo.pctExcluded.length > 0 && (
                                <div className={styles.excluded}>
                                    적용 제외: {surchargeInfo.pctExcluded.map(s => s.label).join(', ')}
                                    <span className={styles.excludedReason}>(고시 제22조 — 최대 {regulation.maxPctCount}개)</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
