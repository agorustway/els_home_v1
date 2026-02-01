'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../intranet.module.css';

export default function WorkSiteDetailPage() {
    const { id } = useParams();
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/work-sites/' + id);
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role && id) {
            fetch('/api/work-sites/' + id)
                .then((res) => res.json())
                .then((data) => setItem(data.item))
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [role, id]);

    const handleDelete = async () => {
        if (!confirm('삭제하시겠습니까?')) return;
        const res = await fetch('/api/work-sites/' + id, { method: 'DELETE' });
        if (res.ok) router.push('/employees/work-sites');
        else alert('삭제 실패');
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!role) return null;
    if (!item) return <div className={styles.loading}>작업지를 찾을 수 없습니다.</div>;

    const managers = item.managers || [];

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>작업지확인</h1>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Link href={'/employees/work-sites/' + id + '/edit'} className={styles.btnSecondary}>수정</Link>
                    <button type="button" onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                    <Link href="/employees/work-sites" className={styles.btnSecondary}>목록</Link>
                </div>
            </div>
            <div className={styles.card}>
                <h2 className={styles.detailTitle}>작업지 주소</h2>
                <p className={styles.contentBody}>{item.address}</p>
                {item.contact && <p><strong>대표 연락처:</strong> {item.contact}</p>}
                {managers.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                        <strong>담당자</strong>
                        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                            {managers.map((m, i) => (
                                <li key={i}>{m.name} {m.phone && '(' + m.phone + ')'} {m.role && ' · ' + m.role}</li>
                            ))}
                        </ul>
                    </div>
                )}
                {item.work_method && <p style={{ marginTop: 12 }}><strong>작업방식:</strong> {item.work_method}</p>}
                {item.notes && <div className={styles.contentBody} style={{ marginTop: 16 }}><strong>참고사항</strong><br />{item.notes}</div>}
                {item.attachments && item.attachments.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                        <strong>첨부파일</strong>
                        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                            {item.attachments.map((a, i) => (
                                <li key={i}><a href={a.path || a.url} target="_blank" rel="noopener noreferrer">{a.name || '파일'}</a></li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
