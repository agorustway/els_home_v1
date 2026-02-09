'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../intranet.module.css';

export default function PartnerContactsPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/partner-contacts');
    }, [role, authLoading, router]);

    useEffect(() => {
        if (role) {
            fetch('/api/partner-contacts')
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
                <h1 className={styles.title}>협력사정보</h1>
                <Link href="/employees/partner-contacts/new" className={styles.btnPrimary}>등록</Link>
            </div>
            <div className={styles.card}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.colTitle}>회사명</th>
                            <th style={{ width: '120px' }}>대표자</th>
                            <th style={{ width: '150px' }}>전화번호</th>
                            <th style={{ width: '120px' }}>담당자</th>
                            <th style={{ width: '150px' }}>담당자 연락처</th>
                            <th className={styles.colDate}>등록일</th>
                        </tr>
                    </thead>
                    <tbody>
                        {list.map((item) => (
                            <tr key={item.id} className={styles.row} onClick={() => router.push('/employees/partner-contacts/' + item.id)}>
                                <td className={styles.colTitle}>{item.company_name}</td>
                                <td>{item.ceo_name}</td>
                                <td>{item.phone}</td>
                                <td>{item.manager_name}</td>
                                <td>{item.manager_phone}</td>
                                <td className={styles.colDate}>{new Date(item.created_at).toLocaleDateString()}</td>
                            </tr>
                        ))}
                        {list.length === 0 && (
                            <tr><td colSpan="6" className={styles.empty}>등록된 협력사가 없습니다.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
