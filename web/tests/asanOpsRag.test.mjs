import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAsanChangeEventsRagText,
  buildAsanGlapsRagText,
} from '../utils/asanOpsRag.mjs';
import {
  buildAsanShippingRagText,
  parseAsanShippingIntent,
} from '../utils/asanShippingRag.mjs';
import { parseAsanDispatchIntent } from '../utils/asanDispatchRag.mjs';

const now = new Date(Date.UTC(2026, 4, 24, 15, 0, 0)); // 2026-05-25 KST

test('선적관리 RAG는 컨테이너 질문을 DB 검색 의도로 인식한다', () => {
  const intent = parseAsanShippingIntent('TCLU4255167 선적관리에서 찾아줘');
  const text = buildAsanShippingRagText({
    headers: ['CONTAINER', '이력 구분', '이력 MOVE TIME', '지역', '반입일'],
    data: [['TCLU4255167', '적하', '2026-05-25 09:10', '아산', '2026-05-25']],
    total: 1,
    source: 'supabase',
  }, intent).text;

  assert.equal(intent.shouldQuery, true);
  assert.deepEqual(intent.containers, ['TCLU4255167']);
  assert.match(text, /Supabase branch_shipping_files\/branch_shipping_rows/);
  assert.match(text, /컨테이너 TCLU4255167/);
  assert.match(text, /이력 적하/);
});

test('변동내역 RAG는 이벤트 상태와 수량변동을 요약한다', () => {
  const intent = parseAsanDispatchIntent('내일 배차변동내역 알려줘', { now });
  const result = buildAsanChangeEventsRagText([
    {
      target_date: '2026-05-26',
      dispatch_type: 'integrated',
      change_type: 'add',
      event_status: 'pending',
      quantity_delta: 1,
      after_snapshot: {
        rowContext: {
          shipper: '글로비스',
          workplace: 'KCC글라스',
          startLocation: '부산신항',
          destination: '부산신항',
          company: '칸',
        },
      },
    },
  ], intent);

  assert.match(result.text, /배차변동내역/);
  assert.match(result.text, /변경유형별: add\(1건\)/);
  assert.match(result.text, /수량변동 합계: 1대/);
  assert.match(result.text, /작업지 KCC글라스/);
});

test('GLAPS RAG는 운송경로와 코드 별칭을 함께 주입한다', () => {
  const result = buildAsanGlapsRagText({
    version: { id: 'v1', source_name: 'GLAPS_마스터', imported_at: '2026-05-25T10:00:00Z' },
    routes: [{
      route_code: 'R001',
      route_name: '부산-아산-부산',
      start_location_name: '부산신항',
      waypoint_els_name: '글로비스KD센터',
      destination_name: '부산신항',
    }],
    aliases: [{
      alias_type: 'carrier',
      source_name: 'ELS',
      glaps_name: 'ELS',
      glaps_code: 'B000005273',
    }],
  }, { searchTerms: ['ELS'] });

  assert.match(result.text, /GLAPS코드/);
  assert.match(result.text, /R001/);
  assert.match(result.text, /부산신항 -> 글로비스KD센터 -> 부산신항/);
  assert.match(result.text, /B000005273/);
});
