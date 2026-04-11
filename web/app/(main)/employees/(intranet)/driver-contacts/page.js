'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ExcelButtonGroup from '@/components/ExcelButtonGroup';
import ContactFilterBar from '@/components/ContactFilterBar';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../intranet.module.css';

export default function DriverContactsPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchKeyword, setSearchKeyword] = useState('');

    const formatPhone = (val) => {
        if (!val) return '-';
        const num = val.replace(/[^0-9]/g, '');
        if (num.length <= 3) return num;
        if (num.length <= 7) return `${num.slice(0, 3)}-${num.slice(3)}`;
        return `${num.slice(0, 3)}-${num.slice(3, 7)}-${num.slice(7, 11)}`;
    };

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

    const filteredList = list.filter(item => {
        if (searchKeyword) {
            const q = searchKeyword.toLowerCase();
            return (
                item.name?.toLowerCase().includes(q) || 
                item.phone?.toLowerCase().includes(q) || 
                item.vehicle_number?.toLowerCase().includes(q) || 
                item.vehicle_id?.toLowerCase().includes(q)
            );
        }
        return true;
    });


    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>운전원정보</h1>
                <div className={styles.controls} style={{ flexWrap: 'wrap' }}>
                    <ExcelButtonGroup onUploadSuccess={() => window.location.reload()} tableName="driver_contacts" />
                    <Link href="/employees/driver-contacts/new" className={styles.btnPrimary}>단건 등록</Link>
                </div>
            </div>
            
            <ContactFilterBar 
                searchKeyword={searchKeyword} 
                setSearchKeyword={setSearchKeyword} 
            />

            <div className={styles.card}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th style={{ width: '80px', textAlign: 'center' }}>사진</th>
                            <th style={{ width: '80px', textAlign: 'center' }}>계약</th>
                            <th className={styles.colTitle}>이름</th>
                            <th style={{ width: '150px' }}>전화번호</th>
                            <th style={{ width: '120px' }}>차량번호</th>
                            <th style={{ width: '90px' }}>차량ID</th>
                            <th style={{ width: '110px' }}>마지막 컨테이너</th>
                            <th style={{ width: '60px' }}>타입</th>
                            <th style={{ width: '90px' }}>종류</th>
                            <th style={{ width: '100px' }}>마지막 운행</th>
                            <th className={styles.colDate}>등록일</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredList.map((item) => (
                            <tr key={item.id} className={styles.row} onClick={() => router.push('/employees/driver-contacts/' + item.id)}>
                                <td style={{ textAlign: 'center' }}>
                                    {item.photo_driver || item.photo_url ? (
                                        <img src={item.photo_driver || item.photo_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: '50%', border: '2px solid #f1f5f9' }} />
                                    ) : (
                                        <div style={{ width: 44, height: 44, background: '#f8fafc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: '1.2rem' }}>👤</div>
                                    )}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    <span style={{
                                        display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 600,
                                        background: item.contract_type === 'contracted' ? '#dcfce7' : '#f1f5f9',
                                        color: item.contract_type === 'contracted' ? '#16a34a' : '#94a3b8',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {item.contract_type === 'contracted' ? '계약' : '미계약'}
                                    </span>
                                </td>
                                <td className={styles.colTitle}>{item.name}</td>
                                <td>{formatPhone(item.phone)}</td>
                                <td style={{ fontWeight: 600 }}>{item.vehicle_number || '-'}</td>
                                <td style={{ color: '#64748b', fontSize: '0.85rem', letterSpacing: '0.5px' }}>{item.vehicle_id || '-'}</td>
                                <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{item.last_container_number || '-'}</td>
                                <td style={{ fontSize: '0.8rem' }}>{item.last_container_type || '-'}</td>
                                <td style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.last_container_kind || '-'}</td>
                                <td style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                    {item.last_trip_started_at ? new Date(item.last_trip_started_at).toLocaleDateString() : '-'}
                                </td>
                                <td className={styles.colDate}>{new Date(item.created_at).toLocaleDateString()}</td>
                            </tr>
                        ))}
                        {filteredList.length === 0 && (
                            <tr><td colSpan="11" className={styles.empty}>검색 결과가 없습니다.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
