'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import { CARGO_TYPES, CONTRACT_TYPE_OPTIONS, GENERAL_BODY_TYPES, GENERAL_PAYLOADS, GENERAL_VEHICLE_TYPES, MAP_VISIBILITY_OPTIONS } from '@/utils/vehicleCargoOptions.mjs';
import styles from '../../intranet.module.css';

export default function DriverContactsNewPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();

    const BRANCHES = ['아산지점', '중부지점', '예산지점', '당진지점', '부산지점', '상암지점'];

    const formatPhone = (val) => {
        const num = val.replace(/[^0-9]/g, '');
        if (num.length <= 3) return num;
        if (num.length <= 7) return `${num.slice(0, 3)}-${num.slice(3)}`;
        return `${num.slice(0, 3)}-${num.slice(3, 7)}-${num.slice(7, 11)}`;
    };

    const [formData, setFormData] = useState({
        branch: '', name: '', phone: '', vehicle_type: '', chassis_type: '', photo_url: '',
        contract_type: 'uncontracted', partner_company: '', vehicle_number: '', vehicle_id: '',
        cargo_type: 'container', map_visibility: 'own',
        general_vehicle_type: '트럭', general_payload: '5ton', general_body_type: '일반',
    });
    const [attachments, setAttachments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/driver-contacts/new');
    }, [role, authLoading, router]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        if (name === 'phone') {
            setFormData(prev => ({ ...prev, [name]: formatPhone(value) }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
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
                body: JSON.stringify({ 
                    ...formData, 
                    phone: formData.phone.replace(/[^0-9]/g, ''), 
                    additional_docs: attachments 
                }),
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 30 }}>
                        <div style={{ width: 100, height: 100, borderRadius: '50%', background: '#f8fafc', overflow: 'hidden', border: '2px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {formData.photo_url ? (
                                <img src={formData.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <span style={{ fontSize: '2.5rem' }}>👤</span>
                            )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label className={styles.label} style={{ marginBottom: 0 }}>프로필 사진</label>
                            <input type="file" onChange={handlePhotoUpload} accept="image/*" style={{ fontSize: '0.9rem' }} />
                        </div>
                    </div>

                    <div className={styles.gridContainer} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>이름 *</label>
                            <input name="name" className={styles.input} value={formData.name} onChange={handleInputChange} placeholder="운전원 이름" required />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>계약유형</label>
                            <select name="contract_type" className={styles.input} value={formData.contract_type} onChange={handleInputChange} style={{ height: '42px' }}>
                                {CONTRACT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>업무유형</label>
                            <select name="cargo_type" className={styles.input} value={formData.cargo_type} onChange={handleInputChange} style={{ height: '42px' }}>
                                {CARGO_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>지도 공개범위</label>
                            <select name="map_visibility" className={styles.input} value={formData.map_visibility} onChange={handleInputChange} style={{ height: '42px' }}>
                                {MAP_VISIBILITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        {formData.contract_type === 'partner' && (
                            <div className={styles.formGroup}>
                                <label className={styles.label}>협력사명</label>
                                <input name="partner_company" className={styles.input} value={formData.partner_company} onChange={handleInputChange} placeholder="협력사/운송사명" />
                            </div>
                        )}
                        <div className={styles.formGroup}>
                            <label className={styles.label}>연락처</label>
                            <input name="phone" className={styles.input} value={formData.phone} onChange={handleInputChange} placeholder="전화번호" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>소속지점</label>
                            <select name="branch" className={styles.input} value={formData.branch} onChange={handleInputChange} style={{ height: '42px' }}>
                                <option value="">지점 선택</option>
                                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>차량번호</label>
                            <input name="vehicle_number" className={styles.input} value={formData.vehicle_number} onChange={handleInputChange} placeholder="충남11바1234" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>차량 아이디</label>
                            <input name="vehicle_id" className={styles.input} value={formData.vehicle_id} onChange={(e) => setFormData(prev => ({ ...prev, vehicle_id: e.target.value.toUpperCase() }))} placeholder={formData.cargo_type === 'general' ? '생략가능' : 'ABCD1234'} maxLength={20} style={{ textTransform: 'uppercase', letterSpacing: '1px' }} />
                        </div>
                        {formData.cargo_type === 'general' ? (
                            <>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>차량종류</label>
                                    <select name="general_vehicle_type" className={styles.input} value={formData.general_vehicle_type} onChange={handleInputChange} style={{ height: '42px' }}>
                                        {GENERAL_VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>적재중량</label>
                                    <select name="general_payload" className={styles.input} value={formData.general_payload} onChange={handleInputChange} style={{ height: '42px' }}>
                                        {GENERAL_PAYLOADS.map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>특장구분</label>
                                    <select name="general_body_type" className={styles.input} value={formData.general_body_type} onChange={handleInputChange} style={{ height: '42px' }}>
                                        {GENERAL_BODY_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>차종</label>
                                    <input name="vehicle_type" className={styles.input} value={formData.vehicle_type} onChange={handleInputChange} placeholder="차종 (예: 25톤 트럭)" />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>샤시종류</label>
                                    <input name="chassis_type" className={styles.input} value={formData.chassis_type} onChange={handleInputChange} placeholder="샤시 종류" />
                                </div>
                            </>
                        )}
                    </div>

                    <div className={styles.formGroup} style={{ marginTop: 30 }}>
                        <label className={styles.label}>📎 추가 서류 (최대 10개)</label>
                        <div style={{ border: '1px dashed #cbd5e1', padding: '15px', borderRadius: '8px', background: '#f8fafc' }}>
                            <input type="file" multiple onChange={handleDocUpload} style={{ marginBottom: '10px' }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {attachments.map((file, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
                                        <span>📎 {file.name}</span>
                                        <span onClick={() => removeDoc(idx)} style={{ color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>✕</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className={styles.actions} style={{ marginTop: '30px' }}>
                        <button type="submit" className={styles.btnPrimary} style={{ height: '44px', width: '120px' }} disabled={submitting}>{submitting ? '저장 중...' : '저장하기'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
