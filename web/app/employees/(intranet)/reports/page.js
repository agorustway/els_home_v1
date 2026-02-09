'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import { getRoleLabel } from '@/utils/roles';
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

    if (authLoading || loading) {
        return <div style={{ padding: '100px', textAlign: 'center' }}>로딩 중...</div>;
    }
    if (!role) return null;

    const pageTitle = ['admin', 'headquarters'].includes(role) ? '전체 업무보고' : `${getRoleLabel(role)} 업무보고`;

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>{pageTitle}</h1>
            </div>
            <div className={styles.controls}>
                <Link href="/employees/reports/new" className={styles.btnPrimary}>
                    보고서 작성
                </Link>
            </div>

            <div className={styles.detailCard}>
                <table className={styles.boardTable}>
                    <thead>
                        <tr>
                            <th style={{ width: '80px' }} className={styles.colNum}>번호</th>
                            <th style={{ width: '90px' }} className={styles.colBranch}>종류</th>
                            <th style={{ width: '100px' }} className={styles.colBranch}>지점</th>
                            <th className={styles.colTitle}>제목</th>
                            <th style={{ width: '130px' }} className={styles.colAuthor}>작성자</th>
                            <th style={{ width: '110px' }} className={styles.colDate}>날짜</th>
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
                                <td className={styles.colBranch}>
                                    <span style={{ fontSize: '0.75rem', background: post.report_kind === 'daily' ? '#f0fdf4' : post.report_kind === 'monthly' ? '#fef3c7' : '#f3f4f6', color: post.report_kind === 'daily' ? '#16a34a' : post.report_kind === 'monthly' ? '#d97706' : '#6b7280', padding: '4px 8px', borderRadius: '4px', whiteSpace: 'nowrap', fontWeight: '700' }}>
                                        {post.report_kind === 'daily' ? '일일' : post.report_kind === 'monthly' ? '월간' : '기타'}
                                    </span>
                                </td>
                                <td className={styles.colBranch}><span style={{ fontSize: '0.8rem', background: '#eff6ff', color: '#2563eb', padding: '4px 8px', borderRadius: '4px', whiteSpace: 'nowrap', fontWeight: '700' }}>{getRoleLabel(post.branch_tag)}</span></td>
                                <td className={styles.colTitle}>
                                    <span className={styles.postTitle}>
                                        {post.title}
                                    </span>
                                </td>
                                <td className={`${styles.author} ${styles.colAuthor}`}>{post.author?.name || post.author?.email.split('@')[0]}</td>
                                <td className={`${styles.date} ${styles.colDate}`}>
                                    {new Date(post.created_at).toLocaleDateString()}
                                </td>
                            </tr>
                        ))}
                        {posts.length === 0 && (
                            <tr>
                                <td colSpan="6" className={styles.empty}>작성된 업무보고가 없습니다.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
