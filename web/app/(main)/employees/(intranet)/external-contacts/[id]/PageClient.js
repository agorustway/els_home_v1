'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import { DetailField, DetailGrid, DetailHero, DetailSection } from '@/components/IntranetRecordDetail';
import { DataBadge, PhoneLink } from '@/components/IntranetDataTable';
import { formatPhoneNumber } from '@/utils/contactDisplay';
import styles from '../../intranet.module.css';

export default function ExternalContactDetailPage() {
    const { id } = useParams();
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/external-contacts/' + id);
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role && id) {
            fetch('/api/external-contacts/' + id)
                .then((res) => res.json())
                .then((data) => setItem(data.item))
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [role, id]);

    const handleDelete = async () => {
        if (!confirm('삭제하시겠습니까?')) return;
        const res = await fetch('/api/external-contacts/' + id, { method: 'DELETE' });
        if (res.ok) router.push('/employees/external-contacts');
        else alert('삭제 실패');
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!role) return null;
    if (!item) return <div className={styles.loading}>연락처를 찾을 수 없습니다.</div>;

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>외부연락처</h1>
                <div className={styles.controls}>
                    <Link href={`/employees/external-contacts/${id}/edit`} className={styles.btnSecondary}>수정</Link>
                    <button type="button" onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                    <Link href="/employees/external-contacts" className={styles.btnSecondary}>목록</Link>
                </div>
            </div>

            <div className={styles.card}>
                <DetailHero
                    title={item.company_name}
                    subtitle="외부 연락처"
                    badges={[item.contact_type || '구분 없음']}
                />

                <DetailGrid>
                    <DetailField label="구분">
                        <DataBadge>{item.contact_type || '미분류'}</DataBadge>
                    </DetailField>
                    <DetailField label="대표 연락처" tone="blue">
                        <PhoneLink value={item.phone}>{formatPhoneNumber(item.phone)}</PhoneLink>
                    </DetailField>
                    <DetailField label="담당자" value={item.contact_person || '-'} />
                    <DetailField label="담당자 연락처">
                        <PhoneLink value={item.contact_person_phone}>{formatPhoneNumber(item.contact_person_phone)}</PhoneLink>
                    </DetailField>
                    <DetailField label="이메일" value={item.email || '-'} />
                    <DetailField label="소재지" value={item.address || '-'} />
                </DetailGrid>

                <DetailSection title="메모 및 비고" muted>
                    {item.memo || '현재 등록된 추가 메모 정보가 없습니다.'}
                </DetailSection>
            </div>
        </div>
    );
}
