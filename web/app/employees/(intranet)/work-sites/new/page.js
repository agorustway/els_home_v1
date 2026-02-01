'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../intranet.module.css';

export default function WorkSitesNewPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [address, setAddress] = useState('');
    const [contact, setContact] = useState('');
    const [workMethod, setWorkMethod] = useState('');
    const [notes, setNotes] = useState('');
    const [managers, setManagers] = useState([{ name: '', phone: '', role: '' }]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/work-sites/new');
    }, [role, authLoading, router]);

    const addManager = () => setManagers([...managers, { name: '', phone: '', role: '' }]);
    const removeManager = (idx) => setManagers(managers.filter((_, i) => i !== idx));
    const updateManager = (idx, field, value) => {
        const next = [...managers];
        next[idx] = { ...next[idx], [field]: value };
        setManagers(next);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!address.trim()) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/work-sites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: address.trim(),
                    contact,
                    work_method: workMethod,
                    notes,
                    attachments: [],
                    managers: managers.filter((m) => m.name && m.name.trim()),
                }),
            });
            if (res.ok) {
                const data = await res.json();
                router.push('/employees/work-sites/' + data.item.id);
            } else {
                alert((await res.json()).error || '저장 실패');
            }
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading || !role) return <div className={styles.loading}>로딩 중...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>작업지확인 · 등록</h1>
                <Link href="/employees/work-sites" className={styles.btnSecondary}>목록</Link>
            </div>
            <div className={styles.card}>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>작업지 주소 *</label>
                        <input className={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="작업지 주소" required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>대표 연락처</label>
                        <input className={styles.input} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="연락처" />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>담당자 (다수)</label>
                        {managers.map((m, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                                <input className={styles.input} value={m.name} onChange={(e) => updateManager(idx, 'name', e.target.value)} placeholder="이름" style={{ flex: 1 }} />
                                <input className={styles.input} value={m.phone} onChange={(e) => updateManager(idx, 'phone', e.target.value)} placeholder="연락처" style={{ flex: 1 }} />
                                <input className={styles.input} value={m.role} onChange={(e) => updateManager(idx, 'role', e.target.value)} placeholder="역할" style={{ width: 80 }} />
                                <button type="button" onClick={() => removeManager(idx)} className={styles.btnDelete} style={{ padding: '6px 12px' }}>삭제</button>
                            </div>
                        ))}
                        <button type="button" onClick={addManager} className={styles.btnSecondary} style={{ marginTop: 8 }}>담당자 추가</button>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>작업방식</label>
                        <input className={styles.input} value={workMethod} onChange={(e) => setWorkMethod(e.target.value)} placeholder="작업방식" />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>참고사항</label>
                        <textarea className={styles.textarea} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="참고사항" style={{ minHeight: 100 }} />
                    </div>
                    <div className={styles.actions}>
                        <button type="submit" className={styles.btnPrimary} disabled={submitting}>{submitting ? '저장 중...' : '저장'}</button>
                        <Link href="/employees/work-sites" className={styles.btnSecondary}>취소</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
