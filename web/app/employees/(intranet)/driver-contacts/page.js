'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ExcelButtonGroup from '@/components/ExcelButtonGroup';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../intranet.module.css';

export default function DriverContactsPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/driver-contacts');
    }, [role, authLoading, router]);

    useEffect(() => {
        if (role) {
            fetch('/api/driver-contacts')
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
                <h1 className={styles.title}>운전원정보</h1>
            <div className={styles.controls} style={{ flexWrap: 'wrap' }}>
                <ExcelButtonGroup onUploadSuccess={() => window.location.reload()} />
                <Link href="/employees/driver-contacts/new" className={styles.btnPrimary}>단건 등록</Link>
            </div>
            </div>
            <div className={styles.card}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th style={{ width: '80px', textAlign: 'center' }}>사진</th>
                            <th style={{ width: '120px' }}>영업넘버</th>
                            <th style={{ width: '120px' }}>소속지점</th>
                            <th className={styles.colTitle}>이름</th>
                            <th style={{ width: '150px' }}>전화번호</th>
                            <th style={{ width: '120px' }}>아이디</th>
                            <th style={{ width: '120px' }}>차종</th>
                            <th className={styles.colDate}>등록일</th>
                        </tr>
                    </thead>
                    <tbody>
                        {list.map((item) => (
                            <tr key={item.id} className={styles.row} onClick={() => router.push('/employees/driver-contacts/' + item.id)}>
                                <td style={{ textAlign: 'center' }}>
                                    {item.photo_url ? (
                                        <img src={item.photo_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: '50%', border: '2px solid #f1f5f9' }} />
                                    ) : (
                                        <div style={{ width: 44, height: 44, background: '#f8fafc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: '1.2rem' }}>👤</div>
                                    )}
                                </td>
                                <td>{item.business_number}</td>
                                <td>{item.branch || '-'}</td>
                                <td className={styles.colTitle}>{item.name}</td>
                                <td>{item.phone}</td>
                                <td style={{ color: '#64748b', fontSize: '0.9rem' }}>{item.driver_id}</td>
                                <td style={{ color: '#64748b' }}>{item.vehicle_type}</td>
                                <td className={styles.colDate}>{new Date(item.created_at).toLocaleDateString()}</td>
                            </tr>
                        ))}
                        {list.length === 0 && (
                            <tr><td colSpan="8" className={styles.empty}>등록된 운전원 정보가 없습니다.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
