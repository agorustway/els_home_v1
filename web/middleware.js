import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request) {
    let supabaseResponse = NextResponse.next({
        request,
    })

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
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const {
        data: { user },
    } = await supabase.auth.getUser()

    let userRole = 'visitor'; // Default to visitor if no user or role found
    if (user) {
        // Use Email-based lookup (unified identity)
        const { data: roleData } = await supabase.from('user_roles').select('role').eq('email', user.email).single();
        userRole = roleData?.role || 'visitor';
    }

    const path = request.nextUrl.pathname;

    // 0. Redirect authenticated users away from login page
    if (user && path === '/login') {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
    }

    // 1. Protected Routes (Access Control)
    if (path.startsWith('/admin') || path.startsWith('/employees')) {
        // If not authenticated, redirect to login
        if (!user && path !== '/login') { // 로그인 페이지가 아닐 때만 리다이렉트
            const url = request.nextUrl.clone()
            url.pathname = '/login'
            url.searchParams.set('next', path) // Redirect back after login
            url.searchParams.set('error', '로그인이 필요합니다.')
            return NextResponse.redirect(url)
        }

        // 방문자(visitor) 권한은 임직원 홈(/employees) 외의 하위 기능 접근 불가
        if (userRole === 'visitor' && path !== '/employees' && !path.startsWith('/employees/mypage')) {
            const url = request.nextUrl.clone()
            url.pathname = '/employees' // 로그인 페이지로 보내면 무한 루프 발생 방지
            url.searchParams.set('error', '방문객 권한으로는 접근할 수 없는 메뉴입니다.')
            return NextResponse.redirect(url)
        }

        // If authenticated and not visitor, but trying to access /admin pages without 'admin' role
        if (path.startsWith('/admin') && userRole !== 'admin') {
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
