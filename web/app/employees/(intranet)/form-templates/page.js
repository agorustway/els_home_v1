'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../intranet.module.css';

export default function FormTemplatesPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/form-templates');
    }, [role, authLoading, router]);

    useEffect(() => {
        if (role) {
            fetch('/api/form-templates')
                .then((res) => res.json())
                .then((data) => { if (data.list) setList(data.list); })
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [role]);

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!role) return null;

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>서식자료실</h1>
            <div className={styles.controls}>
                <Link href="/employees/form-templates/new" className={styles.btnPrimary}>등록</Link>
            </div>
            </div>
            <div className={styles.card}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.colNo}>No</th>
                            <th className={styles.colTitle}>제목</th>
                            <th className={styles.colCategory}>분류</th>
                            <th className={styles.colDate}>등록일</th>
                        </tr>
                    </thead>
                    <tbody>
                        {list.map((item, i) => (
                            <tr key={item.id} className={styles.row} onClick={() => router.push('/employees/form-templates/' + item.id)}>
                                <td className={styles.colNo}>{list.length - i}</td>
                                <td className={styles.colTitle}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <span>{item.title}</span>
                                        {item.file_name && (
                                            <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span>💾 {item.file_name}</span>
                                                {item.file_size && <span style={{ color: '#94a3b8' }}>({(item.file_size / 1024).toFixed(1)} KB)</span>}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className={styles.colCategory}>{item.category || '일반'}</td>
                                <td className={styles.colDate}>{new Date(item.created_at).toLocaleDateString()}</td>
                            </tr>
                        ))}
                        {list.length === 0 && (
                            <tr><td colSpan="4" className={styles.empty}>등록된 서식이 없습니다.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
