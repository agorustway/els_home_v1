'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../intranet.module.css';

export default function InternalContactDetailPage() {
    const { id } = useParams();
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);

    const getSafeUrl = (url) => {
        if (!url) return '';
        let target = url;
        if (target.startsWith('http')) {
            try {
                const parsed = new URL(target);
                target = parsed.pathname + parsed.search;
            } catch (e) { }
        }
        return target;
    };

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/internal-contacts/' + id);
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role && id) {
            fetch('/api/internal-contacts/' + id)
                .then((res) => res.json())
                .then((data) => setItem(data.item))
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [role, id]);

    const handleDelete = async () => {
        if (!confirm('삭제하시겠습니까?')) return;
        const res = await fetch('/api/internal-contacts/' + id, { method: 'DELETE' });
        if (res.ok) router.push('/employees/internal-contacts');
        else alert('삭제 실패');
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!role) return null;
    if (!item) return <div className={styles.loading}>연락처를 찾을 수 없습니다.</div>;

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>사내연락망</h1>
                <div className={styles.controls}>
                    <Link href={'/employees/internal-contacts/' + id + '/edit'} className={styles.btnSecondary}>수정</Link>
                    <button type="button" onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                    <Link href="/employees/internal-contacts" className={styles.btnSecondary}>목록</Link>
                </div>
            </div>
            
            <div className={styles.card} style={{ padding: '32px' }}>
                <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9', paddingBottom: '32px', marginBottom: '32px' }}>
                    {item.photo_url ? (
                        <img src={getSafeUrl(item.photo_url)} alt="" style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 20, boxShadow: '0 8px 16px rgba(0,0,0,0.05)', border: '4px solid #fff' }} />
                    ) : (
                        <div style={{ width: 140, height: 140, background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '3rem', fontWeight: 800 }}>{item.name?.charAt(0)}</div>
                    )}
                    <div style={{ flex: 1, minWidth: 260 }}>
                        <div>
                            <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#003366', margin: 0, letterSpacing: '-0.5px' }}>{item.name}</h1>
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                <span style={{ background: '#eff6ff', color: '#2563eb', padding: '6px 16px', borderRadius: '30px', fontSize: '0.88rem', fontWeight: 700 }}>{item.department}</span>
                                <span style={{ background: '#f8fafc', color: '#64748b', padding: '6px 16px', borderRadius: '30px', fontSize: '0.88rem', fontWeight: 700 }}>{item.position}</span>
                            </div>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '32px', marginTop: '32px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>연락처</label>
                                <a href={`tel:${item.phone}`} style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l2.19-1.19a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                    {item.phone}
                                </a>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>이메일</label>
                                <p style={{ fontSize: '1.15rem', fontWeight: 600, color: '#475569', margin: 0 }}>{item.email || '미등록'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '32px', borderRadius: '24px', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        <label style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1.5px', margin: 0 }}>기타 메모 및 업무 특이사항</label>
                    </div>
                    <div style={{ color: '#334155', fontSize: '1.05rem', lineHeight: '1.8', whiteSpace: 'pre-wrap', fontWeight: 500 }}>
                        {item.memo || '현재 등록된 추가 메모 정보가 없습니다.'}
                    </div>
                </div>
            </div>
        </div>
    );
}
