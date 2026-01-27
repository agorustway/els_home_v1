'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import styles from './detail.module.css';

export default function WebzineDetail() {
    const { id } = useParams();
    const [post, setPost] = useState(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        const fetchPost = async () => {
            // 1. 게시글 데이터 조회 (조인 제거)
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

            // 2. 작성자 정보 별도 조회
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
            supabase.rpc('increment_view_count', { post_id: id });
            setLoading(false);
        };

        fetchPost();
    }, [id, supabase]);

    const handleDelete = async () => {
        if (!confirm('정말 삭제하시겠습니까?')) return;

        try {
            const { error } = await supabase
                .from('posts')
                .delete()
                .eq('id', id);

            if (error) throw error;

            alert('삭제되었습니다.');
            router.push('/employees/webzine');
            router.refresh();
        } catch (error) {
            alert('삭제 중 오류가 발생했습니다.');
            console.error(error);
        }
    };

    const getThumbnailSrc = (url) => {
        if (!url) return '';
        if (url.startsWith('http')) return url;

        // Check for S3 prefixes
        const s3Prefixes = ['webzine/', 'board/', 'report/'];
        if (s3Prefixes.some(prefix => url.toLowerCase().startsWith(prefix))) {
            return `/api/s3/files?key=${encodeURIComponent(url)}`;
        }

        const path = url.startsWith('/') ? url : `/${url}`;
        return `/api/nas/preview?path=${encodeURIComponent(path)}`;
    };

    if (loading) return <div className="loading" style={{ padding: '100px', textAlign: 'center' }}>로딩 중...</div>;

    if (!post) return <div className="error" style={{ padding: '100px', textAlign: 'center' }}>게시글을 찾을 수 없습니다.</div>;

    return (
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
                <div dangerouslySetInnerHTML={{ __html: post.content.replace(/\n/g, '<br/>') }} />
            </div>

            <div className={styles.actions}>
                <Link href="/employees/webzine" className={styles.backBtn}>목록으로</Link>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <Link href={`/employees/webzine/${id}/edit`} className={styles.editBtn}>수정</Link>
                    <button onClick={handleDelete} className={styles.deleteBtn}>삭제</button>
                </div>
            </div>
        </div>
    );
}
