'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    buildContainerLookupMapFromRows,
    CONTAINER_LOOKUP_DISPLAY_COLUMNS,
    extractUniqueContainerNos,
    getContainerLookupValue,
    isContainerLookupColumn,
} from '@/utils/containerHistoryResults.mjs';
import {
    areArraysEqual,
    areSetsEqual,
    compareShippingFilterValues,
    getShippingVirtualWindow,
    getShippingSignalTone,
    getVisibleShippingColumns,
    isShippingUnshippedCandidate,
    mergePendingContainerLookupResults,
    normalizeDateOnly,
    normalizeShippingFilterValue,
    normalizeShippingColumnOrder,
    reconcileShippingLayoutPrefs,
} from '@/utils/asanShippingView.mjs';
import styles from './shipping.module.css';

const PREFS_KEY = 'asan_shipping_prefs';
const ROW_HEIGHT = 28;
const VIRTUAL_OVERSCAN = 12;
const SHIPPING_PAGE_SIZE = 100;
const FULL_FILTER_PAGE_SIZE = 10000;
const SEARCH_DEBOUNCE_MS = 1000;
const SEARCH_CLEAR_DEBOUNCE_MS = 250;
const SEARCH_BUSY_VISIBLE_DELAY_MS = 350;
const CONTAINER_RESULTS_CHUNK_SIZE = 150;
const LOOKUP_HEADERS = CONTAINER_LOOKUP_DISPLAY_COLUMNS.map(col => col.header);

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

function getHiddenChipLabel(col) {
    return isContainerLookupColumn(col) ? String(col).replace(/^이력\s*/, '') : col;
}

function getServerSortParams(config) {
    if (!config?.key || isContainerLookupColumn(config.key)) {
        return { sortKey: '', sortDir: 'asc' };
    }
    return {
        sortKey: config.key,
        sortDir: config.direction === 'desc' ? 'desc' : 'asc',
    };
}

function isSortConfigEqual(a, b) {
    return (a?.key || null) === (b?.key || null) && (a?.direction || 'asc') === (b?.direction || 'asc');
}

function summarizeContainerLookupProgress(rows = [], containers = [], options = {}) {
    const targets = new Set((containers || []).map(v => String(v || '').trim().toUpperCase()).filter(Boolean));
    const completed = new Set();
    const failed = new Set();

    (rows || []).forEach(row => {
        const containerNo = String(row?.[0] || '').trim().toUpperCase();
        if (!containerNo || (targets.size > 0 && !targets.has(containerNo))) return;
        const code = String(row?.[1] || '').trim().toUpperCase();
        if (code === 'ERROR') {
            failed.add(containerNo);
            return;
        }
        if (code) completed.add(containerNo);
    });

    completed.forEach(containerNo => failed.delete(containerNo));
    const total = targets.size || completed.size + failed.size;
    const forceRemainingFailed = Boolean(options.forceRemainingFailed);
    const remaining = Math.max(0, total - completed.size - failed.size);

    return {
        total,
        completed: completed.size,
        failed: failed.size + (forceRemainingFailed ? remaining : 0),
    };
}

