'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import { getRoleLabel } from '@/utils/roles';
import styles from '../../board/board.module.css';

export default function ReportDetailPage() {
    const { id } = useParams();
    const { role, user, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [post, setPost] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) {
            router.push(`/login?next=/employees/reports/${id}`);
        }
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role) {
            fetchPost();
        }
    }, [role, id]);

    async function fetchPost() {
        try {
            const res = await fetch(`/api/board/${id}`);
            const data = await res.json();
            if (data.post) {
                setPost(data.post);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    const handleDelete = async () => {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        try {
            const res = await fetch(`/api/board/${id}`, { method: 'DELETE' });
            if (res.ok) {
                router.push('/employees/reports');
                router.refresh();
            } else {
                alert('삭제 권한이 없습니다.');
            }
        } catch (error) {
            console.error(error);
        }
    };

    if (authLoading || loading) {
        return <div style={{ padding: '100px', textAlign: 'center' }}>로딩 중...</div>;
    }

    if (!post) {
        return <div style={{ padding: '100px', textAlign: 'center' }}>보고서를 찾을 수 없습니다.</div>;
    }

    const isAuthor = user?.id === post.author_id;
    const canManage = isAuthor || role === 'admin';

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>업무보고 상세</h1>
            </div>

            <div className={styles.controls}>
                <button onClick={() => router.push('/employees/reports')} className={styles.btnSecondary}>
                    목록으로
                </button>
                {canManage && (
                    <>
                        <button onClick={() => router.push(`/employees/reports/${id}/edit`)} className={styles.btnSecondary}>
                            수정
                        </button>
                        <button onClick={handleDelete} className={styles.btnDelete}>
                            삭제
                        </button>
                    </>
                )}
            </div>

            <div className={styles.detailCard}>
                <div className={styles.detailHeader}>
                    <div style={{ marginBottom: '15px' }}>
                        <span style={{ background: '#eff6ff', color: '#2563eb', padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: '800' }}>
                            {getRoleLabel(post.branch_tag)}
                        </span>
                    </div>
                    <h1 className={styles.detailTitle}>{post.title}</h1>
                    <div className={styles.detailMeta}>
                        <span>작성자: {post.author?.name || post.author?.email?.split('@')[0]}</span>
                        <span>작성일: {new Date(post.created_at).toLocaleString()}</span>
                        <span>조회수: {post.view_count || 0}</span>
                    </div>
                </div>

                <div className={styles.contentBody}>
                    <div style={{ minHeight: '300px', whiteSpace: 'pre-wrap' }}>
                        {post.content}
                    </div>

                    {/* Attachments Display */}
                    {post.attachments && post.attachments.length > 0 && (
                        <div style={{ marginTop: '50px', borderTop: '1px solid #f1f5f9', paddingTop: '30px' }}>
                            <h4 style={{ marginBottom: '15px', color: '#1e293b', fontWeight: '700' }}>첨부파일</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {post.attachments.map((file, idx) => {
                                    const downloadUrl = file.type === 's3'
                                        ? `/api/s3/files?key=${encodeURIComponent(file.path)}`
                                        : `/api/nas/files?path=${encodeURIComponent(file.path)}&download=true`;

                                    return (
                                        <a
                                            key={idx}
                                            href={downloadUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                padding: '12px 16px',
                                                background: '#f8fafc',
                                                borderRadius: '8px',
                                                color: '#2563eb',
                                                textDecoration: 'none',
                                                fontSize: '0.95rem',
                                                width: 'fit-content',
                                                border: '1px solid #e2e8f0'
                                            }}
                                        >
                                            📎 {file.name}
                                        </a>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.actions}>
                    <button onClick={() => router.push('/employees/reports')} className={styles.btnSecondary}>
                        목록으로
                    </button>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {canManage && (
                            <>
                                <button onClick={() => router.push(`/employees/reports/${id}/edit`)} className={styles.btnPrimary}>
                                    수정
                                </button>
                                <button onClick={handleDelete} className={styles.btnDelete}>
                                    삭제
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
