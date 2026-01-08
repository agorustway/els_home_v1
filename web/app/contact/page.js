'use client';
import { useState } from 'react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import SubPageHero from '../../components/SubPageHero';
import styles from './contact.module.css';
import { motion, AnimatePresence } from 'framer-motion';

export default function ContactPage() {
    const [posts, setPosts] = useState([
        { id: 1, author: '익명1', content: '운송 견적 문의드립니다. 아산에서 서울까지 컨테이너 2대 분량입니다.', date: '2026-01-08' },
        { id: 2, author: '익명2', content: '홈페이지 디자인이 깔끔하고 좋네요. 응원합니다!', date: '2026-01-07' },
        { id: 3, author: '익명3', content: '조직도에서 영업팀 연락처가 안보이는데 어디서 확인 가능한가요?', date: '2026-01-05' },
    ]);

    const [newContent, setNewContent] = useState('');
    const [reportContent, setReportContent] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!newContent.trim()) return;

        const newPost = {
            id: Date.now(),
            author: `익명${posts.length + 1}`,
            content: newContent,
            date: new Date().toISOString().split('T')[0]
        };

        setPosts([newPost, ...posts]);
        setNewContent('');
    };

    const handleReport = (e) => {
        e.preventDefault();
        if (!reportContent.trim()) return;

        // 차후 EMAIL 발송 로직이 들어갈 자리
        alert('익명 제보가 접수되었습니다. 담당 관리자에게 즉시 이메일로 전달됩니다.');
        setReportContent('');
    };

    return (
        <div className={styles.contactPage}>
            <Header />
            <SubPageHero
                title="문의하기"
                subtitle="이엘에스솔루션에 궁금하신 점을 남겨주세요"
                bgImage="/images/hero_logistics.png"
            />

            <section className={styles.section}>
                <div className="container">
                    <div className={styles.grid}>
                        {/* Left: Input Form */}
                        <motion.div
                            className={styles.formWrapper}
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <h2 className={styles.formTitle}>문의 내용 작성</h2>
                            <form className={styles.form} onSubmit={handleSubmit}>
                                <div className={styles.inputGroup}>
                                    <label>문의 내용</label>
                                    <textarea
                                        className={styles.textarea}
                                        placeholder="문의사항이나 의견을 자유롭게 남겨주세요. (익명)"
                                        value={newContent}
                                        onChange={(e) => setNewContent(e.target.value)}
                                        required
                                    />
                                </div>
                                <button type="submit" className={styles.submitBtn}>등록하기</button>
                            </form>
                        </motion.div>

                        {/* Right: Board */}
                        <div className={styles.boardWrapper}>
                            <div className={styles.boardHeader}>
                                <h3 className={styles.boardTitle}>최근 문의 내역</h3>
                                <span className={styles.boardCount}>총 {posts.length}건</span>
                            </div>

                            <div className={styles.postList}>
                                <AnimatePresence mode="popLayout">
                                    {posts.map((post) => (
                                        <motion.div
                                            key={post.id}
                                            className={styles.postCard}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            layout
                                        >
                                            <div className={styles.postThumb}>
                                                <span className={styles.postAuthor}>{post.author}</span>
                                                <span className={styles.postDate}>{post.date}</span>
                                            </div>
                                            <p className={styles.postContent}>{post.content}</p>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
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
                            <button type="submit" className={styles.reportSubmit}>제보하기</button>
                        </form>
                    </motion.div>
                </div>
            </section>

            <Footer />
        </div>
    );
}
