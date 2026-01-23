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

    const path = request.nextUrl.pathname;

    // 1. Protected Routes (Access Control)
    // /employees or /admin paths require authentication
    if ((path.startsWith('/employees') || path.startsWith('/admin')) && !user) {
        // Redirect to login page
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.searchParams.set('next', path) // Redirect back after login
        return NextResponse.redirect(url)
    }

    // 2. Security Headers (Optional: Relax strict policies if needed for mobile)
    // Currently standard Next.js handling is sufficient. 
    // If specific errors persist, we can add permissive headers here.

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
