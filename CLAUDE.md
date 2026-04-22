# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 프로젝트 개요

방송 광고 증빙 요청 자동화 시스템. 광고팀의 이메일 요청을 웹 기반으로 대체하고, 기술팀이 Logger Storage에서 파일을 탐색·복사하는 수작업을 줄이는 내부 업무 도구.

운영 형태: macOS 단일 PC, 내부망 전용, 세션형 서비스 (사용 시에만 기동)

---

## 개발 명령어

```bash
# 의존성 설치 (최초 1회, pnpm 필요)
pnpm install

# 개발 서버 실행 (앱 + API를 4000 포트에서 함께 제공)
pnpm dev

# 각각 따로 실행
pnpm dev:backend
pnpm dev:frontend

# 프로덕션 빌드 (Electron 앱 생성 전 필수)
pnpm build

# 린트
pnpm lint

# macOS 앱 생성 (최초 1회 또는 코드 변경 후)
pnpm create-app
```

개발 서버 접속: http://localhost:4000
운영 앱 접속: http://localhost:4000
API 헬스체크: http://localhost:4000/api/health

> 개발 서버와 Electron 앱은 **서로 다른 DB를 사용**한다.
> - 개발 서버: `backend/data/adcheck.db`
> - 앱: `~/Library/Application Support/AdCheck/data/adcheck.db`

---

## 아키텍처 개요

### 모노레포 구조

```
ad-check/
├── backend/          # Express + TypeScript + SQLite
├── frontend/         # React + TypeScript + Vite
├── electron/         # macOS 앱 패키징 (Electron)
├── scripts/          # DB 백업, 앱 생성 스크립트
├── .env              # 실제 환경변수 (gitignore됨)
└── .env.example      # 환경변수 템플릿
```

### 백엔드 구조 (`backend/src/`)

```
config/
  env.ts              # 환경변수 로딩 (모든 env는 여기서 한 번만 읽음)
  database.ts         # DB 연결, 마이그레이션 자동 실행, 기본 유저 시딩, PRAGMA foreign_key_check
  migrations/         # SQL 파일 (NNN_설명.sql 순서대로 자동 적용)
common/
  response.ts         # 표준 API 응답 포맷 유틸리티
  middleware.ts        # requestId 부여, 404, 전역 에러 핸들러
  auth.middleware.ts  # 세션 기반 인증/권한 미들웨어 (요청마다 users 재조회)
  logger.ts           # 구조화 로거 (파일 + 콘솔)
  datetime.ts         # KST 변환 공용 유틸 (toKSTDateString 등)
  path-guards.ts      # 스토리지 경로 traversal 차단 공용 헬퍼
  login-rate-limit.ts # IP/계정명/IP+계정명 기반 로그인 실패 횟수 제한
modules/
  auth/               # 로그인/로그아웃/비밀번호 변경
  channels/           # 채널 매핑 관리 (표시명 ↔ 파일경로명 분리)
  requests/           # 요청 등록/목록/상세/승인/반려 + copy.service 호출
  files/
    files.service.ts         # Logger Storage 파일시스템 탐색 (requests에서 호출)
    file-matcher.ts          # 파일명 파싱·매칭 점수 계산 (순수 함수만)
    storage-cleanup.router.ts  # /api/files — 로컬 전달 스토리지 복사본 삭제 엔드포인트
    storage-cleanup.service.ts # 복사본 삭제 로직 (임시 이동 → DB 기록 → 실패 시 복구)
    delivery-cleanup.service.ts # 1일 경과 로컬 전달 파일 자동 정리 (index.ts에서 1시간 간격 스케줄)
  copy/
    copy.service.ts   # 파일 복사 실행 (Logger Storage → 서버 로컬 스토리지). 라우터 없음 — requests에서 직접 호출
  users/              # 사용자 관리 (admin 전용)
  audit/              # 감사 로그 조회
  stats/              # 통계 대시보드 + Excel(CSV) 내보내기
  health/             # 헬스체크
app.ts                # Express 미들웨어 등록 순서 정의
index.ts              # 서버 진입점
```

### 프론트엔드 구조 (`frontend/src/`)

```
contexts/AuthContext.tsx   # 전역 로그인 상태 (useAuth 훅)
components/                # 공통 UI 컴포넌트
pages/                     # 화면별 페이지 컴포넌트
lib/api.ts                 # axios 인스턴스 (baseURL, credentials 설정)
lib/apiService.ts          # 화면별 API 호출 함수 모음
App.tsx                    # React Router 라우팅 + 권한 보호
```

### 권한 체계

| 역할 | 권한 |
|------|------|
| `ad_team` | 요청 등록/조회/결과 확인 |
| `tech_team` | 요청 검토/승인/반려/복사 실행 |
| `admin` | 채널 매핑, 사용자 관리, 감사 로그, 통계, 위 모든 것 |

`/admin/*` 라우트는 admin만 접근 가능. 프론트(`App.tsx` `RequireAdmin`)와 백엔드(`auth.middleware.ts`) 양쪽에서 검사.

---

## 핵심 기술 사항

### DB 마이그레이션

`backend/src/config/migrations/` 에 `NNN_설명.sql` 파일 추가 → 서버 기동 시 자동 실행.
`schema_migrations` 테이블로 이력 관리 (중복 실행 방지). 실패 시 서버 기동 중단.

현재 적용된 마이그레이션: 001~011 (010: 레거시 KST 타임스탬프 → UTC ISO 정규화, `requests_old` FK 복구 / 011: 사용자 권한 추가)

### 표준 API 응답 포맷

```json
{ "success": true, "data": {}, "message": "", "errorCode": "", "timestamp": "", "requestId": "" }
```

모든 응답은 `backend/src/common/response.ts`의 헬퍼 함수로 생성한다.

