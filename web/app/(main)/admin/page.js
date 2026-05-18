'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './admin.module.css';
import { createClient } from '@/utils/supabase/client';

const STATUS_META = {
    pending: { text: '대기중', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
    in_progress: { text: '처리중', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
    completed: { text: '완료', color: '#059669', bg: '#ecfdf5', border: '#bbf7d0' },
};

const FILTERS = [
    { key: 'all', label: '전체' },
    { key: 'pending', label: '대기중' },
    { key: 'in_progress', label: '처리중' },
    { key: 'completed', label: '완료' },
];

export default function AdminPage() {
    const [inquiries, setInquiries] = useState([]);
    const [selectedInquiry, setSelectedInquiry] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const router = useRouter();
    const [supabase] = useState(() => createClient());

    const fetchAllInquiries = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('inquiries')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setInquiries(data || []);
        } catch (error) {
            console.error('Error fetching inquiries:', error);
        } finally {
            setLoading(false);
        }
    }, [supabase]);

    const checkAuth = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            router.push('/login?next=/admin');
            return;
        }

        const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('email', user.email)
            .single();

        if (roleData?.role !== 'admin') {
            alert('관리자 권한이 필요합니다.');
            router.push('/');
            return;
        }

        fetchAllInquiries();
    }, [fetchAllInquiries, router, supabase]);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    const updateStatus = async (inquiryId, newStatus) => {
        try {
            const { error } = await supabase
                .from('inquiries')
                .update({ status: newStatus })
                .eq('id', inquiryId);

            if (error) throw error;

            setInquiries(inquiries.map(inq =>
                inq.id === inquiryId ? { ...inq, status: newStatus } : inq
            ));

            if (selectedInquiry?.id === inquiryId) {
                setSelectedInquiry({ ...selectedInquiry, status: newStatus });
            }
        } catch (error) {
            console.error('Error updating status:', error);
            alert('상태 업데이트 중 오류가 발생했습니다.');
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getStatusBadge = (status) => STATUS_META[status] || STATUS_META.pending;

    const filteredInquiries = filter === 'all'
        ? inquiries
        : inquiries.filter(inq => inq.status === filter);

    const stats = {
        total: inquiries.length,
        pending: inquiries.filter(i => i.status === 'pending').length,
        in_progress: inquiries.filter(i => i.status === 'in_progress').length,
        completed: inquiries.filter(i => i.status === 'completed').length,
    };

    const statCards = [
        { label: '전체 문의', value: stats.total },
        { label: '대기중', value: stats.pending },
        { label: '처리중', value: stats.in_progress },
        { label: '완료', value: stats.completed },
    ];

    if (loading) {
        return (
            <div className={styles.loadingPage}>
                <p>데이터를 불러오는 중입니다...</p>
            </div>
        );
    }

    return (
        <div className={styles.adminPage}>
            <div className={styles.mainContent}>
                <header className={styles.compactHeader}>
                    <h1 className={styles.pageTitle}>고객문의 관리</h1>
                    <span className={styles.headerBadge}>총 {stats.total}건</span>
                </header>

                <div className={styles.fullWidthContainer}>
                    <div className={styles.statsGrid}>
                        {statCards.map((item) => (
                            <div key={item.label} className={styles.statCard}>
                                <span className={styles.statLabel}>{item.label}</span>
                                <span className={styles.statValue}>{item.value}</span>
                            </div>
                        ))}
                    </div>

                    <div className={styles.filterTabs}>
                        {FILTERS.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                className={filter === item.key ? styles.activeTab : ''}
                                onClick={() => setFilter(item.key)}
                            >
                                {item.label} ({stats[item.key] ?? stats.total})
                            </button>
                        ))}
                    </div>

                    <div className={styles.mainGrid}>
                        <div className={styles.inquiryList}>
                            {filteredInquiries.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <p>해당 상태의 문의가 없습니다.</p>
                                </div>
                            ) : (
                                filteredInquiries.map((inquiry) => {
                                    const badge = getStatusBadge(inquiry.status);
                                    return (
                                        <button
                                            key={inquiry.id}
                                            type="button"
                                            className={`${styles.inquiryCard} ${selectedInquiry?.id === inquiry.id ? styles.selected : ''}`}
                                            onClick={() => setSelectedInquiry(inquiry)}
                                        >
                                            <div className={styles.inquiryHeader}>
                                                <span
                                                    className={styles.inquiryStatus}
                                                    style={{
                                                        color: badge.color,
                                                        background: badge.bg,
                                                        borderColor: badge.border,
                                                    }}
                                                >
                                                    {badge.text}
                                                </span>
                                                <span className={styles.inquiryDate}>
                                                    {formatDate(inquiry.created_at)}
                                                </span>
                                            </div>
                                            <h4 className={styles.inquirySubject}>{inquiry.subject}</h4>
                                            <div className={styles.inquiryMeta}>
                                                <span>{inquiry.user_name || '-'}</span>
                                                <span>{inquiry.user_email || '-'}</span>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        <div className={styles.detailPanel}>
                            {!selectedInquiry ? (
                                <div className={styles.emptyDetail}>
                                    <p>문의를 선택하면 상세 내용을 확인할 수 있습니다.</p>
                                </div>
                            ) : (
                                <div className={styles.detailContent}>
                                    <div className={styles.detailHeader}>
                                        <h2>{selectedInquiry.subject}</h2>
                                        <button
                                            type="button"
                                            className={styles.closeBtn}
                                            onClick={() => setSelectedInquiry(null)}
                                        >
                                            닫기
                                        </button>
                                    </div>

                                    <div className={styles.detailInfo}>
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>작성자</span>
                                            <span className={styles.infoValue}>{selectedInquiry.user_name || '-'}</span>
                                        </div>
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>이메일</span>
                                            <span className={styles.infoValue}>{selectedInquiry.user_email || '-'}</span>
                                        </div>
                                        {selectedInquiry.company_name && (
                                            <div className={styles.infoRow}>
                                                <span className={styles.infoLabel}>회사명</span>
                                                <span className={styles.infoValue}>{selectedInquiry.company_name}</span>
                                            </div>
                                        )}
                                        {selectedInquiry.phone && (
                                            <div className={styles.infoRow}>
                                                <span className={styles.infoLabel}>연락처</span>
                                                <span className={styles.infoValue}>{selectedInquiry.phone}</span>
                                            </div>
                                        )}
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>작성일시</span>
                                            <span className={styles.infoValue}>{formatDate(selectedInquiry.created_at)}</span>
                                        </div>
                                    </div>

                                    <div className={styles.detailMessage}>
                                        <h3>문의 내용</h3>
                                        <p>{selectedInquiry.message}</p>
                                    </div>

                                    <div className={styles.statusActions}>
                                        <h3>상태 변경</h3>
                                        <div className={styles.statusButtons}>
                                            {['pending', 'in_progress', 'completed'].map((status) => (
                                                <button
                                                    key={status}
                                                    type="button"
                                                    className={selectedInquiry.status === status ? styles.activeStatus : ''}
                                                    onClick={() => updateStatus(selectedInquiry.id, status)}
                                                >
                                                    {STATUS_META[status].text}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
