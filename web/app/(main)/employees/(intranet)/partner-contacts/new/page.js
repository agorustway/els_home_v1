'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import { normalizeKoreanPhoneNumberInput } from '@/utils/koreanPhoneNumber.mjs';
import styles from '../../intranet.module.css';

const PHONE_FIELDS = new Set(['phone', 'manager_phone']);

export default function PartnerContactsNewPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();

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
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/partner-contacts/new');
    }, [role, authLoading, router]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: PHONE_FIELDS.has(name) ? normalizeKoreanPhoneNumberInput(value) : value }));
    };

    const handleFileUpload = async (e) => {
        const files = e.target.files ? Array.from(e.target.files) : (e.dataTransfer ? Array.from(e.dataTransfer.files) : []);
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
                    const newFile = {
                        name: file.name,
                        url: `${window.location.origin}/api/s3/files?key=${encodeURIComponent(key)}&name=${encodeURIComponent(file.name)}`,
                        category: '기타' // 기본값
                    };
                    setAttachments(prev => [...prev, newFile]);
                }
            } catch (err) {
                console.error(err);
                alert(`업로드 실패: ${file.name}`);
            }
        }
        setUploading(false);
    };

    const updateFileCategory = (idx, cat) => {
        setAttachments(prev => prev.map((f, i) => i === idx ? { ...f, category: cat } : f));
    };

    const removeAttachment = (idx) => {
        setAttachments(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.company_name.trim()) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/partner-contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, attachments }),
            });
            if (res.ok) {
                const data = await res.json();
                router.push('/employees/partner-contacts/' + data.item.id);
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
                <h1 className={styles.title}>협력사정보 · 등록</h1>
                <Link href="/employees/partner-contacts" className={styles.btnSecondary}>목록</Link>
            </div>
            <div className={styles.card}>
                <form onSubmit={handleSubmit}>
                    <div className={styles.gridContainer} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>회사명 *</label>
                            <input name="company_name" className={styles.input} value={formData.company_name} onChange={handleInputChange} placeholder="회사명" required />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>대표자</label>
                            <input name="ceo_name" className={styles.input} value={formData.ceo_name} onChange={handleInputChange} placeholder="대표자 성함" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>회사 전화번호</label>
                            <input name="phone" className={styles.input} value={formData.phone} onChange={handleInputChange} placeholder="0212345678" inputMode="tel" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>소재지 (주소)</label>
                            <input name="address" className={styles.input} value={formData.address} onChange={handleInputChange} placeholder="회사 주소" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>담당자명</label>
                            <input name="manager_name" className={styles.input} value={formData.manager_name} onChange={handleInputChange} placeholder="담당자 성함" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>담당자 연락처</label>
                            <input name="manager_phone" className={styles.input} value={formData.manager_phone} onChange={handleInputChange} placeholder="01012345678" inputMode="tel" />
                        </div>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>비고 (메모)</label>
                        <textarea name="memo" className={styles.textarea} value={formData.memo} onChange={handleInputChange} placeholder="협력사 관련 특이사항 기술" style={{ minHeight: 80 }} />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>첨부파일 (계약서, 보험, 회사소개서 등)</label>
                        <div
                            className={`${styles.uploadZone} ${isDragging ? styles.dragging : ''}`}
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e); }}
                        >
                            <input type="file" id="fileUpload" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
                            <label htmlFor="fileUpload" className={styles.uploadLabel}>
                                <b>관리 서류 선택</b>하거나 여기로 드래그하세요
                            </label>

                            {uploading && <div className={styles.uploadProgress}><div className={styles.progressBar} style={{ width: '50%' }}></div></div>}

                            {attachments.length > 0 && (
                                <div className={styles.uploadedList} style={{ marginTop: '15px' }}>
                                    {attachments.map((file, idx) => (
                                        <div key={idx} className={styles.uploadedFile} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderBottom: '1px solid #eee' }}>
                                            <span style={{ fontSize: '0.9rem', flex: 1 }}>{file.name}</span>
                                            <select
                                                value={file.category}
                                                onChange={(e) => updateFileCategory(idx, e.target.value)}
                                                style={{ padding: '4px', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                            >
                                                <option value="기타">기타</option>
                                                <option value="계약서">계약서</option>
                                                <option value="보험">보험</option>
                                                <option value="회사소개서">회사소개서</option>
                                                <option value="사업자등록증">사업자등록증</option>
                                            </select>
                                            <span className={styles.removeFile} onClick={() => removeAttachment(idx)} style={{ cursor: 'pointer', color: '#ef4444' }}>✕</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={styles.actions}>
                        <button type="submit" className={styles.btnPrimary} disabled={submitting}>{submitting ? '저장 중...' : '저장'}</button>
                        <Link href="/employees/partner-contacts" className={styles.btnSecondary}>취소</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
