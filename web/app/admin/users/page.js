'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SubPageHero from '@/components/SubPageHero';
import EmployeeSidebar from '@/components/EmployeeSidebar';
import { getRoleLabel, ROLE_LABELS } from '@/utils/roles';
import styles from './users.module.css';

export default function AdminUsersPage() {
    const [users, setUsers] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 1 });
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showBanned, setShowBanned] = useState(false);
    const [error, setError] = useState(null);

    // Debounce search or use enter key logic? Let's use Enter key or explicit search button.
    // But for simplicity with useEffect, we can use a separate state for 'activeQuery'.
    const [activeQuery, setActiveQuery] = useState('');

    useEffect(() => {
        fetchUsers(pagination.page, activeQuery, showBanned);
    }, [pagination.page, activeQuery, showBanned]);

    async function fetchUsers(page, q, isBanned) {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                page: page,
                limit: 30,
                q: q,
                showBanned: isBanned
            });
            const res = await fetch(`/api/admin/users?${params.toString()}`);
            const data = await res.json();
            if (res.ok && data.users) {
                setUsers(data.users);
                setPagination(data.pagination);
            } else {
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
        setPagination(prev => ({ ...prev, page: 1 })); // Reset to page 1
        setActiveQuery(searchQuery);
    };

    async function handleUpdateUser(userId, userEmail, updates) {
        // Optimistic update for UI responsiveness
        setUsers(users.map(u => u.id === userId ? { ...u, ...updates } : u));

        try {
            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, email: userEmail, ...updates }),
            });

            if (!res.ok) {
                alert('변경 실패');
                fetchUsers(pagination.page, activeQuery, showBanned); // Revert
            }
        } catch (error) {
            console.error(error);
            fetchUsers(pagination.page, activeQuery, showBanned); // Revert
        }
    }

    async function handleBanUser(userId, userEmail, currentBanStatus) {
        if (userId === users.find(u => u.role === 'admin')?.id) {
            alert('관리자 계정은 차단할 수 없습니다.');
            return;
        }

        const action = currentBanStatus ? '활성화(차단 해제)' : '비활성화(차단)';
        if (!confirm(`[계정 상태 변경]\n대상: ${userEmail}\n\n정말로 이 계정을 ${action} 하시겠습니까?`)) {
            return;
        }

        try {
             // Call API
             await handleUpdateUser(userId, userEmail, { banned: !currentBanStatus });
             
             // Update UI immediately
             setUsers(prevUsers => prevUsers.map(u => u.id === userId ? { ...u, is_banned: !currentBanStatus } : u));
             
             // Success Message
             alert(`정상적으로 ${currentBanStatus ? '활성화' : '차단'} 처리되었습니다.`);
        } catch(e) {
             console.error(e);
             alert('상태 변경 실패');
             fetchUsers(pagination.page, activeQuery, showBanned);
        }
    }

    async function handleDeleteUser(userId, userEmail) {
        if (!confirm(`[영구 삭제 경고]\n대상: ${userEmail}\n\n게시글이 없는 사용자이므로 영구 삭제가 가능합니다.\n정말 삭제하시겠습니까? (복구 불가)`)) {
            return;
        }
        
        try {
            const res = await fetch('/api/admin/users', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });

            if (res.ok) {
                // Update UI immediately
                setUsers(prevUsers => prevUsers.filter(u => u.id !== userId));
                alert('사용자가 영구 삭제되었습니다.');
            } else {
                const data = await res.json();
                // If delete fails, suggest banning
                if (confirm(`삭제 실패: ${data.error}\n\n대신 이 계정을 '차단(비활성화)' 처리하시겠습니까?\n차단하면 로그인이 불가능해집니다.`)) {
                    await handleBanUser(userId, userEmail, false); // false = currently not banned, so ban it
                }
            }
        } catch (error) {
            console.error(error);
            alert('오류 발생');
        }
    }

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.totalPages) {
            setPagination(prev => ({ ...prev, page: newPage }));
        }
    };

    return (
        <>
            <Header />
            <SubPageHero
                title="Admin"
                subtitle="사내 시스템 및 회원 권한 관리"
                bgImage="/images/hero_cy.png"
            />
            <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
                <EmployeeSidebar />
                <main style={{ flex: 1, padding: '40px' }}>
                    <div>
                        <div style={{ marginBottom: '32px' }}>
                            <h1 style={{ fontSize: '2rem', fontWeight: '800', color: '#1e293b', marginBottom: '8px' }}>회원 권한 관리</h1>
                            <p style={{ color: '#64748b' }}>가입된 회원의 시스템 접근 권한을 관리합니다.</p>
                        </div>

                        {/* Search & Filter Toolbar */}
                        <div style={{ marginBottom: '24px', display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', flex: 1, maxWidth: '500px' }}>
                                <input
                                    type="text"
                                    placeholder="이메일, 이름, 권한 검색..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{
                                        flex: 1,
                                        padding: '10px 15px',
                                        borderRadius: '10px',
                                        border: '1px solid #e2e8f0',
                                        outline: 'none'
                                    }}
                                />
                                <button type="submit" style={{
                                    padding: '10px 20px',
                                    background: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '10px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}>검색</button>
                            </form>
                            
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                                <input 
                                    type="checkbox" 
                                    checked={showBanned} 
                                    onChange={(e) => {
                                        setShowBanned(e.target.checked);
                                        setPagination(prev => ({ ...prev, page: 1 }));
                                    }} 
                                    style={{ width: '18px', height: '18px' }}
                                />
                                <span style={{ color: '#64748b', fontWeight: '600' }}>차단된 계정 포함</span>
                            </label>
                        </div>

                        {error && (
                            <div style={{ padding: '16px', backgroundColor: '#fee2e2', color: '#ef4444', borderRadius: '12px', marginBottom: '20px' }}>
                                ⚠️ {error}
                            </div>
                        )}

                        <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', overflow: 'hidden' }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#f1f5f9' }}>
                                            <th style={{ padding: '16px', color: '#475569', fontWeight: '600', width: '200px' }}>이메일</th>
                                            <th style={{ padding: '16px', color: '#475569', fontWeight: '600', width: '120px' }}>이름</th>
                                            <th style={{ padding: '16px', color: '#475569', fontWeight: '600', width: '140px' }}>전화번호</th>
                                            <th style={{ padding: '16px', color: '#475569', fontWeight: '600' }}>지점/권한</th>
                                            <th style={{ padding: '16px', color: '#475569', fontWeight: '600', textAlign: 'center' }}>상태</th>
                                            <th style={{ padding: '16px', color: '#475569', fontWeight: '600', textAlign: 'center', width: '80px' }}>게시글</th>
                                            <th style={{ padding: '16px', color: '#475569', fontWeight: '600', textAlign: 'center' }}>권한 설정</th>
                                            <th style={{ padding: '16px', color: '#475569', fontWeight: '600', textAlign: 'center' }}>관리</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr><td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>데이터 로딩 중...</td></tr>
                                        ) : users.length === 0 ? (
                                            <tr><td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>검색 결과가 없습니다.</td></tr>
                                        ) : users.map((u) => (
                                            <tr key={u.id} style={{ borderTop: '1px solid #f1f5f9', opacity: u.is_banned ? 0.6 : 1, background: u.is_banned ? '#fff1f2' : 'white' }}>
                                                <td style={{ padding: '16px', color: '#1e293b', fontWeight: '500' }}>
                                                    {u.email}
                                                    {u.is_banned && <div style={{fontSize: '0.7rem', color: '#ef4444', fontWeight: 'bold', marginTop: '4px'}}>⛔ 차단됨</div>}
                                                </td>
                                                <td style={{ padding: '16px' }}>
                                                    <input
                                                        type="text"
                                                        defaultValue={u.name || ''}
                                                        placeholder="이름"
                                                        onBlur={(e) => { if (e.target.value !== (u.name || '')) handleUpdateUser(u.id, u.email, { name: e.target.value }); }}
                                                        style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
                                                    />
                                                </td>
                                                <td style={{ padding: '16px' }}>
                                                    <input
                                                        type="text"
                                                        defaultValue={u.phone || ''}
                                                        placeholder="010-0000-0000"
                                                        onBlur={(e) => { if (e.target.value !== (u.phone || '')) handleUpdateUser(u.id, u.email, { phone: e.target.value }); }}
                                                        style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
                                                    />
                                                </td>
                                                                                            <td style={{ padding: '16px' }}>
                                                                                                <div style={{ position: 'relative' }}>
                                                                                                    <select
                                                                                                        value={u.role}
                                                                                                        onChange={(e) => handleUpdateUser(u.id, u.email, { role: e.target.value })}
                                                                                                        style={{ 
                                                                                                            width: '100%', 
                                                                                                            padding: '6px', 
                                                                                                            borderRadius: '6px', 
                                                                                                            border: u.requested_role ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                                                                                                            backgroundColor: u.requested_role ? '#fffbeb' : '#fff'
                                                                                                        }}
                                                                                                    >
                                                                                                        {Object.entries(ROLE_LABELS).map(([key, label]) => (
                                                                                                            <option key={key} value={key}>{label}</option>
                                                                                                        ))}
                                                                                                    </select>
                                                                                                    {u.requested_role && (
                                                                                                        <div style={{ 
                                                                                                            fontSize: '0.7rem', 
                                                                                                            color: '#d97706', 
                                                                                                            marginTop: '4px', 
                                                                                                            fontWeight: 'bold' 
                                                                                                        }}>
                                                                                                            🔔 요청: {getRoleLabel(u.requested_role)}
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                            </td>
                                                
                                                <td style={{ padding: '16px', textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '12px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '700',
                                                        backgroundColor: u.is_banned ? '#fee2e2' : '#dcfce7',
                                                        color: u.is_banned ? '#991b1b' : '#166534'
                                                    }}>
                                                        {u.is_banned ? '차단' : '정상'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '16px', textAlign: 'center', fontWeight: 'bold', color: u.post_count > 0 ? '#3b82f6' : '#cbd5e1' }}>
                                                    {u.post_count}
                                                </td>
                                                <td style={{ padding: '16px', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                                        <label title="쓰기 권한"><input type="checkbox" checked={u.can_write} onChange={(e) => handleUpdateUser(u.id, u.email, { can_write: e.target.checked })} /> ✏️</label>
                                                        <label title="삭제 권한"><input type="checkbox" checked={u.can_delete} onChange={(e) => handleUpdateUser(u.id, u.email, { can_delete: e.target.checked })} /> 🗑️</label>
                                                        <label title="보안 권한"><input type="checkbox" checked={u.can_read_security} onChange={(e) => handleUpdateUser(u.id, u.email, { can_read_security: e.target.checked })} /> 🔐</label>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '16px', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                                                        <button
                                                            onClick={() => handleBanUser(u.id, u.email, u.is_banned)}
                                                            style={{ 
                                                                padding: '6px 12px', 
                                                                borderRadius: '6px', 
                                                                background: u.is_banned ? '#dcfce7' : '#f1f5f9', 
                                                                color: u.is_banned ? '#166534' : '#64748b', 
                                                                border: '1px solid #e2e8f0', 
                                                                cursor: 'pointer', 
                                                                fontSize: '0.8rem', 
                                                                fontWeight: 'bold',
                                                                whiteSpace: 'nowrap',
                                                                minWidth: '60px'
                                                            }}
                                                        >
                                                            {u.is_banned ? '해제' : '차단'}
                                                        </button>

                                                        <button
                                                            onClick={() => handleDeleteUser(u.id, u.email)}
                                                            disabled={u.post_count > 0}
                                                            title={u.post_count > 0 ? '게시글이 있어 삭제 불가' : '영구 삭제'}
                                                            style={{ 
                                                                padding: '6px 12px', 
                                                                borderRadius: '6px', 
                                                                background: u.post_count > 0 ? '#f8fafc' : '#fee2e2', 
                                                                color: u.post_count > 0 ? '#cbd5e1' : '#ef4444', 
                                                                border: u.post_count > 0 ? '1px solid #f1f5f9' : '1px solid #fecaca', 
                                                                cursor: u.post_count > 0 ? 'not-allowed' : 'pointer', 
                                                                fontSize: '0.8rem', 
                                                                fontWeight: 'bold',
                                                                whiteSpace: 'nowrap',
                                                                minWidth: '50px'
                                                            }}
                                                        >
                                                            삭제
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            
                            {/* Pagination Controls */}
                            <div style={{ padding: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', borderTop: '1px solid #f1f5f9' }}>
                                <button 
                                    onClick={() => handlePageChange(pagination.page - 1)} 
                                    disabled={pagination.page === 1}
                                    style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: pagination.page === 1 ? 'not-allowed' : 'pointer', color: pagination.page === 1 ? '#cbd5e1' : '#1e293b' }}
                                >
                                    이전
                                </button>
                                <span style={{ fontWeight: '600', color: '#475569' }}>
                                    {pagination.page} / {pagination.totalPages || 1} 페이지 (총 {pagination.total}명)
                                </span>
                                <button 
                                    onClick={() => handlePageChange(pagination.page + 1)} 
                                    disabled={pagination.page >= pagination.totalPages}
                                    style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: pagination.page >= pagination.totalPages ? 'not-allowed' : 'pointer', color: pagination.page >= pagination.totalPages ? '#cbd5e1' : '#1e293b' }}
                                >
                                    다음
                                </button>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
            <Footer />
        </>
    );
}