### 파일명 매칭 알고리즘

파일명 패턴: `{채널}_{YYYYMMDD}_{HHMMSS}_{HHMM}.avi`
- 마지막 `{HHMM}`은 **종료 시각** (길이가 아님)
- 자정 넘김: 종료 HH < 시작 HH → 종료 날짜 +1일 처리 필수
- 매칭 점수 0~100점: `file-matcher.ts`의 순수 함수로 계산
- 상세 알고리즘: `.claude/docs/file-matching-spec.md`

### 채널 매핑

Logger Storage 파일 경로의 채널명과 화면 표시 채널명이 다르다.
`channels` 테이블에서 관리. 하드코딩 금지.
(예: CNBC→비즈, ESPN→스포츠, ETV→라이프, GOLF→골프, NICK→골프2, FIL→퍼니, PLUS→플러스)

### 스토리지 접근

앱은 스토리지를 자동 마운트하지 않는다. 운영자가 macOS Finder 또는 터미널에서 수동 마운트.
코드는 `env.LOGGER_STORAGE_MOUNT` 경로의 존재 여부만 확인한다.
SMB 자격증명은 macOS Keychain에만 저장 (코드/파일에 없음).

복사 목적지는 2026-04-03 재설계 이후 **서버 로컬 스토리지**로 전환됐다.
- `env.LOCAL_DELIVERY_PATH` (기본: `backend/data/delivery`) — 1일 후 자동 삭제
- 완료 파일은 `/api/requests/:id/items/:itemId/download` 로 웹 다운로드
- `env.SHARED_NAS_MOUNT` / `storage-cleanup.router.ts`는 하위 호환용으로 코드에 잔존

### 정적 프론트엔드 서빙 / Electron 패키징

`FRONTEND_DIST_PATH`가 설정된 환경에서는 백엔드가 프론트엔드 빌드 결과물(`frontend/dist`)을 정적 파일로 직접 서빙한다.
앱 DB 경로: `~/Library/Application Support/AdCheck/data/adcheck.db`
로그 경로: `~/Library/Application Support/AdCheck/logs/`
세션 시크릿은 Electron 메인 프로세스가 최초 실행 시 userData 아래에 설치별 랜덤 값으로 생성/보관하며, 운영 백엔드는 기본값으로 기동하면 안 된다.
현재 `scripts/create-app.sh`가 만드는 운영용 `.app`은 프로젝트 경로와 `pnpm dev`에 의존하지 않는 자체 실행형 번들이다. 내부에 Node 런타임, `backend/dist`, `frontend/dist`, backend 런타임 의존성이 함께 포함된다.

### 날짜/시간 주의사항

DB 타임스탬프는 UTC ISO 형식(`new Date().toISOString()`)으로 저장한다.
`migration 010`으로 레거시 KST 문자열이 UTC로 정규화되었다.
날짜 필터/화면 표시 구현 시 반드시 `common/datetime.ts`의 KST 공용 유틸을 사용한다.
직접 `new Date()` 비교로 날짜 필터를 구현하면 최대 9시간 오차가 발생한다.

---

## 공통 개발 원칙

### 1. 확장성 우선
- 처음부터 모든 기능을 넣지 않는다.
- 나중에 기능을 붙이기 쉬운 구조로 만든다.

### 2. 모듈화 우선
- 기능별로 쪼개고, 공통 요소는 재사용 가능하게 만든다.
- 한 파일, 한 함수, 한 테이블에 책임을 과도하게 몰지 않는다.

### 3. 유지보수성 우선
- "내가 6개월 뒤 다시 봐도 이해되는가"
- "다른 사람이 인수인계 받아도 수정 가능한가"

### 4. 한글 주석 필수
- 왜 필요한 코드인지, 어떤 흐름인지, 어디를 수정해야 하는지, 주의할 점을 한글로 명확히 남긴다.

### 5. 오류는 숨기지 않음
- 에러 발생 시 원인 추정 → 영향 범위 → 수정 방법 → 재발 방지책까지 단계별로 드러낸다.

### 6. 문서화는 개발의 일부
- 코드만 남기지 않고, 이해 가능한 설명도 함께 남긴다.

### 7. 방송/미디어 환경 우선 고려
- 파일 크기, 작업 이력, 상태 추적, 권한, 보안, 운영 안정성, 장애 대응을 우선 고려한다.

---

### 다음 예정 기능

- `system_settings` 테이블 기반 feature flag 도입 후 광고 구간 자동 컷팅(clip extraction) 기능 착수 예정
- 설계 문서: `.claude/docs/clip-extraction-design.md`, `.claude/docs/clip-extraction-implementation-plan.md`
- 마운트 제어 UI/API, 시스템 설정 UI/API는 현재 미구현 상태

### 완료된 운영 재설계 (2026-04-03)

- 복사 목적지: 공유 NAS → 서버 로컬 스토리지 (`LOCAL_DELIVERY_PATH`)
- 웹 다운로드: `GET /api/requests/:id/items/:itemId/download`
- 1일 자동 정리: `delivery-cleanup.service.ts` (1시간 간격 스케줄러, `index.ts` 기동 시 등록)
- Excel 내보내기: `GET /api/requests/export-excel` (요청 목록 CSV 다운로드)
- 화면 역할 표시명: ad_team → "채널 담당자", tech_team → "대표 담당자" (role 코드는 변경 없음)

---

## 작업 문서화 규칙

- **모든 작업 시작 전**: `.claude/docs/project-status.md` 읽기
- **모든 작업 완료 후**: `project-status.md`에 완료 내용 업데이트
- 오픈 버그·리스크 기준: `.claude/docs/comprehensive-audit-roadmap-20260324.md`
- 대화 초기화 후에도 `project-status.md` 기준으로 작업 맥락 복원
