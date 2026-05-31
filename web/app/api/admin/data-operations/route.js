import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TRACKED_TABLES = [
    'branch_performance_rows',
    'branch_shipping_rows',
    'branch_dispatch_detail_change_history',
    'branch_performance_monthly_route_unit_amount_cache',
    'document_chunks',
    'nas_file_index',
    'user_activity_logs',
    'vehicle_locations',
    'vehicle_trips',
    'vehicle_logs',
    'driver_work_logs',
    'driver_work_log_photos',
];

const STATUS_ORDER = {
    critical: 0,
    watch: 1,
    ok: 2,
};

async function requireAdmin() {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('email', user.email)
        .single();

    if (roleError || roleData?.role !== 'admin') {
        return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
    }

    return { user };
}

function toNumber(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatBytes(bytes) {
    const numeric = toNumber(bytes);
    if (numeric <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(numeric) / Math.log(1024)), units.length - 1);
    const value = numeric / (1024 ** index);
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function normalizeTableRow(row) {
    const status = row.optimization_status || 'ok';
    return {
        schema_name: row.schema_name,
        table_name: row.table_name,
        category: row.category || '기타',
        row_estimate: toNumber(row.row_estimate),
        total_bytes: toNumber(row.total_bytes),
        table_bytes: toNumber(row.table_bytes),
        index_bytes: toNumber(row.index_bytes),
        toast_bytes: toNumber(row.toast_bytes),
        total_size: row.total_size || formatBytes(row.total_bytes),
        table_size: row.table_size || formatBytes(row.table_bytes),
        index_size: row.index_size || formatBytes(row.index_bytes),
        toast_size: row.toast_size || formatBytes(row.toast_bytes),
        last_vacuum: row.last_vacuum,
        last_autovacuum: row.last_autovacuum,
        last_analyze: row.last_analyze,
        last_autoanalyze: row.last_autoanalyze,
        optimization_status: status,
        recommendation: row.recommendation || '현 상태 유지',
    };
}

function buildCategoryTotals(rows) {
    const map = new Map();

    rows.forEach((row) => {
        const current = map.get(row.category) || {
            category: row.category,
            total_bytes: 0,
            row_estimate: 0,
            table_count: 0,
            critical_count: 0,
            watch_count: 0,
        };
        current.total_bytes += row.total_bytes;
        current.row_estimate += row.row_estimate;
        current.table_count += 1;
        if (row.optimization_status === 'critical') current.critical_count += 1;
        if (row.optimization_status === 'watch') current.watch_count += 1;
        map.set(row.category, current);
    });

    return Array.from(map.values())
        .map((item) => ({
            ...item,
            total_size: formatBytes(item.total_bytes),
        }))
        .sort((a, b) => b.total_bytes - a.total_bytes);
}

function buildStatusCounts(rows) {
    return rows.reduce((acc, row) => {
        acc[row.optimization_status] = (acc[row.optimization_status] || 0) + 1;
        return acc;
    }, { critical: 0, watch: 0, ok: 0 });
}

function buildFindings(rows, overview) {
    const findings = [];
    const byName = new Map(rows.map((row) => [row.table_name, row]));

    const performanceRows = byName.get('branch_performance_rows');
    if (performanceRows) {
        findings.push({
            level: performanceRows.optimization_status,
            title: '실적 원장 용량',
            target: 'branch_performance_rows',
            body: `${performanceRows.total_size} / 추정 ${performanceRows.row_estimate.toLocaleString()}행입니다. 월간은 리셋 가능한 임시 원장, 연간은 확정 Excel source 기준으로 변경분만 반영해야 합니다.`,
            action: performanceRows.recommendation,
        });
    }

    const documentChunks = byName.get('document_chunks');
    if (documentChunks) {
        findings.push({
            level: documentChunks.optimization_status,
            title: 'RAG 문서 청크',
            target: 'document_chunks',
            body: `${documentChunks.total_size}입니다. VACUUM FULL 이후 watch 수준으로 내려왔지만, 원본 삭제/교체 후 stale chunk 제거가 계속 필요합니다.`,
            action: documentChunks.recommendation,
        });
    }

    const activityLogs = byName.get('user_activity_logs');
    if (activityLogs) {
        findings.push({
            level: activityLogs.optimization_status,
            title: '활동 로그',
            target: 'user_activity_logs',
            body: `${activityLogs.total_size} / 추정 ${activityLogs.row_estimate.toLocaleString()}행입니다. 180일 초과분은 월별 JSONL gzip 보관 후 삭제하는 기준을 유지합니다.`,
            action: activityLogs.recommendation,
        });
    }

    const dbBytes = toNumber(overview?.database_bytes);
    findings.push({
        level: dbBytes > 1.5 * 1024 * 1024 * 1024 ? 'watch' : 'ok',
        title: '전체 DB 크기',
        target: overview?.database_name || 'database',
        body: `현재 전체 DB는 ${overview?.database_size || formatBytes(dbBytes)}입니다. compact-swap 이후 급한 폭증은 잡혔지만 실적/GPS/배차 raw는 계속 누적됩니다.`,
        action: '월별 archive manifest와 복원 staging을 만든 뒤 hot 기간 초과 raw row를 정기 정리합니다.',
    });

    return findings.sort((a, b) => (STATUS_ORDER[a.level] ?? 9) - (STATUS_ORDER[b.level] ?? 9));
}

function buildActionSettings() {
    const hasBackend = Boolean(process.env.ELS_BACKEND_URL);

    return [
        {
            id: 'refresh-database-health',
            label: 'DB 용량 새로고침',
            status: 'ready',
            danger: false,
            description: 'Supabase RPC로 전체 DB와 테이블별 용량을 다시 조회합니다.',
        },
        {
            id: 'reset-monthly-performance',
            label: '월간실적 리셋',
            status: 'ready',
            danger: true,
            description: '월간 rows/files/cache/snapshot만 삭제합니다. 연간 source는 건드리지 않습니다.',
        },
        {
            id: 'backup-readiness',
            label: '백업 준비 점검',
            status: hasBackend ? 'ready' : 'setup_required',
            danger: false,
            description: 'NAS 백엔드, archive manifest, service role 준비 상태를 확인합니다.',
        },
        {
            id: 'restore-readiness',
            label: '복원 준비 점검',
            status: hasBackend ? 'ready' : 'setup_required',
            danger: false,
            description: '복원 job 테이블과 staging 운영 기준을 확인합니다.',
        },
        {
            id: 'archive-old-dispatch',
            label: '1년 1개월 초과 배차 Archive',
            status: 'setup_required',
            danger: true,
            description: 'NAS archive worker와 manifest 검증이 연결되면 활성화합니다.',
        },
        {
            id: 'restore-archive',
            label: 'Archive 복원',
            status: 'setup_required',
            danger: false,
            description: 'manifest 선택, checksum 검증, staging 적재가 준비되면 활성화합니다.',
        },
    ];
}

async function probeTable(adminSupabase, tableName) {
    const { count, error } = await adminSupabase
        .from(tableName)
        .select('id', { head: true, count: 'exact' })
        .limit(1);

    if (!error) {
        return { table: tableName, exists: true, count: count || 0, error: null };
    }

    return {
        table: tableName,
        exists: false,
        count: 0,
        error: error.message,
    };
}

function buildReadinessResult(action, probes) {
    const manifest = probes.find((probe) => probe.table === 'data_archive_manifest');
    const restoreJobs = probes.find((probe) => probe.table === 'data_restore_jobs');
    const hasBackend = Boolean(process.env.ELS_BACKEND_URL);

    const checks = [
        {
            label: 'NAS 백엔드 연결',
            ok: hasBackend,
            detail: hasBackend ? 'ELS_BACKEND_URL 설정됨' : 'ELS_BACKEND_URL 미설정',
        },
        {
            label: 'Archive manifest 테이블',
            ok: Boolean(manifest?.exists),
            detail: manifest?.exists ? 'data_archive_manifest 확인됨' : '생성 필요',
        },
        {
            label: 'Restore job 테이블',
            ok: Boolean(restoreJobs?.exists),
            detail: restoreJobs?.exists ? 'data_restore_jobs 확인됨' : '생성 필요',
        },
        {
            label: 'Service role API',
            ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
            detail: process.env.SUPABASE_SERVICE_ROLE_KEY ? '서버 환경변수 확인됨' : 'SUPABASE_SERVICE_ROLE_KEY 미설정',
        },
    ];

    const ready = checks.every((check) => check.ok);

    return {
        action,
        ready,
        message: ready
            ? '백업/복원 직접 실행 전제조건이 준비됐습니다.'
            : '아직 직접 실행 전제조건이 부족합니다. 부족한 항목을 먼저 준비해야 합니다.',
        checks,
        next_steps: ready
            ? ['NAS archive worker 연결', '샘플 기간 백업', 'staging 복원 검증']
            : ['data_archive_manifest/data_restore_jobs 스키마 적용', 'NAS archive worker 구현', '샘플 복원 검증 후 삭제 액션 활성화'],
    };
}

export async function GET() {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    try {
        const adminSupabase = await createAdminClient();
        const [{ data: overviewData, error: overviewError }, { data: tableData, error: tableError }] = await Promise.all([
            adminSupabase.rpc('admin_database_overview'),
            adminSupabase.rpc('admin_database_table_sizes'),
        ]);

        if (overviewError) throw new Error(`DB 전체 용량 조회 실패: ${overviewError.message}`);
        if (tableError) throw new Error(`테이블별 용량 조회 실패: ${tableError.message}`);

        const overview = Array.isArray(overviewData) ? overviewData[0] : overviewData;
        const rows = (tableData || []).map(normalizeTableRow);
        const trackedRows = rows.filter((row) => TRACKED_TABLES.includes(row.table_name));
        const trackedBytes = trackedRows.reduce((sum, row) => sum + row.total_bytes, 0);
        const topTables = rows
            .slice()
            .sort((a, b) => b.total_bytes - a.total_bytes)
            .slice(0, 30);

        return NextResponse.json({
            overview: {
                ...overview,
                database_bytes: toNumber(overview?.database_bytes),
                database_size: overview?.database_size || formatBytes(overview?.database_bytes),
            },
            summary: {
                tracked_table_count: trackedRows.length,
                tracked_total_bytes: trackedBytes,
                tracked_total_size: formatBytes(trackedBytes),
                status_counts: buildStatusCounts(rows),
                category_totals: buildCategoryTotals(rows),
            },
            top_tables: topTables,
            tracked_tables: trackedRows,
            findings: buildFindings(rows, overview),
            action_settings: buildActionSettings(),
            retention_policy: {
                dispatch_hot: '1년 1개월',
                monthly_performance_hot: '1년 3개월',
                activity_logs_hot: '180일 권장',
                archive_search: '일반 검색과 분리. manifest에서 확인 후 staging 복원',
            },
        });
    } catch (error) {
        return NextResponse.json({ error: error.message || '데이터 운영 상태 조회 실패' }, { status: 500 });
    }
}

export async function POST(req) {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    let body = {};
    try {
        body = await req.json();
    } catch {
        body = {};
    }

    const action = String(body.action || '').trim();

    if (!['backup-readiness', 'restore-readiness'].includes(action)) {
        return NextResponse.json({ error: '지원하지 않는 작업입니다.' }, { status: 400 });
    }

    try {
        const adminSupabase = await createAdminClient();
        const probes = await Promise.all([
            probeTable(adminSupabase, 'data_archive_manifest'),
            probeTable(adminSupabase, 'data_restore_jobs'),
        ]);

        return NextResponse.json({
            data: buildReadinessResult(action, probes),
        });
    } catch (error) {
        return NextResponse.json({ error: error.message || '작업 준비 상태 점검 실패' }, { status: 500 });
    }
}
