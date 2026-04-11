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
                item.email?.toLowerCase().includes(q) ||
                item.memo?.toLowerCase().includes(q)
            );
        }
        return true;
    });

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>사내연락망</h1>
                <div className={styles.controls} style={{ flexWrap: 'wrap' }}>
                    <div className={styles.desktopOnlyBtns}>
                        <ExcelButtonGroup onUploadSuccess={() => window.location.reload()} tableName="internal_contacts" />
                    </div>
                    <Link href="/employees/internal-contacts/new" className={styles.btnPrimary}>등록</Link>
                </div>
            </div>
            
            <ContactFilterBar 
                searchKeyword={searchKeyword} 
                setSearchKeyword={setSearchKeyword} 
            />

            {/* ── 모바일 카드 뷰 (768px 이하) ── */}
            <div className={styles.mobileList}>
                {filteredList.length === 0 && <div className={styles.empty}>검색 결과가 없습니다.</div>}
                {filteredList.map((item) => (
                    <div
                        key={item.id}
                        className={styles.contactCard}
                        onClick={() => router.push('/employees/internal-contacts/' + item.id)}
                    >
                        <div className={styles.cardRow}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                {item.photo_url ? (
                                    <img src={item.photo_url} alt="" style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: '50%', flexShrink: 0, border: '2px solid #f1f5f9' }} />
                                ) : (
                                    <div style={{ width: 38, height: 38, background: '#e2e8f0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.9rem', fontWeight: 700, flexShrink: 0 }}>
                                        {item.name?.charAt(0) || '-'}
                                    </div>
                                )}
                                <span className={styles.cardName}>{item.name}</span>
                            </div>
                            <span className={styles.cardBadge}>{[item.department, item.position].filter(Boolean).join(' ')}</span>
                        </div>
                        {item.phone && (
                            <div>
                                <a
                                    href={'tel:' + item.phone}
                                    onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(item.phone); }}
                                    className={styles.cardPhone}
                                >
                                    {item.phone}
                                </a>
                            </div>
                        )}
                        {item.email && <div className={styles.cardMeta}>{item.email}</div>}
                        {item.memo && <div className={styles.cardMemo}>{item.memo}</div>}
                    </div>
                ))}
            </div>

            {/* ── 데스크탑 테이블 뷰 (768px 초과) ── */}
            <div className={styles.desktopTable}>
                <div className={styles.card}>
                    <table className={styles.table}>
                        <thead>
                            <tr style={{ fontSize: '0.9rem' }}>
                                <th style={{ width: '60px', textAlign: 'center' }}>프로필</th>
                                <th className={styles.colTitle} style={{ width: '100px', minWidth: '100px' }}>이름</th>
                                <th className={styles.colCategory} style={{ whiteSpace: 'nowrap', padding: '12px 16px', width: '120px' }}>부서</th>
                                <th style={{ whiteSpace: 'nowrap', padding: '12px 16px', width: '100px' }}>직급</th>
                                <th className={styles.colAuthor} style={{ whiteSpace: 'nowrap', padding: '12px 16px', width: '150px' }}>연락처</th>
                                <th style={{ whiteSpace: 'nowrap', padding: '12px 16px', maxWidth: '200px' }}>이메일</th>
                                <th style={{ width: '100%', padding: '12px 16px' }}>비고</th>
                            </tr>
                        </thead>
                        <tbody style={{ fontSize: '0.9rem' }}>
                            {filteredList.map((item) => (
                                <tr key={item.id} className={styles.row} onClick={() => router.push('/employees/internal-contacts/' + item.id)}>
                                    <td style={{ textAlign: 'center' }}>
                                        {item.photo_url ? (
                                            <img src={item.photo_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: '50%', border: '2px solid #f1f5f9' }} />
                                        ) : (
                                            <div style={{ width: 44, height: 44, background: '#e2e8f0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem', fontWeight: '700' }}>{item.name?.charAt(0) || '-'}</div>
                                        )}
                                    </td>
                                    <td className={styles.colTitle} style={{ fontSize: '0.95rem', whiteSpace: 'nowrap', fontWeight: 600 }}>{item.name}</td>
                                    <td className={styles.colCategory} style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>{item.department}</td>
                                    <td style={{ color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap', padding: '12px 16px' }}>{item.position}</td>
                                    <td className={styles.colAuthor} style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>
                                        {item.phone ? (
                                            <a href={'tel:' + item.phone} onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.phone).then(()=>alert('전화번호가 복사되었습니다.')); }} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>{item.phone}</a>
                                        ) : '—'}
                                    </td>
                                    <td style={{ color: '#94a3b8', fontSize: '0.85rem', whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', padding: '12px 16px' }} title={item.email}>{item.email}</td>
                                    <td style={{ width: '100%', color: '#64748b', fontSize: '0.85rem', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '12px 16px' }} title={item.memo}>{item.memo || '-'}</td>
                                </tr>
                            ))}
                            {filteredList.length === 0 && (
                                <tr><td colSpan="7" className={styles.empty}>검색 결과가 없습니다.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
