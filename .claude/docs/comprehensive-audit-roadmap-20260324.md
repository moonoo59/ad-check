# ad-check 전체점검 통합 문서

> 작성일: 2026-03-24
> 범위: `backups/` 제외 전체 저장소
> 목적: 기존 점검 리포트와 실제 코드 재검증 결과를 합쳐, 확정 이슈, 개선 과제, 영향 분석, 수정 로드맵을 한 문서로 정리
> 관련 설계서: `./clip-extraction-design.md`
> 현재 역할: 오픈 버그/리스크/수정 우선순위 기준 문서
> 함께 볼 문서: `./current-priority-map-20260324.md`

---

## 1. 문서 목적과 소스

이 문서는 아래 정보를 통합한다.

- 기존 종합 리포트: `project-report-claude_260324.md`
- 병렬 에이전트 점검 결과
  - 백엔드/보안
  - 프론트엔드/UX
  - DB/인프라
- 로컬 재검증
  - 문서-코드 정합성
  - 주요 라우트/서비스/스크립트 직접 확인

### 작성 원칙

- 기존 리포트를 그대로 복붙하지 않고 현재 코드 기준으로 다시 판정했다.
- 각 항목에는 `다른 기능에 미치는 영향`을 함께 적었다.
- 이미 해결되었거나 현재 코드 기준으로 사실이 아닌 항목은 별도 섹션에서 재분류했다.

---

## 2. 한눈에 보는 결론

현재 프로젝트는 기능 폭은 넓지만, 다음 네 축에서 우선 수정이 필요하다.

1. 권한/세션 보안
   - `ad_team` 요청 목록/상세 격리 누락
   - `/requests/:id/resend` 소유권 및 역할 검증 누락
   - 로그인 세션 재생성 미적용

2. 핵심 업무 흐름 정확성
   - 요청 등록 시 `monitoring_time` 정규화 누락으로 제출 실패 가능
   - 승인/복사 정책이 `match_score === 100`에 과도하게 고정
   - 100점 미만 탐색 결과가 UI에서 숨겨짐
   - `approveRequest()`가 전체 항목 상태를 무조건 덮어씀

3. 데이터/운영 무결성
   - 파일 삭제와 DB 기록의 원자성 부족
   - 감사 로그 `user_id` 누락
   - KST/UTC 타임스탬프 혼재
   - 백업/배포 스크립트의 운영 불안정성

4. 문서와 실제 구현의 드리프트
   - `project-status.md`, `db-schema.md`, `improvement-plan.md` 일부 완료 표시/설명 불일치
   - 기존 `project-report-claude_260324.md`에도 현재 코드 기준 오탐/부분 오탐이 섞여 있음

5. 향후 고도화 대비 데이터 계약 부족
   - 현재 `monitoring_time`은 백엔드에서 초 단위를 받을 수 있지만 프론트 입력은 사실상 분 단위에 묶여 있음
   - 자동 광고 구간 컷팅/복사를 고려하면 시간 정밀도, 작업 추적 모델, 원본 파일 경계 처리 정책을 먼저 정해야 함

### 현재 작업 경계

- 이 문서는 **현재 오픈 버그와 운영 리스크를 먼저 줄이기 위한 문서**다.
- 광고 구간 자동 컷팅 기능은 중요한 미래 고도화지만, 기본적으로는 **별도 트랙**으로 다룬다.
- 단, `monitoring_time`, 삭제/재전송, 시간대 저장 정책처럼 미래 기능과 결합되는 항목은 “미래 호환”을 전제로 수정한다.
- 즉, `P0/P1 버그 수정`과 `clip_extraction 구현`은 문서상 연결하되, 실제 작업 묶음은 분리하는 것이 기준이다.

---

## 3. 기존 리포트 반영 결과

### 3-1. 재검증 후 그대로 유지되는 핵심 항목

| 항목 | 현재 판정 | 비고 |
|---|---|---|
| `ad_team` 목록 격리 누락 | 유지 | 실제 코드에서 재현 |
| `ad_team` 상세 격리 누락 | 유지 | 실제 코드에서 재현 |
| 로그인 세션 destroy 경쟁 조건 | 유지 | 실제 코드에서 재현 |
| 타임스탬프 KST/UTC 혼재 | 유지 | 실제 코드에서 재현 |
| 감사 로그 `user_id = NULL` | 유지 | 실제 코드에서 재현 |
| 파일 삭제-DB 정합성 부족 | 유지 | 실제 코드에서 재현 |
| `match_score === 100` 승인 강제 | 유지 | 실제 코드에서 재현 |
| `approveRequest` 상태 덮어쓰기 | 유지 | 실제 코드에서 재현 |
| `create-app.sh` 운영용 부적합 | 유지 | 실제 코드에서 재현 |
| `backup-db.sh` 백업 불안정 | 유지 | 실제 코드에서 재현 |
| `SESSION_SECRET` 하드코딩/기본값 위험 | 유지 | 실제 코드에서 재현 |
| `db-schema.md` 현행화 부족 | 유지 | 실제 코드와 불일치 |

