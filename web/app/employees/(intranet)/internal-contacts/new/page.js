'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../intranet.module.css';

export default function InternalContactsNewPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [name, setName] = useState('');
    const [department, setDepartment] = useState('');
    const [position, setPosition] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [memo, setMemo] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/internal-contacts/new');
    }, [role, authLoading, router]);

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
            const json = await urlRes.json();
            const uploadUrl = json.url;
            const uploadRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
            if (!uploadRes.ok) throw new Error('Upload failed');
            setPhotoUrl(uploadUrl.split('?')[0]);
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
            const res = await fetch('/api/internal-contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), department, position, phone, email, photo_url: photoUrl, memo }),
            });
            if (res.ok) {
                const data = await res.json();
                router.push('/employees/internal-contacts/' + data.item.id);
            } else {
                const err = await res.json();
                alert(err.error || '저장 실패');
            }
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading || !role) return <div className={styles.loading}>로딩 중...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>사내연락망 · 등록</h1>
                <Link href="/employees/internal-contacts" className={styles.btnSecondary}>목록</Link>
            </div>
            <div className={styles.card}>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup} style={{ marginBottom: 32 }}>
                        <label className={styles.label}>프로필 사진</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: '#f8fafc', padding: '20px', borderRadius: 16, border: '1px solid #e2e8f0' }}>
                            <div style={{ position: 'relative', width: 100, height: 100 }}>
                                {photoUrl ? (
                                    <img src={photoUrl} alt="Profile preview" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: '50%', border: '4px solid #fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                ) : (
                                    <div style={{ width: 100, height: 100, background: '#e2e8f0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', color: '#94a3b8', border: '4px solid #fff' }}>👤</div>
                                )}
                                {uploading && (
                                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#2563eb' }}>
                                        업로드 중...
                                    </div>
                                )}
                            </div>
                            <div style={{ flex: 1 }}>
                                <input type="file" id="photoUpload" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} disabled={uploading} />
                                <label htmlFor="photoUpload" style={{ display: 'inline-block', padding: '10px 16px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>
                                    📸 사진 선택하기
                                </label>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>인물 사진을 등록하면 사내 연락망에서 더욱 눈에 띕니다.</p>
                                <input type="url" className={styles.input} value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="또는 이미지 URL 입력" style={{ marginTop: 12, padding: '6px 10px', fontSize: '0.85rem' }} />
                            </div>
                        </div>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>이름 *</label>
                        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>부서</label>
                        <input className={styles.input} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="부서" />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>직급/직책</label>
                        <input className={styles.input} value={position} onChange={(e) => setPosition(e.target.value)} placeholder="직급" />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>연락처</label>
                        <input className={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="전화번호" />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>이메일</label>
                        <input type="email" className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>메모</label>
                        <textarea className={styles.textarea} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모" style={{ minHeight: 80 }} />
                    </div>
                    <div className={styles.actions}>
                        <button type="submit" className={styles.btnPrimary} disabled={submitting}>{submitting ? '저장 중...' : '저장'}</button>
                        <Link href="/employees/internal-contacts" className={styles.btnSecondary}>취소</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
