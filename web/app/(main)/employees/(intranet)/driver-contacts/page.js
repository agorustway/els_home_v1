'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ExcelButtonGroup from '@/components/ExcelButtonGroup';
import ContactFilterBar from '@/components/ContactFilterBar';
import { useUserRole } from '@/hooks/useUserRole';
import { cargoTypeLabel, contractTypeLabel, mapVisibilityLabel } from '@/utils/vehicleCargoOptions.mjs';
import styles from '../intranet.module.css';

export default function DriverContactsPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [cargoFilter, setCargoFilter] = useState('all');
    const [contractFilter, setContractFilter] = useState('all');

    // 일괄 설정 상태
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkModalOpen, setBulkModalOpen] = useState(false);
    const [bulkVisibility, setBulkVisibility] = useState('own');
    const [bulkUpdating, setBulkUpdating] = useState(false);

    const formatPhone = (val) => {
        if (!val) return '-';
        const num = val.replace(/[^0-9]/g, '');
        if (num.length <= 3) return num;
        if (num.length <= 7) return `${num.slice(0, 3)}-${num.slice(3)}`;
        return `${num.slice(0, 3)}-${num.slice(3, 7)}-${num.slice(7, 11)}`;
    };

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/driver-contacts');
    }, [role, authLoading, router]);

    const fetchList = () => {
        setLoading(true);
        fetch('/api/driver-contacts')
            .then((res) => res.json())
            .then((data) => { 
                if (data.list) setList(data.list); 
                setSelectedIds(new Set()); // 데이터 새로고침 시 선택 초기화
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (role) {
            fetchList();
        }
    }, [role]);

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!role) return null;

    const filteredList = list.filter(item => {
        if (cargoFilter !== 'all' && (item.cargo_type || 'container') !== cargoFilter) return false;
        if (contractFilter !== 'all' && (item.contract_type || 'uncontracted') !== contractFilter) return false;
        if (searchKeyword) {
            const q = searchKeyword.toLowerCase();
            return (
                item.name?.toLowerCase().includes(q) || 
                item.phone?.toLowerCase().includes(q) || 
                item.vehicle_number?.toLowerCase().includes(q) || 
                item.vehicle_id?.toLowerCase().includes(q)
            );
        }
        return true;
    });

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredList.map(item => item.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const toggleSelect = (id, e) => {
        e.stopPropagation();
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
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
                    updates: { map_visibility: bulkVisibility }
                })
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

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>운전원정보</h1>
                <div className={styles.controls} style={{ flexWrap: 'wrap' }}>
                    <div className={styles.desktopOnlyBtns}>
                        <ExcelButtonGroup onUploadSuccess={fetchList} tableName="driver_contacts" />
                    </div>
                    {selectedIds.size > 0 && (
                        <button onClick={() => setBulkModalOpen(true)} className={styles.btnSecondary} style={{ color: '#0f172a', border: '1px solid #94a3b8', whiteSpace: 'nowrap', fontSize: '0.82rem', padding: '6px 14px' }}>
                            ✓ {selectedIds.size}명 선택됨 (지도권한 일괄변경)
                        </button>
                    )}
                    <Link href="/employees/driver-contacts/new" className={styles.btnPrimary}>등록</Link>
                </div>
            </div>
            
            <ContactFilterBar 
                searchKeyword={searchKeyword} 
                setSearchKeyword={setSearchKeyword} 
            />
            <div style={{ display: 'flex', gap: 8, margin: '0 0 12px', flexWrap: 'wrap' }}>
                <select value={cargoFilter} onChange={e => setCargoFilter(e.target.value)} className={styles.input} style={{ width: 160, height: 38 }}>
                    <option value="all">전체 업무유형</option>
                    <option value="container">컨테이너</option>
                    <option value="general">일반화물</option>
                </select>
                <select value={contractFilter} onChange={e => setContractFilter(e.target.value)} className={styles.input} style={{ width: 160, height: 38 }}>
                    <option value="all">전체 계약상태</option>
                    <option value="contracted">계약차량</option>
                    <option value="uncontracted">미계약차량</option>
                    <option value="partner">협력사</option>
                </select>
            </div>

            {/* ── 모바일 카드 뷰 (768px 이하) ── */}
            <div className={styles.mobileList}>
                {filteredList.length === 0 && <div className={styles.empty}>검색 결과가 없습니다.</div>}
                {filteredList.map((item) => (
                    <div
                        key={item.id}
                        className={styles.contactCard}
                        onClick={() => router.push('/employees/driver-contacts/' + item.id)}
                    >
                        <div className={styles.cardRow}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                {item.photo_driver || item.photo_url ? (
                                    <img src={item.photo_driver || item.photo_url} alt="" style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: '50%', flexShrink: 0, border: '2px solid #f1f5f9' }} />
                                ) : (
                                    <div style={{ width: 38, height: 38, background: '#f8fafc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: '1rem', flexShrink: 0 }}>👤</div>
                                )}
                            <span className={styles.cardName}>{item.name}</span>
                            </div>
                            <span className={styles.cardBadge} style={{
                                background: item.contract_type === 'contracted' ? '#dcfce7' : item.contract_type === 'partner' ? '#e0f2fe' : '#f1f5f9',
                                color: item.contract_type === 'contracted' ? '#16a34a' : item.contract_type === 'partner' ? '#0284c7' : '#94a3b8',
                                borderColor: item.contract_type === 'contracted' ? '#bbf7d0' : item.contract_type === 'partner' ? '#bae6fd' : '#e2e8f0',
                            }}>
                                {contractTypeLabel(item.contract_type || 'uncontracted')}
                            </span>
                        </div>
                        {item.phone && (
                            <div>
                                <a
                                    href={'tel:' + item.phone}
                                    onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(item.phone); }}
                                    className={styles.cardPhone}
                                >
                                    {formatPhone(item.phone)}
                                </a>
                            </div>
                        )}
                        {(item.vehicle_number || item.vehicle_id) && (
                            <div className={styles.cardMeta}>
                                <span>{cargoTypeLabel(item.cargo_type || 'container')}</span><span>·</span>
                                {item.vehicle_number && <span>차량: {item.vehicle_number}</span>}
                                {item.vehicle_id && <><span>·</span><span>{item.vehicle_id}</span></>}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* ── 데스크탑 테이블 뷰 (768px 초과) ── */}
            <div className={styles.desktopTable}>
                <div className={styles.card}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th style={{ width: '40px', textAlign: 'center', padding: '12px 10px' }}>
                                    <input 
                                        type="checkbox" 
                                        onChange={handleSelectAll} 
                                        checked={filteredList.length > 0 && selectedIds.size === filteredList.length} 
                                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                    />
                                </th>
                                <th style={{ width: '60px', textAlign: 'center' }}>사진</th>
                                <th style={{ whiteSpace: 'nowrap', textAlign: 'center', padding: '12px 16px' }}>계약</th>
                                <th style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>업무유형</th>
                                <th className={styles.colTitle} style={{ minWidth: '100px' }}>이름</th>
                                <th style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>전화번호</th>
                                <th style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>소속지점</th>
                                <th style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>차량번호</th>
                                <th style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>차량ID</th>
                                <th style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>마지막 컨테이너</th>
                                <th style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>차량/제원</th>
                                <th style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>지도범위</th>
                                <th style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>마지막 운행</th>
                                <th className={styles.colDate} style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>등록일</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredList.map((item) => (
                                <tr key={item.id} className={styles.row} onClick={() => router.push('/employees/driver-contacts/' + item.id)} style={{ backgroundColor: selectedIds.has(item.id) ? '#f0fdf4' : 'transparent' }}>
                                    <td style={{ textAlign: 'center', padding: '12px 10px' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={selectedIds.has(item.id)} 
                                            onChange={(e) => toggleSelect(item.id, e)} 
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                        />
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        {item.photo_driver || item.photo_url ? (
                                            <img src={item.photo_driver || item.photo_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: '50%', border: '2px solid #f1f5f9' }} />
                                        ) : (
                                            <div style={{ width: 44, height: 44, background: '#f8fafc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: '1.2rem' }}>👤</div>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span style={{
                                            display: 'inline-block', padding: '3px 8px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600,
                                            background: item.contract_type === 'contracted' ? '#dcfce7' : item.contract_type === 'partner' ? '#e0f2fe' : '#f1f5f9',
                                            color: item.contract_type === 'contracted' ? '#16a34a' : item.contract_type === 'partner' ? '#0284c7' : '#94a3b8',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {contractTypeLabel(item.contract_type || 'uncontracted')}
                                        </span>
                                        {item.partner_company && <div style={{ fontSize: '0.72rem', color: '#0284c7', marginTop: 4 }}>{item.partner_company}</div>}
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap', padding: '12px 16px', fontWeight: 700, color: (item.cargo_type || 'container') === 'general' ? '#7c3aed' : '#2563eb' }}>{cargoTypeLabel(item.cargo_type || 'container')}</td>
                                    <td className={styles.colTitle} style={{ whiteSpace: 'nowrap' }}>{item.name}</td>
                                    <td style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>{item.phone ? <a href={'tel:' + item.phone} onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.phone).then(()=>alert('전화번호가 복사되었습니다.')); }} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>{formatPhone(item.phone)}</a> : '—'}</td>
                                    <td style={{ whiteSpace: 'nowrap', padding: '12px 16px', color: '#475569', fontWeight: 700 }}>{item.branch || item.partner_company || '-'}</td>
                                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap', padding: '12px 16px' }}>{item.vehicle_number || '-'}</td>
                                    <td style={{ color: '#64748b', fontSize: '0.85rem', letterSpacing: '0.5px', whiteSpace: 'nowrap', padding: '12px 16px' }}>{item.vehicle_id || '-'}</td>
                                    <td style={{ fontSize: '0.85rem', color: '#64748b', whiteSpace: 'nowrap', padding: '12px 16px' }}>{item.last_container_number || '-'}</td>
                                    <td style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', padding: '12px 16px' }}>{(item.cargo_type || 'container') === 'general' ? `${item.general_vehicle_type || '-'} / ${item.general_payload || '-'} / ${item.general_body_type || '-'}` : `${item.last_container_type || '-'} / ${item.last_container_kind || '-'}`}</td>
                                    <td style={{ fontSize: '0.85rem', color: '#64748b', whiteSpace: 'nowrap', padding: '12px 16px' }}>{mapVisibilityLabel(item.map_visibility || 'own')}</td>
                                    <td style={{ fontSize: '0.85rem', color: '#94a3b8', whiteSpace: 'nowrap', padding: '12px 16px' }}>
                                        {item.last_trip_started_at ? new Date(item.last_trip_started_at).toLocaleDateString() : '-'}
                                    </td>
                                    <td className={styles.colDate} style={{ whiteSpace: 'nowrap', padding: '12px 16px' }}>{new Date(item.created_at).toLocaleDateString()}</td>
                                </tr>
                            ))}
                            {filteredList.length === 0 && (
                                <tr><td colSpan="13" className={styles.empty}>검색 결과가 없습니다.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 일괄 변경 모달 */}
            {bulkModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setBulkModalOpen(false)}>
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: '#0f172a' }}>지도 공개범위 일괄 설정</h3>
                        <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '20px' }}>선택된 {selectedIds.size}명의 기사에게 앱 지도 노출 권한을 일괄 적용합니다.</p>
                        
                        <select 
                            value={bulkVisibility} 
                            onChange={(e) => setBulkVisibility(e.target.value)} 
                            className={styles.input} 
                            style={{ height: '44px', width: '100%', marginBottom: '24px' }}
                        >
                            <option value="own">단독 자기차량만</option>
                            <option value="contracted">소속/계약차량 전체</option>
                            <option value="all">전체운행차량</option>
                        </select>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setBulkModalOpen(false)} className={styles.btnSecondary} style={{ width: '100px', height: '40px' }}>취소</button>
                            <button onClick={handleBulkUpdate} disabled={bulkUpdating} className={styles.btnPrimary} style={{ width: '100px', height: '40px' }}>
                                {bulkUpdating ? '적용 중...' : '적용하기'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
