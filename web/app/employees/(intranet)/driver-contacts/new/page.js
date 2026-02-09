'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../intranet.module.css';

export default function DriverContactsNewPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();

    const [formData, setFormData] = useState({
        business_number: '',
        name: '',
        phone: '',
        driver_id: '',
        vehicle_type: '',
        chassis_type: '',
        photo_url: ''
    });
    const [attachments, setAttachments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/driver-contacts/new');
    }, [role, authLoading, router]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const key = `drivers/photos/${Date.now()}_${file.name}`;
            const fd = new FormData();
            fd.append('file', file);
            fd.append('key', key);
            const res = await fetch('/api/s3/files', { method: 'POST', body: fd });
            if (res.ok) {
                setFormData(prev => ({ ...prev, photo_url: `${window.location.origin}/api/s3/files?key=${encodeURIComponent(key)}` }));
            }
        } catch (err) {
            alert('사진 업로드 실패');
        } finally {
            setUploading(false);
        }
    };

    const handleDocUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        setUploading(true);
        for (const file of files) {
            if (attachments.length >= 10) {
                alert('추가 서류는 최대 10개까지 가능합니다.');
                break;
            }
            const key = `drivers/docs/${Date.now()}_${file.name}`;
            try {
                const fd = new FormData();
                fd.append('file', file);
                fd.append('key', key);
                const res = await fetch('/api/s3/files', { method: 'POST', body: fd });
                if (res.ok) {
                    setAttachments(prev => [...prev, { name: file.name, url: `${window.location.origin}/api/s3/files?key=${encodeURIComponent(key)}&name=${encodeURIComponent(file.name)}` }]);
                }
            } catch (err) {
                alert(`파일 업로드 실패: ${file.name}`);
            }
        }
        setUploading(false);
    };

    const removeDoc = (idx) => setAttachments(prev => prev.filter((_, i) => i !== idx));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/driver-contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, additional_docs: attachments }),
            });
            if (res.ok) {
                const data = await res.json();
                router.push('/employees/driver-contacts/' + data.item.id);
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
                <h1 className={styles.title}>운전원정보 · 등록</h1>
                <Link href="/employees/driver-contacts" className={styles.btnSecondary}>목록</Link>
            </div>
            <div className={styles.card}>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup} style={{ marginBottom: 30 }}>
                        <label className={styles.label}>프로필 사진</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                            <div style={{ width: 100, height: 100, borderRadius: '50%', background: '#f1f5f9', overflow: 'hidden', border: '2px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {formData.photo_url ? <img src={formData.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '2.5rem' }}>👤</span>}
                            </div>
                            <input type="file" onChange={handlePhotoUpload} accept="image/*" style={{ fontSize: '0.9rem' }} />
                        </div>
                    </div>

                    <div className={styles.gridContainer} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>이름 *</label>
                            <input name="name" className={styles.input} value={formData.name} onChange={handleInputChange} placeholder="운전원 이름" required />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>연락처</label>
                            <input name="phone" className={styles.input} value={formData.phone} onChange={handleInputChange} placeholder="전화번호" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>영업넘버</label>
                            <input name="business_number" className={styles.input} value={formData.business_number} onChange={handleInputChange} placeholder="영업용 넘버" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>아이디 (영문4+숫자4)</label>
                            <input name="driver_id" className={styles.input} value={formData.driver_id} onChange={handleInputChange} placeholder="예: ABCD1234" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>차종</label>
                            <input name="vehicle_type" className={styles.input} value={formData.vehicle_type} onChange={handleInputChange} placeholder="차종 (예: 25톤 트럭)" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>샤시종류</label>
                            <input name="chassis_type" className={styles.input} value={formData.chassis_type} onChange={handleInputChange} placeholder="샤시 종류" />
                        </div>
                    </div>

                    <div className={styles.formGroup} style={{ marginTop: '20px' }}>
                        <label className={styles.label}>📎 추가 서류 (최대 10개 - 계약서, 사업자등록증, 면허증 등)</label>
                        <div style={{ border: '1px dashed #cbd5e1', padding: '15px', borderRadius: '8px', background: '#f8fafc' }}>
                            <input type="file" multiple onChange={handleDocUpload} style={{ marginBottom: '10px' }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {attachments.map((file, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '6px 12px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
                                        <span>📎 {file.name}</span>
                                        <span onClick={() => removeDoc(idx)} style={{ color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>✕</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className={styles.actions} style={{ marginTop: '30px' }}>
                        <button type="submit" className={styles.btnPrimary} disabled={submitting}>{submitting ? '저장 중...' : '저장'}</button>
                        <Link href="/employees/driver-contacts" className={styles.btnSecondary}>취소</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
