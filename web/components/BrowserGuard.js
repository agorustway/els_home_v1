'use client';
import { useEffect } from 'react';

/**
 * BrowserGuard: 카카오톡, 네이버, 인스타그램 등 인앱 브라우저를 감지하여
 * 크롬(안드로이드) 또는 사파리(iOS) 실행을 유도하는 자동 리디렉션 컴포넌트입니다.
 */
export default function BrowserGuard() {
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const ua = navigator.userAgent.toLowerCase();
        const isInApp = /kakao|instagram|naver|line|fbav|fb_iab|messenger/i.test(ua);
        const isAndroid = /android/i.test(ua);
        // IOS는 카카오톡만 강제 전환이 가능 (kakaotalk://) 그 외엔 안내 필요
        
        if (!isInApp) return;

        const currentUrl = window.location.href;
        const domainAndPath = currentUrl.replace(/^https?:\/\//i, '');

        if (isAndroid) {
            // 안드로이드: 구글 크롬 설치 여부와 상관없이 intent 실행
            // window.location.href = `intent://${domainAndPath}#Intent;scheme=https;package=com.android.chrome;end;`;
            // 일부 구형 브라우저 대응을 위해 window.location 가끔 안 먹을 수 있음
            const url = `intent://${domainAndPath}#Intent;scheme=https;package=com.android.chrome;end;`;
            window.location.assign(url);
        } else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
            if (ua.includes('kakaotalk')) {
                window.location.assign(`kakaotalk://web/openExternal?url=${encodeURIComponent(currentUrl)}`);
            }
        }
    }, []);

    return null;
}
