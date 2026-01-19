'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../board/board.module.css';

export default function WorkReportsPage() {
    const { role, user, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) {
            router.replace('/login?next=/employees/reports');
        }
    }, [role, authLoading, router]);

    useEffect(() => {
        if (role) {
            fetchReports();
        }
    }, [role]);

    async function fetchReports() {
        try {
            // For reports, we might filter by branch on backend if not admin
            const isStaff = ['admin', 'headquarters'].includes(role);
            const branchQuery = isStaff ? '' : `&branch=${role}`;

            const res = await fetch(`/api/board?type=report${branchQuery}`);
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

    if (authLoading || loading) return <div style={{ padding: '40px' }}>로딩 중...</div>;
    if (!role) return null;

    const branchTitle = ['admin', 'headquarters'].includes(role) ? '통합 업무보고' : `${role.toUpperCase()} 지점 업무보고`;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>{branchTitle}</h1>
                <Link href="/employees/reports/new" className={styles.btnPrimary}>
                    보고서 작성
                </Link>
            </div>

            <table className={styles.boardTable}>
                <thead>
                    <tr>
                        <th style={{ width: '80px' }}>번호</th>
                        <th style={{ width: '100px' }}>지점</th>
                        <th>제목</th>
                        <th style={{ width: '150px' }}>작성자</th>
                        <th style={{ width: '120px' }}>날짜</th>
                    </tr>
                </thead>
                <tbody>
                    {posts.map((post, index) => (
                        <tr key={post.id} className={styles.postRow}>
                            <td>{posts.length - index}</td>
                            <td><span style={{ fontSize: '0.8rem', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>{post.branch_tag?.toUpperCase()}</span></td>
                            <td>
                                <Link href={`/employees/reports/${post.id}`} className={styles.postTitle}>
                                    {post.title}
                                </Link>
                            </td>
                            <td className={styles.author}>{post.author?.email.split('@')[0]}</td>
                            <td className={styles.date}>
                                {new Date(post.created_at).toLocaleDateString()}
                            </td>
                        </tr>
                    ))}
                    {posts.length === 0 && (
                        <tr>
                            <td colSpan="5" className={styles.empty}>작성된 업무보고가 없습니다.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
