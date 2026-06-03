'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    CONTAINER_LOOKUP_DISPLAY_COLUMNS,
    extractUniqueContainerNos,
    getContainerLookupValue,
    isContainerLookupColumn,
    orderContainerLookupTargets,
} from '@/utils/containerHistoryResults.mjs';
import {
    mergePendingContainerLookupResults,
    normalizeDateOnly,
    reconcileShippingLayoutPrefs,
} from '@/utils/asanShippingView.mjs';
import styles from './dispatch.module.css';

const TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH = '/아산지점/2026_수출리스트.xlsx';
const ALL_RECORD_KEY = '__all__';
const ALL_PAGE_SIZE = 100;
const PREF_PAGE_KEY = 'asan_transport_history_preset';
const DEFAULT_SORT = { key: null, direction: 'asc' };
const LOOKUP_HEADERS = CONTAINER_LOOKUP_DISPLAY_COLUMNS.map(column => column.header);
const CONTAINER_RESULTS_CHUNK_SIZE = 150;
const LOOKUP_POLL_MS = 4000;

function recordKey(record = {}) {
    return `${record.target_month || ''}::${record.sheet_name || ''}`;
}

function recordYear(record = {}) {
    const match = String(record.target_month || '').match(/^(\d{4})/);
    return match ? match[1] : '';
}

function formatMonthLabel(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})/);
    if (!match) return value || '-';
    return `${Number(match[2])}월`;
}

function formatCount(value) {
    return `${Number(value || 0).toLocaleString('ko-KR')}건`;
}

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function normalizeColumnOrder(order = [], headers = []) {
    const current = new Set(headers);
    const ordered = (order || []).filter(header => current.has(header));
    headers.forEach(header => {
        if (!ordered.includes(header)) ordered.push(header);
    });
    return ordered;
}

function getHiddenChipLabel(column) {
    return isContainerLookupColumn(column) ? String(column).replace(/^이력\s*/, '') : column;
}

function isDateHeader(column) {
    const text = String(column || '').replace(/\s+/g, '').toLowerCase();
    return (
        text.includes('date')
        || text.includes('날짜')
        || text.includes('일자')
        || (text.includes('작업') && text.includes('일'))
        || (text.includes('픽업') && text.includes('일'))
        || (text.includes('청구') && text.includes('일'))
    );
}

function normalizeFilterValue(value) {
    const text = String(value ?? '').trim();
    return text || '(빈 값)';
}

function compareCellValues(a, b, direction = 'asc') {
    const sign = direction === 'desc' ? -1 : 1;
    const left = String(a ?? '').trim();
    const right = String(b ?? '').trim();
    const leftNumber = Number(left.replace(/,/g, ''));
    const rightNumber = Number(right.replace(/,/g, ''));
    if (left && right && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return (leftNumber - rightNumber) * sign;
    }
    return left.localeCompare(right, 'ko-KR', { numeric: true }) * sign;
}

function serializeColumnFilters(filters = {}) {
    return Object.fromEntries(
        Object.entries(filters).map(([key, value]) => [key, Array.from(value || [])])
    );
}

function restoreColumnFilters(filters = {}, headers = []) {
    const current = new Set(headers);
    return Object.fromEntries(
        Object.entries(filters || {})
            .filter(([key]) => current.has(key))
            .map(([key, values]) => [key, new Set(values || [])])
    );
}

