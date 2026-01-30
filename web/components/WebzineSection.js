'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/utils/supabase/client';
import styles from './WebzineSection.module.css';

function getThumbnailSrc(post) {
    const url = post?.thumbnail_url;
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const s3Prefixes = ['webzine/', 'board/', 'report/'];
    if (s3Prefixes.some(prefix => url.toLowerCase().startsWith(prefix)))
        return `/api/s3/files?key=${encodeURIComponent(url)}`;
    const path = url.startsWith('/') ? url : `/${url}`;
    return `/api/nas/preview?path=${encodeURIComponent(path)}`;
}

function getExcerpt(htmlContent) {
    if (!htmlContent) return '';
    const tmp = document.createElement('DIV');
    tmp.innerHTML = htmlContent;
    return (tmp.textContent || tmp.innerText || '').slice(0, 100) + '…';
}

export default function WebzineSection() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        const fetchPosts = async () => {
            try {
                const { data, error } = await supabase
                    .from('posts')
                    .select('id, title, content, thumbnail_url, created_at, author_email')
                    .eq('board_type', 'webzine')
                    .order('created_at', { ascending: false })
                    .limit(6);
                if (error) throw error;
                setPosts(data || []);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchPosts();
    }, []);

    return (
        <section id="webzine" className={styles.section}>
            <div className="container">
                <div className={styles.header}>
                    <span className={styles.tag}>Webzine</span>
                    <h2 className={styles.title}>웹진</h2>
                    <p className={styles.subtitle}>회사 소식과 이야기를 전합니다.</p>
                </div>

                {loading ? (
                    <div className={styles.loading}>로딩 중...</div>
                ) : posts.length > 0 ? (
                    <>
                        <div className={styles.grid}>
                            {posts.map((post) => {
                                const src = getThumbnailSrc(post);
                                return (
                                    <Link href={`/webzine/${post.id}`} key={post.id} className={styles.card}>
                                        <div className={styles.thumbWrap}>
                                            {src ? (
                                                <Image
                                                    src={src}
                                                    alt={post.title}
                                                    fill
                                                    className={styles.thumb}
                                                    sizes="(max-width: 768px) 100vw, 33vw"
                                                    unoptimized
                                                    onError={(e) => {
                                                        e.currentTarget.style.display = 'none';
                                                        const next = e.currentTarget.nextSibling;
                                                        if (next) next.style.display = 'flex';
                                                    }}
                                                />
                                            ) : null}
                                            <div className={styles.noThumb} style={{ display: src ? 'none' : 'flex' }} />
                                        </div>
                                        <div className={styles.cardBody}>
                                            <h3 className={styles.cardTitle}>{post.title}</h3>
                                            <p className={styles.excerpt}>{getExcerpt(post.content)}</p>
                                            <span className={styles.date}>{new Date(post.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                        <div className={styles.moreWrap}>
                            <Link href="/webzine" className={styles.moreLink}>웹진 전체보기</Link>
                        </div>
                    </>
                ) : (
                    <div className={styles.empty}>등록된 웹진이 없습니다.</div>
                )}
            </div>
        </section>
    );
}
