'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Script from 'next/script';
import styles from './container-history.module.css';

const HEADERS = ['컨테이너번호', 'No', '수출입', '구분', '터미널', 'MOVE TIME', '모선', '항차', '선사', '적공', 'SIZE', 'POD', 'POL', '차량번호', 'RFID'];
const ITEMS_PER_PAGE = 10;

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
    const [activeStatFilters, setActiveStatFilters] = useState(new Set()); // 다중 선택을 위한 Set
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedRows, setExpandedRows] = useState(new Set());
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
                // setLogLines(prev => [...prev, '✓ 계정 정보가 안전하게 저장되었습니다.']); // 불필요한 로그 제거
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

        // 데이터 정렬 및 필터링
        Object.keys(grouped).forEach(cn => {
            // 0번 데이터 및 내용이 없는 빈 행 제외 필터링
            grouped[cn] = grouped[cn].filter(row => {
                const n = Number(row[1]);
                if (n === 0) return false;

                // 데이터가 완전히 비어있는 행만 제외 (필터 조건 완화)
                // 순번(row[1]) 외에 다른 데이터가 하나라도 있으면 유효한 행으로 간주
                const hasAnyContent = row.slice(2).some(cell =>
                    cell && String(cell).trim() !== '' && String(cell).trim() !== '-' && String(cell).trim() !== '.'
                );

                return hasAnyContent;
            });

            if (grouped[cn].length === 0) {
                delete grouped[cn];
                return;
            }

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
                    else if (line.startsWith('RESULT_PARTIAL:')) {
                        // [실시간 출력] 부분 결과 수신 시 즉시 데이터 추가
                        try {
                            const part = JSON.parse(line.substring(15));
                            if (part.result && Array.isArray(part.result)) {
                                setResult(prev => {
                                    // 기존 결과에 새 결과 병합 (함수형 업데이트로 최신 상태 보장)
                                    // groupByContainer 로직을 재사용하기 위해 'raw array' 형태로 관리하거나
                                    // 여기서 바로 병합해야 함. 편의상 병합 후 groupBy 재적용 방식을 씀 (데이터 양 적을 때 유효)

                                    // 1. 기존 데이터의 flat 한 배열 형태로 변환 (비효율적일 수 있으나 안전함)
                                    const prevRows = prev ? Object.values(prev).flat() : [];
                                    // 2. 새 데이터 추가
                                    const newRows = [...prevRows, ...part.result];
                                    // 3. 다시 그룹핑
                                    return groupByContainer(newRows);
                                });
                            }
                        } catch (e) { console.error('Partial Parse Error', e); }
                    }
                    else if (line.startsWith('RESULT:')) {
                        const data = JSON.parse(line.substring(7));
                        if (data.ok) {
                            // 최종 결과는 덮어쓰기보다는 정합성 확인 용도로 사용하거나
                            // 다운로드 토큰만 업데이트 (이미 PARTIAL로 다 받았을 것이므로)
                            if (!result) setResult(groupByContainer(data.result || [])); // 혹시 못 받은 게 있으면 덮어쓰기
                            setDownloadToken(data.downloadToken);
                            setResultFileName(data.fileName);
                        }
                        // 데몬 로그 출력
                        if (data.log && Array.isArray(data.log)) {
                            setLogLines(prev => [...prev, ...data.log]);
                        }
                    }
                });
            }
            // 총 소요시간 계산 (타이머)
            setTotalElapsed(elapsedSecondsRef.current);
        } catch (err) { console.error(err); }
        finally { setLoading(false); stopTimer(); }
    };

    const runSearch = () => {
        const containers = parseContainerInput(containerInput);
        if (!containers.length) return alert('컨테이너 번호를 입력하세요');
        setTotalElapsed(null);
        if (!loginSuccess) {
            setLogLines(prev => [...prev, '로그인 후 자동으로 조회를 시작합니다...']);
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
            if (typeof XLSX === 'undefined') { setLogLines(prev => [...prev, '[오류] 엑셀 라이브러리 로드 실패']); return; }
            const data = new Uint8Array(evt.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
            const containers = rows.flat().filter(c => c && typeof c === 'string').map(c => c.trim().toUpperCase());
            setContainerInput(containers.join('\n'));
            setLogLines(prev => [...prev, `[파일] ${containers.length}개 번호 추출 완료`]);
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
            setLogLines([]); setResult(null); setContainerInput('');
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
                                        {loginLoading ? '접속 시도 중...' : '자동 로그인 연동'}
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
                    </div>

                    <div className={styles.centerColumn}>
                        <div className={styles.section} style={{ flex: 1, minHeight: 0 }}>
                            <div className={styles.sectionHeader}>
                                <h2 className={styles.sectionTitle}>조회 데이터 결과</h2>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    {result && downloadToken && (
                                        <button onClick={() => window.open(`${BACKEND_BASE_URL}/api/els/download/${downloadToken}?filename=${resultFileName}`, '_blank')} className={styles.buttonExcelCompact}>엑셀 저장</button>
                                    )}
                                    <button onClick={resetAll} className={styles.buttonReset}>초기화</button>
                                </div>
                            </div>

                            {totalElapsed && (
                                <div style={{ padding: '0 24px 12px', color: '#64748b', fontSize: '0.9rem', fontWeight: 600 }}>
                                    ⏱️ 총 소요 시간: {totalElapsed.toFixed(1)}초
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
                                                            {/* 대표 행 (최신 데이터, No. 1) */}
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
                                                                <td className={styles.cellBorder}>{rows[0][1]}</td>
                                                                <td className={styles.cellBorder}><StatusBadge label={rows[0][2]} /></td>
                                                                <td className={styles.cellBorder}><StatusBadge label={rows[0][3]} /></td>
                                                                {rows[0].slice(4).map((v, i) => (
                                                                    <td key={i} className={`${styles.cellBorder} ${i === 0 ? styles.cellLeft : ''}`}>{v || '-'}</td>
                                                                ))}
                                                            </tr>

                                                            {/* 과거 이력 행들 (No. 2 이상) */}
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

                                    <div className={styles.resultFooter}>
                                        <input type="text" placeholder="결과 검색..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)} className={styles.inputSearchCompact} />
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