function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export default function AsanTransportHistory() {
    const [metaRecords, setMetaRecords] = useState([]);
    const [activeKey, setActiveKey] = useState(ALL_RECORD_KEY);
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
    const [activeRecord, setActiveRecord] = useState(null);
    const [loadingMeta, setLoadingMeta] = useState(false);
    const [loadingTable, setLoadingTable] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState(null);
    const [search, setSearch] = useState('');
    const [sortConfig, setSortConfig] = useState(DEFAULT_SORT);
    const [columnFilters, setColumnFilters] = useState({});
    const [dateFilter, setDateFilter] = useState({ col: '', day: '' });
    const [filterDropdown, setFilterDropdown] = useState(null);
    const [hiddenCols, setHiddenCols] = useState(new Set());
    const [colOrder, setColOrder] = useState([]);
    const [draggedCol, setDraggedCol] = useState(null);
    const [dragOverCol, setDragOverCol] = useState(null);
    const [isDragOverHidden, setIsDragOverHidden] = useState(false);
    const [settings, setSettings] = useState({ transport_history_path: TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH });
    const [draftPath, setDraftPath] = useState(TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH);
    const [showSettings, setShowSettings] = useState(false);
    const [showBrowser, setShowBrowser] = useState(false);
    const [browserPath, setBrowserPath] = useState('/아산지점');
    const [browserFiles, setBrowserFiles] = useState([]);
    const [browserLoading, setBrowserLoading] = useState(false);
    const [containerLookupResults, setContainerLookupResults] = useState({});
    const [containerLookupRunning, setContainerLookupRunning] = useState(false);
    const [containerLookupStopping, setContainerLookupStopping] = useState(false);
    const [containerLookupStatus, setContainerLookupStatus] = useState('');
    const [containerLookupProgress, setContainerLookupProgress] = useState(null);
    const [containerLookupErrorSummary, setContainerLookupErrorSummary] = useState(null);
    const containerLookupResultsRef = useRef({});
    const containerLookupJobIdRef = useRef('');
    const containerLookupStoppedRef = useRef(false);

    const isAllView = activeKey === ALL_RECORD_KEY;
    const transportHistoryPath = settings.transport_history_path || TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH;

    const loadSettings = useCallback(async () => {
        try {
            const response = await fetch('/api/branches/asan/settings', { cache: 'no-store' });
            const json = await response.json();
            if (!response.ok || json.error) throw new Error(json.error || '설정 조회 실패');
            const next = {
                ...(json.data || {}),
                transport_history_path: json.data?.transport_history_path || TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH,
            };
            setSettings(next);
            setDraftPath(next.transport_history_path);
        } catch (error) {
            setSyncStatus({ message: error.message || '설정 조회 실패', isError: true });
        }
    }, []);

    const loadRecord = useCallback(async (record) => {
        if (!record?.target_month) {
            setActiveRecord(null);
            return;
        }
        setLoadingTable(true);
        try {
            const params = new URLSearchParams({
                mode: 'date',
                month: String(record.target_month).slice(0, 7),
                sheet: record.sheet_name || '',
                t: String(Date.now()),
            });
            const response = await fetch(`/api/branches/asan/transport-history?${params.toString()}`, { cache: 'no-store' });
            const json = await response.json();
            if (!response.ok || json.error) throw new Error(json.error || '운송내역 조회 실패');
            setActiveRecord((json.data || [])[0] || record);
        } catch (error) {
            setSyncStatus({ message: error.message || '운송내역 조회 실패', isError: true });
        } finally {
            setLoadingTable(false);
        }
    }, []);

    const loadAllRows = useCallback(async ({ reset = true, offset = 0 } = {}) => {
        if (!selectedYear) return;
        if (reset) setLoadingTable(true);
        else setLoadingMore(true);
        try {
            const params = new URLSearchParams({
                mode: 'rows',
                year: selectedYear,
                limit: String(ALL_PAGE_SIZE),
                offset: String(offset),
                t: String(Date.now()),
            });
            if (search.trim()) params.set('search', search.trim());
            if (dateFilter.day) params.set('date', dateFilter.day);
            if (dateFilter.col) params.set('date_col', dateFilter.col);
            if (sortConfig.key && !isContainerLookupColumn(sortConfig.key)) {
                params.set('sort', sortConfig.key);
                params.set('direction', sortConfig.direction || 'asc');
            }
            const response = await fetch(`/api/branches/asan/transport-history?${params.toString()}`, { cache: 'no-store' });
            const json = await response.json();
            if (!response.ok || json.error) throw new Error(json.error || '전체 운송내역 조회 실패');
            const next = (json.data || [])[0] || {
                target_month: `${selectedYear}-01-01`,
                sheet_name: '전체',
                headers: [],
                data: [],
                row_count: 0,
                valid_row_count: 0,
                total: 0,
                has_more: false,
            };
            setActiveRecord(prev => {
                if (reset || !prev || activeKey !== ALL_RECORD_KEY) return next;
                return {
                    ...next,
                    data: [...(prev.data || []), ...(next.data || [])],
                };
            });
        } catch (error) {
            setSyncStatus({ message: error.message || '전체 운송내역 조회 실패', isError: true });
        } finally {
            if (reset) setLoadingTable(false);
            else setLoadingMore(false);
        }
    }, [activeKey, dateFilter.col, dateFilter.day, search, selectedYear, sortConfig.direction, sortConfig.key]);

    const loadMeta = useCallback(async ({ keepActive = true } = {}) => {
        setLoadingMeta(true);
        try {
            const response = await fetch(`/api/branches/asan/transport-history?mode=meta&t=${Date.now()}`, { cache: 'no-store' });
            const json = await response.json();
            if (!response.ok || json.error) throw new Error(json.error || '운송내역 메타 조회 실패');
            const records = json.data || [];
            setMetaRecords(records);
            const years = Array.from(new Set(records.map(recordYear).filter(Boolean))).sort();
            setSelectedYear(prev => years.includes(prev) ? prev : (years.at(-1) || String(new Date().getFullYear())));
            if (!keepActive || activeKey === ALL_RECORD_KEY) {
                setActiveKey(ALL_RECORD_KEY);
                return;
            }
            const current = records.find(record => recordKey(record) === activeKey);
            if (current) await loadRecord(current);
            else setActiveKey(ALL_RECORD_KEY);
        } catch (error) {
            setSyncStatus({ message: error.message || '운송내역 메타 조회 실패', isError: true });
        } finally {
            setLoadingMeta(false);
        }
    }, [activeKey, loadRecord]);

    const loadSyncStatus = useCallback(async () => {
        try {
            const response = await fetch(`/api/branches/asan/transport-history/sync?t=${Date.now()}`, { cache: 'no-store' });
            const json = await response.json();
            if (!response.ok || json.error) throw new Error(json.error || '동기화 상태 조회 실패');
            const status = json.status || {};
            setSyncing(Boolean(status.running));
            if (status.message) {
                setSyncStatus({ message: status.message, isError: status.ok === false });
            }
            if (status.quick_done) {
                await loadMeta({ keepActive: true });
            }
        } catch (error) {
            setSyncStatus({ message: error.message || '동기화 상태 조회 실패', isError: true });
        }
    }, [loadMeta]);

    useEffect(() => {
        loadSettings();
        loadMeta({ keepActive: false });
        loadSyncStatus();
    }, [loadSettings]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!syncing) return undefined;
        const timer = window.setInterval(loadSyncStatus, 2200);
        return () => window.clearInterval(timer);
    }, [loadSyncStatus, syncing]);

    useEffect(() => {
        if (activeKey !== ALL_RECORD_KEY) return undefined;
        const timer = window.setTimeout(() => {
            loadAllRows({ reset: true, offset: 0 });
        }, 250);
        return () => window.clearTimeout(timer);
    }, [activeKey, loadAllRows]);

    const selectAll = () => {
        if (activeKey === ALL_RECORD_KEY) {
            loadAllRows({ reset: true, offset: 0 });
            return;
        }
        setActiveKey(ALL_RECORD_KEY);
    };

    const selectRecord = async (record) => {
        setActiveKey(recordKey(record));
        await loadRecord(record);
    };

    const syncNow = async () => {
        setSyncing(true);
        setSyncStatus({ message: '운송내역 NAS 동기화 요청 중...', isError: false });
        try {
            const response = await fetch('/api/branches/asan/transport-history/sync', {
                method: 'POST',
                cache: 'no-store',
            });
            const json = await response.json();
            if (!response.ok || json.error || json.ok === false) throw new Error(json.error || json.message || 'NAS 동기화 실패');
            setSyncStatus({ message: json.message || '운송내역 NAS 동기화를 시작했습니다.', isError: false });
            await loadSyncStatus();
        } catch (error) {
            setSyncing(false);
            setSyncStatus({ message: error.message || 'NAS 동기화 실패', isError: true });
        }
    };

    const saveSettings = async () => {
        try {
            const response = await fetch('/api/branches/asan/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transport_history_path: draftPath || TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH }),
            });
            const json = await response.json();
            if (!response.ok || json.error) throw new Error(json.error || '설정 저장 실패');
            const next = {
                ...(json.data || {}),
                transport_history_path: json.data?.transport_history_path || TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH,
            };
            setSettings(next);
            setDraftPath(next.transport_history_path);
            setShowSettings(false);
            setSyncStatus({
                message: json.data?.transport_history_path_unpersisted
                    ? '운송내역 경로를 화면에 반영했습니다. DB 컬럼 적용 후 영구 저장됩니다.'
                    : '운송내역 파일 설정을 저장했습니다.',
                isError: false,
            });
        } catch (error) {
            setSyncStatus({ message: error.message || '설정 저장 실패', isError: true });
        }
    };

    const loadNasFolder = async (path) => {
        setBrowserLoading(true);
        try {
            const response = await fetch(`/api/nas/files?path=${encodeURIComponent(path)}`, { cache: 'no-store' });
            const json = await response.json();
            if (!response.ok || json.error) throw new Error(json.error || 'NAS 폴더 조회 실패');
            setBrowserFiles(json.files || []);
            setBrowserPath(path);
        } catch (error) {
            setSyncStatus({ message: error.message || 'NAS 폴더 조회 실패', isError: true });
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
            return;
        }
        if (/\.xls[mx]?$/i.test(file.name || '')) {
            setDraftPath(file.path);
            setShowBrowser(false);
            setShowSettings(true);
        }
    };

    const headers = activeRecord?.headers || [];
    const rows = activeRecord?.data || [];
    const allHeaders = useMemo(() => (
        [...headers, ...LOOKUP_HEADERS.filter(header => !headers.includes(header))]
    ), [headers]);
    const yearOptions = useMemo(() => {
        const years = Array.from(new Set(metaRecords.map(recordYear).filter(Boolean))).sort();
        return years.length ? years : [selectedYear];
    }, [metaRecords, selectedYear]);
    const selectedYearRecords = useMemo(() => (
        metaRecords.filter(record => recordYear(record) === selectedYear)
    ), [metaRecords, selectedYear]);
    const selectedYearTotal = useMemo(() => (
        selectedYearRecords.reduce((sum, record) => sum + Number(record.valid_row_count || record.row_count || 0), 0)
    ), [selectedYearRecords]);

    useEffect(() => {
        setColOrder(prev => normalizeColumnOrder(prev, allHeaders));
        setHiddenCols(prev => new Set(Array.from(prev).filter(header => allHeaders.includes(header))));
        setColumnFilters(prev => restoreColumnFilters(serializeColumnFilters(prev), allHeaders));
    }, [allHeaders]);

    const dateColumns = useMemo(() => (
        headers.filter(isDateHeader)
    ), [headers]);

    useEffect(() => {
        if (!headers.length) return;
        setDateFilter(prev => {
            if (prev.col && headers.includes(prev.col)) return prev;
            return { ...prev, col: dateColumns[0] || '' };
        });
    }, [dateColumns, headers]);

    useEffect(() => {
        containerLookupResultsRef.current = containerLookupResults;
    }, [containerLookupResults]);

    const getRowContainerNo = useCallback((row) => {
        return extractUniqueContainerNos(headers, [row])[0] || '';
    }, [headers]);

    const getCellValue = useCallback((row, column) => {
        if (isContainerLookupColumn(column)) {
            const containerNo = getRowContainerNo(row);
            return getContainerLookupValue(containerLookupResults[containerNo], column);
        }
        const index = headers.indexOf(column);
        return index >= 0 ? row[index] : '';
    }, [containerLookupResults, getRowContainerNo, headers]);

    const processedRows = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        let nextRows = [...rows];
        if (!isAllView && dateFilter.day) {
            const dateColumn = dateFilter.col || dateColumns[0] || '';
            if (dateColumn) {
                nextRows = nextRows.filter(row => normalizeDateOnly(getCellValue(row, dateColumn)) === dateFilter.day);
            }
        }
        if (!isAllView && keyword) {
            const terms = keyword.split(',').map(term => term.trim()).filter(Boolean);
            nextRows = nextRows.filter(row => terms.some(term => (
                allHeaders.some(header => String(getCellValue(row, header) || '').toLowerCase().includes(term))
            )));
        }
        Object.entries(columnFilters).forEach(([column, selectedSet]) => {
            if (!selectedSet?.size) return;
            nextRows = nextRows.filter(row => selectedSet.has(normalizeFilterValue(getCellValue(row, column))));
        });
        if (sortConfig.key && (!isAllView || isContainerLookupColumn(sortConfig.key))) {
            nextRows.sort((a, b) => compareCellValues(
                getCellValue(a, sortConfig.key),
                getCellValue(b, sortConfig.key),
                sortConfig.direction,
            ));
        }
        return nextRows;
    }, [allHeaders, columnFilters, dateColumns, dateFilter.col, dateFilter.day, getCellValue, isAllView, rows, search, sortConfig.direction, sortConfig.key]);

    const visibleHeaders = useMemo(() => (
        normalizeColumnOrder(colOrder, allHeaders).filter(header => !hiddenCols.has(header))
    ), [allHeaders, colOrder, hiddenCols]);
    const hiddenColumnList = useMemo(() => {
        const columns = Array.from(hiddenCols).filter(header => allHeaders.includes(header));
        return [
            ...columns.filter(header => !isContainerLookupColumn(header)),
            ...columns.filter(header => isContainerLookupColumn(header)),
        ];
    }, [allHeaders, hiddenCols]);

    const handleSort = (column) => {
        setSortConfig(prev => {
            const direction = prev.key === column && prev.direction === 'asc' ? 'desc' : 'asc';
            return { key: column, direction };
        });
    };

    const handleDragStart = (event, column) => {
        setDraggedCol(column);
        event.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (event, column) => {
        event.preventDefault();
        setDragOverCol(column);
    };

    const handleDrop = (event, targetColumn) => {
        event.preventDefault();
        setDragOverCol(null);
        if (!draggedCol || draggedCol === targetColumn) {
            setDraggedCol(null);
            return;
        }
        setColOrder(prev => {
            const next = normalizeColumnOrder(prev, allHeaders).filter(column => column !== draggedCol);
            const targetIndex = Math.max(0, next.indexOf(targetColumn));
            next.splice(targetIndex, 0, draggedCol);
            return normalizeColumnOrder(next, allHeaders);
        });
        setHiddenCols(prev => {
            const next = new Set(prev);
            next.delete(draggedCol);
            return next;
        });
        setDraggedCol(null);
    };

    const handleDropToHidden = (event) => {
        event.preventDefault();
        setIsDragOverHidden(false);
        if (draggedCol && allHeaders.includes(draggedCol)) {
            setHiddenCols(prev => new Set(prev).add(draggedCol));
        }
        setDraggedCol(null);
    };

    const handleRestoreColumn = (column) => {
        setHiddenCols(prev => {
            const next = new Set(prev);
            next.delete(column);
            return next;
        });
        setColOrder(prev => normalizeColumnOrder([...prev, column], allHeaders));
    };

    const getUniqueValues = (column) => {
        let sourceRows = [...rows];
        Object.entries(columnFilters).forEach(([filterColumn, selectedSet]) => {
            if (filterColumn === column || !selectedSet?.size) return;
            sourceRows = sourceRows.filter(row => selectedSet.has(normalizeFilterValue(getCellValue(row, filterColumn))));
        });
        return Array.from(new Set(sourceRows.map(row => normalizeFilterValue(getCellValue(row, column)))))
            .sort((a, b) => compareCellValues(a, b, 'asc'));
    };

    const toggleFilterValue = (column, value) => {
        setColumnFilters(prev => {
            const next = { ...prev };
            const values = new Set(next[column] || []);
            if (values.has(value)) values.delete(value);
            else values.add(value);
            if (values.size) next[column] = values;
            else delete next[column];
            return next;
        });
    };

    const clearFilter = (column) => {
        setColumnFilters(prev => {
            const next = { ...prev };
            delete next[column];
            return next;
        });
    };

    const selectAllFilter = (column, values) => {
        setColumnFilters(prev => ({ ...prev, [column]: new Set(values) }));
    };

    const resetLayout = () => {
        setColOrder(normalizeColumnOrder(allHeaders, allHeaders));
        setHiddenCols(new Set());
        setColumnFilters({});
        setSortConfig(DEFAULT_SORT);
        setFilterDropdown(null);
    };

    const savePreset = async (num) => {
        const settingsPayload = {
            colOrder: normalizeColumnOrder(colOrder, allHeaders),
            hiddenCols: Array.from(hiddenCols),
            sortConfig,
            sourceHeaders: allHeaders,
        };
        try {
            const response = await fetch('/api/user/prefs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_key: `${PREF_PAGE_KEY}_${num}`, settings: settingsPayload }),
            });
            if (!response.ok) throw new Error('저장 실패');
            setSyncStatus({ message: `운송내역 P${num} 저장 완료`, isError: false });
            alert(`프리셋 ${num}번 저장 완료!`);
        } catch (error) {
            setSyncStatus({ message: error.message || '프리셋 저장 실패', isError: true });
            alert(error.message || '저장 실패');
        }
    };

    const loadPreset = async (num) => {
        try {
            const response = await fetch(`/api/user/prefs?page_key=${PREF_PAGE_KEY}_${num}`, { cache: 'no-store' });
            const json = await response.json();
            if (!response.ok || json.error) throw new Error(json.error || '로드 실패');
            const prefs = json.data || {};
            if (!prefs.colOrder) throw new Error(`저장된 P${num} 프리셋이 없습니다.`);
            let finalOrder = prefs.colOrder;
            let finalHidden = new Set((prefs.hiddenCols || []).filter(header => allHeaders.includes(header)));
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
            setColOrder(normalizeColumnOrder(finalOrder, allHeaders));
            setHiddenCols(finalHidden);
            setSortConfig(prefs.sortConfig || DEFAULT_SORT);
            setSyncStatus({ message: `운송내역 P${num} 로드 완료`, isError: false });
            alert(`프리셋 ${num}번 로드 완료!`);
        } catch (error) {
            setSyncStatus({ message: error.message || '프리셋 로드 실패', isError: true });
            alert(error.message || '로드 실패');
        }
    };

    const fetchSavedContainerLookupResults = useCallback(async (containers) => {
        const resultMap = {};
        if (!transportHistoryPath || !containers?.length) return resultMap;
        for (let index = 0; index < containers.length; index += CONTAINER_RESULTS_CHUNK_SIZE) {
            const chunk = containers.slice(index, index + CONTAINER_RESULTS_CHUNK_SIZE);
            const params = new URLSearchParams({
                path: transportHistoryPath,
                containers: chunk.join(','),
            });
            const response = await fetch(`/api/branches/asan/shipping/container-results?${params.toString()}`, { cache: 'no-store' });
            const json = await response.json();
            if (json.data) Object.assign(resultMap, json.data);
        }
        return resultMap;
    }, [transportHistoryPath]);

    const loadSavedContainerLookupResults = useCallback(async (containers) => {
        const missingContainers = Array.from(new Set(containers || []))
            .filter(containerNo => containerNo && !containerLookupResultsRef.current?.[containerNo]?.mainRow);
        if (!missingContainers.length) return;
        try {
            const savedMap = await fetchSavedContainerLookupResults(missingContainers);
            if (Object.keys(savedMap).length > 0) {
                setContainerLookupResults(prev => {
                    const next = { ...prev, ...savedMap };
                    containerLookupResultsRef.current = next;
                    return next;
                });
            }
        } catch (error) {
            console.warn('운송내역 컨테이너 저장 이력 조회 실패:', error);
        }
    }, [fetchSavedContainerLookupResults]);

    const fetchContainerLookupJob = useCallback(async (jobId) => {
        const suffix = jobId ? `?id=${encodeURIComponent(jobId)}` : '';
        const response = await fetch(`/api/branches/asan/shipping/container-lookup/jobs${suffix}`, { cache: 'no-store' });
        if (!response.ok) return null;
        const json = await response.json();
        return json.job || null;
    }, []);

    const applyContainerLookupJob = useCallback(async (job, containers) => {
        if (!job) return false;
        const progress = {
            total: Number(job.total || containers.length),
            completed: Number(job.completed || 0),
            failed: Number(job.failed || 0),
            remaining: Math.max(0, Number(job.remaining ?? (Number(job.total || containers.length) - Number(job.completed || 0) - Number(job.failed || 0)))),
        };
        setContainerLookupProgress(progress);
        setContainerLookupErrorSummary(job.errorSummary || null);
        setContainerLookupStatus(job.status || '컨테이너 이력 조회 상태 확인 중');
        if (progress.completed > 0 || ['completed', 'failed', 'cancelled'].includes(job.state)) {
            await loadSavedContainerLookupResults(containers);
        }
        const done = ['completed', 'failed', 'cancelled'].includes(job.state)
            || (progress.total > 0 && progress.completed + progress.failed >= progress.total);
        if (done) {
            const status = progress.failed > 0
                ? `컨테이너 조회 종료: 완료 ${progress.completed.toLocaleString('ko-KR')}건, 실패 ${progress.failed.toLocaleString('ko-KR')}건`
                : `컨테이너 조회 완료: ${progress.completed.toLocaleString('ko-KR')}건`;
            setContainerLookupStatus(job.status || status);
            await loadSavedContainerLookupResults(containers);
        }
        return done;
    }, [loadSavedContainerLookupResults]);

    const handleStopContainerLookup = async () => {
        if ((!containerLookupRunning && !containerLookupJobIdRef.current) || containerLookupStopping) return;
        containerLookupStoppedRef.current = true;
        setContainerLookupStopping(true);
        setContainerLookupStatus('조회 중지 요청 중');
        try {
            if (containerLookupJobIdRef.current) {
                const response = await fetch('/api/branches/asan/shipping/container-lookup/jobs', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: containerLookupJobIdRef.current }),
                });
                if (!response.ok) {
                    const json = await response.json().catch(() => ({}));
                    throw new Error(json.error || `중지 요청 실패 (${response.status})`);
                }
            }
            setContainerLookupStatus('조회 중단됨. 지금까지 저장된 결과만 표시합니다.');
            setContainerLookupRunning(false);
        } catch (error) {
            setContainerLookupStatus(`조회 중지 요청 실패: ${error.message || error}`);
        } finally {
            setContainerLookupStopping(false);
        }
    };

    const handleContainerLookup = async () => {
        if (containerLookupRunning) return;
        const tableContainers = extractUniqueContainerNos(headers, processedRows);
        const containers = orderContainerLookupTargets(tableContainers, containerLookupResultsRef.current);
        if (!containers.length) {
            alert('현재 검색/필터 결과에서 조회할 컨테이너 번호가 없습니다.');
            return;
        }
        const missingLookupCount = containers.filter(containerNo => !containerLookupResultsRef.current?.[containerNo]?.mainRow).length;
        containerLookupStoppedRef.current = false;
        setContainerLookupRunning(true);
        setContainerLookupStopping(false);
        setContainerLookupErrorSummary(null);
        setContainerLookupProgress({ total: containers.length, completed: 0, failed: 0, remaining: containers.length });
        setContainerLookupStatus(`현재 조회 결과 ${processedRows.length.toLocaleString('ko-KR')}행 중 컨테이너 ${containers.length.toLocaleString('ko-KR')}건 조회 준비 중 (미조회 ${missingLookupCount.toLocaleString('ko-KR')}건 우선)`);
        setContainerLookupResults(prev => {
            const next = mergePendingContainerLookupResults(prev, containers);
            containerLookupResultsRef.current = next;
            return next;
        });
        try {
            const response = await fetch('/api/branches/asan/shipping/container-lookup/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: transportHistoryPath,
                    containers,
                    reserveSingle: false,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.ok || !payload.job) {
                throw new Error(payload.error || `백그라운드 조회 시작 실패 (${response.status})`);
            }
            const job = payload.job;
            containerLookupJobIdRef.current = job.id || '';
            await applyContainerLookupJob(job, containers);
            while (!containerLookupStoppedRef.current && containerLookupJobIdRef.current) {
                await new Promise(resolve => window.setTimeout(resolve, LOOKUP_POLL_MS));
                if (containerLookupStoppedRef.current) break;
                const nextJob = await fetchContainerLookupJob(containerLookupJobIdRef.current);
                if (!nextJob) {
                    setContainerLookupStatus('컨테이너 조회 상태 확인이 끊겼습니다. 저장된 결과만 표시합니다.');
                    break;
                }
                const done = await applyContainerLookupJob(nextJob, containers);
                if (done) break;
            }
        } catch (error) {
            const progress = { total: containers.length, completed: 0, failed: containers.length, remaining: 0 };
            setContainerLookupProgress(progress);
            setContainerLookupErrorSummary({
                total: containers.length,
                reasons: [{ reason: error.message || '백그라운드 조회 시작 실패', count: containers.length }],
                samples: [],
                message: `${error.message || '백그라운드 조회 시작 실패'} ${containers.length.toLocaleString('ko-KR')}건`,
            });
            setContainerLookupStatus(`오류: ${error.message || '컨테이너 조회 실패'}`);
            alert(error.message || '컨테이너 조회에 실패했습니다.');
        } finally {
            containerLookupJobIdRef.current = '';
            setContainerLookupStopping(false);
            setContainerLookupRunning(false);
        }
    };

    useEffect(() => {
        if (!headers.length || !rows.length) return undefined;
        const containers = extractUniqueContainerNos(headers, rows);
        const timer = window.setTimeout(() => {
            loadSavedContainerLookupResults(containers);
        }, 250);
        return () => window.clearTimeout(timer);
    }, [headers, loadSavedContainerLookupResults, rows]);

    const downloadCurrentSheet = async () => {
        if (!visibleHeaders.length) return;
        const XLSX = await import('xlsx');
        const worksheet = XLSX.utils.aoa_to_sheet([
            visibleHeaders,
            ...processedRows.map(row => visibleHeaders.map(header => getCellValue(row, header))),
        ]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, isAllView ? '전체' : (activeRecord?.sheet_name || '운송내역'));
        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const filename = isAllView
            ? `아산_운송내역_${selectedYear}_전체.xlsx`
            : `아산_운송내역_${formatMonthLabel(activeRecord?.target_month)}_${activeRecord?.sheet_name || '현재 선택 시트'}.xlsx`;
        triggerBlobDownload(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
    };

    const rowCount = isAllView ? Number(activeRecord?.total || activeRecord?.valid_row_count || 0) : (activeRecord?.valid_row_count ?? rows.length);
    const loadedCount = rows.length;
    const fileModifiedLabel = formatDateTime(activeRecord?.file_modified_at);

    return (
        <div className={styles.container}>
            <div className={styles.compactHeader}>
                <div className={styles.headerTitleArea}>
                    <h2 className={styles.pageTitle}>운송내역</h2>
                    <span className={styles.headerBadge}>
                        {isAllView ? `${selectedYear}년 전체` : formatMonthLabel(activeRecord?.target_month)}
                        {' · '}
                        {isAllView ? `${loadedCount.toLocaleString('ko-KR')} / ${rowCount.toLocaleString('ko-KR')}건` : formatCount(rowCount)}
                    </span>
                </div>
                <div className={styles.headerStatusArea}>
                    <div className={styles.statusInfo}>
                        <span className={styles.fileMod}>
                            <span className={styles.label}>파일</span>
                            <span className={styles.time}>{fileModifiedLabel}</span>
                        </span>
                        {syncStatus?.message && (
                            <span className={`${styles.syncMsg} ${syncStatus.isError ? styles.syncMsgError : ''}`}>
                                {syncStatus.message}
                            </span>
                        )}
                    </div>
                    <div className={styles.headerButtons}>
                        <button className={styles.headerBtn} onClick={downloadCurrentSheet} disabled={!visibleHeaders.length || loadingTable}>엑셀</button>
                        <button className={styles.headerBtn} onClick={() => setShowSettings(true)}>설정</button>
                        <button className={styles.headerBtn} onClick={() => loadMeta({ keepActive: true })} disabled={loadingMeta || loadingTable}>새로고침</button>
                        <button className={`${styles.headerBtn} ${styles.headerBtnPoint}`} onClick={syncNow} disabled={syncing}>{syncing ? '동기화 중' : 'NAS 동기화'}</button>
                        <button
                            className={styles.lookupBtn}
                            onClick={handleContainerLookup}
                            disabled={containerLookupRunning || loadingTable || !processedRows.length}
                            title="현재 검색/필터 결과에 남아있는 컨테이너를 이력조회합니다."
                        >
                            {containerLookupRunning ? '조회 중' : '컨테이너 조회'}
                        </button>
                        {containerLookupRunning && (
                            <button
                                className={styles.stopLookupBtn}
                                onClick={handleStopContainerLookup}
                                disabled={containerLookupStopping}
                                title="현재 컨테이너 이력 조회를 중단하고 지금까지 받은 결과만 남깁니다."
                            >
                                {containerLookupStopping ? '멈추는 중' : '조회 멈춤'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className={styles.topBar}>
                <div className={styles.topBarLeft}>
                    <input
                        className={styles.pathInput}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={isAllView ? '전체 검색 (콤마 구분)' : '현재 선택 시트 검색'}
                        aria-label={isAllView ? '전체 검색' : '현재 선택 시트 검색'}
                    />
                    <span className={styles.dateTabsMeta}>
                        {isAllView ? `전체 ${processedRows.length.toLocaleString('ko-KR')} / ${rowCount.toLocaleString('ko-KR')}건` : `현재 선택 시트 ${processedRows.length.toLocaleString('ko-KR')}건`}
                    </span>
                    <button className={styles.resetBtn} onClick={() => savePreset(1)}>P1 저장</button>
                    <button className={styles.resetBtn} onClick={() => loadPreset(1)}>P1 로드</button>
                    <button className={styles.resetBtn} onClick={() => savePreset(2)}>P2 저장</button>
                    <button className={styles.resetBtn} onClick={() => loadPreset(2)}>P2 로드</button>
                    <button className={styles.dangerBtn} onClick={resetLayout}>↺ 정렬 초기화</button>
                </div>
            </div>

            {containerLookupStatus && (
                <div className={styles.lookupStatus}>
                    {containerLookupProgress && (
                        <span className={styles.lookupStatusCounts}>
                            <span>컨테이너 조회건수 {Number(containerLookupProgress.total || 0).toLocaleString('ko-KR')}건</span>
                            <span>조회완료 {Number(containerLookupProgress.completed || 0).toLocaleString('ko-KR')}건</span>
                            <span className={Number(containerLookupProgress.failed || 0) > 0 ? styles.lookupStatusFailed : ''}>
                                조회실패 {Number(containerLookupProgress.failed || 0).toLocaleString('ko-KR')}건
                            </span>
                            {Number(containerLookupProgress.remaining || 0) > 0 && (
                                <span>미조회 {Number(containerLookupProgress.remaining || 0).toLocaleString('ko-KR')}건</span>
                            )}
                        </span>
                    )}
                    <span className={styles.lookupStatusMessage}>{containerLookupStatus}</span>
                    {containerLookupErrorSummary?.message && (
                        <span
                            className={styles.lookupStatusErrorDetail}
                            title={containerLookupErrorSummary.samples?.join('\n') || containerLookupErrorSummary.message}
                        >
                            실패 사유: {containerLookupErrorSummary.message}
                        </span>
                    )}
                </div>
            )}

            <div className={styles.dateFilterZone}>
                <span className={styles.dateFilterLabel}>연도</span>
                <div className={styles.monthFilterGroup}>
                    {yearOptions.map(year => (
                        <button
                            key={year}
                            type="button"
                            className={`${styles.monthFilterBtn} ${selectedYear === year ? styles.monthFilterBtnActive : ''}`}
                            onClick={() => {
                                setSelectedYear(year);
                                setActiveKey(ALL_RECORD_KEY);
                            }}
                        >
                            {year}년
                        </button>
                    ))}
                </div>
                <span className={styles.dateFilterLabel}>날짜 필터</span>
                <select
                    className={styles.dateSelect}
                    value={dateFilter.col}
                    onChange={(event) => setDateFilter(prev => ({ ...prev, col: event.target.value }))}
                    disabled={!dateColumns.length}
                    aria-label="날짜 필터 컬럼"
                >
                    <option value="">컬럼 선택</option>
                    {dateColumns.map(column => (
                        <option key={column} value={column}>{column}</option>
                    ))}
                </select>
                <input
                    className={styles.dateSelect}
                    type="date"
                    value={dateFilter.day}
                    onChange={(event) => {
                        const day = event.target.value;
                        setDateFilter(prev => ({ ...prev, day }));
                        const dayYear = day.slice(0, 4);
                        if (dayYear && yearOptions.includes(dayYear)) {
                            setSelectedYear(dayYear);
                        }
                        if (day) setActiveKey(ALL_RECORD_KEY);
                    }}
                    aria-label="일자 필터"
                />
                <button
                    type="button"
                    className={`${styles.monthFilterBtn} ${dateFilter.day ? '' : styles.monthFilterBtnActive}`}
                    onClick={() => setDateFilter(prev => ({ ...prev, day: '' }))}
                    title="일자 제한 없이 선택 연도/월 데이터를 표시합니다."
                >
                    전체
                </button>
                <span className={styles.resultCountText}>
                    전체 {rowCount.toLocaleString('ko-KR')}건 / 조회 {processedRows.length.toLocaleString('ko-KR')}건
                </span>
            </div>

            <div className={styles.dateTabs}>
                <button
                    className={`${styles.dateTab} ${isAllView ? styles.dateTabActive : ''}`}
                    onClick={selectAll}
                >
                    <span>전체</span>
                    <span className={styles.tabDay}>{formatCount(selectedYearTotal)}</span>
                </button>
                {selectedYearRecords.map(record => {
                    const key = recordKey(record);
                    const active = key === activeKey;
                    return (
                        <button
                            key={key}
                            className={`${styles.dateTab} ${active ? styles.dateTabActive : ''}`}
                            onClick={() => selectRecord(record)}
                        >
                            <span>{formatMonthLabel(record.target_month)}</span>
                            <span className={styles.tabDay}>{formatCount(record.valid_row_count || record.row_count)}</span>
                        </button>
                    );
                })}
                {!selectedYearRecords.length && <span className={styles.dateTabsMeta}>동기화된 시트 없음</span>}
            </div>

            <div
                className={`${styles.hiddenColsZone} ${isDragOverHidden ? styles.hiddenColsZoneActive : ''}`}
                onDragOver={(event) => { event.preventDefault(); setIsDragOverHidden(true); }}
                onDragLeave={() => setIsDragOverHidden(false)}
                onDrop={handleDropToHidden}
                title="헤더를 이 영역으로 드래그하면 숨김 처리됩니다. 칩을 클릭하면 다시 표시됩니다."
            >
                <span className={styles.hiddenColsHint}>숨김</span>
                {hiddenColumnList.map(column => (
                    <button
                        key={column}
                        draggable
                        onDragStart={(event) => handleDragStart(event, column)}
                        onClick={() => handleRestoreColumn(column)}
                        className={`${styles.hiddenChip} ${isContainerLookupColumn(column) ? styles.hiddenLookupChip : ''}`}
                        title={`표로 복구: ${column}`}
                    >
                        {getHiddenChipLabel(column)}
                    </button>
                ))}
            </div>

            {Object.keys(columnFilters).length > 0 && (
                <div className={styles.filterBadges}>
                    {Object.entries(columnFilters).map(([column, selectedSet]) => (
                        <span key={column} className={styles.filterBadge}>
                            {column}: {selectedSet.size}개
                            <button onClick={() => clearFilter(column)}>x</button>
                        </span>
                    ))}
                    <button className={styles.filterBadge} onClick={() => setColumnFilters({})}>전체 필터 초기화</button>
                </div>
            )}

            <div className={styles.tableWrap}>
                <div className={styles.tableScroll}>
                    {loadingTable ? (
                        <div className={styles.emptyState}>데이터를 불러오는 중입니다...</div>
                    ) : visibleHeaders.length ? (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    {visibleHeaders.map((header) => (
                                        <th
                                            key={header}
                                            draggable
                                            onDragStart={(event) => handleDragStart(event, header)}
                                            onDragOver={(event) => handleDragOver(event, header)}
                                            onDrop={(event) => handleDrop(event, header)}
                                            className={`${dragOverCol === header ? styles.dragOver : ''} ${isContainerLookupColumn(header) ? styles.lookupHeader : ''}`}
                                        >
                                            <span className={styles.thText} onClick={() => handleSort(header)}>
                                                {header}
                                                {sortConfig.key === header && (
                                                    <span className={styles.sortIcon}>{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                                                )}
                                            </span>
                                            <button
                                                type="button"
                                                className={styles.filterIcon}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setFilterDropdown(filterDropdown === header ? null : header);
                                                }}
                                            >
                                                ▼
                                            </button>
                                            {filterDropdown === header && (
                                                <div className={styles.dropdown} onClick={event => event.stopPropagation()}>
                                                    <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                                                        <button className={styles.resetBtn} onClick={() => selectAllFilter(header, getUniqueValues(header))}>전체 선택</button>
                                                        <button className={styles.resetBtn} onClick={() => clearFilter(header)}>초기화</button>
                                                    </div>
                                                    <div style={{ overflowY: 'auto', maxHeight: 240 }}>
                                                        {getUniqueValues(header).map(value => (
                                                            <label key={value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', color: '#334155' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={columnFilters[header]?.has(value) || false}
                                                                    onChange={() => toggleFilterValue(header, value)}
                                                                />
                                                                {value}
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {processedRows.map((row, rowIndex) => (
                                    <tr key={`${activeKey}-${rowIndex}`}>
                                        {visibleHeaders.map((header) => {
                                            const value = getCellValue(row, header);
                                            return (
                                                <td
                                                    key={header}
                                                    title={String(value || '')}
                                                    className={isContainerLookupColumn(header) ? styles.lookupCell : ''}
                                                >
                                                    {String(value || '')}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className={styles.emptyState}>데이터가 없습니다. 상단 &apos;NAS 동기화&apos; 버튼을 누르세요.</div>
                    )}
                </div>
            </div>

            {isAllView && activeRecord?.has_more && (
                <div className={styles.loadMoreWrap}>
                    <button
                        className={styles.loadMoreBtn}
                        onClick={() => loadAllRows({ reset: false, offset: rows.length })}
                        disabled={loadingMore}
                    >
                        {loadingMore ? '불러오는 중...' : `더보기 (${rows.length.toLocaleString('ko-KR')} / ${rowCount.toLocaleString('ko-KR')})`}
                    </button>
                </div>
            )}

            {showSettings && (
                <div className={styles.overlay}>
                    <div className={styles.modal}>
                        <h2>운송내역 파일 설정</h2>
                        <div className={styles.formGroup}>
                            <label>NAS 엑셀 경로</label>
                            <div className={styles.pathRow}>
                                <input
                                    className={styles.pathInput}
                                    value={draftPath}
                                    onChange={(event) => setDraftPath(event.target.value)}
                                />
                                <button onClick={openBrowser} className={styles.browseBtn}>찾기</button>
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label>현재 연결</label>
                            <div className={styles.pathRow}>
                                <input className={styles.pathInput} value={settings.transport_history_path || TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH} readOnly />
                            </div>
                        </div>
                        <div className={styles.modalFooter}>
                            <button className={styles.cancelBtn} onClick={() => setShowSettings(false)}>취소</button>
                            <button className={styles.saveBtn} onClick={saveSettings}>저장</button>
                        </div>
                    </div>
                </div>
            )}

            {showBrowser && (
                <div className={styles.overlay}>
                    <div className={styles.modal}>
                        <h2>NAS 파일 찾기</h2>
                        <p className={styles.browserPath}>{browserPath}</p>
                        <div className={styles.browserList}>
                            {browserLoading ? (
                                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>불러오는 중...</div>
                            ) : (
                                <>
                                    {browserPath !== '/' && (
                                        <div className={styles.browserItem} onClick={() => loadNasFolder(browserPath.split('/').slice(0, -1).join('/') || '/')}>
                                            상위 폴더
                                        </div>
                                    )}
                                    {browserFiles.map((file, index) => (
                                        <div key={`${file.path}-${index}`} className={styles.browserItem} onClick={() => selectFile(file)}>
                                            <span>{file.type === 'directory' ? '[폴더]' : '[파일]'}</span>
                                            <span>{file.name}</span>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                        <div className={styles.modalFooter}>
                            <button className={styles.cancelBtn} onClick={() => { setShowBrowser(false); setShowSettings(true); }}>닫기</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
