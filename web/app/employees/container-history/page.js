'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Script from 'next/script';
import styles from './container-history.module.css';

const HEADERS = ['컨테이너번호', 'No', '수출입', '구분', '터미널', 'MOVE TIME', '모선', '항차', '선사', '적공', 'SIZE', 'POD', 'POL', '차량번호', 'RFID'];
const ITEMS_PER_PAGE = 10;

function StatusBadge({ type, label }) {
    let className = styles.badge;
    if (label === '수입') className += ` ${styles.badgeImport}`;
    else if (label === '수출') className += ` ${styles.badgeExport}`;
    else if (label === '반입') className += ` ${styles.badgeInbox}`;
    else if (label === '반출') className += ` ${styles.badgeOutbox}`;
    else className += ` ${styles.badgeEmpty}`;
    return <span className={className}>{label || '-'}</span>;
}

function parseContainerInput(text) {
    if (!text || !text.trim()) return [];
    const raw = text.split(/[\n,;\s]+/).map(s => s.replace(/\s/g, '').toUpperCase()).filter(Boolean);
    return [...new Set(raw)];
}

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
    });
    const [lastSavedInfo, setLastSavedInfo] = useState('');
    const [isSaveChecked, setIsSaveChecked] = useState(false);
    const [showBrowser, setShowBrowser] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [searchFilter, setSearchFilter] = useState('');
    const [activeStatFilter, setActiveStatFilter] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [downloadToken, setDownloadToken] = useState(null);
    const [resultFileName, setResultFileName] = useState('');

    const terminalRef = useRef(null);
    const fileInputRef = useRef(null);
    const timerRef = useRef(null);
    const elapsedSecondsRef = useRef(0);
    const hasInitialized = useRef(false);
    const pendingSearchRef = useRef(null);
    const initialCreds = useRef({ id: '', pw: '' });

    const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_ELS_BACKEND_URL || 'http://localhost:2929';

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

    const handleSaveCreds = useCallback(async (id, pw) => {
        const targetId = (id || userId).trim();
        const targetPw = pw || userPw;
        if (!targetId || !targetPw) return;
        if (targetId === initialCreds.current.id && targetPw === initialCreds.current.pw) return;
        try {
            const res = await fetch('/api/employees/els-creds', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ elsId: targetId, elsPw: targetPw }),
            });
            if (res.ok) {
                initialCreds.current = { id: targetId, pw: targetPw };
                setLastSavedInfo(new Date().toLocaleString('ko-KR'));
                setLogLines(prev => [...prev, '✓ 계정 정보가 안전하게 저장되었습니다.']);
            }
        } catch (err) { console.error(err); }
    }, [userId, userPw]);

    const handleLogin = useCallback(async (id, pw) => {
        const loginId = id || userId; const loginPw = pw || userPw;
        if (!loginId || !loginPw) { setLogLines(prev => [...prev, '[오류] 아이디와 비밀번호가 필요합니다.']); return; }
        setLoginLoading(true); startTimer();
        try {
            if (isSaveChecked) handleSaveCreds(loginId, loginPw);
            const res = await fetch(`${BACKEND_BASE_URL}/api/els/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: loginId.trim(), userPw: loginPw, showBrowser }),
            });
            const data = await res.json();
            if (data.log) setLogLines(prev => [...prev, ...data.log]);
            if (data.ok) {
                setLoginSuccess(true);
                sessionStorage.setItem('els_login_success', 'true');
                sessionStorage.setItem('els_login_timestamp', Date.now().toString());
                if (pendingSearchRef.current) {
                    const queue = [...pendingSearchRef.current];
                    pendingSearchRef.current = null;
                    executeSearch(queue, loginId, loginPw);
                }
            }
        } catch (err) { setLogLines(prev => [...prev, `[오류] ${err.message}`]); }
        finally { setLoginLoading(false); stopTimer(); }
    }, [userId, userPw, showBrowser, BACKEND_BASE_URL, startTimer, stopTimer, isSaveChecked, handleSaveCreds]);

    useEffect(() => {
        if (hasInitialized.current) return;
        hasInitialized.current = true;
        const init = async () => {
            try {
                const res = await fetch('/api/employees/els-creds');
                const data = await res.json();
                if (data.elsId) {
                    setUserId(data.elsId); setUserPw(data.elsPw);
                    setIsSaveChecked(true);
                    if (data.lastSaved) setLastSavedInfo(data.lastSaved);
                    handleLogin(data.elsId, data.elsPw);
                }
            } catch (err) { console.error(err); }
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
        return grouped;
    };

    const executeSearch = async (targets, id, pw) => {
        setLoading(true); startTimer();
        try {
            const res = await fetch(`${BACKEND_BASE_URL}/api/els/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ containers: targets, showBrowser, userId: id || userId, userPw: pw || userPw }),
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                lines.forEach(line => {
                    if (line.startsWith('LOG:')) setLogLines(prev => [...prev, line.substring(4)]);
                    else if (line.startsWith('RESULT:')) {
                        const data = JSON.parse(line.substring(7));
                        if (data.ok) {
                            setResult(groupByContainer(data.result));
                            setDownloadToken(data.downloadToken);
                            setResultFileName(data.fileName);
                        }
                    }
                });
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); stopTimer(); }
    };

    const runSearch = () => {
        const containers = parseContainerInput(containerInput);
        if (!containers.length) return alert('컨테이너 번호를 입력하세요');
        if (!loginSuccess) { pendingSearchRef.current = containers; handleLogin(); }
        else { executeSearch(containers); }
    };

    const handleKeyDown = (e, target) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            target === 'login' ? handleLogin() : runSearch();
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const data = new Uint8Array(evt.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
            const containers = rows.flat().filter(c => c && typeof c === 'string').map(c => c.trim().toUpperCase());
            setContainerInput(containers.join('\n'));
        };
        reader.readAsArrayBuffer(file);
    };

    const resetAll = () => {
        if (confirm('모든 데이터를 초기화할까요?')) {
            setLogLines([]); setResult(null); setContainerInput('');
            sessionStorage.clear(); window.location.reload();
        }
    };

    const stats = result ? (() => {
        const latest = Object.values(result).map(r => r[0]);
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
        if (activeStatFilter) {
            const r = result[cn][0];
            return r[2] === activeStatFilter || r[3] === activeStatFilter;
        }
        return true;
    }) : [];

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <div className={styles.headerBanner}>
                    <h1 className={styles.title}>컨테이너 이력조회 인텔리전스</h1>
                    <div className={styles.shortcutGroup}>
                        <a href="https://etrans.klnet.co.kr" target="_blank" rel="noreferrer" className={styles.etransShortcut}><img src="/images/etrans_logo.png" alt="ETRANS" /></a>
                        <a href="https://www.tradlinx.com" target="_blank" rel="noreferrer" className={styles.etransShortcut}><img src="/images/tradlinx_logo.png" alt="Tradlinx" /></a>
                    </div>
                </div>

                <div className={styles.topRow}>
                    <div className={styles.leftColumn}>
                        <div className={styles.section}>
                            <h2 className={styles.sectionTitle}>자동 로그인 연동</h2>
                            <div className={styles.inputGroup}>
                                <div className={styles.loginRow}>
                                    <input type="text" placeholder="아이디" value={userId} onChange={e => setUserId(e.target.value)} onKeyDown={e => handleKeyDown(e, 'login')} className={styles.input} />
                                    <input type="password" placeholder="비밀번호" value={userPw} onChange={e => setUserPw(e.target.value)} onKeyDown={e => handleKeyDown(e, 'login')} className={styles.input} />
                                </div>
                                <div className={styles.loginActionRow}>
                                    <button onClick={() => handleLogin()} disabled={loginLoading} className={styles.button} style={{ flex: 1 }}>
                                        {loginLoading ? '접속 중...' : '자동 로그인 연동'}
                                    </button>
                                    <label className={styles.saveControl}>
                                        <input type="checkbox" checked={isSaveChecked} onChange={e => setIsSaveChecked(e.target.checked)} />
                                        <span>저장</span>
                                    </label>
                                </div>
                                {lastSavedInfo && <div className={styles.lastSavedText}>암호화 저장됨: {lastSavedInfo}</div>}
                            </div>
                        </div>

                        <div className={styles.section} style={{ flex: 1 }}>
                            <div className={styles.sectionHeader}>
                                <h2 className={styles.sectionTitle}>조회 대상 입력</h2>
                                <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={showBrowser} onChange={e => setShowBrowser(e.target.checked)} /> 디버그
                                </label>
                            </div>
                            <textarea
                                placeholder="컨테이너 번호를 입력하세요 (엔터 구분)"
                                value={containerInput}
                                onChange={e => setContainerInput(e.target.value)}
                                className={styles.textarea}
                            />
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => fileInputRef.current.click()} className={styles.buttonSecondary} style={{ flex: 1 }}>엑셀 불러오기</button>
                                <button onClick={runSearch} disabled={loading} className={styles.button} style={{ flex: 2 }}>
                                    {loading ? '데이터 추출 중...' : '실시간 이력 조회'}
                                </button>
                            </div>
                            <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleFileUpload} style={{ display: 'none' }} />
                        </div>
                    </div>

                    <div className={styles.centerColumn}>
                        <div className={styles.section} style={{ flex: 1 }}>
                            <div className={styles.sectionHeader}>
                                <h2 className={styles.sectionTitle}>조회 데이터 현황</h2>
                                <button onClick={resetAll} className={styles.buttonReset}>전체 초기화</button>
                            </div>
                            {stats ? (
                                <div className={styles.statsGrid}>
                                    <div className={`${styles.statCard} ${activeStatFilter === '수출' ? styles.statCardActive : ''}`} onClick={() => toggleStatFilter('수출')}>
                                        <span className={styles.statLabel}>수출</span>
                                        <span className={styles.statValue} style={{ color: '#16a34a' }}>{stats.export}</span>
                                    </div>
                                    <div className={`${styles.statCard} ${activeStatFilter === '수입' ? styles.statCardActive : ''}`} onClick={() => toggleStatFilter('수입')}>
                                        <span className={styles.statLabel}>수입</span>
                                        <span className={styles.statValue} style={{ color: '#dc2626' }}>{stats.import}</span>
                                    </div>
                                    <div className={`${styles.statCard} ${activeStatFilter === '반입' ? styles.statCardActive : ''}`} onClick={() => toggleStatFilter('반입')}>
                                        <span className={styles.statLabel}>반입</span>
                                        <span className={styles.statValue} style={{ color: '#2563eb' }}>{stats.inbox}</span>
                                    </div>
                                    <div className={`${styles.statCard} ${activeStatFilter === '반출' ? styles.statCardActive : ''}`} onClick={() => toggleStatFilter('반출')}>
                                        <span className={styles.statLabel}>반출</span>
                                        <span className={styles.statValue} style={{ color: '#d97706' }}>{stats.outbox}</span>
                                    </div>
                                    <div className={`${styles.statCard} ${activeStatFilter === '양하' ? styles.statCardActive : ''}`} onClick={() => toggleStatFilter('양하')}>
                                        <span className={styles.statLabel}>양하</span>
                                        <span className={styles.statValue} style={{ color: '#7c3aed' }}>{stats.unloading}</span>
                                    </div>
                                    <div className={`${styles.statCard} ${activeStatFilter === '적하' ? styles.statCardActive : ''}`} onClick={() => toggleStatFilter('적하')}>
                                        <span className={styles.statLabel}>적하</span>
                                        <span className={styles.statValue} style={{ color: '#db2777' }}>{stats.loading}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.waitingBox}>
                                    <div className={styles.pulseIcon}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                                    </div>
                                    <p style={{ fontWeight: 800, color: '#64748b' }}>데이터 조회 전입니다</p>
                                </div>
                            )}
                            {result && (
                                <div style={{ marginTop: 'auto', display: 'flex', gap: '8px' }}>
                                    <input type="text" placeholder="결과 내 검색..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)} className={styles.input} style={{ flex: 1 }} />
                                    {downloadToken && <button onClick={() => window.open(`${BACKEND_BASE_URL}/api/els/download/${downloadToken}?filename=${resultFileName}`, '_blank')} className={styles.button} style={{ padding: '8px 16px' }}>엑셀 저장</button>}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={styles.rightColumn}>
                        <div className={styles.section} style={{ flex: 1 }}>
                            <div className={styles.sectionHeader}>
                                <h2 className={styles.sectionTitle}>시스템 로그</h2>
                                <button onClick={() => setLogLines([])} className={styles.buttonSecondary} style={{ padding: '6px 14px', fontSize: '0.8rem' }}>로그 비우기</button>
                            </div>
                            <div ref={terminalRef} className={styles.terminal}>
                                {logLines.map((l, i) => <div key={i} className={styles.logLine}>{l}</div>)}
                                {(loading || loginLoading) && (
                                    <div className={styles.logLineActive}>
                                        <div className={styles.spinner}></div>
                                        <span>프로세스 수행 중... ({elapsedSeconds.toFixed(1)}s)</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {result && (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead><tr>{HEADERS.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                            <tbody>
                                {filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map(cn => (
                                    <tr key={cn}>
                                        <td style={{ fontWeight: 900, color: '#1e293b' }}>{cn}</td>
                                        <td>{result[cn][0][1]}</td>
                                        <td><StatusBadge label={result[cn][0][2]} /></td>
                                        <td><StatusBadge label={result[cn][0][3]} /></td>
                                        {result[cn][0].slice(4).map((v, i) => <td key={i}>{v || '-'}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
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
