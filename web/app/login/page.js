'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../utils/supabase/client';
import { useSearchParams, useRouter } from 'next/navigation';
import styles from './login.module.css';
import { motion } from 'framer-motion';

function LoginForm() {
    const searchParams = useSearchParams();
    const [next, setNext] = useState('/');
    const supabase = createClient();
    const router = useRouter();
    const [isInAppBrowser, setIsInAppBrowser] = useState(false);

    useEffect(() => {
        const ua = navigator.userAgent.toLowerCase();
        // 네이버, 카카오, 인스타그램 등 인앱 브라우저 여부 확인
        const isInApp = /kakao|instagram|line|naver|fbav|fb_iab|messenger/i.test(ua);
        setIsInAppBrowser(isInApp);
    }, []);

    const copyToClipboard = () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            alert('주소가 복사되었습니다. 브라우저(Chrome/Safari) 주소창에 붙여넣어 주세요.');
        }).catch(err => {
            console.error('Copy failed:', err);
        });
    };

    useEffect(() => {
        const nextParam = searchParams.get('next');
        if (nextParam) {
            setNext(nextParam);
        } else if (typeof document !== 'undefined' && document.referrer) {
            // Only redirect back to our own domain to avoid open redirect vulnerabilities
            try {
                const referrerUrl = new URL(document.referrer);
                if (referrerUrl.origin === window.location.origin) {
                    const path = referrerUrl.pathname + referrerUrl.search;
                    if (path !== '/login' && path !== '/auth/callback') {
                        setNext(path);
                    }
                }
            } catch (e) {
                // Ignore invalid URLs
            }
        }
    }, [searchParams]);

    const handleLogin = async (provider) => {
        if (provider === 'naver') {
            const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
            if (!clientId) {
                alert('네이버 로그인이 현재 설정되지 않았습니다. 관리자에게 문의하세요.');
                return;
            }
            const redirectUri = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
            const state = Math.random().toString(36).substring(2);
            const nonce = Math.random().toString(36).substring(2);
            // Store state and nonce in cookies to verify on callback
            document.cookie = `oauth_state=${state}; path=/; max-age=300`; // Expires in 5 minutes
            document.cookie = `oauth_nonce=${nonce}; path=/; max-age=300`; // Expires in 5 minutes

            const scope = 'openid';
            const naverAuthUrl = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}&nonce=${nonce}&auth_type=reauthenticate`;
            window.location.href = naverAuthUrl;
            return;
        }

        const options = {
            redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        };

        if (provider === 'google') {
            options.queryParams = {
                prompt: 'select_account',
                access_type: 'offline',
            };
        } else if (provider === 'kakao') {
            options.queryParams = {
                prompt: 'login',
            };
        }

        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options,
        });

        if (error) {
            console.error('Login error:', error.message);
            alert('로그인 중 오류가 발생했습니다.');
        }
    };

    return (
        <div className={styles.loginPage}>
            <motion.div
                className={styles.loginCard}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className={styles.header}>
                    <img src="/images/logo.png" alt="ELS SOLUTION" className={styles.logo} />
                    <h1>로그인</h1>
                    <p>이엘에스솔루션 서비스 이용을 위해 로그인해 주세요.</p>
                </div>

                {isInAppBrowser && (
                    <div className={styles.inAppBanner}>
                        <div className={styles.inAppHeader}>
                            <strong>⚠️ 보안 브라우저 안내</strong>
                        </div>
                        <p>현재 브라우저(네이버/카카오 등)에서는 구글 로그인이 차단될 수 있습니다.</p>

                        <div className={styles.guideContainer}>
                            {/iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) ? (
                                <div className={styles.iosGuide}>
                                    <p>아이폰 사용자는 <strong>우측 하단 [ ⋮ ]</strong> 또는 <strong>[내보내기]</strong> 버튼을 눌러 <strong>&quot;Safari로 열기&quot;</strong>를 선택해 주세요.</p>
                                </div>
                            ) : (
                                <div className={styles.androidGuide}>
                                    <p>안드로이드 사용자는 자동으로 <strong>Chrome</strong>이 실행되지 않을 경우 아래 버튼을 눌러 주소를 복사한 뒤 크롬에 붙여넣어 주세요.</p>
                                </div>
                            )}
                        </div>

                        <button className={styles.copyBtn} onClick={copyToClipboard}>
                            현재 페이지 주소 복사하기
                        </button>
                    </div>
                )}

                <div className={styles.buttonGroup}>
                    <button
                        className={styles.googleBtn}
                        onClick={() => handleLogin('google')}
                    >
                        <img src="https://www.google.com/favicon.ico" alt="Google" />
                        Google로 계속하기
                    </button>

                    <button
                        className={styles.kakaoBtn}
                        onClick={() => handleLogin('kakao')}
                    >
                        <img src="https://developers.kakao.com/favicon.ico" alt="Kakao" />
                        카카오로 계속하기
                    </button>
                </div>

                <div className={styles.footer}>
                    <p>계정이 없으신가요? 관리자에게 문의하세요.</p>
                    <div className={styles.navLinks}>
                        {next.startsWith('/employees') ? (
                            <Link href="/employees" className={styles.backLink}>임직원 포털로 돌아가기</Link>
                        ) : (
                            <button onClick={() => router.back()} className={styles.backLink}>이전 페이지로</button>
                        )}
                        <span className={styles.separator}>|</span>
                        <Link href="/" className={styles.backHome}>홈으로 가기</Link>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className={styles.loginPage}>
                <div className={styles.loginCard}>
                    <p>로딩 중...</p>
                </div>
            </div>
        }>
            <LoginForm />
        </Suspense>
    );
}
