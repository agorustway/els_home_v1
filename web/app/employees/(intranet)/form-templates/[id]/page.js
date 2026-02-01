'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../intranet.module.css';

export default function FormTemplateDetailPage() {
    const { id } = useParams();
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/form-templates/' + id);
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role && id) {
            fetch('/api/form-templates/' + id)
                .then((res) => res.json())
                .then((data) => setItem(data.item))
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [role, id]);

    const handleDelete = async () => {
        if (!confirm('삭제하시겠습니까?')) return;
        const res = await fetch('/api/form-templates/' + id, { method: 'DELETE' });
        if (res.ok) router.push('/employees/form-templates');
        else alert('삭제 실패');
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!role) return null;
    if (!item) return <div className={styles.loading}>서식을 찾을 수 없습니다.</div>;

    const downloadUrl = item.file_url || item.file_path;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>서식자료실</h1>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Link href={'/employees/form-templates/' + id + '/edit'} className={styles.btnSecondary}>수정</Link>
                    <button type="button" onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                    <Link href="/employees/form-templates" className={styles.btnSecondary}>목록</Link>
                </div>
            </div>
            <div className={styles.card}>
                <h2 className={styles.detailTitle}>{item.title}</h2>
                <div className={styles.detailMeta}>
                    {item.category} · {new Date(item.created_at).toLocaleString()}
                </div>
                {item.description && <div className={styles.contentBody} style={{ marginBottom: 16 }}>{item.description}</div>}
                {downloadUrl && (
                    <p>
                        <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className={styles.btnPrimary} style={{ display: 'inline-flex' }}>
                            다운로드 {item.file_name ? '(' + item.file_name + ')' : ''}
                        </a>
                    </p>
                )}
            </div>
        </div>
    );
}
