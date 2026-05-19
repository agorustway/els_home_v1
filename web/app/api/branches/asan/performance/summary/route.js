import { NextResponse } from 'next/server';
import {
    queryAsanAnnualPerformanceFromSupabase,
    queryAsanMonthlyPerformanceFromSupabase,
} from '@/lib/asan-branch-db';
import { buildAsanPerformanceExecutiveSummary } from '@/utils/asanPerformanceSummary.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function summaryParams(searchParams, type) {
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    params.set('page_size', '1');
    params.delete('search');
    params.delete('search_mode');
    params.delete('sort_key');
    params.delete('sort_dir');
    params.delete('source');
    if (type === 'annual') params.set('aggregate', 'all');
    else params.delete('aggregate');
    return params;
}

function compactSource(data = {}) {
    const summary = data.summary && typeof data.summary === 'object' ? data.summary : {};
    return {
        total: data.total || 0,
        total_is_estimated: Boolean(data.total_is_estimated),
        file_path: data.file_path || '',
        sheet_name: data.sheet_name || '',
        file_modified_at: data.file_modified_at || '',
        synced_at: data.synced_at || '',
        source: data.source || '',
        read_path: data.read_path || '',
        summary: {
            totalRevenue: summary.totalRevenue || 0,
            totalPurchase: summary.totalPurchase || 0,
            totalProfit: summary.totalProfit || 0,
            profitRate: summary.profitRate || 0,
            analysisRows: summary.analysisRows || 0,
            totalRows: summary.totalRows || 0,
            annualFileCount: summary.annualFileCount || 0,
            monthlyFileCount: summary.monthlyFileCount || 0,
            monthlyBasis: summary.monthlyBasis || '',
            periodStart: summary.periodStart || '',
            periodEnd: summary.periodEnd || '',
        },
    };
}

export async function GET(req) {
    const url = new URL(req.url);

    try {
        const [annual, monthly] = await Promise.all([
            queryAsanAnnualPerformanceFromSupabase(summaryParams(url.searchParams, 'annual')),
            queryAsanMonthlyPerformanceFromSupabase(summaryParams(url.searchParams, 'monthly')),
        ]);
        const summary = buildAsanPerformanceExecutiveSummary({ annual, monthly });

        return NextResponse.json({
            data: {
                summary,
                annual: compactSource(annual),
                monthly: compactSource(monthly),
            },
        });
    } catch (error) {
        return NextResponse.json(
            { error: error.message || '종합실적 DB 조회 실패' },
            { status: 500 },
        );
    }
}
