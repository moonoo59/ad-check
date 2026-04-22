# 프로젝트 현재 상태

> 작성일: 2026-03-24
> 성격: 현재 코드 기준 스냅샷 문서
> 우선 참조:
> - 오픈 버그/리스크: `./comprehensive-audit-roadmap-20260324.md`
> - 문서 역할/우선순위 정리: `./current-priority-map-20260324.md`

---

## 1. 프로젝트 개요

이 프로젝트는 방송 광고 증빙 요청을 내부 웹 앱으로 처리하는 시스템이다.

현재 기본 흐름:

1. 광고팀이 요청을 등록한다.
2. 시스템이 Logger Storage에서 파일 후보를 자동 탐색한다.
3. 기술팀이 파일을 검토하고 선택한다.
4. 승인 후 공유 NAS로 복사한다.
5. 필요 시 완료 파일 삭제, 재전송, 오전송 수정이 가능하다.

운영 형태:

- macOS 단일 PC 기반
- 세션 로그인 방식
- Electron 앱 또는 개발 서버로 실행
- DB는 SQLite 사용

---

## 2. 현재 구현 범위

### 2-1. 프론트엔드 화면

현재 활성 라우트:

| 경로 | 화면 | 권한 |
|---|---|---|
| `/login` | 로그인 | 공개 |
| `/requests` | 요청 목록 | 로그인 |
| `/requests/new` | 요청 등록 | 로그인 |
| `/requests/:id` | 요청 상세 | 로그인 |
| `/manual` | 매뉴얼 | 로그인 |
| `/change-password` | 비밀번호 변경 | 로그인 |
| `/admin/channels` | 채널 매핑 관리 | admin |
| `/admin/users` | 사용자 관리 | admin |
| `/admin/audit` | 감사 로그 | admin |
| `/admin/stats` | 통계 대시보드 | admin |

현재 없는 화면:

- 관리자 시스템 설정 화면
- 마운트 제어 화면
- 광고 구간 자동 컷팅 관련 화면

### 2-2. 백엔드 모듈

현재 `app.ts`에 실제 등록된 모듈:

| 모듈 | 경로 | 상태 |
|---|---|---|
| Health | `/api/health` | 사용 중 |
| Auth | `/api/auth` | 사용 중 |
| Channels | `/api/channels` | 사용 중 |
| Requests | `/api/requests` | 사용 중 |
| Files Cleanup | `/api/files` | 사용 중 |
| Users | `/api/users` | 사용 중 |
| Audit | `/api/audit` | 사용 중 |
| Stats | `/api/stats` | 사용 중 |

현재 등록되지 않은 것:

- Mount 제어 API
- System settings API
- Clip extraction API

---

## 3. 현재 주요 기능 상태

### 인증 / 권한

- `express-session` 기반 로그인/로그아웃
- 역할: `ad_team`, `tech_team`, `admin`
- 비밀번호 변경 기능 존재
- 관리자 전용 화면은 프론트/백엔드 양쪽에서 제한

### 요청 처리

- 요청 등록
- 요청 목록 조회
- 요청 상세 조회
- 자동 파일 탐색
- 파일 선택
- 승인 / 반려
- 복사 재시도
- 완료 요청 재전송
- 완료 항목 수정(오전송 수정)

### 파일 처리

- Logger Storage 파일명 기반 후보 탐색
- match score 계산
- 선택 파일을 공유 NAS로 복사
- 복사 진행률 저장
- 완료 복사본 삭제

### 관리자 기능

- 채널 매핑 CRUD
- 사용자 관리
- 감사 로그 조회
- 통계 대시보드
- 매뉴얼 제공

---

## 4. 최근 반영된 기능 상태

2026-03-23 반영 기준:

- 행 단위 복사/붙여넣기
- 템플릿 테이블 제거
- 요청 등록 안내 문구 개선
- 과거 복사본 삭제
- 오전송 수정 + `editing` 상태
- 통계 집계 단위 요청 항목 기준 전환

2026-03-24 추가 반영 기준:

