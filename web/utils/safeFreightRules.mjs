export function formatSafeFreightKm(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return String(Math.round(n));
}

export function getRegionalBase(text = '') {
    const clean = String(text).replace(/\[.*?\]\s*/g, '').replace(/\s/g, '');
    if (!clean) return null;
    if (clean.includes('인천신항') || clean.includes('인천구항') || clean.includes('인천항') || clean.includes('인천국제여객') || clean.includes('인천')) {
        return { key: 'incheon', label: '인천', pct: 20 };
    }
    if (clean.includes('평택항') || clean.includes('평택')) {
        return { key: 'pyeongtaek', label: '평택', pct: 18 };
    }
    return null;
}

export function isKnownTerminal(text = '') {
    const clean = String(text).replace(/\[.*?\]\s*/g, '').replace(/\s/g, '');
    return [
        '부산북항', '부산신항', '광양항', '울산구항', '울산신항', '포항항',
        '군산항', '마산항', '대산항', '의왕ICD', '의왕아이씨디',
        '인천신항', '인천구항', '인천항', '인천국제여객', '평택항',
    ].some((name) => clean.includes(name));
}

export function getRegionalBaseSurcharge({ origin = '', destination = '', tripMode = 'round', queryType = 'distance', explicitRoundReturn = false } = {}) {
    if (queryType === 'section') return { pct: 0, label: '', reason: 'section_table_includes_base_surcharge' };

    const originBase = getRegionalBase(origin);
    if (!originBase) return { pct: 0, label: '', reason: 'not_regional_base' };

    if (explicitRoundReturn) {
        return { pct: originBase.pct, label: originBase.label, reason: 'explicit_same_base_return' };
    }

    const destinationBase = getRegionalBase(destination);
    if (destinationBase) {
        if (tripMode === 'round' && destinationBase.key === originBase.key) {
            return { pct: originBase.pct, label: originBase.label, reason: 'same_base_round_trip' };
        }
        return { pct: 0, label: originBase.label, reason: 'different_final_base' };
    }

    if (isKnownTerminal(destination)) {
        return { pct: 0, label: originBase.label, reason: 'different_final_terminal' };
    }

    if (tripMode === 'round') {
        return { pct: originBase.pct, label: originBase.label, reason: 'standard_round_trip_to_base' };
    }

    return { pct: 0, label: originBase.label, reason: 'one_way_not_returning_to_base' };
}
