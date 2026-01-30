import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/** 임직원 인트라넷 전체 검색: posts(자유게시판·업무보고·웹진) 제목·내용 검색 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const q = (searchParams.get('q') || '').trim().slice(0, 100);
        if (q.length < 2) {
            return NextResponse.json({ posts: [] });
        }

        const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
        const term = esc(q);

        const supabase = await createClient();
        const { data, error } = await supabase
            .from('posts')
            .select('id, title, board_type')
            .in('board_type', ['free', 'report', 'webzine'])
            .or(`title.ilike.%${term}%,content.ilike.%${term}%`)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const posts = (data || []).map((p) => {
            let path = '/employees';
            if (p.board_type === 'free') path = `/employees/board/free/${p.id}`;
            else if (p.board_type === 'report') path = `/employees/reports/${p.id}`;
            else if (p.board_type === 'webzine') path = `/webzine/${p.id}`;
            return { id: p.id, title: p.title, board_type: p.board_type, path };
        });

        return NextResponse.json({ posts });
    } catch (e) {
        return NextResponse.json({ error: String(e.message) }, { status: 500 });
    }
}
