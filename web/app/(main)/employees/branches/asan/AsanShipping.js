'use client';
import { useState, useEffect, useMemo } from 'react';
import styles from './shipping.module.css';

const PREFS_KEY = 'asan_shipping_prefs';

export default function AsanShipping() {
    const [data, setData] = useState(null);
    const [headers, setHeaders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [syncing, setSyncing] = useState(false);
    
    // Sort Config
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    
    // Column Order
    const [colOrder, setColOrder] = useState([]);
    const [draggedCol, setDraggedCol] = useState(null);
    const [dragOverCol, setDragOverCol] = useState(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const r = await fetch('/api/branches/asan/shipping');
            const j = await r.json();
            if (j.data) {
                setData(j.data);
                if (j.data.headers) {
                    setHeaders(j.data.headers);
                }
            }
        } catch (e) {
            console.error('Failed to fetch shipping data:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Load preferences
    useEffect(() => {
        if (headers.length > 0) {
            try {
                const prefs = JSON.parse(localStorage.getItem(PREFS_KEY));
                if (prefs && prefs.colOrder && prefs.colOrder.length === headers.length) {
                    setColOrder(prefs.colOrder);
                } else {
                    setColOrder(headers);
                }
            } catch {
                setColOrder(headers);
            }
        }
    }, [headers]);

    // Save preferences
    useEffect(() => {
        if (colOrder.length > 0) {
            localStorage.setItem(PREFS_KEY, JSON.stringify({ colOrder }));
        }
    }, [colOrder]);

    const handleSort = (colName) => {
        let direction = 'asc';
        if (sortConfig.key === colName && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key: colName, direction });
    };

    const handleDragStart = (e, colName) => {
        setDraggedCol(colName);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, colName) => {
        e.preventDefault();
        setDragOverCol(colName);
    };

    const handleDrop = (e, targetCol) => {
        e.preventDefault();
        setDragOverCol(null);
        if (draggedCol === targetCol) return;

        const newOrder = [...colOrder];
        const draggedIdx = newOrder.indexOf(draggedCol);
        const targetIdx = newOrder.indexOf(targetCol);
        
        newOrder.splice(draggedIdx, 1);
        newOrder.splice(targetIdx, 0, draggedCol);
        setColOrder(newOrder);
        setDraggedCol(null);
    };

    const resetLayout = () => {
        setColOrder(headers);
        setSortConfig({ key: null, direction: 'asc' });
        localStorage.removeItem(PREFS_KEY);
    };

    const handleSync = async () => {
        setSyncing(true);
        // We just re-fetch, backend handles cache automatically or we can force by passing a timestamp.
        // Wait, the backend currently caches by mtime. If the file is saved, mtime changes and it will reload.
        await fetchData();
        setSyncing(false);
    };

    // Processed Data (Search, Sort, Target Filtering)
    const processedData = useMemo(() => {
        if (!data || !data.data) return [];
        let rows = [...data.data];

        // 1. Search Filter (Multi-search support like: 'word1, word2')
        if (searchTerm.trim()) {
            const terms = searchTerm.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            if (terms.length > 0) {
                rows = rows.filter(row => {
                    return terms.some(t => row.some(cell => String(cell || '').toLowerCase().includes(t)));
                });
            }
        }

        // 2. Sorting (User clicked column)
        if (sortConfig.key) {
            const colIdx = headers.indexOf(sortConfig.key);
            if (colIdx >= 0) {
                rows.sort((a, b) => {
                    const valA = String(a[colIdx] || '');
                    const valB = String(b[colIdx] || '');
                    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                    return 0;
                });
            }
        } else {
            // Default Sort: AD, AE, AF values to top
            // Identify AD(29), AE(30), AF(31) roughly by headers like '선적확정모선' or directly by checking indices.
            const targetCols = [];
            headers.forEach((h, i) => {
                if (h.includes('선적확정모선')) {
                    targetCols.push(i);
                }
            });
            if (targetCols.length > 0) {
                rows.sort((a, b) => {
                    const hasValA = targetCols.some(cIdx => String(a[cIdx] || '').trim() !== '');
                    const hasValB = targetCols.some(cIdx => String(b[cIdx] || '').trim() !== '');
                    if (hasValA && !hasValB) return -1;
                    if (!hasValA && hasValB) return 1;
                    return 0;
                });
            }
        }

        return rows;
    }, [data, searchTerm, sortConfig, headers]);

    if (loading) return <div className={styles.loading}>데이터를 불러오는 중입니다...</div>;
    if (!data || !data.data) return <div className={styles.loading}>데이터가 없습니다.</div>;

    const fileTimeStr = data.file_modified_at ? new Date(data.file_modified_at).toLocaleString() : '';

    return (
        <div className={styles.container}>
            <div className={styles.topBar}>
                <div className={styles.leftControls}>
                    <h2 className={styles.title}>선적관리 리스트</h2>
                    {fileTimeStr && (
                        <div className={styles.fileMod}>
                            저장: {fileTimeStr}
                        </div>
                    )}
                </div>
                <div className={styles.rightControls}>
                    <input 
                        type="text" 
                        placeholder="전체 컬럼 검색 (콤마 구분)" 
                        className={styles.searchInput}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <button className={styles.resetBtn} onClick={resetLayout}>정렬 초기화</button>
                    <button className={styles.syncBtn} onClick={handleSync} disabled={syncing}>
                        {syncing ? '동기화 중...' : 'NAS 동기화'}
                    </button>
                </div>
            </div>

            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            {colOrder.map(col => {
                                const isDragOver = dragOverCol === col;
                                return (
                                    <th 
                                        key={col}
                                        draggable="true"
                                        onDragStart={(e) => handleDragStart(e, col)}
                                        onDragOver={(e) => handleDragOver(e, col)}
                                        onDrop={(e) => handleDrop(e, col)}
                                        onClick={() => handleSort(col)}
                                        className={isDragOver ? styles.dragOver : ''}
                                    >
                                        {col}
                                        {sortConfig.key === col && (
                                            <span className={styles.sortIcon}>
                                                {sortConfig.direction === 'asc' ? '▲' : '▼'}
                                            </span>
                                        )}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {processedData.map((row, ri) => (
                            <tr key={ri} className={ri % 2 === 0 ? styles.evenRow : styles.oddRow}>
                                {colOrder.map(col => {
                                    const colIdx = headers.indexOf(col);
                                    const val = colIdx >= 0 ? row[colIdx] : '';
                                    return <td key={col}>{val}</td>;
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
