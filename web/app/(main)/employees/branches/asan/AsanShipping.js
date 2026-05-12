'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import styles from './shipping.module.css';

const PREFS_KEY = 'asan_shipping_prefs';

// 날짜 관련 컬럼 키워드
const DATE_COL_KEYWORDS = ['일', '날짜', 'date', '픽업', '반입', '선적', '입항', '출항'];

// 20260508.0 → 2026-05-08 변환
function formatCellValue(val, colName) {
    if (val == null || val === '') return '';
    const s = String(val);
    
    // 날짜 패턴 감지: 20260508.0 or 20260508
    const m = s.match(/^(\d{4})(\d{2})(\d{2})(\.0)?$/);
    if (m) {
        const [, y, mo, d] = m;
        if (parseInt(mo) >= 1 && parseInt(mo) <= 12 && parseInt(d) >= 1 && parseInt(d) <= 31) {
            return `${y}-${mo}-${d}`;
        }
    }
    
    // 시간 패턴 감지: 09:00:00 -> 09:00
    if (colName && colName.includes('시간')) {
        const timeMatch = s.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
        if (timeMatch) {
            const h = timeMatch[1].padStart(2, '0');
            return `${h}:${timeMatch[2]}`;
        }
    }

    return s;
}

// 컬럼이 날짜 계열인지 판별
function isDateColumn(colName) {
    const lower = (colName || '').toLowerCase();
    return DATE_COL_KEYWORDS.some(kw => lower.includes(kw));
}