### 3-2. 기존 리포트에는 없었지만 이번에 확정된 추가 항목

| 항목 | 비고 |
|---|---|
| `/requests/:id/resend` 소유권/권한 검증 누락 | 타인 완료 요청 상태를 변경 가능 |
| `monitoring_time` 정규화 누락 | 프론트 검증 통과 후 서버에서 실패 가능 |
| 100점 미만 탐색 결과 UI 숨김 | 운영자가 수동 검토 자체를 못함 |
| 401 전역 처리 부재 | 세션 만료 시 화면은 로그인 상태처럼 남음 |
| `window.confirm()` 잔존 | 위험 동작 UX와 접근성 불일치 |
| 반려/재전송 모달 접근성 부족 | 포커스 트랩/ESC/aria 부재 |

### 3-3. 재검증 결과 조정이 필요한 항목

| 기존 항목 | 재판정 | 이유 |
|---|---|---|
| 로그인/로그아웃 시 audit 로그 미기록 | 오탐 | 현재 `auth.router.ts`에서 둘 다 기록 |
| `electron/dist/` gitignore 누락 | 오탐 | 현재 `.gitignore`에 존재 |
| `request_items.item_status`에 `editing` 누락 | 설계 해석 차이 | 현재 `editing`은 `requests.status`에서만 사용 |

### 3-4. 기존 리포트 하단 추가 메모 반영

`project-report-claude_260324.md` 하단에 붙은 추가 분석 중 아래 항목은 현재 코드 기준으로 **확정 버그**다.

- `RequestNewPage.tsx`
  - `normalizeTimeInput()`은 검증에만 사용됨
  - 실제 제출 payload의 `monitoring_time`에는 원본 문자열이 그대로 전송됨
  - 예: `1311` 입력 시 프론트는 허용하지만 백엔드 정규식 검증에서 실패

---

## 4. 확정 이슈 레지스트리

### 4-1. P0 즉시 대응

| ID | 심각도 | 영역 | 코드 위치 | 문제 | 다른 기능 영향 | 권장 방향 |
|---|---|---|---|---|---|---|
| A-01 | Critical | 보안 | `backend/src/modules/requests/requests.service.ts:198` | `ad_team` 요청 목록 격리 미적용 | 요청 목록, 검색, 개인정보/업무 정보 노출 | 서비스 레벨에서 `ad_team => requester_id = currentUserId` 강제 |
| A-02 | Critical | 보안 | `backend/src/modules/requests/requests.service.ts:271` | `ad_team` 요청 상세 격리 미적용 | 상세, 파일 탐색 결과, 반려 사유, 복사 이력 노출 | 상세 조회도 소유권 강제 |
| A-03 | Critical | 보안 | `backend/src/modules/requests/requests.router.ts:488`, `requests.service.ts:668` | `/resend` 소유권/권한 검증 누락 | 타인 완료 요청 상태 변경, copy_jobs 오염, 운영 재처리 혼선 | requester/admin/운영 권한 제한 + 서비스에서 requester 검증 |
| A-04 | Critical | 보안 | `backend/src/modules/auth/auth.router.ts:37` | 로그인 시 세션 destroy 경쟁 조건 + regenerate 미적용 | 로그인 안정성, session fixation 방어, 권한 세션 혼선 | `req.session.regenerate()` 완료 후 세션 설정 |
| A-05 | Critical | 기능 | `frontend/src/pages/RequestNewPage.tsx:118` | `monitoring_time` 검증값과 전송값 불일치 | 요청 등록 실패, 입력 신뢰 저하, 사용자 재시도 증가 | 제출 직전 정규화된 값으로 payload 변환 |
| A-06 | Critical | 기능 | `frontend/src/pages/RequestDetailPage.tsx:298` | 승인/복사 조건이 `match_score === 100`으로 고정 | 승인, 재복사, 오전송 수정, 운영 예외 대응 전체 | 선택 여부와 경고 여부를 분리 |
| A-07 | Critical | 기능 | `frontend/src/pages/RequestDetailPage.tsx:857` | 100점 미만 파일이 UI에서 숨겨짐 | 수동 파일 선택 불가, 예외 대응 불가 | 전체 탐색 결과 표시 + 낮은 점수 경고 처리 |
| A-08 | Critical | 기능 | `backend/src/modules/requests/requests.service.ts:640` | `approveRequest()`가 모든 항목 상태를 무조건 `approved`로 덮어씀 | 완료/실패/수정 중 혼합 상태 손상, 진행률/배지 왜곡 | 승인 가능한 상태만 업데이트 |
| A-09 | Critical | 데이터 | `backend/src/modules/files/storage-cleanup.service.ts:94` | 파일 삭제와 DB 기록 원자성 부족 | 파일 삭제, 오전송 수정, 재전송 가능 여부, 감사 추적 불일치 | 보상 로직 또는 상태 전이 재설계 |
| A-10 | Critical | 데이터 | `backend/src/modules/requests/requests.service.ts:628` | 수정 항목 재복사 감사 로그 `user_id = NULL` | 감사 로그, 운영 책임 추적, 수정 이력 분석 | 호출자 userId를 전달해 기록 |
| A-11 | Critical | 인프라 | `scripts/create-app.sh:107-184,242-243` | `.app`이 원본 프로젝트 경로 + `pnpm dev`에 의존 | 배포, 운영 DB 경로, 문서상 앱 실행 흐름 전체 | 자체 실행형 패키징으로 전환 |
| A-12 | Critical | 인프라 | `scripts/backup-db.sh:34-70` | 운영 DB가 아닌 로컬 DB만 백업 + WAL 별도 `cp` | 복구 가능성, 운영 데이터 보존, 백업 신뢰도 | `DB_PATH` 기준 백업 + `sqlite3 .backup` 또는 `VACUUM INTO` |
| A-13 | Critical | 보안 | `electron/main.ts:71-73`, `backend/src/config/env.ts:35-37` | `SESSION_SECRET` 하드코딩/예측 가능 기본값 | 모든 인증 API, 세션 위조 가능성, 설치별 비밀값 분리 실패 | 설치별 랜덤 secret 생성, 기본값 사용 시 운영 기동 실패 처리 |

