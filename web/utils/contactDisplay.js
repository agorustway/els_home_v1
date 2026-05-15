export function formatPhoneNumber(value) {
    if (!value) return '-';
    const raw = String(value).replace(/[^0-9]/g, '');
    if (!raw) return '-';
    if (raw.length <= 3) return raw;
    if (raw.length <= 7) return `${raw.slice(0, 3)}-${raw.slice(3)}`;
    if (raw.length === 8) return `${raw.slice(0, 4)}-${raw.slice(4)}`;
    if (raw.startsWith('02')) {
        if (raw.length <= 9) return `${raw.slice(0, 2)}-${raw.slice(2, 5)}-${raw.slice(5)}`;
        return `${raw.slice(0, 2)}-${raw.slice(2, 6)}-${raw.slice(6, 10)}`;
    }
    return `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 11)}`;
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
