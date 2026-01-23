import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getRoleLabel } from '@/utils/roles';

export async function GET() {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { data: roleData } = await supabase
            .from('user_roles')
            .select('*')
            .eq('id', user.id)
            .single();

        const userRole = roleData?.role || 'visitor';
        return NextResponse.json({
            role: userRole,
            can_write: roleData?.can_write || userRole === 'admin',
            can_delete: userRole === 'admin', // Web deletion ONLY for admin
            can_read_security: roleData?.can_read_security || userRole === 'admin'
        });
    } catch (error) {
        return NextResponse.json({ role: 'visitor' });
    }
}
