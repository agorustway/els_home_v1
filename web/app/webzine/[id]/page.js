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
    const [scale, setScale] = useState(0); // 0: Fit to Screen, 1+: Width Scale (1 = 100vw)
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
                    onClick={(e) => {
                        if (e.target.tagName === 'IMG') {
                            setZoomImage(e.target.src);
                            setScale(0);
                        }
                    }}
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
            {/* Zoom Overlay */}
            {zoomImage && (
                <div className={styles.zoomOverlay} onClick={() => setZoomImage(null)}>
                    <div className={styles.zoomClose}>&times;</div>

                    <div className={styles.zoomImageContainer}>
                        <img
                            src={zoomImage}
                            alt="Zoomed"
                            className={styles.zoomImage}
                            style={scale === 0 ? {
                                maxWidth: '90vw',
                                maxHeight: '90vh',
                                width: 'auto',
                                height: 'auto',
                                cursor: 'zoom-in'
                            } : {
                                maxWidth: 'none',
                                maxHeight: 'none',
                                width: `${scale * 100}vw`,  /* 1 = 100vw, 1.5 = 150vw */
                                height: 'auto',
                                cursor: 'zoom-out'
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                // Toggle between Fit(0) and 100%(1)
                                setScale(prev => prev === 0 ? 1 : 0);
                            }}
                        />
                    </div>

                    {/* Zoom Controls */}
                    <div className={styles.zoomControls} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.zoomBtn} onClick={() => setScale(prev => {
                            if (prev === 0) return 0; // Fit 상태면 변화 없음 (클릭해서 모드 변경하라는 의미, 혹은 100%로 갈까?)
                            return prev <= 1 ? 0 : Number((prev - 0.5).toFixed(1)); // 0.5씩 감소, 1 이하면 Fit으로
                        })} aria-label="Zoom Out">
                            <span style={{ marginTop: '-2px' }}>&minus;</span>
                        </button>

                        <div className={styles.zoomLevelText}>
                            {scale === 0 ? 'FIT' : `${scale * 100}%`}
                        </div>

                        <button className={styles.zoomBtn} onClick={() => setScale(prev => {
                            // Fit(0) -> 1.0 (100%) -> 1.5 -> ...
                            if (prev === 0) return 1;
                            return Math.min(prev + 0.5, 3.0); // 최대 300%
                        })} aria-label="Zoom In">
                            <span style={{ marginTop: '2px' }}>+</span>
                        </button>
                    </div>
                </div>
            )}
        </main>
    );
}
