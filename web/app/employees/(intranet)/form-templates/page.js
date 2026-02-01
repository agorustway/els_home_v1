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
            <div className={styles.header}>
                <h1 className={styles.title}>서식자료실</h1>
                <Link href="/employees/form-templates/new" className={styles.btnPrimary}>등록</Link>
            </div>
            <div className={styles.card}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th style={{ width: '70px' }}>번호</th>
                            <th>제목</th>
                            <th style={{ width: '100px' }}>분류</th>
                            <th style={{ width: '110px' }}>등록일</th>
                        </tr>
                    </thead>
                    <tbody>
                        {list.map((item, i) => (
                            <tr key={item.id} className={styles.row} onClick={() => router.push('/employees/form-templates/' + item.id)}>
                                <td>{list.length - i}</td>
                                <td className={styles.colTitle}>{item.title}</td>
                                <td>{item.category || '일반'}</td>
                                <td>{new Date(item.created_at).toLocaleDateString()}</td>
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
