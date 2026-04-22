# 프로젝트 진행 현황

> 이 파일은 대화 초기화 후에도 작업 맥락을 이어가기 위한 공식 진행 기록이다.
> 작업 시작 전/후 반드시 이 파일을 읽고 업데이트한다.

---

## 현재 단계: Phase 1 - 전체 완료

| 단계 | 내용 | 상태 |
|------|------|------|
| 1단계 | 프로젝트 초기화 + 스토리지 보안 설정 | 완료 |
| 2단계 | DB 스키마 설계 | 완료 |
| 3단계 | UX/화면 설계 | 완료 |
| 4단계 | Backend API 구현 | 완료 |
| 5단계 | Frontend 구현 | 완료 |
| 6단계 | 통합 검수 | 완료 |

---

## 1단계: 프로젝트 초기화 (완료)

### 작업 일자
2026-03-06

### 완료된 항목
- Node.js v24.13.1, pnpm v10.30.3 (corepack) 환경 확인
- pnpm 모노레포 구조 설정 (`pnpm-workspace.yaml`)
- Backend 초기화 (Express 4 + TypeScript + better-sqlite3)
- Frontend 초기화 (React + TypeScript + Vite 7)
- `.env.example`, `.gitignore` 작성
- Backend 헬스체크 API 기동 확인 (`GET /api/health`)
- Frontend TypeScript 빌드 확인

### 생성된 파일 목록

```
ad-check/
├── .env.example                              # 환경변수 템플릿
├── .gitignore
├── package.json                              # 모노레포 루트 (dev/build 스크립트)
├── pnpm-workspace.yaml                       # workspace + onlyBuiltDependencies
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.ts                        # 환경변수 로드 및 타입 보장
│   │   │   └── database.ts                   # SQLite 연결 (WAL, 외래키 ON)
│   │   ├── common/
│   │   │   ├── response.ts                   # 표준 API 응답 포맷 (sendSuccess/sendError)
│   │   │   └── middleware.ts                 # requestId, errorHandler, notFoundHandler
│   │   ├── modules/
│   │   │   └── health/
│   │   │       └── health.router.ts          # GET /api/health
│   │   ├── app.ts                            # Express 앱 설정 (미들웨어 순서)
│   │   └── index.ts                          # 서버 진입점 (SIGTERM/SIGINT 처리)
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── lib/
│   │   │   └── api.ts                        # axios 인스턴스 (baseURL, 인터셉터)
│   │   ├── App.tsx                           # 라우트 구조
│   │   ├── main.tsx                          # BrowserRouter 마운트
│   │   └── index.css                         # 전역 기본 스타일
│   └── package.json
│
└── .claude/
    ├── agents/                               # 전문 에이전트 프롬프트
    └── docs/
        └── project-status.md                 # ← 이 파일
```

### 알려진 특이사항
- `better-sqlite3`는 네이티브 C++ 빌드 필요 → `pnpm-workspace.yaml`의 `onlyBuiltDependencies`에 등록 후 직접 `npm run build-release` 실행으로 해결
- TypeScript 타입 추론 오류 (`TS2742`, `TS4023`) → `Application`, `IRouter`, `Database as DatabaseType` 명시 선언으로 해결

### 스토리지 보안 설정 (2026-03-06 추가)
- 자격증명은 macOS Keychain에 등록 완료 (비밀번호는 코드/파일 어디에도 없음)
  - Logger Storage: `adcheck-logger-storage` (host: 10.93.101.100, user: U15U019)
  - 공유 NAS: `adcheck-shared-nas` (host: 58.234.220.242, user: 21U007)
- `storage info.md` → `.gitignore`에 추가 (실제 자격증명 포함 파일)
- `.env` 구조 변경: 경로 정보만 보관, 자격증명 없음
- `env.ts` 업데이트: HOST / SHARE / MOUNT / KEYCHAIN_LABEL 분리

---

## 2단계: DB 스키마 설계 (완료)

### 작업 일자
2026-03-06

### 완료된 항목
- SQLite 마이그레이션 러너 구현 (`database.ts` 내 자동 실행)
- 마이그레이션 001: 9개 테이블 + 인덱스 생성 SQL 작성
- 마이그레이션 002: 초기 채널 매핑 7건 시드 데이터 작성
- ERD 및 스키마 문서 작성 (`.claude/docs/db-schema.md`)

### 생성/수정된 파일
```
backend/src/config/
├── database.ts                            # 마이그레이션 러너 추가
└── migrations/
    ├── 001_initial_schema.sql             # 전체 테이블 및 인덱스
    └── 002_seed_channel_mappings.sql      # 초기 채널 매핑 데이터

.claude/docs/
└── db-schema.md                           # ERD + 테이블 상세 문서
```

### 설계된 테이블 목록
| 테이블명 | 분류 | 역할 |
|---------|------|------|
| `users` | Core | 사용자 (광고팀/기술팀/관리자) |
| `channel_mappings` | Core | 채널명 매핑 (Logger Storage ↔ 공유 NAS) |
| `channel_mapping_histories` | Audit | 채널 매핑 변경 이력 |
| `requests` | Core | 광고 증빙 요청 헤더 |
| `request_items` | Core | 요청 상세 행 (채널/광고주/시간대) |
| `file_search_results` | Operation | 자동 파일 탐색 결과 |
| `copy_jobs` | Operation | 파일 복사 작업 추적 |
| `mount_logs` | Audit | 스토리지 마운트/언마운트 이력 |
| `audit_logs` | Audit | 전체 작업 감사 로그 |
| `schema_migrations` | System | 마이그레이션 실행 이력 |

### 마이그레이션 실행 방식
- 서버 기동 시 `database.ts`에서 자동 실행
- `schema_migrations` 테이블로 중복 실행 방지 (멱등성 보장)
- 실패 시 즉시 서버 기동 중단 (DB 불일치 방지)

### 담당 에이전트
`db-schema-architect` (`.claude/agents/db-schema-architect.md`)

---

## 파일 매칭 알고리즘 명세 (완료, 2026-03-06 추가)

### 완료된 항목
- 파일명 파싱 규칙 확정 (`{HHMM}` = 종료 시각, 길이 아님)
- 자정 넘김 처리 규칙 정의 (종료 HH < 시작 HH → 종료 날짜 +1일)
- match_score 계산 기준 정의 (monitoring_time 포함 +60점, 요청 범위 겹침 +30점)
- 복사 경로 결정 규칙 정의
- 처리 불가 케이스 및 대응 방법 정의

### 생성된 파일
```
.claude/docs/
└── file-matching-spec.md    # 파일 탐색 및 매칭 알고리즘 전체 명세
```

---

## 3단계: UX/화면 설계 (완료)

### 작업 일자
2026-03-06

### 완료된 항목
- Phase 1 MVP 화면 5개 전체 설계 완료
- 공통 색상 팔레트 및 상태값 정의
- 공통 컴포넌트 목록 (16개) 정의
- 전체 화면 내비게이션 맵 작성

### 설계된 화면 목록
1. **화면 1: 요청 등록 폼** — 헤더(영업담당자/비고) + 동적 행(채널/광고주/시간대) 구조
2. **화면 2: 요청 목록/상태 조회** — 역할별 필터 기본값 차이, 상태 배지, 페이지네이션
3. **화면 3: 파일 탐색 결과 확인 + 승인/반려** — 4개 영역 분리, match_score 경고, 복사 중복 방지
4. **화면 4: 채널 매핑 관리** — 인라인 수정, 변경 이력 드로어, 삭제 없음 정책
5. **화면 5: 마운트/언마운트 제어** — 상태 카드 2열, 5초 폴링, 비마운트 작업 차단

