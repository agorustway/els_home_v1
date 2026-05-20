'use client';

import { useEffect, useMemo, useState } from 'react';

import { getReminderLabel } from '@/utils/intranetEvents.mjs';
import calendarStyles from './IntranetEventCalendar.module.css';
import styles from './IntranetEventReminderPopup.module.css';

const SESSION_KEY = 'els_intranet_event_reminders_seen';

function readSessionSeen() {
    try {
        return new Set(JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]'));
    } catch {
        return new Set();
    }
}

function writeSessionSeen(keys) {
    try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify([...keys]));
    } catch {}
}

function getReminderKey(reminder) {
    return `${reminder.id}:${reminder.reminder_offset}`;
}

function formatTimeRange(event) {
    if (event.start_time && event.end_time) return `${event.start_time.slice(0, 5)}-${event.end_time.slice(0, 5)}`;
    if (event.start_time) return event.start_time.slice(0, 5);
    return '종일';
}

export default function IntranetEventReminderPopup({ enabled, refreshKey }) {
    const [reminders, setReminders] = useState([]);
    const [checked, setChecked] = useState({});
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setOpen(false);
            setReminders([]);
            return;
        }

        let cancelled = false;
        const controller = new AbortController();

        async function fetchReminders() {
            try {
                const res = await fetch('/api/intranet/events/reminders', {
                    cache: 'no-store',
                    signal: controller.signal,
                });
                if (!res.ok) return;
                const data = await res.json().catch(() => ({}));
                const seen = readSessionSeen();
                const next = (data.reminders || []).filter((item) => !seen.has(getReminderKey(item)));
                if (!cancelled && next.length > 0) {
                    setReminders(next);
                    setChecked({});
                    setOpen(true);
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.warn('[ELS 행사일정] 알림 조회 실패:', error.message);
                }
            }
        }

        fetchReminders();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [enabled, refreshKey]);

    const checkedItems = useMemo(() => (
        reminders
            .filter((item) => checked[getReminderKey(item)])
            .map((item) => ({
                event_id: item.id,
                reminder_offset: item.reminder_offset,
            }))
    ), [checked, reminders]);

    const closePopup = async () => {
        const seen = readSessionSeen();
        reminders.forEach((item) => seen.add(getReminderKey(item)));
        writeSessionSeen(seen);

        if (checkedItems.length > 0) {
            setSaving(true);
            try {
                await fetch('/api/intranet/events/dismissals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: checkedItems }),
                });
            } catch (error) {
                console.warn('[ELS 행사일정] 알림 숨김 저장 실패:', error.message);
            } finally {
                setSaving(false);
            }
        }

        setOpen(false);
    };

    if (!open || reminders.length === 0) return null;

    return (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="event-reminder-title">
            <div className={styles.popup}>
                <div className={styles.header}>
                    <div>
                        <p className={styles.kicker}>Event Notice</p>
                        <h2 id="event-reminder-title" className={styles.title}>행사일정 공지</h2>
                    </div>
                    <button type="button" className={styles.closeBtn} onClick={closePopup} disabled={saving} aria-label="닫기">×</button>
                </div>

                <div className={styles.list}>
                    {reminders.map((item) => {
                        const key = getReminderKey(item);
                        return (
                            <article key={key} className={styles.item}>
                                <div className={styles.itemMain}>
                                    <span className={styles.badge}>{getReminderLabel(item.reminder_offset)}</span>
                                    <div className={styles.itemText}>
                                        <h3>{item.title}</h3>
                                        <p>{item.event_date} · {formatTimeRange(item)}{item.location ? ` · ${item.location}` : ''}</p>
                                    </div>
                                </div>
                                {item.description && <p className={styles.desc}>{item.description}</p>}
                                <label className={styles.dismissCheck}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(checked[key])}
                                        onChange={(event) => setChecked((prev) => ({ ...prev, [key]: event.target.checked }))}
                                    />
                                    <span>이 알림 다시 보지 않음</span>
                                </label>
                            </article>
                        );
                    })}
                </div>

                <div className={styles.actions}>
                    <button type="button" className={calendarStyles.secondaryBtn} onClick={closePopup} disabled={saving}>닫기</button>
                    <button type="button" className={calendarStyles.primaryBtn} onClick={closePopup} disabled={saving}>
                        {saving ? '저장 중...' : '확인'}
                    </button>
                </div>
            </div>
        </div>
    );
}
