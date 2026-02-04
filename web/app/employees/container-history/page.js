'use client';

import { useState, useRef, Fragment, useEffect } from 'react';
import styles from './container-history.module.css';

const HEADERS = ['조회번호', 'No', '수출입', '구분', '터미널', 'MOVE TIME', '모선', '항차', '선사', '적공', 'SIZE', 'POD', 'POL', '차량번호', 'RFID'];

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
    const [parseAvailable, setParseAvailable] = useState(false);
    const [elsUnavailableReason, setElsUnavailableReason] = useState('');
    const [loginError, setLoginError] = useState(null);
    const [loginProgressLine, setLoginProgressLine] = useState(null);

    const autoLoginAttemptedRef = useRef(false);
    const loginStartTimeRef = useRef(null);
    const loginProgressIntervalRef = useRef(null);
    const runJustFinishedRef = useRef(false);

    useEffect(() => {
        fetch('/api/els/capabilities')
            .then((res) => res.json())
            .then((data) => {
                setElsAvailable(data.available === true);
                setParseAvailable(data.parseAvailable === true);
                if (data.available !== true && data.reason) setElsUnavailableReason(data.reason);
            })
            .catch(() => setElsAvailable(false));
    }, []);

    useEffect(() => {
        fetch('/api/els/config')
            .then((res) => res.json())
            .then((data) => {
                setDefaultUserId(data.defaultUserId || '');
                if (!data.hasSaved) setUseSavedCreds(false);
                setConfigLoaded(true);
            })
            .catch(() => setConfigLoaded(true));
    }, []);

    // 브라우저를 닫지 않았으면 메뉴 이동 후 돌아와도 대기(로그인 완료) 상태 유지 + 대기시간 연속(초 단위 동일하게 표시)
    useEffect(() => {
        if (!configLoaded) return;
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('elsContainerHistoryLoggedIn') === '1') {
            setStepIndex(2);
            autoLoginAttemptedRef.current = true;
            const raw = sessionStorage.getItem('elsWaitStartedAt');
            if (raw) {
                const t = parseInt(raw, 10);
                if (!Number.isNaN(t)) {
                    waitStartedAtRef.current = t;
                    setWaitSeconds(Math.floor((Date.now() - t) / 1000));
                }
            }
        }
    }, [configLoaded]);

    // 로그인 진행 중 다른 페이지 갔다 와도 진행시간 카운트 유지 (시작 시각 복원)
    const LOGIN_STARTED_MAX_AGE_MS = 120 * 1000; // 120초
    useEffect(() => {
        if (typeof sessionStorage === 'undefined') return;
        const raw = sessionStorage.getItem('elsLoginStartedAt');
        if (!raw) return;
        const startedAt = parseInt(raw, 10);
        if (Number.isNaN(startedAt)) return;
        const age = Date.now() - startedAt;
        if (age < 0 || age > LOGIN_STARTED_MAX_AGE_MS) {
            sessionStorage.removeItem('elsLoginStartedAt');
            return;
        }
        loginStartTimeRef.current = startedAt;
        autoLoginAttemptedRef.current = true; // 로그인 진행 중이면 자동 로그인 중복 호출 방지
        setLoginLoading(true);
        setLoginProgressLine(`[로그인중] ${Math.floor(age / 1000)}초`);
        if (loginProgressIntervalRef.current) clearInterval(loginProgressIntervalRef.current);
        loginProgressIntervalRef.current = setInterval(() => {
            const elapsed = loginStartTimeRef.current ? Math.floor((Date.now() - loginStartTimeRef.current) / 1000) : 0;
            if (elapsed >= 120) {
                if (loginProgressIntervalRef.current) {
                    clearInterval(loginProgressIntervalRef.current);
                    loginProgressIntervalRef.current = null;
                }
                sessionStorage.removeItem('elsLoginStartedAt');
                setLoginLoading(false);
                setLoginProgressLine(null);
                return;
            }
            setLoginProgressLine(`[로그인중] ${elapsed}초`);
        }, 1000);
        return () => {
            if (loginProgressIntervalRef.current) {
                clearInterval(loginProgressIntervalRef.current);
                loginProgressIntervalRef.current = null;
            }
        };
    }, []);

    const hasSavedAccount = Boolean(defaultUserId);
    const [containerInput, setContainerInput] = useState('');
    const [logLines, setLogLines] = useState([]);
    const [result, setResult] = useState(null);
    const [downloadToken, setDownloadToken] = useState(null);
    const [resultFileName, setResultFileName] = useState('');
    const [loading, setLoading] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);
    const [stepIndex, setStepIndex] = useState(1);
    const [dropActive, setDropActive] = useState(false);
    const [waitSeconds, setWaitSeconds] = useState(0);
    const waitStartedAtRef = useRef(null);
    
    // [BIOS UI] 부팅/로그인 단계 상태 관리
    const [bootStatus, setBootStatus] = useState({
        init: { label: 'Initialize Driver', status: 'pending' },    // 크롬 드라이버
        browser: { label: 'Start Browser', status: 'pending' },     // 브라우저 실행
        connect: { label: 'Connect to ETRANS', status: 'pending' }, // 사이트 접속
        login: { label: 'User Auth', status: 'pending' },           // 로그인
        menu: { label: 'Load Menu', status: 'pending' },            // 메뉴 진입
    });
    
    const containerCount = parseContainerInput(containerInput).length;
    const canAutoLogin = stepIndex === 1 && containerCount > 0 && (useSavedCreds ? defaultUserId : (userId?.trim() && userPw));
    const loadingInProgress = loading || loginLoading || savingCreds;
    const searchDisabled = loadingInProgress || (stepIndex === 1 && !canAutoLogin);
    const buttonsDisabled = loadingInProgress;

    const handleSaveCreds = async () => {
        const id = userId?.trim();
        const pw = userPw;
        if (!id || !pw) {
            setLogLines(prev => [...prev, '[계정] 아이디와 비밀번호를 입력한 뒤 체크해 저장하세요.']);
            return;
        }
        setSavingCreds(true);
        setLogLines(prev => [...prev, '[계정] 저장 중...']);
        try {
            const res = await fetch('/api/els/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: id, userPw: pw }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '저장 실패');
            setDefaultUserId(id);
            setUserId('');
            setUserPw('');
            setUseSavedCreds(true);
            setLogLines(prev => [...prev, '[계정] 저장되었습니다.']);
        } catch (err) {
            setLogLines(prev => [...prev, `[오류] ${err.message}`]);
        } finally {
            setSavingCreds(false);
        }
    };

    const handleCheckboxChange = (checked) => {
        setLoginError(null);
        if (checked) {
            if (!useSavedCreds && (userId?.trim() || userPw)) {
                handleSaveCreds();
                return;
            }
            setUseSavedCreds(true);
        } else {
            setUseSavedCreds(false);
            setUserId(defaultUserId);
            setUserPw('');
        }
    };

    const runLogin = async () => {
        if (useSavedCreds && !defaultUserId) {
            setLogLines(prev => [...prev, '[계정] 저장된 계정이 없습니다. 아이디/비밀번호 입력 후 체크해 저장하세요.']);
            return;
        }
        if (!useSavedCreds && (!userId?.trim() || !userPw)) {
            setLogLines(prev => [...prev, '[계정] 아이디와 비밀번호를 입력하세요.']);
            return;
        }
        setLoginError(null);
        setLoginLoading(true);
        setLogLines(prev => [...prev, '[네트워크] /api/els/login 요청 전송...']);
        let startedAt = Date.now();
        if (typeof sessionStorage !== 'undefined') {
            const raw = sessionStorage.getItem('elsLoginStartedAt');
            const existing = raw ? parseInt(raw, 10) : NaN;
            if (!Number.isNaN(existing) && (Date.now() - existing) <= LOGIN_STARTED_MAX_AGE_MS) {
                startedAt = existing;
                loginStartTimeRef.current = existing;
            }
        }
        if (loginStartTimeRef.current !== startedAt) loginStartTimeRef.current = startedAt;
        try {
            if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('elsLoginStartedAt', String(startedAt));
        } catch (_) { }
        const initialElapsed = Math.floor((Date.now() - startedAt) / 1000);
        setLoginProgressLine(`[로그인중] ${initialElapsed}초`);
        if (loginProgressIntervalRef.current) clearInterval(loginProgressIntervalRef.current);
        loginProgressIntervalRef.current = setInterval(() => {
            const elapsed = loginStartTimeRef.current ? Math.floor((Date.now() - loginStartTimeRef.current) / 1000) : 0;
            setLoginProgressLine(`[로그인중] ${elapsed}초`);
        }, 1000);
        try {
            const res = await fetch('/api/els/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    useSavedCreds,
                    userId: useSavedCreds ? undefined : userId.trim(),
                    userPw: useSavedCreds ? undefined : userPw,
                }),
            });
            setLogLines(prev => [...prev, `[네트워크] 응답 수신: status=${res.status} content-type=${res.headers.get('content-type') || ''}`]);

            // 1) JSON 응답(daemon 미사용/프록시 경로 등)도 지원
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                const loginData = await res.json().catch(() => null);
                const elapsed = loginStartTimeRef.current ? Math.round((Date.now() - loginStartTimeRef.current) / 1000) : 0;
                setLoginProgressLine(null);
                if (loginProgressIntervalRef.current) {
                    clearInterval(loginProgressIntervalRef.current);
                    loginProgressIntervalRef.current = null;
                }
                try {
                    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('elsLoginStartedAt');
                } catch (_) { }

                if (!loginData) {
                    setLogLines(prev => [...prev, '[오류] 로그인 응답(JSON) 파싱 실패', '[안내] NAS 타임아웃/프록시 설정을 확인하세요.']);
                    setLoginError('아이디·비밀번호를 확인하세요.');
                    return;
                }
                if (!res.ok || !loginData.ok) {
                    const logs = loginData.log || [];
                    setLogLines(prev => [...prev, ...logs, '[로그인 실패]']);
                    if (logs.length === 0 && elapsed >= 55) {
                        setLogLines(prev => [...prev, '[안내] 약 60초 만에 끊기면 NAS 역방향 프록시 타임아웃일 수 있습니다.']);
                    }
                    setLoginError('아이디·비밀번호를 확인하세요.');
                    return;
                }

                setLogLines(prev => [...prev, ...(loginData.log || [])]);
                runJustFinishedRef.current = parseContainerInput(containerInput).length > 0;
                try {
                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.setItem('elsContainerHistoryLoggedIn', '1');
                        sessionStorage.setItem('elsWaitStartedAt', String(Date.now()));
                    }
                } catch (_) { }
                setStepIndex(2);
                return;
            }

            // 2) 스트리밍 응답 처리 (LOG:/RESULT:)
            if (!res.body) {
                const text = await res.text().catch(() => '');
                throw new Error('서버 응답이 없습니다: ' + text);
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let loginData = null;

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('LOG:')) {
                        setLogLines(prev => [...prev, trimmed.slice(4)]);
                    } else if (trimmed.startsWith('RESULT:')) {
                        try {
                            loginData = JSON.parse(trimmed.slice(7));
                        } catch (_) { }
                    } else if (trimmed.startsWith('{') && !loginData) {
                        // 혹시 모를 Non-Streaming JSON Fallback
                        try {
                            loginData = JSON.parse(trimmed);
                        } catch (_) { }
                    }
                }
            }
            if (buffer.trim().startsWith('RESULT:')) {
                try { loginData = JSON.parse(buffer.trim().slice(7)); } catch (_) { }
            }

            const elapsed = loginStartTimeRef.current ? Math.round((Date.now() - loginStartTimeRef.current) / 1000) : 0;
            setLoginProgressLine(null);
            if (loginProgressIntervalRef.current) {
                clearInterval(loginProgressIntervalRef.current);
                loginProgressIntervalRef.current = null;
            }
            try {
                if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('elsLoginStartedAt');
            } catch (_) { }

            if (!loginData) {
                setLogLines(prev => [...prev, '[오류] 로그인 응답 데이터가 없습니다.', '[안내] NAS 타임아웃일 수 있습니다.']);
                setLoginError('아이디·비밀번호를 확인하세요.');
                return;
            }

            if (!loginData.ok) {
                const logs = loginData.log || [];
                setLogLines(prev => [...prev, ...logs, '[로그인 실패]']);
                if (logs.length === 0 && elapsed >= 55) {
                    setLogLines(prev => [...prev, '[안내] 약 60초 만에 끊기면 NAS 역방향 프록시 타임아웃일 수 있습니다.']);
                }
                setLoginError('아이디·비밀번호를 확인하세요.');
                return;
            }

            setLogLines(prev => [...prev, ...(loginData.log || [])]);
            runJustFinishedRef.current = parseContainerInput(containerInput).length > 0;
            try {
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.setItem('elsContainerHistoryLoggedIn', '1');
                    sessionStorage.setItem('elsWaitStartedAt', String(Date.now()));
                }
            } catch (_) { }
            setStepIndex(2);
        } catch (err) {
            setLoginProgressLine(null);
            if (loginProgressIntervalRef.current) {
                clearInterval(loginProgressIntervalRef.current);
                loginProgressIntervalRef.current = null;
            }
            try {
                if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('elsLoginStartedAt');
            } catch (_) { }
            setLogLines(prev => [...prev, `[오류] ${err.message}`]);
            setLoginError('아이디·비밀번호를 확인하세요.');
        } finally {
            setLoginLoading(false);
        }
    };

    // 자동 로그인: 이미 로그인 진행 중(elsLoginStartedAt 있음)이면 runLogin 호출하지 않음 → 페이지 갔다 와도 시간 0으로 리셋 방지
    useEffect(() => {
        if (!configLoaded || !defaultUserId || !useSavedCreds || autoLoginAttemptedRef.current) return;
        if (typeof sessionStorage !== 'undefined') {
            const raw = sessionStorage.getItem('elsLoginStartedAt');
            if (raw) {
                const t = parseInt(raw, 10);
                if (!Number.isNaN(t) && (Date.now() - t) <= LOGIN_STARTED_MAX_AGE_MS) {
                    autoLoginAttemptedRef.current = true;
                    return; // 진행 중 복원은 별도 effect에서 처리, 여기서 runLogin() 호출하면 시간 0으로 덮어씀
                }
            }
        }
        autoLoginAttemptedRef.current = true;
        runLogin();
    }, [elsAvailable, configLoaded, defaultUserId, useSavedCreds]);
    const [expandedRows, setExpandedRows] = useState(new Set());
    const [resultPage, setResultPage] = useState(1);
    const [resultPageSize, setResultPageSize] = useState(20);
    const fileInputRef = useRef(null);
    const terminalRef = useRef(null);

    const toggleRow = (key) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const processFile = async (file) => {
        if (!file || !file.name.toLowerCase().endsWith('.xlsx')) {
            setLogLines(prev => [...prev, '[파일] container_list.xlsx 형식만 지원합니다.']);
            return;
        }
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch('/api/els/parse-xlsx', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '파싱 실패');
            const list = (data.containers || []).join('\n');
            setContainerInput(list);
            setLogLines(prev => [...prev, `[파일] ${data.containers?.length || 0}개 컨테이너 번호 로드됨.`]);
        } catch (err) {
            setLogLines(prev => [...prev, `[오류] ${err.message}`]);
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target?.files?.[0];
        await processFile(file);
        e.target.value = '';
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDropActive(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) processFile(file);
    };
    const handleDragOver = (e) => {
        e.preventDefault();
        setDropActive(true);
    };
    const handleDragLeave = () => setDropActive(false);
    const handleDropZoneClick = () => fileInputRef.current?.click();

    const runSearch = async () => {
        const containers = parseContainerInput(containerInput);
        if (containers.length === 0) {
            setLogLines(prev => [...prev, '[입력] 컨테이너 번호를 입력하거나 엑셀 파일을 업로드해 주세요.']);
            return;
        }
        if (!useSavedCreds && (!userId?.trim() || !userPw?.trim())) {
            setLogLines(prev => [...prev, '[계정] 신규 계정 사용 시 아이디와 비밀번호를 입력해 주세요.']);
            return;
        }

        if (stepIndex === 1) {
            setLoginLoading(true);
            setLogLines(prev => [...prev, '[자동 로그인] 입력된 컨테이너로 로그인 후 바로 조회를 진행합니다. (보통 15~20초 이상)']);
            try {
                const loginRes = await fetch('/api/els/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        useSavedCreds,
                        userId: useSavedCreds ? undefined : userId.trim(),
                        userPw: useSavedCreds ? undefined : userPw,
                    }),
                });
                const loginText = await loginRes.text();
                let loginData;
                try {
                    loginData = loginText ? JSON.parse(loginText) : {};
                } catch (_) {
                    throw new Error(loginText.trim().startsWith('<') ? '서버가 HTML을 반환했습니다. ELS 백엔드 URL 또는 NAS 컨테이너를 확인하세요.' : '응답 형식 오류');
                }
                if (!loginRes.ok || !loginData.ok) {
                    setLogLines(prev => [...prev, ...(loginData.log || []), '[자동 로그인 실패] 로그인 버튼으로 먼저 로그인해 주세요.']);
                    setLoginLoading(false);
                    return;
                }
                setLogLines(prev => [...prev, ...(loginData.log || []), '[로그인 완료] 조회를 진행합니다.']);
                try {
                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.setItem('elsContainerHistoryLoggedIn', '1');
                        sessionStorage.setItem('elsWaitStartedAt', String(Date.now()));
                    }
                } catch (_) { }
                setStepIndex(2);
            } catch (err) {
                setLogLines(prev => [...prev, `[오류] ${err.message}`]);
                setLoginLoading(false);
                return;
            } finally {
                setLoginLoading(false);
            }
        }

        setLoading(true);
        setStepIndex(3);
        setLogLines(prev => [...prev, '[조회] 조회를 시작합니다.']);
        setResult(null);
        setDownloadToken(null);
        setResultFileName('');
        setResultPage(1);
        try {
            const res = await fetch('/api/els/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    containers,
                    useSavedCreds,
                    userId: useSavedCreds ? undefined : userId.trim(),
                    userPw: useSavedCreds ? undefined : userPw,
                }),
            });
            if (!res.ok || !res.body) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || '조회 실패');
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let text = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                text += decoder.decode(value, { stream: true });
                const lines = text.split('\n');
                text = lines.pop() || '';
                for (const line of lines) {
                    if (line.startsWith('LOG:')) {
                        setLogLines(prev => [...prev, line.slice(4)]);
                    } else if (line.startsWith('RESULT:')) {
                        try {
                            const data = JSON.parse(line.slice(7));
                            setLogLines(prev => [...prev, '[완료]', '[대기] 입력 대기 중입니다. 컨테이너 번호 또는 엑셀 입력 후 [조회]를 눌러 주세요.']);
                            setResult({ sheet1: data.sheet1 || [], sheet2: data.sheet2 || [] });
                            setResultPage(1);
                            if (data.downloadToken) {
                                setDownloadToken(data.downloadToken);
                                setStepIndex(4);
                                const d = new Date();
                                const pad = (n) => String(n).padStart(2, '0');
                                setResultFileName(`els_조회결과_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.xlsx`);
                            } else {
                                setStepIndex(2);
                            }
                            if (data.error) setLogLines(prev => [...prev, `[오류] ${data.error}`]);
                        } catch (_) { }
                    }
                }
            }
            if (text) {
                if (text.startsWith('LOG:')) setLogLines(prev => [...prev, text.slice(4)]);
                else if (text.startsWith('RESULT:')) {
                    try {
                        const data = JSON.parse(text.slice(7));
                        setLogLines(prev => [...prev, '[완료]', '[대기] 입력 대기 중입니다. 컨테이너 번호 또는 엑셀 입력 후 [조회]를 눌러 주세요.']);
                        setResult({ sheet1: data.sheet1 || [], sheet2: data.sheet2 || [] });
                        setResultPage(1);
                        if (data.downloadToken) {
                            setDownloadToken(data.downloadToken);
                            setStepIndex(4);
                            const d = new Date();
                            const pad = (n) => String(n).padStart(2, '0');
                            setResultFileName(`els_조회결과_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.xlsx`);
                        } else {
                            try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('elsWaitStartedAt', String(Date.now())); } catch (_) { }
                            setStepIndex(2);
                        }
                        if (data.error) setLogLines(prev => [...prev, `[오류] ${data.error}`]);
                    } catch (_) { }
                }
            }
        } catch (err) {
            setLogLines(prev => [...prev, `[오류] ${err.message}`]);
            try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('elsWaitStartedAt', String(Date.now())); } catch (_) { }
            setStepIndex(2);
        } finally {
            setLoading(false);
        }
    };

    // 로그인 완료 후 대기열(엑셀/컨테이너 번호) 있으면 바로 조회 진행
    useEffect(() => {
        if (stepIndex !== 2 || !runJustFinishedRef.current || loading) return;
        const containers = parseContainerInput(containerInput);
        if (containers.length === 0) {
            runJustFinishedRef.current = false;
            return;
        }
        runJustFinishedRef.current = false;
        runSearch();
    }, [stepIndex, loading]);

    const downloadExcel = () => {
        if (!downloadToken) return;
        const q = new URLSearchParams({ token: downloadToken });
        if (resultFileName) q.set('filename', resultFileName);
        // 조회·파일은 NAS에서 처리되므로 다운로드도 NAS URL로 요청 (Vercel 404 방지)
        const downloadBase = process.env.NEXT_PUBLIC_ELS_BACKEND_URL || '';
        const downloadUrl = downloadBase
            ? `${downloadBase.replace(/\/$/, '')}/api/els/download?${q.toString()}`
            : `/api/els/download?${q.toString()}`;
        window.open(downloadUrl, '_blank');
    };

    const sheet1Rows = result?.sheet1 || [];
    const sheet2Rows = result?.sheet2 || [];
    const getDetailRows = (containerNo) => sheet2Rows.filter(r => (r && r[0]) === containerNo);

    const totalResultCount = sheet1Rows.length;
    const totalPages = Math.max(1, Math.ceil(totalResultCount / resultPageSize));
    const currentPage = Math.min(Math.max(1, resultPage), totalPages);
    const startIdx = (currentPage - 1) * resultPageSize;
    const paginatedRows = sheet1Rows.slice(startIdx, startIdx + resultPageSize);

    useEffect(() => {
        if (result && resultPage > totalPages) setResultPage(totalPages);
    }, [result, resultPage, totalPages]);

    useEffect(() => {
        if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }, [logLines]);

    // 로그 메시지 파싱하여 BIOS 스타일 상태 업데이트
    useEffect(() => {
        if (logLines.length === 0) {
            // 초기화
            if (!loading && !loginLoading) {
                setBootStatus({
                    init: { label: 'Initialize Driver', status: 'pending' },
                    browser: { label: 'Start Browser', status: 'pending' },
                    connect: { label: 'Connect to ETRANS', status: 'pending' },
                    login: { label: 'User Auth', status: 'pending' },
                    menu: { label: 'Load Menu', status: 'pending' },
                });
            }
            return;
        }

        const lastLog = logLines[logLines.length - 1] || '';
        const allLogs = logLines.join('\n'); // 전체 맥락 확인용
        
        setBootStatus(prev => {
            const next = {...prev};

            // 1. 드라이버 초기화
            if (allLogs.includes('크롬 드라이버') || allLogs.includes('드라이버 로드') || allLogs.includes('드라이버 설치')) {
                if (next.init.status === 'pending') next.init.status = 'running';
            }
            if (allLogs.includes('브라우저 실행 시도') || allLogs.includes('브라우저 실행 완료') || allLogs.includes('브라우저 시작')) {
                next.init.status = 'done';
            }

            // 2. 브라우저 실행
            if (allLogs.includes('브라우저 실행 시도') || allLogs.includes('브라우저 시작')) {
                if (next.browser.status === 'pending') next.browser.status = 'running';
            }
            if (allLogs.includes('사이트 접속 시도') || allLogs.includes('사이트 접속 명령') || allLogs.includes('접속 명령')) {
                next.browser.status = 'done';
            }

            // 3. ETRANS 접속
            if (allLogs.includes('사이트 접속 명령') || allLogs.includes('접속 명령') || allLogs.includes('ETRANS 접속')) {
                if (next.connect.status === 'pending') next.connect.status = 'running';
            }
            if (allLogs.includes('로그인 화면') || allLogs.includes('아이디 입력창') || allLogs.includes('로그인 화면(아이디 입력창)')) {
                next.connect.status = 'done';
            }

            // 4. 로그인
            if (allLogs.includes('로그인 화면') || allLogs.includes('아이디/비밀번호 입력') || allLogs.includes('로그인 프로세스')) {
                if (next.login.status === 'pending') next.login.status = 'running';
            }
            if (allLogs.includes('로그인 성공') || allLogs.includes('로그인 완료') || allLogs.includes('로그인 프로세스 완료')) {
                next.login.status = 'done';
            }

            // 5. 메뉴 진입
            if (allLogs.includes('컨테이너 이동현황 페이지') || allLogs.includes('메뉴 클릭') || allLogs.includes('메뉴 이동')) {
                if (next.menu.status === 'pending') next.menu.status = 'running';
            }
            if (allLogs.includes('입력창 발견') || allLogs.includes('메뉴 진입 성공') || allLogs.includes('입력창 로드')) {
                next.menu.status = 'done';
            }

            // 에러 감지
            if (lastLog.includes('오류') || lastLog.includes('실패') || lastLog.includes('타임아웃') || lastLog.includes('TimeOut') || lastLog.includes('ERROR')) {
                // 현재 running 상태인 것을 error로
                Object.keys(next).forEach(k => {
                    if (next[k].status === 'running') next[k].status = 'error';
                });
            }

            return next;
        });
    }, [logLines, loading, loginLoading]);

    // BIOS 스타일 상태 표시 렌더링 함수
    const renderBootStatus = () => (
        <div style={{
            fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
            backgroundColor: '#0a0a0a',
            color: '#00ff00',
            padding: '12px',
            marginBottom: '12px',
            borderRadius: '4px',
            fontSize: '13px',
            border: '1px solid #333',
            boxShadow: 'inset 0 0 10px rgba(0, 0, 0, 0.5)'
        }}>
            <div style={{ 
                borderBottom: '1px solid #333', 
                paddingBottom: '6px', 
                marginBottom: '8px', 
                fontWeight: 'bold', 
                color: '#00ff00',
                fontSize: '12px',
                letterSpacing: '1px'
            }}>
                SYSTEM DIAGNOSTIC
            </div>
            {Object.entries(bootStatus).map(([key, val]) => {
                let statusIcon = '[    ]';
                let statusColor = '#666';
                if (val.status === 'running') { 
                    statusIcon = '[....]'; 
                    statusColor = '#ffaa00'; // 주황 (진행중)
                } else if (val.status === 'done') { 
                    statusIcon = '[ OK ]'; 
                    statusColor = '#00ff00'; // 초록 (완료)
                } else if (val.status === 'error') { 
                    statusIcon = '[FAIL]'; 
                    statusColor = '#ff0000'; // 빨강 (실패)
                }

                return (
                    <div key={key} style={{ 
                        display: 'flex', 
                        gap: '10px', 
                        lineHeight: '1.6',
                        marginBottom: '4px',
                        alignItems: 'center'
                    }}>
                        <span style={{ 
                            color: statusColor, 
                            fontWeight: 'bold',
                            fontFamily: "'Consolas', 'Monaco', monospace",
                            minWidth: '60px'
                        }}>
                            {statusIcon}
                        </span>
                        <span style={{ 
                            color: val.status === 'pending' ? '#666' : (val.status === 'running' ? '#fff' : '#aaa'),
                            fontFamily: "'Consolas', 'Monaco', monospace"
                        }}>
                            {val.label}
                        </span>
                        {val.status === 'running' && (
                            <span className={styles.blinkingCursor}>_</span>
                        )}
                    </div>
                );
            })}
        </div>
    );

    // 대기 상태(stepIndex===2)일 때 초 단위 대기시간 표시 (멈추지 않았음을 알리기 위함). 페이지 나갔다 와도 연속 유지.
    useEffect(() => {
        if (stepIndex !== 2 || loading) {
            setWaitSeconds(0);
            if (stepIndex !== 2) waitStartedAtRef.current = null;
            return;
        }
        if (waitStartedAtRef.current == null && typeof sessionStorage !== 'undefined') {
            const raw = sessionStorage.getItem('elsWaitStartedAt');
            waitStartedAtRef.current = raw ? parseInt(raw, 10) : Date.now();
            if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('elsWaitStartedAt', String(waitStartedAtRef.current));
        } else if (waitStartedAtRef.current == null) {
            waitStartedAtRef.current = Date.now();
            try {
                if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('elsWaitStartedAt', String(waitStartedAtRef.current));
            } catch (_) { }
        }
        setWaitSeconds(Math.floor((Date.now() - waitStartedAtRef.current) / 1000));
        const interval = setInterval(() => {
            if (waitStartedAtRef.current == null) return;
            setWaitSeconds(Math.floor((Date.now() - waitStartedAtRef.current) / 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, [stepIndex, loading]);

    useEffect(() => {
        const doLogout = () => {
            try {
                fetch('/api/els/logout', { method: 'POST', keepalive: true }).catch(() => { });
            } catch (_) { }
        };
        const onPageHide = () => {
            navigator.sendBeacon?.('/api/els/logout', '') || doLogout();
        };
        window.addEventListener('pagehide', onPageHide);
        return () => {
            window.removeEventListener('pagehide', onPageHide);
            doLogout();
        };
    }, []);

    const steps = [
        { num: 1, label: '로그인' },
        { num: 2, label: '대기' },
        { num: 3, label: '실행' },
        { num: 4, label: '완료(다운로드 가능)' },
    ];

    return (
        <div className={styles.page}>
            <h1 className={styles.title}>컨테이너 이력조회</h1>
            <p className={styles.desc}>
                ETRANS 로그인 후 컨테이너 번호 또는 엑셀 업로드로 조회·엑셀 다운로드.
            </p>

            <section className={styles.usageSection}>
                <p className={styles.usageText}>
                    이 작업은 <strong>ETRANS</strong> 로그인이 필요하며 초기 구동(로그인 및 메뉴 이동)에 <strong>30~50초</strong> 가량 소요될 수 있습니다.
                    로그인 후에는 <strong>세션이 자동 유지(55분 주기 갱신)</strong>되므로 페이지를 이동해도 로그인이 풀리지 않으며,
                    이 창을 띄워두시는 동안에는 추가 번호로 <strong>대기 없이 즉시 조회</strong>가 가능합니다.
                </p>
                <div className={styles.stepIndicator}>
                    {steps.map((s, i) => (
                        <div key={s.num} className={styles.stepItem}>
                            <span
                                className={`${styles.stepCircle} ${stepIndex > s.num ? styles.stepDone : ''} ${stepIndex === s.num ? styles.stepActive : ''}`}
                                aria-hidden
                            >
                                {stepIndex > s.num ? '✓' : s.num}
                            </span>
                            <span className={styles.stepLabel}>{s.label}</span>
                            {i < steps.length - 1 && <span className={styles.stepArrow}>→</span>}
                        </div>
                    ))}
                </div>
            </section>

            <div className={styles.mainModule}>
                        <div className={styles.leftPanel}>
                            {/* 계정 */}
                            <section className={styles.section}>
                                <h2 className={styles.sectionTitle}>계정</h2>
                                {loginError && (
                                    <div className={styles.loginErrorBanner} role="alert">
                                        <span className={styles.loginErrorText}>{loginError}</span>
                                        <button type="button" onClick={() => { setLoginError(null); runLogin(); }} className={styles.loginErrorRetry} disabled={loginLoading}>
                                            다시 로그인
                                        </button>
                                    </div>
                                )}
                                {useSavedCreds && hasSavedAccount ? (
                                    <div className={styles.credBoxRow}>
                                        <div className={styles.credBox}>
                                            <span className={styles.credBoxLabel}>아이디</span>
                                            <span className={styles.credBoxValue}>{configLoaded ? defaultUserId : '…'}</span>
                                        </div>
                                        <div className={styles.credBox}>
                                            <span className={styles.credBoxLabel}>비밀번호</span>
                                            <span className={styles.credBoxValue}>••••••••</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={runLogin}
                                            disabled={buttonsDisabled}
                                            className={styles.btnLogin}
                                        >
                                            {loginLoading ? '로그인 중...' : '로그인'}
                                        </button>
                                        <label className={styles.checkLabel}>
                                            <input
                                                type="checkbox"
                                                checked={useSavedCreds}
                                                onChange={(e) => handleCheckboxChange(e.target.checked)}
                                            />
                                            <span>저장된 계정 사용</span>
                                        </label>
                                    </div>
                                ) : (
                                    <div className={styles.credRow}>
                                        <div className={styles.credBox}>
                                            <span className={styles.credBoxLabel}>아이디</span>
                                            <input
                                                type="text"
                                                placeholder="아이디"
                                                value={userId}
                                                onChange={(e) => { setUserId(e.target.value); setLoginError(null); }}
                                                onFocus={() => setLoginError(null)}
                                                className={styles.input}
                                            />
                                        </div>
                                        <div className={styles.credBox}>
                                            <span className={styles.credBoxLabel}>비밀번호</span>
                                            <input
                                                type="password"
                                                placeholder="비밀번호"
                                                value={userPw}
                                                onChange={(e) => { setUserPw(e.target.value); setLoginError(null); }}
                                                onFocus={() => setLoginError(null)}
                                                className={styles.input}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={runLogin}
                                            disabled={buttonsDisabled}
                                            className={styles.btnLogin}
                                        >
                                            {loginLoading ? '로그인 중...' : '로그인'}
                                        </button>
                                        <label className={styles.checkLabel}>
                                            <input
                                                type="checkbox"
                                                checked={useSavedCreds}
                                                onChange={(e) => handleCheckboxChange(e.target.checked)}
                                            />
                                            <span>저장된 계정 사용 (체크 시 저장)</span>
                                        </label>
                                    </div>
                                )}
                            </section>

                            {/* 업로드 · 입력 */}
                            <section className={styles.section}>
                                <h2 className={styles.sectionTitle}>업로드 · 입력</h2>
                                <p className={styles.hint}>컨테이너 번호 또는 엑셀 업로드 (클릭·드래그로 파일 선택)</p>
                                <div
                                    className={`${styles.dropZone} ${dropActive ? styles.dropZoneActive : ''}`}
                                    onClick={handleDropZoneClick}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDropZoneClick(); } }}
                                >
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        accept=".xlsx"
                                        onChange={handleFileChange}
                                        className={styles.fileInput}
                                    />
                                    <span className={styles.dropZoneText}>
                                        {dropActive ? '여기에 놓으세요' : '엑셀 파일 클릭 또는 드래그'}
                                    </span>
                                    <a href="/api/els/template" download className={styles.btnTemplate} onClick={(e) => e.stopPropagation()}>
                                        양식 다운로드
                                    </a>
                                </div>
                                <div className={styles.uploadRow}>
                                    <textarea
                                        placeholder="컨테이너 번호를 한 줄에 하나씩 또는 쉼표/공백으로 구분"
                                        value={containerInput}
                                        onChange={(e) => setContainerInput(e.target.value)}
                                        className={styles.textarea}
                                        rows={5}
                                    />
                                </div>
                                <div className={styles.actionRow}>
                                    <button
                                        type="button"
                                        onClick={runSearch}
                                        disabled={searchDisabled}
                                        className={styles.btnPrimary}
                                    >
                                        {loading ? '조회 중...' : '조회'}
                                    </button>
                                    {containerCount > 0 && (
                                        <span className={styles.containerCount}>로딩된 컨테이너 {containerCount}개</span>
                                    )}
                                    {downloadToken && resultFileName && (
                                        <div className={styles.downloadResult}>
                                            <span className={styles.resultFileName}>{resultFileName}</span>
                                            <button type="button" onClick={downloadExcel} className={styles.btnDownload}>
                                                다운로드
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>

                        <div className={styles.rightPanel}>
                            <section className={styles.section + ' ' + styles.logSection}>
                                <h2 className={styles.sectionTitle}>시스템 상태</h2>
                                {/* BIOS Style Status Panel */}
                                {renderBootStatus()}
                                <h3 className={styles.sectionTitle} style={{ marginTop: '16px', fontSize: '0.9rem', color: '#666' }}>상세 로그</h3>
                                <pre ref={terminalRef} className={styles.terminal}>
                                    {logLines.length || loginProgressLine || (stepIndex === 2 && !loading) ? [...logLines, loginProgressLine, (stepIndex === 2 && !loading) ? `대기중입니다 (${waitSeconds}초)` : null].filter(Boolean).map((line, i) => <span key={i}>{line}{'\n'}</span>) : '로그가 여기에 표시됩니다.'}
                                </pre>
                            </section>
                        </div>
                    </div>

                    {/* 결과 (Sheet1 기준, 클릭 시 Sheet2 전개) */}
                    {result && (
                        <section className={styles.section}>
                            <div className={styles.resultHeader}>
                                <h2 className={styles.sectionTitle}>조회 결과 (Sheet1 · No=1 기준)</h2>
                            </div>
                            <div className={styles.tableWrap}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th></th>
                                            {HEADERS.map((h, i) => <th key={i}>{h}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedRows.map((row, idx) => {
                                            const containerNo = row && row[0];
                                            const detailRows = getDetailRows(containerNo);
                                            const hasDetail = detailRows.length > 1;
                                            const isExpanded = expandedRows.has(containerNo);
                                            return (
                                                <Fragment key={`${containerNo}-${idx}`}>
                                                    <tr
                                                        className={hasDetail ? styles.clickableRow : ''}
                                                        onClick={() => hasDetail && toggleRow(containerNo)}
                                                    >
                                                        <td>{hasDetail ? (isExpanded ? '▼' : '▶') : ''}</td>
                                                        {HEADERS.map((_, i) => (
                                                            <td key={i} className={row[1] === 'ERROR' || row[1] === 'NODATA' ? styles.cellError : ''}>
                                                                {row[i] ?? ''}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                    {isExpanded && detailRows.map((dr, di) => (
                                                        <tr key={`${containerNo}-sub-${di}`} className={styles.subRow}>
                                                            <td></td>
                                                            {HEADERS.map((_, i) => (
                                                                <td key={i}>{dr[i] ?? ''}</td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className={styles.paginationWrap}>
                                <span className={styles.paginationInfo}>
                                    총 {totalResultCount}건 · {totalResultCount > 0 ? `${startIdx + 1}-${Math.min(startIdx + resultPageSize, totalResultCount)}` : '0'} / {totalResultCount}
                                </span>
                                <div className={styles.paginationControls}>
                                    <select
                                        className={styles.pageSizeSelect}
                                        value={resultPageSize}
                                        onChange={(e) => { setResultPageSize(Number(e.target.value)); setResultPage(1); }}
                                        aria-label="페이지당 건수"
                                    >
                                        <option value={20}>20개씩</option>
                                        <option value={30}>30개씩</option>
                                        <option value={50}>50개씩</option>
                                        <option value={100}>100개씩</option>
                                    </select>
                                    <button
                                        type="button"
                                        className={styles.paginationBtn}
                                        disabled={currentPage <= 1}
                                        onClick={() => setResultPage((p) => Math.max(1, p - 1))}
                                        aria-label="이전 페이지"
                                    >
                                        이전
                                    </button>
                                    <span className={styles.paginationInfo}>
                                        {currentPage} / {totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        className={styles.paginationBtn}
                                        disabled={currentPage >= totalPages}
                                        onClick={() => setResultPage((p) => Math.min(totalPages, p + 1))}
                                        aria-label="다음 페이지"
                                    >
                                        다음
                                    </button>
                                </div>
                            </div>
                        </section>
                    )}
        </div>
    );
}
