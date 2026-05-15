'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ExcelButtonGroup from '@/components/ExcelButtonGroup';
import ContactFilterBar from '@/components/ContactFilterBar';
import IntranetDataTable, { PhoneLink } from '@/components/IntranetDataTable';
import { useUserRole } from '@/hooks/useUserRole';
import { formatDate, formatPhoneNumber } from '@/utils/contactDisplay';
import styles from '../intranet.module.css';

function getWorkProcess(item) {
    try {
        if (item.work_method && item.work_method.trim().startsWith('{')) {
            return JSON.parse(item.work_method);
        }
    } catch {
        return {};
    }
    return { precautions: item.work_method };
}

function summarizeText(value, fallback = '-') {
    if (!value) return fallback;
    const text = String(value).replace(/\s+/g, ' ').trim();
    if (!text) return fallback;
    return text.length > 42 ? `${text.slice(0, 42)}...` : text;
}

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

    const filteredList = list.filter((item) => {
        if (!searchKeyword) return true;
        const q = searchKeyword.toLowerCase();
        const managerNames = (item.managers || []).map((manager) => manager.name).join(' ');
        return (
            item.site_name?.toLowerCase().includes(q) ||
            item.address?.toLowerCase().includes(q) ||
            managerNames.toLowerCase().includes(q) ||
            item.contact?.toLowerCase().includes(q)
        );
    });

    const managerText = (item) => (item.managers || []).map((manager) => manager.name).filter(Boolean).join(', ') || '-';
    const primaryContact = (item) => item.contact || item.managers?.[0]?.phone || '';
    const precautionsText = (item) => summarizeText(getWorkProcess(item).precautions || getWorkProcess(item).notes);
    const notesText = (item) => summarizeText(item.notes);
    const openDetail = (item) => router.push('/employees/work-sites/' + item.id);

    const columns = [
        {
            key: 'no',
            header: 'No',
            colClassName: styles.colNoFixed,
            align: 'center',
            cellClassName: styles.mutedCell,
            render: (_item, index) => filteredList.length - index,
        },
        {
            key: 'site_name',
            header: '작업지명',
            colClassName: styles.colNameFixed,
            cellClassName: styles.primaryCell,
            render: (item) => item.site_name || '-',
        },
        {
            key: 'address',
            header: '작업지 주소',
            colClassName: styles.colAddressFixed,
            cellClassName: styles.truncateCell,
            render: (item) => item.address || '-',
        },
        {
            key: 'precautions',
            header: '주의사항',
            colClassName: styles.colSummaryFixed,
            cellClassName: styles.truncateCell,
            render: precautionsText,
        },
        {
            key: 'notes',
            header: '특이사항',
            colClassName: styles.colSummaryFixed,
            cellClassName: styles.truncateCell,
            render: notesText,
        },
        {
            key: 'managers',
            header: '담당자',
            colClassName: styles.colPersonFixed,
            cellClassName: styles.secondaryCell,
            render: managerText,
        },
        {
            key: 'contact',
            header: '연락처',
            colClassName: styles.colPhoneFixed,
            render: (item) => <PhoneLink value={primaryContact(item)}>{formatPhoneNumber(primaryContact(item))}</PhoneLink>,
        },
        {
            key: 'created_at',
            header: '등록일',
            colClassName: styles.colDateFixed,
            cellClassName: styles.mutedCell,
            render: (item) => formatDate(item.created_at),
        },
    ];

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>작업지정보</h1>
                <div className={styles.controls}>
                    <div className={styles.desktopOnlyBtns}>
                        <ExcelButtonGroup onUploadSuccess={() => window.location.reload()} tableName="work_sites" />
                    </div>
                    <Link href="/employees/work-sites/new" className={styles.btnPrimary}>등록</Link>
                </div>
            </div>

            <ContactFilterBar searchKeyword={searchKeyword} setSearchKeyword={setSearchKeyword} />

            <div className={styles.mobileList}>
                {filteredList.length === 0 && <div className={styles.empty}>검색 결과가 없습니다.</div>}
                {filteredList.map((item) => (
                    <div key={item.id} className={styles.contactCard} onClick={() => openDetail(item)}>
                        <div className={styles.cardRow}>
                            <span className={styles.cardName}>{item.site_name || '작업지명 미등록'}</span>
                            <span className={styles.cardBadge}>{formatDate(item.created_at)}</span>
                        </div>
                        <div className={styles.cardMeta}>{item.address || '-'}</div>
                        <div className={styles.cardMemo}>주의: {precautionsText(item)}</div>
                        <div className={styles.cardMemo}>특이: {notesText(item)}</div>
                        <div className={styles.cardMeta}>
                            <span>담당: {managerText(item)}</span>
                            {primaryContact(item) && (
                                <>
                                    <span>·</span>
                                    <PhoneLink value={primaryContact(item)}>{formatPhoneNumber(primaryContact(item))}</PhoneLink>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className={styles.desktopTable}>
                <IntranetDataTable
                    columns={columns}
                    rows={filteredList}
                    onRowClick={openDetail}
                    ariaLabel="작업지정보 목록"
                />
            </div>
        </div>
    );
}
