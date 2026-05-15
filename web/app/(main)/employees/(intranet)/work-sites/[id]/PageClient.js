'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import { AttachmentList, DetailField, DetailGrid, DetailHero, DetailSection } from '@/components/IntranetRecordDetail';
import { PhoneLink } from '@/components/IntranetDataTable';
import { formatPhoneNumber, getSafeFileUrl, isImageFile, joinDefined } from '@/utils/contactDisplay';
import styles from '../../intranet.module.css';

export default function WorkSiteDetailPage() {
    const { id } = useParams();
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [item, setItem] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/work-sites/' + id);
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role && id) {
            fetch('/api/work-sites/' + id)
                .then((res) => res.json())
                .then((data) => setItem(data.item))
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [role, id]);

    const handleFileUpload = async (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            const newAttachments = [...(item.attachments || [])];

            for (const file of Array.from(files)) {
                const key = `WorkSites/${id}/${Date.now()}_${file.name}`;
                const formData = new FormData();
                formData.append('key', key);
                formData.append('file', file);

                const res = await fetch('/api/s3/files', { method: 'POST', body: formData });
                if (!res.ok) throw new Error(`${file.name} 업로드 실패`);

                newAttachments.push({
                    name: file.name,
                    key,
                    url: `${window.location.origin}/api/s3/files?key=${encodeURIComponent(key)}&name=${encodeURIComponent(file.name)}`,
                });
            }

            const updateRes = await fetch(`/api/work-sites/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attachments: newAttachments }),
            });

            if (!updateRes.ok) throw new Error('DB 업데이트 실패');

            const data = await updateRes.json();
            setItem(data.item);
            alert('파일이 성공적으로 추가되었습니다.');
        } catch (error) {
            console.error(error);
            alert(error.message);
        } finally {
            setUploading(false);
            event.target.value = '';
        }
    };

    const handleDelete = async () => {
        if (!confirm('삭제하시겠습니까?')) return;
        const res = await fetch('/api/work-sites/' + id, { method: 'DELETE' });
        if (res.ok) router.push('/employees/work-sites');
        else alert('삭제 실패');
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!role) return null;
    if (!item) return <div className={styles.loading}>작업지를 찾을 수 없습니다.</div>;

    const managers = item.managers || [];
    let workProcess = {};
    try {
        if (item.work_method && item.work_method.trim().startsWith('{')) {
            workProcess = JSON.parse(item.work_method);
        } else {
            workProcess = { notes: item.work_method };
        }
    } catch {
        workProcess = { notes: item.work_method };
    }

    const managerSummary = managers.length > 0
        ? managers.map((manager) => joinDefined([manager.name, manager.role], ' ')).join(', ')
        : '등록된 담당자 없음';

    const processRows = [
        ['담당자', managers.length > 0 ? managers.map((manager) => joinDefined([manager.name, manager.role, manager.phone], ' / ')).join('\n') : '등록된 담당자가 없습니다.'],
        ['주소', item.address || '-'],
        ['주의사항', workProcess.precautions || workProcess.notes],
        ['입차', workProcess.entryProcess],
        ['접수', workProcess.receptionProcess],
        ['적입', workProcess.loadingProcess],
        ['출차', workProcess.exitProcess],
    ].filter(([, value]) => value);

    const attachments = item.attachments || [];
    const images = attachments.filter(isImageFile);
    const files = attachments.map((file) => ({
        ...file,
        href: getSafeFileUrl(file.url || `/api/s3/files?key=${encodeURIComponent(file.key || '')}`, file.name),
    }));

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>작업지정보</h1>
                <div className={styles.controls}>
                    <Link href={`/employees/work-sites/${id}/edit`} className={styles.btnSecondary}>수정</Link>
                    <button type="button" onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                    <Link href="/employees/work-sites" className={styles.btnSecondary}>목록</Link>
                </div>
            </div>

            <div className={styles.card}>
                <DetailHero
                    title={item.site_name || '작업지명 미등록'}
                    subtitle="작업지 확인"
                    badges={[managerSummary]}
                />

                <DetailGrid>
                    <DetailField label="대표 연락처" tone="blue">
                        <PhoneLink value={item.contact || managers[0]?.phone}>{formatPhoneNumber(item.contact || managers[0]?.phone)}</PhoneLink>
                    </DetailField>
                    <DetailField label="담당자" value={managerSummary} />
                    <DetailField label="작업지 주소" value={item.address || '-'} wide />
                </DetailGrid>

                <DetailSection title="작업 프로세스">
                    <div className={styles.workProcess}>
                        {processRows.map(([label, value]) => (
                            <div key={label} className={styles.workProcessRow}>
                                <div className={styles.workProcessLabel}>{label}</div>
                                <div className={styles.workProcessValue}>{value}</div>
                            </div>
                        ))}
                        <div className={styles.workProcessRow}>
                            <div className={styles.workProcessLabel}>약도</div>
                            <div className={styles.workProcessValue}>
                                {images.length > 0 ? (
                                    <div className={styles.imagePreviewGrid}>
                                        {images.map((image, index) => (
                                            <img
                                                key={`${image.name || 'map'}-${index}`}
                                                src={getSafeFileUrl(image.url || `/api/s3/files?key=${encodeURIComponent(image.key || '')}`, image.name)}
                                                alt="약도"
                                                className={styles.imagePreview}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    '등록된 약도 이미지가 없습니다.'
                                )}
                            </div>
                        </div>
                    </div>
                </DetailSection>

                <DetailSection title="특이사항" muted>
                    {item.notes || '특이사항 없음'}
                </DetailSection>

                <DetailSection title="관련 첨부서류">
                    <AttachmentList files={files} emptyText="첨부된 서류가 없습니다." />
                    <div className={styles.actions}>
                        <input
                            type="file"
                            id="workFileAdd"
                            multiple
                            onChange={handleFileUpload}
                            disabled={uploading}
                            style={{ display: 'none' }}
                        />
                        <label htmlFor="workFileAdd" className={styles.btnSecondary}>
                            {uploading ? '업로드 중...' : '파일 추가'}
                        </label>
                    </div>
                </DetailSection>
            </div>
        </div>
    );
}
