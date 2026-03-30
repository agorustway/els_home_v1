'use client';
import Image from 'next/image';
import styles from './Intro.module.css';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export default function Intro() {
    const [isMounted, setIsMounted] = useState(false);

    const [isIos, setIsIos] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        const ua = navigator.userAgent.toLowerCase();
        setIsIos(/iphone|ipad|ipod/.test(ua));
    }, []);

    const handleDriverAppClick = (e) => {
        e.preventDefault();
        const url = window.location.origin + '/driver-app';
        const userAgent = navigator.userAgent.toLowerCase();
        
        // 카카오톡, 네이버 등 인앱 브라우저 체크
        const isInApp = /kakaotalk|naver|line|fbav|instagram/.test(userAgent);
        const isAndroid = /android/.test(userAgent);

        if (isAndroid && isInApp) {
            // 안드로이드 인앱 브라우저에서 크롬 강제 실행
            const intentUrl = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
            window.location.href = intentUrl;
        } else {
            window.location.href = url;
        }
    };

    if (!isMounted) {
        return (
            <section id="intro" className="section">
                <div className="container">
                    <div className={styles.content}>
                        <div className={styles.textColumn}>
                            <h2 className={styles.title}>회사 소개 <span className={styles.blue}>Company Profile</span></h2>
                            <h3 className={styles.tagline} style={{ fontSize: '2.5rem' }}>이엘에스솔루션</h3>
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section id="intro" className="section">
            <div className="container">
                <div className={styles.content}>
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                        className={styles.textColumn}
                    >
                        <h2 className={styles.title}>회사 소개 <span className={styles.blue}>Company Profile</span></h2>
                        <h3 className={styles.tagline}>TRUSTED LOGISTICS<br /><span className={styles.highlight}>PARTNER</span></h3>
                        <div className={styles.description}>
                            <p>
                                2013년 설립된 이엘에스솔루션은 국내 컨테이너 및 카고, <strong>자동차 KD 부품, 철강 내륙 운송</strong> 분야에서
                                풍부한 현장 경험과 노하우를 보유하고 있습니다.
                            </p>
                            <p style={{ marginTop: '15px' }}>
                                수도권 및 중부권을 중심으로 부산, 인천, 평택, 광양 등 주요 항만과 연계된
                                <strong>선적 및 운송 서비스</strong>를 안정적으로 수행하며 고객의 신뢰를 쌓아왔습니다.
                            </p>
                            <p style={{ marginTop: '15px' }}>
                                협력사와의 유기적인 거점(CY) 운영 관리를 통해 화주 공장 인접 지역에서
                                <strong>긴급 상황 시 가장 유연하게 대응</strong>하는 것이 우리의 핵심 경쟁력입니다.
                            </p>
                        </div>

                        {/* 🚛 운전원 앱 다운로드 섹션 */}
                        <div className={styles.appDownloadSection}>
                            <div className={styles.appDownloadTitle}>
                                📱 ELS 차량용 앱 (안드로이드)
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <a href="/apk/els_driver.apk" className={styles.appButton} style={{ flex: 1 }} download>
                                    <div className={styles.appBtnIcon}>
                                        <img src="/favicon.png" alt="" className={styles.appIconImg} />
                                    </div>
                                    <div className={styles.appBtnText}>
                                        <div className={styles.appBtnLabel}>차량용 앱 다운로드 (.APK)</div>
                                        <div className={styles.appBtnDesc}>안드로이드 전용 설치 파일</div>
                                    </div>
                                </a>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        const url = window.location.origin + '/apk/els_driver.apk';
                                        navigator.clipboard.writeText(url).then(() => {
                                            alert('앱 다운로드 링크가 복사되었습니다.\\n메신저에 붙여넣기 하세요!');
                                        });
                                    }}
                                    className={styles.copyButton}
                                    title="주소 복사"
                                >
                                    <span style={{ fontSize: '1.2rem', marginBottom: '2px' }}>🔗</span>
                                    <span style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>주소 복사</span>
                                </button>
                            </div>
                            <div className={styles.appInstallGuide}>
                                <h4>✅ 안드로이드 설치 방법 (APK)</h4>
                                <ul>
                                    <li>1. 위 버튼을 눌러 <strong>[els_driver.apk]</strong> 파일을 다운로드합니다.</li>
                                    <li>2. 완료 후 실행 시 &apos;출처를 알 수 없는 앱&apos; 혹은 &lt;보안 메시지&gt;가 뜨면 <strong>[무시하고 설치]</strong> 또는 <strong>[설정]</strong>을 누릅니다.</li>
                                    <li>3. (배포용 앱 안내) <strong>[더보기]</strong> 또는 <strong>[세부정보 보기]</strong>를 한 번 더 눌러 <strong>&apos;무시하고 설치&apos;</strong>를 완료합니다.</li>
                                    <li>4. 화면 하단의 <strong>[설치]</strong> 버튼을 눌러 완료합니다.</li>
                                </ul>
                                <p style={{marginTop: '10px', fontSize: '0.8rem', opacity: 0.8, color: '#f85149', fontWeight: '800'}}>* 안드로이드 14~16 버전은 Play 프로텍트 경고 시 &apos;무시하고 설치&apos;를 선택해야 합니다.</p>
                                <p style={{marginTop: '10px', fontSize: '0.8rem', opacity: 0.7}}>* 이 앱은 구글 플레이스토어가 아닌 사내 전용 배포 파일로 설치됩니다.</p>
                            </div>
                        </div>
                    </motion.div>

                    <div className={styles.visualColumn}>
                        <motion.div
                            className={styles.infoCard}
                            initial={{ opacity: 0, x: 20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.8 }}
                        >
                            <div className={styles.cardHeader}>
                                <div className={styles.blueBar} />
                                <h4>Business Focus</h4>
                            </div>
                            <div className={styles.focusList}>
                                <div className={styles.focusItem}>
                                    <span className={styles.focusLabel}>핵심 역량</span>
                                    <p>컨테이너 & 철강 내륙 운송 전문</p>
                                </div>
                                <div className={styles.focusItem}>
                                    <span className={styles.focusLabel}>운영 거점</span>
                                    <p>아산, 중부, 예산, 당진 주요 거점</p>
                                </div>
                                <div className={styles.focusItem}>
                                    <span className={styles.focusLabel}>대응 체계</span>
                                    <p>긴급 물동량 실시간 유연 대응</p>
                                </div>
                            </div>
                            <div className={styles.cardFooter}>
                                <img src="/images/logo.png" alt="ELS Logo" className={styles.smallLogo} />
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>
        </section>
    );
}
