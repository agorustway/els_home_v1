'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import styles from './dispatch.module.css';
import AsanDashboard from './AsanDashboard';

// ===== 상수 =====
const HOLIDAYS = new Set([
    '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-03-01',
    '2025-05-05', '2025-05-06', '2025-06-06', '2025-08-15',
    '2025-09-05', '2025-09-06', '2025-09-07', '2025-09-08',
    '2025-10-03', '2025-10-09', '2025-12-25',
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
    '2026-03-01', '2026-03-02', '2026-05-05', '2026-05-24', '2026-06-06',
    '2026-08-15', '2026-08-17', '2026-09-24', '2026-09-25', '2026-09-26',
    '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25',
]);
const CENTER_HEADERS = new Set(['오더', '배차', '검증', '계', '수량', '추가', 'T', 'TYPE', '오더(계)', '담당자']);
const BRANCH_NAMES = ['아산', '부산', '광양', '평택', '중부', '부곡', '인천'];
const PREFS_KEY = 'asan_dispatch_prefs';

// ===== 헬퍼 =====
function getTabType(dateStr) {
    const today = new Date().toISOString().split('T')[0];
    const d = new Date(dateStr + 'T00:00:00');
    const isRed = d.getDay() === 0 || d.getDay() === 6 || HOLIDAYS.has(dateStr);
    if (dateStr === today) return 'today';
    if (dateStr < today) return isRed ? 'past_holiday' : 'past';
    return isRed ? 'holiday' : 'future';
}
function formatTabLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return { mm: d.getMonth() + 1, dd: d.getDate(), day: ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] };
}
function findCol(headers, name) { return headers.findIndex(h => h.trim() === name); }
function fmtTs(dt) {
    if (!dt) return '';
    const t = new Date(dt);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
}

function calcSummary(headers, data, viewType) {
    if (!headers || !data || data.length === 0) return null;
    if (viewType === 'glovis') {
        const oC = findCol(headers, '오더'), dC = findCol(headers, '배차'), tC = findCol(headers, 'T'), gC = findCol(headers, '구분');
        let order = 0, disp = 0, ft40 = 0, ft20 = 0;
        const cats = {};
        data.forEach(row => {
            const o = parseInt(row[oC]) || 0; order += o;
            const g = String(row[gC] || '').trim(); if (g) cats[g] = (cats[g] || 0) + o;
            disp += parseInt(row[dC]) || 0;
            const t = parseInt(row[tC]) || 0;
            if (t === 40) ft40 += o; else if (t === 20) ft20 += o;
        });
        return { order, cats, disp, unmatch: order - disp, ft40, ft20 };
    } else if (viewType === 'mobis') {
        const qC = findCol(headers, '계') >= 0 ? findCol(headers, '계') : findCol(headers, '수량');
        const dC = findCol(headers, '배차'), gC = findCol(headers, '구분');
        let order = 0, disp = 0;
        const cats = {};
        data.forEach(row => {
            const o = parseInt(row[qC]) || 0; order += o;
            const g = String(row[gC] || '').trim(); if (g) cats[g] = (cats[g] || 0) + o;
            disp += parseInt(row[dC]) || 0;
        });
        return { order, cats, disp, unmatch: order - disp };
    } else {
        // integrated
        const oC = findCol(headers, '오더(계)'), dC = findCol(headers, '배차'), tC = findCol(headers, 'TYPE'), gC = findCol(headers, '구분');
        let order = 0, disp = 0, ft40 = 0, ft20 = 0;
        const cats = {};
        data.forEach(row => {
            const o = parseInt(row[oC]) || 0; order += o;
            const g = String(row[gC] || '').trim(); if (g) cats[g] = (cats[g] || 0) + o;
            disp += parseInt(row[dC]) || 0;
            const t = parseInt(row[tC]) || 0;
            if (t === 40) ft40 += o; else if (t === 20) ft20 += o;
        });
        return { order, cats, disp, unmatch: order - disp, ft40, ft20 };
    }
}
function doSearch(data, headers, term) {
    if (!term || !data) return { indices: null, summary: '' };
    const t = term.toLowerCase();
    const branchCols = [];
    headers.forEach((h, i) => { if (BRANCH_NAMES.includes(h.trim())) branchCols.push({ i, name: h.trim() }); });
    const indices = []; const breakdown = {}; let total = 0;
    data.forEach((row, ri) => {
        if (!row.some(c => c && String(c).toLowerCase().includes(t))) return;
        indices.push(ri);
        branchCols.forEach(({ i, name }) => {
            const cell = String(row[i] || '').toLowerCase();
            if (cell.includes(t)) { const n = parseInt(cell.replace(/[^\d]/g, '')) || 1; total += n; breakdown[name] = (breakdown[name] || 0) + n; }
        });
    });
    if (indices.length === 0) return { indices, summary: `"${term}" 검색 결과 없음` };
    const parts = Object.entries(breakdown).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(', ');
    return { indices, summary: `${term} ${total}대${parts ? ` (${parts})` : ''}`, total };
}

