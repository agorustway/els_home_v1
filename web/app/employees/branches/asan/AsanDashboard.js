'use client';
import { useMemo, useState, useRef } from 'react';
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

const TreeNode = ({ node, level, featuresRenderer, path, selectedPath, onSelect }) => {
    const [expanded, setExpanded] = useState(level < 1);
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
                    {hasChildren && <span className={styles.expander}>{expanded ? '▼' : '▶'}</span>}
                    {!hasChildren && <span className={styles.dot}>•</span>}
                    <span className={styles.nodeName}>{node.name}</span>
                </div>
                <div className={styles.treeTotal}>{node.total.toLocaleString()}</div>
            </div>
            {expanded && hasChildren && (
                <div className={styles.treeChildren}>
                    {Object.values(node.children).sort((a, b) => b.total - a.total).map(child => (
                        <TreeNode key={child.name} node={child} level={level + 1} featuresRenderer={featuresRenderer} path={currentPath} selectedPath={selectedPath} onSelect={onSelect} />
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
    const [customerGroups, setCustomerGroups] = useState(['작업지', '라인/선사', 'TYPE']);
    const [dispatcherGroups, setDispatcherGroups] = useState(['업체명', '작업지', '라인/선사', 'TYPE']);
    const [selectedPath, setSelectedPath] = useState(null);

    // 드래그 앤 드롭 상태
    const dragItem = useRef();
    const dragOverItem = useRef();

    const currentGroups = viewMode === 'customer' ? customerGroups : dispatcherGroups;
    const setCurrentGroups = viewMode === 'customer' ? setCustomerGroups : setDispatcherGroups;

    // 뷰 전환시 선택 초기화
    const handleViewModeChange = (mode) => {
        setViewMode(mode);
        setSelectedPath(null);
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

        // 파이 차트 데이터 (화주, 구분 전체 기준)
        const pieAggs = { hwaju: {}, gubun: {} };
        const hHwaju = colMap['화주'];
        const hGubun = colMap['구분'];

        if (viewMode === 'customer') {
            data.forEach(row => {
                const weight = ['glovis', 'integrated'].includes(viewType) ? (parseInt(row[hOrder]) || 0) : (parseInt(row[hQty]) || 0);
                if (weight > 0) {
                    const hw = row[hHwaju] || '미분류';
                    const gb = row[hGubun] || '미분류';
                    pieAggs.hwaju[hw] = (pieAggs.hwaju[hw] || 0) + weight;
                    pieAggs.gubun[gb] = (pieAggs.gubun[gb] || 0) + weight;
                }
            });

            const groupKeysInfo = customerGroups.map(k => ({ name: k, idx: colMap[k] })).filter(x => x.idx >= 0);
            const root = buildPivot(data, groupKeysInfo, (row) => ['glovis', 'integrated'].includes(viewType) ? (parseInt(row[hOrder]) || 0) : (parseInt(row[hQty]) || 0));
            const pData = Object.values(root.children).sort((a, b) => b.total - a.total);
            return { root, chartData: pData, type: 'customer', headers, groups: currentGroups, pieAggs };
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
                pieAggs.hwaju[hw] = (pieAggs.hwaju[hw] || 0) + rec.__virtual_count;
                pieAggs.gubun[gb] = (pieAggs.gubun[gb] || 0) + rec.__virtual_count;
            });

            const groupKeysInfo = dispatcherGroups.map(k => {
                if (k === '업체명') return { name: k, isVirtual: true };
                return { name: k, idx: colMap[k] };
            }).filter(x => x.isVirtual || x.idx >= 0);

            const root = buildPivot(dispatchRecords, groupKeysInfo, (row) => row.__virtual_count);

            // 차트 데이터 (1레벨 기준이 아니라 업체명 수집)
            const companyRoot = {};
            dispatchRecords.forEach(r => {
                if (!companyRoot[r.__virtual_company]) companyRoot[r.__virtual_company] = 0;
                companyRoot[r.__virtual_company] += r.__virtual_count;
            });
            const chartData = Object.entries(companyRoot).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);

            return { root, chartData, type: 'dispatcher', headers, groups: currentGroups, pieAggs };
        }
    }, [data, headers, viewType, viewMode, customerGroups, dispatcherGroups]);

    if (!pivotData || pivotData.root.total === 0) return <div className={styles.empty}>데이터가 부족합니다.</div>;

    const displayChartData = useMemo(() => {
        if (!pivotData) return [];
        if (!selectedPath || selectedPath.length === 0) {
            // 선택된 게 없으면 최상위(1차) 항목들을 보여줌
            return pivotData.chartData;
        } else {
            // 트리에서 선택된 노드 찾기
            let curr = pivotData.root;
            for (const p of selectedPath) {
                if (curr.children && curr.children[p]) curr = curr.children[p];
                else break;
            }
            if (!curr) return [];

            // 선택된 노드의 하위(자식) 레벨을 보여줌
            const childrenKeys = Object.keys(curr.children || {});
            if (childrenKeys.length > 0) {
                return Object.values(curr.children).sort((a, b) => b.total - a.total);
            } else {
                // 자식이 더 이상 없으면 본인 보여줌
                return [curr];
            }
        }
    }, [pivotData, selectedPath]);

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

            <div className={styles.dashContent}>
                <div className={styles.chartPanel}>
                    <div className={styles.panelHeaderWrap}>
                        <h3 className={styles.panelTitle}>
                            {selectedPath ? `${selectedPath[selectedPath.length - 1]} 하위 비중 분석` : (viewMode === 'customer' ? '비중 차트 (1차 항목)' : '비중 차트 (업체명 기준)')}
                        </h3>
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
                                        <div className={styles.barFill} style={{ width: `${pctOfMax}%`, background: `hsl(${(idx * 50) % 360}, 60%, 55%)` }}></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className={styles.tablePanel}>
                    <div className={styles.panelHeaderWrap}>
                        <h3 className={styles.panelTitle}>상세 데이터 요약표 (트리 구조)</h3>
                        <div className={styles.dragGroupInfo}>
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginRight: 8 }}>우측 항목을 드래그하여 순서 변경:</span>
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
                        <span className={styles.thName}>항목 분류계층 ({currentGroups.join(' ▶ ')})</span>
                        <span className={styles.thVal}>총 합산수량</span>
                    </div>
                    <div className={styles.treeBody}>
                        {Object.values(pivotData.root.children).sort((a, b) => b.total - a.total).map(child => (
                            <TreeNode key={child.name} node={child} level={0} featuresRenderer={renderFeatures} path={[]} selectedPath={selectedPath} onSelect={setSelectedPath} />
                        ))}
                    </div>
                </div>
            </div>

            {/* 하단 점유율 원형 다이어그램 (화주, 구분) */}
            <div className={styles.pieModules}>
                <PieChart data={pivotData.pieAggs.hwaju} title="화주 (고객사)" />
                <PieChart data={pivotData.pieAggs.gubun} title="구분 (수출/수입 등)" />
            </div>
        </div>
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
