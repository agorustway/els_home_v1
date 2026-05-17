import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  getLatestUserActivityTime,
  hasUserConversation,
  optimizeSessionsForStorage,
  shouldIgnoreIncomingMemory,
} from '../utils/chatMemory.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const oldSessions = [
  {
    id: '1779000000000',
    title: '예전 대화',
    messages: [
      { role: 'assistant', content: 'init', timestamp: '2026-05-17T23:59:00.000Z' },
      { role: 'user', content: '삭제 전 질문', timestamp: '2026-05-18T00:00:00.000Z' },
    ],
  },
];

test('첨부파일 원본 데이터는 대화 저장 전에 제거한다', () => {
  const optimized = optimizeSessionsForStorage([
    {
      id: '1779000000000',
      messages: [
        {
          role: 'user',
          content: '파일',
          attachments: [{ name: 'a.png', mime_type: 'image/png', data: 'base64-body' }],
        },
      ],
    },
  ]);

  assert.equal(optimized[0].messages[0].attachments[0].data, undefined);
  assert.equal(optimized[0].messages[0].attachments[0].name, 'a.png');
});

test('사용자 메시지가 없는 기본 대화는 저장 대상 대화로 보지 않는다', () => {
  assert.equal(hasUserConversation([
    { id: '1779000000000', messages: [{ role: 'assistant', content: 'init' }] },
  ]), false);

  assert.equal(hasUserConversation(oldSessions), true);
});

test('전체 삭제 뒤 늦게 도착한 옛 자동저장 스냅샷은 무시한다', () => {
  assert.equal(shouldIgnoreIncomingMemory({
    existingMessages: [],
    existingUpdatedAt: '2026-05-18T00:01:00.000Z',
    incomingMessages: oldSessions,
  }), true);
});

test('전체 삭제 뒤 새로 작성한 대화는 저장을 허용한다', () => {
  assert.equal(shouldIgnoreIncomingMemory({
    existingMessages: [],
    existingUpdatedAt: '2026-05-18T00:01:00.000Z',
    incomingMessages: [
      {
        id: '1779000120000',
        title: '새 대화',
        messages: [
          { role: 'assistant', content: 'init', timestamp: '2026-05-18T00:01:01.000Z' },
          { role: 'user', content: '삭제 후 질문', timestamp: '2026-05-18T00:02:00.000Z' },
        ],
      },
    ],
  }), false);
});

test('타임스탬프가 없는 예전 데이터도 세션 id로 삭제 전후를 판정한다', () => {
  assert.equal(getLatestUserActivityTime([
    {
      id: '1779000000000',
      messages: [
        { role: 'assistant', content: 'init' },
        { role: 'user', content: '예전 질문' },
      ],
    },
  ]), 1779000000000);
});

test('대화 메모리 API는 삭제 마커와 purge 경로를 모두 가진다', () => {
  const route = readFileSync(resolve(__dirname, '../app/api/chat/memory/route.js'), 'utf8');

  assert.match(route, /shouldIgnoreIncomingMemory/);
  assert.match(route, /stale_after_delete/);
  assert.match(route, /get\('purge'\)\s*===\s*'1'/);
  assert.match(route, /messages:\s*\[\]/);
});
