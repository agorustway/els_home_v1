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
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState('write');

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

    const handleFileUpload = async (e) => {
        const files = e.target.files ? Array.from(e.target.files) : (e.dataTransfer ? Array.from(e.dataTransfer.files) : []);
        if (files.length === 0) return;

        setUploading(true);
        setUploadProgress(0);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const timestamp = Date.now();
            const key = `form-templates/${timestamp}_${file.name}`;

            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('key', key);

                const res = await fetch('/api/s3/files', {
                    method: 'POST',
                    body: formData
                });

                if (res.ok) {
                    const url = `${window.location.origin}/api/s3/files?key=${encodeURIComponent(key)}&name=${encodeURIComponent(file.name)}`;
                    setFileUrl(url);
                    setFileName(file.name);
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

        const timestamp = Date.now();
        const fileName = `paste_image_${timestamp}.png`;
        const key = `form-templates/${timestamp}_${fileName}`;

        try {
            // Insert placeholder
            const cursorPosition = e.target.selectionStart;
            const textBefore = description.substring(0, cursorPosition);
            const textAfter = description.substring(e.target.selectionEnd);
            const placeholder = `\n![업로드 중...](${fileName})\n`;
            setDescription(textBefore + placeholder + textAfter);

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
                setDescription(prev => prev.replace(`![업로드 중...](${fileName})`, `![image](${url})`));
            } else {
                setDescription(prev => prev.replace(`\n![업로드 중...](${fileName})\n`, '\n(이미지 업로드 실패)\n'));
                alert('이미지 붙여넣기 업로드 실패');
            }
        } catch (err) {
            console.error(err);
            setDescription(prev => prev.replace(`\n![업로드 중...](${fileName})\n`, '\n(이미지 업로드 에러)\n'));
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

    // Helper renderContent
    const renderContent = (content) => {
        if (!content) return <span style={{ color: '#94a3b8' }}>(내용 없음)</span>;

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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <label className={styles.label} style={{ marginBottom: 0 }}>설명</label>
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
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                onPaste={handlePaste}
                                style={{ minHeight: 120 }}
                            />
                        ) : (
                            <div className={styles.textarea} style={{ background: '#f8fafc', overflowY: 'auto', minHeight: 120 }}>
                                <div className={styles.contentBody} style={{ fontSize: '0.95rem' }}>
                                    {renderContent(description)}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>📎 파일 업로드 (교체)</label>
                        <div
                            className={`${styles.uploadZone} ${isDragging ? styles.dragging : ''}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            style={isDragging ? { borderColor: '#2563eb', background: '#f0f7ff' } : {}}
                        >
                            <input type="file" id="fileUpload" onChange={handleFileUpload} style={{ display: 'none' }} />
                            <label htmlFor="fileUpload" className={styles.uploadLabel}>
                                📁 <b>파일을 선택</b>하거나 여기로 드래그하세요
                            </label>

                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: isDragging ? 'auto' : 'none' }}></div>

                            {uploading && (
                                <div className={styles.uploadProgress}>
                                    <div className={styles.progressBar} style={{ width: `${uploadProgress}%` }}></div>
                                </div>
                            )}

                            {fileName && (
                                <div className={styles.uploadedList}>
                                    <div className={styles.uploadedFile}>
                                        <span>📎 {fileName}</span>
                                        <span className={styles.removeFile} onClick={() => { setFileName(''); setFileUrl(''); }}>✕</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 직접 경로 입력 섹션 숨김 (사용자 요청) */}
                    {/* <div className={styles.formGroup} style={{ marginTop: 24, padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}> ... </div> */}
                    <div className={styles.actions}>
                        <button type="submit" className={styles.btnPrimary} disabled={submitting}>{submitting ? '저장 중...' : '저장'}</button>
                        <Link href={`/employees/form-templates/${id}`} className={styles.btnSecondary}>취소</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
