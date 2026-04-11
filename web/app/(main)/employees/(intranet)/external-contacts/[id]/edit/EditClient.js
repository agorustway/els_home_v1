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
