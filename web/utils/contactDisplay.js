import { formatKoreanPhoneNumber } from './koreanPhoneNumber.mjs';

export function formatPhoneNumber(value) {
    return formatKoreanPhoneNumber(value);
}

export function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('ko-KR', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
    });
}

export function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ko-KR', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function joinDefined(values, separator = ' ') {
    return values.filter((value) => value !== undefined && value !== null && String(value).trim() !== '').join(separator);
}

export function getSafeFileUrl(url, name) {
    if (!url) return '';
    let target = url;
    if (target.startsWith('http')) {
        try {
            const parsed = new URL(target);
            target = parsed.pathname + parsed.search;
        } catch {
            target = url;
        }
    }

    if (name && (target.includes('/api/s3/files') || target.includes('/api/nas/files')) && !target.includes('name=')) {
        const connector = target.includes('?') ? '&' : '?';
        target = `${target}${connector}name=${encodeURIComponent(name)}`;
    }
    return target;
}

export function isImageFile(file) {
    const name = typeof file === 'string' ? file : file?.name;
    return /\.(jpeg|jpg|gif|png|webp)$/i.test(name || '');
}
