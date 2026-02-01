'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../intranet.module.css';

export default function WorkDocsNewPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [category, setCategory] = useState('일반');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/work-docs/new');
    }, [role, authLoading, router]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/work-docs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title.trim(), content, category, attachments: [] }),
            });
            if (res.ok) {
                const { item } = await res.json();
                router.push(`/employees/work-docs/${item.id}`);
            } else {
                const err = await res.json();
                alert(err.error || '저장 실패');
            }
        } catch (err) {
            alert('오류가 발생했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading || !role) return <div className={styles.loading}>로딩 중...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>업무자료실 · 새 글</h1>
                <Link href="/employees/work-docs" className={styles.btnSecondary}>목록</Link>
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
                        <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>내용</label>
                        <textarea className={styles.textarea} value={content} onChange={(e) => setContent(e.target.value)} placeholder="내용" />
                    </div>
                    <div className={styles.actions}>
                        <button type="submit" className={styles.btnPrimary} disabled={submitting}>{submitting ? '저장 중...' : '저장'}</button>
                        <Link href="/employees/work-docs" className={styles.btnSecondary}>취소</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
