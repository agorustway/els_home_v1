'use client';


import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../../intranet.module.css';

export default function DriverContactsEditPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const params = useParams();

    const BRANCHES = ['아산지점', '중부지점', '예산지점', '당진지점', '부산지점', '상암지점'];

    const [formData, setFormData] = useState({
        branch: '', name: '', phone: '', vehicle_type: '', chassis_type: '', photo_url: '',
        contract_type: 'uncontracted', vehicle_number: '', vehicle_id: '', photo_driver: '',
    });
    const [attachments, setAttachments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [loading, setLoading] = useState(true);

    const formatPhone = (val) => {
        const num = val.replace(/[^0-9]/g, '');
        if (num.length <= 3) return num;
        if (num.length <= 7) return `${num.slice(0, 3)}-${num.slice(3)}`;
        return `${num.slice(0, 3)}-${num.slice(3, 7)}-${num.slice(7, 11)}`;
    };

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/driver-contacts/' + params.id + '/edit');
    }, [role, authLoading, router, params.id]);

    useEffect(() => {
        if (role && params.id) {
            fetch('/api/driver-contacts/' + params.id)
                .then(res => res.json())
                .then(data => {
                    if (data.item) {
                        const { branch, name, phone, vehicle_type, chassis_type, photo_url, additional_docs, contract_type, vehicle_number, vehicle_id, photo_driver } = data.item;
                        setFormData({ 
                            branch: branch || '', name, phone: formatPhone(phone), vehicle_type, chassis_type, photo_url, 
                            contract_type: contract_type || 'uncontracted', 
                            vehicle_number: vehicle_number || '', 
                            vehicle_id: vehicle_id || '',
                            photo_driver: photo_driver || ''
                        });
                        setAttachments(additional_docs || []);
                    }
                })
                .finally(() => setLoading(false));
        }
    }, [role, params.id]);

    const handlePhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const key = `drivers/photos/${Date.now()}_${file.name}`;
            const fd = new FormData();
            fd.append('file', file); fd.append('key', key);
            const res = await fetch('/api/s3/files', { method: 'POST', body: fd });
            if (res.ok) setFormData(prev => ({ ...prev, photo_url: `${window.location.origin}/api/s3/files?key=${encodeURIComponent(key)}` }));
        } finally { setUploading(false); }
    };

    const handleDocUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        setUploading(true);
        for (const file of files) {
            if (attachments.length >= 10) break;
            const key = `drivers/docs/${Date.now()}_${file.name}`;
            try {
                const fd = new FormData();
                fd.append('file', file); fd.append('key', key);
                const res = await fetch('/api/s3/files', { method: 'POST', body: fd });
                if (res.ok) setAttachments(prev => [...prev, { name: file.name, url: `${window.location.origin}/api/s3/files?key=${encodeURIComponent(key)}&name=${encodeURIComponent(file.name)}` }]);
            } catch (err) { }
        }
        setUploading(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const res = await fetch('/api/driver-contacts/' + params.id, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    ...formData, 
                    phone: formData.phone.replace(/[^0-9]/g, ''), 
                    additional_docs: attachments 
                }),
            });
            if (res.ok) router.push('/employees/driver-contacts/' + params.id);
            else alert('저장 실패');
        } finally { setSubmitting(false); }
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>운전원정보 · 수정</h1>
                <Link href={`/employees/driver-contacts/${params.id}`} className={styles.btnSecondary}>취소</Link>
            </div>
            <div className={styles.card}>
                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 30 }}>
                        <div style={{ position: 'relative', width: 100, height: 100, borderRadius: '50%', background: '#f8fafc', overflow: 'hidden', border: '2px solid #e1e7ef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {formData.photo_driver || formData.photo_url ? (
                                <img src={formData.photo_driver || formData.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <span style={{ fontSize: '2.5rem' }}>👤</span>
                            )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label className={styles.label} style={{ marginBottom: 0 }}>프로필 사진</label>
                            {formData.photo_driver && (
                                <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700, marginBottom: '4px' }}>📡 앱 업로드 사진 사용 중</div>
                            )}
                            <input type="file" onChange={handlePhotoUpload} accept="image/*" style={{ fontSize: '0.85rem' }} />
                        </div>
                    </div>
                    
                    <div className={styles.gridContainer} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>이름 *</label>
                            <input name="name" className={styles.input} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>계약유형</label>
                            <select className={styles.input} value={formData.contract_type} onChange={(e) => setFormData({ ...formData, contract_type: e.target.value })} style={{ height: '42px' }}>
                                <option value="contracted">계약차량</option>
                                <option value="uncontracted">미계약차량</option>
                            </select>
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>연락처</label>
                            <input name="phone" className={styles.input} value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: formatPhone(e.target.value) })} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>소속지점</label>
                            <select className={styles.input} value={formData.branch} onChange={(e) => setFormData({ ...formData, branch: e.target.value })} style={{ height: '42px' }}>
                                <option value="">지점 선택</option>
                                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>차량번호</label>
                            <input className={styles.input} value={formData.vehicle_number} onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value })} placeholder="충남11바1234" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>차량아이디</label>
                            <input className={styles.input} value={formData.vehicle_id} onChange={(e) => setFormData({ ...formData, vehicle_id: e.target.value.toUpperCase() })} placeholder="ABCD1234" maxLength={8} style={{ textTransform: 'uppercase', letterSpacing: '1px' }} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>차종</label>
                            <input className={styles.input} value={formData.vehicle_type} onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>샤시종류</label>
                            <input className={styles.input} value={formData.chassis_type} onChange={(e) => setFormData({ ...formData, chassis_type: e.target.value })} />
                        </div>
                    </div>
                    
                    <div className={styles.formGroup} style={{ marginTop: 30 }}>
                        <label className={styles.label}>📎 추가 서류 (최대 10개)</label>
                        <div style={{ border: '1px dashed #cbd5e1', padding: '15px', borderRadius: '8px', background: '#f8fafc' }}>
                            <input type="file" multiple onChange={handleDocUpload} style={{ marginBottom: 10 }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {attachments.map((file, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
                                        <span>📎 {file.name}</span>
                                        <span onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))} style={{ color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>✕</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    
                    <div className={styles.actions} style={{ marginTop: 30 }}>
                        <button type="submit" className={styles.btnPrimary} style={{ height: '44px', width: '120px' }} disabled={submitting}>저장하기</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
