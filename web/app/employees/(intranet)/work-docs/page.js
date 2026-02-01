'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../intranet.module.css';

export default function WorkDocsPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/work-docs');
    }, [role, authLoading, router]);

    useEffect(() => {
        if (role) {
            fetch('/api/work-docs')
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
                <h1 className={styles.title}>업무자료실</h1>
                <Link href="/employees/work-docs/new" className={styles.btnPrimary}>글쓰기</Link>
            </div>
            <div className={styles.card}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th style={{ width: '70px' }}>번호</th>
                            <th>제목</th>
                            <th style={{ width: '100px' }}>분류</th>
                            <th style={{ width: '120px' }}>작성자</th>
                            <th style={{ width: '110px' }}>날짜</th>
                        </tr>
                    </thead>
                    <tbody>
                        {list.map((item, i) => (
                            <tr key={item.id} className={styles.row} onClick={() => router.push(`/employees/work-docs/${item.id}`)}>
                                <td>{list.length - i}</td>
                                <td className={styles.colTitle}>{item.title}</td>
                                <td>{item.category || '일반'}</td>
                                <td>{item.author_name}</td>
                                <td>{new Date(item.created_at).toLocaleDateString()}</td>
                            </tr>
                        ))}
                        {list.length === 0 && (
                            <tr><td colSpan="5" className={styles.empty}>등록된 글이 없습니다.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
