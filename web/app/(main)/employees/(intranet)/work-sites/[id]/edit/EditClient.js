'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import { normalizeKoreanPhoneNumberInput } from '@/utils/koreanPhoneNumber.mjs';
import styles from '../../../intranet.module.css';

export default function WorkSiteEditPage() {
    const { id } = useParams();
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [siteName, setSiteName] = useState('');
    const [address, setAddress] = useState('');
    const [contact, setContact] = useState('');
    
    // 세부 작업 프로세스 (JSON으로 work_method에 저장)
    const [precautions, setPrecautions] = useState('');
    const [entryProcess, setEntryProcess] = useState('');
    const [receptionProcess, setReceptionProcess] = useState('');
    const [loadingProcess, setLoadingProcess] = useState('');
    const [exitProcess, setExitProcess] = useState('');
    
    const [notes, setNotes] = useState('');
    const [managers, setManagers] = useState([{ name: '', phone: '', role: '' }]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/work-sites/' + id + '/edit');
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role && id) {
            fetch('/api/work-sites/' + id)
                .then((res) => res.json())
                .then((data) => {
                    if (data.item) {
                        setSiteName(data.item.site_name ?? '');
                        setAddress(data.item.address);
                        setContact(normalizeKoreanPhoneNumberInput(data.item.contact ?? ''));
                        
                        let wp = {};
                        try {
                            if (data.item.work_method && data.item.work_method.trim().startsWith('{')) {
                                wp = JSON.parse(data.item.work_method);
                            } else {
                                wp = { precautions: data.item.work_method };
                            }
                        } catch(e) {
                            wp = { precautions: data.item.work_method };
                        }
                        
                        setPrecautions(wp.precautions || '');
                        setEntryProcess(wp.entryProcess || '');
                        setReceptionProcess(wp.receptionProcess || '');
                        setLoadingProcess(wp.loadingProcess || '');
                        setExitProcess(wp.exitProcess || '');
                        
                        setNotes(data.item.notes ?? '');
                        const m = data.item.managers || [];
                        setManagers(m.length ? m.map((x) => ({ name: x.name || '', phone: normalizeKoreanPhoneNumberInput(x.phone || ''), role: x.role || '' })) : [{ name: '', phone: '', role: '' }]);
                    }
                })
                .finally(() => setLoading(false));
        }
    }, [role, id]);

    const addManager = () => setManagers([...managers, { name: '', phone: '', role: '' }]);
    const removeManager = (idx) => setManagers(managers.filter((_, i) => i !== idx));
    const updateManager = (idx, field, value) => {
        const next = [...managers];
        next[idx] = { ...next[idx], [field]: field === 'phone' ? normalizeKoreanPhoneNumberInput(value) : value };
        setManagers(next);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!address.trim()) return;
        setSubmitting(true);
        
        const workMethodObj = {
            precautions,
            entryProcess,
            receptionProcess,
            loadingProcess,
            exitProcess
        };
        
        try {
            const res = await fetch('/api/work-sites/' + id, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    site_name: siteName.trim(),
                    address: address.trim(),
                    contact: normalizeKoreanPhoneNumberInput(contact),
                    work_method: JSON.stringify(workMethodObj),
                    notes,
                    managers: managers.filter((m) => m.name?.trim()).map((m) => ({
                        ...m,
                        phone: normalizeKoreanPhoneNumberInput(m.phone),
                    })),
                }),
            });
            if (res.ok) router.push('/employees/work-sites/' + id);
            else alert((await res.json()).error || '수정 실패');
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading || loading || !role) return <div className={styles.loading}>로딩 중...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>작업지확인 · 수정</h1>
                <Link href={'/employees/work-sites/' + id} className={styles.btnSecondary}>취소</Link>
            </div>
            <div className={styles.card}>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>작업지명 *</label>
                        <input className={styles.input} value={siteName} onChange={(e) => setSiteName(e.target.value)} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>작업지 주소 *</label>
                        <input className={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>대표 연락처</label>
                        <input className={styles.input} value={contact} onChange={(e) => setContact(normalizeKoreanPhoneNumberInput(e.target.value))} inputMode="tel" />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>담당자 (다수)</label>
                        {managers.map((m, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                                <input className={styles.input} value={m.name} onChange={(e) => updateManager(idx, 'name', e.target.value)} placeholder="이름" style={{ flex: 1 }} />
                                <input className={styles.input} value={m.phone} onChange={(e) => updateManager(idx, 'phone', e.target.value)} placeholder="연락처" inputMode="tel" style={{ flex: 1 }} />
                                <input className={styles.input} value={m.role} onChange={(e) => updateManager(idx, 'role', e.target.value)} placeholder="역할" style={{ width: 80 }} />
                                <button type="button" onClick={() => removeManager(idx)} className={styles.btnDelete} style={{ padding: '6px 12px' }}>삭제</button>
                            </div>
                        ))}
                        <button type="button" onClick={addManager} className={styles.btnSecondary} style={{ marginTop: 8 }}>담당자 추가</button>
                    </div>
                    
                    <hr style={{ margin: '24px 0', borderColor: '#e2e8f0' }} />
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', color: '#1e293b' }}>작업 프로세스 및 주의사항</h3>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>주의사항</label>
                        <textarea className={styles.textarea} value={precautions} onChange={(e) => setPrecautions(e.target.value)} style={{ minHeight: 60 }} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>입차</label>
                        <textarea className={styles.textarea} value={entryProcess} onChange={(e) => setEntryProcess(e.target.value)} style={{ minHeight: 60 }} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>접수</label>
                        <textarea className={styles.textarea} value={receptionProcess} onChange={(e) => setReceptionProcess(e.target.value)} style={{ minHeight: 60 }} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>적입</label>
                        <textarea className={styles.textarea} value={loadingProcess} onChange={(e) => setLoadingProcess(e.target.value)} style={{ minHeight: 60 }} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>출차</label>
                        <textarea className={styles.textarea} value={exitProcess} onChange={(e) => setExitProcess(e.target.value)} style={{ minHeight: 60 }} />
                    </div>

                    <hr style={{ margin: '24px 0', borderColor: '#e2e8f0' }} />

                    <div className={styles.formGroup}>
                        <label className={styles.label}>특이사항 (하단)</label>
                        <textarea className={styles.textarea} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 100 }} />
                    </div>
                    
                    <div className={styles.actions}>
                        <button type="submit" className={styles.btnPrimary} disabled={submitting}>{submitting ? '저장 중...' : '저장'}</button>
                        <Link href={'/employees/work-sites/' + id} className={styles.btnSecondary}>취소</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
