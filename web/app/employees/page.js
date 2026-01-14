'use client';
import { useState } from 'react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import styles from './employees.module.css';
import { motion } from 'framer-motion';

export default function EmployeesPage() {
    const [formData, setFormData] = useState({
        category: '직장 내 괴롭힘',
        title: '',
        content: '',
        contact: ''
    });
    const [status, setStatus] = useState('idle'); // idle, submitting, success, error

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('submitting');

        try {
            const response = await fetch('/api/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (response.ok) {
                setStatus('success');
                setFormData({
                    category: '직장 내 괴롭힘',
                    title: '',
                    content: '',
                    contact: ''
                });
            } else {
                setStatus('error');
            }
        } catch (error) {
            console.error('Submit error:', error);
            setStatus('error');
        }
    };

    const satisfactionPoints = [
        {
            topic: "건강 및 삶의 질 향상",
            icon: "💆‍♂️",
            description: "임직원의 신체적·정신적 건강을 보호하고 업무와 삶의 균형을 이룰 수 있도록 지원하며, 개개인의 행복을 기업 경영의 근간으로 삼습니다."
        },
        {
            topic: "안전보건 의식 함양",
            icon: "🛡️",
            description: "전 임직원을 대상으로 실효성 있는 정기 교육을 실시하여 안전 의식을 내재화하고 산업 재해를 미연에 방지하는 예방 중심 문화를 구축합니다."
        },
        {
            topic: "쾌적한 작업 환경",
            icon: "🏗️",
            description: "근로자의 재해율을 철저히 모니터링하고 최신 안전 장비와 인프라를 도입하여 사고 없는 청결하고 안전한 사업장을 조성합니다."
        }
    ];

    const procedures = [
        {
            step: "01",
            title: "신고 및 상담",
            content: "피해자 또는 제보자가 인권·윤리 침해 사항에 대해 공식 채널을 통해 신고 및 상담을 신청합니다."
        },
        {
            step: "02",
            title: "접수 및 보고",
            content: "경영지원본부장(인권 담당)에게 해당 내용이 보안이 유지된 상태로 보고되고 공식 접수 절차를 엽니다."
        },
        {
            step: "03",
            title: "조사 및 심의",
            content: "인권·윤리 조사 TF팀을 구성하여 사건을 객관적이고 공정하게 조사하고 안건을 상정하여 심의를 진행합니다."
        },
        {
            step: "04",
            title: "결정 및 통보",
            content: "심의 결과에 의거하여 적절한 조치 사항을 결정하고 신고인에게 최종 처리 결과와 개선 방안을 통보합니다."
        }
    ];

    const roadmapItems = [
        "인권 및 안전 관련 글로벌 수준의 외부 인증 획득 추진",
        "임직원 만족도 조사 정례화를 통한 현장 피드백의 경영 반영 극대화",
        "다양성과 포용성을 존중하는 조직 문화 및 인권 경영 체계 정착"
    ];

    return (
        <>
            <Header />
            <div className={styles.page}>
                <main>
                    {/* 1. Hero / Philosophy */}
                    <section className={styles.hero}>
                        <div className="container">
                            <motion.span
                                className={styles.tag}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                            >
                                Employee Happiness
                            </motion.span>
                            <motion.h1
                                className={styles.title}
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                            >
                                당신의 가치가 곧<br />우리의 경쟁력입니다
                            </motion.h1>
                            <motion.p
                                className={styles.introText}
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                            >
                                이엘에스솔루션은 <strong>임직원의 건강과 삶의 질을 높이는 것</strong>을 기업 경영의 최우선 가치로 생각합니다. 인격적 존중과 안전한 환경 속에서 더 큰 내일을 함께 그립니다.
                            </motion.p>
                            <motion.div
                                className={styles.commitment}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.4 }}
                            >
                                모든 구성원의 인간적 존엄을 지키고, 부당한 권리침해 사실 발생시 철저한 구제와 회복을 약속합니다.
                            </motion.div>
                        </div>
                    </section>

                    {/* 2. Satisfaction Management - Premium Image Redesign */}
                    <section id="satisfaction" className={styles.satisfactionSection}>
                        <div className="container">
                            <h2 className={styles.sectionTitle}>임직원 만족 및 안전보건 방침</h2>
                            <div className={styles.satisfactionList}>
                                {[
                                    {
                                        ...satisfactionPoints[0],
                                        image: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1200&q=80"
                                    },
                                    {
                                        ...satisfactionPoints[1],
                                        image: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80"
                                    },
                                    {
                                        ...satisfactionPoints[2],
                                        image: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80"
                                    }
                                ].map((point, i) => (
                                    <motion.div
                                        key={i}
                                        className={styles.satItem}
                                        initial={{ opacity: 0, y: 50 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ duration: 0.8, delay: i * 0.1 }}
                                    >
                                        <div className={styles.satVisual}>
                                            <img src={point.image} alt={point.topic} className={styles.satImage} />
                                            <div className={styles.satOverlay}>
                                                <h3>{point.topic}</h3>
                                            </div>
                                        </div>
                                        <div className={styles.satContent}>
                                            <h3>{point.topic}</h3>
                                            <p>{point.description}</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* 3. Grievance Procedure - Dark Theme Distinction */}
                    <section id="grievance" className={styles.procedureSection}>
                        <div className="container">
                            <h2 className={styles.sectionTitle}>인권·윤리 침해 및 고충 처리 절차</h2>
                            <div className={styles.procedureContainer}>
                                <p className={styles.procedureDefinition}>
                                    직장 내 괴롭힘, 차별, 지위를 이용한 압력 등<br />
                                    법적으로 보장된 권리 침해 사항에 대한 철저한 구제 체계를 가동합니다.
                                </p>
                                <div className={styles.procedureGrid}>
                                    {procedures.map((item, i) => (
                                        <motion.div
                                            key={i}
                                            className={styles.stepCard}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            whileInView={{ opacity: 1, scale: 1 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: i * 0.1 }}
                                        >
                                            <span className={styles.stepNum}>STEP {item.step}</span>
                                            <h3 className={styles.stepTitle}>{item.title}</h3>
                                            <p className={styles.stepDesc}>{item.content}</p>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 3.5 Report Form Section */}
                    <section id="report" className={styles.reportSection}>
                        <div className="container">
                            <motion.div
                                className={styles.reportContainer}
                                initial={{ opacity: 0, y: 50 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                            >
                                <h2 className={styles.reportTitle}>부조리 및 인권침해 제보</h2>
                                <p className={styles.reportDesc}>접수된 내용은 철저히 보안이 유지되며, 신속하게 검토 후 조치하겠습니다.</p>

                                <form className={styles.reportForm} onSubmit={handleSubmit}>
                                    <div className={styles.formGroup}>
                                        <label htmlFor="category">제보 유형</label>
                                        <select
                                            id="category"
                                            name="category"
                                            required
                                            className={styles.formSelect}
                                            value={formData.category}
                                            onChange={handleChange}
                                        >
                                            <option value="직장 내 괴롭힘">직장 내 괴롭힘</option>
                                            <option value="성희롱/성폭력">성희롱/성폭력</option>
                                            <option value="차별 행위">차별 행위</option>
                                            <option value="부정부패/비리">부정부패/비리</option>
                                            <option value="기타 인권침해">기타 인권침해</option>
                                        </select>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label htmlFor="title">제보 제목</label>
                                        <input
                                            type="text"
                                            id="title"
                                            name="title"
                                            placeholder="제목을 입력해주세요"
                                            required
                                            className={styles.formInput}
                                            value={formData.title}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label htmlFor="content">상세 내용</label>
                                        <textarea
                                            id="content"
                                            name="content"
                                            placeholder="발생 일시, 장소, 대상, 상세 내용 등을 구체적으로 작성해주세요."
                                            required
                                            className={styles.formTextarea}
                                            value={formData.content}
                                            onChange={handleChange}
                                        ></textarea>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label htmlFor="contact">연락처 및 성함 (선택사항 - 미입력 시 익명 접수)</label>
                                        <input
                                            type="text"
                                            id="contact"
                                            name="contact"
                                            placeholder="답변을 받으실 연락처 또는 성함을 입력해주세요."
                                            className={styles.formInput}
                                            value={formData.contact}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        className={styles.submitBtn}
                                        disabled={status === 'submitting'}
                                    >
                                        {status === 'submitting' ? '제출 중...' : '제보하기'}
                                    </button>

                                    {status === 'success' && (
                                        <div className={`${styles.statusMessage} ${styles.success}`}>
                                            제보가 성공적으로 접수되었습니다. 보호와 보안을 최우선으로 검토하겠습니다.
                                        </div>
                                    )}
                                    {status === 'error' && (
                                        <div className={`${styles.statusMessage} ${styles.error}`}>
                                            제출 중 오류가 발생했습니다. 잠시 후 다시 시도해주시거나 관리자에게 문의바랍니다.
                                        </div>
                                    )}
                                </form>
                            </motion.div>
                        </div>
                    </section>

                    {/* 4. Roadmap & Future */}
                    <section className={styles.roadmapSection}>
                        <div className="container">
                            <h2 className={styles.sectionTitle}>지속가능한 일터 조성 계획</h2>
                            <div className={styles.roadmapList}>
                                {roadmapItems.map((item, i) => (
                                    <motion.div
                                        key={i}
                                        className={styles.roadmapItem}
                                        initial={{ opacity: 0, x: -30 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: i * 0.1 }}
                                    >
                                        {item}
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* 5. NAS - Final Separate Section */}
                    <section id="nas" className={styles.nasSection}>
                        <div className="container">
                            <motion.div
                                className={styles.nasBox}
                                initial={{ opacity: 0, scale: 0.95 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                            >
                                <div className={styles.nasInfo}>
                                    <h3>NAS 시스템 접속</h3>
                                    <p>임직원 전용 데이터 센터 및 파일 공유 시스템 (External Server)</p>
                                </div>
                                <a href="https://elssolution.synology.me" target="_blank" rel="noopener noreferrer" className={styles.nasBtn}>
                                    서버 접속하기
                                </a>
                            </motion.div>
                        </div>
                    </section>

                    {/* 6. Closing Metaphor */}
                    <section className={styles.metaphorSection}>
                        <div className="container">
                            <motion.p
                                className={styles.metaphorText}
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                            >
                                "이엘에스솔루션의 고충 처리 시스템은 구성원의 마음을 보듬는 <strong>'안전 로프'</strong>입니다."
                            </motion.p>
                        </div>
                    </section>
                </main>
                <Footer />
            </div>
        </>
    );
}
