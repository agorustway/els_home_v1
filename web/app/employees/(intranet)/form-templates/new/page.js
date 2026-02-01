'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../intranet.module.css';

export default function FormTemplatesNewPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('일반');
    const [fileName, setFileName] = useState('');
    const [fileUrl, setFileUrl] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/form-templates/new');
    }, [role, authLoading, router]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/form-templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title.trim(), description, category, file_name: fileName, file_url: fileUrl, file_path: fileUrl }),
            });
            if (res.ok) {
                const { item } = await res.json();
                router.push('/employees/form-templates/' + item.id);
            } else {
                alert((await res.json()).error || '저장 실패');
            }
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading || !role) return <div className={styles.loading}>로딩 중...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>서식자료실 · 등록</h1>
                <Link href="/employees/form-templates" className={styles.btnSecondary}>목록</Link>
            </div>
            <div className={styles.card}>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>분류</label>
                        <select className={styles.input} value={category} onChange={(e) => setCategory(e.target.value)}>
                            <option value="일반">일반</option>
                            <option value="인사">인사</option>
                            <option value="업무">업무</option>
                        </select>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>제목 *</label>
                        <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="서식 제목" required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>설명</label>
                        <textarea className={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="설명" style={{ minHeight: 120 }} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>파일명</label>
                        <input className={styles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="예: 휴가신청서.xlsx" />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>파일 URL</label>
                        <input className={styles.input} value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="다운로드 링크 또는 경로" />
                    </div>
                    <div className={styles.actions}>
                        <button type="submit" className={styles.btnPrimary} disabled={submitting}>{submitting ? '저장 중...' : '저장'}</button>
                        <Link href="/employees/form-templates" className={styles.btnSecondary}>취소</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
