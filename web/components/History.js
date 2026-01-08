'use client';
import styles from './History.module.css';
import { motion } from 'framer-motion';

const historyData = [
    {
        year: '2020-2023',
        event: '안정적 성장 및 사업 다각화',
        detail: 'ISO 45001:2018 취득, 포레시아 코리아 수소탱크 운송계약 및 영천배기/시트 도급계약'
    },
    {
        year: '2017-2019',
        event: '품질 관리 강화 및 영역 확장',
        detail: '현대/기아자동차 수출컨테이너 운송계약, ISO 9001:2015 취득, (주)서영 서산 CKD포장 용역 계약'
    },
    {
        year: '2016',
        event: '인프라 구축 및 거점 확보',
        detail: '심원개발 및 현대제철 운송계약, 중부 ICD DEPOT 개설'
    },
    {
        year: '2015',
        event: '주요 화주사 협력 확대',
        detail: '현대글로비스 운송계약 및 아산 CY 운영, 현대모비스 모듈파트 운송계약'
    },
    {
        year: '2013',
        event: '주식회사 이엘에스솔루션 설립',
        detail: '법인 설립, 포레시아 시팅코리아 및 배기컨트롤(유) 운송계약'
    },
];

export default function History() {
    return (
        <section id="history" className="section">
            <div className="container">
                <h2 className="sectionTitle">연혁</h2>
                <div className={styles.timeline}>
                    <div className={styles.line} />
                    {historyData.map((item, index) => (
                        <motion.div
                            key={index}
                            className={styles.item}
                            initial={{ opacity: 0, x: index % 2 === 0 ? -30 : 30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.8, delay: index * 0.1 }}
                        >
                            <div className={styles.dot} />
                            <div className={index % 2 === 0 ? styles.leftSide : styles.rightSide}>
                                <div className={styles.card}>
                                    <span className={styles.year}>{item.year}</span>
                                    <h3>{item.event}</h3>
                                    <p>{item.detail}</p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