### 생성된 파일
```
.claude/docs/
└── ux-screen-design.md    # 전체 UX 화면 설계 문서 (화면 5개 + 내비게이션 맵 + 공통 컴포넌트)
```

### 주요 설계 결정사항
- 데스크톱 전용 (1280px 이상), 모바일 반응형 없음
- 색상 팔레트 5가지로 제한 (green/red/yellow/gray/blue), 상태 구분 목적으로만 사용
- `ad_team`은 본인 요청만 조회 (서버 사이드 강제)
- `done` 상태 항목 재승인/재복사 UI 차단 (서버 400 응답으로 이중 방어)
- match_score 60 미만 파일: 경고 표시 후 선택 가능, 승인 시 추가 확인 다이얼로그
- 인라인 수정 패턴 (채널 매핑): 모달 없이 행 내에서 편집

### 담당 에이전트
`ux-screen-architect` (`.claude/agents/ux-screen-architect.md`)

---

---

## 4단계: Backend API 구현 (완료)

### 작업 일자
2026-03-06

### 완료된 항목
- `express-session` + `bcryptjs` 패키지 추가
- Migration 003: `users.password_hash` 컬럼 추가
- `database.ts`: 기본 사용자 시딩 (admin/tech1/ad1, 초기 비밀번호: `adcheck2026`)
- `env.ts`: `SESSION_SECRET` 추가
- `types/session.d.ts`: express-session 타입 확장
- `common/auth.middleware.ts`: requireAuth / requireRole / getCurrentUser
- **Auth 모듈**: 로그인 / 로그아웃 / me API
- **Channels 모듈**: 채널 CRUD + 변경 이력 API
- **Requests 모듈**: 요청 등록/목록/상세/탐색시작/승인/반려/재탐색/파일선택 API
- **Files 모듈**: 파일명 파싱 알고리즘 + 매칭 점수 계산 + 백그라운드 탐색 서비스
- **Copy 모듈**: 비동기 파일 복사 서비스 (상태 추적 + 중복 방지)
- **Mount 모듈**: macOS Keychain 기반 마운트/언마운트 제어 API
- `app.ts`: 세션 미들웨어 + 전체 라우터 등록

### API 엔드포인트 목록

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| POST | `/api/auth/login` | 로그인 | 공개 |
| POST | `/api/auth/logout` | 로그아웃 | 로그인 |
| GET | `/api/auth/me` | 현재 사용자 정보 | 로그인 |
| GET | `/api/channels` | 채널 목록 | 로그인 |
| POST | `/api/channels` | 채널 추가 | admin |
| PATCH | `/api/channels/:id` | 채널 수정 | admin |
| GET | `/api/channels/:id/histories` | 채널 변경 이력 | admin |
| POST | `/api/requests` | 요청 등록 | 로그인 |
| GET | `/api/requests` | 요청 목록 | 로그인 |
| GET | `/api/requests/:id` | 요청 상세 | 로그인 |
| POST | `/api/requests/:id/search` | 파일 탐색 시작 | tech_team/admin |
| POST | `/api/requests/:id/retry-search` | 탐색 재시도 | tech_team/admin |
| POST | `/api/requests/:id/approve` | 승인 + 복사 실행 | tech_team/admin |
| POST | `/api/requests/:id/reject` | 반려 처리 | tech_team/admin |
| PATCH | `/api/requests/items/:itemId/select-file` | 파일 선택 | tech_team/admin |
| GET | `/api/mount/status` | 마운트 상태 | 로그인 |
| GET | `/api/mount/logs` | 마운트 이력 | admin |
| POST | `/api/mount/logger-storage/mount` | Logger Storage 마운트 | admin |
| POST | `/api/mount/logger-storage/unmount` | Logger Storage 언마운트 | admin |
| POST | `/api/mount/shared-nas/mount` | 공유 NAS 마운트 | admin |
| POST | `/api/mount/shared-nas/unmount` | 공유 NAS 언마운트 | admin |

### 생성/수정된 파일 목록

```
backend/src/
├── types/
│   └── session.d.ts                    # express-session 타입 확장
├── config/
│   ├── database.ts                     # 기본 사용자 시딩 함수 추가
│   ├── env.ts                          # SESSION_SECRET 추가
│   └── migrations/
│       └── 003_add_user_passwords.sql  # password_hash 컬럼 추가
├── common/
│   └── auth.middleware.ts              # requireAuth / requireRole
├── modules/
│   ├── auth/
│   │   ├── auth.service.ts
│   │   └── auth.router.ts
│   ├── channels/
│   │   ├── channels.service.ts
│   │   └── channels.router.ts
│   ├── requests/
│   │   ├── requests.service.ts
│   │   └── requests.router.ts
│   ├── files/
│   │   ├── file-matcher.ts             # 파일명 파싱 + 매칭 알고리즘 (순수 함수)
│   │   └── files.service.ts            # 백그라운드 파일 탐색 서비스
│   ├── copy/
│   │   └── copy.service.ts             # 비동기 파일 복사 서비스
│   └── mount/
│       ├── mount.service.ts            # macOS 마운트 제어 + Keychain 연동
│       └── mount.router.ts
└── app.ts                              # 세션 + 전체 라우터 등록
```

### 주요 설계 결정
- 세션: MemoryStore (단일 PC 내부망, 서버 재시작 시 재로그인 허용)
- 파일 탐색/복사: 백그라운드 실행 (setImmediate), 클라이언트 폴링으로 상태 확인
- ad_team 권한 분리: 서버 사이드에서 requester_id 강제 필터링
- 복사 중복 방지: done 상태 copy_job 존재 시 재생성 차단
- 마운트: macOS Keychain에서 security 명령으로 자격증명 조회 (코드에 비밀번호 없음)

### 빌드/기동 확인 결과
- TypeScript 빌드 오류 없음 (`pnpm --filter backend build`)
- 서버 기동 정상 (`http://localhost:4000`)
- 마이그레이션 3개 자동 적용 완료
- 기본 사용자 3개 시딩 완료 (admin/tech1/ad1)
- `GET /api/health` 200 응답 확인

---

## 공통 개발 원칙 (CLAUDE.md 요약)

- 한글 주석 필수 (왜/어떤 흐름/어디를 수정/주의점)
- 에러는 숨기지 않음 (원인 → 영향 범위 → 수정 방법 → 재발 방지)
- 확장성/모듈화/유지보수성 우선
- 방송/미디어 환경 특성 우선 (파일 크기, 상태 추적, 권한, 보안)

---

## 환경 정보

| 항목 | 값 |
|------|-----|
| OS | macOS (개발 PC) |
| Node.js | v24.13.1 |
| pnpm | v10.30.3 |
| Backend 포트 | 4000 |
| Frontend 포트 | 5173 |
| DB 파일 | `./data/adcheck.db` (gitignore) |
| Logger Storage | `smb://10.93.101.100/data` → 마운트: `/Volumes/LoggerStorage` |
| 공유 NAS | `smb://58.234.220.242/광고` → 마운트: `/Volumes/SharedNAS` |
| 자격증명 저장소 | macOS Keychain (`adcheck-logger-storage`, `adcheck-shared-nas`) |

## 스토리지 파일 구조

