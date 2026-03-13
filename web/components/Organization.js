'use client';
import styles from './Organization.module.css';
import { motion } from 'framer-motion';

export default function Organization() {
    return (
        <section id="organization" className={`section ${styles.bg}`}>
            <div className="container">
                <h2 className="sectionTitle">조직 구성</h2>

                <div className={styles.chartContainer}>
                    {/* Level 1: CEO */}
                    <div className={styles.ceoWrapper}>
                        <div className={styles.ceoBox}>
                            <span className={styles.ceoText}>CEO</span>
                        </div>
                    </div>

                    {/* Level 2: Departments & Branches */}
                    <div className={styles.treeGrid}>
                        {/* 물류사업부 */}
                        <div className={styles.column}>
                            <div className={styles.deptBox}>물류사업부</div>
                            <div className={styles.verticalLine}></div>
                            <div className={styles.branchList}>
                                <div className={styles.branchPill}>아산지점</div>
                                <div className={styles.branchPill}>중부지점</div>
                                <div className={styles.branchPill}>예산지점</div>
                                <div className={styles.branchPill}>당진지점</div>
                            </div>
                        </div>

                        {/* 영업지원부 */}
                        <div className={styles.column}>
                            <div className={styles.deptBox}>영업지원부</div>
                            {/* 하위 지점 없으므로 라인 제거 */}
                        </div>

                        {/* 경영지원부 */}
                        <div className={styles.column}>
                            <div className={styles.deptBox}>경영지원부</div>
                            {/* 하위 지점 없으므로 라인 제거 */}
                        </div>
                    </div>

                    {/* Personnel Summary Table (Simplified) */}
                    <div className={styles.summaryTableWrapper}>
                        <div className={styles.unitText}>(단위:명)</div>
                        <table className={styles.summaryTable}>
                            <thead>
                                <tr>
                                    <th className={styles.fixedCol}>총 원</th>
                                    <th className={styles.fixedCol}>경영 지원</th>
                                    <th className={styles.fixedCol}>영업 관리</th>
                                    <th className={styles.fixedCol}>운영 관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>25</td>
                                    <td>4</td>
                                    <td>4</td>
                                    <td>17</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>
    );
}
