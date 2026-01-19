// proxy.js (기존 middleware.js에서 변경)
import { updateSession } from './utils/supabase/middleware'

export default async function proxy(request) {
    // Supabase 세션 업데이트 로직 유지
    return await updateSession(request)
}

export const config = {
    matcher: [
        /*
         * 다음 경로를 제외한 모든 요청에 실행:
         * - _next/static (정적 파일)
         * - _next/image (이미지 최적화)
         * - favicon.ico (파비콘)
         * - 이미지 파일 확장자들
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}