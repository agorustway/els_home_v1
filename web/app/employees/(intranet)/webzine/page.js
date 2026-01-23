'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import Image from 'next/image';
import styles from './webzine.module.css';

export default function WebzineList() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    const fetchPosts = async () => {
        try {
            const { data, error } = await supabase
                .from('posts')
                .select(`
                    *,
                    author:user_roles!author_id (
                        email,
                        name
                    )
                `)
                .eq('board_type', 'webzine')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setPosts(data || []);
        } catch (error) {
            console.error('Error fetching webzine posts:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPosts();
    }, []);

    const getThumbnailSrc = (post) => {
        const url = post.thumbnail_url;
        if (!url) return '';
        if (url.startsWith('http')) return url;

        // Check if it's stored in S3 (Webzine, Board, Report prefixes)
        const s3Prefixes = ['webzine/', 'board/', 'report/'];
        if (s3Prefixes.some(prefix => url.toLowerCase().startsWith(prefix))) {
            return `/api/s3/files?key=${encodeURIComponent(url)}`;
        }

        const path = url.startsWith('/') ? url : `/${url}`;
        return `/api/nas/preview?path=${encodeURIComponent(path)}`;
    };

    const getExcerpt = (htmlContent) => {
        if (!htmlContent) return '';
        const tmp = document.createElement('DIV');
        tmp.innerHTML = htmlContent;
        return tmp.textContent || tmp.innerText || '';
    };

    const scrollToRecent = () => {
        const element = document.getElementById('recent-posts');
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const featuredPost = posts.length > 0 ? posts[0] : null;
    const recentPosts = posts.length > 1 ? posts.slice(1) : [];

    if (loading) return <div className="loading" style={{ padding: '100px', textAlign: 'center' }}>로딩 중...</div>;

    return (
        <main className={styles.main}>
            <div className={styles.contentContainer}>
                <div className={styles.actionHeader}>
                    {recentPosts.length > 0 && (
                        <button onClick={scrollToRecent} className={styles.navBtn}>
                            ↓ 지난 이야기 보기
                        </button>
                    )}
                    <Link href="/employees/webzine/new" className={styles.writeBtn}>
                        글쓰기
                    </Link>
                </div>

                {posts.length > 0 ? (
                    <>
                        {featuredPost && (
                            <div className={styles.featuredWrapper}>
                                <div className={styles.featuredHeader}>
                                    <h2 className={styles.featuredTitle}>{featuredPost.title}</h2>
                                    <div className={styles.featuredMeta}>
                                        <span>작성자: {featuredPost.author?.name || featuredPost.author?.email?.split('@')[0]}</span>
                                        <span>날짜: {new Date(featuredPost.created_at).toLocaleDateString()}</span>
                                        <span>조회수: {featuredPost.view_count || 0}</span>
                                    </div>
                                </div>

                                {featuredPost.thumbnail_url && getThumbnailSrc(featuredPost) && (
                                    <div className={styles.featuredImageWrapper}>
                                        <Image
                                            src={getThumbnailSrc(featuredPost)}
                                            alt={featuredPost.title}
                                            width={1200}
                                            height={675}
                                            className={styles.featuredImage}
                                            priority
                                            unoptimized
                                            onError={(e) => {
                                                const target = e.currentTarget;
                                                target.style.display = 'none';
                                                const fallback = target.nextSibling;
                                                if (fallback) fallback.style.display = 'flex';
                                            }}
                                        />
                                        <div className={styles.noThumbnail} style={{ height: '400px', fontSize: '5rem', borderRadius: '12px', display: 'none' }}>
                                            📰
                                        </div>
                                    </div>
                                )}

                                <div className={styles.featuredContent}>
                                    <div dangerouslySetInnerHTML={{ __html: featuredPost.content.replace(/\n/g, '<br/>') }} />
                                    <div style={{ marginTop: '30px', textAlign: 'right' }}>
                                        <Link href={`/employees/webzine/${featuredPost.id}`} style={{ color: '#0056b3', fontWeight: 'bold' }}>
                                            상세보기 / 수정 &rarr;
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        )}

                        {recentPosts.length > 0 && (
                            <>
                                <h3 id="recent-posts" className={styles.sectionTitle}>지난 이야기</h3>
                                <div className={styles.grid}>
                                    {recentPosts.map(post => (
                                        <Link href={`/employees/webzine/${post.id}`} key={post.id} className={styles.card}>
                                            <div className={styles.thumbnailWrapper} style={{ position: 'relative' }}>
                                                {getThumbnailSrc(post) ? (
                                                    <Image
                                                        src={getThumbnailSrc(post)}
                                                        alt={post.title}
                                                        fill
                                                        className={styles.thumbnail}
                                                        style={{ objectFit: 'cover' }}
                                                        sizes="(max-width: 768px) 100vw, 33vw"
                                                        unoptimized
                                                        onError={(e) => {
                                                            const target = e.currentTarget;
                                                            target.style.display = 'none';
                                                            const fallback = target.nextSibling;
                                                            if (fallback) {
                                                                fallback.style.display = 'flex';
                                                            }
                                                        }}
                                                    />
                                                ) : null}
                                                <div className={styles.noThumbnail} style={{ display: post.thumbnail_url ? 'none' : 'flex' }}>
                                                    📰
                                                </div>
                                            </div>
                                            <div className={styles.cardContent}>
                                                <h2 className={styles.cardTitle}>{post.title}</h2>
                                                <p className={styles.excerpt}>
                                                    {getExcerpt(post.content)}
                                                </p>
                                                <div className={styles.meta}>
                                                    <span className={styles.author}>{post.author?.name || post.author?.email?.split('@')[0]}</span>
                                                    <span className={styles.date}>{new Date(post.created_at).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className={styles.emptyState}>
                        등록된 웹진 게시물이 없습니다.
                    </div>
                )}
            </div>
        </main>
    );
}