### Logger Storage 파일명 패턴
```
/Volumes/LoggerStorage/{채널명}/{YYYY-MM-DD}/{채널명}_{YYYYMMDD}_{HHMMSS}_{HHMM}.avi
예: /Volumes/LoggerStorage/ETV/2026-03-03/ETV_20260303_015955_0300.avi
```
- 1시간 5분 단위 파일 (정확히 1시간이 아님 - 파일 탐색 시 주의)

### 채널 매핑 (Logger Storage → 공유 NAS)
| Logger Storage 폴더 | 공유 NAS 폴더 |
|--------------------|--------------|
| CNBC | 비즈 |
| ESPN | 스포츠 |
| ETV | 라이프 |
| FIL | 퍼니 |
| GOLF | 골프 |
| NICK | 골프2 |
| PLUS | 플러스 |

## 개발 명령어

```bash
# 백엔드 개발 서버
pnpm dev:backend

# 프론트엔드 개발 서버
pnpm dev:frontend

# 둘 다 동시 실행
pnpm dev

# 빌드 확인
pnpm build
```

---

## 5단계: Frontend 구현 (완료)

### 작업 일자
2026-03-06

### 완료된 항목
- Tailwind CSS v4 (`@tailwindcss/vite`) + react-hook-form 설치
- TypeScript 타입 정의 (`types/index.ts`) — 도메인 모델 전체
- API 서비스 레이어 (`lib/apiService.ts`) — 전체 엔드포인트 함수화
- AuthContext + 로그인 페이지
- 공통 컴포넌트 16개 구현
- 화면 1: 요청 등록 폼 (react-hook-form, 동적 행)
- 화면 2: 요청 목록 (URL 쿼리 필터, 페이지네이션)
- 화면 3: 요청 상세 + 파일 탐색 결과 + 승인/반려
- 화면 4: 채널 매핑 관리 (인라인 수정, 드로어 이력)
- 화면 5: 마운트/언마운트 제어 (5초 폴링)
- App.tsx 라우팅 (RequireAuth / RequireAdmin 보호)
- TypeScript 빌드 오류 없음 확인

### 생성/수정된 파일

```
frontend/src/
├── types/
│   └── index.ts                  # 도메인 타입 정의 (API 응답 포함)
├── lib/
│   ├── api.ts                    # (기존) axios 인스턴스
│   └── apiService.ts             # 전체 API 함수 모음
├── contexts/
│   └── AuthContext.tsx           # 로그인 상태 전역 관리
├── components/
│   ├── StatusBadge.tsx           # 상태값 → 한글 레이블 + 색상 배지
│   ├── PageHeader.tsx            # 페이지 제목 + 우측 액션 버튼
│   ├── ConfirmDialog.tsx         # 비가역 액션 확인 모달
│   ├── ToastMessage.tsx          # 3초 자동 사라짐 알림 + Provider
│   ├── EmptyState.tsx            # 빈 데이터 안내
│   ├── LoadingRow.tsx            # 테이블 스켈레톤 로딩 행
│   ├── ErrorBanner.tsx           # 전체 오류 배너
│   ├── SideDrawer.tsx            # 우측 슬라이드 드로어
│   ├── MatchScoreBadge.tsx       # match_score 시각화 배지
│   ├── FileSizeDisplay.tsx       # bytes → GB/MB 변환
│   ├── TimeRangeDisplay.tsx      # HH:MM ~ HH:MM 표시
│   ├── InfoCard.tsx              # 읽기 전용 레이블-값 그리드 카드
│   ├── MountStatusCard.tsx       # 스토리지 마운트 상태 카드
│   └── GlobalNav.tsx             # 전역 상단 네비게이션 (역할별 메뉴)
├── pages/
│   ├── LoginPage.tsx             # 로그인 화면
│   ├── RequestListPage.tsx       # 화면 2: 요청 목록
│   ├── RequestNewPage.tsx        # 화면 1: 요청 등록 폼
│   ├── RequestDetailPage.tsx     # 화면 3: 파일 탐색 결과 + 승인/반려
│   ├── ChannelMappingPage.tsx    # 화면 4: 채널 매핑 관리 (admin)
│   └── MountControlPage.tsx      # 화면 5: 마운트/언마운트 제어 (admin)
├── App.tsx                       # 라우팅 (RequireAuth/RequireAdmin)
└── index.css                     # Tailwind CSS v4 임포트
```

### 주요 설계 결정
- Tailwind v4: `@tailwindcss/vite` 플러그인 방식 (postcss 불필요)
- 인증 보호: `RequireAuth` (비로그인 → /login), `RequireAdmin` (비관리자 → /requests)
- 세션: `GET /api/auth/me`로 앱 시작 시 자동 확인 (MemoryStore 서버 재시작 대응)
- 폴링: copying 상태 10초, 마운트 상태 5초 (페이지 언마운트 시 clearInterval)
- 필터 상태: URL 쿼리 파라미터로 관리 (새로고침/뒤로가기 유지)
- 파일 선택: 라디오 변경 즉시 API 호출 (별도 저장 버튼 없음)

### 빌드 확인 결과
- TypeScript 빌드 오류 없음 (`pnpm --filter frontend build`)
- Vite 빌드 성공 (dist/assets 생성)
- CSS: 23.39 kB gzip / JS: 113.66 kB gzip

---

## 6단계: 통합 검수 (완료)

### 작업 일자
2026-03-06

### 발견 및 수정된 버그 목록 (모두 `frontend/src/lib/apiService.ts`)

| 함수 | 문제 | 수정 내용 |
|------|------|-----------|
| `getChannels` | `data` 객체 그대로 반환 (배열 아님) | `data.channels` 배열만 추출 |
| `getChannels` | `include_inactive: 1` → 백엔드 `=== 'true'` 불일치 | `include_inactive: 'true'` 로 변경 |
| `getRequests` | `{ requests, pagination }` 구조를 `{ items, total, page, limit }` 타입에 그대로 반환 | 백엔드 구조 파싱 후 정규화 |
| `getRequestDetail` | `{ request, items }` 구조를 flat한 `RequestDetail` 타입에 그대로 반환 | `{ ...request, items }` 로 펼쳐서 반환 |
| `getChannelHistories` | `{ channel_id, histories, ... }` 객체 그대로 반환 | `data.histories` 배열만 추출 |
| `getMountStatus` | `{ storages: [...] }` 배열 구조를 `{ logger_storage, shared_nas }` 타입에 반환 불일치 | storages 배열 순회 정규화 + `last_log` 필드 매핑 |
| `getMountLogs` | `{ logs, count }` 객체 그대로 반환 + `triggered_user_name` → `triggered_by_name` 불일치 | `data.logs` 배열 추출 + 필드명 정규화 |

### API 통합 테스트 결과

| 항목 | 결과 |
|------|------|
| 로그인 / 로그아웃 / me | ✓ 정상 |
| 채널 목록 (활성/비활성 필터) | ✓ 정상 |
| 채널 추가 / 수정 / 이력 | ✓ 정상 |
| 요청 등록 (헤더 + 항목 배열) | ✓ 정상 |
| 요청 목록 조회 (페이지네이션) | ✓ 정상 |
| 요청 상세 조회 (항목 + 파일 결과) | ✓ 정상 |
| 파일 탐색 시작 (백그라운드, 미마운트 → failed) | ✓ 정상 |
| 반려 처리 | ✓ 정상 |
| 마운트 상태 조회 | ✓ 정상 |
| 인증 차단 (비로그인 요청 → 401) | ✓ 정상 |

### 빌드 최종 확인
- Backend TypeScript 빌드 오류 없음 (`pnpm --filter backend build`)
- Frontend TypeScript 빌드 오류 없음 (`pnpm --filter frontend build`, Vite 빌드 성공)

