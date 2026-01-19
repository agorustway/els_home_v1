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
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    async function fetchUsers() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/users');
            const data = await res.json();
            if (res.ok && data.users) {
                setUsers(data.users);
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

    async function handleUpdateUser(userId, userEmail, updates) {
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, email: userEmail, ...updates }),
            });

            if (res.ok) {
                setUsers(users.map(u => u.id === userId ? { ...u, ...updates } : u));
            } else {
                alert('변경 실패');
            }
        } catch (error) {
            console.error(error);
        }
    }

    const filteredUsers = users.filter(u =>
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getRoleLabel(u.role).toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>데이터 로딩 중...</div>;

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

                        <div style={{ marginBottom: '24px' }}>
                            <input
                                type="text"
                                placeholder="이메일 또는 권한으로 검색..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '12px 20px',
                                    borderRadius: '12px',
                                    border: '1px solid #e2e8f0',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        {error && (
                            <div style={{
                                padding: '16px 24px',
                                backgroundColor: '#fee2e2',
                                color: '#ef4444',
                                borderRadius: '12px',
                                marginBottom: '24px',
                                fontWeight: '500'
                            }}>
                                ⚠️ {error}
                            </div>
                        )}

                        <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f1f5f9' }}>
                                        <th style={{ padding: '16px 24px', color: '#475569', fontWeight: '600' }}>이메일</th>
                                        <th style={{ padding: '16px 24px', color: '#475569', fontWeight: '600' }}>지점/권한</th>
                                        <th style={{ padding: '16px 24px', color: '#475569', fontWeight: '600' }}>권한 변경</th>
                                        <th style={{ padding: '16px 24px', color: '#475569', fontWeight: '600', textAlign: 'center' }}>쓰기</th>
                                        <th style={{ padding: '16px 24px', color: '#475569', fontWeight: '600', textAlign: 'center' }}>삭제</th>
                                        <th style={{ padding: '16px 24px', color: '#475569', fontWeight: '600', textAlign: 'center' }}>보안폴더</th>
                                        <th style={{ padding: '16px 24px', color: '#475569', fontWeight: '600' }}>가입일</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map((u) => (
                                        <tr key={u.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '16px 24px', color: '#1e293b', fontWeight: '500' }}>{u.email}</td>
                                            <td style={{ padding: '16px 24px' }}>
                                                <span style={{
                                                    backgroundColor: u.role === 'admin' ? '#fee2e2' : '#f1f5f9',
                                                    color: u.role === 'admin' ? '#ef4444' : '#64748b',
                                                    padding: '4px 10px',
                                                    borderRadius: '20px',
                                                    fontSize: '0.85rem',
                                                    fontWeight: '600'
                                                }}>
                                                    {getRoleLabel(u.role)}
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px 24px' }}>
                                                <select
                                                    value={u.role}
                                                    onChange={(e) => handleUpdateUser(u.id, u.email, { role: e.target.value })}
                                                    style={{
                                                        padding: '6px 12px',
                                                        borderRadius: '8px',
                                                        border: '1px solid #e2e8f0',
                                                        backgroundColor: '#fff',
                                                        outline: 'none',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {Object.entries(ROLE_LABELS).map(([key, label]) => (
                                                        <option key={key} value={key}>{label}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={u.can_write || u.role === 'admin'}
                                                    disabled={u.role === 'admin'}
                                                    onChange={(e) => handleUpdateUser(u.id, u.email, { can_write: e.target.checked })}
                                                    style={{ width: '18px', height: '18px', cursor: u.role === 'admin' ? 'default' : 'pointer' }}
                                                />
                                            </td>
                                            <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={u.can_delete || u.role === 'admin'}
                                                    disabled={u.role === 'admin'}
                                                    onChange={(e) => handleUpdateUser(u.id, u.email, { can_delete: e.target.checked })}
                                                    style={{ width: '18px', height: '18px', cursor: u.role === 'admin' ? 'default' : 'pointer' }}
                                                />
                                            </td>
                                            <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={u.can_read_security || u.role === 'admin'}
                                                    disabled={u.role === 'admin'}
                                                    onChange={(e) => handleUpdateUser(u.id, u.email, { can_read_security: e.target.checked })}
                                                    style={{ width: '18px', height: '18px', cursor: u.role === 'admin' ? 'default' : 'pointer' }}
                                                />
                                            </td>
                                            <td style={{ padding: '16px 24px', color: '#94a3b8', fontSize: '0.9rem' }}>
                                                {new Date(u.created_at).toLocaleDateString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </main>
            </div>
            <Footer />
        </>
    );
}
