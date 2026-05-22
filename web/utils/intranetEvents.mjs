export const KST_TIME_ZONE = 'Asia/Seoul';

export const EVENT_REMINDER_OFFSETS = [7, 3, 1, 0];

export const EVENT_AUDIENCE_ALL = 'all';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const SOLAR_KOREAN_HOLIDAYS = [
    { mmdd: '01-01', name: '신정' },
    { mmdd: '03-01', name: '삼일절', substitute: true },
    { mmdd: '05-05', name: '어린이날', substitute: true },
    { mmdd: '06-06', name: '현충일' },
    { mmdd: '08-15', name: '광복절', substitute: true },
    { mmdd: '10-03', name: '개천절', substitute: true },
    { mmdd: '10-09', name: '한글날', substitute: true },
    { mmdd: '12-25', name: '성탄절', substitute: true },
];

const YEAR_SPECIFIC_KOREAN_HOLIDAYS = {
    2026: [
        { date: '2026-02-16', name: '설날 연휴' },
        { date: '2026-02-17', name: '설날' },
        { date: '2026-02-18', name: '설날 연휴' },
        { date: '2026-05-24', name: '부처님오신날', substitute: true },
        { date: '2026-06-03', name: '전국동시지방선거', special: true },
        { date: '2026-09-24', name: '추석 연휴' },
        { date: '2026-09-25', name: '추석' },
        { date: '2026-09-26', name: '추석 연휴' },
    ],
};

export function isDateString(value) {
    return typeof value === 'string' && DATE_RE.test(value);
}

export function isMonthString(value) {
    return typeof value === 'string' && MONTH_RE.test(value);
}

export function toDateString(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function parseDateString(value) {
    if (!isDateString(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(dateString, days) {
    const base = parseDateString(dateString);
    if (!base) return null;
    return toDateString(new Date(base.getTime() + days * DAY_MS));
}

function getNextWeekday(dateString, blockedDates = new Set()) {
    let next = addDays(dateString, 1);
    while (next) {
        const parsed = parseDateString(next);
        const day = parsed.getUTCDay();
        if (day !== 0 && day !== 6 && !blockedDates.has(next)) return next;
        next = addDays(next, 1);
    }
    return null;
}

function addHolidayToMap(map, record) {
    if (!isDateString(record.date)) return;
    const existing = map.get(record.date) || [];
    existing.push(record);
    map.set(record.date, existing);
}

export function getKoreanHolidaysForYear(yearValue) {
    const year = Number(yearValue);
    if (!Number.isInteger(year)) return [];

    const baseRecords = [
        ...SOLAR_KOREAN_HOLIDAYS.map((item) => ({
            ...item,
            date: `${year}-${item.mmdd}`,
            source: 'solar',
        })),
        ...(YEAR_SPECIFIC_KOREAN_HOLIDAYS[year] || []).map((item) => ({
            ...item,
            source: item.special ? 'special' : 'lunar',
        })),
    ];

    const map = new Map();
    baseRecords.forEach((record) => addHolidayToMap(map, record));

    const blockedDates = new Set(map.keys());
    baseRecords
        .filter((record) => record.substitute)
        .forEach((record) => {
            const parsed = parseDateString(record.date);
            if (!parsed) return;
            const day = parsed.getUTCDay();
            const needsSubstitute = day === 0 || day === 6 || (map.get(record.date) || []).length > 1;
            if (!needsSubstitute) return;
            const substituteDate = getNextWeekday(record.date, blockedDates);
            if (!substituteDate) return;
            blockedDates.add(substituteDate);
            addHolidayToMap(map, {
                date: substituteDate,
                name: `${record.name} 대체공휴일`,
                substituteFor: record.name,
                isSubstitute: true,
                source: 'substitute',
            });
        });

    return [...map.entries()]
        .map(([date, records]) => ({
            date,
            names: records.map((record) => record.name),
            label: records.map((record) => record.name).join(' · '),
            isHoliday: true,
            isSubstitute: records.some((record) => record.isSubstitute),
            isSpecial: records.some((record) => record.special),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

export function getKoreanHoliday(dateString) {
    if (!isDateString(dateString)) return null;
    const year = Number(dateString.slice(0, 4));
    return getKoreanHolidaysForYear(year).find((holiday) => holiday.date === dateString) || null;
}

export function getKstDateString(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: KST_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);

    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${byType.year}-${byType.month}-${byType.day}`;
}

export function getMonthRange(monthString) {
    const month = isMonthString(monthString) ? monthString : getKstDateString().slice(0, 7);
    const [year, monthNumber] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 0));
    return {
        month,
        start: toDateString(start),
        end: toDateString(end),
    };
}

export function buildMonthMatrix(monthString) {
    const { month, start } = getMonthRange(monthString);
    const first = parseDateString(start);
    const firstDay = first.getUTCDay();
    const matrixStart = new Date(first.getTime() - firstDay * DAY_MS);

    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(matrixStart.getTime() + index * DAY_MS);
        const dateString = toDateString(date);
        return {
            date: dateString,
            day: date.getUTCDate(),
            inMonth: dateString.startsWith(month),
            holiday: getKoreanHoliday(dateString),
            isSunday: date.getUTCDay() === 0,
            isSaturday: date.getUTCDay() === 6,
            isWeekend: date.getUTCDay() === 0 || date.getUTCDay() === 6,
        };
    });
}

export function sanitizeReminderOffsets(value) {
    const source = Array.isArray(value) ? value : EVENT_REMINDER_OFFSETS;
    const clean = source
        .map((item) => Number(item))
        .filter((item) => EVENT_REMINDER_OFFSETS.includes(item));
    return [...new Set(clean)].sort((a, b) => b - a);
}

export function normalizeAudienceRoles(value, fallbackRole = null) {
    const source = Array.isArray(value) ? value : [];
    const clean = source
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean);

    if (clean.includes(EVENT_AUDIENCE_ALL)) return [EVENT_AUDIENCE_ALL];

    const unique = [...new Set(clean)];
    if (unique.length > 0) return unique;
    return fallbackRole ? [String(fallbackRole).toLowerCase()] : [EVENT_AUDIENCE_ALL];
}

export function eventMatchesRole(eventOrRoles, role) {
    const roles = Array.isArray(eventOrRoles) ? eventOrRoles : eventOrRoles?.audience_roles;
    const normalized = normalizeAudienceRoles(roles);
    const currentRole = String(role || '').toLowerCase();
    if (normalized.includes(EVENT_AUDIENCE_ALL)) return true;
    if (!currentRole) return false;
    return normalized.includes(currentRole);
}

export function daysUntilEvent(eventDate, todayDate) {
    const event = parseDateString(eventDate);
    const today = parseDateString(todayDate);
    if (!event || !today) return null;
    return Math.round((event.getTime() - today.getTime()) / DAY_MS);
}

export function getDueReminderOffset(eventDate, todayDate, reminderOffsets = EVENT_REMINDER_OFFSETS) {
    const days = daysUntilEvent(eventDate, todayDate);
    if (days === null) return null;
    const offsets = sanitizeReminderOffsets(reminderOffsets);
    return offsets.includes(days) ? days : null;
}

export function getReminderLabel(offset) {
    const n = Number(offset);
    if (n === 0) return '오늘';
    if (n === 1) return '내일';
    return `${n}일 전`;
}

export function sortEventsForCalendar(events) {
    return [...(events || [])].sort((a, b) => {
        const dateCompare = String(a.event_date || '').localeCompare(String(b.event_date || ''));
        if (dateCompare !== 0) return dateCompare;
        return String(a.start_time || '').localeCompare(String(b.start_time || ''));
    });
}
