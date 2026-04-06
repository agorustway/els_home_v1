'use client';


import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../../intranet.module.css';

export default function PartnerContactsEditPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const params = useParams();

    const [formData, setFormData] = useState({
        company_name: '',
        ceo_name: '',
        phone: '',
        address: '',
        manager_name: '',
        manager_phone: '',
        memo: ''
    });
    const [attachments, setAttachments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/partner-contacts/' + params.id + '/edit');
    }, [role, authLoading, router, params.id]);

    useEffect(() => {
        if (role && params.id) {
            fetch('/api/partner-contacts/' + params.id)
                .then(res => res.json())
                .then(data => {
                    if (data.item) {
                        const { company_name, ceo_name, phone, address, manager_name, manager_phone, memo, attachments } = data.item;
                        setFormData({ company_name, ceo_name, phone, address, manager_name, manager_phone, memo });
                        setAttachments(attachments || []);
                    }
                })
                .finally(() => setLoading(false));
        }
    }, [role, params.id]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        setUploading(true);
        for (const file of files) {
            const key = `partners/${Date.now()}_${file.name}`;
            try {
                const fd = new FormData();
                fd.append('file', file);
                fd.append('key', key);
                const res = await fetch('/api/s3/files', { method: 'POST', body: fd });
                if (res.ok) {
                    setAttachments(prev => [...prev, {
                        name: file.name,
                        url: `${window.location.origin}/api/s3/files?key=${encodeURIComponent(key)}&name=${encodeURIComponent(file.name)}`,
                        category: '기타'
                    }]);
                }
            } catch (err) { console.error(err); }
        }
        setUploading(false);
    };

    const updateFileCategory = (idx, cat) => {
        setAttachments(prev => prev.map((f, i) => i === idx ? { ...f, category: cat } : f));
    };

    const removeAttachment = (idx) => setAttachments(prev => prev.filter((_, i) => i !== idx));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const res = await fetch('/api/partner-contacts/' + params.id, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, attachments }),
            });
            if (res.ok) router.push('/employees/partner-contacts/' + params.id);
            else alert('저장 실패');
        } finally { setSubmitting(false); }
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>협력사정보 · 수정</h1>
                <Link href={`/employees/partner-contacts/${params.id}`} className={styles.btnSecondary}>취소</Link>
            </div>
            <div className={styles.card}>
                <form onSubmit={handleSubmit}>
                    <div className={styles.gridContainer} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div className={styles.formGroup}><label className={styles.label}>회사명 *</label><input name="company_name" className={styles.input} value={formData.company_name} onChange={handleInputChange} required /></div>
                        <div className={styles.formGroup}><label className={styles.label}>대표자</label><input name="ceo_name" className={styles.input} value={formData.ceo_name} onChange={handleInputChange} /></div>
                        <div className={styles.formGroup}><label className={styles.label}>회사 전화번호</label><input name="phone" className={styles.input} value={formData.phone} onChange={handleInputChange} /></div>
                        <div className={styles.formGroup}><label className={styles.label}>주소</label><input name="address" className={styles.input} value={formData.address} onChange={handleInputChange} /></div>
                        <div className={styles.formGroup}><label className={styles.label}>담당자명</label><input name="manager_name" className={styles.input} value={formData.manager_name} onChange={handleInputChange} /></div>
                        <div className={styles.formGroup}><label className={styles.label}>담당자 연락처</label><input name="manager_phone" className={styles.input} value={formData.manager_phone} onChange={handleInputChange} /></div>
                    </div>
                    <div className={styles.formGroup}><label className={styles.label}>비고</label><textarea name="memo" className={styles.textarea} value={formData.memo} onChange={handleInputChange} style={{ minHeight: 80 }} /></div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>📎 첨부파일</label>
                        <input type="file" multiple onChange={handleFileUpload} />
                        <div className={styles.uploadedList} style={{ marginTop: '10px' }}>
                            {attachments.map((file, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0' }}>
                                    <span style={{ flex: 1 }}>📎 {file.name}</span>
                                    <select value={file.category} onChange={(e) => updateFileCategory(idx, e.target.value)} style={{ padding: '2px 5px', borderRadius: '4px' }}>
                                        <option value="기타">기타</option>
                                        <option value="계약서">계약서</option>
                                        <option value="보험">보험</option>
                                        <option value="회사소개서">회사소개서</option>
                                    </select>
                                    <span onClick={() => removeAttachment(idx)} style={{ color: '#ef4444', cursor: 'pointer' }}>✕</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className={styles.actions}><button type="submit" className={styles.btnPrimary} disabled={submitting}>{submitting ? '저장 중...' : '저장하기'}</button></div>
                </form>
            </div>
        </div>
    );
}
