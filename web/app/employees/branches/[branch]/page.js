'use client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SubPageHero from '@/components/SubPageHero';
import EmployeeSidebar from '@/components/EmployeeSidebar';
import styles from '../../employees.module.css'; // Reuse existing styles for consistency
import { motion } from 'framer-motion';

import { use } from 'react';

export default function BranchPage({ params }) {
    const resolvedParams = use(params);
    const branch = resolvedParams.branch;

    const branchName = {
        asan: '아산지점',
        jungbu: '중부지점',
        dangjin: '당진지점',
        yesan: '예산지점'
    }[branch] || '지점';

    return (
        <>
            <Header />
            <SubPageHero
                title="Branch"
                subtitle={`${branchName} 임직원을 위한 전용 인트라넷 공간입니다.`}
                bgImage="/images/hero_cy.png"
            />
            <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
                <EmployeeSidebar />
                <main style={{ flex: 1, padding: '40px' }}>
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
            </div>
            <Footer />
        </>
    );
}
