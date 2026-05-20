'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../users/users.module.css';

const LOG_API_PATH = '/api/admin/logs';
const PAGE_LIMIT = 30;

const ACTION_COLORS = {
    PAGE_VIEW: '#2563eb',
    CLICK: '#059669',
    DOWNLOAD: '#d97706',
    LOGIN: '#7c3aed',
    ERROR: '#dc2626',
};

function formatDateTime(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('ko-KR');
}

function stripVerboseMetadata(meta) {
    if (!meta || typeof meta !== 'object') return null;
    const copy = { ...meta };
    delete copy.userAgent;
    return Object.keys(copy).length > 0 ? copy : null;
}

function renderMetadata(meta) {
    const cleaned = stripVerboseMetadata(meta);
    if (!cleaned) return '-';
    return JSON.stringify(cleaned).substring(0, 100);
}

function escapeCsv(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function getLogUserName(log) {
    const name = String(log.user_name || '').trim();
    const email = String(log.user_email || '').trim();
    return name && name !== email ? name : '';
}

function getLogUserEmail(log) {
    return String(log.user_email || '').trim();
}

function getLogIp(log) {
    return String(log.ip_address || '').trim();
}

export default function AdminLogsPage() {
    const [logs, setLogs] = useState([]);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: PAGE_LIMIT,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        totalIsEstimated: true,
    });
    const [loading, setLoading] = useState(true);
    const [searchEmail, setSearchEmail] = useState('');
    const [searchType, setSearchType] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [error, setError] = useState(null);
    const [isTableMissing, setIsTableMissing] = useState(false);
    const [selectedLogs, setSelectedLogs] = useState(new Set());
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedLogData, setSelectedLogData] = useState(null);

    const [activeEmail, setActiveEmail] = useState('');
    const [activeType, setActiveType] = useState('');
    const [activeStartDate, setActiveStartDate] = useState('');
    const [activeEndDate, setActiveEndDate] = useState('');

    const selectedData = useMemo(
        () => logs.filter((log) => selectedLogs.has(log.id)),
        [logs, selectedLogs]
    );

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setError(null);
        setIsTableMissing(false);

        try {
            const params = new URLSearchParams({
                page: String(pagination.page),
                limit: String(PAGE_LIMIT),
                email: activeEmail,
                type: activeType,
                startDate: activeStartDate,
                endDate: activeEndDate,
            });

            const res = await fetch(`${LOG_API_PATH}?${params.toString()}`);
            const data = await res.json();

            if (data.info === 'LOG_TABLE_MISSING') {
                setIsTableMissing(true);
            }

            if (!res.ok) {
                throw new Error(data.error || '데이터를 불러오지 못했습니다.');
            }

            setLogs(data.logs || []);
            setPagination(data.pagination || {
                page: pagination.page,
                limit: PAGE_LIMIT,
                total: 0,
                totalPages: 1,
                hasNextPage: false,
                totalIsEstimated: true,
            });
            setSelectedLogs(new Set());
        } catch (fetchError) {
            console.error(fetchError);
            setLogs([]);
            setError(fetchError.message || '네트워크 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    }, [activeEmail, activeEndDate, activeStartDate, activeType, pagination.page]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const handleSearch = (e) => {
        e.preventDefault();
        setPagination((prev) => ({ ...prev, page: 1 }));
        setActiveEmail(searchEmail.trim());
        setActiveType(searchType);
        setActiveStartDate(startDate);
        setActiveEndDate(endDate);
    };

    const handleClearLogs = async (type) => {
        const msg = type === 'ALL' ? '모든 데이터를 삭제하시겠습니까? (복구 불가)' :
            type === '1YEAR' ? '최근 1년을 제외한 과거 데이터를 삭제하시겠습니까?' :
                '최근 1달을 제외한 데이터를 삭제하시겠습니까?';

        if (!confirm(`[활동 기록 삭제 경고]\n\n${msg}`)) return;

        let dateBefore = null;
        if (type === '1YEAR') {
            const d = new Date();
            d.setFullYear(d.getFullYear() - 1);
            dateBefore = d.toISOString();
        } else if (type === '1MONTH') {
            const d = new Date();
            d.setMonth(d.getMonth() - 1);
            dateBefore = d.toISOString();
        }

        await deleteLogs({ deleteType: type === 'ALL' ? 'ALL' : 'DATE', dateBefore });
    };

    async function deleteLogs(payload) {
        try {
            const res = await fetch(LOG_API_PATH, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || '삭제 실패');
            }

            alert('정상적으로 삭제되었습니다.');
            fetchLogs();
        } catch (deleteError) {
            console.error(deleteError);
            alert(deleteError.message || '삭제 중 오류가 발생했습니다.');
        }
    }

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.totalPages) {
            setPagination(prev => ({ ...prev, page: newPage }));
        }
    };

    const handleSelectAll = (e) => {
        setSelectedLogs(e.target.checked ? new Set(logs.map(log => log.id)) : new Set());
    };

    const toggleSelect = (id) => {
        const next = new Set(selectedLogs);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedLogs(next);
    };

    const handleDeleteSelected = async () => {
        if (selectedLogs.size === 0) {
            alert('삭제할 로그를 선택하세요.');
            return;
        }
        if (!confirm(`선택한 ${selectedLogs.size}개의 로그를 삭제하시겠습니까?`)) return;
        await deleteLogs({ deleteType: 'IDS', logIds: Array.from(selectedLogs) });
    };

    const handleDownloadSelected = () => {
        if (selectedLogs.size === 0) {
            alert('다운로드할 로그를 선택하세요.');
            return;
        }

        const headers = ['발생일시(KST)', '이름', '이메일', '접근IP', '활동유형', '경로(URL)', '상세정보'];
        const csvRows = [headers.map(escapeCsv).join(',')];

        for (const log of selectedData) {
            csvRows.push([
                formatDateTime(log.created_at),
                getLogUserName(log) || '-',
                getLogUserEmail(log) || 'anonymous',
                getLogIp(log),
                log.action_type || '',
                log.path || '',
                JSON.stringify(log.metadata || {}),
            ].map(escapeCsv).join(','));
        }

        const csvString = '\uFEFF' + csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity_logs_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const openMetaModal = (log) => {
        setSelectedLogData(log);
        setIsModalOpen(true);
    };

    const totalLabel = `${pagination.totalIsEstimated ? '약 ' : ''}${pagination.total.toLocaleString('ko-KR')}건`;

    return (
        <div className={styles.adminContainer}>
            <div className={styles.mainContent}>
                <header className={styles.compactHeader}>
                    <h1 className={styles.pageTitle}>활동 로그 관리</h1>
                    <div className={styles.headerActions}>
                        <button type="button" onClick={() => fetchLogs()} className={styles.btn}>새로고침</button>
                    </div>
                </header>

                {isTableMissing && (
                    <div className={styles.noticeBox}>
                        <strong>[안내] 로그 테이블이 아직 활성화되지 않았습니다.</strong><br />
                        Supabase 데이터베이스에 로그 테이블(user_activity_logs)이 생성되지 않았습니다.<br />
                        <code>supabase_user_logs.sql</code>을 실행하여 기반 테이블을 만들어주시면, 여기서 로그 관리가 가능해집니다.
                    </div>
                )}

                <div className={styles.toolbar}>
                    <form onSubmit={handleSearch} className={styles.toolbarForm}>
                        <input
                            type="text"
                            placeholder="이메일 검색"
                            value={searchEmail}
                            onChange={(e) => setSearchEmail(e.target.value)}
                            className={styles.textInput}
                        />
                        <select
                            value={searchType}
                            onChange={(e) => setSearchType(e.target.value)}
                            className={styles.selectInput}
                        >
                            <option value="">활동 유형</option>
                            <option value="PAGE_VIEW">조회 (PAGE_VIEW)</option>
                            <option value="CLICK">클릭 (CLICK)</option>
                            <option value="DOWNLOAD">다운로드 (DOWNLOAD)</option>
                            <option value="LOGIN">로그인 (LOGIN)</option>
                            <option value="ERROR">오류 (ERROR)</option>
                        </select>

                        <div className={styles.dateRange}>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className={styles.dateInput}
                            />
                            <span className={styles.dateSeparator}>~</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className={styles.dateInput}
                            />
                        </div>

                        <button type="submit" className={`${styles.btn} ${styles.btnPoint}`}>검색</button>
                    </form>

                    <div className={styles.toolbarActions}>
                        {selectedLogs.size > 0 && (
                            <>
                                <button type="button" onClick={handleDownloadSelected} className={`${styles.btn} ${styles.btnSuccess}`}>선택 다운로드</button>
                                <button type="button" onClick={handleDeleteSelected} className={`${styles.btn} ${styles.btnDanger}`}>선택 삭제</button>
                                <div className={styles.divider} />
                            </>
                        )}
                        <button type="button" onClick={() => handleClearLogs('1MONTH')} className={`${styles.btn} ${styles.btnDanger}`}>1달 이전 삭제</button>
                        <button type="button" onClick={() => handleClearLogs('1YEAR')} className={`${styles.btn} ${styles.btnDanger}`}>1년 이전 삭제</button>
                        <button type="button" onClick={() => handleClearLogs('ALL')} className={`${styles.btn} ${styles.btnDangerSolid}`}>전체 삭제</button>
                    </div>
                </div>

                {error && (
                    <div className={styles.errorBox}>
                        {error}
                    </div>
                )}

                <div className={styles.tableWrapper}>
                    <div className={styles.scrollX}>
                        <table className={styles.adminTable} style={{ minWidth: '1000px' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '50px', textAlign: 'center' }}>
                                        <input type="checkbox" onChange={handleSelectAll} checked={logs.length > 0 && selectedLogs.size === logs.length} className={styles.checkbox} />
                                    </th>
                                    <th style={{ width: '190px' }}>발생 일시(KST)</th>
                                    <th style={{ width: '240px' }}>이름 / 이메일 / 접근IP</th>
                                    <th style={{ width: '125px' }}>활동 유형</th>
                                    <th style={{ width: '25%' }}>경로 (URL)</th>
                                    <th>상세 정보 (meta)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="6" className={styles.empty}>데이터를 불러오는 중입니다...</td></tr>
                                ) : logs.length === 0 ? (
                                    <tr><td colSpan="6" className={styles.empty}>{isTableMissing ? '저장된 활동 로그가 없습니다.' : '조건에 맞는 검색 결과가 없습니다.'}</td></tr>
                                ) : logs.map((log) => {
                                    const color = ACTION_COLORS[log.action_type] || '#64748b';
                                    const userName = getLogUserName(log);
                                    const userEmail = getLogUserEmail(log) || '-';
                                    const userIp = getLogIp(log);
                                    return (
                                        <tr key={log.id} className={selectedLogs.has(log.id) ? styles.selectedRow : ''}>
                                            <td style={{ textAlign: 'center' }}>
                                                <input type="checkbox" checked={selectedLogs.has(log.id)} onChange={() => toggleSelect(log.id)} className={styles.checkbox} />
                                            </td>
                                            <td className={styles.nowrapCell}>{formatDateTime(log.created_at)}</td>
                                            <td className={styles.breakCell}>
                                                <div className={styles.identityCell}>
                                                    {userName && <span className={styles.identityName}>{userName}</span>}
                                                    <span className={styles.identityEmail}>{userEmail}</span>
                                                    {userIp && <span className={styles.identityIp}>{userIp}</span>}
                                                </div>
                                            </td>
                                            <td>
                                                <span className={styles.badge} style={{ '--badge-color': color }}>
                                                    {log.action_type || '-'}
                                                </span>
                                            </td>
                                            <td className={styles.pathCell}>{log.path || '-'}</td>
                                            <td>
                                                <button
                                                    type="button"
                                                    onClick={() => openMetaModal(log)}
                                                    className={styles.metaPreview}
                                                    title="클릭하여 상세 데이터 보기"
                                                >
                                                    {renderMetadata(log.metadata)}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className={styles.cardList}>
                    {loading ? (
                        <div className={styles.empty}>데이터를 불러오는 중입니다...</div>
                    ) : logs.length === 0 ? (
                        <div className={styles.empty}>{isTableMissing ? '저장된 활동 로그가 없습니다.' : '조건에 맞는 검색 결과가 없습니다.'}</div>
                    ) : logs.map((log) => {
                        const color = ACTION_COLORS[log.action_type] || '#64748b';
                        const userName = getLogUserName(log);
                        const userEmail = getLogUserEmail(log) || '-';
                        const userIp = getLogIp(log);
                        return (
                            <div key={log.id} className={styles.logCard}>
                                <div className={styles.logCardHeader}>
                                    <label className={styles.permissionLabel}>
                                        <input type="checkbox" checked={selectedLogs.has(log.id)} onChange={() => toggleSelect(log.id)} className={styles.checkbox} />
                                        선택
                                    </label>
                                    <span className={styles.logCardDate}>{formatDateTime(log.created_at)}</span>
                                </div>
                                <div className={styles.logCardBody}>
                                    <div className={styles.logCardTitle}>{userName || userEmail}</div>
                                    {userName && <div className={styles.identityEmail}>{userEmail}</div>}
                                    {userIp && <div className={styles.identityIp}>{userIp}</div>}
                                    <span className={styles.badge} style={{ '--badge-color': color }}>{log.action_type || '-'}</span>
                                    <div className={styles.logCardPath}>{log.path || '-'}</div>
                                    <button type="button" onClick={() => openMetaModal(log)} className={styles.metaPreview}>
                                        {renderMetadata(log.metadata)}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className={styles.pagination}>
                    <div className={styles.paginationButtons}>
                        <button type="button" onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page === 1} className={styles.btn}>이전</button>
                        <button type="button" onClick={() => handlePageChange(pagination.page + 1)} disabled={!pagination.hasNextPage && pagination.page >= pagination.totalPages} className={styles.btn}>다음</button>
                    </div>
                    <span className={styles.paginationText}>
                        {pagination.page} / {pagination.totalPages || 1} 페이지 (총 {totalLabel})
                    </span>
                </div>
            </div>

            {isModalOpen && selectedLogData && (
                <div className={styles.modalBackdrop} onClick={() => setIsModalOpen(false)}>
                    <div className={styles.modalPanel} onClick={e => e.stopPropagation()}>
                        <h3 className={styles.modalTitle}>
                            <span>상세 정보</span>
                            <button type="button" onClick={() => setIsModalOpen(false)} className={styles.modalClose}>닫기</button>
                        </h3>
                        <div className={styles.modalMeta}>
                            <strong>경로:</strong> {selectedLogData.path || '-'}
                        </div>
                        <pre className={styles.metaPre}>
                            {JSON.stringify(selectedLogData.metadata || {}, null, 2)}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}
