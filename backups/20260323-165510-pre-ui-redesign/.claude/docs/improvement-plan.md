# 광고증빙시스템 개선사항 분석 및 구현 계획

**작성일**: 2026-03-23 | **원문 출처**: `ad-check_improvement.txt`

---

## 개선사항 개요

| # | 개선사항 | 범주 | 난이도 | 상태 |
|---|---------|------|--------|------|
| 1 | 목록 복사/붙여넣기 기능 | UX 개선 | 낮음 | 완료 |
| 2 | 템플릿 기능 제거 | 기능 정리 | 매우 낮음 | 완료 |
| 3 | 날짜 입력 UX 개선 | UX 개선 | 낮음 | 완료 |
| 4 | 요청 등록 화면 입력 방법 공지 | UX 개선 | 매우 낮음 | 완료 |
| 5 | 과거 영상 파일 삭제 | 기능 확장 | 중간 | 완료 |
| 6 | 오전송 수정 기능 | 기능 확장 | 높음 | 완료 |
| 7 | 통계 집계 단위 수정 | 버그 수정 | 낮음 | 완료 |

## 구현 결과 요약 (2026-03-23)

- `RequestNewPage.tsx`
  - 안내 박스 추가
  - 행 단위 복사/붙여넣기 추가
  - 날짜 입력 UI는 기존 필드 형태 유지
- `backend/src/config/migrations/008_drop_request_templates.sql`
  - 미사용 `request_templates` 테이블 제거
- `backend/src/config/migrations/009_add_editing_status_and_copy_job_delete_meta.sql`
  - `requests.status`에 `editing` 추가
  - `copy_jobs.deleted_at`, `deleted_by` 추가
- `backend/src/modules/files/storage-cleanup.service.ts`
  - 공유 NAS 파일 삭제 / 빈 날짜 폴더 정리 / 삭제 메타데이터 기록
- `backend/src/modules/files/storage-cleanup.router.ts`
  - `DELETE /api/files/copied-files/:copyJobId`
- `backend/src/modules/requests/requests.service.ts`, `requests.router.ts`
  - `PATCH /api/requests/:id/items/:itemId`
  - 오전송 수정 후 단일 항목 재탐색
  - `editing` 상태용 재복사 준비
- `backend/src/modules/copy/copy.service.ts`
  - 삭제된 복사본은 중복 복사 차단 대상에서 제외
  - `editing` 요청의 복사 실패 시 요청 상태 유지
- `backend/src/modules/stats/stats.router.ts`
  - `/summary`, `/monthly`, `/daily`를 요청 항목 기준으로 전환
- `frontend/src/pages/RequestDetailPage.tsx`
  - 완료 항목 파일 삭제
  - 오전송 수정 폼
  - `editing` 상태 배너 및 수정 항목 재복사 UI
- `frontend/src/pages/StatsDashboardPage.tsx`
  - "요청 N건" → "항목 N건" 라벨 정리
- `frontend/src/pages/ManualPage.tsx`
  - 템플릿 안내 제거
  - 요청 등록 UX / 파일 삭제 / 오전송 수정 / 요청 수정중 상태 반영

## 검증 결과

- `pnpm build` 통과
- Backend TypeScript 빌드 통과
- Frontend TypeScript + Vite 빌드 통과

---

## 개별 개선사항 상세

### #1 목록 복사/붙여넣기

**요구사항**: 요청 등록 폼에서 같은 내용을 행 단위로 빠르게 복제 가능하게

**수정 파일**
- `frontend/src/pages/RequestNewPage.tsx`

**구현 내용**
- 각 행 오른쪽에 `복사`, `붙여넣기`, `삭제` 버튼 추가
- `복사` 클릭 시 현재 행 값을 임시 저장
- `붙여넣기` 클릭 시 저장된 값을 해당 행 바로 아래에 삽입
- 최대 행 수(`20`) 제한 유지
- 동작 결과는 토스트로 안내

**백엔드 변경**: 없음 (API 동일)

**타 기능 영향**: 없음

---

### #2 템플릿 기능 제거

**요구사항**: 기존 계획된 요청 템플릿 기능 제거

**실제 상태 (코드 확인)**
- `request_templates` 테이블이 `migration 005`에 의해 생성되어 있음
- 해당 테이블을 사용하는 서비스/라우터/프론트 코드가 전혀 없음
- 즉, "제거"라기보다 DB 정리 작업

**수정 파일**
- 신규 파일: `backend/src/config/migrations/008_drop_request_templates.sql`

