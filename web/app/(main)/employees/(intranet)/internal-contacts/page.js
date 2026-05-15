'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ExcelButtonGroup from '@/components/ExcelButtonGroup';
import ContactFilterBar from '@/components/ContactFilterBar';
import IntranetDataTable, { InitialAvatar, PhoneLink } from '@/components/IntranetDataTable';
import { useUserRole } from '@/hooks/useUserRole';
import { formatPhoneNumber, joinDefined } from '@/utils/contactDisplay';
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

    const filteredList = list.filter((item) => {
        if (!searchKeyword) return true;
        const q = searchKeyword.toLowerCase();
        return (
            item.name?.toLowerCase().includes(q) ||
            item.department?.toLowerCase().includes(q) ||
            item.position?.toLowerCase().includes(q) ||
            item.phone?.toLowerCase().includes(q) ||
            item.email?.toLowerCase().includes(q) ||
            item.memo?.toLowerCase().includes(q)
        );
    });

    const openDetail = (item) => router.push('/employees/internal-contacts/' + item.id);

    const columns = [
        {
            key: 'avatar',
            header: '프로필',
            colClassName: styles.colAvatarFixed,
            align: 'center',
            render: (item) => <InitialAvatar name={item.name} src={item.photo_url} label={item.name} />,
        },
        {
            key: 'name',
            header: '이름',
            colClassName: styles.colNameFixed,
            cellClassName: styles.primaryCell,
            render: (item) => item.name || '-',
        },
        {
            key: 'department',
            header: '부서',
            colClassName: styles.colTypeFixed,
            cellClassName: styles.secondaryCell,
            render: (item) => item.department || '-',
        },
        {
            key: 'position',
            header: '직급',
            colClassName: styles.colTypeFixed,
            cellClassName: styles.secondaryCell,
            render: (item) => item.position || '-',
        },
        {
            key: 'phone',
            header: '연락처',
            colClassName: styles.colPhoneFixed,
            render: (item) => <PhoneLink value={item.phone}>{formatPhoneNumber(item.phone)}</PhoneLink>,
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
            render: (item) => item.memo || '-',
        },
    ];

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>사내연락망</h1>
                <div className={styles.controls}>
                    <div className={styles.desktopOnlyBtns}>
                        <ExcelButtonGroup onUploadSuccess={() => window.location.reload()} tableName="internal_contacts" />
                    </div>
                    <Link href="/employees/internal-contacts/new" className={styles.btnPrimary}>등록</Link>
                </div>
            </div>

            <ContactFilterBar searchKeyword={searchKeyword} setSearchKeyword={setSearchKeyword} />

            <div className={styles.mobileList}>
                {filteredList.length === 0 && <div className={styles.empty}>검색 결과가 없습니다.</div>}
                {filteredList.map((item) => (
                    <div key={item.id} className={styles.contactCard} onClick={() => openDetail(item)}>
                        <div className={styles.cardRow}>
                            <div className={styles.cardRow} style={{ minWidth: 0 }}>
                                <InitialAvatar name={item.name} src={item.photo_url} size="sm" label={item.name} />
                                <span className={styles.cardName}>{item.name || '-'}</span>
                            </div>
                            <span className={styles.cardBadge}>{joinDefined([item.department, item.position]) || '미분류'}</span>
                        </div>
                        {item.phone && <PhoneLink value={item.phone}>{formatPhoneNumber(item.phone)}</PhoneLink>}
                        {item.email && <div className={styles.cardMeta}>{item.email}</div>}
                        {item.memo && <div className={styles.cardMemo}>{item.memo}</div>}
                    </div>
                ))}
            </div>

            <div className={styles.desktopTable}>
                <IntranetDataTable
                    columns={columns}
                    rows={filteredList}
                    onRowClick={openDetail}
                    ariaLabel="사내연락망 목록"
                />
            </div>
        </div>
    );
}
