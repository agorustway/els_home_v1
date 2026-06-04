import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAsanTransportHistoryRagText,
  parseAsanTransportHistoryIntent,
} from '../utils/asanTransportHistoryRag.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const now = new Date(Date.UTC(2026, 5, 2, 15, 0, 0)); // 2026-06-03 KST

test('운송내역 RAG는 월/컨테이너/검색어 질문을 DB 조회 의도로 인식한다', () => {
  const intent = parseAsanTransportHistoryIntent('6월 아산 운송내역에서 CMAU7631738 청구금액 찾아줘', { now });

  assert.equal(intent.shouldQuery, true);
  assert.equal(intent.dateScope.mode, 'month');
  assert.equal(intent.dateScope.month, '2026-06-01');
  assert.deepEqual(intent.containers, ['CMAU7631738']);
  assert.equal(intent.searchTerms.includes('CMAU7631738'), true);
});

test('운송내역 RAG 텍스트는 월별 DB 원장을 행 샘플과 요약으로 주입한다', () => {
  const intent = parseAsanTransportHistoryIntent('6월 운송내역 KCC 청구금액 알려줘', { now });
  const result = buildAsanTransportHistoryRagText([
    {
      target_month: '2026-06-01',
      sheet_name: '6월',
      headers: ['SEQ', '작업일자', '업체명', 'CONTAINER', '차량번호', '청구금액', '선사'],
      source_headers: ['SEQ', '작업일자', '업체명', 'CONTAINER', '차량번호', '출차시간', '선사'],
      data: [
        ['1', '2026-06-03', 'KCC글라스', 'CMAU7631738', '0140', '120,000', 'HMM'],
        ['2', '2026-06-04', '현대글로비스', 'TCNU8552871', '1145', '150000', 'ONE'],
        ['3', '2026-06-03', 'KCC글라스', 'SEGU4996444', '0140', '130000', 'HMM'],
      ],
      row_count: 3,
      valid_row_count: 3,
      file_modified_at: '2026-06-03T10:00:00+09:00',
      updated_at: '2026-06-03T10:10:00+09:00',
    },
  ], intent, { maxRows: 10 });

  assert.equal(result.hasMatches, true);
  assert.equal(result.total, 2);
  assert.match(result.text, /사내 데이터베이스 branch_transport_history/);
  assert.match(result.text, /조건 행수: 2건/);
  assert.match(result.text, /청구금액 합계: 25만원/);
  assert.match(result.text, /업체\/운송사 상위: KCC글라스\(2건\)/);
  assert.match(result.text, /컨테이너 CMAU7631738/);
  assert.match(result.text, /차량 0140/);
  assert.match(result.text, /청구금액 120,000/);
  assert.match(result.text, /NAS 원본 파일을 직접 파싱했다고 말하지 마라/);
});

test('운송내역 RAG는 청구금액 칸 공란 시 실적관리 구간단가 후보를 함께 주입한다', () => {
  const intent = parseAsanTransportHistoryIntent('6월 아산 운송내역 KCC 청구금액 찾아줘', { now });
  const result = buildAsanTransportHistoryRagText([
    {
      target_month: '2026-06-01',
      sheet_name: '6월',
      headers: ['SEQ', '작업일자', '작업지', '업체명', 'CONTAINER', '차량번호', '하차지', '청구금액'],
      data: [
        ['1', '2026-06-02', 'KCC글라스', '칸로지텍', 'CMAU3334639', '부산99사3111', 'BNCT', ''],
        ['2', '2026-06-02', 'KCC글라스', '칸로지텍', 'GCXU5841184', '부산99사9691', 'HJNC', ''],
      ],
      row_count: 2,
      valid_row_count: 2,
    },
  ], intent, {
    maxRows: 10,
    billingMatches: {
      exactRows: [],
      routeRows: [
        {
          scope_mode: 'year',
          filter_year: 2026,
          filter_month: 0,
          revenue_amount: 935600,
          purchase_amount: 875000,
          unit_profit: 60600,
          work_site: 'KCC글라스',
          carrier: '칸로지텍',
          category: '라운드',
          pickup: 'BNCT',
          billing_pickup: '부산신항',
          shipment: '부산신항',
          type: '40HC',
          bill_to: '글로비스',
          pay_to: '칸로지텍',
          row_count: 41,
          period_start: '2026-03',
          period_end: '2026-05',
        },
      ],
      errors: [],
    },
  });

  assert.equal(result.hasMatches, true);
  assert.match(result.text, /청구금액 칸 공란 \/ 실적관리·구간단가 교차 조회 후보 있음/);
  assert.match(result.text, /### 금액 교차 조회/);
  assert.match(result.text, /청구 935,600원/);
  assert.match(result.text, /하불 875,000원/);
  assert.match(result.text, /운송내역 원장 자체의 청구금액 칸은 공란/);
});

test('채팅 API와 AI 메타는 운송내역 RAG를 실제 연결 범위에 포함한다', () => {
  const route = readFileSync(resolve(__dirname, '../app/api/chat/route.js'), 'utf8');
  const meta = readFileSync(resolve(__dirname, '../utils/aiAssistantMeta.mjs'), 'utf8');

  assert.match(route, /buildAsanTransportHistoryRagContext/);
  assert.match(route, /아산 운송내역/);
  assert.match(route, /금액 교차 조회/);
  assert.match(meta, /운송내역/);
  assert.doesNotMatch(meta, /Supabase/);
});
