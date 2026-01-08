'use client';
import styles from './ESG.module.css';
import { motion } from 'framer-motion';

export default function ESG() {
    const pillars = [
        {
            category: 'Environmental',
            title: '환경 성과 및 방향',
            performance: [
                '**2023년 온실가스 배출 현황 관리**: 전기 사용량 환산 tCO2eq 2.403, 차량 유류 배출량 20.193 tCO2eq 기록',
                '**녹색구매 실천**: 사업장 내 소모성 자재 구매 시 녹색제품 우선 구매 및 자원 절약 품목 관리 시행'
            ],
            direction: [
                '**탄소중립 및 에너지 효율화**: 단위당 탄소배출량 측정/관리 고도화로 환경 규제 선제적 대응',
                '**녹색 산업 전환(K-GX)**: 친환경 비즈니스 모델 강화 및 저탄소 물류 인프라 지속 투자 전개'
            ]
        },
        {
            category: 'Social',
            title: '사회적 책임',
            performance: [
                '**안전보건 경영**: 전 임직원 교육을 통한 안전 의식 함양 및 최적의 업무 환경 조성',
                '**협력사 상생**: 환경경영활동 공동 홍보 및 수행을 통해 공급망 내 지속가능성 확산'
            ],
            direction: [
                '**인권 및 안전 인증**: 인권 경영 체계 강화 및 외부 인증(ISO 등) 획득 추진으로 신뢰도 제고',
                '**지역사회 기여**: 물류 네트워크 활용 사회 공헌 확대 및 다양성/포용성 조직 문화 정착'
            ]
        },
        {
            category: 'Governance',
            title: '투명 경영',
            performance: [
                '**법규 및 규정 준수**: 환경안전 관련 법규 철저 준수 및 투명한 경영 보고 체계 유지',
                '**윤리 경영**: 공정거래 가이드라인 및 윤리 규정 바탕의 깨끗한 기업 문화 실천'
            ],
            direction: [
                '**ESG 위원회 운영**: 실질적 ESG 리스크 관리를 위한 위원회 활성화 및 의사결정 투명성 제고',
                '**지속가능성 공시 대응**: 국내외 공시 기준(KSSB 등) 부합 비재무 정보 공개 체계 구축'
            ]
        }
    ];

    const roadmap = [
        { step: '단기', label: 'Foundation', desc: 'ESG 목표 수립 및 환경안전 보건방침 내재화' },
        { step: '중장기', label: 'Expansion', desc: '친환경 투자 확대 및 외부 기관 성과 인증 (CBAM 대응)' },
        { step: '고도화', label: 'Leadership', desc: '데이터 기반 탄소 관리 시스템 완성 및 ESG 핵심 이슈 선도' }
    ];

    const parseBold = (text) => {
        const parts = text.split('**');
        return parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part);
    };

    return (
        <section id="esg" className={styles.esg}>
            <div className="container">
                <div className={styles.header}>
                    <motion.span
                        className={styles.tag}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                    >
                        Sustainability
                    </motion.span>
                    <motion.h2
                        className={styles.title}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        지속가능한 물류의 미래<br />
                        ELS SOLUTION ESG
                    </motion.h2>
                    <motion.p
                        className={styles.description}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        {parseBold("이엘에스솔루션은 **환경, 안전보건을 기업경영의 최우선 과제**로 삼아 지속 가능한 사회 발전에 기여하며, 투명한 거버넌스를 통해 신뢰받는 파트너가 되겠습니다.")}
                    </motion.p>
                </div>

                <div className={styles.pillarGrid}>
                    {pillars.map((p, i) => (
                        <motion.div
                            key={i}
                            className={`${styles.pillarCard} ${styles[`pillar${p.category}`]}`}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                        >
                            <div className={styles.cardBgPattern} />
                            <h3 className={styles.pillarTitle}>
                                <span>{p.category}</span>
                                {p.title}
                            </h3>

                            <div className={styles.contentBlock}>
                                <h4>주요 성과</h4>
                                <div className={styles.pillList}>
                                    {p.performance.map((text, idx) => (
                                        <div key={idx} className={styles.pillItem}>{parseBold(text)}</div>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.contentBlock}>
                                <h4>추진 방향</h4>
                                <div className={styles.pillList}>
                                    {p.direction.map((text, idx) => (
                                        <div key={idx} className={styles.pillItem}>{parseBold(text)}</div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                <div className={styles.roadmapSection}>
                    <h3 className={styles.roadmapTitle}>ESG 추진 로드맵</h3>
                    <div className={styles.roadmapGrid}>
                        {roadmap.map((item, i) => (
                            <motion.div
                                key={i}
                                className={styles.roadmapItem}
                                initial={{ opacity: 0, scale: 0.9 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.2 }}
                            >
                                <div className={styles.stepDot}>{i + 1}</div>
                                <span className={styles.stepLabel}>{item.step} · {item.label}</span>
                                <p className={styles.stepDesc}>{item.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>

                <motion.div
                    className={styles.metaphor}
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                >
                    <span className={styles.metaphorIcon}>🧭</span>
                    <p className={styles.metaphorText}>
                        이엘에스솔루션의 ESG 경영은 정교하게 설계된 <strong>'물류의 나침반'</strong>과 같습니다.<br />
                        환경과 사회라는 올바른 방향을 잃지 않고, 모든 이해관계자와 함께 지속 가능한 미래를 향해 나아가겠습니다.
                    </p>
                    <span className={styles.metaphorHighlight}>Driving a Greener Future</span>
                </motion.div>
            </div>
        </section>
    );
}
