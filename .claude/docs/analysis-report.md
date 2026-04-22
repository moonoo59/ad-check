# ad-check 프로젝트 전체 분석 리포트

> 작성일: 2026-03-08
> 분석 범위: Phase 1 전체 구현 코드, 설계 문서, DB 스키마, API, Frontend
> 목적: 현황 파악 → 버그/갭 정리 → 로드맵 수립

---

## 목차

1. [현재 구현 상태](#1-현재-구현-상태)
2. [발견된 버그 및 이슈](#2-발견된-버그-및-이슈)
3. [워크플로우 갭 분석](#3-워크플로우-갭-분석)
4. [아키텍처 강점과 약점](#4-아키텍처-강점과-약점)
5. [개발 로드맵](#5-개발-로드맵)

---

## 1. 현재 구현 상태

### 1-1. 전체 완료 여부

| 모듈 | 문서상 상태 | 실제 상태 | 비고 |
|------|:-----------:|:---------:|------|
| 프로젝트 기반 (모노레포, TypeScript, SQLite) | 완료 | 완료 | |
| DB 스키마 (마이그레이션 001~004) | 완료 | 완료 | 9개 테이블 |
| 인증 (로그인/로그아웃/세션/역할) | 완료 | 완료 | bcrypt, MemoryStore |
| 채널 매핑 관리 (CRUD + 이력) | 완료 | 완료 | |
| 요청 등록/목록/상세 API | 완료 | 완료 | |
| 파일 탐색 (백그라운드, 매칭 알고리즘) | 완료 | 완료 | setImmediate |
| 파일 복사 (스트림 기반, 진행률) | 완료 | 완료 | 50MB/5% 단위 갱신 |
| 구조화 로거 (파일 + 콘솔, 날짜별) | 완료 | 완료 | |
| Frontend 화면 1~4 (요청/채널/상세) | 완료 | 완료 | |
| **마운트 제어 모듈 (화면 5)** | **완료** | **미구현** | 아래 상세 기술 |
| 사용자 관리 화면/API | - | 없음 | seed 계정 3개만 존재 |
| 감사 로그 조회 화면/API | - | 없음 | DB 기록만 됨 |

### 1-2. 현재 접근 가능한 화면 경로

| 경로 | 화면 | 권한 |
|------|------|------|
| `/login` | 로그인 | 비로그인 |
| `/requests` | 요청 목록 | 전 역할 |
| `/requests/new` | 요청 등록 | 전 역할 |
| `/requests/:id` | 요청 상세 + 파일 탐색 결과 | 전 역할 |
| `/admin/channels` | 채널 매핑 관리 | admin |
| `/manual` | 매뉴얼 | 전 역할 |
| `/admin/mount` | 마운트 제어 | **라우트 없음 — 접근 불가** |

### 1-3. 백엔드 API 등록 현황

| 라우터 | 경로 | `app.ts` 등록 |
|--------|------|:------------:|
| health | `/api/health` | 등록됨 |
| auth | `/api/auth` | 등록됨 |
| channels | `/api/channels` | 등록됨 |
| requests | `/api/requests` | 등록됨 |
| **mount** | **`/api/mount`** | **미등록** |

---

## 2. 발견된 버그 및 이슈

### 2-1. Critical — 미구현 (완료로 잘못 기록됨)

---

#### [BUG-1] 마운트 제어 모듈 전체 누락

**심각도**: Critical
**영향**: 서비스 실 운영 불가

프로젝트 상태 문서(`project-status.md`)에는 "4단계/5단계 완료"로 기록되어 있으나,
아래 파일들이 실제로 존재하지 않는다.

| 누락 파일 / 경로 | 영향 |
|-----------------|------|
| `backend/src/modules/mount/mount.service.ts` | macOS 마운트 제어 로직 없음 |
| `backend/src/modules/mount/mount.router.ts` | API 엔드포인트 없음 |
| `app.ts` — `/api/mount` 라우터 등록 | 백엔드 미연결 |
| `frontend/src/pages/MountControlPage.tsx` | UI 화면 없음 |
| `App.tsx` — `/admin/mount` 라우트 | 프론트 접근 불가 |
| `apiService.ts` — mount 관련 API 함수들 | 호출 불가 |

**실질적 결과**

- Logger Storage / 공유 NAS 마운트·언마운트를 UI에서 전혀 제어할 수 없다.
- `보안 핵심 요구사항`(사용 시에만 마운트)이 달성되지 않는다.
- 마운트가 되어 있지 않으면 파일 탐색이 실패하는데, 이를 해결할 화면이 없다.

**미구현된 API 목록** (설계 문서 기준)

```
GET  /api/mount/status                    — 마운트 상태 조회
GET  /api/mount/logs                      — 마운트 이력 (admin)
POST /api/mount/logger-storage/mount      — Logger Storage 마운트
POST /api/mount/logger-storage/unmount    — Logger Storage 언마운트
POST /api/mount/shared-nas/mount          — 공유 NAS 마운트
POST /api/mount/shared-nas/unmount        — 공유 NAS 언마운트
```

---

### 2-2. High — 버그

---

#### [BUG-2] 복사 실패 후 재시도 경로 없음

**파일**: [RequestDetailPage.tsx:312](../../frontend/src/pages/RequestDetailPage.tsx)

```typescript
// 문제: 변수명 'isDone'이 copying 상태까지 포함
const isDone = detail.status === 'done' || detail.status === 'copying';
```

`isDone`이 `true`이면 액션바 전체가 숨겨진다.
`copying` 중에는 올바른 동작이지만, 복사가 실패해서 `failed` 상태가 된 이후의
재처리 경로에 문제가 있다.

**현재 복사 실패 이후 흐름**

```
복사 실패 → status = 'failed'
  → "탐색 재시도" 버튼만 표시
  → 기존 파일 선택 결과 초기화
  → 탐색 → 파일 재선택 → 재승인 → 복사
```

**기대하는 흐름** (추가 필요)

```
복사 실패 → status = 'failed'
  → "복사 재시도" 버튼 (파일 선택 유지, 재승인만)
  → 또는 "탐색 재시도" 선택 가능
```

---

#### [BUG-3] 날짜 필터 UTC/KST 불일치

**파일**: [requests.service.ts:217-220](../../backend/src/modules/requests/requests.service.ts)

```typescript
// DB는 new Date().toISOString() → UTC로 저장
// 필터는 KST 기준 날짜 문자열 (예: "2026-03-08")

params.push(filter.from + 'T00:00:00.000Z');  // 실제로는 KST 09:00 이후를 의미
params.push(filter.to   + 'T23:59:59.999Z');  // 실제로는 다음날 KST 08:59:59 의미
```

**예시**

```
사용자 입력: from = 2026-03-08
실제 조회:   created_at >= 2026-03-08T00:00:00.000Z
           = 2026-03-08 09:00:00 KST 이후부터 조회

결과: 2026-03-08 00:00 ~ 08:59 KST 사이 등록 요청이 조회에서 누락됨
```

---

### 2-3. Medium — 불완전한 기능

---

#### [ISSUE-1] React Fragment key 누락

**파일**: [RequestDetailPage.tsx:478](../../frontend/src/pages/RequestDetailPage.tsx)

```tsx
// 바깥 Fragment에 key가 없어 React 콘솔 경고 발생
<>
  {isLowScore && <tr key={`warn-${file.id}`}>...</tr>}
  <tr key={file.id}>...</tr>
</>
```

`map()` 내부에서 복수 요소를 반환할 때는 `<React.Fragment key={...}>` 사용 필요.

---

#### [ISSUE-2] sort 파라미터 타입만 있고 미구현

**프론트 타입** (`types/index.ts:171`): `sort?: 'created_at_desc' | 'created_at_asc' | 'id_desc' | 'id_asc'`
**백엔드** (`requests.service.ts:251`): `ORDER BY r.created_at DESC` 하드코딩
**프론트 UI**: sort 선택 UI 없음

---

#### [ISSUE-3] 요청자 필터 UI 미완성

**파일**: [RequestListPage.tsx:200-204](../../frontend/src/pages/RequestListPage.tsx)

tech_team / admin이 특정 요청자를 필터할 수 있어야 하나,
현재는 "전체 요청자 조회 중" 텍스트만 표시됨. 실제 드롭다운 없음.

---

#### [ISSUE-4] 사용자 관리 기능 없음

`users` 테이블과 seed 데이터(3명)는 존재하나, 아래 기능이 없다.

- 사용자 추가 / 역할 변경 / 비활성화 API
- 비밀번호 변경 API
- 관리자 화면 (사용자 목록, 수정 폼)

신규 직원 추가 시 DB 파일 직접 수정 필요 → 운영 위험.

---

#### [ISSUE-5] 감사 로그 조회 화면 없음

로그인/로그아웃/요청 생성·승인·반려/복사/채널 매핑 변경 등
모든 이벤트가 `audit_logs` 테이블에 기록되나, 조회 API와 화면이 없다.

---

### 2-4. Low — 코드 품질

---

#### [ISSUE-6] development 환경 verbose SQL 로깅

**파일**: [database.ts:29](../../backend/src/config/database.ts)

```typescript
verbose: env.NODE_ENV === 'development' ? console.log : undefined,
```

구조화 로거(`logger.ts`)를 사용하지 않고 `console.log`를 직접 사용.
모든 SQL이 콘솔에 출력되나 파일 로그에는 기록되지 않음.

---

#### [ISSUE-7] `isDone` 변수명 오해 유발

**파일**: [RequestDetailPage.tsx:312](../../frontend/src/pages/RequestDetailPage.tsx)

```typescript
const isDone = detail.status === 'done' || detail.status === 'copying';
//    ^^^^^^ 이름은 'isDone'인데 'copying'도 포함 — 의미 불명확
```

`isActionDisabled` 또는 `isCompleteOrCopying` 같은 이름이 적절.

---

## 3. 워크플로우 갭 분석

### 3-1. 정상 플로우 (현재 동작 확인됨)

```
광고팀: 요청 등록 (/requests/new)
  → 자동 파일 탐색 시작 (백그라운드, setImmediate)
  → 기술팀: 목록에서 'search_done' 확인
  → 기술팀: 상세 화면에서 파일 선택 (라디오, 즉시 API 호출)
  → 기술팀: 전체 승인 클릭
  → 자동 파일 복사 (스트림, 진행률 표시, 10초 폴링)
  → 완료 (done)
```

### 3-2. 워크플로우 갭

| # | 시나리오 | 현재 상태 | 문제 |
|---|----------|-----------|------|
| 1 | 서비스 시작 전 스토리지 마운트 | UI 없음 | 관리자가 macOS에서 직접 마운트해야 함 |
| 2 | 마운트 상태 확인 | UI 없음 | 탐색 실패 시 원인 파악 불가 |
| 3 | 복사 실패 후 복사 재시도 | 없음 | 탐색 전체 재실행만 가능 |
| 4 | 신규 사용자 추가 | DB 직접 | 운영 중 인원 변경 시 위험 |
| 5 | 광고주별 / 채널별 이력 검색 | 없음 | 기간 + 상태 필터만 존재 |
| 6 | 감사 이력 확인 | 없음 | DB에 쌓이지만 볼 방법 없음 |
| 7 | 복사 중 언마운트 발생 | 감지 없음 | 복사 실패만 기록, 경고 없음 |

---

## 4. 아키텍처 강점과 약점

### 강점

| 항목 | 설명 |
|------|------|
| 모듈 분리 | files / copy / mount / requests / channels 독립 — 변경 영향 최소화 |
| 파일 매칭 알고리즘 | 자정 넘김 처리, monitoring_time 포함 여부, 겹침 비율까지 3단계 점수화 |
| 보안 | Keychain 자격증명, httpOnly 세션 쿠키, 역할별 API 접근 제어 |
| 복사 안정성 | 스트림 기반 복사, 중복 방지(done 상태 확인), 진행률 DB 추적 |
| 마이그레이션 자동화 | 서버 기동 시 멱등 실행, 실패 시 서버 기동 중단 |
| 감사 로그 구조 | 모든 주요 이벤트 기록, 느슨한 FK로 삭제 후에도 이력 보존 |

### 약점

| 항목 | 설명 |
|------|------|
| 타임존 불일치 | DB 저장(UTC) vs 날짜 필터(KST) 불일치 → 경계 날짜 오차 |
| 세션 저장소 | MemoryStore — 서버 재시작 시 전원 재로그인 필요 |
| 에러 복구 경로 | 복사 실패 후 원스텝 재시도 없음 |
| 마운트 모듈 누락 | 운영 핵심 기능 미구현 |
| 사용자 관리 없음 | 운영 중 계정 변경 불가 |

---

## 5. 개발 로드맵

### Phase 1.5 — 긴급 보완

> 실 운영을 위한 최소 필수 항목. 현재 진행 우선.

| 우선순위 | 작업 | 영역 | 예상 파일 |
|:--------:|------|------|-----------|
| 1 | **마운트 제어 모듈 구현** | Full-stack | `mount.service.ts`, `mount.router.ts`, `MountControlPage.tsx`, `App.tsx`, `apiService.ts` |
| 2 | **복사 재시도 UI 추가** | Full-stack | `requests.router.ts`, `copy.service.ts`, `RequestDetailPage.tsx` |
| 3 | **날짜 필터 타임존 처리 통일** | Backend | `requests.service.ts` |
| 4 | React Fragment key 수정 | Frontend | `RequestDetailPage.tsx` |
| 5 | `isDone` 변수명 정리 | Frontend | `RequestDetailPage.tsx` |

---

### Phase 2 — 운영 고도화

> 실 운영 중 불편 해소. 서비스 안정화 이후 진행.

#### 관리 기능

| 작업 | 설명 |
|------|------|
| 사용자 관리 화면/API | 추가 / 비밀번호 변경 / 역할 수정 / 비활성화 |
| 감사 로그 조회 화면 | admin 전용, 이벤트 유형 / 날짜 / 사용자 필터 |
| 비밀번호 변경 화면 | 일반 사용자 본인 변경 가능 |

#### 검색 / 필터

| 작업 | 설명 |
|------|------|
| 요청 목록 — 요청자 필터 드롭다운 | tech_team/admin이 특정 광고팀 멤버 필터 |
| 정렬 기능 | created_at ASC/DESC, id 기준 |
| 광고주 자동완성 | 기존 요청 데이터 기반 |

#### 운영 편의

| 작업 | 설명 |
|------|------|
| 요청 템플릿 저장 | 자주 쓰는 요청 조합 저장 / 불러오기 (`request_templates` 테이블 추가) |
| 통계 대시보드 | 월별 / 채널별 / 광고주별 요청 건수, 처리 시간, 실패 건수 |
| CSV 내보내기 | 요청 목록 필터 결과 다운로드 |
| 브라우저 알림 | 탐색 완료 / 복사 완료 시 Notification API |
| 마운트 이상 감지 | 복사 중 언마운트 실시간 감지 + 경고 배너 |
| DB 백업 스크립트 | 일일 자동 `.db` 파일 복사 (cron 또는 `start.sh` 연동) |

---

### Phase 3 — 확장 서비스

> 별도 서버 이전 후 본격화. 중장기 목표.

| 작업 | 설명 | 기술 |
|------|------|------|
| 광고 구간 추출 | 1시간 AVI에서 광고 시점만 클립 추출 | `ffmpeg`, `clip_jobs` 테이블 추가 |
| 시청률 연동 | 광고 송출 시점의 시청률 환경 제공 (효과 단정 아님) | D+1 데이터 수신 구조 |
| 대화형 조회 | "대웅제약 지난달 요청 보여줘" 등 자연어 → DB 조회 | Claude API |
| 별도 서버 이전 | 상시 서비스 전환, Nginx 리버스 프록시 | PostgreSQL 검토 |
| 멀티 파일 선택 | 한 항목에 복수 파일 복사 | `is_selected` → 1:N 구조 변경 |

---

## 부록: 즉시 착수 권장 순서

```
1. [BUG-1] 마운트 모듈 구현
   — 실 운영의 전제 조건. 이것 없이는 안정적 사용 불가.

2. [BUG-3] 날짜 필터 타임존 처리
   — 데이터 오염 위험. 빠를수록 좋음.

3. [BUG-2] 복사 재시도 UI
   — 복사 실패 시 대응 방법이 없는 워크플로우 갭 해소.

4. [ISSUE-1] React Fragment key
   — 콘솔 경고 정리. 작은 수정.

5. Phase 2 사용자 관리
   — 시드 계정 3개로는 실 운영 불가. 초기 운영 시작 전 완료 필요.
```
