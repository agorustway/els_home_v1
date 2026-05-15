'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import { DetailField, DetailGrid, DetailHero, DetailSection } from '@/components/IntranetRecordDetail';
import { InitialAvatar, PhoneLink } from '@/components/IntranetDataTable';
import { formatPhoneNumber, getSafeFileUrl, joinDefined } from '@/utils/contactDisplay';
import styles from '../../intranet.module.css';

export default function InternalContactDetailPage() {
    const { id } = useParams();
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/internal-contacts/' + id);
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role && id) {
            fetch('/api/internal-contacts/' + id)
                .then((res) => res.json())
                .then((data) => setItem(data.item))
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [role, id]);

    const handleDelete = async () => {
        if (!confirm('삭제하시겠습니까?')) return;
        const res = await fetch('/api/internal-contacts/' + id, { method: 'DELETE' });
        if (res.ok) router.push('/employees/internal-contacts');
        else alert('삭제 실패');
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!role) return null;
    if (!item) return <div className={styles.loading}>연락처를 찾을 수 없습니다.</div>;

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>사내연락망</h1>
                <div className={styles.controls}>
                    <Link href={`/employees/internal-contacts/${id}/edit`} className={styles.btnSecondary}>수정</Link>
                    <button type="button" onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                    <Link href="/employees/internal-contacts" className={styles.btnSecondary}>목록</Link>
                </div>
            </div>

            <div className={styles.card}>
                <DetailHero
                    title={item.name}
                    subtitle="사내 구성원"
                    badges={[joinDefined([item.department, item.position])]}
                    avatar={<InitialAvatar name={item.name} src={getSafeFileUrl(item.photo_url)} size="lg" label={item.name} />}
                />

                <DetailGrid>
                    <DetailField label="연락처" tone="blue">
                        <PhoneLink value={item.phone}>{formatPhoneNumber(item.phone)}</PhoneLink>
                    </DetailField>
                    <DetailField label="이메일" value={item.email || '미등록'} />
                    <DetailField label="부서" value={item.department || '-'} />
                    <DetailField label="직급/직책" value={item.position || '-'} />
                </DetailGrid>

                <DetailSection title="기타 메모 및 업무 특이사항" muted>
                    {item.memo || '현재 등록된 추가 메모 정보가 없습니다.'}
                </DetailSection>
            </div>
        </div>
    );
}
