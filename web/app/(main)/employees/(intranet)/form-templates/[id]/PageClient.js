'use client';


import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import IntranetDataTable from '@/components/IntranetDataTable';
import styles from '../../intranet.module.css';

export default function FormTemplateDetailPage() {
    const { id } = useParams();
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/form-templates/' + id);
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role && id) {
            fetch('/api/form-templates/' + id)
                .then((res) => res.json())
                .then((data) => setItem(data.item))
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [role, id]);

    const renderContent = (content) => {
        if (!content) return null;

        if (content.match(/!\[([^\]]*)\]\(([^\)]+)\)/)) {
            const imgRegex = /!\[([^\]]*)\]\(([^\)]+)\)/g;
            const parts = content.split(imgRegex);
            const elements = [];
            for (let i = 0; i < parts.length; i += 3) {
                elements.push(<span key={`text-${i}`} style={{ whiteSpace: 'pre-wrap' }}>{parts[i]}</span>);
                if (parts[i + 1] !== undefined && parts[i + 2] !== undefined) {
                    elements.push(
                        <div key={`img-container-${i}`} className={styles.bodyImageContainer} style={{ margin: '20px 0' }}>
                            <img src={parts[i + 2]} alt={parts[i + 1]} className={styles.bodyImage} style={{ maxWidth: '100%', borderRadius: 12 }} />
                        </div>
                    );
                }
            }
            return <div className={styles.contentBody}>{elements}</div>;
        }

        return <div dangerouslySetInnerHTML={{ __html: content }} className={styles.contentBody} />;
    };

    const handleDelete = async () => {
        if (!confirm('삭제하시겠습니까?')) return;
        const res = await fetch('/api/form-templates/' + id, { method: 'DELETE' });
        if (res.ok) router.push('/employees/form-templates');
        else alert('삭제 실패');
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            alert('다운로드 주소가 복사되었습니다. 외부로 전달할 수 있습니다.');
        }).catch(err => {
            console.error('복사 실패:', err);
        });
    };

    const getDownloadUrl = (fileUrl, filePath, fileName) => {
        let url = fileUrl || filePath || '';

        // Fix: Strip external domain from old absolute URLs (e.g. https://www.elssolution.com/api/s3/...)
        // Convert to relative path so it works on current domain
        if (url && url.startsWith('http')) {
            try {
                const parsed = new URL(url);
                url = parsed.pathname + parsed.search;
            } catch (e) {
                // If URL parsing fails, use as-is
            }
        }

        if (!url) return null;

        // Ensure file name parameter exists in the URL
        if (url.includes('/api/s3/files') || url.includes('/api/nas/files')) {
            if (!url.includes('name=')) {
                const connector = url.includes('?') ? '&' : '?';
                return `${url}${connector}name=${encodeURIComponent(fileName || '서식파일')}`;
            }
            return url;
        }

        const nameParam = `&name=${encodeURIComponent(fileName || '서식파일')}`;
        return `/api/nas/files?path=${encodeURIComponent(url)}&download=true${nameParam}`;
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!role) return null;
    if (!item) return <div className={styles.loading}>서식을 찾을 수 없습니다.</div>;

    const dUrl = getDownloadUrl(item.file_url, item.file_path, item.file_name);
    const fileRows = dUrl
        ? [{
            no: 1,
            name: item.file_name || '파일 다운로드',
            size: item.file_size || item.size || null,
            downloadUrl: dUrl,
        }]
        : [];
    const fileColumns = [
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
            render: (file) => file.name,
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
                <h1 className={styles.title}>서식자료실</h1>
                <div className={styles.controls}>
                    <Link href={'/employees/form-templates/' + id + '/edit'} className={styles.btnSecondary}>수정</Link>
                    <button type="button" onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                    <Link href="/employees/form-templates" className={styles.btnSecondary}>목록</Link>
                </div>
            </div>

            <div className={styles.card}>
                <h2 className={styles.detailTitle}>{item.title}</h2>
                <div className={styles.detailMeta}>
                    <span className={styles.badge} style={{ background: '#f1f5f9', padding: '4px 10px', borderRadius: 6, fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>{item.category}</span>
                    <span style={{ fontWeight: 700 }}>작성자 {item.author_name}</span>
                    <span style={{ color: '#94a3b8' }}>{new Date(item.created_at).toLocaleString()}</span>
                </div>

                <div className={styles.contentBody} style={{ marginBottom: 40, borderTop: '1px solid #f8fafc', paddingTop: 20 }}>
                    {renderContent(item.description) || <span style={{ color: '#94a3b8' }}>(설명 없음)</span>}
                </div>

                {fileRows.length > 0 && (
                    <div className={styles.attachmentSection}>
                        <button type="button" className={styles.attachmentToggle}>
                            <span className={styles.attachmentLabel}>첨부파일</span>
                            <span className={styles.attachmentCount}>{fileRows.length}</span>
                        </button>
                        <div style={{ marginTop: 8 }}>
                            <IntranetDataTable
                                columns={fileColumns}
                                rows={fileRows}
                                getRowKey={(file) => file.downloadUrl}
                                ariaLabel="서식자료실 첨부파일 목록"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
