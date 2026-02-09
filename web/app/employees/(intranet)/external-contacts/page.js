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
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>외부연락처</h1>
            </div>
            <div className={styles.controls}>
                <Link href="/employees/external-contacts/new" className={styles.btnPrimary}>등록</Link>
            </div>
            <div className={styles.card}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.colTitle}>회사명</th>
                            <th className={styles.colCategory} style={{ width: '100px' }}>구분</th>
                            <th style={{ width: '110px' }}>담당자</th>
                            <th className={styles.colAuthor} style={{ width: '140px' }}>연락처</th>
                            <th style={{ width: '180px' }}>이메일</th>
                            <th>주소</th>
                        </tr>
                    </thead>
                    <tbody>
                        {list.map((item) => (
                            <tr key={item.id} className={styles.row} onClick={() => router.push('/employees/external-contacts/' + item.id)}>
                                <td className={styles.colTitle} style={{ color: '#2563eb' }}>{item.company_name}</td>
                                <td className={styles.colCategory}>
                                    <span style={{ background: item.contact_type === '고객사' ? '#eff6ff' : '#f8fafc', color: item.contact_type === '고객사' ? '#3b82f6' : '#64748b', padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 700 }}>
                                        {item.contact_type}
                                    </span>
                                </td>
                                <td style={{ fontWeight: 600, color: '#475569' }}>{item.contact_person}</td>
                                <td className={styles.colAuthor}>{item.phone}</td>
                                <td style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{item.email}</td>
                                <td className={styles.colDate} style={{ width: 'auto', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.address}>
                                    {item.address || '—'}
                                </td>
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
