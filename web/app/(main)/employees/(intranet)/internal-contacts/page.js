'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ExcelButtonGroup from '@/components/ExcelButtonGroup';
import ContactFilterBar from '@/components/ContactFilterBar';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../intranet.module.css';

export default function InternalContactsPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchKeyword, setSearchKeyword] = useState('');

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

    const filteredList = list.filter(item => {
        if (searchKeyword) {
            const q = searchKeyword.toLowerCase();
            return (
                item.name?.toLowerCase().includes(q) || 
                item.department?.toLowerCase().includes(q) || 
                item.position?.toLowerCase().includes(q) || 
                item.phone?.toLowerCase().includes(q) || 
                item.email?.toLowerCase().includes(q)
            );
        }
        return true;
    });

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>사내연락망</h1>
            <div className={styles.controls} style={{ flexWrap: 'wrap' }}>
                <ExcelButtonGroup onUploadSuccess={() => window.location.reload()} tableName="internal_contacts" />
                <Link href="/employees/internal-contacts/new" className={styles.btnPrimary}>단건 등록</Link>
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
                            <th style={{ width: '80px', textAlign: 'center' }}>프로필</th>
                            <th className={styles.colTitle} style={{ width: '120px' }}>이름</th>
                            <th className={styles.colCategory} style={{ width: '140px' }}>부서</th>
                            <th style={{ width: '100px' }}>직급</th>
                            <th className={styles.colAuthor} style={{ width: '150px' }}>연락처</th>
                            <th>이메일</th>
                        </tr>
                    </thead>
                    <tbody style={{ fontSize: '0.9rem' }}>
                        {filteredList.map((item) => (
                            <tr key={item.id} className={styles.row} onClick={() => router.push('/employees/internal-contacts/' + item.id)}>
                                <td style={{ textAlign: 'center' }}>
                                    {item.photo_url ? (
                                        <img src={item.photo_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: '50%', border: '2px solid #f1f5f9' }} />
                                    ) : (
                                        <div style={{ width: 44, height: 44, background: '#f8fafc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: '1.2rem' }}>👤</div>
                                    )}
                                </td>
                                <td className={styles.colTitle} style={{ fontSize: '0.95rem' }}>{item.name}</td>
                                <td className={styles.colCategory}>{item.department}</td>
                                <td style={{ color: '#64748b', fontWeight: 500 }}>{item.position}</td>
                                <td className={styles.colAuthor}>{item.phone}</td>
                                <td style={{ color: '#94a3b8', fontSize: '0.9rem' }}>{item.email}</td>
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
