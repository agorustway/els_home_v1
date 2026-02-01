'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../../intranet.module.css';

export default function WorkDocEditPage() {
    const { id } = useParams();
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [category, setCategory] = useState('일반');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) router.replace(`/login?next=/employees/work-docs/${id}/edit`);
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role && id) {
            fetch(`/api/work-docs/${id}`)
                .then((res) => res.json())
                .then((data) => {
                    if (data.item) {
                        setTitle(data.item.title);
                        setContent(data.item.content ?? '');
                        setCategory(data.item.category || '일반');
                    }
                })
                .finally(() => setLoading(false));
        }
    }, [role, id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setSubmitting(true);
        try {
            const res = await fetch(`/api/work-docs/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title.trim(), content, category }),
            });
            if (res.ok) router.push(`/employees/work-docs/${id}`);
            else alert((await res.json()).error || '수정 실패');
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading || loading || !role) return <div className={styles.loading}>로딩 중...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>업무자료실 · 수정</h1>
                <Link href={`/employees/work-docs/${id}`} className={styles.btnSecondary}>취소</Link>
            </div>
            <div className={styles.card}>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>분류</label>
                        <select className={styles.input} value={category} onChange={(e) => setCategory(e.target.value)}>
                            <option value="일반">일반</option>
                            <option value="공지">공지</option>
                        </select>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>제목 *</label>
                        <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>내용</label>
                        <textarea className={styles.textarea} value={content} onChange={(e) => setContent(e.target.value)} />
                    </div>
                    <div className={styles.actions}>
                        <button type="submit" className={styles.btnPrimary} disabled={submitting}>{submitting ? '저장 중...' : '저장'}</button>
                        <Link href={`/employees/work-docs/${id}`} className={styles.btnSecondary}>취소</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
