'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../board.module.css';
import { motion } from 'framer-motion';

export default function FreeBoardPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/board/free');
    }, [role, authLoading, router]);

    useEffect(() => { if (role) fetchPosts(); }, [role]);

    async function fetchPosts() {
        try {
            const res = await fetch('/api/board?type=free');
            const data = await res.json();
            if (data.posts) setPosts(data.posts);
        } catch (error) { console.error(error); } finally { setLoading(false); }
    }

    // 1. 오늘의 새 글 계산
    const todayCount = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        return posts.filter(p => p.created_at.split('T')[0] === today).length;
    }, [posts]);

    // 2. 명예의 전당 (최다 작성자 계산)
    const topContributors = useMemo(() => {
        const counts = {};
        posts.forEach(p => {
            const name = p.author?.name || p.author?.email?.split('@')[0] || '익명';
            const rank = p.author?.rank || '';
            const key = `${name} ${rank}`;
            counts[key] = (counts[key] || 0) + 1;
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
    }, [posts]);

    // 3. 인기글 (조회수 순)
    const popularPosts = useMemo(() => {
        return [...posts].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 5);
    }, [posts]);

    if (authLoading || loading) return <div className={styles.container}><p>게시판 데이터를 불러오는 중...</p></div>;
    if (!role) return null;

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>자유게시판 대시보드</h1>
            </div>

            <div className={styles.splitLayout}>
                {/* 1열: 커뮤니티 정보 */}
                <aside className={styles.column}>
                    <Link href="/employees/board/free/new" className={styles.btnPrimary}>새 글 작성하기</Link>
                    
                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>게시판 통계</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', textAlign: 'center' }}>
                            <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '10px' }}>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>전체 글</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{posts.length}</div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '10px' }}>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>오늘의 새 글</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: todayCount > 0 ? '#e11d48' : '#64748b' }}>{todayCount}</div>
                            </div>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>명예의 전당</h2>
                        <div className={styles.honorList}>
                            {topContributors.length > 0 ? topContributors.map(([name, count], i) => (
                                <div key={i} className={styles.honorItem}>
                                    <span className={styles.honorRank}>{i + 1}</span>
                                    <span>{name}</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#94a3b8' }}>{count}개</span>
                                </div>
                            )) : <div className={styles.emptyHistory}>활동 내역 없음</div>}
                        </div>
                    </div>
                </aside>

                {/* 2열: 메인 피드 */}
                <main className={styles.column}>
                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>최신 게시글 리스트</h2>
                        <div className={styles.postList}>
                            {posts.map((post, i) => (
                                <motion.div 
                                    key={post.id} 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className={styles.postItem} 
                                    onClick={() => router.push(`/employees/board/free/${post.id}`)}
                                >
                                    <div className={styles.postMain}>
                                        <span className={styles.postTitle}>{post.title}</span>
                                        <div className={styles.postMeta}>
                                            <span>👤 {post.author?.name || '익명'}</span>
                                            <span>📅 {new Date(post.created_at).toLocaleDateString()}</span>
                                            <span>👁️ {post.view_count || 0}</span>
                                        </div>
                                    </div>
                                    <div style={{ color: '#cbd5e1', fontSize: '1.2rem' }}>→</div>
                                </motion.div>
                            ))}
                            {posts.length === 0 && <p style={{textAlign: 'center', color: '#94a3b8', padding: '40px'}}>등록된 게시글이 없습니다.</p>}
                        </div>
                    </div>
                </main>

                {/* 3열: 실시간 댓글 및 인기글 */}
                <aside className={styles.column}>
                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>실시간 피드</h2>
                        <div className={styles.commentFeed}>
                            <div className={styles.commentItem} style={{ textAlign: 'center', padding: '20px' }}>
                                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem' }}>댓글 시스템 도입 준비 중입니다.</p>
                            </div>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>🔥 인기 게시글 (TOP 5)</h2>
                        <ul style={{ padding: 0, listStyle: 'none', margin: 0 }}>
                            {popularPosts.length > 0 ? popularPosts.map((post, i) => (
                                <li key={post.id} style={{ padding: '10px 0', fontSize: '0.85rem', borderBottom: i === popularPosts.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                                    <Link href={`/employees/board/free/${post.id}`} style={{ textDecoration: 'none', color: '#334155', fontWeight: 600, display: 'block' }}>
                                        {i + 1}. {post.title}
                                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 400, marginLeft: '6px' }}>({post.view_count || 0})</span>
                                    </Link>
                                </li>
                            )) : <li style={{ padding: '10px 0', fontSize: '0.85rem', color: '#94a3b8' }}>데이터가 없습니다.</li>}
                        </ul>
                    </div>
                </aside>
            </div>
        </div>
    );
}
