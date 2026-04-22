# 광고 구간 자동 컷팅 기능 구현 계획

> 작성일: 2026-03-24
> 목적: `clip-extraction-design.md`를 실제 구현 단위로 분해하고, 관리자 화면 ON/OFF 전략까지 포함한 실행 계획을 정의한다.
> 연관 문서:
> - `./clip-extraction-design.md`
> - `./comprehensive-audit-roadmap-20260324.md`
> - `./improvement-plan.md`

---

## 1. 결론

관리자 화면에서 기능을 `ON/OFF` 할 수 있게 구현하는 것은 가능하며, 이 기능에는 매우 적합하다.

권장 방식은 다음 3가지를 같이 적용하는 것이다.

1. DB 기반 feature flag 저장
2. 관리자 전용 “시스템 설정” 화면 제공
3. 프론트 숨김만이 아니라 백엔드에서 실제 동작을 강제 차단

즉, 화면에서 버튼을 숨기는 수준이 아니라:

- OFF면 광고팀 요청 등록 화면에서 관련 입력이 안 보여야 하고
- OFF면 API가 `clip_with_buffer` 요청을 거절해야 하며
- OFF면 승인/재전송 시 클립 추출도 실행되지 않아야 한다

이렇게 해야 운영 중 실수나 우회 호출에도 안전하다.

---

## 2. 왜 ON/OFF가 필요한가

현재 상황상 이 기능은 “구현 즉시 전면 사용”이 아니라 “준비는 해두고 나중에 켜는” 성격이다.

따라서 아래 요구가 있다.

- 코드 배포와 기능 사용 시점을 분리
- 실제 운영 전 admin만 내부 점검 가능
- 장애 시 즉시 되돌릴 수 있는 스위치 필요
- 기존 `full_file` 흐름을 유지한 채 점진 도입 가능

즉, 이 기능은 일반 CRUD보다 “릴리스 토글(feature flag)” 대상에 가깝다.

---

## 3. 권장 ON/OFF 정책

### 3-1. 가장 단순한 권장 정책

초기 버전은 아래 하나의 마스터 토글로 시작하는 것이 좋다.

| 키 | 기본값 | 의미 |
|---|---|---|
| `feature.clip_extraction.enabled` | `false` | 자동 컷팅 기능 전체 사용 가능 여부 |

OFF일 때:

- 광고팀 요청 등록 화면에서 관련 필드 미노출
- 요청 수정 화면에서 관련 필드 미노출
- 백엔드에서 `delivery_mode = clip_with_buffer` 저장 거부
- 승인/재전송 시 클립 추출 분기 비활성화
- 기존 `full_file` 흐름만 허용

ON일 때:

- 관련 UI와 API 허용
- `clip_jobs` 기반 처리 사용 가능

### 3-2. 조금 더 안전한 2단계 토글

운영 안정성을 더 높이려면 아래 2개로 나눌 수 있다.

| 키 | 기본값 | 의미 |
|---|---|---|
| `feature.clip_extraction.enabled` | `false` | UI 노출 및 신규 입력 허용 |
| `feature.clip_extraction.execution_enabled` | `false` | 실제 추출 엔진 실행 허용 |

이 방식이면:

- 먼저 UI/DB 저장만 점검
- 나중에 실제 `ffmpeg` 실행만 별도로 켜기

가능하다.

권장:

- V1 문서 기준으로는 2단계 토글이 가장 실무적이다.

### 3-3. 롤아웃용 추가 토글 후보

향후 필요 시만 추가:

| 키 | 의미 |
|---|---|
| `feature.clip_extraction.admin_preview_only` | admin만 관련 UI 사용 가능 |
| `feature.clip_extraction.default_delivery_mode` | 기본 전달 방식 (`full_file` / `clip_with_buffer`) |
| `feature.clip_extraction.allow_full_file_fallback` | 경계 초과 시 `full_file` 전환 허용 여부 |

V1에서는 토글이 너무 많으면 운영이 복잡해지므로, 처음에는 `enabled`, 필요하면 `execution_enabled`까지만 권장한다.

---

## 4. 데이터 저장 방식

## 4-1. 신규 `system_settings` 테이블 권장

현재 프로젝트에는 전역 시스템 설정 저장소가 없다.
이번 기회에 “이 기능만 위한 테이블”이 아니라, 이후 다른 기능에도 재사용 가능한 일반 설정 테이블을 두는 것이 좋다.

권장 스키마:

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER PK | PK |
| `setting_key` | TEXT UNIQUE | 설정 키 |
| `setting_value` | TEXT | 문자열 저장 값 |
| `value_type` | TEXT | `boolean`, `number`, `string`, `json` |
| `description` | TEXT nullable | 관리자 설명 |
| `updated_by` | INTEGER nullable FK | 마지막 수정 사용자 |
| `created_at` | TEXT | 생성 시각 |
| `updated_at` | TEXT | 수정 시각 |

