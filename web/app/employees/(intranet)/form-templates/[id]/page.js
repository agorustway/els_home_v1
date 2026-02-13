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

        // Convert ![alt](url) to <img>
        const imgRegex = /!\[([^\]]*)\]\(([^\)]+)\)/g;
        const parts = content.split(imgRegex);

        const elements = [];
        for (let i = 0; i < parts.length; i += 3) {
            elements.push(<span key={`text-${i}`} style={{ whiteSpace: 'pre-wrap' }}>{parts[i]}</span>);
            if (parts[i + 1] !== undefined && parts[i + 2] !== undefined) {
                elements.push(
                    <div key={`img-container-${i}`} className={styles.bodyImageContainer} style={{ margin: '20px 0' }}>
                        <img
                            src={parts[i + 2]}
                            alt={parts[i + 1]}
                            className={styles.bodyImage}
                            style={{ maxWidth: '100%', borderRadius: 12, border: '1px solid #f1f5f9', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                        />
                    </div>
                );
            }
        }
        return elements;
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

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!role) return null;
    if (!item) return <div className={styles.loading}>서식을 찾을 수 없습니다.</div>;

    const downloadUrl = item.file_url || item.file_path;

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>서식자료실</h1>
            </div>
            <div className={styles.controls}>
                <Link href={'/employees/form-templates/' + id + '/edit'} className={styles.btnSecondary}>수정</Link>
                <button type="button" onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                <Link href="/employees/form-templates" className={styles.btnSecondary}>목록</Link>
            </div>
            <div className={styles.card}>
                <h2 className={styles.detailTitle}>{item.title}</h2>
                <div className={styles.detailMeta}>
                    <span className={styles.badge} style={{ background: '#f1f5f9', padding: '4px 10px', borderRadius: 6, fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>{item.category}</span>
                    <span>{item.author_name}</span>
                    <span style={{ color: '#94a3b8' }}>{new Date(item.created_at).toLocaleString()}</span>
                </div>

                <div className={styles.contentBody} style={{ marginBottom: 40 }}>
                    {renderContent(item.description) || <span style={{ color: '#94a3b8' }}>(설명 없음)</span>}
                </div>

                {downloadUrl && (
                    <div className={styles.attachmentSection} style={{ borderTop: '1px solid #f1f5f9', paddingTop: 24 }}>
                        <div className={styles.attachmentLabel} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#1e293b' }}>
                            💾 서식 파일 다운로드
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <a
                                href={downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.attachmentToggle}
                                style={{ textDecoration: 'none', background: '#f8faff', borderColor: '#e0e7ff', display: 'flex', justifyContent: 'space-between', flex: 1 }}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#4f46e5', fontWeight: 600 }}>
                                    📄 {item.file_name || '파일 다운로드'}
                                </span>
                                <span style={{ fontSize: '0.85rem', color: '#6366f1', background: '#eef2ff', padding: '4px 12px', borderRadius: 8 }}>다운로드</span>
                            </a>
                            <button
                                type="button"
                                onClick={() => copyToClipboard(downloadUrl)}
                                className={styles.btnSecondary}
                                style={{ padding: '0 16px', borderRadius: 12, height: '48px', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                            >
                                🔗 주소 복사
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
