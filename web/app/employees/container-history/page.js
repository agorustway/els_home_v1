'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Script from 'next/script';
import styles from './container-history.module.css';

const HEADERS = ['컨테이너번호', 'No', '수출입', '구분', '터미널', 'MOVE TIME', '모선', '항차', '선사', '적공', 'SIZE', 'POD', 'POL', '차량번호', 'RFID'];
const ITEMS_PER_PAGE = 10;

// 배지 컴포넌트
function StatusBadge({ type, label }) {
    let className = styles.badge;
    if (label === '수입') className += ` ${styles.badgeImport}`;
    else if (label === '수출') className += ` ${styles.badgeExport}`;
    else if (label === '반입') className += ` ${styles.badgeInbox}`;
    else if (label === '반출') className += ` ${styles.badgeOutbox}`;
    else className += ` ${styles.badgeEmpty}`;

    return <span className={className}>{label || '-'}</span>;
}

// 타임라인 컴포넌트
function HistoryTimeline({ rows }) {
    return (
        <div className={styles.timelineWrapper}>
            <div className={styles.timeline}>
                {rows.map((row, i) => (
                    <div key={i} className={styles.timelineItem}>
                        <div className={styles.timelineDot} />
                        <div className={styles.timelineHeader}>
                            <span className={styles.timelineTime}>{row[5] || '시간 정보 없음'}</span>
                            <StatusBadge label={row[3]} />
                        </div>
                        <div className={styles.timelineContent}>
                            <div className={styles.contentItem}>
                                <span className={styles.contentLabel}>터미널</span>
                                <span>{row[4] || '-'}</span>
                            </div>
                            <div className={styles.contentItem}>
                                <span className={styles.contentLabel}>모선/항차</span>
                                <span>{row[6]} / {row[7]}</span>
                            </div>
                            <div className={styles.contentItem}>
                                <span className={styles.contentLabel}>수출입/적공</span>
                                <span>{row[2]} / {row[9]}</span>
                            </div>
                            <div className={styles.contentItem}>
                                <span className={styles.contentLabel}>차량/RFID</span>
                                <span>{row[13]} / {row[14]}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function parseContainerInput(text) {
    if (!text || !text.trim()) return [];
    const raw = text.split(/[\n,;\s]+/).map(s => s.replace(/\s/g, '').toUpperCase()).filter(Boolean);
    return [...new Set(raw)];
}

// 내부 실제 구현 컴포넌트 (클라이언트에서만 안전하게 동작)
function ContainerHistoryInner() {
    const [userId, setUserId] = useState('');
    const [userPw, setUserPw] = useState('');
    const [containerInput, setContainerInput] = useState(() => {
        if (typeof window !== 'undefined') return sessionStorage.getItem('els_input') || '';
        return '';
    });
    const [logLines, setLogLines] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = sessionStorage.getItem('els_logs');
            try { return saved ? JSON.parse(saved) : []; } catch (e) { return []; }
        }
        return [];
    });
    const [result, setResult] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = sessionStorage.getItem('els_result');
            try { return saved ? JSON.parse(saved) : null; } catch (e) { return null; }
        }
        return null;
    });
    const [loading, setLoading] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginSuccess, setLoginSuccess] = useState(() => {
        if (typeof window !== 'undefined') return sessionStorage.getItem('els_login_success') === 'true';
        return false;
    }); // 로그인 성공 여부
    const [lastSavedInfo, setLastSavedInfo] = useState(''); // 계정 저장 시간

    const [downloadToken, setDownloadToken] = useState(null);
    const [resultFileName, setResultFileName] = useState('');
    const [expandedContainers, setExpandedContainers] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
    const [searchFilter, setSearchFilter] = useState('');
    const [activeStatFilter, setActiveStatFilter] = useState(null); // '수출', '수입' 등 필터
    const [showBrowser, setShowBrowser] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const elapsedSecondsRef = useRef(0);
    const pendingSearchRef = useRef(null);
    const hasInitialized = useRef(false);

    const terminalRef = useRef(null);
    const fileInputRef = useRef(null);
    const timerRef = useRef(null);

    // 환경 변수 안전하게 가져오기
    const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_ELS_BACKEND_URL || 'http://localhost:2929';

    // 타이머 로직
    const startTimer = useCallback(() => {
        setElapsedSeconds(0);
        elapsedSecondsRef.current = 0;
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setElapsedSeconds(prev => {
                const next = prev + 0.1;
                elapsedSecondsRef.current = next;
                return next;
            });
        }, 100);
    }, []);

    const stopTimer = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    // 자동 스크롤
    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [logLines, elapsedSeconds]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);


    // 상태 변화 시 sessionStorage에 저장 (데이터 유실 방지 로직 강화)
    useEffect(() => {
        if (logLines.length > 0) {
            sessionStorage.setItem('els_logs', JSON.stringify(logLines));
        }
    }, [logLines]);

    useEffect(() => {
        if (result && Object.keys(result).length > 0) {
            sessionStorage.setItem('els_result', JSON.stringify(result));
        } else if (result === null) {
            // 명시적으로 null인 경우에만 삭제 (초기화 혹은 reset 시) - 단, 복원 전에는 수행하지 않음
            // (useState initializer가 sessionStorage를 읽으므로, result가 null이면 원래 없었던 것)
            sessionStorage.removeItem('els_result');
        }
    }, [result]);

    useEffect(() => {
        // 입력 기능은 사용자 편의를 위해 항상 저장하되, 
        // 앱 초기 로드 시 빈 값으로 덮어씌워지는 것을 방지 (가드 추가)
        if (containerInput) {
            sessionStorage.setItem('els_input', containerInput);
        } else if (typeof window !== 'undefined' && containerInput === '') {
            // 실제로 사용자가 다 지운 경우에만 삭제 고려 (선택 사항)
            // 여기서는 페이지 로드 시점의 빈 값을 무시하도록 함
            if (hasInitialized.current) {
                sessionStorage.setItem('els_input', '');
            }
        }
    }, [containerInput]);

    const handleSaveCreds = useCallback(async (id, pw) => {
        const targetId = id || userId;
        const targetPw = pw || userPw;
        if (!targetId || !targetPw) return;

        try {
            const res = await fetch('/api/employees/els-creds', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ elsId: targetId.trim(), elsPw: targetPw }),
            });
            if (res.ok) {
                setLastSavedInfo(new Date().toLocaleString('ko-KR'));
                setLogLines(prev => [...prev, '[계정] 개인 계정 정보가 DB에 안전하게 저장되었습니다.']);
            }
        } catch (err) {
            console.error('Save creds error:', err);
        }
    }, [userId, userPw]);

    const handleLogin = useCallback(async (id, pw) => {
        const loginId = id || userId;
        const loginPw = pw || userPw;

        if (!loginId || !loginPw) {
            setLogLines(prev => [...prev, '[오류] ETRANS 아이디와 비밀번호가 필요합니다.']);
            return;
        }

        setLoginLoading(true);
        setLoginSuccess(false);
        startTimer();
        setLogLines(prev => [...prev, `[네트워크] ${BACKEND_BASE_URL}/api/els/login 접속 중...`]);

        try {
            const res = await fetch(`${BACKEND_BASE_URL}/api/els/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: loginId.trim(), userPw: loginPw, showBrowser: showBrowser }),
            });
            const data = await res.json();

            if (data.log && Array.isArray(data.log)) {
                setLogLines(prev => [...prev, ...data.log]);
            }

            if (data.ok) {
                setLogLines(prev => [...prev, `[${elapsedSecondsRef.current.toFixed(1)}s] [성공] 로그인 완료!`]);
                setLoginSuccess(true);
                sessionStorage.setItem('els_login_success', 'true');
                sessionStorage.setItem('els_login_timestamp', Date.now().toString());
                // [고도화 2] 로그인 대기열에 있던 검색 작업 자동 실행
                if (pendingSearchRef.current) {
                    const queue = [...pendingSearchRef.current];
                    pendingSearchRef.current = null;
                    setLogLines(prev => [...prev, `[자동] 로그인 성공! 즉시 ${queue.length}건 조회를 시작합니다.`]);

                    // 상태 변경 대기 없이 즉시 명시적 계정 정보로 실행
                    executeSearch(queue, loginId, loginPw);
                }
            } else {
                setLogLines(prev => [...prev, `[${elapsedSecondsRef.current.toFixed(1)}s] [실패] ${data.error || '로그인 실패'}`]);
                setLoginSuccess(false);
                sessionStorage.removeItem('els_login_success');
                sessionStorage.removeItem('els_login_timestamp');
                pendingSearchRef.current = null; // 로그인 실패 시 대기열 초기화
            }
        } catch (err) {
            setLogLines(prev => [...prev, `[오류] 로그인 중 예외 발생: ${err.message}`]);
            pendingSearchRef.current = null;
        } finally {
            setLoginLoading(false);
            stopTimer();
        }
    }, [userId, userPw, showBrowser, BACKEND_BASE_URL, startTimer, stopTimer]);

    // [고도화 3] 데이터베이스 계정 불러오기 및 자동 로그인
    useEffect(() => {
        if (hasInitialized.current) return;
        hasInitialized.current = true;

        const init = async () => {

            try {
                const res = await fetch('/api/employees/els-creds');
                const data = await res.json();

                if (data.elsId && data.elsPw) {
                    setUserId(data.elsId);
                    setUserPw(data.elsPw);
                    if (data.lastSaved) setLastSavedInfo(data.lastSaved);

                    const now = Date.now();
                    const savedTimestamp = sessionStorage.getItem('els_login_timestamp');
                    const savedSuccess = sessionStorage.getItem('els_login_success') === 'true';

                    // 데몬의 실제 상태 체크 (세션 유실 여부 확인)
                    let daemonActive = false;
                    let daemonAvailable = false;

                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try {
                            const healthRes = await fetch(`${BACKEND_BASE_URL}/api/els/capabilities`);
                            const healthData = await healthRes.json();
                            daemonAvailable = healthData.available;
                            daemonActive = healthData.driver_active;
                            if (daemonActive) break;
                        } catch (e) { }
                        if (attempt < 3) await new Promise(r => setTimeout(r, 600));
                    }

                    const hasResults = result && Object.keys(result).length > 0;
                    const isTimeValid = savedTimestamp && (now - parseInt(savedTimestamp)) < 45 * 60 * 1000;

                    const isSessionValid = savedSuccess && isTimeValid && (daemonActive || hasResults);

                    if (isSessionValid) {
                        setLogLines(prev => [...prev, `[세션] 기존 ETRANS 로그인이 유지되고 있습니다. (데몬:${daemonActive ? 'ON' : 'OFF'}, 결과:${hasResults ? 'O' : 'X'})`]);
                        setLoginSuccess(true);

                        // [자동조회] 세션이 살아있고 입력값이 있는데, '결과'가 아예 없는 경우에만 트리거
                        const containers = parseContainerInput(containerInput);
                        if (containers.length > 0 && !hasResults) {
                            setLogLines(prev => [...prev, `[자동] 대기 중인 ${containers.length}건에 대해 조회를 재개합니다.`]);
                            executeSearch(containers, data.elsId, data.elsPw);
                        }
                    } else {
                        if (!daemonAvailable) {
                            setLogLines(prev => [...prev, '[시스템] 데몬 서버가 응답하지 않습니다. 백그라운드 서버를 확인해주세요.']);
                        } else if (savedSuccess && !daemonActive) {
                            setLogLines(prev => [...prev, '[시스템] 데몬 세션이 종료(브라우저 꺼짐)되어 자동 재로그인을 시도합니다...']);
                        } else if (savedSuccess && !isTimeValid) {
                            setLogLines(prev => [...prev, '[시스템] 로그인 세션 시간이 만료되어 다시 로그인합니다.']);
                        } else {
                            // 단순 이동 후 복원 시에는 굳이 로그를 남기지 않거나 '복원' 메시지 출력
                            if (!containerInput && !hasResults) {
                                setLogLines(prev => [...prev, '[시스템] 저장된 계정 정보로 자동 로그인을 시작합니다...']);
                            }
                        }

                        // 자동 로그인 시도 시에도 입력값은 있지만 결과가 없다면 대기열에 추가
                        const containers = parseContainerInput(containerInput);
                        if (containers.length > 0 && !hasResults) {
                            pendingSearchRef.current = containers;
                        }
                        handleLogin(data.elsId, data.elsPw);
                    }
                }
            } catch (err) {
                console.error('Init error:', err);
            }
        };
        init();
    }, []); // Empty dependencies!

    // 세션 갱신 (55분마다) - 이제 DB에서 불러온 계정으로 갱신
    useEffect(() => {
        const interval = setInterval(() => {
            if (userId && userPw) { // Check if credentials are set
                setLogLines(prev => [...prev, '[세션] 55분 경과 - 세션 갱신 중...']);
                handleLogin(userId, userPw);
            }
        }, 55 * 60 * 1000); // 55분
        return () => clearInterval(interval);
    }, [handleLogin, userId, userPw]); // Add userId, userPw to dependencies

    const groupByContainer = (data) => {
        if (!data || !Array.isArray(data)) return {};
        const grouped = {};
        data.forEach(row => {
            const containerNo = row[0];
            if (!grouped[containerNo]) grouped[containerNo] = [];
            grouped[containerNo].push(row);
        });
        return grouped;
    };

    const executeSearch = async (targetContainers, id, pw) => {
        setLoading(true);
        startTimer();

        const finalId = id || userId;
        const finalPw = pw || userPw;

        setLogLines(prev => [...prev, `[검색] ${targetContainers.length}개 컨테이너 조회 시작... (${finalId})`]);

        try {
            const res = await fetch(`${BACKEND_BASE_URL}/api/els/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    containers: targetContainers,
                    showBrowser: showBrowser,
                    userId: finalId,
                    userPw: finalPw
                }),
            });

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.trim().startsWith('LOG:')) {
                        setLogLines(prev => [...prev, `[${elapsedSecondsRef.current.toFixed(1)}s] ${line.trim().substring(4)}`]);
                    } else if (line.trim().startsWith('RESULT:')) {
                        try {
                            const rawJson = line.trim().substring(7);
                            // 2중 방어: NaN 문자열을 null로 강제 치환
                            const cleanedJson = rawJson.replace(/:\s*NaN/g, ': null').replace(/,\s*NaN/g, ', null');
                            const data = JSON.parse(cleanedJson);

                            if (data.ok) {
                                setResult(groupByContainer(data.result));
                                setDownloadToken(data.downloadToken);
                                setResultFileName(data.fileName);
                                setLogLines(prev => [...prev, `[완료] 총 ${elapsedSecondsRef.current.toFixed(1)}초 소요 - ${data.result?.length || 0}건 조회 완료`]);
                            } else {
                                setLogLines(prev => [...prev, `[실패] ${data.error || '조회 실패'}`]);
                            }
                        } catch (err) {
                            setLogLines(prev => [...prev, `[오류] 결과 파싱 실패: ${err.message}`]);
                        }
                    }
                }
            }
        } catch (err) {
            setLogLines(prev => [...prev, `[오류] 조회 중 통신 실배: ${err.message}`]);
        } finally {
            setLoading(false);
            stopTimer();
        }
    };

    const runSearch = async () => {
        const containers = parseContainerInput(containerInput);
        if (!containers.length) {
            setLogLines(prev => [...prev, '[오류] 컨테이너 번호를 입력하세요']);
            return;
        }

        // [고도화 4] 로그인 전 조회 요청 시 대기열에 추가
        if (!loginSuccess && !loginLoading) {
            setLogLines(prev => [...prev, '[알림] 로그인 전입니다. 로그인을 먼저 진행합니다...']);
            pendingSearchRef.current = containers;
            handleLogin(userId, userPw); // 기존 입력된 ID/PW 사용
        } else if (loginLoading) {
            setLogLines(prev => [...prev, '[알림] 로그인이 완료되면 즉시 조회를 시작합니다. (대기 중)']);
            pendingSearchRef.current = containers;
        } else {
            executeSearch(containers);
        }
    };

    // [고도화 5] 엔터 키 핸들러
    const handleKeyDown = (e, target) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            if (target === 'login') {
                e.preventDefault();
                handleLogin();
            } else if (target === 'search') {
                e.preventDefault();
                runSearch();
            }
        }
    };

    const handleDownload = () => {
        if (!downloadToken) return;
        const url = `${BACKEND_BASE_URL}/api/els/download/${downloadToken}?filename=${encodeURIComponent(resultFileName || 'els_result.xlsx')}`;
        window.open(url, '_blank');
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                if (typeof XLSX === 'undefined') {
                    setLogLines(prev => [...prev, `[오류] XLSX 라이브러리가 로드되지 않았습니다.`]);
                    return;
                }
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

                const containers = jsonData.flat().filter(cell =>
                    cell && typeof cell === 'string' && cell.trim().length > 0
                ).map(cell => cell.toString().trim().toUpperCase());

                setContainerInput(containers.join('\n'));
                setLogLines(prev => [...prev, `[파일] ${containers.length}개 컨테이너 번호 불러옴`]);
            } catch (err) {
                setLogLines(prev => [...prev, `[오류] 파일 읽기 실패: ${err.message}`]);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleFileDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.xlsx')) {
            fileInputRef.current.files = e.dataTransfer.files;
            handleFileUpload({ target: { files: [file] } });
        }
    };

    const toggleContainer = (containerNo) => {
        setExpandedContainers(prev => ({
            ...prev,
            [containerNo]: !prev[containerNo]
        }));
    };

    const filteredContainers = result ? Object.keys(result).filter(cn => {
        // 검색 필터 체크
        const matchesSearch = cn.toLowerCase().includes(searchFilter.toLowerCase());
        if (!matchesSearch) return false;

        // 항목 필터(수출/수입 등) 체크
        if (activeStatFilter) {
            const latestRow = result[cn][0];
            const isNoData = latestRow[1] === 'NODATA';
            if (isNoData) return false;

            if (['수출', '수입'].includes(activeStatFilter)) {
                return latestRow[2] === activeStatFilter;
            } else {
                return latestRow[3] === activeStatFilter;
            }
        }

        return true;
    }) : [];

    // 필터 토글 함수
    const toggleStatFilter = (category) => {
        if (activeStatFilter === category) {
            setActiveStatFilter(null);
        } else {
            setActiveStatFilter(category);
            setCurrentPage(1); // 필터 변경 시 첫 페이지로
        }
    };

    const totalPages = Math.ceil(filteredContainers.length / ITEMS_PER_PAGE);
    const paginatedContainers = filteredContainers.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // [고도화 6] 초기화 기능들
    const resetLogs = () => {
        if (confirm('실시간 로그를 모두 삭제할까요?')) {
            setLogLines([]);
            sessionStorage.removeItem('els_logs');
        }
    };

    const resetAll = () => {
        if (confirm('모든 입력값, 로그, 결과 데이터를 초기화할까요?')) {
            setLogLines([]);
            setResult(null);
            setContainerInput('');
            setSearchFilter('');
            setCurrentPage(1);
            sessionStorage.removeItem('els_logs');
            sessionStorage.removeItem('els_result');
            sessionStorage.removeItem('els_input');
            setLogLines(['[시스템] 모든 데이터가 초기화되었습니다.']);
        }
    };

    // 통계 계산
    const stats = result ? (() => {
        const containerNos = Object.keys(result);
        const latestRows = Object.values(result).map(rows => rows[0]);

        const exportCount = latestRows.filter(r => r[2] === '수출').length;
        const importCount = latestRows.filter(r => r[2] === '수입').length;
        const inboxCount = latestRows.filter(r => r[3] === '반입').length;
        const outboxCount = latestRows.filter(r => r[3] === '반출').length;
        const unloadingCount = latestRows.filter(r => r[3] === '양하').length;
        const loadingCount = latestRows.filter(r => r[3] === '적하').length;
        const noDataCount = latestRows.filter(r => r[1] === 'NODATA').length;

        return {
            export: exportCount,
            import: importCount,
            inbox: inboxCount,
            outbox: outboxCount,
            unloading: unloadingCount,
            loading: loadingCount,
            noData: noDataCount,
            total: containerNos.length
        };
    })() : null;

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '1rem' }}>
                    <h1 className={styles.title} style={{ margin: 0, marginRight: '8px' }}>컨테이너 이력조회</h1>
                    <a
                        href="https://etrans.klnet.co.kr"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.etransShortcut}
                        title="ETRANS 바로가기"
                    >
                        <img src="/images/etrans_logo.png" alt="eTrans 3.0" />
                    </a>
                    <a
                        href="https://www.tradlinx.com/ko/container-terminal-schedule"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.etransShortcut}
                        title="트래드링스 바로가기"
                    >
                        <img src="/images/tradlinx_logo.png" alt="Tradlinx" />
                    </a>
                </div>
                <div className={styles.topRow}>
                    <div className={styles.leftColumn}>
                        <div className={styles.section}>
                            <h2 className={styles.sectionTitle}>1. ETRANS 로그인</h2>
                            <div className={styles.inputGroup}>
                                <input
                                    type="text"
                                    placeholder="아이디"
                                    value={userId}
                                    onChange={e => setUserId(e.target.value)}
                                    onKeyDown={e => handleKeyDown(e, 'login')}
                                    className={`${styles.input} ${styles.loginInput}`}
                                />
                                <input
                                    type="password"
                                    placeholder="비밀번호"
                                    value={userPw}
                                    onChange={e => setUserPw(e.target.value)}
                                    onKeyDown={e => handleKeyDown(e, 'login')}
                                    className={`${styles.input} ${styles.loginInput}`}
                                />
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button onClick={() => handleLogin()} disabled={loginLoading} className={styles.button}>
                                        {loginLoading ? '접속 중...' : '로그인'}
                                    </button>
                                    <button onClick={() => handleSaveCreds()} className={styles.buttonSecondary} title="계정 정보 저장">💾</button>
                                </div>
                            </div>
                            {/* 개인 계정 저장일시 - 1번 섹션 내부 하단으로 이동 */}
                            {lastSavedInfo && (
                                <div style={{ marginTop: '4px' }}>
                                    <div className={styles.lastSaved} style={{ margin: 0 }}>
                                        개인 계정 저장일시: {lastSavedInfo}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <h2 className={styles.sectionTitle}>2. 컨테이너 조회</h2>
                                <label className={styles.debugLabel}>
                                    <input type="checkbox" checked={showBrowser} onChange={e => setShowBrowser(e.target.checked)} />
                                    브라우저 표시 (디버그)
                                </label>
                            </div>
                            <div className={styles.dropZone} onDrop={handleFileDrop} onDragOver={e => e.preventDefault()}>
                                <textarea
                                    placeholder="컨테이너 번호 입력 (줄바꿈/쉼표)... 또는 엑셀 드래그"
                                    value={containerInput}
                                    onChange={e => setContainerInput(e.target.value)}
                                    onKeyDown={e => handleKeyDown(e, 'search')}
                                    className={styles.textarea}
                                />
                            </div>
                            <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleFileUpload} style={{ display: 'none' }} />
                            <div className={styles.buttonGroup} style={{ alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button onClick={() => fileInputRef.current?.click()} className={styles.buttonSecondary}>엑셀 파일 선택</button>
                                    <button
                                        onClick={() => { setContainerInput(''); sessionStorage.removeItem('els_input'); }}
                                        className={styles.buttonSecondary}
                                        style={{ color: '#64748b' }}
                                        title="입력 내용 지우기"
                                    >
                                        비우기
                                    </button>
                                </div>
                                <button onClick={runSearch} disabled={loading} className={styles.button}>
                                    {loading ? '조회 중...' : loginLoading ? '로그인 후 자동 조회' : '조회 시작'}
                                </button>
                                <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                                    총 {parseContainerInput(containerInput).length}건
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className={styles.rightColumn}>
                        <div className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <h2 className={styles.sectionTitle}>실시간 로그</h2>
                                <button onClick={resetLogs} className={styles.pageButton} style={{ fontSize: '0.7rem' }}>로그 삭제</button>
                            </div>
                            <div ref={terminalRef} className={styles.terminal}>
                                {logLines.map((line, i) => <div key={i} className={styles.logLine}>{line}</div>)}
                                {(loading || loginLoading) && (
                                    <div className={styles.logLineActive}>
                                        <span className={styles.cursor}>_</span>
                                        <span style={{ color: '#fbbf24', marginLeft: '8px' }}>
                                            [실시간 수행 중... {elapsedSeconds.toFixed(1)}s]
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {stats && (
                    <div className={styles.statsRow}>
                        <div
                            className={`${styles.statCard} ${activeStatFilter === '수출' ? styles.statCardActive : ''}`}
                            onClick={() => toggleStatFilter('수출')}
                        >
                            <span className={styles.statLabel}>수출</span>
                            <span className={styles.statValue} style={{ color: '#22c55e' }}>{stats.export}<span className={styles.statUnit}>건</span></span>
                        </div>
                        <div
                            className={`${styles.statCard} ${activeStatFilter === '수입' ? styles.statCardActive : ''}`}
                            onClick={() => toggleStatFilter('수입')}
                        >
                            <span className={styles.statLabel}>수입</span>
                            <span className={styles.statValue} style={{ color: '#ef4444' }}>{stats.import}<span className={styles.statUnit}>건</span></span>
                        </div>
                        <div
                            className={`${styles.statCard} ${activeStatFilter === '반입' ? styles.statCardActive : ''}`}
                            onClick={() => toggleStatFilter('반입')}
                        >
                            <span className={styles.statLabel}>반입</span>
                            <span className={styles.statValue} style={{ color: '#3b82f6' }}>{stats.inbox}<span className={styles.statUnit}>건</span></span>
                        </div>
                        <div
                            className={`${styles.statCard} ${activeStatFilter === '반출' ? styles.statCardActive : ''}`}
                            onClick={() => toggleStatFilter('반출')}
                        >
                            <span className={styles.statLabel}>반출</span>
                            <span className={styles.statValue} style={{ color: '#ca8a04' }}>{stats.outbox}<span className={styles.statUnit}>건</span></span>
                        </div>
                        <div
                            className={`${styles.statCard} ${activeStatFilter === '양하' ? styles.statCardActive : ''}`}
                            onClick={() => toggleStatFilter('양하')}
                        >
                            <span className={styles.statLabel}>양하</span>
                            <span className={styles.statValue} style={{ color: '#8b5cf6' }}>{stats.unloading}<span className={styles.statUnit}>건</span></span>
                        </div>
                        <div
                            className={`${styles.statCard} ${activeStatFilter === '적하' ? styles.statCardActive : ''}`}
                            onClick={() => toggleStatFilter('적하')}
                        >
                            <span className={styles.statLabel}>적하</span>
                            <span className={styles.statValue} style={{ color: '#f59e0b' }}>{stats.loading}<span className={styles.statUnit}>건</span></span>
                        </div>
                    </div>
                )}

                {result && Object.keys(result).length > 0 && (
                    <div className={styles.section}>
                        <div className={styles.resultHeader}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <h2 className={styles.sectionTitle}>
                                    조회 결과 ({filteredContainers.length}건
                                    {stats?.noData > 0 && <span style={{ color: '#94a3b8', marginLeft: '8px', fontSize: '0.9rem', fontWeight: 500 }}>/ 데이터 없음 {stats.noData}건</span>})
                                </h2>
                                <button onClick={() => { if (confirm('결과 테이블만 초기화할까요?')) { setResult(null); sessionStorage.removeItem('els_result'); } }} className={styles.pageButton} style={{ fontSize: '0.7rem' }}>결과 초기화</button>
                            </div>
                            <div className={styles.resultActions}>
                                <input type="text" placeholder="결과 내 검색..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)} className={styles.searchInput} />
                                <button onClick={handleDownload} className={styles.button}>엑셀 다운로드</button>
                            </div>
                        </div>
                        <div className={styles.resultsList}>
                            <table className={styles.table}>
                                <thead className={styles.thead}>
                                    <tr>{HEADERS.map((h, i) => <th key={i}>{h}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {paginatedContainers.map(containerNo => {
                                        const rows = result[containerNo] || [];
                                        const isExpanded = expandedContainers[containerNo];
                                        const firstRow = rows[0];
                                        const isNoData = firstRow[1] === 'NODATA';

                                        return (
                                            <React.Fragment key={containerNo}>
                                                <tr className={isNoData ? styles.rowNoData : ''}>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                            {!isNoData && rows.length > 1 && (
                                                                <button onClick={() => toggleContainer(containerNo)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: '#3b82f6', fontSize: '1rem' }}>
                                                                    {isExpanded ? '▼' : '▶'}
                                                                </button>
                                                            )}
                                                            <span style={{ fontWeight: 700 }}>{firstRow[0] || containerNo}</span>
                                                        </div>
                                                    </td>
                                                    <td>{firstRow[1]}</td>
                                                    <td><StatusBadge label={firstRow[2]} /></td>
                                                    <td><StatusBadge label={firstRow[3]} /></td>
                                                    <td>{firstRow[4]}</td>
                                                    <td>{firstRow[5]}</td>
                                                    <td>{firstRow[6]}</td>
                                                    <td>{firstRow[7]}</td>
                                                    <td>{firstRow[8]}</td>
                                                    <td>{firstRow[9]}</td>
                                                    <td>{firstRow[10]}</td>
                                                    <td>{firstRow[11]}</td>
                                                    <td>{firstRow[12]}</td>
                                                    <td>{firstRow[13]}</td>
                                                    <td>{firstRow[14]}</td>
                                                </tr>
                                                {isExpanded && !isNoData && rows.slice(1).map((row, idx) => (
                                                    <tr key={`${containerNo}-extra-${idx}`} style={{ background: '#f8fafc' }}>
                                                        <td style={{ borderRight: 'none' }}></td>
                                                        <td>{row[1]}</td>
                                                        <td><StatusBadge label={row[2]} /></td>
                                                        <td><StatusBadge label={row[3]} /></td>
                                                        <td>{row[4]}</td>
                                                        <td>{row[5]}</td>
                                                        <td>{row[6]}</td>
                                                        <td>{row[7]}</td>
                                                        <td>{row[8]}</td>
                                                        <td>{row[9]}</td>
                                                        <td>{row[10]}</td>
                                                        <td>{row[11]}</td>
                                                        <td>{row[12]}</td>
                                                        <td>{row[13]}</td>
                                                        <td>{row[14]}</td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <div className={styles.pagination}>
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className={styles.pageButton}>&lt;</button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                    <button key={page} onClick={() => setCurrentPage(page)} className={`${styles.pageButton} ${currentPage === page ? styles.pageButtonActive : ''}`}>{page}</button>
                                ))}
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className={styles.pageButton}>&gt;</button>
                            </div>
                        )}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px', paddingBottom: '40px' }}>
                    <button onClick={resetAll} className={styles.buttonSecondary} style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}>전체 데이터 초기화</button>
                </div>
            </div>
            <Script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js" strategy="lazyOnload" />
        </div>
    );
}

// 명시적인 클라이언트 온리 래퍼 (SSR 하이드레이션 에러 원천 봉쇄)
export default function ContainerHistoryPage() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // 하이드레이션 오류를 막기 위해 마운트 전에는 빈 화면(또는 스켈레톤) 렌더링
    if (!mounted) {
        return <div style={{ minHeight: '100vh', background: '#f8fafc' }} />;
    }

    return <ContainerHistoryInner />;
}