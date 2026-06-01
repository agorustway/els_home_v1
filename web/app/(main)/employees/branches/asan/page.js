'use client';
import dynamic from 'next/dynamic';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import styles from './dispatch.module.css';
import AsanDashboard from './AsanDashboard';
import { buildAsanDashboardScope, getActualDispatchQty } from '@/utils/asanDashboardView.mjs';
import {
    ASAN_DISPATCH_WEB_CELL_FIELDS,
    getDispatchWebCellFieldLabel,
    isDispatchWebCellField,
    normalizeDispatchWebCellFieldKey,
    validateDispatchWebCellValue,
} from '@/utils/asanDispatchWebCellFields.mjs';
import {
    DISPATCH_DETAIL_DG_HEADER,
    DISPATCH_DETAIL_HEADERS,
    DISPATCH_DETAIL_PORT_HEADER,
    DISPATCH_DETAIL_RF_HEADER,
    GLAPS_START_LOCATION_OPTIONS,
    buildDispatchDetailLines,
    detailLineToRow,
    normalizeDispatchDgValue,
    normalizeDispatchDetailRowValues,
    normalizeDispatchRfValue,
    summarizeDispatchDetailLines,
} from '@/utils/asanDispatchDetailLines.mjs';
import {
    DISPATCH_CHANGE_HEADERS,
    changeEventToEditableValues,
    formatDispatchChangeStatus,
    formatDispatchChangeType,
    getDispatchChangeDiffHeaders,
    getDispatchMemoOnlyDiffHeaders,
    makeDispatchMemoSignature,
    makeDispatchChangeSnapshotLine,
} from '@/utils/asanDispatchChangeEvents.mjs';
import {
    GLAPS_UPLOAD_HEADERS,
    GLAPS_UPLOAD_SHEET_NAME,
    buildGlapsUploadRowsFromDetailRows,
} from '@/utils/asanGlapsUploadExport.mjs';
import {
    buildGlapsRouteFingerprint,
    getGlapsRouteLocationCodeCandidates,
    getGlapsRouteShipperCode,
    getGlapsRouteWaypointCode,
    normalizeGlapsKey,
    splitGlapsAliasValues,
} from '@/utils/glapsMasterData.mjs';
import { createClient as createBrowserSupabaseClient } from '@/utils/supabase/client';

// ===== 상수 =====
const ASAN_MAIN_TAB_KEY = 'asan_main_tab';
const ASAN_PERFORMANCE_TAB_KEY = 'asan_performance_tab';
const ASAN_DISPATCH_RELOAD_STATE_KEY = 'asan_dispatch_reload_state';
const MAIN_TABS = ['dispatch', 'shipping', 'performance'];
const PERFORMANCE_TABS = ['summary-performance', 'monthly-performance', 'annual-performance', 'route-unit-price'];
const ASAN_DISPATCH_VIEW_TYPES = Object.freeze(['integrated', 'glovis', 'mobis']);
const ASAN_DISPATCH_MAIN_VIEWS = Object.freeze(['dashboard', 'grid', 'detail', 'detail-change', 'glaps-master']);
const DAILY_DISPLAY_LIMIT = Number.MAX_SAFE_INTEGER;

const loadAsanShipping = () => import('./AsanShipping');
const loadAsanGlapsMaster = () => import('./AsanGlapsMaster');
const loadAsanSummaryPerformance = () => import('./AsanSummaryPerformance');
const loadAsanMonthlyPerformance = () => import('./AsanMonthlyPerformance');
const loadAsanAnnualPerformance = () => import('./AsanAnnualPerformance');

function AsanModuleLoading() {
    return <div className={styles.emptyState}>데이터를 불러오는 중입니다...</div>;
}

const AsanShipping = dynamic(loadAsanShipping, { ssr: false, loading: AsanModuleLoading });
const AsanGlapsMaster = dynamic(loadAsanGlapsMaster, { ssr: false, loading: AsanModuleLoading });
const AsanSummaryPerformance = dynamic(loadAsanSummaryPerformance, { ssr: false, loading: AsanModuleLoading });
const AsanMonthlyPerformance = dynamic(loadAsanMonthlyPerformance, { ssr: false, loading: AsanModuleLoading });
const AsanAnnualPerformance = dynamic(loadAsanAnnualPerformance, { ssr: false, loading: AsanModuleLoading });

const ASAN_MAIN_TAB_LOADERS = {
    shipping: [loadAsanShipping],
    performance: [loadAsanSummaryPerformance, loadAsanMonthlyPerformance, loadAsanAnnualPerformance],
};

const ASAN_PERFORMANCE_TAB_LOADERS = {
    'summary-performance': [loadAsanSummaryPerformance],
    'monthly-performance': [loadAsanMonthlyPerformance],
    'annual-performance': [loadAsanAnnualPerformance],
    'route-unit-price': [loadAsanAnnualPerformance],
};

function prefetchAsanLoaders(loaders = []) {
    if (typeof window === 'undefined') return;
    loaders.forEach(loader => {
        try {
            loader().catch(() => { });
        } catch { /* ignore prefetch failures */ }
    });
}

function shouldAutoPrefetchAsanModules() {
    if (typeof window === 'undefined') return false;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData) return false;
    if (connection?.effectiveType && /(^|-)2g$/i.test(connection.effectiveType)) return false;
    return window.innerWidth >= 768;
}

function scheduleIdlePrefetch(callback, timeout = 1800, { force = false } = {}) {
    if (typeof window === 'undefined') return () => { };
    if (!force && !shouldAutoPrefetchAsanModules()) return () => { };
    if ('requestIdleCallback' in window) {
        const id = window.requestIdleCallback(callback, { timeout });
        return () => window.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(callback, Math.min(timeout, 900));
    return () => window.clearTimeout(timer);
}

// ===== 공휴일 계산기 (v4.4.40) =====
// 동적으로 공휴일/대체공휴일을 계산합니다. (하드코딩 지양)
function getHolidays(year) {
    const holidays = new Set();
    
    // 1. 고정 양력 공휴일
    const staticDays = ['01-01', '03-01', '05-05', '06-06', '08-15', '10-03', '10-09', '12-25'];
    staticDays.forEach(day => holidays.add(`${year}-${day}`));

    // 2. 음력 공휴일 (2025-2030 수동 매핑 - 한국 공식 관공서 공휴일 기준)
    const lunarMap = {
        2025: ['2025-01-28', '2025-01-29', '2025-01-30', '2025-05-05', '2025-10-05', '2025-10-06', '2025-10-07'],
        2026: ['2026-02-16', '2026-02-17', '2026-02-18', '2026-05-24', '2026-09-24', '2026-09-25', '2026-09-26'],
        2027: ['2027-02-05', '2027-02-06', '2027-02-07', '2027-05-13', '2027-09-14', '2027-09-15', '2027-09-16'],
        2028: ['2028-01-26', '2028-01-27', '2028-01-28', '2028-05-02', '2028-10-02', '2028-10-03', '2028-10-04'],
        2029: ['2029-02-12', '2029-02-13', '2029-02-14', '2029-05-20', '2029-09-21', '2029-09-22', '2029-09-23'],
        2030: ['2030-02-02', '2030-02-03', '2030-02-04', '2030-05-09', '2030-09-11', '2030-09-12', '2030-09-13']
    };
    (lunarMap[year] || []).forEach(d => holidays.add(d));

    // 3. 대체공휴일 처리 logic
    // 국경일(3.1, 8.15, 10.3, 10.9)이 토/일인 경우, 설/추석이 일요일인 경우, 어린이날/부처님오신날이 토/일인 경우 발생
    const checkAlt = (dateStr) => {
        const d = new Date(dateStr + 'T00:00:00');
        const day = d.getDay();
        if (day === 0) return true; // 일요일
        if (day === 6) {
            // 토요일 대체공휴일은 어린이날, 부처님오신날, 국경일 4종에만 적용됨
            const mmdd = dateStr.slice(5);
            return ['05-05', '05-24', '03-01', '08-15', '10-03', '10-09'].includes(mmdd);
        }
        return false;
    };

    // 대체공휴일 계산 (단순화된 규칙: 공휴일이 주말과 겹치면 다음 첫 번째 평일을 공휴일로 지정)
    const currentHolidays = Array.from(holidays);
    currentHolidays.forEach(h => {
        const d = new Date(h + 'T00:00:00');
        if (d.getDay() === 0 || d.getDay() === 6) {
            let next = new Date(d);
            while (true) {
                next.setDate(next.getDate() + 1);
                const nextStr = next.toISOString().split('T')[0];
                if (next.getDay() !== 0 && next.getDay() !== 6 && !holidays.has(nextStr)) {
                    holidays.add(nextStr);
                    break;
                }
            }
        }
    });

    return holidays;
}

const GLOBAL_HOLIDAYS_CACHE = {};
function isHoliday(dateStr) {
    const year = dateStr.split('-')[0];
    if (!GLOBAL_HOLIDAYS_CACHE[year]) GLOBAL_HOLIDAYS_CACHE[year] = getHolidays(year);
    return GLOBAL_HOLIDAYS_CACHE[year].has(dateStr);
}
const CENTER_HEADERS = new Set(['오더', '배차', '검증', '계', '수량', '추가', 'T', 'TYPE', '오더(계)', '담당자']);
const BRANCH_NAMES = ['아산', '부산', '광양', '평택', '중부', '부곡', '인천'];
const PREFS_KEY = 'asan_dispatch_prefs';
const QUICK_DATE_TAB_LIMIT = 7;
const DETAIL_START_LOCATION_DATALIST_ID = 'asan-detail-start-location-options';
const DETAIL_START_OVERRIDE_FIELD_KEY = 'start_location';
const DETAIL_PORT_OVERRIDE_FIELD_KEY = 'glaps_port_code';
const DETAIL_DG_OVERRIDE_FIELD_KEY = 'dg';
const DETAIL_RF_OVERRIDE_FIELD_KEY = 'rf';
const DETAIL_LEGACY_DG_RF_OVERRIDE_FIELD_KEY = 'dg_rf';
const DETAIL_MANUAL_START_REGIONS = new Set(['기타/철송', '기타', '아산', '중부']);
const BKG_CONFIRM_SOURCE_OPTIONS = Object.freeze(['BKG1', 'BKG2', 'BKG3']);
const DETAIL_SOURCE_MEMO_HEADERS = Object.freeze(['BKG1', 'BKG2', 'BKG3', 'TARGET VESSEL', '비고']);
const GLAPS_SPECIAL_RULE_TYPES = Object.freeze({
    CONSIGNEE: 'consignee',
    SHIPPER_CODE: 'shipper_code',
    START_LOCATION: 'start_location',
});
const BKG_WEB_CELL_LOCK_FIELDS = new Set([
    ASAN_DISPATCH_WEB_CELL_FIELDS.BKG1,
    ASAN_DISPATCH_WEB_CELL_FIELDS.BKG2,
    ASAN_DISPATCH_WEB_CELL_FIELDS.BKG3,
]);
const ALWAYS_EDITABLE_WEB_CELL_FIELDS = new Set([
    ASAN_DISPATCH_WEB_CELL_FIELDS.TARGET_VESSEL,
    ASAN_DISPATCH_WEB_CELL_FIELDS.NOTE,
]);
const DETAIL_CHANGE_STATUS_FILTERS = Object.freeze([
    { key: '', label: '전체' },
    { key: 'pending', label: '미확인' },
    { key: 'confirmed', label: '확인완료' },
]);
const DETAIL_CHANGE_COMPANY_COL = DISPATCH_DETAIL_HEADERS.indexOf('업체명');
const DETAIL_CHANGE_BKG_COL = DISPATCH_DETAIL_HEADERS.indexOf('BKG확정');
const DETAIL_HEADER_INDEX = Object.freeze(
    DISPATCH_DETAIL_HEADERS.reduce((acc, header, idx) => ({ ...acc, [header]: idx }), {}),
);
const DETAIL_ISSUE_FILTERS = Object.freeze([
    { key: 'start', label: '상차지', clearLabel: '상차지', countKey: 'manualStartLocationCount', group: 'manual' },
    { key: 'route', label: '운송경로', clearLabel: '운송경로', countKey: 'routeMissingCount', group: 'missing' },
    { key: 'orderType', label: '오더구분', clearLabel: '오더구분', countKey: 'orderTypeMissingCount', group: 'missing' },
    { key: 'shipper', label: '화주사코드', clearLabel: '화주사코드', countKey: 'shipperCodeMissingCount', group: 'missing' },
    { key: 'routePart', label: '경로세부', clearLabel: '경로세부', countKey: 'routePartMissingCount', group: 'missing' },
    { key: 'port', label: '포트코드', clearLabel: '포트코드', countKey: 'portMissingCount', group: 'missing' },
    { key: 'line', label: '라인코드', clearLabel: '라인코드', countKey: 'lineMissingCount', group: 'missing' },
    { key: 'type', label: '타입코드', clearLabel: '타입코드', countKey: 'typeMissingCount', group: 'missing' },
    { key: 'consignee', label: '컨샤이니', clearLabel: '컨샤이니', countKey: 'consigneeMissingCount', group: 'missing' },
    { key: 'carrier', label: '운송사코드', clearLabel: '운송사코드', countKey: 'carrierMissingCount', group: 'check' },
    { key: 'modified', label: '수정', clearLabel: '수정', countKey: 'modifiedCount', group: 'modified' },
]);
const DETAIL_ISSUE_GROUPS = Object.freeze([
    { key: 'manual', label: '입력', filters: DETAIL_ISSUE_FILTERS.filter(filter => filter.group === 'manual') },
    { key: 'missing', label: '미도출', filters: DETAIL_ISSUE_FILTERS.filter(filter => filter.group === 'missing') },
    { key: 'check', label: '확인', filters: DETAIL_ISSUE_FILTERS.filter(filter => filter.group === 'check') },
    { key: 'modified', label: '수정', filters: DETAIL_ISSUE_FILTERS.filter(filter => filter.group === 'modified') },
]);
const GLAPS_TRANSPORT_SERVICE_FALLBACKS = Object.freeze([
    { code: '311101', name: '각강_내수(반품)', aliases: ['각강_내수(반품)', '각강 내수 반품', '반품'] },
    { code: '5010002', name: '컨테이너_수출(보관)', aliases: ['컨테이너_수출(보관)', '컨테이너 수출 보관', '수출보관', '수출 보관'] },
    { code: '5010001', name: '컨테이너_수출', aliases: ['컨테이너_수출', '컨테이너 수출', '수출', 'EXPORT'] },
    { code: '5020002', name: '컨테이너_수입(보관)', aliases: ['컨테이너_수입(보관)', '컨테이너 수입 보관', '수입보관', '수입 보관'] },
    { code: '5020001', name: '컨테이너_수입', aliases: ['컨테이너_수입', '컨테이너 수입', '수입', 'IMPORT'] },
    { code: '6032001', name: '일반_내수_석회석', aliases: ['일반_내수_석회석', '일반 내수 석회석', '내수', '석회석'] },
]);

// ===== 헬퍼 =====
function getTabType(dateStr) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    const holidayCheck = isHoliday(dateStr);
    
    // [v4.4.40] 토요일은 더이상 공휴일(Red)이 아님. 사용자의 요청(평일로 변경)에 따라 일반 평일로 처리함.
    const isRed = day === 0 || holidayCheck;

    if (dateStr === today) return 'today';
    if (dateStr < today) {
        if (isRed) return 'past_holiday';
        if (day === 6) return 'past_saturday';
        return 'past';
    }
    if (isRed) return 'holiday';
    if (day === 6) return 'saturday';
    return 'future';
}
function formatTabLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return { mm: d.getMonth() + 1, dd: d.getDate(), day: ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] };
}
function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function getWeekFilterRange(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    if (Number.isNaN(date.getTime())) return null;
    const day = date.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(date);
    start.setDate(date.getDate() + mondayOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const toKey = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    const weekOfMonthLabel = (value) => {
        const first = new Date(value.getFullYear(), value.getMonth(), 1);
        const firstDay = first.getDay();
        const firstMondayOffset = firstDay === 0 ? -6 : 1 - firstDay;
        const firstWeekMonday = new Date(first);
        firstWeekMonday.setDate(first.getDate() + firstMondayOffset);
        const valueDay = value.getDay();
        const mondayOffset = valueDay === 0 ? -6 : 1 - valueDay;
        const weekMonday = new Date(value);
        weekMonday.setDate(value.getDate() + mondayOffset);
        const weekNo = Math.floor(Math.round((weekMonday - firstWeekMonday) / 86400000) / 7) + 1;
        return `${String(value.getMonth() + 1).padStart(2, '0')}월 ${weekNo}주차`;
    };
    const weekLabel = weekOfMonthLabel(end);
    const shortWeekLabel = weekLabel.replace(/^0?(\d+)월\s+(\d+)주차$/, '$1월 $2주');
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const label = `${start.getMonth() + 1}/${start.getDate()}(${days[start.getDay()]})~${end.getMonth() + 1}/${end.getDate()}(${days[end.getDay()]})`;
    return {
        key: `${toKey(start)}_${toKey(end)}`,
        start: toKey(start),
        end: toKey(end),
        label,
        shortLabel: shortWeekLabel,
        fullLabel: `${label} (${weekLabel})`,
    };
}
function findWeekOptionByDate(weeks = [], dateStr = '') {
    return weeks.find(week => dateStr >= week.start && dateStr <= week.end) || null;
}
function findCol(headers, name) { return headers.findIndex(h => h.trim() === name); }
function findAnyCol(headers, names = []) {
    for (const name of names) {
        const idx = findCol(headers, name);
        if (idx >= 0) return idx;
    }
    return -1;
}
function parseQty(value) {
    const match = String(value ?? '').replace(/,/g, '').trim().match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) || 0 : 0;
}
function parseOrderQty(value) {
    const text = String(value ?? '').replace(/,/g, '').trim();
    if (!/^-?\d+(?:\.\d+)?$/.test(text)) return 0;
    return Number(text) || 0;
}
function roundQty(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
function roundMapQty(map) {
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, roundQty(v)]));
}
function getEffectiveDispatchQty(headers, row) {
    return getActualDispatchQty(row, headers, row[findCol(headers, '배차')]);
}
function fmtTs(dt) {
    if (!dt) return '';
    const t = new Date(dt);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
}
function fmtShortTs(dt) {
    if (!dt) return '';
    const t = new Date(dt);
    if (Number.isNaN(t.getTime())) return '';
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}
function isTimestampAfter(value, baseline) {
    if (!value || !baseline) return false;
    const valueTime = new Date(value).getTime();
    const baselineTime = new Date(baseline).getTime();
    return Number.isFinite(valueTime) && Number.isFinite(baselineTime) && valueTime > baselineTime;
}
function actorDisplayName(value = '', fallback = '') {
    const text = String(value || fallback || '').trim();
    if (!text) return '';
    if (text.includes('@')) return text.split('@')[0] || text;
    return text;
}
function confirmationActorName(confirmation = {}, field = 'confirmed_by') {
    return actorDisplayName(confirmation?.[`${field}_name`], confirmation?.[field]);
}
function syncStatusPrefix(status = {}) {
    if (status?.isError) return '오류';
    const message = String(status?.message || '');
    if (/(진행 중|요청 중|확인 중|저장 중|처리 중|불러오는 중|동기화 중)/.test(message)) return '진행';
    return '완료';
}
function dispatchConfirmationMapKey(targetDate = '', dispatchType = '') {
    return `${targetDate || ''}:${dispatchType || ''}`;
}
function hasActiveDispatchConfirmationForWebCell(meta = {}, confirmationMap = {}) {
    const targetDate = meta?.targetDate || '';
    const sourceType = meta?.sourceType || '';
    return Boolean(
        confirmationMap[dispatchConfirmationMapKey(targetDate, 'integrated')]?.active
        || confirmationMap[dispatchConfirmationMapKey(targetDate, sourceType)]?.active
    );
}
function getWebCellLockMessage(meta = {}, fieldKey = '', value = '', confirmationMap = {}) {
    const normalizedField = normalizeDispatchWebCellFieldKey(fieldKey);
    if (!BKG_WEB_CELL_LOCK_FIELDS.has(normalizedField)) return '';
    if (ALWAYS_EDITABLE_WEB_CELL_FIELDS.has(normalizedField)) return '';
    if (!String(value ?? '').trim()) return '';
    if (!hasActiveDispatchConfirmationForWebCell(meta, confirmationMap)) return '';
    return '배차확정 이후 기존 BKG 값은 잠금됩니다. 빈 BKG2/3 칸만 추가 입력할 수 있습니다.';
}
function snapshotRowValues(snapshot = {}) {
    return snapshot?.rowValues || snapshot?.row_values?.values || snapshot?.row_values || [];
}
function changeTooltipValue(value = '') {
    const text = String(value ?? '').trim();
    return text || '(공란)';
}
function buildDispatchChangeDiffTooltip(event = {}) {
    const label = formatDispatchChangeType(event.change_type);
    if (event.change_type === 'add') return `${label}\n확정 이후 추가된 상세라인입니다.`;
    if (event.change_type === 'delete') return `${label}\n확정 이후 삭제된 상세라인입니다.`;
    const beforeValues = snapshotRowValues(event.before_snapshot);
    const afterValues = snapshotRowValues(event.after_snapshot || event.editable_payload);
    const beforeContext = event.before_snapshot?.rowContext || {};
    const afterContext = (event.after_snapshot || event.editable_payload)?.rowContext || {};
    const changed = getDispatchChangeDiffHeaders(beforeValues, afterValues, beforeContext, afterContext)
        .map((header) => {
            if (header === 'transportRemark') {
                return `특이사항(Nomi,구간): ${changeTooltipValue(beforeContext.transportRemark)} -> ${changeTooltipValue(afterContext.transportRemark)}`;
            }
            const idx = DISPATCH_DETAIL_HEADERS.indexOf(header);
            const beforeValue = String(beforeValues[idx] ?? '').trim();
            const afterValue = String(afterValues[idx] ?? '').trim();
            return `${header}: ${changeTooltipValue(beforeValue)} -> ${changeTooltipValue(afterValue)}`;
        });
    return changed.length > 0 ? `${label}\n${changed.join('\n')}` : label;
}
function getDispatchChangedHeaderSet(event = {}) {
    if (event.change_type !== 'change') return new Set();
    const beforeValues = snapshotRowValues(event.before_snapshot);
    const afterValues = snapshotRowValues(event.after_snapshot || event.editable_payload);
    const beforeContext = event.before_snapshot?.rowContext || {};
    const afterContext = (event.after_snapshot || event.editable_payload)?.rowContext || {};
    return new Set(getDispatchChangeDiffHeaders(beforeValues, afterValues, beforeContext, afterContext));
}
function getDisplayChangedHeaderSet(event = {}) {
    return getDispatchChangedHeaderSet(event);
}
function makeDownloadDatePart({ isAllTab, activeItem, allTabMonth, allTabWeek }) {
    if (!isAllTab) return activeItem?.target_date || '';
    if (allTabWeek?.start && allTabWeek?.end) return `${allTabWeek.start}_${allTabWeek.end}`;
    if (allTabMonth) return `${Number(allTabMonth)}월`;
    return '전체';
}
function getDownloadFileName(response, fallback) {
    const disposition = response.headers.get('Content-Disposition') || '';
    const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (encodedMatch?.[1]) {
        try {
            return decodeURIComponent(encodedMatch[1]);
        } catch {
            return fallback;
        }
    }
    return fallback;
}
function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function calcSummary(headers, data, viewType) {
    if (!headers || !data || data.length === 0) return null;
    if (viewType === 'glovis') {
        const oC = findCol(headers, '오더'), tC = findAnyCol(headers, ['TYPE', 'T']), gC = findCol(headers, '구분');
        let order = 0, disp = 0, ft40 = 0, ft20 = 0;
        const cats = {};
        data.forEach(row => {
            const o = parseOrderQty(row[oC]); if (o <= 0) return; order += o;
            const g = String(row[gC] || '').trim(); if (g) cats[g] = (cats[g] || 0) + o;
            disp += getEffectiveDispatchQty(headers, row);
            const t = parseInt(row[tC]) || 0;
            if (t === 40) ft40 += o; else if (t === 20) ft20 += o;
        });
        return { order: roundQty(order), cats: roundMapQty(cats), disp: roundQty(disp), unmatch: roundQty(order - disp), ft40: roundQty(ft40), ft20: roundQty(ft20) };
    } else if (viewType === 'mobis') {
        const qC = findCol(headers, '계') >= 0 ? findCol(headers, '계') : findCol(headers, '수량');
        const gC = findCol(headers, '구분'), tC = findCol(headers, 'TYPE');
        let order = 0, disp = 0, ft40 = 0, ft20 = 0;
        const cats = {};
        data.forEach(row => {
            const o = parseOrderQty(row[qC]); if (o <= 0) return; order += o;
            const g = String(row[gC] || '').trim(); if (g) cats[g] = (cats[g] || 0) + o;
            disp += getEffectiveDispatchQty(headers, row);
            const t = parseInt(row[tC]) || 0;
            if (t === 40) ft40 += o; else if (t === 20) ft20 += o;
        });
        return { order: roundQty(order), cats: roundMapQty(cats), disp: roundQty(disp), unmatch: roundQty(order - disp), ft40: roundQty(ft40), ft20: roundQty(ft20) };
    } else {
        // integrated
        const oC = findCol(headers, '오더(계)'), tC = findCol(headers, 'TYPE'), gC = findCol(headers, '구분');
        let order = 0, disp = 0, ft40 = 0, ft20 = 0;
        const cats = {};
        data.forEach(row => {
            const o = parseOrderQty(row[oC]); if (o <= 0) return; order += o;
            const g = String(row[gC] || '').trim(); if (g) cats[g] = (cats[g] || 0) + o;
            disp += getEffectiveDispatchQty(headers, row);
            const t = parseInt(row[tC]) || 0;
            if (t === 40) ft40 += o; else if (t === 20) ft20 += o;
        });
        return { order: roundQty(order), cats: roundMapQty(cats), disp: roundQty(disp), unmatch: roundQty(order - disp), ft40: roundQty(ft40), ft20: roundQty(ft20) };
    }
}
function hasValidOrderRows(item, viewType) {
    const explicitCount = Number(item?.valid_row_count ?? item?.validRowCount ?? item?.row_count);
    if ((!Array.isArray(item?.data) || item.data.length === 0) && Number.isFinite(explicitCount)) return explicitCount > 0;
    if (!Array.isArray(item?.data) || item.data.length === 0) return false;
    const summaryOrder = calcSummary(item.headers || [], item.data || [], viewType)?.order || 0;
    if (summaryOrder <= 0) return false;
    const dashboardScope = buildAsanDashboardScope({
        rows: item.data || [],
        headers: item.headers || [],
        viewType,
        viewMode: 'customer',
    });
    return (dashboardScope?.total || 0) > 0;
}
function findDefaultValidTabIndex(items = [], viewType, today = getTodayKey()) {
    const hasRows = (item) => hasValidOrderRows(item, viewType);
    let ti = items.findIndex(item => item.target_date === today && hasRows(item));

    if (ti === -1) {
        const nextDataIdx = items.findIndex(item => item.target_date >= today && hasRows(item));
        if (nextDataIdx !== -1) ti = nextDataIdx;
    }

    if (ti === -1) {
        for (let i = items.length - 1; i >= 0; i -= 1) {
            if (hasRows(items[i])) {
                ti = i;
                break;
            }
        }
    }

    return ti;
}
function mergeDispatchDateItems(baseItems = [], loadedItems = []) {
    if (!Array.isArray(loadedItems) || loadedItems.length === 0) return baseItems;
    const loadedByDate = new Map(loadedItems.map(item => [item.target_date, item]));
    const merged = (baseItems || []).map(item => loadedByDate.get(item.target_date) || item);
    loadedItems.forEach((item) => {
        if (!merged.some(existing => existing.target_date === item.target_date)) merged.push(item);
    });
    return merged.sort((a, b) => String(a.target_date || '').localeCompare(String(b.target_date || '')));
}
function pickDispatchActiveIndex(items = [], viewType, preferredTargetDate = '', today = getTodayKey()) {
    if (preferredTargetDate === '__all__') return items.length;
    if (preferredTargetDate) {
        const nextIndex = items.findIndex(item => item.target_date === preferredTargetDate);
        if (nextIndex >= 0) return nextIndex;
    }
    return findDefaultValidTabIndex(items, viewType, today);
}
function makeDispatchDataUrl(type, params = {}) {
    const searchParams = new URLSearchParams({
        type,
        t: String(Date.now()),
    });
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') searchParams.set(key, String(value));
    });
    return `/api/branches/asan/dispatch?${searchParams.toString()}`;
}
function doSearch(data, headers, term) {
    if (!term || !data) return { indices: null, summary: '' };
    const terms = term.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (terms.length === 0) return { indices: null, summary: '' };

    const branchCols = [];
    headers.forEach((h, i) => { if (BRANCH_NAMES.includes(h.trim())) branchCols.push({ i, name: h.trim() }); });
    
    let orderColIdx = findCol(headers, '계');
    if (orderColIdx === -1) orderColIdx = findCol(headers, '수량');
    if (orderColIdx === -1) orderColIdx = findCol(headers, '오더(계)');
    if (orderColIdx === -1) orderColIdx = findCol(headers, '오더');

    const indices = []; 
    let totalOrderCount = 0;
    const breakdown = {}; let totalBranchExtracted = 0;

    data.forEach((row, ri) => {
        const matchedTerms = terms.filter(t => row.some(c => c && String(c).toLowerCase().includes(t)));
        if (matchedTerms.length === 0) return;
        
        indices.push(row.origIdx ?? ri);

        if (orderColIdx !== -1) {
            const val = parseOrderQty(row[orderColIdx]);
            if (!isNaN(val)) totalOrderCount += val;
        }

        branchCols.forEach(({ i, name }) => {
            const cell = String(row[i] || '').toLowerCase();
            matchedTerms.forEach(t => {
                if (cell.includes(t)) {
                    const escapedT = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(escapedT + '[^가-힣a-zA-Z\\d]*(\\d+(?:\\.\\d+)?)', 'g');
                    let cellTotal = 0;
                    let match;
                    while ((match = regex.exec(cell)) !== null) {
                        cellTotal += parseQty(match[1]);
                    }
                    if (cellTotal === 0) cellTotal = 1;
                    
                    totalBranchExtracted += cellTotal; 
                    breakdown[name] = (breakdown[name] || 0) + cellTotal; 
                }
            });
        });
    });

    if (indices.length === 0) return { indices, summary: `"${term}" 검색 결과 없음` };
    
    const parts = Object.entries(breakdown).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(', ');
    
    return { indices, summary: `"${term}" 오더 ${totalOrderCount}대${parts ? ` (${parts})` : ''}`, total: totalOrderCount };
}

