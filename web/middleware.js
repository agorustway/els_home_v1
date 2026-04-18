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

    // getSession(): 쿠키 기반으로 빠르게 확인 (getUser는 매 요청마다 서버 검증으로 지연 유발)
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    let userRole = 'visitor';
    if (user) {
        const { data: roleData } = await supabase.from('user_roles').select('role').eq('email', user.email).single();
        userRole = roleData?.role || 'visitor';
    }

    // 0. Redirect authenticated users away from login page
    if (user && path === '/login') {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
    }

    // 0.1 Redirect authenticated users (non-visitors) to ask page if on landing
    if (user && path === '/' && userRole !== 'visitor') {
        const url = request.nextUrl.clone()
        url.pathname = '/employees/ask'
        return NextResponse.redirect(url)
    }

    // 1. Protected Routes (Access Control)
    // 🚨 예외: 운전원 모바일 페이지(기존/신규)는 로그인 없이 누구나 접근 가능해야 함
    const isDriverPage = path.startsWith('/employees/vehicle-tracking/driver') || path.startsWith('/driver-app');
    const isDebugMode = process.env.NEXT_PUBLIC_DEBUG_MODE === 'true';

    if (path.startsWith('/admin') || path.startsWith('/employees') || path.startsWith('/driver-app')) {
        // If not authenticated, redirect to login (except driver pages or debug mode)
        if (!user && path !== '/login' && !isDriverPage && !isDebugMode) {
            const url = request.nextUrl.clone()
            url.pathname = '/login'
            url.searchParams.set('next', path) // Redirect back after login
            url.searchParams.set('error', '로그인이 필요합니다.')
            return NextResponse.redirect(url)
        }

        // 2. 방문객(visitor) 권한 제한: 임직원 홈, 마이페이지, 운전원 페이지 외 접근 차단
        const isVisitorAllowedPath = path === '/employees' || path === '/employees/' || path.startsWith('/employees/mypage');

        if (userRole === 'visitor' && !isVisitorAllowedPath && !isDriverPage && !isDebugMode) {
            const url = request.nextUrl.clone()
            url.pathname = '/' // 무한 리다이렉트를 막기 위해 방문자는 홈페이지(루트)로 돌려보냄
            url.searchParams.set('error', '방문객 권한으로는 접근할 수 없는 메뉴입니다. 관리자 승인이 필요합니다.')
            return NextResponse.redirect(url)
        }

        // If authenticated and not visitor, but trying to access /admin pages without 'admin' role
        if (path.startsWith('/admin') && userRole !== 'admin' && !isDebugMode) {
            const url = request.nextUrl.clone()
            url.pathname = '/login' // Or a specific unauthorized page
            url.searchParams.set('error', '권한이 없습니다: 관리자만 관리자 페이지에 접근할 수 있습니다.')
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
