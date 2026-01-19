'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../board/board.module.css';

export default function NewReportPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [branch, setBranch] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) {
            router.replace('/login?next=/employees/reports/new');
        } else if (role && !['admin', 'headquarters'].includes(role)) {
            setBranch(role); // Auto-set for branch staff
        }
    }, [role, authLoading, router]);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        const now = new Date();
        const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', `/ELSWEBAPP/Board/Report/${yearMonth}`);

        try {
            const res = await fetch('/api/nas/files', { method: 'POST', body: formData });
            if (res.ok) {
                const data = await res.json();
                setAttachments([...attachments, { name: file.name, path: data.path }]);
            }
        } catch (error) { console.error(error); }
        finally { setUploading(false); }
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
                    board_type: 'report',
                    branch_tag: branch || 'hq', // Fallback
                    attachments
                }),
            });
            if (res.ok) router.push('/employees/reports');
        } catch (error) { console.error(error); }
        finally { setSubmitting(false); }
    };

    if (authLoading) return <div style={{ padding: '40px' }}>로딩 중...</div>;
    if (!role) return null;

    const isAdmin = ['admin', 'headquarters'].includes(role);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>업무보고 작성</h1>
            </div>

            <form onSubmit={handleSubmit} style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                {isAdmin && (
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>지점 선택</label>
                        <select
                            value={branch}
                            onChange={(e) => setBranch(e.target.value)}
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                            required
                        >
                            <option value="">지점을 선택하세요</option>
                            <option value="asan">아산지점</option>
                            <option value="jungbu">중부지점</option>
                            <option value="dangjin">당진지점</option>
                            <option value="yesan">예산지점</option>
                            <option value="headquarters">본사</option>
                        </select>
                    </div>
                )}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>제목</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="보고서 제목을 입력하세요"
                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                        required
                    />
                </div>
                <div style={{ marginBottom: '30px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>내용</label>
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', minHeight: '400px' }}
                        required
                    />
                </div>
                <div style={{ marginBottom: '30px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>첨부파일</label>
                    <input type="file" onChange={handleFileUpload} disabled={uploading} />
                    <div style={{ marginTop: '10px' }}>
                        {attachments.map((f, i) => <div key={i}>📎 {f.name}</div>)}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '15px', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => router.back()} className={styles.btnSecondary}>취소</button>
                    <button type="submit" disabled={submitting} className={styles.btnPrimary}>보고서 등록</button>
                </div>
            </form>
        </div>
    );
}