// localStorage
function loadPrefs(vt) {
    try { const s = localStorage.getItem(`${PREFS_KEY}_${vt}`); return s ? JSON.parse(s) : {}; } catch { return {}; }
}
function savePrefs(vt, p) {
    try { localStorage.setItem(`${PREFS_KEY}_${vt}`, JSON.stringify(p)); } catch { }
}
function makeWebCellClientKey(meta, fieldKey) {
    if (!meta?.rowSignature || !fieldKey) return '';
    return [meta.sourceType, meta.targetDate, meta.rowSignature, fieldKey].join('|');
}
function makeDispatchDetailLineKey(line) {
    return [
        line?.sourceRowIndex ?? '',
        line?.sourceRegionColumn ?? '',
        line?.sourceText ?? '',
        line?.sourceUnitIndex ?? '',
        line?.company ?? '',
        line?.startSuffix ?? '',
        line?.lineNo ?? '',
    ].join('|');
}
function getDetailBkgValue(line, source) {
    if (source === 'BKG2') return line?.bkg2 || '';
    if (source === 'BKG3') return line?.bkg3 || '';
    return line?.bkg1 || '';
}
function formatGlapsPortOptionLabel(option = {}) {
    const code = option.code || '';
    const defaultMark = option.isDefault ? ' (기본)' : '';
    return code ? `${code}${defaultMark}` : option.label || '';
}
function detailColumnClass(header) {
    return header === '상차지' ? styles.detailStartColumn : '';
}
function getDetailRowValue(values = [], header) {
    const idx = DETAIL_HEADER_INDEX[header];
    const normalized = normalizeDispatchDetailRowValues(values);
    return idx >= 0 ? String(normalized[idx] ?? '').trim() : '';
}
function getConfirmationSnapshotValues(snapshot = {}) {
    return snapshot?.rowValues
        || snapshot?.row_values?.values
        || snapshot?.row_values
        || [];
}
function getConfirmationSnapshotLineKey(snapshot = {}) {
    return snapshot?.detailLineKey || snapshot?.detail_line_key || '';
}
function getDetailMemoDiffSet(beforeValues = [], afterValues = []) {
    if (!Array.isArray(beforeValues) || beforeValues.length === 0) return new Set();
    return new Set(getDispatchMemoOnlyDiffHeaders(beforeValues, afterValues));
}
function isDetailMemoHeaderHighlighted(line = {}, header = '') {
    if (!DETAIL_SOURCE_MEMO_HEADERS.includes(header)) return false;
    const diffHeaders = new Set(line.memoDiffHeaders || []);
    if (!diffHeaders.has(header)) return false;
    if (BKG_CONFIRM_SOURCE_OPTIONS.includes(header)) {
        const bkgValue = getDetailBkgValue(line, header);
        return Boolean(bkgValue !== (line.confirmedBkg || ''));
    }
    return true;
}
function getDetailMemoCellClass(line = {}, header = '') {
    if (!isDetailMemoHeaderHighlighted(line, header)) return '';
    return BKG_CONFIRM_SOURCE_OPTIONS.includes(header)
        ? styles.detailBkgMemoDiffCell
        : styles.detailMemoDiffCell;
}
function isDetailBkgConfirmStale(line = {}) {
    const source = line.confirmedBkgSource || '';
    if (!BKG_CONFIRM_SOURCE_OPTIONS.includes(source)) return false;
    return getDetailBkgValue(line, source) !== (line.confirmedBkg || '');
}
function buildDetailMemoTooltip(line = {}, header = '') {
    const beforeValues = line.memoBaseValues || [];
    if (!beforeValues.length || !DETAIL_SOURCE_MEMO_HEADERS.includes(header)) return '';
    const beforeValue = getDetailRowValue(beforeValues, header) || '(빈값)';
    const afterValue = header === 'BKG확정'
        ? line.confirmedBkg || '(빈값)'
        : getDetailRowValue(detailLineToRow(line), header) || '(빈값)';
    return `${header} 변경 감지\n변경전: ${beforeValue}\n현재: ${afterValue}`;
}
function getDetailPortRowValue(values = []) {
    return getDetailRowValue(values, DISPATCH_DETAIL_PORT_HEADER) || getDetailRowValue(values, '포트');
}
function setDetailRowValue(values = [], header, value) {
    const idx = DETAIL_HEADER_INDEX[header];
    const next = normalizeDispatchDetailRowValues(values);
    if (idx >= 0) next[idx] = String(value ?? '').trim();
    return next;
}
function canEditDetailStartLocation(line = {}) {
    const region = line.startRegion || line.sourceRegion || '';
    return !line.startLocation || DETAIL_MANUAL_START_REGIONS.has(region);
}
function inferBkgSourceFromDetailValues(values = []) {
    const confirmed = getDetailRowValue(values, 'BKG확정');
    if (confirmed && confirmed === getDetailRowValue(values, 'BKG2')) return 'BKG2';
    if (confirmed && confirmed === getDetailRowValue(values, 'BKG3')) return 'BKG3';
    if (confirmed && confirmed === getDetailRowValue(values, 'BKG1')) return 'BKG1';
    return confirmed ? 'manual' : 'BKG1';
}
function getChangeEventPayloadContext(event = {}) {
    return event.editable_payload?.rowContext
        || event.editablePayload?.rowContext
        || event.after_snapshot?.rowContext
        || event.afterSnapshot?.rowContext
        || event.before_snapshot?.rowContext
        || event.beforeSnapshot?.rowContext
        || {};
}
function detailLineFromChangeValues(values = [], event = {}, options = {}) {
    const context = getChangeEventPayloadContext(event);
    const confirmedBkg = getDetailRowValue(values, 'BKG확정') || context.confirmedBkg || getDetailRowValue(values, 'BKG1');
    return {
        lineNo: context.lineNo || null,
        workDate: getDetailRowValue(values, '작업일자') || context.workDate || '',
        direction: getDetailRowValue(values, '구분') || context.direction || '',
        shipper: getDetailRowValue(values, '화주') || context.shipper || '',
        startRegion: context.startRegion || context.sourceRegion || '',
        startLocation: getDetailRowValue(values, '상차지') || context.startLocation || '',
        workplace: getDetailRowValue(values, '작업지') || context.workplace || '',
        destination: getDetailRowValue(values, '하차지(선적)') || context.destination || '',
        customer: getDetailRowValue(values, '고객사') || context.customer || '',
        port: getDetailPortRowValue(values) || context.port || '',
        transportRemark: context.transportRemark || '',
        glapsPortCodeOverride: options.portCodeOverride || context.glapsPortCodeOverride || '',
        line: getDetailRowValue(values, '라인') || context.line || '',
        containerType: getDetailRowValue(values, '타입') || context.containerType || '',
        dgFlag: normalizeDispatchDgValue(getDetailRowValue(values, DISPATCH_DETAIL_DG_HEADER) || context.dgFlag),
        rfFlag: normalizeDispatchRfValue(getDetailRowValue(values, DISPATCH_DETAIL_RF_HEADER) || context.rfFlag || context.dgRfFlag, getDetailRowValue(values, '타입') || context.containerType || ''),
        company: getDetailRowValue(values, '업체명') || context.company || '',
        dispatchTime: getDetailRowValue(values, '시간') || context.dispatchTime || '',
        confirmedBkg,
        confirmedBkgSource: inferBkgSourceFromDetailValues(values),
        bkg1: getDetailRowValue(values, 'BKG1') || context.bkg1 || '',
        bkg2: getDetailRowValue(values, 'BKG2') || context.bkg2 || '',
        bkg3: getDetailRowValue(values, 'BKG3') || context.bkg3 || '',
        targetVessel: getDetailRowValue(values, 'TARGET VESSEL') || context.targetVessel || '',
        note: getDetailRowValue(values, '비고') || context.note || '',
        detailUpdatedAt: getDetailRowValue(values, '수정일시'),
        sourceRowIndex: context.sourceRowIndex ?? null,
        sourceRegion: context.sourceRegion || '',
        sourceText: context.sourceText || '',
        sourceUnitIndex: context.sourceUnitIndex || null,
        rawCompany: context.rawCompany || getDetailRowValue(values, '업체명') || '',
        startSuffix: context.startSuffix || '',
    };
}
function buildDetailChangeRowContext(rowValues = [], baseContext = {}) {
    return {
        ...baseContext,
        workDate: getDetailRowValue(rowValues, '작업일자'),
        direction: getDetailRowValue(rowValues, '구분'),
        shipper: getDetailRowValue(rowValues, '화주'),
        startRegion: baseContext.startRegion || baseContext.sourceRegion || '',
        startLocation: getDetailRowValue(rowValues, '상차지'),
        workplace: getDetailRowValue(rowValues, '작업지'),
        destination: getDetailRowValue(rowValues, '하차지(선적)'),
        customer: getDetailRowValue(rowValues, '고객사'),
        port: getDetailPortRowValue(rowValues),
        transportRemark: baseContext.transportRemark || '',
        line: getDetailRowValue(rowValues, '라인'),
        containerType: getDetailRowValue(rowValues, '타입'),
        dgFlag: normalizeDispatchDgValue(getDetailRowValue(rowValues, DISPATCH_DETAIL_DG_HEADER)),
        rfFlag: normalizeDispatchRfValue(getDetailRowValue(rowValues, DISPATCH_DETAIL_RF_HEADER), getDetailRowValue(rowValues, '타입')),
        company: getDetailRowValue(rowValues, '업체명'),
        dispatchTime: getDetailRowValue(rowValues, '시간'),
        bkg1: getDetailRowValue(rowValues, 'BKG1'),
        bkg2: getDetailRowValue(rowValues, 'BKG2'),
        bkg3: getDetailRowValue(rowValues, 'BKG3'),
        targetVessel: getDetailRowValue(rowValues, 'TARGET VESSEL'),
        note: getDetailRowValue(rowValues, '비고'),
        confirmedBkg: getDetailRowValue(rowValues, 'BKG확정'),
    };
}
function buildDetailLineContext(line = {}) {
    return {
        lineNo: line.lineNo || null,
        workDate: line.workDate || '',
        shipper: line.shipper || '',
        startRegion: line.startRegion || line.sourceRegion || '',
        sourceRegion: line.sourceRegion || '',
        workplace: line.workplace || '',
        startLocation: line.startLocation || '',
        destination: line.destination || '',
        port: line.port || '',
        transportRemark: line.transportRemark || '',
        glapsPortCode: line.glapsPortCode || '',
        dgFlag: normalizeDispatchDgValue(line.dgFlag),
        rfFlag: normalizeDispatchRfValue(line.rfFlag ?? line.dgRfFlag, line.containerType),
        company: line.company || '',
        dispatchTime: line.dispatchTime || '',
        bkg1: line.bkg1 || '',
        bkg2: line.bkg2 || '',
        bkg3: line.bkg3 || '',
        targetVessel: line.targetVessel || '',
        note: line.note || '',
        confirmedBkg: line.confirmedBkg || '',
    };
}
function buildGlapsAliasCodeMap(aliases = [], aliasType) {
    const map = new Map();
    aliases
        .filter(alias => alias?.alias_type === aliasType && alias?.glaps_code)
        .forEach((alias) => {
            [alias.source_name, alias.els_name, alias.glaps_name, alias.glaps_code].flatMap(splitGlapsAliasValues).forEach((value) => {
                const key = normalizeGlapsKey(value);
                if (key && !map.has(key)) map.set(key, alias.glaps_code);
            });
        });
    return map;
}
function isGlapsDefaultAlias(alias = {}) {
    const note = normalizeGlapsKey(alias.review_note || alias.reviewNote || '');
    return ['기본', 'DEFAULT', '우선', '대표'].some(token => note.includes(normalizeGlapsKey(token)));
}
function buildGlapsAliasCodeOptionsMap(aliases = [], aliasType) {
    const map = new Map();
    const pushOption = (source, alias) => {
        const key = normalizeGlapsKey(source);
        const code = String(alias?.glaps_code || alias?.glapsCode || '').trim();
        if (!key || !code) return;
        const current = map.get(key) || [];
        if (!current.some(option => option.code === code)) {
            current.push({
                code,
                label: String(alias.glaps_name || alias.glapsName || alias.els_name || alias.elsName || alias.source_name || alias.sourceName || code).trim(),
                isDefault: isGlapsDefaultAlias(alias),
            });
            map.set(key, current);
        }
    };
    aliases
        .filter(alias => alias?.alias_type === aliasType && alias?.glaps_code)
        .forEach((alias) => {
            [alias.source_name, alias.els_name, alias.glaps_name, alias.glaps_code].flatMap(splitGlapsAliasValues).forEach(value => pushOption(value, alias));
        });
    map.forEach((options, key) => {
        options.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.code.localeCompare(b.code));
        map.set(key, options);
    });
    return map;
}
function buildGlapsAliasCodeMapForTypes(aliases = [], aliasTypes = []) {
    const allowed = new Set(aliasTypes);
    const map = new Map();
    aliases
        .filter(alias => allowed.has(alias?.alias_type) && alias?.glaps_code)
        .forEach((alias) => {
            [alias.source_name, alias.els_name, alias.glaps_name, alias.glaps_code].flatMap(splitGlapsAliasValues).forEach((value) => {
                const key = normalizeGlapsKey(value);
                if (key && !map.has(key)) map.set(key, alias.glaps_code);
            });
        });
    return map;
}
function getGlapsAliasCode(map, value) {
    return map.get(normalizeGlapsKey(value)) || '';
}
function getGlapsAliasCodeOptions(map, value) {
    return map.get(normalizeGlapsKey(value)) || [];
}
function getGlapsAliasDefaultCode(map, value, preferredCode = '') {
    const options = getGlapsAliasCodeOptions(map, value);
    if (!options.length) return '';
    const preferred = String(preferredCode || '').trim();
    if (preferred && options.some(option => option.code === preferred)) return preferred;
    return (options.find(option => option.isDefault) || options[0]).code || '';
}
function buildRouteLocationCandidates(value = '', aliasMap = new Map()) {
    const baseCandidates = getGlapsRouteLocationCodeCandidates(value);
    const aliasCandidate = getGlapsAliasCode(aliasMap, value);
    return [...new Set([...baseCandidates, aliasCandidate].filter(Boolean))];
}
function buildWaypointCandidates(value = '', aliasMap = new Map()) {
    const aliasCandidate = getGlapsAliasCode(aliasMap, value);
    return [...new Set([value, aliasCandidate].filter(Boolean))];
}
function buildGlapsDispatchRouteFingerprintsWithAliasMaps({
    shipperCode = '',
    startLocationName = '',
    waypointElsName = '',
    waypointName = '',
    destinationName = '',
    routeLocationAliasMap = new Map(),
    waypointAliasMap = new Map(),
} = {}) {
    const shippers = String(shipperCode || '').trim() ? [String(shipperCode).trim()] : [''];
    const starts = buildRouteLocationCandidates(startLocationName, routeLocationAliasMap);
    const destinations = buildRouteLocationCandidates(destinationName, routeLocationAliasMap);
    const waypoints = buildWaypointCandidates(waypointElsName || waypointName, waypointAliasMap);
    return shippers.flatMap(shipper => starts.flatMap(start => waypoints.flatMap(waypoint => (
        destinations.map(destination => buildGlapsRouteFingerprint({
            shipperCode: shipper,
            startLocationName: start,
            waypointElsName: waypoint,
            destinationName: destination,
        }))
    ))));
}
function resolveGlapsSpecialConsigneeCode(rules = [], { shipperCode = '', waypointName = '', waypointElsName = '' } = {}) {
    const normalizedShipper = normalizeGlapsKey(shipperCode);
    if (!normalizedShipper) return '';
    const requestedWaypointKeys = new Set([waypointName, waypointElsName].map(normalizeGlapsKey).filter(Boolean));
    const candidates = (rules || [])
        .filter(rule => rule?.active !== false && getGlapsSpecialRuleType(rule) === GLAPS_SPECIAL_RULE_TYPES.CONSIGNEE && rule?.consignee_code)
        .map(rule => ({
            rule,
            shipperKey: normalizeGlapsKey(rule.shipper_code || rule.shipperCode),
            waypointKeys: [
                rule.waypoint_name || rule.waypointName,
                rule.waypoint_els_name || rule.waypointElsName,
            ].map(normalizeGlapsKey).filter(Boolean),
            priority: Number(rule.priority ?? 100) || 100,
        }))
        .filter(item => item.shipperKey === normalizedShipper)
        .filter(item => item.waypointKeys.length === 0 || item.waypointKeys.some(key => requestedWaypointKeys.has(key)))
        .sort((a, b) => (
            Number(b.waypointKeys.length > 0) - Number(a.waypointKeys.length > 0)
            || a.priority - b.priority
            || String(a.rule.consignee_code || '').localeCompare(String(b.rule.consignee_code || ''))
        ));
    return String(candidates[0]?.rule?.consignee_code || '').trim();
}
function getGlapsSpecialRuleType(rule = {}) {
    const explicit = String(rule.rule_type || rule.ruleType || '').trim();
    if (Object.values(GLAPS_SPECIAL_RULE_TYPES).includes(explicit)) return explicit;
    if (String(rule.start_location_name || rule.startLocationName || '').trim()) return GLAPS_SPECIAL_RULE_TYPES.START_LOCATION;
    if (String(rule.consignee_code || rule.consigneeCode || '').trim()) return GLAPS_SPECIAL_RULE_TYPES.CONSIGNEE;
    return GLAPS_SPECIAL_RULE_TYPES.SHIPPER_CODE;
}
function resolveGlapsSpecialShipperCode(rules = [], { waypointName = '', waypointElsName = '', shipperName = '' } = {}) {
    const requestedMatchKeys = new Set([waypointName, waypointElsName, shipperName].map(normalizeGlapsKey).filter(Boolean));
    if (requestedMatchKeys.size === 0) return '';
    const candidates = (rules || [])
        .filter(rule => rule?.active !== false && getGlapsSpecialRuleType(rule) === GLAPS_SPECIAL_RULE_TYPES.SHIPPER_CODE)
        .map(rule => ({
            rule,
            shipperCode: String(rule.shipper_code || rule.shipperCode || '').trim(),
            waypointKeys: [
                rule.waypoint_name || rule.waypointName,
                rule.waypoint_els_name || rule.waypointElsName,
            ].map(normalizeGlapsKey).filter(Boolean),
            priority: Number(rule.priority ?? 100) || 100,
        }))
        .filter(item => item.shipperCode && item.waypointKeys.length > 0)
        .filter(item => item.waypointKeys.some(key => requestedMatchKeys.has(key)))
        .sort((a, b) => (
            a.priority - b.priority
            || String(a.shipperCode).localeCompare(String(b.shipperCode))
        ));
    return candidates[0]?.shipperCode || '';
}
function resolveGlapsSpecialStartLocation(rules = [], {
    shipperCode = '',
    waypointName = '',
    waypointElsName = '',
    shipperName = '',
} = {}) {
    const normalizedShipper = normalizeGlapsKey(shipperCode);
    const requestedMatchKeys = new Set([waypointName, waypointElsName, shipperName].map(normalizeGlapsKey).filter(Boolean));
    if (!normalizedShipper) return '';
    const candidates = (rules || [])
        .filter(rule => rule?.active !== false && getGlapsSpecialRuleType(rule) === GLAPS_SPECIAL_RULE_TYPES.START_LOCATION)
        .map(rule => ({
            rule,
            shipperKey: normalizeGlapsKey(rule.shipper_code || rule.shipperCode),
            startLocationName: String(rule.start_location_name || rule.startLocationName || '').trim(),
            waypointKeys: [
                rule.waypoint_name || rule.waypointName,
                rule.waypoint_els_name || rule.waypointElsName,
            ].map(normalizeGlapsKey).filter(Boolean),
            priority: Number(rule.priority ?? 100) || 100,
        }))
        .filter(item => item.shipperKey === normalizedShipper && item.startLocationName)
        .filter(item => item.waypointKeys.length === 0 || item.waypointKeys.some(key => requestedMatchKeys.has(key)))
        .sort((a, b) => (
            Number(b.waypointKeys.length > 0) - Number(a.waypointKeys.length > 0)
            || a.priority - b.priority
            || String(a.startLocationName).localeCompare(String(b.startLocationName))
        ));
    return candidates[0]?.startLocationName || '';
}
function setGlapsCodeMapValue(map, source, code) {
    const key = normalizeGlapsKey(source);
    if (key && code && !map.has(key)) map.set(key, code);
}
function getGlapsSheetPayloadValues(payload = {}, tokens = []) {
    const normalizedTokens = tokens.map(normalizeGlapsKey).filter(Boolean);
    return Object.entries(payload)
        .filter(([key]) => {
            const normalizedKey = normalizeGlapsKey(key);
            return normalizedTokens.every(token => normalizedKey.includes(token));
        })
        .map(([, value]) => String(value || '').trim())
        .filter(Boolean);
}
function buildGlapsSheetCodeMap(sheetRows = [], sheetName, nameKey, codeKey) {
    const map = new Map();
    (sheetRows || [])
        .filter(row => String(row?.sheet_name || row?.sheetName || '') === sheetName)
        .forEach((row) => {
            const payload = row.row_payload || row.rowPayload || {};
            const code = String(payload[codeKey] || '').trim();
            const name = String(payload[nameKey] || '').trim();
            setGlapsCodeMapValue(map, name, code);
            setGlapsCodeMapValue(map, code, code);
        });
    return map;
}
function buildGlapsTransportServiceCodeMap(sheetRows = []) {
    const map = new Map();
    const setService = (code, name, aliases = []) => {
        [code, name, ...aliases].forEach(value => setGlapsCodeMapValue(map, value, code));
    };
    GLAPS_TRANSPORT_SERVICE_FALLBACKS.forEach(item => setService(item.code, item.name, item.aliases));
    (sheetRows || [])
        .filter(row => normalizeGlapsKey(row?.sheet_name || row?.sheetName || '').includes(normalizeGlapsKey('운송서비스')))
        .forEach((row) => {
            const payload = row.row_payload || row.rowPayload || {};
            const code = getGlapsSheetPayloadValues(payload, ['운송서비스'])[0] || '';
            const name = getGlapsSheetPayloadValues(payload, ['설명'])[0] || '';
            setService(code, name);
        });
    return map;
}
function inferGlapsTransportServiceCode(map, direction = '') {
    const direct = getGlapsAliasCode(map, direction);
    if (direct) return direct;
    const key = normalizeGlapsKey(direction);
    if (!key) return '';
    if (key.includes(normalizeGlapsKey('반품'))) return getGlapsAliasCode(map, '각강_내수(반품)');
    if (key.includes(normalizeGlapsKey('수출')) && key.includes(normalizeGlapsKey('보관'))) return getGlapsAliasCode(map, '컨테이너_수출(보관)');
    if (key.includes(normalizeGlapsKey('수출'))) return getGlapsAliasCode(map, '컨테이너_수출');
    if (key.includes(normalizeGlapsKey('수입')) && key.includes(normalizeGlapsKey('보관'))) return getGlapsAliasCode(map, '컨테이너_수입(보관)');
    if (key.includes(normalizeGlapsKey('수입'))) return getGlapsAliasCode(map, '컨테이너_수입');
    if (key.includes(normalizeGlapsKey('내수')) || key.includes(normalizeGlapsKey('석회석'))) return getGlapsAliasCode(map, '일반_내수_석회석');
    return '';
}
function getGlapsRoutePayload(route = {}, candidates = []) {
    const payload = route?.raw_payload || route?.rawPayload || {};
    for (const candidate of candidates) {
        const direct = payload[candidate];
        if (direct) return String(direct).trim();
        const found = Object.entries(payload).find(([key]) => normalizeGlapsKey(key) === normalizeGlapsKey(candidate));
        if (found?.[1]) return String(found[1]).trim();
    }
    return '';
}
function buildGlapsShipperCodeMap(routes = []) {
    const map = new Map();
    (routes || []).forEach((route) => {
        const code = getGlapsRouteShipperCode(route) || getGlapsRoutePayload(route, ['화주사코드', '화주사']);
        const name = getGlapsRoutePayload(route, ['화주명']);
        const elsName = getGlapsRoutePayload(route, ['ELS화주명']);
        [name, elsName, code].forEach(value => setGlapsCodeMapValue(map, value, code));
        const normalizedName = normalizeGlapsKey(name);
        const normalizedElsName = normalizeGlapsKey(elsName);
        if (code === 'KR10' || normalizedName.includes('현대글로비스') || normalizedElsName.includes('글로비스')) {
            ['글로비스', '글로비스KD외', '현대글로비스'].forEach(value => setGlapsCodeMapValue(map, value, code));
        }
        if (normalizedName.includes('현대모비스') || normalizedElsName.includes('현대모비스')) {
            ['모비스', '모비스AS', '현대모비스'].forEach(value => setGlapsCodeMapValue(map, value, code));
        }
        if (code === 'B000034432' || normalizedName.includes('모비스') || normalizedElsName.includes('모비스')) {
            ['모비스', '모비스AS', '현대모비스'].forEach(value => setGlapsCodeMapValue(map, value, code));
        }
    });
    return map;
}
function buildGlapsContainerIsoCodeMap(sheetRows = []) {
    const map = new Map();
    (sheetRows || [])
        .filter(row => String(row?.sheet_name || row?.sheetName || '').includes('컨테이너규격'))
        .forEach((row) => {
            const payload = row.row_payload || row.rowPayload || {};
            const values = row.row_values || row.rowValues || [];
            const isoCode = payload['ISO코드'] || values[0] || '';
            const customsCode = payload['세관코드'] || values[1] || '';
            const description = payload['설명 (Description)'] || values[2] || '';
            const elsCodes = getGlapsSheetPayloadValues(payload, ['ELS', '코드']);
            [isoCode, customsCode, ...elsCodes, description].forEach((value) => {
                const key = normalizeGlapsKey(value);
                if (key && isoCode && !map.has(key)) map.set(key, isoCode);
            });
        });
    return map;
}
function matchesDetailIssueFilter(line, filterKey) {
    if (!filterKey) return true;
    if (filterKey === 'start') return Boolean(line.needsStartLocationSelection);
    if (filterKey === 'route') return Boolean(line.needsRouteCodeMapping);
    if (filterKey === 'orderType') return Boolean(line.needsOrderTypeCodeMapping);
    if (filterKey === 'shipper') return Boolean(line.needsShipperCodeMapping);
    if (filterKey === 'routePart') return Boolean(line.needsRoutePartCodeMapping);
    if (filterKey === 'port') return Boolean(line.needsPortCodeMapping);
    if (filterKey === 'line') return Boolean(line.needsLineCodeMapping);
    if (filterKey === 'type') return Boolean(line.needsTypeCodeMapping);
    if (filterKey === 'carrier') return Boolean(line.needsCarrierCodeMapping);
    if (filterKey === 'consignee') return Boolean(line.needsConsigneeCodeMapping);
    if (filterKey === 'modified') return Boolean(line.detailUpdatedAt || line.confirmedBkgUpdatedAt);
    return true;
}
function focusDetailGridInput(event) {
    const key = event.key;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return;
    const target = event.currentTarget;
    const row = Number(target.dataset.detailRowIndex);
    const col = Number(target.dataset.detailColIndex);
    if (!Number.isFinite(row) || !Number.isFinite(col)) return;
    const root = target.closest('table');
    if (!root) return;
    const findInput = (rowIndex, colIndex) => root.querySelector(
        `[data-detail-row-index="${rowIndex}"][data-detail-col-index="${colIndex}"]`,
    );
    let next = null;
    if (key === 'ArrowUp' || key === 'ArrowDown') {
        const step = key === 'ArrowUp' ? -1 : 1;
        for (let rowIndex = row + step; rowIndex >= 0; rowIndex += step) {
            next = findInput(rowIndex, col);
            if (next || rowIndex > root.rows.length) break;
        }
    } else {
        const inputs = [...root.querySelectorAll(`[data-detail-row-index="${row}"]`)]
            .sort((a, b) => Number(a.dataset.detailColIndex) - Number(b.dataset.detailColIndex));
        const currentIdx = inputs.indexOf(target);
        next = inputs[currentIdx + (key === 'ArrowLeft' ? -1 : 1)] || null;
    }
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.select?.();
}
function normalizeDispatchHeaderForMerge(value) {
    return String(value ?? '').normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}
