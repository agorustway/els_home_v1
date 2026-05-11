'use client';
import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
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

    // Column Filters
    const [columnFilters, setColumnFilters] = useState({});

    // File Browser
    const [showSettings, setShowSettings] = useState(false);
    const [showBrowser, setShowBrowser] = useState(false);
    const [browserPath, setBrowserPath] = useState('/아산지점');
    const [browserFiles, setBrowserFiles] = useState([]);
    const [browserLoading, setBrowserLoading] = useState(false);
    const [selectedPath, setSelectedPath] = useState('');

    useEffect(() => {
        const saved = localStorage.getItem('asan_shipping_file') || '/아산지점/2026_자체보관리스트.xlsx';
        setSelectedPath(saved);
    }, []);

    const fetchData = async (pathOverride) => {
        const path = pathOverride || selectedPath;
        if (!path) return;
        
        setLoading(true);
        try {
            const r = await fetch(`/api/branches/asan/shipping?path=${encodeURIComponent(path)}`);
            // 백엔드에서 Python NaN이 JSON에 섞여 나올 수 있어 text로 받아서 치환 후 파싱
            const text = await r.text();
            const safeText = text.replace(/\bNaN\b/g, 'null');
            const j = JSON.parse(safeText);
            if (j.data) {
                setData(j.data);
                if (j.data.headers) {
                    const filteredHeaders = j.data.headers.filter(h => h !== 'col_1');
                    setHeaders(filteredHeaders);
                }
            }
        } catch (e) {
            console.error('Failed to fetch shipping data:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedPath) fetchData();
    }, [selectedPath]);

    const loadNasFolder = async (path) => {
        setBrowserLoading(true);
        try {
            const r = await fetch(`/api/nas/files?path=${encodeURIComponent(path)}`);
            const j = await r.json();
            if (j.files) setBrowserFiles(j.files);
            setBrowserPath(path);
        } catch (e) {
            console.error(e);
        } finally {
            setBrowserLoading(false);
        }
    };

    const openBrowser = () => {
        loadNasFolder('/아산지점');
        setShowSettings(false);
        setShowBrowser(true);
    };

    const selectFile = (file) => {
        if (file.type === 'directory') {
            loadNasFolder(file.path);
        } else if (file.name.match(/\.xls[mx]$/i)) {
            localStorage.setItem('asan_shipping_file', file.path);
            setSelectedPath(file.path);
            setShowBrowser(false);
        }
    };

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

    const exportToExcel = () => {
        if (!processedData || processedData.length === 0) {
            alert('다운로드할 데이터가 없습니다.');
            return;
        }
        
        // Use colOrder to get the correctly ordered and filtered headers
        const exportHeaders = colOrder;
        
        // Map rows based on colOrder
        const exportRows = processedData.map(row => {
            const mappedRow = {};
            exportHeaders.forEach(col => {
                const colIdx = data.headers.indexOf(col);
                mappedRow[col] = colIdx >= 0 ? row[colIdx] : '';
            });
            return mappedRow;
        });

        const ws = XLSX.utils.json_to_sheet(exportRows, { header: exportHeaders });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "선적관리");
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        XLSX.writeFile(wb, `선적관리_${timestamp}.xlsx`);
    };

    const resetLayout = () => {
        setColOrder(headers);
        setSortConfig({ key: null, direction: 'asc' });
        setColumnFilters({});
        setSearchTerm('');
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

        // 1.5 Column Specific Filters
        Object.entries(columnFilters).forEach(([col, filterText]) => {
            if (filterText && filterText.trim()) {
                const colIdx = data.headers.indexOf(col);
                if (colIdx >= 0) {
                    const terms = filterText.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
                    if (terms.length > 0) {
                        rows = rows.filter(row => {
                            const cell = String(row[colIdx] || '').toLowerCase();
                            return terms.some(t => cell.includes(t));
                        });
                    }
                }
            }
        });

        // 2. Sorting (User clicked column)
        if (sortConfig.key) {
            const colIdx = data.headers.indexOf(sortConfig.key);
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
                    <button className={styles.exportBtn} onClick={exportToExcel} style={{ backgroundColor: '#10b981', color: 'white' }}>엑셀 다운로드</button>
                    <button className={styles.resetBtn} onClick={() => setShowSettings(true)}>설정</button>
                    <button className={styles.resetBtn} onClick={resetLayout} style={{ backgroundColor: '#ef4444', color: 'white', borderColor: '#ef4444' }}>정렬 초기화</button>
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
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, col)}
                                        onDragOver={(e) => handleDragOver(e, col)}
                                        onDrop={(e) => handleDrop(e, col)}
                                        className={isDragOver ? styles.dragOver : ''}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <div onClick={() => handleSort(col)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>{col}</span>
                                                {sortConfig.key === col && (
                                                    <span className={styles.sortIcon}>
                                                        {sortConfig.direction === 'asc' ? '▲' : '▼'}
                                                    </span>
                                                )}
                                            </div>
                                            <input 
                                                type="text" 
                                                className={styles.colFilterInput} 
                                                placeholder="필터..." 
                                                value={columnFilters[col] || ''}
                                                onChange={e => setColumnFilters(prev => ({ ...prev, [col]: e.target.value }))}
                                                onClick={e => e.stopPropagation()}
                                                style={{ width: '100%', padding: '2px 4px', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.8rem' }}
                                            />
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {processedData.map((row, ri) => (
                            <tr key={ri} className={ri % 2 === 0 ? styles.evenRow : styles.oddRow}>
                                {colOrder.map(col => {
                                    const colIdx = data.headers.indexOf(col);
                                    const val = colIdx >= 0 ? row[colIdx] : '';
                                    return <td key={col}>{val}</td>;
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 설정 모달 */}
            {showSettings && (
                <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowSettings(false); }}>
                    <div className={styles.modal}>
                        <h2>선적관리 파일 설정</h2>
                        <div className={styles.formGroup}>
                            <label>엑셀 파일 경로</label>
                            <div className={styles.pathRow}>
                                <input value={selectedPath} readOnly className={styles.pathInput} />
                                <button onClick={openBrowser} className={styles.browseBtn}>찾기</button>
                            </div>
                        </div>
                        <div className={styles.modalFooter}>
                            <button onClick={() => setShowSettings(false)} className={styles.saveBtn}>닫기</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 파일 브라우저 모달 */}
            {showBrowser && (
                <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) { setShowBrowser(false); setShowSettings(true); } }}>
                    <div className={styles.modal} style={{ maxWidth: 600 }}>
                        <h2>NAS 파일 선택</h2>
                        <p className={styles.browserPath}>{browserPath}</p>
                        <div className={styles.browserList}>
                            {browserLoading ? <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>불러오는 중...</div> : <>
                                {browserPath !== '/' && <div className={styles.browserItem} onClick={() => loadNasFolder(browserPath.split('/').slice(0, -1).join('/') || '/')}>📁 ..</div>}
                                {browserFiles.map((f, i) => (
                                    <div key={i} className={styles.browserItem} onClick={() => selectFile(f)}>
                                        {f.type === 'directory' ? '📁' : '📄'} {f.name}
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
