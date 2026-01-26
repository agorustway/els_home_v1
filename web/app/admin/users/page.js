'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SubPageHero from '@/components/SubPageHero';
import IntranetSubNav from '@/components/IntranetSubNav';
import { formatPhoneNumber } from '@/utils/format';
import { getRoleLabel, ROLE_LABELS } from '@/utils/roles';
import styles from './users.module.css';
import layoutStyles from '@/app/employees/(intranet)/intranet.module.css';

export default function AdminUsersPage() {
    const [users, setUsers] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 1 });
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showBanned, setShowBanned] = useState(false);
    const [error, setError] = useState(null);

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
        setPagination(prev => ({ ...prev, page: 1 }));
        setActiveQuery(searchQuery);
    };

    // 로컬 상태만 업데이트 (화면 반영)
    const handleLocalUpdate = (userId, field, value) => {
        setUsers(prevUsers => prevUsers.map(u =>
            u.id === userId ? { ...u, [field]: value, isDirty: true } : u
        ));
    };

    // 실제 DB 저장
    async function handleSaveUser(userId) {
        const userToUpdate = users.find(u => u.id === userId);
        if (!userToUpdate) return;

        // DB 업데이트용 데이터 (isDirty 등 불필요한 필드 제외)
        // role이 변경된 경우 branch는 로직상 role 변경 시 처리되어야 함? 
        // 여기선 단순 필드 업데이트만 보냄.
        const { id, email, name, phone, role, can_write, can_delete, can_read_security } = userToUpdate;
        const updates = { name, phone, role, can_write, can_delete, can_read_security };

        try {
            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: id, email, ...updates }),
            });

            if (res.ok) {
                // 성공 시 isDirty 해제
                setUsers(prevUsers => prevUsers.map(u =>
                    u.id === userId ? { ...u, isDirty: false } : u
                ));
                alert('저장되었습니다.'); // 사용자 요청: 팝업 메시지
            } else {
                const errorData = await res.json();
                console.error('Update Request Failed:', errorData);
                alert(`저장 실패: ${errorData.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error(error);
            alert('네트워크 오류가 발생했습니다.');
        }
    }

    const handleBanUser = async (userId, userEmail, currentBanStatus) => {
        if (userId === users.find(u => u.role === 'admin')?.id) {
            alert('관리자 계정은 차단할 수 없습니다.');
            return;
        }

        const action = currentBanStatus ? '활성화(차단 해제)' : '비활성화(차단)';
        if (!confirm(`[계정 상태 변경]\n대상: ${userEmail}\n\n정말로 이 계정을 ${action} 하시겠습니까?`)) {
            return;
        }

        try {
            // 차단은 즉시 반영 (저장 버튼 없이 기존 로직 유지)
            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, email: userEmail, banned: !currentBanStatus }),
            });

            if (res.ok) {
                setUsers(prevUsers => prevUsers.map(u => u.id === userId ? { ...u, is_banned: !currentBanStatus } : u));
                alert(`정상적으로 ${currentBanStatus ? '활성화' : '차단'} 처리되었습니다.`);
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            console.error(e);
            alert('상태 변경 실패');
            fetchUsers(pagination.page, activeQuery, showBanned);
        }
    }

    const handleDeleteUser = async (userId, userEmail) => {
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
                setUsers(prevUsers => prevUsers.filter(u => u.id !== userId));
                alert('사용자가 영구 삭제되었습니다.');
            } else {
                const data = await res.json();
                if (confirm(`삭제 실패: ${data.error}\n\n대신 이 계정을 '차단(비활성화)' 처리하시겠습니까?\n차단하면 로그인이 불가능해집니다.`)) {
                    await handleBanUser(userId, userEmail, false);
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
            <IntranetSubNav />
            <main className={layoutStyles.mainContent}>
                <div className={styles.adminContainer}>
                    <div style={{ marginBottom: '24px', padding: '0 15px' }}>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#1e293b', marginBottom: '4px' }}>회원 권한 관리</h1>
                        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>가입된 회원의 시스템 접근 권한을 관리합니다.</p>
                    </div>

                    {/* Search & Filter Toolbar */}
                    <div style={{ marginBottom: '24px', display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: '0 15px' }}>
                        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '300px' }}>
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
                        <div style={{ margin: '0 15px 20px', padding: '16px', backgroundColor: '#fee2e2', color: '#ef4444', borderRadius: '12px' }}>
                            ⚠️ {error}
                        </div>
                    )}

                    {/* Desktop Table */}
                    <div className={styles.tableWrapper} style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', overflow: 'hidden', margin: '0 15px' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1100px' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f1f5f9' }}>
                                        <th style={{ padding: '16px', color: '#475569', fontWeight: '600', width: '220px' }}>이메일</th>
                                        <th style={{ padding: '16px', color: '#475569', fontWeight: '600', width: '130px' }}>이름</th>
                                        <th style={{ padding: '16px', color: '#475569', fontWeight: '600', width: '150px' }}>전화번호</th>
                                        <th style={{ padding: '16px', color: '#475569', fontWeight: '600' }}>지점/권한</th>
                                        <th style={{ padding: '16px', color: '#475569', fontWeight: '600', textAlign: 'center', width: '80px' }}>상태</th>
                                        <th style={{ padding: '16px', color: '#475569', fontWeight: '600', textAlign: 'center', width: '80px' }}>게시글</th>
                                        <th style={{ padding: '16px', color: '#475569', fontWeight: '600', textAlign: 'center', width: '150px' }}>권한 설정</th>
                                        <th style={{ padding: '16px', color: '#475569', fontWeight: '600', textAlign: 'center', width: '160px' }}>관리</th>
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
                                                {u.is_banned && <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 'bold', marginTop: '4px' }}>⛔ 차단됨</div>}
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                <input
                                                    type="text"
                                                    value={u.name || ''}
                                                    placeholder="이름"
                                                    onChange={(e) => handleLocalUpdate(u.id, 'name', e.target.value)}
                                                    style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
                                                />
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                <input
                                                    type="text"
                                                    value={u.phone || ''}
                                                    placeholder="010-0000-0000"
                                                    onInput={(e) => { e.target.value = formatPhoneNumber(e.target.value); }}
                                                    onChange={(e) => handleLocalUpdate(u.id, 'phone', e.target.value)}
                                                    style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
                                                />
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                <div style={{ position: 'relative' }}>
                                                    <select
                                                        value={u.role}
                                                        onChange={(e) => handleLocalUpdate(u.id, 'role', e.target.value)}
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
                                                        <div style={{ fontSize: '0.7rem', color: '#d97706', marginTop: '4px', fontWeight: 'bold' }}>
                                                            🔔 요청: {getRoleLabel(u.requested_role)}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'center' }}>
                                                <span style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '700', backgroundColor: u.is_banned ? '#fee2e2' : '#dcfce7', color: u.is_banned ? '#991b1b' : '#166534' }}>
                                                    {u.is_banned ? '차단' : '정상'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'center', fontWeight: 'bold', color: u.post_count > 0 ? '#3b82f6' : '#cbd5e1' }}>
                                                {u.post_count}
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                    <label title="쓰기"><input type="checkbox" checked={u.can_write || false} onChange={(e) => handleLocalUpdate(u.id, 'can_write', e.target.checked)} /> ✏️</label>
                                                    <label title="삭제"><input type="checkbox" checked={u.can_delete || false} onChange={(e) => handleLocalUpdate(u.id, 'can_delete', e.target.checked)} /> 🗑️</label>
                                                    <label title="보안"><input type="checkbox" checked={u.can_read_security || false} onChange={(e) => handleLocalUpdate(u.id, 'can_read_security', e.target.checked)} /> 🔐</label>
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => handleSaveUser(u.id)}
                                                    disabled={!u.isDirty}
                                                    style={{
                                                        padding: '6px 12px', borderRadius: '6px',
                                                        background: u.isDirty ? '#4f46e5' : '#e2e8f0',
                                                        color: u.isDirty ? 'white' : '#94a3b8',
                                                        border: 'none', cursor: u.isDirty ? 'pointer' : 'default', fontWeight: 'bold'
                                                    }}
                                                >
                                                    {u.isDirty ? '💾 저장' : '완료'}
                                                </button>
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                    <button onClick={() => handleBanUser(u.id, u.email, u.is_banned)} style={{ padding: '6px 10px', borderRadius: '6px', background: u.is_banned ? '#dcfce7' : '#f1f5f9', color: u.is_banned ? '#166534' : '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                        {u.is_banned ? '해제' : '차단'}
                                                    </button>
                                                    <button onClick={() => handleDeleteUser(u.id, u.email)} disabled={u.post_count > 0} style={{ padding: '6px 10px', borderRadius: '6px', background: u.post_count > 0 ? '#f8fafc' : '#fee2e2', color: u.post_count > 0 ? '#cbd5e1' : '#ef4444', border: '1px solid #e2e8f0', cursor: u.post_count > 0 ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                        삭제
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Mobile Card List */}
                    <div className={styles.cardList} style={{ padding: '0 15px' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>로딩 중...</div>
                        ) : users.map((u) => (
                            <div key={u.id} className={styles.userCard} style={{ opacity: u.is_banned ? 0.7 : 1, background: u.is_banned ? '#fff1f2' : 'white' }}>
                                <div className={styles.cardHeader}>
                                    <div className={styles.cardEmail}>{u.email}</div>
                                    <span className={styles.cardStatus} style={{ backgroundColor: u.is_banned ? '#fee2e2' : '#dcfce7', color: u.is_banned ? '#991b1b' : '#166534' }}>
                                        {u.is_banned ? '차단됨' : '정상'}
                                    </span>
                                </div>
                                <div className={styles.cardGrid}>
                                    <div className={styles.infoGroup}>
                                        <label>이름</label>
                                        <input type="text" value={u.name || ''} onChange={(e) => handleLocalUpdate(u.id, 'name', e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem' }} />
                                    </div>
                                    <div className={styles.infoGroup}>
                                        <label>전화번호</label>
                                        <input
                                            type="text"
                                            value={u.phone || ''}
                                            onInput={(e) => { e.target.value = formatPhoneNumber(e.target.value); }}
                                            onChange={(e) => handleLocalUpdate(u.id, 'phone', e.target.value)}
                                            style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem' }}
                                        />
                                    </div>
                                    <div className={styles.infoGroup} style={{ gridColumn: 'span 2' }}>
                                        <label>지점 및 권한</label>
                                        <select value={u.role} onChange={(e) => handleLocalUpdate(u.id, 'role', e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem' }}>
                                            {Object.entries(ROLE_LABELS).map(([key, label]) => (
                                                <option key={key} value={key}>{label}</option>
                                            ))}
                                        </select>
                                        {u.requested_role && <div style={{ fontSize: '0.7rem', color: '#d97706', marginTop: '4px' }}>🔔 요청: {getRoleLabel(u.requested_role)}</div>}
                                    </div>
                                </div>

                                <div className={styles.cardPermissions}>
                                    <label className={styles.permItem}>
                                        <input type="checkbox" checked={u.can_write || false} onChange={(e) => handleLocalUpdate(u.id, 'can_write', e.target.checked)} />
                                        <span>쓰기✏️</span>
                                    </label>
                                    <label className={styles.permItem}>
                                        <input type="checkbox" checked={u.can_delete || false} onChange={(e) => handleLocalUpdate(u.id, 'can_delete', e.target.checked)} />
                                        <span>삭제🗑️</span>
                                    </label>
                                    <label className={styles.permItem}>
                                        <input type="checkbox" checked={u.can_read_security || false} onChange={(e) => handleLocalUpdate(u.id, 'can_read_security', e.target.checked)} />
                                        <span>보안🔐</span>
                                    </label>
                                </div>

                                <div className={styles.cardActions} style={{ flexWrap: 'wrap' }}>
                                    <button
                                        onClick={() => handleSaveUser(u.id)}
                                        disabled={!u.isDirty}
                                        style={{
                                            width: '100%', marginBottom: '10px', padding: '12px', borderRadius: '8px',
                                            background: u.isDirty ? '#4f46e5' : '#e2e8f0',
                                            color: u.isDirty ? 'white' : '#94a3b8',
                                            border: 'none', fontWeight: '700', fontSize: '0.95rem', cursor: u.isDirty ? 'pointer' : 'default'
                                        }}
                                    >
                                        {u.isDirty ? '💾 변경사항 저장' : '저장됨'}
                                    </button>
                                    <button onClick={() => handleBanUser(u.id, u.email, u.is_banned)} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: u.is_banned ? '#dcfce7' : '#f1f5f9', color: u.is_banned ? '#166534' : '#64748b', border: '1px solid #e2e8f0', fontWeight: '700', fontSize: '0.85rem' }}>
                                        {u.is_banned ? '차단 해제' : '계정 차단'}
                                    </button>
                                    <button onClick={() => handleDeleteUser(u.id, u.email)} disabled={u.post_count > 0} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: u.post_count > 0 ? '#f8fafc' : '#fee2e2', color: u.post_count > 0 ? '#cbd5e1' : '#ef4444', border: '1px solid #e2e8f0', fontWeight: '700', fontSize: '0.85rem' }}>
                                        사용자 삭제
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Pagination Controls */}
                    <div style={{ padding: '20px 15px', display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center', borderTop: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', gap: '15px' }}>
                            <button onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page === 1} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: pagination.page === 1 ? 'not-allowed' : 'pointer', color: pagination.page === 1 ? '#cbd5e1' : '#1e293b', fontWeight: '600' }}>이전</button>
                            <button onClick={() => handlePageChange(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: pagination.page >= pagination.totalPages ? 'not-allowed' : 'pointer', color: pagination.page >= pagination.totalPages ? '#cbd5e1' : '#1e293b', fontWeight: '600' }}>다음</button>
                        </div>
                        <span style={{ fontWeight: '600', color: '#475569', fontSize: '0.9rem' }}>
                            {pagination.page} / {pagination.totalPages || 1} 페이지 (총 {pagination.total}명)
                        </span>
                    </div>
                </div>
            </main>
            <Footer />
        </>
    );
}
