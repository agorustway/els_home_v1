'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import Header from '@/components/Header';
import EmployeeSidebar from '@/components/EmployeeSidebar';
import SubPageHero from '@/components/SubPageHero';
import styles from './detail.module.css';

export default function WebzineDetail({ params }) {
    const [post, setPost] = useState(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const supabase = createClient();
    const { id } = params;

    useEffect(() => {
        const fetchPost = async () => {
            const { data, error } = await supabase
                .from('posts')
                .select(`
                    *,
                    author:user_roles!author_id (
                        email,
                        name
                    )
                `)
                .eq('id', id)
                .single();

            if (error) {
                console.error('Error fetching post:', error);
            } else {
                setPost(data);
                supabase.rpc('increment_view_count', { post_id: id });
            }
            setLoading(false);
        };

        fetchPost();
    }, [id]);

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

        // S3 Cloud Path
        if (url.startsWith('Webzine/')) {
            return `/api/s3/files?key=${encodeURIComponent(url)}`;
        }

        const path = url.startsWith('/') ? url : `/${url}`;
        return `/api/nas/preview?path=${encodeURIComponent(path)}`;
    };

    if (loading) return (
        <>
            <Header />
            <SubPageHero
                title="Webzine"
                subtitle="ELS의 새로운 소식과 이야기를 전해드립니다."
                bgImage="/images/office_intro.png"
            />
            <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fbff' }}>
                <EmployeeSidebar />
                <main style={{ flex: 1, padding: '40px', width: '100%' }}>
                    <div className="loading">로딩 중...</div>
                </main>
            </div>
        </>
    );

    if (!post) return (
        <>
            <Header />
            <SubPageHero
                title="Webzine"
                subtitle="ELS의 새로운 소식과 이야기를 전해드립니다."
                bgImage="/images/office_intro.png"
            />
            <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fbff' }}>
                <EmployeeSidebar />
                <main style={{ flex: 1, padding: '40px', width: '100%' }}>
                    <div className="error">게시글을 찾을 수 없습니다.</div>
                </main>
            </div>
        </>
    );

    return (
        <>
            <Header />
            <SubPageHero
                title="Webzine"
                subtitle="ELS의 새로운 소식과 이야기를 전해드립니다."
                bgImage="/images/office_intro.png"
            />
            <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fbff' }}>
                <EmployeeSidebar />
                <main style={{ flex: 1, padding: '40px', width: '100%', minWidth: 0 }}>
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
                </main>
            </div>
        </>
    );
}