export default function AsanShipping() {
    const [data, setData] = useState(null);
    const [headers, setHeaders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [searchInput, setSearchInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchRefreshing, setSearchRefreshing] = useState(false);
    const [showSearchRefreshing, setShowSearchRefreshing] = useState(false);
    const [isComposingSearch, setIsComposingSearch] = useState(false);
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
    const [unshippedOnly, setUnshippedOnly] = useState(false);
    const [storageOnly, setStorageOnly] = useState(false);
    const [filterDropdown, setFilterDropdown] = useState(null);

    // File Browser
    const [showSettings, setShowSettings] = useState(false);
    const [showBrowser, setShowBrowser] = useState(false);
    const [browserPath, setBrowserPath] = useState('/아산지점');
    const [browserFiles, setBrowserFiles] = useState([]);
    const [browserLoading, setBrowserLoading] = useState(false);
    const [selectedPath, setSelectedPath] = useState('');
    const [containerLookupResults, setContainerLookupResults] = useState({});
    const [containerLookupRunning, setContainerLookupRunning] = useState(false);
    const [containerLookupStatus, setContainerLookupStatus] = useState('');
    const [containerLookupProgress, setContainerLookupProgress] = useState(null);
    const containerLookupResultsRef = useRef({});
    const lastLoadedPathRef = useRef('');
    const fetchRequestIdRef = useRef(0);
    const autoLoadMoreRef = useRef(false);
    const layoutPrefsLoadedRef = useRef('');

    useEffect(() => {
        const saved = localStorage.getItem('asan_shipping_file') || '/아산지점/2026_자체보관리스트.xlsx';
        setSelectedPath(saved);
    }, []);

    const applyShippingData = useCallback((payload, options = {}) => {
        if (!payload) return;
        const append = Boolean(options.append);
        setData(prev => {
            if (!append || !prev?.data || !payload.data) return payload;
            return {
                ...payload,
                data: [...prev.data, ...payload.data]
            };
        });
        if (payload.headers) {
            const filteredHeaders = payload.headers.filter(h => h !== 'col_1');
            setHeaders(filteredHeaders);
        }
    }, []);

    const fetchData = useCallback(async (pathOverride, options = {}) => {
        const path = pathOverride || selectedPath;
        if (!path) return;

        const page = options.page || 1;
        const pageSize = options.pageSize || SHIPPING_PAGE_SIZE;
        const search = (options.search || '').trim();
        const append = Boolean(options.append);
        const quiet = Boolean(options.quiet);
        const sortKey = (options.sortKey || '').trim();
        const sortDir = options.sortDir === 'desc' ? 'desc' : 'asc';
        const requestId = append ? fetchRequestIdRef.current : fetchRequestIdRef.current + 1;
        if (!append) fetchRequestIdRef.current = requestId;

        if (append) {
            setLoadingMore(true);
        } else if (quiet) {
            setSearchRefreshing(true);
        } else {
            setLoading(true);
        }
        try {
            const params = new URLSearchParams({
                path,
                page: String(page),
                page_size: String(pageSize)
            });
            if (search) params.set('search', search);
            if (sortKey) {
                params.set('sort_key', sortKey);
                params.set('sort_dir', sortDir);
            }

            const r = await fetch(`/api/branches/asan/shipping?${params.toString()}`);
            // 백엔드에서 Python NaN이 JSON에 섞여 나올 수 있어 text로 받아서 치환 후 파싱
            const text = await r.text();
            const safeText = text.replace(/\bNaN\b/g, 'null');
            const j = JSON.parse(safeText);
            if (j.data) {
                if (requestId !== fetchRequestIdRef.current) return;
                applyShippingData(j.data, { append });
                lastLoadedPathRef.current = path;
            }
        } catch (e) {
            console.error('Failed to fetch shipping data:', e);
        } finally {
            if (append) {
                setLoadingMore(false);
            } else if (requestId !== fetchRequestIdRef.current) {
                return;
            } else if (options.quiet) {
                setSearchRefreshing(false);
            } else {
                setLoading(false);
            }
        }
    }, [selectedPath, applyShippingData]);

    const allHeaders = useMemo(() => {
        return [...headers, ...LOOKUP_HEADERS.filter(header => !headers.includes(header))];
    }, [headers]);

    const hiddenColumnList = useMemo(() => {
        const cols = Array.from(hiddenCols);
        return [
            ...cols.filter(col => !isContainerLookupColumn(col)),
            ...cols.filter(col => isContainerLookupColumn(col)),
        ];
    }, [hiddenCols]);

    const orderedVisibleColumns = useMemo(() => (
        getVisibleShippingColumns(colOrder, allHeaders, hiddenCols)
    ), [colOrder, allHeaders, hiddenCols]);

    const getRowContainerNo = useCallback((row) => {
        if (!data?.headers) return '';
        return extractUniqueContainerNos(data.headers, [row])[0] || '';
    }, [data?.headers]);

    const getDisplayCellRawValue = useCallback((row, col) => {
        if (isContainerLookupColumn(col)) {
            const containerNo = getRowContainerNo(row);
            return getContainerLookupValue(containerLookupResults[containerNo], col);
        }
        const colIdx = data?.headers?.indexOf(col) ?? -1;
        return colIdx >= 0 ? row[colIdx] : '';
    }, [containerLookupResults, data?.headers, getRowContainerNo]);

    const serverSortParams = useMemo(() => getServerSortParams(sortConfig), [sortConfig]);

    useEffect(() => {
        containerLookupResultsRef.current = containerLookupResults;
    }, [containerLookupResults]);

    const loadSavedContainerLookupResults = useCallback(async (containers) => {
        const missingContainers = Array.from(new Set(containers || []))
            .filter(containerNo => containerNo && !containerLookupResultsRef.current?.[containerNo]?.mainRow);
        if (!selectedPath || !missingContainers.length) return;
        try {
            for (let i = 0; i < missingContainers.length; i += CONTAINER_RESULTS_CHUNK_SIZE) {
                const chunk = missingContainers.slice(i, i + CONTAINER_RESULTS_CHUNK_SIZE);
                const params = new URLSearchParams({
                    path: selectedPath,
                    containers: chunk.join(',')
                });
                const res = await fetch(`/api/branches/asan/shipping/container-results?${params.toString()}`);
                const json = await res.json();
                if (json.data) {
                    setContainerLookupResults(prev => {
                        const next = { ...prev, ...json.data };
                        containerLookupResultsRef.current = next;
                        return next;
                    });
                }
            }
        } catch (err) {
            console.warn('Failed to load container lookup results:', err);
        }
    }, [selectedPath]);

    useEffect(() => {
        if (isComposingSearch) return undefined;
        const delay = searchInput.trim() ? SEARCH_DEBOUNCE_MS : SEARCH_CLEAR_DEBOUNCE_MS;
        const timer = setTimeout(() => {
            setSearchTerm(searchInput);
        }, delay);
        return () => clearTimeout(timer);
    }, [searchInput, isComposingSearch]);

    useEffect(() => {
        if (!searchRefreshing) {
            setShowSearchRefreshing(false);
            return undefined;
        }
        const timer = setTimeout(() => {
            setShowSearchRefreshing(true);
        }, SEARCH_BUSY_VISIBLE_DELAY_MS);
        return () => clearTimeout(timer);
    }, [searchRefreshing]);

    useEffect(() => {
        if (!selectedPath) return;
        const quiet = lastLoadedPathRef.current === selectedPath;
        fetchData(selectedPath, { page: 1, search: searchTerm, quiet, ...serverSortParams });
    }, [selectedPath, searchTerm, serverSortParams, fetchData]);

    useEffect(() => {
        if (!data?.headers || !data?.data?.length) return;
        const containers = extractUniqueContainerNos(data.headers, data.data);
        loadSavedContainerLookupResults(containers);
    }, [data?.headers, data?.data, loadSavedContainerLookupResults]);

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
        if (headers.length === 0 || allHeaders.length === 0) return;
        const prefsSignature = `${selectedPath}::${allHeaders.join('|')}`;
        if (layoutPrefsLoadedRef.current === prefsSignature) return;
        layoutPrefsLoadedRef.current = prefsSignature;

        const applyLayoutPrefs = (nextOrder, nextHidden, nextSortConfig) => {
            const normalizedOrder = normalizeShippingColumnOrder(nextOrder, allHeaders);
            setColOrder(prev => areArraysEqual(prev, normalizedOrder) ? prev : normalizedOrder);
            setHiddenCols(prev => areSetsEqual(prev, nextHidden) ? prev : nextHidden);
            if (nextSortConfig) {
                setSortConfig(prev => isSortConfigEqual(prev, nextSortConfig) ? prev : nextSortConfig);
            }
        };

        const loadDbPrefs = async () => {
            try {
                const res = await fetch('/api/user/prefs?page_key=asan_shipping_default');
                const { data: prefs } = await res.json();
                if (prefs && prefs.colOrder && prefs.colOrder.length > 0) {
                    let finalOrder = prefs.colOrder;
                    let finalHidden = new Set((prefs.hiddenCols || []).filter(name => allHeaders.includes(name)));

                    // [v5.13.43] 엑셀 제목 변경은 같은 열 수에서만 인덱스 매칭하고, 삭제/추가는 현재 헤더 기준으로 반영한다.
                    if (prefs.sourceHeaders && allHeaders) {
                        const reconciled = reconcileShippingLayoutPrefs({
                            order: prefs.colOrder,
                            hiddenCols: prefs.hiddenCols || [],
                            sourceHeaders: prefs.sourceHeaders,
                            currentHeaders: allHeaders,
                        });
                        finalOrder = reconciled.colOrder;
                        finalHidden = reconciled.hiddenCols;
                    }

                    applyLayoutPrefs(finalOrder, finalHidden, prefs.sortConfig);
                    return;
                }
            } catch { /* ignore */ }
            // Fallback: localStorage
            try {
                const cached = JSON.parse(localStorage.getItem(PREFS_KEY));
                if (cached?.colOrder?.length > 0) {
                    applyLayoutPrefs(cached.colOrder, new Set(), null);
                    return;
                }
            } catch { /* ignore */ }
            applyLayoutPrefs(allHeaders, new Set(), null);
        };
        loadDbPrefs();
    }, [allHeaders, headers.length, selectedPath]);

    const containerRef = useRef(null);
    const tableWrapRef = useRef(null);
    const [dynamicHeight, setDynamicHeight] = useState('calc(100vh - 250px)');
    const [tableScrollTop, setTableScrollTop] = useState(0);
    const [tableViewportHeight, setTableViewportHeight] = useState(480);

    useEffect(() => {
        const updateHeight = () => {
            if (window.innerWidth <= 768) {
                setDynamicHeight('auto');
                return;
            }
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

    useEffect(() => {
        const wrap = tableWrapRef.current;
        if (!wrap) return;

        const updateViewport = () => setTableViewportHeight(wrap.clientHeight || 480);
        updateViewport();

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateViewport);
            return () => window.removeEventListener('resize', updateViewport);
        }

        const observer = new ResizeObserver(updateViewport);
        observer.observe(wrap);
        return () => observer.disconnect();
    }, [dynamicHeight]);

    // Auto-save layout to DB (debounced 1.5s)
    useEffect(() => {
        if (headers.length === 0 || colOrder.length === 0 || allHeaders.length === 0) return;
        const t = setTimeout(() => {
            const normalizedOrder = normalizeShippingColumnOrder(colOrder, allHeaders);
            const settings = { 
                colOrder: normalizedOrder,
                hiddenCols: Array.from(hiddenCols), 
                sortConfig,
                sourceHeaders: allHeaders // [v5.12.4] 제목 수정 추적용 원본 헤더 저장
            };
            fetch('/api/user/prefs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_key: 'asan_shipping_default', settings })
            }).catch(() => {});
            localStorage.setItem(PREFS_KEY, JSON.stringify({ colOrder: normalizedOrder }));
        }, 1500);
        return () => clearTimeout(t);
    }, [colOrder, hiddenCols, sortConfig, allHeaders, headers.length]);

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
        if (!draggedCol) return;
        if (draggedCol === targetCol) return;

        const newOrder = [...colOrder];
        const draggedIdx = newOrder.indexOf(draggedCol);
        const targetIdx = newOrder.indexOf(targetCol);
        
        if (draggedIdx === -1) {
            // Dragged from hidden, insert at target
            newOrder.splice(Math.max(0, targetIdx), 0, draggedCol);
            setColOrder(normalizeShippingColumnOrder(newOrder, allHeaders));
        } else {
            // Reorder inside table
            newOrder.splice(draggedIdx, 1);
            const adjustedTargetIdx = draggedIdx < targetIdx ? targetIdx - 1 : targetIdx;
            newOrder.splice(Math.max(0, adjustedTargetIdx), 0, draggedCol);
            setColOrder(normalizeShippingColumnOrder(newOrder, allHeaders));
        }
        setHiddenCols(prev => {
            if (!prev.has(draggedCol)) return prev;
            const n = new Set(prev);
            n.delete(draggedCol);
            return n;
        });
        setDraggedCol(null);
    };

    const handleDropToHidden = (e) => {
        e.preventDefault();
        setIsDragOverHidden(false);
        if (draggedCol && allHeaders.includes(draggedCol)) {
            setColOrder(prev => normalizeShippingColumnOrder(prev.length ? prev : allHeaders, allHeaders));
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
        setColOrder(prev => normalizeShippingColumnOrder(prev.includes(col) ? prev : [...prev, col], allHeaders));
    };

    const exportToExcel = async () => {
        if (!processedData || processedData.length === 0) {
            alert('다운로드할 데이터가 없습니다.');
            return;
        }
        const XLSX = await import('xlsx');
        
        // Use the rendered column order so container history stays at the right edge.
        const exportHeaders = orderedVisibleColumns;
        
        // Map rows based on colOrder
        const exportRows = processedData.map(row => {
            const mappedRow = {};
            exportHeaders.forEach(col => {
                mappedRow[col] = getDisplayCellRawValue(row, col);
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
        setColOrder(normalizeShippingColumnOrder(allHeaders, allHeaders));
        setHiddenCols(new Set());
        setSortConfig({ key: null, direction: 'asc' });
        setColumnFilters({});
        setDateFilter({ col: '', from: '', to: '' });
        setUnshippedOnly(false);
        setStorageOnly(false);
        setSearchInput('');
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
            sourceHeaders: allHeaders
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
                let finalHidden = new Set((prefs.hiddenCols || []).filter(name => allHeaders.includes(name)));

                // [v5.13.43] 프리셋 로드 시에도 제목 변경/삭제/추가를 현재 엑셀 헤더에 맞춘다.
                if (prefs.sourceHeaders && allHeaders) {
                    const reconciled = reconcileShippingLayoutPrefs({
                        order: prefs.colOrder,
                        hiddenCols: prefs.hiddenCols || [],
                        sourceHeaders: prefs.sourceHeaders,
                        currentHeaders: allHeaders,
                    });
                    finalOrder = reconciled.colOrder;
                    finalHidden = reconciled.hiddenCols;
                }

                setColOrder(normalizeShippingColumnOrder(finalOrder, allHeaders));
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
        try {
            const r = await fetch('/api/branches/asan/shipping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: selectedPath,
                    force: true,
                    page: 1,
                    page_size: SHIPPING_PAGE_SIZE,
                    search: searchTerm,
                    sort_key: serverSortParams.sortKey,
                    sort_dir: serverSortParams.sortDir
                })
            });
            const text = await r.text();
            const safeText = text.replace(/\bNaN\b/g, 'null');
            const j = JSON.parse(safeText);
            if (!r.ok || j.error) {
                throw new Error(j.error || 'NAS 동기화 실패');
            }
            if (j.data) {
                applyShippingData(j.data);
            } else {
                await fetchData(selectedPath, { page: 1, search: searchTerm, ...serverSortParams });
            }
        } catch (e) {
            console.error('Failed to sync shipping data:', e);
            alert(e.message || 'NAS 동기화에 실패했습니다.');
        } finally {
            setSyncing(false);
        }
    };

    const saveContainerLookupResults = async (rows, containers) => {
        const res = await fetch('/api/branches/asan/shipping/container-results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: selectedPath,
                containers,
                rows,
                lookup_source: 'asan_shipping',
            }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '컨테이너 조회 결과 저장 실패');
        if (json.data) {
            setContainerLookupResults(prev => {
                const next = { ...prev, ...json.data };
                containers.forEach(containerNo => {
                    if (!json.data[containerNo]) delete next[containerNo];
                });
                return next;
            });
        }
        return json;
    };

    const handleContainerLookup = async () => {
        if (containerLookupRunning) return;
        const containers = extractUniqueContainerNos(data?.headers || [], processedData);
        if (!containers.length) {
            alert('현재 필터 결과에서 조회할 컨테이너 번호가 없습니다.');
            return;
        }

        setContainerLookupRunning(true);
        setContainerLookupStatus(`현재 필터 결과 ${processedData.length.toLocaleString()}행 중 컨테이너 ${containers.length.toLocaleString()}건 조회 준비 중`);
        setContainerLookupProgress({ total: containers.length, completed: 0, failed: 0 });
        setContainerLookupResults(prev => mergePendingContainerLookupResults(prev, containers));

        const receivedRows = [];
        let finalRows = null;
        let savedPayload = null;
        try {
            const res = await fetch('/api/branches/asan/shipping/container-lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: selectedPath,
                    containers,
                    useSavedCreds: true,
                    reserveSingle: false,
                }),
            });
            if (!res.ok || !res.body) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `컨테이너 조회 요청 실패 (${res.status})`);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            const processLine = (line) => {
                if (line.startsWith('LOG:')) {
                    setContainerLookupStatus(line.substring(4).trim());
                    return;
                }
                if (line.startsWith('RESULT_PARTIAL:')) {
                    try {
                        const part = JSON.parse(line.substring(15));
                        if (Array.isArray(part.result)) {
                            receivedRows.push(...part.result);
                            setContainerLookupProgress(summarizeContainerLookupProgress(receivedRows, containers));
                            const partialMap = part.saved_data || buildContainerLookupMapFromRows(receivedRows, containers);
                            setContainerLookupResults(prev => ({ ...prev, ...partialMap }));
                        }
                    } catch (err) {
                        console.warn('컨테이너 부분 결과 파싱 실패:', err);
                    }
                    return;
                }
                if (line.startsWith('RESULT:')) {
                    try {
                        const payload = JSON.parse(line.substring(7));
                        if (payload.ok) {
                            finalRows = payload.result || [];
                            savedPayload = payload;
                            setContainerLookupProgress(summarizeContainerLookupProgress(finalRows, containers));
                            if (payload.saved_data) {
                                setContainerLookupResults(prev => {
                                    const next = { ...prev, ...payload.saved_data };
                                    containers.forEach(containerNo => {
                                        if (!payload.saved_data[containerNo]) delete next[containerNo];
                                    });
                                    return next;
                                });
                            }
                        }
                        else {
                            if (Array.isArray(payload.result) && payload.result.length > 0) {
                                receivedRows.push(...payload.result);
                                setContainerLookupProgress(summarizeContainerLookupProgress(receivedRows, containers, { forceRemainingFailed: true }));
                            } else {
                                setContainerLookupProgress(summarizeContainerLookupProgress(receivedRows, containers, { forceRemainingFailed: true }));
                            }
                            throw new Error(payload.error || '컨테이너 조회 실패');
                        }
                    } catch (err) {
                        throw err;
                    }
                }
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                lines.filter(Boolean).forEach(processLine);
            }
            if (buffer.trim()) processLine(buffer.trim());

            const rowsToSave = finalRows || receivedRows;
            if (!rowsToSave.length) throw new Error('컨테이너 조회 결과가 비어 있습니다.');
            if (savedPayload?.saved_error) {
                throw new Error(`컨테이너 조회 결과 저장 실패: ${savedPayload.saved_error}`);
            }
            if (savedPayload?.saved_data) {
                setContainerLookupStatus(`조회/저장 완료: ${savedPayload.saved_count || 0}건`);
            } else {
                const saved = await saveContainerLookupResults(rowsToSave, containers);
                setContainerLookupStatus(`조회/저장 완료: ${saved.count || 0}건`);
            }
        } catch (err) {
            console.error('컨테이너 조회 실패:', err);
            setContainerLookupProgress(summarizeContainerLookupProgress(receivedRows, containers, { forceRemainingFailed: true }));
            setContainerLookupStatus(`오류: ${err.message}`);
            alert(err.message || '컨테이너 조회에 실패했습니다.');
        } finally {
            setContainerLookupRunning(false);
        }
    };

    // Detect date-type columns
    const dateColumns = useMemo(() => headers.filter(h => isDateColumn(h)), [headers]);

    const getFilterCellValue = useCallback((row, col) => {
        return normalizeShippingFilterValue(formatCellValue(getDisplayCellRawValue(row, col), col));
    }, [getDisplayCellRawValue]);

    // Processed Data (Search, Sort, Target Filtering)
    const processedData = useMemo(() => {
        if (!data || !data.data) return [];
        let rows = [...data.data];
        const isServerPaged = data.source === 'supabase';
        const isServerSort = isServerPaged && sortConfig.key && !isContainerLookupColumn(sortConfig.key);

        // 1. Search Filter (Multi-search support like: 'word1, word2')
        if (!isServerPaged && searchTerm.trim()) {
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
                rows = rows.filter(row => {
                    const cell = getFilterCellValue(row, col);
                    return selectedSet.has(cell);
                });
            }
        });

        // 1.6 Date Range Filter
        if (dateFilter.col && (dateFilter.from || dateFilter.to)) {
            rows = rows.filter(row => {
                const raw = normalizeDateOnly(getFilterCellValue(row, dateFilter.col));
                if (!raw) return false;
                if (dateFilter.from && raw < dateFilter.from) return false;
                if (dateFilter.to && raw > dateFilter.to) return false;
                return true;
            });
        }

        if (storageOnly) {
            rows = rows.filter(row => getFilterCellValue(row, '보관소').includes('자체보관'));
        }

        if (unshippedOnly) {
            rows = rows.filter(row => {
                const containerNo = getRowContainerNo(row);
                return isShippingUnshippedCandidate(data?.headers || [], row, containerLookupResults[containerNo]);
            });
        }

        // 2. Sorting (User clicked column)
        if (sortConfig.key && !isServerSort) {
            rows.sort((a, b) => {
                return compareShippingFilterValues(
                    getFilterCellValue(a, sortConfig.key),
                    getFilterCellValue(b, sortConfig.key),
                    sortConfig.direction,
                );
            });
        } else {
            // Default Sort: AD, AE, AF values to top
            // Identify AD(29), AE(30), AF(31) roughly by headers like '선적확정모선' or directly by checking indices.
            const targetCols = [];
            data.headers.forEach((h, i) => {
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
    }, [data, searchTerm, sortConfig, columnFilters, dateFilter, storageOnly, unshippedOnly, getFilterCellValue, getRowContainerNo, containerLookupResults]);

    const shouldLoadFullRowsForFilters = Boolean(
        data?.source === 'supabase'
        && Number(data?.total || 0) > (data?.data?.length || 0)
        && (data?.data?.length || 0) < Math.min(Number(data?.total || 0), FULL_FILTER_PAGE_SIZE)
        && (
            filterDropdown
            || Object.keys(columnFilters).length > 0
            || Boolean(dateFilter.col && (dateFilter.from || dateFilter.to))
            || storageOnly
            || unshippedOnly
        )
    );

    useEffect(() => {
        if (!shouldLoadFullRowsForFilters || !selectedPath) return;
        fetchData(selectedPath, {
            page: 1,
            pageSize: FULL_FILTER_PAGE_SIZE,
            search: searchTerm,
            quiet: true,
            ...serverSortParams
        });
    }, [shouldLoadFullRowsForFilters, selectedPath, searchTerm, serverSortParams, fetchData]);

    useEffect(() => {
        setTableScrollTop(0);
        if (tableWrapRef.current) tableWrapRef.current.scrollTop = 0;
    }, [searchTerm, sortConfig, columnFilters, dateFilter, storageOnly, unshippedOnly]);

    if (loading) return <div className={styles.loading}>데이터를 불러오는 중입니다...</div>;
    if (!data || !data.data) return <div className={styles.loading}>데이터가 없습니다.</div>;

    const fileTimeStr = data.file_modified_at ? new Date(data.file_modified_at).toLocaleString() : '';
    const dbSyncedTimeStr = data.synced_at ? new Date(data.synced_at).toLocaleString() : '';
    const searchPending = searchInput !== searchTerm;
    const hasSearchQuery = Boolean(searchInput.trim() || searchTerm.trim());
    const shouldShowSearchRefreshing = Boolean(showSearchRefreshing && hasSearchQuery);
    const searchStatusText = searchPending ? '입력 대기' : (shouldShowSearchRefreshing ? '검색 중' : '');

    const totalRows = processedData.length;
    const serverTotalRows = data.source === 'supabase' ? Number(data.total || data.data.length || 0) : totalRows;
    const loadedRows = data.source === 'supabase' ? data.data.length : totalRows;
    const canLoadMore = data.source === 'supabase' && loadedRows < serverTotalRows;
    const loadNextPage = () => {
        if (!canLoadMore || loadingMore || autoLoadMoreRef.current) return;
        autoLoadMoreRef.current = true;
        fetchData(selectedPath, {
            page: Number(data.page || 1) + 1,
            search: searchTerm,
            append: true,
            ...serverSortParams
        }).finally(() => {
            autoLoadMoreRef.current = false;
        });
    };
    const handleTableScroll = (e) => {
        const target = e.currentTarget;
        setTableScrollTop(target.scrollTop);
        const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
        if (remaining < ROW_HEIGHT * 10) {
            loadNextPage();
        }
    };
    const {
        visibleStart,
        visibleEnd,
        topSpacerHeight,
        bottomSpacerHeight,
    } = getShippingVirtualWindow({
        scrollTop: tableScrollTop,
        rowHeight: ROW_HEIGHT,
        viewportHeight: tableViewportHeight,
        totalRows,
        overscan: VIRTUAL_OVERSCAN,
    });
    const visibleRows = processedData.slice(visibleStart, visibleEnd);
    const tableIsRefreshing = Boolean(searchRefreshing || loadingMore || shouldLoadFullRowsForFilters);

    // Extract unique values for the currently opened dropdown
    const getUniqueValues = (col) => {
        if (!data || !data.data) return [];
        
        // Filter rows based on OTHER column filters first (to cascade filters)
        let rows = [...data.data];
        if (data.source !== 'supabase' && searchTerm.trim()) {
            const terms = searchTerm.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            if (terms.length > 0) {
                rows = rows.filter(row => terms.some(t => row.some(cell => String(cell || '').toLowerCase().includes(t))));
            }
        }
        Object.entries(columnFilters).forEach(([c, selectedSet]) => {
            if (c !== col && selectedSet && selectedSet.size > 0) {
                rows = rows.filter(row => {
                    const cell = getFilterCellValue(row, c);
                    return selectedSet.has(cell);
                });
            }
        });

        const unique = new Set();
        rows.forEach(row => unique.add(getFilterCellValue(row, col)));
        return Array.from(unique).sort((a, b) => compareShippingFilterValues(a, b, 'asc'));
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
                <div className={styles.topSummaryRow}>
                    <div className={styles.leftControls}>
                        <h2 className={styles.title}>선적관리 리스트</h2>
                        {fileTimeStr && (
                            <div className={styles.fileMod}>
                                저장: {fileTimeStr} <span className={styles.elapsedBadge}>{elapsed}</span>
                                {data.source === 'supabase' && (
                                    <span className={styles.dataMeta}>
                                        DB {loadedRows.toLocaleString()} / {serverTotalRows.toLocaleString()}행
                                    </span>
                                )}
                                {dbSyncedTimeStr && (
                                    <span className={styles.syncMeta}>
                                        DB수정 {dbSyncedTimeStr}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <div className={styles.rightControls}>
                    <div className={styles.searchRow}>
                        <input
                            type="text"
                            placeholder="전체 검색 (콤마 구분)"
                            className={styles.searchInput}
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            onCompositionStart={() => setIsComposingSearch(true)}
                            onCompositionEnd={e => {
                                setIsComposingSearch(false);
                                setSearchInput(e.currentTarget.value);
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') setSearchTerm(searchInput);
                            }}
                        />
                        <span className={`${styles.searchStatus} ${searchStatusText ? '' : styles.searchStatusHidden}`}>
                            {searchStatusText || '검색 중'}
                        </span>
                    </div>
                    <div className={styles.actionRow}>
                        <div className={styles.actionGroup}>
                            <button className={styles.resetBtn} onClick={() => savePreset(1)} title="현재 보이는 컬럼과 정렬 순서를 프리셋 1에 저장합니다">💾 P1 저장</button>
                            <button className={styles.resetBtn} onClick={() => loadPreset(1)} title="프리셋 1을 불러옵니다">📂 P1 로드</button>
                            <button className={styles.resetBtn} onClick={() => savePreset(2)} title="현재 보이는 컬럼과 정렬 순서를 프리셋 2에 저장합니다">💾 P2 저장</button>
                            <button className={styles.resetBtn} onClick={() => loadPreset(2)} title="프리셋 2를 불러옵니다">📂 P2 로드</button>
                            <button className={styles.resetBtn} onClick={exportToExcel}>📥 엑셀</button>
                        </div>
                        <div className={`${styles.actionGroup} ${styles.primaryActions}`}>
                            <button className={styles.dangerBtn} onClick={resetLayout}>↺ 정렬 초기화</button>
                            <button className={styles.resetBtn} onClick={() => setShowSettings(true)}>⚙️ 설정</button>
                            <button className={styles.syncBtn} onClick={handleSync} disabled={syncing}>
                                {syncing ? '⏳ 동기화' : '🚀 NAS 동기화'}
                            </button>
                            <button
                                className={styles.lookupBtn}
                                onClick={handleContainerLookup}
                                disabled={containerLookupRunning}
                                title="현재 검색/필터 결과에 남아있는 컨테이너를 모두 이력조회합니다"
                            >
                                {containerLookupRunning ? '조회 중' : '컨테이너 조회'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {containerLookupStatus && (
                <div className={styles.lookupStatus}>
                    <span>{containerLookupStatus}</span>
                    {containerLookupProgress && (
                        <span className={styles.lookupStatusCounts}>
                            <span>컨테이너 조회건수 {containerLookupProgress.total.toLocaleString()}건</span>
                            <span>조회완료 {containerLookupProgress.completed.toLocaleString()}건</span>
                            <span className={containerLookupProgress.failed > 0 ? styles.lookupStatusFailed : ''}>
                                조회실패 {containerLookupProgress.failed.toLocaleString()}건
                            </span>
                        </span>
                    )}
                </div>
            )}

            <div
                className={`${styles.hiddenColsZone} ${isDragOverHidden ? styles.hiddenColsZoneActive : ''}`}
                title="숨긴 컬럼입니다. 칩을 클릭하거나 표로 드래그하면 다시 표시됩니다. 표 헤더를 이 영역으로 드래그하면 숨길 수 있습니다."
                aria-label="숨긴 컬럼 영역"
                onDragOver={(e) => { e.preventDefault(); setIsDragOverHidden(true); }}
                onDragLeave={() => setIsDragOverHidden(false)}
                onDrop={handleDropToHidden}
            >
                <span className={styles.hiddenColsHint}>
                    숨김
                </span>
                {hiddenColumnList.map(col => (
                    <button
                        key={col}
                        draggable
                        onDragStart={(e) => handleDragStart(e, col)}
                        onClick={() => handleRestoreCol(col)}
                        title={`표로 복구: ${col}`}
                        className={`${styles.hiddenChip} ${isContainerLookupColumn(col) ? styles.hiddenLookupChip : ''}`}
                    >
                        {getHiddenChipLabel(col)}
                    </button>
                ))}
            </div>

            {/* Date Range Filter */}
            {dateColumns.length > 0 && (
                <div className={styles.dateFilterZone}>
                    <span className={styles.dateFilterLabel}>📅 날짜 필터</span>
                    <select
                        value={dateFilter.col}
                        onChange={e => setDateFilter(p => ({ ...p, col: e.target.value }))}
                        className={styles.dateSelect}
                    >
                        <option value="">컬럼 선택</option>
                        {dateColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="date" value={dateFilter.from} onChange={e => setDateFilter(p => ({ ...p, from: e.target.value }))} className={styles.dateInput} />
                    <span className={styles.dateSeparator}>~</span>
                    <input type="date" value={dateFilter.to} onChange={e => setDateFilter(p => ({ ...p, to: e.target.value }))} className={styles.dateInput} />
                    {(dateFilter.from || dateFilter.to) && (
                        <button onClick={() => setDateFilter({ col: '', from: '', to: '' })} className={styles.dateClearBtn}>초기화</button>
                    )}
                    <button
                        type="button"
                        className={`${styles.quickFilterBtn} ${unshippedOnly ? styles.quickFilterBtnActive : ''}`}
                        onClick={() => setUnshippedOnly(prev => !prev)}
                        title="이력 데이터가 없거나, 작업일 포함 이후 MOVE TIME이 있고 이력구분이 반입/적하가 아닌 행만 표시합니다"
                    >
                        {unshippedOnly ? '필터해제' : '미선적'}
                    </button>
                    <button
                        type="button"
                        className={`${styles.quickFilterBtn} ${storageOnly ? styles.quickFilterBtnActive : ''}`}
                        onClick={() => setStorageOnly(prev => !prev)}
                        title="보관소가 자체보관인 행만 표시합니다"
                    >
                        {storageOnly ? '필터해제' : '자체보관'}
                    </button>
                    <span className={styles.resultCountText} title="현재 검색/필터 적용 후 화면 조회 건수">
                        전체 {serverTotalRows.toLocaleString()}건 / 조회 {totalRows.toLocaleString()}건
                    </span>
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

            <div
                className={styles.tableWrap}
                ref={tableWrapRef}
                onScroll={handleTableScroll}
            >
                <table className={styles.table}>
                    <thead>
                        <tr>
                            {orderedVisibleColumns.map(col => {
                                const isDragOver = dragOverCol === col;
                                return (
                                    <th 
                                        key={col}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, col)}
                                        onDragOver={(e) => handleDragOver(e, col)}
                                        onDrop={(e) => handleDrop(e, col)}
                                        className={`${isDragOver ? styles.dragOver : ''} ${isContainerLookupColumn(col) ? styles.lookupHeader : ''}`}
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
                                                style={{ position: 'absolute', top: '100%', left: orderedVisibleColumns.indexOf(col) < 2 ? 0 : 'auto', right: orderedVisibleColumns.indexOf(col) < 2 ? 'auto' : 0, zIndex: 100, background: 'white', border: '1px solid #cbd5e1', borderRadius: '4px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '8px', minWidth: '150px', maxHeight: '300px', display: 'flex', flexDirection: 'column' }}
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
                        {topSpacerHeight > 0 && (
                            <tr className={styles.virtualSpacer} aria-hidden="true">
                                <td colSpan={Math.max(orderedVisibleColumns.length, 1)} style={{ height: topSpacerHeight }} />
                            </tr>
                        )}
                        {visibleRows.map((row, vi) => {
                            const ri = visibleStart + vi;
                            const containerNo = getRowContainerNo(row);
                            const signalTone = getShippingSignalTone(data?.headers || [], row, containerLookupResults[containerNo]);
                            const rowToneClass = signalTone === 'completed' ? styles.completedRow : '';
                            return (
                            <tr key={ri} className={`${ri % 2 === 0 ? styles.evenRow : styles.oddRow} ${rowToneClass}`}>
                                {orderedVisibleColumns.map(col => {
                                    const raw = getDisplayCellRawValue(row, col);
                                    const val = formatCellValue(raw, col);
                                    return <td key={col} className={isContainerLookupColumn(col) ? styles.lookupCell : ''}>{val}</td>;
                                })}
                            </tr>
                            );
                        })}
                        {visibleRows.length === 0 && (
                            <tr>
                                <td className={styles.tableMessageCell} colSpan={Math.max(orderedVisibleColumns.length, 1)}>
                                    {tableIsRefreshing ? '자료 조회중...' : '조건에 맞는 자료가 없습니다.'}
                                </td>
                            </tr>
                        )}
                        {bottomSpacerHeight > 0 && (
                            <tr className={styles.virtualSpacer} aria-hidden="true">
                                <td colSpan={Math.max(orderedVisibleColumns.length, 1)} style={{ height: bottomSpacerHeight }} />
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {data.source === 'supabase' && (
                <div className={styles.pageBar}>
                    <span>{loadedRows.toLocaleString()} / {serverTotalRows.toLocaleString()}행</span>
                    <button
                        className={styles.loadMoreBtn}
                        onClick={loadNextPage}
                        disabled={!canLoadMore || loadingMore}
                    >
                        {loadingMore ? '불러오는 중' : canLoadMore ? '더 보기' : '전체 로드됨'}
                    </button>
                </div>
            )}

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
