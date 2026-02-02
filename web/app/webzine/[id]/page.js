'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useUserRole } from '@/hooks/useUserRole';
import styles from './detail.module.css';

export default function WebzineDetailPage() {
    const { id } = useParams();
    const [post, setPost] = useState(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const { role, user } = useUserRole();
    const supabase = createClient();
    const [zoomImage, setZoomImage] = useState(null);
    const [isZoomDetail, setIsZoomDetail] = useState(false);
    const isAdmin = role === 'admin';
    const isAuthor = post && user?.id && post.author_id === user.id;
    const canEdit = isAuthor || isAdmin;
    const canDelete = isAdmin;

    useEffect(() => {
        const fetchPost = async () => {
            const { data: postData, error: postError } = await supabase
                .from('posts')
                .select('*')
                .eq('id', id)
                .single();

            if (postError) {
                console.error('Error fetching post:', postError);
                setLoading(false);
                return;
            }

            let authorInfo = { name: '알 수 없음', email: '' };
            if (postData.author_id) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('email, full_name')
                    .eq('id', postData.author_id)
                    .single();
                if (profile) {
                    authorInfo = { email: profile.email, name: profile.full_name };
                } else {
                    const { data: role } = await supabase
                        .from('user_roles')
                        .select('email')
                        .eq('id', postData.author_id)
                        .single();
                    if (role) authorInfo = { email: role.email, name: role.email?.split('@')[0] };
                }
            }

            setPost({ ...postData, author: authorInfo });
            supabase.rpc('increment_view_count', { post_id: id }).catch(() => { });
            setLoading(false);
        };

        fetchPost();
    }, [id, supabase]);

    const handleDelete = async () => {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        try {
            const { error } = await supabase.from('posts').delete().eq('id', id);
            if (error) throw error;
            alert('삭제되었습니다.');
            router.push('/webzine');
            router.refresh();
        } catch (error) {
            alert('삭제 중 오류가 발생했습니다.');
            console.error(error);
        }
    };

    const getThumbnailSrc = (url) => {
        if (!url) return '';
        if (url.startsWith('http')) return url;
        const s3Prefixes = ['webzine/', 'board/', 'report/'];
        if (s3Prefixes.some(prefix => url.toLowerCase().startsWith(prefix)))
            return `/api/s3/files?key=${encodeURIComponent(url)}`;
        const path = url.startsWith('/') ? url : `/${url}`;
        return `/api/nas/preview?path=${encodeURIComponent(path)}`;
    };

    if (loading) return <div className="loading" style={{ padding: '100px', textAlign: 'center' }}>로딩 중...</div>;
    if (!post) return <div className="error" style={{ padding: '100px', textAlign: 'center' }}>게시글을 찾을 수 없습니다.</div>;

    return (
        <main style={{ padding: '40px 20px', maxWidth: '800px', margin: '0 auto' }}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}>{post.title}</h1>
                    <div className={styles.meta}>
                        <span>작성자: {post.author?.name || post.author?.email?.split('@')[0]}</span>
                        <span>날짜: {new Date(post.created_at).toLocaleDateString()}</span>
                        <span>조회수: {post.view_count || 0}</span>
                    </div>
                </div>

                {post.thumbnail_url && (
                    <div className={styles.heroImageWrapper}>
                        <Image
                            src={getThumbnailSrc(post.thumbnail_url)}
                            alt={post.title}
                            width={1200}
                            height={630}
                            className={styles.heroImage}
                            style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
                            unoptimized
                            priority
                        />
                    </div>
                )}

                <div className={styles.content}>
                    <div
                        dangerouslySetInnerHTML={{ __html: (post.content || '').replace(/\n/g, '<br/>') }}
                        onClick={(e) => {
                            if (e.target.tagName === 'IMG') {
                                setZoomImage(e.target.src);
                                setIsZoomDetail(false);
                            }
                        }}
                    />
                </div>

                <div className={styles.actions}>
                    <Link href="/webzine" className={styles.backBtn}>목록으로</Link>
                    {(canEdit || canDelete) && (
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {canEdit && <Link href={`/webzine/${id}/edit`} className={styles.editBtn}>수정</Link>}
                            {canDelete && <button type="button" onClick={handleDelete} className={styles.deleteBtn}>삭제</button>}
                        </div>
                    )}
                </div>
            </div>

            {/* Zoom Overlay */}
            {zoomImage && (
                <div className={styles.zoomOverlay} onClick={(e) => {
                    if (e.target.tagName !== 'IMG') {
                        setZoomImage(null);
                        setIsZoomDetail(false);
                    }
                }}>
                    <div className={styles.zoomClose} onClick={() => {
                        setZoomImage(null);
                        setIsZoomDetail(false);
                    }}>&times;</div>
                    <div className={styles.zoomImageContainer}>
                        <img
                            src={zoomImage}
                            alt="Zoomed"
                            className={`${styles.zoomImage} ${isZoomDetail ? styles.zoomedIn : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsZoomDetail(!isZoomDetail);
                            }}
                        />
                    </div>
                </div>
            )}
        </main>
    );
}
