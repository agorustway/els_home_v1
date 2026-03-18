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

    const [formData, setFormData] = useState({
        business_number: '', branch: '', name: '', phone: '', driver_id: '', vehicle_type: '', chassis_type: '', photo_url: '',
        contract_type: 'uncontracted', vehicle_number: '', vehicle_id: '',
    });
    const [attachments, setAttachments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/driver-contacts/' + params.id + '/edit');
    }, [role, authLoading, router, params.id]);

    useEffect(() => {
        if (role && params.id) {
            fetch('/api/driver-contacts/' + params.id)
                .then(res => res.json())
                .then(data => {
                    if (data.item) {
                        const { business_number, branch, name, phone, driver_id, vehicle_type, chassis_type, photo_url, additional_docs, contract_type, vehicle_number, vehicle_id } = data.item;
                        setFormData({ business_number, branch, name, phone, driver_id, vehicle_type, chassis_type, photo_url, contract_type: contract_type || 'uncontracted', vehicle_number: vehicle_number || '', vehicle_id: vehicle_id || '' });
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
                body: JSON.stringify({ ...formData, additional_docs: attachments }),
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
                    <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
                        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#eee', overflow: 'hidden' }}>
                            {formData.photo_url ? <img src={formData.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
                        </div>
                        <input type="file" onChange={handlePhotoUpload} accept="image/*" />
                    </div>
                    <div className={styles.gridContainer} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div className={styles.formGroup}><label className={styles.label}>이름 *</label><input name="name" className={styles.input} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required /></div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>계약유형</label>
                            <select className={styles.input} value={formData.contract_type} onChange={(e) => setFormData({ ...formData, contract_type: e.target.value })} style={{ height: '42px' }}>
                                <option value="contracted">계약차량</option>
                                <option value="uncontracted">미계약차량</option>
                            </select>
                        </div>
                        <div className={styles.formGroup}><label className={styles.label}>연락처</label><input name="phone" className={styles.input} value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} /></div>
                        <div className={styles.formGroup}><label className={styles.label}>소속지점</label><input className={styles.input} value={formData.branch} onChange={(e) => setFormData({ ...formData, branch: e.target.value })} placeholder="예: 부산지점" /></div>
                        <div className={styles.formGroup}><label className={styles.label}>차량번호</label><input className={styles.input} value={formData.vehicle_number} onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value })} placeholder="충남11바1234" /></div>
                        <div className={styles.formGroup}><label className={styles.label}>차량아이디</label><input className={styles.input} value={formData.vehicle_id} onChange={(e) => setFormData({ ...formData, vehicle_id: e.target.value.toUpperCase() })} placeholder="ABCD1234" maxLength={8} style={{ textTransform: 'uppercase', letterSpacing: '1px' }} /></div>
                        <div className={styles.formGroup}><label className={styles.label}>영업넘버</label><input className={styles.input} value={formData.business_number} onChange={(e) => setFormData({ ...formData, business_number: e.target.value })} /></div>
                        <div className={styles.formGroup}><label className={styles.label}>아이디</label><input className={styles.input} value={formData.driver_id} onChange={(e) => setFormData({ ...formData, driver_id: e.target.value })} /></div>
                        <div className={styles.formGroup}><label className={styles.label}>차종</label><input className={styles.input} value={formData.vehicle_type} onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })} /></div>
                        <div className={styles.formGroup}><label className={styles.label}>샤시종류</label><input className={styles.input} value={formData.chassis_type} onChange={(e) => setFormData({ ...formData, chassis_type: e.target.value })} /></div>
                    </div>
                    <div className={styles.formGroup} style={{ marginTop: 20 }}>
                        <label className={styles.label}>📎 추가 서류 (최대 10개)</label>
                        <input type="file" multiple onChange={handleDocUpload} />
                        <div style={{ marginTop: 10 }}>
                            {attachments.map((file, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px' }}>
                                    <span>📎 {file.name}</span>
                                    <span onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))} style={{ color: 'red', cursor: 'pointer' }}>✕</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className={styles.actions} style={{ marginTop: 20 }}><button type="submit" className={styles.btnPrimary} disabled={submitting}>저장하기</button></div>
                </form>
            </div>
        </div>
    );
}
