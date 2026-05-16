'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ExcelButtonGroup from '@/components/ExcelButtonGroup';
import ContactFilterBar from '@/components/ContactFilterBar';
import IntranetDataTable, { DataBadge, InitialAvatar, PhoneLink } from '@/components/IntranetDataTable';
import { useUserRole } from '@/hooks/useUserRole';
import { cargoTypeLabel, contractTypeLabel, mapVisibilityLabel } from '@/utils/vehicleCargoOptions.mjs';
import { formatDate, formatPhoneNumber, joinDefined } from '@/utils/contactDisplay';
import styles from '../intranet.module.css';

const contractTone = (value) => {
    if (value === 'contracted') return 'green';
    if (value === 'partner') return 'cyan';
    return 'gray';
};

const cargoTone = (value) => ((value || 'container') === 'general' ? 'purple' : 'blue');

export default function DriverContactsPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [cargoFilter, setCargoFilter] = useState('all');
    const [contractFilter, setContractFilter] = useState('all');
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkModalOpen, setBulkModalOpen] = useState(false);
    const [bulkVisibility, setBulkVisibility] = useState('own');
    const [bulkUpdating, setBulkUpdating] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/driver-contacts');
    }, [role, authLoading, router]);

    const fetchList = () => {
        setLoading(true);
        fetch('/api/driver-contacts')
            .then((res) => res.json())
            .then((data) => {
                if (data.list) setList(data.list);
                setSelectedIds(new Set());
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (role) fetchList();
    }, [role]);

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!role) return null;

    const filteredList = list.filter((item) => {
        if (cargoFilter !== 'all' && (item.cargo_type || 'container') !== cargoFilter) return false;
        if (contractFilter !== 'all' && (item.contract_type || 'uncontracted') !== contractFilter) return false;
        if (!searchKeyword) return true;
        const q = searchKeyword.toLowerCase();
        return (
            item.name?.toLowerCase().includes(q) ||
            item.phone?.toLowerCase().includes(q) ||
            item.vehicle_number?.toLowerCase().includes(q) ||
            item.vehicle_id?.toLowerCase().includes(q) ||
            item.branch?.toLowerCase().includes(q) ||
            item.partner_company?.toLowerCase().includes(q)
        );
    });

    const filteredIds = filteredList.map((item) => item.id);
    const allVisibleSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
    const openDetail = (item) => router.push('/employees/driver-contacts/' + item.id);

    const handleSelectAll = (event) => {
        if (event.target.checked) {
            setSelectedIds(new Set(filteredIds));
        } else {
            setSelectedIds(new Set());
        }
    };

    const toggleSelect = (id, event) => {
        event.stopPropagation();
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleBulkUpdate = async () => {
        if (selectedIds.size === 0) return alert('선택된 항목이 없습니다.');
        setBulkUpdating(true);
        try {
            const res = await fetch('/api/driver-contacts/bulk', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: Array.from(selectedIds),
                    updates: { map_visibility: bulkVisibility },
                }),
            });
            if (res.ok) {
                alert(`선택한 ${selectedIds.size}명의 권한이 변경되었습니다.`);
                setBulkModalOpen(false);
                fetchList();
            } else {
                alert('일괄 변경에 실패했습니다.');
            }
        } catch (error) {
            console.error(error);
            alert('오류가 발생했습니다.');
        } finally {
            setBulkUpdating(false);
        }
    };

    const vehicleSpec = (item) => {
        if ((item.cargo_type || 'container') === 'general') {
            return joinDefined([item.general_vehicle_type || '-', item.general_payload || '-', item.general_body_type || '-'], ' / ');
        }
        return joinDefined([item.last_container_type || '-', item.last_container_kind || '-'], ' / ');
    };

    const columns = [
        {
            key: 'select',
            header: <input type="checkbox" onChange={handleSelectAll} checked={allVisibleSelected} aria-label="전체 선택" />,
            colClassName: styles.colSelectFixed,
            align: 'center',
            render: (item) => (
                <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={(event) => toggleSelect(item.id, event)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`${item.name || '운전원'} 선택`}
                />
            ),
        },
        {
            key: 'photo',
            header: '사진',
            colClassName: styles.colAvatarFixed,
            align: 'center',
            render: (item) => <InitialAvatar name={item.name} src={item.photo_driver || item.photo_url} label={item.name} />,
        },
        {
            key: 'contract_type',
            header: '계약',
            colClassName: styles.colTypeFixed,
            render: (item) => (
                <DataBadge tone={contractTone(item.contract_type || 'uncontracted')}>
                    {contractTypeLabel(item.contract_type || 'uncontracted')}
                </DataBadge>
            ),
        },
        {
            key: 'cargo_type',
            header: '업무유형',
            colClassName: styles.colTypeFixed,
            render: (item) => <DataBadge tone={cargoTone(item.cargo_type)}>{cargoTypeLabel(item.cargo_type || 'container')}</DataBadge>,
        },
        {
            key: 'name',
            header: '이름',
            colClassName: styles.colNameFixed,
            cellClassName: styles.primaryCell,
            render: (item) => item.name || '-',
        },
        {
            key: 'phone',
            header: '전화번호',
            colClassName: styles.colPhoneFixed,
            render: (item) => <PhoneLink value={item.phone}>{formatPhoneNumber(item.phone)}</PhoneLink>,
        },
        {
            key: 'branch',
            header: '소속지점',
            colClassName: styles.colTypeFixed,
            cellClassName: styles.secondaryCell,
            render: (item) => item.branch || item.partner_company || '-',
        },
        {
            key: 'vehicle_number',
            header: '차량번호',
            colClassName: styles.colVehicleFixed,
            cellClassName: styles.secondaryCell,
            render: (item) => item.vehicle_number || '-',
        },
        {
            key: 'vehicle_id',
            header: '차량ID',
            colClassName: styles.colVehicleFixed,
            cellClassName: styles.truncateCell,
            render: (item) => item.vehicle_id || '-',
        },
        {
            key: 'last_container_number',
            header: '마지막 컨테이너',
            colClassName: styles.colMetaFixed,
            cellClassName: styles.truncateCell,
            render: (item) => item.last_container_number || '-',
        },
        {
            key: 'spec',
            header: '차량/제원',
            colClassName: styles.colMetaFixed,
            cellClassName: styles.truncateCell,
            render: vehicleSpec,
        },
        {
            key: 'map_visibility',
            header: '지도범위',
            colClassName: styles.colTypeFixed,
            cellClassName: styles.secondaryCell,
            render: (item) => mapVisibilityLabel(item.map_visibility || 'own'),
        },
        {
            key: 'last_trip_started_at',
            header: '마지막 운행',
            colClassName: styles.colDateFixed,
            cellClassName: styles.mutedCell,
            render: (item) => formatDate(item.last_trip_started_at),
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
                <h1 className={styles.title}>운전원정보</h1>
                <div className={styles.controls}>
                    <div className={styles.desktopOnlyBtns}>
                        <ExcelButtonGroup onUploadSuccess={fetchList} tableName="driver_contacts" />
                    </div>
                    <button
                        onClick={() => selectedIds.size > 0 && setBulkModalOpen(true)}
                        className={styles.btnSecondary}
                        disabled={selectedIds.size === 0}
                        title={selectedIds.size === 0 ? '목록에서 운전원을 선택하면 일괄 설정할 수 있습니다.' : '선택 운전원의 지도 공개범위를 일괄 설정합니다.'}
                    >
                        지도범위 일괄설정{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                    </button>
                    <Link href="/employees/driver-contacts/new" className={styles.btnPrimary}>등록</Link>
                </div>
            </div>

            <ContactFilterBar searchKeyword={searchKeyword} setSearchKeyword={setSearchKeyword} />
            <div className={styles.subFilterRow}>
                <select value={cargoFilter} onChange={(event) => setCargoFilter(event.target.value)} className={styles.input}>
                    <option value="all">전체 업무유형</option>
                    <option value="container">컨테이너</option>
                    <option value="general">일반화물</option>
                </select>
                <select value={contractFilter} onChange={(event) => setContractFilter(event.target.value)} className={styles.input}>
                    <option value="all">전체 계약상태</option>
                    <option value="contracted">계약차량</option>
                    <option value="uncontracted">미계약차량</option>
                    <option value="partner">협력사</option>
                </select>
            </div>

            <div className={styles.mobileList}>
                {filteredList.length === 0 && <div className={styles.empty}>검색 결과가 없습니다.</div>}
                {filteredList.map((item) => (
                    <div key={item.id} className={styles.contactCard} onClick={() => openDetail(item)}>
                        <div className={styles.cardRow}>
                            <div className={styles.cardRow} style={{ minWidth: 0 }}>
                                <InitialAvatar name={item.name} src={item.photo_driver || item.photo_url} size="sm" label={item.name} />
                                <span className={styles.cardName}>{item.name || '-'}</span>
                            </div>
                            <DataBadge tone={contractTone(item.contract_type || 'uncontracted')}>
                                {contractTypeLabel(item.contract_type || 'uncontracted')}
                            </DataBadge>
                        </div>
                        {item.phone && <PhoneLink value={item.phone}>{formatPhoneNumber(item.phone)}</PhoneLink>}
                        <div className={styles.cardMeta}>
                            <span>{cargoTypeLabel(item.cargo_type || 'container')}</span>
                            {item.vehicle_number && <><span>·</span><span>{item.vehicle_number}</span></>}
                            {item.branch && <><span>·</span><span>{item.branch}</span></>}
                        </div>
                    </div>
                ))}
            </div>

            <div className={styles.desktopTable}>
                <IntranetDataTable
                    columns={columns}
                    rows={filteredList}
                    onRowClick={openDetail}
                    rowStyle={(item) => (selectedIds.has(item.id) ? { backgroundColor: '#f0fdf4' } : undefined)}
                    ariaLabel="운전원정보 목록"
                />
            </div>

            {bulkModalOpen && (
                <div className={styles.modalBackdrop} onClick={() => setBulkModalOpen(false)}>
                    <div className={styles.card} style={{ width: 'min(92vw, 400px)' }} onClick={(event) => event.stopPropagation()}>
                        <h3 className={styles.detailSectionTitle}>지도 공개범위 일괄 설정</h3>
                        <p className={styles.detailSectionBody}>선택된 {selectedIds.size}명의 기사에게 앱 지도 노출 권한을 적용합니다.</p>
                        <select value={bulkVisibility} onChange={(event) => setBulkVisibility(event.target.value)} className={styles.input}>
                            <option value="own">단독 자기차량만</option>
                            <option value="contracted">소속/계약차량 전체</option>
                            <option value="all">전체운행차량</option>
                        </select>
                        <div className={styles.actions}>
                            <button onClick={() => setBulkModalOpen(false)} className={styles.btnSecondary}>취소</button>
                            <button onClick={handleBulkUpdate} disabled={bulkUpdating} className={styles.btnPrimary}>
                                {bulkUpdating ? '적용 중...' : '적용'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
