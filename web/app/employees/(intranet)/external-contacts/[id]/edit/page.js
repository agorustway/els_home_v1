'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../../intranet.module.css';

export default function ExternalContactEditPage() {
    const { id } = useParams();
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [companyName, setCompanyName] = useState('');
    const [contactType, setContactType] = useState('고객사');
    const [address, setAddress] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [contactPerson, setContactPerson] = useState('');
    const [memo, setMemo] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/external-contacts/' + id + '/edit');
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role && id) {
            fetch('/api/external-contacts/' + id)
                .then((res) => res.json())
                .then((data) => {
                    if (data.item) {
                        setCompanyName(data.item.company_name);
                        setContactType(data.item.contact_type || '고객사');
                        setAddress(data.item.address ?? '');
                        setPhone(data.item.phone ?? '');
                        setEmail(data.item.email ?? '');
                        setContactPerson(data.item.contact_person ?? '');
                        setMemo(data.item.memo ?? '');
                    }
                })
                .finally(() => setLoading(false));
        }
    }, [role, id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!companyName.trim()) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/external-contacts/' + id, {
                method: 'PATCH',
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
            if (res.ok) router.push('/employees/external-contacts/' + id);
            else alert((await res.json()).error || '수정 실패');
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading || loading || !role) return <div className={styles.loading}>로딩 중...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>외부연락처 · 수정</h1>
                <Link href={'/employees/external-contacts/' + id} className={styles.btnSecondary}>취소</Link>
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
                        <input className={styles.input} value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>담당자</label>
                        <input className={styles.input} value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>주소</label>
                        <input className={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>연락처</label>
                        <input className={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>이메일</label>
                        <input type="email" className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>메모</label>
                        <textarea className={styles.textarea} value={memo} onChange={(e) => setMemo(e.target.value)} style={{ minHeight: 80 }} />
                    </div>
                    <div className={styles.actions}>
                        <button type="submit" className={styles.btnPrimary} disabled={submitting}>{submitting ? '저장 중...' : '저장'}</button>
                        <Link href={'/employees/external-contacts/' + id} className={styles.btnSecondary}>취소</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
