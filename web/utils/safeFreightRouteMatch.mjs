const TERMINAL_ORIGIN_HINTS = {
  port_pusan_north: ['부산북항'],
  port_pusan_new: ['부산신항'],
  port_icn_old: ['인천항'],
  port_icn_new: ['인천신항'],
  port_icn_intl: ['인천국제여객'],
  port_gwangyang: ['광양항', '광양'],
  port_phs: ['평택항', '평택'],
  port_ulsan_old: ['울산구항'],
  port_ulsan_new: ['울산신항'],
  port_pohang: ['포항항', '포항'],
  port_gunsan: ['군산항', '군산'],
  port_masan: ['마산항', '마산'],
  port_daesan: ['대산항', '대산'],
  port_kt_icd: ['의왕ICD', '의왕아이씨디'],
};

function compact(value = '') {
  return String(value).replace(/\[.*?\]\s*/g, '').replace(/\s/g, '');
}

function normalizeTerminalText(value = '') {
  return compact(value)
    .replace('인천항국제여객', '인천국제여객')
    .replace('의왕아이씨디', '의왕ICD');
}

function scoreOrigin(originId, hints) {
  const cleanId = normalizeTerminalText(originId);
  let best = 0;
  for (const hint of hints) {
    const cleanHint = normalizeTerminalText(hint);
    if (!cleanHint) continue;
    if (cleanId === cleanHint) best = Math.max(best, 1000 + cleanId.length);
    else if (cleanId.includes(cleanHint) || cleanHint.includes(cleanId)) {
      best = Math.max(best, 500 + Math.min(cleanId.length, cleanHint.length));
    }
  }
  return best;
}

export function findSafeFreightSectionOrigin(originsList = [], terminal = {}) {
  const explicitHints = TERMINAL_ORIGIN_HINTS[terminal.terminalKey] || [];
  const textHints = [
    terminal.text,
    terminal.name,
    ...(terminal.aliases || []),
  ];
  const hints = [...explicitHints, ...textHints].filter(Boolean);
  if (!hints.length) return null;

  const candidates = originsList
    .filter((origin) => origin?.id?.includes('[왕복]'))
    .map((origin) => ({ origin, score: scoreOrigin(origin.id, hints) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || compact(b.origin.id).length - compact(a.origin.id).length);

  return candidates[0]?.origin || null;
}
