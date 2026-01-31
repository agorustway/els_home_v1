import Link from 'next/link';
import styles from './install.module.css';

export const metadata = {
    title: '설치 설명서 | ELS 컨테이너 이력조회',
    description: 'ELS 컨테이너 이력조회 Windows(.exe), Android(.apk) 설치 방법',
};

export default function ContainerHistoryInstallPage() {
    const downloadWinUrl = process.env.NEXT_PUBLIC_ELS_DOWNLOAD_WIN || '/downloads/els-container-history-setup.exe';
    const downloadAndroidUrl = process.env.NEXT_PUBLIC_ELS_DOWNLOAD_ANDROID || '/downloads/els-container-history.apk';

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <Link href="/employees/container-history" className={styles.backLink}>← 컨테이너 이력조회</Link>
                <h1 className={styles.title}>설치 프로그램 및 사용 안내</h1>
                <p className={styles.subtitle}>ELS 컨테이너 이력조회 — Windows(.exe), Android(.apk) 다운로드 및 설치·사용 방법</p>
            </div>

            {/* 한 페이지: 설치 프로그램 다운로드 */}
            <section className={styles.downloadSection}>
                <h2 className={styles.sectionTitle}>설치 프로그램 다운로드</h2>
                <p className={styles.downloadDesc}>아래에서 PC 또는 모바일용 설치 파일을 받은 뒤, 아래 설명에 따라 설치·사용하세요.</p>
                <div className={styles.downloadLinks}>
                    <a href={downloadWinUrl} download className={styles.downloadCard} target="_blank" rel="noopener noreferrer">
                        <span className={styles.downloadCardIcon}>🖥️</span>
                        <span className={styles.downloadCardLabel}>Windows 설치 프로그램</span>
                        <span className={styles.downloadCardExt}>.exe</span>
                    </a>
                    <a href={downloadAndroidUrl} download className={styles.downloadCard} target="_blank" rel="noopener noreferrer">
                        <span className={styles.downloadCardIcon}>📱</span>
                        <span className={styles.downloadCardLabel}>Android 앱</span>
                        <span className={styles.downloadCardExt}>.apk</span>
                    </a>
                </div>
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>1. Windows (데스크탑)</h2>
                <h3 className={styles.h3}>다운로드</h3>
                <p>컨테이너 이력조회 페이지의 <strong>다운로드 및 설치</strong> 섹션에서 <strong>Windows 설치 프로그램 (.exe)</strong>를 클릭해 다운로드합니다.</p>
                <p className={styles.linkWrap}>
                    <a href={downloadWinUrl} download className={styles.downloadBtn}>Windows 설치 프로그램 (.exe) 다운로드</a>
                </p>
                <h3 className={styles.h3}>설치 요구사항</h3>
                <ul>
                    <li><strong>Python</strong> (PC에 설치, PATH 등록)</li>
                    <li><strong>Chrome</strong> 브라우저</li>
                </ul>
                <h3 className={styles.h3}>설치 방법</h3>
                <ol>
                    <li>다운로드한 <code>els-container-history-setup.exe</code>(또는 표시된 파일명)를 실행합니다.</li>
                    <li>설치 경로를 선택한 뒤 <strong>다음</strong>으로 진행해 설치를 마칩니다.</li>
                    <li>설치가 끝나면 <strong>ELS 컨테이너 이력조회</strong> 앱을 실행합니다.</li>
                    <li>앱에서 로그인 → 컨테이너 입력/업로드 → 조회·엑셀 다운로드를 사용할 수 있습니다.</li>
                </ol>
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>2. Android (모바일)</h2>
                <h3 className={styles.h3}>다운로드</h3>
                <p>컨테이너 이력조회 페이지의 <strong>다운로드 및 설치</strong> 섹션에서 <strong>Android 앱 (.apk)</strong>를 클릭해 다운로드합니다. 모바일에서 접속했다면 같은 페이지에서 다운로드할 수 있습니다.</p>
                <p className={styles.linkWrap}>
                    <a href={downloadAndroidUrl} download className={styles.downloadBtn}>Android 앱 (.apk) 다운로드</a>
                </p>
                <h3 className={styles.h3}>설치 방법</h3>
                <ol>
                    <li>다운로드한 .apk 파일을 열어 설치합니다.</li>
                    <li><strong>출처를 알 수 없는 앱</strong> 설치 허용이 필요하면, 설정에서 허용 후 다시 설치합니다.</li>
                    <li>설치가 끝나면 <strong>ELS 컨테이너 이력조회</strong> 앱을 실행합니다.</li>
                </ol>
                <h3 className={styles.h3}>사용 방법 (같은 Wi‑Fi 필요)</h3>
                <p>Android 앱은 <strong>데스크탑 앱을 서버로</strong> 사용합니다.</p>
                <ol>
                    <li><strong>PC에서</strong> ELS 컨테이너 이력조회 <strong>데스크탑 앱</strong>을 실행합니다.</li>
                    <li>PC와 Android 기기가 <strong>같은 Wi‑Fi</strong>에 연결되어 있는지 확인합니다.</li>
                    <li>Android 앱을 실행한 뒤, 화면 안내에 따라 <strong>PC의 IP 주소와 포트</strong>(예: 192.168.0.10:2929)를 입력합니다.</li>
                    <li>연결되면 컨테이너 이력조회 화면이 열리며, 데스크탑과 동일하게 조회·다운로드를 사용할 수 있습니다.</li>
                </ol>
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>요약</h2>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>구분</th>
                            <th>다운로드</th>
                            <th>설치 후</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Windows</td>
                            <td>.exe 설치 프로그램</td>
                            <td>PC에서 바로 로그인·조회·다운로드 사용</td>
                        </tr>
                        <tr>
                            <td>Android</td>
                            <td>.apk 앱</td>
                            <td>같은 Wi‑Fi에서 데스크탑 앱 실행 후, 앱에서 PC 주소 입력해 접속</td>
                        </tr>
                    </tbody>
                </table>
                <p className={styles.footer}>exe, apk 파일은 <strong>컨테이너 이력조회</strong> 페이지의 <strong>다운로드 및 설치</strong> 섹션에서 클릭해 받을 수 있습니다.</p>
            </section>

            <p className={styles.backWrap}>
                <Link href="/employees/container-history" className={styles.backLink}>← 컨테이너 이력조회로 돌아가기</Link>
            </p>
        </div>
    );
}
