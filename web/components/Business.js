'use client';
import Image from 'next/image';
import styles from './Business.module.css';
import { motion } from 'framer-motion';

const services = [
    {
        title: '컨테이너 물류 (CY 운영)',
        subtitle: '① 아산지점, 중부지점',
        desc: '아산 및 중부지점은 현대글로비스, 현대/기아자동차 및 현대스틸의 수출/입 운송을 전담하고 있으며, 2개의 컨테이너 전용 DEPOT와 대고객 서비스에 특화된 우수한 인력, 전담차량 및 우수한 협력사를 다수 보유하고 있습니다.',
        img: '/images/container_logistics.png',
        type: 'container',
        details: {
            title: '중부 ICD',
            location: '세종시 연동면 연청로 745-86',
            advantages: [
                '교통 요충지 : 경부고속도로와 중부내륙고속도로에 인접',
                '중부ICD내 타업체와 복화 물량 SWAP',
                '운영 노하우 축적을 통한 고품질 서비스 제공',
                '서영, 해태제과, 한진PNC등 중부권 주요 화주 운영'
            ],
            specs: [
                { label: '면적', value: '1,000 평' },
                { label: '보유 장비', value: 'R/S(리치스태커) 3기(공용)' },
                { label: '물동량(월)', value: '300 FEU' },
                { label: '보유차량(트랙터)', value: '10대' }
            ]
        }
    },
    {
        title: '철강재 및 일반 물류',
        subtitle: '② 예산지점, 당진지점',
        desc: '예산 및 당진지점은 현대스틸과 심원개발의 코일, 열연, 내연 및 H/S등 주요철강재와 다양한 제품을 안전하게 운송하여 다변화하는 고객 Needs를 충족시키고, 고품질 서비스를 위하여 운영 경쟁력을 강화하고 있습니다.',
        img: '/images/steel_logistics.png',
        type: 'steel',
        branches: [
            {
                name: '예산지점',
                location: '충남 예산군 삽교읍 산단3길 69',
                specs: [
                    { label: '물동량(월)', value: '자동차 가공품 12,000 톤' },
                    { label: '보유차량', value: '25톤 카고 5대 / 14톤 윙바디 21대' },
                    { label: '주요 화주', value: 'MS오토텍, 심원개발 등' },
                    { label: '주요 업무', value: '핫-스탬핑, TWB공법으로 만들어진 자동차 가공부품 운송' }
                ]
            },
            {
                name: '당진지점',
                location: '충남 당진시 송산면 가곡로 21',
                specs: [
                    { label: '물동량(월)', value: '코일류 8,000 톤' },
                    { label: '보유차량', value: '25톤 카고 15대' },
                    { label: '주요 화주', value: '현대제철, 동부제철 등' },
                    { label: '주요 업무', value: '자동차용 냉연, 후판, 철근, 특수강 등 운송' }
                ]
            }
        ]
    },
];

import { useState } from 'react';

export default function Business() {
    const [selectedIdx, setSelectedIdx] = useState(null);

    return (
        <section id="business" className={styles.businessSection}>
            <div className="container">
                <div className={styles.header}>
                    <h2 className="sectionTitle">주요 사업 및 운영 현황</h2>
                    {selectedIdx !== null && (
                        <button className={styles.backBtn} onClick={() => setSelectedIdx(null)}>
                            ← 목록으로 돌아가기
                        </button>
                    )}
                </div>

                {selectedIdx === null ? (
                    /* 요약 카드 목록 */
                    <div className={styles.grid}>
                        {services.map((service, idx) => (
                            <motion.div
                                key={idx}
                                className={styles.card}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: idx * 0.1 }}
                                whileHover={{ y: -10 }}
                                onClick={() => setSelectedIdx(idx)}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className={styles.imageBox}>
                                    <Image
                                        src={service.img}
                                        alt={service.title}
                                        fill
                                        sizes="(max-width: 768px) 100vw, 400px"
                                        className={styles.img}
                                    />
                                    <div className={styles.imgOverlay} />
                                </div>
                                <div className={styles.contentBox}>
                                    <span className={styles.number}>0{idx + 1}</span>
                                    <h3>{service.title}</h3>
                                    <p>{service.desc.substring(0, 60)}...</p>
                                    <span className={styles.more}>자세히 보기 +</span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                ) : (
                    /* 상세 섹션 (스크린샷 반영) */
                    <motion.div
                        className={styles.detailWrapper}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                    >
                        <div className={styles.detailHeader}>
                            <div className={styles.titleGroup}>
                                <h3 className={styles.detailTitle}>{services[selectedIdx].title}</h3>
                                <span className={styles.detailSubtitle}>{services[selectedIdx].subtitle}</span>
                            </div>
                            <p className={styles.detailBody}>{services[selectedIdx].desc}</p>
                        </div>

                        {services[selectedIdx].type === 'container' ? (
                            /* 컨테이너 물류 상세 (Page 10) */
                            <div className={styles.containerDetail}>
                                <div className={styles.centerTitleGroup}>
                                    <div className={styles.centerTag}>{services[selectedIdx].details.title}</div>
                                </div>
                                
                                <div className={styles.imageGallery}>
                                    <div className={styles.galleryItem}>
                                        <Image src="/images/office_intro.png" alt="jungbu" width={400} height={250} className={styles.galleryImg} />
                                    </div>
                                    <div className={styles.galleryItem}>
                                        <Image src="/images/container_logistics.png" alt="container" width={400} height={250} className={styles.galleryImg} />
                                    </div>
                                    <div className={styles.galleryItem}>
                                        <Image src="/images/hero_cy.png" alt="cy" width={400} height={250} className={styles.galleryImg} />
                                    </div>
                                </div>

                                <div className={styles.bottomGrid}>
                                    <div className={styles.advantages}>
                                        <h4>■ 주요 장점</h4>
                                        <ul>
                                            {services[selectedIdx].details.advantages.map((adv, i) => (
                                                <li key={i}>• {adv}</li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className={styles.specTableWrapper}>
                                        <div className={styles.tableHead}>{services[selectedIdx].details.location}</div>
                                        <table className={styles.detailTable}>
                                            <tbody>
                                                {services[selectedIdx].details.specs.map((spec, i) => (
                                                    <tr key={i}>
                                                        <th>{spec.label}</th>
                                                        <td>• {spec.value}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* 철강재 및 일반 물류 상세 (Page 11) */
                            <div className={styles.steelDetail}>
                                <div className={styles.branchGrid}>
                                    {services[selectedIdx].branches.map((br, i) => (
                                        <div key={i} className={styles.branchCard}>
                                            <div className={styles.branchNameTag}>{br.name}</div>
                                            <div className={styles.branchImgBox}>
                                                <Image 
                                                    src={i === 0 ? '/images/steel_logistics.png' : '/images/hero_logistics.png'} 
                                                    alt={br.name} width={500} height={300} className={styles.branchImg} 
                                                />
                                            </div>
                                            <div className={styles.branchTableWrapper}>
                                                <div className={styles.tableHead}>{br.location}</div>
                                                <table className={styles.detailTable}>
                                                    <tbody>
                                                        {br.specs.map((spec, j) => (
                                                            <tr key={j}>
                                                                <th>{spec.label}</th>
                                                                <td>• {spec.value}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </div>
        </section>
    );
}
