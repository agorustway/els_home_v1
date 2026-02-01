'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import styles from './safe-freight.module.css';
import { NOTICE_SECTIONS, NOTICE_SOURCE } from './safe-freight-notice';

const QUERY_TYPES = [
  { id: 'section', label: '구간별운임', desc: '기점·행선지별 고시 운임' },
  { id: 'distance', label: '거리별운임', desc: '거리(km)별 운임', yearNote: '2022년 적용분' },
  { id: 'other', label: '이외구간', desc: '고시 외 구간 거리 → 거리별 운임 적용', yearNote: '2022년 적용분' },
];

const TEMP_RESULTS_KEY = 'safeFreightTempResults';

export default function SafeFreightPage() {
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [queryType, setQueryType] = useState('section');
  const [period, setPeriod] = useState('');
  const [origin, setOrigin] = useState('');
  const [region1, setRegion1] = useState('');
  const [region2, setRegion2] = useState('');
  const [region3, setRegion3] = useState('');
  const [distType, setDistType] = useState('');
  const [inputKm, setInputKm] = useState('');
  const [surchargeIds, setSurchargeIds] = useState(new Set());
  const [roughPct, setRoughPct] = useState(20);
  const [displayMode, setDisplayMode] = useState('all');
  const [groupApply, setGroupApply] = useState({ flexibag: false, hazard: false, oversize: false, heavy: false });

  const [resultAll, setResultAll] = useState(null);
  const [result, setResult] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saveToTemp, setSaveToTemp] = useState(true);
  const [savedResults, setSavedResults] = useState([]);
  const [expandedNoticeId, setExpandedNoticeId] = useState(null);
  const [noticeModalOpen, setNoticeModalOpen] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const otherTabDefaultsJustSet = useRef(false);
  const skipRegionClearOnce = useRef(false);

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
        setOrigin('부산신항');
        setRegion1('충남');
        setRegion2('아산시');
        setRegion3('인주면');
        if (data.distanceTypes?.length) setDistType(data.distanceTypes[0]);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const regionsSource = useMemo(
    () => (queryType === 'other' ? options?.otherRegions?.[origin] || {} : options?.regions || {}),
    [options, queryType, origin]
  );
  const region1List = useMemo(() => Object.keys(regionsSource).sort(), [regionsSource]);
  const region2List = useMemo(
    () => (region1 && regionsSource[region1] ? Object.keys(regionsSource[region1]).sort() : []),
    [regionsSource, region1]
  );
  const region3List = useMemo(
    () => (region2 && regionsSource[region1]?.[region2] ? [...(regionsSource[region1][region2] || [])].sort() : []),
    [regionsSource, region1, region2]
  );

  /** 조회 조건 기점 목록 (기점축약 통일) */
  const originList = options?.origins || [];

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
  // 기본 행선지(충남·아산시)일 때 읍·면·동 기본값 '인주면' 유지 (region2 변경 시 region3 비우는 효과 이후 복구)
  useEffect(() => {
    if (options && region1 === '충남' && region2 === '아산시' && region3 === '') {
      setRegion3('인주면');
    }
  }, [options, region1, region2, region3]);
  useEffect(() => {
    setResultAll(null);
    setResult(null);
    setLookupError(null);
    if (queryType === 'section') {
      skipRegionClearOnce.current = true;
      const p = options?.periods?.find((x) => x.id === '26.02월') ? '26.02월' : options?.periods?.[0]?.id;
      if (p) setPeriod(p);
      setOrigin('부산신항');
      setRegion1('충남');
      setRegion2('아산시');
      setRegion3('인주면');
    } else if (queryType === 'other') {
      otherTabDefaultsJustSet.current = true;
      skipRegionClearOnce.current = true;
      const p = options?.periods?.find((x) => x.id === '12월') ? '12월' : options?.periods?.[0]?.id;
      if (p) setPeriod(p);
      setOrigin('부산신항');
      setRegion1('충남');
      setRegion2('아산시');
      setRegion3('인주면');
    } else {
      const p = options?.periods?.find((x) => x.id === '12월') ? '12월' : options?.periods?.[0]?.id;
      if (p) setPeriod(p);
      setRegion1('');
      setRegion2('');
      setRegion3('');
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
  }, [options?.surcharges, options?.surchargeRegulation, surchargeIds, roughPct]);

  /** 할증 적용한 금액 객체 반환 (고시 제22조: 할증률 최대 3개, 1개 전액·나머지 50%) */
  const applySurchargesToRow = useMemo(() => {
    return (row) => {
      if (!row) return row;
      let f40위탁 = row.f40위탁 || 0;
      let f40운수자 = row.f40운수자 || 0;
      let f40안전 = row.f40안전 || 0;
      let f20위탁 = row.f20위탁 || 0;
      let f20운수자 = row.f20운수자 || 0;
      let f20안전 = row.f20안전 || 0;
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
      };
    };
  }, [appliedSurchargeInfo]);

  const runLookup = async () => {
    setLookupError(null);
    setResultAll(null);
    setResult(null);
    setLookupLoading(true);

    try {
      const params = new URLSearchParams();
      params.set('type', queryType);
      params.set('period', period);

      if (queryType === 'distance') {
        const km = parseInt(inputKm, 10);
        if (Number.isNaN(km) || km < 1) {
          setLookupError('거리(km)를 입력하세요.');
          setLookupLoading(false);
          return;
        }
        params.set('distType', distType);
        params.set('km', String(km));
      } else {
        if (!origin || !region1 || !region2 || !region3) {
          setLookupError('기간·구간·행선지(시/도, 시/군/구, 읍/면/동)를 모두 선택해 주세요.');
          setLookupLoading(false);
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
      if (!rows.length) throw new Error('해당 운임을 찾을 수 없습니다.');

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

      if (saveToTemp) {
        const appliedLabels = [
          ...appliedSurchargeInfo.pctApplied.map((s) =>
            s.effective === 100 ? s.label : `${s.label} (50% 적용)`
          ),
          ...appliedSurchargeInfo.fixedApplied.map((s) => s.label),
        ];
        const typeLabel = QUERY_TYPES.find((t) => t.id === data.type)?.label || data.type;
        const entry = {
          id: Date.now(),
          savedAt: new Date().toISOString(),
          type: data.type,
          typeLabel,
          period: data.period ?? period,
          origin: data.origin,
          destination: data.destination,
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
    } catch (err) {
      setLookupError(err.message);
    } finally {
      setLookupLoading(false);
    }
  };

  const clearSavedResults = () => {
    setSavedResults([]);
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(TEMP_RESULTS_KEY);
    } catch (_) { }
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

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (canSubmit && !lookupLoading) runLookup();
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

  /** 구간별 전체 조회 시: 선택월 최상단 → 최신(26.02) → 나머지 최신순 */
  const displayRows = useMemo(() => {
    if (!resultAll?.rows?.length) return [];
    if (queryType !== 'section' || displayMode !== 'all') return resultAll.rows.slice(0, 1);
    const rows = resultAll.rows;
    const selectedRow = rows.find((r) => r.period === period);
    const latestRow = rows[0];
    const rest = rows.filter((r) => r !== selectedRow && r !== latestRow);
    rest.sort((a, b) => periodToNum(b.period) - periodToNum(a.period));
    const ordered = [];
    if (selectedRow) ordered.push(selectedRow);
    if (latestRow && latestRow !== selectedRow) ordered.push(latestRow);
    ordered.push(...rest);
    return ordered;
  }, [resultAll?.rows, queryType, displayMode, period]);

  const canSubmit =
    queryType === 'distance'
      ? inputKm && parseInt(inputKm, 10) >= 1
      : origin && region1 && region2 && region3;

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>안전운임 데이터를 불러오는 중입니다.</p>
      </div>
    );
  }
  if (error) {
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
        <p className={styles.desc}>구간별운임·거리별운임·이외구간 3가지 형식으로 조회할 수 있습니다.</p>
      </div>

      <div className={styles.tabs}>
        {QUERY_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={queryType === t.id ? styles.tabActive : styles.tab}
            onClick={() => setQueryType(t.id)}
          >
            <span className={styles.tabLabel}>
              {t.label}
              {t.yearNote && <span className={styles.yearNote}> ({t.yearNote})</span>}
            </span>
            <span className={styles.tabDesc}>{t.desc}</span>
          </button>
        ))}
        <button
          type="button"
          className={styles.noticeTabBtn}
          onClick={() => setNoticeModalOpen(true)}
          aria-label="관련 법령·고시 안내 보기"
        >
          <span className={styles.noticeTabLabel}>관련 법령·고시 안내</span>
        </button>
      </div>

      {noticeModalOpen && (
        <div
          className={styles.noticeModalOverlay}
          onClick={() => setNoticeModalOpen(false)}
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
            <ul className={styles.noticeList}>
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

      <section className={styles.formSection}>
        <div className={styles.formGrid}>
          <div className={styles.formLeft}>
            <form onSubmit={handleFormSubmit} className={styles.queryForm}>
              <p className={styles.sectionHead}>조회 조건</p>
              <div className={styles.formBlock}>
                <label className={styles.label}>기간</label>
                <select
                  className={styles.select}
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  aria-label="적용 기간"
                >
                  {(options?.periods || []).map((p) => (
                    <option key={p.id} value={p.id}>{p.label || p.id}</option>
                  ))}
                </select>
                {queryType === 'section' && displayMode === 'all' && (
                  <p className={styles.periodHint}>전체 조회 시 기간 조건은 적용되지 않습니다.</p>
                )}
              </div>

              {queryType !== 'distance' && (
                <>
                  <div className={styles.formBlock}>
                    <label className={styles.label}>기점축약</label>
                    <select
                      className={styles.select}
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      aria-label="기점축약"
                    >
                      {originList.map((o) => (
                        <option key={o.id} value={o.id}>{o.id}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.formBlock}>
                    <label className={styles.label}>행선지</label>
                    <div className={styles.regionGroup}>
                      <select
                        className={styles.select}
                        value={region1}
                        onChange={(e) => setRegion1(e.target.value)}
                        aria-label="시·도"
                      >
                        <option value="">시·도</option>
                        {region1List.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      <select
                        className={styles.select}
                        value={region2}
                        onChange={(e) => setRegion2(e.target.value)}
                        aria-label="시·군·구"
                        disabled={!region1}
                      >
                        <option value="">시·군·구</option>
                        {region2List.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      <select
                        className={styles.select}
                        value={region3}
                        onChange={(e) => setRegion3(e.target.value)}
                        aria-label="읍·면·동"
                        disabled={!region2}
                      >
                        <option value="">읍·면·동</option>
                        {region3List.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <p className={styles.regionHint}>주소 검색 시 지역정보가 자동입력됩니다.</p>
                  </div>
                </>
              )}

              {queryType === 'distance' && (
                <>
                  <div className={styles.formBlock}>
                    <label className={styles.label}>구분</label>
                    <select
                      className={styles.select}
                      value={distType}
                      onChange={(e) => setDistType(e.target.value)}
                      aria-label="거리별 구분"
                    >
                      {(options?.distanceTypes || []).map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.formBlock}>
                    <label className={styles.label}>거리 (km)</label>
                    <input
                      type="number"
                      min={1}
                      className={styles.inputKm}
                      value={inputKm}
                      onChange={(e) => setInputKm(e.target.value)}
                      placeholder="예: 350"
                    />
                  </div>
                </>
              )}

              {queryType === 'section' && (
                <div className={styles.modeRow}>
                  <span className={styles.modeLabel}>표시</span>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="displayMode"
                      value="all"
                      checked={displayMode === 'all'}
                      onChange={() => setDisplayMode('all')}
                    />
                    적용월 전체 (최근순)
                  </label>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="displayMode"
                      value="latest"
                      checked={displayMode === 'latest'}
                      onChange={() => setDisplayMode('latest')}
                    />
                    최신 적용월만
                  </label>
                </div>
              )}

              <div className={styles.actionRow}>
                <div className={styles.actionPrimary}>
                  <button
                    type="submit"
                    className={styles.submitBtn}
                    disabled={lookupLoading || !canSubmit}
                  >
                    {lookupLoading ? '조회 중…' : '안전운임 조회'}
                  </button>
                  <button
                    type="button"
                    className={styles.excelDownloadBtn}
                    disabled={downloadLoading || (!resultAll && (!savedResults || savedResults.length === 0))}
                    onClick={downloadExcel}
                  >
                    {downloadLoading ? '다운로드 중…' : '엑셀 다운로드'}
                  </button>
                </div>
                <div className={styles.actionSecondary}>
                  <label className={styles.tempSaveLabel}>
                    <input
                      type="checkbox"
                      checked={saveToTemp}
                      onChange={(e) => setSaveToTemp(e.target.checked)}
                    />
                    결과값 임시저장
                  </label>
                  <button
                    type="button"
                    className={styles.clearSavedBtn}
                    onClick={clearSavedResults}
                  >
                    비우기
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className={styles.formRight}>
            <p className={styles.sectionHead}>I. 할증비용</p>
            {options?.surchargeRegulation?.notice && (
              <p className={styles.regulationNotice} title={options.surchargeRegulation.legalRef}>
                {options.surchargeRegulation.notice}
              </p>
            )}
            <div className={styles.surchargeGrid}>
              <div className={styles.surchargeCol}>
                {flexibagOptions.length > 0 && (
                  <div className={styles.formBlock}>
                    <span className={styles.label}>플렉시백 컨테이너</span>
                    <label className={styles.checkLabel}>
                      <input
                        type="checkbox"
                        checked={groupApply.flexibag || !!selectedByGroup('flexibag')}
                        onChange={(e) => setGroupApplyEnabled('flexibag', e.target.checked)}
                      />
                      <span>적용</span>
                    </label>
                    {(groupApply.flexibag || selectedByGroup('flexibag')) && (
                      <div className={styles.radioGroup}>
                        {flexibagOptions.map((s) => (
                          <label key={s.id} className={styles.radioLabel}>
                            <input
                              type="radio"
                              name="flexibag"
                              checked={surchargeIds.has(s.id)}
                              onChange={() => setSurchargeByGroup('flexibag', s.id)}
                            />
                            {s.label.replace('플렉시백 컨테이너 ', '')}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className={styles.formBlock}>
                  <span className={styles.label}>기타 할증</span>
                  {checkboxSurcharges.map((s) => (
                    <label key={s.id} className={styles.checkLabel}>
                      <input
                        type="checkbox"
                        checked={surchargeIds.has(s.id)}
                        onChange={() => toggleSurcharge(s.id)}
                      />
                      <span>
                        {s.label}
                        {s.id === 'rough' && (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={roughPct}
                            onChange={(e) => setRoughPct(Number(e.target.value) || 20)}
                            className={styles.roughInput}
                          />
                        )}
                        {!s.fixed && typeof (s.pct ?? 0) === 'number' && (s.id === 'rough' ? ' % 적용' : (s.label?.includes('%') ? ' 적용' : ` ${s.pct}% 적용`))}
                        {s.note && <small className={styles.surchargeNote}>{s.note}</small>}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.surchargeCol}>
                {hazardOptions.length > 0 && (
                  <div className={styles.formBlock}>
                    <span className={styles.label}>위험물질 할증</span>
                    <label className={styles.checkLabel}>
                      <input
                        type="checkbox"
                        checked={groupApply.hazard || !!selectedByGroup('hazard')}
                        onChange={(e) => setGroupApplyEnabled('hazard', e.target.checked)}
                      />
                      <span>적용</span>
                    </label>
                    {(groupApply.hazard || selectedByGroup('hazard')) && (
                      <select
                        className={styles.surchargeSelect}
                        value={selectedByGroup('hazard')}
                        onChange={(e) => setSurchargeByGroup('hazard', e.target.value || null)}
                        aria-label="위험물질 선택"
                      >
                        <option value="">==선택==</option>
                        {hazardOptions.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                {oversizeOptions.length > 0 && (
                  <div className={styles.formBlock}>
                    <span className={styles.label}>활대품 할증</span>
                    <label className={styles.checkLabel}>
                      <input
                        type="checkbox"
                        checked={groupApply.oversize || !!selectedByGroup('oversize')}
                        onChange={(e) => setGroupApplyEnabled('oversize', e.target.checked)}
                      />
                      <span>적용</span>
                    </label>
                    {(groupApply.oversize || selectedByGroup('oversize')) && (
                      <select
                        className={styles.surchargeSelect}
                        value={selectedByGroup('oversize')}
                        onChange={(e) => setSurchargeByGroup('oversize', e.target.value || null)}
                        aria-label="활대품 할증 선택"
                      >
                        <option value="">==선택==</option>
                        {oversizeOptions.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                {heavyOptions.length > 0 && (
                  <div className={styles.formBlock}>
                    <span className={styles.label}>중량물 할증</span>
                    <label className={styles.checkLabel}>
                      <input
                        type="checkbox"
                        checked={groupApply.heavy || !!selectedByGroup('heavy')}
                        onChange={(e) => setGroupApplyEnabled('heavy', e.target.checked)}
                      />
                      <span>적용</span>
                    </label>
                    {(groupApply.heavy || selectedByGroup('heavy')) && (
                      <select
                        className={styles.surchargeSelect}
                        value={selectedByGroup('heavy')}
                        onChange={(e) => setSurchargeByGroup('heavy', e.target.value || null)}
                        aria-label="중량물 할증 선택"
                      >
                        <option value="">==선택==</option>
                        {heavyOptions.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            </div>
            {otherCostItems.length > 0 && (
              <>
                <p className={styles.sectionHead}>II. 기타비용</p>
                <div className={styles.formBlock}>
                  {otherCostItems.map((s) => (
                    <label key={s.id} className={styles.checkLabel}>
                      <input
                        type="checkbox"
                        checked={surchargeIds.has(s.id)}
                        onChange={() => toggleSurcharge(s.id)}
                      />
                      <span>{s.label}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {lookupError && <p className={styles.error}>{lookupError}</p>}

      {resultAll && resultAll.type === queryType && (
        <section className={styles.resultSection}>
          <p className={styles.tip}>
            {resultAll.type === 'section' && '적용월을 참고해 위탁·운수자·안전 운임을 40FT·20FT 모두 확인할 수 있습니다.'}
            {resultAll.type === 'distance' && <>입력한 거리(km)에 해당하는 거리별 운임입니다. <span className={styles.yearNote}>(2022년 적용분)</span></>}
            {resultAll.type === 'other' && <>이외구간에서 조회한 거리로 거리별 운임을 적용한 결과입니다. <span className={styles.yearNote}>(2022년 적용분)</span></>}
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th rowSpan={2}>적용</th>
                <th rowSpan={2}>구간</th>
                <th rowSpan={2}>행선지</th>
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
                return (
                  <tr key={idx}>
                    <td>{applied.period}</td>
                    <td>{resultAll.origin || '-'}</td>
                    <td>{resultAll.destination || '-'}</td>
                    <td>{applied.km}</td>
                    <td>{applied.f40위탁?.toLocaleString()}</td>
                    <td>{applied.f40운수자?.toLocaleString()}</td>
                    <td>{applied.f40안전?.toLocaleString()}</td>
                    <td>{applied.f20위탁?.toLocaleString()}</td>
                    <td>{applied.f20운수자?.toLocaleString()}</td>
                    <td>{applied.f20안전?.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
          <p className={styles.sectionHead}>임시 저장된 결과 (적용된 할증 반영)</p>
          <ul className={styles.savedList}>
            {savedResults.map((s, idx) => {
              const savedAt = s.savedAt ? new Date(s.savedAt) : new Date(s.id);
              const savedAtStr = savedAt.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
              return (
                <li key={s.id} className={styles.savedItem}>
                  <div className={styles.savedRow}>
                    <span className={styles.savedSeq}>No.{savedResults.length - idx}</span>
                    <span className={styles.savedDateTime}>{savedAtStr}</span>
                    {s.period && <span className={styles.savedPeriod}>{s.period}</span>}
                    <span className={styles.savedType}>{s.typeLabel}</span>
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
                    <span>40FT 위탁 {s.f40위탁?.toLocaleString()} · 운수자 {s.f40운수자?.toLocaleString()} · 안전 {s.f40안전?.toLocaleString()}</span>
                    <span>20FT 위탁 {s.f20위탁?.toLocaleString()} · 운수자 {s.f20운수자?.toLocaleString()} · 안전 {s.f20안전?.toLocaleString()}</span>
                  </div>
                  {s.appliedSurcharges?.length > 0 && (
                    <p className={styles.savedSurcharges}>
                      적용 할증: {s.appliedSurcharges.join(', ')}
                    </p>
                  )}
                  {s.excludedSurcharges?.length > 0 && (
                    <p className={styles.savedExcluded}>
                      적용 제외: {s.excludedSurcharges.map((x) => x.label).join(', ')} — {s.excludedSurcharges[0].reason}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
