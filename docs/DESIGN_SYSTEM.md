# 🎨 ELS 인트라넷 디자인 시스템
#
# ╔══════════════════════════════════════════════════════════════════╗
# ║  이 파일은 인트라넷 전 페이지의 UI/UX 통일 기준이다.           ║
# ║  모든 AI 에이전트는 신규 페이지 생성/수정 시                    ║
# ║  반드시 이 문서의 규칙을 따라야 한다.                           ║
# ║                                                                ║
# ║  📏 기준 페이지: 아산지점 배차판 (branches/asan)               ║
# ║  🔗 관련 파일: SiteLayout.module.css, EmployeeHeader.module.css║
# ╚══════════════════════════════════════════════════════════════════╝
#
# 마지막 업데이트: 2026-03-02
# 업데이트한 사람: Antigravity Agent

---

## 1. 기준 디바이스

### 📺 데스크탑 (기준)

| 항목 | 값 |
|------|------|
| **기준 해상도** | Full HD (1920 x 1080) |
| **콘텐츠 뷰포트** | **1092 x 1024** (사이드바/브라우저 크롬 제외) |
| **Chrome DevTools** | 반응형 모드에서 `1092 x 1024` 직접 입력 |

> **⚠️ 핵심**: 데스크탑 레이아웃은 **1092px 너비** 기준으로 설계한다.
> 사이드바(약 240px) + 브라우저 스크롤바(약 17px)를 제외한 실제 콘텐츠 영역.

### 📱 모바일 (기준)

| 항목 | 값 |
|------|------|
| **기준 모델** | Samsung Galaxy S24 |
| **CSS 뷰포트** | **360 x 780** |
| **DPR** | 3 |
| **물리 해상도** | 1080 x 2340 |
| **Chrome DevTools 대체** | Galaxy S8+ (360x740) — S24 프리셋 없으므로 가장 유사 |
| **사용자 실기기** | Galaxy S25 (S24와 동일 뷰포트) |

> **⚠️ 주의**: Chrome DevTools에 Galaxy S24 프리셋이 없으므로,
> `Galaxy S8+` (360x740)를 사용하되, 높이는 780으로 직접 설정하는 것을 권장.

### 반응형 브레이크포인트

| 이름 | 범위 | 주요 대상 |
|------|------|-----------|
| **데스크탑** | 1024px+ | Full HD 모니터 (콘텐츠 1092px) |
| **태블릿** | 768~1024px | 가로 태블릿, 작은 랩탑 |
| **모바일** | 480~768px | 세로 태블릿, 큰 폰 |
| **초소형** | ~480px | 일반 스마트폰 (S24: 360px) |

---

## 2. 여백 체계 (Spacing) — 최소화 원칙

### SiteLayout 본문 여백 (`.mainContent`)

| 화면 크기 | padding |
|-----------|---------|
| **데스크탑 (1024+)** | `12px 14px 36px` |
| **태블릿 (768~1024)** | `10px 10px 24px` |
| **모바일 (480~768)** | `8px 6px 28px` |
| **초소형 (~480)** | `6px 4px 24px` |

### 페이지 내부 컨테이너

| 항목 | 값 | 비고 |
|------|------|------|
| **container padding** | `6px` | 인트라넷 전 페이지 기준 |
| **컴포넌트 간 gap** | `6px ~ 8px` | 최소화 |
| **카드 내부 padding** | `10px ~ 14px` | 내용 밀도에 따라 |
| **테이블 셀 (th, td)** | `10px 12px` | (기존 14~16px에서 고밀도로 축소) |

---

## 3. 타이포그래피 (Typography)

### 폰트 크기 체계

| 역할 | font-size | font-weight | color | 비고 |
|------|-----------|-------------|-------|------|
| **대제목 (h1)** | `1.25rem` | `900` | `#0f172a` | 페이지 제목, 좌측 파란 세로선 (`border-left: 3px solid #2563eb`) |
| **중제목 (h2)** | `1.0rem` | `800` | `#1e293b` | 섹션 제목 |
| **소제목 (h3)** | `0.88rem` | `700` | `#334155` | 카드/패널 제목 |
| **본문** | `0.82rem` | `500~600` | `#475569` | 일반 텍스트 |
| **캡션/라벨** | `0.75rem` | `600~700` | `#64748b` | 보조 정보 |
| **미니텍스트** | `0.7rem` | `600` | `#94a3b8` | 타임스탬프, 주석 |

### letter-spacing

- 대제목: `-0.03em`
- 중/소제목: `-0.02em`
- 본문: 기본값

---

## 4. 페이지 헤더 (Page Header)

### 기본 원칙
1. **파란 배경 배너 사용 금지** → 흰색 카드 스타일
2. **제목은 반드시 1줄** → 넘치면 아래로 분리
3. 제목 좌측에 `border-left: 3px solid #2563eb` 포인트 바

