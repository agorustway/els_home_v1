'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import IntranetDataTable, { DataBadge } from '@/components/IntranetDataTable';
import { DetailHero, DetailSection } from '@/components/IntranetRecordDetail';
import { formatDateTime, getSafeFileUrl } from '@/utils/contactDisplay';
import styles from '../../intranet.module.css';

export default function WorkDocDetailPage() {
    const { id } = useParams();
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showAttachments, setShowAttachments] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace(`/login?next=/employees/work-docs/${id}`);
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role && id) {
            fetch(`/api/work-docs/${id}`)
                .then((res) => res.json())
                .then((data) => setItem(data.item))
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [role, id]);

    const renderContent = (content) => {
        if (!content) return <span className={styles.mutedText}>(내용 없음)</span>;

        if (content.match(/!\[([^\]]*)\]\(([^\)]+)\)/)) {
            const imgRegex = /!\[([^\]]*)\]\(([^\)]+)\)/g;
            const parts = content.split(imgRegex);
            const elements = [];
            for (let i = 0; i < parts.length; i += 3) {
                elements.push(<span key={`text-${i}`} style={{ whiteSpace: 'pre-wrap' }}>{parts[i]}</span>);
                if (parts[i + 1] !== undefined && parts[i + 2] !== undefined) {
                    elements.push(
                        <div key={`img-container-${i}`} className={styles.imagePreviewGrid}>
                            <img src={parts[i + 2]} alt={parts[i + 1]} className={styles.imagePreview} />
                        </div>
                    );
                }
            }
            return <div>{elements}</div>;
        }

        return <div dangerouslySetInnerHTML={{ __html: content }} />;
    };

    const handleDelete = async () => {
        if (!confirm('삭제하시겠습니까?')) return;
        const res = await fetch(`/api/work-docs/${id}`, { method: 'DELETE' });
        if (res.ok) router.push('/employees/work-docs');
        else alert('삭제 실패');
    };

    const getDownloadUrl = (file) => {
        const safeUrl = getSafeFileUrl(file.url || '', file.name || '첨부파일');
        if (safeUrl) return safeUrl;

        const nameParam = `&name=${encodeURIComponent(file.name || 'file')}`;
        if (file.type === 's3' || (file.key && file.key.includes('/'))) {
            return `/api/s3/files?key=${encodeURIComponent(file.key)}${nameParam}`;
        }
        return `/api/nas/files?path=${encodeURIComponent(file.path || file.key)}&download=true${nameParam}`;
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            alert('다운로드 주소가 복사되었습니다.');
        }).catch((error) => {
            console.error('복사 실패:', error);
        });
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!role) return null;
    if (!item) return <div className={styles.loading}>글을 찾을 수 없습니다.</div>;

    const attachments = item.attachments || [];
    const attachmentRows = attachments.map((file, index) => ({
        ...file,
        no: index + 1,
        downloadUrl: getDownloadUrl(file),
    }));

    const attachmentColumns = [
        {
            key: 'no',
            header: 'No',
            colClassName: styles.colNoFixed,
            align: 'center',
            cellClassName: styles.mutedCell,
            render: (file) => file.no,
        },
        {
            key: 'name',
            header: '파일명',
            colClassName: styles.colNoteFluid,
            cellClassName: styles.primaryCell,
            render: (file) => file.name || '첨부파일',
        },
        {
            key: 'size',
            header: '크기',
            colClassName: styles.colDateFixed,
            cellClassName: styles.mutedCell,
            render: (file) => (file.size ? `${(file.size / 1024).toFixed(1)} KB` : '-'),
        },
        {
            key: 'actions',
            header: '작업',
            colClassName: styles.colMetaFixed,
            align: 'center',
            render: (file) => (
                <div className={styles.controls}>
                    <a href={file.downloadUrl} className={styles.btnPrimary}>내려받기</a>
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            copyToClipboard(window.location.origin + file.downloadUrl);
                        }}
                        className={styles.btnSecondary}
                    >
                        주소 복사
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>업무자료실</h1>
                <div className={styles.controls}>
                    <Link href={`/employees/work-docs/${id}/edit`} className={styles.btnSecondary}>수정</Link>
                    <button type="button" onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                    <Link href="/employees/work-docs" className={styles.btnSecondary}>목록</Link>
                </div>
            </div>

            <div className={styles.card}>
                <DetailHero
                    title={item.title}
                    subtitle="업무자료 상세"
                    badges={[item.category || '일반', item.author_name || '작성자 미상', formatDateTime(item.created_at)]}
                />

                <DetailSection title="본문">
                    {renderContent(item.content)}
                </DetailSection>

                {attachments.length > 0 && (
                    <DetailSection>
                        <button
                            type="button"
                            className={styles.attachmentToggle}
                            onClick={() => setShowAttachments(!showAttachments)}
                        >
                            <span className={styles.attachmentLabel}>
                                첨부파일 <DataBadge tone="blue">{attachments.length}</DataBadge>
                            </span>
                            <span className={styles.mutedText}>{showAttachments ? '접기' : '펼치기'}</span>
                        </button>
                        {showAttachments && (
                            <div style={{ marginTop: 8 }}>
                                <IntranetDataTable
                                    columns={attachmentColumns}
                                    rows={attachmentRows}
                                    getRowKey={(file, index) => `${file.name || 'file'}-${index}`}
                                    ariaLabel="업무자료실 첨부파일 목록"
                                />
                            </div>
                        )}
                    </DetailSection>
                )}
            </div>
        </div>
    );
}
