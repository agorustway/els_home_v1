'use client';
import styles from './Organization.module.css';
import { motion } from 'framer-motion';

export default function Organization() {
    return (
        <section id="organization" className={`section ${styles.bg}`}>
            <div className="container">
                <h2 className="sectionTitle">조직 구성</h2>

                <div className={styles.chartWrapper}>
                    <div className={styles.tree}>
                        <ul>
                            <li>
                                <motion.div
                                    className={styles.ceoNode}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                >
                                    <span className={styles.nodeLabel}>CEO</span>
                                    <h3 className={styles.nodeTitle}>대표이사</h3>
                                </motion.div>

                                <ul className={styles.level2}>
                                    <li>
                                        <motion.div
                                            className={styles.deptNode}
                                            initial={{ opacity: 0, y: 20 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: 0.1 }}
                                        >
                                            <span className={styles.nodeLabel}>사업부</span>
                                            <h3 className={styles.nodeTitle}>물류사업부</h3>
                                            <div className={styles.subTeams}>
                                                <span>운송팀</span>
                                                <span>CY운영팀</span>
                                                <span>지점관리팀</span>
                                            </div>
                                        </motion.div>
                                    </li>
                                    <li>
                                        <motion.div
                                            className={`${styles.deptNode} ${styles.highlight}`}
                                            initial={{ opacity: 0, y: 20 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: 0.2 }}
                                        >
                                            <span className={styles.nodeLabel}>본부</span>
                                            <h3 className={styles.nodeTitle}>경영기획본부</h3>
                                            <div className={styles.subTeams}>
                                                <span>인사팀</span>
                                                <span>재무회계팀</span>
                                                <span>안전보건팀</span>
                                            </div>
                                        </motion.div>
                                    </li>
                                    <li>
                                        <motion.div
                                            className={styles.deptNode}
                                            initial={{ opacity: 0, y: 20 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: 0.3 }}
                                        >
                                            <span className={styles.nodeLabel}>지원부</span>
                                            <h3 className={styles.nodeTitle}>영업지원부</h3>
                                            <div className={styles.subTeams}>
                                                <span>영업팀</span>
                                                <span>CS팀</span>
                                                <span>정산팀</span>
                                            </div>
                                        </motion.div>
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>
    );
}
