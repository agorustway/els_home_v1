'use client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SubPageHero from '@/components/SubPageHero';
import IntranetSubNav from '@/components/IntranetSubNav';
import styles from '../../employees.module.css'; // Reuse existing styles for consistency
import { motion } from 'framer-motion';

import { use } from 'react';

export default function BranchPage({ params }) {
    const branch = params.branch;

    const branchName = {
        asan: '아산지점 (CY)',
        jungbu: '중부지점',
        dangjin: '당진지점',
        yesan: '예산지점',
        headquarters: '서울본사'
    }[branch] || '지점';

    return (
        <>
            <Header />
            <SubPageHero
                title="Branch"
                subtitle={`${branchName} 임직원을 위한 전용 인트라넷 공간입니다.`}
                bgImage="/images/hero_cy.png"
            />
            <IntranetSubNav />
            <main style={{ flex: 1, padding: '40px', backgroundColor: '#f8fafc' }}>
                <div className={styles.page}>
                    <div className="container">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{ textAlign: 'center', padding: '60px 0' }}
                        >
                            <span style={{
                                color: 'var(--primary-blue)',
                                fontWeight: 800,
                                fontSize: '0.9rem',
                                letterSpacing: '2px',
                                textTransform: 'uppercase',
                                marginBottom: '20px',
                                display: 'block'
                            }}>Branch Operations</span>
                            <h1 style={{
                                fontSize: 'clamp(2rem, 5vw, 3.5rem)',
                                fontWeight: 800,
                                color: '#1a1a1a',
                                marginBottom: '30px'
                            }}>{branchName} 임직원 공간</h1>
                            <p style={{
                                fontSize: '1.2rem',
                                color: '#666',
                                maxWidth: '600px',
                                margin: '0 auto',
                                lineHeight: 1.6
                            }}>
                                해당 지점 임직원을 위한 전용 공간입니다.<br />
                                현재 페이지 준비 중입니다. 잠시만 기다려 주세요.
                            </p>

                            {branch === 'asan' && (
                                <div style={{
                                    marginTop: '60px',
                                    padding: '40px',
                                    backgroundColor: '#fff',
                                    borderRadius: '20px',
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
                                    border: '1px solid #eee'
                                }}>
                                    <h3 style={{ marginBottom: '20px', color: 'var(--primary-blue)' }}>🍱 아산지점 오늘의 식단게임</h3>
                                    <div style={{ 
                                        height: '300px', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        backgroundColor: '#f1f5f9',
                                        borderRadius: '12px'
                                    }}>
                                        {/* 식단게임 컴포넌트가 들어갈 자리 */}
                                        <p style={{ color: '#64748b' }}>식단게임 모듈 로딩 중...</p>
                                    </div>
                                </div>
                            )}

                            <div style={{
                                marginTop: '50px',
                                width: '60px',
                                height: '2px',
                                background: 'var(--primary-blue)',
                                margin: '50px auto'
                            }} />
                        </motion.div>
                    </div>
                </div>
            </main>
            <Footer />
        </>
    );
}
