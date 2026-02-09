'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../intranet.module.css';

export default function PartnerContactsDetailPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const params = useParams();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/partner-contacts/' + params.id);
    }, [role, authLoading, router, params.id]);

    useEffect(() => {
        if (role && params.id) {
            fetch('/api/partner-contacts/' + params.id)
                .then((res) => res.json())
                .then((data) => { if (data.item) setItem(data.item); })
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [role, params.id]);

    const handleDelete = async () => {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        const res = await fetch('/api/partner-contacts/' + params.id, { method: 'DELETE' });
        if (res.ok) router.push('/employees/partner-contacts');
        else alert('삭제 실패');
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!item) return <div className={styles.empty}>항목을 찾을 수 없습니다.</div>;

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>협력사정보 · 상세</h1>
            </div>
            <div className={styles.controls}>
                <Link href={`/employees/partner-contacts/${params.id}/edit`} className={styles.btnSecondary}>수정</Link>
                <button onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                <Link href="/employees/partner-contacts" className={styles.btnSecondary}>목록</Link>
            </div>

            <div className={styles.card}>
                <div className={styles.detailGrid} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                    <div className={styles.detailItem}>
                        <label className={styles.detailLabel} style={{ fontWeight: 'bold', color: '#64748b', fontSize: '0.9rem' }}>회사명</label>
                        <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#1e293b', marginTop: '5px' }}>{item.company_name}</div>
                    </div>
                    <div className={styles.detailItem}>
                        <label className={styles.detailLabel} style={{ fontWeight: 'bold', color: '#64748b', fontSize: '0.9rem' }}>대표자</label>
                        <div style={{ marginTop: '5px' }}>{item.ceo_name}</div>
                    </div>
                    <div className={styles.detailItem}>
                        <label className={styles.detailLabel} style={{ fontWeight: 'bold', color: '#64748b', fontSize: '0.9rem' }}>회사 전화번호</label>
                        <div style={{ marginTop: '5px' }}>{item.phone}</div>
                    </div>
                    <div className={styles.detailItem}>
                        <label className={styles.detailLabel} style={{ fontWeight: 'bold', color: '#64748b', fontSize: '0.9rem' }}>소재지</label>
                        <div style={{ marginTop: '5px' }}>{item.address}</div>
                    </div>
                    <div className={styles.detailItem}>
                        <label className={styles.detailLabel} style={{ fontWeight: 'bold', color: '#64748b', fontSize: '0.9rem' }}>담당자명</label>
                        <div style={{ marginTop: '5px', fontWeight: 600 }}>{item.manager_name}</div>
                    </div>
                    <div className={styles.detailItem}>
                        <label className={styles.detailLabel} style={{ fontWeight: 'bold', color: '#64748b', fontSize: '0.9rem' }}>담당자 연락처</label>
                        <div style={{ marginTop: '5px', color: '#2563eb', fontWeight: 600 }}>{item.manager_phone}</div>
                    </div>
                </div>

                <div className={styles.detailItem} style={{ marginTop: '30px', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                    <label className={styles.detailLabel} style={{ fontWeight: 'bold', color: '#64748b', fontSize: '0.9rem' }}>비고 (메모)</label>
                    <div style={{ marginTop: '10px', whiteSpace: 'pre-wrap', color: '#334155' }}>{item.memo || '(내용 없음)'}</div>
                </div>

                <div className={styles.detailItem} style={{ marginTop: '30px', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                    <label className={styles.detailLabel} style={{ fontWeight: 'bold', color: '#64748b', fontSize: '0.9rem' }}>📎 첨부 서류</label>
                    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {(item.attachments || []).map((file, idx) => (
                            <a key={idx} href={file.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', textDecoration: 'none', color: '#334155', border: '1px solid #e2e8f0' }}>
                                <span><span style={{ fontWeight: 'bold', color: '#2563eb', marginRight: '10px' }}>[{file.category}]</span> {file.name}</span>
                                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>📥 다운로드</span>
                            </a>
                        ))}
                        {(item.attachments || []).length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>첨부된 서류가 없습니다.</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}
