'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../intranet.module.css';

export default function ExternalContactsPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/external-contacts');
    }, [role, authLoading, router]);

    useEffect(() => {
        if (role) {
            fetch('/api/external-contacts')
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
                <h1 className={styles.title}>외부연락처</h1>
                <Link href="/employees/external-contacts/new" className={styles.btnPrimary}>등록</Link>
            </div>
            <div className={styles.card}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>회사명</th>
                            <th style={{ width: '90px' }}>구분</th>
                            <th style={{ width: '100px' }}>담당자</th>
                            <th style={{ width: '130px' }}>연락처</th>
                            <th>이메일</th>
                            <th style={{ width: '180px' }}>주소</th>
                        </tr>
                    </thead>
                    <tbody>
                        {list.map((item) => (
                            <tr key={item.id} className={styles.row} onClick={() => router.push('/employees/external-contacts/' + item.id)}>
                                <td className={styles.colTitle}>{item.company_name}</td>
                                <td>{item.contact_type}</td>
                                <td>{item.contact_person}</td>
                                <td>{item.phone}</td>
                                <td>{item.email}</td>
                                <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.address}>{item.address || '—'}</td>
                            </tr>
                        ))}
                        {list.length === 0 && (
                            <tr><td colSpan="6" className={styles.empty}>등록된 외부연락처가 없습니다.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
