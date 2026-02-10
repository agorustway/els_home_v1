'use client';

import styles from '../../employees.module.css';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import AsanLunchMenu from '@/components/AsanLunchMenu';

export default function BranchPage({ params }) {
    const routeParams = useParams();
    const branch = routeParams?.branch || params?.branch;

    const branchName = {
        asan: '아산지점',
        jungbu: '중부지점',
        dangjin: '당진지점',
        yesan: '예산지점',
        headquarters: '서울본사'
    }[branch] || '지점';

    return (
        <div className={styles.branchMain}>
            <div className={styles.page}>
                <div className="container">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={styles.branchContent}
                    >
                        <span className={styles.branchTag}>Branch Operations</span>
                        <h1 className={styles.branchTitle}>{branchName} 임직원 공간</h1>
                        <p className={styles.branchDesc}>해당 지점 임직원을 위한 전용 공간입니다.<br />현재 페이지 준비 중입니다. 잠시만 기다려 주세요.</p>

                        {branch === 'asan' && (
                            <div style={{ marginBottom: '60px' }}>
                                <AsanLunchMenu />
                            </div>
                        )}
                        <div className={styles.branchDivider} />
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
