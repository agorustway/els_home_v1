import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const next = searchParams.get('next') ?? '/';

    const supabase = await createClient(); // For session management
    const adminSupabase = await createAdminClient(); // For profile UPSERT

    const redirectToError = (message) => {
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
    };

    // Naver custom OIDC flow
    if (state) {
        const cookieStore = cookies();
        const storedState = cookieStore.get('oauth_state')?.value;
        const storedNonce = cookieStore.get('oauth_nonce')?.value;

        if (state !== storedState) {
            return redirectToError('Invalid state parameter. CSRF attack detected.');
        }

        // Clear the state and nonce cookies
        cookieStore.set('oauth_state', '', { maxAge: 0 });
        cookieStore.set('oauth_nonce', '', { maxAge: 0 });

        try {
            // 1. Exchange authorization code for tokens with Naver
            const tokenResponse = await fetch('https://nid.naver.com/oauth2.0/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    client_id: process.env.NEXT_PUBLIC_NAVER_CLIENT_ID,
                    client_secret: process.env.NAVER_CLIENT_SECRET,
                    code,
                    state,
                }),
            });

            const tokenData = await tokenResponse.json();

            // --- DEBUGGING LOG ---
            // console.log('Naver Token Response:', JSON.stringify(tokenData, null, 2));
            // ---------------------

            const { access_token, id_token } = tokenData;

            if (!id_token) {
                const responseKeys = Object.keys(tokenData).join(', ');
                return redirectToError(`Naver response did not include id_token. Received keys: [${responseKeys}]`);
            }

            // 2. Verify nonce from the ID token
            const idTokenPayload = JSON.parse(Buffer.from(id_token.split('.')[1], 'base64').toString());
            if (idTokenPayload.nonce !== storedNonce) {
                return redirectToError('Invalid nonce. Replay attack detected.');
            }

            // 3. Sign in/up with Supabase using the ID token
            const { data: { user }, error } = await supabase.auth.signInWithIdToken({
                provider: 'openid', // Assuming this is the configured provider name for OIDC
                token: id_token,
                nonce: storedNonce, 
            });

            if (error) { throw error; }

            // 4. UPSERT into public.profiles using the RPC function
            if (user && user.email) {
                const { error: rpcError } = await adminSupabase.rpc('upsert_profile', {
                    user_email: user.email,
                    user_name: user.user_metadata.full_name || user.email.split('@')[0],
                    user_avatar: user.user_metadata.avatar_url
                });

                if (rpcError) {
                    console.error('Naver Profile RPC error:', rpcError);
                    return redirectToError('프로필 업데이트 중 오류가 발생했습니다.');
                }

                // Ensure user_roles entry exists
                const { error: roleError } = await adminSupabase
                    .from('user_roles')
                    .upsert({ id: user.id, role: 'visitor' }, { onConflict: 'id' });

                if (roleError) {
                    console.error('Naver user_roles UPSERT error:', roleError);
                    return redirectToError('사용자 역할 생성 중 오류가 발생했습니다.');
                }
            }


            // 5. Redirect to the final destination
            return NextResponse.redirect(`${origin}${next}`);

        } catch (error) {
            console.error('Naver OIDC Callback Error:', error);
            return redirectToError(error.message || '네이버 로그인 중 오류가 발생했습니다.');
        }
    }

    // Standard Supabase OAuth flow (Google, Kakao)
    if (code) {
        const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && user && user.email) {
            
            // UPSERT into public.profiles using the RPC function
            const { error: rpcError } = await adminSupabase.rpc('upsert_profile', {
                user_email: user.email,
                user_name: user.user_metadata.full_name || user.user_metadata.name || user.user_metadata.nickName || user.email.split('@')[0],
                user_avatar: user.user_metadata.avatar_url || user.user_metadata.profile_image,
            });

            if (rpcError) {
                console.error('Standard OAuth Profile RPC error:', rpcError);
                return redirectToError('프로필 업데이트 중 오류가 발생했습니다.');
            }

            // Ensure user_roles entry exists
            const { error: roleError } = await adminSupabase
                .from('user_roles')
                .upsert({ id: user.id, role: 'visitor' }, { onConflict: 'id' });
            
            if (roleError) {
                console.error('Standard OAuth user_roles UPSERT error:', roleError);
                return redirectToError('사용자 역할 생성 중 오류가 발생했습니다.');
            }

            return NextResponse.redirect(`${origin}${next}`);
        }
        console.error('Supabase code exchange error:', error?.message);
    }

    // Fallback error redirect
    return redirectToError('인증 코드가 유효하지 않습니다.');
}
