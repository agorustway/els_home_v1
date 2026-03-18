'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import { getRoleLabel } from '@/utils/roles';
import styles from '../reports.module.css';

export default function MyReportsPage() {
    const { role, user, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) {
            router.replace('/login?next=/employees/reports/my');
        }
    }, [role, authLoading, router]);

    useEffect(() => {
        if (user) {
            fetchMyReports();
        }
    }, [user]);

    async function fetchMyReports() {
        try {
            // Fetch all reports but we'll filter on frontend or add a query param if backend supports it
            // For now, let's assume we can fetch by author if we add that logic, 
            // but let's just fetch all reports and filter for simplicity or use a specific API
            const res = await fetch('/api/board?type=report');
            const data = await res.json();
            if (data.posts) {
                // Filter posts where author_id matches current user.id
                const myPosts = data.posts.filter(post => post.author_id === user.id);
                setPosts(myPosts);
            }
        } catch (error) {
            console.error('Fetch error:', error);
        } finally {
            setLoading(false);
        }
    }

    if (authLoading || loading) return <div style={{ padding: '40px' }}>로딩 중...</div>;
    if (!role) return null;

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 className={styles.title}>내 업무보고</h1>
                <Link href="/employees/reports/new" className={styles.btnPrimary} style={{ backgroundColor: '#fff', color: '#1e3a8a' }}>
                    ✍️ 새 보고서 작성
                </Link>
            </div>

            <div className={styles.detailCard}>
                <table className={styles.boardTable}>
                    <thead>
                        <tr>
                            <th style={{ width: '80px' }} className={styles.colNum}>번호</th>
                            <th style={{ width: '100px' }} className={styles.colBranch}>지점</th>
                            <th className={styles.colTitle}>제목</th>
                            <th style={{ width: '120px' }} className={styles.colDate}>날짜</th>
                        </tr>
                    </thead>
                    <tbody>
                        {posts.map((post, index) => (
                            <tr
                                key={post.id}
                                className={styles.postRow}
                                onClick={() => router.push(`/employees/reports/${post.id}`)}
                            >
                                <td className={styles.colNum}>{posts.length - index}</td>
                                <td className={styles.colBranch}><span style={{ fontSize: '0.8rem', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>{getRoleLabel(post.branch_tag)}</span></td>
                                <td className={styles.colTitle}>
                                    <span className={styles.postTitle}>{post.title}</span>
                                </td>
                                <td className={`${styles.date} ${styles.colDate}`}>
                                    {new Date(post.created_at).toLocaleDateString()}
                                </td>
                            </tr>
                        ))}
                        {posts.length === 0 && (
                            <tr>
                                <td colSpan="4" className={styles.empty}>작성한 업무보고가 없습니다.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