// localStorage
function loadPrefs(vt) {
    try { const s = localStorage.getItem(`${PREFS_KEY}_${vt}`); return s ? JSON.parse(s) : {}; } catch { return {}; }
}
function savePrefs(vt, p) {
    try { localStorage.setItem(`${PREFS_KEY}_${vt}`, JSON.stringify(p)); } catch { }
}

// ===== 컴포넌트 =====
export default function AsanDispatchPage() {
    const [viewType, setViewType] = useState('glovis');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [activeTab, setActiveTab] = useState(-1);
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState({ glovis_path: '', mobis_path: '' });
    const [showBrowser, setShowBrowser] = useState(false);
    const [browseTarget, setBrowseTarget] = useState('');
    const [browserFiles, setBrowserFiles] = useState([]);
    const [browserPath, setBrowserPath] = useState('/아산지점/A_운송실무');
    const [browserLoading, setBrowserLoading] = useState(false);
    const [searchInput, setSearchInput] = useState('');
    const [mainView, setMainView] = useState('dashboard'); // 'dashboard' | 'grid'
    const [searchTerm, setSearchTerm] = useState('');
    const [columnFilters, setColumnFilters] = useState({});
    const [colorFilter, setColorFilter] = useState(null);
    const [filterDropdown, setFilterDropdown] = useState(null);
    const [tooltip, setTooltip] = useState(null);
    const [hiddenCols, setHiddenCols] = useState(new Set());
    const [colWidths, setColWidths] = useState({});
    const [showColPanel, setShowColPanel] = useState(false);
    const [allTabMonth, setAllTabMonth] = useState(null);
    const [elapsed, setElapsed] = useState('');
    const [displayLimit, setDisplayLimit] = useState(100);
    const [syncStatus, setSyncStatus] = useState(null); // { message, isError }
    const tabsRef = useRef(null);

    // ===== 데이터 fetch =====
    const fetchSettings = async () => { try { const r = await fetch('/api/branches/asan/settings'); const j = await r.json(); if (j.data) setSettings(j.data); } catch { } };
    const fetchData = async (type) => {
        setLoading(true);
        try {
            const r = await fetch(`/api/branches/asan/dispatch?type=${type}`); const j = await r.json();
            const items = j.data || []; setData(items);
            const today = new Date().toISOString().split('T')[0];
            const ti = items.findIndex(d => d.target_date === today);
            setActiveTab(ti >= 0 ? ti : items.length - 1);
        } catch { setData([]); } finally { setLoading(false); }
    };
    const handleSync = async () => {
        setSyncing(true);
        setSyncStatus(null);
        try {
            const r = await fetch('/api/branches/asan/sync', { method: 'POST' });
            const j = await r.json();
            const msg = (j.results || []).map(r => `${r.type === 'glovis' ? '글로비스' : '모비스'}: ${r.success ? `성공 (${r.sheets}시트)` : '실패'}`).join(' / ') || '응답 없음';
            setSyncStatus({ message: msg, isError: !j.results?.every(r => r.success) });
            await fetchData(viewType);
        } catch (e) {
            setSyncStatus({ message: '동기화 실패: ' + e.message, isError: true });
        } finally {
            setSyncing(false);
            setTimeout(() => setSyncStatus(null), 5000);
        }
    };
    const loadFolder = async (path) => {
        setBrowserLoading(true);
        try { const r = await fetch(`/api/nas/files?path=${encodeURIComponent(path)}`); const j = await r.json(); if (j.files) setBrowserFiles(j.files); setBrowserPath(path); } catch { }
        finally { setBrowserLoading(false); }
    };
    const openBrowser = async (target) => { setBrowseTarget(target); setShowSettings(false); await loadFolder(browserPath); setShowBrowser(true); };
    const selectFile = (file) => {
        if (file.type === 'directory') loadFolder(file.path);
        else if (file.name.match(/\.xls[mx]$/i)) { setSettings(p => ({ ...p, [`${browseTarget}_path`]: file.path })); setShowBrowser(false); setShowSettings(true); }
    };
    const saveSettingsHandler = async () => {
        try { const r = await fetch('/api/branches/asan/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }); if (r.ok) { setShowSettings(false); alert('저장 완료'); } } catch { alert('저장 실패'); }
    };

    // ===== Effects =====
    useEffect(() => { fetchData(viewType); fetchSettings(); setSearchInput(''); setSearchTerm(''); setColumnFilters({}); setColorFilter(null); }, [viewType]);
    // 검색 디바운스 (300ms)
    useEffect(() => { const t = setTimeout(() => setSearchTerm(searchInput), 300); return () => clearTimeout(t); }, [searchInput]);
    useEffect(() => {
        if (tabsRef.current && activeTab >= 0 && activeTab < data.length) {
            const el = tabsRef.current.children[activeTab];
            if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    }, [activeTab, data]);
    // localStorage 로드
    useEffect(() => {
        const p = loadPrefs(viewType);
        setHiddenCols(new Set(p.hiddenCols || []));
        setColWidths(p.colWidths || {});
    }, [viewType]);
    // localStorage 저장 (디바운스)
    useEffect(() => {
        const t = setTimeout(() => savePrefs(viewType, { hiddenCols: [...hiddenCols], colWidths }), 300);
        return () => clearTimeout(t);
    }, [hiddenCols, colWidths, viewType]);

    // ===== "전체" 탭 데이터 (모든 날짜 합산, 내림차순) =====
    const isAllTab = activeTab === data.length;

    const mergedView = useMemo(() => {
        if (!data || data.length === 0) return null;
        const baseHeaders = data[0]?.headers || [];
        const mHeaders = ['날짜', ...baseHeaders];
        const mRows = [];
        const mComments = {};
        const sorted = [...data].sort((a, b) => b.target_date.localeCompare(a.target_date));
        sorted.forEach(item => {
            // 월필터 적용: allTabMonth가 설정되면 해당 월만
            const itemMonth = item.target_date.slice(5, 7);
            if (allTabMonth && itemMonth !== allTabMonth) return;
            const { mm, dd, day } = formatTabLabel(item.target_date);
            const dateLabel = `${mm}/${dd}(${day})`;
            (item.data || []).forEach((row, origIdx) => {
                const newIdx = mRows.length;
                mRows.push([dateLabel, ...row]);
                Object.entries(item.comments || {}).forEach(([key, val]) => {
                    const [ri, ci] = key.split(':').map(Number);
                    if (ri === origIdx) mComments[`${newIdx}:${ci + 1}`] = val;
                });
            });
        });
        // 사용할 수 있는 월 목록
        const months = [...new Set(data.map(d => d.target_date.slice(5, 7)))].sort();
        return { headers: mHeaders, data: mRows, comments: mComments, months };
    }, [data, allTabMonth]);

    // ===== 현재 뷰 데이터 =====
    const activeItem = isAllTab ? null : data[activeTab];
    const currentView = isAllTab ? mergedView : (activeItem ? { headers: activeItem.headers, data: activeItem.data, comments: activeItem.comments || {} } : null);
    const headers = currentView?.headers || [];
    const allData = currentView?.data || [];
    const comments = currentView?.comments || {};

    // 날짜 정보
    const dateInfo = useMemo(() => {
        if (isAllTab) return { label: '전체 날짜 합산', type: '전체', isRed: false, fileModStr: '' };
        if (!activeItem?.target_date) return null;
        const ds = activeItem.target_date;
        const d = new Date(ds + 'T00:00:00');
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const isRed = d.getDay() === 0 || d.getDay() === 6 || HOLIDAYS.has(ds);
        return {
            label: `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`,
            type: isRed ? '공휴일' : '평일', isRed,
            fileModStr: fmtTs(activeItem.file_modified_at)
        };
    }, [activeItem, isAllTab]);

    // 경과 시간 카운터 (1초마다 업데이트)
    useEffect(() => {
        const fileTs = isAllTab ? data[0]?.file_modified_at : activeItem?.file_modified_at;
        if (!fileTs) { setElapsed(''); return; }
        const update = () => {
            const diff = Math.max(0, Date.now() - new Date(fileTs).getTime());
            const d = Math.floor(diff / 86400000);
            const h = Math.floor((diff % 86400000) / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setElapsed(`+${d > 0 ? d + 'd ' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
        };
        update();
        const iv = setInterval(update, 1000);
        return () => clearInterval(iv);
    }, [activeItem?.file_modified_at, isAllTab, data]);

    // 엑셀 다운로드
    const handleDownload = () => {
        const dateParam = isAllTab ? 'all' : activeItem?.target_date;
        if (!dateParam) return;
        const monthParam = isAllTab && allTabMonth ? `&month=${allTabMonth}` : '';
        window.open(`/api/branches/asan/export?type=${viewType}&date=${dateParam}${monthParam}`, '_blank');
    };

    const centerCols = useMemo(() => { const s = new Set(); headers.forEach((h, i) => { if (CENTER_HEADERS.has(h.trim())) s.add(i); }); return s; }, [headers]);
    const summary = useMemo(() => calcSummary(headers, allData, viewType), [headers, allData, viewType]);
    const searchResult = useMemo(() => doSearch(allData, headers, searchTerm), [allData, headers, searchTerm]);

    // 보이는 컬럼 인덱스
    const visibleCols = useMemo(() => headers.map((h, i) => i).filter(i => !hiddenCols.has(headers[i])), [headers, hiddenCols]);

    // 필터 적용된 행 (Set으로 검색 최적화)
    const displayRows = useMemo(() => {
        let rows = allData.map((row, idx) => {
            let status = 'normal';
            if (row.some(c => String(c || '').includes('?'))) {
                status = 'warn';
            } else {
                const getVal = (name) => parseInt(row[findCol(headers, name)]) || 0;
                let o = 0, d = 0;
                if (viewType === 'glovis') { o = getVal('오더'); d = getVal('배차'); }
                else if (viewType === 'mobis') { o = getVal('수량') || getVal('계'); d = getVal('배차'); }
                else { o = getVal('오더(계)') || getVal('수량'); d = getVal('배차'); }
                if (o !== d) status = 'warn';
            }
            return { row, idx, status };
        });

        if (searchResult.indices) {
            const idxSet = new Set(searchResult.indices);
            rows = rows.filter(r => idxSet.has(r.idx));
        }
        Object.entries(columnFilters).forEach(([col, val]) => { rows = rows.filter(r => r.row[parseInt(col)] === val); });

        if (colorFilter) { rows = rows.filter(r => r.status === colorFilter); }

        return rows;
    }, [allData, headers, viewType, searchResult, columnFilters, colorFilter]);

    // 표시 제한 (성능 최적화)
    const limitedRows = useMemo(() => displayRows.slice(0, displayLimit), [displayRows, displayLimit]);
    const hasMore = displayRows.length > displayLimit;

    const uniqueVals = useMemo(() => {
        if (filterDropdown === null) return [];
        const vals = new Set(); allData.forEach(row => { const v = row[filterDropdown]; if (v) vals.add(String(v)); }); return [...vals].sort();
    }, [filterDropdown, allData]);

    // ===== 핸들러 =====
    const toggleFilter = (ci) => setFilterDropdown(prev => prev === ci ? null : ci);
    const applyFilter = (ci, val) => {
        if (val === null) setColumnFilters(prev => { const n = { ...prev }; delete n[ci]; return n; });
        else setColumnFilters(prev => ({ ...prev, [ci]: val }));
        setFilterDropdown(null);
    };
    const hideCol = (name) => { setHiddenCols(prev => new Set([...prev, name])); setFilterDropdown(null); };
    const showCol = (name) => { setHiddenCols(prev => { const n = new Set(prev); n.delete(name); return n; }); };
    const resetPrefs = () => { setHiddenCols(new Set()); setColWidths({}); localStorage.removeItem(`${PREFS_KEY}_${viewType}`); };

    const startResize = useCallback((e, colName) => {
        e.preventDefault(); e.stopPropagation();
        const startX = e.clientX;
        const th = e.currentTarget.parentElement;
        const startW = th.offsetWidth;
        // 투명 오버레이로 마우스 캡처 (다른 요소에 안 걸림)
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;cursor:col-resize;z-index:9999;';
        document.body.appendChild(overlay);
        const onMove = (me) => {
            const w = Math.max(40, startW + me.clientX - startX);
            th.style.width = w + 'px'; th.style.minWidth = w + 'px'; // DOM 직접 조작 (리렌더 없음)
        };
        const onUp = (me) => {
            const finalW = Math.max(40, startW + me.clientX - startX);
            setColWidths(prev => ({ ...prev, [colName]: finalW })); // 끝날 때만 state 업데이트
            overlay.remove();
            overlay.removeEventListener('mousemove', onMove);
            overlay.removeEventListener('mouseup', onUp);
        };
        overlay.addEventListener('mousemove', onMove);
        overlay.addEventListener('mouseup', onUp);
    }, []);

    const showTooltip = (e, text) => { const r = e.currentTarget.getBoundingClientRect(); setTooltip({ text, x: r.right + 4, y: r.top }); };

    // ===== 렌더링 =====
    return (
        <div className={styles.container} onClick={() => { setFilterDropdown(null); setShowColPanel(false); }}>
            {/* Premium Header Banner (Matching Weather Tone) */}
            <div className={styles.pageHeaderBanner}>
                <div className={styles.headerBannerLeft}>
                    <h1 className={styles.mainTitle}>아산지점 배차판</h1>
                    <p className={styles.bannerSubtitle}>실시간 배차 현황 및 운송 실무 관리 시스템</p>
                    <div className={styles.headerDateBadgeWrap}>
                        {dateInfo && (
                            <span className={`${styles.headerDateBadge} ${dateInfo.isRed ? styles.headerDateBadgeRed : ''}`}>
                                {isAllTab ? '📊' : '📅'} {dateInfo.label} {!isAllTab && `(${dateInfo.type})`}
                            </span>
                        )}
                    </div>
                </div>

                <div className={styles.headerBannerRight}>
                    <div className={styles.metaAndStatus}>
                        {(dateInfo?.fileModStr || elapsed) && (
                            <div className={styles.fileMetaCompact}>
                                <span className={styles.fileMetaLabel}>엑셀 저장:</span>
                                <span className={styles.fileMetaTime}>{dateInfo?.fileModStr}</span>
                                {elapsed && <span className={styles.fileMetaElapsed}>{elapsed}</span>}
                            </div>
                        )}
                        {syncStatus && (
                            <div className={`${styles.syncToastBanner} ${syncStatus.isError ? styles.syncToastError : ''}`}>
                                {syncStatus.isError ? '❌' : '✅'} {syncStatus.message}
                            </div>
                        )}
                    </div>

                    <div className={styles.bannerActionGroup}>
                        <button className={styles.bannerActionBtn} onClick={handleDownload}>📥 엑셀</button>
                        <button className={styles.bannerActionBtn} onClick={() => setShowSettings(true)}>⚙️ 설정</button>
                        <button className={`${styles.bannerActionBtn} ${styles.syncBtnMain}`} onClick={handleSync} disabled={syncing}>
                            {syncing ? '⏳ 동기화' : '🚀 NAS 동기화'}
                        </button>
                    </div>
                </div>
            </div>


            {/* 상단 바: 뷰전환 + 검색 */}
            <div className={styles.topBar}>
                <div className={styles.topBarLeft}>
                    <div className={styles.viewSwitch}>
                        <button className={`${styles.funcBtn} ${mainView === 'dashboard' ? styles.funcBtnActive : ''}`} onClick={() => setMainView('dashboard')}>
                            📊 현황판
                        </button>
                        <button className={`${styles.funcBtn} ${mainView === 'grid' ? styles.funcBtnActive : ''}`} onClick={() => setMainView('grid')}>
                            📋 배차판
                        </button>
                    </div>
                    <div className={styles.viewDivider} />
                    <div className={styles.viewSwitch}>
                        {['integrated', 'glovis', 'mobis'].map(t => (
                            <button key={t} className={`${styles.viewBtn} ${viewType === t ? styles.viewBtnActive : ''}`} onClick={() => setViewType(t)}>
                                {t === 'integrated' ? '통합현황' : t === 'glovis' ? '글로비스 KD 외' : '모비스 AS'}
                            </button>
                        ))}
                    </div>
                </div>
                {mainView === 'grid' && (
                    <div className={styles.searchWrap}>
                        <input className={styles.searchInput} placeholder="업체명 검색 (예: 이지, 대신)" value={searchInput} onChange={e => setSearchInput(e.target.value)} />
                        {searchInput && <button className={styles.searchClear} onClick={() => { setSearchInput(''); setSearchTerm(''); }}>✕</button>}
                    </div>
                )}
            </div>

            {/* 날짜 탭 + 전체 탭 */}
            <div className={styles.dateTabs} ref={tabsRef}>
                {data.map((item, idx) => {
                    const { mm, dd, day } = formatTabLabel(item.target_date);
                    const tabType = getTabType(item.target_date);
                    return (
                        <button key={item.id} className={`${styles.dateTab} ${styles[`tab_${tabType}`]} ${activeTab === idx ? styles.dateTabActive : ''}`}
                            onClick={() => { setActiveTab(idx); setSearchInput(''); setSearchTerm(''); setColumnFilters({}); setFilterDropdown(null); setDisplayLimit(100); }}>
                            <span className={styles.tabMonth}>{mm}/{dd}</span>
                            <span className={styles.tabDay}>({day})</span>
                        </button>
                    );
                })}
                {data.length > 0 && (
                    <button className={`${styles.dateTab} ${styles.tab_all} ${isAllTab ? styles.dateTabActive : ''}`}
                        onClick={() => { setActiveTab(data.length); setSearchInput(''); setSearchTerm(''); setColumnFilters({}); setFilterDropdown(null); setAllTabMonth(null); setDisplayLimit(100); }}>
                        <span className={styles.tabMonth}>📊 전체</span>
                    </button>
                )}
            </div>

            {/* 월별 필터 (전체 탭 전용) */}
            {isAllTab && mergedView?.months && (
                <div className={styles.monthFilter}>
                    <button className={`${styles.monthBtn} ${allTabMonth === null ? styles.monthBtnActive : ''}`}
                        onClick={() => { setAllTabMonth(null); setDisplayLimit(100); }}>전체</button>
                    {mergedView.months.map(m => (
                        <button key={m} className={`${styles.monthBtn} ${allTabMonth === m ? styles.monthBtnActive : ''}`}
                            onClick={() => { setAllTabMonth(m); setDisplayLimit(100); }}>{parseInt(m)}월</button>
                    ))}
                </div>
            )}

            {loading ? (
                <div className={styles.emptyState}>데이터 불러오는 중...</div>
            ) : !currentView ? (
                <div className={styles.emptyState}>데이터가 없습니다. 상단 &apos;🔄 NAS 동기화&apos; 버튼을 누르세요.</div>
            ) : mainView === 'dashboard' ? (
                <AsanDashboard data={allData} headers={headers} viewType={viewType} />
            ) : (
                <>
                    {/* 합계 바 */}
                    {summary && (
                        <div className={styles.summaryBar}>
                            <div className={styles.summaryLeft}>
                                <span className={styles.summaryItem}>
                                    <b>오더량</b> {summary.order}
                                    <em>({Object.entries(summary.cats).map(([k, v]) => `${k}:${v}`).join(', ')})</em>
                                </span>
                                <span className={styles.summaryItem}><b>배차량</b> {summary.disp}</span>
                                <span className={`${styles.summaryItem} ${summary.unmatch > 0 ? styles.summaryWarn : ''}`}><b>언매치</b> {summary.unmatch}</span>
                                {['glovis', 'integrated'].includes(viewType) && <>
                                    <span className={styles.summaryItem}><b>40FT</b> {summary.ft40}</span>
                                    <span className={styles.summaryItem}><b>20FT</b> {summary.ft20}</span>
                                </>}
                                {isAllTab && <span className={styles.summaryItem} style={{ color: '#059669' }}><b>전체</b> {displayRows.length}행</span>}
                            </div>
                            <div className={styles.summaryRight}>
                                <div style={{ position: 'relative' }}>
                                    <button className={styles.colBtnSm} onClick={(e) => { e.stopPropagation(); setShowColPanel(p => !p); }}>
                                        📋 컬럼 {hiddenCols.size > 0 && <span className={styles.hiddenBadge}>{hiddenCols.size}</span>}
                                    </button>
                                    {showColPanel && (
                                        <div className={styles.colPanel} onClick={e => e.stopPropagation()}>
                                            <div className={styles.colPanelTitle}>컬럼 표시/숨기기</div>
                                            <div className={styles.colPanelList}>
                                                {headers.map((h, i) => (
                                                    <label key={i} className={styles.colPanelItem}>
                                                        <input type="checkbox" checked={!hiddenCols.has(h)} onChange={() => hiddenCols.has(h) ? showCol(h) : hideCol(h)} />
                                                        {h}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {(hiddenCols.size > 0 || Object.keys(colWidths).length > 0) && (
                                    <button className={styles.resetBtnSm} onClick={resetPrefs}>↩️</button>
                                )}
                                <div className={styles.colorFilters}>
                                    <button className={`${styles.colorFilterBtn} ${colorFilter === 'warn' ? styles.colorFilterBtnActive : ''}`} onClick={() => setColorFilter(p => p === 'warn' ? null : 'warn')}>🚨 특이사항(?/언매치)</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 검색 결과 + 필터 배지 */}
                    {searchTerm && searchResult.summary && (
                        <div className={styles.searchResult}>🔍 {searchResult.summary} ({searchResult.indices?.length || 0}행)
                            {Object.keys(columnFilters).length > 0 && <button className={styles.clearFilters} onClick={() => setColumnFilters({})}>필터 초기화</button>}
                        </div>
                    )}
                    {Object.keys(columnFilters).length > 0 && !searchTerm && (
                        <div className={styles.filterBadges}>
                            {Object.entries(columnFilters).map(([col, val]) => (
                                <span key={col} className={styles.filterBadge}>{headers[parseInt(col)]}: {val}<button onClick={() => applyFilter(parseInt(col), null)}>✕</button></span>
                            ))}
                            <button className={styles.clearFilters} onClick={() => setColumnFilters({})}>전체 초기화</button>
                        </div>
                    )}

                    {/* 테이블 */}
                    <div className={styles.tableWrap}>
                        <div className={styles.tableScroll}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        {visibleCols.map(ci => {
                                            const h = headers[ci];
                                            const w = colWidths[h];
                                            return (
                                                <th key={ci} style={w ? { width: w, minWidth: 40, maxWidth: w } : undefined}
                                                    className={`${centerCols.has(ci) ? styles.centerCell : ''} ${columnFilters[ci] ? styles.filteredHeader : ''}`}
                                                    onClick={(e) => { e.stopPropagation(); toggleFilter(ci); }}>
                                                    <span className={styles.thText}>
                                                        {h}{columnFilters[ci] && <span className={styles.filterIcon}>▼</span>}
                                                    </span>
                                                    <div className={styles.resizeHandle} onMouseDown={(e) => startResize(e, h)} onClick={e => e.stopPropagation()} />
                                                    {filterDropdown === ci && (
                                                        <div className={styles.dropdown} onClick={e => e.stopPropagation()}>
                                                            <div className={styles.dropdownItem} onClick={() => applyFilter(ci, null)}><b>전체</b></div>
                                                            {uniqueVals.map(v => (
                                                                <div key={v} className={`${styles.dropdownItem} ${columnFilters[ci] === v ? styles.dropdownActive : ''}`}
                                                                    onClick={() => applyFilter(ci, v)}>{v}</div>
                                                            ))}
                                                            <div className={styles.dropdownDivider} />
                                                            <div className={styles.dropdownItem} style={{ color: '#ef4444' }} onClick={() => hideCol(h)}>🚫 이 열 숨기기</div>
                                                        </div>
                                                    )}
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {limitedRows.map(({ row, idx: origIdx, status }, ri) => (
                                        <tr key={origIdx} className={`${ri % 2 === 0 ? styles.evenRow : styles.oddRow} ${status === 'warn' ? styles.rowWarn : ''}`}>
                                            {visibleCols.map(ci => {
                                                const ck = `${origIdx}:${ci}`;
                                                const hc = !!comments[ck];
                                                const w = colWidths[headers[ci]];
                                                return (
                                                    <td key={ci}
                                                        className={`${centerCols.has(ci) ? styles.centerCell : ''} ${hc ? styles.hasComment : ''}`}
                                                        style={w ? { maxWidth: w, overflow: 'hidden', textOverflow: 'ellipsis' } : undefined}
                                                        onMouseEnter={hc ? (e) => showTooltip(e, comments[ck]) : undefined}
                                                        onMouseLeave={hc ? () => setTooltip(null) : undefined}>
                                                        {row[ci]}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className={styles.tableFooter}>
                            <span>{limitedRows.length}행 표시 {displayRows.length !== allData.length ? `/ 필터 ${displayRows.length}행` : ''} / 전체 {allData.length}행</span>
                            {hasMore && (
                                <span className={styles.loadMoreWrap}>
                                    <button className={styles.loadMoreBtn} onClick={() => setDisplayLimit(p => p + 100)}>+100행 더 보기</button>
                                    <button className={styles.loadMoreBtn} onClick={() => setDisplayLimit(displayRows.length)}>전체 표시</button>
                                </span>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* 메모 툴팁 */}
            {tooltip && <div className={styles.tooltip} style={{ left: tooltip.x, top: tooltip.y }}>{tooltip.text}</div>}

            {/* 설정 모달 */}
            {showSettings && (
                <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowSettings(false); }}>
                    <div className={styles.modal}>
                        <h2>배차판 파일 설정</h2>
                        <div className={styles.formGroup}>
                            <label>글로비스 KD 외</label>
                            <div className={styles.pathRow}>
                                <input value={settings.glovis_path} readOnly className={styles.pathInput} />
                                <button onClick={() => openBrowser('glovis')} className={styles.browseBtn}>찾기</button>
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label>모비스 AS</label>
                            <div className={styles.pathRow}>
                                <input value={settings.mobis_path} readOnly className={styles.pathInput} />
                                <button onClick={() => openBrowser('mobis')} className={styles.browseBtn}>찾기</button>
                            </div>
                        </div>
                        <div className={styles.modalFooter}>
                            <button onClick={() => setShowSettings(false)} className={styles.cancelBtn}>취소</button>
                            <button onClick={saveSettingsHandler} className={styles.saveBtn}>저장</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 파일 브라우저 모달 */}
            {showBrowser && (
                <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) { setShowBrowser(false); setShowSettings(true); } }}>
                    <div className={styles.modal} style={{ maxWidth: 600 }}>
                        <h2>NAS 파일 선택</h2>
                        <p className={styles.browserPath}>{browserPath}</p>
                        <div className={styles.browserList}>
                            {browserLoading ? <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>불러오는 중...</div> : <>
                                {browserPath !== '/' && <div className={styles.browserItem} onClick={() => loadFolder(browserPath.split('/').slice(0, -1).join('/') || '/')}>📁 ..</div>}
                                {browserFiles.map((f, i) => (
                                    <div key={i} className={styles.browserItem} onClick={() => selectFile(f)}>
                                        {f.type === 'directory' ? '📁' : '📄'} {f.name}
                                    </div>
                                ))}
                            </>}
                        </div>
                        <div className={styles.modalFooter}>
                            <button onClick={() => { setShowBrowser(false); setShowSettings(true); }} className={styles.cancelBtn}>닫기</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
