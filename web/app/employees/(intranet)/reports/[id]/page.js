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
                router.push('/employees/reports'); // Go back to reports list
            } else {
                alert('삭제 권한이 없습니다.');
            }
        } catch (error) {
            console.error(error);
        }
    };

    if (authLoading || loading) return <div style={{ padding: '40px' }}>로딩 중...</div>;
    if (!post) return <div style={{ padding: '40px' }}>보고서를 찾을 수 없습니다.</div>;

    const isAuthor = user?.id === post.author_id;
    const isAdmin = role === 'admin' || role === 'headquarters'; // Headquarters can also manage reports? Maybe just delete.
    const canManage = isAuthor || role === 'admin'; // Only admin or author can delete for now.

    return (
        <div className={styles.container}>
            <div className={styles.detailHeader}>
                <div style={{ marginBottom: '10px' }}>
                    <span style={{ background: '#e2e8f0', padding: '4px 8px', borderRadius: '4px', fontSize: '0.9rem', fontWeight: '600' }}>
                        {getRoleLabel(post.branch_tag)}
                    </span>
                </div>
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
                            {post.attachments.map((file, idx) => (
                                <a 
                                    key={idx} 
                                    href={`/api/nas/files?path=${encodeURIComponent(file.path)}`} // This might need a proper download route or NAS preview
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    📎 {file.name}
                                </a>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className={styles.actions}>
                <button onClick={() => router.push('/employees/reports')} className={styles.btnSecondary}>
                    목록으로
                </button>
                {canManage && (
                    <>
                        <button onClick={handleDelete} className={styles.btnDelete}>
                            삭제
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