### 4-2. P1 이번 주 처리 권장

| ID | 심각도 | 영역 | 코드 위치 | 문제 | 다른 기능 영향 | 권장 방향 |
|---|---|---|---|---|---|---|
| B-01 | Done | 데이터 | `backend/src/config/database.ts`, migrations 전반 | UTC ISO와 `datetime('now','localtime')` 혼재 | 통계, 감사 로그, 요청 목록 기간 필터, 백업 분석 | 2026-03-24: UTC 저장/KST 표시 유틸 통합, legacy KST 문자열 일괄 정규화 |
| B-02 | Done | 데이터 | `backend/src/config/database.ts`, migrations 전반 | FK OFF 마이그레이션 후 `foreign_key_check` 없음 | 참조 무결성 손상 시 서버가 그대로 기동 | 2026-03-24: `foreign_key_check` 부팅 검사 추가, migration 010에서 `requests_old` FK 드리프트 복구 |
| B-03 | Done | 보안 | `backend/src/common/auth.middleware.ts` | 세션 사용자 상태/역할 재검증 없음 | 사용자 비활성화/권한 변경 반영 지연 | 2026-03-24: 인증 요청마다 users 재조회, 비활성 계정은 세션 즉시 무효화, 역할/표시명은 세션 갱신 |
| B-04 | Done | 보안 | `backend/src/modules/auth/auth.router.ts`, `backend/src/common/login-rate-limit.ts` | 로그인 rate limiting 없음 | 계정 대입 공격 탐지/완화 부재 | 2026-03-24: 메모리 기반 IP/계정명/IP+계정명 제한 추가, `429` + `Retry-After` 반환 |
| B-05 | Done | 보안 | `backend/src/app.ts`, `backend/src/common/middleware.ts` | 요청 본문 크기 제한 없음 | 대용량 요청으로 메모리 압박 가능 | 2026-03-24: JSON/urlencoded `256kb` 제한 추가, 초과 시 `413 PAYLOAD_TOO_LARGE` 반환 |
| B-06 | Done | 보안 | `backend/src/common/path-guards.ts`, `backend/src/modules/files/file-matcher.ts` | 파일 탐색 경로 traversal 방어 없음 | 채널 매핑 오염 시 mount root 밖 접근 가능 | 2026-03-24: Logger Storage 탐색 경로를 root 경계 검사 공용 헬퍼로 강제 |
| B-07 | Done | 보안 | `backend/src/common/path-guards.ts`, `backend/src/modules/copy/copy.service.ts`, `storage-cleanup.service.ts` | NAS 쓰기/삭제 경로 경계 검사 없음 | 복사/삭제가 의도치 않은 경로로 나갈 수 있음 | 2026-03-24: 원본/대상/삭제 경로 모두 mount root 하위만 허용 |
| B-08 | Done | 프론트 | `frontend/src/lib/api.ts`, `frontend/src/lib/authEvents.ts`, `frontend/src/contexts/AuthContext.tsx` | 401 전역 처리 부재 | 세션 만료 후 화면과 실제 인증 상태 불일치 | 2026-03-24: 401 인터셉터 + auth invalidation 이벤트 + 로그인 리다이렉트 정리 |
| B-09 | Done | UX | `frontend/src/pages/RequestNewPage.tsx`, `RequestDetailPage.tsx` | `window.confirm()` 사용 | 위험 동작 UX 불일치, 접근성 저하, 자동화 테스트 불편 | 2026-03-24: 위험 작업을 `ConfirmDialog` 흐름으로 통합 |
| B-10 | Done | 접근성 | `frontend/src/pages/RequestDetailPage.tsx`, `SideDrawer.tsx`, `ToastMessage.tsx`, `LoginPage.tsx` | 모달/드로어/토스트/오류 영역 접근성 부족 | 반려/재전송/관리자 드로어/전역 피드백/로그인 실패 인지 저하 | 2026-03-24: Dialog 기반 모달화, Drawer 포커스 관리, `aria-live`, `role=alert` 보강 |
| B-11 | Done | 성능 | `backend/src/modules/requests/requests.service.ts` | 요청 상세 N+1 쿼리 | 상세 폴링, 운영 검토 화면 성능 저하 | 2026-03-24: 파일 결과/복사 작업을 배치 조회 후 메모리 그룹핑으로 전환 |
| B-12 | Done | 성능 | `backend/src/common/logger.ts`, `auth.service.ts`, `users.service.ts` | `appendFileSync`, `bcrypt.hashSync` 동기 블로킹 | 응답 지연, 로그 폭증 시 전체 API 영향 | 2026-03-24: 비동기 로그 스트림 + 비동기 bcrypt 해시로 전환 |
| B-13 | Done | 인프라 | `scripts/create-app.sh` | 앱 생성 전에 `pnpm build` 미실행 | stale 빌드 배포, 산출물 정합성 붕괴 | 2026-03-24: 앱 생성 시작 단계에서 `pnpm build`를 강제하도록 재확인 |
| B-14 | Done | 인프라 | `scripts/create-app.sh` | 포트 4000/5173 프로세스 일괄 종료 | 다른 로컬 서비스까지 종료 가능 | 2026-03-24: PID 기반 종료만 허용하고 외부 프로세스는 종료하지 않도록 변경 |
| B-15 | Done | 인프라 | `start.sh` | 브라우저 오픈이 `sleep 3` 고정 대기 | 느린 환경에서 빈 페이지/실패, 빠른 환경에서 불필요한 대기 | 2026-03-24: 프론트 준비 상태 폴링 후 브라우저 오픈 |
| B-16 | Done | 인프라 | `backend/package.json`, `frontend/package.json`, `pnpm-lock.yaml` | TS / `@types/node` 버전 불일치 | IDE/CI 타입 재현성 저하 | 2026-03-24: 모노레포 기준 TS / `@types/node` 버전 정렬 및 lockfile 갱신 |

