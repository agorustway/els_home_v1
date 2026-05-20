'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
    EVENT_REMINDER_OFFSETS,
    buildMonthMatrix,
    getKstDateString,
    getReminderLabel,
    sortEventsForCalendar,
} from '@/utils/intranetEvents.mjs';
import styles from './IntranetEventCalendar.module.css';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DEFAULT_AUDIENCE = ['all'];

function createEmptyForm(date = getKstDateString()) {
    return {
        title: '',
        description: '',
        event_date: date,
        start_time: '',
        end_time: '',
        location: '',
        audience_roles: DEFAULT_AUDIENCE,
        reminder_offsets: EVENT_REMINDER_OFFSETS,
    };
}

function shiftMonth(month, amount) {
    const [year, monthNumber] = month.split('-').map(Number);
    const next = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthTitle(month) {
    const [year, monthNumber] = month.split('-');
    return `${year}년 ${Number(monthNumber)}월`;
}

function formatTimeRange(event) {
    if (event.start_time && event.end_time) return `${event.start_time.slice(0, 5)}-${event.end_time.slice(0, 5)}`;
    if (event.start_time) return event.start_time.slice(0, 5);
    return '종일';
}

function getAudienceLabel(roles, audienceOptions) {
    const normalized = Array.isArray(roles) && roles.length > 0 ? roles : DEFAULT_AUDIENCE;
    if (normalized.includes('all')) return '전체';
    const optionMap = Object.fromEntries((audienceOptions || []).map((item) => [item.value, item.label]));
    return normalized.map((role) => optionMap[role] || role).join(', ');
}

export default function IntranetEventCalendar() {
    const [month, setMonth] = useState(() => getKstDateString().slice(0, 7));
    const [events, setEvents] = useState([]);
    const [audienceOptions, setAudienceOptions] = useState([]);
    const [canManage, setCanManage] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [detailEvent, setDetailEvent] = useState(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [form, setForm] = useState(() => createEmptyForm());

    const matrix = useMemo(() => buildMonthMatrix(month), [month]);
    const today = getKstDateString();

    const eventsByDate = useMemo(() => {
        const grouped = new Map();
        sortEventsForCalendar(events).forEach((event) => {
            if (!grouped.has(event.event_date)) grouped.set(event.event_date, []);
            grouped.get(event.event_date).push(event);
        });
        return grouped;
    }, [events]);

    const fetchEvents = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/intranet/events?month=${month}`, { cache: 'no-store' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || '행사일정을 불러오지 못했습니다.');
            setEvents(data.events || []);
            setAudienceOptions(data.audienceOptions || []);
            setCanManage(Boolean(data.canManage));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [month]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    const openCreateForm = (date = today) => {
        setEditingEvent(null);
        setDetailEvent(null);
        setForm(createEmptyForm(date));
        setFormOpen(true);
    };

    const openEditForm = (event) => {
        setEditingEvent(event);
        setDetailEvent(null);
        setForm({
            title: event.title || '',
            description: event.description || '',
            event_date: event.event_date || today,
            start_time: event.start_time ? event.start_time.slice(0, 5) : '',
            end_time: event.end_time ? event.end_time.slice(0, 5) : '',
            location: event.location || '',
            audience_roles: Array.isArray(event.audience_roles) && event.audience_roles.length > 0 ? event.audience_roles : DEFAULT_AUDIENCE,
            reminder_offsets: Array.isArray(event.reminder_offsets) && event.reminder_offsets.length > 0 ? event.reminder_offsets : EVENT_REMINDER_OFFSETS,
        });
        setFormOpen(true);
    };

    const toggleAudience = (value) => {
        setForm((prev) => {
            if (value === 'all') return { ...prev, audience_roles: DEFAULT_AUDIENCE };
            const withoutAll = prev.audience_roles.filter((role) => role !== 'all');
            const next = withoutAll.includes(value)
                ? withoutAll.filter((role) => role !== value)
                : [...withoutAll, value];
            return { ...prev, audience_roles: next.length > 0 ? next : DEFAULT_AUDIENCE };
        });
    };

    const toggleReminder = (offset) => {
        setForm((prev) => {
            const hasOffset = prev.reminder_offsets.includes(offset);
            const next = hasOffset
                ? prev.reminder_offsets.filter((item) => item !== offset)
                : [...prev.reminder_offsets, offset];
            return {
                ...prev,
                reminder_offsets: next.length > 0
                    ? next.sort((a, b) => b - a)
                    : EVENT_REMINDER_OFFSETS,
            };
        });
    };

    const submitForm = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const method = editingEvent ? 'PATCH' : 'POST';
            const url = editingEvent ? `/api/intranet/events/${editingEvent.id}` : '/api/intranet/events';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || '저장하지 못했습니다.');
            setFormOpen(false);
            setEditingEvent(null);
            await fetchEvents();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const deleteEvent = async () => {
        if (!editingEvent) return;
        if (!window.confirm('이 행사일정을 삭제하시겠습니까?')) return;
        setSaving(true);
        setError('');
        try {
            const res = await fetch(`/api/intranet/events/${editingEvent.id}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || '삭제하지 못했습니다.');
            setFormOpen(false);
            setEditingEvent(null);
            await fetchEvents();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className={styles.calendarShell} aria-labelledby="intranet-event-calendar-title">
            <div className={styles.header}>
                <div>
                    <p className={styles.kicker}>Intranet Calendar</p>
                    <h2 id="intranet-event-calendar-title" className={styles.title}>행사일정</h2>
                </div>
                <div className={styles.actions}>
                    <button type="button" className={styles.iconBtn} onClick={() => setMonth((prev) => shiftMonth(prev, -1))} aria-label="이전 달">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m15 18-6-6 6-6" /></svg>
                    </button>
                    <button type="button" className={styles.monthBtn} onClick={() => setMonth(today.slice(0, 7))}>
                        {formatMonthTitle(month)}
                    </button>
                    <button type="button" className={styles.iconBtn} onClick={() => setMonth((prev) => shiftMonth(prev, 1))} aria-label="다음 달">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m9 18 6-6-6-6" /></svg>
                    </button>
                    {canManage && (
                        <button type="button" className={styles.primaryBtn} onClick={() => openCreateForm(today)}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                            등록
                        </button>
                    )}
                </div>
            </div>

            {error && <div className={styles.errorBox}>{error}</div>}

            <div className={styles.weekHeader}>
                {WEEKDAYS.map((day) => <div key={day} className={styles.weekCell}>{day}</div>)}
            </div>
            <div className={styles.monthGrid} aria-busy={loading}>
                {matrix.map((day) => {
                    const dayEvents = eventsByDate.get(day.date) || [];
                    const visibleEvents = dayEvents.slice(0, 3);
                    return (
                        <div
                            key={day.date}
                            className={`${styles.dayCell} ${!day.inMonth ? styles.mutedDay : ''} ${day.date === today ? styles.todayCell : ''}`}
                        >
                            <button
                                type="button"
                                className={styles.dayButton}
                                onClick={() => canManage && openCreateForm(day.date)}
                                title={canManage ? `${day.date} 일정 등록` : day.date}
                            >
                                <span>{day.day}</span>
                                {day.date === today && <span className={styles.todayMark}>오늘</span>}
                            </button>
                            <div className={styles.eventList}>
                                {visibleEvents.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={styles.eventChip}
                                        onClick={() => setDetailEvent(item)}
                                        title={`${item.title} · ${formatTimeRange(item)}`}
                                    >
                                        <span className={styles.eventTime}>{formatTimeRange(item)}</span>
                                        <span className={styles.eventTitle}>{item.title}</span>
                                    </button>
                                ))}
                                {dayEvents.length > visibleEvents.length && (
                                    <button type="button" className={styles.moreChip} onClick={() => setDetailEvent(dayEvents[3])}>
                                        +{dayEvents.length - visibleEvents.length}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {loading && <div className={styles.loadingOverlay}>데이터를 불러오는 중입니다...</div>}

            {detailEvent && (
                <div className={styles.modalBackdrop} onClick={() => setDetailEvent(null)}>
                    <div className={styles.detailModal} onClick={(event) => event.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                <span className={styles.modalDate}>{detailEvent.event_date} · {formatTimeRange(detailEvent)}</span>
                                <h3 className={styles.modalTitle}>{detailEvent.title}</h3>
                            </div>
                            <button type="button" className={styles.closeBtn} onClick={() => setDetailEvent(null)} aria-label="닫기">×</button>
                        </div>
                        <div className={styles.detailBody}>
                            {detailEvent.location && <p><strong>장소</strong>{detailEvent.location}</p>}
                            <p><strong>공지범위</strong>{getAudienceLabel(detailEvent.audience_roles, audienceOptions)}</p>
                            <p><strong>팝업공지</strong>{(detailEvent.reminder_offsets || EVENT_REMINDER_OFFSETS).map(getReminderLabel).join(', ')}</p>
                            {detailEvent.description && <p className={styles.description}>{detailEvent.description}</p>}
                        </div>
                        {canManage && (
                            <div className={styles.modalActions}>
                                <button type="button" className={styles.secondaryBtn} onClick={() => openEditForm(detailEvent)}>수정</button>
                                <button type="button" className={styles.primaryBtn} onClick={() => openEditForm(detailEvent)}>관리</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {formOpen && (
                <div className={styles.modalBackdrop} onClick={() => !saving && setFormOpen(false)}>
                    <form className={styles.formModal} onSubmit={submitForm} onClick={(event) => event.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                <span className={styles.modalDate}>{editingEvent ? '행사일정 수정' : '행사일정 등록'}</span>
                                <h3 className={styles.modalTitle}>공지범위를 선택해 등록</h3>
                            </div>
                            <button type="button" className={styles.closeBtn} onClick={() => setFormOpen(false)} disabled={saving} aria-label="닫기">×</button>
                        </div>

                        <label className={styles.fieldFull}>
                            <span>제목</span>
                            <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} required maxLength={120} />
                        </label>

                        <div className={styles.fieldGrid}>
                            <label>
                                <span>일자</span>
                                <input type="date" value={form.event_date} onChange={(event) => setForm((prev) => ({ ...prev, event_date: event.target.value }))} required />
                            </label>
                            <label>
                                <span>시작</span>
                                <input type="time" value={form.start_time} onChange={(event) => setForm((prev) => ({ ...prev, start_time: event.target.value }))} />
                            </label>
                            <label>
                                <span>종료</span>
                                <input type="time" value={form.end_time} onChange={(event) => setForm((prev) => ({ ...prev, end_time: event.target.value }))} />
                            </label>
                            <label>
                                <span>장소</span>
                                <input value={form.location} onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} maxLength={120} />
                            </label>
                        </div>

                        <fieldset className={styles.checkGroup}>
                            <legend>공지범위</legend>
                            <div className={styles.checkGrid}>
                                {audienceOptions.map((option) => (
                                    <label key={option.value} className={styles.checkItem}>
                                        <input
                                            type="checkbox"
                                            checked={form.audience_roles.includes(option.value)}
                                            onChange={() => toggleAudience(option.value)}
                                        />
                                        <span>{option.label}</span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        <fieldset className={styles.checkGroup}>
                            <legend>접속 팝업 시점</legend>
                            <div className={styles.reminderRow}>
                                {EVENT_REMINDER_OFFSETS.map((offset) => (
                                    <label key={offset} className={styles.checkItem}>
                                        <input
                                            type="checkbox"
                                            checked={form.reminder_offsets.includes(offset)}
                                            onChange={() => toggleReminder(offset)}
                                        />
                                        <span>{getReminderLabel(offset)}</span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        <label className={styles.fieldFull}>
                            <span>내용</span>
                            <textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} rows={4} maxLength={1000} />
                        </label>

                        <div className={styles.formActions}>
                            {editingEvent && (
                                <button type="button" className={styles.dangerBtn} onClick={deleteEvent} disabled={saving}>삭제</button>
                            )}
                            <button type="button" className={styles.secondaryBtn} onClick={() => setFormOpen(false)} disabled={saving}>취소</button>
                            <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
                        </div>
                    </form>
                </div>
            )}
        </section>
    );
}
