import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request, { params }) {
    const supabase = await createClient();
    const { id } = await params;

    try {
        const { data, error } = await supabase
            .from('vehicle_trip_logs')
            .select('*')
            .eq('trip_id', id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ logs: data });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
