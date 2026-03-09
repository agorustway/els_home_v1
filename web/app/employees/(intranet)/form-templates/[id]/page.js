'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
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
            return <div>{elements}</div>;
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
                    <span style={{ fontWeight: 700 }}>👤 {item.author_name}</span>
                    <span style={{ color: '#94a3b8' }}>📅 {new Date(item.created_at).toLocaleString()}</span>
                </div>

                <div className={styles.contentBody} style={{ marginBottom: 40, borderTop: '1px solid #f8fafc', paddingTop: 20 }}>
                    {renderContent(item.description) || <span style={{ color: '#94a3b8' }}>(설명 없음)</span>}
                </div>

                {dUrl && (
                    <div className={styles.attachmentSection} style={{ borderTop: '2px solid #f1f5f9', paddingTop: 30, marginTop: 40 }}>
                        <div className={styles.attachmentLabel} style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '1.05rem', color: '#1e293b' }}>
                            💾 서식 파일 다운로드
                        </div>
                        <ul className={styles.attachmentList} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                            <li className={styles.attachmentItem} style={{ background: '#f8faff', borderRadius: 12, padding: 20, border: '1px solid #e0e7ff', display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                                    <span style={{ fontSize: '1.4rem' }}>📄</span>
                                    <a
                                        href={dUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ fontWeight: 800, color: '#4f46e5', fontSize: '1rem', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                    >
                                        {item.file_name || '파일 다운로드'}
                                    </a>
                                </div>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <a href={dUrl} target="_blank" rel="noopener noreferrer" className={styles.btnPrimary} style={{ flex: 1, height: '42px', fontSize: '0.9rem', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #4f46e5, #4338ca)' }}>
                                        내려받기
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => copyToClipboard(window.location.origin + dUrl)}
                                        className={styles.btnSecondary}
                                        style={{ height: '42px', fontSize: '0.9rem', padding: '0 16px', borderRadius: 12, border: '1px solid #c7d2fe', color: '#4338ca' }}
                                    >
                                        주소 복사
                                    </button>
                                </div>
                            </li>
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
