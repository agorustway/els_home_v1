'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../board.module.css';

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
                router.push('/employees/board/free');
            } else {
                alert('삭제 권한이 없습니다.');
            }
        } catch (error) {
            console.error(error);
        }
    };

    if (authLoading || loading) return <div style={{ padding: '40px' }}>로딩 중...</div>;
    if (!post) return <div style={{ padding: '40px' }}>게시글을 찾을 수 없습니다.</div>;

    const isAuthor = user?.id === post.author_id;
    const isAdmin = role === 'admin';
    const canManage = isAuthor || isAdmin;

    return (
        <div className={styles.container}>
            <div className={styles.detailHeader}>
                <h1 className={styles.detailTitle}>{post.title}</h1>
                <div className={styles.detailMeta}>
                    <span>작성자: {post.author?.name || post.author?.email?.split('@')[0]}</span>
                    <span>작성일: {new Date(post.created_at).toLocaleString()}</span>
                    <span>조회수: {post.view_count}</span>
                </div>
            </div>

            <div className={styles.contentBody}>
                {post.content}

                {/* Attachments Display */}
                {post.attachments && post.attachments.length > 0 && (
                    <div style={{ marginTop: '40px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
                        <h4 style={{ marginBottom: '10px' }}>첨부파일</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                                        style={{ color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
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
                <button onClick={() => router.push('/employees/board/free')} className={styles.btnSecondary}>
                    목록으로
                </button>
                {canManage && (
                    <>
                        <button onClick={() => router.push(`/employees/board/free/${id}/edit`)} className={styles.btnSecondary}>
                            수정
                        </button>
                        <button onClick={handleDelete} className={styles.btnDelete}>
                            삭제
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
