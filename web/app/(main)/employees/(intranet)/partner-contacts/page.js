'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ExcelButtonGroup from '@/components/ExcelButtonGroup';
import ContactFilterBar from '@/components/ContactFilterBar';
import IntranetDataTable, { PhoneLink } from '@/components/IntranetDataTable';
import { useUserRole } from '@/hooks/useUserRole';
import { formatPhoneNumber } from '@/utils/contactDisplay';
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

    const filteredList = list.filter((item) => {
        if (!searchKeyword) return true;
        const q = searchKeyword.toLowerCase();
        return (
            item.company_name?.toLowerCase().includes(q) ||
            item.ceo_name?.toLowerCase().includes(q) ||
            item.manager_name?.toLowerCase().includes(q) ||
            item.phone?.toLowerCase().includes(q) ||
            item.manager_phone?.toLowerCase().includes(q) ||
            item.address?.toLowerCase().includes(q)
        );
    });

    const openDetail = (item) => router.push('/employees/partner-contacts/' + item.id);

    const columns = [
        {
            key: 'company_name',
            header: '회사명',
            colClassName: styles.colNameFixed,
            cellClassName: styles.primaryCell,
            render: (item) => item.company_name || '-',
        },
        {
            key: 'ceo_name',
            header: '대표자',
            colClassName: styles.colPersonFixed,
            cellClassName: styles.secondaryCell,
            render: (item) => item.ceo_name || '-',
        },
        {
            key: 'phone',
            header: '전화번호',
            colClassName: styles.colPhoneFixed,
            render: (item) => <PhoneLink value={item.phone}>{formatPhoneNumber(item.phone)}</PhoneLink>,
        },
        {
            key: 'manager_name',
            header: '담당자',
            colClassName: styles.colPersonFixed,
            cellClassName: styles.secondaryCell,
            render: (item) => item.manager_name || '-',
        },
        {
            key: 'manager_phone',
            header: '담당자 연락처',
            colClassName: styles.colPhoneFixed,
            render: (item) => <PhoneLink value={item.manager_phone}>{formatPhoneNumber(item.manager_phone)}</PhoneLink>,
        },
        {
            key: 'address',
            header: '소재지',
            colClassName: styles.colAddressFluid,
            cellClassName: styles.truncateCell,
            render: (item) => item.address || '-',
        },
    ];

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>협력사정보</h1>
                <div className={styles.controls}>
                    <div className={styles.desktopOnlyBtns}>
                        <ExcelButtonGroup onUploadSuccess={() => window.location.reload()} tableName="partner_contacts" />
                    </div>
                    <Link href="/employees/partner-contacts/new" className={styles.btnPrimary}>등록</Link>
                </div>
            </div>

            <ContactFilterBar searchKeyword={searchKeyword} setSearchKeyword={setSearchKeyword} />

            <div className={styles.mobileList}>
                {filteredList.length === 0 && <div className={styles.empty}>검색 결과가 없습니다.</div>}
                {filteredList.map((item) => (
                    <div key={item.id} className={styles.contactCard} onClick={() => openDetail(item)}>
                        <div className={styles.cardRow}>
                            <span className={styles.cardName}>{item.company_name || '-'}</span>
                        </div>
                        <div className={styles.cardMeta}>
                            <span>대표: {item.ceo_name || '-'}</span>
                            {item.phone && (
                                <>
                                    <span>·</span>
                                    <PhoneLink value={item.phone}>{formatPhoneNumber(item.phone)}</PhoneLink>
                                </>
                            )}
                        </div>
                        {(item.manager_name || item.manager_phone) && (
                            <div className={styles.cardMeta}>
                                <span>담당: {item.manager_name || '-'}</span>
                                {item.manager_phone && (
                                    <>
                                        <span>·</span>
                                        <PhoneLink value={item.manager_phone}>{formatPhoneNumber(item.manager_phone)}</PhoneLink>
                                    </>
                                )}
                            </div>
                        )}
                        {item.address && <div className={styles.cardMemo}>{item.address}</div>}
                    </div>
                ))}
            </div>

            <div className={styles.desktopTable}>
                <IntranetDataTable
                    columns={columns}
                    rows={filteredList}
                    onRowClick={openDetail}
                    ariaLabel="협력사정보 목록"
                />
            </div>
        </div>
    );
}
