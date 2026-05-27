'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    CONTAINER_LOOKUP_DISPLAY_COLUMNS,
    extractUniqueContainerNos,
    getContainerLookupValue,
    isContainerLookupColumn,
    orderContainerLookupTargets,
} from '@/utils/containerHistoryResults.mjs';
import {
    areArraysEqual,
    areSetsEqual,
    buildRecentShippingMonthOptions,
    compareShippingFilterValues,
    filterShippingDisplayHeaders,
    findWorkDateColumnIndex,
    getDefaultShippingMonthKeys,
    getShippingVirtualWindow,
    getShippingSignalTone,
    getVisibleShippingColumns,
    isShippingUnshippedCandidate,
    mergePendingContainerLookupResults,
    normalizeDateOnly,
    normalizeShippingFilterValue,
    normalizeShippingColumnOrder,
    reconcileShippingLayoutPrefs,
} from '@/utils/asanShippingView.mjs';
import styles from './shipping.module.css';

const PREFS_KEY = 'asan_shipping_prefs';
const ROW_HEIGHT = 28;
const VIRTUAL_OVERSCAN = 12;
const SHIPPING_PAGE_SIZE = 100;
const MOBILE_RENDER_BATCH_SIZE = 100;
const FULL_FILTER_PAGE_SIZE = 10000;
const SEARCH_DEBOUNCE_MS = 1000;
const SEARCH_CLEAR_DEBOUNCE_MS = 250;
const SEARCH_BUSY_VISIBLE_DELAY_MS = 350;
const CONTAINER_RESULTS_CHUNK_SIZE = 150;
const LOOKUP_HEADERS = CONTAINER_LOOKUP_DISPLAY_COLUMNS.map(col => col.header);
const LOOKUP_SESSION_KEY = 'asan_shipping_container_lookup_session';
const LOOKUP_SESSION_STALE_MS = 30 * 60 * 1000;
const LOOKUP_SESSION_POLL_MS = 4000;

// 날짜 관련 컬럼 키워드. 실제 날짜값 샘플 검증과 함께 사용한다.
const DATE_COL_KEYWORDS = ['일자', '일', '날짜', 'date', '작업', '픽업', '반입', '입항', '출항', '접안'];
const DATE_COLUMN_SAMPLE_SIZE = 200;
const DEFAULT_DATE_FILTER_COL = '작업일';

