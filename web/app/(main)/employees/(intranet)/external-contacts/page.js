'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ExcelButtonGroup from '@/components/ExcelButtonGroup';
import ContactFilterBar from '@/components/ContactFilterBar';
import IntranetDataTable, { DataBadge, PhoneLink } from '@/components/IntranetDataTable';
import { useUserRole } from '@/hooks/useUserRole';
import { formatPhoneNumber } from '@/utils/contactDisplay';
import styles from '../intranet.module.css';

export default function ExternalContactsPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
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

    const filteredList = list.filter((item) => {
        if (categoryFilter && item.contact_type !== categoryFilter) return false;
        if (!searchKeyword) return true;
        const q = searchKeyword.toLowerCase();
        return (
            item.company_name?.toLowerCase().includes(q) ||
            item.contact_person?.toLowerCase().includes(q) ||
            item.phone?.toLowerCase().includes(q) ||
            item.contact_person_phone?.toLowerCase().includes(q) ||
            item.email?.toLowerCase().includes(q) ||
            item.memo?.toLowerCase().includes(q)
        );
    });

    const uniqueCategories = Array.from(new Set(list.map((item) => item.contact_type).filter(Boolean)));
    const openDetail = (item) => router.push('/employees/external-contacts/' + item.id);

    const columns = [
        {
            key: 'company_name',
            header: '회사명',
            colClassName: styles.colNameFixed,
            cellClassName: styles.primaryCell,
            render: (item) => item.company_name || '-',
        },
        {
            key: 'contact_type',
            header: '구분',
            colClassName: styles.colTypeFixed,
            render: (item) => <DataBadge>{item.contact_type || '미분류'}</DataBadge>,
        },
        {
            key: 'phone',
            header: '대표 연락처',
            colClassName: styles.colPhoneFixed,
            render: (item) => <PhoneLink value={item.phone}>{formatPhoneNumber(item.phone)}</PhoneLink>,
        },
        {
            key: 'contact_person',
            header: '담당자',
            colClassName: styles.colPersonFixed,
            cellClassName: styles.secondaryCell,
            render: (item) => item.contact_person || '-',
        },
        {
            key: 'contact_person_phone',
            header: '담당자 연락처',
            colClassName: styles.colPhoneFixed,
            render: (item) => <PhoneLink value={item.contact_person_phone}>{formatPhoneNumber(item.contact_person_phone)}</PhoneLink>,
        },
        {
            key: 'email',
            header: '이메일',
            colClassName: styles.colMetaFixed,
            cellClassName: styles.truncateCell,
            render: (item) => item.email || '-',
        },
        {
            key: 'memo',
            header: '비고',
            colClassName: styles.colNoteFluid,
            cellClassName: styles.truncateCell,
            render: (item) => item.memo || item.address || '-',
        },
    ];

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>외부연락처</h1>
                <div className={styles.controls}>
                    <div className={styles.desktopOnlyBtns}>
                        <ExcelButtonGroup onUploadSuccess={() => window.location.reload()} tableName="external_contacts" />
                    </div>
                    <Link href="/employees/external-contacts/new" className={styles.btnPrimary}>등록</Link>
                </div>
            </div>

            <ContactFilterBar
                searchKeyword={searchKeyword}
                setSearchKeyword={setSearchKeyword}
                categoryFilter={categoryFilter}
                setCategoryFilter={setCategoryFilter}
                categoryOptions={uniqueCategories}
            />

            <div className={styles.mobileList}>
                {filteredList.length === 0 && <div className={styles.empty}>검색 결과가 없습니다.</div>}
                {filteredList.map((item) => (
                    <div key={item.id} className={styles.contactCard} onClick={() => openDetail(item)}>
                        <div className={styles.cardRow}>
                            <span className={styles.cardName}>{item.company_name || '-'}</span>
                            {item.contact_type && <span className={styles.cardBadge}>{item.contact_type}</span>}
                        </div>
                        {item.phone && <PhoneLink value={item.phone}>{formatPhoneNumber(item.phone)}</PhoneLink>}
                        {(item.contact_person || item.contact_person_phone) && (
                            <div className={styles.cardMeta}>
                                <span>담당: {item.contact_person || '-'}</span>
                                {item.contact_person_phone && (
                                    <>
                                        <span>·</span>
                                        <PhoneLink value={item.contact_person_phone}>{formatPhoneNumber(item.contact_person_phone)}</PhoneLink>
                                    </>
                                )}
                            </div>
                        )}
                        {item.memo && <div className={styles.cardMemo}>{item.memo}</div>}
                    </div>
                ))}
            </div>

            <div className={styles.desktopTable}>
                <IntranetDataTable
                    columns={columns}
                    rows={filteredList}
                    onRowClick={openDetail}
                    ariaLabel="외부연락처 목록"
                />
            </div>
        </div>
    );
}
