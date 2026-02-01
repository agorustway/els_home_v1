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
            <div className={styles.header}>
                <h1 className={styles.title}>외부연락처</h1>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Link href={'/employees/external-contacts/' + id + '/edit'} className={styles.btnSecondary}>수정</Link>
                    <button type="button" onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                    <Link href="/employees/external-contacts" className={styles.btnSecondary}>목록</Link>
                </div>
            </div>
            <div className={styles.card}>
                <h2 className={styles.detailTitle}>{item.company_name}</h2>
                <div className={styles.detailMeta}>{item.contact_type}</div>
                {item.contact_person && <p><strong>담당자:</strong> {item.contact_person}</p>}
                {item.address && <p><strong>주소:</strong> {item.address}</p>}
                {item.phone && <p><strong>연락처:</strong> {item.phone}</p>}
                {item.email && <p><strong>이메일:</strong> {item.email}</p>}
                {item.memo && <div className={styles.contentBody} style={{ marginTop: 16 }}>{item.memo}</div>}
            </div>
        </div>
    );
}
