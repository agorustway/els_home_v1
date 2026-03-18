'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import styles from './safe-freight.module.css';
import { NOTICE_SECTIONS, NOTICE_SOURCE } from './safe-freight-notice';
import RouteSearchView from './route-search/RouteSearchView';

const QUERY_TYPES = [
  { id: 'section', label: '구간별운임', desc: '기점·행선지별 고시 운임' },
  { id: 'distance', label: '거리별운임', desc: '거리(km)별 운임' },
  { id: 'other', label: '이외구간', desc: '고시 외 구간(2022년이전)' },
];

const TEMP_RESULTS_KEY = 'safeFreightTempResults';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:2929';

export default function SafeFreightPage() {
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true); // Initial loading state for options
  const [error, setError] = useState(null);

  const [queryType, setQueryType] = useState('section');
  const [period, setPeriod] = useState('');
  const [origin, setOrigin] = useState('');
  const [region1, setRegion1] = useState('');
  const [region2, setRegion2] = useState('');
  const [region3, setRegion3] = useState('');
  const [distType, setDistType] = useState('');
  const [inputKm, setInputKm] = useState('');
  const [tripMode, setTripMode] = useState('round'); // 'round' | 'oneWay'
  const [surchargeIds, setSurchargeIds] = useState(new Set());
  const [roughPct, setRoughPct] = useState(20);
  const [displayMode, setDisplayMode] = useState('all');
  const [groupApply, setGroupApply] = useState({ flexibag: false, hazard: false, oversize: false, heavy: false });

  const [resultAll, setResultAll] = useState(null);
  const [result, setResult] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false); // Specific loading for lookup action
  const [saveToTemp, setSaveToTemp] = useState(true);

  // saveToTemp 변경 시 알림 처리 및 즉시 삭제
  const handleSaveToTempChange = (enabled) => {
    setSaveToTemp(enabled);
    if (!enabled) {
      setSavedResults([]);
      try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(TEMP_RESULTS_KEY);
      } catch (_) { }
      setToastMessage('이전 기록보전 내역이 삭제되었습니다.');
      setTimeout(() => setToastMessage(null), 2000);
    }
  };
  const [savedResults, setSavedResults] = useState([]);
  const [expandedNoticeId, setExpandedNoticeId] = useState(null);
  const [noticeModalOpen, setNoticeModalOpen] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [view, setView] = useState('default'); // 'default' or 'forwarder' or 'naver-map'
  const [showPassword, setShowPassword] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const otherTabDefaultsJustSet = useRef(false);
  const skipRegionClearOnce = useRef(false);

  const [addressSearch, setAddressSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [autoRunCount, setAutoRunCount] = useState(0);
  const resultRef = useRef(null);

  // 모달 오픈 시 바디 스크롤 방지 (모바일 터치 스크롤 호환)
  useEffect(() => {
    if (noticeModalOpen) {
      // 🎯 모바일에서 body overflow:hidden은 내부 터치 스크롤까지 죽이므로
      // position:fixed 방식으로 배경만 고정 (Material UI 방식)
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.overflowY = 'scroll'; // 스크롤바 위치 유지
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflowY = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
    return () => {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflowY = '';
      if (scrollY) window.scrollTo(0, parseInt(scrollY) * -1);
    };
  }, [noticeModalOpen]);

  // 시도 명칭 매핑 (API -> 안전운임 데이터 표준)
  const SIDO_MAP = {
    '서울특별시': '서울시',
    '부산광역시': '부산시',
    '대구광역시': '대구시',
    '인천광역시': '인천시',
    '광주광역시': '광주시',
    '대전광역시': '대전시',
    '울산광역시': '울산시',
    '세종특별자치시': '세종시',
    '경기도': '경기도',
    '강원특별자치도': '강원도',
    '강원도': '강원도',
    '충청북도': '충북',
    '충청남도': '충남',
    '전라북도': '전북',
    '전북특별자치도': '전북',
    '전라남도': '전남',
    '경상북도': '경북',
    '경상남도': '경남',
    '제주특별자치도': '제주도',
    '제주도': '제주도',
    // 축약형 추가 (카카오 API 등 대비)
    '경기': '경기도', '강원': '강원도', '충북': '충북', '충남': '충남',
    '전북': '전북', '전남': '전남', '경북': '경북', '경남': '경남', '제주': '제주도',
    '서울': '서울시', '부산': '부산시', '대구': '대구시', '인천': '인천시',
    '광주': '광주시', '대전': '대전시', '울산': '울산시', '세종': '세종시'
  };

  const handleAddressSearch = async (val) => {
    setAddressSearch(val);
    if (!val || val.length < 2) {
      setSearchResults([]);
      setShowAddressDropdown(false);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/safe-freight/juso?keyword=${encodeURIComponent(val)}`);
      const data = await res.json();
      if (data.results?.juso) {
        setSearchResults(data.results.juso);
        setShowAddressDropdown(true);
      } else {
        setSearchResults([]);
      }
      setHighlightedIndex(0);
    } catch (e) {
      console.error('Address search error:', e);
    } finally {
      setIsSearching(false);
    }
  };

  // (불필요한 컨테이너 이력조회 연동 로직 제거됨)

  const selectAddress = (item, autoRun = false) => {
    const { siNm, sggNm, emdNm } = item;
    if (!siNm || !emdNm) return;

    const sido = SIDO_MAP[siNm] || siNm;
    setRegion1(sido);

    // 비동기적 상태 업데이트 연쇄 (드롭다운 의존성 때문)
    setTimeout(() => {
      const sgg = sggNm || '';
      setRegion2(sgg);

      setTimeout(() => {
        // 정확한 동 매칭 시도
        let targetDong = emdNm || '';

        // 현재 선택된 모드에 맞는 지역 데이터 소스 확인
        const currentRegions = queryType === 'other'
          ? (options?.otherRegions?.[origin] || {})
          : (options?.regions || {});

        const dongsInSgg = currentRegions[sido]?.[sgg] || []; // Array of dongs OR Object of dongs keys? safe-freight.json structure implies array for dong list or keys if object.
        // Based on previous code: regionsSource[region1][region2] seems to be an array or object. Let's assume list of keys or array.
        // Actually region3List uses: (regionsSource[region1][region2] || []) which implies it's iterable.
        // Let's verify structure: options.regions['경기도']['평택시'] is likely an ARRAY of strings based on usage.

        // 데이터 구조 확인: options.regions[sido][sgg] 는 배열([]) 입니다.
        const availableDongs = Array.isArray(dongsInSgg) ? dongsInSgg : Object.keys(dongsInSgg);

        if (availableDongs.length > 0) {
          // 1. 완전 일치 확인
          if (availableDongs.includes(targetDong)) {
            setRegion3(targetDong);
          } else {
            // 2. hDong (행정동) 매칭 시도
            const hMatch = item.hDong && availableDongs.find(d => d === item.hDong);
            if (hMatch) {
              setRegion3(hMatch);
            } else {
              // 3. bDong (법정동) 매칭 시도
              const bMatch = item.bDong && availableDongs.find(d => d === item.bDong);
              if (bMatch) {
                setRegion3(bMatch);
              } else {
                // 4. 유사 매칭: "신장" -> "신장1동" (앞부분 일치)
                // 행정동명이나 법정동명 기반으로 포함 여부 확인
                const clean = (s) => s ? s.replace(/[0-9.]/g, '').replace(/(동|읍|면)$/, '') : '';
                const target = clean(item.hDong || item.bDong || targetDong);

                let fuzzyMatch = availableDongs.find(d => clean(d).includes(target));

                // [예외 처리] 안전운임 고시에는 법정동 대신 행정동(예: 온양1동)이 기준인 경우가 있음
                if (!fuzzyMatch) {
                  const targetStr = (item.hDong || item.bDong || targetDong).replace(/\s/g, '');
                  if (targetStr.includes('온천동')) fuzzyMatch = availableDongs.find(d => d.includes('온양1'));
                }

                if (fuzzyMatch) {
                  setRegion3(fuzzyMatch);
                } else {
                  setRegion3(''); // 매칭 실패 시 비움
                }
              }
            }
          }
        } else {
          setRegion3('');
        }

        if (autoRun) {
          // 상태 업데이트 반영을 위해 미세한 지연 후 실행 트리거
          setTimeout(() => setAutoRunCount(c => c + 1), 50);
        }
      }, 100);
    }, 100);

    setAddressSearch(item.roadAddr || item.jibunAddr);

    // Event loop 마지막에 닫아 removeChild 에러 방지
    setTimeout(() => {
      setShowAddressDropdown(false);
    }, 0);
  };

  useEffect(() => {
    try {
      const raw = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(TEMP_RESULTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setSavedResults(parsed);
      }
    } catch (_) { }
  }, []);

  useEffect(() => {
    fetch('/api/safe-freight/options')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setOptions(data);
        const periods = data.periods || [];
        const sectionPeriod = periods.find((p) => p.id === '26.02월') ? '26.02월' : periods[0]?.id;
        if (sectionPeriod) setPeriod(sectionPeriod);
        setOrigin('[왕복] 부산신항');
        setRegion1('충남');
        setRegion2('아산시');
        setRegion3('인주면');
        if (data.distanceTypes?.length) setDistType(data.distanceTypes[0]);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // autoRunCount 변경 시 runLookup 실행
  useEffect(() => {
    if (autoRunCount > 0) {
      // 모든 필드가 채워져 있는지 확인 후 실행 (안전장치)
      if (origin && region1 && region2 && region3) {
        runLookup();
      }
    }
  }, [autoRunCount, origin, region1, region2, region3]);

  const regionsSource = useMemo(() => {
    if (queryType === 'other') {
      let key = origin;
      // otherRegions 키는 '부산신항' 등 단순 명칭, origin은 '[왕복] 부산신항' 등
      if (options?.otherRegions && !options.otherRegions[key]) {
        // 태그 제거 후 매칭 시도
        const cleanKey = key.replace(/\[.*?\]\s*/g, '').trim();
        if (options.otherRegions[cleanKey]) {
          key = cleanKey;
        }
      }
      return options?.otherRegions?.[key] || {};
    }
    return options?.regions || {};
  }, [options, queryType, origin]);

  const region1List = useMemo(() => Object.keys(regionsSource).sort(), [regionsSource]);
  const region2List = useMemo(
    () => (region1 && regionsSource[region1] ? Object.keys(regionsSource[region1]).sort() : []),
    [regionsSource, region1]
  );
  const region3List = useMemo(
    () => (region2 && regionsSource[region1]?.[region2] ? [...(regionsSource[region1][region2] || [])].sort() : []),
    [regionsSource, region1, region2]
  );

  /** 조회 조건 기점 목록: [왕복] -> [편도] -> 기타 순 정렬 및 분리 */
  const originList = useMemo(() => {
    let list = options?.origins || [];
    if (!list.length) return [];

    // 이외구간: otherRegions 에 정의된 기점만 노출
    if (queryType === 'other') {
      const validKeys = Object.keys(options?.otherRegions || {});
      list = list.filter((o) => {
        const cleanId = o.id.replace(/\[.*?\]\s*/g, '').trim();
        return validKeys.includes(cleanId) || validKeys.some(k => o.id.includes(k));
      });
    }

    const round = [];
    const oneWay = [];
    const others = [];

    list.forEach((o) => {
      const s = String(o.id);
      if (s.includes('[왕복]')) round.push(o);
      else if (s.includes('[편도]')) oneWay.push(o);
      else others.push(o);
    });

    const sortFn = (a, b) => a.id.localeCompare(b.id);
    round.sort(sortFn);
    oneWay.sort(sortFn);
    others.sort(sortFn);

    const result = [];
    // [편도] -> [왕복] 순서로 변경
    if (oneWay.length) result.push(...oneWay);
    if (oneWay.length && round.length) {
      result.push({ id: 'sep-oneWay-round', label: '---------------------', disabled: true });
    }
    if (round.length) result.push(...round);

    if (others.length) {
      if (result.length > 0) result.push({ id: 'sep-others', label: '---------------------', disabled: true });
      result.push(...others);
    }
    return result;
  }, [options, queryType]);

  useEffect(() => {
    if ((queryType === 'other' || queryType === 'section') && skipRegionClearOnce.current) {
      if (queryType === 'other') return;
      skipRegionClearOnce.current = false;
      return;
    }
    setRegion2('');
    setRegion3('');
  }, [region1, queryType]);
  useEffect(() => {
    if ((queryType === 'other' || queryType === 'section') && skipRegionClearOnce.current) {
      if (queryType === 'section') skipRegionClearOnce.current = false;
      return;
    }
    setRegion3('');
  }, [region2, queryType]);
  // 기능 제거: 단순 행선지 변경 시 region3가 무조건 인주면으로 덮어씌워지는 부작용 방지
  // useEffect(() => {
  //   if (options && region1 === '충남' && region2 === '아산시' && region3 === '') {
  //     setRegion3('인주면');
  //   }
  // }, [options, region1, region2, region3]);
  useEffect(() => {
    setResultAll(null);
    setResult(null);
    setLookupError(null);
    if (queryType === 'section') {
      skipRegionClearOnce.current = true;
      const p = options?.periods?.find((x) => x.id === '26.02월') ? '26.02월' : options?.periods?.[0]?.id;
      if (p) setPeriod(p);
      setOrigin('[왕복] 부산신항');
      setRegion1('충남');
      setRegion2('아산시');
      setRegion3('인주면');
    } else if (queryType === 'other') {
      otherTabDefaultsJustSet.current = true;
      skipRegionClearOnce.current = true;
      // 이외구간 기본 기간: 2026년 제외, 가장 최신(예: 22.07월)
      const validPeriods = (options?.periods || []).filter(pp => {
        const y = parseInt(pp.id.split('.')[0], 10);
        return !isNaN(y) && y <= 22;
      });
      const p = validPeriods.length > 0 ? validPeriods[0].id : '';
      if (p) setPeriod(p);

      // 이외구간 기본 기점도 '[왕복] 부산신항' 시도 (데이터에 있다면)
      setOrigin('[왕복] 부산신항');
      setRegion1('충남');
      setRegion2('아산시');
      setRegion3('인주면');
      setTripMode('round');
    } else {
      const p = options?.periods?.find((x) => x.id === '26.02월') ? '26.02월' : options?.periods?.[0]?.id;
      if (p) setPeriod(p);
      setRegion1('');
      setRegion2('');
      setRegion3('');
      setTripMode('round');
    }
  }, [queryType]);
  useEffect(() => {
    if (queryType === 'other' && otherTabDefaultsJustSet.current) {
      otherTabDefaultsJustSet.current = false;
      return;
    }
    if (queryType === 'other') {
      setRegion1('');
      setRegion2('');
      setRegion3('');
    }
  }, [queryType, origin]);

  const selectedOtherSectionInfo = useMemo(() => {
    if (queryType !== 'other' || !origin || !region1 || !region2 || !region3) return null;
    const key = `${origin}|${region1}|${region2}|${region3}`;
    return options?.otherSections?.[key];
  }, [options?.otherSections, queryType, origin, region1, region2, region3]);

  const toggleSurcharge = (id) => {
    setSurchargeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** 그룹 할증(플렉시백/위험물질/활대품/중량물): 한 개만 선택, 드롭다운/라디오 값 반영 */
  const setSurchargeByGroup = (group, selectedId) => {
    if (selectedId) setGroupApply((prev) => ({ ...prev, [group]: true }));
    const list = options?.surcharges || [];
    const groupIds = list.filter((s) => s.group === group).map((s) => s.id);
    setSurchargeIds((prev) => {
      const next = new Set(prev);
      groupIds.forEach((id) => next.delete(id));
      if (selectedId) next.add(selectedId);
      return next;
    });
  };

  /** 그룹 적용 체크 해제 시 해당 그룹 할증 제거 */
  const setGroupApplyEnabled = (group, enabled) => {
    setGroupApply((prev) => ({ ...prev, [group]: enabled }));
    if (!enabled) {
      const list = options?.surcharges || [];
      const groupIds = list.filter((s) => s.group === group).map((s) => s.id);
      setSurchargeIds((prev) => {
        const next = new Set(prev);
        groupIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const surchargesList = options?.surcharges || [];
  const surchargeCostItems = surchargesList.filter((s) => !s.otherCost);
  const otherCostItems = surchargesList.filter((s) => s.otherCost);
  const checkboxSurcharges = surchargeCostItems.filter((s) => !s.group);
  const flexibagOptions = surchargeCostItems.filter((s) => s.group === 'flexibag');
  const hazardOptions = surchargeCostItems.filter((s) => s.group === 'hazard');
  const oversizeOptions = surchargeCostItems.filter((s) => s.group === 'oversize');
  const heavyOptions = surchargeCostItems.filter((s) => s.group === 'heavy');
  const selectedByGroup = (group) => {
    const opts = surchargesList.filter((s) => s.group === group);
    return opts.find((s) => surchargeIds.has(s.id))?.id ?? '';
  };

  /** 고시 제22조: 선택된 할증 중 적용·미적용 구분 (할증률 최대 3개, 1개 전액·나머지 50%) */
  const appliedSurchargeInfo = useMemo(() => {
    const list = options?.surcharges || [];
    const reg = options?.surchargeRegulation || { maxPctCount: 3, firstFull: true, restHalf: true, excludedReason: '' };
    const maxPct = reg.maxPctCount ?? 3;
    const pctItems = list
      .filter((s) => !s.otherCost && !s.fixed && surchargeIds.has(s.id))
      .map((s) => ({
        id: s.id,
        label: s.id === 'rough' ? `${s.label} ${roughPct}%` : s.label,
        pct: s.id === 'rough' ? roughPct : (s.pct || 0),
      }))
      .sort((a, b) => b.pct - a.pct);
    const fixedItems = list.filter((s) => (s.fixed || s.otherCost) && surchargeIds.has(s.id));
    const pctApplied = pctItems.slice(0, maxPct).map((item, i) => ({
      ...item,
      effective: i === 0 && reg.firstFull ? 100 : reg.restHalf ? 50 : 100,
    }));
    const pctExcluded = pctItems.slice(maxPct).map((item) => ({
      ...item,
      reason: reg.excludedReason || '할증 항목이 3개를 초과하여 본 운송에는 적용되지 않습니다(고시 제22조 나목).',
    }));
    return {
      pctApplied,
      pctExcluded,
      fixedApplied: fixedItems,
      regulation: reg,
    };
  }, [options?.surcharges, options?.surchargeRegulation, surchargeIds, roughPct, queryType, tripMode]);

  /** 할증 적용한 금액 객체 반환 (고시 제22조: 할증률 최대 3개, 1개 전액·나머지 50%) */
  const applySurchargesToRow = useMemo(() => {
    return (row) => {
      if (!row) return row;
      const isDistanceBased = queryType === 'distance' || queryType === 'other';
      const baseMult = (isDistanceBased && tripMode === 'oneWay') ? 0.5 : 1.0;

      let f40위탁 = (row.f40위탁 || 0) * baseMult;
      let f40운수자 = (row.f40운수자 || 0) * baseMult;
      let f40안전 = (row.f40안전 || 0) * baseMult;
      let f20위탁 = (row.f20위탁 || 0) * baseMult;
      let f20운수자 = (row.f20운수자 || 0) * baseMult;
      let f20안전 = (row.f20안전 || 0) * baseMult;
      const { pctApplied, fixedApplied } = appliedSurchargeInfo;
      const totalPct = pctApplied.reduce((sum, item) => sum + (item.pct * item.effective) / 100, 0);
      const mult = 1 + totalPct / 100;
      f40위탁 = Math.round(f40위탁 * mult);
      f40운수자 = Math.round(f40운수자 * mult);
      f40안전 = Math.round(f40안전 * mult);
      f20위탁 = Math.round(f20위탁 * mult);
      f20운수자 = Math.round(f20운수자 * mult);
      f20안전 = Math.round(f20안전 * mult);
      fixedApplied.forEach((s) => {
        const add = s.fixed || 0;
        f40위탁 += add;
        f40운수자 += add;
        f40안전 += add;
        f20위탁 += add;
        f20운수자 += add;
        f20안전 += add;
      });
      return {
        ...row,
        f40위탁,
        f40운수자,
        f40안전,
        f20위탁,
        f20운수자,
        f20안전,
        tripMode,
      };
    };
  }, [appliedSurchargeInfo, queryType, tripMode]);

  const runLookup = async () => {
    setLookupError(null);
    setResultAll(null);
    setResult(null);
    setLookupLoading(true); // Corrected to use setLookupLoading

    try {
      const params = new URLSearchParams();
      params.set('type', queryType);
      params.set('period', period);

      if (queryType === 'distance') {
        const km = parseInt(inputKm, 10);
        if (Number.isNaN(km) || km < 1) {
          setLookupError('거리(km)를 입력하세요.');
          setLookupLoading(false); // Corrected to use setLookupLoading
          return;
        }
        params.set('distType', distType);
        params.set('km', String(km));
      } else {
        if (!origin || !region1 || !region2 || !region3) {
          setLookupError('기간·구간·행선지(시/도, 시/군/구, 읍/면/동)를 모두 선택해 주세요.');
          setLookupLoading(false); // Corrected to use setLookupLoading
          return;
        }
        params.set('origin', origin);
        params.set('region1', region1);
        params.set('region2', region2);
        params.set('region3', region3);
        if (queryType === 'section') params.set('mode', displayMode === 'all' ? 'all' : 'latest');
      }

      const res = await fetch(`/api/safe-freight/lookup?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');

      const rows = data.rows || [];
      if (!rows.length) {
        if (queryType === 'other') {
          throw new Error('해당 구간은 [구간별 운임]에 자료가 존재할 수 있습니다. [구간별 운임] 탭에서 조회해주세요.\n(본 자료는 2022년 이전 법정동 사용 시 있던 구형 자료입니다.)');
        }
        throw new Error('해당 운임을 찾을 수 없습니다.');
      }

      setResultAll({
        type: data.type,
        origin: data.origin,
        destination: data.destination,
        km: data.km,
        period: data.period,
        distType: data.distType,
        rows,
      });

      const latest = rows[0];
      const appliedRow = applySurchargesToRow(latest);
      setResult({
        port: data.origin || origin,
        destination: data.destination || [region1, region2, region3].join(' '),
        km: latest.km,
        fare20: appliedRow.f20안전,
        fare40: appliedRow.f40안전,
      });

      // 결과 로드 후 결과 섹션으로 자동 스크롤
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);

      // [중요] 내역 보존 체크가 꺼져 있으면 기존 저장된 모든 내역 삭제
      if (!saveToTemp) {
        setSavedResults([]);
        try {
          if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(TEMP_RESULTS_KEY);
        } catch (_) { }
      }

      if (saveToTemp) {
        // [중복 방지] 같은 조건(기점, 행선지, 타입, 할증)의 최신 이력이 이미 있으면 추가하지 않음
        const appliedLabels = [
          ...appliedSurchargeInfo.pctApplied.map((s) =>
            s.effective === 100 ? s.label : `${s.label} (50% 적용)`
          ),
          ...appliedSurchargeInfo.fixedApplied.map((s) => s.label),
        ];

        const isDuplicate = savedResults.length > 0 &&
          savedResults[0].origin === (data.origin || origin) &&
          savedResults[0].destination === (data.destination || [region1, region2, region3].join(' ')) &&
          savedResults[0].type === data.type &&
          savedResults[0].tripMode === tripMode &&
          JSON.stringify(savedResults[0].appliedSurcharges) === JSON.stringify(appliedLabels);

        if (!isDuplicate) {
          const typeLabel = QUERY_TYPES.find((t) => t.id === data.type)?.label || data.type;
          const entry = {
            id: Date.now(),
            savedAt: new Date().toISOString(),
            type: data.type,
            typeLabel,
            tripMode,
            period: data.period ?? period,
            origin: data.origin || origin,
            destination: data.destination || [region1, region2, region3].join(' '),
            km: latest.km,
            f40위탁: appliedRow.f40위탁,
            f40운수자: appliedRow.f40운수자,
            f40안전: appliedRow.f40안전,
            f20위탁: appliedRow.f20위탁,
            f20운수자: appliedRow.f20운수자,
            f20안전: appliedRow.f20안전,
            appliedSurcharges: appliedLabels,
            excludedSurcharges: appliedSurchargeInfo.pctExcluded.map((s) => ({ label: s.label, reason: s.reason })),
          };
          setSavedResults((prev) => {
            const next = [entry, ...prev];
            try {
              if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(TEMP_RESULTS_KEY, JSON.stringify(next));
            } catch (_) { }
            return next;
          });
        }
      }
    } catch (err) {
      // 에러 메시지를 Toast로 표시
      setToastMessage(err.message);
      setLookupError(null);
      setTimeout(() => setToastMessage(null), 4000); // 4초 후 제거
    } finally {
      setLookupLoading(false); // Corrected to use setLookupLoading
    }
  };

  const clearSavedResults = () => {
    // [최우선] 모든 결과 데이터 즉시 삭제
    setResultAll(null);
    setResult(null);
    setLookupError(null);
    setSavedResults([]);
    setLookupLoading(false);

    // [중요] 주소 검색 및 입력 필드 완전히 비우기
    setAddressSearch('');
    setSearchResults([]);
    setInputKm('');

    // 기점/행선지 주소 정보 초기화
    setOrigin('');
    setRegion1('');
    setRegion2('');
    setRegion3('');
    setDistanceItem(null);

    // 카카오 주소 검색용 하위 상태 초기화
    setDestRegion1('');
    setDestRegion2('');
    setDestRegion3('');

    // [보안] 세션 스토리지 및 잔여 UI 상태 삭제
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(TEMP_RESULTS_KEY);
        sessionStorage.removeItem('els_input');
      }

      // 자동 조회 트리거 초기화 (가장 중요: 초기화 후 다시 조회되는 현상 방지)
      setAutoRunCount(0);

      // 할증 및 상세 설정 초기화
      setSurchargeIds(new Set());
      setGroupApply({ flexibag: false, hazard: false, oversize: false, heavy: false });
      setRoughPct(20);
      setTripMode('round');
      setDisplayMode('all');
      setQueryType('section');
    } catch (_) { }

    setToastMessage('모든 조회 데이터와 검색 설정이 초기화되었습니다.');
    setTimeout(() => setToastMessage(null), 2000);
  };

  const removeSavedItem = (id) => {
    setSavedResults((prev) => {
      const next = prev.filter((e) => e.id !== id);
      try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(TEMP_RESULTS_KEY, JSON.stringify(next));
      } catch (_) { }
      return next;
    });
  };

  /** Enter 키 입력 시 즉시 조회 실행 */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (canSubmit && !lookupLoading) {
        e.preventDefault();
        runLookup();
      }
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (canSubmit && !lookupLoading) runLookup(); // Corrected to use !lookupLoading
  };

  /** 엑셀 다운로드: Sheet1 운임조회(방금 조회값), Sheet2 저장운임(임시저장 전체 + 메시지) */
  const downloadExcel = async () => {
    if (downloadLoading) return;
    if (!resultAll && (!savedResults || savedResults.length === 0)) return;
    setDownloadLoading(true);
    try {
      const querySheetRows = resultAll
        ? displayRows.map((row) => {
          const applied = applySurchargesToRow(row);
          return {
            period: applied.period,
            origin: resultAll.origin ?? '',
            destination: resultAll.destination ?? '',
            tripMode: applied.tripMode === 'oneWay' ? '편도' : '왕복',
            km: applied.km,
            f40위탁: applied.f40위탁,
            f40운수자: applied.f40운수자,
            f40안전: applied.f40안전,
            f20위탁: applied.f20위탁,
            f20운수자: applied.f20운수자,
            f20안전: applied.f20안전,
          };
        })
        : [];
      const res = await fetch('/api/safe-freight/download-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ querySheetRows, savedResults: savedResults || [] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `다운로드 실패 (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition');
      const match = disposition && /filename\*?=(?:UTF-8'')?([^;]+)/i.exec(disposition);
      const name = match ? decodeURIComponent(match[1].replace(/^"|"$/g, '')) : `안전운임_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setLookupError(err.message || '엑셀 다운로드에 실패했습니다.');
    } finally {
      setDownloadLoading(false);
    }
  };

  /** 적용월 정렬용: 숫자 크면 최신 */
  const periodToNum = (p) => {
    if (!p) return 0;
    const s = String(p).trim();
    const ym = s.match(/(\d{2,4})[.\s]*(\d{1,2})월/);
    if (ym) return parseInt(ym[1], 10) * 12 + parseInt(ym[2], 10);
    const m = s.match(/(\d{1,2})월/);
    return m ? parseInt(m[1], 10) : 0;
  };

  /** 전체 조회 시: 선택월 최상단 → 나머지 최신순 */
  const displayRows = useMemo(() => {
    if (!resultAll?.rows?.length) return [];
    const isMultiRowType = queryType === 'section' || queryType === 'other' || queryType === 'distance';
    if (!isMultiRowType || displayMode !== 'all') return resultAll.rows.slice(0, 1);

    const rows = [...resultAll.rows];
    const selectedRow = rows.find((r) => r.period === period);
    const rest = rows.filter((r) => r !== selectedRow);
    rest.sort((a, b) => periodToNum(b.period) - periodToNum(a.period));

    const ordered = [];
    if (selectedRow) ordered.push(selectedRow);
    ordered.push(...rest);
    return ordered;
  }, [resultAll?.rows, queryType, displayMode, period]);

  const canSubmit =
    queryType === 'distance'
      ? inputKm && parseInt(inputKm, 10) >= 1
      : origin && region1 && region2 && region3;

  if (loading) { // Check initial loading
    return (
      <div className={styles.page}>
        <p className={styles.loading}>안전운임 데이터를 불러오는 중입니다.</p>
      </div>
    );
  }
  if (error) { // Check initial error
    return (
      <div className={styles.page}>
        <p className={styles.error}>{error}</p>
        <p className={styles.hint}>web 폴더에서 node scripts/build-safe-freight-data.js 를 실행하세요.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerBanner}>
        <h1 className={styles.title}>컨테이너 화물 안전운임제</h1>
        {/* <p className={styles.desc}>구간별운임·거리별운임·이외구간 3가지 형식으로 조회할 수 있습니다.</p> */}
      </div>

      <div className={styles.tabs}>
        {/* 구간별운임 → 거리별운임 → 이외구간 */}
        {QUERY_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={
              t.id === 'other'
                ? (view === 'default' && queryType === t.id ? styles.tabActiveRed : styles.tabRed)
                : (view === 'default' && queryType === t.id ? styles.tabActive : styles.tab)
            }
            onClick={() => { setView('default'); setQueryType(t.id); }}
          >
            <span className={styles.tabLabel}>
              {t.label}
              {t.yearNote && <span className={styles.yearNote}> ({t.yearNote})</span>}
            </span>
            <span className={styles.tabDesc}>{t.desc}</span>
          </button>
        ))}

        {/* 구간조회 (네이버 지도) */}
        <button
          type="button"
          className={view === 'naver-map' ? styles.tabActive : styles.tab}
          onClick={() => {
            setView('naver-map');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          title="네이버 지도로 경로 조회"
        >
          <span className={styles.tabLabel}>구간조회</span>
          <span className={styles.tabDesc}>지도 기반 경로/운임 조회</span>
        </button>

        {/* 관련 법령·고시 안내 */}
        <button
          type="button"
          className={styles.noticeTabBtn}
          onClick={() => {
            // 🎯 모바일(768px 이하)에서는 좁은 팝업 대신 쾌적한 전용 페이지(새 탭)로 이동
            if (window.innerWidth <= 768) {
              window.open('/employees/safe-freight/notices', '_blank');
            } else {
              setNoticeModalOpen(true);
            }
          }}
          aria-label="관련 법령·고시 안내 보기"
        >
          <span className={styles.noticeTabLabel}>관련 법령·고시 안내</span>
        </button>

        {/* Forwarder.KR */}
        <button
          type="button"
          className={styles.tab} /* 일반 탭 버튼 스타일 적용 */
          onClick={() => window.open('https://www.forwarder.kr/tariff/', '_blank')}
          title="포워더케이알 운임정보"
        >
          <img src="/images/forwarderkr.png" alt="포워더KR 로고" className={styles.forwarderLogo} />
        </button>
      </div>

      {noticeModalOpen && (
        <div
          className={styles.noticeModalOverlay}
          onClick={() => setNoticeModalOpen(false)}
          onTouchMove={(e) => e.preventDefault()} /* 🎯 오버레이 터치 시 배경 스크롤 방지 */
          role="dialog"
          aria-modal="true"
          aria-labelledby="notice-modal-title"
        >
          <div className={styles.noticeModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.noticeModalHead}>
              <h2 id="notice-modal-title" className={styles.noticeSectionTitle}>관련 법령·고시 안내</h2>
              <button
                type="button"
                className={styles.noticeModalClose}
                onClick={() => setNoticeModalOpen(false)}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className={styles.noticeSectionDesc}>
              {NOTICE_SOURCE} 부대조항을 압축 정리했습니다. 각 항목을 클릭하면 해당 조문 전체를 볼 수 있습니다.
            </p>
            <ul
              className={styles.noticeList}
              onTouchMove={(e) => e.stopPropagation()} /* 🎯 리스트 내부 터치는 스크롤 허용 */
            >
              {NOTICE_SECTIONS.map((sec) => (
                <li key={sec.id} className={styles.noticeItem}>
                  <button
                    type="button"
                    className={styles.noticeItemHead}
                    onClick={() => setExpandedNoticeId((id) => (id === sec.id ? null : sec.id))}
                    aria-expanded={expandedNoticeId === sec.id}
                  >
                    <span className={styles.noticeItemTitle}>{sec.title}</span>
                    <span className={styles.noticeItemToggle}>
                      {expandedNoticeId === sec.id ? '▲ 접기' : '▼ 해당 조문 전체 보기'}
                    </span>
                  </button>
                  <p className={styles.noticeSummary}>{sec.summary}</p>
                  {expandedNoticeId === sec.id && (
                    <div className={styles.noticeFullText} role="region" aria-label={`${sec.title} 전문`}>
                      {sec.fullText}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {view === 'naver-map' && (
        <RouteSearchView
          options={options}
          period={period}
          onBack={() => setView('default')}
        />
      )}

      {view === 'default' && (
        <>
          <section className={styles.formSection}>
            <div className={styles.formGrid}>

              {/* STEP 1: 운송 조건 */}
              <div className={styles.stepModule}>
                <div className={styles.stepTitle}>
                  <span className={styles.stepNumber}>1</span> 운송 조건 입력
                </div>
                <form onSubmit={handleFormSubmit} className={styles.formLeft}>
                  <div className={styles.formBlock}>
                    <label className={styles.label}>적용 기간</label>
                    <select
                      className={styles.select}
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                      onKeyDown={handleKeyDown}
                    >
                      {(options?.periods || [])
                        .filter((p) => {
                          if (queryType !== 'other') return true;
                          // 이외구간: 2026년 이후(23년~) 제외
                          const year = parseInt(p.id.split('.')[0], 10);
                          return !isNaN(year) && year <= 22;
                        })
                        .map((p) => (
                          <option key={p.id} value={p.id}>{p.label || p.id}</option>
                        ))}
                    </select>
                    {queryType === 'section' && displayMode === 'all' && (
                      <p className={styles.periodHint}>전체 조회 시 기간 조건은 적용되지 않습니다.</p>
                    )}
                  </div>

                  {queryType !== 'distance' ? (
                    <>
                      <div className={styles.formBlock}>
                        <label className={styles.label}>기점 축약</label>
                        <select
                          className={styles.select}
                          value={origin}
                          onChange={(e) => setOrigin(e.target.value)}
                          onKeyDown={handleKeyDown}
                        >
                          {originList.map((o) => (
                            <option key={o.id} value={o.id} disabled={o.disabled}>
                              {o.disabled ? o.label : o.id}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.formBlock}>
                        <label className={styles.label}>행선지 (주소 검색)</label>
                        <div className={styles.addressSearchContainer}>
                          <input
                            type="text"
                            className={styles.addressInput}
                            placeholder="주소 입력 (예: 인주면 걸매리 1034번지)"
                            value={addressSearch}
                            onChange={(e) => handleAddressSearch(e.target.value)}
                            onFocus={() => addressSearch && setShowAddressDropdown(true)}
                            onKeyDown={(e) => {
                              handleKeyDown(e); // 기본 엔터 처리 추가
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setHighlightedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setHighlightedIndex(prev => Math.max(prev - 1, 0));
                              } else if (e.key === 'Enter') {
                                if (showAddressDropdown && searchResults.length > 0) {
                                  e.preventDefault();
                                  selectAddress(searchResults[highlightedIndex], true);
                                }
                              }
                            }}
                          />
                          {isSearching && <div className={styles.searchingSpinner}></div>}
                          {showAddressDropdown && (
                            <div className={styles.addressDropdown}>
                              {searchResults.length > 0 ? (
                                searchResults.map((item, idx) => (
                                  <div
                                    key={idx}
                                    onClick={() => selectAddress(item)}
                                    className={`${styles.addressItem} ${idx === highlightedIndex ? styles.addressItemActive : ''}`}
                                    style={idx === highlightedIndex ? { background: '#f1f5f9' } : {}}
                                  >
                                    <div className={styles.addrMain}>
                                      <span className={styles.addrBadge}>도로명</span> {item.roadAddr}
                                    </div>
                                    <div className={styles.addrSub}>
                                      <span className={styles.addrBadge}>지번</span> {item.jibunAddr}
                                    </div>
                                    <div className={styles.addrAdm}>
                                      [행정동] {item.admNm}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                !isSearching && addressSearch.length >= 2 && <div className={styles.noAddress}>검색 결과가 없습니다.</div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className={styles.regionGroup}>
                          <select className={styles.select} value={region1} onChange={(e) => setRegion1(e.target.value)} onKeyDown={handleKeyDown} aria-label="시·도">
                            <option value="">시·도</option>
                            {region1List.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <select className={styles.select} value={region2} onChange={(e) => setRegion2(e.target.value)} onKeyDown={handleKeyDown} disabled={!region1} aria-label="시·군·구">
                            <option value="">시·군·구</option>
                            {region2List.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <select className={styles.select} value={region3} onChange={(e) => setRegion3(e.target.value)} onKeyDown={handleKeyDown} disabled={!region2} aria-label="읍·면·동">
                            <option value="">읍·면·동</option>
                            {region3List.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                        {queryType === 'other' && selectedOtherSectionInfo && (selectedOtherSectionInfo.hDong !== selectedOtherSectionInfo.bDong) && (
                          <div className={styles.dongHint}>
                            <span>{region3 === selectedOtherSectionInfo.hDong ? '법정동' : '행정동'}: </span>
                            <strong>{region3 === selectedOtherSectionInfo.hDong ? selectedOtherSectionInfo.bDong : selectedOtherSectionInfo.hDong}</strong>
                          </div>
                        )}
                        <p className={styles.regionHint}>주소 검색 시 행정동 기준 지역정보가 자동입력됩니다.</p>
                      </div>
                      {queryType === 'other' && (
                        <div className={styles.formBlock}>
                          <label className={styles.label}>운송구분</label>
                          <div className={styles.radioGroup}>
                            <label className={styles.radioLabel}>
                              <input
                                type="radio"
                                name="tripModeOther"
                                value="round"
                                checked={tripMode === 'round'}
                                onChange={() => setTripMode('round')}
                                onKeyDown={handleKeyDown}
                              />
                              운송(왕복)
                            </label>
                            <label className={styles.radioLabel}>
                              <input
                                type="radio"
                                name="tripModeOther"
                                value="oneWay"
                                checked={tripMode === 'oneWay'}
                                onChange={() => setTripMode('oneWay')}
                                onKeyDown={handleKeyDown}
                              />
                              구간(편도)
                            </label>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className={styles.formBlock}>
                        <label className={styles.label}>구분</label>
                        <select
                          className={styles.select}
                          value={distType}
                          onChange={(e) => setDistType(e.target.value)}
                          onKeyDown={handleKeyDown}
                          aria-label="거리별 구분"
                        >
                          {(options?.distanceTypes || []).map((d) => ( // Corrected to use distanceTypes
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.formBlock}>
                        <label className={styles.label}>운송구분</label>
                        <div className={styles.radioGroup}>
                          <label className={styles.radioLabel}>
                            <input
                              type="radio"
                              name="tripModeDist"
                              value="round"
                              checked={tripMode === 'round'}
                              onChange={() => setTripMode('round')}
                              onKeyDown={handleKeyDown}
                            />
                            운송(왕복)
                          </label>
                          <label className={styles.radioLabel}>
                            <input
                              type="radio"
                              name="tripModeDist"
                              value="oneWay"
                              checked={tripMode === 'oneWay'}
                              onChange={() => setTripMode('oneWay')}
                              onKeyDown={handleKeyDown}
                            />
                            구간(편도)
                          </label>
                        </div>
                      </div>
                      <div className={styles.formBlock}>
                        <label className={styles.label}>직접 입력 (km)</label>
                        <input
                          type="number"
                          min={1}
                          className={styles.inputKm}
                          value={inputKm}
                          onChange={(e) => setInputKm(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder="거리 입력"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </>
                  )}
                  {/* 빠른조회 버튼 추가 */}
                  <div style={{ marginTop: 'auto', paddingTop: '12px' }}>
                    <button
                      type="button"
                      className={styles.btnQuickSearch}
                      onClick={runLookup}
                      disabled={!canSubmit || lookupLoading}
                    >
                      {lookupLoading ? '...' : '조건으로 즉시 조회'}
                    </button>
                  </div>
                </form>
              </div>

              {/* STEP 2: 할증/부대비용 */}
              <div className={styles.stepModule}>
                <div className={styles.stepTitle}>
                  <span className={styles.stepNumber}>2</span> 할증/부대비용 선택
                  <span className={styles.tooltipContainer} style={{ marginLeft: 'auto' }}>
                    <span className={styles.infoIcon}>?</span>
                    <div className={styles.tooltipText}>안전운임 고시 제22조(할증의 적용): 다수의 할증이 적용될 경우 가장 높은 할증률 1개는 전액, 나머지는 50%씩 적용하며, 항목은 최대 3개까지만 합산 적용됩니다.</div>
                  </span>
                </div>
                <div className={styles.surchargeSection}>
                  <div className={styles.surchargeGroup}>
                    <div className={styles.surchargeGroupTitle}>
                      📦 장비/화물
                      <span className={styles.tooltipContainer}>
                        <span className={styles.infoIcon}>?</span>
                        <div className={styles.tooltipText}>액체화물 운송을 위한 플렉시백 설치 컨테이너 할증을 선택합니다.</div>
                      </span>
                    </div>
                    <div className={styles.surchargeOptionsGrid}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label className={styles.checkLabel} style={{ minWidth: '70px' }}>
                          <input type="checkbox" checked={groupApply.flexibag} onChange={(e) => setGroupApplyEnabled('flexibag', e.target.checked)} />
                          플렉시백
                        </label>
                        <select className={styles.select} value={selectedByGroup('flexibag')} onChange={(e) => setSurchargeByGroup('flexibag', e.target.value)} disabled={!groupApply.flexibag}>
                          <option value="">유형 선택</option>
                          {flexibagOptions.map((s) => <option key={s.id} value={s.id}>{s.label.replace('플렉시백 컨테이너 ', '')}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label className={styles.checkLabel} style={{ minWidth: '70px' }}>
                          <input type="checkbox" checked={groupApply.hazard} onChange={(e) => setGroupApplyEnabled('hazard', e.target.checked)} />
                          위험물
                        </label>
                        <select className={styles.select} value={selectedByGroup('hazard')} onChange={(e) => setSurchargeByGroup('hazard', e.target.value)} disabled={!groupApply.hazard}>
                          <option value="">등급</option>
                          {hazardOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className={styles.surchargeGroup}>
                    <div className={styles.surchargeGroupTitle}>⚙️ 운송 환경</div>
                    <div className={styles.surchargeOptionsGrid}>
                      {checkboxSurcharges.map((s) => (
                        <label key={s.id} className={styles.checkLabel}>
                          <input type="checkbox" checked={surchargeIds.has(s.id)} onChange={() => toggleSurcharge(s.id)} />
                          {s.id === 'rough' ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              험로 <input type="number" className={styles.inputPct} value={roughPct} onChange={(e) => setRoughPct(parseInt(e.target.value, 10) || 0)} />%
                            </span>
                          ) : s.label.split('(')[0]}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className={styles.surchargeGroup}>
                    <div className={styles.surchargeGroupTitle}>⚠️ 특수 할증</div>
                    <div className={styles.surchargeOptionsGrid}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label className={styles.checkLabel} style={{ whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={groupApply.oversize} onChange={(e) => setGroupApplyEnabled('oversize', e.target.checked)} />
                          활대품
                        </label>
                        <select className={styles.select} value={selectedByGroup('oversize')} onChange={(e) => setSurchargeByGroup('oversize', e.target.value)} disabled={!groupApply.oversize}>
                          <option value="">크기</option>
                          {oversizeOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label className={styles.checkLabel} style={{ whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={groupApply.heavy} onChange={(e) => setGroupApplyEnabled('heavy', e.target.checked)} />
                          중량물
                        </label>
                        <select className={styles.select} value={selectedByGroup('heavy')} onChange={(e) => setSurchargeByGroup('heavy', e.target.value)} disabled={!groupApply.heavy}>
                          <option value="">무게</option>
                          {heavyOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className={styles.surchargeGroup}>
                    <div className={styles.surchargeGroupTitle}>💰 부대 비용</div>
                    <div className={styles.surchargeOptionsGrid}>
                      {otherCostItems.map((s) => (
                        <label key={s.id} className={styles.checkLabel}>
                          <input type="checkbox" checked={surchargeIds.has(s.id)} onChange={() => toggleSurcharge(s.id)} />
                          {s.label.split(':')[0]}
                          <span className={styles.tooltipContainer}>
                            <span className={styles.infoIcon}>?</span>
                            <div className={styles.tooltipText}>{s.label}</div>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* STEP 3: 실행 및 조회 */}
              <div className={styles.stepModule}>
                <div className={styles.stepTitle}>
                  <span className={styles.stepNumber}>3</span> 결과 조회/실행
                </div>
                {(queryType === 'section' || queryType === 'other' || queryType === 'distance') && (
                  <div className={styles.modeRow}>
                    <label className={styles.radioLabel}>
                      <input type="radio" name="displayMode" value="all" checked={displayMode === 'all'} onChange={() => setDisplayMode('all')} />
                      적용월 전체(최근순)
                    </label>
                    <label className={styles.radioLabel}>
                      <input type="radio" name="displayMode" value="latest" checked={displayMode === 'latest'} onChange={() => setDisplayMode('latest')} />
                      선택 적용월만
                    </label>
                  </div>
                )}

                <div className={styles.btnGroupVertical}>
                  <button
                    type="button"
                    className={styles.btnSearch}
                    onClick={runLookup}
                    disabled={!canSubmit || lookupLoading}
                  >
                    {lookupLoading ? '조회 중...' : '안전운임 조회'}
                  </button>
                  <button
                    type="button"
                    className={styles.btnExcel}
                    onClick={downloadExcel}
                    disabled={downloadLoading || (!resultAll && savedResults.length === 0)}
                  >
                    {downloadLoading ? '엑셀 생성 중...' : '결과 엑셀 다운로드'}
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', marginTop: '6px' }}>
                    <label className={styles.checkLabel} style={{ cursor: 'pointer' }}>
                      <input type="checkbox" checked={saveToTemp} onChange={(e) => handleSaveToTempChange(e.target.checked)} />
                      조회내역 보존
                    </label>
                    <button type="button" onClick={clearSavedResults} className={styles.clearBtn}>내역 비우기</button>
                  </div>
                </div>
              </div>

            </div>
          </section>

          {lookupError && <p className={styles.error}>{lookupError}</p>}

          {resultAll && resultAll.type === queryType && (
            <section className={styles.resultSection} ref={resultRef}>
              {/* PC 버전: 기존 테이블 유지 */}
              <div className={styles.pcOnly}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th rowSpan={2}>적용</th>
                      <th rowSpan={2}>기점</th>
                      <th rowSpan={2}>행선지</th>
                      <th rowSpan={2}>구분</th>
                      <th rowSpan={2}>거리(KM)</th>
                      <th colSpan={3} className={styles.thGroup}>40FT</th>
                      <th colSpan={3} className={styles.thGroup}>20FT</th>
                    </tr>
                    <tr>
                      <th>위탁</th>
                      <th>운수자</th>
                      <th>안전</th>
                      <th>위탁</th>
                      <th>운수자</th>
                      <th>안전</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row, idx) => {
                      const applied = applySurchargesToRow(row);
                      const isBlank = row.isNotApplied || (applied.f40안전 === 0);
                      const format = (val) => (isBlank || !val ? '-' : val.toLocaleString());

                      return (
                        <tr key={idx}>
                          <td>{applied.period}</td>
                          <td>{resultAll.origin || '-'}</td>
                          <td>{resultAll.destination || '-'}</td>
                          <td>
                            <span className={applied.tripMode === 'oneWay' ? styles.tagOneWay : styles.tagRound}>
                              {applied.tripMode === 'oneWay' ? '편도' : '왕복'}
                            </span>
                          </td>
                          <td className={styles.cellKm}>{applied.km}</td>
                          <td className={styles.cellAmount}>{format(applied.f40위탁)}</td>
                          <td className={styles.cellAmount}>{format(applied.f40운수자)}</td>
                          <td className={styles.cellAmount}>{format(applied.f40안전)}</td>
                          <td className={styles.cellAmount}>{format(applied.f20위탁)}</td>
                          <td className={styles.cellAmount}>{format(applied.f20운수자)}</td>
                          <td className={styles.cellAmount}>{format(applied.f20안전)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 모바일 버전: 카드 리스트 레이아웃 */}
              <div className={styles.mobileOnly}>
                {displayRows.map((row, idx) => {
                  const applied = applySurchargesToRow(row);
                  const isBlank = row.isNotApplied || (applied.f40안전 === 0);
                  const format = (val) => (isBlank || !val ? '-' : val.toLocaleString());

                  return (
                    <div key={idx} className={styles.mobileResultCard}>
                      <div className={styles.cardHead}>
                        <div className={styles.cardRoute}>
                          <span>🚩</span>
                          <span>{resultAll.origin || '-'} ➔ {resultAll.destination || '-'}</span>
                        </div>
                        <span className={styles.cardPeriod}>{applied.period}</span>
                      </div>

                      <div className={styles.cardBody}>
                        {/* 40FT 섹션 */}
                        <div className={styles.fareBox}>
                          <div className={styles.fareTitle}>🚛 40FT</div>
                          <div className={styles.fareLine}>
                            <span className={styles.fareLabel}>위탁</span>
                            <span className={styles.fareValue}>{format(applied.f40위탁)}</span>
                          </div>
                          <div className={styles.fareLine}>
                            <span className={styles.fareLabel}>운수자</span>
                            <span className={styles.fareValue}>{format(applied.f40운수자)}</span>
                          </div>
                          <div className={styles.fareLine}>
                            <span className={styles.fareLabel}>안전</span>
                            <span className={styles.fareValueMain}>{format(applied.f40안전)}</span>
                          </div>
                        </div>

                        {/* 20FT 섹션 */}
                        <div className={styles.fareBox}>
                          <div className={styles.fareTitle}>🚚 20FT</div>
                          <div className={styles.fareLine}>
                            <span className={styles.fareLabel}>위탁</span>
                            <span className={styles.fareValue}>{format(applied.f20위탁)}</span>
                          </div>
                          <div className={styles.fareLine}>
                            <span className={styles.fareLabel}>운수자</span>
                            <span className={styles.fareValue}>{format(applied.f20운수자)}</span>
                          </div>
                          <div className={styles.fareLine}>
                            <span className={styles.fareLabel}>안전</span>
                            <span className={styles.fareValueMain}>{format(applied.f20안전)}</span>
                          </div>
                        </div>
                      </div>

                      <div className={styles.cardFoot}>
                        <span className={applied.tripMode === 'oneWay' ? styles.tagOneWay : styles.tagRound}>
                          {applied.tripMode === 'oneWay' ? '편도' : '왕복'}
                        </span>
                        <span>|</span>
                        <span>주행거리: <strong>{applied.km}km</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {surchargeIds.size > 0 && (
                <>
                  <p className={styles.fareNote}>
                    위 금액에 선택한 할증비용이 반영되어 표시됩니다.
                    {appliedSurchargeInfo.pctApplied.length > 0 && (
                      <> (할증률: 1번째 전액, 2·3번째 50% 적용)</>
                    )}
                  </p>
                  {appliedSurchargeInfo.pctExcluded.length > 0 && (
                    <div className={styles.excludedSurcharges}>
                      <span className={styles.excludedHead}>적용 제외 (고시 제22조 나목):</span>
                      <ul className={styles.excludedList}>
                        {appliedSurchargeInfo.pctExcluded.map((s, i) => (
                          <li key={i}>
                            <strong>{s.label}</strong> — {s.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
              <p className={styles.disclaimer}>
                할증금액은 할증료만 백원미만 사사오입 적용 후 합산, 거리(km)는 소수점 첫째자리 사사오입 적용됩니다.
                본 서비스는 화물자동차 안전운임에 근거한 운임으로 참고용 자료로만 사용되어야 하며, 실제 운송 시 차이가 발생할 수 있습니다.
              </p>
              <p className={styles.source}>출처: 2026년 적용 화물자동차 안전운임 고시(국토교통부고시 제2026-000호, 2026.2.1. 시행)</p>
            </section>
          )}

          {savedResults.length > 0 && (
            <section className={styles.savedSection}>
              <p className={styles.sectionHead}>이전 조회 내역</p>
              <ul className={styles.savedList}>
                {savedResults
                  .filter((s, idx) => {
                    // 상단 Detailed View(resultAll)에 표시 중인 최신 건은 이력 목록에서 숨김 (중복 방지)
                    if (!resultAll) return true;
                    if (idx === 0 && s.origin === resultAll.origin && s.destination === resultAll.destination && s.type === resultAll.type) return false;
                    return true;
                  })
                  .map((s, idx, filteredArr) => {
                    const savedAt = s.savedAt ? new Date(s.savedAt) : new Date(s.id);
                    const savedAtStr = savedAt.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
                    // No 번호 유지
                    const seqNum = filteredArr.length - idx;
                    return (
                      <li key={s.id} className={styles.savedItem}>
                        <div className={styles.savedRow}>
                          <span className={styles.savedSeq}>No.{seqNum}</span>
                          <span className={styles.savedDateTime}>{savedAtStr}</span>
                          {s.period && <span className={styles.savedPeriod}>{s.period}</span>}
                          <span className={styles.savedType}>{s.typeLabel}</span>
                          <span className={s.tripMode === 'oneWay' ? styles.tagOneWay : styles.tagRound}>
                            {s.tripMode === 'oneWay' ? '편도' : '왕복'}
                          </span>
                          <span className={styles.savedCond}>
                            {s.origin && `${s.origin} → `}
                            {s.destination || '-'}
                            {s.km != null && ` · ${s.km}km`}
                          </span>
                          <button
                            type="button"
                            className={styles.savedItemDelete}
                            onClick={() => removeSavedItem(s.id)}
                            aria-label="이 항목 삭제"
                          >
                            삭제
                          </button>
                        </div>
                        <div className={styles.savedFares}>
                          <span>40FT 위탁 <strong className={styles.amountText}>{s.f40위탁?.toLocaleString()}</strong> · 운수자 <strong className={styles.amountText}>{s.f40운수자?.toLocaleString()}</strong> · 안전 <strong className={styles.amountText}>{s.f40안전?.toLocaleString()}</strong></span>
                          <span>20FT 위탁 <strong className={styles.amountText}>{s.f20위탁?.toLocaleString()}</strong> · 운수자 <strong className={styles.amountText}>{s.f20운수자?.toLocaleString()}</strong> · 안전 <strong className={styles.amountText}>{s.f20안전?.toLocaleString()}</strong></span>
                        </div>
                        {s.appliedSurcharges?.length > 0 && (
                          <p className={styles.savedSurcharges}>
                            적용 할증: {s.appliedSurcharges.join(', ')}
                          </p>
                        )}
                        {s.excludedSurcharges?.length > 0 && (
                          <p className={styles.excludedSurcharges} style={{ marginTop: '8px', padding: '8px', background: '#f8fafc', borderRadius: '6px', fontSize: '0.8rem', color: '#64748b' }}>
                            <span style={{ fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>적용 제외:</span>
                            {s.excludedSurcharges.map((x, i) => (
                              <div key={i} style={{ marginBottom: '2px' }}>• {x.label}: {x.reason}</div>
                            ))}
                          </p>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          )}
        </>
      )}
      {toastMessage && <div className={styles.toast}>{toastMessage}</div>}
    </div>
  );
}