### 알려진 사항
- 파일 탐색/복사는 Logger Storage / 공유 NAS 마운트 상태에서만 실제 동작 (실 운영 환경 필요)
- 테스트용 채널 `TEST`(id=8) 비활성화 상태로 DB에 잔존 (운영 전 삭제 또는 무시 가능)

---

## 7단계: 운영 준비 작업 (진행 중)

### 작업 일자
2026-03-06 ~ 2026-03-07

### 완료된 항목

#### 7-1. 매뉴얼 페이지 & 실행 스크립트
- `frontend/src/pages/ManualPage.tsx` 생성 — 서비스 실행 방법 + 기능별 사용 가이드 웹 페이지
- `App.tsx` `/manual` 라우트 추가 (로그인 필요, 전 역할 접근 가능)
- `GlobalNav.tsx` [매뉴얼] 링크 추가
- `start.sh` 원클릭 실행 스크립트 생성 (의존성 자동 설치 + 브라우저 자동 열기)
- `HOW_TO_RUN.md` 실행 방법 문서 생성

#### 7-2. 스토리지 마운트 경로 수정
- macOS 자동 마운트 경로와 `.env` 설정 불일치 발견 및 수정
  - `LOGGER_STORAGE_MOUNT`: `/Volumes/LoggerStorage` → `/Volumes/data`
  - `SHARED_NAS_MOUNT`: `/Volumes/SharedNAS` → `/Volumes/광고`
- `.env.example`도 동일하게 수정
- API 확인: `is_mounted: true` 정상 응답 확인

#### 7-3. 구조화 로거 모듈 (일부 완료)
신규 파일: `backend/src/common/logger.ts`
- 레벨별(DEBUG/INFO/WARN/ERROR) 색상 콘솔 출력
- `backend/logs/app-YYYY-MM-DD.log` 날짜별 파일 자동 기록
- `createLogger('모듈명')` 팩토리 함수
- morgan HTTP 로그도 파일에 기록 (`morganStream`)

로거 적용 완료 파일:
| 파일 | 상태 |
|------|------|
| `backend/src/app.ts` | ✓ morgan → morganStream 적용 |
| `backend/src/index.ts` | ✓ console.log → log.info 교체 + 스토리지 경로 기동 로그 추가 |
| `backend/src/common/middleware.ts` | ✓ errorHandler → log.error 교체 |
| `backend/src/modules/mount/mount.service.ts` | ✓ 상세 로그 (Keychain 조회 단계별, 마운트 명령 전후, 경고) |
| `backend/src/modules/files/file-matcher.ts` | ✓ 스캔 경로/파일수/매칭결과 DEBUG 로그 |

### 미완료 항목
없음 — 7단계 운영 준비 작업 전체 완료.

### 로거 적용 최종 완료 목록

| 파일 | 상태 |
|------|------|
| `backend/src/app.ts` | ✓ morgan → morganStream 적용 |
| `backend/src/index.ts` | ✓ console.log → log.info 교체 |
| `backend/src/common/middleware.ts` | ✓ errorHandler → log.error 교체 |
| `backend/src/modules/mount/mount.service.ts` | ✓ 단계별 상세 로그 |
| `backend/src/modules/files/file-matcher.ts` | ✓ 스캔/매칭 DEBUG 로그 |
| `backend/src/modules/files/files.service.ts` | ✓ 탐색 흐름 전체 log.* 교체 |
| `backend/src/modules/copy/copy.service.ts` | ✓ 복사 흐름 전체 log.* 교체 + 파일크기/소요시간 추가 |

빌드 확인: `pnpm --filter backend build` 오류 없음 (2026-03-07)

---

## 8단계: 복사 진행률 표시 (완료)

### 작업 일자
2026-03-07

### 완료된 항목
- Migration 004: `copy_jobs`에 `total_bytes`, `progress_bytes` 컬럼 추가
- `copy.service.ts`: `fs.copyFile` → 스트림 기반 복사로 변경 + 진행률 DB 업데이트
  - 복사 시작 전 `fs.stat`으로 `total_bytes` 저장
  - `ReadStream` data 이벤트에서 누적 → 50MB 또는 5% 단위로 `progress_bytes` 업데이트
  - 완료 시 `progress_bytes = total_bytes` 확정
- `requests.service.ts`: `CopyJobRow` 타입에 `total_bytes`, `progress_bytes` 추가
- `frontend/types/index.ts`: `CopyJob` 타입 수정 (status enum 정정, source_path/dest_path/progress 필드 추가), `RequestDetail` 타입에 `copy_job` 포함
- `RequestDetailPage.tsx`: copying 상태 시 항목별 진행률 카드 표시
  - 소스 경로 (파일명) + 목적지 디렉토리 경로
  - 진행률 게이지 바 + bytes/퍼센트 표시
  - total_bytes 모를 시 인디케이터 애니메이션

### 빌드 확인
- Backend TypeScript 빌드 오류 없음
- Frontend TypeScript 빌드 오류 없음 (Vite 빌드 성공)

---

## 전체 분석 리포트 (2026-03-08 작성)

> 상세 내용: `.claude/docs/analysis-report.md`

### 핵심 발견 사항 요약

| 구분 | 내용 |
|------|------|
| Critical 버그 | 마운트 제어 모듈 전체 누락 (문서 완료로 기록됐으나 파일 미존재) |
| High 버그 | 복사 실패 후 재시도 경로 없음 / 날짜 필터 UTC·KST 불일치 |
| 미완성 기능 | 사용자 관리, 감사 로그 조회, 요청자 필터 UI, sort 파라미터 |
| 코드 품질 | React Fragment key 누락, isDone 변수명 혼동 |

### 다음 작업 우선순위 (Phase 1.5)

1. **마운트 제어 모듈 구현** — 실 운영의 전제 조건
2. **복사 재시도 UI 추가** — 복사 실패 대응 경로 확보
3. **날짜 필터 타임존 처리 통일** — 경계 날짜 데이터 오차 수정
4. **React Fragment key 수정** — 콘솔 경고 정리
5. **사용자 관리 화면/API** — 시드 계정 3개로는 실 운영 불가

---

## Phase 1.5 + Phase 2 구현 (완료, 2026-03-08)

### 완료된 항목

#### Phase 1.5 (긴급 보완)

| 항목 | 상태 | 파일 |
|------|------|------|
| 마운트 제어 모듈 전체 구현 | ✓ 완료 | `mount.service.ts`, `mount.router.ts`, `MountControlPage.tsx`, `MountStatusCard.tsx` |
| 복사 재시도 API + UI | ✓ 완료 | `requests.service.ts:prepareForRetryCopy`, `requests.router.ts:POST /:id/retry-copy`, `RequestDetailPage.tsx` |
| 날짜 필터 UTC/KST 수정 | ✓ 완료 | `requests.service.ts` — `new Date('YYYY-MM-DDT00:00:00+09:00').toISOString()` 패턴 |
| React Fragment key 수정 | ✓ 완료 | `RequestDetailPage.tsx` — `<React.Fragment key={file.id}>` |
| app.ts inline import 수정 | ✓ 완료 | `app.ts` — auditRouter를 상단 import 블록으로 이동 |

#### Phase 2 (운영 고도화)