### CSS 기준 (`.compactHeader` 및 `.headerBanner`)
```css
.headerBanner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #fff;
    padding: 10px 14px;
    border-radius: 10px;
    margin-bottom: 8px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
/* 모바일 화면에서는 flex-direction: column 적용 */

.pageTitle {
    font-size: 1.25rem;
    font-weight: 900;
    color: #0f172a;
    margin: 0;
    letter-spacing: -0.03em;
    padding-left: 12px;
    border-left: 3px solid #2563eb;
}
```

### 날짜/상태 배지
```css
.headerBadge {
    background: #eff6ff;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: 700;
    color: #2563eb;
    border: 1px solid #dbeafe;
}
```

---

## 5. 버튼 체계 (Buttons)

### 기본 버튼
```css
/* 일반 버튼 */
.btn {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    background: #f8fafc;
    color: #475569;
    font-weight: 700;
    font-size: 0.78rem;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
}

/* 강조 버튼 */
.btnPoint {
    background: #eff6ff;
    color: #2563eb;
    border-color: #bfdbfe;
}

/* 위험 버튼 */
.btnDanger {
    background: #fef2f2;
    color: #dc2626;
    border-color: #fecaca;
}
```

### 모바일 버튼 규칙
- **최소 높이**: 32px (터치 타겟)
- **최소 너비**: 패딩으로 확보, 글자 오버플로 방지
- 글자가 넘칠 경우: **텍스트 축약** (예: 개인정보수정 → 내정보)
- 축약으로도 안 되면: **아이콘만 표시** + 툴팁

---

## 6. 카드/패널

```css
.card {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 10px 14px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
```

---

## 7. 색상 체계 (Colors)

| 용도 | 색상 코드 | 이름 |
|------|-----------|------|
| **페이지 배경** | `#f8fafc` | Slate-50 |
| **카드 배경** | `#ffffff` | White |
| **테두리** | `#e2e8f0` | Slate-200 |
| **hover 테두리** | `#cbd5e1` | Slate-300 |
| **대제목 텍스트** | `#0f172a` | Slate-900 |
| **중/소제목 텍스트** | `#1e293b` / `#334155` | Slate-800/700 |
| **본문 텍스트** | `#475569` | Slate-600 |
| **보조 텍스트** | `#64748b` | Slate-500 |
| **비활성 텍스트** | `#94a3b8` | Slate-400 |
| **포인트 (Primary)** | `#2563eb` | Blue-600 |
| **포인트 배경 (Light)** | `#eff6ff` | Blue-50 |
| **성공** | `#059669` | Emerald-600 |
| **위험/경고** | `#dc2626` | Red-600 |
| **공휴일/빨간날** | `#ef4444` | Red-500 |

---

## 8. 모바일 헤더 (EmployeeHeader)

### 구성 (1줄, 44px 높이)
```
[☰] [이름] [내정보] [로그아웃] [문의]
```

### 규칙
- 햄버거: 왼쪽 고정, **28px** 아이콘 크기
- 이름: 성명만 표시 (직책/직급 숨김)
- 버튼 라벨: 모바일은 축약 (`내정보`, `로그아웃`, `문의`)
- 이름과 버튼 그룹 사이 **갭: 8px 이상**
- 전체 `justify-content: center` (햄버거 제외 영역)

---

## 9. 반응형 장식 요소 규칙

- 모든 `::before`,  `::after` 장식요소에 반드시 `pointer-events: none` 적용
- 클릭 가능한 요소 위에 장식이 있으면 `position: relative; z-index: 1` 으로 확보

---

## 10. 페이지 목록 및 통일 현황

| 페이지 | CSS 파일 | 통일 상태 |
|--------|----------|-----------|
| 아산 배차판 | `dispatch.module.css` | ✅ **기준** |
| 아산 대시보드 | `dashboard.module.css` | 🔄 진행 중 |
| 관리자 (권한/로그/대시보드) | `admin.module.css`, `users.module.css` | ✅ 완료 |
| 게시판 | `board.module.css` | ✅ 완료 |
| 업무보고 | `reports.module.css` | ✅ 완료 |
| NAS 자료실 | `archive.module.css` | ✅ 완료 |
| 사내/외부/운전원/협력사 연락처 | `intranet.module.css` | ✅ 완료 |
| 템플릿/작업지안내 | `intranet.module.css` | ✅ 완료 |
| 마이페이지 | `mypage.module.css` | ⬜ 대기 |
| 랜덤게임 | `random-game.module.css` | ⬜ 대기 |
| 웹진 | `webzine.module.css` | ⬜ 대기 |

---

## 11. AI 에이전트를 위한 체크리스트