예시 데이터:

| setting_key | setting_value | value_type |
|---|---|---|
| `feature.clip_extraction.enabled` | `false` | `boolean` |
| `feature.clip_extraction.execution_enabled` | `false` | `boolean` |

장점:

- 추후 “통계 기능 토글”, “자동 알림 토글”, “유지보수 모드” 등도 같은 구조로 확장 가능

## 4-2. 캐싱 정책

권장:

- 서버 메모리에 짧게 캐싱 가능
- 단, 관리자 설정 변경 직후 반영되어야 하므로 기본은 DB 직조회 또는 짧은 TTL 캐시 사용

V1 권장:

- 요청마다 DB 조회
- 성능 부담이 거의 없는 수준이라 구현이 단순하고 안전함

---

## 5. 관리자 화면 설계

### 5-1. 화면 위치

권장 신규 라우트:

- `/admin/system`

권장 메뉴명:

- `시스템 설정`

현재 관리자 메뉴 구조:

- 채널 매핑 관리
- 사용자 관리
- 감사 로그
- 통계 대시보드

여기에 `시스템 설정`을 추가하는 방식이 가장 자연스럽다.

### 5-2. 화면 구성

V1은 복잡한 설정 화면이 아니라 카드형 토글 화면이면 충분하다.

권장 카드:

1. `광고 구간 자동 컷팅 기능`
   - 사용 여부
   - 실제 추출 실행 여부
   - 현재 상태 설명
   - 마지막 변경자 / 변경 시각

예시 문구:

- `기능 사용`
- `실제 추출 실행`
- `OFF 상태에서는 기존 전체 파일 복사만 사용됩니다.`

### 5-3. UX 원칙

- 토글 변경 시 바로 저장
- 변경 전에 확인 다이얼로그 표시
- 변경 후 토스트 + 감사 로그 기록
- OFF 상태에서 어떤 사용자 화면이 달라지는지 설명문 제공

---

## 6. 백엔드 구현 계획

## 6-1. 신규 모듈 권장

```text
backend/src/modules/system-settings/
  system-settings.router.ts
  system-settings.service.ts
  system-settings.types.ts
```

역할:

- 설정 조회
- 설정 수정
- boolean/string parsing
- 감사 로그 기록

## 6-2. 권장 API

### 조회

`GET /api/system-settings`

권한:

- `admin`

응답 예시:

```json
{
  "items": [
    {
      "setting_key": "feature.clip_extraction.enabled",
      "setting_value": "false",
      "value_type": "boolean",
      "description": "광고 구간 자동 컷팅 기능 전체 사용 여부",
      "updated_by": 1,
      "updated_by_name": "관리자",
      "updated_at": "2026-03-24T10:00:00.000Z"
    }
  ]
}
```

### 수정

`PATCH /api/system-settings/:settingKey`

권한:

- `admin`

요청 예시:

```json
{
  "setting_value": "true"
}
```

### 선택 대안

설정이 많지 않다면 아래 전용 API도 가능하다.

- `GET /api/system-settings/clip-extraction`
- `PATCH /api/system-settings/clip-extraction`

하지만 재사용성을 생각하면 일반 설정 API가 더 낫다.

## 6-3. 기능 가드 적용 지점

기능 ON/OFF는 아래 지점에서 모두 검사해야 한다.

### 요청 등록

`POST /api/requests`

가드:

- OFF면 `delivery_mode = clip_with_buffer` 입력 거부
- `execution_enabled = false` 상태에서는 저장은 허용할지 여부를 결정해야 함

권장:

- `enabled = false`면 저장 자체를 막는다
- `enabled = true`, `execution_enabled = false`면 저장은 허용하고 실제 추출만 막는 운영 모드 가능

### 요청 항목 수정

`PATCH /api/requests/:id/items/:itemId`

가드:

- OFF면 클립 모드로 변경 불가

### 승인/재전송

`POST /api/requests/:id/approve`
`POST /api/requests/:id/retry-copy`

가드:

- `clip_with_buffer` 항목인데 `execution_enabled = false`면 실제 추출 실행 금지

### 상세 조회

`GET /api/requests/:id`

가드:

- 값은 그대로 보여주되, 기능이 OFF면 “현재 기능 비활성화 상태” 배너를 보여줄 수 있음

## 6-4. 감사 로그

설정 변경은 반드시 감사 로그에 남긴다.

권장 액션 코드:

- `system_setting_update`

detail 예시:

```text
feature.clip_extraction.enabled: false -> true
```

---

## 7. 프론트엔드 구현 계획

