import styles from './Footer.module.css';

export default function Footer() {
    return (
        <footer id="contact" className={styles.footer}>
            <div className="container">
                <div className={styles.grid}>
                    <div className={styles.brand}>
                        <div className={styles.logo}>ELS <span className={styles.blue}>SOLUTION</span></div>
                        <p className={styles.desc}>
                            품질, 상생, 윤리, CS경영을 통해 <br />
                            고객의 가치를 최우선으로 생각하는 <br />
                            (주)이엘에스솔루션입니다.
                        </p>
                    </div>

                    <div className={styles.links}>
                        <h4>Major Clients</h4>
                        <ul style={{ listStyle: 'none', padding: 0, fontSize: '0.9rem', lineHeight: '2' }}>
                            <li>현대글로비스</li>
                            <li>현대/기아자동차</li>
                            <li>현대모비스 / 현대제철</li>
                            <li>포레시아 코리아 / 심원개발</li>
                        </ul>
                    </div>

                    <div className={styles.contact}>
                        <h4>Contact Info</h4>
                        <p>서울특별시 서초구 효령로 424 대명빌딩 2F</p>
                        <p className={styles.tel}>Tel. 02-1234-5678</p>
                        <p>섹터: 운수업, 제조업, 서비스업</p>
                    </div>
                </div>

                <div className={styles.bottom}>
                    <p>&copy; {new Date().getFullYear()} ELS Solution. All rights reserved.</p>
                    <div className={styles.legal}>
                        <span>개인정보처리방침</span>
                        <span>이용약관</span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
