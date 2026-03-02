'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './contact.module.css';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/utils/supabase/client';
import { formatPhoneNumber } from '@/utils/format';
import { useUserProfile } from '@/hooks/useUserProfile';

export default function ContactPage() {
    const { profile, loading: profileLoading } = useUserProfile();
    const [inquiries, setInquiries] = useState([]);
    const [selectedInquiry, setSelectedInquiry] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({ subject: '', message: '' });
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const supabase = createClient();

    const [formData, setFormData] = useState({
        company_name: '',
        phone: '',
        subject: '',
        message: ''
    });
    const [reportContent, setReportContent] = useState('');
    const [inquiryStatus, setInquiryStatus] = useState('idle');
    const [reportStatus, setReportStatus] = useState('idle');

    useEffect(() => {
        if (!profileLoading) {
            if (profile) {
                fetchInquiries(profile.id);
            } else {
                fetchPublicInquiries();
            }
        }
    }, [profile, profileLoading]);

    const fetchPublicInquiries = async () => {
        try {
            const { data, error } = await supabase
                .from('inquiries')
                .select('id, subject, created_at')
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;
            setInquiries(data || []);
        } catch (error) {
            console.error('Error fetching public inquiries:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchInquiries = async (userId) => {
        try {
            const { data, error } = await supabase
                .from('inquiries')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;
            setInquiries(data || []);
        } catch (error) {
            console.error('Error fetching inquiries:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!profile) {
            alert('로그인이 필요합니다.');
            router.push(`/login?next=/contact`);
            return;
        }

        if (!formData.subject.trim() || !formData.message.trim()) return;
        setInquiryStatus('submitting');

        try {
            const { data, error } = await supabase
                .from('inquiries')
                .insert([
                    {
                        user_id: profile.id,
                        user_email: profile.email,
                        user_name: profile.full_name || profile.email.split('@')[0],
                        company_name: formData.company_name,
                        phone: formData.phone,
                        subject: formData.subject,
                        message: formData.message,
                        status: 'pending'
                    }
                ])
                .select()
                .single();

            if (error) throw error;

            // 이메일 발송 (기존 API 활용)
            await fetch('/api/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category: '고객 문의',
                    title: formData.subject,
                    content: formData.message,
                    contact: `${profile.email} / ${formData.phone || 'N/A'}`
                }),
            });

            setInquiries([data, ...inquiries]);
            setFormData({ company_name: '', phone: '', subject: '', message: '' });
            setInquiryStatus('success');
            setTimeout(() => setInquiryStatus('idle'), 5000);
        } catch (error) {
            console.error('Inquiry error:', error);
            setInquiryStatus('error');
            setTimeout(() => setInquiryStatus('idle'), 3000);
        }
    };

    const handleReport = async (e) => {
        e.preventDefault();
        if (!reportContent.trim()) return;
        setReportStatus('submitting');

        try {
            const response = await fetch('/api/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category: '부조리 및 인권 침해 제보',
                    title: '문의하기 페이지 제보',
                    content: reportContent,
                    contact: '홈페이지 익명 제보'
                }),
            });

            const result = await response.json();

            if (response.ok) {
                setReportContent('');
                setReportStatus('success');
                setTimeout(() => setReportStatus('idle'), 3000);
            } else {
                console.error('Report error:', result.error);
                setReportStatus('error');
            }
        } catch (error) {
            console.error('Report error:', error);
            setReportStatus('error');
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    };

    const getStatusBadge = (status) => {
        const badges = {
            pending: { text: '대기중', color: '#94a3b8' },
            in_progress: { text: '처리중', color: '#3b82f6' },
            completed: { text: '완료', color: '#10b981' }
        };
        return badges[status] || badges.pending;
    };

    const handleInquiryClick = (inquiry) => {
        if (!profile) {
            if (confirm('로그인이 필요한 서비스입니다. 로그인 페이지로 이동하시겠습니까?')) {
                router.push(`/login?next=/contact`);
            }
            return;
        }

        setSelectedInquiry(inquiry);
        setEditForm({ subject: inquiry.subject, message: inquiry.message || '' });
        setIsEditing(false);
    };

    const handleUpdate = async () => {
        if (!editForm.subject.trim() || !editForm.message.trim()) {
            alert('제목과 내용을 입력해주세요.');
            return;
        }

        try {
            const { error } = await supabase
                .from('inquiries')
                .update({
                    subject: editForm.subject,
                    message: editForm.message,
                    updated_at: new Date().toISOString()
                })
                .eq('id', selectedInquiry.id)
                .eq('user_id', profile.id);

            if (error) throw error;

            setInquiries(inquiries.map(iq =>
                iq.id === selectedInquiry.id ? { ...iq, ...editForm } : iq
            ));
            setSelectedInquiry(null);
            alert('문의 내용이 수정되었습니다.');
        } catch (error) {
            console.error('Update error:', error);
            alert('수정 중 오류가 발생했습니다.');
        }
    };

    const handleDelete = async () => {
        if (!confirm('정말 삭제하시겠습니까? 삭제된 내역은 복구할 수 없습니다.')) return;

        try {
            const { error } = await supabase
                .from('inquiries')
                .delete()
                .eq('id', selectedInquiry.id)
                .eq('user_id', profile.id);

            if (error) throw error;

            setInquiries(inquiries.filter(iq => iq.id !== selectedInquiry.id));
            setSelectedInquiry(null);
            alert('삭제되었습니다.');
        } catch (error) {
            console.error('Delete error:', error);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    return (
        <div className={styles.contactPage}>
            <div className={styles.mainContent}>
                <header className={styles.compactHeader}>
                    <h1 className={styles.pageTitle}>문의 및 제보</h1>
                    <div className={styles.headerControls}>
                        {profile ? (
                            <button className={`${styles.btn} ${styles.btnPoint}`} onClick={() => window.scrollTo(0, 0)}>새 문의 작성</button>
                        ) : null}
                    </div>
                </header>

                <div className={styles.grid}>
                    {/* Left: Input Form */}
                    <motion.div
                        className={styles.formWrapper}
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                    >
                        <h2 className={styles.formTitle}>문의 내용 작성</h2>
                        {profileLoading ? (
                            <div className={styles.loginRequired}><p>로딩 중...</p></div>
                        ) : !profile ? (
                            <div className={styles.loginRequired}>
                                <p>🔒 문의 작성은 로그인이 필요합니다.</p>
                                <button
                                    className={styles.loginBtn}
                                    onClick={() => router.push('/login?next=/contact')}
                                >
                                    로그인하기
                                </button>
                            </div>
                        ) : (
                            <form className={styles.form} onSubmit={handleSubmit}>
                                <div className={styles.inputGroup}>
                                    <label>회사명 (선택)</label>
                                    <input
                                        type="text"
                                        className={styles.input}
                                        placeholder="회사명을 입력해주세요"
                                        value={formData.company_name}
                                        onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                                    />
                                </div>
                                <div className={styles.inputGroup}>
                                    <label>연락처 (선택)</label>
                                    <input
                                        type="tel"
                                        className={styles.input}
                                        placeholder="010-0000-0000"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: formatPhoneNumber(e.target.value) })}
                                    />
                                </div>
                                <div className={styles.inputGroup}>
                                    <label>제목 *</label>
                                    <input
                                        type="text"
                                        className={styles.input}
                                        placeholder="문의 제목을 입력해주세요"
                                        value={formData.subject}
                                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className={styles.inputGroup}>
                                    <label>문의 내용 *</label>
                                    <textarea
                                        className={styles.textarea}
                                        placeholder="문의사항이나 의견을 자유롭게 남겨주세요."
                                        value={formData.message}
                                        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                        required
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className={styles.submitBtn}
                                    disabled={inquiryStatus === 'submitting'}
                                >
                                    {inquiryStatus === 'submitting' ? '등록 중...' : '등록하기'}
                                </button>
                                {inquiryStatus === 'success' && <p className={styles.successMsg}>문의가 등록되고 관리자에게 메일이 발송되었습니다.</p>}
                                {inquiryStatus === 'error' && <p className={styles.errorMsg}>오류가 발생했습니다. 잠시 후 다시 시도해주세요.</p>}
                            </form>
                        )}
                    </motion.div>

                    {/* Right: Board */}
                    <div className={styles.boardWrapper}>
                        <div className={styles.boardHeader}>
                            <h3 className={styles.boardTitle}>
                                {profile ? '내 문의 내역' : '전체 문의 내역'}
                            </h3>
                            <span className={styles.boardCount}>총 {inquiries.length}건</span>
                        </div>

                        {!profile && !profileLoading && (
                            <div className={styles.publicList}>
                                <p className={styles.publicNotice}>🔒 로그인하면 문의 내용 전체를 확인할 수 있습니다.</p>
                            </div>
                        )}

                        {loading ? (
                            <div className={styles.emptyState}>
                                <p>로딩 중...</p>
                            </div>
                        ) : inquiries.length === 0 ? (
                            <div className={styles.emptyState}>
                                <p>아직 등록된 문의가 없습니다.</p>
                            </div>
                        ) : (
                            <div className={styles.postList}>
                                <AnimatePresence mode="popLayout">
                                    {inquiries.map((inquiry) => {
                                        const badge = profile ? getStatusBadge(inquiry.status) : null;
                                        return (
                                            <motion.div
                                                key={inquiry.id}
                                                className={styles.postCard}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.98 }}
                                                layout
                                                onClick={() => handleInquiryClick(inquiry)}
                                            >
                                                <span className={styles.postDate}>{formatDate(inquiry.created_at)}</span>
                                                <h4 className={styles.postSubject}>{inquiry.subject}</h4>

                                                {badge && (
                                                    <span
                                                        className={styles.statusBadge}
                                                        style={{ backgroundColor: badge.color }}
                                                    >
                                                        {badge.text}
                                                    </span>
                                                )}
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom: Whistleblowing Report Section */}
                <motion.div
                    className={styles.reportContainer}
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 }}
                >
                    <span className={styles.reportBadge}>비공개·익명 보장</span>
                    <h2 className={styles.reportTitle}>부조리 및 인권 침해 제보</h2>
                    <p className={styles.reportDesc}>
                        이엘에스솔루션은 투명한 경영을 지향합니다.<br />
                        작성하신 내용은 익명이 철저히 보장되며, 담당자에게 즉시 메일로 전달됩니다.
                    </p>
                    <form className={styles.reportForm} onSubmit={handleReport}>
                        <textarea
                            className={styles.reportTextarea}
                            placeholder="제보 내용을 상세히 입력해주세요. 제보자의 신원은 절대 노출되지 않습니다."
                            value={reportContent}
                            onChange={(e) => setReportContent(e.target.value)}
                            required
                        />
                        <button
                            type="submit"
                            className={styles.reportSubmit}
                            disabled={reportStatus === 'submitting'}
                        >
                            {reportStatus === 'submitting' ? '제출 중...' : '제보하기'}
                        </button>
                        {reportStatus === 'success' && <p className={styles.reportSuccessMsg}>제보가 안전하게 접수되어 관리자에게 전달되었습니다.</p>}
                        {reportStatus === 'error' && <p className={styles.reportErrorMsg}>제출 중 오류가 발생했습니다. 다시 시도해주세요.</p>}
                    </form>
                </motion.div>
            </div>

            <AnimatePresence>
                {selectedInquiry && (
                    <div className={styles.modalOverlay} onClick={() => setSelectedInquiry(null)}>
                        <motion.div
                            className={styles.modal}
                            onClick={e => e.stopPropagation()}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                        >
                            <div className={styles.modalHeader}>
                                <div>
                                    <div className={styles.modalMeta}>
                                        {formatDate(selectedInquiry.created_at)} · {getStatusBadge(selectedInquiry.status).text}
                                    </div>
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            className={styles.modalInput}
                                            value={editForm.subject}
                                            onChange={e => setEditForm({ ...editForm, subject: e.target.value })}
                                        />
                                    ) : (
                                        <h3 className={styles.modalTitle}>{selectedInquiry.subject}</h3>
                                    )}
                                </div>
                                <button className={styles.closeBtn} onClick={() => setSelectedInquiry(null)}>&times;</button>
                            </div>

                            <div className={styles.modalBody}>
                                {isEditing ? (
                                    <textarea
                                        className={styles.modalTextarea}
                                        value={editForm.message}
                                        onChange={e => setEditForm({ ...editForm, message: e.target.value })}
                                    />
                                ) : (
                                    <div className={styles.modalContent}>{selectedInquiry.message}</div>
                                )}
                            </div>

                            <div className={styles.modalActions}>
                                {isEditing ? (
                                    <>
                                        <button className={`${styles.modalBtn} ${styles.btnSecondary}`} onClick={() => setIsEditing(false)}>취소</button>
                                        <button className={`${styles.modalBtn} ${styles.btnPrimary}`} onClick={handleUpdate}>저장</button>
                                    </>
                                ) : (
                                    <>
                                        {profile && profile.id === selectedInquiry.user_id && (
                                            <button className={`${styles.modalBtn} ${styles.btnDanger}`} onClick={handleDelete}>삭제</button>
                                        )}
                                        {profile && profile.id === selectedInquiry.user_id && (
                                            <button className={`${styles.modalBtn} ${styles.btnPrimary}`} onClick={() => setIsEditing(true)}>수정</button>
                                        )}
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
