'use client';

import { useState, useRef, Fragment, useEffect } from 'react';
import styles from './container-history.module.css';

const HEADERS = ['조회번호', 'No', '수출입', '구분', '터미널', 'MOVE TIME', '모선', '항차', '선사', '적공', 'SIZE', 'POD', 'POL', '차량번호', 'RFID'];

// [설정] 형의 시놀로지 외부 주소 명확히 고정
// const BACKEND_BASE_URL = 'https://elssolution.synology.me:8443';
const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_ELS_BACKEND_URL || 'http://localhost:2929';

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
    const [containerInput, setContainerInput] = useState('');
    const [logLines, setLogLines] = useState([]);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);
    const [stepIndex, setStepIndex] = useState(1);
    const [downloadToken, setDownloadToken] = useState(null);
    const [resultFileName, setResultFileName] = useState('');
    const [waitSeconds, setWaitSeconds] = useState(0);

    const terminalRef = useRef(null);
    const waitStartedAtRef = useRef(null);

    // [BIOS UI] 진단창 상태
    const [bootStatus, setBootStatus] = useState({
        init: { label: 'Initialize Driver', status: 'pending' },
        browser: { label: 'Start Browser', status: 'pending' },
        connect: { label: 'Connect to ETRANS', status: 'pending' },
        login: { label: 'User Auth', status: 'pending' },
        menu: { label: 'Load Menu', status: 'pending' },
    });

    // 상세 로그 자동 스크롤
    useEffect(() => {
        if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }, [logLines]);

    // 계정 정보 로드 (시작 시 호출)
    useEffect(() => {
        fetch(`${BACKEND_BASE_URL}/api/els/config`)
            .then(res => res.json())
            .then(data => {
                setDefaultUserId(data.defaultUserId || '');
                if (data.hasSaved) setUseSavedCreds(true);
                setConfigLoaded(true);
            })
            .catch(() => setConfigLoaded(true));
    }, []);

    // 로그 분석하여 BIOS 진단창 업데이트 + 시간 정보 파싱
    useEffect(() => {
        const allLogs = logLines.join('\n');

        setBootStatus(prev => {
            const next = { ...prev };

            // 시간 정보 파싱 함수
            const getTime = (keyword) => {
                const match = allLogs.match(new RegExp(`\\[(\\s*[\\d.]+s)\\].*${keyword}`));
                return match ? match[1].trim() : null;
            };

            // 각 단계별 키워드 매칭 및 시간 추출
            if (allLogs.includes('크롬 드라이버')) {
                next.init.status = 'done';
                next.init.time = getTime('크롬 드라이버');
            }
            if (allLogs.includes('브라우저 실행')) {
                next.browser.status = 'done';
                next.browser.time = getTime('브라우저 실행');
            }
            if (allLogs.includes('사이트 접속')) {
                next.connect.status = 'done';
                next.connect.time = getTime('사이트 접속');
            }
            if (allLogs.includes('로그인 성공') || allLogs.includes('로그인 완료')) {
                next.login.status = 'done';
                next.login.time = getTime('로그인 성공');
            }
            if (allLogs.includes('메뉴 진입 성공') || allLogs.includes('입력창 발견')) {
                next.menu.status = 'done';
                next.menu.time = getTime('메뉴 진입 성공');
            }

            // 에러 체크
            if (allLogs.includes('[오류]') || allLogs.includes('[예외]') || allLogs.includes('실패')) {
                Object.keys(next).forEach(key => {
                    if (next[key].status === 'pending') next[key].status = 'error';
                });
            }

            return next;
        });
    }, [logLines]);

    const handleSaveCreds = async () => {
        const id = userId?.trim();
        const pw = userPw;
        if (!id || !pw) return;
        setSavingCreds(true);
        try {
            const res = await fetch(`${BACKEND_BASE_URL}/api/els/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: id, userPw: pw }),
            });
            if (!res.ok) throw new Error('저장 실패');
            setDefaultUserId(id);
            setUseSavedCreds(true);
            setLogLines(prev => [...prev, '[계정] 시놀로지에 아이디 저장 완료!']);
        } catch (err) {
            setLogLines(prev => [...prev, `[오류] 아이디 저장 실패: ${err.message}`]);
        } finally {
            setSavingCreds(false);
        }
    };

    const runLogin = async () => {
        if (!useSavedCreds && userId && userPw) await handleSaveCreds();
        setLoginError(null);
        setLoginLoading(true);
        setLogLines(prev => [...prev, `[네트워크] ${BACKEND_BASE_URL}/api/els/login 접속 중...`]);
        try {
            const res = await fetch(`${BACKEND_BASE_URL}/api/els/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ useSavedCreds, userId: userId.trim(), userPw }),
            });
            const data = await res.json();

            // 백엔드/데몬에서 받은 로그 추가
            if (data.log && Array.isArray(data.log)) {
                setLogLines(prev => [...prev, ...data.log]);
            }

            if (data.ok) {
                setStepIndex(2);
                setLogLines(prev => [...prev, '[성공] 로그인 완료. 조회를 시작하세요.']);
            } else {
                throw new Error(data.error || '로그인 실패');
            }
        } catch (err) {
            setLogLines(prev => [...prev, `[오류] ${err.message}`]);
            setLoginError('네트워크 및 계정 정보를 확인하세요.');
        } finally {
            setLoginLoading(false);
        }
    };

    const runSearch = async () => {
        const containers = parseContainerInput(containerInput);
        if (containers.length === 0) return;
        setLoading(true);
        setStepIndex(3);
        setResult(null);
        try {
            const res = await fetch(`${BACKEND_BASE_URL}/api/els/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ containers, useSavedCreds }),
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.startsWith('LOG:')) setLogLines(prev => [...prev, line.slice(4)]);
                    else if (line.startsWith('RESULT:')) {
                        const data = JSON.parse(line.slice(7));
                        setResult(data);
                        if (data.downloadToken) {
                            setDownloadToken(data.downloadToken);
                            setResultFileName(`els_결과_${new Date().getTime()}.xlsx`);
                            setStepIndex(4);
                        }
                    }
                }
            }
        } catch (err) {
            setLogLines(prev => [...prev, `[오류] 조회 실패: ${err.message}`]);
            setStepIndex(2);
        } finally {
            setLoading(false);
        }
    };

    const downloadExcel = () => {
        if (!downloadToken) return;
        window.open(`${BACKEND_BASE_URL}/api/els/download?token=${downloadToken}&filename=${resultFileName}`, '_blank');
    };

    return (
        <div className={styles.page}>
            <h1 className={styles.title}>els 컨테이너 이력조회</h1>
            <p className={styles.desc}>ETRANS 외부 접속 인프라 (Synology 8443)</p>

            <div className={styles.mainModule}>
                <div className={styles.leftPanel}>
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>계정 설정</h2>
                        {loginError && <div className={styles.loginErrorBanner}>{loginError}</div>}
                        <div className={styles.credRow}>
                            <input type="text" placeholder="ID" value={useSavedCreds ? defaultUserId : userId} onChange={(e) => setUserId(e.target.value)} className={styles.input} disabled={useSavedCreds && !!defaultUserId} />
                            <input type="password" placeholder="PW" value={userPw} onChange={(e) => setUserPw(e.target.value)} className={styles.input} disabled={useSavedCreds && !!defaultUserId} />
                            <button onClick={runLogin} className={styles.btnLogin} disabled={loginLoading}>{loginLoading ? '접속중' : '로그인'}</button>
                        </div>
                        <label className={styles.checkLabel}>
                            <input type="checkbox" checked={useSavedCreds} onChange={(e) => setUseSavedCreds(e.target.checked)} />
                            <span>저장된 계정 사용 (자동 저장)</span>
                        </label>
                    </section>

                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>컨테이너 입력</h2>
                        <textarea value={containerInput} onChange={(e) => setContainerInput(e.target.value)} className={styles.textarea} placeholder="번호를 입력하세요" rows={6} />
                        <button onClick={runSearch} className={styles.btnPrimary} disabled={loading || stepIndex < 2}>조회 실행</button>
                    </section>
                </div>

                <div className={styles.rightPanel}>
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>시스템 상태</h2>
                        <div style={{ fontFamily: "'Consolas', monospace", backgroundColor: '#0a0a0a', color: '#00ff00', padding: '12px', borderRadius: '4px', border: '1px solid #333' }}>
                            <div style={{ borderBottom: '1px solid #333', marginBottom: '8px', fontSize: '12px', color: '#0ff' }}>SYSTEM DIAGNOSTIC</div>
                            {Object.entries(bootStatus).map(([key, val]) => (
                                <div key={key} style={{ display: 'flex', gap: '10px', fontSize: '13px', marginBottom: '4px' }}>
                                    <span style={{
                                        color: val.status === 'done' ? '#00ff00' : val.status === 'error' ? '#ff0000' : '#666',
                                        minWidth: '50px'
                                    }}>
                                        {val.status === 'done' ? '[ OK ]' : val.status === 'error' ? '[FAIL]' : '[    ]'}
                                    </span>
                                    <span style={{ flex: 1 }}>{val.label}</span>
                                    {val.time && <span style={{ color: '#888', fontSize: '11px' }}>{val.time}</span>}
                                </div>
                            ))}
                        </div>
                        <h3 style={{ marginTop: '15px', fontSize: '13px', color: '#666' }}>상세 로그</h3>
                        <pre ref={terminalRef} className={styles.terminal}>
                            {logLines.map((line, i) => <div key={i}>{line}</div>)}
                        </pre>
                    </section>
                </div>
            </div>

            {/* 결과 테이블 UI 복구 */}
            {result && (
                <section className={styles.section} style={{ marginTop: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <h2 className={styles.sectionTitle}>조회 결과 ({result.sheet1?.length || 0}건)</h2>
                        {downloadToken && <button onClick={downloadExcel} className={styles.btnDownload} style={{ backgroundColor: '#28a745', color: 'white', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>엑셀 다운로드</button>}
                    </div>
                    <div className={styles.tableWrap} style={{ overflowX: 'auto' }}>
                        <table className={styles.table} style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f8f9fa' }}>
                                    {HEADERS.map((h, i) => <th key={i} style={{ border: '1px solid #dee2e6', padding: '8px', fontSize: '12px' }}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {result.sheet1?.map((row, i) => (
                                    <tr key={i}>
                                        {row.map((cell, j) => <td key={j} style={{ border: '1px solid #dee2e6', padding: '8px', fontSize: '12px' }}>{cell || ''}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </div>
    );
}