'use client';


import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../board.module.css';
import { motion } from 'framer-motion';

export default function PostDetailPage() {
    const { id } = useParams();
    const { role, user, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [post, setPost] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) {
            router.push(`/login?next=/employees/board/free/${id}`);
        }
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role) fetchPost();
    }, [role, id]);

    async function fetchPost() {
        try {
            const res = await fetch(`/api/board/${id}`);
            if (!res.ok) throw new Error('게시글을 불러올 수 없습니다.');
            const data = await res.json();
            if (data.post) setPost(data.post);
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
                router.push('/employees/board/free');
                router.refresh();
            } else {
                alert('삭제 권한이 없습니다.');
            }
        } catch (error) {
            console.error(error);
        }
    };

    if (authLoading || loading) return <div className={styles.container} style={{ padding: '100px', textAlign: 'center' }}>로딩 중...</div>;
    if (!post) return <div className={styles.container} style={{ padding: '100px', textAlign: 'center' }}>게시글을 찾을 수 없습니다.</div>;

    const isAuthor = user?.id === post.author_id;
    const isAdmin = role === 'admin';
    const canManage = isAuthor || isAdmin;

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>자유게시판</h1>
            </div>

            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className={styles.detailCard}
            >
                <div className={styles.detailHeader}>
                    <h1 className={styles.detailTitle}>{post.title}</h1>
                    <div className={styles.detailMeta}>
                        <span>{post.author?.name || '익명'}{post.author?.rank ? ` ${post.author.rank}` : ''}</span>
                        <span className={styles.metaDivider}>|</span>
                        <span>{new Date(post.created_at).toLocaleString('ko-KR')}</span>
                        <span className={styles.metaDivider}>|</span>
                        <span>조회 {post.view_count || 0}</span>
                    </div>
                </div>

                <div className={styles.contentBody}>
                    <div style={{ whiteSpace: 'pre-wrap' }}>
                        {post.content}
                    </div>

                    {post.attachments && post.attachments.length > 0 && (
                        <div style={{ marginTop: '50px', borderTop: '1px solid #f1f5f9', paddingTop: '30px' }}>
                            <h4 style={{ marginBottom: '15px', color: '#1e293b', fontWeight: '800', fontSize: '1rem' }}>📎 첨부파일 ({post.attachments.length})</h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                {post.attachments.map((file, idx) => {
                                    const getSafeUrl = (file) => {
                                        let url = file.path || '';
                                        const nameParam = `&name=${encodeURIComponent(file.name || '첨부파일')}`;

                                        if (url.startsWith('http')) {
                                            try {
                                                const parsed = new URL(url);
                                                url = parsed.pathname + parsed.search;
                                            } catch (e) { }
                                        }

                                        if (file.type === 's3') {
                                            const key = url.includes('key=') ? url.split('key=')[1].split('&')[0] : url;
                                            return `/api/s3/files?key=${encodeURIComponent(key)}${nameParam}`;
                                        }
                                        const path = url.includes('path=') ? url.split('path=')[1].split('&')[0] : url;
                                        return `/api/nas/files?path=${encodeURIComponent(path)}&download=true${nameParam}`;
                                    };

                                    const downloadUrl = getSafeUrl(file);

                                    return (
                                        <a key={idx} href={downloadUrl}
                                            style={{
                                                padding: '10px 16px', background: '#f8fafc', borderRadius: '8px',
                                                color: '#2563eb', textDecoration: 'none', fontSize: '0.9rem',
                                                border: '1px solid #e2e8f0', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px'
                                            }}
                                        >
                                            {file.name}
                                        </a>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.actions}>
                    <button onClick={() => router.push('/employees/board/free')} className={styles.btnSecondary}>
                        ← 목록으로
                    </button>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {canManage && (
                            <>
                                <button onClick={() => router.push(`/employees/board/free/${id}/edit`)} className={styles.btnPrimary}>
                                    글 수정
                                </button>
                                <button onClick={handleDelete} className={styles.btnDelete}>
                                    삭제하기
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
