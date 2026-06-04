import { parseAsanDispatchIntent } from './asanDispatchRag.mjs';

const DEFAULT_LIMIT = 80;

const CHANGE_TRIGGER_WORDS = [
  '변동내역', '변동 내역', '배차변동', '배차 변동', '변경내역', '변경 내역',
  '추가취소', '추가취소쌍', '확인완료', '확인취소',
];

const GLAPS_TRIGGER_WORDS = [
  'glaps', 'glaps코드', 'glaps 코드', '운송경로코드', '운송경로 코드',
  '최종코드', 'bp코드', '컨샤이니', '화주사코드', '포트코드', '라인코드', '타입코드',
];

const IGNORE_TERMS = new Set([
  '아산', '아산지점', '배차', '배차판', '상세배차', '상세', '상세라인',
  '변동', '변동내역', '변경', '변경내역', '내역', '코드', 'glaps', 'glaps코드',
  '읽어', '읽을수', '읽을수있는거지', '알려줘', '조회', '확인', '모두', '전체',
]);

function normalizeCompact(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function cleanText(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function tokenize(text) {
  return Array.from(new Set(
    String(text || '')
      .normalize('NFKC')
      .match(/[가-힣A-Za-z0-9_()./-]+/g) || [],
  ));
}

function stripParticle(term) {
  return String(term || '')
    .replace(/[?!.:,;]+$/g, '')
    .replace(/(은|는|이|가|을|를|에|에서|으로|로|와|과|야|요|죠|지|냐|니|다)$/g, '');
}

function buildSearchTerms(text, inputTerms = []) {
  const terms = [];
  const seen = new Set();
  for (const raw of [...tokenize(text), ...(Array.isArray(inputTerms) ? inputTerms : [])]) {
    const term = stripParticle(raw);
    const compact = normalizeCompact(term);
    if (!compact || compact.length < 2) continue;
    if (IGNORE_TERMS.has(compact)) continue;
    if (/^\d{1,2}월\d{0,2}일?$/.test(compact) || /^\d{1,2}[./-]\d{1,2}/.test(compact)) continue;
    if (/^\d+$/.test(compact)) continue;
    if (seen.has(compact)) continue;
    seen.add(compact);
    terms.push(term);
  }
  return terms.slice(0, 6);
}

function hasAnyTrigger(text, words) {
  const compact = normalizeCompact(text);
  return words.some((word) => compact.includes(normalizeCompact(word)));
}

function addCount(map, key, amount = 1) {
  if (!key) return;
  map[key] = (map[key] || 0) + amount;
}

function topMapText(map, limit = 10) {
  const entries = Object.entries(map || {}).sort((a, b) => b[1] - a[1]).slice(0, limit);
  return entries.length ? entries.map(([key, value]) => `${key}(${value}건)`).join(', ') : '없음';
}

function dateScopedQuery(query, intent) {
  const scope = intent.dateScope;
  if (scope.mode === 'month') return query.like('target_date', `${scope.year}-${String(scope.month).padStart(2, '0')}-%`);
  if (scope.mode === 'day' && scope.targetDates.length === 1) return query.eq('target_date', scope.targetDates[0]);
  if (scope.targetDates.length > 1) return query.in('target_date', scope.targetDates);
  return query.gte('target_date', scope.start).lte('target_date', scope.end);
}

function eventPayload(row = {}) {
  return [row.editable_payload, row.after_snapshot, row.before_snapshot]
    .find((payload) => payload && Object.keys(payload || {}).length > 0)
    || {};
}

function summarizeEvent(row = {}) {
  const payload = eventPayload(row);
  const context = payload.rowContext || {};
  const values = payload.rowValues || payload.values || [];
  return [
    row.change_type ? `유형 ${row.change_type}` : '',
    row.event_status ? `상태 ${row.event_status}` : '',
    Number(row.quantity_delta || 0) ? `수량변동 ${row.quantity_delta}` : '',
    context.shipper ? `화주 ${context.shipper}` : '',
    context.workplace ? `작업지 ${context.workplace}` : '',
    context.startLocation || context.startRegion ? `상차 ${context.startLocation || context.startRegion}` : '',
    context.destination ? `선적 ${context.destination}` : '',
    context.company ? `업체 ${context.company}` : '',
    values.length ? `행값 ${values.map(cleanText).filter(Boolean).slice(0, 6).join(' / ')}` : '',
  ].filter(Boolean).join(' / ');
}

export function buildAsanChangeEventsRagText(rows = [], intent = {}) {
  const byType = {};
  const byStatus = {};
  let deltaTotal = 0;
  rows.forEach((row) => {
    addCount(byType, row.change_type || 'unknown');
    addCount(byStatus, row.event_status || 'unknown');
    deltaTotal += Number(row.quantity_delta || 0);
  });

  let text = `\n\n## 아산지점 배차변동내역\n`;
  text += `[시스템: 사내 데이터베이스 branch_dispatch_detail_change_events / 조회 범위 ${intent.dateScope.label} / 조회 ${rows.length}건]\n`;
  text += `- 변경유형별: ${topMapText(byType)}\n`;
  text += `- 처리상태별: ${topMapText(byStatus)}\n`;
  text += `- 수량변동 합계: ${deltaTotal}대\n`;
  text += `> [해석 규칙] 변동내역은 확정 스냅샷 대비 추가/삭제/변경 이벤트다. GLAPS 파생코드 보강만으로 생긴 차이는 배차 변동으로 보지 않는다.\n`;
  if (rows.length) {
    text += `### 변동 이벤트\n`;
    rows.slice(0, DEFAULT_LIMIT).forEach((row, idx) => {
      const typeLabel = row.dispatch_type === 'mobis' ? '모비스' : (row.dispatch_type === 'glovis' ? '글로비스' : row.dispatch_type || '-');
      text += `- ${idx + 1}. [${row.target_date} ${typeLabel}] ${summarizeEvent(row) || row.detail_line_key || row.event_key || row.id}\n`;
    });
    if (rows.length > DEFAULT_LIMIT) text += `- 이벤트는 ${DEFAULT_LIMIT}건까지만 주입됨. 실제 조회는 ${rows.length}건이다.\n`;
  } else {
    text += `> [조회 완료] 해당 조건의 배차변동 이벤트가 없습니다. 실제 데이터베이스 조회 결과 기준으로 0건이라고 답하라.\n`;
  }
  return { text, hasMatches: rows.length > 0, total: rows.length };
}

export async function buildAsanChangeEventsRagContext({
  supabase,
  userText = '',
  userKwd = '',
  searchTerms = [],
  now = new Date(),
} = {}) {
  if (!hasAnyTrigger(userText, CHANGE_TRIGGER_WORDS)) {
    return { shouldQuery: false, success: false, text: '' };
  }
  const intent = parseAsanDispatchIntent(userText, { userKwd, searchTerms, now });
  let query = supabase
    .from('branch_dispatch_detail_change_events')
    .select('id,target_date,dispatch_type,change_type,event_status,quantity_delta,event_key,detail_line_key,before_snapshot,after_snapshot,editable_payload,occurred_at,event_order')
    .eq('branch_id', 'asan')
    .eq('active', true)
    .order('target_date', { ascending: false })
    .order('event_order', { ascending: true })
    .limit(DEFAULT_LIMIT);
  query = dateScopedQuery(query, intent);
  if (intent.typeFilters?.length === 1) query = query.in('dispatch_type', [intent.typeFilters[0], 'integrated']);

  const { data, error } = await query;
  if (error) {
    return {
      shouldQuery: true,
      success: false,
      intent,
      error,
      text: `\n\n## 아산지점 배차변동내역\n> [조회 실패] ${error.message || String(error)}`,
    };
  }
  const rag = buildAsanChangeEventsRagText(data || [], intent);
  return { shouldQuery: true, success: true, intent, ...rag };
}

export function buildAsanGlapsRagText({ version = null, routes = [], aliases = [] } = {}, intent = {}) {
  const byAliasType = {};
  aliases.forEach((row) => addCount(byAliasType, row.alias_type || 'unknown'));
  let text = `\n\n## 아산지점 GLAPS코드\n`;
  text += `[시스템: 사내 데이터베이스 glaps_master_versions/glaps_transport_routes/glaps_master_aliases / 활성버전 ${version?.id || '없음'} / 검색 ${intent.searchTerms?.join(', ') || '전체'}]\n`;
  text += `- 원장: ${version?.source_name || '-'} / 반영일시: ${version?.imported_at || '-'}\n`;
  text += `- 운송경로 샘플: ${routes.length}건 / 코드표 샘플: ${aliases.length}건 / 코드유형: ${topMapText(byAliasType)}\n`;
  text += `> [해석 규칙] 상세배차 GLAPS 매칭은 상차지 + 경유지(ELS/작업지) + 하차지(선적)을 기준으로 기존 운송경로코드를 찾는다. 없는 코드를 새로 만들지 마라.\n`;

  if (routes.length) {
    text += `### 운송경로 코드\n`;
    routes.slice(0, 40).forEach((row) => {
      text += `- ${row.route_code || '-'} / ${row.route_name || '-'} / ${row.start_location_name || '-'} -> ${row.waypoint_els_name || row.waypoint_name || '-'} -> ${row.destination_name || '-'}\n`;
    });
  }
  if (aliases.length) {
    text += `### 항목 코드/별칭\n`;
    aliases.slice(0, 40).forEach((row) => {
      text += `- [${row.alias_type || '-'}] ${row.source_name || row.els_name || '-'} -> ${row.glaps_name || '-'} / ${row.glaps_code || '-'}\n`;
    });
  }
  if (!version) {
    text += `> [조회 완료] 활성 GLAPS 원장을 찾지 못했습니다.\n`;
  }
  return { text, hasMatches: Boolean(version), total: routes.length + aliases.length };
}

function applySingleTermFilter(query, columns, term) {
  if (!term) return query;
  const safe = String(term).replace(/[,\\]/g, ' ');
  return query.or(columns.map((column) => `${column}.ilike.%${safe}%`).join(','));
}

export async function buildAsanGlapsRagContext({
  supabase,
  userText = '',
  searchTerms = [],
} = {}) {
  if (!hasAnyTrigger(userText, GLAPS_TRIGGER_WORDS)) {
    return { shouldQuery: false, success: false, text: '' };
  }
  const intent = {
    searchTerms: buildSearchTerms(userText, searchTerms),
  };

  const { data: versions, error: versionError } = await supabase
    .from('glaps_master_versions')
    .select('id,source_name,imported_at')
    .eq('branch_id', 'asan')
    .eq('active', true)
    .order('imported_at', { ascending: false })
    .limit(1);
  if (versionError) {
    return {
      shouldQuery: true,
      success: false,
      intent,
      error: versionError,
      text: `\n\n## 아산지점 GLAPS코드\n> [조회 실패] ${versionError.message || String(versionError)}`,
    };
  }

  const version = versions?.[0] || null;
  if (!version) {
    const rag = buildAsanGlapsRagText({ version: null, routes: [], aliases: [] }, intent);
    return { shouldQuery: true, success: false, intent, ...rag };
  }

  const term = intent.searchTerms[0] || '';
  let routeQuery = supabase
    .from('glaps_transport_routes')
    .select('route_code,route_name,start_location_name,waypoint_name,waypoint_els_name,destination_name')
    .eq('version_id', version.id)
    .eq('active', true)
    .order('route_code', { ascending: true })
    .limit(60);
  routeQuery = applySingleTermFilter(routeQuery, ['route_code', 'route_name', 'start_location_name', 'waypoint_els_name', 'destination_name'], term);

  let aliasQuery = supabase
    .from('glaps_master_aliases')
    .select('alias_type,source_name,els_name,glaps_name,glaps_code')
    .eq('version_id', version.id)
    .eq('active', true)
    .order('alias_type', { ascending: true })
    .order('source_name', { ascending: true })
    .limit(60);
  aliasQuery = applySingleTermFilter(aliasQuery, ['source_name', 'els_name', 'glaps_name', 'glaps_code'], term);

  const [routeResult, aliasResult] = await Promise.all([routeQuery, aliasQuery]);
  const error = routeResult.error || aliasResult.error;
  if (error) {
    return {
      shouldQuery: true,
      success: false,
      intent,
      error,
      text: `\n\n## 아산지점 GLAPS코드\n> [조회 실패] ${error.message || String(error)}`,
    };
  }

  const rag = buildAsanGlapsRagText({
    version,
    routes: routeResult.data || [],
    aliases: aliasResult.data || [],
  }, intent);
  return { shouldQuery: true, success: true, intent, ...rag };
}
