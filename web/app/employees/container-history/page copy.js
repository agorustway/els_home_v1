'use client';

import { useState, useRef, Fragment, useEffect } from 'react';
import styles from './container-history.module.css';

const HEADERS = ['조회번호', 'No', '수출입', '구분', '터미널', 'MOVE TIME', '모선', '항차', '선사', '적공', 'SIZE', 'POD', 'POL', '차량번호', 'RFID'];

// [필독] 형의 시놀로지 외부 접속 주소를 변수로 딱 고정해.
const BACKEND_BASE_URL = 'https://elssolution.synology.me:8443';

function parseContainerInput(text) {
    if (!text || !text.trim()) return [];
    const raw = text.split(/[\n,;\s]+/).map(s => s.replace(/\s/g, '').toUpperCase()).filter(Boolean);
    return [...new Set(raw)];
}

export default function ContainerHistoryPage() {
    const [useSavedCreds, setUseSavedCreds] = useState(true);
    const [defaultUserId, setDefaultUserId] = useState('');
    const [userId, setUserId] = useState('');
    const [userPw, setUserPw] = useState('');
    const [configLoaded, setConfigLoaded] = useState(false);
    const [savingCreds, setSavingCreds] = useState(false);
    const [elsAvailable, setElsAvailable] = useState(null);
    const [loginError, setLoginError] = useState(null);
    const [loginProgressLine, setLoginProgressLine] = useState(null);
    const [containerInput, setContainerInput] = useState('');
    const [logLines, setLogLines] = useState([]);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);
    const [stepIndex, setStepIndex] = useState(1);
    const [waitSeconds, setWaitSeconds] = useState(0);

    const terminalRef = useRef(null);
    const loginStartTimeRef = useRef(null);
    const loginProgressIntervalRef = useRef(null);
    const waitStartedAtRef = useRef(null);

    // [BIOS UI] 부팅/로그인 단계 상태 관리
    const [bootStatus, setBootStatus] = useState({
        init: { label: 'Initialize Driver', status: 'pending' },
        browser: { label: 'Start Browser', status: 'pending' },
        connect: { label: 'Connect to ETRANS', status: 'pending' },
        login: { label: 'User Auth', status: 'pending' },
        menu: { label: 'Load Menu', status: 'pending' },
    });

    // 1. 서버 연결 상태 확인
    useEffect(() => {
        fetch(`${BACKEND_BASE_URL}/api/els/capabilities`)
            .then((res) => res.json())
            .then((data) => setElsAvailable(data.available === true))
            .catch(() => setElsAvailable(false));
    }, []);

    // 2. 저장된 계정 정보 로드 (상대 경로 -> 절대 경로로 수정)
    useEffect(() => {
        fetch(`${BACKEND_BASE_URL}/api/els/config`)
            .then((res) => res.json())
            .then((data) => {
                setDefaultUserId(data.defaultUserId || '');
                if (!data.hasSaved) setUseSavedCreds(false);
                setConfigLoaded(true);
            })
            .catch(() => setConfigLoaded(true));
    }, []);

    // 3. 계정 저장 함수 (DB에 아이디 저장 안 되던 범인 검거)
    const handleSaveCreds = async () => {
        const id = userId?.trim();
        const pw = userPw;
        if (!id || !pw) return;
        setSavingCreds(true);
        setLogLines(prev => [...prev, '[계정] 시놀로지 서버에 계정 저장 시도...']);
        try {
            const res = await fetch(`${BACKEND_BASE_URL}/api/els/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: id, userPw: pw }),
            });
            if (!res.ok) throw new Error('저장 실패');
            setDefaultUserId(id);
            setUserId('');
            setUserPw('');
            setUseSavedCreds(true);
            setLogLines(prev => [...prev, '[계정] 저장 성공! 이제 이 계정으로 자동 접속합니다.']);
        } catch (err) {
            setLogLines(prev => [...prev, `[오류] 계정 저장 실패: ${err.message}`]);
        } finally {
            setSavingCreds(false);
        }
    };

    // 4. 로그인 실행 (상대 경로 탈출)
    const runLogin = async () => {
        if (!useSavedCreds && userId && userPw) {
            await handleSaveCreds(); // 신규 입력 시 자동 저장 트리거
        }
        setLoginError(null);
        setLoginLoading(true);
        setLogLines(prev => [...prev, `[네트워크] ${BACKEND_BASE_URL}/api/els/login 접속 중...`]);
        
        try {
            const res = await fetch(`${BACKEND_BASE_URL}/api/els/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    useSavedCreds,
                    userId: useSavedCreds ? undefined : userId.trim(),
                    userPw: useSavedCreds ? undefined : userPw,
                }),
            });
            const data = await res.json();
            if (data.ok) {
                setStepIndex(2);
                setLogLines(prev => [...prev, '[성공] ETRANS 로그인 완료. 조회를 시작하세요.']);
            } else {
                throw new Error(data.error || '로그인 실패');
            }
        } catch (err) {
            setLogLines(prev => [...prev, `[오류] 접속 실패: ${err.message}`]);
            setLoginError('아이디·비밀번호 또는 NAS 연결을 확인하세요.');
        } finally {
            setLoginLoading(false);
        }
    };

    // 5. 조회 실행 (엑셀 다운로드 주소까지 완벽 수정)
    const runSearch = async () => {
        setLoading(true);
        setStepIndex(3);
        try {
            const res = await fetch(`${BACKEND_BASE_URL}/api/els/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    containers: parseContainerInput(containerInput),
                    useSavedCreds,
                }),
            });
            const data = await res.json();
            setResult(data);
            setStepIndex(4);
        } catch (err) {
            setLogLines(prev => [...prev, `[오류] 조회 실패: ${err.message}`]);
            setStepIndex(2);
        } finally {
            setLoading(false);
        }
    };

    // BIOS 스타일 상태 표시창 (형이 공들인 디자인)
    const renderBootStatus = () => (
        <div style={{ fontFamily: "'Consolas', monospace", backgroundColor: '#0a0a0a', color: '#00ff00', padding: '12px', borderRadius: '4px', border: '1px solid #333' }}>
            <div style={{ borderBottom: '1px solid #333', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold' }}>SYSTEM DIAGNOSTIC</div>
            {Object.entries(bootStatus).map(([key, val]) => (
                <div key={key} style={{ display: 'flex', gap: '10px', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: val.status === 'done' ? '#00ff00' : (val.status === 'running' ? '#ffaa00' : '#666') }}>
                        {val.status === 'done' ? '[ OK ]' : (val.status === 'running' ? '[....]' : '[    ]')}
                    </span>
                    <span>{val.label}</span>
                </div>
            ))}
        </div>
    );

    return (
        <div className={styles.page}>
            <h1 className={styles.title}>els 컨테이너 이력조회</h1>
            <p className={styles.desc}>ETRANS 외부 접속 인프라 (elssolution.net)</p>

            <div className={styles.mainModule}>
                <div className={styles.leftPanel}>
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>계정 설정</h2>
                        {loginError && <div className={styles.loginErrorBanner}>{loginError}</div>}
                        <div className={styles.credRow}>
                            <input 
                                type="text" 
                                placeholder="아이디" 
                                value={useSavedCreds ? defaultUserId : userId} 
                                onChange={(e) => setUserId(e.target.value)}
                                className={styles.input}
                                disabled={useSavedCreds && !!defaultUserId}
                            />
                            <input 
                                type="password" 
                                placeholder="비밀번호" 
                                value={userPw} 
                                onChange={(e) => setUserPw(e.target.value)}
                                className={styles.input}
                                disabled={useSavedCreds && !!defaultUserId}
                            />
                            <button onClick={runLogin} className={styles.btnLogin} disabled={loginLoading}>
                                {loginLoading ? '접속중' : '로그인'}
                            </button>
                        </div>
                        <label className={styles.checkLabel}>
                            <input type="checkbox" checked={useSavedCreds} onChange={(e) => setUseSavedCreds(e.target.checked)} />
                            <span>저장된 계정 사용 (자동 저장)</span>
                        </label>
                    </section>

                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>컨테이너 입력</h2>
                        <textarea 
                            value={containerInput} 
                            onChange={(e) => setContainerInput(e.target.value)}
                            className={styles.textarea}
                            placeholder="컨테이너 번호를 입력하세요"
                        />
                        <button onClick={runSearch} className={styles.btnPrimary} disabled={loading || stepIndex < 2}>
                            조회 실행
                        </button>
                    </section>
                </div>

                <div className={styles.rightPanel}>
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>시스템 상태</h2>
                        {renderBootStatus()}
                        <h3 style={{ marginTop: '15px', fontSize: '13px', color: '#666' }}>상세 로그</h3>
                        <pre ref={terminalRef} className={styles.terminal}>
                            {logLines.map((line, i) => <div key={i}>{line}</div>)}
                        </pre>
                    </section>
                </div>
            </div>
        </div>
    );
}