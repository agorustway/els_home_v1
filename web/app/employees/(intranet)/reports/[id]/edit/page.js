'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../../board/board.module.css';

export default function EditReportPage() {
    const { id } = useParams();
    const { role, user, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) {
            router.push(`/login?next=/employees/reports/${id}/edit`);
        }
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role) {
            fetchPost();
        }
    }, [role, id]);

    async function fetchPost() {
        try {
            const res = await fetch(`/api/board/${id}`);
            const data = await res.json();
            if (data.post) {
                if (data.post.author_id !== user?.id && role !== 'admin') {
                    alert('수정 권한이 없습니다.');
                    router.push(`/employees/reports/${id}`);
                    return;
                }
                setTitle(data.post.title);
                setContent(data.post.content);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const res = await fetch(`/api/board/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content }),
            });

            if (res.ok) {
                router.push(`/employees/reports/${id}`);
                router.refresh();
            } else {
                alert('수정 실패');
            }
        } catch (error) {
            console.error(error);
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading || loading) {
        return <div style={{ padding: '100px', textAlign: 'center' }}>로딩 중...</div>;
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>업무보고 수정</h1>
            </div>

            <div className={styles.editorCard}>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>제목</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className={styles.input}
                            placeholder="제목을 입력하세요"
                            required
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>내용</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className={styles.textarea}
                            placeholder="내용을 입력하세요"
                            required
                        />
                    </div>
                    <div className={styles.editorActions}>
                        <button type="button" onClick={() => router.back()} className={styles.btnSecondary}>취소</button>
                        <button type="submit" disabled={submitting} className={styles.btnPrimary}>
                            {submitting ? '저장 중...' : '수정 완료'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