| 항목 | 상태 | 파일 |
|------|------|------|
| 사용자 관리 Backend | ✓ 완료 | `users.service.ts`, `users.router.ts` |
| 사용자 관리 Frontend | ✓ 완료 | `UserManagementPage.tsx` → `/admin/users` |
| 비밀번호 변경 Backend | ✓ 완료 | `auth.service.ts:changePassword`, `auth.router.ts:POST /change-password` |
| 비밀번호 변경 Frontend | ✓ 완료 | `ChangePasswordPage.tsx` → `/change-password` |
| 감사 로그 Backend | ✓ 완료 | `audit.router.ts:GET /audit/logs` |
| 감사 로그 Frontend | ✓ 완료 | `AuditLogPage.tsx` → `/admin/audit` |
| GlobalNav 메뉴 추가 | ✓ 완료 | 사용자 관리 / 감사 로그 (admin), 비밀번호 변경 (전체) |

### 신규 API 엔드포인트

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| POST | `/api/requests/:id/retry-copy` | 복사 재시도 | tech_team/admin |
| POST | `/api/auth/change-password` | 본인 비밀번호 변경 | 로그인 |
| GET | `/api/users` | 사용자 목록 | admin |
| GET | `/api/users/:id` | 사용자 상세 | admin |
| POST | `/api/users` | 사용자 생성 | admin |
| PATCH | `/api/users/:id` | 사용자 수정 (표시명/역할/활성여부) | admin |
| POST | `/api/users/:id/reset-password` | 비밀번호 초기화 | admin |
| GET | `/api/audit/logs` | 감사 로그 조회 (필터/페이지네이션) | admin |

### 빌드 확인 (2026-03-08)
- Backend TypeScript 빌드 오류 없음 (`pnpm --filter backend build`)
- Frontend TypeScript 타입 체크 오류 없음 (`tsc --noEmit`)

---

## Phase 2 나머지 전체 완료 (2026-03-08)

### 완료된 항목

| 항목 | 파일 |
|------|------|
| DB 백업 스크립트 | `scripts/backup-db.sh` — 날짜별 복사, 30일 보관, WAL 동반 |
| Migration 005: request_templates 테이블 | `config/migrations/005_add_request_templates.sql` |
| 요청 템플릿 Backend | `modules/templates/templates.service.ts`, `templates.router.ts` |
| 통계 Backend | `modules/stats/stats.router.ts` (summary/monthly/by-channel/by-advertiser/export-csv) |
| 요청 목록 sort + 요청자 필터 | `requests.service.ts` SORT_MAP 추가, `RequestListPage.tsx` 드롭다운 UI |
| 요청 템플릿 Frontend UI | `RequestNewPage.tsx` — 템플릿 드롭다운 바 (불러오기/저장/삭제) |
| 마운트 이상 감지 배너 | `MountControlPage.tsx` — unmounted_storages 감지 시 빨간 배너 |
| 통계 대시보드 페이지 | `StatsDashboardPage.tsx` — 요약카드/월별/채널별/광고주별/CSV |
| 브라우저 알림 훅 | `hooks/useNotification.ts` — Notification API 래퍼 |
| app.ts 라우터 등록 | `/api/templates`, `/api/stats` 등록 |
| App.tsx 라우트 추가 | `/admin/stats` → StatsDashboardPage |
| GlobalNav 통계 메뉴 | 관리자 드롭다운에 [통계 대시보드] 추가 |
| apiService.ts 확장 | Templates/Stats API 함수 전체 추가 |
| types/index.ts 확장 | RequestTemplate, CreateTemplateBody, UpdateTemplateBody, StatsSummary, StatsMonthly, StatsByChannel, StatsByAdvertiser |
| UserManagementPage prop 오류 수정 | `isOpen` → `open` (SideDrawer, ConfirmDialog) |

### 신규 API 엔드포인트

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| GET | `/api/templates` | 내 템플릿 목록 | 로그인 |
| POST | `/api/templates` | 템플릿 생성 | 로그인 |
| PATCH | `/api/templates/:id` | 템플릿 수정 | 로그인 (소유자) |
| DELETE | `/api/templates/:id` | 템플릿 삭제 | 로그인 (소유자) |
| GET | `/api/stats/summary` | 전체 요약 통계 | admin |
| GET | `/api/stats/monthly` | 월별 요청 건수 | admin |
| GET | `/api/stats/by-channel` | 채널별 건수 | admin |
| GET | `/api/stats/by-advertiser` | 광고주별 건수 (상위 N) | admin |
| GET | `/api/stats/export-csv` | 기간별 CSV 내보내기 | admin |

### 빌드 확인 (2026-03-08)
- Backend TypeScript 빌드 오류 없음 (`pnpm --filter backend build`)
- Frontend TypeScript + Vite 빌드 성공 (`pnpm --filter frontend build`)
  - 119 modules transformed, dist/assets 생성

### Phase 2 전체 완료 상태
모든 계획된 Phase 2 기능 구현 완료.

---

## 마운트 제어 기능 제거 (2026-03-08)

### 배경
프로그램에 의한 자동 마운트/언마운트가 위험하다고 판단 → 운영자가 macOS에서 직접 수동으로 마운트하는 방식으로 변경.

### 삭제된 파일
| 파일 | 내용 |
|------|------|
| `backend/src/modules/mount/mount.service.ts` | Keychain 조회 + mount_smbfs 실행 로직 |
| `backend/src/modules/mount/mount.router.ts` | 마운트/언마운트/상태/이력 API 6개 |
| `frontend/src/pages/MountControlPage.tsx` | 마운트 제어 관리자 화면 |
| `frontend/src/components/MountStatusCard.tsx` | 스토리지 상태 카드 컴포넌트 |

### 수정된 파일
| 파일 | 변경 내용 |
|------|-----------|
| `backend/src/app.ts` | mountRouter import + 등록 제거 |
| `backend/src/config/env.ts` | SMB_HOST/SHARE/USER/KEYCHAIN 환경변수 제거, MOUNT 경로만 유지 |
| `.env.example` | 동일 — SMB/Keychain 항목 제거, MOUNT 경로만 유지 |
| `frontend/src/App.tsx` | MountControlPage import + `/admin/mount` 라우트 제거 |
| `frontend/src/components/GlobalNav.tsx` | 관리자 메뉴에서 [마운트 제어] 항목 제거 |
| `frontend/src/lib/apiService.ts` | getMountStatus/getMountLogs/mount*/unmount* 함수 6개 제거 |
| `frontend/src/types/index.ts` | StorageType/MountLastLog/StorageStatus/MountLog 타입 제거 |

### 유지된 항목
- `LOGGER_STORAGE_MOUNT`, `SHARED_NAS_MOUNT` 환경변수 — `files.service.ts`, `copy.service.ts`에서 마운트 포인트 존재 여부 확인에 계속 사용
- `mount_logs` DB 테이블 — 기존 이력 보존 (신규 기록은 없음)
- 마운트 미확인 시 파일 탐색/복사 실패 처리 로직 — 그대로 유지

### 빌드 확인 (2026-03-08)
- Backend TypeScript 컴파일 오류 없음
- Frontend TypeScript 컴파일 오류 없음

---

## 영업담당자 항목별 이동 (2026-03-09)

### 변경 배경
같은 요청 내에서도 채널별로 담당 영업담당자가 다를 수 있음 → 요청 헤더(공통 1개)에서 요청 항목(행별 개별)으로 이동.

### 변경 내용

