'use client';

import { useState, useEffect } from 'react';

export default function PwaMigrationNotice() {
    const [showNotice, setShowNotice] = useState(false);
    const EXPECTED_DOMAIN = 'elssolution.net'; // 미래의 공식 도메인

    useEffect(() => {
        // 브라우저 환경에서만 동작
        if (typeof window === 'undefined') return;

        // PWA 모드(standalone)로 실행 중인지 확인
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

        // 현재 호스트네임이 설정된 미래의 도메인과 다르고, 예상 도메인이 유효할 때 (localhost 테스트 등 제외)
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.');

        // 나중에 elssolution.net 으로 완전히 서버를 이전했을 때:
        // nollae.com 으로 접속(또는 설치된 PWA)한 사용자는 이 알림을 보게 됩니다.
        if (isStandalone && !isLocalhost && window.location.hostname !== EXPECTED_DOMAIN) {
            // 아직 elssolution.net 서버가 준비되지 않았을 수 있으므로 지금 바로 띄우지 않고,
            // 향후 서버 도메인이 elssolution.net으로 통일되었을 때만 작동하도록 플래그 활용 가능.
            // 여기서는 미리 로직을 심어둡니다.

            // 테스트용 또는 추후 적용을 위해 주석/조건 해제 가능:
            // setShowNotice(true); 
        }
    }, []);

    if (!showNotice) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 99999,
            display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
            <div style={{
                background: '#fff', padding: '30px', borderRadius: '16px', maxWidth: '400px', width: '90%',
                textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
            }}>
                <h3 style={{ fontSize: '1.25rem', color: '#1e293b', marginBottom: '16px', fontWeight: 'bold' }}>
                    ⚠️ 앱 업데이트 안내
                </h3>
                <p style={{ color: '#475569', fontSize: '0.95rem', marginBottom: '24px', lineHeight: '1.6' }}>
                    새로운 공식 도메인(<b>{EXPECTED_DOMAIN}</b>)으로 서비스가 이전되었습니다.<br /><br />
                    현재 구버전 앱을 사용 중이십니다.<br />
                    원활한 사용을 위해 현재 앱을 <b>삭제</b>하시고, <br />
                    새로운 주소에서 <b>다시 설치(홈 화면에 추가)</b>해 주세요.
                </p>
                <button
                    onClick={() => { window.location.href = `https://${EXPECTED_DOMAIN}`; }}
                    style={{
                        background: '#3b82f6', color: '#fff', border: 'none', padding: '12px 20px',
                        borderRadius: '8px', fontWeight: 'bold', width: '100%', cursor: 'pointer',
                        fontSize: '1rem'
                    }}
                >
                    새로운 주소로 이동하기
                </button>
            </div>
        </div>
    );
}
