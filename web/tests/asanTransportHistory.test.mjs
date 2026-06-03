import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeTransportHistoryMetaItem,
  normalizeTransportHistoryHeaders,
  normalizeTransportHistoryMonth,
} from '../utils/asanTransportHistory.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

test('아산 운송내역 헤더는 출차시간을 청구금액으로 통합한다', () => {
  const headers = normalizeTransportHistoryHeaders(['일자', '컨테이너', '출차시간', '비고']);

  assert.deepEqual(headers, ['일자', '컨테이너', '청구금액', '비고']);
});

test('아산 운송내역 메타 응답은 data 없이 행수와 원본 헤더를 보존한다', () => {
  const item = makeTransportHistoryMetaItem({
    target_month: '2026-06-01',
    sheet_name: '6월',
    headers: ['일자', '청구금액'],
    source_headers: ['일자', '출차시간'],
    data: [['2026-06-01', '120000']],
    row_count: 1,
    valid_row_count: 1,
  });

  assert.equal(item.meta_only, true);
  assert.equal(item.row_count, 1);
  assert.equal(item.valid_row_count, 1);
  assert.deepEqual(item.data, []);
  assert.deepEqual(item.source_headers, ['일자', '출차시간']);
});

test('아산 운송내역 월 파라미터는 월 첫날로 정규화한다', () => {
  assert.equal(normalizeTransportHistoryMonth('2026-06'), '2026-06-01');
  assert.equal(normalizeTransportHistoryMonth('2026-06-18'), '2026-06-01');
  assert.equal(normalizeTransportHistoryMonth('bad'), '');
});

test('아산 운송내역 Next API는 배차판처럼 meta/date/full 모드를 제공한다', () => {
  const route = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/transport-history/route.js'),
    'utf8',
  );

  assert.match(route, /getTransportHistoryQueryMode/);
  assert.match(route, /TRANSPORT_HISTORY_META_SELECT/);
  assert.match(route, /\.from\('branch_transport_history'\)/);
  assert.match(route, /mode === 'meta' \? TRANSPORT_HISTORY_META_SELECT : '\*'/);
  const metaSelectLine = route.split('\n').find(line => line.includes('const TRANSPORT_HISTORY_META_SELECT')) || '';
  const metaSelectFields = metaSelectLine.match(/'([^']+)'/)?.[1].split(',') || [];
  assert.equal(metaSelectFields.includes('data'), false);
});

test('아산 운송내역 동기화는 NAS 백엔드 상태와 POST를 프록시한다', () => {
  const route = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/transport-history/sync/route.js'),
    'utf8',
  );

  assert.match(route, /\/api\/branches\/asan\/transport-history\/sync/);
  assert.match(route, /export async function GET\(\)/);
  assert.match(route, /export async function POST\(\)/);
  assert.match(route, /cache: 'no-store'/);
});

test('아산 운송내역 SQL은 서비스롤 전용과 메타 조회 인덱스를 갖는다', () => {
  const sql = fs.readFileSync(
    path.join(repoRoot, 'web/supabase_sql/20260603_asan_transport_history.sql'),
    'utf8',
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.branch_transport_history/);
  assert.match(sql, /target_month DATE NOT NULL/);
  assert.match(sql, /row_count INTEGER NOT NULL DEFAULT 0/);
  assert.match(sql, /valid_row_count INTEGER NOT NULL DEFAULT 0/);
  assert.match(sql, /transport_history_path TEXT/);
  assert.match(sql, /idx_branch_transport_history_meta_lookup/);
  assert.match(sql, /ALTER TABLE public\.branch_transport_history ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.branch_transport_history FROM anon, authenticated/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.branch_transport_history TO service_role/);
});

test('아산 운송내역 NAS Core는 2026_수출리스트를 배차판 동기화 방식으로 적재한다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'docker/els-backend/app_core.py'),
    'utf8',
  );

  assert.match(source, /ASAN_TRANSPORT_HISTORY_DEFAULT_PATH = "\/아산지점\/2026_수출리스트\.xlsx"/);
  assert.match(source, /transport_history_sync_gate = StableFileSyncGate/);
  assert.match(source, /def sync_asan_transport_history_python\(force=False, phase="all", preserve_quick=False\):/);
  assert.match(source, /sync_asan_transport_history_manual_python/);
  assert.match(source, /branch_transport_history/);
  assert.match(source, /_normalize_transport_history_headers/);
  assert.match(source, /"출차시간": "청구금액"/);
  assert.match(source, /@app\.route\("\/api\/branches\/asan\/transport-history\/sync", methods=\["GET", "POST"\]\)/);
});

test('아산 상위 탭은 배차판 옆에 운송내역을 둔다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );

  assert.match(source, /const MAIN_TABS = \['dispatch', 'transport-history', 'shipping', 'performance'\];/);
  assert.match(source, /const AsanTransportHistory = dynamic/);
  assert.match(source, /배차판[\s\S]*운송내역[\s\S]*선적관리/);
  assert.match(source, /activeMainTab === 'transport-history' && <AsanTransportHistory \/>/);
});

test('아산 운송내역 화면은 현황판 없이 현재 선택 시트 테이블만 관리한다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanTransportHistory.js'),
    'utf8',
  );

  assert.match(source, /TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH = '\/아산지점\/2026_수출리스트\.xlsx'/);
  assert.match(source, /\/api\/branches\/asan\/transport-history\?mode=meta/);
  assert.match(source, /\/api\/branches\/asan\/transport-history\/sync/);
  assert.match(source, /loadNasFolder\('\/아산지점'\)/);
  assert.match(source, /className=\{styles\.browseBtn\}[\s\S]*찾기/);
  assert.match(source, /setDraftPath\(file\.path\)/);
  assert.match(source, /NAS 동기화/);
  assert.match(source, /현재 선택 시트/);
  assert.doesNotMatch(source, /현황판/);
});

test('아산 운송내역 설정 저장은 transport_history_path 컬럼 미적용 상태에서도 에러를 피한다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/settings/route.js'),
    'utf8',
  );

  assert.match(source, /TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH = '\/아산지점\/2026_수출리스트\.xlsx'/);
  assert.match(source, /isTransportHistoryPathColumnMissing/);
  assert.match(source, /transport_history_path_unpersisted/);
  assert.match(source, /retryPayload/);
});

test('아산 운송내역 SQL은 기본 경로와 기존 오입력 경로를 아산지점 직하로 보정한다', () => {
  const baseSql = fs.readFileSync(
    path.join(repoRoot, 'web/supabase_sql/20260603_asan_transport_history.sql'),
    'utf8',
  );
  const fixSql = fs.readFileSync(
    path.join(repoRoot, 'web/supabase_sql/20260603_asan_transport_history_path_fix.sql'),
    'utf8',
  );

  assert.match(baseSql, /DEFAULT '\/아산지점\/2026_수출리스트\.xlsx'/);
  assert.match(fixSql, /transport_history_path = '\/아산지점\/2026_수출리스트\.xlsx'/);
  assert.match(fixSql, /\/아산지점\/A_운송실무\/2026_수출리스트\.xlsx/);
});
