import test from 'node:test';
import assert from 'node:assert/strict';

import {
    EVENT_REMINDER_OFFSETS,
    addDays,
    buildMonthMatrix,
    daysUntilEvent,
    eventMatchesRole,
    getDueReminderOffset,
    getMonthRange,
    getReminderLabel,
    normalizeAudienceRoles,
    sanitizeReminderOffsets,
} from '../utils/intranetEvents.mjs';

test('월간 행사일정 매트릭스는 일요일 시작 6주 그리드로 생성된다', () => {
    const matrix = buildMonthMatrix('2026-05');

    assert.equal(matrix.length, 42);
    assert.equal(matrix[0].date, '2026-04-26');
    assert.equal(matrix[5].date, '2026-05-01');
    assert.equal(matrix.at(-1).date, '2026-06-06');
    assert.equal(matrix.filter((day) => day.inMonth).length, 31);
});

test('월 범위와 날짜 덧셈은 YYYY-MM-DD 기준으로 계산된다', () => {
    assert.deepEqual(getMonthRange('2026-02'), {
        month: '2026-02',
        start: '2026-02-01',
        end: '2026-02-28',
    });
    assert.equal(addDays('2026-05-28', 7), '2026-06-04');
    assert.equal(daysUntilEvent('2026-05-20', '2026-05-20'), 0);
});

test('공지범위는 전체 또는 현재 역할 기준으로 매칭된다', () => {
    assert.deepEqual(normalizeAudienceRoles(['all', 'asan']), ['all']);
    assert.deepEqual(normalizeAudienceRoles([], 'asan'), ['asan']);
    assert.equal(eventMatchesRole({ audience_roles: ['all'] }, 'dangjin'), true);
    assert.equal(eventMatchesRole({ audience_roles: ['asan', 'jungbu'] }, 'asan'), true);
    assert.equal(eventMatchesRole({ audience_roles: ['asan', 'jungbu'] }, 'dangjin'), false);
});

test('행사 알림은 7일전, 3일전, 1일전, 당일만 due 처리된다', () => {
    assert.deepEqual(sanitizeReminderOffsets(), EVENT_REMINDER_OFFSETS);
    assert.deepEqual(sanitizeReminderOffsets([7, 7, 1, 2, '0']), [7, 1, 0]);
    assert.equal(getDueReminderOffset('2026-05-27', '2026-05-20'), 7);
    assert.equal(getDueReminderOffset('2026-05-23', '2026-05-20'), 3);
    assert.equal(getDueReminderOffset('2026-05-21', '2026-05-20'), 1);
    assert.equal(getDueReminderOffset('2026-05-20', '2026-05-20'), 0);
    assert.equal(getDueReminderOffset('2026-05-22', '2026-05-20'), null);
    assert.equal(getReminderLabel(0), '오늘');
    assert.equal(getReminderLabel(1), '내일');
    assert.equal(getReminderLabel(7), '7일 전');
});
