'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ExcelButtonGroup from '@/components/ExcelButtonGroup';
import ContactFilterBar from '@/components/ContactFilterBar';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../intranet.module.css';

export default function PartnerContactsPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchKeyword, setSearchKeyword] = useState('');

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

    const filteredList = list.filter(item => {
        if (searchKeyword) {
            const q = searchKeyword.toLowerCase();
            return (
                item.company_name?.toLowerCase().includes(q) || 
                item.ceo_name?.toLowerCase().includes(q) || 
                item.manager_name?.toLowerCase().includes(q) || 
                item.phone?.toLowerCase().includes(q) || 
                item.manager_phone?.toLowerCase().includes(q)
            );
        }
        return true;
    });

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>협력사정보</h1>
                <div className={styles.controls} style={{ flexWrap: 'wrap' }}>
                    <ExcelButtonGroup onUploadSuccess={() => window.location.reload()} tableName="partner_contacts" />
                    <Link href="/employees/partner-contacts/new" className={styles.btnPrimary}>단건 등록</Link>
                </div>
            </div>
            
            <ContactFilterBar 
                searchKeyword={searchKeyword} 
                setSearchKeyword={setSearchKeyword} 
            />

            <div className={styles.card}>
                <table className={styles.table}>
                    <thead>
                        <tr style={{ fontSize: '0.9rem' }}>
                            <th className={styles.colTitle} style={{ minWidth: '200px' }}>회사명</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>대표자</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>전화번호</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>담당자</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>담당자 연락처</th>
                            <th className={styles.colDate} style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>등록일</th>
                        </tr>
                    </thead>
                    <tbody style={{ fontSize: '0.9rem' }}>
                        {filteredList.map((item) => (
                            <tr key={item.id} className={styles.row} onClick={() => router.push('/employees/partner-contacts/' + item.id)}>
                                <td className={styles.colTitle} style={{ color: '#2563eb', fontSize: '0.95rem' }}>{item.company_name}</td>
                                <td style={{ fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', padding: '12px 16px' }}>{item.ceo_name}</td>
                                <td style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>{item.phone}</td>
                                <td style={{ fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', padding: '12px 16px' }}>{item.manager_name}</td>
                                <td style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>{item.manager_phone}</td>
                                <td className={styles.colDate} style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>{new Date(item.created_at).toLocaleDateString()}</td>
                            </tr>
                        ))}
                        {filteredList.length === 0 && (
                            <tr><td colSpan="6" className={styles.empty}>검색 결과가 없습니다.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
