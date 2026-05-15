'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import { formatPhoneNumber } from '@/utils/format';
import styles from '../../reports.module.css';

export default function NewMonthlyReportPage() {
    const { role, user, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [branch, setBranch] = useState('');
    const [reporterName, setReporterName] = useState('');
    const [reporterPhone, setReporterPhone] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (!authLoading) {
            if (!role || role === 'visitor') {
                router.replace('/login?next=/employees/reports/monthly/new');
            } else {
                if (!['admin', 'headquarters'].includes(role)) {
                    setBranch(role);
                } else if (!branch) {
                    setBranch('headquarters');
                }
                if (user) {
                    setReporterName(user.name || '');
                    setReporterPhone(user.phone || '');
                }
            }
        }
    }, [role, user, authLoading, router, branch]);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        try {
            const now = new Date();
            const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
            const key = `Board/Report/${yearMonth}/${Date.now()}_${file.name}`;
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
            alert('파일 업로드 실패');
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) return;
        setSubmitting(true);
        try {
            const finalContent = `${content}\n\n---\n[작성자 정보]\n성함: ${reporterName}\n지점: ${branch}\n연락처: ${reporterPhone}`;
            const res = await fetch('/api/board', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    content: finalContent,
                    board_type: 'report',
                    branch_tag: branch || 'headquarters',
                    report_kind: 'monthly',
                    attachments,
                }),
            });
            if (res.ok) {
                router.push('/employees/reports/monthly');
                router.refresh();
            }
        } catch (error) {
            console.error(error);
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading) return <div style={{ padding: '100px', textAlign: 'center' }}>로딩 중...</div>;
    if (!role) return null;

    const isAdmin = ['admin', 'headquarters'].includes(role);

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>월간 실적보고 작성</h1>
            </div>
            <div className={styles.editorCard}>
                <form onSubmit={handleSubmit}>
                    <div className={styles.metaGrid}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>지점</label>
                            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={styles.input} style={{ backgroundColor: isAdmin ? 'white' : '#f8fafc' }} required disabled={!isAdmin}>
                                <option value="">선택</option>
                                <option value="asan">아산지점</option>
                                <option value="asan_cy">아산CY</option>
                                <option value="headquarters">서울본사</option>
                                <option value="jungbu">중부지점</option>
                                <option value="yesan">예산지점</option>
                                <option value="dangjin">당진지점</option>
                                <option value="seosan">서산지점</option>
                                <option value="yeoncheon">영천지점</option>
                                <option value="ulsan">울산지점</option>
                                <option value="imgo">임고지점</option>
                                <option value="bulk">벌크사업부</option>
                            </select>
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>작성자</label>
                            <input type="text" value={reporterName} onChange={(e) => setReporterName(e.target.value)} placeholder="이름" className={styles.input} required />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>연락처</label>
                            <input type="text" value={reporterPhone} onChange={(e) => setReporterPhone(formatPhoneNumber(e.target.value))} placeholder="010-0000-0000" className={styles.input} required />
                        </div>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>제목</label>
                        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2025년 1월 실적보고" className={styles.input} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>내용</label>
                        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="월간 실적 요약 및 상세 내용을 입력하세요" className={styles.textarea} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>첨부파일</label>
                        <input type="file" onChange={handleFileUpload} disabled={uploading} className={`${styles.input} ${styles.fileInputCompact}`} />
                        {uploading && <span className={styles.hint}> 업로드 중...</span>}
                        <div className={styles.attachmentList}>
                            {attachments.map((file, i) => (
                                <div key={i} className={styles.attachmentChip}>
                                    {file.name}
                                    <button type="button" onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))} className={styles.attachmentRemove}>×</button>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className={styles.editorActions}>
                        <button type="button" onClick={() => router.back()} className={styles.btnSecondary}>취소</button>
                        <button type="submit" disabled={submitting} className={styles.btnPrimary}>실적보고 등록</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