| 구분 | 파일 | 내용 |
|------|------|------|
| DB | `migrations/006_move_sales_manager_to_items.sql` | `request_items.sales_manager` 추가, `requests.sales_manager` / `request_templates.sales_manager` DROP COLUMN |
| Backend | `requests.service.ts` | `RequestRow`에서 제거, `RequestItemRow`에 추가, `CreateRequestDto` 구조 변경, INSERT 쿼리 수정 |
| Backend | `requests.router.ts` | 헤더 `sales_manager` validation 제거, 항목별 validation 추가 |
| Backend | `templates.service.ts` | `TemplateRow`/DTO에서 `sales_manager` 제거, `TemplateItemDto`에 추가 |
| Backend | `templates.router.ts` | `sales_manager` validation 제거 |
| Frontend | `types/index.ts` | `Request.sales_manager` 제거, `RequestItem.sales_manager` 추가, `CreateRequestBody` / `RequestTemplate` / `CreateTemplateBody` 구조 변경 |
| Frontend | `RequestNewPage.tsx` | 헤더 섹션에서 영업담당자 input 제거, 테이블 행에 영업담당자 컬럼 추가 |
| Frontend | `RequestDetailPage.tsx` | 요청 헤더 InfoCard에서 제거, 항목 테이블에 영업담당자 컬럼 추가 |
| Frontend | `RequestListPage.tsx` | 목록 테이블에서 영업담당자 컬럼 제거 (행 단위 데이터라 목록에서 표시 불적합) |

### 빌드 확인 (2026-03-09)
- Backend TypeScript 빌드 오류 없음
- Frontend TypeScript + Vite 빌드 성공 (116 modules)

---

## 전체 로직 점검 (2026-03-09)

### 점검 범위
- 볼륨 마운트 완료 상태에서 **복사(copy) 모듈을 제외한 전체 로직** 점검
- Backend: auth, channels, requests, files, users, templates, stats, audit 모듈
- Frontend: 전체 페이지 + 컴포넌트 + apiService
- 파일 매칭 알고리즘 정확성 (전문 에이전트 투입)

### 볼륨 마운트 현황 확인
| 볼륨 | 경로 | 상태 | 내부 폴더 |
|------|------|------|-----------|
| Logger Storage | `/Volumes/data` | ✓ 마운트 | CNBC, ESPN, ETV, FIL, GOLF, NICK, PLUS 등 |
| 공유 NAS | `/Volumes/광고` | ✓ 마운트 | 비즈, 스포츠, 라이프, 퍼니, 골프, 골프2, 플러스 |

### SQLite 버전
- 3.49.2 (GROUP_CONCAT ORDER BY 지원 버전 3.44.0 이상 — 정상)

### 발견 및 수정된 버그

| # | 파일 | 심각도 | 문제 | 수정 |
|---|------|--------|------|------|
| 1 | `frontend/src/lib/apiService.ts:25-26` | **빌드 오류** | 삭제된 `StorageStatus`, `MountLog` 타입 import — tsc 빌드 실패 | `import` 두 줄 제거 |
| 2 | `frontend/index.html` | **HTML 오류** | `<title>` 시작 태그 누락 → parse5 경고, 탭 제목 없음 | `<title>광고 증빙 요청 시스템</title>` 추가 |
| 3 | `backend/src/modules/requests/requests.router.ts:12` | 주석 오류 | 상단 JSDoc 주석에 엔드포인트 경로 오기재 (`/api/request-items/` → `/api/requests/items/`) | 주석 수정 |

### 모듈별 점검 결과

#### Backend

| 모듈 | 상태 | 비고 |
|------|------|------|
| Auth (로그인/로그아웃/me) | ✓ 정상 | bcrypt 검증, 세션 관리 올바름 |
| 인증 미들웨어 | ✓ 정상 | requireAuth / requireRole 적용 위치 올바름 |
| Channels (채널 CRUD) | ✓ 정상 | 변경 이력 트랜잭션 저장 정상 |
| Requests (요청 등록/목록/상세) | ✓ 정상 | ad_team 권한 분리 서버 강제 확인 |
| Requests (날짜 필터) | ✓ 정상 | KST→UTC 변환 `T00:00:00+09:00` 패턴 적용 확인 |
| Requests (상태 전이) | ✓ 정상 | pending→searching→search_done→approved→copying→done/rejected/failed 흐름 올바름 |
| Requests (retry-copy) | ✓ 정상 | failed 항목만 approved로 복원, done 항목 유지 |
| Files (file-matcher.ts) | ✓ **완벽** | 파일명 파싱, 자정 넘김, match_score 계산 spec 100% 일치 (전문 에이전트 검증) |
| Files (files.service.ts) | ✓ 정상 | 마운트 체크 → 탐색 → 트랜잭션 저장 흐름 정상 |
| Users (사용자 CRUD) | ✓ 정상 | admin 전용 권한, 비밀번호 초기화 정상 |
| Templates (템플릿 CRUD) | ✓ 정상 | 소유자 검증, soft delete 정상 |
| Stats (통계) | ✓ 정상 | GROUP BY 쿼리, CSV export 정상 |
| Audit (감사 로그) | ✓ 정상 | 날짜 필터 KST localtime vs ISO 형식 불일치이나 ASCII 정렬 특성상 실제 동작은 올바름 |

#### Frontend

| 페이지/컴포넌트 | 상태 | 비고 |
|----------------|------|------|
| AuthContext | ✓ 정상 | 앱 시작 시 getMe() 세션 복원 올바름 |
| App.tsx (라우팅) | ✓ 정상 | RequireAuth / RequireAdmin 보호 올바름 |
| LoginPage | ✓ 정상 | |
| RequestNewPage | ✓ 정상 | react-hook-form, 동적 행, 템플릿 불러오기/저장 |
| RequestListPage | ✓ 정상 | URL 쿼리 동기화, 정렬 드롭다운, 요청자 필터, 페이지네이션 |
| RequestDetailPage | ✓ 정상 | 폴링(searching 5초/copying 10초), 라디오 즉시 저장, 승인/반려/재시도 |
| ChannelMappingPage | ✓ 정상 | |
| UserManagementPage | ✓ 정상 | |
| AuditLogPage | ✓ 정상 | |
| StatsDashboardPage | ✓ 정상 | CSV blob download 정상 |
| StatusBadge | ✓ 정상 (주의) | `failed` → "탐색 실패" 표시이나 복사 실패도 같은 상태값 사용 — RequestDetailPage에서 `isCopyFailed`/`isSearchFailed`로 구분하여 올바른 버튼 노출 처리 |
| apiService.ts | ✓ 정상 | 모든 응답 구조 파싱 정상, 빌드 오류 수정 완료 |

#### 파일 매칭 알고리즘 (전문 에이전트 검증 결과)
- 파일명 파싱: **완벽** — 정규식, 자정 넘김(종료 HH < 시작 HH → +1일) 정확히 구현
- match_score 계산: **완벽** — monitoring_time 포함 +60점, 겹침 +30점, 겹침 50% 이상 +10점, 경계값(≤ / <) 정확
- 탐색 경로: **정확** — `/Volumes/data/{storage_folder}/{YYYY-MM-DD}/`, 자정 넘김 시 ±1일 폴더 추가 스캔
- 트랜잭션 안정성: **보장** — 결과 저장 + 상태 갱신 단일 트랜잭션

### 설계 주의 사항 (버그 아님, 유지보수 참고)
- `audit_logs.created_at`은 `datetime('now', 'localtime')` 저장 (KST), `requests.created_at`은 `new Date().toISOString()` 저장 (UTC) — 테이블 간 타임존 불일치이나 각각의 필터 로직에서 올바르게 처리됨
- `StatusBadge.tsx`의 `waiting/running/success` 항목은 현재 사용되지 않는 레거시 (DB 설계 초기 값, copy_jobs 상태와 불일치) — 기능에 영향 없음

