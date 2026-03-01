'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Script from 'next/script';
import styles from './container-history.module.css';

const HEADERS = ['컨테이너번호', 'No', '수출입', '구분', '터미널', 'MOVE TIME', '모선', '항차', '선사', '적공', 'SIZE', 'POD', 'POL', '차량번호', 'RFID'];
const ITEMS_PER_PAGE = 100;

function StatusBadge({ type, label }) {
    if (!label || label === '-' || label === '.' || label === '?') return null;

    let className = styles.badge;
    const isMainStatus = ['수입', '수출', '반입', '반출'].includes(label);

    if (label === '수입') className += ` ${styles.badgeImport}`;
    else if (label === '수출') className += ` ${styles.badgeExport}`;
    else if (label === '반입') className += ` ${styles.badgeInbox}`;
    else if (label === '반출') className += ` ${styles.badgeOutbox}`;
    else className += ` ${styles.badgeEmpty}`;

    return <span className={className}>{label}</span>;
}

function parseContainerInput(text) {
    if (!text || !text.trim()) return [];
    const raw = text.split(/[\n,;\s]+/).map(s => s.replace(/\s/g, '').toUpperCase()).filter(Boolean);
    return [...new Set(raw)];
}

function ContainerHistoryInner() {
    const [userId, setUserId] = useState('');
    const [userPw, setUserPw] = useState('');
    const [containerInput, setContainerInput] = useState('');
    const [logLines, setLogLines] = useState([]);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginSuccess, setLoginSuccess] = useState(false);
    const [lastSavedInfo, setLastSavedInfo] = useState('');
    const [isSaveChecked, setIsSaveChecked] = useState(false);
    const [showBrowser, setShowBrowser] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [totalElapsed, setTotalElapsed] = useState(null);
    const [searchFilter, setSearchFilter] = useState('');
    const [activeStatFilters, setActiveStatFilters] = useState(new Set());
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedRows, setExpandedRows] = useState(new Set());
    const [showPassword, setShowPassword] = useState(false);
    const [failCount, setFailCount] = useState(0);
    const [downloadToken, setDownloadToken] = useState(null);
    const [resultFileName, setResultFileName] = useState('');
    const [isDebugOpen, setIsDebugOpen] = useState(false); // [추가] 디버그 모달 상태
    const [screenshotUrl, setScreenshotUrl] = useState(''); // [추가] 스크린샷 URL
    const [isLogCollapsed, setIsLogCollapsed] = useState(true); // [추가] 로그 접힘 상태 (기본값 접기)
    const [isLeftCollapsed, setIsLeftCollapsed] = useState(false); // [추가] 왼쪽 패널 접힘 상태 (기본값 열림)
    const [runHistory, setRunHistory] = useState([]); // [추가] 조회 이력 차수 관리

    const terminalRef = useRef(null);
    const fileInputRef = useRef(null);
    const timerRef = useRef(null);
    const elapsedSecondsRef = useRef(0);
    const hasInitialized = useRef(false);
    const pendingSearchRef = useRef(null);
    const initialCreds = useRef({ id: '', pw: '' });

    const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_ELS_BACKEND_URL || 'http://localhost:2929';

    // 마운트 후 데이터 복구
    useEffect(() => {
        const savedInput = sessionStorage.getItem('els_input');
        if (savedInput) setContainerInput(savedInput);

        const savedLogs = sessionStorage.getItem('els_logs');
        if (savedLogs) {
            try { setLogLines(JSON.parse(savedLogs)); } catch (e) { console.error(e); }
        }

        const savedResult = sessionStorage.getItem('els_result');
        if (savedResult) {
            try { setResult(JSON.parse(savedResult)); } catch (e) { console.error(e); }
        }

        if (sessionStorage.getItem('els_login_success') === 'true') {
            setLoginSuccess(true);
        }
    }, []);

    const startTimer = useCallback(() => {
        setElapsedSeconds(0); elapsedSecondsRef.current = 0;
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
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }, []);

    useEffect(() => {
        if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }, [logLines, elapsedSeconds]);

    useEffect(() => {
        if (logLines.length > 0) sessionStorage.setItem('els_logs', JSON.stringify(logLines));
    }, [logLines]);

    useEffect(() => {
        if (result) sessionStorage.setItem('els_result', JSON.stringify(result));
    }, [result]);

    useEffect(() => {
        sessionStorage.setItem('els_input', containerInput);
    }, [containerInput]);

    useEffect(() => {
        sessionStorage.setItem('els_run_history', JSON.stringify(runHistory));
    }, [runHistory]);

    // 마운트 후 데이터 복구 (runHistory)
    useEffect(() => {
        const savedHistory = sessionStorage.getItem('els_run_history');
        if (savedHistory) {
            try { setRunHistory(JSON.parse(savedHistory)); } catch (e) { }
        }
    }, []);

    // [추가] 디버그 모달 열려있을 때 3초마다 스크린샷 갱신
    useEffect(() => {
        let interval;
        if (isDebugOpen) {
            const updateUrl = () => setScreenshotUrl(`${BACKEND_BASE_URL}/api/els/screenshot?t=${Date.now()}`);
            updateUrl();
            interval = setInterval(updateUrl, 3000);
        }
        return () => clearInterval(interval);
    }, [isDebugOpen, BACKEND_BASE_URL]);

    const handleSaveCreds = useCallback(async (id, pw) => {
        const targetId = (id || userId).trim();
        const targetPw = pw || userPw;
        if (!targetId || !targetPw) return;
        if (targetId === initialCreds.current.id && targetPw === initialCreds.current.pw) return;

        // sessionStorage 백업 (API 실패해도 같은 브라우저 탭 내 유지)
        try { sessionStorage.setItem('els_creds_backup', JSON.stringify({ id: targetId, pw: targetPw })); } catch (_) { }

        try {
            const res = await fetch('/api/employees/els-creds', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ elsId: targetId, elsPw: targetPw }),
            });
            if (res.ok) {
                initialCreds.current = { id: targetId, pw: targetPw };
                setLastSavedInfo(new Date().toLocaleString('ko-KR'));
            } else {
                const errData = await res.json().catch(() => ({}));
                console.error('[계정 저장 실패]', res.status, errData);
                const errMsg = errData.error || '접근 권한 없음';
                setLogLines(prev => [...prev, `[알림] 계정 저장 API 오류 (${res.status}: ${errMsg}). sessionStorage에 임시 저장됨.`].slice(-100));
            }
        } catch (err) {
            console.error('[계정 저장 예외]', err);
            setLogLines(prev => [...prev, `[알림] 계정 저장 중 네트워크 오류. sessionStorage에 임시 저장됨.`].slice(-100));
        }
    }, [userId, userPw]);

    const handleLogin = useCallback(async (id, pw) => {
        const loginId = id || userId; const loginPw = pw || userPw;
        if (failCount >= 2) {
            setLogLines(prev => [...prev, '[경고] 로그인 2회 실패로 보안을 위해 자동 시도가 차단되었습니다. 비밀번호 확인 후 페이지를 새로고침하세요.'].slice(-100));
            return;
        }

        setLoginLoading(true); startTimer();
        try {
            if (isSaveChecked) await handleSaveCreds(loginId, loginPw);
            const res = await fetch(`${BACKEND_BASE_URL}/api/els/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: loginId.trim(), userPw: loginPw, showBrowser }),
            });

            // [실시간 로그 연동] 응답을 스트리밍으로 읽어 처리 (로그인 과정 가시화)
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let finalData = null;
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                // 마지막 요소는 불완전한 줄일 수 있으므로 버퍼에 남김
                buffer = lines.pop();

                lines.forEach(line => {
                    if (line.startsWith('LOG:')) {
                        setLogLines(prev => [...prev, line.substring(4)].slice(-100));
                    }
                    else if (line.startsWith('RESULT:')) {
                        try {
                            finalData = JSON.parse(line.substring(7));
                        } catch (e) { console.error('JSON Parse Error', e); }
                    }
                });
            }

            // 스트림이 거의 끝났을 때 남은 버퍼 처리
            if (buffer.startsWith('RESULT:')) {
                try { finalData = JSON.parse(buffer.substring(7)); } catch (e) { }
            }

            if (finalData) {
                if (!finalData.ok && finalData.error === "LOGIN_ERROR_CREDENTIALS") {
                    setFailCount(prev => prev + 1);
                }
                if (finalData.ok) {
                    setLoginSuccess(true);
                    setFailCount(0);
                    sessionStorage.setItem('els_login_success', 'true');
                    sessionStorage.setItem('els_login_timestamp', Date.now().toString());
                    if (pendingSearchRef.current) {
                        const queue = [...pendingSearchRef.current];
                        pendingSearchRef.current = null;
                        executeSearch(queue, loginId, loginPw);
                    }
                } else {
                    // 로그인 실패 알림
                    setLogLines(prev => [...prev, `![로그인 실패] ${finalData.error || '알 수 없는 오류'}`].slice(-100));
                }
            }
        } catch (err) {
            console.error(err);
            setLogLines(prev => [...prev, `![오류] ${err.message}`].slice(-100));
        }
        finally { setLoginLoading(false); stopTimer(); }
    }, [userId, userPw, showBrowser, BACKEND_BASE_URL, startTimer, stopTimer, isSaveChecked, handleSaveCreds]);

    useEffect(() => {
        if (hasInitialized.current) return;
        hasInitialized.current = true;
        const init = async () => {
            try {
                // 1차: Supabase API에서 공용 계정 조회
                const res = await fetch('/api/employees/els-creds');
                const data = await res.json();

                if (data.elsId) {
                    setUserId(data.elsId); setUserPw(data.elsPw);
                    setIsSaveChecked(true);
                    initialCreds.current = { id: data.elsId, pw: data.elsPw };
                    if (data.lastSaved) setLastSavedInfo(data.lastSaved);
                    setLogLines(prev => [...prev, '[자동] 저장된 계정정보로 로그인을 시도합니다...'].slice(-100));
                    handleLogin(data.elsId, data.elsPw);
                    return; // API 성공 시 여기서 끝
                }

                // 2차: API가 빈 값이면 sessionStorage 백업에서 복원
                const backup = sessionStorage.getItem('els_creds_backup');
                if (backup) {
                    const { id, pw } = JSON.parse(backup);
                    if (id && pw) {
                        setUserId(id); setUserPw(pw);
                        setIsSaveChecked(true);
                        initialCreds.current = { id, pw };
                        setLogLines(prev => [...prev, '[복원] 임시 저장된 계정으로 자동 로그인 시도...'].slice(-100));
                        handleLogin(id, pw);
                    }
                }
            } catch (err) {
                console.error('[init 오류]', err);
                // API 완전 실패 시에도 sessionStorage 백업 시도
                try {
                    const backup = sessionStorage.getItem('els_creds_backup');
                    if (backup) {
                        const { id, pw } = JSON.parse(backup);
                        if (id && pw) {
                            setUserId(id); setUserPw(pw);
                            setIsSaveChecked(true);
                            initialCreds.current = { id, pw };
                            handleLogin(id, pw);
                        }
                    }
                } catch (_) { }
            }
        };
        init();
    }, []);

    const groupByContainer = (data) => {
        const grouped = {};
        data.forEach(row => {
            const cn = row[0];
            if (!grouped[cn]) grouped[cn] = [];
            grouped[cn].push(row);
        });

        // 데이터 정렬 및 필터링
        Object.keys(grouped).forEach(cn => {
            // 백엔드에서 이미 유효성 검증(1~20번, 데이터 존재 여부)을 거쳤으므로
            // 프론트엔드에서는 과도한 필터링을 제거하고 모든 데이터를 표시함

            // 공란 제거 로직 삭제 -> 넘어온 데이터는 무조건 표시

            // No 기준 오름차순 정렬 (1번이 맨 위)
            grouped[cn].sort((a, b) => {
                const noA = Number(a[1]) || 0;
                const noB = Number(b[1]) || 0;
                return noA - noB;
            });
        });

        return grouped;
    };

    const executeSearch = async (targets, id, pw) => {
        setLoading(true); startTimer();
        try {
            // [병목/경합 방지] 조회를 시작하기 전에 현재 데몬을 다른 사람이 쓰고 있는지 체크
            let isWaiting = true;
            let retryCount = 0;

            while (isWaiting) {
                const capRes = await fetch(`${BACKEND_BASE_URL}/api/els/capabilities`);
                const capData = await capRes.json();

                // 데몬이 다른 사용자의 요청을 처리 중인지 확인 (backend app.py에서 내려주는 progress 정보 활용)
                if (capData.progress && capData.progress.is_running) {
                    const prog = capData.progress;
                    setLogLines(prev => {
                        const last = prev[prev.length - 1];
                        const msg = `[대기] 다른 직원이 조회 중입니다... (현재 ${prog.completed}/${prog.total} 진행 중, ${retryCount}회차 대기)`;
                        let next;
                        if (last && last.startsWith('[대기]')) {
                            next = [...prev.slice(0, -1), msg];
                        } else {
                            next = [...prev, msg];
                        }
                        return next.slice(-100); // [렉 방지]
                    });
                    retryCount++;
                    await new Promise(r => setTimeout(r, 5000)); // 5초 대기 후 재시도
                } else {
                    isWaiting = false;
                    if (retryCount > 0) setLogLines(prev => [...prev, '✓ 데몬이 준비되었습니다. 조회를 시작합니다!'].slice(-100));
                }

                // 무한 대기 방지 (최대 10분)
                if (retryCount > 120) {
                    setLogLines(prev => [...prev, '![오류] 대기 시간이 너무 깁니다. 나중에 다시 시도해 주세요.'].slice(-100));
                    setLoading(false); stopTimer();
                    return;
                }
            }

            const res = await fetch(`${BACKEND_BASE_URL}/api/els/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ containers: targets, showBrowser, userId: id || userId, userPw: pw || userPw }),
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            const processLine = (line) => {
                if (line.startsWith('LOG:')) setLogLines(prev => [...prev, line.substring(4)].slice(-100));
                else if (line.startsWith('RESULT_PARTIAL:')) {
                    try {
                        const part = JSON.parse(line.substring(15));
                        if (part.result && Array.isArray(part.result)) {
                            setResult(prev => {
                                const prevRows = prev ? Object.values(prev).flat() : [];
                                const newRows = [...prevRows, ...part.result];
                                return groupByContainer(newRows);
                            });
                        }
                    } catch (e) { console.error('Partial Parse Error', e); }
                }
                else if (line.startsWith('RESULT:')) {
                    try {
                        const data = JSON.parse(line.substring(7));
                        if (data.ok) {
                            const newResult = groupByContainer(data.result || []);
                            setResult(newResult);
                            setDownloadToken(data.downloadToken);
                            setResultFileName(data.fileName);

                            setRunHistory(prev => {
                                const next = [...prev, {
                                    id: prev.length + 1,
                                    total: Object.keys(newResult).length,
                                    time: elapsedSecondsRef.current
                                }];
                                return next.slice(-3);
                            });
                        }
                        if (data.log && Array.isArray(data.log)) {
                            setLogLines(prev => [...prev, ...data.log].slice(-100));
                        }
                    } catch (e) { console.error('RESULT Parse Error', e); }
                }
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // 마지막 불완전한 조각 저장

                lines.forEach(processLine);
            }
            if (buffer) {
                processLine(buffer);
            }

            // 총 소요시간 계산 (타이머)
            setTotalElapsed(elapsedSecondsRef.current);
        } catch (err) { console.error(err); }
        finally { setLoading(false); stopTimer(); }
    };

    const handleResetDaemon = async (e) => {
        if (e) e.stopPropagation();
        if (!confirm('백그라운드 봇의 세션을 강제로 닫고 다시 로그인 하시겠습니까?')) return;
        try {
            await fetch(`${BACKEND_BASE_URL}/api/els/stop`, { method: "POST" });
            setLogLines(prev => [...prev, '✓ 수동 초기화: 데몬 세션을 닫고 다시 로그인을 시도합니다...'].slice(-100));
            setLoginSuccess(false);
            sessionStorage.removeItem('els_login_success');
            setTimeout(() => handleLogin(), 1000); // 1초 후 로그인 시도
        } catch (err) { console.error(err); }
    };

    const runSearch = () => {
        const containers = parseContainerInput(containerInput);
        if (!containers.length) return alert('컨테이너 번호를 입력하세요');
        setTotalElapsed(null);
        if (!loginSuccess) {
            setLogLines(prev => [...prev, '로그인 후 자동으로 조회를 시작합니다...'].slice(-100));
            pendingSearchRef.current = containers;
            handleLogin();
        }
        else { executeSearch(containers); }
    };

    const toggleStatFilter = (filter) => {
        setActiveStatFilters(prev => {
            const next = new Set(prev);
            if (next.has(filter)) next.delete(filter);
            else next.add(filter);
            return next;
        });
        setCurrentPage(1);
    };

    const toggleRow = (cn) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(cn)) next.delete(cn);
            else next.add(cn);
            return next;
        });
    };

    const handleKeyDown = (e, target) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            target === 'login' ? handleLogin() : runSearch();
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files ? e.target.files[0] : null;
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            if (typeof XLSX === 'undefined') { setLogLines(prev => [...prev, '[오류] 엑셀 라이브러리 로드 실패'].slice(-100)); return; }
            const data = new Uint8Array(evt.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
            const containers = rows.flat().filter(c => c && typeof c === 'string').map(c => c.trim().toUpperCase());
            setContainerInput(containers.join('\n'));
            setLogLines(prev => [...prev, `[파일] ${containers.length}개 번호 추출 완료`].slice(-100));
        };
        reader.readAsArrayBuffer(file);
    };

    const handleFileDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
            handleFileUpload({ target: { files: [file] } });
        }
    };

    const resetAll = () => {
        if (confirm('모든 데이터를 초기화할까요?')) {
            setLogLines([]); setResult(null); setContainerInput(''); setRunHistory([]);
            sessionStorage.clear(); window.location.reload();
        }
    };

    const stats = result ? (() => {
        const latest = Object.values(result).map(r => r[0]).filter(Boolean);
        return {
            export: latest.filter(r => r[2] === '수출').length,
            import: latest.filter(r => r[2] === '수입').length,
            inbox: latest.filter(r => r[3] === '반입').length,
            outbox: latest.filter(r => r[3] === '반출').length,
            unloading: latest.filter(r => r[3] === '양하').length,
            loading: latest.filter(r => r[3] === '적하').length,
            total: Object.keys(result).length
        };
    })() : null;

    const filtered = result ? Object.keys(result).filter(cn => {
        if (searchFilter && !cn.toLowerCase().includes(searchFilter.toLowerCase())) return false;

        // 다중 필터 적용: 선택된 필터가 하나라도 있으면 필터링 수행
        if (activeStatFilters.size > 0) {
            const r = result[cn][0];
            if (!r) return false;
            // 수출입(idx 2) 또는 구분(idx 3) 중 하나라도 선택된 필터에 포함되면 통과
            const status = r[2];
            const type = r[3];

            const matchStatus = status && activeStatFilters.has(status);
            const matchType = type && activeStatFilters.has(type);

            return matchStatus || matchType;
        }
        return true;
    }) : [];

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <div className={styles.headerBanner}>
                    <h1 className={styles.title}>컨테이너 이력조회</h1>
                    <div className={styles.shortcutGroup}>
                        <a href="https://etrans.klnet.co.kr" target="_blank" rel="noreferrer" className={styles.etransShortcut}><img src="/images/etrans_logo.png" alt="ETRANS" /></a>
                        <a href="https://www.tradlinx.com" target="_blank" rel="noreferrer" className={styles.etransShortcut}><img src="/images/tradlinx_logo.png" alt="Tradlinx" /></a>
                    </div>
                </div>

                <div className={`${styles.topRow} ${isLogCollapsed ? styles.logCollapsed : ''} ${isLeftCollapsed ? styles.leftCollapsed : ''}`}>
                    <div className={`${styles.leftColumn} ${isLeftCollapsed ? styles.collapsed : ''}`}>
                        {isLeftCollapsed ? (
                            <div className={styles.section} style={{ flex: 1, padding: 0 }}>
                                <div onClick={() => setIsLeftCollapsed(false)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94a3b8', fontSize: '0.8rem', writingMode: 'vertical-rl', textOrientation: 'mixed', gap: '10px' }}>
                                    <div className={styles.pulseIcon} style={{ transform: 'rotate(-90deg)' }}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                                    </div>
                                    <span>입력창 펼치기</span>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className={styles.section}>
                                    <div className={styles.sectionHeader} style={{ marginBottom: '0.5rem' }}>
                                        <h2 className={styles.sectionTitle}>자동 로그인 연동</h2>
                                        <button onClick={() => setIsLeftCollapsed(true)} className={styles.buttonSecondary} style={{ padding: '2px 8px', fontSize: '0.7rem', border: 'none', background: 'transparent' }}>접기 ◀</button>
                                    </div>
                                    <div className={styles.inputGroup}>
                                        <div className={styles.loginRow}>
                                            <input type="text" placeholder="아이디" value={userId} onChange={e => setUserId(e.target.value)} onKeyDown={e => handleKeyDown(e, 'login')} className={styles.input} />
                                            <input type={showPassword ? "text" : "password"} placeholder="비밀번호" value={userPw} onChange={e => setUserPw(e.target.value)} onKeyDown={e => handleKeyDown(e, 'login')} className={styles.input} />
                                        </div>
                                        <div className={styles.loginActionRow}>
                                            <button
                                                onClick={() => handleLogin()}
                                                disabled={loginLoading || failCount >= 2}
                                                className={styles.button}
                                                style={{ flex: 1, backgroundColor: failCount >= 2 ? '#ef4444' : undefined }}
                                            >
                                                {failCount >= 2 ? '로그인 차단됨' : (loginLoading ? '접속 시도 중...' : '자동 로그인 연동')}
                                            </button>
                                            <div style={{ display: 'flex', gap: '10px', marginLeft: '10px' }}>
                                                <label className={styles.saveControl}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSaveChecked}
                                                        onChange={async (e) => {
                                                            const checked = e.target.checked;
                                                            setIsSaveChecked(checked);
                                                            if (!checked) {
                                                                // [중요] 저장 체크 해제 시 즉시 데몬 중지
                                                                try {
                                                                    await fetch(`${BACKEND_BASE_URL}/api/els/stop-daemon`, { method: "POST" });
                                                                    setLogLines(prev => [...prev, '✓ 자동 로그인 연동이 해제되고 세션이 종료되었습니다.']);
                                                                    setLoginSuccess(false);
                                                                    sessionStorage.removeItem('els_login_success');
                                                                    setFailCount(0); // 정지하면 카운트도 초기화
                                                                } catch (err) { console.error(err); }
                                                            }
                                                        }}
                                                    />
                                                    <span style={{ fontSize: '0.8rem' }}>저장</span>
                                                </label>
                                                <label className={styles.saveControl}>
                                                    <input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} />
                                                    <span style={{ fontSize: '0.8rem' }}>보기</span>
                                                </label>
                                            </div>
                                        </div>
                                        {lastSavedInfo && <div className={styles.lastSavedText}>암호화 저장됨: {lastSavedInfo}</div>}
                                    </div>
                                </div>

                                <div className={styles.section} style={{ flex: 1 }}>
                                    <div className={styles.sectionHeader}>
                                        <h2 className={styles.sectionTitle}>조회 대상 입력</h2>
                                    </div>
                                    <div
                                        onDrop={handleFileDrop}
                                        onDragOver={e => e.preventDefault()}
                                        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                                    >
                                        <textarea
                                            placeholder="번호를 입력하거나 엑셀 파일을 여기에 끌어다 놓으세요."
                                            value={containerInput}
                                            onChange={e => setContainerInput(e.target.value)}
                                            className={styles.textarea}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => fileInputRef.current.click()} className={styles.buttonSecondary} style={{ flex: 1 }}>엑셀 불러오기</button>
                                        <button onClick={runSearch} disabled={loading} className={styles.button} style={{ flex: 2 }}>
                                            {loading ? '데이터 추출 중...' : '실시간 이력 조회'}
                                        </button>
                                    </div>
                                    <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleFileUpload} style={{ display: 'none' }} />
                                </div>
                            </>
                        )}
                    </div>

                    <div className={styles.centerColumn}>
                        <div className={styles.section} style={{ flex: 1, minHeight: 0 }}>
                            <div className={styles.sectionHeader}>
                                <h2 className={styles.sectionTitle}>
                                    조회 데이터 결과
                                    {result && <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500, marginLeft: '8px' }}>(총 {Object.keys(result).length}건)</span>}
                                </h2>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    {result && downloadToken && (
                                        <button onClick={() => window.open(`${BACKEND_BASE_URL}/api/els/download/${downloadToken}?filename=${resultFileName}`, '_blank')} className={styles.buttonExcelCompact}>엑셀 저장</button>
                                    )}
                                    <button onClick={resetAll} className={styles.buttonReset}>초기화</button>
                                </div>
                            </div>

                            {(totalElapsed !== null || loading) && (
                                <div style={{ padding: '0 24px 12px', color: '#64748b', fontSize: '0.9rem', fontWeight: 600 }}>
                                    ⏱️ {loading ? `조회 진행 중... (${elapsedSeconds.toFixed(1)}초)` : `총 소요 시간: ${totalElapsed?.toFixed(1) || 0}초`}
                                </div>
                            )}

                            {stats ? (
                                <div className={styles.statsBar}>
                                    {['수출', '수입', '반입', '반출', '양하', '적하'].map((stat) => {
                                        // 색상 매핑
                                        const colorMap = {
                                            '수출': '#16a34a',
                                            '수입': '#dc2626',
                                            '반입': '#2563eb',
                                            '반출': '#d97706',
                                            '양하': '#7c3aed',
                                            '적하': '#db2777'
                                        };
                                        const countKey = {
                                            '수출': 'export',
                                            '수입': 'import',
                                            '반입': 'inbox',
                                            '반출': 'outbox',
                                            '양하': 'unloading',
                                            '적하': 'loading'
                                        }[stat];

                                        const isActive = activeStatFilters.has(stat);

                                        return (
                                            <div
                                                key={stat}
                                                className={`${styles.statItem} ${isActive ? styles.statItemActive : ''}`}
                                                onClick={() => toggleStatFilter(stat)}
                                            >
                                                <span className={styles.statDot} style={{ background: colorMap[stat] }}></span>
                                                {stat} {stats[countKey]}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className={styles.waitingBox}>
                                    <div className={styles.pulseIcon}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
                                    </div>
                                    <p style={{ fontWeight: 800, color: '#64748b', fontSize: '0.85rem' }}>데이터 조회 대기 중</p>
                                </div>
                            )}

                            {result && (
                                <div className={styles.resultContainer}>
                                    <div className={styles.tableInnerWrapper}>
                                        {/* 모바일 환경 (1024px 이하) 에서는 카드 뷰, 그 외에는 테이블 뷰 */}
                                        <div className={styles.desktopView}>
                                            <table className={styles.table}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ textAlign: 'center' }}>{HEADERS[0]}</th>
                                                        {HEADERS.slice(1).map((h, i) => <th key={i}>{h}</th>)}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((cn, idx) => {
                                                        const rows = result[cn];
                                                        const isExpanded = expandedRows.has(cn);
                                                        const hasHistory = rows.length > 1;
                                                        const rowClass = idx % 2 === 0 ? styles.rowOdd : styles.rowEven;

                                                        return (
                                                            <React.Fragment key={cn}>
                                                                <tr className={`${rowClass} ${isExpanded ? styles.expandedParentRow : ''}`}>
                                                                    <td className={styles.stickyColumn}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                            {hasHistory ? (
                                                                                <button onClick={() => toggleRow(cn)} className={styles.toggleBtn}>
                                                                                    {isExpanded ? '▼' : '▶'}
                                                                                </button>
                                                                            ) : (
                                                                                <span style={{ width: '18px' }}></span>
                                                                            )}
                                                                            <span style={{ fontWeight: 900 }}>{cn}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className={styles.cellBorder}>
                                                                        {rows[0][1] === 'ERROR' ? <span style={{ color: '#ef4444', fontWeight: 'bold' }}>ERROR</span> : rows[0][1]}
                                                                    </td>
                                                                    <td className={styles.cellBorder}>
                                                                        {rows[0][1] === 'ERROR' ? <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{rows[0][2]}</span> : <StatusBadge label={rows[0][2]} />}
                                                                    </td>
                                                                    <td className={styles.cellBorder}>
                                                                        {rows[0][1] === 'ERROR' ? '-' : <StatusBadge label={rows[0][3]} />}
                                                                    </td>
                                                                    {rows[0].slice(4).map((v, i) => (
                                                                        <td key={i} className={`${styles.cellBorder} ${i === 0 ? styles.cellLeft : ''}`}>{v || '-'}</td>
                                                                    ))}
                                                                </tr>

                                                                {isExpanded && rows.slice(1).map((row, hIdx) => (
                                                                    <tr key={`${cn}-h-${hIdx}-${row[1]}`} className={`${rowClass} ${styles.historyRow}`}>
                                                                        <td className={styles.stickyColumn} style={{ borderRight: '1px solid #e2e8f0' }}></td>
                                                                        <td className={styles.cellBorder}>{row[1]}</td>
                                                                        <td className={styles.cellBorder}><StatusBadge label={row[2]} /></td>
                                                                        <td className={styles.cellBorder}><StatusBadge label={row[3]} /></td>
                                                                        {row.slice(4).map((v, i) => (
                                                                            <td key={i} className={`${styles.cellBorder} ${i === 0 ? styles.cellLeft : ''}`}>{v || '-'}</td>
                                                                        ))}
                                                                    </tr>
                                                                ))}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                        <div className={styles.mobileView}>
                                            {filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((cn) => {
                                                const rows = result[cn];
                                                const isExpanded = expandedRows.has(cn);
                                                return (
                                                    <div key={cn} className={styles.mobileCard}>
                                                        <div className={styles.mobileCardHeader} onClick={() => toggleRow(cn)}>
                                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                                                                <span className={styles.mobileCardCn}>{cn}</span>
                                                                {rows[0][1] === 'ERROR' ? (
                                                                    <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.8rem' }}>{rows[0][2]}</span>
                                                                ) : (
                                                                    <>
                                                                        <StatusBadge label={rows[0][2]} />
                                                                        <StatusBadge label={rows[0][3]} />
                                                                    </>
                                                                )}
                                                            </div>
                                                            <div className={styles.mobileCardToggle}>{isExpanded ? '접기 ▲' : '이력 ▼'}</div>
                                                        </div>
                                                        <div className={styles.mobileCardBody}>
                                                            <div className={styles.mobileCardRow}>
                                                                <span className={styles.mobileCardLabel}>터미널:</span>
                                                                <span className={styles.mobileCardValue}>{rows[0][4] || '-'}</span>
                                                            </div>
                                                            <div className={styles.mobileCardRow}>
                                                                <span className={styles.mobileCardLabel}>MOVE TIME:</span>
                                                                <span className={styles.mobileCardValue}>{rows[0][5] || '-'}</span>
                                                            </div>
                                                            <div className={styles.mobileCardRow}>
                                                                <span className={styles.mobileCardLabel}>차량번호:</span>
                                                                <span className={styles.mobileCardValue}>{rows[0][13] || '-'}</span>
                                                            </div>
                                                        </div>

                                                        {isExpanded && (
                                                            <div className={styles.mobileHistoryList}>
                                                                {rows.slice(1).map((row, hIdx) => (
                                                                    <div key={hIdx} className={styles.mobileHistoryItem}>
                                                                        <div className={styles.mobileHistoryHeader}>
                                                                            <span className={styles.mobileHistoryNo}>이력 No.{row[1]}</span>
                                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                                <StatusBadge label={row[2]} />
                                                                                <StatusBadge label={row[3]} />
                                                                            </div>
                                                                        </div>
                                                                        <div className={styles.mobileHistoryInfo}>
                                                                            {row[4]} | {row[5]} | {row[13]}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className={styles.resultFooter}>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <input type="text" placeholder="결과 검색..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)} className={styles.inputSearchCompact} style={{ width: '120px' }} />
                                            {/* 이력 표시 패널 */}
                                            {runHistory.length > 0 && (
                                                <div style={{ display: 'flex', gap: '6px', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, borderLeft: '1px solid #e2e8f0', paddingLeft: '8px' }}>
                                                    {runHistory.map(h => (
                                                        <span key={h.id} style={{ background: '#f8fafc', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                                            {h.id}차: {h.total}건 ({h.time.toFixed(1)}초)
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className={styles.pagination}>
                                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>&lt;</button>
                                            <span>{currentPage}</span>
                                            <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage * ITEMS_PER_PAGE >= filtered.length}>&gt;</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={`${styles.rightColumn} ${isLogCollapsed ? styles.collapsed : ''}`}>
                        <div className={styles.section} style={{ flex: 1, overflow: 'hidden' }}>
                            <div className={styles.sectionHeader} onClick={() => setIsLogCollapsed(!isLogCollapsed)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                <h2 className={styles.sectionTitle}>
                                    {isLogCollapsed ? '로그' : '시스템 로그'}
                                    {!isLogCollapsed && <span style={{ fontSize: '0.7rem', fontWeight: 400, color: '#94a3b8', marginLeft: '4px' }}>(클릭하여 접기)</span>}
                                </h2>
                                {!isLogCollapsed && (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={handleResetDaemon} className={styles.buttonSecondary} style={{ padding: '6px 14px', fontSize: '0.8rem', background: '#fee2e2', borderColor: '#ef4444', color: '#991b1b' }}>데몬 리셋</button>
                                        <button onClick={(e) => { e.stopPropagation(); setIsDebugOpen(true); }} className={styles.buttonSecondary} style={{ padding: '6px 14px', fontSize: '0.8rem', background: '#fef3c7', borderColor: '#f59e0b', color: '#92400e' }}>활동 확인</button>
                                        <button onClick={(e) => { e.stopPropagation(); setLogLines([]); }} className={styles.buttonSecondary} style={{ padding: '6px 14px', fontSize: '0.8rem' }}>로그 비우기</button>
                                    </div>
                                )}
                            </div>

                            {!isLogCollapsed ? (
                                <div ref={terminalRef} className={styles.terminal}>
                                    {logLines.map((l, i) => <div key={i} className={styles.logLine}>{l}</div>)}
                                    {(loading || loginLoading) && (
                                        <div className={styles.logLineActive}>
                                            <div className={styles.spinner}></div>
                                            <span>프로세스 수행 중... ({elapsedSeconds.toFixed(1)}s)</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div onClick={() => setIsLogCollapsed(false)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94a3b8', fontSize: '0.8rem', writingMode: 'vertical-rl', textOrientation: 'mixed', gap: '10px', paddingTop: '20px' }}>
                                    <span>로그 펼치기</span>
                                    <div className={styles.pulseIcon} style={{ transform: 'rotate(90deg)' }}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>

            {/* [추가] 디버그 브라우저 모니터링 모달 */}
            {isDebugOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }} onClick={() => setIsDebugOpen(false)}>
                    <div style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', maxWidth: '1200px', width: '100%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', position: 'relative' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>🖥️ 실시간 브라우저 모니터링 (3초마다 갱신)</h3>
                            <button onClick={() => setIsDebugOpen(false)} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>×</button>
                        </div>
                        <div style={{ padding: '12px', background: '#0f172a', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                            {screenshotUrl ? (
                                <img
                                    src={screenshotUrl}
                                    alt="Browser Screenshot"
                                    style={{ maxWidth: '100%', height: 'auto', borderRadius: '4px', border: '2px solid #334155', display: 'block' }}
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        if (e.target.nextSibling) e.target.nextSibling.style.display = 'block';
                                    }}
                                    onLoad={(e) => {
                                        e.target.style.display = 'block';
                                        if (e.target.nextSibling) e.target.nextSibling.style.display = 'none';
                                    }}
                                />
                            ) : null}
                            <div style={{ color: '#94a3b8', textAlign: 'center', display: 'block' }}>
                                <div className={styles.spinner} style={{ margin: '0 auto 12px' }}></div>
                                <div>브라우저 화면을 대기 중...</div>
                                <div style={{ fontSize: '0.75rem', marginTop: '4px', opacity: 0.7 }}>(작업을 시작하면 화면이 나타납니다)</div>
                            </div>
                        </div>
                        <div style={{ padding: '12px 24px', background: '#f8fafc', fontSize: '0.85rem', color: '#64748b', textAlign: 'center' }}>
                            현재 나스 도커 서버에서 봇이 보고 있는 화면입니다. (Headless 모드 캡처)
                        </div>
                    </div>
                </div>
            )}

            <Script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js" strategy="lazyOnload" />
        </div>
    );
}

export default function ContainerHistoryPage() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return <div style={{ background: '#f1f5f9', minHeight: '100vh' }} />;
    return <ContainerHistoryInner />;
}