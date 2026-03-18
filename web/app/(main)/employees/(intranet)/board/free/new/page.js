'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../board.module.css';
import { motion } from 'framer-motion';

export default function NewPostPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [isAnonymous, setIsAnonymous] = useState(false); // [추가] 익명 여부 상태
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
                    attachments,
                    is_anonymous: isAnonymous // [추가] 익명 여부 서버 전송
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

    if (authLoading) return <div className={styles.container}><p>로딩 중...</p></div>;
    if (!role) return null;

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>게시글 작성</h1>
                <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)', marginTop: '6px' }}>자유로운 소통과 정보 공유를 위한 공간입니다.</p>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className={styles.editorCard}
            >
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>제목</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="동료들이 한눈에 알아볼 수 있는 제목을 적어주세요"
                            className={styles.input}
                            required
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>본문 내용</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="나누고 싶은 이야기를 자유롭게 작성해 보세요."
                            className={styles.textarea}
                            required
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>파일 첨부</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <input
                                type="file"
                                id="file-upload"
                                onChange={handleFileUpload}
                                disabled={uploading}
                                style={{ display: 'none' }}
                            />
                            <label htmlFor="file-upload" style={{
                                background: '#f8fafc',
                                padding: '10px 24px',
                                border: '1.5px solid #e2e8f0',
                                borderRadius: '10px',
                                fontSize: '0.9rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                📁 파일 선택하기
                            </label>
                            {uploading && <span style={{ fontSize: '0.85rem', color: '#2563eb', fontWeight: 600 }}>업로드 중...</span>}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '16px' }}>
                            {attachments.map((file, i) => (
                                <div key={i} style={{ background: '#eff6ff', padding: '8px 16px', borderRadius: '20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #dbeafe', color: '#1e40af', fontWeight: 600 }}>
                                    📎 {file.name}
                                    <button type="button" onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem', padding: 0 }}>×</button>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className={styles.editorActions}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => setIsAnonymous(!isAnonymous)}>
                            <input
                                type="checkbox"
                                checked={isAnonymous}
                                onChange={() => { }}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#475569' }}>익명으로 작성하기</span>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button type="button" onClick={() => router.back()} className={styles.btnSecondary}>돌아가기</button>
                            <button type="submit" disabled={submitting || uploading} className={styles.btnPrimary}>
                                {submitting ? '등록 중...' : '게시글 등록하기'}
                            </button>
                        </div>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}
