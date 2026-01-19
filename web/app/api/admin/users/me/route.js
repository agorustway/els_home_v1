import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: roleData } = await supabase
            .from('user_roles')
            .select('*')
            .eq('id', user.id)
            .single();

        return NextResponse.json(roleData || { role: 'visitor' });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
