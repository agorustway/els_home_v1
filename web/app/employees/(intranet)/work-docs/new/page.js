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
    const [attachments, setAttachments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState('write'); // 'write' | 'preview'

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

    // Paste handler for screenshot images
    const handlePaste = async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        let blob = null;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                blob = items[i].getAsFile();
                break;
            }
        }

        if (!blob) return;

        // Prevent default paste (optional, but good if we desire full control)
        // For now, if text is mixed with image, we might want to let text paste.
        // But if we found an image, let's upload it.

        const timestamp = Date.now();
        const fileName = `paste_image_${timestamp}.png`;
        const key = `work-docs/${timestamp}_${fileName}`;

        try {
            // Insert placeholder
            const cursorPosition = e.target.selectionStart;
            const textBefore = content.substring(0, cursorPosition);
            const textAfter = content.substring(e.target.selectionEnd);
            const placeholder = `\n![업로드 중...](${fileName})\n`; // Temporary placeholder
            setContent(textBefore + placeholder + textAfter);

            // Upload
            const formData = new FormData();
            formData.append('file', blob);
            formData.append('key', key);

            const res = await fetch('/api/s3/files', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const url = `${window.location.origin}/api/s3/files?key=${encodeURIComponent(key)}&name=${encodeURIComponent(fileName)}`;

                // Replace placeholder with actual image markdown
                setContent(prev => prev.replace(`![업로드 중...](${fileName})`, `![image](${url})`));
            } else {
                setContent(prev => prev.replace(`\n![업로드 중...](${fileName})\n`, '\n(이미지 업로드 실패)\n'));
                alert('이미지 붙여넣기 업로드 실패');
            }
        } catch (err) {
            console.error(err);
            setContent(prev => prev.replace(`\n![업로드 중...](${fileName})\n`, '\n(이미지 업로드 에러)\n'));
            alert('이미지 업로드 중 오류가 발생했습니다.');
        }
    };


    const [isDragging, setIsDragging] = useState(false);
    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };
    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };
    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        handleFileUpload(e);
    };

    const removeAttachment = (idx) => {
        setAttachments(prev => prev.filter((_, i) => i !== idx));
    };

    const insertImageToContent = (url, name) => {
        const imgTag = `![${name}](${url})\n`;
        setContent(prev => prev + (prev.endsWith('\n') || prev === '' ? '' : '\n') + imgTag);
    };

    const renderContent = (content) => {
        if (!content) return <span style={{ color: '#94a3b8' }}>(내용 없음)</span>;

        // Convert ![alt](url) to <img>
        const imgRegex = /!\[([^\]]*)\]\(([^\)]+)\)/g;
        const parts = content.split(imgRegex);

        const elements = [];
        for (let i = 0; i < parts.length; i += 3) {
            elements.push(<span key={`text-${i}`} style={{ whiteSpace: 'pre-wrap' }}>{parts[i]}</span>);
            if (parts[i + 1] !== undefined && parts[i + 2] !== undefined) {
                elements.push(
                    <div key={`img-container-${i}`} className={styles.bodyImageContainer}>
                        <img
                            src={parts[i + 2]}
                            alt={parts[i + 1]}
                            className={styles.bodyImage}
                            style={{ maxWidth: '100%', borderRadius: 8, margin: '10px 0', border: '1px solid #e2e8f0' }}
                        />
                    </div>
                );
            }
        }
        return elements;
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <label className={styles.label} style={{ marginBottom: 0 }}>내용</label>
                            <div style={{ background: '#f1f5f9', padding: '4px', borderRadius: 8, display: 'flex' }}>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('write')}
                                    className={`${styles.tabBtn} ${activeTab === 'write' ? styles.tabBtnActive : ''}`}
                                >
                                    작성
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('preview')}
                                    className={`${styles.tabBtn} ${activeTab === 'preview' ? styles.tabBtnActive : ''}`}
                                >
                                    미리보기
                                </button>
                            </div>
                        </div>

                        {activeTab === 'write' ? (
                            <textarea
                                className={styles.textarea}
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                onPaste={handlePaste}
                                placeholder="내용을 입력하세요. 스크린샷을 붙여넣기(Ctrl+V)하면 자동으로 업로드됩니다."
                            />
                        ) : (
                            <div className={styles.textarea} style={{ background: '#f8fafc', overflowY: 'auto' }}>
                                <div className={styles.contentBody} style={{ fontSize: '0.95rem' }}>
                                    {renderContent(content)}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>📎 첨부파일 및 이미지</label>
                        <div
                            className={`${styles.uploadZone} ${isDragging ? styles.dragging : ''}`}
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
