import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    let next = searchParams.get('next') ?? '/';

    // Prevent redirect loop to login page
    if (next === '/login') {
        next = '/';
    }

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

            // 4. UPSERT into public.profiles by EMAIL (Master Identity)
            if (user && user.email) {
                const meta = user.user_metadata || {};

                // Unified metadata extraction for all providers
                const extractedName =
                    meta.full_name || meta.name || meta.nickname ||
                    meta.properties?.nickname ||
                    meta.kakao_account?.profile?.nickname ||
                    user.email.split('@')[0];

                const extractedAvatar =
                    meta.avatar_url || meta.profile_image || meta.picture ||
                    meta.properties?.profile_image ||
                    meta.kakao_account?.profile?.profile_image_url;

                // 4.1 Sync Profile by Email
                await adminSupabase.rpc('upsert_profile', {
                    user_email: user.email,
                    user_name: extractedName,
                    user_avatar: extractedAvatar
                });

                // 4.2 Sync Roles by Email (Preserve existing identity)
                // We check if this EMAIL already has a role assigned (from another provider)
                const { data: existingRoleByEmail } = await adminSupabase
                    .from('user_roles')
                    .select('role, id')
                    .eq('email', user.email)
                    .single();

                if (existingRoleByEmail) {
                    // Update the role record to also include the new auth.id for faster ID-based lookups
                    // But keep the role/email intact.
                    await adminSupabase
                        .from('user_roles')
                        .update({ id: user.id }) // Link current provider ID
                        .eq('email', user.email);
                } else {
                    // Only create new visitor role if no record exists for this email
                    await adminSupabase
                        .from('user_roles')
                        .insert({
                            id: user.id,
                            email: user.email,
                            role: 'visitor',
                            name: extractedName
                        });
                }
            }
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
            const meta = user.user_metadata || {};

            const extractedName =
                meta.full_name || meta.name || meta.nickname ||
                meta.properties?.nickname ||
                meta.kakao_account?.profile?.nickname ||
                user.email.split('@')[0];

            const extractedAvatar =
                meta.avatar_url || meta.profile_image || meta.picture ||
                meta.properties?.profile_image ||
                meta.kakao_account?.profile?.profile_image_url;

            // 1. UPSERT Profile by Email
            await adminSupabase.rpc('upsert_profile', {
                user_email: user.email,
                user_name: extractedName,
                user_avatar: extractedAvatar,
            });

            // 2. Identity Merging for Roles
            const { data: existingRole } = await adminSupabase
                .from('user_roles')
                .select('role')
                .eq('email', user.email)
                .single();

            if (existingRole) {
                // Just sync the current provider ID
                await adminSupabase
                    .from('user_roles')
                    .update({ id: user.id })
                    .eq('email', user.email);
            } else {
                await adminSupabase
                    .from('user_roles')
                    .insert({
                        id: user.id,
                        email: user.email,
                        role: 'visitor',
                        name: extractedName
                    });
            }

            return NextResponse.redirect(`${origin}${next}`);
        }
    }
    return redirectToError('인증 코드가 유효하지 않습니다.');
}