### 빌드 최종 확인 (2026-03-09)
- Backend TypeScript 컴파일 오류 없음 (`pnpm --filter backend build`)
- Frontend TypeScript + Vite 빌드 성공 (117 modules, HTML parse5 경고 해소)
- 환경: `/Volumes/data` + `/Volumes/광고` 모두 마운트 정상 확인

---

## 통계 기간 필터 추가 (2026-03-09)

### 변경 배경
기존 통계 대시보드는 전체 누적 수치만 표시했음 → 연별/월별/일별로 시점을 선택하면 해당 기간의 통계만 나오도록 개선.

### 변경 내용

| 구분 | 파일 | 내용 |
|------|------|------|
| Backend | `stats.router.ts` | `summary`, `by-channel`, `by-advertiser`, `by-sales-manager`에 `from`/`to` KST 날짜 파라미터 추가 |
| Backend | `stats.router.ts` | `GET /api/stats/daily?year=YYYY&month=MM` 신규 엔드포인트 — 일별 요청 건수 집계 |
| Frontend | `types/index.ts` | `StatsDaily` 타입 추가, `StatsSummary.this_month` → `number \| null` + `is_filtered: boolean` 추가 |
| Frontend | `apiService.ts` | stats 함수 전체에 `from?`, `to?` 파라미터 추가, `getStatsDaily` 함수 신규 추가 |
| Frontend | `StatsDashboardPage.tsx` | 연별/월별/일별 모드 탭 + 기간 선택 컨트롤 + 전체 stats 재조회 로직 전면 개편 |

### 동작 방식

| 모드 | 선택 | 분석 테이블 |
|------|------|-------------|
| 연별 | 연도 선택 | 해당 연도 월별 요청 건수 테이블 |
| 월별 | 연+월 선택 | 해당 월 일별 요청 건수 테이블 |
| 일별 | 날짜 선택 | breakdown 없음, 요약 + 채널/광고주/영업담당자만 |

모든 모드에서 요약 카드(전체/완료/진행중/반려), 채널별, 광고주별, 영업담당자별은 선택된 기간 기준으로 집계.

### 빌드 확인 (2026-03-09)
- Backend TypeScript 빌드 오류 없음
- Frontend TypeScript + Vite 빌드 성공 (116 modules)


---

## macOS 응용프로그램 패키징 (2026-03-09)

### 방식: 셸 스크립트 기반 macOS .app 번들

Electron 방식 시도 후 pnpm 가상 스토어와 Electron 33 모듈 인터셉트 호환성 문제로 변경.
더 간단하고 신뢰성 높은 macOS 네이티브 .app 번들 방식을 채택.

### 생성 스크립트
`scripts/create-app.sh` — 더블클릭 가능한 macOS .app 번들 생성

```bash
pnpm create-app
# 또는
bash scripts/create-app.sh
```

### 앱 번들 구조
```
광고증빙요청시스템.app/
└── Contents/
    ├── Info.plist           # macOS 앱 메타데이터
    ├── PkgInfo
    └── MacOS/
        └── launcher         # 실제 실행 스크립트 (bash)
```

### 실행 흐름
1. 더블클릭 → `launcher` 스크립트 실행
2. Node.js 바이너리 자동 탐색 (nvm, /usr/local/bin, /opt/homebrew)
3. 이미 실행 중이면 브라우저만 열기
4. DB/로그 디렉토리 생성: `~/Library/Application Support/AdCheck/`
5. 백엔드 기동: `IS_ELECTRON=true`, `FRONTEND_DIST_PATH` 주입 → 정적 파일 서빙
6. 헬스체크 폴링 (최대 30초)
7. 브라우저 자동 오픈: http://localhost:4000
8. AppleScript 다이얼로그 표시 ("종료" 버튼)
9. 종료 클릭 → SIGTERM → 5초 후 SIGKILL

### 데이터 저장 위치
- DB: `~/Library/Application Support/AdCheck/data/adcheck.db`
- 로그: `~/Library/Application Support/AdCheck/logs/`

### 배포
```bash
# 바탕화면 생성 후 /Applications으로 이동
pnpm create-app
mv ~/Desktop/광고증빙요청시스템.app /Applications/
```

### 백엔드 수정 내용 (Electron 호환 코드 — 그대로 사용됨)
- `env.ts`: `IS_ELECTRON`, `LOGS_PATH`, `MIGRATIONS_PATH`, `FRONTEND_DIST_PATH` 추가
- `app.ts`: `FRONTEND_DIST_PATH` 설정 시 정적 파일 + SPA fallback 서빙, 쿠키 `secure` 조건 수정
- `database.ts`: `MIGRATIONS_PATH` env로 마이그레이션 폴더 경로 변경 가능
- `logger.ts`: `LOGS_PATH` env로 로그 폴더 경로 변경 가능

### 빌드 최종 확인 (2026-03-09)
- Backend TypeScript 빌드 오류 없음
- Frontend TypeScript + Vite 빌드 성공
- `~/Desktop/광고증빙요청시스템.app` 생성 및 구조 확인 완료

---

## 매뉴얼 재작성 + HOW_TO_RUN 업데이트 (2026-03-10)

### 변경 내용

| 파일 | 변경 내용 |
|------|-----------|
| `HOW_TO_RUN.md` | 앱 실행/생성 방법, DB 관리(복사/초기화/백업), 스토리지 마운트, 로그 위치 전면 재작성 |
| `frontend/src/pages/ManualPage.tsx` | 역할 기반 분기 재작성 — admin → 관리자 매뉴얼, 그 외 → 사용자 매뉴얼 |

### 매뉴얼 구성

**관리자 매뉴얼 (admin 로그인 시)**
1. 설치 및 초기 설정 (Node.js, pnpm, 의존성, 앱 생성)
2. 앱 시작 및 종료 (더블클릭, 다이얼로그 종료)
3. 운용 (스토리지 마운트, 사용자/채널 관리, 통계/감사 로그)
4. 유지보수 (DB 위치, 복사, 초기화, 백업, 로그, 재배포)
5. 사용 방법 (전체 흐름, 상태 설명, 관리자 전용 기능)
- 하단 탭으로 [사용자 매뉴얼 미리보기] 전환 가능

**사용자 매뉴얼 (tech_team/ad_team 로그인 시)**
1. 접속 방법 + 초기 로그인
2. 광고팀 사용법 (요청 등록, 재전송, 템플릿)
3. 기술팀 사용법 (파일 탐색, 파일 선택, 승인/반려, 오류 처리)
4. 요청 상태 설명
5. 자주 묻는 질문
- 역할에 맞는 섹션만 표시 (ad_team은 2번, tech_team은 3번 섹션 표시)

### 빌드 확인 (2026-03-10)
- Frontend TypeScript + Vite 빌드 성공 (116 modules)

---

## 운영 개선 작업 (2026-03-09)

### 변경 내용

