import { formatPerformanceCellValue } from './asanPerformanceView.mjs';

export const PERFORMANCE_TABLE_EXPORT_PAGE_SIZE = 50000;

function fmtShortTs(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function fmtFileTs(value = new Date()) {
  return fmtShortTs(value).replace(/[-:\s]/g, '').slice(0, 12) || String(Date.now());
}

function safeFileNamePart(value = '') {
  return String(value || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').trim();
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
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function normalizeExportHeaders(headers = [], visibleColumns = []) {
  const allHeaders = Array.isArray(headers) ? headers.filter(Boolean) : [];
  const visible = Array.isArray(visibleColumns) && visibleColumns.length ? visibleColumns : allHeaders;
  return visible.filter(header => allHeaders.includes(header));
}

function modeLabel(searchMode = 'or') {
  return searchMode === 'and' ? '모두 포함' : '하나라도 포함';
}

export async function downloadPerformanceTableExcel({
  endpoint,
  params,
  headers,
  visibleColumns,
  title,
  sheetName,
  fileNamePrefix,
  searchTerm = '',
  searchMode = 'or',
}) {
  const query = new URLSearchParams(params || {});
  query.set('source', 'supabase');
  query.set('page', '1');
  query.set('page_size', String(PERFORMANCE_TABLE_EXPORT_PAGE_SIZE));
  query.set('export', '1');
  query.delete('dashboard');

  const sourceResponse = await fetch(`${endpoint}?${query.toString()}`, { cache: 'no-store' });
  const sourceText = await sourceResponse.text();
  let sourceJson = {};
  try {
    sourceJson = sourceText ? JSON.parse(sourceText) : {};
  } catch {
    throw new Error(`실적 테이블 조회 실패: HTTP ${sourceResponse.status}`);
  }
  if (!sourceResponse.ok) {
    throw new Error(sourceJson?.error || '실적 테이블 조회 실패');
  }

  const payload = sourceJson?.data || {};
  const sourceHeaders = Array.isArray(payload.headers) && payload.headers.length ? payload.headers : headers;
  const exportHeaders = normalizeExportHeaders(sourceHeaders, visibleColumns);
  const sourceRows = Array.isArray(payload.data) ? payload.data : [];
  const exportRows = sourceRows.map(row => (
    exportHeaders.map(header => {
      const idx = sourceHeaders.indexOf(header);
      return idx >= 0 ? formatPerformanceCellValue(header, row?.[idx]) : '';
    })
  ));

  if (!exportHeaders.length) throw new Error('다운로드할 컬럼이 없습니다.');
  if (!exportRows.length) throw new Error('다운로드할 데이터가 없습니다.');

  const total = Number(payload.total ?? exportRows.length) || exportRows.length;
  const generatedAt = [
    `다운로드 ${fmtShortTs(new Date())}`,
    `${exportRows.length.toLocaleString('ko-KR')} / ${total.toLocaleString('ko-KR')}건`,
    searchTerm ? `검색 ${searchTerm}` : '검색 전체',
    `조건 ${modeLabel(searchMode)}`,
  ].join(' / ');
  const prefix = safeFileNamePart(fileNamePrefix || title || '아산_실적');
  const fileName = `${prefix}_${fmtFileTs(new Date())}.xlsx`;

  const workbookResponse = await fetch('/api/branches/asan/export/view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      sheetName,
      fileName,
      headers: exportHeaders,
      rows: exportRows,
      generatedAt,
    }),
  });
  if (!workbookResponse.ok) {
    const errorPayload = await workbookResponse.json().catch(() => ({}));
    throw new Error(errorPayload.error || '실적 테이블 엑셀 생성 실패');
  }

  const blob = await workbookResponse.blob();
  triggerBlobDownload(blob, getDownloadFileName(workbookResponse, fileName));
  return {
    exportedRows: exportRows.length,
    totalRows: total,
    capped: total > exportRows.length,
  };
}