### 4-3. P2 단기 품질/UX 개선

| ID | 심각도 | 영역 | 코드 위치 | 문제 | 다른 기능 영향 | 권장 방향 |
|---|---|---|---|---|---|---|
| C-01 | Done | 프론트 구조 | `frontend/src/pages/RequestDetailPage.tsx`, `frontend/src/components/request-detail/*` | 단일 파일이 너무 많은 책임을 가짐 | 상세 기능 수정 시 회귀 위험, 병렬 작업 충돌 | 2026-03-24: 진행률/항목표/액션 다이얼로그를 전용 컴포넌트로 분리 |
| C-02 | Done | 중복 코드 | `frontend/src/lib/requestTime.ts`, `RequestNewPage.tsx`, `RequestDetailPage.tsx` | 시간 정규화/시간대 옵션 중복 | 등록/수정 동작 정책이 어긋날 수 있음 | 2026-03-24: 시간 정규화와 시간대 옵션을 공용 `lib`로 추출 |
| C-03 | Done | UX | `AuditLogPage.tsx` | 자동 조회 + 수동 검색 이중 모델 | 감사 로그 UX 혼란, 불필요 요청 증가 | 2026-03-24: 적용된 필터 기준의 단일 조회 모델로 통일 |
| C-04 | Done | UX | `StatsDashboardPage.tsx` | 로딩 실패 시 페이지 수준 오류 상태 없음 | 통계 장애를 “데이터 없음”으로 오인 가능 | 2026-03-24: `ErrorBanner` + 재시도 버튼 추가 |
| C-05 | Done | 접근성 | `RequestListPage.tsx`, `RequestDetailPage.tsx` | 클릭 가능한 `tr role="button"` 사용 | 키보드 탐색/포커스/의미 구조 부족 | 2026-03-24: 실제 링크/버튼 셀 기반 선택/이동으로 정리 |
| C-06 | Done | 코드 품질 | `StatsDashboardPage.tsx` | exhaustive-deps lint 억제 | stale closure 위험 | 2026-03-24: 의존성 안전한 `fetchAll` 구조로 리팩터링 |
| C-07 | Done | 문구/보안 UX | `RequestListPage.tsx` | 서버 보장 없는 “본인 요청만 조회” 문구 | 권한 문제 발생 시 잘못된 안전 신호 제공 | 2026-03-24: 서버 정책을 명시하는 문구로 완화 |

---

## 5. 문서/코드 정합성 검토

