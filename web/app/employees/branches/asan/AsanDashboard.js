'use client';
import { useMemo, useState, useRef, useEffect } from 'react';
import styles from './dashboard.module.css';

// 헬퍼: 테이블 헤더에서 특정 열 인덱스 찾기
const findCol = (headers, name) => headers.findIndex(h => h && h.trim() === name);

// 헬퍼: 트리 피벗 순회
function buildPivot(data, groupKeysInfo, valueExtractor) {
    const root = { total: 0, children: {} };
    data.forEach(row => {
        const val = valueExtractor(row);
        if (val <= 0) return;

        let curr = root;
        curr.total += val;

        groupKeysInfo.forEach((gk, i) => {
            let keyVal = '미분류';
            if (gk.isVirtual) {
                // 가상 컬럼 (예: 업체명)
                keyVal = row.__virtual_company || '미분류';
            } else {
                keyVal = row[gk.idx] || '미분류';
            }

            if (!curr.children[keyVal]) {
                curr.children[keyVal] = { name: keyVal, total: 0, children: {} };
            }
            curr = curr.children[keyVal];
            curr.total += val;

            // 마지막 레벨이면 특성(Feature) 보관
            if (i === groupKeysInfo.length - 1) {
                if (!curr.features) curr.features = [];
                curr.features.push(row);
            }
        });
    });
    return root;
}

const TreeNode = ({ node, level, featuresRenderer, path, selectedPath, onSelect, forceExpand }) => {
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (forceExpand) {
            setExpanded(forceExpand.targetState);
        }
    }, [forceExpand]);
    const hasChildren = Object.keys(node.children).length > 0;

    const currentPath = [...path, node.name];
    const isSelected = selectedPath && selectedPath.join('|') === currentPath.join('|');

    const handleClick = () => {
        if (hasChildren) setExpanded(!expanded);
        onSelect(currentPath);
    };

    return (
        <div className={styles.treeNode}>
            <div className={`${styles.treeRow} ${isSelected ? styles.treeRowSelected : ''}`} style={{ paddingLeft: `${level * 20}px` }} onClick={handleClick}>
                <div className={styles.treeHeader}>
                    <span className={styles.treeIcon}>{hasChildren ? (expanded ? '📂' : '📁') : '📄'}</span>
                    <span className={styles.nodeName}>{node.name}</span>
                </div>
                <div className={styles.treeTotal}>{node.total.toLocaleString()}</div>
            </div>
            {expanded && hasChildren && (
                <div className={styles.treeChildren}>
                    {Object.values(node.children).sort((a, b) => b.total - a.total).map(child => (
                        <TreeNode key={child.name} node={child} level={level + 1} featuresRenderer={featuresRenderer} path={currentPath} selectedPath={selectedPath} onSelect={onSelect} forceExpand={forceExpand} />
                    ))}
                </div>
            )}
            {expanded && !hasChildren && node.features && (
                <div className={styles.featuresList} style={{ paddingLeft: `${(level + 1) * 20}px` }}>
                    {featuresRenderer(node.features)}
                </div>
            )}
        </div>
    );
};