- 공유 NAS 복사본 삭제 시 임시 이동 후 DB 기록, 실패 시 원위치 복구
- `copy_retry` / 요청 단위 `copy_failed` 감사 로그에 실제 사용자 ID 기록
- Electron 앱 설치별 세션 시크릿 자동 생성/보관, 운영 백엔드 기본 시크릿 기동 차단
- `backup-db.sh`가 앱 DB 우선 + `sqlite3 .backup` 기반 단일 시점 백업으로 전환
- `create-app.sh`가 프로젝트 경로/`pnpm dev` 의존 없이 실행되는 자체 실행형 `.app` 번들로 전환
- DB 시간 저장을 UTC ISO로 통일하고, 프론트 표시/기간 해석을 KST 공용 유틸로 정리
- migration `010`으로 레거시 KST 문자열 정규화 + `requests_old` FK 드리프트 복구
- 서버 기동 시 `PRAGMA foreign_key_check`를 강제해 FK 손상 DB를 즉시 차단
- 인증 요청마다 `users`를 재조회해 비활성 계정 세션을 즉시 무효화하고, 역할/표시명을 세션에 다시 반영
- 로그인 실패 시 메모리 기반 `IP`, `계정명`, `IP+계정명` 제한을 적용하고 과다 시도에는 `429`와 `Retry-After`를 반환
- 전역 JSON/urlencoded 본문 크기를 `256kb`로 제한하고, 초과 요청은 `413 PAYLOAD_TOO_LARGE`로 응답
- Logger Storage / 공유 NAS 경로를 root 경계 검사 공용 헬퍼로 통일해 탐색/복사/삭제 traversal을 차단
- 요청 상세는 파일 결과/복사 진행/액션 다이얼로그를 분리 컴포넌트로 정리하고, 상세 조회 N+1 쿼리를 배치 조회로 교체
- 프론트는 401 전역 처리, confirm/dialog 일원화, Drawer/Toast/로그인 오류 접근성, 감사 로그 단일 조회 모델, 통계 오류 배너를 반영
- `start.sh`는 프론트 준비 상태를 폴링한 뒤 브라우저를 열고, `create-app.sh`는 외부 포트 프로세스를 강제 종료하지 않음
- 모노레포 기준 TypeScript / `@types/node` 버전을 정렬하고 lockfile을 갱신
- 2026-03-24 기준 감사 로드맵 A/B/C 실행 항목은 모두 반영 완료. 다음 우선순위는 feature flag 기반 clip 기능 도입 준비

관련 기록:

- `./improvement-plan.md`

---

## 5. 데이터/스키마 상태

현재 마이그레이션 파일:

1. `001_initial_schema.sql`
2. `002_seed_channel_mappings.sql`
3. `003_add_user_passwords.sql`
4. `004_add_copy_progress.sql`
5. `005_add_request_templates.sql`
6. `006_move_sales_manager_to_items.sql`
7. `007_add_resend_logs.sql`
8. `008_drop_request_templates.sql`
9. `009_add_editing_status_and_copy_job_delete_meta.sql`

현재 주요 스키마 상태:

- `users.password_hash` 존재
- `requests.status`에 `editing` 존재
- `request_items.sales_manager`는 항목 단위에 존재
- `copy_jobs.total_bytes`, `progress_bytes` 존재
- `copy_jobs.deleted_at`, `deleted_by` 존재
- `resend_logs` 존재
- `request_templates`는 제거됨

상세 스키마 문서:

- `./db-schema.md`

---

## 6. 현재 문서 기준

| 문서 | 역할 |
|---|---|
| `./comprehensive-audit-roadmap-20260324.md` | 현재 오픈 버그/리스크/수정 로드맵 기준 |
| `./current-priority-map-20260324.md` | 문서 역할과 작업 경계 기준 |
| `./db-schema.md` | 현재 스키마 기준 |
| `./file-matching-spec.md` | 현재 파일 탐색/매칭 규칙 기준 |
| `./improvement-plan.md` | 2026-03-23 개선 작업 기록 |
| `./bug-report-20260406.md` | 2026-04-06 전체 기능 버그 점검 보고서 (Critical 4건 / Major 7건 / Minor 4건) |
| `./clip-extraction-design.md` | 미래 광고 구간 자동 컷팅 설계 |
| `./clip-extraction-implementation-plan.md` | 미래 광고 구간 자동 컷팅 구현 계획 + ON/OFF 전략 |

---

## 7. 현재 확인된 핵심 리스크

핵심 리스크는 아래 문서에서 관리한다.

- `./comprehensive-audit-roadmap-20260324.md`

2026-03-24 기준 Phase 0 반영 완료:

- `ad_team` 요청 목록/상세 권한 격리
- `/requests/:id/resend` 소유권 검증
- 로그인 세션 `regenerate()` 적용
- `monitoring_time` 제출 정규화
- `match_score === 100` 강제 완화
- `approveRequest()` 상태 덮어쓰기 방지

현재 우선순위가 높은 오픈 항목:

- 세션/환경변수 보안 보강
- 배포/백업 스크립트 문제
- FK 정합성 및 문서 드리프트

---

## 8. 현재 문서상 주의점

### `project-status.md`에 대해

