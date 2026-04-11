'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ExcelButtonGroup from '@/components/ExcelButtonGroup';
import ContactFilterBar from '@/components/ContactFilterBar';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../intranet.module.css';

export default function ExternalContactsPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Filter & Search states
    const [searchKeyword, setSearchKeyword] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');

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

    const filteredList = list.filter(item => {
        if (categoryFilter && item.contact_type !== categoryFilter) return false;
        if (searchKeyword) {
            const q = searchKeyword.toLowerCase();
            return (
                item.company_name?.toLowerCase().includes(q) || 
                item.contact_person?.toLowerCase().includes(q) || 
                item.phone?.toLowerCase().includes(q) || 
                item.contact_person_phone?.toLowerCase().includes(q) ||
                item.email?.toLowerCase().includes(q)
            );
        }
        return true;
    });

    const uniqueCategories = Array.from(new Set(list.map(item => item.contact_type).filter(Boolean)));

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>외부연락처</h1>
                <div className={styles.controls} style={{ flexWrap: 'wrap' }}>
                    <ExcelButtonGroup onUploadSuccess={() => window.location.reload()} tableName="external_contacts" />
                    <Link href="/employees/external-contacts/new" className={styles.btnPrimary}>단건 등록</Link>
                </div>
            </div>
            <ContactFilterBar 
                searchKeyword={searchKeyword} 
                setSearchKeyword={setSearchKeyword} 
                categoryFilter={categoryFilter} 
                setCategoryFilter={setCategoryFilter} 
                categoryOptions={uniqueCategories}
            />
            
            <div className={styles.card}>
                <table className={styles.table}>
                    <thead>
                        <tr style={{ fontSize: '0.9rem' }}>
                            <th className={styles.colTitle} style={{ minWidth: '150px' }}>회사명</th>
                            <th className={styles.colCategory} style={{ whiteSpace: 'nowrap' }}>구분</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>대표 연락처</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>담당자</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>담당자 연락처</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>이메일</th>
                            <th style={{ width: '100%' }}>주소</th>
                        </tr>
                    </thead>
                    <tbody style={{ fontSize: '0.9rem' }}>
                        {filteredList.map((item) => (
                            <tr key={item.id} className={styles.row} onClick={() => router.push('/employees/external-contacts/' + item.id)}>
                                <td className={styles.colTitle} style={{ color: '#2563eb', fontSize: '0.95rem' }}>{item.company_name}</td>
                                <td className={styles.colCategory} style={{ whiteSpace: 'nowrap' }}>
                                    <span style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', padding: '3px 8px', borderRadius: 4, fontSize: '0.85rem', fontWeight: 600 }}>
                                        {item.contact_type || '—'}
                                    </span>
                                </td>
                                <td className={styles.colAuthor} style={{ color: '#64748b', whiteSpace: 'nowrap', padding: '12px 16px' }}>{item.phone || '—'}</td>
                                <td style={{ fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', padding: '12px 16px' }}>{item.contact_person}</td>
                                <td style={{ color: '#0f172a', fontWeight: 500, whiteSpace: 'nowrap', padding: '12px 16px' }}>{item.contact_person_phone || '—'}</td>
                                <td style={{ color: '#94a3b8', fontSize: '0.9rem', whiteSpace: 'nowrap', padding: '12px 16px' }}>{item.email}</td>
                                <td className={styles.colDate} style={{ width: '100%', minWidth: '200px', wordBreak: 'break-all' }} title={item.address}>
                                    {item.address || '—'}
                                </td>
                            </tr>
                        ))}
                        {filteredList.length === 0 && (
                            <tr><td colSpan="7" className={styles.empty}>검색 결과가 없습니다.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
