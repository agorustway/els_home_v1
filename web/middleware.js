import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request) {
    const path = request.nextUrl.pathname;

    // ─── API CORS 핸들링 (모바일 앱 대응) ───
    if (path.startsWith('/api/vehicle-tracking')) {
        // 프리플라이트(OPTIONS) 요청 처리
        if (request.method === 'OPTIONS') {
            return new NextResponse(null, {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
                    'Access-Control-Max-Age': '86400',
                },
            });
        }
    }

    let supabaseResponse = NextResponse.next({
        request,
    })

    // API 응답에 CORS 헤더 추가 (일반 요청)
    if (path.startsWith('/api/vehicle-tracking')) {
        supabaseResponse.headers.set('Access-Control-Allow-Origin', '*');
        supabaseResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        supabaseResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    // API가 아닌 경우에만 쿠키 기반 응답에 CORS 헤더 다시 세팅 (NextResponse.next가 새로 생성되므로)
                    if (path.startsWith('/api/vehicle-tracking')) {
                        supabaseResponse.headers.set('Access-Control-Allow-Origin', '*');
                    }
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // getSession(): 쿠키 기반으로 빠르게 확인
    const { data: { session } } = await supabase.auth.getSession();
    let user = session?.user;

    // URL 쿼리에 ?debug=true 가 있으면 쿠키에 심음
    let isDebugMode = process.env.NEXT_PUBLIC_DEBUG_MODE === 'true' || process.env.DEBUG_MODE === 'true';
    if (request.nextUrl.searchParams.get('debug') === 'true' || request.cookies.get('__debug_mode')?.value === 'true') {
        isDebugMode = true;
        // API 응답 객체에 쿠키를 심어줌 (브라우저에서 계속 유지되도록)
        supabaseResponse.cookies.set('__debug_mode', 'true', { path: '/', maxAge: 60 * 60 * 24 * 7 }); // 7일 유지
    }
    if (request.nextUrl.searchParams.get('debug') === 'false') {
        isDebugMode = false;
        supabaseResponse.cookies.delete('__debug_mode');
    }

    let userRole = 'visitor';
    if (user) {
        const { data: roleData } = await supabase.from('user_roles').select('role').eq('email', user.email).single();
        userRole = roleData?.role || 'visitor';
    }

    // 🚨 디버그 모드 강제 바이패스: 세션이 없어도 관리자 권한 부여
    if (isDebugMode) {
        if (!user) {
            user = { email: 'debug_admin@nollae.com' };
        }
        userRole = 'admin';
    }

    // 0. Redirect authenticated users away from login page
    // 디버그 모드일 때는 로그인 페이지 접근 시 바로 대시보드로 리다이렉트
    if ((user || isDebugMode) && path === '/login') {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
    }

    // 0.1 Redirect authenticated users (non-visitors) to ask page if on landing
    if ((user || isDebugMode) && path === '/' && userRole !== 'visitor') {
        const url = request.nextUrl.clone()
        url.pathname = '/employees/ask'
        return NextResponse.redirect(url)
    }

    // 1. Protected Routes (Access Control)
    const isDriverPage = path.startsWith('/employees/vehicle-tracking/driver') || path.startsWith('/driver-app');

    if (path.startsWith('/admin') || path.startsWith('/employees') || path.startsWith('/driver-app')) {
        // If not authenticated, redirect to login (except driver pages or debug mode)
        if (!user && path !== '/login' && !isDriverPage && !isDebugMode) {
            const url = request.nextUrl.clone()
            url.pathname = '/login'
            url.searchParams.set('next', path)
            url.searchParams.set('error', '로그인이 필요합니다.')
            return NextResponse.redirect(url)
        }

        // 2. 방문객(visitor) 권한 제한
        const isVisitorAllowedPath = path === '/employees' || path === '/employees/' || path.startsWith('/employees/mypage');

        if (userRole === 'visitor' && !isVisitorAllowedPath && !isDriverPage && !isDebugMode) {
            const url = request.nextUrl.clone()
            url.pathname = '/'
            url.searchParams.set('error', '방문객 권한으로는 접근할 수 없는 메뉴입니다.')
            return NextResponse.redirect(url)
        }

        // If trying to access /admin pages without 'admin' role
        if (path.startsWith('/admin') && userRole !== 'admin' && !isDebugMode) {
            const url = request.nextUrl.clone()
            url.pathname = '/login'
            url.searchParams.set('error', '권한이 없습니다.')
            return NextResponse.redirect(url)
        }
    }

    return supabaseResponse
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public/images (if any)
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
