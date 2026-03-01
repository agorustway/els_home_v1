'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../intranet.module.css';

export default function DriverContactsDetailPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const params = useParams();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/driver-contacts/' + params.id);
    }, [role, authLoading, router, params.id]);

    useEffect(() => {
        if (role && params.id) {
            fetch('/api/driver-contacts/' + params.id)
                .then((res) => res.json())
                .then((data) => { if (data.item) setItem(data.item); })
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [role, params.id]);

    const handleDelete = async () => {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        const res = await fetch('/api/driver-contacts/' + params.id, { method: 'DELETE' });
        if (res.ok) router.push('/employees/driver-contacts');
        else alert('삭제 실패');
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!item) return <div className={styles.empty}>항목을 찾을 수 없습니다.</div>;

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>운전원정보 · 상세</h1>
            </div>
            <div className={styles.controls}>
                <Link href={`/employees/driver-contacts/${params.id}/edit`} className={styles.btnSecondary}>수정</Link>
                <button onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                <Link href="/employees/driver-contacts" className={styles.btnSecondary}>목록</Link>
            </div>

            <div className={styles.card}>
                <div style={{ display: 'flex', gap: '40px', marginBottom: '30px' }}>
                    <div style={{ width: 140, height: 140, borderRadius: '20px', background: '#f8fafc', overflow: 'hidden', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {item.photo_url ? <img src={item.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '3rem' }}>👤</span>}
                    </div>
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div>
                            <label style={{ fontWeight: 'bold', color: '#64748b', fontSize: '0.85rem' }}>이름</label>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b' }}>{item.name}</div>
                        </div>
                        <div>
                            <label style={{ fontWeight: 'bold', color: '#64748b', fontSize: '0.85rem' }}>소속지점</label>
                            <div style={{ fontSize: '1.2rem', color: '#10b981', fontWeight: 600 }}>{item.branch || '-'}</div>
                        </div>
                        <div>
                            <label style={{ fontWeight: 'bold', color: '#64748b', fontSize: '0.85rem' }}>연락처</label>
                            <div style={{ fontSize: '1.2rem', color: '#2563eb', fontWeight: 600 }}>{item.phone || '-'}</div>
                        </div>
                        <div>
                            <label style={{ fontWeight: 'bold', color: '#64748b', fontSize: '0.85rem' }}>영업넘버</label>
                            <div>{item.business_number || '-'}</div>
                        </div>
                        <div>
                            <label style={{ fontWeight: 'bold', color: '#64748b', fontSize: '0.85rem' }}>아이디</label>
                            <div style={{ color: '#64748b' }}>{item.driver_id || '-'}</div>
                        </div>
                        <div>
                            <label style={{ fontWeight: 'bold', color: '#64748b', fontSize: '0.85rem' }}>차종</label>
                            <div>{item.vehicle_type || '-'}</div>
                        </div>
                        <div>
                            <label style={{ fontWeight: 'bold', color: '#64748b', fontSize: '0.85rem' }}>샤시종류</label>
                            <div>{item.chassis_type || '-'}</div>
                        </div>
                    </div>
                </div>

                <div className={styles.detailItem} style={{ marginTop: '30px', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                    <label className={styles.detailLabel} style={{ fontWeight: 'bold', color: '#64748b', fontSize: '0.9rem' }}>📎 추가 서류 (최대 10개)</label>
                    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {(item.additional_docs || []).map((file, idx) => (
                            <a key={idx} href={file.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', textDecoration: 'none', color: '#334155', border: '1px solid #e2e8f0' }}>
                                <span>📎 {file.name}</span>
                                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>📥 다운로드</span>
                            </a>
                        ))}
                        {(item.additional_docs || []).length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>첨부된 서류가 없습니다.</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}