function scheduleShippingIdleTask(callback, timeout = 1200) {
    if (typeof window === 'undefined') return () => { };
    if ('requestIdleCallback' in window) {
        const id = window.requestIdleCallback(callback, { timeout });
        return () => window.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(callback, Math.min(timeout, 700));
    return () => window.clearTimeout(timer);
}

// 20260508.0 → 2026-05-08 변환
function formatCellValue(val, colName) {
    if (val == null || val === '') return '';
    const s = String(val);
    
    // 날짜 패턴 감지: 20260508.0 or 20260508
    const m = s.match(/^(\d{4})(\d{2})(\d{2})(\.0)?$/);
    if (m) {
        const [, y, mo, d] = m;
        if (parseInt(mo) >= 1 && parseInt(mo) <= 12 && parseInt(d) >= 1 && parseInt(d) <= 31) {
            return `${y}-${mo}-${d}`;
        }
    }
    
    // 시간 패턴 감지: 09:00:00 -> 09:00
    if (colName && colName.includes('시간')) {
        const timeMatch = s.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
        if (timeMatch) {
            const h = timeMatch[1].padStart(2, '0');
            return `${h}:${timeMatch[2]}`;
        }
    }

    return s;
}

// 컬럼이 날짜 계열인지 판별
function isStrongDateColumnName(colName) {
    const text = String(colName || '').replace(/\s+/g, '').toLowerCase();
    if (!text) return false;
    return (
        text.includes('date')
        || text.includes('날짜')
        || text.includes('일자')
        || (text.includes('작업') && text.includes('일'))
        || (text.includes('픽업') && text.includes('일'))
        || (text.includes('반입') && text.includes('일'))
        || (text.includes('접안') && text.includes('일'))
        || (text.includes('입항') && text.includes('일'))
        || (text.includes('출항') && text.includes('일'))
    );
}

function getDateColumnRank(colName) {
    const text = String(colName || '').replace(/\s+/g, '').toLowerCase();
    if (text.includes('작업') && text.includes('일')) return 0;
    if (text.includes('픽업') && text.includes('일')) return 1;
    if (text.includes('반입') && text.includes('일')) return 2;
    if (text.includes('접안') && text.includes('일')) return 3;
    if (text.includes('입항') && text.includes('일')) return 4;
    if (text.includes('출항') && text.includes('일')) return 5;
    if (text.includes('date') || text.includes('날짜') || text.includes('일자')) return 6;
    return 99;
}

function isDateColumn(colName, rows = [], colIdx = -1) {
    const lower = (colName || '').toLowerCase();
    if (!DATE_COL_KEYWORDS.some(kw => lower.includes(kw))) return false;
    if (colIdx < 0) return false;
    const strongDateName = isStrongDateColumnName(colName);

    const sampleRows = (rows || []).slice(0, DATE_COLUMN_SAMPLE_SIZE);
    let checked = 0;
    let dateValues = 0;
    sampleRows.forEach(row => {
        const raw = normalizeShippingFilterValue(formatCellValue(row?.[colIdx], colName));
        if (!raw) return;
        checked += 1;
        if (normalizeDateOnly(raw)) dateValues += 1;
    });

    if (checked === 0) return strongDateName;
    return dateValues >= 2 || dateValues / checked >= 0.2;
}

function getHiddenChipLabel(col) {
    return isContainerLookupColumn(col) ? String(col).replace(/^이력\s*/, '') : col;
}

function getServerSortParams(config) {
    if (!config?.key || isContainerLookupColumn(config.key)) {
        return { sortKey: '', sortDir: 'asc' };
    }
    return {
        sortKey: config.key,
        sortDir: config.direction === 'desc' ? 'desc' : 'asc',
    };
}

function isSortConfigEqual(a, b) {
    return (a?.key || null) === (b?.key || null) && (a?.direction || 'asc') === (b?.direction || 'asc');
}

function isConfirmedVesselColumn(header) {
    return String(header || '').replace(/\s+/g, '').includes('선적확정모선');
}

function getConfirmedVesselColumnIndexes(headers = []) {
    return (headers || []).reduce((indexes, header, index) => {
        if (isConfirmedVesselColumn(header)) indexes.push(index);
        return indexes;
    }, []);
}

function hasConfirmedVesselValue(headers = [], row = []) {
    return getConfirmedVesselColumnIndexes(headers).some(index => String(row?.[index] || '').trim() !== '');
}

function readContainerLookupSession() {
    if (typeof window === 'undefined') return null;
    try {
        return JSON.parse(localStorage.getItem(LOOKUP_SESSION_KEY) || 'null');
    } catch {
        return null;
    }
}

function writeContainerLookupSession(session) {
    if (typeof window === 'undefined' || !session) return session;
    const next = {
        ...session,
        updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(LOOKUP_SESSION_KEY, JSON.stringify(next));
    return next;
}

function isSameLookupPath(session, path) {
    return Boolean(session?.path && path && session.path === path);
}

function isLookupSessionStale(session) {
    if (!session || (session.state !== 'running' && session.state !== 'stopping')) return false;
    const timestamp = Date.parse(session.lastSignalAt || session.startedAt || '');
    if (!Number.isFinite(timestamp)) return true;
    return Date.now() - timestamp > LOOKUP_SESSION_STALE_MS;
}

function summarizeSavedLookupProgress(savedMap = {}, containers = [], fallback = {}) {
    const targets = (containers || []).map(v => String(v || '').trim().toUpperCase()).filter(Boolean);
    const startedAt = Date.parse(fallback.startedAt || '');
    const completed = targets.filter(containerNo => {
        const record = savedMap?.[containerNo];
        if (!Array.isArray(record?.mainRow) || record.mainRow.length === 0) return false;
        if (!Number.isFinite(startedAt)) return true;
        const lookedUpAt = Date.parse(record.lookedUpAt || '');
        return Number.isFinite(lookedUpAt) && lookedUpAt >= startedAt;
    }).length;
    const total = targets.length || Number(fallback.total || 0);
    const fallbackFailed = Math.max(0, Number(fallback.failed || 0));
    const failed = Math.min(Math.max(0, total - completed), fallbackFailed);
    return { total, completed, failed };
}

function createLookupSession({ path, containers, status }) {
    const now = new Date().toISOString();
    const targets = Array.from(new Set((containers || []).map(v => String(v || '').trim().toUpperCase()).filter(Boolean)));
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        path,
        containers: targets,
        total: targets.length,
        completed: 0,
        failed: 0,
        state: 'running',
        status,
        startedAt: now,
        lastSignalAt: now,
        updatedAt: now,
    };
}

export default function AsanShipping() {
    const [data, setData] = useState(null);
    const [headers, setHeaders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [searchInput, setSearchInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchRefreshing, setSearchRefreshing] = useState(false);
    const [showSearchRefreshing, setShowSearchRefreshing] = useState(false);
    const [isComposingSearch, setIsComposingSearch] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [elapsed, setElapsed] = useState('');
    
    // Sort Config
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    
    // Column Order & Hiding
    const [colOrder, setColOrder] = useState([]);
    const [hiddenCols, setHiddenCols] = useState(new Set());
    const [draggedCol, setDraggedCol] = useState(null);
    const [dragOverCol, setDragOverCol] = useState(null);
    const [isDragOverHidden, setIsDragOverHidden] = useState(false);

    // Column Filters (Excel-like)
    const [columnFilters, setColumnFilters] = useState({});
    // Date Month Filter
    const [dateFilter, setDateFilter] = useState(() => ({
        col: DEFAULT_DATE_FILTER_COL,
        months: getDefaultShippingMonthKeys(),
    }));
    const [unshippedOnly, setUnshippedOnly] = useState(false);
    const [storageOnly, setStorageOnly] = useState(false);
    const [confirmedVesselOnly, setConfirmedVesselOnly] = useState(false);
    const [filterDropdown, setFilterDropdown] = useState(null);

    // File Browser
    const [showSettings, setShowSettings] = useState(false);
    const [showBrowser, setShowBrowser] = useState(false);
    const [browserPath, setBrowserPath] = useState('/아산지점');
    const [browserFiles, setBrowserFiles] = useState([]);
    const [browserLoading, setBrowserLoading] = useState(false);
    const [selectedPath, setSelectedPath] = useState('');
    const [containerAutoLookupEnabled, setContainerAutoLookupEnabled] = useState(true);
    const [containerAutoLookupSaving, setContainerAutoLookupSaving] = useState(false);
    const [containerAutoLookupStatus, setContainerAutoLookupStatus] = useState('');
    const [containerLookupResults, setContainerLookupResults] = useState({});
    const [containerLookupRunning, setContainerLookupRunning] = useState(false);
    const [containerLookupStopping, setContainerLookupStopping] = useState(false);
    const [containerLookupStatus, setContainerLookupStatus] = useState('');
    const [containerLookupProgress, setContainerLookupProgress] = useState(null);
    const [containerLookupErrorSummary, setContainerLookupErrorSummary] = useState(null);
    const [activeLookupSession, setActiveLookupSession] = useState(null);
    const containerLookupResultsRef = useRef({});
    const containerLookupAbortRef = useRef(null);
    const lastLoadedPathRef = useRef('');
    const fetchRequestIdRef = useRef(0);
    const autoLoadMoreRef = useRef(false);
    const layoutPrefsLoadedRef = useRef('');

    useEffect(() => {
        const saved = localStorage.getItem('asan_shipping_file') || '/아산지점/2026_자체보관리스트.xlsx';
        setSelectedPath(saved);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const loadShippingSettings = async () => {
            try {
                const res = await fetch('/api/branches/asan/settings');
                const json = await res.json().catch(() => ({}));
                if (!cancelled && res.ok && json.data) {
                    setContainerAutoLookupEnabled(json.data.shipping_container_auto_lookup_enabled !== false);
                }
            } catch (err) {
                console.warn('선적관리 설정 조회 실패:', err);
            }
        };
        loadShippingSettings();
        return () => { cancelled = true; };
    }, []);

    const applyShippingData = useCallback((payload, options = {}) => {
        if (!payload) return;
        const append = Boolean(options.append);
        setData(prev => {
            if (!append || !prev?.data || !payload.data) return payload;
            return {
                ...payload,
                data: [...prev.data, ...payload.data]
            };
        });
        if (payload.headers) {
            const filteredHeaders = filterShippingDisplayHeaders(payload.headers);
            setHeaders(filteredHeaders);
        }
    }, []);

    const fetchData = useCallback(async (pathOverride, options = {}) => {
        const path = pathOverride || selectedPath;
        if (!path) return;

        const page = options.page || 1;
        const pageSize = options.pageSize || SHIPPING_PAGE_SIZE;
        const search = (options.search || '').trim();
        const append = Boolean(options.append);
        const quiet = Boolean(options.quiet);
        const sortKey = (options.sortKey || '').trim();
        const sortDir = options.sortDir === 'desc' ? 'desc' : 'asc';
        const dateCol = (options.dateCol || '').trim();
        const months = Array.isArray(options.months)
            ? options.months.map(month => String(month || '').trim()).filter(Boolean)
            : [];
        const requestId = append ? fetchRequestIdRef.current : fetchRequestIdRef.current + 1;
        if (!append) fetchRequestIdRef.current = requestId;

        if (append) {
            setLoadingMore(true);
        } else if (quiet) {
            setSearchRefreshing(true);
        } else {
            setLoading(true);
        }
        try {
            const params = new URLSearchParams({
                path,
                page: String(page),
                page_size: String(pageSize)
            });
            if (search) params.set('search', search);
            if (sortKey) {
                params.set('sort_key', sortKey);
                params.set('sort_dir', sortDir);
            }
            if (dateCol && months.length > 0) {
                params.set('date_col', dateCol);
                params.set('months', months.join(','));
            }

            const r = await fetch(`/api/branches/asan/shipping?${params.toString()}`);
            // 백엔드에서 Python NaN이 JSON에 섞여 나올 수 있어 text로 받아서 치환 후 파싱
            const text = await r.text();
            const safeText = text.replace(/\bNaN\b/g, 'null');
            const j = JSON.parse(safeText);
            if (j.data) {
                if (requestId !== fetchRequestIdRef.current) return;
                applyShippingData(j.data, { append });
                lastLoadedPathRef.current = path;
            }
        } catch (e) {
            console.error('Failed to fetch shipping data:', e);
        } finally {
            if (append) {
                setLoadingMore(false);
            } else if (requestId !== fetchRequestIdRef.current) {
                return;
            } else if (options.quiet) {
                setSearchRefreshing(false);
            } else {
                setLoading(false);
            }
        }
    }, [selectedPath, applyShippingData]);

    const allHeaders = useMemo(() => {
        return [...headers, ...LOOKUP_HEADERS.filter(header => !headers.includes(header))];
    }, [headers]);

    const hiddenColumnList = useMemo(() => {
        const cols = Array.from(hiddenCols);
        return [
            ...cols.filter(col => !isContainerLookupColumn(col)),
            ...cols.filter(col => isContainerLookupColumn(col)),
        ];
    }, [hiddenCols]);

    const orderedVisibleColumns = useMemo(() => (
        getVisibleShippingColumns(colOrder, allHeaders, hiddenCols)
    ), [colOrder, allHeaders, hiddenCols]);

    const getRowContainerNo = useCallback((row) => {
        if (!data?.headers) return '';
        return extractUniqueContainerNos(data.headers, [row])[0] || '';
    }, [data?.headers]);

    const getDisplayCellRawValue = useCallback((row, col) => {
        if (isContainerLookupColumn(col)) {
            const containerNo = getRowContainerNo(row);
            return getContainerLookupValue(containerLookupResults[containerNo], col);
        }
        const colIdx = data?.headers?.indexOf(col) ?? -1;
        return colIdx >= 0 ? row[colIdx] : '';
    }, [containerLookupResults, data?.headers, getRowContainerNo]);

    const serverSortParams = useMemo(() => getServerSortParams(sortConfig), [sortConfig]);
    const serverDateMonthsKey = useMemo(() => (dateFilter.months || []).join(','), [dateFilter.months]);
    const serverDateFilterParams = useMemo(() => ({
        dateCol: dateFilter.col,
        months: serverDateMonthsKey ? serverDateMonthsKey.split(',') : [],
    }), [dateFilter.col, serverDateMonthsKey]);

    useEffect(() => {
        containerLookupResultsRef.current = containerLookupResults;
    }, [containerLookupResults]);

    const fetchSavedContainerLookupResults = useCallback(async (containers) => {
        const resultMap = {};
        if (!selectedPath || !containers?.length) return resultMap;
        for (let i = 0; i < containers.length; i += CONTAINER_RESULTS_CHUNK_SIZE) {
            const chunk = containers.slice(i, i + CONTAINER_RESULTS_CHUNK_SIZE);
            const params = new URLSearchParams({
                path: selectedPath,
                containers: chunk.join(',')
            });
            const res = await fetch(`/api/branches/asan/shipping/container-results?${params.toString()}`);
            const json = await res.json();
            if (json.data) Object.assign(resultMap, json.data);
        }
        return resultMap;
    }, [selectedPath]);

    const loadSavedContainerLookupResults = useCallback(async (containers) => {
        const missingContainers = Array.from(new Set(containers || []))
            .filter(containerNo => containerNo && !containerLookupResultsRef.current?.[containerNo]?.mainRow);
        if (!selectedPath || !missingContainers.length) return;
        try {
            const savedMap = await fetchSavedContainerLookupResults(missingContainers);
            if (Object.keys(savedMap).length > 0) {
                setContainerLookupResults(prev => {
                    const next = { ...prev, ...savedMap };
                    containerLookupResultsRef.current = next;
                    return next;
                });
            }
        } catch (err) {
            console.warn('Failed to load container lookup results:', err);
        }
    }, [selectedPath, fetchSavedContainerLookupResults]);

    const fetchContainerLookupJob = useCallback(async (jobId) => {
        const suffix = jobId ? `?id=${encodeURIComponent(jobId)}` : '';
        const res = await fetch(`/api/branches/asan/shipping/container-lookup/jobs${suffix}`);
        if (!res.ok) return null;
        const json = await res.json();
        return json.job || null;
    }, []);

    const refreshContainerLookupSession = useCallback(async (options = {}) => {
        const session = options.session || readContainerLookupSession();
        if (!session || !isSameLookupPath(session, selectedPath)) return null;
        if (session.state && !['running', 'stopping', 'stale'].includes(session.state)) return null;
        const containers = Array.isArray(session.containers) ? session.containers : [];
        if (!containers.length) return null;

        try {
            const job = await fetchContainerLookupJob(session.jobId || '');
            const savedMap = await fetchSavedContainerLookupResults(containers);
            if (Object.keys(savedMap).length > 0) {
                setContainerLookupResults(prev => {
                    const next = { ...prev, ...savedMap };
                    containerLookupResultsRef.current = next;
                    return next;
                });
            }

            let progress = job ? {
                total: Number(job.total || containers.length),
                completed: Number(job.completed || 0),
                failed: Number(job.failed || 0),
                remaining: Math.max(0, Number(job.remaining ?? (Number(job.total || containers.length) - Number(job.completed || 0) - Number(job.failed || 0)))),
            } : summarizeSavedLookupProgress(savedMap, containers, session);
            let state = job?.state || session.state || 'running';
            let status = job?.status || session.status || '이전 컨테이너 조회 상태 확인 중';
            let errorSummary = job?.errorSummary || session.errorSummary || null;
            const isTerminalJob = ['completed', 'failed', 'cancelled'].includes(job?.state);
            const isDone = isTerminalJob || (progress.total > 0 && progress.completed + progress.failed >= progress.total);

            if (isDone) {
                state = progress.failed > 0 ? 'failed' : 'completed';
                if (job?.state === 'cancelled') state = 'cancelled';
                status = progress.failed > 0
                    ? `백그라운드 컨테이너 조회 종료: 완료 ${progress.completed.toLocaleString()}건, 실패 ${progress.failed.toLocaleString()}건`
                    : `백그라운드 컨테이너 조회 완료: 저장 결과 ${progress.completed.toLocaleString()}건 확인`;
                if (job?.status) status = job.status;
                if (progress.failed > 0 && !errorSummary) {
                    errorSummary = {
                        total: progress.failed,
                        reasons: [{ reason: '이전 조회 스트림에만 있던 실패 사유', count: progress.failed }],
                        samples: [],
                        message: `이전 조회 스트림에만 있던 실패 사유 ${progress.failed.toLocaleString()}건`,
                    };
                }
            } else if (!job && isLookupSessionStale(session)) {
                progress = {
                    ...progress,
                    failed: Math.max(progress.failed, Math.max(0, progress.total - progress.completed)),
                    remaining: 0,
                };
                state = 'stale';
                status = `이전 컨테이너 조회 상태 확인: 완료 ${progress.completed.toLocaleString()}건, 미확인 ${Math.max(0, progress.total - progress.completed).toLocaleString()}건`;
            } else {
                status = job?.status || `백그라운드 컨테이너 조회 진행 중: 완료 ${progress.completed.toLocaleString()}건 / 대상 ${progress.total.toLocaleString()}건`;
            }

            const progressAdvanced = progress.completed > Number(session.completed || 0)
                || progress.failed > Number(session.failed || 0);
            const next = writeContainerLookupSession({
                ...session,
                ...progress,
                state,
                status,
                errorSummary,
                lastSignalAt: progressAdvanced || job ? new Date().toISOString() : session.lastSignalAt,
            });
            setActiveLookupSession(next);
            setContainerLookupProgress(progress);
            setContainerLookupStatus(status);
            setContainerLookupErrorSummary(errorSummary);
            return next;
        } catch (err) {
            console.warn('컨테이너 조회 세션 복원 실패:', err);
            return session;
        }
    }, [selectedPath, fetchSavedContainerLookupResults, fetchContainerLookupJob]);

    useEffect(() => {
        if (isComposingSearch) return undefined;
        const delay = searchInput.trim() ? SEARCH_DEBOUNCE_MS : SEARCH_CLEAR_DEBOUNCE_MS;
        const timer = setTimeout(() => {
            setSearchTerm(searchInput);
        }, delay);
        return () => clearTimeout(timer);
    }, [searchInput, isComposingSearch]);

    useEffect(() => {
        if (!searchRefreshing) {
            setShowSearchRefreshing(false);
            return undefined;
        }
        const timer = setTimeout(() => {
            setShowSearchRefreshing(true);
        }, SEARCH_BUSY_VISIBLE_DELAY_MS);
        return () => clearTimeout(timer);
    }, [searchRefreshing]);

    useEffect(() => {
        if (!selectedPath) return;
        const quiet = lastLoadedPathRef.current === selectedPath;
        fetchData(selectedPath, { page: 1, search: searchTerm, quiet, ...serverSortParams, ...serverDateFilterParams });
    }, [selectedPath, searchTerm, serverSortParams, serverDateFilterParams, fetchData]);

    useEffect(() => {
        if (!data?.headers || !data?.data?.length) return;
        const containers = extractUniqueContainerNos(data.headers, data.data);
        return scheduleShippingIdleTask(() => loadSavedContainerLookupResults(containers));
    }, [data?.headers, data?.data, loadSavedContainerLookupResults]);

    useEffect(() => {
        if (!selectedPath) return;
        refreshContainerLookupSession();
    }, [selectedPath, refreshContainerLookupSession]);

    useEffect(() => {
        if (!activeLookupSession || activeLookupSession.state !== 'running' || isLookupSessionStale(activeLookupSession)) return undefined;
        const timer = setInterval(() => {
            refreshContainerLookupSession({ session: activeLookupSession });
        }, LOOKUP_SESSION_POLL_MS);
        return () => clearInterval(timer);
    }, [activeLookupSession, refreshContainerLookupSession]);

    useEffect(() => {
        if (!data || !data.file_modified_at) {
            setElapsed('');
            return;
        }
        const fileTs = data.file_modified_at;
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
    }, [data]);

    const loadNasFolder = async (path) => {
        setBrowserLoading(true);
        try {
            const r = await fetch(`/api/nas/files?path=${encodeURIComponent(path)}`);
            const j = await r.json();
            if (j.files) setBrowserFiles(j.files);
            setBrowserPath(path);
        } catch (e) {
            console.error(e);
        } finally {
            setBrowserLoading(false);
        }
    };

    const openBrowser = () => {
        loadNasFolder('/아산지점');
        setShowSettings(false);
        setShowBrowser(true);
    };

    const selectFile = (file) => {
        if (file.type === 'directory') {
            loadNasFolder(file.path);
        } else if (file.name.match(/\.xls[mx]$/i)) {
            localStorage.setItem('asan_shipping_file', file.path);
            setSelectedPath(file.path);
            setShowBrowser(false);
        }
    };

    const handleContainerAutoLookupToggle = async (checked) => {
        const prev = containerAutoLookupEnabled;
        setContainerAutoLookupEnabled(checked);
        setContainerAutoLookupSaving(true);
        setContainerAutoLookupStatus('DB 저장 중...');
        try {
            const res = await fetch('/api/branches/asan/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shipping_container_auto_lookup_enabled: checked }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || '컨테이너 자동조회 설정 저장 실패');
            setContainerAutoLookupEnabled(json.data?.shipping_container_auto_lookup_enabled !== false);
            setContainerAutoLookupStatus('DB 저장 완료');
        } catch (err) {
            console.warn('컨테이너 자동조회 설정 저장 실패:', err);
            setContainerAutoLookupEnabled(prev);
            setContainerAutoLookupStatus('DB 저장 실패');
            alert(err.message || '컨테이너 자동조회 설정 저장에 실패했습니다.');
        } finally {
            setContainerAutoLookupSaving(false);
        }
    };

    // Load preferences from DB (fallback to localStorage)
    useEffect(() => {
        if (headers.length === 0 || allHeaders.length === 0) return;
        const prefsSignature = `${selectedPath}::${allHeaders.join('|')}`;
        if (layoutPrefsLoadedRef.current === prefsSignature) return;
        layoutPrefsLoadedRef.current = prefsSignature;

        const applyLayoutPrefs = (nextOrder, nextHidden, nextSortConfig) => {
            const normalizedOrder = normalizeShippingColumnOrder(nextOrder, allHeaders);
            setColOrder(prev => areArraysEqual(prev, normalizedOrder) ? prev : normalizedOrder);
            setHiddenCols(prev => areSetsEqual(prev, nextHidden) ? prev : nextHidden);
            if (nextSortConfig) {
                setSortConfig(prev => isSortConfigEqual(prev, nextSortConfig) ? prev : nextSortConfig);
            }
        };

        const loadDbPrefs = async () => {
            try {
                const res = await fetch('/api/user/prefs?page_key=asan_shipping_default&fallback=asan_shipping_admin_p1');
                const { data: prefs } = await res.json();
                if (prefs && prefs.colOrder && prefs.colOrder.length > 0) {
                    let finalOrder = prefs.colOrder;
                    let finalHidden = new Set((prefs.hiddenCols || []).filter(name => allHeaders.includes(name)));

                    // [v5.13.43] 엑셀 제목 변경은 같은 열 수에서만 인덱스 매칭하고, 삭제/추가는 현재 헤더 기준으로 반영한다.
                    if (prefs.sourceHeaders && allHeaders) {
                        const reconciled = reconcileShippingLayoutPrefs({
                            order: prefs.colOrder,
                            hiddenCols: prefs.hiddenCols || [],
                            sourceHeaders: prefs.sourceHeaders,
                            currentHeaders: allHeaders,
                        });
                        finalOrder = reconciled.colOrder;
                        finalHidden = reconciled.hiddenCols;
                    }

                    applyLayoutPrefs(finalOrder, finalHidden, prefs.sortConfig);
                    return;
                }
            } catch { /* ignore */ }
            // Fallback: localStorage
            try {
                const cached = JSON.parse(localStorage.getItem(PREFS_KEY));
                if (cached?.colOrder?.length > 0) {
                    applyLayoutPrefs(cached.colOrder, new Set(), null);
                    return;
                }
            } catch { /* ignore */ }
            applyLayoutPrefs(allHeaders, new Set(), null);
        };
        loadDbPrefs();
    }, [allHeaders, headers.length, selectedPath]);

    const containerRef = useRef(null);
    const tableWrapRef = useRef(null);
    const [dynamicHeight, setDynamicHeight] = useState('calc(100vh - 250px)');
    const [tableScrollTop, setTableScrollTop] = useState(0);
    const [tableViewportHeight, setTableViewportHeight] = useState(480);
    const [mobileVisibleLimit, setMobileVisibleLimit] = useState(MOBILE_RENDER_BATCH_SIZE);
    const isMobileTableMode = dynamicHeight === 'auto';

    useEffect(() => {
        const updateHeight = () => {
            if (window.innerWidth <= 768) {
                setDynamicHeight('auto');
                return;
            }
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const remaining = window.innerHeight - rect.top - 24; // 24px bottom margin
                setDynamicHeight(`${Math.max(400, remaining)}px`);
            }
        };
        updateHeight();
        window.addEventListener('resize', updateHeight);
        const timer = setTimeout(updateHeight, 300);
        return () => {
            window.removeEventListener('resize', updateHeight);
            clearTimeout(timer);
        };
    }, []);

    useEffect(() => {
        const wrap = tableWrapRef.current;
        if (!wrap) return;

        const updateViewport = () => setTableViewportHeight(wrap.clientHeight || 480);
        updateViewport();

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateViewport);
            return () => window.removeEventListener('resize', updateViewport);
        }

        const observer = new ResizeObserver(updateViewport);
        observer.observe(wrap);
        return () => observer.disconnect();
    }, [dynamicHeight]);

    // Auto-save layout to DB (debounced 1.5s)
    useEffect(() => {
        if (headers.length === 0 || colOrder.length === 0 || allHeaders.length === 0) return;
        const t = setTimeout(() => {
            const normalizedOrder = normalizeShippingColumnOrder(colOrder, allHeaders);
            const settings = { 
                colOrder: normalizedOrder,
                hiddenCols: Array.from(hiddenCols), 
                sortConfig,
                sourceHeaders: allHeaders // [v5.12.4] 제목 수정 추적용 원본 헤더 저장
            };
            fetch('/api/user/prefs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_key: 'asan_shipping_default', settings })
            }).catch(() => {});
            localStorage.setItem(PREFS_KEY, JSON.stringify({ colOrder: normalizedOrder }));
        }, 1500);
        return () => clearTimeout(t);
    }, [colOrder, hiddenCols, sortConfig, allHeaders, headers.length]);

    const handleSort = (colName) => {
        let direction = 'asc';
        if (sortConfig.key === colName && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key: colName, direction });
    };

    const handleDragStart = (e, colName) => {
        setDraggedCol(colName);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, colName) => {
        e.preventDefault();
        setDragOverCol(colName);
    };

    const handleDrop = (e, targetCol) => {
        e.preventDefault();
        setDragOverCol(null);
        if (!draggedCol) return;
        if (draggedCol === targetCol) return;

        const newOrder = [...colOrder];
        const draggedIdx = newOrder.indexOf(draggedCol);
        const targetIdx = newOrder.indexOf(targetCol);
        
        if (draggedIdx === -1) {
            // Dragged from hidden, insert at target
            newOrder.splice(Math.max(0, targetIdx), 0, draggedCol);
            setColOrder(normalizeShippingColumnOrder(newOrder, allHeaders));
        } else {
            // Reorder inside table
            newOrder.splice(draggedIdx, 1);
            const adjustedTargetIdx = draggedIdx < targetIdx ? targetIdx - 1 : targetIdx;
            newOrder.splice(Math.max(0, adjustedTargetIdx), 0, draggedCol);
            setColOrder(normalizeShippingColumnOrder(newOrder, allHeaders));
        }
        setHiddenCols(prev => {
            if (!prev.has(draggedCol)) return prev;
            const n = new Set(prev);
            n.delete(draggedCol);
            return n;
        });
        setDraggedCol(null);
    };

    const handleDropToHidden = (e) => {
        e.preventDefault();
        setIsDragOverHidden(false);
        if (draggedCol && allHeaders.includes(draggedCol)) {
            setColOrder(prev => normalizeShippingColumnOrder(prev.length ? prev : allHeaders, allHeaders));
            setHiddenCols(prev => new Set(prev).add(draggedCol));
        }
        setDraggedCol(null);
    };

    const handleRestoreCol = (col) => {
        setHiddenCols(prev => {
            const n = new Set(prev);
            n.delete(col);
            return n;
        });
        setColOrder(prev => normalizeShippingColumnOrder(prev.includes(col) ? prev : [...prev, col], allHeaders));
    };

    const exportToExcel = async () => {
        if (!processedData || processedData.length === 0) {
            alert('다운로드할 데이터가 없습니다.');
            return;
        }

        // Use the rendered column order so container history stays at the right edge.
        const exportHeaders = orderedVisibleColumns;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const exportRows = processedData.map(row => (
            exportHeaders.map(col => getDisplayCellRawValue(row, col))
        ));
        const fileName = `선적관리_${timestamp}.xlsx`;

        try {
            const response = await fetch('/api/branches/asan/export/view', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: '아산 선적관리',
                    generatedAt: `다운로드 ${new Date().toLocaleString('ko-KR')} / ${exportRows.length.toLocaleString('ko-KR')}건`,
                    sheetName: '선적관리',
                    fileName,
                    headers: exportHeaders,
                    rows: exportRows,
                }),
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.error || '엑셀 생성 실패');
            }
            const blob = await response.blob();
            const disposition = response.headers.get('Content-Disposition') || '';
            const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
            const downloadName = encodedMatch?.[1] ? decodeURIComponent(encodedMatch[1]) : fileName;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = downloadName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            alert(`엑셀 다운로드 실패: ${error.message}`);
        }
    };

    const resetLayout = () => {
        setColOrder(normalizeShippingColumnOrder(allHeaders, allHeaders));
        setHiddenCols(new Set());
        setSortConfig({ key: null, direction: 'asc' });
        setColumnFilters({});
        setDateFilter({ col: dateColumns[0] || DEFAULT_DATE_FILTER_COL, months: getDefaultShippingMonthKeys() });
        setUnshippedOnly(false);
        setStorageOnly(false);
        setConfirmedVesselOnly(false);
        setSearchInput('');
        setSearchTerm('');
        localStorage.removeItem(PREFS_KEY);
        fetch('/api/user/prefs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page_key: 'asan_shipping_default', settings: {} })
        }).catch(() => {});
    };

    const savePreset = async (num) => {
        const settings = { 
            colOrder, 
            hiddenCols: Array.from(hiddenCols), 
            sortConfig,
            sourceHeaders: allHeaders
        };
        try {
            const res = await fetch('/api/user/prefs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_key: `asan_shipping_preset_${num}`, settings })
            });
            if (res.ok) alert(`프리셋 ${num}번 저장 완료!`);
        } catch {
            alert('저장 실패');
        }
    };

    const loadPreset = async (num) => {
        try {
            const res = await fetch(`/api/user/prefs?page_key=asan_shipping_preset_${num}`);
            const { data: prefs } = await res.json();
            if (prefs && prefs.colOrder) {
                let finalOrder = prefs.colOrder;
                let finalHidden = new Set((prefs.hiddenCols || []).filter(name => allHeaders.includes(name)));

                // [v5.13.43] 프리셋 로드 시에도 제목 변경/삭제/추가를 현재 엑셀 헤더에 맞춘다.
                if (prefs.sourceHeaders && allHeaders) {
                    const reconciled = reconcileShippingLayoutPrefs({
                        order: prefs.colOrder,
                        hiddenCols: prefs.hiddenCols || [],
                        sourceHeaders: prefs.sourceHeaders,
                        currentHeaders: allHeaders,
                    });
                    finalOrder = reconciled.colOrder;
                    finalHidden = reconciled.hiddenCols;
                }

                setColOrder(normalizeShippingColumnOrder(finalOrder, allHeaders));
                setHiddenCols(finalHidden);
                setSortConfig(prefs.sortConfig || { key: null, direction: 'asc' });
                alert(`프리셋 ${num}번 로드 완료!`);
            } else {
                alert(`저장된 프리셋 ${num}번이 없습니다.`);
            }
        } catch {
            alert('로드 실패');
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const r = await fetch('/api/branches/asan/shipping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: selectedPath,
                    force: false,
                    page: 1,
                    page_size: SHIPPING_PAGE_SIZE,
                    search: searchTerm,
                    sort_key: serverSortParams.sortKey,
                    sort_dir: serverSortParams.sortDir,
                    date_col: dateFilter.col,
                    months: dateFilter.months || [],
                })
            });
            const text = await r.text();
            const safeText = text.replace(/\bNaN\b/g, 'null');
            const j = JSON.parse(safeText);
            if (!r.ok || j.error) {
                throw new Error(j.error || 'NAS 동기화 실패');
            }
            if (j.data) {
                applyShippingData(j.data);
            } else {
                await fetchData(selectedPath, { page: 1, search: searchTerm, ...serverSortParams });
            }
        } catch (e) {
            console.error('Failed to sync shipping data:', e);
            alert(e.message || 'NAS 동기화에 실패했습니다.');
        } finally {
            setSyncing(false);
        }
    };

    const handleStopContainerLookup = async () => {
        const session = activeLookupSession || readContainerLookupSession();
        const canStopSession = session?.state === 'running' || session?.state === 'stopping';
        if ((!containerLookupRunning && !canStopSession) || containerLookupStopping) return;

        setContainerLookupStopping(true);
        const progress = containerLookupProgress || (session ? {
            total: Number(session.total || 0),
            completed: Number(session.completed || 0),
            failed: Number(session.failed || 0),
            remaining: Math.max(0, Number(session.total || 0) - Number(session.completed || 0) - Number(session.failed || 0)),
        } : null);
        const remaining = progress ? Math.max(0, Number(progress.remaining ?? (progress.total - progress.completed - progress.failed))) : 0;
        const status = progress
            ? `조회 중지 요청 중: 완료 ${progress.completed.toLocaleString()}건, 실패 ${progress.failed.toLocaleString()}건, 미조회 ${remaining.toLocaleString()}건`
            : '조회 중지 요청 중';
        setContainerLookupStatus(status);
        if (progress) setContainerLookupProgress(progress);
        if (session) {
            const next = writeContainerLookupSession({
                ...session,
                ...(progress || {}),
                state: 'stopping',
                status,
                updatedAt: new Date().toISOString(),
            });
            setActiveLookupSession(next);
        }

        const controller = containerLookupAbortRef.current;
        if (controller && !controller.signal.aborted) {
            controller.abort();
        }

        try {
            const res = session?.jobId
                ? await fetch('/api/branches/asan/shipping/container-lookup/jobs', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: session.jobId }),
                })
                : await fetch('/api/els/stop-daemon', { method: 'POST' });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `중지 요청 실패 (${res.status})`);
            }

            if (!controller) {
                const doneStatus = progress
                    ? `조회 중단됨: 완료 ${progress.completed.toLocaleString()}건, 실패 ${progress.failed.toLocaleString()}건, 미조회 ${remaining.toLocaleString()}건`
                    : '조회 중단됨';
                const next = writeContainerLookupSession({
                    ...(session || {}),
                    ...(progress || {}),
                    state: 'cancelled',
                    status: doneStatus,
                    updatedAt: new Date().toISOString(),
                });
                setActiveLookupSession(next);
                setContainerLookupStatus(doneStatus);
                setContainerLookupStopping(false);
            }
        } catch (err) {
            console.warn('컨테이너 조회 중지 요청 실패:', err);
            if (!controller) {
                const failStatus = `조회 중지 요청 실패: ${err.message || err}`;
                const next = session ? writeContainerLookupSession({
                    ...session,
                    ...(progress || {}),
                    state: 'failed',
                    status: failStatus,
                    updatedAt: new Date().toISOString(),
                }) : null;
                setActiveLookupSession(next);
                setContainerLookupStatus(failStatus);
                setContainerLookupStopping(false);
            }
        }
    };

    const handleContainerLookup = async () => {
        if (containerLookupRunning) return;
        const persistedSession = readContainerLookupSession();
        if (isSameLookupPath(persistedSession, selectedPath) && persistedSession?.state === 'running' && !isLookupSessionStale(persistedSession)) {
            await refreshContainerLookupSession({ session: persistedSession });
            alert('이전 컨테이너 조회가 아직 진행 중입니다. 완료/실패 건수를 복원해서 표시했습니다.');
            return;
        }
        const tableOrderedContainers = extractUniqueContainerNos(data?.headers || [], processedData);
        const containers = orderContainerLookupTargets(tableOrderedContainers, containerLookupResultsRef.current);
        if (!containers.length) {
            alert('현재 필터 결과에서 조회할 컨테이너 번호가 없습니다.');
            return;
        }
        const missingLookupCount = containers.filter(containerNo => !containerLookupResultsRef.current?.[containerNo]?.mainRow).length;

        let lookupSession = writeContainerLookupSession(createLookupSession({
            path: selectedPath,
            containers,
            status: `현재 필터 결과 ${processedData.length.toLocaleString()}행 중 컨테이너 ${containers.length.toLocaleString()}건 조회 준비 중 (미조회 ${missingLookupCount.toLocaleString()}건 우선)`,
        }));
        const updateLookupSession = (patch) => {
            lookupSession = writeContainerLookupSession({
                ...lookupSession,
                ...patch,
                lastSignalAt: new Date().toISOString(),
            });
            setActiveLookupSession(lookupSession);
            return lookupSession;
        };

        setContainerLookupRunning(true);
        setActiveLookupSession(lookupSession);
        setContainerLookupStatus(lookupSession.status);
        setContainerLookupProgress({ total: containers.length, completed: 0, failed: 0 });
        setContainerLookupErrorSummary(null);
        setContainerLookupResults(prev => mergePendingContainerLookupResults(prev, containers));

        containerLookupAbortRef.current = null;
        setContainerLookupStopping(false);
        try {
            const res = await fetch('/api/branches/asan/shipping/container-lookup/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: selectedPath,
                    containers,
                    reserveSingle: false,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `백그라운드 조회 시작 실패 (${res.status})`);
            }
            const payload = await res.json();
            if (!payload.ok || !payload.job) {
                throw new Error(payload.error || '백그라운드 조회 작업 생성 실패');
            }
            const job = payload.job;
            const progress = {
                total: Number(job.total || containers.length),
                completed: Number(job.completed || 0),
                failed: Number(job.failed || 0),
                remaining: Math.max(0, Number(job.remaining ?? containers.length)),
            };
            const status = payload.already_running
                ? '기존 백그라운드 컨테이너 조회가 아직 진행 중입니다.'
                : (job.status || '백그라운드 컨테이너 조회가 시작되었습니다. 다른 페이지로 이동해도 계속 진행됩니다.');
            const next = updateLookupSession({
                jobId: job.id,
                ...progress,
                errorSummary: job.errorSummary || null,
                state: job.state || 'running',
                status,
            });
            setContainerLookupProgress(progress);
            setContainerLookupErrorSummary(job.errorSummary || null);
            setContainerLookupStatus(status);
            await refreshContainerLookupSession({ session: next });
        } catch (err) {
            console.error('컨테이너 조회 실패:', err);
            const progress = { total: containers.length, completed: 0, failed: containers.length, remaining: 0 };
            const errorSummary = {
                total: containers.length,
                reasons: [{ reason: err.message || '백그라운드 조회 시작 실패', count: containers.length }],
                samples: [],
                message: `${err.message || '백그라운드 조회 시작 실패'} ${containers.length.toLocaleString()}건`,
            };
            const status = `오류: ${err.message}`;
            updateLookupSession({ ...progress, errorSummary, state: 'failed', status });
            setContainerLookupProgress(progress);
            setContainerLookupErrorSummary(errorSummary);
            setContainerLookupStatus(status);
            alert(err.message || '컨테이너 조회에 실패했습니다.');
        } finally {
            containerLookupAbortRef.current = null;
            setContainerLookupStopping(false);
            setContainerLookupRunning(false);
        }
    };

    // Detect date-type columns
    const dateColumns = useMemo(() => {
        const workDateIdx = findWorkDateColumnIndex(headers);
        return headers
            .filter((h, idx) => idx === workDateIdx || isDateColumn(h, data?.data || [], idx))
            .sort((a, b) => getDateColumnRank(a) - getDateColumnRank(b));
    }, [headers, data?.data]);
    const recentMonthOptions = useMemo(() => buildRecentShippingMonthOptions(), []);

    useEffect(() => {
        if (dateColumns.length === 0) return;
        setDateFilter(prev => {
            if (dateColumns.includes(prev.col)) return prev;
            return { ...prev, col: dateColumns[0] };
        });
    }, [dateColumns]);

    const getFilterCellValue = useCallback((row, col) => {
        return normalizeShippingFilterValue(formatCellValue(getDisplayCellRawValue(row, col), col));
    }, [getDisplayCellRawValue]);

    // Processed Data (Search, Sort, Target Filtering)
    const processedData = useMemo(() => {
        if (!data || !data.data) return [];
        let rows = [...data.data];
        const isServerPaged = data.source === 'supabase';
        const isServerSort = isServerPaged && sortConfig.key && !isContainerLookupColumn(sortConfig.key);

        // 1. Search Filter (Multi-search support like: 'word1, word2')
        if (!isServerPaged && searchTerm.trim()) {
            const terms = searchTerm.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            if (terms.length > 0) {
                rows = rows.filter(row => {
                    return terms.some(t => row.some(cell => String(cell || '').toLowerCase().includes(t)));
                });
            }
        }

        // 1.5 Column Specific Filters (Excel-like multi-select)
        Object.entries(columnFilters).forEach(([col, selectedSet]) => {
            if (selectedSet && selectedSet.size > 0) {
                rows = rows.filter(row => {
                    const cell = getFilterCellValue(row, col);
                    return selectedSet.has(cell);
                });
            }
        });

        // 1.6 Date Month Filter
        if (dateFilter.col && dateFilter.months?.length > 0) {
            const selectedMonths = new Set(dateFilter.months);
            rows = rows.filter(row => {
                const raw = normalizeDateOnly(getFilterCellValue(row, dateFilter.col));
                if (!raw) return false;
                return selectedMonths.has(raw.slice(0, 7));
            });
        }

        if (storageOnly) {
            rows = rows.filter(row => getFilterCellValue(row, '보관소').includes('자체보관'));
        }

        if (confirmedVesselOnly) {
            rows = rows.filter(row => hasConfirmedVesselValue(data?.headers || [], row));
        }

        if (unshippedOnly) {
            rows = rows.filter(row => {
                const containerNo = getRowContainerNo(row);
                return isShippingUnshippedCandidate(data?.headers || [], row, containerLookupResults[containerNo]);
            });
        }

        // 2. Sorting (User clicked column)
        if (sortConfig.key && !isServerSort) {
            rows.sort((a, b) => {
                return compareShippingFilterValues(
                    getFilterCellValue(a, sortConfig.key),
                    getFilterCellValue(b, sortConfig.key),
                    sortConfig.direction,
                );
            });
        } else {
            // Default Sort: AD, AE, AF values to top
            const targetCols = getConfirmedVesselColumnIndexes(data.headers);
            if (targetCols.length > 0) {
                rows.sort((a, b) => {
                    const hasValA = targetCols.some(cIdx => String(a[cIdx] || '').trim() !== '');
                    const hasValB = targetCols.some(cIdx => String(b[cIdx] || '').trim() !== '');
                    if (hasValA && !hasValB) return -1;
                    if (!hasValA && hasValB) return 1;
                    return 0;
                });
            }
        }

        return rows;
    }, [data, searchTerm, sortConfig, columnFilters, dateFilter, storageOnly, confirmedVesselOnly, unshippedOnly, getFilterCellValue, getRowContainerNo, containerLookupResults]);

    const shouldLoadFullRowsForFilters = Boolean(
        data?.source === 'supabase'
        && !isMobileTableMode
        && Number(data?.total || 0) > (data?.data?.length || 0)
        && (data?.data?.length || 0) < Math.min(Number(data?.total || 0), FULL_FILTER_PAGE_SIZE)
        && (
            filterDropdown
            || Object.keys(columnFilters).length > 0
            || storageOnly
            || confirmedVesselOnly
            || unshippedOnly
        )
    );

    useEffect(() => {
        if (!shouldLoadFullRowsForFilters || !selectedPath) return;
        fetchData(selectedPath, {
            page: 1,
            pageSize: FULL_FILTER_PAGE_SIZE,
            search: searchTerm,
            quiet: true,
            ...serverSortParams,
            ...serverDateFilterParams
        });
    }, [shouldLoadFullRowsForFilters, selectedPath, searchTerm, serverSortParams, serverDateFilterParams, fetchData]);

    useEffect(() => {
        setTableScrollTop(0);
        setMobileVisibleLimit(MOBILE_RENDER_BATCH_SIZE);
        if (tableWrapRef.current) tableWrapRef.current.scrollTop = 0;
    }, [searchTerm, sortConfig, columnFilters, dateFilter, storageOnly, confirmedVesselOnly, unshippedOnly]);

    const totalRows = processedData.length;
    const serverTotalRows = data?.source === 'supabase' ? Number(data.total || data.data?.length || 0) : totalRows;
    const loadedRows = data?.source === 'supabase' ? (data.data?.length || 0) : totalRows;
    const canLoadMore = data?.source === 'supabase' && loadedRows < serverTotalRows;
    const serverTotalRowsLabel = `${serverTotalRows.toLocaleString()}${data?.total_is_estimated ? '+' : ''}`;
    const selectedMonthSet = new Set(dateFilter.months || []);

    const toggleMonthFilter = (monthKey) => {
        setDateFilter(prev => {
            const nextMonths = new Set(prev.months || []);
            if (nextMonths.has(monthKey)) {
                nextMonths.delete(monthKey);
            } else {
                nextMonths.add(monthKey);
            }
            return { ...prev, months: Array.from(nextMonths) };
        });
    };

    const loadNextPage = useCallback(() => {
        if (!canLoadMore || loadingMore || autoLoadMoreRef.current) return;
        autoLoadMoreRef.current = true;
        fetchData(selectedPath, {
            page: Number(data?.page || 1) + 1,
            search: searchTerm,
            append: true,
            ...serverSortParams,
            ...serverDateFilterParams,
        }).finally(() => {
            autoLoadMoreRef.current = false;
        });
    }, [canLoadMore, loadingMore, selectedPath, data?.page, searchTerm, serverSortParams, serverDateFilterParams, fetchData]);

    const revealNextMobileRows = useCallback(() => {
        setMobileVisibleLimit(prev => Math.min(totalRows, prev + MOBILE_RENDER_BATCH_SIZE));
    }, [totalRows]);

    const canRevealMoreMobileRows = isMobileTableMode && mobileVisibleLimit < totalRows;

    useEffect(() => {
        if (!isMobileTableMode || loading || loadingMore || (!canRevealMoreMobileRows && !canLoadMore)) return undefined;
        const handleWindowScroll = () => {
            const doc = document.documentElement;
            const remaining = doc.scrollHeight - window.scrollY - window.innerHeight;
            if (remaining < ROW_HEIGHT * 14) {
                if (canRevealMoreMobileRows) {
                    revealNextMobileRows();
                } else {
                    loadNextPage();
                }
            }
        };
        window.addEventListener('scroll', handleWindowScroll, { passive: true });
        handleWindowScroll();
        return () => window.removeEventListener('scroll', handleWindowScroll);
    }, [isMobileTableMode, loading, loadingMore, canRevealMoreMobileRows, canLoadMore, revealNextMobileRows, loadNextPage]);

    if (loading) return <div className={styles.loading}>데이터를 불러오는 중입니다...</div>;
    if (!data || !data.data) return <div className={styles.loading}>데이터가 없습니다.</div>;

    const fileTimeStr = data.file_modified_at ? new Date(data.file_modified_at).toLocaleString() : '';
    const dbSyncedTimeStr = data.synced_at ? new Date(data.synced_at).toLocaleString() : '';
    const searchPending = searchInput !== searchTerm;
    const hasSearchQuery = Boolean(searchInput.trim() || searchTerm.trim());
    const shouldShowSearchRefreshing = Boolean(showSearchRefreshing && hasSearchQuery);
    const searchStatusText = searchPending ? '입력 대기' : (shouldShowSearchRefreshing ? '검색 중' : '');
    const activeLookupRunning = Boolean(
        (activeLookupSession?.state === 'running' || activeLookupSession?.state === 'stopping')
        && !isLookupSessionStale(activeLookupSession)
    );

    const handleTableScroll = (e) => {
        if (isMobileTableMode) return;
        const target = e.currentTarget;
        setTableScrollTop(target.scrollTop);
        const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
        if (remaining < ROW_HEIGHT * 10) {
            loadNextPage();
        }
    };
    const virtualWindow = getShippingVirtualWindow({
        scrollTop: tableScrollTop,
        rowHeight: ROW_HEIGHT,
        viewportHeight: tableViewportHeight,
        totalRows,
        overscan: VIRTUAL_OVERSCAN,
    });
    const visibleStart = isMobileTableMode ? 0 : virtualWindow.visibleStart;
    const visibleEnd = isMobileTableMode ? Math.min(totalRows, mobileVisibleLimit) : virtualWindow.visibleEnd;
    const topSpacerHeight = isMobileTableMode ? 0 : virtualWindow.topSpacerHeight;
    const bottomSpacerHeight = isMobileTableMode ? 0 : virtualWindow.bottomSpacerHeight;
    const visibleRows = processedData.slice(visibleStart, visibleEnd);
    const tableIsRefreshing = Boolean(searchRefreshing || loadingMore || shouldLoadFullRowsForFilters);
    const canContinueList = canRevealMoreMobileRows || canLoadMore;
    const handleListMore = () => {
        if (canRevealMoreMobileRows) {
            revealNextMobileRows();
        } else {
            loadNextPage();
        }
    };

    // Extract unique values for the currently opened dropdown
    const getUniqueValues = (col) => {
        if (!data || !data.data) return [];
        
        // Filter rows based on OTHER column filters first (to cascade filters)
        let rows = [...data.data];
        if (data.source !== 'supabase' && searchTerm.trim()) {
            const terms = searchTerm.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            if (terms.length > 0) {
                rows = rows.filter(row => terms.some(t => row.some(cell => String(cell || '').toLowerCase().includes(t))));
            }
        }
        Object.entries(columnFilters).forEach(([c, selectedSet]) => {
            if (c !== col && selectedSet && selectedSet.size > 0) {
                rows = rows.filter(row => {
                    const cell = getFilterCellValue(row, c);
                    return selectedSet.has(cell);
                });
            }
        });

        const unique = new Set();
        rows.forEach(row => unique.add(getFilterCellValue(row, col)));
        return Array.from(unique).sort((a, b) => compareShippingFilterValues(a, b, 'asc'));
    };

    const toggleFilterValue = (col, val) => {
        setColumnFilters(prev => {
            const newFilters = { ...prev };
            const currentSet = newFilters[col] ? new Set(newFilters[col]) : new Set();
            if (currentSet.has(val)) {
                currentSet.delete(val);
            } else {
                currentSet.add(val);
            }
            if (currentSet.size === 0) {
                delete newFilters[col];
            } else {
                newFilters[col] = currentSet;
            }
            return newFilters;
        });
    };

    const selectAllFilter = (col, uniqueVals) => {
        setColumnFilters(prev => {
            const newFilters = { ...prev };
            newFilters[col] = new Set(uniqueVals);
            return newFilters;
        });
    };

    const clearFilter = (col) => {
        setColumnFilters(prev => {
            const newFilters = { ...prev };
            delete newFilters[col];
            return newFilters;
        });
    };

    return (
        <div className={styles.container} ref={containerRef} style={{ height: dynamicHeight }} onClick={() => setFilterDropdown(null)}>
            <div className={styles.topBar}>
                <div className={styles.topSummaryRow}>
                    <div className={styles.leftControls}>
                        <h2 className={styles.title}>선적관리 리스트</h2>
                        {fileTimeStr && (
                            <div className={styles.fileMod}>
                                저장: {fileTimeStr} <span className={styles.elapsedBadge}>{elapsed}</span>
                                {data.source === 'supabase' && (
                                    <span className={styles.dataMeta}>
                                        DB {loadedRows.toLocaleString()} / {serverTotalRowsLabel}행
                                    </span>
                                )}
                                {dbSyncedTimeStr && (
                                    <span className={styles.syncMeta}>
                                        DB수정 {dbSyncedTimeStr}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <div className={styles.rightControls}>
                    <div className={styles.searchRow}>
                        <input
                            type="text"
                            placeholder="전체 검색 (콤마 구분)"
                            className={styles.searchInput}
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            onCompositionStart={() => setIsComposingSearch(true)}
                            onCompositionEnd={e => {
                                setIsComposingSearch(false);
                                setSearchInput(e.currentTarget.value);
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') setSearchTerm(searchInput);
                            }}
                        />
                        <span className={`${styles.searchStatus} ${searchStatusText ? '' : styles.searchStatusHidden}`}>
                            {searchStatusText || '검색 중'}
                        </span>
                    </div>
                    <div className={styles.actionRow}>
                        <div className={styles.actionGroup}>
                            <button className={styles.resetBtn} onClick={() => savePreset(1)} title="현재 보이는 컬럼과 정렬 순서를 프리셋 1에 저장합니다">P1 저장</button>
                            <button className={styles.resetBtn} onClick={() => loadPreset(1)} title="프리셋 1을 불러옵니다">P1 로드</button>
                            <button className={styles.resetBtn} onClick={() => savePreset(2)} title="현재 보이는 컬럼과 정렬 순서를 프리셋 2에 저장합니다">P2 저장</button>
                            <button className={styles.resetBtn} onClick={() => loadPreset(2)} title="프리셋 2를 불러옵니다">P2 로드</button>
                            <button className={styles.resetBtn} onClick={exportToExcel}>엑셀</button>
                        </div>
                        <div className={`${styles.actionGroup} ${styles.primaryActions}`}>
                            <button className={styles.dangerBtn} onClick={resetLayout}>↺ 정렬 초기화</button>
                            <button className={styles.resetBtn} onClick={() => setShowSettings(true)}>설정</button>
                            <button className={styles.syncBtn} onClick={handleSync} disabled={syncing}>
                                {syncing ? '동기화 중' : 'NAS 동기화'}
                            </button>
                            <button
                                className={styles.lookupBtn}
                                onClick={handleContainerLookup}
                                disabled={containerLookupRunning || activeLookupRunning}
                                title={activeLookupRunning ? '이전 컨테이너 조회가 아직 진행 중입니다. 완료/실패 건수를 복원 중입니다.' : '현재 검색/필터 결과에 남아있는 컨테이너를 모두 이력조회합니다'}
                            >
                                {containerLookupRunning || activeLookupRunning ? '조회 중' : '컨테이너 조회'}
                            </button>
                            {(containerLookupRunning || activeLookupRunning) && (
                                <button
                                    className={styles.stopLookupBtn}
                                    onClick={handleStopContainerLookup}
                                    disabled={containerLookupStopping}
                                    title="현재 컨테이너 이력 조회를 중단하고 지금까지 받은 결과만 남깁니다"
                                >
                                    {containerLookupStopping ? '멈추는 중' : '조회 멈춤'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {containerLookupStatus && (
                <div className={styles.lookupStatus}>
                    {containerLookupProgress && (
                        <span className={styles.lookupStatusCounts}>
                            <span>컨테이너 조회건수 {containerLookupProgress.total.toLocaleString()}건</span>
                            <span>조회완료 {containerLookupProgress.completed.toLocaleString()}건</span>
                            <span className={containerLookupProgress.failed > 0 ? styles.lookupStatusFailed : ''}>
                                조회실패 {containerLookupProgress.failed.toLocaleString()}건
                            </span>
                            {containerLookupProgress.remaining > 0 && (
                                <span>
                                    미조회 {containerLookupProgress.remaining.toLocaleString()}건
                                </span>
                            )}
                        </span>
                    )}
                    <span className={styles.lookupStatusMessage}>{containerLookupStatus}</span>
                    {containerLookupErrorSummary?.message && (
                        <span
                            className={styles.lookupStatusErrorDetail}
                            title={containerLookupErrorSummary.samples?.join('\n') || containerLookupErrorSummary.message}
                        >
                            실패 사유: {containerLookupErrorSummary.message}
                        </span>
                    )}
                </div>
            )}

            <div
                className={`${styles.hiddenColsZone} ${isDragOverHidden ? styles.hiddenColsZoneActive : ''}`}
                title="숨긴 컬럼입니다. 칩을 클릭하거나 표로 드래그하면 다시 표시됩니다. 표 헤더를 이 영역으로 드래그하면 숨길 수 있습니다."
                aria-label="숨긴 컬럼 영역"
                onDragOver={(e) => { e.preventDefault(); setIsDragOverHidden(true); }}
                onDragLeave={() => setIsDragOverHidden(false)}
                onDrop={handleDropToHidden}
            >
                <span className={styles.hiddenColsHint}>
                    숨김
                </span>
                {hiddenColumnList.map(col => (
                    <button
                        key={col}
                        draggable
                        onDragStart={(e) => handleDragStart(e, col)}
                        onClick={() => handleRestoreCol(col)}
                        title={`표로 복구: ${col}`}
                        className={`${styles.hiddenChip} ${isContainerLookupColumn(col) ? styles.hiddenLookupChip : ''}`}
                    >
                        {getHiddenChipLabel(col)}
                    </button>
                ))}
            </div>

            {/* Date Month Filter */}
            {dateColumns.length > 0 && (
                <div className={styles.dateFilterZone}>
                    <span className={styles.dateFilterLabel}>날짜 필터</span>
                    <select
                        value={dateFilter.col}
                        onChange={e => setDateFilter(p => ({ ...p, col: e.target.value }))}
                        className={styles.dateSelect}
                    >
                        <option value="">컬럼 선택</option>
                        {dateColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div className={styles.monthFilterGroup} aria-label="조회 월 선택">
                        <button
                            type="button"
                            className={`${styles.monthFilterBtn} ${selectedMonthSet.size === 0 ? styles.monthFilterBtnActive : ''}`}
                            onClick={() => setDateFilter(prev => ({ ...prev, months: [] }))}
                            title="월 제한 없이 전체 데이터를 표시합니다"
                        >
                            전체
                        </button>
                        {recentMonthOptions.map(option => (
                            <button
                                key={option.key}
                                type="button"
                                className={`${styles.monthFilterBtn} ${selectedMonthSet.has(option.key) ? styles.monthFilterBtnActive : ''}`}
                                onClick={() => toggleMonthFilter(option.key)}
                                title={`${option.label} 자료를 조회 대상에 포함하거나 제외합니다`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <div className={styles.quickFilterGroup}>
                        <button
                            type="button"
                            className={`${styles.quickFilterBtn} ${unshippedOnly ? styles.quickFilterBtnActive : ''}`}
                            onClick={() => setUnshippedOnly(prev => !prev)}
                            title={unshippedOnly ? '미선적 필터 적용 중입니다. 클릭하면 필터를 해제합니다.' : '미선적 행만 표시합니다.'}
                        >
                            {unshippedOnly ? '필터해제' : '미선적'}
                        </button>
                        <button
                            type="button"
                            className={`${styles.quickFilterBtn} ${storageOnly ? styles.quickFilterBtnActive : ''}`}
                            onClick={() => setStorageOnly(prev => !prev)}
                            title={storageOnly ? '자체보관 필터 적용 중입니다. 클릭하면 필터를 해제합니다.' : '자체보관 행만 표시합니다.'}
                        >
                            {storageOnly ? '필터해제' : '자체보관'}
                        </button>
                        <button
                            type="button"
                            className={`${styles.quickFilterBtn} ${confirmedVesselOnly ? styles.quickFilterBtnActive : ''}`}
                            onClick={() => setConfirmedVesselOnly(prev => !prev)}
                            title={confirmedVesselOnly ? '확정모선 필터 적용 중입니다. 클릭하면 필터를 해제합니다.' : '확정모선 값이 있는 행만 표시합니다.'}
                        >
                            {confirmedVesselOnly ? '필터해제' : '확정모선'}
                        </button>
                    </div>
                    <span className={styles.resultCountText} title="현재 검색/필터 적용 후 화면 조회 건수">
                        전체 {serverTotalRowsLabel}건 / 조회 {totalRows.toLocaleString()}건
                    </span>
                </div>
            )}

            {/* Active Filter Badges */}
            {Object.keys(columnFilters).length > 0 && (
                <div className={styles.filterBadges}>
                    {Object.entries(columnFilters).map(([col, selectedSet]) => (
                        <span key={col} className={styles.filterBadge}>
                            {col}: {selectedSet.size}개 선택
                            <button onClick={() => clearFilter(col)}>✕</button>
                        </span>
                    ))}
                    <button className={styles.filterBadge} style={{ background: '#fee2e2', borderColor: '#fecaca', color: '#dc2626', cursor: 'pointer' }} onClick={() => setColumnFilters({})}>
                        전체 필터 초기화
                    </button>
                </div>
            )}

            <div
                className={styles.tableWrap}
                ref={tableWrapRef}
                onScroll={handleTableScroll}
            >
                <table className={styles.table}>
                    <thead>
                        <tr>
                            {orderedVisibleColumns.map(col => {
                                const isDragOver = dragOverCol === col;
                                return (
                                    <th 
                                        key={col}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, col)}
                                        onDragOver={(e) => handleDragOver(e, col)}
                                        onDrop={(e) => handleDrop(e, col)}
                                        className={`${isDragOver ? styles.dragOver : ''} ${isContainerLookupColumn(col) ? styles.lookupHeader : ''}`}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span onClick={() => handleSort(col)} style={{ cursor: 'pointer', flexGrow: 1, textAlign: 'center' }}>
                                                {col}
                                                {sortConfig.key === col && (
                                                    <span className={styles.sortIcon}>
                                                        {sortConfig.direction === 'asc' ? '▲' : '▼'}
                                                    </span>
                                                )}
                                            </span>
                                            <span 
                                                onClick={(e) => { e.stopPropagation(); setFilterDropdown(filterDropdown === col ? null : col); }}
                                                style={{ cursor: 'pointer', padding: '0 4px', color: columnFilters[col] ? '#3b82f6' : '#94a3b8' }}
                                            >
                                                ▼
                                            </span>
                                        </div>
                                        {filterDropdown === col && (
                                            <div 
                                                className={styles.dropdown} 
                                                onClick={e => e.stopPropagation()}
                                                style={{ position: 'absolute', top: '100%', left: orderedVisibleColumns.indexOf(col) < 2 ? 0 : 'auto', right: orderedVisibleColumns.indexOf(col) < 2 ? 'auto' : 0, zIndex: 100, background: 'white', border: '1px solid #cbd5e1', borderRadius: '4px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '8px', minWidth: '150px', maxHeight: '300px', display: 'flex', flexDirection: 'column' }}
                                            >
                                                <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                                                    <button onClick={() => selectAllFilter(col, getUniqueValues(col))} style={{ flex: 1, padding: '4px', fontSize: '0.8rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer' }}>전체 선택</button>
                                                    <button onClick={() => clearFilter(col)} style={{ flex: 1, padding: '4px', fontSize: '0.8rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer' }}>초기화</button>
                                                </div>
                                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                                    {getUniqueValues(col).map(val => (
                                                        <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '0.85rem', cursor: 'pointer' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={columnFilters[col]?.has(val) || false}
                                                                onChange={() => toggleFilterValue(col, val)}
                                                            />
                                                            {val || '(빈 값)'}
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {topSpacerHeight > 0 && (
                            <tr className={styles.virtualSpacer} aria-hidden="true">
                                <td colSpan={Math.max(orderedVisibleColumns.length, 1)} style={{ height: topSpacerHeight }} />
                            </tr>
                        )}
                        {visibleRows.map((row, vi) => {
                            const ri = visibleStart + vi;
                            const containerNo = getRowContainerNo(row);
                            const signalTone = getShippingSignalTone(data?.headers || [], row, containerLookupResults[containerNo]);
                            const rowToneClass = signalTone === 'completed' ? styles.completedRow : '';
                            return (
                            <tr key={ri} className={`${ri % 2 === 0 ? styles.evenRow : styles.oddRow} ${rowToneClass}`}>
                                {orderedVisibleColumns.map(col => {
                                    const raw = getDisplayCellRawValue(row, col);
                                    const val = formatCellValue(raw, col);
                                    return <td key={col} className={isContainerLookupColumn(col) ? styles.lookupCell : ''}>{val}</td>;
                                })}
                            </tr>
                            );
                        })}
                        {visibleRows.length === 0 && (
                            <tr>
                                <td className={styles.tableMessageCell} colSpan={Math.max(orderedVisibleColumns.length, 1)}>
                                    {tableIsRefreshing ? '데이터를 불러오는 중입니다...' : '조건에 맞는 자료가 없습니다.'}
                                </td>
                            </tr>
                        )}
                        {bottomSpacerHeight > 0 && (
                            <tr className={styles.virtualSpacer} aria-hidden="true">
                                <td colSpan={Math.max(orderedVisibleColumns.length, 1)} style={{ height: bottomSpacerHeight }} />
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {data.source === 'supabase' && (
                <div className={styles.pageBar}>
                    <span>{(isMobileTableMode ? visibleEnd : loadedRows).toLocaleString()} / {serverTotalRowsLabel}행</span>
                    <button
                        className={styles.loadMoreBtn}
                        onClick={handleListMore}
                        disabled={!canContinueList || loadingMore}
                    >
                        {loadingMore ? '불러오는 중' : canContinueList ? '더 보기' : '전체 로드됨'}
                    </button>
                </div>
            )}

            {/* 설정 모달 */}
            {showSettings && (
                <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowSettings(false); }}>
                    <div className={styles.modal}>
                        <h2>선적관리 파일 설정</h2>
                        <div className={styles.formGroup}>
                            <label>엑셀 파일 경로</label>
                            <div className={styles.pathRow}>
                                <input value={selectedPath} readOnly className={styles.pathInput} />
                                <button onClick={openBrowser} className={styles.browseBtn}>찾기</button>
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.checkboxRow}>
                                <input
                                    type="checkbox"
                                    checked={containerAutoLookupEnabled}
                                    disabled={containerAutoLookupSaving}
                                    onChange={e => handleContainerAutoLookupToggle(e.target.checked)}
                                />
                                <span>컨테이너 자동조회</span>
                            </label>
                            <div className={styles.settingHelp}>
                                컨테이너이력조회초기화 매일 03:00<br />
                                컨테이너 자동조회 03:10<br />
                                조건 모든 항목에서 &quot;적하&quot;외 컨테이너 조회<br />
                                실패시 중단
                            </div>
                            {containerAutoLookupStatus && (
                                <div className={styles.settingStatus}>{containerAutoLookupStatus}</div>
                            )}
                        </div>
                        <div className={styles.modalFooter}>
                            <button onClick={() => setShowSettings(false)} className={styles.saveBtn}>닫기</button>
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
                                {browserPath !== '/' && <div className={styles.browserItem} onClick={() => loadNasFolder(browserPath.split('/').slice(0, -1).join('/') || '/')}>상위 폴더</div>}
                                {browserFiles.map((f, i) => (
                                    <div key={i} className={styles.browserItem} onClick={() => selectFile(f)}>
                                        {f.type === 'directory' ? '[폴더]' : '[파일]'} {f.name}
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
