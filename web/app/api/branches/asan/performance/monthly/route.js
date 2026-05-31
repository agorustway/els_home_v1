import { NextResponse } from 'next/server';
import { proxyToBackend } from '../../../../els/proxyToBackend';
import {
    queryAsanMonthlyPerformanceDashboardFromSupabase,
    queryAsanMonthlyPerformanceFromSupabase,
} from '@/lib/asan-branch-db';
import { createAdminClient, createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req) {
    const url = new URL(req.url);
    const source = (url.searchParams.get('source') || 'supabase').toLowerCase();
    if (source === 'excel' || source === 'status') {
        if (process.env.ELS_BACKEND_URL) {
            return proxyToBackend(req, '/api/branches/asan/performance/monthly');
        }
        return NextResponse.json({ error: 'ELS_BACKEND_URL 미설정 또는 월간실적 동기화 상태 조회 실패' }, { status: 500 });
    }

    if (source !== 'excel') {
        try {
            const dashboard = ['1', 'true', 'yes'].includes(String(url.searchParams.get('dashboard') || '').toLowerCase());
            const data = dashboard
                ? await queryAsanMonthlyPerformanceDashboardFromSupabase(url.searchParams)
                : await queryAsanMonthlyPerformanceFromSupabase(url.searchParams);
            return NextResponse.json({ data });
        } catch (error) {
            return NextResponse.json({ error: error.message || '월간실적 DB 조회 실패' }, { status: 500 });
        }
    }

    return NextResponse.json({ error: 'ELS_BACKEND_URL 미설정 또는 월간실적 DB 조회 실패' }, { status: 500 });
}

export async function POST(req) {
    let body = {};
    try {
        body = await req.clone().json();
    } catch {
        body = {};
    }

    if (body?.action === 'reset-monthly') {
        return resetMonthlyPerformanceData(body);
    }

    if (process.env.ELS_BACKEND_URL) {
        return proxyToBackend(req, '/api/branches/asan/performance/monthly');
    }
    return NextResponse.json({ error: 'ELS_BACKEND_URL 미설정' }, { status: 500 });
}

async function requireAdmin() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

    const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('email', user.email)
        .single();

    if (!roleData || roleData.role !== 'admin') {
        return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
    }

    return { user };
}

async function deleteWithCount(query, label) {
    const { count, error } = await query;
    if (error) throw new Error(`${label} 삭제 실패: ${error.message}`);
    return count || 0;
}

async function resetMonthlyPerformanceData(body = {}) {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const confirmText = String(body.confirm_text || '').trim();
    if (confirmText !== '월간자료 리셋') {
        return NextResponse.json({ error: '확인 문구가 일치하지 않습니다.' }, { status: 400 });
    }

    try {
        const adminSupabase = await createAdminClient();
        const resetAt = new Date().toISOString();
        const resetBy = auth.user?.email || '';

        const deletedRows = await deleteWithCount(
            adminSupabase
                .from('branch_performance_rows')
                .delete({ count: 'exact' })
                .eq('branch_id', 'asan')
                .eq('dataset_type', 'monthly'),
            '월간실적 원장'
        );

        const deletedCache = await deleteWithCount(
            adminSupabase
                .from('branch_performance_monthly_route_unit_amount_cache')
                .delete({ count: 'exact' })
                .eq('branch_id', 'asan'),
            '월간 구간단가 캐시'
        );

        const deletedSnapshots = await deleteWithCount(
            adminSupabase
                .from('branch_performance_dashboard_snapshots')
                .delete({ count: 'exact' })
                .eq('branch_id', 'asan')
                .in('dashboard_type', ['monthly', 'summary', 'summary-view', 'annual-route-unit-price']),
            '실적 대시보드 캐시'
        );

        const deletedFiles = await deleteWithCount(
            adminSupabase
                .from('branch_performance_files')
                .delete({ count: 'exact' })
                .eq('branch_id', 'asan')
                .eq('dataset_type', 'monthly'),
            '월간실적 파일 설정'
        );

        return NextResponse.json({
            message: '월간실적 자료를 리셋했습니다. 연간실적 자료는 변경하지 않았습니다.',
            data: {
                reset_at: resetAt,
                reset_by: resetBy,
                deleted_rows: deletedRows,
                deleted_files: deletedFiles,
                deleted_route_unit_cache: deletedCache,
                deleted_dashboard_snapshots: deletedSnapshots,
            },
        });
    } catch (error) {
        return NextResponse.json({ error: error.message || '월간실적 리셋 실패' }, { status: 500 });
    }
}
