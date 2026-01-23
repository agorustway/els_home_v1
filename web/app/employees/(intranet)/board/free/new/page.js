'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../board.module.css';

export default function NewPostPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) {
            router.replace('/login?next=/employees/board/free/new');
        }
    }, [role, authLoading, router]);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        try {
            const now = new Date();
            const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
            const key = `Board/Free/${yearMonth}/${Date.now()}_${file.name}`;

            const urlRes = await fetch('/api/s3/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'upload_url', key, fileType: file.type }),
            });

            if (!urlRes.ok) throw new Error('Failed to get upload URL');
            const { url } = await urlRes.json();

            const uploadRes = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': file.type },
                body: file,
            });

            if (!uploadRes.ok) throw new Error('Upload failed');
            setAttachments([...attachments, { name: file.name, path: key, type: 's3' }]);
        } catch (error) {
            console.error(error);
            alert('업로드 오류');
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) return;

        setSubmitting(true);
        try {
            const res = await fetch('/api/board', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    content,
                    board_type: 'free',
                    attachments
                }),
            });

            if (res.ok) {
                router.push('/employees/board/free');
            } else {
                const error = await res.json();
                alert('저장 실패: ' + error.error);
            }
        } catch (error) {
            console.error(error);
            alert('오류가 발생했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading) {
        return <div style={{ padding: '100px', textAlign: 'center' }}>로딩 중...</div>;
    }
    if (!role) return null;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>새 글 작성</h1>
            </div>

            <div className={styles.editorCard}>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>제목</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="제목을 입력하세요"
                            className={styles.input}
                            required
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>내용</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="내용을 입력하세요"
                            className={styles.textarea}
                            required
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>첨부파일</label>
                        <input
                            type="file"
                            onChange={handleFileUpload}
                            disabled={uploading}
                            className={styles.input}
                            style={{ padding: '10px' }}
                        />
                        {uploading && <span className={styles.hint}>업로드 중...</span>}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '15px' }}>
                            {attachments.map((file, i) => (
                                <div key={i} style={{ background: '#f1f5f9', padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #e2e8f0' }}>
                                    📎 {file.name}
                                    <button type="button" onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className={styles.editorActions}>
                        <button type="button" onClick={() => router.back()} className={styles.btnSecondary}>취소</button>
                        <button type="submit" disabled={submitting} className={styles.btnPrimary}>
                            {submitting ? '저장 중...' : '등록하기'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