## 7-1. 신규 페이지

권장 파일:

- `frontend/src/pages/SystemSettingsPage.tsx`

추가 라우트:

- `App.tsx`에 `/admin/system`

추가 메뉴:

- `GlobalNav.tsx` 관리자 메뉴에 `시스템 설정`

## 7-2. 전역 설정 조회

프론트에서 필요한 이유:

- 요청 등록 화면에서 관련 필드 노출/비노출
- 요청 상세 수정 화면에서 관련 필드 노출/비노출

권장 방식:

- 로그인 후 필요한 페이지에서 설정 조회
- 또는 `AuthContext`와 별개로 `SystemSettingsContext`를 둘 수도 있음

V1 권장:

- 전역 컨텍스트까지 늘리지 말고, 필요한 화면에서 조회 + react-query 스타일 패턴 없이 기존 구조에 맞춰 간단 fetch

## 7-3. UI 동작 정책

OFF일 때:

- `RequestNewPage`에서 전달 방식/길이/버퍼 필드 숨김
- 기존 `full_file` 기반 화면만 유지
- `RequestDetailPage` 수정 폼에서도 관련 필드 숨김

ON일 때:

- 관련 필드 표시
- 상태/예정 구간/클립 정보 표시

주의:

- 화면만 숨기고 API는 열어두면 안 된다.
- 프론트는 편의용, 백엔드는 강제용이다.

---

## 8. OFF 상태에서 기존 데이터 처리 정책

이 부분이 중요하다.

관리자가 기능을 끄는 순간, 이미 저장되어 있던 `clip_with_buffer` 요청을 어떻게 처리할지 정책이 필요하다.

### 권장 기본 정책: Soft Off

OFF의 의미:

- 신규 생성/수정에서는 더 이상 사용 불가
- 이미 생성된 기존 clip 항목은 계속 조회 가능
- 이미 진행 중인 작업은 그대로 완료 가능

장점:

- 운영 중 갑자기 요청이 막히거나 고아 상태가 생기지 않음

### 비권장 초기 정책: Hard Off

OFF의 의미:

- 기존 clip 항목 승인/재전송까지 전면 차단

문제:

- 이미 접수된 요청이 처리 불가 상태가 될 수 있음

권장 결론:

- V1은 `Soft Off`
- 정말 긴급 차단이 필요하면 나중에 `execution_enabled`를 emergency stop으로 활용

---

## 9. 구현 단계

### Phase 1. 설정 인프라

1. `system_settings` 마이그레이션 추가
2. 시드 데이터 삽입
3. `system-settings` 모듈 추가
4. 관리자 설정 화면 추가

### Phase 2. 기능 가드

1. 요청 등록/수정 API에 clip feature guard 추가
2. 승인/재전송 경로에 execution guard 추가
3. 프론트 화면 노출 조건 반영

### Phase 3. 클립 기능 본체

1. `request_items` 새 컬럼 추가
2. `clip_jobs` 추가
3. `clip.service.ts` 구현
4. `copy_jobs` 연계

### Phase 4. 운영 마무리

1. 감사 로그/매뉴얼 반영
2. 관리자 화면 상태 설명 보강
3. 장애 대응 가이드 추가

---

## 10. 다른 기능 영향

| 기능 | 영향 여부 | 설명 |
|---|---|---|
| 요청 등록 | 큼 | 토글 OFF면 기존 UI 유지, ON이면 새 필드 노출 |
| 요청 상세/수정 | 큼 | 토글 상태에 따라 수정 필드와 배너 분기 필요 |
| 승인/재전송 | 큼 | 백엔드에서 토글을 기준으로 실행 분기 |
| 관리자 화면 | 중간 | 신규 시스템 설정 페이지 추가 |
| 감사 로그 | 중간 | 설정 변경 이력 추가 |
| 매뉴얼 | 중간 | 기능이 꺼져 있을 때의 동작 안내 필요 |
| 기존 full_file 흐름 | 낮음 | OFF 상태에서는 오히려 기존 흐름을 그대로 유지하는 안전장치 역할 |

---

## 11. 권장 최종안

지금 기준 가장 현실적인 구현 방향:

1. `system_settings` 테이블을 만든다.
2. `/admin/system` 화면을 만든다.
3. `feature.clip_extraction.enabled = false`로 기본 배포한다.
4. 이후 실제 준비가 되면 admin이 켠다.
5. 백엔드는 모든 주요 경로에서 이 설정을 강제 검사한다.

추가 권장:

6. 가능하면 `execution_enabled`까지 둬서 “UI는 열고 실제 추출은 막는” 점검 단계도 지원한다.

이렇게 하면 “코드는 배포됐지만 아직 사용하지 않음” 요구를 가장 안전하게 만족시킬 수 있다.
