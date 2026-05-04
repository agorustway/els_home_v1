'use client';

import { useState, useEffect } from 'react';
import styles from '../users/users.module.css';

export default function AdminLogsPage() {
    const [logs, setLogs] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 1 });
    const [loading, setLoading] = useState(true);
    const [searchEmail, setSearchEmail] = useState('');
    const [searchType, setSearchType] = useState(''); // PAGE_VIEW, CLICK, LOGIN, DOWNLOAD, ERROR
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [error, setError] = useState(null);
    const [isTableMissing, setIsTableMissing] = useState(false);
    
    // Checkbox & Modal State
    const [selectedLogs, setSelectedLogs] = useState(new Set());
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedLogData, setSelectedLogData] = useState(null);

    // Filter Trigger
    const [activeEmail, setActiveEmail] = useState('');
    const [activeType, setActiveType] = useState('');
    const [activeStartDate, setActiveStartDate] = useState('');
    const [activeEndDate, setActiveEndDate] = useState('');

    useEffect(() => {
        fetchLogs();
    }, [pagination.page, activeEmail, activeType, activeStartDate, activeEndDate]);

    async function fetchLogs() {
        setLoading(true);
        setError(null);
        setIsTableMissing(false);
        try {
            const params = new URLSearchParams({
                page: pagination.page,
                limit: 30,
                email: activeEmail,
                type: activeType,
                startDate: activeStartDate,
                endDate: activeEndDate
            });
            const baseUrl = process.env.NEXT_PUBLIC_ELS_BACKEND_URL || '';
            const res = await fetch(`${baseUrl}/api/logs?${params.toString()}`);
            const data = await res.json();

            if (data.info === 'LOG_TABLE_MISSING') {
                setIsTableMissing(true);
            }
            if (res.ok && data.logs) {
                setLogs(data.logs);
                setPagination(data.pagination);
                setSelectedLogs(new Set()); // 페이지 이동 시 선택 초기화
            } else if (!res.ok) {
                setError(data.error || '데이터를 불러오지 못했습니다.');
            }
        } catch (error) {
            console.error(error);
            setError('네트워크 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    }

    const handleSearch = (e) => {
        e.preventDefault();
        setPagination({ ...pagination, page: 1 });
        setActiveEmail(searchEmail);
        setActiveType(searchType);
        setActiveStartDate(startDate);
        setActiveEndDate(endDate);
    };

    const handleClearLogs = async (type) => { // '1YEAR', 'ALL', '1MONTH'
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

        try {
            const baseUrl = process.env.NEXT_PUBLIC_ELS_BACKEND_URL || '';
            const res = await fetch(`${baseUrl}/api/logs`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleteType: type === 'ALL' ? 'ALL' : 'DATE', dateBefore }),
            });
            if (res.ok) {
                alert('정상적으로 삭제되었습니다.');
                fetchLogs(); // refresh
            } else {
                alert('삭제 실패');
            }
        } catch (e) {
            console.error(e);
            alert('오류 발생');
        }
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.totalPages) {
            setPagination(prev => ({ ...prev, page: newPage }));
        }
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedLogs(new Set(logs.map(log => log.id)));
        } else {
            setSelectedLogs(new Set());
        }
    };

    const toggleSelect = (id) => {
        const newSet = new Set(selectedLogs);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedLogs(newSet);
    };

    const handleDeleteSelected = async () => {
        if (selectedLogs.size === 0) return alert('삭제할 로그를 선택하세요.');
        if (!confirm(`선택한 ${selectedLogs.size}개의 로그를 삭제하시겠습니까?`)) return;

        try {
            const baseUrl = process.env.NEXT_PUBLIC_ELS_BACKEND_URL || '';
            const res = await fetch(`${baseUrl}/api/logs`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleteType: 'IDS', logIds: Array.from(selectedLogs) }),
            });
            if (res.ok) {
                alert('선택한 로그가 삭제되었습니다.');
                fetchLogs();
            } else {
                alert('삭제 실패');
            }
        } catch (e) {
            console.error(e);
            alert('오류 발생');
        }
    };

    const handleDownloadSelected = () => {
        if (selectedLogs.size === 0) return alert('다운로드할 로그를 선택하세요.');
        
        const selectedData = logs.filter(log => selectedLogs.has(log.id));
        
        // CSV 생성
        const headers = ['발생일시(KST)', '이메일', '활동유형', '경로(URL)', '상세정보'];
        const csvRows = [headers.join(',')];
        
        for (const log of selectedData) {
            const logDate = new Date(log.created_at).toLocaleString('ko-KR').replace(/,/g, '');
            const email = log.user_email || 'anonymous';
            const action = log.action_type || '';
            const path = log.path || '';
            const metaStr = JSON.stringify(log.metadata || {}).replace(/"/g, '""'); // CSV escape
            
            csvRows.push(`${logDate},${email},${action},${path},"${metaStr}"`);
        }
        
        const csvString = '\uFEFF' + csvRows.join('\n'); // BOM for Excel
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

    const renderMetadata = (meta) => {
        if (!meta) return '-';
        try {
            const copy = { ...meta };
            delete copy.userAgent; // 보기 편하게 제외 가능
            if (Object.keys(copy).length === 0) return '-';
            return JSON.stringify(copy).substring(0, 100);
        } catch { return '-'; }
    };

    const getActionColor = (type) => {
        switch (type) {
            case 'PAGE_VIEW': return '#3b82f6';
            case 'CLICK': return '#10b981';
            case 'DOWNLOAD': return '#f59e0b';
            case 'LOGIN': return '#8b5cf6';
            case 'ERROR': return '#ef4444';
            default: return '#64748b';
        }
    };

    return (
        <div className={styles.adminContainer}>
            <div className={styles.mainContent}>
                <header className={styles.compactHeader}>
                    <h1 className={styles.pageTitle}>활동 로그 관리</h1>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button type="button" onClick={() => fetchLogs()} className={styles.btn} title="새로고침">🔄</button>
                    </div>
                </header>

                {isTableMissing && (
                    <div style={{ margin: '0 0 16px', padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#991b1b' }}>
                        <strong>[안내] 로그 테이블이 아직 활성화되지 않았습니다.</strong><br />
                        Supabase 데이터베이스에 로그 데이블(user_activity_logs)이 생성되지 않았습니다.<br />
                        <code>supabase_user_logs.sql</code>을 실행하여 기반 테이블을 만들어주시면, 여기서 로그 관리가 가능해집니다.
                    </div>
                )}

                {/* Toolbar */}
                <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                    <form onSubmit={handleSearch} style={{ display: 'flex', gap: '6px', flex: 1, minWidth: '300px' }}>
                        <input
                            type="text"
                            placeholder="이메일 검색..."
                            value={searchEmail}
                            onChange={(e) => setSearchEmail(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', outline: 'none', width: '130px', fontSize: '0.85rem' }}
                        />
                        <select
                            value={searchType}
                            onChange={(e) => setSearchType(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', outline: 'none', width: '130px', fontSize: '0.85rem' }}
                        >
                            <option value="">-- 활동 유형 --</option>
                            <option value="PAGE_VIEW">조회 (PAGE_VIEW)</option>
                            <option value="CLICK">클릭 (CLICK)</option>
                            <option value="DOWNLOAD">다운 (DOWNLOAD)</option>
                            <option value="LOGIN">로그인 (LOGIN)</option>
                        </select>

                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', backgroundColor: '#f8fafc', padding: '2px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem' }}
                            />
                            <span style={{ color: '#94a3b8' }}>~</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem' }}
                            />
                        </div>

                        <button type="submit" className={`${styles.btn} ${styles.btnPoint}`}>검색</button>
                    </form>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {selectedLogs.size > 0 && (
                            <>
                                <button onClick={handleDownloadSelected} className={styles.btn} style={{ color: '#047857', border: '1px solid #10b981' }}>⬇️ 선택 다운로드</button>
                                <button onClick={handleDeleteSelected} className={styles.btn} style={{ color: '#dc2626', border: '1px solid #ef4444' }}>🗑️ 선택 삭제</button>
                                <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }} />
                            </>
                        )}
                        <button onClick={() => handleClearLogs('1MONTH')} className={styles.btn} style={{ color: '#dc2626' }}>1달 이전 삭제</button>
                        <button onClick={() => handleClearLogs('1YEAR')} className={styles.btn} style={{ color: '#dc2626' }}>1년 이전 삭제</button>
                        <button onClick={() => handleClearLogs('ALL')} className={styles.btn} style={{ background: '#ef4444', color: 'white' }}>전체 삭제</button>
                    </div>
                </div>

                {error && (
                    <div style={{ margin: '0 0 16px', padding: '12px', backgroundColor: '#fee2e2', color: '#ef4444', borderRadius: '8px', fontSize: '0.85rem' }}>
                        ⚠️ {error}
                    </div>
                )}

                {/* Desktop Table View */}
                <div className={styles.tableWrapper} style={{ backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden', marginBottom: '20px' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px', tableLayout: 'fixed' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f1f5f9' }}>
                                    <th style={{ padding: '14px 16px', width: '50px', textAlign: 'center' }}>
                                        <input type="checkbox" onChange={handleSelectAll} checked={logs.length > 0 && selectedLogs.size === logs.length} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                                    </th>
                                    <th style={{ padding: '14px 16px', color: '#475569', fontWeight: '600', width: '200px' }}>발생 일시(KST)</th>
                                    <th style={{ padding: '14px 16px', color: '#475569', fontWeight: '600', width: '220px' }}>이메일 / 접근IP</th>
                                    <th style={{ padding: '14px 16px', color: '#475569', fontWeight: '600', width: '120px' }}>활동 유형</th>
                                    <th style={{ padding: '14px 16px', color: '#475569', fontWeight: '600', width: '25%' }}>경로 (URL)</th>
                                    <th style={{ padding: '14px 16px', color: '#475569', fontWeight: '600' }}>상세 정보 (meta)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>데이터 로딩 중...</td></tr>
                                ) : logs.length === 0 ? (
                                    <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>{isTableMissing ? '저장된 활동 로그가 없습니다.' : '조건에 맞는 검색 결과가 없습니다.'}</td></tr>
                                ) : logs.map((log) => {
                                    const logDate = new Date(log.created_at).toLocaleString('ko-KR');
                                    return (
                                        <tr key={log.id} style={{ borderTop: '1px solid #f1f5f9', backgroundColor: selectedLogs.has(log.id) ? '#f0fdf4' : 'transparent' }}>
                                            <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                <input type="checkbox" checked={selectedLogs.has(log.id)} onChange={() => toggleSelect(log.id)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                                            </td>
                                            <td style={{ padding: '14px 16px', color: '#64748b', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{logDate}</td>
                                            <td style={{ padding: '14px 16px', color: '#1e293b', fontWeight: '500', fontSize: '0.85rem', wordBreak: 'break-all' }}>{log.user_email}</td>
                                            <td style={{ padding: '14px 16px' }}>
                                                <span style={{
                                                    padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold',
                                                    backgroundColor: `${getActionColor(log.action_type)}20`,
                                                    color: getActionColor(log.action_type)
                                                }}>
                                                    {log.action_type}
                                                </span>
                                            </td>
                                            <td style={{ padding: '14px 16px', color: '#334155', fontSize: '0.85rem', wordBreak: 'break-all' }}>{log.path}</td>
                                            <td style={{ padding: '14px 16px', color: '#64748b', fontSize: '0.8rem' }}>
                                                <div 
                                                    onClick={() => openMetaModal(log)}
                                                    style={{ 
                                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', 
                                                        cursor: 'pointer', background: '#f8fafc', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' 
                                                    }} 
                                                    title="클릭하여 상세 데이터 보기">
                                                    {renderMetadata(log.metadata)}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Pagination Controls */}
                <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page === 1} className={styles.btn}>이전</button>
                        <button onClick={() => handlePageChange(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages || pagination.totalPages === 0} className={styles.btn}>다음</button>
                    </div>
                    <span style={{ fontWeight: '600', color: '#475569', fontSize: '0.85rem' }}>
                        {pagination.page} / {pagination.totalPages || 1} 페이지 (총 {pagination.total}건)
                    </span>
                </div>
            </div>

            {/* Meta Data Modal */}
            {isModalOpen && selectedLogData && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setIsModalOpen(false)}>
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>상세 정보 (Metadata)</span>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
                        </h3>
                        <div style={{ marginBottom: '12px', fontSize: '0.9rem', color: '#475569' }}>
                            <strong>경로:</strong> {selectedLogData.path}
                        </div>
                        <pre style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', overflowX: 'auto', fontSize: '0.85rem', color: '#334155', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {JSON.stringify(selectedLogData.metadata, null, 2)}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}
