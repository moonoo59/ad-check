---
name: ad-check 프론트엔드 UI 패턴
description: 컴포넌트 구조, 스타일링 방식, shadcn/ui 도입 현황
type: project
---

## 기술 스택 (확정)
- React 19 + TypeScript + Vite 7
- Tailwind CSS v4 (`@tailwindcss/vite` 플러그인, postcss 없음)
- `@import "tailwindcss"` 방식 (기존 `@tailwind base/components/utilities` 아님)
- path alias: `@/` → `frontend/src/`

## 디자인 시스템

### 기존 커스텀 CSS (index.css) — 계속 사용 중
`--app-*` CSS 변수 기반 웜 그레이(warm gray) 팔레트:
- `--app-primary`: #785844 (브라운)
- `--app-surface`: rgba(255,250,244,0.94)
- `--app-border`, `--app-text`, `--app-text-soft`, `--app-text-faint`
- `.app-btn`, `.app-btn--primary/secondary/ghost/danger/soft` (border-radius: 999px)
- `.app-field`, `.app-select` (border-radius: 16px)
- `.app-table-shell`, `.app-table`
- `.app-surface`, `.app-toolbar-card`, `.app-stat-card`
- `.app-nav-shell`, `.app-nav-link`, `.app-nav-link--active`
- `.app-page`, `.app-page--narrow`, `.app-page--compact`
- `.app-chip`, `.app-chip--active`

**중요**: 기존 CSS 클래스는 그대로 유지한다. 신규 shadcn/ui 컴포넌트와 공존.

### shadcn/ui 컴포넌트 (2026-03-24 추가)
`frontend/src/components/ui/` 디렉토리:
- `button.tsx` — 기존 .app-btn과 동일한 웜 브라운 디자인, 6가지 variant
- `input.tsx` — 기존 .app-field와 동일한 포커스 스타일
- `label.tsx` — 기존 .app-label (전체 대문자, 작은 크기)
- `card.tsx` — 기존 .app-surface와 동일한 스타일
- `badge.tsx` — 7가지 variant (default/secondary/destructive/outline/success/warning/info)
- `dialog.tsx` — 기존 .app-modal-panel 스타일의 Dialog
- `select.tsx` — @radix-ui/react-select 기반
- `separator.tsx`, `progress.tsx`, `dropdown-menu.tsx`

shadcn/ui CSS 변수는 기존 --app-* 팔레트에 맞게 설정됨 (hsl로 웜 그레이 팔레트 반영).

### lucide-react 아이콘
모든 PageHeader에 `icon` prop으로 아이콘 전달 가능.
각 페이지별 아이콘:
- 요청 목록: `List`, 요청 등록: `FilePlus`, 요청 상세: `FileSearch`
- 채널 관리: `Tv2`, 사용자 관리: `Users`, 감사 로그: `ClipboardList`
- 통계 대시보드: `BarChart3`, 매뉴얼: `BookOpen`
- 비밀번호 변경: `KeyRound`, 로그인: `MonitorPlay`

## 컴포넌트 구조

```
frontend/src/
├── components/
│   ├── ui/            # shadcn/ui 기반 공통 컴포넌트
│   ├── GlobalNav.tsx  # 상단 네비게이션 (DropdownMenu 사용)
│   ├── StatusBadge.tsx  # 상태 배지 (Badge 컴포넌트 사용)
│   ├── ConfirmDialog.tsx  # 확인 다이얼로그 (Dialog 컴포넌트 사용)
│   ├── PageHeader.tsx   # 페이지 헤더 (icon prop 지원)
│   ├── SideDrawer.tsx   # 우측 슬라이드 드로어
│   ├── EmptyState.tsx   # 빈 상태 안내 (lucide 아이콘 지원)
│   ├── ErrorBanner.tsx  # 오류 배너 (AlertCircle 아이콘)
│   └── LoadingRow.tsx   # 테이블 스켈레톤
├── lib/
│   ├── utils.ts       # cn() 유틸 (clsx + tailwind-merge)
│   └── ...
└── pages/
```

## 중요 규칙
- `@/lib/utils`의 `cn()` 함수로 className 조합
- 기존 `.app-btn` 등 CSS 클래스는 신규 컴포넌트와 혼용 가능
- Tailwind v4에서는 `@import "tailwindcss"` 사용 (postcss 없음)
- 기존 비즈니스 로직(API 호출, 상태 관리) 절대 변경 금지
- 한글 주석 필수

**Why:** 기존 커스텀 CSS 시스템이 이미 잘 동작하므로 전면 교체가 아닌 점진적 확장 방식 채택.
**How to apply:** 신규 컴포넌트 작성 시 `@/components/ui/*` 우선 활용. 기존 `.app-btn` 계열 CSS도 계속 사용 가능.

---

## 코드 리뷰 결과 (2026-03-24)

### 중복 코드 (수정 권장)
- `normalizeTimeInput()` → RequestDetailPage.tsx(L81) + RequestNewPage.tsx(L65) 동일 함수 중복
- `TIME_RANGE_OPTIONS` → RequestDetailPage.tsx(L57) + RequestNewPage.tsx(L44) 동일 배열 중복
- `fmtDatetime/formatDatetime/fmtDate` → 3개 파일 각각 별도 정의 (→ dateUtils.ts 통합 권장)
- `ROLE_LABELS` → GlobalNav.tsx + UserManagementPage.tsx 양쪽 정의

### 미사용 컴포넌트
- `MatchScoreBadge.tsx` — 정의됨, import 없음
- `TimeRangeDisplay.tsx` — 정의됨, import 없음

### window.confirm() 사용 위치 (ConfirmDialog로 교체 권장)
- RequestDetailPage.tsx:461 — 복사 파일 삭제 확인
- RequestNewPage.tsx:155 — 행 삭제 확인

### 파일 크기 이슈
- RequestDetailPage.tsx: 1122줄 (권장 최대 300줄의 3.7배) → CopyProgressRow 분리됨, 모달 3개 인라인 존재

### eslint-disable 위치
- StatsDashboardPage.tsx:170~177 — fetchAll의 useCallback 의존성 배열 경고 무시

### 폴링 주의사항
- RequestDetailPage.tsx의 setInterval 폴링은 loadDetail useCallback 의존성에 따라 재생성될 수 있음
- 현재는 effect cleanup에서 clearInterval하므로 메모리 누수는 없으나 interval이 중복 생성/해제될 수 있음