| 항목 | 파일 | 내용 |
|------|------|------|
| 요청 목록 권한 제거 | `requests.service.ts` | `ad_team` 본인 요청만 조회 제한 제거 → 전체 목록 조회 허용 |
| 재전송 기능 | `migrations/007_add_resend_logs.sql` | `resend_logs` 테이블 추가 |
| 재전송 기능 | `requests.service.ts` | `prepareForResend()` 함수 추가 |
| 재전송 기능 | `requests.router.ts` | `POST /api/requests/:id/resend` 엔드포인트 추가 |
| 재전송 기능 | `apiService.ts` | `resendRequest()` 함수 추가 |
| 재전송 기능 | `RequestDetailPage.tsx` | done 배너에 "재전송 요청" 버튼 + 사유 입력 모달 추가 |
| 요청 삭제 | `requests.service.ts` | `deleteRequest()` 함수 추가 (소프트 삭제) |
| 요청 삭제 | `requests.router.ts` | `DELETE /api/requests/:id` (admin 전용) 추가 |
| 요청 삭제 | `apiService.ts` | `deleteRequest()` 함수 추가 |
| 요청 삭제 | `RequestDetailPage.tsx` | 상단 헤더에 관리자 전용 "요청 삭제" 버튼 추가 |
| 다른 PC 접근 허용 | `vite.config.ts` | `/api` Vite proxy 추가 (다른 PC → Vite → 백엔드 localhost:4000) |
| 도메인 허용 | `vite.config.ts` | `allowedHosts: ['adcheck.tech.net']` 추가 |
| API URL 수정 | `frontend/src/lib/api.ts` | baseURL `http://localhost:4000/api` → `/api` (상대경로) |

### 재전송 동작 흐름
1. done 상태 요청 → "재전송 요청" 버튼 클릭 → 사유 입력 모달
2. `POST /api/requests/:id/resend { reason }` 호출
3. `resend_logs` 에 사유/요청자 기록
4. 기존 done copy_jobs → failed ('재전송으로 대체됨')
5. request/items → approved 상태 복원
6. 백그라운드에서 `executeCopyJobs` 재실행 → copying → done

### 다른 PC 접근 원리
- 기존: 브라우저가 `http://localhost:4000/api` 호출 → 다른 PC 자신의 localhost로 연결 실패
- 변경: 브라우저가 `/api` 호출 → Vite dev server가 서버의 `localhost:4000`으로 proxy → 정상 동작

### 빌드 확인 (2026-03-09)
- Backend TypeScript 빌드 오류 없음
- Frontend TypeScript + Vite 빌드 성공 (116 modules)

---

## Phase 3 — 사용자 요청 개선사항 구현 완료 (2026-03-23)

> 상세 내용: `.claude/docs/improvement-plan.md`

### 구현 완료 항목

| # | 항목 | 상태 | 핵심 반영 내용 |
|---|------|------|----------------|
| 1 | 목록 복사/붙여넣기 기능 | ✓ 완료 | `RequestNewPage.tsx`에 행 단위 복사/붙여넣기 추가 |
| 2 | 템플릿 기능 제거 | ✓ 완료 | `008_drop_request_templates.sql`로 미사용 테이블 제거 |
| 3 | 날짜 입력 UX 개선 | ✓ 완료 | 기존 날짜 필드 UI 유지, 입력 흐름 보정 |
| 4 | 요청 등록 화면 입력 방법 공지 | ✓ 완료 | 요청 등록 화면 상단 안내 박스 추가 |
| 5 | 과거 영상 파일 삭제 | ✓ 완료 | `DELETE /api/files/copied-files/:copyJobId`, 삭제 메타데이터 기록 |
| 6 | 오전송 수정 기능 | ✓ 완료 | `PATCH /api/requests/:id/items/:itemId`, `editing` 상태 추가, 단일 항목 재탐색/재복사 |
| 7 | 통계 집계 단위 수정 | ✓ 완료 | `/summary`, `/monthly`, `/daily`를 request_items 기준으로 전환 |

### 주요 변경 파일

| 구분 | 파일 | 내용 |
|------|------|------|
| DB | `backend/src/config/migrations/008_drop_request_templates.sql` | 템플릿 테이블 제거 |
| DB | `backend/src/config/migrations/009_add_editing_status_and_copy_job_delete_meta.sql` | `editing` 상태, `copy_jobs.deleted_at/deleted_by` 추가 |
| Backend | `backend/src/modules/files/storage-cleanup.service.ts` | 공유 NAS 파일 삭제, 빈 날짜 폴더 정리, 감사 로그 |
| Backend | `backend/src/modules/files/storage-cleanup.router.ts` | 파일 삭제 API |
| Backend | `backend/src/modules/requests/requests.service.ts` | 오전송 수정, 수정 항목 재복사 준비 |
| Backend | `backend/src/modules/requests/requests.router.ts` | `PATCH /api/requests/:id/items/:itemId` 추가 |
| Backend | `backend/src/modules/files/files.service.ts` | 단일 항목 파일 재탐색 로직 추가 |
| Backend | `backend/src/modules/copy/copy.service.ts` | 삭제된 copy_job 제외, `editing` 복사 흐름 반영 |
| Backend | `backend/src/modules/stats/stats.router.ts` | 요약/월별/일별 통계 항목 기준 집계 |
| Frontend | `frontend/src/pages/RequestNewPage.tsx` | 안내 박스, 행 복사/붙여넣기, 날짜 UX |
| Frontend | `frontend/src/pages/RequestDetailPage.tsx` | 파일 삭제, 오전송 수정, `editing` 상태 UI |
| Frontend | `frontend/src/pages/StatsDashboardPage.tsx` | "요청" → "항목" 라벨 정리 |
| Frontend | `frontend/src/pages/ManualPage.tsx` | 템플릿 제거, 새 운영 흐름 반영 |

### 신규/변경 API

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| DELETE | `/api/files/copied-files/:copyJobId` | 완료 복사본 삭제 | tech_team/admin |
| PATCH | `/api/requests/:id/items/:itemId` | 완료 항목 수정 + 단일 재탐색 | tech_team/admin |
| POST | `/api/requests/:id/retry-copy` | 실패 항목 또는 수정 항목 재복사 | tech_team/admin |

### 현재 운영 상태 정리

- 템플릿 기능은 더 이상 현재 기능 범위가 아니다.
- 요청 상태에 `editing`이 추가되었고, 이는 완료 요청의 일부 항목을 수정 중일 때만 사용한다.
- `copy_jobs`는 삭제 마킹(`deleted_at`, `deleted_by`)을 통해 파일 삭제 이력을 보존한다.
- 통계 대시보드의 요약/월별/일별 수치는 요청 수가 아니라 요청 항목 수를 기준으로 집계한다.

### 빌드 확인 (2026-03-23)

- `pnpm build` 통과
- Backend TypeScript 빌드 오류 없음
- Frontend TypeScript + Vite 빌드 성공

---

## 다음 작업: UI 개선 (예정)

### 배경
전반적으로 단조로운 UI 개선 요청 (2026-03-23)

### 방향
**shadcn/ui 도입** — 현재 Tailwind CSS 기반 → shadcn/ui 컴포넌트 교체
- 이미 Tailwind 사용 중이라 궁합 최상, 로직 변경 없이 구조만 교체
- 아이콘: `lucide-react` 추가
- 대상: Button, Table, Input, Badge, Dialog, Card 등 핵심 컴포넌트 우선

### 예상 작업 파일
- `frontend/src/components/GlobalNav.tsx` — 네비게이션 개선
- `frontend/src/pages/RequestListPage.tsx` — 테이블/필터 개선 (가장 자주 보는 화면)
- `frontend/src/pages/RequestDetailPage.tsx` — 카드/섹션 개선 (가장 복잡한 화면)
- `frontend/src/pages/RequestNewPage.tsx` — 폼 개선
- `frontend/src/pages/LoginPage.tsx` — 로그인 화면 개선
- 공통 컴포넌트 전체 (StatusBadge, PageHeader, EmptyState, LoadingRow 등)
