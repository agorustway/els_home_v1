'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import styles from './route-search.module.css';

const SIDO_MAP_SHORT = {
    '서울특별시': '서울시', '인천광역시': '인천시', '부산광역시': '부산시', '대전광역시': '대전시',
    '대구광역시': '대구시', '울산광역시': '울산시', '광주광역시': '광주시', '세종특별자치시': '세종시',
    '경기도': '경기도', '강원도': '강원도', '충청북도': '충북', '충청남도': '충남',
    '전라북도': '전북', '전라남도': '전남', '경상북도': '경북', '경상남도': '경남', '제주특별자치도': '제주도',
    '경기': '경기도', '강원': '강원도', '충북': '충북', '충남': '충남',
    '전북': '전북', '전남': '전남', '경북': '경북', '경남': '경남', '제주': '제주도',
    '서울': '서울시', '부산': '부산시', '대구': '대구시', '인천': '인천시',
    '광주': '광주시', '대전': '대전시', '울산': '울산시', '세종': '세종시'
};

export const TERMINAL_LIST = [
    { key: 'port_pusan_new', name: '부산신항(HMM/HPNT)', aliases: ['부산신항기점', 'HMM', 'HPNT', '부산신항'], r1: '부산시', r2: '강서구', r3: '가덕도동', lat: 35.07850, lng: 128.82500 },
    { key: 'port_pusan_north', name: '부산북항(BPT)', aliases: ['부산북항기점', '부산항', 'BPT', '신선대터미널'], r1: '부산시', r2: '남구', r3: '감만1동', lat: 35.11211, lng: 129.10091 },
    { key: 'port_icn_new', name: '인천신항(HJIT)', aliases: ['인천신항기점', '한진신항터미널', '선광신항터미널'], r1: '인천시', r2: '연수구', r3: '송도1동', lat: 37.34534, lng: 126.62711 },
    { key: 'port_icn_old', name: '인천내항(ICT)', aliases: ['인천항기점', '인천남항', 'ICT터미널'], r1: '인천시', r2: '중구', r3: '신흥동3가', lat: 37.44681, lng: 126.60273 },
    { key: 'port_kt_icd', name: '의왕ICD', aliases: ['의왕기점', '부곡역', '의왕터미널'], r1: '경기도', r2: '의왕시', r3: '고천동', lat: 37.32366, lng: 126.96507 },
    { key: 'port_phs', name: '평택항(PCTC)', aliases: ['평택기점', '평택컨테이너터미널'], r1: '경기도', r2: '평택시', r3: '포승읍', lat: 36.96667, lng: 126.85800 },
    { key: 'port_gwangyang', name: '광양항(GWCT)', aliases: ['광양기점', '광양터미널'], r1: '전남', r2: '광양시', r3: '태인동', lat: 34.88764, lng: 127.69616 },
    { key: 'port_ulsan_new', name: '울산신항(UNCT)', aliases: ['울산항기점', '울산신항컨테이너'], r1: '울산시', r2: '남구', r3: '야음장생포동', lat: 35.45896, lng: 129.36438 }
];

export const TERMINAL_COORDS = TERMINAL_LIST.reduce((acc, t) => {
    acc[t.key] = { lat: t.lat, lng: t.lng, name: t.name, aliases: t.aliases || [] };
    return acc;
}, {});

