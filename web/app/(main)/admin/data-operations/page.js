'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './dataOperations.module.css';

const STATUS_LABELS = {
    critical: '개선 필요',
    watch: '관찰',
    ok: '정상',
};

const ACTION_LABELS = {
    ready: '실행 가능',
    setup_required: '준비 필요',
};

function formatNumber(value) {
    return Number(value || 0).toLocaleString();
}

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function statusClass(status) {
    if (status === 'critical') return styles.statusCritical;
    if (status === 'watch') return styles.statusWatch;
    return styles.statusOk;
}

export default function AdminDataOperationsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState(null);
    const [actionBusy, setActionBusy] = useState('');
    const [actionResult, setActionResult] = useState(null);

    const loadHealth = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/admin/data-operations', { cache: 'no-store' });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || '데이터 운영 상태를 불러오지 못했습니다.');
            setData(json);
        } catch (err) {
            setError(err.message || '데이터 운영 상태를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function bootstrap() {
            try {
                const res = await fetch('/api/admin/users/me', { cache: 'no-store' });
                if (res.status === 401) {
                    router.push(`/login?next=${encodeURIComponent('/admin/data-operations')}`);
                    return;
                }
                const profile = await res.json();
                if (!res.ok || profile?.role !== 'admin') {
                    router.push('/employees/ask');
                    return;
                }
                if (!cancelled) await loadHealth();
            } catch {
                if (!cancelled) {
                    setError('관리자 권한 확인에 실패했습니다.');
                    setLoading(false);
                }
            }
        }

        bootstrap();
        return () => {
            cancelled = true;
        };
    }, [loadHealth, router]);

    const largestTable = useMemo(() => data?.top_tables?.[0] || null, [data]);

    async function runReadiness(action) {
        setActionBusy(action);
        setActionResult(null);
        try {
            const res = await fetch('/api/admin/data-operations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || '준비 상태 점검에 실패했습니다.');
            setActionResult(json.data);
        } catch (err) {
            setActionResult({ action, ready: false, message: err.message || '준비 상태 점검에 실패했습니다.', checks: [] });
        } finally {
            setActionBusy('');
        }
    }

    async function resetMonthlyPerformance() {
        const confirmText = window.prompt('월간자료만 리셋합니다. 연간실적은 변경하지 않습니다. 계속하려면 "월간자료 리셋"을 입력하세요.');
        if (confirmText !== '월간자료 리셋') return;

        setActionBusy('reset-monthly-performance');
        setActionResult(null);
        try {
            const res = await fetch('/api/branches/asan/performance/monthly', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'reset-monthly',
                    confirm_text: confirmText,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || '월간실적 리셋 실패');
            setActionResult({
                action: 'reset-monthly-performance',
                ready: true,
                message: json.message || '월간실적 자료를 리셋했습니다.',
                checks: [
                    { label: '삭제된 월간 원장', ok: true, detail: `${formatNumber(json.data?.deleted_rows)}행` },
                    { label: '삭제된 파일 설정', ok: true, detail: `${formatNumber(json.data?.deleted_files)}건` },
                    { label: '삭제된 구간단가 캐시', ok: true, detail: `${formatNumber(json.data?.deleted_route_unit_cache)}건` },
                    { label: '삭제된 대시보드 캐시', ok: true, detail: `${formatNumber(json.data?.deleted_dashboard_snapshots)}건` },
                ],
            });
            await loadHealth();
        } catch (err) {
            setActionResult({ action: 'reset-monthly-performance', ready: false, message: err.message || '월간실적 리셋 실패', checks: [] });
        } finally {
            setActionBusy('');
        }
    }

    function handleAction(action) {
        if (action.id === 'refresh-database-health') {
            loadHealth();
            return;
        }
        if (action.id === 'reset-monthly-performance') {
            resetMonthlyPerformance();
            return;
        }
        if (action.id === 'backup-readiness' || action.id === 'restore-readiness') {
            runReadiness(action.id);
            return;
        }
        setActionResult({
            action: action.id,
            ready: false,
            message: '직접 실행 전 NAS archive worker, manifest, staging 복원 검증이 먼저 필요합니다.',
            checks: [
                { label: '현재 상태', ok: false, detail: '준비 필요' },
            ],
        });
    }

    if (loading && !data) {
        return <div className={styles.loadingPage}>데이터 운영 상태를 불러오는 중입니다...</div>;
    }

    return (
        <main className={styles.page}>
            <header className={styles.compactHeader}>
                <div>
                    <h1 className={styles.pageTitle}>데이터 운영 관리</h1>
                    <p className={styles.pageSub}>DB 용량, 보존 정책, 백업·복원 준비 상태를 관리자 전용으로 확인합니다.</p>
                </div>
                <button className={styles.headerBtn} onClick={loadHealth} disabled={loading}>
                    {loading ? '조회 중' : '새로고침'}
                </button>
            </header>

            {error && <div className={styles.errorBox}>{error}</div>}

            {data && (
                <>
                    <section className={styles.summaryGrid}>
                        <article className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>전체 DB 용량</span>
                            <strong>{data.overview?.database_size || '-'}</strong>
                            <small>{data.overview?.database_name || 'Supabase'} / {formatDateTime(data.overview?.checked_at)}</small>
                        </article>
                        <article className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>추적 대상 합계</span>
                            <strong>{data.summary?.tracked_total_size || '-'}</strong>
                            <small>{formatNumber(data.summary?.tracked_table_count)}개 주요 테이블</small>
                        </article>
                        <article className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>가장 큰 테이블</span>
                            <strong>{largestTable?.total_size || '-'}</strong>
                            <small>{largestTable?.table_name || '-'}</small>
                        </article>
                        <article className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>개선 필요</span>
                            <strong>{formatNumber(data.summary?.status_counts?.critical)}건</strong>
                            <small>관찰 {formatNumber(data.summary?.status_counts?.watch)}건 / 정상 {formatNumber(data.summary?.status_counts?.ok)}건</small>
                        </article>
                    </section>

                    <section className={styles.policyStrip}>
                        <div>
                            <span>일일배차·상세배차</span>
                            <strong>{data.retention_policy?.dispatch_hot}</strong>
                        </div>
                        <div>
                            <span>월간실적</span>
                            <strong>{data.retention_policy?.monthly_performance_hot}</strong>
                        </div>
                        <div>
                            <span>활동 로그</span>
                            <strong>{data.retention_policy?.activity_logs_hot}</strong>
                        </div>
                        <div>
                            <span>Archive 검색</span>
                            <strong>{data.retention_policy?.archive_search}</strong>
                        </div>
                    </section>

                    <section className={styles.sectionGrid}>
                        <div className={styles.panel}>
                            <div className={styles.panelHead}>
                                <h2>직접 액션 설정</h2>
                                <span>관리자 전용</span>
                            </div>
                            <div className={styles.actionGrid}>
                                {data.action_settings?.map((action) => {
                                    const isBusy = actionBusy === action.id || (action.id === 'refresh-database-health' && loading);
                                    const directDisabled = ['archive-old-dispatch', 'restore-archive'].includes(action.id);
                                    return (
                                        <button
                                            key={action.id}
                                            className={`${styles.actionCard} ${action.danger ? styles.actionDanger : ''}`}
                                            onClick={() => handleAction(action)}
                                            disabled={isBusy}
                                            type="button"
                                        >
                                            <span className={styles.actionTop}>
                                                <strong>{action.label}</strong>
                                                <em className={action.status === 'ready' ? styles.readyBadge : styles.setupBadge}>
                                                    {ACTION_LABELS[action.status] || action.status}
                                                </em>
                                            </span>
                                            <small>{directDisabled ? `${action.description} 현재는 준비 점검만 가능합니다.` : action.description}</small>
                                            <span className={styles.actionRun}>{isBusy ? '처리 중' : directDisabled ? '준비 항목 보기' : '실행'}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {actionResult && (
                                <div className={`${styles.resultBox} ${actionResult.ready ? styles.resultOk : styles.resultWarn}`}>
                                    <strong>{actionResult.message}</strong>
                                    {actionResult.checks?.length > 0 && (
                                        <ul>
                                            {actionResult.checks.map((check) => (
                                                <li key={`${check.label}-${check.detail}`}>
                                                    <span>{check.label}</span>
                                                    <em className={check.ok ? styles.checkOk : styles.checkWarn}>{check.detail}</em>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {actionResult.next_steps?.length > 0 && (
                                        <p>{actionResult.next_steps.join(' -> ')}</p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className={styles.panel}>
                            <div className={styles.panelHead}>
                                <h2>최적화 판단</h2>
                                <span>실제 용량 기준</span>
                            </div>
                            <div className={styles.findingList}>
                                {data.findings?.map((finding) => (
                                    <article key={`${finding.target}-${finding.title}`} className={styles.findingCard}>
                                        <div className={styles.findingHead}>
                                            <strong>{finding.title}</strong>
                                            <span className={`${styles.statusBadge} ${statusClass(finding.level)}`}>{STATUS_LABELS[finding.level] || finding.level}</span>
                                        </div>
                                        <p>{finding.body}</p>
                                        <small>{finding.action}</small>
                                    </article>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <h2>종류별 용량</h2>
                            <span>category 기준 합계</span>
                        </div>
                        <div className={styles.categoryGrid}>
                            {data.summary?.category_totals?.map((category) => (
                                <article key={category.category} className={styles.categoryCard}>
                                    <span>{category.category}</span>
                                    <strong>{category.total_size}</strong>
                                    <small>{formatNumber(category.row_estimate)}행 / {formatNumber(category.table_count)}개 테이블</small>
                                </article>
                            ))}
                        </div>
                    </section>

                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <h2>테이블별 상세</h2>
                            <span>상위 30개</span>
                        </div>
                        <div className={styles.tableWrap}>
                            <table className={styles.dataTable}>
                                <thead>
                                    <tr>
                                        <th>테이블</th>
                                        <th>종류</th>
                                        <th>추정 행수</th>
                                        <th>전체</th>
                                        <th>테이블</th>
                                        <th>인덱스</th>
                                        <th>TOAST</th>
                                        <th>상태</th>
                                        <th>개선 판단</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.top_tables?.map((row) => (
                                        <tr key={`${row.schema_name}.${row.table_name}`}>
                                            <td className={styles.tableName}>{row.table_name}</td>
                                            <td>{row.category}</td>
                                            <td>{formatNumber(row.row_estimate)}</td>
                                            <td>{row.total_size}</td>
                                            <td>{row.table_size}</td>
                                            <td>{row.index_size}</td>
                                            <td>{row.toast_size}</td>
                                            <td><span className={`${styles.statusBadge} ${statusClass(row.optimization_status)}`}>{STATUS_LABELS[row.optimization_status] || row.optimization_status}</span></td>
                                            <td>{row.recommendation}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            )}
        </main>
    );
}
