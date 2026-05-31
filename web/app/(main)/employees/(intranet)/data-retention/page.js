import styles from './dataRetention.module.css';

export const metadata = {
    title: '데이터 보존정책 | ELS 인트라넷',
};

const retentionRows = [
    {
        anchor: 'dispatch',
        name: '일일배차 / 상세배차내역',
        hot: '1년 1개월',
        archive: '월별 압축 보관 + manifest',
        note: '운영 화면 검색은 hot 기간만 기본 조회합니다. 초과분은 보존목록에서 확인 후 복원합니다.',
    },
    {
        name: '월간실적',
        hot: '1년 3개월',
        archive: '원본 Excel + 월별 적재 이력',
        note: '1년치가 정리되면 연간실적으로 올리고, 오래된 월간 raw는 검증 후 정리합니다.',
    },
    {
        name: '연간실적',
        hot: '2026년 이후 연도별 fix 원장',
        archive: '원본 Excel + 이전 스냅샷 압축 보관',
        note: '전체 스냅샷을 반복 누적하지 않고 변경·추가·삭제분만 반영합니다.',
    },
    {
        name: '차량 GPS / 운행기록',
        hot: 'raw 90일 기본, 필요 시 1년 1개월',
        archive: '일별 GPS 압축본 + 운행 요약',
        note: '웹·앱에서 생성된 원본이므로 Excel 백업만으로 대체하지 않습니다.',
    },
    {
        name: '활동로그 / 감사성 이력',
        hot: '180일 기준',
        archive: '월별 JSONL gzip',
        note: '책임 추적에 필요한 의미 이력만 남기고 자동 refresh성 로그는 저장하지 않습니다.',
    },
];

const archiveSteps = [
    '대상 기간을 월 단위로 묶어 NAS에 jsonl.gz 또는 csv.gz로 저장합니다.',
    'manifest에 테이블명, 기간, 행 수, 파일 크기, SHA-256, NAS 경로를 기록합니다.',
    '샘플 복원으로 행 수와 기간을 검증한 뒤 hot DB에서 정리합니다.',
    '복원 요청 시 staging 영역에 먼저 적재하고 검증 후 조회 또는 운영 승격합니다.',
];

export default function DataRetentionPage() {
    return (
        <main className={styles.page}>
            <section className={styles.hero}>
                <div>
                    <p className={styles.kicker}>데이터 운영 기준</p>
                    <h1>데이터 보존정책</h1>
                    <p>
                        운영 검색은 Supabase hot DB 기준으로 빠르게 유지하고, 장기 보존 자료는 NAS archive와
                        manifest로 관리합니다. 보존 자료는 일반 검색 결과에 자동으로 섞이지 않으며, 필요할 때
                        보존목록에서 찾고 복원해서 확인합니다.
                    </p>
                </div>
                <div className={styles.summaryBox}>
                    <span>기준일</span>
                    <strong>2026-05-31</strong>
                    <span>현재 DB</span>
                    <strong>약 955MB</strong>
                </div>
            </section>

            <nav className={styles.anchorNav} aria-label="데이터 보존정책 바로가기">
                <a href="#dispatch">일일배차</a>
                <a href="#performance">실적</a>
                <a href="#vehicle">GPS</a>
                <a href="#restore">복원</a>
            </nav>

            <section className={styles.section} id="overview">
                <div className={styles.sectionHead}>
                    <p className={styles.kicker}>Search Scope</p>
                    <h2>검색과 보존은 분리합니다</h2>
                </div>
                <div className={styles.noticeGrid}>
                    <article>
                        <h3>기본 검색</h3>
                        <p>업무 화면 검색은 hot 기간 안의 운영 DB만 조회합니다. 배차상세내역은 1년 1개월을 기본 검색 범위로 둡니다.</p>
                    </article>
                    <article>
                        <h3>보존 검색</h3>
                        <p>hot 기간을 넘긴 자료는 보존목록에서 기간·업무키·테이블 기준으로 존재 여부를 찾습니다.</p>
                    </article>
                    <article>
                        <h3>복원 조회</h3>
                        <p>복원이 필요하면 staging에 적재하고 검증한 뒤 임시 조회 또는 운영 테이블 승격을 선택합니다.</p>
                    </article>
                </div>
            </section>

            <section className={styles.section}>
                <div className={styles.sectionHead}>
                    <p className={styles.kicker}>Retention Matrix</p>
                    <h2>대상별 보존 기준</h2>
                </div>
                <div className={styles.tableWrap}>
                    <table className={styles.policyTable}>
                        <thead>
                            <tr>
                                <th>대상</th>
                                <th>Hot DB 보관</th>
                                <th>Archive</th>
                                <th>운영 기준</th>
                            </tr>
                        </thead>
                        <tbody>
                            {retentionRows.map((row) => (
                                <tr key={row.name} id={row.anchor}>
                                    <td>{row.name}</td>
                                    <td>{row.hot}</td>
                                    <td>{row.archive}</td>
                                    <td>{row.note}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className={styles.section} id="performance">
                <div className={styles.sectionHead}>
                    <p className={styles.kicker}>Performance Data</p>
                    <h2>실적 데이터 운영</h2>
                </div>
                <div className={styles.twoColumn}>
                    <article className={styles.panel}>
                        <h3>월간실적</h3>
                        <p>
                            월간실적은 1년 3개월까지 hot DB에 둡니다. 1년치 마감이 정리되면 연간실적으로 올리고,
                            오래된 월간 raw는 archive 검증 뒤 정리합니다.
                        </p>
                    </article>
                    <article className={styles.panel}>
                        <h3>연간실적</h3>
                        <p>
                            연간실적은 fix 데이터로 보고 2026년 자료부터 연도별로 추적합니다. 파일 동기화는 DB 적재가
                            목적이므로 변경된 행만 upsert하고, 이전 스냅샷 찌꺼기는 archive 후 prune합니다.
                        </p>
                    </article>
                </div>
            </section>

            <section className={styles.section} id="vehicle">
                <div className={styles.sectionHead}>
                    <p className={styles.kicker}>Web Generated Data</p>
                    <h2>웹에서 생성된 데이터 백업</h2>
                </div>
                <p className={styles.bodyText}>
                    배차확정, 상세배차 수정, 배차변동, 차량 GPS, 사진·운행로그는 Excel 원본만으로 복원할 수 없습니다.
                    이 데이터는 DB에서 생성된 원본으로 보고, NAS 압축 보관본과 manifest를 함께 남깁니다.
                </p>
            </section>

            <section className={styles.section} id="restore">
                <div className={styles.sectionHead}>
                    <p className={styles.kicker}>Archive & Restore</p>
                    <h2>보관과 복원 절차</h2>
                </div>
                <ol className={styles.stepList}>
                    {archiveSteps.map((step) => (
                        <li key={step}>{step}</li>
                    ))}
                </ol>
            </section>
        </main>
    );
}