export default function AsanDashboard({ data, headers, viewType }) {
    const [viewMode, setViewMode] = useState('customer'); // 'customer' | 'dispatcher'

    // 사용자 지정 그룹핑 순서 상태
    const [customerGroups, setCustomerGroups] = useState(['작업지', '라인/선사']);
    const [dispatcherGroups, setDispatcherGroups] = useState(['업체명', '작업지', '라인/선사']);
    const [selectedPath, setSelectedPath] = useState(null);
    const [forceExpand, setForceExpand] = useState(null);
    const [chartMode, setChartMode] = useState('작업지'); // '작업지', '라인/선사', '업체명'

    // 드래그 앤 드롭 상태
    const dragItem = useRef();
    const dragOverItem = useRef();

    const currentGroups = viewMode === 'customer' ? customerGroups : dispatcherGroups;
    const setCurrentGroups = viewMode === 'customer' ? setCustomerGroups : setDispatcherGroups;

    // 뷰 전환시 선택 초기화
    const handleViewModeChange = (mode) => {
        setViewMode(mode);
        setSelectedPath(null);
        setChartMode(mode === 'customer' ? '작업지' : '업체명');
    };

    const handleSort = () => {
        const _groups = [...currentGroups];
        const draggedItemContent = _groups.splice(dragItem.current, 1)[0];
        _groups.splice(dragOverItem.current, 0, draggedItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        setCurrentGroups(_groups);
    };

    const pivotData = useMemo(() => {
        if (!data || data.length === 0 || !headers) return null;

        // 동적 컬럼 인덱스 매핑 (통합 뷰 지원)
        const getCol = (...names) => {
            for (let n of names) {
                const idx = findCol(headers, n);
                if (idx >= 0) return idx;
            }
            return -1;
        };

        const colMap = {
            '화주': getCol('화주'),
            '작업지': getCol('작업지'),
            '라인/선사': getCol('라인(선사명)', '라인', '선사명', '선사'),
            'TYPE': getCol('TYPE', 'T'),
            '구분': getCol('구분'),
        };

        const hOrder = getCol('오더(계)', '오더');
        const hQty = getCol('오더(계)', '계', '수량');

        const dispatchRegions = ['배차예정', '기타/철송', '기타', '아산', '부산', '신항', '광양', '평택', '중부', '부곡', '인천']
            .map(r => ({ name: r, idx: findCol(headers, r) })).filter(x => x.idx >= 0);

        // 파이 차트 데이터 (화주, 구분, TYPE 전체 기준)
        const pieAggs = { hwaju: {}, gubun: {}, type: {} };
        const hHwaju = colMap['화주'];
        const hGubun = colMap['구분'];
        const hType = colMap['TYPE'];

        // 막대 차트(버튼 전환용) 데이터 모음
        const chartAggs = { '작업지': {}, '라인/선사': {}, '업체명': {} };
        const hWorkplace = colMap['작업지'];
        const hLine = colMap['라인/선사'];

        if (viewMode === 'customer') {
            data.forEach(row => {
                const weight = ['glovis', 'integrated'].includes(viewType) ? (parseInt(row[hOrder]) || 0) : (parseInt(row[hQty]) || 0);
                if (weight > 0) {
                    const hw = row[hHwaju] || '미분류';
                    const gb = row[hGubun] || '미분류';
                    const ty = row[hType] || '미분류';
                    pieAggs.hwaju[hw] = (pieAggs.hwaju[hw] || 0) + weight;
                    pieAggs.gubun[gb] = (pieAggs.gubun[gb] || 0) + weight;
                    pieAggs.type[ty] = (pieAggs.type[ty] || 0) + weight;

                    const wp = row[hWorkplace] || '미분류';
                    const ln = row[hLine] || '미분류';

                    if (!chartAggs['작업지'][wp]) chartAggs['작업지'][wp] = { total: 0, breakdown: {} };
                    chartAggs['작업지'][wp].total += weight;
                    chartAggs['작업지'][wp].breakdown[ln] = (chartAggs['작업지'][wp].breakdown[ln] || 0) + weight;

                    if (!chartAggs['라인/선사'][ln]) chartAggs['라인/선사'][ln] = { total: 0, breakdown: {} };
                    chartAggs['라인/선사'][ln].total += weight;
                    chartAggs['라인/선사'][ln].breakdown[wp] = (chartAggs['라인/선사'][ln].breakdown[wp] || 0) + weight;
                }
            });

            const groupKeysInfo = customerGroups.map(k => ({ name: k, idx: colMap[k] })).filter(x => x.idx >= 0);
            const root = buildPivot(data, groupKeysInfo, (row) => ['glovis', 'integrated'].includes(viewType) ? (parseInt(row[hOrder]) || 0) : (parseInt(row[hQty]) || 0));
            return { root, chartAggs, type: 'customer', headers, groups: currentGroups, pieAggs };
        } else {
            const dispatchRecords = [];
            data.forEach(row => {
                dispatchRegions.forEach(region => {
                    const text = row[region.idx];
                    if (!text) return;
                    const matches = String(text).matchAll(/([가-힣a-zA-Z]+)\s*(\d+)/g);
                    for (const match of matches) {
                        const company = match[1];
                        const count = parseInt(match[2]) || 0;
                        if (count > 0) {
                            dispatchRecords.push({
                                ...row, // 원본 row 복제 (가상 컬럼 주입용)
                                __virtual_company: company,
                                __virtual_count: count,
                                __virtual_region: region.name,
                                originalRow: row
                            });
                        }
                    }
                });
            });

            dispatchRecords.forEach(rec => {
                const hw = rec.originalRow[hHwaju] || '미분류';
                const gb = rec.originalRow[hGubun] || '미분류';
                const ty = rec.originalRow[hType] || '미분류';
                pieAggs.hwaju[hw] = (pieAggs.hwaju[hw] || 0) + rec.__virtual_count;
                pieAggs.gubun[gb] = (pieAggs.gubun[gb] || 0) + rec.__virtual_count;
                pieAggs.type[ty] = (pieAggs.type[ty] || 0) + rec.__virtual_count;

                const wp = rec.originalRow[hWorkplace] || '미분류';
                const ln = rec.originalRow[hLine] || '미분류';
                const comp = rec.__virtual_company || '미분류';

                const _addAgg = (cat, key, bdKey) => {
                    if (!chartAggs[cat][key]) chartAggs[cat][key] = { total: 0, breakdown: {} };
                    chartAggs[cat][key].total += rec.__virtual_count;
                    chartAggs[cat][key].breakdown[bdKey] = (chartAggs[cat][key].breakdown[bdKey] || 0) + rec.__virtual_count;
                };

                _addAgg('작업지', wp, comp);
                _addAgg('라인/선사', ln, comp);
                _addAgg('업체명', comp, wp);
            });

            const groupKeysInfo = dispatcherGroups.map(k => {
                if (k === '업체명') return { name: k, isVirtual: true };
                return { name: k, idx: colMap[k] };
            }).filter(x => x.isVirtual || x.idx >= 0);

            const root = buildPivot(dispatchRecords, groupKeysInfo, (row) => row.__virtual_count);

            return { root, chartAggs, type: 'dispatcher', headers, groups: currentGroups, pieAggs };
        }
    }, [data, headers, viewType, viewMode, customerGroups, dispatcherGroups]);

    const displayChartData = useMemo(() => {
        if (!pivotData || pivotData.root.total === 0) return [];
        const rawAggr = pivotData.chartAggs[chartMode] || {};
        return Object.entries(rawAggr).map(([name, data]) => ({ name, total: data.total, breakdown: data.breakdown })).sort((a, b) => b.total - a.total);
    }, [pivotData, chartMode]);

    const getHashColor = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        return Math.abs(hash);
    };

    if (!pivotData || pivotData.root.total === 0) return <div className={styles.empty}>데이터가 부족합니다.</div>;

    const renderFeatures = (features) => {
        const getCol = (...names) => {
            for (let n of names) {
                const idx = findCol(headers, n);
                if (idx >= 0) return idx;
            }
            return -1;
        };

        const hCus = getCol('고객사(국가)', '고객사', '국가');
        const hPort = getCol('포트(도착항)', '포트', '도착항');
        const hShip = getCol('선적');

        const isGlovis = viewType === 'glovis';
        const isIntegrated = viewType === 'integrated';
        const hVal = getCol('오더(계)', '오더', '계', '수량');

        if (viewMode === 'customer') {
            const aggs = {};
            features.forEach(row => {
                const f1 = row[hCus] || '-';
                const f2 = row[hPort] || '-';
                const f3 = (isGlovis || isIntegrated) && hShip >= 0 ? (row[hShip] || '') : '';
                const key = (isGlovis || isIntegrated) && f3 ? `${f1} / ${f2} / ${f3}` : `${f1} / ${f2}`;

                if (!aggs[key]) aggs[key] = 0;
                aggs[key] += (parseInt(row[hVal]) || 0);
            });

            return Object.entries(aggs).map(([k, v]) => (
                <div key={k} className={styles.featureRow}>
                    <span className={styles.fName}>↳ {k}</span>
                    <span className={styles.fVal}>{v}</span>
                </div>
            ));
        } else {
            // 실행사 특성: 위와 같은 특성에 더해 배차 지역(region) 표시
            const aggs = {};
            features.forEach(rec => {
                const r = rec.originalRow;
                const f1 = r[hCus] || '-';
                const f2 = r[hPort] || '-';
                const f3 = (isGlovis || isIntegrated) && hShip >= 0 ? (r[hShip] || '') : '';
                const originDesc = (isGlovis || isIntegrated) && f3 ? `${f1}/${f2}/${f3}` : `${f1}/${f2}`;

                const key = `[${rec.__virtual_region}] ${originDesc}`;
                if (!aggs[key]) aggs[key] = 0;
                aggs[key] += rec.__virtual_count;
            });

            return Object.entries(aggs).map(([k, v]) => (
                <div key={k} className={styles.featureRow}>
                    <span className={styles.fName}>↳ {k}</span>
                    <span className={styles.fVal}>{v}대</span>
                </div>
            ));
        }
    };

    return (
        <div className={styles.dashboard}>
            <div className={styles.dashHeader}>
                <div className={styles.switchTabs}>
                    <button className={`${styles.switchBtn} ${viewMode === 'customer' ? styles.active : ''}`} onClick={() => handleViewModeChange('customer')}>고객사(화주) 기준</button>
                    <button className={`${styles.switchBtn} ${viewMode === 'dispatcher' ? styles.active : ''}`} onClick={() => handleViewModeChange('dispatcher')}>실행사(협력업체) 기준</button>
                </div>
                <div className={styles.dashTotal}>전체 총계: <b>{pivotData.root.total.toLocaleString()}</b></div>
            </div>

            {/* 상단 점유율 원형 다이어그램 (화주, 구분, TYPE) */}
            <div className={styles.pieModules}>
                <PieChart data={pivotData.pieAggs.hwaju} title="화주 (고객사)" />
                <PieChart data={pivotData.pieAggs.gubun} title="구분 (수출/수입 등)" />
                <PieChart data={pivotData.pieAggs.type} title="TYPE (40FT/20FT 등)" />
            </div>

            <div className={styles.dashContent}>
                <div className={styles.chartPanel}>
                    <div className={styles.panelHeaderWrap}>
                        <h3 className={styles.panelTitle}>비중 차트 ({chartMode} 기준)</h3>
                        <div className={styles.chartTabs}>
                            {(viewMode === 'customer' ? ['작업지', '라인/선사'] : ['업체명', '작업지', '라인/선사']).map(m => (
                                <button key={m} className={`${styles.chartTabBtn} ${chartMode === m ? styles.chartTabBtnActive : ''}`} onClick={() => setChartMode(m)}>
                                    {m}별
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className={styles.barChart}>
                        {displayChartData.map((item, idx, arr) => {
                            const maxTotal = arr[0]?.total || 1;
                            const pctOfMax = Math.max(1, Math.round((item.total / maxTotal) * 100));
                            const pctOfTotal = Math.max(1, Math.round((item.total / pivotData.root.total) * 100));
                            return (
                                <div key={item.name} className={styles.barItem}>
                                    <div className={styles.barLabel}>
                                        <span className={styles.bName}>{item.name}</span>
                                        <span className={styles.bVal}>{item.total.toLocaleString()} <small>({pctOfTotal}%)</small></span>
                                    </div>
                                    <div className={styles.barTrack}>
                                        {Object.entries(item.breakdown || {}).sort((a, b) => b[1] - a[1]).map(([bdName, bdCount], subIdx) => {
                                            const segmentPct = Math.max(0.5, (bdCount / maxTotal) * 100);
                                            const bdTotalPct = Math.round((bdCount / item.total) * 100);
                                            const titleStr = `${bdName} ${bdCount.toLocaleString()}대 (${bdTotalPct}%)`;
                                            const hue = getHashColor(bdName) % 360;
                                            return (
                                                <div
                                                    key={bdName}
                                                    className={styles.barFill}
                                                    data-tooltip={titleStr}
                                                    style={{ width: `${segmentPct}%`, background: `hsl(${hue}, 60%, 55%)` }}
                                                />
                                            );
                                        })}
                                        {Object.keys(item.breakdown || {}).length === 0 && (
                                            <div
                                                className={styles.barFill}
                                                data-tooltip={`${item.name} ${item.total.toLocaleString()}대`}
                                                style={{ width: `${Math.max(0.5, (item.total / maxTotal) * 100)}%`, background: `hsl(${((idx * 50) % 360)}, 60%, 55%)` }}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className={styles.tablePanel}>
                    <div className={styles.panelHeaderWrap}>
                        <h3 className={styles.panelTitle}>데이터 요약 (트리)</h3>
                        <div className={styles.dragGroupInfo}>
                            <span className={styles.dragLabel}>순서 변경(드래그):</span>
                            {currentGroups.map((g, index) => (
                                <div key={g} draggable
                                    onDragStart={(e) => (dragItem.current = index)}
                                    onDragEnter={(e) => (dragOverItem.current = index)}
                                    onDragEnd={handleSort}
                                    onDragOver={(e) => e.preventDefault()}
                                    className={styles.draggablePill}>
                                    {g}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={styles.treeHeader}>
                        <div className={styles.thNameGroup}>
                            <span className={styles.thName}>항목 분류계층 ({currentGroups.join(' ▶ ')})</span>
                            <div className={styles.expandActions}>
                                <button className={styles.expandBtn} onClick={() => setForceExpand({ targetState: true, ts: Date.now() })}>열기 📂</button>
                                <button className={styles.expandBtn} onClick={() => setForceExpand({ targetState: false, ts: Date.now() })}>닫기 📁</button>
                            </div>
                        </div>
                        <span className={styles.thVal}>총 합산수량</span>
                    </div>
                    <div className={styles.treeBody}>
                        {Object.values(pivotData.root.children).sort((a, b) => b.total - a.total).map(child => (
                            <TreeNode key={child.name} node={child} level={0} featuresRenderer={renderFeatures} path={[]} selectedPath={selectedPath} onSelect={setSelectedPath} forceExpand={forceExpand} />
                        ))}
                    </div>
                </div>
            </div >
        </div >
    );
}

const PieChart = ({ data, title }) => {
    const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
    const top5 = sorted.slice(0, 5);
    const otherTotal = sorted.slice(5).reduce((s, v) => s + v[1], 0);
    if (otherTotal > 0) top5.push(['기타', otherTotal]);

    const total = top5.reduce((s, v) => s + v[1], 0);
    if (total === 0) return null;

    let gradientParts = [];
    let accPct = 0;
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#94a3b8'];

    top5.forEach((item, i) => {
        const pct = (item[1] / total) * 100;
        gradientParts.push(`${colors[i % colors.length]} ${accPct}% ${accPct + pct}%`);
        accPct += pct;
    });

    return (
        <div className={styles.pieCard}>
            <h4 className={styles.pieTitle}>{title} 점유율</h4>
            <div className={styles.pieWrap}>
                <div className={styles.pieCircle} style={{ background: `conic-gradient(${gradientParts.join(', ')})` }}></div>
                <div className={styles.pieLegend}>
                    {top5.map((item, i) => (
                        <div key={item[0]} className={styles.pieLegendRow}>
                            <span className={styles.pieDot} style={{ background: colors[i % colors.length] }}></span>
                            <span className={styles.pieLabel} title={item[0]}>{item[0]}</span>
                            <span className={styles.pieVal}>{item[1].toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
