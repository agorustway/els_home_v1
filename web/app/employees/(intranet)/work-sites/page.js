'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../intranet.module.css';

export default function WorkSitesPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/work-sites');
    }, [role, authLoading, router]);

    useEffect(() => {
        if (role) {
            fetch('/api/work-sites')
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
                <h1 className={styles.title}>작업지확인</h1>
                <Link href="/employees/work-sites/new" className={styles.btnPrimary}>등록</Link>
            </div>
            <div className={styles.card}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th style={{ width: '70px' }}>번호</th>
                            <th>작업지 주소</th>
                            <th style={{ width: '140px' }}>담당자</th>
                            <th style={{ width: '120px' }}>연락처</th>
                            <th style={{ width: '110px' }}>등록일</th>
                        </tr>
                    </thead>
                    <tbody>
                        {list.map((item, i) => (
                            <tr key={item.id} className={styles.row} onClick={() => router.push('/employees/work-sites/' + item.id)}>
                                <td>{list.length - i}</td>
                                <td className={styles.colTitle}>{item.address}</td>
                                <td>{(item.managers || []).map((m) => m.name).filter(Boolean).join(', ') || '—'}</td>
                                <td>{item.contact || (item.managers && item.managers[0]?.phone) || '—'}</td>
                                <td>{new Date(item.created_at).toLocaleDateString()}</td>
                            </tr>
                        ))}
                        {list.length === 0 && (
                            <tr><td colSpan="5" className={styles.empty}>등록된 작업지가 없습니다.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
