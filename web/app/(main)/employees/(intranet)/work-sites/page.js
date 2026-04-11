'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ExcelButtonGroup from '@/components/ExcelButtonGroup';
import ContactFilterBar from '@/components/ContactFilterBar';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../intranet.module.css';

export default function WorkSitesPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchKeyword, setSearchKeyword] = useState('');

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

    const filteredList = list.filter(item => {
        if (searchKeyword) {
            const q = searchKeyword.toLowerCase();
            const managerNames = (item.managers || []).map(m => m.name).join(' ');
            return (
                item.site_name?.toLowerCase().includes(q) || 
                item.address?.toLowerCase().includes(q) || 
                managerNames.toLowerCase().includes(q) || 
                item.contact?.toLowerCase().includes(q)
            );
        }
        return true;
    });

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>고객사정보</h1>
                <div className={styles.controls} style={{ flexWrap: 'wrap' }}>
                    <ExcelButtonGroup onUploadSuccess={() => window.location.reload()} tableName="work_sites" />
                    <Link href="/employees/work-sites/new" className={styles.btnPrimary}>단건 등록</Link>
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
                            <th className={styles.colNo}>No</th>
                            <th style={{ width: '150px' }}>작업지명</th>
                            <th className={styles.colTitle}>작업지 주소</th>
                            <th style={{ width: '150px' }}>담당자</th>
                            <th className={styles.colAuthor} style={{ width: '150px' }}>연락처</th>
                            <th className={styles.colDate}>등록일</th>
                        </tr>
                    </thead>
                    <tbody style={{ fontSize: '0.9rem' }}>
                        {filteredList.map((item, i) => (
                            <tr key={item.id} className={styles.row} onClick={() => router.push('/employees/work-sites/' + item.id)}>
                                <td className={styles.colNo}>{filteredList.length - i}</td>
                                <td style={{ fontWeight: 600 }}>{item.site_name || '—'}</td>
                                <td className={styles.colTitle}>{item.address}</td>
                                <td style={{ fontWeight: 600, color: '#475569' }}>
                                    {(item.managers || []).map((m) => m.name).filter(Boolean).join(', ') || '—'}
                                </td>
                                <td className={styles.colAuthor}>
                                    {item.contact || (item.managers && item.managers[0]?.phone) || '—'}
                                </td>
                                <td className={styles.colDate}>{new Date(item.created_at).toLocaleDateString()}</td>
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