export default function AsanShipping() {
    const [data, setData] = useState(null);
    const [headers, setHeaders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [elapsed, setElapsed] = useState('');
    
    // Sort Config
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    
    // Column Order & Hiding
    const [colOrder, setColOrder] = useState([]);
    const [hiddenCols, setHiddenCols] = useState(new Set());
    const [draggedCol, setDraggedCol] = useState(null);
    const [dragOverCol, setDragOverCol] = useState(null);
    const [isDragOverHidden, setIsDragOverHidden] = useState(false);

    // Column Filters (Excel-like)
    const [columnFilters, setColumnFilters] = useState({});
    // Date Range Filter
    const [dateFilter, setDateFilter] = useState({ col: '', from: '', to: '' });
    const [filterDropdown, setFilterDropdown] = useState(null);

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

    useEffect(() => {
        if (!data || !data.file_modified_at) {
            setElapsed('');
            return;
        }
        const fileTs = data.file_modified_at;
        const update = () => {
            const diff = Math.max(0, Date.now() - new Date(fileTs).getTime());
            const d = Math.floor(diff / 86400000);
            const h = Math.floor((diff % 86400000) / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setElapsed(`+${d > 0 ? d + 'd ' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
        };
        update();
        const iv = setInterval(update, 1000);
        return () => clearInterval(iv);
    }, [data]);

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

    // Load preferences from DB (fallback to localStorage)
    useEffect(() => {
        if (headers.length === 0) return;
        const loadDbPrefs = async () => {
            try {
                const res = await fetch('/api/user/prefs?page_key=asan_shipping_default');
                const { data: prefs } = await res.json();
                if (prefs && prefs.colOrder && prefs.colOrder.length > 0) {
                    let finalOrder = prefs.colOrder;
                    let finalHidden = new Set(prefs.hiddenCols || []);

                    // [v5.12.4] Dynamic Header Reconciliation: Excel 제목 수정 반영
                    if (prefs.sourceHeaders && data.headers) {
                        const currentHeaders = data.headers;
                        const sourceHeaders = prefs.sourceHeaders;
                        
                        // 1. colOrder 보정
                        finalOrder = prefs.colOrder.map(name => {
                            if (currentHeaders.includes(name)) return name;
                            // 이름이 바뀌었다면 index로 매칭 시도
                            const oldIdx = sourceHeaders.indexOf(name);
                            if (oldIdx !== -1 && currentHeaders[oldIdx]) return currentHeaders[oldIdx];
                            return null;
                        }).filter(Boolean);

                        // 2. hiddenCols 보정
                        const newHidden = new Set();
                        (prefs.hiddenCols || []).forEach(name => {
                            if (currentHeaders.includes(name)) {
                                newHidden.add(name);
                            } else {
                                const oldIdx = sourceHeaders.indexOf(name);
                                if (oldIdx !== -1 && currentHeaders[oldIdx]) newHidden.add(currentHeaders[oldIdx]);
                            }
                        });
                        finalHidden = newHidden;

                        // 3. 신규 추가된 컬럼 반영
                        currentHeaders.forEach(h => {
                            if (!finalOrder.includes(h) && !finalHidden.has(h)) {
                                finalOrder.push(h);
                            }
                        });
                    }

                    setColOrder(finalOrder);
                    setHiddenCols(finalHidden);
                    if (prefs.sortConfig) setSortConfig(prefs.sortConfig);
                    return;
                }
            } catch { /* ignore */ }
            // Fallback: localStorage
            try {
                const cached = JSON.parse(localStorage.getItem(PREFS_KEY));
                if (cached?.colOrder?.length > 0) { setColOrder(cached.colOrder); return; }
            } catch { /* ignore */ }
            setColOrder(headers);
        };
        loadDbPrefs();
    }, [headers]);

    const containerRef = useRef(null);
    const [dynamicHeight, setDynamicHeight] = useState('calc(100vh - 250px)');

    useEffect(() => {
        const updateHeight = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const remaining = window.innerHeight - rect.top - 24; // 24px bottom margin
                setDynamicHeight(`${Math.max(400, remaining)}px`);
            }
        };
        updateHeight();
        window.addEventListener('resize', updateHeight);
        const timer = setTimeout(updateHeight, 300);
        return () => {
            window.removeEventListener('resize', updateHeight);
            clearTimeout(timer);
        };
    }, []);

    // Auto-save layout to DB (debounced 1.5s)
    useEffect(() => {
        if (colOrder.length === 0 || !data?.headers) return;
        const t = setTimeout(() => {
            const settings = { 
                colOrder, 
                hiddenCols: Array.from(hiddenCols), 
                sortConfig,
                sourceHeaders: data.headers // [v5.12.4] 제목 수정 추적용 원본 헤더 저장
            };
            fetch('/api/user/prefs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_key: 'asan_shipping_default', settings })
            }).catch(() => {});
            localStorage.setItem(PREFS_KEY, JSON.stringify({ colOrder }));
        }, 1500);
        return () => clearTimeout(t);
    }, [colOrder, hiddenCols, sortConfig, data?.headers]);

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
        
        if (draggedIdx === -1) {
            // Dragged from hidden, insert at target
            const targetIdx = newOrder.indexOf(targetCol);
            newOrder.splice(targetIdx, 0, draggedCol);
            setColOrder(newOrder);
            setHiddenCols(prev => {
                const n = new Set(prev);
                n.delete(draggedCol);
                return n;
            });
        } else {
            // Reorder inside table
            const targetIdx = newOrder.indexOf(targetCol);
            newOrder.splice(draggedIdx, 1);
            newOrder.splice(targetIdx, 0, draggedCol);
            setColOrder(newOrder);
        }
        setDraggedCol(null);
    };

    const handleDropToHidden = (e) => {
        e.preventDefault();
        setIsDragOverHidden(false);
        if (draggedCol && colOrder.includes(draggedCol)) {
            setColOrder(colOrder.filter(c => c !== draggedCol));
            setHiddenCols(prev => new Set(prev).add(draggedCol));
        }
        setDraggedCol(null);
    };

    const handleRestoreCol = (col) => {
        setHiddenCols(prev => {
            const n = new Set(prev);
            n.delete(col);
            return n;
        });
        setColOrder([...colOrder, col]);
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
        setHiddenCols(new Set());
        setSortConfig({ key: null, direction: 'asc' });
        setColumnFilters({});
        setSearchTerm('');
        localStorage.removeItem(PREFS_KEY);
        fetch('/api/user/prefs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page_key: 'asan_shipping_default', settings: {} })
        }).catch(() => {});
    };

    const savePreset = async (num) => {
        const settings = { 
            colOrder, 
            hiddenCols: Array.from(hiddenCols), 
            sortConfig,
            sourceHeaders: data.headers 
        };
        try {
            const res = await fetch('/api/user/prefs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_key: `asan_shipping_preset_${num}`, settings })
            });
            if (res.ok) alert(`프리셋 ${num}번 저장 완료!`);
        } catch {
            alert('저장 실패');
        }
    };

    const loadPreset = async (num) => {
        try {
            const res = await fetch(`/api/user/prefs?page_key=asan_shipping_preset_${num}`);
            const { data: prefs } = await res.json();
            if (prefs && prefs.colOrder) {
                let finalOrder = prefs.colOrder;
                let finalHidden = new Set(prefs.hiddenCols || []);

                // [v5.12.4] 프리셋 로드 시에도 제목 수정 반영
                if (prefs.sourceHeaders && data.headers) {
                    const currentHeaders = data.headers;
                    const sourceHeaders = prefs.sourceHeaders;
                    
                    finalOrder = prefs.colOrder.map(name => {
                        if (currentHeaders.includes(name)) return name;
                        const oldIdx = sourceHeaders.indexOf(name);
                        if (oldIdx !== -1 && currentHeaders[oldIdx]) return currentHeaders[oldIdx];
                        return null;
                    }).filter(Boolean);

                    const newHidden = new Set();
                    (prefs.hiddenCols || []).forEach(name => {
                        if (currentHeaders.includes(name)) {
                            newHidden.add(name);
                        } else {
                            const oldIdx = sourceHeaders.indexOf(name);
                            if (oldIdx !== -1 && currentHeaders[oldIdx]) newHidden.add(currentHeaders[oldIdx]);
                        }
                    });
                    finalHidden = newHidden;

                    currentHeaders.forEach(h => {
                        if (!finalOrder.includes(h) && !finalHidden.has(h)) {
                            finalOrder.push(h);
                        }
                    });
                }

                setColOrder(finalOrder);
                setHiddenCols(finalHidden);
                setSortConfig(prefs.sortConfig || { key: null, direction: 'asc' });
                alert(`프리셋 ${num}번 로드 완료!`);
            } else {
                alert(`저장된 프리셋 ${num}번이 없습니다.`);
            }
        } catch {
            alert('로드 실패');
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        // We just re-fetch, backend handles cache automatically or we can force by passing a timestamp.
        // Wait, the backend currently caches by mtime. If the file is saved, mtime changes and it will reload.
        await fetchData();
        setSyncing(false);
    };

    // Detect date-type columns
    const dateColumns = useMemo(() => headers.filter(h => isDateColumn(h)), [headers]);

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

        // 1.5 Column Specific Filters (Excel-like multi-select)
        Object.entries(columnFilters).forEach(([col, selectedSet]) => {
            if (selectedSet && selectedSet.size > 0) {
                const colIdx = data.headers.indexOf(col);
                if (colIdx >= 0) {
                    rows = rows.filter(row => {
                        const cell = formatCellValue(row[colIdx], col).trim();
                        return selectedSet.has(cell);
                    });
                }
            }
        });

        // 1.6 Date Range Filter
        if (dateFilter.col && (dateFilter.from || dateFilter.to)) {
            const dateColIdx = data.headers.indexOf(dateFilter.col);
            if (dateColIdx >= 0) {
                rows = rows.filter(row => {
                    const raw = formatCellValue(row[dateColIdx], dateFilter.col);
                    if (!raw) return false;
                    if (dateFilter.from && raw < dateFilter.from) return false;
                    if (dateFilter.to && raw > dateFilter.to) return false;
                    return true;
                });
            }
        }

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
    }, [data, searchTerm, sortConfig, headers, columnFilters, dateFilter]);

    if (loading) return <div className={styles.loading}>데이터를 불러오는 중입니다...</div>;
    if (!data || !data.data) return <div className={styles.loading}>데이터가 없습니다.</div>;

    const fileTimeStr = data.file_modified_at ? new Date(data.file_modified_at).toLocaleString() : '';

    // Extract unique values for the currently opened dropdown
    const getUniqueValues = (col) => {
        if (!data || !data.data) return [];
        const colIdx = data.headers.indexOf(col);
        if (colIdx === -1) return [];
        
        // Filter rows based on OTHER column filters first (to cascade filters)
        let rows = [...data.data];
        if (searchTerm.trim()) {
            const terms = searchTerm.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            if (terms.length > 0) {
                rows = rows.filter(row => terms.some(t => row.some(cell => String(cell || '').toLowerCase().includes(t))));
            }
        }
        Object.entries(columnFilters).forEach(([c, selectedSet]) => {
            if (c !== col && selectedSet && selectedSet.size > 0) {
                const cIdx = data.headers.indexOf(c);
                if (cIdx >= 0) rows = rows.filter(row => selectedSet.has(String(row[cIdx] || '').trim()));
            }
        });

        const unique = new Set();
        rows.forEach(row => unique.add(formatCellValue(row[colIdx], col).trim()));
        return Array.from(unique).sort();
    };

    const toggleFilterValue = (col, val) => {
        setColumnFilters(prev => {
            const newFilters = { ...prev };
            const currentSet = newFilters[col] ? new Set(newFilters[col]) : new Set();
            if (currentSet.has(val)) {
                currentSet.delete(val);
            } else {
                currentSet.add(val);
            }
            if (currentSet.size === 0) {
                delete newFilters[col];
            } else {
                newFilters[col] = currentSet;
            }
            return newFilters;
        });
    };

    const selectAllFilter = (col, uniqueVals) => {
        setColumnFilters(prev => {
            const newFilters = { ...prev };
            newFilters[col] = new Set(uniqueVals);
            return newFilters;
        });
    };

    const clearFilter = (col) => {
        setColumnFilters(prev => {
            const newFilters = { ...prev };
            delete newFilters[col];
            return newFilters;
        });
    };

    return (
        <div className={styles.container} ref={containerRef} style={{ height: dynamicHeight }} onClick={() => setFilterDropdown(null)}>
            <div className={styles.topBar}>
                <div className={styles.leftControls}>
                    <h2 className={styles.title}>선적관리 리스트</h2>
                    {fileTimeStr && (
                        <div className={styles.fileMod}>
                            <span className={styles.fileModLabel}>저장:</span>
                            <span className={styles.fileModTime}>{fileTimeStr}</span>
                            <span className={styles.fileModElapsed}>{elapsed}</span>
                        </div>
                    )}
                </div>
                <div className={styles.rightControls}>
                    <input 
                        type="text" 
                        placeholder="전체 검색 (콤마 구분)" 
                        className={styles.searchInput}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <button className={styles.resetBtn} onClick={() => savePreset(1)} title="현재 보이는 컬럼과 정렬 순서를 프리셋 1에 저장합니다">💾 P1 저장</button>
                    <button className={styles.resetBtn} onClick={() => loadPreset(1)} title="프리셋 1을 불러옵니다">📂 P1 로드</button>
                    <button className={styles.resetBtn} onClick={() => savePreset(2)} title="현재 보이는 컬럼과 정렬 순서를 프리셋 2에 저장합니다">💾 P2 저장</button>
                    <button className={styles.resetBtn} onClick={() => loadPreset(2)} title="프리셋 2를 불러옵니다">📂 P2 로드</button>
                    <button className={styles.resetBtn} onClick={exportToExcel}>📥 엑셀</button>
                    <button className={styles.dangerBtn} onClick={resetLayout}>↺ 정렬 초기화</button>
                    <button className={styles.resetBtn} onClick={() => setShowSettings(true)}>⚙️ 설정</button>
                    <button className={styles.syncBtn} onClick={handleSync} disabled={syncing}>
                        {syncing ? '⏳ 동기화' : '🚀 NAS 동기화'}
                    </button>
                </div>
            </div>

            <div 
                className={styles.hiddenColsZone}
                style={{ 
                    padding: '10px', 
                    marginBottom: '10px', 
                    border: isDragOverHidden ? '2px dashed #3b82f6' : '2px dashed #cbd5e1', 
                    borderRadius: '8px', 
                    minHeight: '40px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    alignItems: 'center',
                    backgroundColor: isDragOverHidden ? '#eff6ff' : '#f8fafc',
                    transition: 'all 0.2s'
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragOverHidden(true); }}
                onDragLeave={() => setIsDragOverHidden(false)}
                onDrop={handleDropToHidden}
            >
                <span style={{ color: '#64748b', fontSize: '0.9rem', marginRight: '10px' }}>
                    {hiddenCols.size === 0 ? '이곳에 컬럼을 드래그하여 숨길 수 있습니다' : '숨긴 컬럼 (클릭하거나 드래그해서 표로 복구)'}
                </span>
                {Array.from(hiddenCols).map(col => (
                    <button 
                        key={col}
                        draggable
                        onDragStart={(e) => handleDragStart(e, col)}
                        onClick={() => handleRestoreCol(col)}
                        style={{ 
                            padding: '4px 10px', 
                            backgroundColor: '#e2e8f0', 
                            border: '1px solid #cbd5e1', 
                            borderRadius: '16px', 
                            fontSize: '0.85rem',
                            cursor: 'pointer'
                        }}
                    >
                        {col} +
                    </button>
                ))}
            </div>

            {/* Date Range Filter */}
            {dateColumns.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', padding: '8px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#475569' }}>📅 날짜 필터</span>
                    <select 
                        value={dateFilter.col} 
                        onChange={e => setDateFilter(p => ({ ...p, col: e.target.value }))}
                        style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem' }}
                    >
                        <option value="">컬럼 선택</option>
                        {dateColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="date" value={dateFilter.from} onChange={e => setDateFilter(p => ({ ...p, from: e.target.value }))} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem' }} />
                    <span style={{ color: '#94a3b8' }}>~</span>
                    <input type="date" value={dateFilter.to} onChange={e => setDateFilter(p => ({ ...p, to: e.target.value }))} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem' }} />
                    {(dateFilter.from || dateFilter.to) && (
                        <button onClick={() => setDateFilter({ col: '', from: '', to: '' })} style={{ padding: '4px 8px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer', color: '#dc2626' }}>초기화</button>
                    )}
                </div>
            )}

            {/* Active Filter Badges */}
            {Object.keys(columnFilters).length > 0 && (
                <div className={styles.filterBadges}>
                    {Object.entries(columnFilters).map(([col, selectedSet]) => (
                        <span key={col} className={styles.filterBadge}>
                            {col}: {selectedSet.size}개 선택
                            <button onClick={() => clearFilter(col)}>✕</button>
                        </span>
                    ))}
                    <button className={styles.filterBadge} style={{ background: '#fee2e2', borderColor: '#fecaca', color: '#dc2626', cursor: 'pointer' }} onClick={() => setColumnFilters({})}>
                        전체 필터 초기화
                    </button>
                </div>
            )}

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
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span onClick={() => handleSort(col)} style={{ cursor: 'pointer', flexGrow: 1, textAlign: 'center' }}>
                                                {col}
                                                {sortConfig.key === col && (
                                                    <span className={styles.sortIcon}>
                                                        {sortConfig.direction === 'asc' ? '▲' : '▼'}
                                                    </span>
                                                )}
                                            </span>
                                            <span 
                                                onClick={(e) => { e.stopPropagation(); setFilterDropdown(filterDropdown === col ? null : col); }}
                                                style={{ cursor: 'pointer', padding: '0 4px', color: columnFilters[col] ? '#3b82f6' : '#94a3b8' }}
                                            >
                                                ▼
                                            </span>
                                        </div>
                                        {filterDropdown === col && (
                                            <div 
                                                className={styles.dropdown} 
                                                onClick={e => e.stopPropagation()}
                                                style={{ position: 'absolute', top: '100%', left: colOrder.indexOf(col) < 2 ? 0 : 'auto', right: colOrder.indexOf(col) < 2 ? 'auto' : 0, zIndex: 100, background: 'white', border: '1px solid #cbd5e1', borderRadius: '4px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '8px', minWidth: '150px', maxHeight: '300px', display: 'flex', flexDirection: 'column' }}
                                            >
                                                <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                                                    <button onClick={() => selectAllFilter(col, getUniqueValues(col))} style={{ flex: 1, padding: '4px', fontSize: '0.8rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer' }}>전체 선택</button>
                                                    <button onClick={() => clearFilter(col)} style={{ flex: 1, padding: '4px', fontSize: '0.8rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer' }}>초기화</button>
                                                </div>
                                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                                    {getUniqueValues(col).map(val => (
                                                        <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '0.85rem', cursor: 'pointer' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={columnFilters[col]?.has(val) || false}
                                                                onChange={() => toggleFilterValue(col, val)}
                                                            />
                                                            {val || '(빈 값)'}
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
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
                                    const colIdx = data.headers.indexOf(col);
                                    const raw = colIdx >= 0 ? row[colIdx] : '';
                                    const val = formatCellValue(raw, col);
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
