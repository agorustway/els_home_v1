import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';
import {
    isMissingTableError,
    normalizeContainers,
    normalizePath,
    rowsFromBody,
    saveContainerLookupRows,
    TABLE,
} from './store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const filePath = normalizePath(searchParams.get('path'));
    const containers = normalizeContainers(searchParams.get('containers'));

    if (!containers.length) {
        return NextResponse.json({ data: {}, count: 0 });
    }

    const supabase = await createAdminClient();
    const { data, error } = await supabase
        .from(TABLE)
        .select('run_id, container_no, result_rows, main_row, main_status, terminal, move_time, vehicle_no, looked_up_at')
        .eq('branch_id', 'asan')
        .eq('file_path', filePath)
        .in('container_no', containers)
        .order('looked_up_at', { ascending: false })
        .limit(Math.min(containers.length * 20, 2000));

    if (error) {
        if (isMissingTableError(error)) {
            return NextResponse.json({ data: {}, count: 0, warning: 'container lookup table missing' });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const latest = {};
    (data || []).forEach((row) => {
        if (latest[row.container_no]) return;
        latest[row.container_no] = {
            containerNo: row.container_no,
            resultRows: row.result_rows || [],
            mainRow: row.main_row || [],
            lookedUpAt: row.looked_up_at,
            runId: row.run_id,
        };
    });

    return NextResponse.json({ data: latest, count: Object.keys(latest).length });
}

export async function POST(req) {
    const body = await req.json().catch(() => ({}));
    const filePath = normalizePath(body.path || body.file_path);
    const rows = rowsFromBody(body);
    const targets = normalizeContainers(body.containers);

    if (!rows.length) {
        return NextResponse.json({ error: '저장할 컨테이너 이력조회 결과가 없습니다.' }, { status: 400 });
    }

    try {
        const saved = await saveContainerLookupRows({
            filePath,
            rows,
            containers: targets,
            lookupSource: body.lookup_source || 'asan_shipping',
        });
        return NextResponse.json({
            ok: true,
            run_id: saved.runId,
            count: saved.count,
            data: saved.data,
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
