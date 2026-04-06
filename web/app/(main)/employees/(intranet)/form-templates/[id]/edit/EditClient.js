'use client';


import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../../intranet.module.css';

import IntranetEditor from '@/components/IntranetEditor';

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
                        setFileName(data.item.file_name || '');
                        setFileUrl(data.item.file_url || data.item.file_path || '');
                    }
                })
                .finally(() => setLoading(false));
        }
    }, [role, id]);

    const handleFileUpload = async (e) => {
        const files = e.target.files ? Array.from(e.target.files) : (e.dataTransfer ? Array.from(e.dataTransfer.files) : []);
        if (files.length === 0) return;
        const file = files[0];

        setUploading(true);
        setUploadProgress(0);

        const timestamp = Date.now();
        const key = `form-templates/${timestamp}_${file.name}`;

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('key', key);

            const interval = setInterval(() => {
                setUploadProgress(prev => Math.min(prev + 10, 90));
            }, 100);

            const res = await fetch('/api/s3/files', {
                method: 'POST',
                body: formData
            });

            clearInterval(interval);
            setUploadProgress(100);

            if (res.ok) {
                setFileName(file.name);
                setFileUrl(`${window.location.origin}/api/s3/files?key=${encodeURIComponent(key)}&name=${encodeURIComponent(file.name)}`);
            } else {
                alert('업로드 실패');
            }
        } catch (err) {
            console.error(err);
            alert('업로드 중 오류가 발생했습니다.');
        } finally {
            setUploading(false);
        }
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

    const insertImageToContent = (url, name) => {
        const imgTag = `<img src="${url}" alt="${name}" style="max-width: 100%; border-radius: 8px; margin: 10px 0; border: 1px solid #e2e8f0;">`;
        setDescription(prev => prev + imgTag);
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
                        <IntranetEditor
                            value={description}
                            onChange={setDescription}
                            placeholder="서식에 대한 설명을 입력하세요."
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>📎 파일 업로드 (교체)</label>
                        <div
                            className={`${styles.uploadZone} ${isDragging ? styles.dragging : ''}`}
                            onDragEnter={handleDragEnter}
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
