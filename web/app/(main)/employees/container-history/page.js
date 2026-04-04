'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Script from 'next/script';
import * as XLSX from 'xlsx-js-style';
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

    // ISO 6346 체크섬 검증
    const isValidCN = (cn) => {
        if (!cn || cn.length !== 11) return false;
        const charMap = {
            'A': 10, 'B': 12, 'C': 13, 'D': 14, 'E': 15, 'F': 16, 'G': 17, 'H': 18, 'I': 19, 'J': 20,
            'K': 21, 'L': 23, 'M': 24, 'N': 25, 'O': 26, 'P': 27, 'Q': 28, 'R': 29, 'S': 30, 'T': 31,
            'U': 32, 'V': 34, 'W': 35, 'X': 36, 'Y': 37, 'Z': 38
        };
        let sum = 0;
        for (let i = 0; i < 10; i++) {
            const c = cn[i];
            const val = (c >= '0' && c <= '9') ? parseInt(c, 10) : charMap[c];
            if (val === undefined) return false;
            sum += val * Math.pow(2, i);
        }
        const rem = sum % 11;
        return (rem === 10 ? 0 : rem) === parseInt(cn[10], 10);
    };

    const raw = text.split(/[\n,;\s]+/).map(s => s.replace(/\s/g, '').toUpperCase()).filter(Boolean);
    const valid = raw.filter(isValidCN);
    return [...new Set(valid)];
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
    const [selectedScreenshotIdx, setSelectedScreenshotIdx] = useState(1); // [추가] 모니터링할 워커 인덱스
    const [screenshotUrl, setScreenshotUrl] = useState(''); // [추가] 스크린샷 URL
    const [isLogCollapsed, setIsLogCollapsed] = useState(false); // [변경] 로그 접힘 상태 (기본값 펼침)
    const [isLeftCollapsed, setIsLeftCollapsed] = useState(false); // [추가] 왼쪽 패널 접힘 상태 (기본값 열림)
    const [runHistory, setRunHistory] = useState([]); // [추가] 조회 이력 차수 관리
    const [workers, setWorkers] = useState([]); // [추가] 데몬 워커(브라우저)별 상태 관리
    const [maxDrivers, setMaxDrivers] = useState(4); // [v4.5.11] 기본값 4로 상향 
    
    // [추가] 디버그 모달 열려있을 때 3초마다 스크린샷 갱신
    useEffect(() => {
        let interval;
        if (isDebugOpen) {
            const updateUrl = () => setScreenshotUrl(`${BACKEND_BASE_URL}/api/els/screenshot?idx=${selectedScreenshotIdx}&t=${Date.now()}`);
            updateUrl();
            interval = setInterval(updateUrl, 3000);
        }
        return () => clearInterval(interval);
    }, [isDebugOpen, selectedScreenshotIdx, BACKEND_BASE_URL]);

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
            try { 
                const data = JSON.parse(savedResult);
                if (data && data.downloadToken) {
                    setResult(data.result);
                    setDownloadToken(data.downloadToken);
                    setResultFileName(data.fileName);
                } else if (data && typeof data === 'object' && !Array.isArray(data)) {
                    setResult(data);
                } else {
                    sessionStorage.removeItem('els_result');
                }
            } catch (e) { console.error(e); }
        }

        if (sessionStorage.getItem('els_login_success') === 'true') {
            setLoginSuccess(true);
        }
    }, []);

    // 타이머 및 상태 모니터링 (10초 주기 폴링)
    useEffect(() => {
        const interval = setInterval(async () => {
            if (loading || loginLoading) return; // 작업 중엔 인터럽트 방지
            try {
                const res = await fetch(`${BACKEND_BASE_URL}/api/els/capabilities`);
                const data = await res.json();
                if (data.workers) setWorkers(data.workers);
                if (data.max_drivers) setMaxDrivers(data.max_drivers);
            } catch (e) { }
        }, 10000);
        return () => clearInterval(interval);
    }, [loading, loginLoading, BACKEND_BASE_URL]);

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
        if (result) {
            const dataToSave = downloadToken ? { result, downloadToken, fileName: resultFileName } : result;
            sessionStorage.setItem('els_result', JSON.stringify(dataToSave));
        }
    }, [result, downloadToken, resultFileName]);

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

    const groupByContainer = (data, targets = []) => {
        const tempGrouped = {};
        data.forEach(row => {
            const cn = row[0];
            if (!tempGrouped[cn]) tempGrouped[cn] = [];
            tempGrouped[cn].push(row);
        });

        // No 기준 데이터 오름차순 정렬
        Object.keys(tempGrouped).forEach(cn => {
            tempGrouped[cn].sort((a, b) => {
                const noA = Number(a[1]) || 0;
                const noB = Number(b[1]) || 0;
                return noA - noB;
            });
        });

        // 사용자가 입력한 컨테이너 번호(targets) 순서에 맞춰서 객체 Key 순서 보장
        if (targets && targets.length > 0) {
            const finalGrouped = {};
            targets.forEach(cn => {
                if (tempGrouped[cn]) {
                    finalGrouped[cn] = tempGrouped[cn];
                    delete tempGrouped[cn];
                }
            });
            // 요청 목록에 없는데 내려온 남은 항목들도 맨 뒤에 붙임
            Object.keys(tempGrouped).forEach(cn => {
                finalGrouped[cn] = tempGrouped[cn];
            });
            return finalGrouped;
        }

        return tempGrouped;
    };

    const executeSearch = async (targets, id, pw) => {
        setLoading(true); startTimer();

        // 검색 즉시 사용자가 입력한 순서대로 빈 슬롯을 만들기 위해 더미 데이터 셋업
        const initialResult = {};
        targets.forEach(cn => {
            initialResult[cn] = [[cn, "-", "조회 대기중", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"]];
        });
        setResult(initialResult);

        try {
            // [병목/경합 방지] 조회를 시작하기 전에 현재 데몬을 다른 사람이 쓰고 있는지 체크
            let isWaiting = true;
            let retryCount = 0;

            while (isWaiting) {
                const capRes = await fetch(`${BACKEND_BASE_URL}/api/els/capabilities`);
                const capData = await capRes.json();
                
                // 워커 상태 업데이트
                if (capData.workers) setWorkers(capData.workers);
                if (capData.max_drivers) setMaxDrivers(capData.max_drivers);

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

                // 무한 대기 방지 (최대 약 25분 - 백엔드 좀비 해제 시간이 20분이므로 그 이후까지 기다림)
                if (retryCount > 300) {
                    setLogLines(prev => [...prev, '![오류] 대기 시간이 너무 깁니다. (약 25분 경과) 데몬 리셋 후 다시 시도해 주세요.'].slice(-100));
                    setLoading(false); stopTimer();
                    await fetch(`${BACKEND_BASE_URL}/api/els/stop-daemon`, { method: 'POST' }); // 자동 리셋 시도
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
                                // [핵심] 조회가 완료된 실제 데이터만 유지하고 '대기/진행'용 가짜 행은 모두 필터링함 (중복 방지)
                                const prevRows = prev ? Object.values(prev).flat().filter(r => r[2] !== "조회 대기중" && r[2] !== "조회 진행중") : [];
                                const newRows = [...prevRows, ...part.result];
                                const grouped = groupByContainer(newRows, targets);

                                // 아직 결과가 오지 않은 컨테이너는 순서를 유지하기 위해 다시 빈 슬롯으로 채워넣음
                                targets.forEach(cn => {
                                    if (!grouped[cn] || grouped[cn].length === 0) {
                                        grouped[cn] = [[cn, "-", "조회 진행중", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"]];
                                    }
                                });
                                return grouped;
                            });
                        }
                    } catch (e) { console.error('Partial Parse Error', e); }
                }
                else if (line.startsWith('RESULT:')) {
                    try {
                        const data = JSON.parse(line.substring(7));
                        if (data.ok) {
                            const newResult = groupByContainer(data.result || [], targets);

                            // 최종 응답에도 누락된 데이터 대응
                            targets.forEach(cn => {
                                if (!newResult[cn] || newResult[cn].length === 0) {
                                    newResult[cn] = [[cn, "ERROR", "추출 내역 누락", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"]];
                                }
                            });

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
            await fetch(`${BACKEND_BASE_URL}/api/els/stop-daemon`, { method: "POST" });
            setLogLines(prev => [...prev, '✓ 수동 초기화: 데몬 세션을 닫고 다시 로그인을 시도합니다...'].slice(-100));
            setLoginSuccess(false);
            sessionStorage.removeItem('els_login_success');
            setTimeout(() => handleLogin(), 1000); // 1초 후 로그인 시도
        } catch (err) { console.error(err); }
    };

    const runSearch = () => {
        const containers = parseContainerInput(containerInput);
        if (!containerInput.trim()) {
            return alert('컨테이너 번호를 입력하세요');
        }
        if (!containers.length) {
            return alert('입력된 컨테이너 번호 중 유효한 ISO 6346 규격의 번호가 없습니다.');
        }
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

    const downloadExcel = () => {
        if (!result) return;

        // 1순위: 백엔드(openpyxl)에서 미리 생성해둔 완벽한 틀고정/서식 엑셀 파일이 있다면 그것을 다운로드
        if (downloadToken) {
            const url = `${BACKEND_BASE_URL}/api/els/download/${downloadToken}?filename=${encodeURIComponent(resultFileName || 'Container_History.xlsx')}`;
            const a = document.createElement('a');
            a.href = url;
            a.download = resultFileName || 'Container_History.xlsx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setLogLines(prev => [...prev, `[다운로드] 서버에서 최적화된(틀고정/색상 지원) 엑셀을 다운로드합니다.`].slice(-100));
            return;
        }

        // 2순위: 토큰이 만료되었거나 페이지 새로고침 등에 의해 프론트에서 임시로 생성할 경우
        // 기본 xlsx로 fallback 처리
        // 클라이언트 사이드에서 스타일을 입힐 수 있는 로직을 구성합니다.

        if (typeof XLSX === 'undefined') {
            setLogLines(prev => [...prev, '[오류] 엑셀 라이브러리가 아직 로드되지 않았습니다.'].slice(-100));
            return;
        }

        const wb = XLSX.utils.book_new();

        // 1. 데이터 분류 및 정렬
        const latestRows = [];
        const allRowsSorted = [];

        Object.keys(result).forEach(cn => {
            const rawRows = result[cn].filter(r => r[2] !== '조회 대기중' && r[2] !== '조회 진행중');
            if (rawRows.length === 0) return;

            const sorted = [...rawRows].sort((a, b) => (Number(a[1]) || 0) - (Number(b[1]) || 0));
            sorted.forEach(r => allRowsSorted.push(r));

            const no1 = sorted.find(r => String(r[1]) === '1');
            if (no1) latestRows.push(no1);
        });

        // 2. 워크시트 생성 보조 함수 (스타일링 보강)
        const createSheet = (rows) => {
            const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);

            // 자동 열 너비 계산
            const range = XLSX.utils.decode_range(ws['!ref']);
            const colWidths = HEADERS.map((h, i) => {
                let maxLen = 0;
                // 헤더 길이 포함
                for (let cIdx = 0; cIdx < h.length; cIdx++) {
                    maxLen += h.charCodeAt(cIdx) > 127 ? 2.1 : 1.1;
                }
                maxLen += 2;

                for (let r = 1; r <= range.e.r; r++) {
                    const cell = ws[XLSX.utils.encode_cell({ r, c: i })];
                    if (cell && cell.v) {
                        const val = String(cell.v);
                        let cellLen = 0;
                        for (let cIdx = 0; cIdx < val.length; cIdx++) {
                            cellLen += val.charCodeAt(cIdx) > 127 ? 2.1 : 1.1;
                        }
                        if (cellLen + 2 > maxLen) maxLen = cellLen + 2;
                    }
                }
                return { wch: Math.min(maxLen, 80) };
            });
            ws['!cols'] = colWidths;

            // [추가] 틀 고정 (SheetJS 스타일 확장 규격)
            ws['!views'] = [
                {
                    state: 'frozen',
                    xSplit: 0,
                    ySplit: 1,
                    topLeftCell: 'A2',
                    activePane: 'bottomLeft'
                }
            ];
            // [최종 병기] !freeze 속성 중첩 적용 (일부 구버전/특이 환경 대응)
            ws['!freeze'] = { xSplit: 0, ySplit: 1 };
            
            // 자동 필터
            ws['!autofilter'] = { ref: range };

            // [핵심] 제목 회색, 수입 빨강, 반입 파랑 스타일 적용
            // 주의: 기본 SheetJS(xlsx)는 스타일을 지원하지 않지만, 
            // 'xlsx-js-style' 라이브러리가 로드되어 있을 경우 cell.s 속성을 사용합니다.
            // 여기서는 스타일 정보가 포함된 구조로 생성 시도
            for (let r = 0; r <= range.e.r; r++) {
                for (let c = 0; c <= range.e.c; c++) {
                    const cellRef = XLSX.utils.encode_cell({ r, c });
                    if (!ws[cellRef]) {
                        ws[cellRef] = { v: "", t: "s" }; // 빈 셀도 스타일 적용을 위해 객체 생성
                    }

                    const cell = ws[cellRef];
                    // 기본 폰트 크기 10 강제 적용
                    cell.s = {
                        font: { size: 10, name: '맑은 고딕' },
                        alignment: { vertical: 'center' },
                        border: {
                            top: { style: "thin", color: { rgb: "E2E8F0" } },
                            left: { style: "thin", color: { rgb: "E2E8F0" } },
                            bottom: { style: "thin", color: { rgb: "E2E8F0" } },
                            right: { style: "thin", color: { rgb: "E2E8F0" } }
                        }
                    };

                    // 제목 행 (회색)
                    if (r === 0) {
                        cell.s = {
                            fill: { fgColor: { rgb: "F2F2F2" } },
                            font: { bold: true, size: 10, name: '맑은 고딕' },
                            alignment: { horizontal: "center", vertical: "center" },
                            border: {
                                top: { style: "thin", color: { rgb: "94A3B8" } },
                                left: { style: "thin", color: { rgb: "94A3B8" } },
                                bottom: { style: "thin", color: { rgb: "94A3B8" } },
                                right: { style: "thin", color: { rgb: "94A3B8" } }
                            }
                        };
                    } else {
                        // 조건부 컬러링 (수입: 옅은 빨강, 반입: 옅은 파랑)
                        const cellValue = String(cell.v || "");
                        if (cellValue.includes("수입")) {
                            cell.s.fill = { fgColor: { rgb: "FEE2E2" } }; // Red-100
                            cell.s.font = { color: { rgb: "B91C1C" }, size: 10 }; // Red-700
                        } else if (cellValue.includes("반입")) {
                            cell.s.fill = { fgColor: { rgb: "EFF6FF" } }; // Blue-50
                            cell.s.font = { color: { rgb: "1D4ED8" }, size: 10 }; // Blue-700
                        }
                    }
                }
            }

            // [최종 병기] !freeze 속성 중첩 적용 (일부 구버전/특이 환경 대응)
            ws['!freeze'] = { xSplit: 0, ySplit: 1 };
            // 자동 필터
            ws['!autofilter'] = { ref: ws['!ref'] };

            return ws;
        };

        const wsLatest = createSheet(latestRows);
        const wsAll = createSheet(allRowsSorted);

        XLSX.utils.book_append_sheet(wb, wsLatest, '최신이력_No1');
        XLSX.utils.book_append_sheet(wb, wsAll, '전체이력');

        // 파일명: "페이지이름_생성연월일시분초" 형식
        const now = new Date();
        const yyyy = now.getFullYear();
        const MM = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const filename = `컨테이너이력조회_${yyyy}${MM}${dd}${hh}${mm}${ss}.xlsx`;

        // xlsx-js-style 라이브러리가 로드되어 있으므로 그대로 writeFile 호출하면 스타일이 병합됩니다
        try {
            XLSX.writeFile(wb, filename);
        } catch (e) {
            console.error("Style export failed, falling back to basic XLSX", e);
            XLSX.writeFile(wb, filename);
        }

        setLogLines(prev => [...prev, `[다운로드] ${filename} 생성이 완료되었습니다.`].slice(-100));
    };

    const handleFileDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files?.[0] || null;
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
            if (!r || r[2] === '조회 대기중' || r[2] === '조회 진행중') return false;

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
                                    {loading && result && (() => {
                                        const total = Object.keys(result).length;
                                        const pending = Object.values(result).filter(r => r[0][2] === '조회 대기중' || r[0][2] === '조회 진행중').length;
                                        const done = total - pending;
                                        return pending > 0 ? (
                                            <span style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 700, marginLeft: '6px', background: '#eff6ff', padding: '2px 8px', borderRadius: '20px', border: '1px solid #bfdbfe' }}>
                                                ✓ {done} / {total} 완료
                                            </span>
                                        ) : null;
                                    })()}
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', marginRight: '10px' }}>
                                        {[...Array(maxDrivers || 4)].map((_, i) => {
                                            const w = (workers || []).find(work => work.id === i + 1);
                                            const isActive = !!w;
                                            const isBusy = isActive && !w.is_available;
                                            return (
                                                <div key={i} title={isActive ? `B#${i+1} 활성 (Last: ${new Date(w.last_activity * 1000).toLocaleTimeString()})` : `B#${i+1} 비활성`} style={{ width: '10px', height: '10px', borderRadius: '50%', background: isActive ? (isBusy ? '#f59e0b' : '#22c55e') : '#e2e8f0', border: '1px solid #cbd5e1' }}></div>
                                            );
                                        })}
                                    </div>
                                </h2>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    {result && (
                                        <button onClick={downloadExcel} className={styles.buttonExcelCompact}>엑셀 저장</button>
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
                                                        const isPending = rows[0][2] === '조회 대기중';
                                                        const isInProgress = rows[0][2] === '조회 진행중';
                                                        const isWaiting = isPending || isInProgress;

                                                        return (
                                                            <React.Fragment key={cn}>
                                                                <tr className={`${rowClass} ${isExpanded ? styles.expandedParentRow : ''}`}
                                                                    style={isWaiting ? { opacity: 0.75 } : undefined}>
                                                                    <td className={styles.stickyColumn}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                            {isWaiting ? (
                                                                                <div className={styles.spinner} style={{ width: '12px', height: '12px', flexShrink: 0 }} />
                                                                            ) : hasHistory ? (
                                                                                <button onClick={() => toggleRow(cn)} className={styles.toggleBtn}>
                                                                                    {isExpanded ? '▼' : '▶'}
                                                                                </button>
                                                                            ) : (
                                                                                <span style={{ width: '18px' }}></span>
                                                                            )}
                                                                            <span style={{ fontWeight: 900, color: isWaiting ? '#94a3b8' : undefined }}>{cn}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className={styles.cellBorder}>
                                                                        {isWaiting ? (
                                                                            <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>-</span>
                                                                        ) : rows[0][1] === 'ERROR' ? (
                                                                            <span style={{ color: '#ef4444', fontWeight: 'bold' }}>ERROR</span>
                                                                        ) : rows[0][1]}
                                                                    </td>
                                                                    <td className={styles.cellBorder}>
                                                                        {isWaiting ? (
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: isInProgress ? '#3b82f6' : '#94a3b8', fontSize: '0.78rem', fontWeight: 600 }}>
                                                                                {rows[0][2]}
                                                                            </span>
                                                                        ) : rows[0][1] === 'ERROR' ? (
                                                                            <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{rows[0][2]}</span>
                                                                        ) : <StatusBadge label={rows[0][2]} />}
                                                                    </td>
                                                                    <td className={styles.cellBorder}>
                                                                        {isWaiting ? (
                                                                            <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>-</span>
                                                                        ) : rows[0][1] === 'ERROR' ? '-' : <StatusBadge label={rows[0][3]} />}
                                                                    </td>
                                                                    {rows[0].slice(4).map((v, i) => (
                                                                        <td key={i} className={`${styles.cellBorder} ${i === 0 ? styles.cellLeft : ''}`}>
                                                                            {isWaiting ? <span style={{ color: '#cbd5e1' }}>-</span> : (v || '-')}
                                                                        </td>
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
                                            {runHistory && runHistory.length > 0 && (
                                                <div style={{ display: 'flex', gap: '6px', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, borderLeft: '1px solid #e2e8f0', paddingLeft: '8px' }}>
                                                    {runHistory.map(h => (
                                                        <span key={h.id} style={{ background: '#f8fafc', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                                            {h.id}차: {h.total}건 ({h.time ? h.time.toFixed(1) : 0}초)
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>🖥️ 실시간 브라우저 모니터링</h3>
                                <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '8px', gap: '4px' }}>
                                    {[1, 2, 3, 4].map(idx => {
                                        const workerList = Array.isArray(workers) ? workers : [];
                                        const workerInfo = workerList.find(w => w.id === idx);
                                        const isActive = !!workerInfo;
                                        const isBusy = isActive && !workerInfo.is_available;
                                        return (
                                            <button
                                                key={idx}
                                                onClick={() => isActive && setSelectedScreenshotIdx(idx)}
                                                title={isActive ? (isBusy ? `B#${idx} 조회 진행 중` : `B#${idx} 대기 중`) : `B#${idx} 미활성 (미로그인)`}
                                                style={{
                                                    padding: '4px 12px',
                                                    borderRadius: '6px',
                                                    border: 'none',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 700,
                                                    cursor: isActive ? 'pointer' : 'not-allowed',
                                                    backgroundColor: selectedScreenshotIdx === idx && isActive
                                                        ? (isBusy ? '#f59e0b' : '#3b82f6')
                                                        : 'transparent',
                                                    color: selectedScreenshotIdx === idx && isActive
                                                        ? 'white'
                                                        : (isActive ? '#64748b' : '#cbd5e1'),
                                                    transition: 'all 0.2s',
                                                    opacity: isActive ? 1 : 0.45,
                                                }}
                                            >
                                                #{idx}
                                                {isBusy && <span style={{ marginLeft: '3px', fontSize: '0.65rem' }}>🔄</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
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
        </div>
    );
}

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, errorStr: '' };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, errorStr: error.toString() };
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '40px', background: '#fef2f2', border: '1px solid #fca5a5', margin: '20px', borderRadius: '12px' }}>
                    <h2 style={{ color: '#991b1b', marginBottom: '10px' }}>⚠️ 클라이언트 오류가 발생했습니다.</h2>
                    <p style={{ color: '#475569', marginBottom: '20px' }}>이전 버전의 데이터(캐시) 구조가 현재 시스템과 충돌하여 페이지를 열람할 수 없습니다.</p>
                    <code style={{ display: 'block', padding: '10px', background: '#fff', color: '#ef4444', marginBottom: '20px', borderRadius: '6px' }}>{this.state.errorStr}</code>
                    <button 
                        onClick={() => { sessionStorage.clear(); localStorage.clear(); window.location.reload(); }}
                        style={{ padding: '10px 20px', background: '#ef4444', color: '#fff', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
                    >
                        모든 캐시 초기화 및 다시 로드 (권장)
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function ContainerHistoryPage() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return <div style={{ background: '#f1f5f9', minHeight: '100vh' }} />;
    return (
        <ErrorBoundary>
            <ContainerHistoryInner />
        </ErrorBoundary>
    );
}