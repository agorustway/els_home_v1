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
            </div>
            <div className={styles.controls}>
                <Link href={'/employees/internal-contacts/' + id + '/edit'} className={styles.btnSecondary}>수정</Link>
                <button type="button" onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                <Link href="/employees/internal-contacts" className={styles.btnSecondary}>목록</Link>
            </div>
            <div className={styles.card}>
                <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {item.photo_url && (
                        <img src={item.photo_url} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 12 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 200 }}>
                        <h2 className={styles.detailTitle}>{item.name}</h2>
                        <div className={styles.detailMeta}>
                            {item.department && <span>{item.department}</span>}
                            {item.position && <span> · {item.position}</span>}
                        </div>
                        {item.phone && <p><strong>연락처:</strong> {item.phone}</p>}
                        {item.email && <p><strong>이메일:</strong> {item.email}</p>}
                        {item.memo && <div className={styles.contentBody} style={{ marginTop: 16 }}>{item.memo}</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}
