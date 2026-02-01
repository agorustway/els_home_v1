/**
 * 로그인한 사용자의 ETRANS(ELS) 저장 계정을 Supabase에서 조회.
 * 사용자별 ID/PC 허용 수량 대응용.
 */
import { createClient } from '@/utils/supabase/server';

export async function getUserElsCreds() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return null;
    const { data: row } = await supabase
        .from('user_els_credentials')
        .select('els_user_id, els_user_pw')
        .eq('user_id', user.id)
        .single();
    if (!row || !row.els_user_id) return null;
    return { userId: row.els_user_id, userPw: row.els_user_pw || '' };
}
