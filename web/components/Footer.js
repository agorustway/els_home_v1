import styles from './Footer.module.css';

export default function Footer() {
    return (
        <footer id="contact" className={styles.footer}>
            <div className="container">
                <div className={styles.top}>
                    <div className={styles.brand}>
                        <a href="/" className={styles.logoWrapper}>
                            <img src="/images/logo.png" alt="ELS SOLUTION logo" className={styles.footerLogo} />
                        </a>
                        <p className={styles.desc}>
                            품질, 상생, 윤리, CS경영을 통해 <br />
                            고객의 가치를 최우선으로 생각하는 <br />
                            주식회사 이엘에스솔루션입니다.
                        </p>
                    </div>

                    <div className={styles.infoArea}>
                        <div className={styles.infoCol}>
                            <h4 className={styles.heading}>Major Clients</h4>
                            <ul className={styles.clientList}>
                                <li>현대글로비스</li>
                                <li>현대/기아자동차</li>
                                <li>현대모비스 / 현대제철</li>
                                <li>포레시아 코리아 / 심원개발</li>
                            </ul>
                        </div>

                        <div className={styles.infoCol}>
                            <h4 className={styles.heading}>Contact Info</h4>
                            <div className={styles.contactItems}>
                                <p className={styles.footerAddress}>서울특별시 서초구 효령로 424 대명빌딩 203</p>
                                <p className={styles.tel}>02-522-2401</p>
                                <p className={styles.sector}>운수업, 제조업, 서비스업</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.bottom}>
                    <div className={styles.copyright}>
                        &copy; {new Date().getFullYear()} <strong>ELS SOLUTION</strong> Co., Ltd. All rights reserved.
                    </div>
                    <div className={styles.legal}>
                        <a href="#">개인정보처리방침</a>
                        <span className={styles.divider}>|</span>
                        <a href="#">이용약관</a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