const LocationBlock = ({
    fieldKey, locState, setLocState,
    searchResults = [],
    showDropdown = false,
    setActiveField, onPlaceSelect,
    placeholder, dotColor, onRemove,
    handlePlaceSearch, handleInputKeyDown,
    showTerminal = true,
    regionsData = {}
}) => {
    const [jusoSearch, setJusoSearch] = useState('');
    const [jusoResults, setJusoResults] = useState([]);
    const [showJusoDropdown, setShowJusoDropdown] = useState(false);
    const [highlightIdx, setHighlightIdx] = useState(0);
    const jusoTimerRef = useRef(null);

    /* ─── 행정구역 드롭다운 목록 (regionsData prop 기반) ─── */
    const r1List = useMemo(() => Object.keys(regionsData), [regionsData]);
    const r2List = useMemo(() => {
        if (!locState.r1 || !regionsData[locState.r1]) return [];
        const val = regionsData[locState.r1];
        return Array.isArray(val) ? val : Object.keys(val);
    }, [regionsData, locState.r1]);
    const r3List = useMemo(() => {
        if (!locState.r1 || !locState.r2 || !regionsData[locState.r1]) return [];
        const sigungu = regionsData[locState.r1];
        if (!sigungu) return [];
        const dongs = sigungu[locState.r2];
        if (!dongs) return [];
        return Array.isArray(dongs) ? dongs : Object.keys(dongs);
    }, [regionsData, locState.r1, locState.r2]);

    /* ─── 카카오 주소검색 (2번 줄 입력) ─── */
    const handleJusoInput = useCallback((val) => {
        setJusoSearch(val);
        if (jusoTimerRef.current) clearTimeout(jusoTimerRef.current);
        if (!val || val.length < 2) {
            setJusoResults([]);
            setShowJusoDropdown(false);
            return;
        }
        jusoTimerRef.current = setTimeout(async () => {
            try {
                const res = await fetch(`/api/safe-freight/juso?keyword=${encodeURIComponent(val)}`);
                const data = await res.json();
                if (data.results?.juso) {
                    setJusoResults(data.results.juso);
                    setShowJusoDropdown(true);
                    setHighlightIdx(0);
                } else {
                    setJusoResults([]);
                }
            } catch (e) {
                console.error('Juso search error:', e);
            }
        }, 300);
    }, []);

    /** 행정동 매칭 헬퍼 */
    const matchDong = useCallback((sido, sigungu, dongHint, item) => {
        const dongsInSgg = regionsData[sido]?.[sigungu];
        const availableDongs = Array.isArray(dongsInSgg) ? dongsInSgg : (dongsInSgg ? Object.keys(dongsInSgg) : []);
        if (availableDongs.length === 0) return '';
        // ① 완전 일치
        if (availableDongs.includes(dongHint)) return dongHint;
        // ② 행정동(hDong) 매칭
        const hMatch = item?.hDong && availableDongs.find(d => d === item.hDong);
        if (hMatch) return hMatch;
        // ③ 법정동(bDong) 매칭
        const bMatch = item?.bDong && availableDongs.find(d => d === item.bDong);
        if (bMatch) return bMatch;
        // ④ 유사 매칭 (송도동 → 송도1동)
        const clean = (s) => s ? s.replace(/[0-9.]/g, '').replace(/(동|읍|면)$/, '') : '';
        const target = clean(item?.hDong || item?.bDong || dongHint);
        if (target) {
            const fuzzyMatch = availableDongs.find(d => clean(d).includes(target) || target.includes(clean(d)));
            if (fuzzyMatch) return fuzzyMatch;
        }
        return '';
    }, [regionsData]);

    /* ─── 2번 줄: 카카오 주소 선택 → 1번줄 비움, 3번줄 행정동 표시, juso가 최우선 좌표 ─── */
    const selectJuso = useCallback((item) => {
        const sido = SIDO_MAP_SHORT[item.siNm] || item.siNm || '';
        const sigungu = item.sggNm || '';
        const dong = item.hDong || item.emdNm || item.bDong || '';
        const fullAddr = item.roadAddr || item.jibunAddr || `${sido} ${sigungu} ${dong}`;

        // 2번 줄 입력: 1번 줄(text) 비움, juso에 주소 저장 (조회 시 최우선 좌표)
        setLocState(prev => ({
            ...prev,
            text: '',     // 1번 줄 비움
            juso: fullAddr, // 2번 줄: 이 주소가 최우선 포인트
            r1: sido,
            r2: sigungu,
            r3: '',
            terminalKey: ''
        }));

        // 비동기: 3번 줄 행정동 매칭 (표시용)
        setTimeout(() => {
            const matched = matchDong(sido, sigungu, dong, item);
            setLocState(prev => ({ ...prev, r3: matched }));
        }, 150);

        setJusoSearch(fullAddr); // 2번 줄에 주소 유지
        setShowJusoDropdown(false);
    }, [regionsData, setLocState, matchDong]);

    /* ─── 터미널 선택 → 행정동 드롭다운 자동 매칭 ─── */
    const handleTerminalSelect = useCallback((tKey) => {
        if (!tKey) {
            setLocState(prev => ({ ...prev, terminalKey: '' }));
            return;
        }
        const t = TERMINAL_LIST.find(x => x.key === tKey);
        if (!t) return;

        // 터미널의 r3는 이미 safe-freight.json 데이터에 맞춘 값 → 바로 세팅
        setLocState(prev => ({
            ...prev,
            text: t.name,
            lng: t.lng,
            lat: t.lat,
            r1: t.r1,
            r2: t.r2,
            r3: t.r3, // 데이터에 맞춘 값 바로 세팅
            terminalKey: t.key,
            juso: '' // 터미널 선택 시 상세 주소는 비움
        }));

        // 혹시 r3가 목록에 없으면 fuzzy 보정
        setTimeout(() => {
            const matched = matchDong(t.r1, t.r2, t.r3, null);
            if (matched && matched !== t.r3) {
                setLocState(prev => ({ ...prev, r3: matched }));
            }
        }, 150);

        setJusoSearch('');
    }, [regionsData, setLocState, matchDong]);

    return (
        <div className={styles.locationBlock}>
            {/* ── 1번 줄: 장소검색 + 터미널 선택 ── */}
            <div className={styles.routeField}>
                <span className={styles.fieldDot} style={{ background: dotColor }} />
                <div className={styles.fieldWrap}>
                    <input
                        type="text"
                        className={styles.placeInput}
                        placeholder={placeholder || "출발지 (기점 또는 행선지) 입력"}
                        value={locState.text || ''}
                        onChange={e => {
                            const val = e.target.value;
                            setLocState(prev => ({ ...prev, text: val, lng: null, lat: null, terminalKey: '', juso: '' }));
                            setJusoSearch(''); // 1번줄 입력 시 2번줄 내용 삭제
                            if (handlePlaceSearch) handlePlaceSearch(val, fieldKey);
                        }}
                        onFocus={() => setActiveField(fieldKey)}
                        onKeyDown={e => handleInputKeyDown(e, fieldKey)}
                    />
                    {locState.lng && locState.lat && (
                        <span className={styles.coordBadge} title={`${locState.lat}, ${locState.lng}`}>📍</span>
                    )}
                    {/* 카카오 장소검색 드롭다운 */}
                    {showDropdown && searchResults.length > 0 && (
                        <div className={styles.placeDropdown}>
                            {searchResults.map((item, idx) => (
                                <div key={idx} className={styles.placeItem} onClick={() => onPlaceSelect(item)}>
                                    <div className={styles.placeName}>
                                        <span className={styles.placeTypeBadge}>{item.type === 'place' ? '장소' : '주소'}</span>
                                        {item.name}
                                    </div>
                                    <div className={styles.placeAddr}>{item.address}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {showTerminal && (
                    <select
                        className={styles.terminalQuickSelect}
                        value={locState.terminalKey || ''}
                        onChange={e => handleTerminalSelect(e.target.value)}
                        title={locState.terminalKey ? "선택된 터미널" : "터미널을 선택하면 주소가 자동 입력됩니다"}
                    >
                        <option value="">터미널 (선택없음)</option>
                        {TERMINAL_LIST.map(t => (
                            <option key={t.key} value={t.key}>⚓ {t.name}</option>
                        ))}
                    </select>
                )}
                {onRemove && (
                    <button type="button" className={styles.removeWpBtn} onClick={onRemove}>✕</button>
                )}
            </div>

            {/* ── 2번 줄: 카카오 주소 입력 (최상위 우선) ── */}
            {/* ── 3번 줄: 행정구역 선택 드롭다운 ── */}
            <div className={styles.originAddrSection}>
                <div className={styles.jusoSearchWrap}>
                    <input
                        type="text"
                        className={styles.jusoInput}
                        placeholder="상세주소 입력 (정확한 주소지로 검색)"
                        value={jusoSearch}
                        onChange={e => handleJusoInput(e.target.value)}
                        onFocus={() => jusoSearch && setShowJusoDropdown(true)}
                        onKeyDown={e => {
                            if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setHighlightIdx(prev => Math.min(prev + 1, jusoResults.length - 1));
                            } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setHighlightIdx(prev => Math.max(prev - 1, 0));
                            } else if (e.key === 'Enter' && showJusoDropdown && jusoResults.length > 0) {
                                e.preventDefault();
                                selectJuso(jusoResults[highlightIdx]);
                            }
                        }}
                    />
                    {showJusoDropdown && jusoResults.length > 0 && (
                        <div className={styles.jusoDropdown}>
                            {jusoResults.map((item, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => selectJuso(item)}
                                    className={`${styles.jusoItem} ${idx === highlightIdx ? styles.jusoItemActive : ''}`}
                                >
                                    <div className={styles.jusoMain}>
                                        <span className={styles.jusoBadge}>도로명</span> {item.roadAddr}
                                    </div>
                                    <div className={styles.jusoSub}>
                                        <span className={styles.jusoBadge}>지번</span> {item.jibunAddr}
                                    </div>
                                    {item.admNm && (
                                        <div className={styles.jusoAdm}>[행정동] {item.admNm}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className={styles.regionDropdowns}>
                    <select
                        className={styles.regionSelect}
                        value={locState.r1 || ''}
                        onChange={e => {
                            setLocState(prev => ({ ...prev, text: '', juso: '', lng: null, lat: null, r1: e.target.value, r2: '', r3: '', terminalKey: '' }));
                            setJusoSearch('');
                        }}
                    >
                        <option value="">시·도</option>
                        {r1List.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <select
                        className={styles.regionSelect}
                        value={locState.r2 || ''}
                        onChange={e => {
                            setLocState(prev => ({ ...prev, text: '', juso: '', lng: null, lat: null, r2: e.target.value, r3: '', terminalKey: '' }));
                            setJusoSearch('');
                        }}
                        disabled={!locState.r1}
                    >
                        <option value="">시·군·구</option>
                        {r2List.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <select
                        className={styles.regionSelect}
                        value={locState.r3 || ''}
                        onChange={e => {
                            setLocState(prev => ({ ...prev, text: '', juso: '', lng: null, lat: null, r3: e.target.value, terminalKey: '' }));
                            setJusoSearch('');
                        }}
                        disabled={!locState.r2}
                    >
                        <option value="">읍·면·동</option>
                        {r3List.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>
            </div>
        </div>
    );
};

export default LocationBlock;
