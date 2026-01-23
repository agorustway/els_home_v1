'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import Image from 'next/image';
import Header from '@/components/Header';
import EmployeeSidebar from '@/components/EmployeeSidebar';
import SubPageHero from '@/components/SubPageHero';
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

        // If it's stored in S3 (our new system)
        // Note: We check if it's likely an S3 key (doesn't start with /ELS) or via attachments type if available
        // For simplicity, let's try the S3 API for anything that doesn't look like an old NAS path
        if (url.startsWith('Webzine/')) {
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

    // Split posts into Featured (latest 1) and Recent (rest)
    const featuredPost = posts.length > 0 ? posts[0] : null;
    const recentPosts = posts.length > 1 ? posts.slice(1) : [];

    if (loading) return (
        <>
            <Header />
            <SubPageHero
                title="Webzine"
                subtitle="ELS의 새로운 소식과 이야기를 전해드립니다."
                bgImage="/images/office_intro.png"
            />
            <div className={styles.layout}>
                <EmployeeSidebar />
                <main className={styles.main}>
                    <div className="loading">로딩 중...</div>
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
            <div className={styles.layout}>
                <EmployeeSidebar />
                <main className={styles.main}>
                    <div className={styles.contentContainer}>
                        <div className={styles.actionHeader}>
                            {/* Navigation to recent posts */}
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
                                {/* Featured Post Section */}
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
                                            <div className={styles.featuredImageWrapper} style={{ width: '100%', height: 'auto' }}>
                                                <Image
                                                    src={getThumbnailSrc(featuredPost)}
                                                    alt={featuredPost.title}
                                                    width={1200}
                                                    height={800}
                                                    className={styles.featuredImage}
                                                    style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
                                                    priority
                                                    unoptimized
                                                    onError={(e) => {
                                                        e.currentTarget.style.display = 'none';
                                                    }}
                                                />
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

                                {/* Recent Posts Grid */}
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
                                                                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                                                unoptimized
                                                                onError={(e) => {
                                                                    e.currentTarget.style.display = 'none';
                                                                    e.currentTarget.parentElement.nextSibling.style.display = 'flex';
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
            </div>
        </>
    );
}