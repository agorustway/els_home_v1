'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import { AttachmentList, DetailField, DetailGrid, DetailHero, DetailSection } from '@/components/IntranetRecordDetail';
import { PhoneLink } from '@/components/IntranetDataTable';
import { formatPhoneNumber, getSafeFileUrl } from '@/utils/contactDisplay';
import styles from '../../intranet.module.css';

export default function PartnerContactsDetailPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const params = useParams();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/partner-contacts/' + params.id);
    }, [role, authLoading, router, params.id]);

    useEffect(() => {
        if (role && params.id) {
            fetch('/api/partner-contacts/' + params.id)
                .then((res) => res.json())
                .then((data) => { if (data.item) setItem(data.item); })
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [role, params.id]);

    const handleDelete = async () => {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        const res = await fetch('/api/partner-contacts/' + params.id, { method: 'DELETE' });
        if (res.ok) router.push('/employees/partner-contacts');
        else alert('삭제 실패');
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!item) return <div className={styles.empty}>항목을 찾을 수 없습니다.</div>;

    const files = (item.attachments || []).map((file) => ({
        ...file,
        href: getSafeFileUrl(file.url, file.name),
    }));

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>협력사정보</h1>
                <div className={styles.controls}>
                    <Link href={`/employees/partner-contacts/${params.id}/edit`} className={styles.btnSecondary}>수정</Link>
                    <button onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                    <Link href="/employees/partner-contacts" className={styles.btnSecondary}>목록</Link>
                </div>
            </div>

            <div className={styles.card}>
                <DetailHero title={item.company_name} subtitle="협력사 상세" />

                <DetailGrid>
                    <DetailField label="대표자" value={item.ceo_name || '-'} />
                    <DetailField label="회사 전화번호" tone="blue">
                        <PhoneLink value={item.phone}>{formatPhoneNumber(item.phone)}</PhoneLink>
                    </DetailField>
                    <DetailField label="담당자명" value={item.manager_name || '-'} />
                    <DetailField label="담당자 연락처">
                        <PhoneLink value={item.manager_phone}>{formatPhoneNumber(item.manager_phone)}</PhoneLink>
                    </DetailField>
                    <DetailField label="소재지" value={item.address || '-'} wide />
                </DetailGrid>

                <DetailSection title="비고 및 메모" muted>
                    {item.memo || '등록된 메모가 없습니다.'}
                </DetailSection>

                <DetailSection title="첨부 서류">
                    <AttachmentList files={files} emptyText="첨부된 서류가 없습니다." />
                </DetailSection>
            </div>
        </div>
    );
}