function getDispatchHeaderMergeKey(value) {
    const normalized = normalizeDispatchHeaderForMerge(value);
    if (['포트', '포트(도착항)', '포트(CODE)', 'CODE'].map(normalizeDispatchHeaderForMerge).includes(normalized)) return 'PORT_CODE';
    return normalized;
}
function getDispatchMergedHeaderLabel(value) {
    return getDispatchHeaderMergeKey(value) === 'PORT_CODE' ? '포트(CODE)' : value;
}
function isMobisCountryDisplayHeader(value) {
    const normalized = normalizeDispatchHeaderForMerge(value);
    return ['국가', '국가명'].map(normalizeDispatchHeaderForMerge).includes(normalized);
}
function findDispatchSourceHeaderIndex(headers = [], candidates = []) {
    const targets = candidates.map(normalizeDispatchHeaderForMerge);
    return headers.findIndex(header => targets.includes(normalizeDispatchHeaderForMerge(header)));
}
function formatMobisCountryPortDisplay(row = [], sourceHeaders = []) {
    const countryIdx = findDispatchSourceHeaderIndex(sourceHeaders, ['국가', '국가명']);
    const destinationIdx = findDispatchSourceHeaderIndex(sourceHeaders, ['도착항', '포트(도착항)', '도착지']);
    const country = countryIdx >= 0 ? String(row[countryIdx] || '').trim() : '';
    const destination = destinationIdx >= 0 ? String(row[destinationIdx] || '').trim() : '';
    if (!country) return destination;
    if (!destination) return country;
    if (normalizeDispatchHeaderForMerge(country).includes(normalizeDispatchHeaderForMerge(destination))) return country;
    return `${country} ${destination}`;
}
function findMergedHeaderIndex(headers = [], target) {
    const normalizedTarget = getDispatchHeaderMergeKey(target);
    return headers.findIndex(header => getDispatchHeaderMergeKey(header) === normalizedTarget);
}
function mergeDispatchHeaders(items = []) {
    const merged = [];
    items.forEach(item => {
        (item.headers || []).forEach(header => {
            if (!header) return;
            const label = getDispatchMergedHeaderLabel(header);
            const existingIdx = findMergedHeaderIndex(merged, header);
            if (existingIdx >= 0) {
                if (label !== header) merged[existingIdx] = label;
                return;
            }
            merged.push(label);
        });
    });
    return merged;
}
function mapDispatchRowToHeaders(row = [], sourceHeaders = [], targetHeaders = []) {
    return targetHeaders.map(header => {
        if (normalizeDispatchHeaderForMerge(header) === normalizeDispatchHeaderForMerge('고객사(국가)')) {
            const mobisCustomerLabel = formatMobisCountryPortDisplay(row, sourceHeaders);
            if (mobisCustomerLabel) return mobisCustomerLabel;
        }
        const sourceIdx = findMergedHeaderIndex(sourceHeaders, header);
        return sourceIdx >= 0 ? row[sourceIdx] : '';
    });
}
function measureDispatchTextWidth(value) {
    return Array.from(String(value ?? '')).reduce((sum, ch) => {
        const code = ch.charCodeAt(0);
        if (code > 0x7f) return sum + 1.75;
        if (/[MW@#%&]/.test(ch)) return sum + 1.2;
        if (/[ilI.,'`| ]/.test(ch)) return sum + 0.55;
        return sum + 1;
    }, 0);
}
function estimateDispatchColumnWidth(header, values = []) {
    const longest = Math.max(
        measureDispatchTextWidth(header),
        ...values.map(measureDispatchTextWidth),
    );
    return Math.ceil(Math.min(560, Math.max(80, longest * 8 + 40)));
}
function resetScrollChainToTop(target) {
    if (typeof window === 'undefined') return;
    const scrollToTop = (node) => {
        if (!node) return;
        if (typeof node.scrollTo === 'function') node.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        else node.scrollTop = 0;
    };

    scrollToTop(document.scrollingElement);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    let node = target;
    while (node && node !== document.body && node !== document.documentElement) {
        if (node.scrollHeight > node.clientHeight) scrollToTop(node);
        node = node.parentElement;
    }
}
function scheduleScrollReset(getTarget) {
    const run = () => resetScrollChainToTop(getTarget?.());
    run();
    const raf = requestAnimationFrame(run);
    const timer = setTimeout(run, 160);
    return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
    };
}
function scrollDateTabHorizontally(tabsEl, tabEl) {
    if (!tabsEl || !tabEl) return;
    const targetLeft = Math.max(0, tabEl.offsetLeft - ((tabsEl.clientWidth - tabEl.offsetWidth) / 2));
    tabsEl.scrollTo({ left: targetLeft, behavior: 'smooth' });
}
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const DETAIL_HEADER_FILTER_MODES = Object.freeze({
    detail: 'detail',
    change: 'detail-change',
});
const DETAIL_HEADER_SORT_DIRECTIONS = new Set(['asc', 'desc']);
const DEFAULT_DETAIL_HEADER_SORTS = Object.freeze({
    [DETAIL_HEADER_FILTER_MODES.change]: { header: '발생일시', direction: 'desc' },
});
function normalizeDetailFilterValue(value) {
    return String(value ?? '').trim();
}
function displayDetailFilterValue(value) {
    const normalized = normalizeDetailFilterValue(value);
    return normalized || '(빈값)';
}
function sanitizeDetailHeaderFilters(filters = {}) {
    const next = {};
    Object.values(DETAIL_HEADER_FILTER_MODES).forEach((mode) => {
        const modeFilters = filters?.[mode] || {};
        const cleanMode = {};
        Object.entries(modeFilters).forEach(([header, values]) => {
            const cleanValues = [...new Set((Array.isArray(values) ? values : [values])
                .map(normalizeDetailFilterValue))];
            if (cleanValues.length > 0) cleanMode[header] = cleanValues;
        });
        next[mode] = cleanMode;
    });
    return next;
}
function getDetailHeaderFilterValues(filters = {}, mode, header) {
    const values = filters?.[mode]?.[header] || [];
    return Array.isArray(values) ? values : [];
}
function countDetailHeaderFilterValues(modeFilters = {}) {
    return Object.values(modeFilters || {}).reduce((sum, values) => sum + (Array.isArray(values) ? values.length : 0), 0);
}
function sanitizeDetailHeaderSorts(sorts = {}) {
    const next = { ...DEFAULT_DETAIL_HEADER_SORTS };
    Object.entries(sorts || {}).forEach(([mode, sort]) => {
        const header = normalizeDetailFilterValue(sort?.header);
        const direction = normalizeDetailFilterValue(sort?.direction);
        if (header && DETAIL_HEADER_SORT_DIRECTIONS.has(direction)) next[mode] = { header, direction };
    });
    return next;
}
function getDetailHeaderSort(sorts = {}, mode) {
    return sanitizeDetailHeaderSorts(sorts)[mode] || null;
}
function parseDetailSortNumber(value = '') {
    const text = normalizeDetailFilterValue(value).replace(/,/g, '');
    if (!text || !/^-?\d+(\.\d+)?$/.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
}
function compareDetailSortText(a = '', b = '') {
    const aNumber = parseDetailSortNumber(a);
    const bNumber = parseDetailSortNumber(b);
    if (aNumber !== null && bNumber !== null && aNumber !== bNumber) return aNumber - bNumber;
    return normalizeDetailFilterValue(a).localeCompare(normalizeDetailFilterValue(b), 'ko', { numeric: true });
}
function getDispatchChangeSortValue(row = {}, headers = [], header = '') {
    if (header === '발생일시' || header === '수정일시') {
        return row.event?.occurred_at || row.event?.updated_at || row.event?.created_at || '';
    }
    if (header === '확인일시') return row.event?.confirmed_at || '';
    const idx = headers.indexOf(header);
    return idx >= 0 ? row.values?.[idx] : '';
}
function compareDispatchChangeRowsBySort(a = {}, b = {}, headers = [], sort = null) {
    if (!sort?.header || !sort?.direction) return 0;
    const aValue = getDispatchChangeSortValue(a, headers, sort.header);
    const bValue = getDispatchChangeSortValue(b, headers, sort.header);
    const aTime = ['발생일시', '수정일시', '확인일시'].includes(sort.header) ? new Date(aValue || 0).getTime() || 0 : null;
    const bTime = ['발생일시', '수정일시', '확인일시'].includes(sort.header) ? new Date(bValue || 0).getTime() || 0 : null;
    const base = aTime !== null && bTime !== null && aTime !== bTime
        ? aTime - bTime
        : compareDetailSortText(aValue, bValue);
    if (base !== 0) return sort.direction === 'desc' ? -base : base;
    const aOrder = Number(a.event?.event_order || 0);
    const bOrder = Number(b.event?.event_order || 0);
    if (aOrder !== bOrder) return sort.direction === 'desc' ? bOrder - aOrder : aOrder - bOrder;
    return 0;
}
function detailRowMatchesHeaderFilters(rowValues = [], headers = [], modeFilters = {}) {
    return Object.entries(modeFilters || {}).every(([header, values]) => {
        if (!Array.isArray(values) || values.length === 0) return true;
        const idx = headers.indexOf(header);
        if (idx < 0) return true;
        return values.includes(normalizeDetailFilterValue(rowValues[idx]));
    });
}
function buildDetailHeaderFilterOptions(rows = [], headers = []) {
    const optionMap = {};
    headers.forEach((header, idx) => {
        const counts = new Map();
        rows.forEach((row) => {
            const value = normalizeDetailFilterValue(row?.[idx]);
            counts.set(value, (counts.get(value) || 0) + 1);
        });
        optionMap[header] = [...counts.entries()]
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => {
                if (!a.value && b.value) return -1;
                if (a.value && !b.value) return 1;
                return displayDetailFilterValue(a.value).localeCompare(displayDetailFilterValue(b.value), 'ko');
            });
    });
    return optionMap;
}
function consumeAsanDispatchReloadState() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.sessionStorage.getItem(ASAN_DISPATCH_RELOAD_STATE_KEY);
        window.sessionStorage.removeItem(ASAN_DISPATCH_RELOAD_STATE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || Date.now() - Number(parsed.savedAt || 0) > 300000) return null;
        return parsed;
    } catch {
        return null;
    }
}

function AsanDispatchContent() {
    const supabase = useMemo(() => createBrowserSupabaseClient(), []);
    const reloadRestoreRef = useRef(undefined);
    if (reloadRestoreRef.current === undefined) reloadRestoreRef.current = consumeAsanDispatchReloadState();
    const reloadRestoreState = reloadRestoreRef.current || {};
    const skipInitialViewResetRef = useRef(Boolean(reloadRestoreRef.current));
    const [viewType, setViewType] = useState(() => (
        ASAN_DISPATCH_VIEW_TYPES.includes(reloadRestoreState.viewType) ? reloadRestoreState.viewType : 'integrated'
    ));
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dispatchFullDataLoading, setDispatchFullDataLoading] = useState(false);
    const [dashboardCacheState, setDashboardCacheState] = useState({
        viewType: '',
        payload: null,
        checked: false,
        loading: false,
    });
    const [syncing, setSyncing] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState(-1);
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState({ glovis_path: '', mobis_path: '' });
    const [showBrowser, setShowBrowser] = useState(false);
    const [browseTarget, setBrowseTarget] = useState('');
    const [browserFiles, setBrowserFiles] = useState([]);
    const [browserPath, setBrowserPath] = useState('/아산지점/A_운송실무');
    const [browserLoading, setBrowserLoading] = useState(false);
    const [searchInput, setSearchInput] = useState(reloadRestoreState.searchInput || '');
    const [mainView, setMainView] = useState(() => (
        ASAN_DISPATCH_MAIN_VIEWS.includes(reloadRestoreState.mainView) ? reloadRestoreState.mainView : 'dashboard'
    ));
    const [searchTerm, setSearchTerm] = useState(reloadRestoreState.searchTerm || reloadRestoreState.searchInput || '');
    const [columnFilters, setColumnFilters] = useState(reloadRestoreState.columnFilters || {});
    const [colorFilter, setColorFilter] = useState(reloadRestoreState.colorFilter || null);
    const [filterDropdown, setFilterDropdown] = useState(null);
    const [tooltip, setTooltip] = useState(null);
    const [hiddenCols, setHiddenCols] = useState(new Set());
    const [colWidths, setColWidths] = useState({});
    const [showColPanel, setShowColPanel] = useState(false);
    const [allTabMonth, setAllTabMonth] = useState(reloadRestoreState.allTabMonth || null);
    const [allTabWeek, setAllTabWeek] = useState(reloadRestoreState.allTabWeek || null);
    const [elapsed, setElapsed] = useState('');
    const [displayLimit, setDisplayLimit] = useState(100);
    const [syncStatus, setSyncStatus] = useState(null); // { message, isError }
    const [syncGate, setSyncGate] = useState({ running: false, cooldownUntil: null, quickDone: false, message: '' });
    const [syncGateNowMs, setSyncGateNowMs] = useState(() => Date.now());
    const [webCellStatus, setWebCellStatus] = useState({});
    const [dispatchConfirmationMap, setDispatchConfirmationMap] = useState({});
    const [detailStartOverrides, setDetailStartOverrides] = useState({});
    const [detailBkgOverrides, setDetailBkgOverrides] = useState({});
    const [detailPortOverrides, setDetailPortOverrides] = useState({});
    const [detailDgOverrides, setDetailDgOverrides] = useState({});
    const [detailRfOverrides, setDetailRfOverrides] = useState({});
    const [detailOverrideSetupRequired, setDetailOverrideSetupRequired] = useState(false);
    const [detailConfirmation, setDetailConfirmation] = useState(null);
    const [detailConfirmationSetupRequired, setDetailConfirmationSetupRequired] = useState(false);
    const [detailConfirmationSaving, setDetailConfirmationSaving] = useState(false);
    const [detailIssueFilter, setDetailIssueFilter] = useState(reloadRestoreState.detailIssueFilter || '');
    const [detailHeaderFilters, setDetailHeaderFilters] = useState(() => sanitizeDetailHeaderFilters(reloadRestoreState.detailHeaderFilters));
    const [detailHeaderSorts, setDetailHeaderSorts] = useState(() => sanitizeDetailHeaderSorts(reloadRestoreState.detailHeaderSorts));
    const [detailHeaderFilterDropdown, setDetailHeaderFilterDropdown] = useState(null);
    const [detailChangeEvents, setDetailChangeEvents] = useState([]);
    const [detailChangeDrafts, setDetailChangeDrafts] = useState({});
    const [detailChangePortOverrides, setDetailChangePortOverrides] = useState({});
    const [detailChangeStatusFilter, setDetailChangeStatusFilter] = useState(reloadRestoreState.detailChangeStatusFilter || '');
    const [detailChangeSetupRequired, setDetailChangeSetupRequired] = useState(false);
    const [detailChangeSaving, setDetailChangeSaving] = useState(false);
    const [detailStateRefreshToken, setDetailStateRefreshToken] = useState(0);
    const [detailStateLoading, setDetailStateLoading] = useState(false);
    const [glapsDetailLookup, setGlapsDetailLookup] = useState({ routes: [], aliases: [], sheetRows: [], specialRules: [] });
    const [glapsMasterRefreshToken, setGlapsMasterRefreshToken] = useState(0);
    const [glapsLookupLoading, setGlapsLookupLoading] = useState(false);
    const tabsRef = useRef(null);
    const containerRef = useRef(null);
    const topBarRef = useRef(null);
    const dataRef = useRef([]);
    const activeTabRef = useRef(-1);
    const detailChangeSyncRef = useRef('');
    const glapsLookupLoadedTokenRef = useRef(null);
    const dispatchLoadSeqRef = useRef(0);
    const dispatchDateLoadedKeysRef = useRef(new Set());
    const dispatchDateLoadingKeysRef = useRef(new Set());
    const dispatchFullLoadedRef = useRef(false);
    const dispatchFullLoadingRef = useRef(false);
    const settingsLoadedRef = useRef(false);
    const dashboardCacheLoadSeqRef = useRef(0);
    const todayKey = useMemo(() => getTodayKey(), []);
    const syncCooldownUntilMs = syncGate.cooldownUntil ? new Date(syncGate.cooldownUntil).getTime() : 0;
    const syncCooldownActive = Boolean(syncCooldownUntilMs && syncCooldownUntilMs > syncGateNowMs);
    const syncActionBlocked = syncing || syncCooldownActive || (syncGate.running && !syncGate.quickDone);
    const syncButtonText = syncing || (syncGate.running && !syncGate.quickDone)
        ? '동기화 중'
        : (syncGate.running && syncGate.quickDone ? '1순위 재동기화' : 'NAS 동기화');

    useEffect(() => { dataRef.current = data; }, [data]);
    useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

    useEffect(() => {
        setDetailStartOverrides({});
        setDetailBkgOverrides({});
    }, [viewType, activeTab, allTabMonth, allTabWeek]);

    useEffect(() => {
        if (!['detail', 'detail-change'].includes(mainView)) {
            setGlapsLookupLoading(false);
            return undefined;
        }
        const lookupToken = String(glapsMasterRefreshToken);
        if (glapsLookupLoadedTokenRef.current === lookupToken) {
            setGlapsLookupLoading(false);
            return undefined;
        }
        let cancelled = false;
        setGlapsLookupLoading(true);
        const loadGlapsLookup = async () => {
            try {
                const response = await fetch(`/api/branches/asan/glaps/master?mode=lookup&t=${Date.now()}`, { cache: 'no-store' });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok || payload.setupRequired) {
                    if (!cancelled) setGlapsDetailLookup({ routes: [], aliases: [], sheetRows: [], specialRules: [] });
                    return;
                }
                if (!cancelled) {
                    setGlapsDetailLookup({
                        routes: payload.routes || [],
                        aliases: payload.aliases || [],
                        sheetRows: payload.sheetRows || [],
                        specialRules: payload.specialRules || [],
                    });
                    glapsLookupLoadedTokenRef.current = lookupToken;
                }
            } catch {
                if (!cancelled) {
                    setGlapsDetailLookup({ routes: [], aliases: [], sheetRows: [], specialRules: [] });
                    glapsLookupLoadedTokenRef.current = null;
                }
            } finally {
                if (!cancelled) setGlapsLookupLoading(false);
            }
        };
        loadGlapsLookup();
        return () => { cancelled = true; };
    }, [glapsMasterRefreshToken, mainView]);

    // ===== 데이터 fetch =====
    const fetchSettings = useCallback(async ({ force = false } = {}) => {
        if (settingsLoadedRef.current && !force) return;
        try {
            const r = await fetch('/api/branches/asan/settings');
            const j = await r.json();
            if (j.data) {
                setSettings(j.data);
                settingsLoadedRef.current = true;
            }
        } catch { /* ignore */ }
    }, []);
    const openSettings = useCallback(() => {
        setShowSettings(true);
        fetchSettings({ force: true });
    }, [fetchSettings]);
    const requestDispatchItems = useCallback(async (type, params = {}) => {
        const r = await fetch(makeDispatchDataUrl(type, params), { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok || j.ok === false) throw new Error(j.error || j.message || '배차판 조회 실패');
        return j.data || [];
    }, []);
    const fetchDashboardCache = useCallback(async (type) => {
        const loadSeq = dashboardCacheLoadSeqRef.current + 1;
        dashboardCacheLoadSeqRef.current = loadSeq;
        setDashboardCacheState({ viewType: type, payload: null, checked: false, loading: true });
        try {
            const r = await fetch(`/api/branches/asan/dispatch/dashboard?type=${encodeURIComponent(type)}&t=${Date.now()}`, { cache: 'no-store' });
            const j = await r.json().catch(() => ({}));
            if (dashboardCacheLoadSeqRef.current !== loadSeq) return;
            setDashboardCacheState({
                viewType: type,
                payload: r.ok && j.ok ? j.cache?.payload || null : null,
                checked: true,
                loading: false,
            });
        } catch {
            if (dashboardCacheLoadSeqRef.current === loadSeq) {
                setDashboardCacheState({ viewType: type, payload: null, checked: true, loading: false });
            }
        }
    }, []);
    const ensureDispatchDateLoaded = useCallback(async (dateStr) => {
        const key = `${viewType}:${dateStr || ''}`;
        if (!dateStr || dispatchDateLoadedKeysRef.current.has(key) || dispatchDateLoadingKeysRef.current.has(key)) return;
        const loadSeq = dispatchLoadSeqRef.current;
        dispatchDateLoadingKeysRef.current.add(key);
        try {
            const dateItems = await requestDispatchItems(viewType, { mode: 'date', date: dateStr });
            if (dispatchLoadSeqRef.current !== loadSeq) return;
            dispatchDateLoadedKeysRef.current.add(key);
            setData(prev => mergeDispatchDateItems(prev, dateItems));
        } catch {
            // 선택일 보강 실패는 수동 새로고침이나 다음 자동 갱신에서 복구한다.
        } finally {
            dispatchDateLoadingKeysRef.current.delete(key);
        }
    }, [requestDispatchItems, viewType]);
    const ensureDispatchFullLoaded = useCallback(async () => {
        if (dispatchFullLoadedRef.current || dispatchFullLoadingRef.current) return;
        const loadSeq = dispatchLoadSeqRef.current;
        dispatchFullLoadingRef.current = true;
        setDispatchFullDataLoading(true);
        try {
            const fullItems = await requestDispatchItems(viewType, { mode: 'full' });
            if (dispatchLoadSeqRef.current !== loadSeq) return;
            const currentItems = dataRef.current || [];
            const currentIndex = activeTabRef.current;
            const currentTargetDate = currentIndex === currentItems.length
                ? '__all__'
                : currentItems[currentIndex]?.target_date || '';
            dispatchFullLoadedRef.current = true;
            dispatchDateLoadedKeysRef.current = new Set(
                (fullItems || []).filter(item => item?.target_date).map(item => `${viewType}:${item.target_date}`)
            );
            setData(fullItems);
            setActiveTab(pickDispatchActiveIndex(fullItems, viewType, currentTargetDate));
        } catch {
            // 전체 원장 보강은 필요 시 다시 시도한다.
        } finally {
            dispatchFullLoadingRef.current = false;
            setDispatchFullDataLoading(false);
        }
    }, [requestDispatchItems, viewType]);
    const fetchData = useCallback(async (type, options = {}) => {
        const { silent = false, preserveActiveDate = false } = options;
        const previousItems = dataRef.current || [];
        const previousIndex = activeTabRef.current;
        const previousTargetDate = previousIndex === previousItems.length
            ? '__all__'
            : previousItems[previousIndex]?.target_date;
        const loadSeq = dispatchLoadSeqRef.current + 1;
        dispatchLoadSeqRef.current = loadSeq;
        const isCurrentLoad = () => dispatchLoadSeqRef.current === loadSeq;
        dispatchDateLoadedKeysRef.current = new Set();
        dispatchDateLoadingKeysRef.current = new Set();
        dispatchFullLoadedRef.current = false;
        dispatchFullLoadingRef.current = false;
        setDispatchFullDataLoading(false);
        const pickActiveIndex = (items = [], preferredTargetDate = '') => (
            preserveActiveDate
                ? pickDispatchActiveIndex(items, type, preferredTargetDate)
                : findDefaultValidTabIndex(items, type, getTodayKey())
        );

        if (!silent) setLoading(true);
        let initialLoaded = false;
        try {
            const metaItems = await requestDispatchItems(type, { mode: 'meta' });
            let nextItems = metaItems;
            let nextActiveIndex = pickActiveIndex(nextItems, previousTargetDate);
            if (nextActiveIndex >= 0 && nextActiveIndex < nextItems.length) {
                const activeDate = nextItems[nextActiveIndex]?.target_date;
                if (activeDate) {
                    const dateItems = await requestDispatchItems(type, { mode: 'date', date: activeDate });
                    nextItems = mergeDispatchDateItems(nextItems, dateItems);
                    dispatchDateLoadedKeysRef.current.add(`${type}:${activeDate}`);
                    nextActiveIndex = pickActiveIndex(nextItems, activeDate);
                }
            }
            if (!isCurrentLoad()) return false;
            setData(nextItems);
            setActiveTab(nextActiveIndex);
            initialLoaded = true;
            if (!silent) setLoading(false);
            return true;
        } catch {
            if (!silent) setData([]);
            return false;
        } finally {
            if (!silent && !initialLoaded) setLoading(false);
        }
    }, [requestDispatchItems]);
    const updateSyncGateFromStatus = useCallback((status = {}) => {
        const nextGate = {
            running: Boolean(status.running),
            cooldownUntil: status.request_cooldown_until || status.cooldown_until || null,
            quickDone: Boolean(status.quick_done),
            message: status.message || '',
        };
        setSyncGate(nextGate);
        setSyncGateNowMs(Date.now());
        return nextGate;
    }, []);
    const refreshSyncGateStatus = useCallback(async ({ showMessage = false } = {}) => {
        const statusResponse = await fetch(`/api/branches/asan/sync?t=${Date.now()}`, { cache: 'no-store' });
        const statusJson = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) throw new Error(statusJson.error || '동기화 상태 확인 실패');
        const status = statusJson.status || statusJson;
        const gate = updateSyncGateFromStatus(status);
        if (showMessage && gate.running) {
            setSyncStatus({ message: gate.message || 'NAS 동기화 진행 중입니다.', isError: false });
        }
        return status;
    }, [updateSyncGateFromStatus]);
    const handleRefreshData = () => {
        if (refreshing) return;
        if (typeof window === 'undefined') return;
        const activeTargetDate = activeTab === data.length
            ? '__all__'
            : data[activeTab]?.target_date || '';
        const restoreState = {
            savedAt: Date.now(),
            viewType,
            mainView,
            activeTargetDate,
            allTabMonth,
            allTabWeek,
            searchInput,
            searchTerm,
            columnFilters,
            colorFilter,
            detailIssueFilter,
            detailHeaderFilters,
            detailHeaderSorts,
            detailChangeStatusFilter,
            scrollX: window.scrollX || 0,
            scrollY: window.scrollY || 0,
        };
        setRefreshing(true);
        setSyncStatus({ message: '현재 위치를 저장하고 페이지를 새로고침합니다.', isError: false });
        try {
            window.sessionStorage.setItem(ASAN_DISPATCH_RELOAD_STATE_KEY, JSON.stringify(restoreState));
        } catch {
            // 저장 실패 시에도 사용자가 기대한 F5 효과는 유지한다.
        }
        window.location.reload();
    };
    const handleGlapsMasterChanged = useCallback(() => {
        detailChangeSyncRef.current = '';
        setGlapsMasterRefreshToken(token => token + 1);
    }, []);
    const handleSync = async () => {
        if (syncActionBlocked) {
            handleRefreshData();
            return;
        }
        setSyncing(true);
        setSyncStatus({ message: 'NAS 동기화 요청 중...', isError: false });
        try {
            const r = await fetch('/api/branches/asan/sync', { method: 'POST' });
            const j = await r.json();
            if (!r.ok || j.ok === false) throw new Error(j.error || j.message || '동기화 요청 실패');

            let finalStatus = j.status || j;
            updateSyncGateFromStatus(finalStatus);
            if (j.cooldown) {
                setSyncStatus({ message: j.message || '최근 동기화 요청이 있어 새로고침으로 최신 DB를 확인합니다.', isError: false });
                setTimeout(handleRefreshData, 50);
                return;
            }
            if (j.running || finalStatus?.running) {
                setSyncStatus({ message: 'NAS 1순위 작업일 동기화 진행 중입니다. 완료되면 화면을 새로고침합니다.', isError: false });
                for (let attempt = 0; attempt < 180; attempt += 1) {
                    await wait(2000);
                    finalStatus = await refreshSyncGateStatus();
                    const running = Boolean(finalStatus?.running);
                    if (finalStatus?.quick_done || !running) break;
                    setSyncStatus({ message: finalStatus?.message || 'NAS 1순위 작업일 동기화 진행 중입니다.', isError: false });
                }
                if (finalStatus?.running && !finalStatus?.quick_done) throw new Error('1순위 작업일 동기화가 오래 걸리고 있습니다. 잠시 후 새로고침해 주세요.');
                if (finalStatus?.running && finalStatus?.quick_done) {
                    setSyncStatus({ message: '1순위 작업일 자료 반영 완료. 전/후 작업일과 나머지 날짜는 백그라운드에서 계속 동기화합니다.', isError: false });
                    setTimeout(handleRefreshData, 50);
                    return;
                }
            }

            const results = finalStatus?.results || j.results || [];
            const hasError = finalStatus?.ok === false || results.some(result => result.success === false);
            if (hasError) {
                const fail = results.find(result => result.success === false);
                throw new Error(fail?.message || finalStatus?.message || 'NAS 동기화 실패');
            }
            const detail = results.length
                ? results.map(result => `${result.type === 'glovis' ? '글로비스' : '모비스'} ${result.sheets || 0}시트`).join(' / ')
                : '완료';
            setSyncStatus({ message: `동기화 완료. 최신 자료로 새로고침합니다. (${detail})`, isError: false });
            setTimeout(handleRefreshData, 50);
        } catch (e) {
            setSyncStatus({ message: '동기화 실패: ' + e.message, isError: true });
        } finally {
            setSyncing(false);
            setTimeout(() => setSyncStatus(null), 8000);
        }
    };
    const loadFolder = async (path) => {
        setBrowserLoading(true);
        try { const r = await fetch(`/api/nas/files?path=${encodeURIComponent(path)}`); const j = await r.json(); if (j.files) setBrowserFiles(j.files); setBrowserPath(path); } catch { }
        finally { setBrowserLoading(false); }
    };
    const openBrowser = async (target) => {
        setBrowseTarget(target);
        await loadFolder(browserPath);
        // 모달 전환을 한 번에 처리해서 깜빡임 방지
        queueMicrotask(() => { setShowSettings(false); setShowBrowser(true); });
    };
    const selectFile = (file) => {
        if (file.type === 'directory') loadFolder(file.path);
        else if (file.name.match(/\.xls[mx]$/i)) { setSettings(p => ({ ...p, [`${browseTarget}_path`]: file.path })); setShowBrowser(false); setShowSettings(true); }
    };
    const saveSettingsHandler = async () => {
        try { const r = await fetch('/api/branches/asan/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }); if (r.ok) { setShowSettings(false); alert('저장 완료'); } } catch { alert('저장 실패'); }
    };

    // ===== Effects =====
    useEffect(() => scheduleIdlePrefetch(() => fetchSettings(), 3200), [fetchSettings]);
    useEffect(() => {
        if (mainView !== 'dashboard') return undefined;
        return scheduleIdlePrefetch(() => fetchDashboardCache(viewType), 150, { force: true });
    }, [fetchDashboardCache, mainView, viewType]);
    useEffect(() => {
        let cancelled = false;
        let timer = null;
        const pollSyncGate = async () => {
            if (typeof document !== 'undefined' && document.hidden) return;
            try {
                const status = await refreshSyncGateStatus();
                if (cancelled) return;
                if (status?.running && status?.quick_done) {
                    setSyncStatus({ message: status.message || '전/후 작업일과 나머지 날짜 동기화가 백그라운드에서 진행 중입니다.', isError: false });
                }
            } catch {
                // 상태 확인 실패는 화면 사용을 막지 않는다.
            }
        };
        const cancelIdle = scheduleIdlePrefetch(() => {
            pollSyncGate();
            timer = setInterval(pollSyncGate, 15000);
        }, 2600, { force: true });
        return () => {
            cancelled = true;
            cancelIdle();
            if (timer) clearInterval(timer);
        };
    }, [refreshSyncGateStatus]);
    useEffect(() => {
        if (!syncGate.running && !syncCooldownActive) return undefined;
        const timer = setInterval(() => setSyncGateNowMs(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [syncCooldownActive, syncGate.running]);
    useEffect(() => {
        const preserveReloadState = skipInitialViewResetRef.current;
        skipInitialViewResetRef.current = false;
        fetchData(viewType, { preserveActiveDate: preserveReloadState });
        if (!preserveReloadState) {
            setSearchInput('');
            setSearchTerm('');
            setColumnFilters({});
            setColorFilter(null);
            setDetailHeaderFilters(sanitizeDetailHeaderFilters());
            setDetailHeaderFilterDropdown(null);
        }
    }, [fetchData, viewType]);
    useEffect(() => {
        if (syncing || showSettings || showBrowser) return undefined;
        const timer = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            fetchData(viewType, { silent: true, preserveActiveDate: true });
        }, 60000);
        return () => clearInterval(timer);
    }, [fetchData, viewType, syncing, showSettings, showBrowser]);
    // 검색 디바운스 (300ms)
    useEffect(() => { const t = setTimeout(() => setSearchTerm(searchInput), 300); return () => clearTimeout(t); }, [searchInput]);
    // localStorage 로드
    useEffect(() => {
        const p = loadPrefs(viewType);
        if (p.hiddenCols) {
            setHiddenCols(new Set(p.hiddenCols));
        } else {
            // [v5.10.20] 기본 숨김 컬럼: 모비스의 맨 오른쪽 빈 분석용 컬럼(A, B 등) 제외
            const defaultHidden = viewType === 'mobis' ? new Set(['A', 'B', '함축', 'col_35', 'col_36']) : new Set();
            setHiddenCols(defaultHidden);
        }
        setColWidths(p.colWidths || {});
    }, [viewType]);
    // localStorage 저장 (디바운스)
    useEffect(() => {
        const t = setTimeout(() => savePrefs(viewType, { hiddenCols: [...hiddenCols], colWidths }), 300);
        return () => clearTimeout(t);
    }, [hiddenCols, colWidths, viewType]);

    // ===== "전체" 탭 데이터 (모든 날짜 합산, 내림차순) =====
    const isAllTab = activeTab === data.length;

    useEffect(() => {
        const restoreState = reloadRestoreRef.current;
        if (!restoreState || restoreState.activeRestored || data.length === 0) return;
        restoreState.activeRestored = true;
        if (restoreState.activeTargetDate === '__all__') {
            setActiveTab(data.length);
            setAllTabMonth(restoreState.allTabMonth || null);
            setAllTabWeek(restoreState.allTabWeek || null);
        } else if (restoreState.activeTargetDate) {
            const targetIdx = data.findIndex(item => item.target_date === restoreState.activeTargetDate);
            if (targetIdx >= 0) {
                setActiveTab(targetIdx);
                setAllTabMonth(null);
                setAllTabWeek(null);
            }
        }
        if (typeof window !== 'undefined') {
            setTimeout(() => window.scrollTo(restoreState.scrollX || 0, restoreState.scrollY || 0), 120);
        }
    }, [data]);

    useEffect(() => {
        if (isAllTab || data.length === 0 || activeTab < 0) return;
        if (hasValidOrderRows(data[activeTab], viewType)) return;
        const fallbackIdx = findDefaultValidTabIndex(data, viewType, todayKey);
        if (fallbackIdx !== activeTab) setActiveTab(fallbackIdx);
    }, [activeTab, data, isAllTab, todayKey, viewType]);

    const periodOptions = useMemo(() => {
        const validItems = (data || []).filter(item => hasValidOrderRows(item, viewType));
        const months = [...new Set(validItems.map(item => item.target_date.slice(5, 7)))].sort();
        const weekMap = new Map();
        validItems.forEach((item) => {
            const week = getWeekFilterRange(item.target_date);
            if (week && !weekMap.has(week.key)) weekMap.set(week.key, week);
        });
        return {
            dates: validItems.map(item => item.target_date),
            months,
            weeks: [...weekMap.values()].sort((a, b) => a.start.localeCompare(b.start)),
        };
    }, [data, viewType]);

    const validDateSet = useMemo(() => new Set(periodOptions.dates), [periodOptions.dates]);
    const selectedDailyIndex = useMemo(() => {
        if (activeTab >= 0 && activeTab < data.length) return activeTab;
        return findDefaultValidTabIndex(data, viewType, todayKey);
    }, [activeTab, data, todayKey, viewType]);
    const visibleDateTabs = useMemo(() => {
        if (!data || data.length === 0) return [];
        const limit = Math.min(QUICK_DATE_TAB_LIMIT, data.length);
        const fallbackIndex = data.findIndex(item => item.target_date >= todayKey);
        const baseIndex = selectedDailyIndex >= 0
            ? selectedDailyIndex
            : (fallbackIndex >= 0 ? fallbackIndex : data.length - 1);
        let start = Math.max(0, baseIndex - Math.floor(limit / 2));
        start = Math.min(start, Math.max(0, data.length - limit));
        return data.slice(start, start + limit).map((item, offset) => ({ item, idx: start + offset }));
    }, [data, selectedDailyIndex, todayKey]);
    const periodMode = !isAllTab ? 'daily' : (allTabWeek ? 'weekly' : (allTabMonth ? 'monthly' : 'total'));

    useEffect(() => {
        if (!tabsRef.current) return;
        const selector = activeTab >= 0 && activeTab < data.length
            ? `[data-tab-index="${activeTab}"]`
            : '[data-period-tab="total"]';
        const el = tabsRef.current.querySelector(selector);
        if (el) scrollDateTabHorizontally(tabsRef.current, el);
    }, [activeTab, data.length, visibleDateTabs, periodMode]);
    const effectiveDisplayLimit = periodMode === 'daily' ? DAILY_DISPLAY_LIMIT : displayLimit;

    const mergedView = useMemo(() => {
        if (!data || data.length === 0) return null;
        const eligibleItems = data.filter(item => hasValidOrderRows(item, viewType));
        const baseHeaders = mergeDispatchHeaders(eligibleItems);
        const mHeaders = ['날짜', ...baseHeaders];
        const mRows = [];
        const mComments = {};
        const mWebCellRows = [];
        const sorted = [...eligibleItems].sort((a, b) => b.target_date.localeCompare(a.target_date));
        sorted.forEach(item => {
            // 전체 탭 기간 필터: 월간/주간 중 하나만 적용
            const itemMonth = item.target_date.slice(5, 7);
            if (allTabMonth && itemMonth !== allTabMonth) return;
            if (allTabWeek && (item.target_date < allTabWeek.start || item.target_date > allTabWeek.end)) return;
            const { mm, dd, day } = formatTabLabel(item.target_date);
            const dateLabel = `${mm}/${dd}(${day})`;
            (item.data || []).forEach((row, origIdx) => {
                const newIdx = mRows.length;
                const mappedRow = mapDispatchRowToHeaders(row, item.headers || [], baseHeaders);
                mRows.push([dateLabel, ...mappedRow]);
                mWebCellRows.push(item.webCellRows?.[origIdx] || null);
                Object.entries(item.comments || {}).forEach(([key, val]) => {
                    const [ri, ci] = key.split(':').map(Number);
                    if (ri !== origIdx) return;
                    const mappedCi = findMergedHeaderIndex(baseHeaders, item.headers?.[ci]);
                    if (mappedCi >= 0) mComments[`${newIdx}:${mappedCi + 1}`] = val;
                });
            });
        });
        // 사용할 수 있는 월/주 목록
        const months = [...new Set(eligibleItems.map(d => d.target_date.slice(5, 7)))].sort();
        const weekMap = new Map();
        eligibleItems.forEach((item) => {
            const week = getWeekFilterRange(item.target_date);
            if (week && !weekMap.has(week.key)) weekMap.set(week.key, week);
        });
        const weeks = [...weekMap.values()].sort((a, b) => a.start.localeCompare(b.start));
        return { headers: mHeaders, data: mRows, comments: mComments, webCellRows: mWebCellRows, months, weeks };
    }, [data, allTabMonth, allTabWeek, viewType]);

    useEffect(() => {
        if (!isAllTab || !mergedView) return;
        if (allTabWeek && !mergedView.weeks.some(week => week.key === allTabWeek.key)) setAllTabWeek(null);
        if (allTabMonth && !mergedView.months.includes(allTabMonth)) setAllTabMonth(null);
    }, [isAllTab, mergedView, allTabWeek, allTabMonth]);

    // ===== 현재 뷰 데이터 =====
    const activeItem = useMemo(() => isAllTab ? null : data[activeTab], [isAllTab, data, activeTab]);
    const currentView = useMemo(() => {
        if (isAllTab) return mergedView;
        return activeItem ? { headers: activeItem.headers, data: activeItem.data, comments: activeItem.comments || {}, webCellRows: activeItem.webCellRows || [] } : null;
    }, [activeItem, isAllTab, mergedView]);
    const dashboardCachePayload = dashboardCacheState.viewType === viewType ? dashboardCacheState.payload : null;
    const dashboardCacheChecked = dashboardCacheState.viewType === viewType && dashboardCacheState.checked;
    const dashboardNeedsFullData = useMemo(() => (
        mainView === 'dashboard'
        && dashboardCacheChecked
        && !dashboardCachePayload
        && (data || []).some(item => item?.meta_only && hasValidOrderRows(item, viewType))
    ), [dashboardCacheChecked, dashboardCachePayload, data, mainView, viewType]);
    useEffect(() => {
        if (dashboardNeedsFullData) {
            ensureDispatchFullLoaded();
            return;
        }
        if (isAllTab) {
            ensureDispatchFullLoaded();
            return;
        }
        if (activeItem?.meta_only && activeItem?.target_date) {
            ensureDispatchDateLoaded(activeItem.target_date);
        }
    }, [activeItem?.meta_only, activeItem?.target_date, dashboardNeedsFullData, ensureDispatchDateLoaded, ensureDispatchFullLoaded, isAllTab]);
    const headers = useMemo(() => currentView?.headers || [], [currentView]);
    const allData = useMemo(() => currentView?.data || [], [currentView]);
    const comments = useMemo(() => currentView?.comments || {}, [currentView]);
    const webCellRows = useMemo(() => currentView?.webCellRows || [], [currentView]);
    const columnWidthStyle = useCallback((width) => (
        width ? { width, minWidth: width, maxWidth: width } : undefined
    ), []);

    // 날짜 정보
    const dateInfo = useMemo(() => {
        if (isAllTab) {
            // [v5.10.10] isAllTab일 때 가장 최근 업데이트된 시간을 찾아 표시 (data[0]은 가장 오래된 날짜일 수 있음)
            const maxTs = data && data.length > 0 ? Math.max(...data.map(d => new Date(d.file_modified_at || 0).getTime())) : null;
            return { label: '전체 날짜 합산', type: '전체', isRed: false, fileModStr: fmtTs(maxTs) };
        }
        if (!activeItem?.target_date) return null;
        const ds = activeItem.target_date;
        const d = new Date(ds + 'T00:00:00');
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        // [v4.4.40] 토요일(6)은 공휴일에서 제외
        const isRed = d.getDay() === 0 || isHoliday(ds);
        return {
            label: `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`,
            type: isRed ? '공휴일' : '평일', isRed,
            fileModStr: fmtTs(activeItem.file_modified_at)
        };
    }, [activeItem, isAllTab, data]);
    const hasHeaderStatus = Boolean(dateInfo?.fileModStr || elapsed || syncStatus || dispatchFullDataLoading);
    const detailScope = useMemo(() => {
        if (isAllTab || !activeItem?.target_date) return null;
        return {
            dispatchType: viewType,
            targetDate: activeItem.target_date,
        };
    }, [activeItem?.target_date, isAllTab, viewType]);
    const detailSourceConfirmationToken = useMemo(() => {
        if (!detailScope || detailScope.dispatchType !== 'integrated') return '';
        return ['glovis', 'mobis']
            .map((dispatchType) => dispatchConfirmationMap[dispatchConfirmationMapKey(detailScope.targetDate, dispatchType)])
            .filter((confirmation) => confirmation?.active)
            .map((confirmation) => confirmation.id)
            .join('|');
    }, [detailScope, dispatchConfirmationMap]);
    const integratedDetailConfirmation = detailScope
        ? dispatchConfirmationMap[dispatchConfirmationMapKey(detailScope.targetDate, 'integrated')]
        : null;
    const effectiveDetailConfirmation = detailConfirmation?.active
        ? detailConfirmation
        : (integratedDetailConfirmation?.active ? integratedDetailConfirmation : detailConfirmation);
    const detailStatusConfirmation = effectiveDetailConfirmation || detailConfirmation;
    const detailConfirmationLocked = Boolean(effectiveDetailConfirmation?.active);
    const detailConfirmationActionScope = detailScope && effectiveDetailConfirmation?.active && effectiveDetailConfirmation.dispatch_type === 'integrated'
        ? { dispatchType: 'integrated', targetDate: detailScope.targetDate }
        : detailScope;
    const detailChangeSyncConfirmationToken = detailConfirmation?.active
        ? detailConfirmation.id
        : detailSourceConfirmationToken;
    const detailChangeSyncEnabled = Boolean(detailChangeSyncConfirmationToken);
    const getDetailAuthHeaders = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
    }, [supabase]);

    useEffect(() => {
        if (!['detail', 'detail-change'].includes(mainView) || !detailScope) {
            setDetailStateLoading(false);
            setDetailConfirmation(null);
            setDetailConfirmationSetupRequired(false);
            setDetailOverrideSetupRequired(false);
            setDetailChangeEvents([]);
            setDetailChangeSetupRequired(false);
            setDetailChangeDrafts({});
            setDetailChangePortOverrides({});
            setDetailPortOverrides({});
            setDetailDgOverrides({});
            setDetailRfOverrides({});
            detailChangeSyncRef.current = '';
            return undefined;
        }

        let cancelled = false;
        setDetailStateLoading(true);
        const params = new URLSearchParams({
            dispatchType: detailScope.dispatchType,
            targetDate: detailScope.targetDate,
        });
        const loadDetailState = async () => {
            try {
                const authHeaders = await getDetailAuthHeaders();
                const [confirmationResponse, overrideResponse, changeResponse] = await Promise.all([
                    fetch(`/api/branches/asan/dispatch/confirmation?${params.toString()}`, { cache: 'no-store', headers: authHeaders }),
                    fetch(`/api/branches/asan/dispatch/detail-override?${params.toString()}`, { cache: 'no-store', headers: authHeaders }),
                    fetch(`/api/branches/asan/dispatch/change-events?${params.toString()}`, { cache: 'no-store', headers: authHeaders }),
                ]);
                const confirmationPayload = await confirmationResponse.json().catch(() => ({}));
                const overridePayload = await overrideResponse.json().catch(() => ({}));
                const changePayload = await changeResponse.json().catch(() => ({}));
                if (!confirmationResponse.ok) throw new Error(confirmationPayload.error || '배차확정 상태 조회 실패');
                if (!overrideResponse.ok) throw new Error(overridePayload.error || 'BKG확정 상태 조회 실패');
                if (!changeResponse.ok) throw new Error(changePayload.error || '배차변동내역 조회 실패');
                if (cancelled) return;
                setDetailConfirmation(confirmationPayload.data || null);
                setDetailConfirmationSetupRequired(Boolean(confirmationPayload.setupRequired));
                setDetailOverrideSetupRequired(Boolean(overridePayload.setupRequired));
                setDetailChangeSetupRequired(Boolean(changePayload.setupRequired));
                setDetailChangeEvents(changePayload.data || []);
                const nextOverrides = {};
                const nextStartOverrides = {};
                const nextPortOverrides = {};
                const nextDgOverrides = {};
                const nextRfOverrides = {};
                (overridePayload.data || [])
                    .filter(row => row.field_key === 'confirmed_bkg')
                    .forEach((row) => {
                        nextOverrides[row.detail_line_key] = {
                            value: row.value || '',
                            source: row.source || 'manual',
                            updatedBy: row.updated_by_name || row.updated_by || row.created_by_name || row.created_by || '',
                            updatedAt: row.updated_at || row.created_at || '',
                        };
                    });
                (overridePayload.data || [])
                    .filter(row => row.field_key === DETAIL_START_OVERRIDE_FIELD_KEY)
                    .forEach((row) => {
                        nextStartOverrides[row.detail_line_key] = {
                            value: row.value || '',
                            source: row.source || 'manual',
                            updatedBy: row.updated_by_name || row.updated_by || row.created_by_name || row.created_by || '',
                            updatedAt: row.updated_at || row.created_at || '',
                        };
                    });
                (overridePayload.data || [])
                    .filter(row => row.field_key === DETAIL_PORT_OVERRIDE_FIELD_KEY)
                    .forEach((row) => {
                        nextPortOverrides[row.detail_line_key] = {
                            value: row.value || '',
                            source: row.source || 'manual',
                            updatedBy: row.updated_by_name || row.updated_by || row.created_by_name || row.created_by || '',
                            updatedAt: row.updated_at || row.created_at || '',
                        };
                    });
                (overridePayload.data || [])
                    .filter(row => row.field_key === DETAIL_DG_OVERRIDE_FIELD_KEY)
                    .forEach((row) => {
                        nextDgOverrides[row.detail_line_key] = {
                            value: normalizeDispatchDgValue(row.value),
                            source: row.source || 'manual',
                            updatedBy: row.updated_by_name || row.updated_by || row.created_by_name || row.created_by || '',
                            updatedAt: row.updated_at || row.created_at || '',
                        };
                    });
                (overridePayload.data || [])
                    .filter(row => row.field_key === DETAIL_RF_OVERRIDE_FIELD_KEY || row.field_key === DETAIL_LEGACY_DG_RF_OVERRIDE_FIELD_KEY)
                    .forEach((row) => {
                        nextRfOverrides[row.detail_line_key] = {
                            value: normalizeDispatchRfValue(row.value),
                            source: row.source || 'manual',
                            updatedBy: row.updated_by_name || row.updated_by || row.created_by_name || row.created_by || '',
                            updatedAt: row.updated_at || row.created_at || '',
                        };
                    });
                setDetailBkgOverrides(nextOverrides);
                setDetailStartOverrides(nextStartOverrides);
                setDetailPortOverrides(nextPortOverrides);
                setDetailDgOverrides(nextDgOverrides);
                setDetailRfOverrides(nextRfOverrides);
            } catch (error) {
                if (!cancelled) {
                    setDetailConfirmation(null);
                    setDetailBkgOverrides({});
                    setDetailStartOverrides({});
                    setDetailPortOverrides({});
                    setDetailDgOverrides({});
                    setDetailRfOverrides({});
                    setDetailChangeEvents([]);
                    setSyncStatus({ message: error.message || '상세배차 상태 조회 실패', isError: true });
                }
            } finally {
                if (!cancelled) setDetailStateLoading(false);
            }
        };
        loadDetailState();
        return () => { cancelled = true; };
    }, [detailScope, detailStateRefreshToken, getDetailAuthHeaders, mainView]);

    useEffect(() => {
        if (!activeItem?.target_date || isAllTab) {
            setDispatchConfirmationMap({});
            return undefined;
        }

        let cancelled = false;
        const targetDate = activeItem.target_date;
        const loadDispatchConfirmations = async () => {
            try {
                const authHeaders = await getDetailAuthHeaders();
                const rows = await Promise.all(ASAN_DISPATCH_VIEW_TYPES.map(async (dispatchType) => {
                    const params = new URLSearchParams({ dispatchType, targetDate });
                    const response = await fetch(`/api/branches/asan/dispatch/confirmation?${params.toString()}`, {
                        cache: 'no-store',
                        headers: authHeaders,
                    });
                    const payload = await response.json().catch(() => ({}));
                    if (!response.ok) throw new Error(payload.error || '배차확정 상태 조회 실패');
                    return [dispatchConfirmationMapKey(targetDate, dispatchType), payload.data || null];
                }));
                if (!cancelled) setDispatchConfirmationMap(Object.fromEntries(rows));
            } catch {
                if (!cancelled) setDispatchConfirmationMap({});
            }
        };
        loadDispatchConfirmations();
        return () => { cancelled = true; };
    }, [activeItem?.target_date, detailStateRefreshToken, getDetailAuthHeaders, isAllTab]);

    useEffect(() => {
        if (!detailHeaderFilterDropdown) return undefined;
        const closeOnOutsidePointer = (event) => {
            const target = event.target;
            if (target?.closest?.('[data-detail-header-filter-root="true"]')) return;
            setDetailHeaderFilterDropdown(null);
        };
        document.addEventListener('mousedown', closeOnOutsidePointer);
        return () => document.removeEventListener('mousedown', closeOnOutsidePointer);
    }, [detailHeaderFilterDropdown]);

    // 경과 시간 카운터 (1초마다 업데이트)
    useEffect(() => {
        const fileTs = isAllTab 
            ? (data && data.length > 0 ? Math.max(...data.map(d => new Date(d.file_modified_at || 0).getTime())) : null)
            : activeItem?.file_modified_at;
            
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

    const downloadCurrentScreenWorkbook = async ({ title, sheetName, fileName, headers: exportHeaders, rows, extraSheets = [], timeFormat }) => {
        if (!exportHeaders?.length) return;
        const response = await fetch('/api/branches/asan/export/view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                sheetName,
                fileName,
                headers: exportHeaders,
                rows,
                extraSheets,
                timeFormat,
                generatedAt: `다운로드 ${fmtShortTs(new Date().toISOString())} / ${rows.length.toLocaleString()}건`,
            }),
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || '현재 화면 다운로드 실패');
        }
        const blob = await response.blob();
        triggerBlobDownload(blob, getDownloadFileName(response, fileName));
    };

    const detailDisplayRowToExportRow = ({ line, changeEvent }) => {
        const row = detailLineToRow(line);
        const changeUpdatedAt = fmtShortTs(changeEvent?.occurred_at || changeEvent?.updated_at || changeEvent?.created_at || '');
        return changeUpdatedAt ? setDetailRowValue(row, '수정일시', changeUpdatedAt) : row;
    };

    // 엑셀 다운로드
    const handleDownload = async () => {
        const dateParam = isAllTab ? 'all' : activeItem?.target_date;
        if (!dateParam) return;
        const datePart = makeDownloadDatePart({ isAllTab, activeItem, allTabMonth, allTabWeek });
        const baseName = viewType === 'integrated' ? '통합현황' : viewType === 'glovis' ? '글로비스KD' : '모비스AS';

        try {
            if (mainView === 'detail' || mainView === 'detail-change') {
                const detailModeName = mainView === 'detail' ? '상세배차내역' : '배차변동내역';
                const exportHeaders = mainView === 'detail' ? DISPATCH_DETAIL_HEADERS : DISPATCH_CHANGE_HEADERS;
                const exportRows = mainView === 'detail'
                    ? detailRowsForDisplay.map(detailDisplayRowToExportRow)
                    : detailChangeRows.map(({ values }) => values);
                const glapsUploadRows = buildGlapsUploadRowsFromDetailRows({
                    headers: exportHeaders,
                    rows: exportRows,
                    skipDeleted: mainView === 'detail-change',
                });
                await downloadCurrentScreenWorkbook({
                    title: `아산 ${baseName} ${detailModeName} ${datePart}`,
                    sheetName: detailModeName,
                    fileName: `아산_${baseName}_${detailModeName}_${datePart}.xlsx`,
                    headers: exportHeaders,
                    rows: exportRows,
                    timeFormat: 'compact',
                    extraSheets: [{
                        sheetName: GLAPS_UPLOAD_SHEET_NAME,
                        headers: GLAPS_UPLOAD_HEADERS,
                        rows: glapsUploadRows,
                        textHeaders: ['배차요청일자'],
                        timeFormat: 'compact',
                    }],
                });
                return;
            }

            if (mainView === 'grid') {
                const exportHeaders = visibleCols.map(ci => headers[ci]);
                const exportRows = displayRows.map(({ row }) => visibleCols.map(ci => row[ci] ?? ''));
                await downloadCurrentScreenWorkbook({
                    title: `아산 ${baseName} 배차판 ${datePart}`,
                    sheetName: '배차판',
                    fileName: `아산_${baseName}_배차판_${datePart}.xlsx`,
                    headers: exportHeaders,
                    rows: exportRows,
                });
                return;
            }

            const monthParam = isAllTab && allTabMonth ? `&month=${allTabMonth}` : '';
            const weekParam = isAllTab && allTabWeek ? `&weekStart=${allTabWeek.start}&weekEnd=${allTabWeek.end}` : '';
            const url = `/api/branches/asan/export?type=${viewType}&date=${dateParam}${monthParam}${weekParam}`;
            const a = document.createElement('a');
            a.href = url;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (error) {
            setSyncStatus({ message: '다운로드 실패: ' + error.message, isError: true });
            setTimeout(() => setSyncStatus(null), 5000);
        }
    };

    const centerCols = useMemo(() => { const s = new Set(); headers.forEach((h, i) => { if (CENTER_HEADERS.has(h.trim())) s.add(i); }); return s; }, [headers]);
    
    // ===== 통합현황 데이터 정렬 (글로비스 KD -> 모비스 AS 순서) =====
    const dataWithIndices = useMemo(() => {
        if (!allData) return [];
        return allData.map((row, idx) => {
            const r = [...row];
            r.origIdx = idx; // DB 저장 순서 (comments 키 기준)
            r.webCellMeta = webCellRows[idx] || null;
            return r;
        });
    }, [allData, webCellRows]);

    const processedData = useMemo(() => {
        if (viewType !== 'integrated' || !dataWithIndices || dataWithIndices.length === 0) return dataWithIndices;
        const shipperIdx = findCol(headers, '화주');
        if (shipperIdx === -1) return dataWithIndices;

        return [...dataWithIndices].sort((a, b) => {
            const valA = String(a[shipperIdx] || '');
            const valB = String(b[shipperIdx] || '');
            
            // 글로비스 우선순위 1
            const isGlovisA = valA.includes('글로비스');
            const isGlovisB = valB.includes('글로비스');
            if (isGlovisA && !isGlovisB) return -1;
            if (!isGlovisA && isGlovisB) return 1;

            // 모비스 우선순위 2
            const isMobisA = valA.includes('모비스');
            const isMobisB = valB.includes('모비스');
            if (isMobisA && !isMobisB) return -1;
            if (!isMobisA && isMobisB) return 1;

            return 0;
        });
    }, [dataWithIndices, headers, viewType]);

    const searchResult = useMemo(() => doSearch(processedData, headers, searchTerm), [processedData, headers, searchTerm]);

    // 보이는 컬럼 인덱스
    const visibleCols = useMemo(() => headers.map((h, i) => i).filter(i => {
        const h = headers[i];
        if (isDispatchWebCellField(h)) return true;
        if (viewType === 'integrated' && isMobisCountryDisplayHeader(h)) return false;
        if (hiddenCols.has(h)) return false;
        // [v5.10.20] col_NN 형식(의미없는 익명 컬럼)은 자동 숨김
        if (/^col_\d+$/.test(h)) return false;
        return true;
    }), [headers, hiddenCols, viewType]);

    // 필터 적용된 행 (Set으로 검색 최적화)
    const displayRows = useMemo(() => {
        let rows = processedData.map((row) => {
            let status = 'normal';
            
            // 1. 특이사항(구분이 수출/수입 외 다른 것일 때) - 최우선 순위
            const gIdx = findCol(headers, '구분');
            if (gIdx !== -1) {
                const gVal = String(row[gIdx] || '').trim();
                if (gVal && !['수출', '수입'].includes(gVal)) {
                    status = 'other_category';
                }
            }

            // 2. 언매치/미확정(?) 체크
            if (status !== 'other_category') {
                if (row.some(c => String(c || '').includes('?'))) {
                    status = 'warn';
                } else {
                    const getVal = (name) => parseOrderQty(row[findCol(headers, name)]);
                    let o = 0, d = 0;
                    if (viewType === 'glovis') { o = getVal('오더'); d = getEffectiveDispatchQty(headers, row); }
                    else if (viewType === 'mobis') { o = getVal('수량') || getVal('계'); d = getEffectiveDispatchQty(headers, row); }
                    else { o = getVal('오더(계)') || getVal('수량'); d = getEffectiveDispatchQty(headers, row); }
                    if (o !== d) status = 'warn';
                }
            }
            return { row, idx: row.origIdx, status };
        });

        if (searchResult.indices) {
            const idxSet = new Set(searchResult.indices);
            rows = rows.filter(r => idxSet.has(r.idx));
        }
        Object.entries(columnFilters).forEach(([col, val]) => { rows = rows.filter(r => r.row[parseInt(col)] === val); });

        if (colorFilter) { rows = rows.filter(r => r.status === colorFilter); }

        return rows;
    // [BUG FIX] processedData를 deps에 추가: integrated 뷰 정렬 후 row.origIdx가 올바르게 반영되어야 comments key가 일치함
    }, [processedData, headers, viewType, searchResult, columnFilters, colorFilter]);
    const hasActiveFilter = searchResult.indices !== null || Object.keys(columnFilters).length > 0 || Boolean(colorFilter);
    const summary = useMemo(() => {
        const rows = hasActiveFilter ? displayRows.map((item) => item.row) : processedData;
        return calcSummary(headers, rows, viewType);
    }, [headers, processedData, displayRows, viewType, hasActiveFilter]);

    const detailLines = useMemo(() => buildDispatchDetailLines({
        headers,
        rows: processedData,
        workDate: isAllTab ? '' : activeItem?.target_date || '',
        comments,
    }), [headers, processedData, isAllTab, activeItem?.target_date, comments]);

    const glapsRouteMap = useMemo(() => {
        const map = new Map();
        (glapsDetailLookup.routes || []).forEach((route) => {
            const waypointCandidates = [...new Set([route.waypoint_els_name, route.waypoint_name].filter(Boolean))];
            const startCandidates = getGlapsRouteLocationCodeCandidates(route.start_location_name);
            const destinationCandidates = getGlapsRouteLocationCodeCandidates(route.destination_name);
            startCandidates.forEach((startLocationName) => {
                waypointCandidates.forEach((waypointElsName) => {
                    destinationCandidates.forEach((destinationName) => {
                        const key = buildGlapsRouteFingerprint({
                            shipperCode: getGlapsRouteShipperCode(route),
                            startLocationName,
                            waypointElsName,
                            destinationName,
                        });
                        if (key && !map.has(key)) map.set(key, route);
                    });
                });
            });
        });
        return map;
    }, [glapsDetailLookup.routes]);

    const glapsAliasMaps = useMemo(() => ({
        routeLocation: buildGlapsAliasCodeMapForTypes(glapsDetailLookup.aliases || [], ['start', 'destination', 'port']),
        waypoint: buildGlapsAliasCodeMapForTypes(glapsDetailLookup.aliases || [], ['waypoint']),
        port: buildGlapsAliasCodeMap(glapsDetailLookup.aliases || [], 'port'),
        portOptions: buildGlapsAliasCodeOptionsMap(glapsDetailLookup.aliases || [], 'port'),
        line: buildGlapsAliasCodeMap(glapsDetailLookup.aliases || [], 'line'),
        containerType: buildGlapsAliasCodeMap(glapsDetailLookup.aliases || [], 'container_type'),
        containerIso: buildGlapsContainerIsoCodeMap(glapsDetailLookup.sheetRows || []),
        carrier: buildGlapsAliasCodeMap(glapsDetailLookup.aliases || [], 'carrier'),
        consignee: buildGlapsAliasCodeMap(glapsDetailLookup.aliases || [], 'consignee'),
        orderType: buildGlapsSheetCodeMap(glapsDetailLookup.sheetRows || [], '수출입코드', '수출입구분', '코드'),
        transportService: buildGlapsTransportServiceCodeMap(glapsDetailLookup.sheetRows || []),
    }), [glapsDetailLookup.aliases, glapsDetailLookup.sheetRows]);

    const glapsShipperCodeMap = useMemo(
        () => buildGlapsShipperCodeMap(glapsDetailLookup.routes || []),
        [glapsDetailLookup.routes],
    );
    const glapsSpecialConsigneeRules = useMemo(
        () => glapsDetailLookup.specialRules || [],
        [glapsDetailLookup.specialRules],
    );

    const enrichDetailLine = useCallback((line = {}, options = {}) => {
        const startOverride = options.startOverride || null;
        const bkgOverride = options.bkgOverride || null;
        const portOverride = options.portOverride || null;
        const dgOverride = options.dgOverride || null;
        const rfOverride = options.rfOverride || null;
        const snapshotValues = Array.isArray(options.snapshotValues) ? options.snapshotValues : [];
        const snapshotConfirmedBkg = getDetailRowValue(snapshotValues, 'BKG확정');
        const snapshotBkgSource = snapshotConfirmedBkg ? inferBkgSourceFromDetailValues(snapshotValues) : '';
        const sourceStartLocation = startOverride
            ? startOverride.value || ''
            : (
                Object.prototype.hasOwnProperty.call(options, 'startLocation')
                    ? options.startLocation || ''
                    : line.startLocation || ''
            );
        const carrierCode = getGlapsAliasCode(glapsAliasMaps.carrier, 'ELS');
        const specialShipperCode = resolveGlapsSpecialShipperCode(glapsSpecialConsigneeRules, {
            waypointName: line.workplace,
            waypointElsName: line.workplace,
            shipperName: line.shipper,
        });
        const lineShipperCode = specialShipperCode || getGlapsAliasCode(glapsShipperCodeMap, line.shipper);
        const specialStartLocation = startOverride ? '' : resolveGlapsSpecialStartLocation(glapsSpecialConsigneeRules, {
            shipperCode: lineShipperCode,
            waypointName: line.workplace,
            waypointElsName: line.workplace,
            shipperName: line.shipper,
        });
        const startLocation = specialStartLocation || sourceStartLocation;
        const routeKeys = buildGlapsDispatchRouteFingerprintsWithAliasMaps({
            shipperCode: lineShipperCode,
            startLocationName: startLocation,
            waypointElsName: line.workplace,
            destinationName: line.destination,
            routeLocationAliasMap: glapsAliasMaps.routeLocation,
            waypointAliasMap: glapsAliasMaps.waypoint,
        });
        const glapsRoute = routeKeys.map(key => glapsRouteMap.get(key)).find(Boolean) || null;
        const portCodeOverride = String(options.portCodeOverride || portOverride?.value || line.glapsPortCodeOverride || '').trim();
        const glapsPortCodeOptions = getGlapsAliasCodeOptions(glapsAliasMaps.portOptions, line.port);
        const glapsPortCode = getGlapsAliasDefaultCode(glapsAliasMaps.portOptions, line.port, portCodeOverride)
            || getGlapsAliasCode(glapsAliasMaps.port, line.port);
        const glapsLineCode = getGlapsAliasCode(glapsAliasMaps.line, line.line);
        const glapsTypeCode = getGlapsAliasCode(glapsAliasMaps.containerType, line.containerType)
            || getGlapsAliasCode(glapsAliasMaps.containerIso, line.containerType);
        const dgFlag = dgOverride
            ? normalizeDispatchDgValue(dgOverride.value)
            : normalizeDispatchDgValue(line.dgFlag);
        const rfFlag = rfOverride
            ? normalizeDispatchRfValue(rfOverride.value, line.containerType)
            : normalizeDispatchRfValue(line.rfFlag ?? line.dgRfFlag, line.containerType);
        const glapsOrderTypeCode = getGlapsAliasCode(glapsAliasMaps.orderType, line.direction);
        const glapsTransportServiceCode = inferGlapsTransportServiceCode(glapsAliasMaps.transportService, line.direction);
        const routeShipperCode = getGlapsRouteShipperCode(glapsRoute) || getGlapsRoutePayload(glapsRoute, ['화주사코드', '화주사']);
        const glapsShipperCode = routeShipperCode || lineShipperCode;
        const glapsStartLocationCode = glapsRoute?.start_location_name || '';
        const glapsWorkplaceCode = getGlapsRouteWaypointCode(glapsRoute);
        const glapsDestinationCode = glapsRoute?.destination_name || '';
        const glapsSpecialConsigneeCode = resolveGlapsSpecialConsigneeCode(glapsSpecialConsigneeRules, {
            shipperCode: glapsShipperCode,
            waypointName: glapsRoute?.waypoint_name || '',
            waypointElsName: line.workplace || glapsRoute?.waypoint_els_name || '',
        });
        const glapsConsigneeCode = glapsSpecialConsigneeCode || getGlapsAliasCode(glapsAliasMaps.consignee, line.customer);
        const confirmedBkg = bkgOverride ? bkgOverride.value : snapshotConfirmedBkg || line.confirmedBkg || line.bkg1 || '';
        const startUpdatedAt = startOverride?.updatedAt || '';
        const portUpdatedAt = portOverride?.updatedAt || '';
        const dgUpdatedAt = dgOverride?.updatedAt || '';
        const rfUpdatedAt = rfOverride?.updatedAt || '';
        const bkgUpdatedAt = bkgOverride?.updatedAt || '';
        const confirmedAt = options.confirmedAt || '';
        const shouldMarkStartUpdated = Boolean(startUpdatedAt && confirmedAt && isTimestampAfter(startUpdatedAt, confirmedAt));
        const shouldMarkPortUpdated = Boolean(portUpdatedAt && confirmedAt && isTimestampAfter(portUpdatedAt, confirmedAt));
        const shouldMarkDgUpdated = Boolean(dgUpdatedAt && confirmedAt && isTimestampAfter(dgUpdatedAt, confirmedAt));
        const shouldMarkRfUpdated = Boolean(rfUpdatedAt && confirmedAt && isTimestampAfter(rfUpdatedAt, confirmedAt));
        const shouldMarkBkgUpdated = Boolean(bkgUpdatedAt && (!confirmedAt || isTimestampAfter(bkgUpdatedAt, confirmedAt)));
        return {
            ...line,
            glapsCarrierBpCode: carrierCode || '',
            startLocation,
            startLocationUpdatedAt: shouldMarkStartUpdated ? startUpdatedAt : '',
            startLocationUpdatedBy: shouldMarkStartUpdated ? startOverride?.updatedBy || '' : '',
            confirmedBkg,
            confirmedBkgSource: bkgOverride?.source || snapshotBkgSource || line.confirmedBkgSource || (confirmedBkg ? inferBkgSourceFromDetailValues(detailLineToRow({ ...line, confirmedBkg })) : 'BKG1'),
            confirmedBkgUpdatedAt: shouldMarkBkgUpdated ? bkgUpdatedAt : '',
            confirmedBkgUpdatedBy: shouldMarkBkgUpdated ? bkgOverride?.updatedBy || '' : '',
            detailUpdatedAt: line.detailUpdatedAt || (shouldMarkBkgUpdated ? fmtShortTs(bkgUpdatedAt) : ''),
            detailUpdatedBy: shouldMarkBkgUpdated ? bkgOverride?.updatedBy || '' : '',
            needsStartLocationSelection: !startLocation,
            glapsRouteName: glapsRoute?.route_name || '',
            glapsRouteCode: glapsRoute?.route_code || '',
            glapsPortCode,
            glapsPortCodeUpdatedAt: shouldMarkPortUpdated ? portUpdatedAt : '',
            glapsPortCodeUpdatedBy: shouldMarkPortUpdated ? portOverride?.updatedBy || '' : '',
            glapsPortCodeOptions,
            glapsLineCode,
            glapsTypeCode,
            dgFlag,
            dgUpdatedAt: shouldMarkDgUpdated ? dgUpdatedAt : '',
            dgUpdatedBy: shouldMarkDgUpdated ? dgOverride?.updatedBy || '' : '',
            rfFlag,
            rfUpdatedAt: shouldMarkRfUpdated ? rfUpdatedAt : '',
            rfUpdatedBy: shouldMarkRfUpdated ? rfOverride?.updatedBy || '' : '',
            glapsOrderTypeCode,
            glapsShipperCode,
            glapsStartLocationCode,
            glapsWorkplaceCode,
            glapsDestinationCode,
            glapsTransportServiceCode,
            glapsConsigneeCode,
            needsRouteCodeMapping: !glapsRoute?.route_code,
            needsOrderTypeCodeMapping: Boolean(line.direction) && !glapsOrderTypeCode,
            needsShipperCodeMapping: Boolean(line.shipper) && !glapsShipperCode,
            needsRoutePartCodeMapping: Boolean(glapsRoute?.route_code)
                && (!glapsStartLocationCode || !glapsWorkplaceCode || !glapsDestinationCode),
            needsPortCodeMapping: Boolean(line.port) && !glapsPortCode,
            needsLineCodeMapping: Boolean(line.line) && !glapsLineCode,
            needsTypeCodeMapping: Boolean(line.containerType) && !glapsTypeCode,
            needsCarrierCodeMapping: !carrierCode,
            needsConsigneeCodeMapping: Boolean(line.customer) && !glapsConsigneeCode,
        };
    }, [glapsAliasMaps, glapsRouteMap, glapsShipperCodeMap, glapsSpecialConsigneeRules]);

    const detailConfirmationSnapshotByLineKey = useMemo(() => {
        const map = new Map();
        const snapshots = detailConfirmation?.snapshot_lines || detailConfirmation?.snapshotLines || [];
        (snapshots || []).forEach((snapshot) => {
            const key = getConfirmationSnapshotLineKey(snapshot);
            if (key && !map.has(key)) map.set(key, snapshot);
        });
        return map;
    }, [detailConfirmation]);

    const detailDisplayLines = useMemo(() => detailLines.map((line) => {
        const lineKey = makeDispatchDetailLineKey(line);
        const startOverride = detailStartOverrides[lineKey] || null;
        const bkgOverride = detailBkgOverrides[lineKey] || null;
        const portOverride = detailPortOverrides[lineKey] || null;
        const dgOverride = detailDgOverrides[lineKey] || null;
        const rfOverride = detailRfOverrides[lineKey] || null;
        const snapshotValues = getConfirmationSnapshotValues(detailConfirmationSnapshotByLineKey.get(lineKey));
        const enriched = enrichDetailLine(line, {
            startOverride,
            bkgOverride,
            portOverride,
            dgOverride,
            rfOverride,
            confirmedAt: detailConfirmation?.confirmed_at || '',
            snapshotValues,
        });
        const rowValues = detailLineToRow(enriched);
        const memoDiffHeaders = [...getDetailMemoDiffSet(snapshotValues, rowValues)];
        return {
            ...enriched,
            memoBaseValues: snapshotValues,
            memoDiffHeaders,
            bkgConfirmStale: isDetailBkgConfirmStale({ ...enriched, memoDiffHeaders }),
        };
    }), [detailBkgOverrides, detailConfirmation?.confirmed_at, detailConfirmationSnapshotByLineKey, detailDgOverrides, detailLines, detailPortOverrides, detailRfOverrides, detailStartOverrides, enrichDetailLine]);

    const searchedDetailLines = useMemo(() => {
        const term = String(searchTerm || '').trim().toLowerCase();
        if (!term) return detailDisplayLines;
        return detailDisplayLines.filter(line => detailLineToRow(line).some((value) => String(value || '').toLowerCase().includes(term)));
    }, [detailDisplayLines, searchTerm]);

    const detailLinesBeforeHeaderFilter = useMemo(() => {
        return searchedDetailLines.filter((line) => matchesDetailIssueFilter(line, detailIssueFilter));
    }, [searchedDetailLines, detailIssueFilter]);

    const filteredDetailLines = useMemo(() => {
        const activeFilters = detailHeaderFilters[DETAIL_HEADER_FILTER_MODES.detail] || {};
        return detailLinesBeforeHeaderFilter.filter(line => (
            detailRowMatchesHeaderFilters(detailLineToRow(line), DISPATCH_DETAIL_HEADERS, activeFilters)
        ));
    }, [detailHeaderFilters, detailLinesBeforeHeaderFilter]);

    const detailSummary = useMemo(() => ({
        ...summarizeDispatchDetailLines(detailDisplayLines),
        visible: filteredDetailLines.length,
    }), [detailDisplayLines, filteredDetailLines.length]);

    const detailSnapshotLines = useMemo(() => (
        detailDisplayLines.map(line => makeDispatchChangeSnapshotLine(line, makeDispatchDetailLineKey(line)))
    ), [detailDisplayLines]);

    const detailSnapshotSignature = useMemo(() => (
        detailSnapshotLines.map(line => `${line.detailLineKey}:${line.rowFingerprint}:${makeDispatchMemoSignature(line.rowValues)}`).join('|')
    ), [detailSnapshotLines]);

    const detailChangeSummary = useMemo(() => {
        const activeEvents = detailChangeEvents || [];
        const quantityDelta = activeEvents.reduce((sum, event) => sum + Number(event.quantity_delta || 0), 0);
        return {
            total: activeEvents.length,
            pending: activeEvents.filter(event => event.event_status !== 'confirmed').length,
            confirmed: activeEvents.filter(event => event.event_status === 'confirmed').length,
            quantityDelta,
            confirmedBaseTotal: Math.max(0, detailSummary.total - quantityDelta),
            finalTotal: detailSummary.total,
        };
    }, [detailChangeEvents, detailSummary.total]);

    const detailChangeEventByLineKey = useMemo(() => {
        const map = new Map();
        (detailChangeEvents || []).forEach((event) => {
            const key = event.detail_line_key
                || event.editable_payload?.detailLineKey
                || event.after_snapshot?.detailLineKey
                || event.before_snapshot?.detailLineKey
                || '';
            if (key && !map.has(key)) map.set(key, event);
        });
        return map;
    }, [detailChangeEvents]);

    const detailRowsForDisplay = useMemo(() => (
        filteredDetailLines
            .map((line, index) => ({
                line,
                index,
                changeEvent: detailChangeEventByLineKey.get(makeDispatchDetailLineKey(line)) || null,
            }))
            .sort((a, b) => {
                const aChanged = a.changeEvent ? 1 : 0;
                const bChanged = b.changeEvent ? 1 : 0;
                if (aChanged !== bChanged) return aChanged - bChanged;
                return a.index - b.index;
            })
    ), [detailChangeEventByLineKey, filteredDetailLines]);

    const buildDetailChangeDisplayValues = useCallback((event, rawValues = [], options = {}) => {
        const line = enrichDetailLine(detailLineFromChangeValues(rawValues, event, {
            portCodeOverride: options.portCodeOverride || '',
        }));
        return detailLineToRow(line);
    }, [enrichDetailLine]);

    const detailChangeRowsBase = useMemo(() => {
        const term = String(searchTerm || '').trim().toLowerCase();
        return (detailChangeEvents || [])
            .filter(event => !detailChangeStatusFilter || event.event_status === detailChangeStatusFilter)
            .map((event) => {
                const storedValues = changeEventToEditableValues(event);
                const rawValues = detailChangeDrafts[event.id] || storedValues;
                const portCodeOverride = detailChangePortOverrides[event.id] || getChangeEventPayloadContext(event).glapsPortCodeOverride || '';
                const line = enrichDetailLine(detailLineFromChangeValues(rawValues, event, { portCodeOverride }));
                const editableValues = detailLineToRow(line);
                const eventChangedAt = fmtShortTs(event.occurred_at || event.updated_at || event.created_at || '');
                const displayEditableValues = eventChangedAt && !getDetailRowValue(editableValues, '수정일시')
                    ? setDetailRowValue(editableValues, '수정일시', eventChangedAt)
                    : editableValues;
                const hasCalculatedDiff = editableValues.some((value, idx) => value !== (storedValues[idx] || ''));
                const changedHeaderSet = getDisplayChangedHeaderSet(event);
                const memoBaseValues = snapshotRowValues(event.before_snapshot);
                const memoDiffHeaders = memoBaseValues.length > 0
                    ? [...getDetailMemoDiffSet(memoBaseValues, displayEditableValues)]
                    : [];
                const values = [
                    ...displayEditableValues,
                    formatDispatchChangeType(event.change_type),
                    formatDispatchChangeStatus(event.event_status),
                    eventChangedAt,
                    fmtShortTs(event.confirmed_at || ''),
                    '',
                ];
                return {
                    event,
                    changedHeaderSet,
                    hasCalculatedDiff,
                    line: {
                        ...line,
                        memoBaseValues,
                        memoDiffHeaders,
                        bkgConfirmStale: isDetailBkgConfirmStale({ ...line, memoDiffHeaders }),
                    },
                    rawValues,
                    values,
                };
            })
            .filter(({ values }) => !term || values.some(value => String(value || '').toLowerCase().includes(term)));
    }, [detailChangeDrafts, detailChangeEvents, detailChangePortOverrides, detailChangeStatusFilter, enrichDetailLine, searchTerm]);

    const detailChangeRows = useMemo(() => {
        const activeFilters = detailHeaderFilters[DETAIL_HEADER_FILTER_MODES.change] || {};
        const activeSort = getDetailHeaderSort(detailHeaderSorts, DETAIL_HEADER_FILTER_MODES.change);
        return detailChangeRowsBase.filter(({ values }) => (
            detailRowMatchesHeaderFilters(values, DISPATCH_CHANGE_HEADERS, activeFilters)
        )).sort((a, b) => compareDispatchChangeRowsBySort(a, b, DISPATCH_CHANGE_HEADERS, activeSort));
    }, [detailChangeRowsBase, detailHeaderFilters, detailHeaderSorts]);

    const detailHeaderFilterOptions = useMemo(() => ({
        [DETAIL_HEADER_FILTER_MODES.detail]: buildDetailHeaderFilterOptions(
            detailLinesBeforeHeaderFilter.map(line => detailLineToRow(line)),
            DISPATCH_DETAIL_HEADERS,
        ),
        [DETAIL_HEADER_FILTER_MODES.change]: buildDetailHeaderFilterOptions(
            detailChangeRowsBase.map(({ values }) => values),
            DISPATCH_CHANGE_HEADERS,
        ),
    }), [detailChangeRowsBase, detailLinesBeforeHeaderFilter]);

    useEffect(() => {
        if (!detailScope || !detailChangeSyncEnabled) return undefined;
        if (detailChangeSetupRequired || detailConfirmationSetupRequired || detailSnapshotLines.length === 0) return undefined;
        if (loading || refreshing || detailStateLoading || glapsLookupLoading) return undefined;
        const signature = `${detailChangeSyncConfirmationToken}:${detailSnapshotSignature}`;
        if (!detailSnapshotSignature || detailChangeSyncRef.current === signature) return undefined;

        let cancelled = false;
        const syncChanges = async () => {
            if (cancelled || detailChangeSyncRef.current === signature) return;
            detailChangeSyncRef.current = signature;
            try {
                const response = await fetch('/api/branches/asan/dispatch/change-events', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...await getDetailAuthHeaders() },
                    body: JSON.stringify({
                        ...detailScope,
                        action: 'sync',
                        currentLines: detailSnapshotLines,
                    }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload.error || '배차변동내역 동기화 실패');
                if (cancelled) return;
                if (payload.setupRequired) {
                    setDetailChangeSetupRequired(true);
                } else {
                    setDetailChangeEvents(payload.data || []);
                    setDetailChangeSetupRequired(false);
                }
            } catch (error) {
                if (!cancelled) {
                    detailChangeSyncRef.current = '';
                    setSyncStatus({ message: error.message || '배차변동내역 동기화 실패', isError: true });
                }
            }
        };
        const timer = setTimeout(syncChanges, 500);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [
        detailChangeSetupRequired,
        detailChangeSyncConfirmationToken,
        detailChangeSyncEnabled,
        detailConfirmationSetupRequired,
        detailScope,
        detailSnapshotLines,
        detailSnapshotSignature,
        detailStateLoading,
        getDetailAuthHeaders,
        glapsLookupLoading,
        loading,
        refreshing,
    ]);

    // 표시 제한 (성능 최적화)
    const limitedRows = useMemo(() => displayRows.slice(0, effectiveDisplayLimit), [displayRows, effectiveDisplayLimit]);
    const hasMore = displayRows.length > effectiveDisplayLimit;

    const uniqueVals = useMemo(() => {
        if (filterDropdown === null) return [];
        const vals = new Set(); allData.forEach(row => { const v = row[filterDropdown]; if (v) vals.add(String(v)); }); return [...vals].sort();
    }, [filterDropdown, allData]);

    const updateWebCellValueInData = useCallback((meta, fieldKey, value) => {
        const fieldLabel = getDispatchWebCellFieldLabel(fieldKey);
        if (!meta?.rowSignature || !fieldLabel) return;
        setData(prev => prev.map(item => {
            if (item.target_date !== meta.targetDate) return item;
            const rowIdx = (item.webCellRows || []).findIndex(rowMeta => (
                rowMeta?.rowSignature === meta.rowSignature && rowMeta?.sourceType === meta.sourceType
            ));
            if (rowIdx < 0) return item;
            const colIdx = (item.headers || []).findIndex(header => normalizeDispatchWebCellFieldKey(header) === fieldKey);
            if (colIdx < 0) return item;
            const nextRows = (item.data || []).map((row, idx) => {
                if (idx !== rowIdx) return row;
                const nextRow = [...row];
                nextRow[colIdx] = value;
                return nextRow;
            });
            return { ...item, data: nextRows };
        }));
    }, []);

    const expandWebCellColumnWidth = useCallback((fieldKey, nextValue) => {
        const colIdx = headers.findIndex(header => normalizeDispatchWebCellFieldKey(header) === fieldKey);
        if (colIdx < 0) return;
        const header = headers[colIdx];
        const nextWidth = estimateDispatchColumnWidth(header, [
            ...allData.map(row => row?.[colIdx] ?? ''),
            nextValue,
        ]);
        setColWidths(prev => {
            const current = Number(prev[header] || 0);
            if (current >= nextWidth) return prev;
            return { ...prev, [header]: nextWidth };
        });
    }, [allData, headers]);

    useEffect(() => {
        if (!headers.length || !allData.length) return;
        const nextWidths = {};
        headers.forEach((header, colIdx) => {
            const fieldKey = normalizeDispatchWebCellFieldKey(header);
            if (!fieldKey) return;
            nextWidths[header] = estimateDispatchColumnWidth(header, allData.map(row => row?.[colIdx] ?? ''));
        });
        if (Object.keys(nextWidths).length === 0) return;
        setColWidths(prev => {
            let changed = false;
            const next = { ...prev };
            Object.entries(nextWidths).forEach(([header, width]) => {
                if (Number(next[header] || 0) >= width) return;
                next[header] = width;
                changed = true;
            });
            return changed ? next : prev;
        });
    }, [allData, headers]);

    const saveWebCellValue = useCallback(async ({ meta, fieldKey, value, previousValue }) => {
        const cellKey = makeWebCellClientKey(meta, fieldKey);
        if (!cellKey || !fieldKey) return previousValue;

        const validation = validateDispatchWebCellValue(fieldKey, value);
        if (!validation.ok) {
            setWebCellStatus(prev => ({ ...prev, [cellKey]: { state: 'error', message: validation.error } }));
            return undefined;
        }

        if (validation.value === String(previousValue ?? '').trim()) {
            setWebCellStatus(prev => {
                const next = { ...prev };
                delete next[cellKey];
                return next;
            });
            return validation.value;
        }

        setWebCellStatus(prev => ({ ...prev, [cellKey]: { state: 'saving', message: '저장 중' } }));
        try {
            const response = await fetch('/api/branches/asan/dispatch/web-cell', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dispatchType: meta.sourceType,
                    targetDate: meta.targetDate,
                    rowSignature: meta.rowSignature,
                    rowIndex: meta.sourceRowIndex,
                    fieldKey,
                    previousValue,
                    value: validation.value,
                    rowContext: meta.rowContext || {},
                }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'WEB 입력값 저장 실패');

            const savedValue = result.data?.value ?? validation.value;
            updateWebCellValueInData(meta, fieldKey, savedValue);
            expandWebCellColumnWidth(fieldKey, savedValue);
            setWebCellStatus(prev => ({ ...prev, [cellKey]: { state: 'saved', message: '저장됨' } }));
            setTimeout(() => {
                setWebCellStatus(prev => {
                    if (prev[cellKey]?.state !== 'saved') return prev;
                    const next = { ...prev };
                    delete next[cellKey];
                    return next;
                });
            }, 1500);
            return savedValue;
        } catch (error) {
            setWebCellStatus(prev => ({ ...prev, [cellKey]: { state: 'error', message: error.message || '저장 실패' } }));
            return undefined;
        }
    }, [expandWebCellColumnWidth, updateWebCellValueInData]);

    const updateDetailBkgDraft = useCallback((line, value, source = 'manual') => {
        const lineKey = makeDispatchDetailLineKey(line);
        setDetailBkgOverrides(prev => ({
            ...prev,
            [lineKey]: {
                ...(prev[lineKey] || {}),
                value,
                source,
            },
        }));
    }, []);

    const updateDetailStartDraft = useCallback((line, value) => {
        const lineKey = makeDispatchDetailLineKey(line);
        setDetailStartOverrides(prev => ({
            ...prev,
            [lineKey]: {
                ...(prev[lineKey] || {}),
                value: String(value ?? '').trim(),
                source: 'manual',
                dirty: true,
            },
        }));
    }, []);

    const saveDetailStartOverride = useCallback(async (line, value) => {
        if (!detailScope) return;
        const lineKey = makeDispatchDetailLineKey(line);
        const nextValue = String(value ?? '').trim();
        const currentOverride = detailStartOverrides[lineKey] || {};
        if (!currentOverride.dirty && nextValue === String(line.startLocation || '').trim()) return;
        setDetailStartOverrides(prev => ({
            ...prev,
            [lineKey]: {
                ...(prev[lineKey] || {}),
                value: nextValue,
                source: 'manual',
                dirty: true,
            },
        }));
        try {
            const response = await fetch('/api/branches/asan/dispatch/detail-override', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...await getDetailAuthHeaders() },
                body: JSON.stringify({
                    ...detailScope,
                    detailLineKey: lineKey,
                    fieldKey: DETAIL_START_OVERRIDE_FIELD_KEY,
                    value: nextValue,
                    source: 'manual',
                    rowContext: buildDetailLineContext({ ...line, startLocation: nextValue }),
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || '상차지 저장 실패');
            if (payload.setupRequired) setDetailOverrideSetupRequired(true);
            const savedAt = payload.data?.updated_at || payload.data?.created_at || new Date().toISOString();
            setDetailStartOverrides(prev => ({
                ...prev,
                [lineKey]: {
                    ...(prev[lineKey] || {}),
                    value: nextValue,
                    source: 'manual',
                    updatedAt: savedAt,
                    dirty: false,
                },
            }));
        } catch (error) {
            setSyncStatus({ message: error.message || '상차지 저장 실패', isError: true });
        }
    }, [detailScope, detailStartOverrides, getDetailAuthHeaders]);

    const saveDetailBkgOverride = useCallback(async (line, source, value) => {
        if (!detailScope) return;
        const lineKey = makeDispatchDetailLineKey(line);
        const nextValue = String(value ?? '').trim();
        const nextSource = BKG_CONFIRM_SOURCE_OPTIONS.includes(source) ? source : 'manual';
        setDetailBkgOverrides(prev => ({
            ...prev,
            [lineKey]: {
                ...(prev[lineKey] || {}),
                value: nextValue,
                source: nextSource,
            },
        }));
        try {
            const response = await fetch('/api/branches/asan/dispatch/detail-override', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...await getDetailAuthHeaders() },
                body: JSON.stringify({
                    ...detailScope,
                    detailLineKey: lineKey,
                    fieldKey: 'confirmed_bkg',
                    value: nextValue,
                    source: nextSource,
                    rowContext: buildDetailLineContext(line),
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'BKG확정 저장 실패');
            if (payload.setupRequired) setDetailOverrideSetupRequired(true);
        } catch (error) {
            setSyncStatus({ message: error.message || 'BKG확정 저장 실패', isError: true });
        }
    }, [detailScope, getDetailAuthHeaders]);

    const changeDetailBkgSource = useCallback((line, source) => {
        saveDetailBkgOverride(line, source, getDetailBkgValue(line, source));
    }, [saveDetailBkgOverride]);

    const saveDetailBkgManualInput = useCallback((line, value) => {
        if (line.confirmedBkgSource !== 'manual') return;
        saveDetailBkgOverride(line, 'manual', value);
    }, [saveDetailBkgOverride]);

    const saveDetailPortOverride = useCallback(async (line, value) => {
        if (!detailScope) return;
        const lineKey = makeDispatchDetailLineKey(line);
        const nextValue = String(value ?? '').trim();
        setDetailPortOverrides(prev => ({
            ...prev,
            [lineKey]: {
                ...(prev[lineKey] || {}),
                value: nextValue,
                source: 'manual',
            },
        }));
        try {
            const response = await fetch('/api/branches/asan/dispatch/detail-override', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...await getDetailAuthHeaders() },
                body: JSON.stringify({
                    ...detailScope,
                    detailLineKey: lineKey,
                    fieldKey: DETAIL_PORT_OVERRIDE_FIELD_KEY,
                    value: nextValue,
                    source: 'manual',
                    rowContext: buildDetailLineContext({ ...line, glapsPortCode: nextValue }),
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || '포트코드 저장 실패');
            if (payload.setupRequired) setDetailOverrideSetupRequired(true);
            const savedAt = payload.data?.updated_at || payload.data?.created_at || new Date().toISOString();
            setDetailPortOverrides(prev => ({
                ...prev,
                [lineKey]: {
                    ...(prev[lineKey] || {}),
                    value: nextValue,
                    source: 'manual',
                    updatedAt: savedAt,
                },
            }));
        } catch (error) {
            setSyncStatus({ message: error.message || '포트코드 저장 실패', isError: true });
        }
    }, [detailScope, getDetailAuthHeaders]);

    const saveDetailFlagOverride = useCallback(async (line, fieldKey, value) => {
        if (!detailScope) return;
        const lineKey = makeDispatchDetailLineKey(line);
        const isRf = fieldKey === DETAIL_RF_OVERRIDE_FIELD_KEY;
        const nextValue = isRf ? normalizeDispatchRfValue(value, line.containerType) : normalizeDispatchDgValue(value);
        const setOverrides = isRf ? setDetailRfOverrides : setDetailDgOverrides;
        setOverrides(prev => ({
            ...prev,
            [lineKey]: {
                ...(prev[lineKey] || {}),
                value: nextValue,
                source: 'manual',
            },
        }));
        try {
            const response = await fetch('/api/branches/asan/dispatch/detail-override', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...await getDetailAuthHeaders() },
                body: JSON.stringify({
                    ...detailScope,
                    detailLineKey: lineKey,
                    fieldKey,
                    value: nextValue,
                    source: 'manual',
                    rowContext: buildDetailLineContext(isRf ? { ...line, rfFlag: nextValue } : { ...line, dgFlag: nextValue }),
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || `${isRf ? 'RF' : 'DG'} 저장 실패`);
            if (payload.setupRequired) setDetailOverrideSetupRequired(true);
            const savedAt = payload.data?.updated_at || payload.data?.created_at || new Date().toISOString();
            setOverrides(prev => ({
                ...prev,
                [lineKey]: {
                    ...(prev[lineKey] || {}),
                    value: nextValue,
                    source: 'manual',
                    updatedAt: savedAt,
                },
            }));
        } catch (error) {
            setSyncStatus({ message: error.message || `${isRf ? 'RF' : 'DG'} 저장 실패`, isError: true });
        }
    }, [detailScope, getDetailAuthHeaders]);

    const changeDetailConfirmation = useCallback(async (action) => {
        if (!detailConfirmationActionScope || detailConfirmationSaving) return;
        if (action === 'cancel' && !window.confirm('배차확정을 취소할까요? 해당일자 상세배차 수정 잠금이 해제됩니다.')) return;
        if (action === 'confirm' && !window.confirm('해당일자 상세배차를 배차확정 처리할까요? 확정 후 기본 상세배차는 수정 잠금됩니다.')) return;

        setDetailConfirmationSaving(true);
        try {
            const response = await fetch('/api/branches/asan/dispatch/confirmation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...await getDetailAuthHeaders() },
                body: JSON.stringify({
                    ...detailConfirmationActionScope,
                    action,
                    snapshotLines: action === 'confirm' ? detailSnapshotLines : [],
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || '배차확정 처리 실패');
            if (payload.setupRequired) {
                setDetailConfirmationSetupRequired(true);
            } else {
                setDetailConfirmation(payload.data || null);
                setDetailConfirmationSetupRequired(false);
                detailChangeSyncRef.current = '';
                setDetailChangeDrafts({});
                setDetailChangePortOverrides({});
                setDetailStateRefreshToken(token => token + 1);
                setSyncStatus({
                    message: action === 'confirm' ? '배차확정 완료' : '배차확정 취소 완료',
                    isError: false,
                });
            }
        } catch (error) {
            setSyncStatus({ message: error.message || '배차확정 처리 실패', isError: true });
        } finally {
            setDetailConfirmationSaving(false);
        }
    }, [detailConfirmationActionScope, detailConfirmationSaving, detailSnapshotLines, getDetailAuthHeaders]);

    const updateDetailChangeDraft = useCallback((event, updater) => {
        if (!event?.id) return;
        setDetailChangeDrafts(prev => {
            const baseValues = prev[event.id] || changeEventToEditableValues(event);
            const nextValues = typeof updater === 'function' ? updater([...baseValues]) : updater;
            return {
                ...prev,
                [event.id]: DISPATCH_DETAIL_HEADERS.map((_, valueIdx) => String(nextValues?.[valueIdx] ?? '').trim()),
            };
        });
    }, []);

    const saveDetailChangeEvent = useCallback(async (event, rowValuesOverride = null, contextPatch = {}) => {
        if (!detailScope || !event?.id || detailChangeSaving) return;
        if (event.event_status === 'confirmed') {
            setSyncStatus({ message: '확인완료된 변동은 확인취소 후 수정할 수 있습니다.', isError: true });
            return;
        }
        const rowValues = rowValuesOverride || detailChangeDrafts[event.id] || changeEventToEditableValues(event);
        const basePayload = event.editable_payload || event.after_snapshot || event.before_snapshot || {};
        const rowContext = {
            ...buildDetailChangeRowContext(rowValues, basePayload.rowContext || {}),
            ...contextPatch,
        };
        setDetailChangeSaving(true);
        try {
            const response = await fetch('/api/branches/asan/dispatch/change-events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...await getDetailAuthHeaders() },
                body: JSON.stringify({
                    ...detailScope,
                    action: 'update',
                    eventId: event.id,
                    editablePayload: {
                        ...basePayload,
                        detailLineKey: basePayload.detailLineKey || event.detail_line_key || '',
                        identityKey: basePayload.identityKey || event.identity_key || '',
                        groupKey: '',
                        rowFingerprint: '',
                        rowValues,
                        rowContext,
                    },
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || '변동내역 수정 저장 실패');
            if (payload.setupRequired) {
                setDetailChangeSetupRequired(true);
            } else {
                setDetailChangeEvents(payload.data || []);
                setDetailChangeDrafts(prev => {
                    const next = { ...prev };
                    delete next[event.id];
                    return next;
                });
                setDetailChangePortOverrides(prev => {
                    const next = { ...prev };
                    delete next[event.id];
                    return next;
                });
                setSyncStatus({ message: '변동내역 수정 저장 완료', isError: false });
            }
        } catch (error) {
            setSyncStatus({ message: error.message || '변동내역 수정 저장 실패', isError: true });
        } finally {
            setDetailChangeSaving(false);
        }
    }, [detailChangeDrafts, detailChangeSaving, detailScope, getDetailAuthHeaders]);

    const saveDetailChangeValues = useCallback((event, rawValues, options = {}) => {
        const contextPatch = {};
        if (Object.prototype.hasOwnProperty.call(options, 'portCodeOverride')) {
            contextPatch.glapsPortCodeOverride = String(options.portCodeOverride || '').trim();
        }
        const calculatedValues = buildDetailChangeDisplayValues(event, rawValues, contextPatch);
        saveDetailChangeEvent(event, calculatedValues, contextPatch);
    }, [buildDetailChangeDisplayValues, saveDetailChangeEvent]);

    const confirmDetailChangeEvents = useCallback(async (eventIds = [], { bulk = false } = {}) => {
        if (!detailScope || detailChangeSaving) return;
        if (bulk && detailChangeSummary.pending === 0) return;
        setDetailChangeSaving(true);
        try {
            const response = await fetch('/api/branches/asan/dispatch/change-events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...await getDetailAuthHeaders() },
                body: JSON.stringify({
                    ...detailScope,
                    action: bulk ? 'confirm_all' : 'confirm',
                    eventIds,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || '변동내역 확인 처리 실패');
            if (payload.setupRequired) {
                setDetailChangeSetupRequired(true);
            } else {
                setDetailChangeEvents(payload.data || []);
                setSyncStatus({ message: bulk ? '변동내역 일괄확인 완료' : '변동내역 확인 완료', isError: false });
            }
        } catch (error) {
            setSyncStatus({ message: error.message || '변동내역 확인 처리 실패', isError: true });
        } finally {
            setDetailChangeSaving(false);
        }
    }, [detailChangeSaving, detailChangeSummary.pending, detailScope, getDetailAuthHeaders]);

    const unconfirmDetailChangeEvents = useCallback(async (eventIds = []) => {
        if (!detailScope || detailChangeSaving || eventIds.length === 0) return;
        setDetailChangeSaving(true);
        try {
            const response = await fetch('/api/branches/asan/dispatch/change-events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...await getDetailAuthHeaders() },
                body: JSON.stringify({
                    ...detailScope,
                    action: 'unconfirm',
                    eventIds,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || '변동내역 확인취소 실패');
            if (payload.setupRequired) {
                setDetailChangeSetupRequired(true);
            } else {
                setDetailChangeEvents(payload.data || []);
                setSyncStatus({ message: '변동내역 확인취소 완료', isError: false });
            }
        } catch (error) {
            setSyncStatus({ message: error.message || '변동내역 확인취소 실패', isError: true });
        } finally {
            setDetailChangeSaving(false);
        }
    }, [detailChangeSaving, detailScope, getDetailAuthHeaders]);

    // ===== 핸들러 =====
    const toggleFilter = (ci) => setFilterDropdown(prev => prev === ci ? null : ci);
    const applyFilter = (ci, val) => {
        if (val === null) setColumnFilters(prev => { const n = { ...prev }; delete n[ci]; return n; });
        else setColumnFilters(prev => ({ ...prev, [ci]: val }));
        setFilterDropdown(null);
    };
    const toggleDetailHeaderFilter = useCallback((mode, header) => {
        setDetailHeaderFilterDropdown(prev => (
            prev?.mode === mode && prev?.header === header ? null : { mode, header }
        ));
    }, []);
    const toggleDetailHeaderFilterValue = useCallback((mode, header, value) => {
        const normalizedValue = normalizeDetailFilterValue(value);
        setDetailHeaderFilters((prev) => {
            const next = sanitizeDetailHeaderFilters(prev);
            const modeFilters = { ...(next[mode] || {}) };
            const selected = new Set(modeFilters[header] || []);
            if (selected.has(normalizedValue)) selected.delete(normalizedValue);
            else selected.add(normalizedValue);
            if (selected.size === 0) delete modeFilters[header];
            else modeFilters[header] = [...selected];
            return { ...next, [mode]: modeFilters };
        });
    }, []);
    const toggleDetailHeaderFilterAll = useCallback((mode, header, options = []) => {
        const optionValues = [...new Set((options || []).map(option => normalizeDetailFilterValue(option?.value)))];
        setDetailHeaderFilters((prev) => {
            const next = sanitizeDetailHeaderFilters(prev);
            const modeFilters = { ...(next[mode] || {}) };
            const selected = new Set(modeFilters[header] || []);
            const allSelected = optionValues.length > 0
                && optionValues.every(value => selected.has(value))
                && selected.size === optionValues.length;
            if (allSelected || optionValues.length === 0) delete modeFilters[header];
            else modeFilters[header] = optionValues;
            return { ...next, [mode]: modeFilters };
        });
    }, []);
    const clearDetailHeaderFilter = useCallback((mode, header = '') => {
        setDetailHeaderFilters((prev) => {
            const next = sanitizeDetailHeaderFilters(prev);
            if (!header) return { ...next, [mode]: {} };
            const modeFilters = { ...(next[mode] || {}) };
            delete modeFilters[header];
            return { ...next, [mode]: modeFilters };
        });
    }, []);
    const applyDetailHeaderSort = useCallback((mode, header, direction) => {
        if (!DETAIL_HEADER_SORT_DIRECTIONS.has(direction)) return;
        setDetailHeaderSorts(prev => ({
            ...sanitizeDetailHeaderSorts(prev),
            [mode]: { header, direction },
        }));
    }, []);
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

    const handleDashboardIssueSelect = useCallback((issue) => {
        const targetIdx = data.findIndex((item) => item.target_date === issue.date && hasValidOrderRows(item, viewType));
        if (targetIdx >= 0) setActiveTab(targetIdx);
        setAllTabMonth(null);
        setAllTabWeek(null);
        setColumnFilters({});
        setColorFilter(null);
        setFilterDropdown(null);
        setDetailHeaderFilters(sanitizeDetailHeaderFilters());
        setDetailHeaderFilterDropdown(null);
        setDisplayLimit(100);
        const keyword = issue.search || issue.title || '';
        setSearchInput(keyword);
        setSearchTerm(keyword);
        setMainView('grid');
        requestAnimationFrame(() => {
            containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }, [data, viewType]);

    const handleOpenDailyGrid = useCallback(() => {
        setMainView('grid');
        setDisplayLimit(100);
        requestAnimationFrame(() => {
            resetScrollChainToTop(containerRef.current);
            (topBarRef.current || containerRef.current)?.scrollIntoView({ behavior: 'auto', block: 'start' });
        });
    }, []);

    const resetGridFilters = useCallback(() => {
        setSearchInput('');
        setSearchTerm('');
        setColumnFilters({});
        setFilterDropdown(null);
        setDetailHeaderFilters(sanitizeDetailHeaderFilters());
        setDetailHeaderFilterDropdown(null);
        setDisplayLimit(100);
    }, []);

    const selectDailyDate = useCallback((dateStr) => {
        const nextIdx = data.findIndex(item => item.target_date === dateStr && hasValidOrderRows(item, viewType));
        if (nextIdx < 0) return;
        setActiveTab(nextIdx);
        setAllTabMonth(null);
        setAllTabWeek(null);
        resetGridFilters();
    }, [data, resetGridFilters, viewType]);

    const selectWeekOption = useCallback((week) => {
        if (!week) return;
        setActiveTab(data.length);
        setAllTabWeek(week);
        setAllTabMonth(null);
        resetGridFilters();
    }, [data.length, resetGridFilters]);

    const selectMonthOption = useCallback((month) => {
        if (!month) return;
        setActiveTab(data.length);
        setAllTabMonth(month);
        setAllTabWeek(null);
        resetGridFilters();
    }, [data.length, resetGridFilters]);

    const selectTotalPeriod = useCallback(() => {
        setActiveTab(data.length);
        setAllTabMonth(null);
        setAllTabWeek(null);
        resetGridFilters();
    }, [data.length, resetGridFilters]);

    const handlePeriodModeClick = useCallback((mode) => {
        if (mode === 'daily') {
            const date = activeItem?.target_date || periodOptions.dates.find(d => d === todayKey) || periodOptions.dates[periodOptions.dates.length - 1];
            if (date) selectDailyDate(date);
            return;
        }
        if (mode === 'weekly') {
            const baseDate = activeItem?.target_date || todayKey;
            const week = findWeekOptionByDate(periodOptions.weeks, baseDate)
                || periodOptions.weeks[periodOptions.weeks.length - 1];
            selectWeekOption(week);
            return;
        }
        if (mode === 'monthly') {
            const baseMonth = (activeItem?.target_date || todayKey).slice(5, 7);
            const month = periodOptions.months.includes(baseMonth)
                ? baseMonth
                : periodOptions.months[periodOptions.months.length - 1];
            selectMonthOption(month);
            return;
        }
        selectTotalPeriod();
    }, [activeItem?.target_date, periodOptions, selectDailyDate, selectMonthOption, selectTotalPeriod, selectWeekOption, todayKey]);

    const renderDetailFilterHeader = (mode, header) => {
        const activeValues = getDetailHeaderFilterValues(detailHeaderFilters, mode, header);
        const options = detailHeaderFilterOptions?.[mode]?.[header] || [];
        const isOpen = detailHeaderFilterDropdown?.mode === mode && detailHeaderFilterDropdown?.header === header;
        const activeSort = getDetailHeaderSort(detailHeaderSorts, mode);
        const isSorted = activeSort?.header === header;
        const sortEnabled = mode === DETAIL_HEADER_FILTER_MODES.change;
        const activeValueSet = new Set(activeValues);
        const optionValues = [...new Set(options.map(option => normalizeDetailFilterValue(option.value)))];
        const allOptionsSelected = optionValues.length > 0
            && optionValues.every(value => activeValueSet.has(value))
            && activeValueSet.size === optionValues.length;
        const headerClasses = [
            detailColumnClass(header),
            styles.detailFilterHeader,
            activeValues.length > 0 ? styles.filteredHeader : '',
            isOpen ? styles.detailFilterHeaderOpen : '',
        ].filter(Boolean).join(' ');
        return (
            <th
                key={header}
                className={headerClasses}
                data-detail-header-filter-root="true"
                onClick={(event) => {
                    event.stopPropagation();
                    toggleDetailHeaderFilter(mode, header);
                }}
                title={`${header} 필터`}
            >
                <span className={styles.thText}>
                    {header}{activeValues.length > 0 && <span className={styles.filterIcon}>▼{activeValues.length}</span>}
                    {isSorted && <span className={styles.detailSortIcon}>{activeSort.direction === 'desc' ? '↓' : '↑'}</span>}
                </span>
                {isOpen && (
                    <div className={styles.detailFilterDropdown} onClick={event => event.stopPropagation()}>
                        {sortEnabled && (
                            <div className={styles.detailSortActions}>
                                <button
                                    type="button"
                                    className={isSorted && activeSort.direction === 'desc' ? styles.detailSortActionActive : ''}
                                    onClick={() => applyDetailHeaderSort(mode, header, 'desc')}
                                >
                                    내림차순
                                </button>
                                <button
                                    type="button"
                                    className={isSorted && activeSort.direction === 'asc' ? styles.detailSortActionActive : ''}
                                    onClick={() => applyDetailHeaderSort(mode, header, 'asc')}
                                >
                                    오름차순
                                </button>
                            </div>
                        )}
                        <div className={styles.detailFilterActions}>
                            <button type="button" onClick={() => toggleDetailHeaderFilterAll(mode, header, options)}>
                                {allOptionsSelected ? '전체취소' : '전체선택'}
                            </button>
                            {activeValues.length > 0 && <button type="button" onClick={() => clearDetailHeaderFilter(mode, header)}>필터해제</button>}
                            <span>{options.length.toLocaleString()}개 값</span>
                        </div>
                        <div className={styles.detailFilterList}>
                            {options.length > 0 ? options.map(option => (
                                <label
                                    key={`${header}-${option.value}`}
                                    className={`${styles.detailFilterOption} ${activeValueSet.has(option.value) ? styles.detailFilterOptionActive : ''}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={activeValueSet.has(option.value)}
                                        onChange={() => toggleDetailHeaderFilterValue(mode, header, option.value)}
                                    />
                                    <span title={displayDetailFilterValue(option.value)}>{displayDetailFilterValue(option.value)}</span>
                                    <em>{option.count.toLocaleString()}</em>
                                </label>
                            )) : (
                                <div className={styles.detailFilterEmpty}>선택할 값 없음</div>
                            )}
                        </div>
                    </div>
                )}
            </th>
        );
    };

    const dateControls = (
        <>
            <div className={styles.periodPickerBar}>
                <div className={styles.periodModeGroup} role="group" aria-label="배차판 기간 선택">
                    {[
                        ['daily', '일별'],
                        ['weekly', '주별'],
                        ['monthly', '월별'],
                        ['total', '전체'],
                    ].map(([mode, label]) => (
                        <button
                            key={mode}
                            type="button"
                            className={`${styles.periodModeBtn} ${periodMode === mode ? styles.periodModeBtnActive : ''}`}
                            onClick={() => handlePeriodModeClick(mode)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className={styles.periodSelectWrap}>
                    {periodMode === 'daily' && (
                        <select
                            className={styles.periodSelect}
                            value={activeItem?.target_date || ''}
                            onChange={(event) => selectDailyDate(event.target.value)}
                            aria-label="일별 날짜 선택"
                        >
                            {periodOptions.dates.map(date => {
                                const { mm, dd, day } = formatTabLabel(date);
                                return <option key={date} value={date}>{mm}/{dd}({day})</option>;
                            })}
                        </select>
                    )}
                    {periodMode === 'weekly' && (
                        <select
                            className={styles.periodSelect}
                            value={allTabWeek?.key || ''}
                            onChange={(event) => {
                                const week = periodOptions.weeks.find(item => item.key === event.target.value);
                                selectWeekOption(week);
                            }}
                            aria-label="주별 기간 선택"
                        >
                            {periodOptions.weeks.map(week => (
                                <option key={week.key} value={week.key}>{week.fullLabel || week.label}</option>
                            ))}
                        </select>
                    )}
                    {periodMode === 'monthly' && (
                        <select
                            className={styles.periodSelect}
                            value={allTabMonth || ''}
                            onChange={(event) => selectMonthOption(event.target.value)}
                            aria-label="월별 기간 선택"
                        >
                            {periodOptions.months.map(month => (
                                <option key={month} value={month}>{parseInt(month, 10)}월</option>
                            ))}
                        </select>
                    )}
                    {periodMode === 'total' && (
                        <span className={styles.periodTotalText}>누적 전체 {periodOptions.dates.length.toLocaleString()}일</span>
                    )}
                </div>
            </div>
            <div className={styles.dateTabs} ref={tabsRef}>
                {visibleDateTabs.map(({ item, idx }) => {
                    const { mm, dd, day } = formatTabLabel(item.target_date);
                    const tabType = getTabType(item.target_date);
                    const hasRows = validDateSet.has(item.target_date);
                    return (
                        <button
                            key={item.id}
                            type="button"
                            data-tab-index={idx}
                            className={`${styles.dateTab} ${styles[`tab_${tabType}`]} ${!hasRows ? styles.dateTabDisabled : ''} ${activeTab === idx ? styles.dateTabActive : ''}`}
                            disabled={!hasRows}
                            title={!hasRows ? '유효 오더 없음' : undefined}
                            onClick={() => selectDailyDate(item.target_date)}
                        >
                            <span className={styles.tabMonth}>{mm}/{dd}</span>
                            <span className={styles.tabDay}>({day})</span>
                        </button>
                    );
                })}
                {data.length > 0 && (
                    <button
                        type="button"
                        data-period-tab="total"
                        className={`${styles.dateTab} ${styles.tab_all} ${periodMode === 'total' ? styles.dateTabActive : ''}`}
                        onClick={selectTotalPeriod}
                    >
                        <span className={styles.tabMonth}>전체</span>
                    </button>
                )}
                {data.length > visibleDateTabs.length && (
                    <span className={styles.dateTabsMeta}>빠른 날짜 {visibleDateTabs.length}개 · 누적 {periodOptions.dates.length.toLocaleString()}일</span>
                )}
            </div>
        </>
    );

    // ===== 렌더링 =====
    return (
        <div className={styles.container} ref={containerRef} onClick={() => { setFilterDropdown(null); setShowColPanel(false); }}>
            {/* 상단 바: 뷰전환 + 검색 + 기존 헤더 기능 병합 */}
            <div ref={topBarRef} className={styles.topBar} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px', background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div className={styles.topBarLeft}>
                        <div className={styles.viewSwitch}>
                            <button className={`${styles.funcBtn} ${mainView === 'dashboard' ? styles.funcBtnActive : ''}`} onClick={() => setMainView('dashboard')}>
                                현황판
                            </button>
                            <button className={`${styles.funcBtn} ${mainView === 'grid' ? styles.funcBtnActive : ''}`} onClick={() => setMainView('grid')}>
                                배차판
                            </button>
                            <button className={`${styles.funcBtn} ${styles.mobileHiddenFuncBtn} ${mainView === 'detail' ? styles.funcBtnActive : ''}`} onClick={() => setMainView('detail')}>
                                상세배차내역
                            </button>
                            <button className={`${styles.funcBtn} ${styles.mobileHiddenFuncBtn} ${mainView === 'detail-change' ? styles.funcBtnActive : ''}`} onClick={() => setMainView('detail-change')}>
                                배차변동내역
                            </button>
                            <button className={`${styles.funcBtn} ${styles.mobileHiddenFuncBtn} ${mainView === 'glaps-master' ? styles.funcBtnActive : ''}`} onClick={() => setMainView('glaps-master')}>
                                GLAPS코드
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
                        {dateInfo && (
                            <div className={`${styles.headerBadge} ${dateInfo.isRed ? styles.headerBadgeRed : ''}`} style={{ marginLeft: '8px' }}>
                                {isAllTab ? '전체' : '선택일'} {dateInfo.label} {!isAllTab && `(${dateInfo.type})`}
                            </div>
                        )}
                    </div>
                    
                    <div className={styles.headerStatusArea}>
                        {hasHeaderStatus && (
                            <div className={styles.statusInfo}>
                                {(dateInfo?.fileModStr || elapsed) && (
                                    <div className={styles.fileMod}>
                                        <span className={styles.label}>저장:</span>
                                        <span className={styles.time}>{dateInfo?.fileModStr}</span>
                                        {elapsed && <span className={styles.elapsed}>{elapsed}</span>}
                                    </div>
                                )}
                                {syncStatus && (
                                    <div className={`${styles.syncMsg} ${syncStatus.isError ? styles.syncMsgError : ''}`}>
                                        {syncStatusPrefix(syncStatus)} · {syncStatus.message}
                                    </div>
                                )}
                                {dispatchFullDataLoading && (
                                    <div className={styles.syncMsg}>
                                        전체 기간 자료를 불러오는 중입니다.
                                    </div>
                                )}
                            </div>
                        )}
                        <div className={styles.headerButtons}>
                            <button className={styles.headerBtn} onClick={handleDownload}>엑셀</button>
                            <button className={styles.headerBtn} onClick={openSettings}>설정</button>
                            <button className={styles.headerBtn} onClick={handleRefreshData} disabled={refreshing} title="현재 보기와 날짜를 저장하고 페이지를 다시 불러옵니다">
                                {refreshing ? '새로고침 중' : '새로고침'}
                            </button>
                            <button className={`${styles.headerBtn} ${styles.headerBtnPoint}`} onClick={handleSync} disabled={syncActionBlocked}>
                                {syncButtonText}
                            </button>
                        </div>
                    </div>
                </div>

                {(mainView === 'grid' || mainView === 'detail' || mainView === 'detail-change') && (
                    <div className={styles.searchWrap} style={{ alignSelf: 'flex-start' }}>
                        <input className={styles.searchInput} placeholder={mainView === 'detail' ? '상세배차 검색' : '업체명 검색 (예: 이지, 대신)'} value={searchInput} onChange={e => setSearchInput(e.target.value)} />
                        {searchInput && <button className={styles.searchClear} onClick={() => { setSearchInput(''); setSearchTerm(''); }}>✕</button>}
                    </div>
                )}
            </div>

            {(mainView === 'grid' || mainView === 'detail' || mainView === 'detail-change') && dateControls}

            {mainView === 'glaps-master' ? (
                <AsanGlapsMaster refreshToken={glapsMasterRefreshToken} onMasterChanged={handleGlapsMasterChanged} />
            ) : loading ? (
                <div className={styles.emptyState}>데이터를 불러오는 중입니다...</div>
            ) : !currentView ? (
                <div className={styles.emptyState}>데이터가 없습니다. 상단 &apos;NAS 동기화&apos; 버튼을 누르세요.</div>
            ) : mainView === 'dashboard' ? (
                <AsanDashboard
                    data={allData}
                    headers={headers}
                    viewType={viewType}
                    sourceItems={data}
                    activeDate={isAllTab ? '' : activeItem?.target_date || ''}
                    selectedMonth={isAllTab ? allTabMonth || '' : ''}
                    dashboardCache={dashboardCachePayload}
                    dateControlsSlot={dateControls}
                    onOpenDailyGrid={handleOpenDailyGrid}
                    onViewTypeChange={setViewType}
                    onIssueSelect={handleDashboardIssueSelect}
                />
            ) : mainView === 'detail' ? (
                <>
                    <div className={styles.summaryBar}>
                        <div className={styles.summaryLeft}>
                            <span className={styles.summaryItem}><b>상세배차수량</b> {detailSummary.total.toLocaleString()}건</span>
                            {detailChangeSummary.total > 0 && (
                                <>
                                    <span className={`${styles.summaryItem} ${detailChangeSummary.pending > 0 ? styles.summaryWarn : ''}`}>
                                        <b>변동</b> {detailChangeSummary.quantityDelta >= 0 ? '+' : ''}{detailChangeSummary.quantityDelta.toLocaleString()}건 · 미확인 {detailChangeSummary.pending.toLocaleString()}건
                                    </span>
                                    <span className={styles.summaryItem}><b>최종수량</b> {detailChangeSummary.finalTotal.toLocaleString()}건</span>
                                </>
                            )}
                            {searchTerm && <span className={styles.summaryItem}><b>검색표시</b> {detailSummary.visible.toLocaleString()}건</span>}
                            {countDetailHeaderFilterValues(detailHeaderFilters[DETAIL_HEADER_FILTER_MODES.detail]) > 0 && (
                                <span className={styles.summaryItem}><b>헤더필터</b> {detailSummary.visible.toLocaleString()}건</span>
                            )}
                            <span className={`${styles.summaryItem} ${detailSummary.manualStartLocationCount > 0 ? styles.summaryWarn : ''}`}>
                                <b>상차지</b> {detailSummary.manualStartLocationCount.toLocaleString()}건
                            </span>
                            {detailIssueFilter && <span className={styles.summaryItem}><b>필터표시</b> {detailSummary.visible.toLocaleString()}건</span>}
                        </div>
                        <div className={styles.summaryRight}>
                            <div className={styles.detailConfirmPanel}>
                                {detailConfirmationLocked ? (
                                    <span className={styles.detailConfirmBadge}>
                                        배차확정 {fmtShortTs(detailStatusConfirmation?.confirmed_at)}
                                        {confirmationActorName(detailStatusConfirmation) ? ` · ${confirmationActorName(detailStatusConfirmation)}` : ''}
                                    </span>
                                ) : (
                                    <span className={styles.detailConfirmReady}>
                                        {detailScope ? '배차확정 전' : '일별 선택 필요'}
                                    </span>
                                )}
                                {detailConfirmationSetupRequired && (
                                    <span className={styles.detailConfirmWarning}>확정 DB 미적용</span>
                                )}
                                {detailOverrideSetupRequired && (
                                    <span className={styles.detailConfirmWarning}>BKG확정 DB 미적용</span>
                                )}
                                {detailChangeSetupRequired && (
                                    <span className={styles.detailConfirmWarning}>변동 DB 미적용</span>
                                )}
                                {detailScope && (
                                    <button
                                        type="button"
                                        className={detailConfirmationLocked ? styles.detailConfirmCancelButton : styles.detailConfirmButton}
                                        onClick={() => changeDetailConfirmation(detailConfirmationLocked ? 'cancel' : 'confirm')}
                                        disabled={detailConfirmationSaving || detailConfirmationSetupRequired}
                                    >
                                        {detailConfirmationLocked ? '배차확정취소' : '배차확정'}
                                    </button>
                                )}
                            </div>
                            <div className={styles.detailIssueFilters}>
                                {DETAIL_ISSUE_GROUPS.map(group => (
                                    <div key={group.key} className={styles.detailIssueGroup}>
                                        <span className={styles.detailIssueGroupLabel}>{group.label}</span>
                                        {group.filters.map((filter) => {
                                            const count = detailSummary[filter.countKey] || 0;
                                            const active = detailIssueFilter === filter.key;
                                            return (
                                                <button
                                                    key={filter.key}
                                                    type="button"
                                                    className={`${styles.detailIssueButton} ${active ? styles.detailIssueButtonActive : ''}`}
                                                    onClick={() => setDetailIssueFilter(active ? '' : filter.key)}
                                                    disabled={count === 0 && !active}
                                                >
                                                    {active ? filter.clearLabel : filter.label} {count.toLocaleString()}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className={styles.tableWrap}>
                        <div className={styles.tableScroll}>
                            <datalist id={DETAIL_START_LOCATION_DATALIST_ID}>
                                {GLAPS_START_LOCATION_OPTIONS.filter(Boolean).map((option) => (
                                    <option key={option} value={option} />
                                ))}
                            </datalist>
                            <table className={`${styles.table} ${styles.detailTable}`}>
                                <thead>
                                    <tr>
                                        {DISPATCH_DETAIL_HEADERS.map((header) => renderDetailFilterHeader(DETAIL_HEADER_FILTER_MODES.detail, header))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {detailRowsForDisplay.slice(0, effectiveDisplayLimit).map(({ line, changeEvent }, detailRowIdx) => {
                                        const lineKey = makeDispatchDetailLineKey(line);
                                        const rowValues = detailLineToRow(line);
                                        return (
                                            <tr key={lineKey} className={`${line.lineNo % 2 === 0 ? styles.evenRow : styles.oddRow} ${!line.startLocation ? styles.detailManualRow : ''} ${detailConfirmationLocked ? styles.detailLockedRow : ''} ${changeEvent ? styles.detailChangedRow : ''}`}>
                                                {DISPATCH_DETAIL_HEADERS.map((header, colIdx) => {
                                                    const memoCellClass = getDetailMemoCellClass(line, header);
                                                    const memoTooltip = memoCellClass ? buildDetailMemoTooltip(line, header) : '';
                                                    if (header === '상차지') {
                                                        const postConfirmClass = line.startLocationUpdatedAt ? styles.detailPostConfirmOverrideCell : '';
                                                        const postConfirmTitle = line.startLocationUpdatedAt
                                                            ? `배차확정 후 상차지 변경\n수정일시: ${fmtShortTs(line.startLocationUpdatedAt)}${line.startLocationUpdatedBy ? `\n수정자: ${line.startLocationUpdatedBy}` : ''}`
                                                            : `${line.startRegion || ''}${line.startSuffix ? ` / ${line.startSuffix}` : ''}`;
                                                        const editableStartLocation = canEditDetailStartLocation(line);
                                                        return (
                                                            <td key={header} className={[styles.detailStartCell, !line.startLocation ? styles.detailManualCell : '', postConfirmClass].filter(Boolean).join(' ')}>
                                                                {editableStartLocation ? (
                                                                    <input
                                                                        className={`${styles.detailComboInput} ${styles.detailStartInput}`}
                                                                        list={DETAIL_START_LOCATION_DATALIST_ID}
                                                                        data-detail-row-index={detailRowIdx}
                                                                        data-detail-col-index={colIdx}
                                                                        value={line.startLocation || ''}
                                                                        onChange={(event) => updateDetailStartDraft(line, event.target.value)}
                                                                        onBlur={(event) => saveDetailStartOverride(line, event.target.value)}
                                                                        onKeyDown={focusDetailGridInput}
                                                                        disabled={detailOverrideSetupRequired || !detailScope}
                                                                        placeholder="선택"
                                                                        title={postConfirmTitle}
                                                                    />
                                                                ) : (
                                                                    <span title={postConfirmTitle}>{line.startLocation || ''}</span>
                                                                )}
                                                            </td>
                                                        );
                                                    }
                                                    if (header === 'BKG확정') {
                                                        const isManualBkg = line.confirmedBkgSource === 'manual';
                                                        const isBkgStale = isDetailBkgConfirmStale(line);
                                                        return (
                                                            <td key={header} className={styles.detailBkgConfirmCell}>
                                                                <div className={styles.detailBkgConfirmControl}>
                                                                    <span
                                                                        className={`${styles.detailBkgSourceBadge} ${isManualBkg ? styles.detailBkgSourceManual : ''} ${isBkgStale ? styles.detailBkgSourceStale : ''}`}
                                                                        title={isBkgStale ? '선택된 BKG 원본값이 확정 이후 변경되었습니다.' : ''}
                                                                    >
                                                                        {isManualBkg ? '수기' : line.confirmedBkgSource || 'BKG1'}
                                                                    </span>
                                                                    <input
                                                                        className={styles.detailBkgConfirmInput}
                                                                        value={line.confirmedBkg || ''}
                                                                        onChange={(event) => {
                                                                            if (event.target.value === line.confirmedBkg) return;
                                                                            updateDetailBkgDraft(line, event.target.value, 'manual');
                                                                        }}
                                                                        onBlur={(event) => saveDetailBkgManualInput(line, event.target.value)}
                                                                        onKeyDown={focusDetailGridInput}
                                                                        data-detail-row-index={detailRowIdx}
                                                                        data-detail-col-index={colIdx}
                                                                        disabled={detailConfirmationLocked || detailOverrideSetupRequired || !detailScope}
                                                                        title={line.confirmedBkgSource && line.confirmedBkgSource !== 'manual' ? `${line.confirmedBkgSource} 선택값` : '수기 입력값'}
                                                                    />
                                                                </div>
                                                            </td>
                                                        );
                                                    }
                                                    if (BKG_CONFIRM_SOURCE_OPTIONS.includes(header)) {
                                                        const bkgValue = getDetailBkgValue(line, header);
                                                        const isSelectedBkg = line.confirmedBkgSource === header && Boolean(bkgValue) && bkgValue === line.confirmedBkg;
                                                        const isDisabledBkg = detailConfirmationLocked || detailOverrideSetupRequired || !detailScope || !bkgValue;
                                                        return (
                                                            <td
                                                                key={header}
                                                                className={[isSelectedBkg ? styles.detailBkgSelectedCell : '', memoCellClass].filter(Boolean).join(' ')}
                                                                title={memoTooltip}
                                                            >
                                                                {bkgValue ? (
                                                                    <button
                                                                        type="button"
                                                                        className={`${styles.detailBkgPickButton} ${isSelectedBkg ? styles.detailBkgPickButtonActive : ''}`}
                                                                        onClick={() => changeDetailBkgSource(line, header)}
                                                                        onKeyDown={focusDetailGridInput}
                                                                        data-detail-row-index={detailRowIdx}
                                                                        data-detail-col-index={colIdx}
                                                                        disabled={isDisabledBkg}
                                                                        title={`${header} 값을 BKG확정으로 적용`}
                                                                    >
                                                                        {bkgValue}
                                                                    </button>
                                                                ) : null}
                                                            </td>
                                                        );
                                                    }
                                                    if (header === '포트코드' && (line.glapsPortCodeOptions || []).length > 1) {
                                                        const postConfirmClass = line.glapsPortCodeUpdatedAt ? styles.detailPostConfirmOverrideCell : '';
                                                        const postConfirmTitle = line.glapsPortCodeUpdatedAt
                                                            ? `배차확정 후 포트코드 변경\n수정일시: ${fmtShortTs(line.glapsPortCodeUpdatedAt)}${line.glapsPortCodeUpdatedBy ? `\n수정자: ${line.glapsPortCodeUpdatedBy}` : ''}`
                                                            : `${line.port || ''} 포트코드 선택`;
                                                        return (
                                                            <td key={header} className={[styles.detailPortCodeCell, styles.detailPortCandidateCell, postConfirmClass].filter(Boolean).join(' ')}>
                                                                <select
                                                                    className={styles.detailPortSelect}
                                                                    value={line.glapsPortCode || ''}
                                                                    onChange={(event) => saveDetailPortOverride(line, event.target.value)}
                                                                    onKeyDown={focusDetailGridInput}
                                                                    data-detail-row-index={detailRowIdx}
                                                                    data-detail-col-index={colIdx}
                                                                    disabled={detailOverrideSetupRequired || !detailScope}
                                                                    title={postConfirmTitle}
                                                                >
                                                                    {(line.glapsPortCodeOptions || []).map(option => (
                                                                        <option key={option.code} value={option.code}>{formatGlapsPortOptionLabel(option)}</option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                        );
                                                    }
                                                    if (header === DISPATCH_DETAIL_DG_HEADER || header === DISPATCH_DETAIL_RF_HEADER) {
                                                        const isRf = header === DISPATCH_DETAIL_RF_HEADER;
                                                        const updatedAt = isRf ? line.rfUpdatedAt : line.dgUpdatedAt;
                                                        const updatedBy = isRf ? line.rfUpdatedBy : line.dgUpdatedBy;
                                                        const postConfirmClass = updatedAt ? styles.detailPostConfirmOverrideCell : '';
                                                        const postConfirmTitle = updatedAt
                                                            ? `배차확정 후 ${header} 변경\n수정일시: ${fmtShortTs(updatedAt)}${updatedBy ? `\n수정자: ${updatedBy}` : ''}`
                                                            : isRf ? `${line.containerType || ''} 기준 RF` : '위험물 여부';
                                                        return (
                                                            <td key={header} className={[styles.detailDgRfCell, postConfirmClass].filter(Boolean).join(' ')}>
                                                                <select
                                                                    className={styles.detailPortSelect}
                                                                    value={isRf ? normalizeDispatchRfValue(line.rfFlag ?? line.dgRfFlag, line.containerType) : normalizeDispatchDgValue(line.dgFlag)}
                                                                    onChange={(event) => saveDetailFlagOverride(line, isRf ? DETAIL_RF_OVERRIDE_FIELD_KEY : DETAIL_DG_OVERRIDE_FIELD_KEY, event.target.value)}
                                                                    onKeyDown={focusDetailGridInput}
                                                                    data-detail-row-index={detailRowIdx}
                                                                    data-detail-col-index={colIdx}
                                                                    disabled={detailOverrideSetupRequired || !detailScope}
                                                                    title={postConfirmTitle}
                                                                >
                                                                    <option value="N">N</option>
                                                                    <option value="Y">Y</option>
                                                                </select>
                                                            </td>
                                                        );
                                                    }
                                                    if (header === '수정일시' && changeEvent) {
                                                        const changeTooltip = buildDispatchChangeDiffTooltip(changeEvent);
                                                        return (
                                                            <td key={header}>
                                                                <span className={styles.detailChangeMarker} title={changeTooltip}>
                                                                    변경건
                                                                </span>
                                                                {rowValues[colIdx] ? <span className={styles.detailChangeMarkerText}>{rowValues[colIdx]}</span> : null}
                                                            </td>
                                                        );
                                                    }
                                                    return <td key={header} className={memoCellClass} title={memoTooltip}>{rowValues[colIdx]}</td>;
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className={styles.tableFooter}>
                            <span>
                                {Math.min(filteredDetailLines.length, effectiveDisplayLimit).toLocaleString()}건 표시
                                {searchTerm ? ` / 검색 ${filteredDetailLines.length.toLocaleString()}건` : ''}
                                {' '} / 전체 {detailSummary.total.toLocaleString()}건
                                {detailChangeSummary.total > 0 ? ` / 최종 ${detailChangeSummary.finalTotal.toLocaleString()}건` : ''}
                            </span>
                            {filteredDetailLines.length > effectiveDisplayLimit && (
                                <span className={styles.loadMoreWrap}>
                                    <button className={styles.loadMoreBtn} onClick={() => setDisplayLimit(p => p + 100)}>+100건 더 보기</button>
                                    <button className={styles.loadMoreBtn} onClick={() => setDisplayLimit(filteredDetailLines.length)}>전체 표시</button>
                                </span>
                            )}
                        </div>
                        {detailChangeSummary.total > 0 && (
                            <div className={styles.detailChangeInlinePanel}>
                                <div className={styles.detailChangeInlineHead}>
                                    <strong>확정 후 변동</strong>
                                    <span>추가/삭제/변경 {detailChangeSummary.total.toLocaleString()}건 · 미확인 {detailChangeSummary.pending.toLocaleString()}건 · 최종 {detailChangeSummary.finalTotal.toLocaleString()}건</span>
                                    <button type="button" className={styles.loadMoreBtn} onClick={() => setMainView('detail-change')}>변동내역 열기</button>
                                </div>
                                <div className={styles.detailChangeInlineList}>
                                    {detailChangeEvents.slice(0, 8).map((event) => {
                                        const values = changeEventToEditableValues(event);
                                        return (
                                            <span key={event.id} className={styles.detailChangeInlineItem}>
                                                <b>{formatDispatchChangeType(event.change_type)}</b>
                                                {values[DETAIL_CHANGE_COMPANY_COL] || '-'}
                                                {values[DETAIL_CHANGE_BKG_COL] ? ` · ${values[DETAIL_CHANGE_BKG_COL]}` : ''}
                                                <em>{formatDispatchChangeStatus(event.event_status)}</em>
                                            </span>
                                        );
                                    })}
                                    {detailChangeEvents.length > 8 && <span className={styles.detailChangeInlineItem}>외 {(detailChangeEvents.length - 8).toLocaleString()}건</span>}
                                </div>
                            </div>
                        )}
                    </div>
                </>
            ) : mainView === 'detail-change' ? (
                <>
                    <div className={styles.summaryBar}>
                        <div className={styles.summaryLeft}>
                            <span className={styles.summaryItem}><b>배차변동내역</b> {detailScope?.targetDate || '일별 선택 필요'}</span>
                            {detailStatusConfirmation?.id ? (
                                <span className={styles.summaryItem}>
                                    <b>{detailConfirmationLocked ? '확정기준' : '확정취소됨'}</b> {fmtShortTs(detailStatusConfirmation?.confirmed_at)}
                                    {confirmationActorName(detailStatusConfirmation) ? ` · ${confirmationActorName(detailStatusConfirmation)}` : ''}
                                </span>
                            ) : (
                                <span className={`${styles.summaryItem} ${styles.summaryWarn}`}><b>대기</b> 배차확정 후 변동 입력</span>
                            )}
                            <span className={`${styles.summaryItem} ${detailChangeSummary.pending > 0 ? styles.summaryWarn : ''}`}>
                                <b>미확인</b> {detailChangeSummary.pending.toLocaleString()}건
                            </span>
                            <span className={styles.summaryItem}><b>확인완료</b> {detailChangeSummary.confirmed.toLocaleString()}건</span>
                            <span className={styles.summaryItem}><b>최종수량</b> {detailChangeSummary.finalTotal.toLocaleString()}건</span>
                            {countDetailHeaderFilterValues(detailHeaderFilters[DETAIL_HEADER_FILTER_MODES.change]) > 0 && (
                                <span className={styles.summaryItem}><b>헤더필터</b> {detailChangeRows.length.toLocaleString()}건</span>
                            )}
                        </div>
                        <div className={styles.summaryRight}>
                            <div className={styles.detailIssueGroup}>
                                <span className={styles.detailIssueGroupLabel}>확인</span>
                                {DETAIL_CHANGE_STATUS_FILTERS.map((filter) => (
                                    <button
                                        key={filter.key || 'all'}
                                        type="button"
                                        className={`${styles.detailIssueButton} ${detailChangeStatusFilter === filter.key ? styles.detailIssueButtonActive : ''}`}
                                        onClick={() => setDetailChangeStatusFilter(filter.key)}
                                    >
                                        {filter.label}
                                    </button>
                                ))}
                            </div>
                            {detailChangeSummary.pending > 0 && (
                                <button
                                    type="button"
                                    className={styles.detailConfirmButton}
                                    onClick={() => confirmDetailChangeEvents(
                                        (detailChangeEvents || [])
                                            .filter(event => event.event_status !== 'confirmed')
                                            .map(event => event.id),
                                        { bulk: true },
                                    )}
                                    disabled={detailChangeSaving}
                                >
                                    일괄확인
                                </button>
                            )}
                            {detailScope && (
                                <button
                                    type="button"
                                    className={detailConfirmationLocked ? styles.detailConfirmCancelButton : styles.detailConfirmButton}
                                    onClick={() => changeDetailConfirmation(detailConfirmationLocked ? 'cancel' : 'confirm')}
                                    disabled={detailConfirmationSaving || detailConfirmationSetupRequired}
                                >
                                    {detailConfirmationLocked ? '배차확정취소' : '배차확정'}
                                </button>
                            )}
                        </div>
                    </div>
                    {detailChangeRowsBase.length > 0 ? (
                        <div className={styles.tableWrap}>
                            <div className={styles.tableScroll}>
                                <datalist id={DETAIL_START_LOCATION_DATALIST_ID}>
                                    {GLAPS_START_LOCATION_OPTIONS.filter(Boolean).map((option) => (
                                        <option key={option} value={option} />
                                    ))}
                                </datalist>
                                <table className={`${styles.table} ${styles.detailTable}`}>
                                    <thead>
                                        <tr>
                                            {DISPATCH_CHANGE_HEADERS.map((header) => renderDetailFilterHeader(DETAIL_HEADER_FILTER_MODES.change, header))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detailChangeRows.slice(0, effectiveDisplayLimit).map(({ event, changedHeaderSet, hasCalculatedDiff, line, rawValues, values }, rowIdx) => {
                                            const hasManualDraft = Boolean(detailChangeDrafts[event.id]);
                                            const hasDraft = hasManualDraft || hasCalculatedDiff;
                                            const isDeleteEvent = event.change_type === 'delete';
                                            const isConfirmedEvent = event.event_status === 'confirmed';
                                            const editDisabled = detailChangeSaving;
                                            return (
                                                <tr key={`change-${event.id}`} className={`${rowIdx % 2 === 0 ? styles.evenRow : styles.oddRow} ${isDeleteEvent ? styles.detailChangeDeleteRow : ''} ${isConfirmedEvent ? styles.detailChangeConfirmedRow : ''}`}>
                                                    {DISPATCH_CHANGE_HEADERS.map((header, colIdx) => {
                                                        const isDetailValue = colIdx < DISPATCH_DETAIL_HEADERS.length;
                                                        const isChangeType = header === '변동구분';
                                                        const isManage = header === '관리';
                                                        const memoCellClass = isDetailValue ? getDetailMemoCellClass(line, header) : '';
                                                        const memoTooltip = memoCellClass ? buildDetailMemoTooltip(line, header) : '';
                                                        const changedCellClass = isDetailValue && changedHeaderSet?.has(header) ? styles.detailChangeDiffCell : memoCellClass;
                                                        if (isDetailValue && header === '상차지') {
                                                            const editableStartLocation = canEditDetailStartLocation(line);
                                                            return (
                                                                <td key={header} className={[styles.detailStartCell, !line.startLocation ? styles.detailManualCell : '', changedCellClass].filter(Boolean).join(' ')}>
                                                                    {editableStartLocation ? (
                                                                        <input
                                                                            className={`${styles.detailComboInput} ${styles.detailStartInput}`}
                                                                            list={DETAIL_START_LOCATION_DATALIST_ID}
                                                                            data-detail-row-index={rowIdx}
                                                                            data-detail-col-index={colIdx}
                                                                            value={getDetailRowValue(rawValues, '상차지')}
                                                                            onChange={(inputEvent) => updateDetailChangeDraft(event, draft => setDetailRowValue(draft, '상차지', inputEvent.target.value))}
                                                                            onBlur={(inputEvent) => saveDetailChangeValues(event, setDetailRowValue(rawValues, '상차지', inputEvent.target.value))}
                                                                            onKeyDown={focusDetailGridInput}
                                                                            disabled={editDisabled}
                                                                            placeholder="선택"
                                                                        />
                                                                    ) : (
                                                                        getDetailRowValue(rawValues, '상차지')
                                                                    )}
                                                                </td>
                                                            );
                                                        }
                                                        if (isDetailValue && header === '포트코드' && (line.glapsPortCodeOptions || []).length > 1) {
                                                            const selectedPortCode = getDetailRowValue(rawValues, '포트코드') || line.glapsPortCode || '';
                                                            return (
                                                                <td key={header} className={[styles.detailPortCodeCell, styles.detailPortCandidateCell, changedCellClass].filter(Boolean).join(' ')}>
                                                                    <select
                                                                        className={styles.detailPortSelect}
                                                                        value={selectedPortCode}
                                                                        onChange={(inputEvent) => {
                                                                            const nextPortCode = inputEvent.target.value;
                                                                            const nextValues = setDetailRowValue(rawValues, '포트코드', inputEvent.target.value);
                                                                            setDetailChangePortOverrides(prev => ({ ...prev, [event.id]: nextPortCode }));
                                                                            updateDetailChangeDraft(event, nextValues);
                                                                            saveDetailChangeValues(event, nextValues, { portCodeOverride: nextPortCode });
                                                                        }}
                                                                        onKeyDown={focusDetailGridInput}
                                                                        data-detail-row-index={rowIdx}
                                                                        data-detail-col-index={colIdx}
                                                                        disabled={editDisabled}
                                                                        title={`${line.port || ''} 포트코드 선택`}
                                                                    >
                                                                        {(line.glapsPortCodeOptions || []).map(option => (
                                                                            <option key={option.code} value={option.code}>{formatGlapsPortOptionLabel(option)}</option>
                                                                        ))}
                                                                    </select>
                                                                </td>
                                                            );
                                                        }
                                                        if (isDetailValue && (header === DISPATCH_DETAIL_DG_HEADER || header === DISPATCH_DETAIL_RF_HEADER)) {
                                                            const isRf = header === DISPATCH_DETAIL_RF_HEADER;
                                                            const selectedFlag = isRf
                                                                ? normalizeDispatchRfValue(getDetailRowValue(rawValues, DISPATCH_DETAIL_RF_HEADER) || line.rfFlag || line.dgRfFlag, getDetailRowValue(rawValues, '타입') || line.containerType)
                                                                : normalizeDispatchDgValue(getDetailRowValue(rawValues, DISPATCH_DETAIL_DG_HEADER) || line.dgFlag);
                                                            return (
                                                                <td key={header} className={[styles.detailDgRfCell, changedCellClass].filter(Boolean).join(' ')}>
                                                                    <select
                                                                        className={styles.detailPortSelect}
                                                                        value={selectedFlag}
                                                                        onChange={(inputEvent) => {
                                                                            const nextValues = setDetailRowValue(rawValues, header, inputEvent.target.value);
                                                                            updateDetailChangeDraft(event, nextValues);
                                                                            saveDetailChangeValues(event, nextValues);
                                                                        }}
                                                                        onKeyDown={focusDetailGridInput}
                                                                        data-detail-row-index={rowIdx}
                                                                        data-detail-col-index={colIdx}
                                                                        disabled={editDisabled}
                                                                        title={isRf ? `${getDetailRowValue(rawValues, '타입') || line.containerType || ''} 기준 RF` : '위험물 여부'}
                                                                    >
                                                                        <option value="N">N</option>
                                                                        <option value="Y">Y</option>
                                                                    </select>
                                                                </td>
                                                            );
                                                        }
                                                        if (isDetailValue && header === 'BKG확정') {
                                                            const isManualBkg = line.confirmedBkgSource === 'manual';
                                                            const isBkgStale = isDetailBkgConfirmStale(line);
                                                            return (
                                                                <td key={header} className={[styles.detailBkgConfirmCell, changedCellClass].filter(Boolean).join(' ')}>
                                                                    <div className={styles.detailBkgConfirmControl}>
                                                                        <span
                                                                            className={`${styles.detailBkgSourceBadge} ${isManualBkg ? styles.detailBkgSourceManual : ''} ${isBkgStale ? styles.detailBkgSourceStale : ''}`}
                                                                            title={isBkgStale ? '선택된 BKG 원본값이 확정 이후 변경되었습니다.' : ''}
                                                                        >
                                                                            {isManualBkg ? '수기' : line.confirmedBkgSource || 'BKG1'}
                                                                        </span>
                                                                        <input
                                                                            className={styles.detailBkgConfirmInput}
                                                                            value={getDetailRowValue(rawValues, 'BKG확정') || line.confirmedBkg || ''}
                                                                            onChange={(inputEvent) => updateDetailChangeDraft(event, draft => setDetailRowValue(draft, 'BKG확정', inputEvent.target.value))}
                                                                            onBlur={(inputEvent) => saveDetailChangeValues(event, setDetailRowValue(rawValues, 'BKG확정', inputEvent.target.value))}
                                                                            onKeyDown={focusDetailGridInput}
                                                                            data-detail-row-index={rowIdx}
                                                                            data-detail-col-index={colIdx}
                                                                            disabled={editDisabled}
                                                                            title={isManualBkg ? '수기 입력값' : `${line.confirmedBkgSource || 'BKG1'} 선택값`}
                                                                        />
                                                                    </div>
                                                                </td>
                                                            );
                                                        }
                                                        if (isDetailValue && BKG_CONFIRM_SOURCE_OPTIONS.includes(header)) {
                                                            const bkgValue = getDetailBkgValue(line, header);
                                                            const isSelectedBkg = line.confirmedBkgSource === header && Boolean(bkgValue) && bkgValue === line.confirmedBkg;
                                                            const isDisabledBkg = editDisabled || !bkgValue;
                                                            return (
                                                                <td
                                                                    key={header}
                                                                    className={[isSelectedBkg ? styles.detailBkgSelectedCell : '', changedCellClass].filter(Boolean).join(' ')}
                                                                    title={memoTooltip}
                                                                >
                                                                    {bkgValue ? (
                                                                        <button
                                                                            type="button"
                                                                            className={`${styles.detailBkgPickButton} ${isSelectedBkg ? styles.detailBkgPickButtonActive : ''}`}
                                                                            onClick={() => {
                                                                                const nextValues = setDetailRowValue(rawValues, 'BKG확정', bkgValue);
                                                                                updateDetailChangeDraft(event, nextValues);
                                                                                saveDetailChangeValues(event, nextValues);
                                                                            }}
                                                                            onKeyDown={focusDetailGridInput}
                                                                            data-detail-row-index={rowIdx}
                                                                            data-detail-col-index={colIdx}
                                                                            disabled={isDisabledBkg}
                                                                            title={`${header} 값을 BKG확정으로 적용`}
                                                                        >
                                                                            {bkgValue}
                                                                        </button>
                                                                    ) : null}
                                                                </td>
                                                            );
                                                        }
                                                        return (
                                                            <td
                                                                key={header}
                                                                className={[isChangeType ? styles.detailChangeTypeCell : '', changedCellClass].filter(Boolean).join(' ')}
                                                                title={memoTooltip}
                                                            >
                                                                {isDetailValue ? (
                                                                    values[colIdx] || ''
                                                                ) : isManage ? (
                                                                    <span className={styles.detailChangeActions}>
                                                                        {hasDraft && (
                                                                            <button
                                                                                type="button"
                                                                                className={styles.detailChangeActionButton}
                                                                                onClick={() => saveDetailChangeValues(event, rawValues)}
                                                                                disabled={detailChangeSaving}
                                                                            >
                                                                                {hasManualDraft ? '저장' : '현재값저장'}
                                                                            </button>
                                                                        )}
                                                                        {event.event_status !== 'confirmed' ? (
                                                                            <button
                                                                                type="button"
                                                                                className={styles.detailChangeActionButton}
                                                                                onClick={() => confirmDetailChangeEvents([event.id])}
                                                                                disabled={detailChangeSaving}
                                                                            >
                                                                                확인완료
                                                                            </button>
                                                                        ) : (
                                                                            <button
                                                                                type="button"
                                                                                className={`${styles.detailChangeActionButton} ${styles.detailChangeUnconfirmButton}`}
                                                                                onClick={() => unconfirmDetailChangeEvents([event.id])}
                                                                                disabled={detailChangeSaving}
                                                                            >
                                                                                확인취소
                                                                            </button>
                                                                        )}
                                                                    </span>
                                                                ) : isChangeType ? (
                                                                    <span className={styles.detailChangeTypeWrap} title={buildDispatchChangeDiffTooltip(event)}>
                                                                        <span>{values[colIdx]}</span>
                                                                    </span>
                                                                ) : (
                                                                    values[colIdx]
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className={styles.tableFooter}>
                                <span>
                                    {Math.min(detailChangeRows.length, effectiveDisplayLimit).toLocaleString()}건 표시
                                    {searchTerm ? ` / 검색 ${detailChangeRows.length.toLocaleString()}건` : ''}
                                    {' '} / 전체 {detailChangeRows.length.toLocaleString()}건
                                </span>
                                {detailChangeRows.length > effectiveDisplayLimit && (
                                    <span className={styles.loadMoreWrap}>
                                        <button className={styles.loadMoreBtn} onClick={() => setDisplayLimit(p => p + 100)}>+100건 더 보기</button>
                                        <button className={styles.loadMoreBtn} onClick={() => setDisplayLimit(detailChangeRows.length)}>전체 표시</button>
                                    </span>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className={styles.detailChangePanel}>
                            <strong>{detailStatusConfirmation?.id ? '변동 없음' : '변동 입력 대기'}</strong>
                            <span>
                                {detailStatusConfirmation?.id
                                    ? '확정 이후 추가/삭제/변경 이벤트가 감지되면 최신 변동순으로 표시합니다.'
                                    : '배차확정 후 추가/삭제/변경 이벤트를 기록합니다.'}
                            </span>
                        </div>
                    )}
                </>
            ) : (
                <>
                    {/* 합계 바 */}
                    {summary && (
                        <div className={styles.summaryBar}>
                            <div className={styles.summaryLeft}>
                                <span className={styles.summaryItem}>
                                    <b>{hasActiveFilter ? '필터 오더량' : '오더량'}</b> {summary.order}
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
                                        컬럼 {hiddenCols.size > 0 && <span className={styles.hiddenBadge}>{hiddenCols.size}</span>}
                                    </button>
                                    {showColPanel && (
                                        <div className={styles.colPanel} onClick={e => e.stopPropagation()}>
                                            <div className={styles.colPanelHeader}>
                                                <span className={styles.colPanelTitle}>컬럼 표시/숨기기</span>
                                                <button className={styles.colPanelClose} onClick={() => setShowColPanel(false)}>✕ 닫기</button>
                                            </div>
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
                                    <button className={`${styles.colorFilterBtn} ${colorFilter === 'warn' ? styles.colorFilterBtnActive : ''}`} onClick={() => setColorFilter(p => p === 'warn' ? null : 'warn')}>언매치</button>
                                    <button className={`${styles.otherFilterBtn} ${colorFilter === 'other_category' ? styles.otherFilterBtnActive : ''}`} onClick={() => setColorFilter(p => p === 'other_category' ? null : 'other_category')}>특이구분</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 검색 결과 + 필터 배지 */}
                    {searchTerm && searchResult.summary && (
                        <div className={styles.searchResult}>검색 결과 · {searchResult.summary} ({searchResult.indices?.length || 0}행)
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
                                                <th key={ci} style={columnWidthStyle(w)}
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
                                                            <div className={styles.dropdownItem} style={{ color: '#ef4444' }} onClick={() => hideCol(h)}>이 열 숨기기</div>
                                                        </div>
                                                    )}
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {limitedRows.map(({ row, idx: origIdx, status }, ri) => (
                                        <tr key={origIdx} className={`
                                            ${ri % 2 === 0 ? styles.evenRow : styles.oddRow} 
                                            ${status === 'warn' ? styles.rowWarn : ''}
                                            ${status === 'other_category' ? styles.rowOther : ''}
                                        `}>
                                            {visibleCols.map(ci => {
                                                // [BUG FIX] origIdx는 DB 저장 순서 = comments 키 기준.
                                                // integrated 정렬 후에도 origIdx(DB row 번호)로 comments를 찾아야 함.
                                                const ck = `${origIdx}:${ci}`;
                                                const hc = !!comments[ck];
                                                const header = headers[ci];
                                                const w = colWidths[header];
                                                const widthStyle = columnWidthStyle(w);
                                                const fieldKey = normalizeDispatchWebCellFieldKey(header);
                                                const webCellMeta = row.webCellMeta;
                                                const webCellKey = makeWebCellClientKey(webCellMeta, fieldKey);
                                                const cellStatus = webCellKey ? webCellStatus[webCellKey] : null;
                                                const isWebEditable = Boolean(fieldKey && webCellMeta?.rowSignature);
                                                const webCellLockMessage = isWebEditable
                                                    ? getWebCellLockMessage(webCellMeta, fieldKey, row[ci], dispatchConfirmationMap)
                                                    : '';
                                                const isWebLocked = Boolean(webCellLockMessage);
                                                return (
                                                    <td key={ci}
                                                        className={`${centerCols.has(ci) ? styles.centerCell : ''} ${hc ? styles.hasComment : ''} ${isWebEditable ? styles.webCellEditableTd : ''} ${isWebLocked ? styles.webCellLockedTd : ''} ${cellStatus?.state === 'error' ? styles.webCellErrorTd : ''}`}
                                                        style={widthStyle ? { ...widthStyle, overflow: 'hidden', textOverflow: 'ellipsis' } : undefined}
                                                        onMouseEnter={hc ? (e) => showTooltip(e, comments[ck]) : undefined}
                                                        onMouseLeave={hc ? () => setTooltip(null) : undefined}>
                                                        {isWebEditable ? (
                                                            <div className={styles.webCellInputWrap}>
                                                                <input
                                                                    key={`${webCellKey}:${row[ci] ?? ''}`}
                                                                    className={styles.webCellInput}
                                                                    defaultValue={row[ci] ?? ''}
                                                                    disabled={isWebLocked}
                                                                    title={cellStatus?.message || webCellLockMessage || `${getDispatchWebCellFieldLabel(fieldKey)} WEB 저장값`}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    onChange={() => {
                                                                        if (cellStatus?.state === 'error') {
                                                                            setWebCellStatus(prev => {
                                                                                const next = { ...prev };
                                                                                delete next[webCellKey];
                                                                                return next;
                                                                            });
                                                                        }
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') e.currentTarget.blur();
                                                                        if (e.key === 'Escape') {
                                                                            e.currentTarget.value = row[ci] ?? '';
                                                                            e.currentTarget.blur();
                                                                        }
                                                                    }}
                                                                    onBlur={async (e) => {
                                                                        const savedValue = await saveWebCellValue({
                                                                            meta: webCellMeta,
                                                                            fieldKey,
                                                                            value: e.currentTarget.value,
                                                                            previousValue: row[ci] ?? '',
                                                                        });
                                                                        if (savedValue !== undefined) e.currentTarget.value = savedValue;
                                                                    }}
                                                                />
                                                                {cellStatus?.state && (
                                                                    <span className={`${styles.webCellState} ${cellStatus.state === 'saving' ? styles.webCellSaving : ''} ${cellStatus.state === 'saved' ? styles.webCellSaved : ''} ${cellStatus.state === 'error' ? styles.webCellError : ''}`}>
                                                                        {cellStatus.state === 'saving' ? '저장' : cellStatus.state === 'saved' ? '완료' : '!'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : row[ci]}
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
                                {browserPath !== '/' && <div className={styles.browserItem} onClick={() => loadFolder(browserPath.split('/').slice(0, -1).join('/') || '/')}>상위 폴더</div>}
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

function AsanPerformanceManagement() {
    const [activePerformanceTab, setActivePerformanceTab] = useState(null);

    useEffect(() => {
        try {
            localStorage.setItem(ASAN_PERFORMANCE_TAB_KEY, 'summary-performance');
        } catch {
            /* ignore */
        }
        setActivePerformanceTab('summary-performance');
    }, []);

    useEffect(() => {
        if (!activePerformanceTab) return undefined;
        return scheduleIdlePrefetch(() => {
            const loaders = PERFORMANCE_TABS
                .filter(tab => tab !== activePerformanceTab)
                .flatMap(tab => ASAN_PERFORMANCE_TAB_LOADERS[tab] || []);
            prefetchAsanLoaders(loaders);
        }, 2200);
    }, [activePerformanceTab]);

    const switchPerformanceTab = (tab) => {
        setActivePerformanceTab(tab);
        try {
            localStorage.setItem(ASAN_PERFORMANCE_TAB_KEY, tab);
        } catch { /* ignore */ }
    };

    const prefetchPerformanceTab = (tab) => {
        prefetchAsanLoaders(ASAN_PERFORMANCE_TAB_LOADERS[tab] || []);
    };

    return (
        <div className={styles.performanceShell}>
            <div className={styles.performanceTabBar}>
                <button
                    className={`${styles.performanceTabBtn} ${activePerformanceTab === 'summary-performance' ? styles.performanceTabBtnActive : ''}`}
                    onClick={() => switchPerformanceTab('summary-performance')}
                    onMouseEnter={() => prefetchPerformanceTab('summary-performance')}
                    onFocus={() => prefetchPerformanceTab('summary-performance')}
                    onTouchStart={() => prefetchPerformanceTab('summary-performance')}
                >
                    종합실적
                </button>
                <button
                    className={`${styles.performanceTabBtn} ${activePerformanceTab === 'monthly-performance' ? styles.performanceTabBtnActive : ''}`}
                    onClick={() => switchPerformanceTab('monthly-performance')}
                    onMouseEnter={() => prefetchPerformanceTab('monthly-performance')}
                    onFocus={() => prefetchPerformanceTab('monthly-performance')}
                    onTouchStart={() => prefetchPerformanceTab('monthly-performance')}
                >
                    월간실적
                </button>
                <button
                    className={`${styles.performanceTabBtn} ${activePerformanceTab === 'annual-performance' ? styles.performanceTabBtnActive : ''}`}
                    onClick={() => switchPerformanceTab('annual-performance')}
                    onMouseEnter={() => prefetchPerformanceTab('annual-performance')}
                    onFocus={() => prefetchPerformanceTab('annual-performance')}
                    onTouchStart={() => prefetchPerformanceTab('annual-performance')}
                >
                    연간실적
                </button>
                <button
                    className={`${styles.performanceTabBtn} ${activePerformanceTab === 'route-unit-price' ? styles.performanceTabBtnActive : ''}`}
                    onClick={() => switchPerformanceTab('route-unit-price')}
                    onMouseEnter={() => prefetchPerformanceTab('route-unit-price')}
                    onFocus={() => prefetchPerformanceTab('route-unit-price')}
                    onTouchStart={() => prefetchPerformanceTab('route-unit-price')}
                >
                    구간단가
                </button>
            </div>

            <div className={styles.performanceContent}>
                {!activePerformanceTab && <AsanModuleLoading />}
                {activePerformanceTab === 'summary-performance' && (
                    <AsanSummaryPerformance />
                )}
                {activePerformanceTab === 'monthly-performance' && (
                    <AsanMonthlyPerformance />
                )}
                {activePerformanceTab === 'annual-performance' && (
                    <AsanAnnualPerformance />
                )}
                {activePerformanceTab === 'route-unit-price' && (
                    <AsanAnnualPerformance initialAnalysisView="route-unit" title="구간단가" />
                )}
            </div>
        </div>
    );
}

export default function AsanBranchPage() {
    const [activeMainTab, setActiveMainTab] = useState(null);
    const pageWrapperRef = useRef(null);

    useEffect(() => {
        try {
            localStorage.setItem(ASAN_MAIN_TAB_KEY, 'dispatch');
        } catch {
            /* ignore */
        }
        setActiveMainTab('dispatch');
    }, []);

    const switchMainTab = (tab) => {
        setActiveMainTab(tab);
        try {
            localStorage.setItem(ASAN_MAIN_TAB_KEY, tab);
            if (tab === 'performance') {
                localStorage.setItem(ASAN_PERFORMANCE_TAB_KEY, 'summary-performance');
            }
        } catch { /* ignore */ }
    };

    const prefetchMainTab = (tab) => {
        prefetchAsanLoaders(ASAN_MAIN_TAB_LOADERS[tab] || []);
    };

    useEffect(() => {
        if (!activeMainTab) return undefined;
        return scheduleScrollReset(() => pageWrapperRef.current);
    }, [activeMainTab]);

    useEffect(() => {
        if (!activeMainTab) return undefined;
        return scheduleIdlePrefetch(() => {
            const loaders = MAIN_TABS
                .filter(tab => tab !== activeMainTab)
                .flatMap(tab => ASAN_MAIN_TAB_LOADERS[tab] || []);
            prefetchAsanLoaders(loaders);
        });
    }, [activeMainTab]);

    return (
        <div ref={pageWrapperRef} className={styles.pageWrapper}>
            {/* 전역 아산지점 헤더 */}
            <div className={styles.mainHeader}>
                <h1 className={styles.mainTitle}>
                    <span>아산지점 종합상황판</span>
                </h1>
                
                <div className={styles.mainTabGroup}>
                    <button 
                        className={`${styles.mainTabBtn} ${activeMainTab === 'dispatch' ? styles.mainTabBtnActive : ''}`}
                        onClick={() => switchMainTab('dispatch')}
                        onMouseEnter={() => prefetchMainTab('dispatch')}
                        onFocus={() => prefetchMainTab('dispatch')}
                        onTouchStart={() => prefetchMainTab('dispatch')}
                    >
                        배차판
                    </button>
                    <button 
                        className={`${styles.mainTabBtn} ${activeMainTab === 'shipping' ? styles.mainTabBtnActive : ''}`}
                        onClick={() => switchMainTab('shipping')}
                        onMouseEnter={() => prefetchMainTab('shipping')}
                        onFocus={() => prefetchMainTab('shipping')}
                        onTouchStart={() => prefetchMainTab('shipping')}
                    >
                        선적관리
                    </button>
                    <button
                        className={`${styles.mainTabBtn} ${activeMainTab === 'performance' ? styles.mainTabBtnActive : ''}`}
                        onClick={() => switchMainTab('performance')}
                        onMouseEnter={() => prefetchMainTab('performance')}
                        onFocus={() => prefetchMainTab('performance')}
                        onTouchStart={() => prefetchMainTab('performance')}
                    >
                        실적관리
                    </button>
                </div>
            </div>
            
            {/* 탭 내용 영역 */}
            <div className={styles.contentArea}>
                {activeMainTab === 'dispatch' && <AsanDispatchContent />}
                {activeMainTab === 'shipping' && <AsanShipping />}
                {activeMainTab === 'performance' && <AsanPerformanceManagement />}
            </div>
        </div>
    );
}
