'use client';
import { createClient } from '../../utils/supabase/client';
import { useSearchParams } from 'next/navigation';
import styles from './login.module.css';
import { motion } from 'framer-motion';

export default function LoginPage() {
    const searchParams = useSearchParams();
    const next = searchParams.get('next') || '/';
    const supabase = createClient();

    const handleLogin = async (provider) => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
            },
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
                    <h1>관리자/임직원 로그인</h1>
                    <p>이엘에스솔루션 서비스 이용을 위해 로그인해 주세요.</p>
                </div>

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
                    <a href="/" className={styles.backHome}>홈으로 돌아가기</a>
                </div>
            </motion.div>
        </div>
    );
}