### 5-1. 현재 문서상 주요 불일치

| 문서 | 문제 | 실제 코드와의 차이 | 영향 |
|---|---|---|---|
| `.claude/docs/project-status.md` | 완료 표시 과다 및 이력 누적 충돌 | 오래된 완료/삭제/재구현 내역이 한 문서에 혼재 | 현재 상태 파악이 매우 어려움, 운영 판단 오류 |
| `.claude/docs/project-status.md` | `mount` 관련 단계/로그/화면 완료 기록 잔존 | 현재 `backend/src/app.ts`와 `frontend/src/App.tsx`에는 mount 라우트/화면이 없음 | 운영 기능 오판, QA 체크리스트 오류 |
| `.claude/docs/project-status.md` | “UI 개선 — shadcn/ui + lucide-react 도입 완료” 서술 과장 | 의존성은 존재하지만 화면은 커스텀 클래스와 혼합, 전면 전환은 아님 | UI 기술 스택 오해, 후속 디자인 작업 혼선 |
| `.claude/docs/db-schema.md` | 최신 마이그레이션 미반영 | `008_drop_request_templates.sql`, `009_add_editing_status_and_copy_job_delete_meta.sql`, `resend_logs`, `copy_jobs.deleted_at/deleted_by`, `requests.status=editing` 등이 충분히 반영되지 않음 | 스키마 참조 문서 신뢰도 저하 |
| `.claude/docs/db-schema.md` | mount 관련 스키마/행동 코드 설명이 실제 운영 흐름과 어긋남 | 현재 앱은 mount 기능을 노출하지 않음 | 운영/보안 절차 문서 혼선 |
| `.claude/docs/improvement-plan.md` | 완료 처리된 항목 중 실제 UI 설명이 현재 화면과 불일치 | 예: 요청 등록 안내/UI 구현 설명과 현재 화면 구조 일부 차이 | 기능 인수인계/회귀 테스트 기준 왜곡 |
| `HOW_TO_RUN.md` | 앱 실행/패키징 설명과 실제 스크립트가 다름 | 문서는 `create-app`이 build 포함/`localhost:4000` 기반처럼 읽히지만 실제 `scripts/create-app.sh`는 `pnpm dev`와 `5173`에 의존 | 설치/운영 가이드 오류, 장애 재현 어려움 |
| `CLAUDE.md` | 일부 구조 설명과 현재 코드가 어긋남 | 예전 `mount` 모듈/경로 설명 잔존 가능성, 폴더 구조 최신화 부족 | 온보딩, 코드 탐색, 영향 분석 혼선 |
| `.claude/docs/analysis-report.md` | 과거 분석 결과가 현재 상태와 혼재 | 사용자 관리/감사 로그 등은 현재 구현되어 있는데 문서상 미구현으로 남아 있음 | 중복 개발, 잘못된 백로그 관리 |
| `project-report-claude_260324.md` | 점검 결과와 대화형 후속 메모가 한 파일에 혼재 | 순수 리포트와 추가 추적 메모 경계가 없음 | 재사용성 저하, 후속 작업 우선순위 혼동 |

### 5-2. 문서 정리 원칙 제안

1. `project-status.md`
   - “현재 상태”와 “역사 로그”를 분리
   - 삭제된 기능은 완료 기록에서 제거하지 말고 `폐기/중단` 상태로 표기

2. `db-schema.md`
   - 마이그레이션 번호 기준으로 최신 스냅샷 재생성
   - 실제 enum/status/action 코드만 남기기

3. `improvement-plan.md`
   - “요구사항 원문”, “실제 구현”, “현재 UI 상태”를 분리
   - 구현 후 변경된 UX는 최신 스크린샷/설명 기준으로 재작성

4. 점검 보고서
   - `원본 리포트`와 `재검증 문서`를 분리 유지
   - 이 문서를 후속 기준점으로 사용

5. 권한/운영 기준 문서
   - 권한 정책, 시간대 기준, 백업/복구 기준, 삭제 정책을 별도 운영 문서로 명문화
   - 각 정책은 `문서 기준 / 구현 기준 / 검증 상태`를 함께 기록

---

## 6. 개선사항 수집

### 6-1. 버그 수정 외 즉시 가치가 큰 개선 과제

| 개선 항목 | 기대 효과 | 영향 범위 |
|---|---|---|
| 시간/날짜/역할/에러 처리 공통 유틸 통합 | 규칙 불일치 감소 | 요청 등록, 상세, 목록, 인증 |
| 401 전역 처리 도입 | 세션 만료 UX 안정화 | 전체 프론트 |
| 위험 작업 다이얼로그 공통화 | 삭제/반려/재전송/행삭제 UX 일관성 | 요청 등록, 상세, 관리자 화면 |
| 상세/통계/감사 로그 오류 상태 표준화 | 운영자가 장애와 빈 데이터를 구분 가능 | 통계, 감사 로그, 상세 |
| 요청 상세 컴포넌트 분리 | 회귀 위험 감소, 병렬 작업성 향상 | 파일 선택/승인/수정/삭제 |
| N+1 쿼리 정리 | 폴링/상세 성능 개선 | 요청 상세, 승인 검토 |
| 비동기 로깅/해시 전환 | 응답 안정성 향상 | 인증, 전역 로깅 |
| 배포 전략 단일화 | 운영/문서/지원 절차 단순화 | Electron, create-app, HOW_TO_RUN |
| 문서 자동 체크리스트 도입 | 코드-문서 드리프트 감소 | 전체 운영 문서 |

