'use client';

import { useState, useEffect } from 'react';
import { formatPhoneNumber } from '@/utils/format';
import { getRoleLabel, ROLE_LABELS } from '@/utils/roles';
import styles from './users.module.css';

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

    // 실제 DB 저장 (단일)
    async function handleSaveUser(userId) {
        const userToUpdate = users.find(u => u.id === userId);
        if (!userToUpdate) return;

        // DB 업데이트용 데이터
        // Email을 식별자로 사용
        const { id, email, name, phone, role, rank, position, can_write, can_delete, can_read_security } = userToUpdate;
        const updates = { name, phone, role, rank, position, can_write, can_delete, can_read_security };

        try {
            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, ...updates }), // userId 대신 email 사용
            });

            if (res.ok) {
                // 성공 시 isDirty 해제
                setUsers(prevUsers => prevUsers.map(u =>
                    u.id === userId ? { ...u, isDirty: false } : u
                ));
                alert('저장되었습니다.');
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

    // 전체 저장 (변경된 항목만)
    async function handleSaveAll() {
        const dirtyUsers = users.filter(u => u.isDirty);
        if (dirtyUsers.length === 0) {
            alert('변경사항이 없습니다.');
            return;
        }

        if (!confirm(`${dirtyUsers.length}명의 변경사항을 저장하시겠습니까?`)) return;

        let successCount = 0;
        let failCount = 0;

        // 병렬 처리로 모든 요청 전송
        await Promise.all(dirtyUsers.map(async (user) => {
            const { email, name, phone, role, rank, position, can_write, can_delete, can_read_security } = user;
            const updates = { name, phone, role, rank, position, can_write, can_delete, can_read_security };

            try {
                const res = await fetch('/api/admin/users', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, ...updates }),
                });

                if (res.ok) {
                    successCount++;
                    setUsers(prevUsers => prevUsers.map(u =>
                        u.email === email ? { ...u, isDirty: false } : u
                    ));
                } else {
                    failCount++;
                }
            } catch (error) {
                failCount++;
            }
        }));

        alert(`저장 완료: 성공 ${successCount}건, 실패 ${failCount}건`);
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
        <div className={styles.adminContainer}>
            <div className={styles.mainContent}>
                <header className={styles.compactHeader}>
                    <h1 className={styles.pageTitle}>회원 권한 관리</h1>
                    <div className={styles.headerActions}>
                        {users.some(u => u.isDirty) && (
                            <button onClick={handleSaveAll} className={`${styles.btn} ${styles.btnPoint}`}>
                                전체 저장 ({users.filter(u => u.isDirty).length})
                            </button>
                        )}
                        <button type="button" onClick={() => fetchUsers(pagination.page, activeQuery, showBanned)} className={styles.btn} title="목록 새로고침">
                            새로고침
                        </button>
                    </div>
                </header>

                {/* Search & Filter Toolbar */}
                <div className={styles.toolbar}>
                    <form onSubmit={handleSearch} className={styles.toolbarForm}>
                        <input
                            type="text"
                            placeholder="이메일, 이름, 권한 검색..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={styles.textInput}
                        />
                        <button type="submit" className={`${styles.btn} ${styles.btnPoint}`}>검색</button>
                    </form>

                    <div className={styles.toolbarActions}>

                        <label className={styles.filterCheck}>
                            <input
                                type="checkbox"
                                checked={showBanned}
                                onChange={(e) => {
                                    setShowBanned(e.target.checked);
                                    setPagination(prev => ({ ...prev, page: 1 }));
                                }}
                            />
                            <span>차단된 계정 포함</span>
                        </label>
                    </div>
                </div>

                {error && (
                    <div className={styles.errorBox}>
                        {error}
                    </div>
                )}

                {/* Desktop Table */}
                <div className={styles.tableWrapper}>
                    <div className={styles.scrollX}>
                        <table className={styles.adminTable} style={{ minWidth: '1100px' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '200px' }}>이메일</th>
                                    <th style={{ width: '100px' }}>이름</th>
                                    <th style={{ width: '160px' }}>직급/직책</th>
                                    <th style={{ width: '140px' }}>전화번호</th>
                                    <th style={{ width: '180px' }}>지점/권한</th>
                                    <th style={{ textAlign: 'center', width: '80px' }}>상태</th>
                                    <th style={{ textAlign: 'center', width: '80px' }}>게시글</th>
                                    <th style={{ textAlign: 'center', width: '130px' }}>권한 설정</th>
                                    <th style={{ textAlign: 'center', width: '180px' }}>관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="9" className={styles.empty}>데이터를 불러오는 중입니다...</td></tr>
                                ) : users.length === 0 ? (
                                    <tr><td colSpan="9" className={styles.empty}>검색 결과가 없습니다.</td></tr>
                                ) : users.map((u) => (
                                    <tr key={u.id} className={u.is_banned ? styles.mutedRow : ''}>
                                        <td className={styles.breakCell} style={{ color: '#1e293b', fontWeight: '600' }}>
                                            {u.email}
                                            {u.is_banned && <div className={styles.statusNote}>차단됨</div>}
                                        </td>
                                        <td>
                                            <input
                                                type="text"
                                                value={u.name || ''}
                                                placeholder="이름"
                                                onChange={(e) => handleLocalUpdate(u.id, 'name', e.target.value)}
                                                className={styles.tableInput}
                                            />
                                        </td>
                                        <td>
                                            <div className={styles.inlineInputs}>
                                                <input
                                                    type="text"
                                                    value={u.rank || ''}
                                                    placeholder="직급"
                                                    onChange={(e) => handleLocalUpdate(u.id, 'rank', e.target.value)}
                                                    className={styles.tableInput}
                                                />
                                                <input
                                                    type="text"
                                                    value={u.position || ''}
                                                    placeholder="직책"
                                                    onChange={(e) => handleLocalUpdate(u.id, 'position', e.target.value)}
                                                    className={styles.tableInput}
                                                />
                                            </div>
                                        </td>
                                        <td>
                                            <input
                                                type="text"
                                                value={u.phone || ''}
                                                placeholder="010-0000-0000"
                                                onInput={(e) => { e.target.value = formatPhoneNumber(e.target.value); }}
                                                onChange={(e) => handleLocalUpdate(u.id, 'phone', e.target.value)}
                                                className={styles.tableInput}
                                            />
                                        </td>
                                        <td>
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
                                                    <div className={styles.requestNote}>
                                                        요청: {getRoleLabel(u.requested_role)}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '700', backgroundColor: u.is_banned ? '#fee2e2' : '#dcfce7', color: u.is_banned ? '#991b1b' : '#166534' }}>
                                                {u.is_banned ? '차단' : '정상'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: u.post_count > 0 ? '#3b82f6' : '#cbd5e1' }}>
                                            {u.post_count}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div className={styles.permissionGroup}>
                                                <label className={styles.permissionLabel} title="쓰기"><input type="checkbox" checked={u.can_write || false} onChange={(e) => handleLocalUpdate(u.id, 'can_write', e.target.checked)} /> 쓰기</label>
                                                <label className={styles.permissionLabel} title="삭제"><input type="checkbox" checked={u.can_delete || false} onChange={(e) => handleLocalUpdate(u.id, 'can_delete', e.target.checked)} /> 삭제</label>
                                                <label className={styles.permissionLabel} title="보안"><input type="checkbox" checked={u.can_read_security || false} onChange={(e) => handleLocalUpdate(u.id, 'can_read_security', e.target.checked)} /> 보안</label>
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div className={styles.rowActions} style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                                                <button
                                                    onClick={() => handleSaveUser(u.id)}
                                                    disabled={!u.isDirty}
                                                    className={`${styles.saveButton} ${u.isDirty ? styles.saveButtonActive : ''}`}
                                                >
                                                    {u.isDirty ? '저장' : '완료'}
                                                </button>
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
                <div className={styles.cardList}>
                    {loading ? (
                        <div className={styles.empty}>데이터를 불러오는 중입니다...</div>
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
                                <div className={styles.infoGroup}>
                                    <label>직급</label>
                                    <input type="text" value={u.rank || ''} onChange={(e) => handleLocalUpdate(u.id, 'rank', e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem' }} />
                                </div>
                                <div className={styles.infoGroup}>
                                    <label>직책</label>
                                    <input type="text" value={u.position || ''} onChange={(e) => handleLocalUpdate(u.id, 'position', e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem' }} />
                                </div>
                                <div className={styles.infoGroup} style={{ gridColumn: 'span 2' }}>
                                    <label>지점 및 권한</label>
                                    <select value={u.role} onChange={(e) => handleLocalUpdate(u.id, 'role', e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem' }}>
                                        {Object.entries(ROLE_LABELS).map(([key, label]) => (
                                            <option key={key} value={key}>{label}</option>
                                        ))}
                                    </select>
                                    {u.requested_role && <div className={styles.requestNote}>요청: {getRoleLabel(u.requested_role)}</div>}
                                </div>
                            </div>

                            <div className={styles.cardPermissions}>
                                <label className={styles.permItem}>
                                    <input type="checkbox" checked={u.can_write || false} onChange={(e) => handleLocalUpdate(u.id, 'can_write', e.target.checked)} />
                                    <span>쓰기</span>
                                </label>
                                <label className={styles.permItem}>
                                    <input type="checkbox" checked={u.can_delete || false} onChange={(e) => handleLocalUpdate(u.id, 'can_delete', e.target.checked)} />
                                    <span>삭제</span>
                                </label>
                                <label className={styles.permItem}>
                                    <input type="checkbox" checked={u.can_read_security || false} onChange={(e) => handleLocalUpdate(u.id, 'can_read_security', e.target.checked)} />
                                    <span>보안</span>
                                </label>
                            </div>

                            <div className={styles.cardActions} style={{ flexWrap: 'wrap' }}>
                                <button
                                    onClick={() => handleSaveUser(u.id)}
                                    disabled={!u.isDirty}
                                    className={`${styles.btn} ${u.isDirty ? styles.btnPoint : ''}`}
                                    style={{ width: '100%', marginBottom: '6px' }}
                                >
                                    {u.isDirty ? '변경사항 저장' : '저장됨'}
                                </button>
                                <button onClick={() => handleBanUser(u.id, u.email, u.is_banned)} className={styles.btn} style={{ flex: 1 }}>
                                    {u.is_banned ? '차단 해제' : '계정 차단'}
                                </button>
                                <button onClick={() => handleDeleteUser(u.id, u.email)} disabled={u.post_count > 0} className={styles.btn} style={{ flex: 1, color: '#ef4444' }}>
                                    사용자 삭제
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Pagination Controls */}
                <div className={styles.pagination}>
                    <div className={styles.paginationButtons}>
                        <button onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page === 1} className={styles.btn}>이전</button>
                        <button onClick={() => handlePageChange(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className={styles.btn}>다음</button>
                    </div>
                    <span className={styles.paginationText}>
                        {pagination.page} / {pagination.totalPages || 1} 페이지 (총 {pagination.total}명)
                    </span>
                </div>
            </div>
        </div>
    );
}
