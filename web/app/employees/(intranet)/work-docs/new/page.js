'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../intranet.module.css';

import IntranetEditor from '@/components/IntranetEditor';

export default function WorkDocsNewPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [category, setCategory] = useState('일반');
    const [attachments, setAttachments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/work-docs/new');
    }, [role, authLoading, router]);

    const handleFileUpload = async (e) => {
        const files = e.target.files ? Array.from(e.target.files) : (e.dataTransfer ? Array.from(e.dataTransfer.files) : []);
        if (files.length === 0) return;

        setUploading(true);
        setUploadProgress(0);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const timestamp = Date.now();
            const key = `work-docs/${timestamp}_${file.name}`;

            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('key', key);

                const res = await fetch('/api/s3/files', {
                    method: 'POST',
                    body: formData
                });

                if (res.ok) {
                    const newFile = {
                        name: file.name,
                        key: key,
                        size: file.size,
                        type: file.type,
                        url: `${window.location.origin}/api/s3/files?key=${encodeURIComponent(key)}&name=${encodeURIComponent(file.name)}`
                    };
                    setAttachments(prev => [...prev, newFile]);
                }
            } catch (err) {
                console.error('Upload error:', err);
                alert(`파일 업로드 실패: ${file.name}`);
            }
            setUploadProgress(Math.round(((i + 1) / files.length) * 100));
        }
        setUploading(false);
        setUploadProgress(0);
    };

    const dragCounter = useRef(0);
    const [isDragging, setIsDragging] = useState(false);

    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounter.current = 0;
        handleFileUpload(e);
    };

    const removeAttachment = (idx) => {
        setAttachments(prev => prev.filter((_, i) => i !== idx));
    };

    const insertImageToContent = (url, name) => {
        // Option specific to Quill - we can't easily insert via state update without ref.
        // For now, let's just append to content or handle if user really wants to insert attached file as image.
        // Since Editor uses HTML, we append <img> tag.
        const imgTag = `<img src="${url}" alt="${name}" style="max-width: 100%; border-radius: 8px; margin: 10px 0; border: 1px solid #e2e8f0;">`;
        setContent(prev => prev + imgTag);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/work-docs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title.trim(),
                    content,
                    category,
                    attachments: attachments
                }),
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
                        <IntranetEditor
                            value={content}
                            onChange={setContent}
                            placeholder="내용을 입력하세요."
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>📎 첨부파일 및 이미지</label>
                        <div
                            className={`${styles.uploadZone} ${isDragging ? styles.dragging : ''}`}
                            onDragEnter={handleDragEnter}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            style={isDragging ? { borderColor: '#2563eb', background: '#f0f7ff' } : {}}
                        >
                            <input type="file" id="fileUpload" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
                            <label htmlFor="fileUpload" className={styles.uploadLabel}>
                                📁 <b>파일을 선택</b>하거나 여기로 드래그하세요
                            </label>

                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: isDragging ? 'auto' : 'none' }}></div>

                            {uploading && (
                                <div className={styles.uploadProgress}>
                                    <div className={styles.progressBar} style={{ width: `${uploadProgress}%` }}></div>
                                </div>
                            )}

                            {attachments.length > 0 && (
                                <div className={styles.uploadedList}>
                                    {attachments.map((file, idx) => (
                                        <div key={idx} className={styles.uploadedFile}>
                                            <span>📎 {file.name}</span>
                                            {file.type.startsWith('image/') && (
                                                <span
                                                    className={styles.insertImgBtn}
                                                    onClick={() => insertImageToContent(file.url, file.name)}
                                                >
                                                    [본문 삽입]
                                                </span>
                                            )}
                                            <span className={styles.removeFile} onClick={() => removeAttachment(idx)}>✕</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
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