### 6-2. 기능별 영향 맵

| 기능 | 의존 이슈 | 영향 설명 |
|---|---|---|
| 요청 목록 | A-01, B-07, C-07 | 권한 누락과 잘못된 보안 문구가 직접 영향을 줌 |
| 요청 상세 | A-02, A-06, A-07, A-08, C-01 | 승인/파일 선택/오전송 수정이 가장 많이 얽힘 |
| 재전송 | A-03, A-08, A-09, A-10 | 권한, 상태 전이, 감사 추적이 동시에 깨짐 |
| 파일 삭제 | A-09, B-07, B-09 | 실제 NAS 상태와 DB 상태가 어긋날 위험 |
| 요청 등록 | A-05, C-02, B-09 | 제출 실패와 UX 불일치가 직접 발생 |
| 통계 | B-01, C-04 | 시각 오류/기간 오류 발생 시 운영 판단 왜곡 |
| 감사 로그 | A-10, B-01, C-03 | 누가 무엇을 했는지 추적성과 조회 신뢰도 저하 |
| 인증 | A-04, B-03, B-04, B-08, A-13 | 보안/세션/UX가 함께 연결됨 |
| 배포/백업 | A-11, A-12, B-13, B-14, B-15 | 운영 장애 대응 및 복구 가능성 자체를 좌우 |

### 6-3. 향후 고도화 요구 반영: 초 단위 자동 컷팅/복사

사용자가 구상한 고도화 요구는 다음과 같이 해석한다.

- 기준 시각: 광고 송출 시각을 `HH:MM:SS`로 저장
- 길이 선택: `15초 / 30초 / 45초` 등 광고 길이 선택
- 버퍼: 송출 시각 앞뒤로 기본 `5초`씩 버퍼 적용
- 결과물: 원본 1시간 AVI 전체를 복사하는 대신, 광고 구간만 잘라 복사

이 요구는 단순 UI 추가가 아니라 현재 감사 결과의 수정 방향 자체에 영향을 준다.

| 항목 | 현재 상태 | 고도화 반영 시 고려사항 | 다른 기능 영향 |
|---|---|---|---|
| `monitoring_time` | 백엔드는 `HH:MM:SS` 허용, 프론트는 사실상 `HH:MM` 중심 | A-05 수정 시 `HH:MM:SS`를 기본 계약으로 잡아야 함. `13:11` 입력은 `13:11:00`으로 보정 가능 | 요청 등록, 상세 수정, 매칭 점수, CSV, 감사 로그 표시 형식 모두 영향 |
| `req_time_start` / `req_time_end` | 현재 `HH:MM` 드롭다운 기반 | 파일 탐색용 넓은 시간대는 분 단위 유지 가능하나, 향후 정밀 컷팅 요구와 충돌하지 않도록 계약을 분리해야 함 | 요청 등록 UI, 상세 수정 UI, 파일 탐색 규칙 영향 |
| 복사 파이프라인 | 원본 파일을 그대로 NAS에 복사 | `탐색 결과 선택 -> 클립 추출 -> 결과물 복사`의 2단계 또는 통합 파이프라인 재설계 필요 | `copy_jobs`, 삭제, 재전송, 진행률, 감사 로그 영향 |
| 파일 선택 기준 | `monitoring_time` 포함 여부가 핵심 점수 | 초 단위 송출 시각이 정확해질수록 매칭 신뢰도는 올라가지만, 경계 구간에서 잘못된 강제 100점 정책은 더 위험해짐 | A-06, A-07 우선순위 유지 |
| 시간대 저장 정책 | UTC/KST 혼재 | 클립 시작/종료 계산과 감사 추적을 위해 저장 시각과 표시 시각을 더 엄격히 분리해야 함 | 통계, 감사 로그, 배포 후 장애 분석 영향 |

#### 선행 설계 권장안

1. 시간 계약
   - `monitoring_time`은 앞으로 `HH:MM:SS`를 표준으로 본다.
   - 프론트는 `HH:MM` 입력도 허용하되 제출 직전 `HH:MM:SS`로 정규화한다.
   - `req_time_start`, `req_time_end`는 당장은 파일 탐색용 범위로 유지하되, “광고 정확 시각”과 “탐색 범위”를 서로 다른 개념으로 문서화한다.