이 문서는 더 이상 “작업 역사 전체”를 누적 기록하는 용도로 사용하지 않는다.

앞으로는:

- 현재 상태가 바뀌면 스냅샷 기준으로 갱신
- 자세한 이슈 우선순위는 감사 문서에서 관리
- 미래 기능 설계는 별도 설계 문서에서 관리

### 현재 없는 기능을 완료로 오해하면 안 되는 항목

- 마운트 제어 UI/API
- 시스템 설정 UI/API
- 광고 구간 자동 컷팅
- feature flag 기반 기능 ON/OFF

---

## 12. 2026-04-06 회원가입 기능 추가

### 구현 완료

- **설계 문서**: `.claude/docs/signup-feature-design.md`
- **DB 마이그레이션 012**: `user_registrations` 테이블 + `users.assigned_channels` 컬럼
- **백엔드**
  - `POST /api/auth/register` — 공개 신청 엔드포인트 (IP rate-limit 포함)
  - `GET /api/registrations` — 신청 목록 (역할 기반 필터)
  - `GET /api/registrations/pending-count` — 대기 건수 (뱃지용)
  - `POST /api/registrations/:id/approve` — 승인 (users 테이블 INSERT)
  - `POST /api/registrations/:id/reject` — 반려 (사유 기록)
- **프론트엔드**
  - `/register` — 회원가입 신청 화면 (공개)
  - `/registrations` — 신청 승인 화면 (tech_team + admin)
  - `GlobalNav` — 신청 승인 메뉴 + 대기 건수 뱃지 (1분 폴링)
  - `LoginPage` — "회원가입 신청" 링크 추가

### 승인 권한 구조

| 신청 역할 | 승인 가능자 |
|---|---|
| ad_team | tech_team, admin |
| tech_team | admin |
| admin | admin |

### 주의사항

- `admin` 역할 신청은 회원가입 화면에서 불가 (선택지에서 제외)
- `assigned_channels`는 DB에 JSON 문자열로 저장, 파싱은 프론트에서 처리
- 기존 `users` 테이블은 `assigned_channels = '[]'` 기본값으로 마이그레이션됨

---

## 9. 다음 권장 작업 (2026-04-03 업데이트)

### 운영 재설계 완료 (2026-04-03 작업 완료)

1. ~~운영 재설계 작업 계획 실행~~ → **Phase 1~5 전체 완료**
   - ✅ Phase 1: NAS → 서버 로컬 스토리지 전환 (`LOCAL_DELIVERY_PATH`, copy.service.ts 수정)
   - ✅ Phase 2: 웹 다운로드 (`GET /api/requests/:id/items/:itemId/download`, RequestDetailPage 버튼)
   - ✅ Phase 3: 자동 정리 서비스 (delivery-cleanup.service.ts, index.ts 1시간 간격 스케줄러)
   - ✅ Phase 4: Excel 내보내기 (`GET /api/requests/export-excel`, RequestListPage 버튼)
   - ✅ Phase 5: 화면 레이블 정리 (GlobalNav, UserManagementPage 역할 운영 명칭으로 변경)

### 다음 순서

2. 감사 문서 기준 나머지 Phase 항목 수정
3. `db-schema.md`, `HOW_TO_RUN.md`, `CLAUDE.md` 현행화
4. `system_settings` 기반 feature flag 추가
5. 광고 구간 자동 컷팅 기능 착수

---

## 10. 2026-04-03 운영 재설계 주요 결정

### 아키텍처 방향

**NAS 제거, 서버 로컬 스토리지로 전환**

```
기존: Logging Storage → NAS → 사용자 별도 NAS 웹 접속 다운로드
변경: Logging Storage → 서버 로컬 디스크 (1일 자동 정리) → 웹 다운로드
```

### 역할 정리

- `ad_team` → "채널 담당자" (입력만 담당)
- `tech_team` → "대표 담당자" (검수/승인/관리)
- `admin` → "시스템 관리자"

기존 role 코드는 변경 없음. 화면 표시명만 정리.

### 신규 기능

1. **웹 다운로드**: `/api/requests/:id/items/:itemId/download` — 완료 파일 브라우저 다운로드
2. **자동 정리**: 1일 경과 파일 자동 삭제 (copy_jobs.deleted_at 기록)
3. **Excel 내보내기**: `/api/requests/export-excel` — 요청 목록을 CSV로 다운로드 (보고용)

---

## 11. 한 줄 요약

현재 프로젝트는 핵심 요청 흐름이 완성되었고, 이제 운영 병목(NAS 의존성, 수동 재입력)을 제거하고 웹 기반 다운로드로 전환하는 마지막 정리 단계에 진입한 상태다.
