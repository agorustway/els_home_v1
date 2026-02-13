'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../intranet.module.css';

export default function WorkDocDetailPage() {
    const { id } = useParams();
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showAttachments, setShowAttachments] = useState(false);

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
        if (!content) return <span style={{ color: '#94a3b8' }}>(내용 없음)</span>;

        // Convert ![alt](url) to <img>
        const imgRegex = /!\[([^\]]*)\]\(([^\)]+)\)/g;
        const parts = content.split(imgRegex);

        const elements = [];
        for (let i = 0; i < parts.length; i += 3) {
            elements.push(<span key={`text-${i}`} style={{ whiteSpace: 'pre-wrap' }}>{parts[i]}</span>);
            if (parts[i + 1] !== undefined && parts[i + 2] !== undefined) {
                elements.push(
                    <div key={`img-container-${i}`} className={styles.bodyImageContainer}>
                        <img
                            src={parts[i + 2]}
                            alt={parts[i + 1]}
                            className={styles.bodyImage}
                        />
                    </div>
                );
            }
        }
        return elements;
    };

    const handleDelete = async () => {
        if (!confirm('삭제하시겠습니까?')) return;
        const res = await fetch(`/api/work-docs/${id}`, { method: 'DELETE' });
        if (res.ok) {
            router.push('/employees/work-docs');
        } else {
            alert('삭제 실패');
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            alert('다운로드 주소가 복사되었습니다. 외부로 전달할 수 있습니다.');
        }).catch(err => {
            console.error('복사 실패:', err);
        });
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!role) return null;
    if (!item) return <div className={styles.loading}>글을 찾을 수 없습니다.</div>;

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>업무자료실</h1>
            </div>
            <div className={styles.controls}>
                <Link href={`/employees/work-docs/${id}/edit`} className={styles.btnSecondary}>수정</Link>
                <button type="button" onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                <Link href="/employees/work-docs" className={styles.btnSecondary}>목록</Link>
            </div>
            <div className={styles.card}>
                <h2 className={styles.detailTitle}>{item.title}</h2>
                <div className={styles.detailMeta}>
                    <span className={styles.badge}>{item.category}</span>
                    <span>{item.author_name}</span>
                    <span>{new Date(item.created_at).toLocaleString()}</span>
                </div>

                <div className={styles.contentBody}>
                    {renderContent(item.content)}
                </div>

                {item.attachments && item.attachments.length > 0 && (
                    <div className={styles.attachmentSection}>
                        <div className={styles.attachmentToggle} onClick={() => setShowAttachments(!showAttachments)}>
                            <div className={styles.attachmentLabel}>
                                📎 첨부파일 <span className={styles.attachmentCount}>{item.attachments.length}</span>
                            </div>
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{showAttachments ? '▲ 접기' : '▼ 펼치기'}</span>
                        </div>
                        {showAttachments && (
                            <ul className={styles.attachmentList}>
                                {item.attachments.map((file, idx) => (
                                    <li key={idx} className={styles.attachmentItem} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 8, marginBottom: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <a
                                                    href={file.url || `/api/s3/files?key=${encodeURIComponent(file.key)}&name=${encodeURIComponent(file.name)}`}
                                                    className={styles.attachmentLink}
                                                    download={file.name}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    📄 {file.name}
                                                </a>
                                                <span className={styles.fileInfo}>({(file.size / 1024).toFixed(1)} KB)</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => copyToClipboard(file.url || `${window.location.origin}/api/s3/files?key=${encodeURIComponent(file.key)}&name=${encodeURIComponent(file.name)}`)}
                                                className={styles.btnSecondary}
                                                style={{ padding: '4px 8px', fontSize: '0.75rem', height: '28px' }}
                                            >
                                                주소 복사
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
