'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './dispatch.module.css';

const TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH = '/아산지점/2026_수출리스트.xlsx';
const ALL_RECORD_KEY = '__all__';
const ALL_PAGE_SIZE = 100;
const PREF_PAGE_KEY = 'asan_transport_history_preset';
const DEFAULT_SORT = { key: null, direction: 'asc' };

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

    const isAllView = activeKey === ALL_RECORD_KEY;

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
            if (sortConfig.key) {
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
    }, [activeKey, search, selectedYear, sortConfig.direction, sortConfig.key]);

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
    const yearOptions = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const years = Array.from(new Set([
            ...metaRecords.map(recordYear).filter(Boolean),
            String(currentYear),
            String(currentYear + 1),
            selectedYear,
        ].filter(Boolean))).sort();
        return years.length ? years : [selectedYear];
    }, [metaRecords, selectedYear]);
    const selectedYearRecords = useMemo(() => (
        metaRecords.filter(record => recordYear(record) === selectedYear)
    ), [metaRecords, selectedYear]);
    const selectedYearTotal = useMemo(() => (
        selectedYearRecords.reduce((sum, record) => sum + Number(record.valid_row_count || record.row_count || 0), 0)
    ), [selectedYearRecords]);

    useEffect(() => {
        setColOrder(prev => normalizeColumnOrder(prev, headers));
        setHiddenCols(prev => new Set(Array.from(prev).filter(header => headers.includes(header))));
        setColumnFilters(prev => restoreColumnFilters(serializeColumnFilters(prev), headers));
    }, [headers]);

    const getCellValue = useCallback((row, column) => {
        const index = headers.indexOf(column);
        return index >= 0 ? row[index] : '';
    }, [headers]);

    const processedRows = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        let nextRows = [...rows];
        if (!isAllView && keyword) {
            const terms = keyword.split(',').map(term => term.trim()).filter(Boolean);
            nextRows = nextRows.filter(row => terms.some(term => (
                row.some(cell => String(cell || '').toLowerCase().includes(term))
            )));
        }
        Object.entries(columnFilters).forEach(([column, selectedSet]) => {
            if (!selectedSet?.size) return;
            nextRows = nextRows.filter(row => selectedSet.has(normalizeFilterValue(getCellValue(row, column))));
        });
        if (!isAllView && sortConfig.key) {
            nextRows.sort((a, b) => compareCellValues(
                getCellValue(a, sortConfig.key),
                getCellValue(b, sortConfig.key),
                sortConfig.direction,
            ));
        }
        return nextRows;
    }, [columnFilters, getCellValue, isAllView, rows, search, sortConfig.direction, sortConfig.key]);

    const visibleHeaders = useMemo(() => (
        normalizeColumnOrder(colOrder, headers).filter(header => !hiddenCols.has(header))
    ), [colOrder, headers, hiddenCols]);
    const hiddenColumnList = useMemo(() => (
        headers.filter(header => hiddenCols.has(header))
    ), [headers, hiddenCols]);

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
            const next = normalizeColumnOrder(prev, headers).filter(column => column !== draggedCol);
            const targetIndex = Math.max(0, next.indexOf(targetColumn));
            next.splice(targetIndex, 0, draggedCol);
            return normalizeColumnOrder(next, headers);
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
        if (draggedCol && headers.includes(draggedCol)) {
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
        setColOrder(prev => normalizeColumnOrder([...prev, column], headers));
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
        setColOrder(normalizeColumnOrder(headers, headers));
        setHiddenCols(new Set());
        setColumnFilters({});
        setSortConfig(DEFAULT_SORT);
        setFilterDropdown(null);
    };

    const savePreset = async (num) => {
        const settingsPayload = {
            colOrder: normalizeColumnOrder(colOrder, headers),
            hiddenCols: Array.from(hiddenCols),
            sortConfig,
            columnFilters: serializeColumnFilters(columnFilters),
            sourceHeaders: headers,
        };
        try {
            const response = await fetch('/api/user/prefs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_key: `${PREF_PAGE_KEY}_${num}`, settings: settingsPayload }),
            });
            if (!response.ok) throw new Error('저장 실패');
            setSyncStatus({ message: `운송내역 P${num} 저장 완료`, isError: false });
        } catch (error) {
            setSyncStatus({ message: error.message || '프리셋 저장 실패', isError: true });
        }
    };

    const loadPreset = async (num) => {
        try {
            const response = await fetch(`/api/user/prefs?page_key=${PREF_PAGE_KEY}_${num}`, { cache: 'no-store' });
            const json = await response.json();
            if (!response.ok || json.error) throw new Error(json.error || '로드 실패');
            const prefs = json.data || {};
            if (!prefs.colOrder) throw new Error(`저장된 P${num} 프리셋이 없습니다.`);
            setColOrder(normalizeColumnOrder(prefs.colOrder, headers));
            setHiddenCols(new Set((prefs.hiddenCols || []).filter(header => headers.includes(header))));
            setSortConfig(prefs.sortConfig || DEFAULT_SORT);
            setColumnFilters(restoreColumnFilters(prefs.columnFilters || {}, headers));
            setSyncStatus({ message: `운송내역 P${num} 로드 완료`, isError: false });
        } catch (error) {
            setSyncStatus({ message: error.message || '프리셋 로드 실패', isError: true });
        }
    };

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
                        className={styles.hiddenChip}
                    >
                        {column}
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
                                            className={dragOverCol === header ? styles.dragOver : ''}
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
                                                <td key={header} title={String(value || '')}>
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
