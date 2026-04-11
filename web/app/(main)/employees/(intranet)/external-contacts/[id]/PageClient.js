'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../intranet.module.css';

export default function ExternalContactDetailPage() {
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
        if (!authLoading && !role) router.replace('/login?next=/employees/external-contacts/' + id);
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role && id) {
            fetch('/api/external-contacts/' + id)
                .then((res) => res.json())
                .then((data) => setItem(data.item))
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [role, id]);

    const handleDelete = async () => {
        if (!confirm('삭제하시겠습니까?')) return;
        const res = await fetch('/api/external-contacts/' + id, { method: 'DELETE' });
        if (res.ok) router.push('/employees/external-contacts');
        else alert('삭제 실패');
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!role) return null;
    if (!item) return <div className={styles.loading}>연락처를 찾을 수 없습니다.</div>;

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>외부연락처</h1>
                <div className={styles.controls}>
                    <Link href={'/employees/external-contacts/' + id + '/edit'} className={styles.btnSecondary}>수정</Link>
                    <button type="button" onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                    <Link href="/employees/external-contacts" className={styles.btnSecondary}>목록</Link>
                </div>
            </div>
            
            <div className={styles.card} style={{ padding: '32px' }}>
                <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '24px', marginBottom: '32px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <span style={{ background: '#f8fafc', color: '#475569', padding: '4px 12px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 700, border: '1px solid #e2e8f0', marginBottom: 12, display: 'inline-block' }}>{item.contact_type || '구분 없음'}</span>
                            <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>{item.company_name}</h1>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '40px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <section>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>🏢 회사 정보</label>
                            <div style={{ background: '#fff', border: '1px solid #f1f5f9', padding: '16px', borderRadius: '12px' }}>
                                <p style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#475569' }}><strong>대표 연락처:</strong> <a href={`tel:${item.phone}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{item.phone || '-'}</a></p>
                                <p style={{ margin: 0, fontSize: '1rem', color: '#475569' }}><strong>이메일:</strong> {item.email || '-'}</p>
                            </div>
                        </section>

                        <section>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>👤 담당자 정보</label>
                            <div style={{ background: '#fff', border: '1px solid #f1f5f9', padding: '16px', borderRadius: '12px' }}>
                                <p style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#475569' }}><strong>성함/직함:</strong> {item.contact_person || '-'}</p>
                                <p style={{ margin: 0, fontSize: '1rem', color: '#475569' }}><strong>담당자 연락처:</strong> <a href={`tel:${item.contact_person_phone}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{item.contact_person_phone || '-'}</a></p>
                            </div>
                        </section>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <section>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>📍 소재지</label>
                            <div style={{ background: '#fff', border: '1px solid #f1f5f9', padding: '16px', borderRadius: '12px', minHeight: '80px', color: '#475569', fontSize: '1rem', lineHeight: '1.6' }}>
                                {item.address || '등록된 주소 정보가 없습니다.'}
                            </div>
                        </section>

                        <section>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>🗒️ 메모 및 비고</label>
                            <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', padding: '16px', borderRadius: '12px', minHeight: '120px', color: '#1e293b', fontSize: '0.95rem', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                                {item.memo || '현재 등록된 추가 메모 정보가 없습니다.'}
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
