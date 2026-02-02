'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../board.module.css';

export default function FreeBoardPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) {
            router.replace('/login?next=/employees/board/free');
        }
    }, [role, authLoading, router]);

    useEffect(() => {
        if (role) {
            fetchPosts();
        }
    }, [role]);

    async function fetchPosts() {
        try {
            const res = await fetch('/api/board?type=free');
            const data = await res.json();
            if (data.posts) {
                setPosts(data.posts);
            }
        } catch (error) {
            console.error('Fetch error:', error);
        } finally {
            setLoading(false);
        }
    }

    if (authLoading || loading) {
        return <div style={{ padding: '100px', textAlign: 'center' }}>로딩 중...</div>;
    }
    if (!role) return null;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>자유게시판</h1>
                <Link href="/employees/board/free/new" className={styles.btnPrimary}>
                    글쓰기
                </Link>
            </div>

            <div className={styles.detailCard}>
                <table className={styles.boardTable}>
                    <thead>
                        <tr>
                            <th style={{ width: '80px' }} className={styles.colNum}>번호</th>
                            <th className={styles.colTitle}>제목</th>
                            <th style={{ width: '150px' }} className={styles.colAuthor}>작성자</th>
                            <th style={{ width: '120px' }} className={styles.colDate}>날짜</th>
                        </tr>
                    </thead>
                    <tbody>
                        {posts.map((post, index) => (
                            <tr
                                key={post.id}
                                className={styles.postRow}
                                onClick={() => router.push(`/employees/board/free/${post.id}`)}
                            >
                                <td className={styles.colNum}>{posts.length - index}</td>
                                <td className={styles.colTitle}>
                                    <span className={styles.postTitle}>
                                        {post.title}
                                    </span>
                                </td>
                                <td className={`${styles.author} ${styles.colAuthor}`}>
                                    {post.author?.name || post.author?.email?.split('@')[0]}
                                    {(post.author?.rank || post.author?.position) && (
                                        <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '4px' }}>
                                            {post.author.rank}{post.author.position ? `(${post.author.position})` : ''}
                                        </span>
                                    )}
                                </td>
                                <td className={`${styles.date} ${styles.colDate}`}>
                                    {new Date(post.created_at).toLocaleDateString()}
                                </td>
                            </tr>
                        ))}
                        {posts.length === 0 && (
                            <tr>
                                <td colSpan="4" className={styles.empty}>게시글이 없습니다.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
