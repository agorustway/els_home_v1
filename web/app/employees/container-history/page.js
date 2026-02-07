'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './container-history.module.css';

const HEADERS = ['컨테이너번호', 'No', '수출입', '구분', '터미널', 'MOVE TIME', '모선', '항차', '선사', '적공', 'SIZE', 'POD', 'POL', '차량번호', 'RFID'];
const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_ELS_BACKEND_URL || 'http://localhost:2929';
const ITEMS_PER_PAGE = 10;

function parseContainerInput(text) {
    if (!text || !text.trim()) return [];
    const raw = text.split(/[\n,;\s]+/).map(s => s.replace(/\s/g, '').toUpperCase()).filter(Boolean);
    return [...new Set(raw)];
}

export default function ContainerHistoryPage() {
    const [userId, setUserId] = useState('');
    const [userPw, setUserPw] = useState('');
    const [containerInput, setContainerInput] = useState('');
    const [logLines, setLogLines] = useState([]);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);
    const [downloadToken, setDownloadToken] = useState(null);
    const [resultFileName, setResultFileName] = useState('');
    const [expandedContainers, setExpandedContainers] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
    const [searchFilter, setSearchFilter] = useState('');
    const [showBrowser, setShowBrowser] = useState(false);

    const terminalRef = useRef(null);
    const fileInputRef = useRef(null);

    // 자동 스크롤
    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [logLines]);

    // 설정 불러오기 및 자동 로그인
    useEffect(() => {
        const savedUserId = localStorage.getItem('els_user_id');
        const savedUserPw = localStorage.getItem('els_user_pw');
        const savedContainers = localStorage.getItem('els_containers');

        if (savedUserId) setUserId(savedUserId);
        if (savedUserPw) setUserPw(savedUserPw);
        //if (savedContainers) setContainerInput(savedContainers);

    }, []);

    // 세션 갱신 (55분마다)
    useEffect(() => {
        const interval = setInterval(() => {
            const savedUserId = localStorage.getItem('els_user_id');
            const savedUserPw = localStorage.getItem('els_user_pw');

            if (savedUserId && savedUserPw) {
                setLogLines(prev => [...prev, '[세션] 55분 경과 - 세션 갱신 중...']);
                handleLogin(savedUserId, savedUserPw);
            }
        }, 55 * 60 * 1000); // 55분

        return () => clearInterval(interval);
    }, []);

    const handleSaveCreds = () => {
        const id = userId?.trim();
        const pw = userPw;
        if (!id || !pw) return;

        localStorage.setItem('els_user_id', id);
        localStorage.setItem('els_user_pw', pw);
        setLogLines(prev => [...prev, '[계정] 아이디/비밀번호 저장 완료!']);
    };

    const handleLogin = async (id, pw) => {
        const loginId = id || userId;
        const loginPw = pw || userPw;

        if (!loginId || !loginPw) {
            setLogLines(prev => [...prev, '[오류] 아이디와 비밀번호를 입력하세요']);
            return;
        }

        if (!id && !pw) handleSaveCreds();
        setLoginLoading(true);
        setLogLines(prev => [...prev, `[네트워크] ${BACKEND_BASE_URL}/api/els/login 접속 중...`]);

        try {
            const res = await fetch(`${BACKEND_BASE_URL}/api/els/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ useSavedCreds: false, userId: loginId.trim(), userPw: loginPw, showBrowser: showBrowser }),
            });
            const data = await res.json();

            if (data.log && Array.isArray(data.log)) {
                setLogLines(prev => [...prev, ...data.log]);
            }

            if (data.ok) {
                setLogLines(prev => [...prev, '[성공] 로그인 완료!']);
            } else {
                setLogLines(prev => [...prev, `[실패] ${data.error || '로그인 실패'}`]);
            }
        } catch (err) {
            setLogLines(prev => [...prev, `[오류] ${err.message}`]);
        } finally {
            setLoginLoading(false);
        }
    };

    const runLogin = () => handleLogin();

    const runSearch = async () => {
        const containers = parseContainerInput(containerInput);
        if (!containers.length) {
            setLogLines(prev => [...prev, '[오류] 컨테이너 번호를 입력하세요']);
            return;
        }

        localStorage.setItem('els_containers', containerInput);

        setLoading(true);
        setLogLines(prev => [...prev, `[검색] ${containers.length}개 컨테이너 조회 시작...`]);

        try {
            // The instruction provided a snippet that seemed to replace the existing fetch call
            // with a login call. Assuming the intent was to add userId and userPw to the *existing*
            // run search request, and the snippet was a guide for the body structure.
            // The original code already uses JSON.stringify.
            const res = await fetch(`${BACKEND_BASE_URL}/api/els/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ containers, showBrowser: showBrowser, userId: userId, userPw: userPw }),
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
                    if (line.startsWith('LOG:')) {
                        setLogLines(prev => [...prev, line.substring(4)]);
                    } else if (line.startsWith('RESULT:')) {
                        try {
                            const data = JSON.parse(line.substring(7));
                            if (data.ok) {
                                setResult(groupByContainer(data.result));
                                setDownloadToken(data.downloadToken);
                                setResultFileName(data.fileName);
                                setLogLines(prev => [...prev, `[완료] 조회 완료! ${data.result?.length || 0}건`]);
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
            setLogLines(prev => [...prev, `[오류] ${err.message}`]);
        } finally {
            setLoading(false);
        }
    };

    const groupByContainer = (data) => {
        if (!data || !Array.isArray(data)) return {};

        const grouped = {};
        data.forEach(row => {
            const containerNo = row[0];
            if (!grouped[containerNo]) {
                grouped[containerNo] = [];
            }
            grouped[containerNo].push(row);
        });

        return grouped;
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

    // 필터링 및 페이지네이션
    const filteredContainers = result ? Object.keys(result).filter(cn =>
        cn.toLowerCase().includes(searchFilter.toLowerCase())
    ) : [];

    const totalPages = Math.ceil(filteredContainers.length / ITEMS_PER_PAGE);
    const paginatedContainers = filteredContainers.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <h1 className={styles.title}>컨테이너 이력조회</h1>

                <div className={styles.topRow}>
                    {/* 왼쪽: 입력 */}
                    <div className={styles.leftColumn}>
                        <div className={styles.section}>
                            <h2 className={styles.sectionTitle}>1. ETRANS 로그인</h2>
                            <div className={styles.inputGroup}>
                                <input
                                    type="text"
                                    placeholder="아이디"
                                    value={userId}
                                    onChange={e => setUserId(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            document.querySelector('input[type="password"]')?.focus();
                                        }
                                    }}
                                    className={styles.input}
                                />
                                <input
                                    type="password"
                                    placeholder="비밀번호"
                                    value={userPw}
                                    onChange={e => setUserPw(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            runLogin();
                                        }
                                    }}
                                    className={styles.input}
                                />
                                <button
                                    onClick={runLogin}
                                    disabled={loginLoading}
                                    className={styles.button}
                                >
                                    {loginLoading ? '로그인 중...' : '로그인'}
                                </button>
                            </div>
                        </div>

                        <div className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <h2 className={styles.sectionTitle}>2. 컨테이너 조회</h2>
                                <label className={styles.debugLabel}>
                                    <input
                                        type="checkbox"
                                        checked={showBrowser}
                                        onChange={(e) => setShowBrowser(e.target.checked)}
                                    />
                                    브라우저 표시 (디버그)
                                </label>
                            </div>
                            <div
                                className={styles.dropZone}
                                onDrop={handleFileDrop}
                                onDragOver={e => e.preventDefault()}
                            >
                                <textarea
                                    placeholder="컨테이너 번호 입력 (줄바꿈 또는 쉼표로 구분)&#10;또는 엑셀 파일을 여기에 드래그하세요"
                                    value={containerInput}
                                    onChange={e => setContainerInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && e.ctrlKey) {
                                            e.preventDefault();
                                            runSearch();
                                        }
                                    }}
                                    className={styles.textarea}
                                    rows={8}
                                />
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx"
                                onChange={handleFileUpload}
                                style={{ display: 'none' }}
                            />
                            <div className={styles.buttonGroup}>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className={styles.buttonSecondary}
                                >
                                    엑셀 파일 선택
                                </button>
                                <button
                                    onClick={runSearch}
                                    disabled={loading}
                                    className={styles.button}
                                >
                                    {loading ? '조회 중...' : '조회 시작 (Ctrl+Enter)'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 오른쪽: 로그 */}
                    <div className={styles.rightColumn}>
                        <div className={styles.section}>
                            <h2 className={styles.sectionTitle}>실시간 로그</h2>
                            <div ref={terminalRef} className={styles.terminal}>
                                {logLines.map((line, i) => (
                                    <div key={i} className={styles.logLine}>
                                        {line}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 결과 */}
                {result && Object.keys(result).length > 0 && (
                    <div className={styles.section}>
                        <div className={styles.resultHeader}>
                            <h2 className={styles.sectionTitle}>조회 결과 ({filteredContainers.length}개 컨테이너)</h2>
                            <div className={styles.resultActions}>
                                <input
                                    type="text"
                                    placeholder="컨테이너 검색..."
                                    value={searchFilter}
                                    onChange={e => setSearchFilter(e.target.value)}
                                    className={styles.searchInput}
                                />
                                <button onClick={handleDownload} className={styles.button}>
                                    엑셀 다운로드
                                </button>
                            </div>
                        </div>

                        <div className={styles.resultsList}>
                            <table className={styles.table}>
                                <thead className={styles.thead}>
                                    <tr>
                                        {HEADERS.map((h, i) => (
                                            <th key={i}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedContainers.map(containerNo => {
                                        const rows = result[containerNo] || [];
                                        const isExpanded = expandedContainers[containerNo];
                                        const displayRows = isExpanded ? rows : [rows[0]];

                                        return displayRows.map((row, rowIdx) => (
                                            <tr key={`${containerNo}-${rowIdx}`}>
                                                {/* 컨테이너번호 컬럼: 첫 행에만 전개 버튼 표시 */}
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                        {rowIdx === 0 && rows.length > 1 && (
                                                            <button
                                                                onClick={() => toggleContainer(containerNo)}
                                                                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontSize: '0.9rem', color: '#3b82f6' }}
                                                            >
                                                                {isExpanded ? '▼' : '▶'}
                                                            </button>
                                                        )}
                                                        {row[0] || containerNo}
                                                    </div>
                                                </td>
                                                {/* No 컬럼 */}
                                                <td>{row[1]}</td>
                                                {/* 나머지 데이터 (수출입, 구분, 터미널... row[2]부터 끝까지) */}
                                                {row.slice(2).map((cell, cellIdx) => (
                                                    <td key={cellIdx}>{cell}</td>
                                                ))}
                                            </tr>
                                        ));
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* 페이지네이션 */}
                        {totalPages > 1 && (
                            <div className={styles.pagination}>
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className={styles.pageButton}
                                >
                                    &lt;
                                </button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                    <button
                                        key={page}
                                        onClick={() => setCurrentPage(page)}
                                        className={`${styles.pageButton} ${currentPage === page ? styles.pageButtonActive : ''}`}
                                    >
                                        {page}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className={styles.pageButton}
                                >
                                    &gt;
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {/* XLSX 라이브러리 로드 */}
            <script src="https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js"></script>
        </div>
    );
}