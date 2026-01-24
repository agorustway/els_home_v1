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
        // Use the authenticated client to fetch the user's role
        const { data: roleData } = await supabase.from('user_roles').select('role').eq('id', user.id).single();
        userRole = roleData?.role || 'visitor';
    }

    const path = request.nextUrl.pathname;

    // 1. Protected Routes (Access Control)
    if (path.startsWith('/admin') || path.startsWith('/employees/mypage')) {
        // If not authenticated, redirect to login
        if (!user) {
            const url = request.nextUrl.clone()
            url.pathname = '/login'
            url.searchParams.set('next', path) // Redirect back after login
            url.searchParams.set('error', '로그인이 필요합니다.')
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
