'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../../intranet.module.css';

export default function FormTemplateEditPage() {
    const { id } = useParams();
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('일반');
    const [fileName, setFileName] = useState('');
    const [fileUrl, setFileUrl] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) router.replace(`/login?next=/employees/form-templates/${id}/edit`);
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role && id) {
            fetch(`/api/form-templates/${id}`)
                .then((res) => res.json())
                .then((data) => {
                    if (data.item) {
                        setTitle(data.item.title);
                        setDescription(data.item.description ?? '');
                        setCategory(data.item.category || '일반');
                        setFileName(data.item.file_name ?? '');
                        setFileUrl(data.item.file_url || data.item.file_path || '');
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
            const res = await fetch(`/api/form-templates/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title.trim(),
                    description,
                    category,
                    file_name: fileName,
                    file_url: fileUrl,
                    file_path: fileUrl,
                }),
            });
            if (res.ok) router.push(`/employees/form-templates/${id}`);
            else alert((await res.json()).error || '수정 실패');
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading || loading || !role) return <div className={styles.loading}>로딩 중...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>서식자료실 · 수정</h1>
                <Link href={`/employees/form-templates/${id}`} className={styles.btnSecondary}>취소</Link>
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
                        <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>설명</label>
                        <textarea className={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: 120 }} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>파일명</label>
                        <input className={styles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>파일 URL</label>
                        <input className={styles.input} value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} />
                    </div>
                    <div className={styles.actions}>
                        <button type="submit" className={styles.btnPrimary} disabled={submitting}>{submitting ? '저장 중...' : '저장'}</button>
                        <Link href={`/employees/form-templates/${id}`} className={styles.btnSecondary}>취소</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
