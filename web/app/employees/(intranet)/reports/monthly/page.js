'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import { getRoleLabel } from '@/utils/roles';
import styles from '../reports.module.css';

export default function MonthlyReportsPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) {
            router.replace('/login?next=/employees/reports/monthly');
        }
    }, [role, authLoading, router]);

    useEffect(() => {
        if (role) {
            fetchReports();
        }
    }, [role]);

    async function fetchReports() {
        try {
            const isStaff = ['admin', 'headquarters'].includes(role);
            const branchQuery = isStaff ? '' : `&branch=${role}`;
            const res = await fetch(`/api/board?type=report&kind=monthly${branchQuery}`);
            const data = await res.json();
            if (data.posts) setPosts(data.posts);
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

    const branchTitle = ['admin', 'headquarters'].includes(role) ? '월간 실적보고 (전체)' : `${getRoleLabel(role)} 월간 실적보고`;

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>{branchTitle}</h1>
            </div>

            <div className={styles.detailCard}>
                <table className={styles.boardTable}>
                    <thead>
                        <tr>
                            <th style={{ width: '80px' }} className={styles.colNum}>번호</th>
                            <th style={{ width: '100px' }} className={styles.colBranch}>지점</th>
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
                                onClick={() => router.push(`/employees/reports/${post.id}`)}
                            >
                                <td className={styles.colNum}>{posts.length - index}</td>
                                <td className={styles.colBranch}><span style={{ fontSize: '0.8rem', background: '#eff6ff', color: '#2563eb', padding: '4px 8px', borderRadius: '4px', whiteSpace: 'nowrap', fontWeight: '700' }}>{getRoleLabel(post.branch_tag)}</span></td>
                                <td className={styles.colTitle}>
                                    <span className={styles.postTitle}>{post.title}</span>
                                </td>
                                <td className={`${styles.author} ${styles.colAuthor}`}>{post.author?.name || post.author?.email?.split('@')[0]}</td>
                                <td className={`${styles.date} ${styles.colDate}`}>
                                    {new Date(post.created_at).toLocaleDateString()}
                                </td>
                            </tr>
                        ))}
                        {posts.length === 0 && (
                            <tr>
                                <td colSpan="5" className={styles.empty}>작성된 월간 실적보고가 없습니다.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
