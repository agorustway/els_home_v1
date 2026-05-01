export function makeEducationLogValue(noticeId, title) {
  return `${noticeId} | ${title || '안전교육'}`;
}

export function parseEducationLogTitle(value = '') {
  const text = String(value || '');
  const [, ...titleParts] = text.split('|');
  return titleParts.join('|').trim() || text || '-';
}

export function toYouTubeEmbedUrl(rawUrl = '') {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return `https://www.youtube.com/embed/${url.pathname.replace('/', '')}`;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch' && url.searchParams.get('v')) {
        return `https://www.youtube.com/embed/${url.searchParams.get('v')}`;
      }
      if (url.pathname.startsWith('/shorts/')) {
        return `https://www.youtube.com/embed/${url.pathname.split('/')[2] || ''}`;
      }
      if (url.pathname.startsWith('/embed/')) return raw;
    }
  } catch {
    return raw.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/');
  }
  return raw;
}

export function extractFirstYouTubeUrl(text = '') {
  const source = String(text || '');
  const [match] = source.match(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)[^\s"'<>]+|youtu\.be\/[^\s"'<>]+)/i) || [];
  return match || '';
}

export function extractYouTubeUrls(text = '') {
  const source = String(text || '');
  return [...source.matchAll(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)[^\s"'<>]+|youtu\.be\/[^\s"'<>]+)/gi)]
    .map(match => match[0]);
}

export function stripYouTubeUrls(text = '') {
  return String(text || '')
    .replace(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)[^\s"'<>]+|youtu\.be\/[^\s"'<>]+)/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
