'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../../intranet.module.css';

export default function InternalContactEditPage() {
    const { id } = useParams();
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [name, setName] = useState('');
    const [department, setDepartment] = useState('');
    const [position, setPosition] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [memo, setMemo] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/internal-contacts/' + id + '/edit');
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role && id) {
            fetch('/api/internal-contacts/' + id)
                .then((res) => res.json())
                .then((data) => {
                    if (data.item) {
                        setName(data.item.name);
                        setDepartment(data.item.department ?? '');
                        setPosition(data.item.position ?? '');
                        setPhone(data.item.phone ?? '');
                        setEmail(data.item.email ?? '');
                        setPhotoUrl(data.item.photo_url ?? '');
                        setMemo(data.item.memo ?? '');
                    }
                })
                .finally(() => setLoading(false));
        }
    }, [role, id]);

    const handlePhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const key = 'InternalContacts/' + Date.now() + '_' + file.name;
            const urlRes = await fetch('/api/s3/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'upload_url', key, fileType: file.type }),
            });
            if (!urlRes.ok) throw new Error('Failed to get upload URL');
            if (!uploadRes.ok) throw new Error('Upload failed');

            // S3 직접 접근 URL 대신 절대 경로 프록시 URL을 생성하여 사용
            const absoluteProxyUrl = `${window.location.origin}/api/s3/files?key=${encodeURIComponent(key)}`;
            setPhotoUrl(absoluteProxyUrl);
        } catch (err) {
            console.error(err);
            alert('사진 업로드 실패');
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/internal-contacts/' + id, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), department, position, phone, email, photo_url: photoUrl, memo }),
            });
            if (res.ok) router.push('/employees/internal-contacts/' + id);
            else alert((await res.json()).error || '수정 실패');
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading || loading || !role) return <div className={styles.loading}>로딩 중...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>사내연락망 · 수정</h1>
                <Link href={'/employees/internal-contacts/' + id} className={styles.btnSecondary}>취소</Link>
            </div>
            <div className={styles.card}>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>사진</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: '#f8fafc', padding: '16px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                            {photoUrl ? (
                                <img src={photoUrl} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: '50%', border: '3px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
                            ) : (
                                <div style={{ width: 80, height: 80, background: '#e2e8f0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', color: '#94a3b8' }}>👤</div>
                            )}
                            <div style={{ flex: 1 }}>
                                <input type="file" id="photoEditUpload" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} disabled={uploading} />
                                <label htmlFor="photoEditUpload" style={{ display: 'inline-block', padding: '8px 14px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', marginBottom: 6 }}>
                                    📸 사진 변경하기
                                </label>
                                {uploading && <span style={{ marginLeft: 10, fontSize: '0.85rem', color: '#2563eb', fontWeight: 600 }}>업로드 중...</span>}
                                {photoUrl && (
                                    <div style={{ marginTop: 8, fontSize: '0.7rem', color: '#64748b', wordBreak: 'break-all' }}>
                                        <strong>현재 경로:</strong> {photoUrl}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>이름 *</label>
                        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>부서</label>
                        <input className={styles.input} value={department} onChange={(e) => setDepartment(e.target.value)} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>직급/직책</label>
                        <input className={styles.input} value={position} onChange={(e) => setPosition(e.target.value)} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>연락처</label>
                        <input className={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>이메일</label>
                        <input type="email" className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>메모</label>
                        <textarea className={styles.textarea} value={memo} onChange={(e) => setMemo(e.target.value)} style={{ minHeight: 80 }} />
                    </div>
                    <div className={styles.actions}>
                        <button type="submit" className={styles.btnPrimary} disabled={submitting}>{submitting ? '저장 중...' : '저장'}</button>
                        <Link href={'/employees/internal-contacts/' + id} className={styles.btnSecondary}>취소</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
