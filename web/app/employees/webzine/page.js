'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
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

    const getThumbnailSrc = (url) => {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        return `/api/nas/preview?path=${encodeURIComponent(url)}`;
    };

    const getExcerpt = (htmlContent) => {
        if (!htmlContent) return '';
        const tmp = document.createElement('DIV');
        tmp.innerHTML = htmlContent;
        return tmp.textContent || tmp.innerText || '';
    };

    // Split posts into Featured (latest 1) and Recent (rest)
    const featuredPost = posts.length > 0 ? posts[0] : null;
    const recentPosts = posts.length > 1 ? posts.slice(1) : [];

        const scrollToRecent = () => {

            const element = document.getElementById('recent-posts');

            if (element) {

                element.scrollIntoView({ behavior: 'smooth' });

            }

        };

    

        if (loading) return (

            <>

                <Header />

                <SubPageHero 

                    title="Webzine" 

                    subtitle="ELS의 새로운 소식과 이야기를 전해드립니다." 

                    bgImage="/images/office_intro.png" // 적절한 이미지 사용

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

    

                                            {featuredPost.thumbnail_url && (

                                                <div className={styles.featuredImageWrapper}>

                                                    <img 

                                                        src={getThumbnailSrc(featuredPost.thumbnail_url)} 

                                                        alt={featuredPost.title} 

                                                        className={styles.featuredImage}

                                                        onError={(e) => e.target.style.display = 'none'}

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
                                                    <div className={styles.thumbnailWrapper}>
                                                        {post.thumbnail_url ? (
                                                            <img 
                                                                src={getThumbnailSrc(post.thumbnail_url)} 
                                                                alt={post.title} 
                                                                className={styles.thumbnail}
                                                                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
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
                                                                                                            </div>                                                    </div>
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