**구현 내용**
```sql
-- 템플릿 기능 미구현 결정에 따라 테이블 제거
DROP TABLE IF EXISTS request_templates;
```

**타 기능 영향**: 없음

---

### #3 날짜 입력 UX 개선

**요구사항**
- 날짜 입력 시 키패드(숫자) 직접 입력 가능
- 캘린더에서 더블클릭 시 즉시 선택

**수정 파일**
- `frontend/src/pages/RequestNewPage.tsx` (L315-327, 현재 `<input type="date">` 사용)

**구현 방안**
- `type="date"` → `type="text" inputMode="numeric"` + 입력 포맷 마스크 (`YYYY-MM-DD` 자동 변환)
- 또는 `react-datepicker` 등 커스텀 컴포넌트 도입 (더블클릭 선택 지원)
- 직접 입력 시 `YYYY-MM-DD` 형식 유효성 검사 강화 필요

**주의사항**
- `type="date"` 교체 시 `react-hook-form` `register` 방식 변경 필요
- 기존 자정 넘김 감지(`isMidnightCross`) 로직과 호환성 확인

**타 기능 영향**
- `#4 입력 방법 공지`와 같은 화면 → 연속 작업 권장

---

### #4 요청 등록 화면 입력 방법 공지

**요구사항**: 요청 등록 화면에 다음 안내 문구 추가
- 동시간대에 송출되었더라도, 송출시간이 다르면 각각 입력
- 광고주에는 회사명만 입력
- 기타 추가할 내용은 메모란에 입력

**수정 파일**
- `frontend/src/pages/RequestNewPage.tsx` (항목 테이블 상단, L209 근처)

**구현 내용**
- 파란색 정보 박스(`bg-blue-50 border-blue-200`) 형태로 안내 문구 삽입
- 기존 `monitoring_time` 범위 외 경고 UI와 일관된 스타일 사용

**타 기능 영향**: 없음

---

### #5 과거 영상 파일 삭제

**요구사항**
- 공유 NAS(타깃 스토리지) 내에 과거 요청된 영상 삭제
- 목록화 후 선택 삭제
- 요청 기록(DB)은 유지, 영상(물리 파일)만 삭제
- 요청일자 폴더도 같이 삭제 (빈 폴더인 경우)

**신규 파일**
- `backend/src/modules/files/storage-cleanup.service.ts` — NAS 파일 물리 삭제 유틸리티
- `backend/src/modules/files/storage-cleanup.router.ts` — 삭제 API

**수정 파일**
- `frontend/src/pages/RequestListPage.tsx` 또는 신규 관리 화면 — 삭제 UI
- `frontend/src/lib/apiService.ts` — 삭제 API 함수 추가

**주요 로직**
- `copy_jobs.dest_path` 기준으로 실제 파일 존재 여부 확인 후 삭제
- 삭제 후 `copy_jobs` 상태 업데이트 필요 (재전송 중복 방지 우회 방지)
- 폴더 내 다른 파일이 없을 때만 요청일자 폴더 삭제
- 삭제 이력 `audit_logs`에 기록

**충돌 주의사항**

| 충돌 | 상세 |
|------|------|
| 재전송(resend)과 충돌 | 파일 삭제 후 재전송 시, `copy_jobs.status='done'`이면 `copySingleFile()`이 skip → 삭제 시 status를 'deleted'로 변경하거나 별도 플래그 필요 |
| 폴더 공유 문제 | 같은 날짜 폴더에 다른 요청 파일이 있을 수 있음 → `fs.readdir()` 후 빈 폴더 확인 후 삭제 |

**#6과의 공유**: NAS 파일 물리 삭제 유틸리티를 `storage-cleanup.service.ts`로 분리하여 #6에서 재사용

---

### #6 오전송 수정 기능

**요구사항**
- 예: funE채널을 입력해야 하는데 라이프 채널로 전송 완료까지 된 경우
- 여러 건 중 해당 항목만 수정 가능하게
- 목적지 폴더 내 오전송된 영상 삭제 후 새로 전송
- 오전송된 내역은 DB에서 삭제

**신규 API**
- `PATCH /api/requests/:id/items/:itemId` — 개별 항목 채널/시간대 수정 + 재탐색 트리거

**수정 파일**
- `backend/src/modules/requests/requests.service.ts` — 개별 항목 수정 함수 추가
- `backend/src/modules/requests/requests.router.ts` — 신규 엔드포인트 추가
- `backend/src/modules/copy/copy.service.ts` — 중복 방지 로직 수정 (done 상태 job 무효화)
- `frontend/src/pages/RequestDetailPage.tsx` — 개별 항목 "수정" 버튼 + 수정 폼
- `frontend/src/lib/apiService.ts` — 신규 API 함수

