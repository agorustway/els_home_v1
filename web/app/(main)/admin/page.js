'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './admin.module.css';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/utils/supabase/client';

export default function AdminPage() {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [inquiries, setInquiries] = useState([]);
    const [selectedInquiry, setSelectedInquiry] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, pending, in_progress, completed
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            router.push('/login?next=/admin');
            return;
        }

        setUser(user);

        // Check if user is admin
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

        setProfile(roleData);
        fetchAllInquiries();
    };

    const fetchAllInquiries = async () => {
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
    };

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
        const date = new Date(dateString);
        return date.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getStatusBadge = (status) => {
        const badges = {
            pending: { text: '대기중', color: '#94a3b8', bg: '#f1f5f9' },
            in_progress: { text: '처리중', color: '#3b82f6', bg: '#eff6ff' },
            completed: { text: '완료', color: '#10b981', bg: '#f0fdf4' }
        };
        return badges[status] || badges.pending;
    };

    const filteredInquiries = filter === 'all'
        ? inquiries
        : inquiries.filter(inq => inq.status === filter);

    const stats = {
        total: inquiries.length,
        pending: inquiries.filter(i => i.status === 'pending').length,
        in_progress: inquiries.filter(i => i.status === 'in_progress').length,
        completed: inquiries.filter(i => i.status === 'completed').length
    };

    if (loading) {
        return (
            <div className={styles.loadingPage}>
                <p>로딩 중...</p>
            </div>
        );
    }

    return (
        <div className={styles.adminPage}>
            <div className={styles.mainContent}>
                <header className={styles.compactHeader}>
                    <h1 className={styles.pageTitle}>고객문의 관리</h1>
                </header>

                <div className={styles.fullWidthContainer}>
                    {/* Stats Cards */}
                    <div className={styles.statsGrid}>
                        <motion.div
                            className={styles.statCard}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            <div className={styles.statIcon} style={{ background: '#eff6ff' }}>📋</div>
                            <div className={styles.statInfo}>
                                <span className={styles.statLabel}>전체 문의</span>
                                <span className={styles.statValue}>{stats.total}</span>
                            </div>
                        </motion.div>

                        <motion.div
                            className={styles.statCard}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            <div className={styles.statIcon} style={{ background: '#fef3c7' }}>⏳</div>
                            <div className={styles.statInfo}>
                                <span className={styles.statLabel}>대기중</span>
                                <span className={styles.statValue} style={{ color: '#94a3b8' }}>{stats.pending}</span>
                            </div>
                        </motion.div>

                        <motion.div
                            className={styles.statCard}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            <div className={styles.statIcon} style={{ background: '#dbeafe' }}>⚙️</div>
                            <div className={styles.statInfo}>
                                <span className={styles.statLabel}>처리중</span>
                                <span className={styles.statValue} style={{ color: '#3b82f6' }}>{stats.in_progress}</span>
                            </div>
                        </motion.div>

                        <motion.div
                            className={styles.statCard}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                        >
                            <div className={styles.statIcon} style={{ background: '#d1fae5' }}>✅</div>
                            <div className={styles.statInfo}>
                                <span className={styles.statLabel}>완료</span>
                                <span className={styles.statValue} style={{ color: '#10b981' }}>{stats.completed}</span>
                            </div>
                        </motion.div>
                    </div>

                    {/* Filter Tabs */}
                    <div className={styles.filterTabs}>
                        <button
                            className={filter === 'all' ? styles.activeTab : ''}
                            onClick={() => setFilter('all')}
                        >
                            전체 ({stats.total})
                        </button>
                        <button
                            className={filter === 'pending' ? styles.activeTab : ''}
                            onClick={() => setFilter('pending')}
                        >
                            대기중 ({stats.pending})
                        </button>
                        <button
                            className={filter === 'in_progress' ? styles.activeTab : ''}
                            onClick={() => setFilter('in_progress')}
                        >
                            처리중 ({stats.in_progress})
                        </button>
                        <button
                            className={filter === 'completed' ? styles.activeTab : ''}
                            onClick={() => setFilter('completed')}
                        >
                            완료 ({stats.completed})
                        </button>
                    </div>

                    {/* Main Content */}
                    <div className={styles.mainGrid}>
                        {/* Inquiry List */}
                        <div className={styles.inquiryList}>
                            <AnimatePresence mode="popLayout">
                                {filteredInquiries.length === 0 ? (
                                    <div className={styles.emptyState}>
                                        <p>해당 상태의 문의가 없습니다.</p>
                                    </div>
                                ) : (
                                    filteredInquiries.map((inquiry) => {
                                        const badge = getStatusBadge(inquiry.status);
                                        return (
                                            <motion.div
                                                key={inquiry.id}
                                                className={`${styles.inquiryCard} ${selectedInquiry?.id === inquiry.id ? styles.selected : ''}`}
                                                onClick={() => setSelectedInquiry(inquiry)}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                layout
                                            >
                                                <div className={styles.inquiryHeader}>
                                                    <span
                                                        className={styles.inquiryStatus}
                                                        style={{
                                                            color: badge.color,
                                                            background: badge.bg
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
                                                    <span>👤 {inquiry.user_name}</span>
                                                    <span>📧 {inquiry.user_email}</span>
                                                </div>
                                            </motion.div>
                                        );
                                    })
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Detail Panel */}
                        <div className={styles.detailPanel}>
                            {!selectedInquiry ? (
                                <div className={styles.emptyDetail}>
                                    <p>문의를 선택하면 상세 내용을 확인할 수 있습니다.</p>
                                </div>
                            ) : (
                                <motion.div
                                    key={selectedInquiry.id}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className={styles.detailContent}
                                >
                                    <div className={styles.detailHeader}>
                                        <h2>{selectedInquiry.subject}</h2>
                                        <button
                                            className={styles.closeBtn}
                                            onClick={() => setSelectedInquiry(null)}
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    <div className={styles.detailInfo}>
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>작성자</span>
                                            <span className={styles.infoValue}>{selectedInquiry.user_name}</span>
                                        </div>
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>이메일</span>
                                            <span className={styles.infoValue}>{selectedInquiry.user_email}</span>
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
                                            <button
                                                className={selectedInquiry.status === 'pending' ? styles.activeStatus : ''}
                                                onClick={() => updateStatus(selectedInquiry.id, 'pending')}
                                            >
                                                대기중
                                            </button>
                                            <button
                                                className={selectedInquiry.status === 'in_progress' ? styles.activeStatus : ''}
                                                onClick={() => updateStatus(selectedInquiry.id, 'in_progress')}
                                            >
                                                처리중
                                            </button>
                                            <button
                                                className={selectedInquiry.status === 'completed' ? styles.activeStatus : ''}
                                                onClick={() => updateStatus(selectedInquiry.id, 'completed')}
                                            >
                                                완료
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
