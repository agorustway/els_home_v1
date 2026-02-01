'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../intranet.module.css';

export default function ExternalContactsNewPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [companyName, setCompanyName] = useState('');
    const [contactType, setContactType] = useState('고객사');
    const [address, setAddress] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [contactPerson, setContactPerson] = useState('');
    const [memo, setMemo] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/external-contacts/new');
    }, [role, authLoading, router]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!companyName.trim()) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/external-contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_name: companyName.trim(),
                    contact_type: contactType,
                    address,
                    phone,
                    email,
                    contact_person: contactPerson,
                    memo,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                router.push('/employees/external-contacts/' + data.item.id);
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
                <h1 className={styles.title}>외부연락처 · 등록</h1>
                <Link href="/employees/external-contacts" className={styles.btnSecondary}>목록</Link>
            </div>
            <div className={styles.card}>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>구분</label>
                        <select className={styles.input} value={contactType} onChange={(e) => setContactType(e.target.value)}>
                            <option value="고객사">고객사</option>
                            <option value="협력사">협력사</option>
                        </select>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>회사/기관명 *</label>
                        <input className={styles.input} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="회사명" required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>담당자</label>
                        <input className={styles.input} value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="담당자명" />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>주소</label>
                        <input className={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="주소" />
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
                        <Link href="/employees/external-contacts" className={styles.btnSecondary}>취소</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
