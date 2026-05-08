'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../intranet.module.css';

export default function WorkSitesNewPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [siteName, setSiteName] = useState('');
    const [address, setAddress] = useState('');
    const [contact, setContact] = useState('');
    
    // 세부 작업 프로세스 (JSON으로 work_method에 저장)
    const [precautions, setPrecautions] = useState('');
    const [entryProcess, setEntryProcess] = useState('');
    const [receptionProcess, setReceptionProcess] = useState('');
    const [loadingProcess, setLoadingProcess] = useState('');
    const [exitProcess, setExitProcess] = useState('');
    
    const [notes, setNotes] = useState('');
    const [managers, setManagers] = useState([{ name: '', phone: '', role: '' }]);
    const [attachments, setAttachments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/work-sites/new');
    }, [role, authLoading, router]);

    const handleFileUpload = async (e) => {
        const files = e.target.files ? Array.from(e.target.files) : (e.dataTransfer ? Array.from(e.dataTransfer.files) : []);
        if (files.length === 0) return;

        setUploading(true);
        setUploadProgress(0);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const timestamp = Date.now();
            const key = `work-sites/${timestamp}_${file.name}`;

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
                        url: `/api/s3/files?key=${encodeURIComponent(key)}`
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

    const addManager = () => setManagers([...managers, { name: '', phone: '', role: '' }]);
    const removeManager = (idx) => setManagers(managers.filter((_, i) => i !== idx));
    const updateManager = (idx, field, value) => {
        const next = [...managers];
        next[idx] = { ...next[idx], [field]: value };
        setManagers(next);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!address.trim()) return;
        setSubmitting(true);
        
        const workMethodObj = {
            precautions,
            entryProcess,
            receptionProcess,
            loadingProcess,
            exitProcess
        };
        
        try {
            const res = await fetch('/api/work-sites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    site_name: siteName.trim(),
                    address: address.trim(),
                    contact,
                    work_method: JSON.stringify(workMethodObj),
                    notes,
                    attachments: attachments,
                    managers: managers.filter((m) => m.name && m.name.trim()),
                }),
            });
            if (res.ok) {
                const data = await res.json();
                router.push('/employees/work-sites/' + data.item.id);
            } else {
                alert((await res.json()).error || '저장 실패');
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
                <h1 className={styles.title}>작업지확인 · 등록</h1>
                <Link href="/employees/work-sites" className={styles.btnSecondary}>목록</Link>
            </div>
            <div className={styles.card}>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>작업지명 *</label>
                        <input className={styles.input} value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="작업지명 (예: 오창센터)" required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>작업지 주소 *</label>
                        <input className={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="작업지 주소" required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>대표 연락처</label>
                        <input className={styles.input} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="연락처" />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>담당자 (다수)</label>
                        {managers.map((m, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                                <input className={styles.input} value={m.name} onChange={(e) => updateManager(idx, 'name', e.target.value)} placeholder="이름" style={{ flex: 1 }} />
                                <input className={styles.input} value={m.phone} onChange={(e) => updateManager(idx, 'phone', e.target.value)} placeholder="연락처" style={{ flex: 1 }} />
                                <input className={styles.input} value={m.role} onChange={(e) => updateManager(idx, 'role', e.target.value)} placeholder="역할" style={{ width: 80 }} />
                                <button type="button" onClick={() => removeManager(idx)} className={styles.btnDelete} style={{ padding: '6px 12px' }}>삭제</button>
                            </div>
                        ))}
                        <button type="button" onClick={addManager} className={styles.btnSecondary} style={{ marginTop: 8 }}>담당자 추가</button>
                    </div>
                    
                    <hr style={{ margin: '24px 0', borderColor: '#e2e8f0' }} />
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', color: '#1e293b' }}>작업 프로세스 및 주의사항</h3>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>주의사항</label>
                        <textarea className={styles.textarea} value={precautions} onChange={(e) => setPrecautions(e.target.value)} placeholder="영내 20km 미만 서행, 쓰레기 무단투기 금지 등" style={{ minHeight: 60 }} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>입차</label>
                        <textarea className={styles.textarea} value={entryProcess} onChange={(e) => setEntryProcess(e.target.value)} placeholder="경비실에서 차량등록 후 진입 등" style={{ minHeight: 60 }} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>접수</label>
                        <textarea className={styles.textarea} value={receptionProcess} onChange={(e) => setReceptionProcess(e.target.value)} placeholder="차량번호/전화번호 기재, 도어 오픈 등" style={{ minHeight: 60 }} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>적입</label>
                        <textarea className={styles.textarea} value={loadingProcess} onChange={(e) => setLoadingProcess(e.target.value)} placeholder="도크 진입, 고임목 설치 등" style={{ minHeight: 60 }} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>출차</label>
                        <textarea className={styles.textarea} value={exitProcess} onChange={(e) => setExitProcess(e.target.value)} placeholder="씰 채결 확인, 반출증 전달 후 출차 등" style={{ minHeight: 60 }} />
                    </div>

                    <hr style={{ margin: '24px 0', borderColor: '#e2e8f0' }} />

                    <div className={styles.formGroup}>
                        <label className={styles.label}>특이사항 (하단)</label>
                        <textarea className={styles.textarea} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="기타 특이사항" style={{ minHeight: 100 }} />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>📍 약도 및 관련 서류 업로드</label>
                        <div
                            className={`${styles.uploadZone} ${isDragging ? styles.dragging : ''}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            style={isDragging ? { borderColor: '#2563eb', background: '#f0f7ff' } : {}}
                        >
                            <input type="file" id="fileUpload" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
                            <label htmlFor="fileUpload" className={styles.uploadLabel}>
                                📁 <b>파일을 선택</b>하거나 여기로 드래그하세요 (약도 이미지 포함)
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
                                            <span className={styles.removeFile} onClick={() => removeAttachment(idx)}>✕</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={styles.actions}>
                        <button type="submit" className={styles.btnPrimary} disabled={submitting}>{submitting ? '저장 중...' : '저장'}</button>
                        <Link href="/employees/work-sites" className={styles.btnSecondary}>취소</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