신규 페이지 생성 또는 기존 페이지 수정 시:

- [ ] `container padding: 6px` 맞춤
- [ ] 페이지 헤더: 흰색 카드 + 좌측 파란 포인트 바
- [ ] 제목 1줄 유지 (넘치면 소제목/버튼을 아래로)
- [ ] 폰트 크기 체계 준수 (대/중/소/본문/캡션)
- [ ] 버튼 스타일 통일 (`.btn` 기준)
- [ ] **데스크탑 1092px 너비 테스트** (Full HD 기준)
- [ ] **모바일 360px 테스트** (Galaxy S24 기준)
- [ ] 장식 요소 `pointer-events: none` 확인
---
12. 엑셀 다운로드 표준 (Excel Standard)

인트라넷에서 제공하는 모든 엑셀 다운로드 기능은 아래 규격을 준수하여 사용자 경험을 통일한다.

### 기본 스타일
- **폰트**: `맑은 고딕` (Malgun Gothic)
- **폰트 크기**: `10pt` (모든 셀 공통)
- **정렬**: 
  - 제목열: `가운데 정렬` (horizontal: center)
  - 본문: 데이터 특성에 따라 (일반 텍스트: left, 숫자/날짜: center)
  - 수직 정렬: `중간` (vertical: middle)

### 제목열 (1행)
- **배경색**: 옅은 회색 (`#F2F2F2` 또는 `#EEEEEE`)
- **폰트**: `Bold` 처리
- **기능**:
  - **틀 고정**: 1행 고정 (Row 1 Freeze)
  - **자동 필터**: 전체 컬럼에 필터 적용

### 컬럼 너비 (Auto Width)
- **기준**: 해당 컬럼의 데이터 중 가장 긴 문자열 길이에 맞춤.
- **가중치**: 한글은 약 `2.1`, 영문/숫자는 약 `1.1`의 너비 가중치를 적용하여 글자가 잘리지 않도록 한다.
- **최대 너비**: 너무 긴 경우 `80` 정도로 제한.

### 파일명 규칙
- `서비스명_구분_날짜.xlsx` (예: `아산_글로비스KD_20260311.xlsx`)

---

## 13. 안드로이드 독립 앱 (Standalone App) 디자인 규격

인트라넷 웹 페이지(White/Blue 테마)와 달리, 운전원 전용 네이티브 앱(`assets/public/style.css`)은 **초고대비 다크 테마(Dark Theme)** 및 **운전 편의성(Large Touch Target)**을 최우선으로 설계한다.

### 핵심 원칙
1. **이모지/웹 요소 배제**: 앱 내에서 웹페이지 느낌을 주는 이모지나 아기자기한 요소를 모두 제거하고, 묵직한 장비용 대시보드(Professional Tool) 느낌 유지.
2. **원핸드 컨트롤 (One-handed)**: 스마트폰 거치 상태에서 운전석 타격이 가능하도록 모든 핵심 버튼(운송시작, 일시정지, 종료)의 높이를 최소 `56px`에서 최대 `72px`로 설계.
3. **가시성 극대화**: 배경은 순흑색에 가까운 어두운 톤(`var(--bg)`)을 쓰되, 글자는 밝은 텍스트(`var(--text)`)로 대비를 높임.

### 색상 변수 (CSS Variables)
```css
:root {
  --bg: #0d1117;          /* 바탕 배경 */
  --bg-card: #161b22;     /* 카드형 위젯 배경 */
  --bg-input: #1c2128;    /* 입력창 배경 */
  --border: #30363d;      /* 테두리 (경계선) */
  --text: #e6edf3;        /* 주 텍스트 */
  --text-muted: #7d8590;  /* 보조 텍스트 (라벨 등) */
  --accent: #58a6ff;      /* 액센트 컬러 (Blue) */
  --accent-dark: #1f6feb; /* 활성 상태 배너 등 */
  --danger: #f85149;      /* 경고/종료 (Red) */
  --success: #3fb950;     /* 성공/GPS 정상 (Green) */
  --warning: #d29922;     /* 일시정지 (Yellow) */
}
```

### 버튼 및 레이아웃
- **액션 버튼 (Action Button)**: 
  - 시작 버튼 (`.btn-start`): 높이 `72px`, 배경 `--accent`
  - 제어 버튼 (`.btn-pause`, `.btn-stop`): 높이 `56px`, 2열 그리드 배치
  - 테두리 반경 (`border-radius`): `16px` (둥글고 누르기 편하게)
- **컨테이너 (Screen & Main Content)**:
  - 하단 네비게이션(높이 64px) 및 상단 헤더(높이 56px)를 제외한 영역 구성.
  - 패딩(Padding): `16px` 유지 (화면 가장자리 간격)
