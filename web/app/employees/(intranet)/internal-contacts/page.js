'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../intranet.module.css';

export default function InternalContactsPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/internal-contacts');
    }, [role, authLoading, router]);

    useEffect(() => {
        if (role) {
            fetch('/api/internal-contacts')
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
                <h1 className={styles.title}>사내연락망</h1>
                <Link href="/employees/internal-contacts/new" className={styles.btnPrimary}>등록</Link>
            </div>
            <div className={styles.card}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th style={{ width: '70px' }}>사진</th>
                            <th>이름</th>
                            <th style={{ width: '100px' }}>부서</th>
                            <th style={{ width: '90px' }}>직급</th>
                            <th style={{ width: '130px' }}>연락처</th>
                            <th>이메일</th>
                        </tr>
                    </thead>
                    <tbody>
                        {list.map((item) => (
                            <tr key={item.id} className={styles.row} onClick={() => router.push('/employees/internal-contacts/' + item.id)}>
                                <td>
                                    {item.photo_url ? (
                                        <img src={item.photo_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8 }} />
                                    ) : (
                                        <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                                    )}
                                </td>
                                <td className={styles.colTitle}>{item.name}</td>
                                <td>{item.department}</td>
                                <td>{item.position}</td>
                                <td>{item.phone}</td>
                                <td>{item.email}</td>
                            </tr>
                        ))}
                        {list.length === 0 && (
                            <tr><td colSpan="6" className={styles.empty}>등록된 연락처가 없습니다.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
