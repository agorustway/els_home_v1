'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import { AttachmentList, DetailField, DetailGrid, DetailHero, DetailSection } from '@/components/IntranetRecordDetail';
import { DataBadge, InitialAvatar, PhoneLink } from '@/components/IntranetDataTable';
import { cargoTypeLabel, contractTypeLabel, mapVisibilityLabel } from '@/utils/vehicleCargoOptions.mjs';
import { formatDateTime, formatPhoneNumber, getSafeFileUrl, joinDefined } from '@/utils/contactDisplay';
import styles from '../../intranet.module.css';

const contractTone = (value) => {
    if (value === 'contracted') return 'green';
    if (value === 'partner') return 'cyan';
    return 'gray';
};

const cargoTone = (value) => ((value || 'container') === 'general' ? 'purple' : 'blue');

export default function DriverContactsDetailPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const params = useParams();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState(null);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/driver-contacts/' + params.id);
    }, [role, authLoading, router, params.id]);

    useEffect(() => {
        if (role && params.id) {
            fetch('/api/driver-contacts/' + params.id)
                .then((res) => res.json())
                .then((data) => { if (data.item) setItem(data.item); })
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [role, params.id]);

    const handleDelete = async () => {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        const res = await fetch('/api/driver-contacts/' + params.id, { method: 'DELETE' });
        if (res.ok) router.push('/employees/driver-contacts');
        else alert('삭제 실패');
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!item) return <div className={styles.empty}>항목을 찾을 수 없습니다.</div>;

    const driverPhoto = getSafeFileUrl(item.photo_driver || item.photo_url);
    const vehiclePhoto = getSafeFileUrl(item.photo_vehicle);
    const chassisPhoto = getSafeFileUrl(item.photo_chassis);
    const isGeneral = (item.cargo_type || 'container') === 'general';
    const docFiles = (item.additional_docs || []).map((file) => ({
        ...file,
        href: getSafeFileUrl(file.url, file.name),
    }));

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>운전원정보</h1>
                <div className={styles.controls}>
                    <Link href={`/employees/driver-contacts/${params.id}/edit`} className={styles.btnSecondary}>수정</Link>
                    <button onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                    <Link href="/employees/driver-contacts" className={styles.btnSecondary}>목록</Link>
                </div>
            </div>

            <div className={styles.card}>
                <DetailHero
                    title={item.name}
                    subtitle={joinDefined([item.branch, item.partner_company], ' / ') || '운전원'}
                    badges={[
                        contractTypeLabel(item.contract_type || 'uncontracted'),
                        cargoTypeLabel(item.cargo_type || 'container'),
                        mapVisibilityLabel(item.map_visibility || 'own'),
                    ]}
                    avatar={
                        <button className={styles.photoThumb} onClick={() => driverPhoto && setSelectedImage(driverPhoto)} title="운전원 사진 보기">
                            {driverPhoto ? <img src={driverPhoto} alt="운전원" /> : <InitialAvatar name={item.name} size="lg" />}
                        </button>
                    }
                />

                <DetailGrid>
                    <DetailField label="계약유형">
                        <DataBadge tone={contractTone(item.contract_type || 'uncontracted')}>
                            {contractTypeLabel(item.contract_type || 'uncontracted')}
                        </DataBadge>
                    </DetailField>
                    <DetailField label="업무유형">
                        <DataBadge tone={cargoTone(item.cargo_type)}>{cargoTypeLabel(item.cargo_type || 'container')}</DataBadge>
                    </DetailField>
                    <DetailField label="연락처" tone="blue">
                        <PhoneLink value={item.phone}>{formatPhoneNumber(item.phone)}</PhoneLink>
                    </DetailField>
                    <DetailField label="지도 공개범위" value={mapVisibilityLabel(item.map_visibility || 'own')} />
                    <DetailField label="소속지점" value={item.branch || '-'} />
                    <DetailField label="협력사" value={item.partner_company || '-'} />
                    <DetailField label="차량번호" value={item.vehicle_number || '-'} />
                    <DetailField label="차량아이디" value={item.vehicle_id || '-'} />
                    {isGeneral ? (
                        <>
                            <DetailField label="차량종류" value={item.general_vehicle_type || '-'} />
                            <DetailField label="적재중량" value={item.general_payload || '-'} />
                            <DetailField label="특장구분" value={item.general_body_type || '-'} />
                        </>
                    ) : (
                        <>
                            <DetailField label="차종" value={item.vehicle_type || '-'} />
                            <DetailField label="샤시종류" value={item.chassis_type || '-'} />
                        </>
                    )}
                </DetailGrid>

                <DetailSection title="사진 자료">
                    <div className={styles.imagePreviewGrid}>
                        <button className={styles.photoThumb} onClick={() => driverPhoto && setSelectedImage(driverPhoto)}>
                            {driverPhoto ? <img src={driverPhoto} alt="운전원" /> : '운전원'}
                        </button>
                        <button className={styles.photoThumb} onClick={() => vehiclePhoto && setSelectedImage(vehiclePhoto)}>
                            {vehiclePhoto ? <img src={vehiclePhoto} alt="차량" /> : '차량'}
                        </button>
                        <button className={styles.photoThumb} onClick={() => chassisPhoto && setSelectedImage(chassisPhoto)}>
                            {chassisPhoto ? <img src={chassisPhoto} alt="샤시" /> : '샤시'}
                        </button>
                    </div>
                </DetailSection>

                {item.last_container_number && (
                    <DetailSection title="마지막 운행 정보" muted>
                        <DetailGrid columns={3}>
                            <DetailField label="컨테이너" value={item.last_container_number} />
                            <DetailField label="씰넘버" value={item.last_seal_number || '-'} />
                            <DetailField label="타입" value={item.last_container_type || '-'} />
                            <DetailField label="종류" value={item.last_container_kind || '-'} />
                            <DetailField label="운행시작" value={formatDateTime(item.last_trip_started_at)} />
                            <DetailField label="운행종료" value={formatDateTime(item.last_trip_completed_at)} />
                        </DetailGrid>
                    </DetailSection>
                )}

                <DetailSection title="추가 서류">
                    <AttachmentList files={docFiles} emptyText="첨부된 서류가 없습니다." />
                </DetailSection>
            </div>

            {selectedImage && (
                <div className={styles.modalBackdrop} onClick={() => setSelectedImage(null)}>
                    <img src={selectedImage} className={styles.modalImage} alt="원본 사진" onClick={(event) => event.stopPropagation()} />
                    <button className={styles.modalClose} onClick={() => setSelectedImage(null)} aria-label="닫기">×</button>
                </div>
            )}
        </div>
    );
}