2. 데이터 모델
   - `request_items` 또는 별도 상세 설정에 아래 값이 필요하다.
   - `ad_duration_seconds`
   - `pre_buffer_seconds`
   - `post_buffer_seconds`
   - 기본값은 `15/30/45` 선택 + 버퍼 `5초/5초`로 둘 수 있다.

3. 작업 추적 모델
   - 현재 `copy_jobs`는 “원본 파일 전체 복사” 추적에 맞춰져 있다.
   - 광고 구간 추출은 별도 `clip_jobs`로 분리하는 편이 더 안전하다.
   - 권장 흐름: `file_search_results -> clip_jobs -> copy_jobs`
   - 이렇게 나누면 추출 실패와 복사 실패를 분리 기록할 수 있고, 삭제/재전송/감사 로그 영향도 더 명확해진다.

4. 파일 경계 처리 정책
   - 컷 구간이 파일 시작보다 앞서거나 끝보다 뒤로 나가는 경우 정책이 필요하다.
   - 예: `11:12:00`, 30초 광고, 앞뒤 5초 버퍼라면 실제 추출 구간은 `11:11:55 ~ 11:12:35`
   - 이 구간이 파일 경계를 넘으면 다음 중 하나를 정해야 한다.
   - 추출 실패 처리
   - 인접 파일 자동 결합 후 추출
   - 가능한 구간만 부분 추출 후 경고 표시

5. 감사/운영 추적
   - 어떤 원본 파일에서 몇 초부터 몇 초까지 잘랐는지 로그에 남겨야 한다.
   - 최소 기록 항목:
   - `source_file_path`
   - `clip_start_at`
   - `clip_end_at`
   - `monitoring_time`
   - `ad_duration_seconds`
   - `pre_buffer_seconds`
   - `post_buffer_seconds`
   - `ffmpeg` 또는 실제 추출 엔진 실행 결과

#### 감사 결과에 반영되는 우선순위 조정

- A-05 `monitoring_time` 수정은 이제 단순 버그 패치가 아니라 “초 단위 호환 정규화”로 처리해야 한다.
- B-01 타임스탬프 정리 중요도가 올라간다. 추후 클립 추출 근거를 초 단위로 남기려면 UTC 저장/로컬 표시 원칙이 더 엄격해야 한다.
- A-06, A-07은 더 중요해진다. 자동 컷팅을 하더라도 잘못 고른 원본 파일을 자르면 결과물이 더 그럴듯하게 보이면서 실제로는 틀릴 수 있기 때문이다.
- 삭제/재전송 설계(A-09, A-10)는 향후 `clip_jobs`까지 고려해 “원본 복사물 삭제”와 “추출 산출물 삭제”를 분리할 수 있게 설계해야 한다.

---

## 7. 수정 로드맵

### Phase 0. 긴급 핫픽스

목표: 데이터 노출, 타인 요청 조작, 등록 실패, 승인 불가를 먼저 막는다.

2026-03-24 반영 상태:

- 완료: `A-01` `A-02` `A-03` `A-04` `A-05` `A-06` `A-07` `A-08`
- 이월: `A-09`는 파일 삭제/DB 기록 원자성 재설계가 필요해 Phase 1에서 계속 처리

1. `ad_team` 목록/상세 서버 격리 강제
2. `/resend` 소유권/권한 검증 추가
3. 로그인 세션 `regenerate()` 적용
4. `monitoring_time` 제출 정규화
5. 100점 미만 파일도 검토 가능하게 UI/정책 완화
6. `approveRequest()`가 모든 항목을 덮어쓰지 않도록 수정

주의:
- 4번 `monitoring_time` 수정은 `HH:MM` 전용 보정으로 끝내지 말고 `HH:MM:SS` 표준을 전제로 구현해야 한다.
- 시간 관련 타입/문구/검증은 이후 자동 컷팅 기능으로 이어질 수 있도록 “정확 시각”과 “탐색 시간대”를 분리된 개념으로 유지한다.

### Phase 0.5. 자동 컷팅 대비 선행 설계

목표: 지금 버그를 고치더라도, 다음 단계 고도화와 충돌하지 않게 데이터 계약과 작업 모델을 먼저 확정한다.

1. `monitoring_time` 표준을 `HH:MM:SS`로 확정
2. 광고 길이/버퍼 파라미터 저장 방식 결정
3. `copy_jobs` 단독 유지 vs `clip_jobs + copy_jobs` 분리 결정
4. 파일 경계 초과 시 처리 정책 정의
5. 감사 로그에 남길 추출 파라미터 기준 확정

### Phase 1. 데이터 무결성과 운영 안정성

목표: 삭제/재전송/수정 흐름과 운영 DB/백업을 안정화한다.

2026-03-24 반영 상태:

- 완료: `A-09` `A-10` `A-11` `A-12` `A-13`
- 완료: `B-01` UTC/KST 저장 기준 정리, `B-02` FK 검사/복구
- 완료: `B-03` 세션 사용자 재검증
- 완료: `B-04` 로그인 rate limiting
- 완료: `B-05` 요청 본문 크기 제한
- 완료: `B-06` ~ `B-16` 보안/성능/배포 정리
- 완료: `C-01` ~ `C-07` 구조/UX/접근성 정리
- 감사 리포트의 A/B/C 실행 항목은 2026-03-24 기준 모두 반영 완료

1. 파일 삭제-DB 상태 전이 재설계
2. 감사 로그 `user_id` 누락 제거
3. UTC 타임스탬프 저장 포맷 통일
4. FK 체크 마이그레이션 검증 추가
5. `backup-db.sh`를 단일 시점 백업 방식으로 교체
6. `SESSION_SECRET` 운영 전략 재설계

### Phase 2. UX/접근성/일관성 정리

목표: 위험 작업 UX, 세션 만료 UX, 접근성을 공통 규칙으로 통일한다.

2026-03-24 반영 상태:

- 완료: `B-08` `B-09` `B-10`
- 완료: `C-03` `C-04` `C-05` `C-07`

1. `window.confirm()` 제거
2. 반려/재전송 모달 공통 Dialog화
3. SideDrawer 포커스 트랩/ESC 지원
4. Toast/로그인 오류 `aria-live` 적용
5. 401 전역 처리 추가
6. 통계/감사 로그 오류 상태 및 조회 모델 정리

### Phase 3. 성능/구조/중복 제거

목표: 변경 비용과 회귀 위험을 낮춘다.

2026-03-24 반영 상태:

- 완료: `B-11` `B-12` `B-16`
- 완료: `C-01` `C-02` `C-06`

1. RequestDetailPage 분리
2. 시간/날짜/역할/에러 유틸 공통화
3. 요청 상세 N+1 제거
4. 동기 로깅/해시 제거
5. 타입/도구 버전 정렬

### Phase 4. 문서 현행화

목표: 이후 작업 기준이 되는 공식 문서를 다시 신뢰할 수 있게 만든다.

2026-03-24 반영 상태:

- 완료: `project-status.md`, `current-priority-map-20260324.md`, 본 감사 문서 기준 현행화
- 다음 범위: clip feature flag / 초 단위 컷팅 설계 문서 구현 단계로 전환

1. `project-status.md` 재작성
2. `db-schema.md` 최신 마이그레이션 기준 재생성
3. `improvement-plan.md` 구현 후 상태 기준으로 수정
4. `HOW_TO_RUN.md`와 실제 배포 전략 일치화
5. 기존 `project-report-claude_260324.md` 오탐/보완 메모 분리

---

## 8. 추천 작업 순서

### 이번 턴/오늘 처리 권장

- A-01, A-02, A-03
- A-04
- A-05

이 다섯 개는 보안/업무 중단 위험이 동시에 높다.

### 이번 주 처리 권장

- A-06, A-07, A-08
- A-09, A-10
- A-11, A-12, A-13
- B-06, B-07, B-08
- Phase 0.5 선행 설계 항목

### 단기 품질 개선

- B-08, B-09, B-10
- C-01, C-02, C-03, C-04

### 문서 정리

- `project-status.md`
- `db-schema.md`
- `improvement-plan.md`

---

## 9. 바로 착수 가능한 수정 묶음

### 묶음 A: 권한/세션 보안

- A-01
- A-02
- A-03
- A-04
- B-03
- B-04

### 묶음 B: 요청 흐름 정상화

- A-05
- A-06
- A-07
- A-08
- C-02
- Phase 0.5의 시간 계약/클립 파이프라인 설계

### 묶음 C: 삭제/재전송/감사 추적

- A-09
- A-10
- B-01

### 묶음 D: 운영 배포/백업

- A-11
- A-12
- A-13
- B-13
- B-14
- B-15

### 묶음 E: UX/접근성 정리

- B-08
- B-09
- B-10
- C-03
- C-04
- C-05

---

## 10. 결론

이 프로젝트는 핵심 기능 범위 자체는 이미 넓고, 요청 등록 → 탐색 → 승인 → 복사 → 재전송/수정까지 흐름이 연결되어 있다. 하지만 지금 상태는 “기능 수는 충분하지만, 보안 경계와 상태 전이 규칙이 아직 완전히 잠기지 않은 운영 전 단계”에 가깝다.

가장 중요한 포인트는 다음 세 가지다.

1. 권한 누락으로 인한 데이터 노출과 타인 요청 조작을 먼저 막아야 한다.
2. 요청 등록/파일 선택/승인 정책의 실제 동작을 업무 규칙과 다시 맞춰야 한다.
3. 배포/백업/문서를 현행화하지 않으면 운영 리스크가 계속 남는다.

이 문서를 기준으로 다음 작업은 `Phase 0 -> Phase 1` 순서로 진행하는 것이 가장 안전하다.