**상태 머신 변경 사항**
- 현재: 요청 전체가 단일 상태
- 변경 후: `done` 상태 요청에서도 개별 항목 수정 가능 → 혼합 상태 처리 규칙 설계 필요
  - 예: 5개 항목 중 1개 수정 중일 때 request.status = ?

**"DB 삭제" 요구사항 처리 방안**
- 요구사항 원문: "오전송된 내역은 DB에서 삭제"
- 현재 시스템 원칙: 소프트 삭제 (감사 추적 유지)
- 권장: `resend_logs`에 오전송 이력 보존 → 원본 `request_items` 행 수정 (채널/시간대 덮어쓰기)
- 물리 삭제는 감사 추적 불가 → 사용자와 확인 필요

**#5와의 공유**
- NAS 파일 물리 삭제 → `storage-cleanup.service.ts` 재사용

---

### #7 통계 집계 단위 수정

**요구사항**: 요청 목록 건수가 아니라, 요청 항목(개별 광고주/시간대) 건수 기준으로 통계 집계

**현재 상태 (코드 확인)**

| 엔드포인트 | 현재 집계 기준 | 변경 필요 |
|-----------|--------------|---------|
| `/summary` (L69) | `COUNT(*) FROM requests` | **변경 필요** |
| `/monthly` (L127) | `COUNT(*) FROM requests` | **변경 필요** |
| `/daily` (L163) | `COUNT(*) FROM requests` | **변경 필요** |
| `/by-channel` (L206) | `COUNT(ri.id) FROM request_items` | 이미 항목 기준 |
| `/by-advertiser` (L234) | `COUNT(ri.id) FROM request_items` | 이미 항목 기준 |
| `/by-sales-manager` (L264) | `COUNT(ri.id) FROM request_items` | 이미 항목 기준 |
| `/export-csv` (L294) | 항목 단위 행 | 이미 항목 기준 |

**수정 파일**
- `backend/src/modules/stats/stats.router.ts` — `/summary`, `/monthly`, `/daily` SQL 수정
- `frontend/src/pages/StatsDashboardPage.tsx` — "요청 N건" → "항목 N건" 라벨 수정

**타 기능 영향**: 없음 (읽기 전용 통계)

---

## 기능 간 상호 영향

```
#1 복사/붙여넣기  ─┐
#3 날짜 UX        ─┼─ 모두 RequestNewPage.tsx 수정 → 연속 작업 권장
#4 입력 방법 공지 ─┘

#5 파일 삭제 ─┐
#6 오전송 수정 ─┘── NAS 파일 물리 삭제 유틸리티 공유 (storage-cleanup.service.ts)

#2, #7 → 독립적. 다른 기능에 영향 없음
```

---

## 구현 우선순위 (권장 순서)

| 순서 | 항목 | 근거 |
|------|------|------|
| 1 | **#2 템플릿 제거** | 마이그레이션 1개만. 즉시 처리 |
| 2 | **#4 입력 방법 공지** | 정적 텍스트. 즉시 처리 |
| 3 | **#7 통계 단위 수정** | SQL 3개 + 라벨. 독립적 |
| 4 | **#1 복사/붙여넣기** | RequestNewPage만. 독립적 |
| 5 | **#3 날짜 UX** | #1과 같은 화면. 연속 작업 |
| 6 | **#5 파일 삭제** | 신규 API+화면. #6 전 선행 필요 |
| 7 | **#6 오전송 수정** | 가장 복잡. #5 유틸리티 재사용 |

---

## 수정 파일 전체 목록

### 신규 생성
- `backend/src/config/migrations/008_drop_request_templates.sql`
- `backend/src/modules/files/storage-cleanup.service.ts` (#5, #6 공용)
- `backend/src/modules/files/storage-cleanup.router.ts`

### 수정
- `frontend/src/pages/RequestNewPage.tsx` (#1, #3, #4)
- `frontend/src/pages/RequestDetailPage.tsx` (#6)
- `frontend/src/pages/StatsDashboardPage.tsx` (#7)
- `frontend/src/lib/apiService.ts` (#5, #6)
- `backend/src/modules/stats/stats.router.ts` (#7)
- `backend/src/modules/requests/requests.service.ts` (#6)
- `backend/src/modules/requests/requests.router.ts` (#6)
- `backend/src/modules/copy/copy.service.ts` (#5, #6)
- `backend/src/app.ts` (#5 라우터 등록)
