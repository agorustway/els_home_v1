'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './dispatch.module.css';

const TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH = '/아산지점/A_운송실무/2026_수출리스트.xlsx';

function recordKey(record = {}) {
    return `${record.target_month || ''}::${record.sheet_name || ''}`;
}

function formatMonthLabel(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})/);
    if (!match) return value || '-';
    return `${Number(match[2])}월`;
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

function pickInitialRecord(records = []) {
    if (!records.length) return null;
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    return records.find(record => record.target_month === currentMonth) || records[records.length - 1];
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
    const [activeKey, setActiveKey] = useState('');
    const [activeRecord, setActiveRecord] = useState(null);
    const [loadingMeta, setLoadingMeta] = useState(false);
    const [loadingTable, setLoadingTable] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState(null);
    const [search, setSearch] = useState('');
    const [settings, setSettings] = useState({ transport_history_path: TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH });
    const [draftPath, setDraftPath] = useState(TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH);
    const [showSettings, setShowSettings] = useState(false);

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

    const loadMeta = useCallback(async ({ keepActive = true } = {}) => {
        setLoadingMeta(true);
        try {
            const response = await fetch(`/api/branches/asan/transport-history?mode=meta&t=${Date.now()}`, { cache: 'no-store' });
            const json = await response.json();
            if (!response.ok || json.error) throw new Error(json.error || '운송내역 메타 조회 실패');
            const records = json.data || [];
            setMetaRecords(records);
            const current = records.find(record => recordKey(record) === activeKey);
            const next = keepActive && current ? current : pickInitialRecord(records);
            setActiveKey(next ? recordKey(next) : '');
            await loadRecord(next);
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
            setSyncStatus({ message: '운송내역 파일 설정을 저장했습니다.', isError: false });
        } catch (error) {
            setSyncStatus({ message: error.message || '설정 저장 실패', isError: true });
        }
    };

    const headers = activeRecord?.headers || [];
    const rows = activeRecord?.data || [];
    const filteredRows = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return rows;
        return rows.filter(row => row.some(cell => String(cell || '').toLowerCase().includes(keyword)));
    }, [rows, search]);

    const downloadCurrentSheet = async () => {
        if (!headers.length) return;
        const XLSX = await import('xlsx');
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...filteredRows]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, activeRecord?.sheet_name || '운송내역');
        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const filename = `아산_운송내역_${formatMonthLabel(activeRecord?.target_month)}_${activeRecord?.sheet_name || '현재 선택 시트'}.xlsx`;
        triggerBlobDownload(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
    };

    const rowCount = activeRecord?.valid_row_count ?? rows.length;
    const fileModifiedLabel = formatDateTime(activeRecord?.file_modified_at);

    return (
        <div className={styles.container}>
            <div className={styles.compactHeader}>
                <div className={styles.headerTitleArea}>
                    <h2 className={styles.pageTitle}>운송내역</h2>
                    <span className={styles.headerBadge}>{formatMonthLabel(activeRecord?.target_month)} · {rowCount.toLocaleString('ko-KR')}건</span>
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
                        <button className={styles.headerBtn} onClick={downloadCurrentSheet} disabled={!headers.length || loadingTable}>엑셀</button>
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
                        placeholder="현재 선택 시트 검색"
                        aria-label="현재 선택 시트 검색"
                    />
                    <span className={styles.dateTabsMeta}>현재 선택 시트 {filteredRows.length.toLocaleString('ko-KR')}건</span>
                </div>
            </div>

            <div className={styles.dateTabs}>
                {metaRecords.map(record => {
                    const key = recordKey(record);
                    const active = key === activeKey;
                    return (
                        <button
                            key={key}
                            className={`${styles.dateTab} ${active ? styles.dateTabActive : ''}`}
                            onClick={() => selectRecord(record)}
                        >
                            <span>{formatMonthLabel(record.target_month)}</span>
                            <span className={styles.tabDay}>{record.sheet_name}</span>
                        </button>
                    );
                })}
                {!metaRecords.length && <span className={styles.dateTabsMeta}>동기화된 시트 없음</span>}
            </div>

            <div className={styles.tableWrap}>
                <div className={styles.tableScroll}>
                    {loadingTable ? (
                        <div className={styles.emptyState}>데이터를 불러오는 중입니다...</div>
                    ) : headers.length ? (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    {headers.map((header, index) => (
                                        <th key={`${header}-${index}`}>
                                            <span className={styles.thText}>{header}</span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map((row, rowIndex) => (
                                    <tr key={`${activeKey}-${rowIndex}`}>
                                        {headers.map((header, colIndex) => {
                                            const value = row[colIndex] ?? '';
                                            return (
                                                <td key={`${header}-${colIndex}`} title={String(value || '')}>
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
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label>현재 연결</label>
                            <input className={styles.pathInput} value={settings.transport_history_path || TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH} readOnly />
                        </div>
                        <div className={styles.modalFooter}>
                            <button className={styles.cancelBtn} onClick={() => setShowSettings(false)}>취소</button>
                            <button className={styles.saveBtn} onClick={saveSettings}>저장</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
