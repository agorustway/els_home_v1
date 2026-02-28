'use client';
import { useState, useEffect } from 'react';

export default function SplashScreen() {
    const [show, setShow] = useState(true);

    useEffect(() => {
        // 이미 스플래시를 본 적 있는지 확인 (세션 스토리지 사용 - 웹앱/브라우저 열릴 때 1회만 표시)
        const hasSeenSplash = sessionStorage.getItem('hasSeenSplash');

        // PWA(독립 앱 모드)인지 확인
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

        // PWA 모드이면서, 첫 진입일 때만 스플래시 표시 (웹 브라우저로 접근할 땐 안 띄움)
        if (hasSeenSplash || !isStandalone) {
            setShow(false);
            return;
        }

        // 스플래시 표시 후 1.5초(CSS 애니메이션 대기) 뒤에 DOM에서 완전 제거
        const timer = setTimeout(() => {
            setShow(false);
            sessionStorage.setItem('hasSeenSplash', 'true');
        }, 2100); // 1.5초 유지 + 0.5초 페이드아웃 + 0.1초 여유

        return () => clearTimeout(timer);
    }, []);

    if (!show) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: '#ffffff',
            zIndex: 9999999, // 무엇보다 최상단으로
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            animation: 'customFadeOut 0.5s ease-in-out 1.5s forwards', // 1.5초 유지 후 0.5초간 투명화
            pointerEvents: 'none', // 사용자 클릭 방해 안 함
        }}>
            <img
                src="/splash.jpg"
                alt="Splash Screen"
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover' // 화면 비율과 상관없이 꽉 채우기 (여백 없음)
                }}
            />
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes customFadeOut {
                    from { opacity: 1; visibility: visible; }
                    to { opacity: 0; visibility: hidden; }
                }
            `}} />
        </div>
    );
}
