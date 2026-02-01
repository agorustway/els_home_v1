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
    const containerCount = parseContainerInput(containerInput).length;
    const canAutoLogin = stepIndex === 1 && containerCount > 0 && (useSavedCreds ? defaultUserId : (userId?.trim() && userPw));
    const elsDisabled = elsAvailable === false;
    const searchDisabled = elsDisabled || loading || loginLoading || savingCreds || (stepIndex === 1 && !canAutoLogin);
    const buttonsDisabled = elsDisabled || loading || loginLoading || savingCreds;

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
        setLoginLoading(true);
        setLogLines(prev => [...prev, '[로그인] 시작...']);
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
            const text = await res.text();
            let data;
            try {
                data = text ? JSON.parse(text) : {};
            } catch (_) {
                const msg = text.trim().startsWith('<') ? '서버가 HTML을 반환했습니다. ELS 백엔드 URL(ELS_BACKEND_URL) 또는 NAS 컨테이너 상태를 확인하세요.' : '응답 형식 오류(JSON 아님)';
                throw new Error(msg);
            }
            if (!res.ok) throw new Error(data.error || '로그인 실패');
            setLogLines(prev => [...prev, ...(data.log || []), data.ok ? '[로그인 완료] 조회 가능합니다.' : '[로그인 실패]']);
            if (data.ok) setStepIndex(2);
        } catch (err) {
            setLogLines(prev => [...prev, `[오류] ${err.message}`]);
        } finally {
            setLoginLoading(false);
        }
    };
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
            setLogLines(prev => [...prev, '[자동 로그인] 값이 입력되어 자동 로그인 중입니다. 약 10초 대기 후 자동 조회됩니다.']);
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
                    setLogLines(prev => [...prev, ...(loginData.log || []), '[자동 로그인 실패] 위에서 로그인 버튼으로 먼저 로그인해 주세요.']);
                    setLoginLoading(false);
                    return;
                }
                setLogLines(prev => [...prev, ...(loginData.log || []), '[로그인 완료] 조회를 진행합니다.']);
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
        setLogLines(prev => [...prev, '[조회] 시작...']);
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
                            setLogLines(prev => [...prev, '[완료]', '[대기] 신규 입력을 받을 수 있도록 대기 중입니다. 추가 조회가 필요하면 컨테이너 번호를 입력한 뒤 [조회] 버튼을 눌러 주세요.']);
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
                        } catch (_) {}
                    }
                }
            }
            if (text) {
                if (text.startsWith('LOG:')) setLogLines(prev => [...prev, text.slice(4)]);
                else if (text.startsWith('RESULT:')) {
                    try {
                        const data = JSON.parse(text.slice(7));
                        setLogLines(prev => [...prev, '[완료]', '[대기] 신규 입력을 받을 수 있도록 대기 중입니다. 추가 조회가 필요하면 컨테이너 번호를 입력한 뒤 [조회] 버튼을 눌러 주세요.']);
                        setResult({ sheet1: data.sheet1 || [], sheet2: data.sheet2 || [] });
                        setResultPage(1);
                        if (data.downloadToken) {
                            setDownloadToken(data.downloadToken);
                            setStepIndex(4);
                            const d = new Date();
                            const pad = (n) => String(n).padStart(2, '0');
                            setResultFileName(`els_조회결과_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.xlsx`);
                        } else setStepIndex(2);
                        if (data.error) setLogLines(prev => [...prev, `[오류] ${data.error}`]);
                    } catch (_) {}
                }
            }
        } catch (err) {
            setLogLines(prev => [...prev, `[오류] ${err.message}`]);
            setStepIndex(2);
        } finally {
            setLoading(false);
        }
    };

    const downloadExcel = () => {
        if (!downloadToken) return;
        const q = new URLSearchParams({ token: downloadToken });
        if (resultFileName) q.set('filename', resultFileName);
        window.open(`/api/els/download?${q.toString()}`, '_blank');
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

    useEffect(() => {
        const doLogout = () => {
            try {
                fetch('/api/els/logout', { method: 'POST', keepalive: true }).catch(() => {});
            } catch (_) {}
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

    const downloadWinUrl = process.env.NEXT_PUBLIC_ELS_DOWNLOAD_WIN || '/api/downloads/els-win';
    const downloadAndroidUrl = process.env.NEXT_PUBLIC_ELS_DOWNLOAD_ANDROID || '/api/downloads/els-android';

    return (
        <div className={styles.page}>
            <h1 className={styles.title}>컨테이너 이력조회</h1>
            <p className={styles.desc}>
                {elsAvailable === true
                    ? '이 페이지에서 로그인·조회·다운로드가 가능합니다. 컨테이너 번호 또는 container_list.xlsx 업로드 후 조회하세요.'
                    : 'ELS 하이퍼터보 연동 · 컨테이너 번호 또는 container_list.xlsx 업로드 후 조회·다운로드'}
            </p>

            {/* 연결 확인 중: 조회 UI 노출 전까지 로딩만 표시 (깜빡임 방지) */}
            {elsAvailable === null && (
                <div className={styles.checkingBlock} aria-live="polite">
                    <p className={styles.checkingText}>연결 확인 중...</p>
                </div>
            )}

            {/* 실행 불가 시: 배너 + 설치 안내 버튼 (한 페이지로 연결) */}
            {elsAvailable === false && (
                <div className={styles.unavailableBlock} role="alert">
                    <div className={styles.unavailableBanner}>
                        <strong>
                            {parseAvailable
                                ? '엑셀 파싱(번호 추출)만 사용할 수 있습니다.'
                                : '이 환경에서는 웹에서 조회를 실행할 수 없습니다.'}
                        </strong>
                        <p>
                            {parseAvailable
                                ? '로그인·조회는 이 환경에서는 불가합니다. 엑셀 업로드로 번호만 추출 가능하며, 전체 기능은 설치 프로그램을 이용하세요.'
                                : (elsUnavailableReason || '설치 프로그램(PC/모바일 앱)을 다운로드해 사용하세요.')}
                        </p>
                        <a href="/employees/container-history/install" className={styles.installCtaButton}>
                            설치 프로그램 및 사용 안내 보기
                        </a>
                    </div>
                </div>
            )}

            {/* 조회 UI: API 사용 가능할 때만 표시 (null일 때는 위에서 로딩 표시) */}
            {elsAvailable === true && (
                <>
            <section className={styles.usageSection}>
                <p className={styles.usageText}>
                    이 작업은 <strong>etrans</strong> 로그인이 필요하며 약 <strong>10초</strong> 정도 소요됩니다.
                    로그인 후 컨테이너를 업로드하거나 번호를 입력하시면 조회·엑셀 다운로드가 가능합니다.
                    조회 완료 후에도 세션이 유지되므로 <strong>추가·변경된 번호로 바로 다시 조회</strong>할 수 있고,
                    페이지를 벗어나면 ETRANS가 자동 로그아웃됩니다.
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
                        {useSavedCreds && hasSavedAccount ? (
                            <div className={styles.credBoxRow}>
                                <div className={styles.credBox}>
                                    <span className={styles.credBoxLabel}>아이디</span>
                                    <span className={styles.credBoxValue}>{configLoaded ? defaultUserId : '…'}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={runLogin}
                                    disabled={buttonsDisabled}
                                    className={styles.btnLogin}
                                >
                                    {loginLoading ? '로그인 중...' : '로그인'}
                                </button>
                                <div className={styles.credBox}>
                                    <span className={styles.credBoxLabel}>비밀번호</span>
                                    <span className={styles.credBoxValue}>••••••••</span>
                                </div>
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
                                        onChange={(e) => setUserId(e.target.value)}
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
                                <div className={styles.credBox}>
                                    <span className={styles.credBoxLabel}>비밀번호</span>
                                    <input
                                        type="password"
                                        placeholder="비밀번호"
                                        value={userPw}
                                        onChange={(e) => setUserPw(e.target.value)}
                                        className={styles.input}
                                    />
                                </div>
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
                        <h2 className={styles.sectionTitle}>로그</h2>
                        <pre ref={terminalRef} className={styles.terminal}>
                            {logLines.length ? logLines.map((line, i) => <span key={i}>{line}{'\n'}</span>) : '로그가 여기에 표시됩니다.'}
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
                </>
            )}

            {/* PC/모바일 앱: API 사용 가능 시 하단에 설치 안내 (한 페이지로 연결) */}
            {elsAvailable === true && (
                <section className={styles.downloadSection}>
                    <h2 className={styles.downloadSectionTitle}>PC/모바일 앱으로 쓰려면</h2>
                    <p className={styles.downloadSectionDesc}>
                        웹에서 조회가 안 되거나, PC·모바일 앱을 쓰려면 아래 설치 프로그램을 받은 뒤 <strong>설치 및 사용 안내</strong> 페이지를 참고하세요.
                    </p>
                    <div className={styles.downloadLinks}>
                        <a href={downloadWinUrl} download className={styles.downloadCard} target="_blank" rel="noopener noreferrer">
                            <span className={styles.downloadCardIcon}>🖥️</span>
                            <span className={styles.downloadCardLabel}>Windows 설치 프로그램</span>
                            <span className={styles.downloadCardExt}>.exe</span>
                        </a>
                        <a href={downloadAndroidUrl} download className={styles.downloadCard} target="_blank" rel="noopener noreferrer">
                            <span className={styles.downloadCardIcon}>📱</span>
                            <span className={styles.downloadCardLabel}>Android 앱</span>
                            <span className={styles.downloadCardExt}>.apk</span>
                        </a>
                    </div>
                    <a href="/employees/container-history/install" className={styles.installGuideLink}>
                        설치 프로그램 및 사용 안내 (상세)
                    </a>
                </section>
            )}
        </div>
    );
}
