# 회원가입 기능 설계 문서

> 작성일: 2026-04-06
> 작업 범위: 회원가입 신청 + 역할 기반 승인 흐름 전체

---

## 1. 배경 및 목적

기존에는 사용자 계정을 admin이 직접 생성했다.
이 구조에서는 신규 담당자가 합류할 때마다 admin의 수동 작업이 필요했다.

이번 기능은:
- 신규 사용자가 직접 회원가입 신청을 할 수 있게 한다.
- 역할에 따라 적절한 권한자가 신청을 승인/반려할 수 있게 한다.
- 승인 전까지는 로그인 불가 (pending 상태).

---

## 2. 역할 매핑 (시스템 코드 ↔ 화면 표시명)

| role 코드 | 화면 표시명 | 설명 |
|---|---|---|
| `ad_team` | 채널 담당자 | 요청 등록만 가능 |
| `tech_team` | 대표 담당자 | 요청 검토/승인/복사 실행 |
| `admin` | 시스템 관리자 | 모든 권한 |

---

## 3. 승인 권한 매핑

| 신청자 역할 | 승인 가능 역할 |
|---|---|
| `ad_team` | `tech_team`, `admin` |
| `tech_team` | `admin` |
| `admin` | `admin` |

- `tech_team`은 자신보다 하위인 `ad_team` 신청만 처리 가능.
- `admin`은 모든 역할 신청 처리 가능.
- 승인 시 `user_registrations` → `users` 테이블로 계정 이동.

---

## 4. 신규 테이블: `user_registrations`

회원가입 신청 정보를 보관한다.
승인 시 `users`로 복사되고, `user_registrations`의 status는 `approved`로 변경된다.
물리 삭제 없음 — 이력 보존 목적.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER PK | 신청 ID |
| `username` | TEXT UNIQUE | 신청 아이디 |
| `display_name` | TEXT | 이름 |
| `role` | TEXT | 신청 역할 (`admin`, `tech_team`, `ad_team`) |
| `password_hash` | TEXT | bcrypt 해시 |
| `assigned_channels` | TEXT | 담당채널 (JSON 배열, 예: `["비즈","스포츠"]`) |
| `status` | TEXT | `pending` / `approved` / `rejected` |
| `reviewed_by` | INTEGER FK | 처리한 사용자 ID (nullable) |
| `reviewed_at` | TEXT | 처리 시각 UTC ISO (nullable) |
| `reject_reason` | TEXT | 반려 사유 (nullable) |
| `created_at` | TEXT | 신청 시각 UTC ISO |
| `updated_at` | TEXT | 수정 시각 UTC ISO |

인덱스:
- `idx_user_registrations_status`
- `idx_user_registrations_role`
- `idx_user_registrations_username` (UNIQUE)

### users 테이블 변경

| 추가 컬럼 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `assigned_channels` | TEXT | `'[]'` | 담당채널 (JSON 배열) |

---

## 5. API 설계

### 5-1. 공개 엔드포인트 (비인증)

```
POST /api/auth/register
```

요청 바디:
```json
{
  "username": "aduser01",
  "display_name": "홍길동",
  "role": "ad_team",
  "password": "비밀번호6자이상",
  "assigned_channels": ["비즈", "스포츠"]
}
```

응답:
- `201` 신청 완료
- `409` username 이미 신청 중 또는 기존 계정 존재
- `429` 단시간 내 과다 신청 (IP 기반 제한)

### 5-2. 신청 목록 조회

```
GET /api/registrations?status=pending&role=ad_team
```

권한: `tech_team`, `admin`
- `tech_team`: `ad_team` 신청만 조회 가능
- `admin`: 전체 조회 가능

응답: `{ registrations: [...], total: N }`

### 5-3. 대기 건수 조회 (뱃지용)

```
GET /api/registrations/pending-count
```

권한: `tech_team`, `admin`
응답: `{ count: N }`

### 5-4. 승인

```
POST /api/registrations/:id/approve
```

권한: 역할 기반 (위 3번 참고)
동작:
1. `user_registrations.status` 확인 → `pending`이 아니면 오류
2. 승인자 역할 ↔ 신청 역할 조합 검증
3. `users` 테이블에 계정 INSERT
4. `user_registrations.status = 'approved'` 업데이트
5. 감사 로그 기록 (`registration_approved`)

### 5-5. 반려

```
POST /api/registrations/:id/reject
```

요청 바디: `{ reason: string }`
권한: 역할 기반
동작:
1. `user_registrations.status = 'rejected'` 업데이트
2. 감사 로그 기록 (`registration_rejected`)

---

## 6. 프론트엔드 화면

### 6-1. RegisterPage (`/register`) — 공개

- 필드: 이름, 아이디, 비밀번호, 비밀번호 확인, 역할 선택, 담당채널 다중 선택
- 담당채널: `GET /api/channels` 조회 후 표시명으로 체크박스 선택
- 제출 후: "신청이 완료되었습니다. 승인 후 로그인 가능합니다." 메시지 + 로그인 링크
- 로그인 화면에서 "회원가입 신청" 링크로 진입

### 6-2. RegistrationListPage (`/registrations`) — tech_team + admin

- 대기 목록 테이블 (기본 `status=pending`)
- 탭/필터: 전체 / 대기 / 승인 / 반려
- 각 행: 이름, 아이디, 역할, 담당채널, 신청일, 상태, 승인/반려 버튼
- 반려 시 사유 입력 모달
- tech_team은 ad_team 신청만 노출됨 (백엔드에서 필터링)

### 6-3. GlobalNav 변경

- `admin`: 기존 관리자 메뉴 드롭다운에 "신청 승인" 항목 추가
- `tech_team`: 별도 "신청 승인" 네비 링크 표시 (드롭다운 없이 직접 링크)
- 대기 건수 > 0 이면 붉은 뱃지 표시 (양쪽 모두)

---

## 7. 영향도 요약

| 파일 | 변경 유형 |
|---|---|
| `012_add_user_registrations.sql` | 신규 |
| `registrations.service.ts` | 신규 |
| `registrations.router.ts` | 신규 |
| `RegisterPage.tsx` | 신규 |
| `RegistrationListPage.tsx` | 신규 |
| `auth.router.ts` | 수정 (register 엔드포인트 추가) |
| `users.service.ts` | 수정 (assigned_channels 필드) |
| `users.router.ts` | 수정 (assigned_channels 파싱) |
| `app.ts` | 수정 (registrationsRouter 등록) |
| `types/index.ts` | 수정 (Registration, assigned_channels) |
| `apiService.ts` | 수정 (register/registrations API) |
| `App.tsx` | 수정 (/register 공개 라우트, RequireTechOrAdmin) |
| `GlobalNav.tsx` | 수정 (신청 승인 메뉴, 뱃지) |
| `LoginPage.tsx` | 수정 (회원가입 링크) |

변경 없음:
- `auth.middleware.ts`, `requests.router.ts`, `channels.router.ts`, `AuthContext.tsx`

---

## 8. 주의사항

- `POST /api/auth/register`는 공개 엔드포인트이므로 IP 기반 신청 횟수 제한 필요
  - 동일 IP에서 10분 내 3회 초과 신청 시 429 반환
- username 중복 체크: `users` 테이블과 `user_registrations(status=pending/approved)` 양쪽 확인
- `assigned_channels`는 DB에 JSON 문자열로 저장, 서비스 레이어에서 배열로 파싱
- 기존 사용자(seed 계정 등)의 `assigned_channels` 기본값은 `'[]'`
- 승인 후 초기 비밀번호: 신청 시 입력한 비밀번호 그대로 사용 (admin이 추후 초기화 가능)
