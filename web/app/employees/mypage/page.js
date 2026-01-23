'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { getRoleLabel, ROLE_LABELS } from '@/utils/roles';
import styles from './mypage.module.css';

export default function MyPage() {
    const [user, setUser] = useState(null);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [role, setRole] = useState('');
    const [requestedRole, setRequestedRole] = useState(null); // Track requested role
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        fetchMyInfo();
    }, []);

    async function fetchMyInfo() {
        try {
            const res = await fetch('/api/users/me');
            if (res.ok) {
                const data = await res.json();
                setUser(data.user);
                setName(data.user.name || '');
                setPhone(data.user.phone || '');
                setRole(data.user.role || 'visitor');
                setRequestedRole(data.user.requested_role);
            } else {
                router.push('/login');
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    async function handleSave(e) {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch('/api/users/me', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone, role }),
            });

            if (res.ok) {
                if (role !== user.role) {
                    alert('정보가 저장되었습니다.\n지점(권한) 변경은 관리자 승인 후 반영됩니다.');
                } else {
                    alert('정보가 수정되었습니다.');
                }
                window.location.reload(); 
            } else {
                alert('수정 실패');
            }
        } catch (error) {
            console.error(error);
            alert('오류 발생');
        } finally {
            setSaving(false);
        }
    }

    async function handleWithdraw() {
        const warning = user.post_count > 0 
            ? `[경고] 작성하신 게시글이 ${user.post_count}개 있습니다.\n탈퇴 시 계정은 '비활성화(차단)' 처리되며, 작성한 글은 유지됩니다.\n\n정말 탈퇴하시겠습니까?`
            : `[경고] 작성하신 게시글이 없습니다.\n탈퇴 시 계정은 '즉시 삭제' 되며 복구할 수 없습니다.\n\n정말 탈퇴하시겠습니까?`;

        if (!confirm(warning)) return;

        try {
            const res = await fetch('/api/users/me', { method: 'DELETE' });
            if (res.ok) {
                const data = await res.json();
                await supabase.auth.signOut();
                alert(data.mode === 'deleted' ? '계정이 영구 삭제되었습니다.' : '계정이 비활성화되었습니다.');
                router.push('/');
            } else {
                alert('탈퇴 실패');
            }
        } catch (error) {
            console.error(error);
            alert('오류 발생');
        }
    }

    if (loading) return <div style={{ padding: '100px', textAlign: 'center' }}>로딩 중...</div>;
    if (!user) return null;

    return (
        <>
            <Header darkVariant={true} />
            <div style={{ background: '#f8fafc', minHeight: '100vh', paddingTop: '100px', paddingBottom: '60px' }}>
                <div className={styles.container}>
                    <h1 className={styles.title}>내 정보 수정</h1>
                    
                    <div className={styles.infoBox}>
                        <div className={styles.infoRow}>
                            <span className={styles.infoLabel}>이메일</span>
                            <span className={styles.infoValue}>{user.email}</span>
                        </div>
                        <div className={styles.infoRow}>
                            <span className={styles.infoLabel}>작성 게시글</span>
                            <span className={styles.infoValue} style={{color: '#3b82f6'}}>{user.post_count}개</span>
                        </div>
                    </div>

                    <form onSubmit={handleSave}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>이름</label>
                            <input 
                                type="text" 
                                className={styles.input} 
                                value={name} 
                                onChange={(e) => setName(e.target.value)} 
                                placeholder="이름을 입력하세요"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>소속 지점 (권한)</label>
                            <select 
                                className={styles.input} 
                                value={role} 
                                onChange={(e) => setRole(e.target.value)}
                                style={{ borderColor: requestedRole && requestedRole !== user?.role ? '#f59e0b' : '#e2e8f0' }}
                            >
                                {Object.entries(ROLE_LABELS)
                                    .filter(([key]) => key !== 'admin')
                                    .map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))
                                }
                            </select>
                            {requestedRole && requestedRole !== user?.role && (
                                <div style={{ fontSize: '0.8rem', color: '#d97706', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    ⏳ 변경 요청 대기 중: <strong>{getRoleLabel(requestedRole)}</strong> (관리자 승인 필요)
                                </div>
                            )}
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
                                * 지점 변경 시 관리자 승인이 필요합니다.
                            </div>
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>전화번호</label>
                            <input 
                                type="tel" 
                                className={styles.input} 
                                value={phone} 
                                onChange={(e) => setPhone(e.target.value)} 
                                placeholder="010-0000-0000"
                            />
                        </div>

                        <button type="submit" className={styles.btnSave} disabled={saving}>
                            {saving ? '저장 중...' : '정보 수정 저장'}
                        </button>
                    </form>

                    <div className={styles.divider} />

                    <div className={styles.dangerZone}>
                        <button onClick={handleWithdraw} className={styles.btnWithdraw}>
                            회원 탈퇴하기
                        </button>
                        <p style={{ marginTop: '10px', fontSize: '0.8rem', color: '#94a3b8' }}>
                            탈퇴 시 작성한 게시글 보유 여부에 따라 자동 처리됩니다.
                        </p>
                    </div>
                </div>
            </div>
            <Footer />
        </>
    );
}
