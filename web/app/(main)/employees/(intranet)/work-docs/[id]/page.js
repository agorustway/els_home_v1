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
        if (!content) return <span style={{ color: '#94a3b8' }}>(내용 없음)</span>;

        if (content.match(/!\[([^\]]*)\]\(([^\)]+)\)/)) {
            const imgRegex = /!\[([^\]]*)\]\(([^\)]+)\)/g;
            const parts = content.split(imgRegex);
            const elements = [];
            for (let i = 0; i < parts.length; i += 3) {
                elements.push(<span key={`text-${i}`} style={{ whiteSpace: 'pre-wrap' }}>{parts[i]}</span>);
                if (parts[i + 1] !== undefined && parts[i + 2] !== undefined) {
                    elements.push(
                        <div key={`img-container-${i}`} className={styles.bodyImageContainer} style={{ margin: '20px 0' }}>
                            <img src={parts[i + 2]} alt={parts[i + 1]} className={styles.bodyImage} style={{ maxWidth: '100%', borderRadius: 8 }} />
                        </div>
                    );
                }
            }
            return <div>{elements}</div>;
        }

        return <div dangerouslySetInnerHTML={{ __html: content }} className={styles.contentBody} />;
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

    const getDownloadUrl = (file) => {
        let url = file.url || '';

        // Fix: Strip external domain from old absolute URLs (e.g. https://www.nollae.com/api/s3/...)
        // Convert to relative path so it works on current domain
        if (url && url.startsWith('http')) {
            try {
                const parsed = new URL(url);
                url = parsed.pathname + parsed.search;
            } catch (e) {
                // If URL parsing fails, use as-is
            }
        }

        // Ensure file name parameter exists in the URL
        if (url && (url.includes('/api/s3/files') || url.includes('/api/nas/files'))) {
            if (!url.includes('name=')) {
                const connector = url.includes('?') ? '&' : '?';
                url = `${url}${connector}name=${encodeURIComponent(file.name || '첨부파일')}`;
            }
            return url;
        }

        if (url) return url;

        const nameParam = `&name=${encodeURIComponent(file.name || 'file')}`;
        if (file.type === 's3' || (file.key && file.key.includes('/'))) {
            return `/api/s3/files?key=${encodeURIComponent(file.key)}${nameParam}`;
        }
        return `/api/nas/files?path=${encodeURIComponent(file.path || file.key)}&download=true${nameParam}`;
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!role) return null;
    if (!item) return <div className={styles.loading}>글을 찾을 수 없습니다.</div>;

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
                <h2 className={styles.detailTitle}>{item.title}</h2>
                <div className={styles.detailMeta}>
                    <span className={styles.badge} style={{ background: '#eef2ff', color: '#4f46e5', border: 'none' }}>{item.category}</span>
                    <span style={{ fontWeight: 700 }}>👤 {item.author_name}</span>
                    <span style={{ color: '#94a3b8' }}>📅 {new Date(item.created_at).toLocaleString()}</span>
                </div>

                <div className={styles.contentBody} style={{ padding: '20px 0', borderTop: '1px solid #f8fafc' }}>
                    {renderContent(item.content)}
                </div>

                {item.attachments && item.attachments.length > 0 && (
                    <div className={styles.attachmentSection} style={{ borderTop: '2px solid #f1f5f9', marginTop: 40, paddingTop: 30 }}>
                        <div className={styles.attachmentToggle} onClick={() => setShowAttachments(!showAttachments)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                            <div className={styles.attachmentLabel} style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>
                                📎 첨부파일 <span className={styles.attachmentCount} style={{ background: '#2563eb', color: '#fff' }}>{item.attachments.length}</span>
                            </div>
                            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>{showAttachments ? '▲ 접기' : '▼ 펼치기'}</span>
                        </div>
                        {showAttachments && (
                            <ul className={styles.attachmentList} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                                {item.attachments.map((file, idx) => {
                                    const dUrl = getDownloadUrl(file);
                                    return (
                                        <li key={idx} className={styles.attachmentItem} style={{ background: '#f8fafc', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                                                    <span style={{ fontSize: '1.2rem' }}>📄</span>
                                                    <a
                                                        href={dUrl}
                                                        className={styles.attachmentLink}
                                                        style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}
                                                    >
                                                        {file.name}
                                                    </a>
                                                </div>
                                                <span style={{ fontSize: '0.8rem', color: '#94a3b8', flexShrink: 0 }}>{(file.size / 1024).toFixed(1)} KB</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <a href={dUrl} className={styles.btnPrimary} style={{ flex: 1, height: '36px', fontSize: '0.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    내려받기
                                                </a>
                                                <button
                                                    type="button"
                                                    onClick={() => copyToClipboard(window.location.origin + dUrl)}
                                                    className={styles.btnSecondary}
                                                    style={{ height: '36px', fontSize: '0.85rem', padding: '0 12px' }}
                                                >
                                                    주소 복사
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
