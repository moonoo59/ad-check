# 광고 구간 자동 컷팅/복사 기능 설계서

> 작성일: 2026-03-24
> 목적: 초 단위 광고 송출 시각을 기준으로, 지정 길이의 광고 구간에 앞뒤 버퍼를 붙여 자동 추출 후 공유 NAS로 전달하는 기능의 기술 설계를 정의한다.
> 연관 문서:
> - `./comprehensive-audit-roadmap-20260324.md`
> - `./file-matching-spec.md`
> - `./improvement-plan.md`
> - `./clip-extraction-implementation-plan.md`

---

## 1. 배경

현재 시스템은 다음 흐름으로 동작한다.

1. 광고팀이 요청 항목을 등록한다.
2. 기술팀이 Logger Storage에서 매칭 파일을 선택한다.
3. 승인 후 원본 1시간 AVI 파일 전체를 공유 NAS로 복사한다.

향후 고도화 목표는 “원본 파일 전체 전달”이 아니라, 광고 송출 시각을 기준으로 필요한 구간만 자동으로 잘라 전달하는 것이다.

예시:

- 광고 송출 시각: `11:12:00`
- 광고 길이: `30초`
- 앞 버퍼: `5초`
- 뒤 버퍼: `5초`
- 실제 추출 구간: `11:11:55 ~ 11:12:35`

이 기능은 단순 복사 기능 추가가 아니라 아래를 함께 바꾼다.

- 시간 입력 계약
- 요청 항목 스키마
- 파일 선택 이후 처리 파이프라인
- 삭제/재전송 규칙
- 감사 로그와 운영 추적 방식

---

## 2. 목표와 비목표

### 2-1. 목표

- `monitoring_time`을 `HH:MM:SS` 기준으로 표준화한다.
- 요청 항목마다 광고 길이와 버퍼를 저장할 수 있게 한다.
- 선택된 원본 파일에서 광고 구간만 자동 추출한다.
- 추출 결과물을 기존 공유 NAS 전달 흐름에 연결한다.
- 실패 원인을 “탐색 실패 / 추출 실패 / 복사 실패”로 구분 추적한다.
- 기존 전체 파일 복사 기능과 공존 가능하게 설계한다.

### 2-2. 비목표

- V1에서 여러 원본 파일을 자동으로 이어 붙여 한 클립으로 만드는 기능은 포함하지 않는다.
- V1에서 복수 클립 추출, 장면 분석, OCR, 시청률 연동은 포함하지 않는다.
- V1에서 기술팀 없이 광고팀이 직접 클립을 확정하는 자동 승인 기능은 포함하지 않는다.

---

## 3. 핵심 전제

### 3-1. 용어 정의

| 용어 | 의미 |
|---|---|
| `탐색 시간대` | 원본 파일 후보를 찾기 위한 넓은 범위. 현재 `req_time_start ~ req_time_end` |
| `송출 시각` | 광고 시작 시각. 앞으로 `monitoring_time`은 이 의미로 고정 |
| `광고 길이` | 광고 실제 길이(초). 예: 15 / 30 / 45 |
| `버퍼` | 광고 앞뒤로 추가 확보할 여유 시간(초) |
| `클립 구간` | `송출 시각 - 앞 버퍼` 부터 `송출 시각 + 광고 길이 + 뒤 버퍼` 까지 |

### 3-2. 중요한 가정

- `monitoring_time`은 “광고 시작 시각”으로 본다.
- V1은 원본 파일 1개 안에서 클립 구간이 완전히 포함되는 경우만 자동 추출한다.
- 클립 추출 엔진은 `ffmpeg`를 사용한다.
- 기존 “원본 전체 파일 복사”는 레거시/예외 대응용으로 유지한다.

### 3-3. 이 가정이 바뀌면 다시 설계해야 하는 것

- `monitoring_time`이 광고 중간 시각 또는 종료 시각이면 클립 계산식이 바뀐다.
- 한 광고가 파일 경계를 넘는 경우까지 자동 처리하려면 `2개 파일 병합 후 추출` 흐름이 필요하다.
- 원본과 동일 코덱/컨테이너를 강제하면 `ffmpeg` 출력 정책과 재생 호환성 기준이 달라진다.

---

## 4. 권장 제품 방향

### 4-1. 요청 항목 단위 모드

요청 항목마다 전달 방식을 선택 가능하게 둔다.

| 모드 | 설명 | 권장 사용처 |
|---|---|---|
| `full_file` | 기존처럼 원본 파일 전체 복사 | 예외 대응, 파일 경계 초과, 긴급 수동 처리 |
| `clip_with_buffer` | 광고 구간 자동 컷팅 후 복사 | 기본 권장 모드 |

권장 기본값:

- 신규 요청 기본값: `clip_with_buffer`
- 기존 데이터/기존 화면과의 호환을 위해 `full_file`도 유지

### 4-2. 시간 입력 정책

- `monitoring_time` 저장 포맷은 `HH:MM:SS`로 통일한다.
- UI에서도 초까지 입력 가능한 형태로 바꾼다.
- 과거 `HH:MM` 데이터는 마이그레이션에서 `:00`을 붙여 `HH:MM:SS`로 정규화한다.
- `req_time_start`, `req_time_end`는 탐색 범위이므로 당장은 `HH:MM` 유지 가능하다.

### 4-3. 운영 배포 전략

- 기능은 구현 후 바로 전면 사용하지 않을 수 있으므로, 관리자 화면에서 `ON/OFF` 가능한 feature flag 전략을 전제로 한다.
- 권장 구현 계획은 `./clip-extraction-implementation-plan.md`를 따른다.
- 기본 배포 상태는 `OFF`를 권장한다.

---

## 5. 사용자 흐름

### 5-1. 광고팀 요청 등록

광고팀은 각 항목에 아래를 입력한다.

- 채널
- 영업담당자
- 광고주
- 방송일자
- 탐색 시간대 시작/종료
- 송출 시각 `HH:MM:SS`
- 전달 방식
- 광고 길이
- 앞 버퍼 / 뒤 버퍼
- 메모

권장 UX:

- 전달 방식이 `full_file`이면 길이/버퍼 입력을 비활성화
- 전달 방식이 `clip_with_buffer`이면 길이/버퍼 입력을 활성화
- `monitoring_time`은 `11:12:00` 형태 placeholder 제공
- 길이 preset은 `15 / 20 / 30 / 45 / 60`
- 버퍼 기본값은 `앞 5초 / 뒤 5초`

### 5-2. 기술팀 파일 선택

기술팀은 기존처럼 후보 파일을 검토한다.

추가로 보여줄 정보:

- 계산된 클립 구간
- 선택 파일 안에 클립 구간이 완전히 포함되는지 여부
- 파일 시작/종료와의 거리

선택 파일이 클립 구간을 완전히 포함하지 못하면:

- V1에서는 승인 버튼 비활성화 또는 강한 경고 후 `full_file` 전환 유도

### 5-3. 승인 후 처리

`clip_with_buffer` 항목의 승인 후 내부 흐름:

1. 선택된 원본 파일 검증
2. 클립 구간 계산
3. `ffmpeg`로 로컬 임시 파일 추출
4. 추출 성공 시 NAS로 복사
5. 복사 성공 시 완료 처리

`full_file` 항목은 기존 복사 흐름을 유지한다.

### 5-4. 재전송/수정/삭제

- 오전송 수정 시 기존 클립 결과물과 원본 복사 결과물을 각각 정리해야 한다.
- 삭제 시 “원본 전체 전달물 삭제”와 “클립 전달물 삭제”를 같은 UI에서 다루되, 내부 로그는 구분한다.
- 재전송 시 클립 모드는 “재추출 후 재복사”가 기본이다.

---

## 6. 데이터 모델 설계

## 6-1. `request_items` 확장

권장 컬럼 추가:

| 컬럼 | 타입 | 예시 | 설명 |
|---|---|---|---|
| `delivery_mode` | TEXT | `full_file`, `clip_with_buffer` | 전달 방식 |
| `ad_duration_seconds` | INTEGER | `15`, `30`, `45` | 광고 길이 |
| `pre_buffer_seconds` | INTEGER | `5` | 앞 버퍼 |
| `post_buffer_seconds` | INTEGER | `5` | 뒤 버퍼 |

권장 제약:

- `delivery_mode IN ('full_file', 'clip_with_buffer')`
- `ad_duration_seconds > 0`
- `pre_buffer_seconds >= 0`
- `post_buffer_seconds >= 0`

주의:

- `monitoring_time`은 기존 컬럼 그대로 사용하되 저장 규칙을 `HH:MM:SS`로 표준화한다.

## 6-2. 신규 `clip_jobs` 테이블

`copy_jobs`는 “전달 결과물 복사” 추적용으로 유지하고, 광고 구간 추출은 별도 `clip_jobs`로 분리한다.

권장 이유:

- 추출 실패와 복사 실패를 분리할 수 있다.
- 삭제/재전송/감사 로그가 더 명확해진다.
- 이후 “클립만 재생성”과 “NAS 재복사”를 독립 실행할 수 있다.

권장 스키마:

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER PK | 클립 작업 ID |
| `request_item_id` | INTEGER FK | 어느 요청 항목인지 |
| `file_search_result_id` | INTEGER FK | 어떤 원본 파일을 기준으로 했는지 |
| `source_path` | TEXT | 원본 파일 절대 경로 |
| `temp_output_path` | TEXT | 로컬 임시 추출 파일 경로 |
| `output_file_name` | TEXT | 최종 결과 파일명 |
| `output_format` | TEXT | 예: `mp4` |
| `clip_start_at` | TEXT | 절대 시각 ISO 문자열 |
| `clip_end_at` | TEXT | 절대 시각 ISO 문자열 |
| `clip_duration_seconds` | INTEGER | 실제 출력 길이 |
| `monitoring_time` | TEXT | 요청 당시 송출 시각 스냅샷 |
| `ad_duration_seconds` | INTEGER | 요청 당시 광고 길이 스냅샷 |
| `pre_buffer_seconds` | INTEGER | 요청 당시 앞 버퍼 스냅샷 |
| `post_buffer_seconds` | INTEGER | 요청 당시 뒤 버퍼 스냅샷 |
| `engine` | TEXT | 예: `ffmpeg` |
| `engine_args` | TEXT nullable | 실행 파라미터 요약 또는 JSON |
| `status` | TEXT | `pending`, `clipping`, `done`, `failed` |
| `error_message` | TEXT nullable | 실패 사유 |
| `started_at` | TEXT nullable | 시작 시각 |
| `completed_at` | TEXT nullable | 종료 시각 |
| `created_at` | TEXT | 생성 시각 |
| `updated_at` | TEXT | 수정 시각 |

권장 인덱스:

- `(request_item_id, created_at DESC)`
- `(status, created_at DESC)`
- `(file_search_result_id)`

## 6-3. `copy_jobs` 확장

권장 컬럼 추가:

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `clip_job_id` | INTEGER nullable FK | 클립 결과물 기반 복사인 경우 연결 |
| `delivery_mode` | TEXT | `full_file` 또는 `clip_with_buffer` 스냅샷 |

의미:

- `full_file` 모드면 `clip_job_id = NULL`
- `clip_with_buffer` 모드면 `clip_job_id`가 채워지고 `source_path`는 임시 클립 파일 경로가 된다.

## 6-4. `audit_logs` 액션 코드 추가

권장 추가 액션:

- `clip_start`
- `clip_done`
- `clip_failed`
- `clip_delete`
- `clip_retry_requested`
- `clip_retry_done`

---

## 7. 파일 경로와 산출물 정책

### 7-1. 임시 클립 저장 위치

권장:

`~/Library/Application Support/AdCheck/clips/tmp/`

이유:

- 앱 재기동과 로그/DB 경로 정책과 일관적이다.
- 원본 Logger Storage, 공유 NAS와 분리되어 관리가 쉽다.

### 7-2. 최종 NAS 경로

기존 정책을 최대한 유지한다.

```text
{SHARED_NAS_MOUNT}/{nas_folder}/{요청일자 YYYY-MM-DD}/{결과파일명}
```

예시:

```text
/Volumes/SharedNAS/라이프/2026-03-24/ETV_20260324_111200_ad30_pre5_post5.mp4
```

### 7-3. 파일명 규칙 권장안

권장 규칙:

```text
{source_base}_{monitoring_hhmmss}_ad{duration}s_pre{pre}_post{post}.mp4
```

예시:

```text
ETV_20260324_105955_1200_111200_ad30s_pre5_post5.mp4
```

장점:

- 추후 파일만 보고도 어떤 조건으로 추출됐는지 파악 가능
- 삭제/재전송/감사 로그 추적이 쉬움

---

## 8. 처리 파이프라인 설계

### 8-1. 승인 후 오케스트레이션

권장 오케스트레이션:

1. 요청 승인
2. 항목별 선택 파일 확인
3. 항목별 `delivery_mode` 확인
4. `full_file`
   - 기존 `copy_jobs` 생성 후 복사
5. `clip_with_buffer`
   - `clip_jobs` 생성
   - `ffmpeg` 추출 실행
   - 성공 시 `copy_jobs` 생성 후 NAS 복사

### 8-2. 작업 실행 순서

V1 권장:

- 클립 추출 concurrency = `1`
- 복사 concurrency = `1` 또는 기존 수준 유지

이유:

- 현재 운영 환경은 macOS 단일 PC다.
- `ffmpeg` 동시 실행이 여러 건 겹치면 CPU/디스크 사용량 급증으로 UI와 백엔드 응답성에 악영향이 있다.

### 8-3. 상태 표시 원칙

상위 요청 상태는 기존 상태를 최대한 유지한다.

- 추출 중도 `request.status = 'copying'`으로 재사용 가능
- 상세 화면에서는 `clip_jobs.status`를 우선 표시해 “구간 추출중”을 별도 라벨로 보여준다.

권장 이유:

- 기존 요청 상태 enum 변경 범위를 줄인다.
- API/통계/배지 연쇄 수정 규모를 줄일 수 있다.

단, UI에서는 다음 파생 상태를 보여주는 것이 좋다.

- `구간 추출 대기`
- `구간 추출중`
- `구간 추출 실패`
- `NAS 복사중`

---

## 9. 클립 구간 계산 규칙

### 9-1. 기준식

가정: `monitoring_time = 광고 시작 시각`

```text
clip_start = monitoring_datetime - pre_buffer_seconds
clip_end   = monitoring_datetime + ad_duration_seconds + post_buffer_seconds
clip_length = ad_duration_seconds + pre_buffer_seconds + post_buffer_seconds
```

예시 1:

- 송출 시각 `11:12:00`
- 광고 길이 `15`
- 버퍼 `5 / 5`

```text
clip_start = 11:11:55
clip_end   = 11:12:20
clip_length = 25초
```

예시 2:

- 송출 시각 `23:59:58`
- 광고 길이 `30`
- 버퍼 `5 / 5`

```text
clip_start = 23:59:53
clip_end   = 00:00:33 (+1일)
```

### 9-2. 파일 경계 검증

선택된 파일이 다음 조건을 만족해야 V1 자동 추출 가능:

```text
file_start <= clip_start
clip_end <= file_end
```

만약 조건을 만족하지 않으면:

- 기본 동작: `clip_jobs.status = failed`
- 사용자 메시지: “선택 파일 하나로는 요청한 구간을 모두 포함할 수 없습니다.”
- 대안 제시:
  - 다른 파일 선택
  - `full_file`로 전환

V1에서 자동 이어붙이기를 하지 않는 이유:

- 파일 2개 이상 병합 시 구현 복잡도와 운영 리스크가 크게 증가한다.
- 감사 추적, 삭제, 재전송 규칙도 함께 복잡해진다.

---

## 10. `ffmpeg` 실행 전략

### 10-1. 정확도 우선 정책

정확한 광고 증빙이 목적이므로, 단순 `-c copy`보다 “정확도 우선” 정책을 권장한다.

권장:

- 입력 후 seek
- 재인코딩 출력
- 출력 포맷은 `mp4`

예시 명령 형태:

```bash
ffmpeg -y \
  -i "$SOURCE_PATH" \
  -ss "$START_OFFSET" \
  -t "$CLIP_LENGTH" \
  -c:v libx264 -preset veryfast -crf 18 \
  -c:a aac \
  -movflags +faststart \
  "$TEMP_OUTPUT_PATH"
```

설명:

- `-ss`를 `-i` 뒤에 두면 시작 위치 정확도가 높다.
- `-c copy`는 빠르지만 키프레임 경계 때문에 시작점이 부정확할 수 있다.
- `mp4 + faststart`는 검수/재생 호환성이 좋다.

### 10-2. 운영 주의

- `ffmpeg` 바이너리 설치 여부를 앱 시작 시 점검하거나, 실행 전에 헬스체크해야 한다.
- 원본 파일 코덱이 비정상적이어도 실패 메시지를 명확히 남겨야 한다.
- 추출 실패 시 temp 파일은 정리한다.

### 10-3. 향후 최적화 가능성

- 정확도가 충분하다면 향후 일부 코덱에 한해 `-c copy` 최적화 검토 가능
- 하지만 V1은 속도보다 정확성을 우선한다.

---

## 11. API 변경안

## 11-1. 요청 등록 API

기존:

`POST /api/requests`

항목 DTO 확장:

```json
{
  "channel_mapping_id": 3,
  "sales_manager": "홍길동",
  "advertiser": "삼성전자",
  "broadcast_date": "2026-03-24",
  "req_time_start": "11:00",
  "req_time_end": "12:00",
  "monitoring_time": "11:12:00",
  "delivery_mode": "clip_with_buffer",
  "ad_duration_seconds": 30,
  "pre_buffer_seconds": 5,
  "post_buffer_seconds": 5,
  "item_memo": "메인 광고",
  "sort_order": 0
}
```

검증 규칙:

- `monitoring_time`: `HH:MM:SS` 필수
- `delivery_mode = clip_with_buffer`면 길이/버퍼 필수
- `delivery_mode = full_file`면 길이/버퍼는 기본값 저장 또는 `NULL` 정책 중 하나 선택

권장:

- 저장 일관성을 위해 `full_file`여도 숫자 필드는 기본값 저장

## 11-2. 요청 항목 수정 API

기존:

`PATCH /api/requests/:id/items/:itemId`

확장 필드:

- `delivery_mode`
- `ad_duration_seconds`
- `pre_buffer_seconds`
- `post_buffer_seconds`

주의:

- `done` 상태 항목 수정 시 기존 클립/복사 산출물 정리 정책과 연결된다.

## 11-3. 요청 상세 API

기존:

`GET /api/requests/:id`

추가 응답:

- 각 `request_item`에 `delivery_mode`, 길이, 버퍼
- 최신 `clip_job`
- 계산된 `clip_start_at`, `clip_end_at`

## 11-4. 재처리 API

권장 방향:

- 기존 `POST /api/requests/:id/retry-copy`는 유지하되 내부 의미를 “전달 재처리”로 확장
- `clip_with_buffer` 항목은
  - 클립 결과물이 없거나 실패했으면 `clip_jobs`부터 재실행
  - 클립은 성공했고 NAS 복사만 실패했으면 `copy_jobs`만 재실행

장기적으로는 아래 새 이름이 더 명확하다.

- `POST /api/requests/:id/retry-delivery`

하지만 V1은 기존 라우트를 재사용하는 편이 회귀 범위를 줄인다.

## 11-5. 삭제 API

기존 `DELETE /api/files/copied-files/:copyJobId` 외에, 향후 필요하면 아래 확장이 가능하다.

- 클립 임시 파일 정리 API
- 클립 결과물 + NAS 결과물 동시 정리 API

V1 권장:

- 외부 사용 API는 늘리지 않고, 기존 삭제 흐름 안에서 `clip_job` 연계 정리를 내부 처리한다.

---

## 12. 프론트엔드 화면 변경안

## 12-1. `RequestNewPage`

추가 필드:

- `전달 방식`
- `광고 길이`
- `앞 버퍼`
- `뒤 버퍼`

권장 배치:

- 기존 행 구조 유지
- `송출 시간` 바로 오른쪽 또는 아래에 `전달 방식 / 광고 길이 / 버퍼` 배치
- 화면 밀도 유지를 위해 버퍼는 `초` 단위 숫자 입력 2칸으로 구성

검증:

- `monitoring_time`은 `HH:MM:SS`
- 길이는 preset 셀렉트 + 직접 입력 허용 여부는 추후 결정
- 버퍼는 `0~30` 정도 제한 권장

## 12-2. `RequestDetailPage`

광고팀/기술팀 공통 표시:

- 송출 시각
- 광고 길이
- 버퍼
- 계산된 클립 구간
- 전달 방식

기술팀 전용 표시:

- 선택 파일이 클립 구간을 완전히 포함하는지
- 추출 예정 결과 파일명
- `clip_jobs.status`
- 추출 실패 메시지

수정 모드:

- 오전송 수정 시 위 필드도 함께 수정 가능해야 한다.

## 12-3. 상태 배지/진행 표시

`clip_jobs.status`를 기반으로 상세 화면에서 아래 문구를 노출한다.

- `구간 추출 대기`
- `구간 추출중`
- `구간 추출 실패`
- `구간 추출 완료`

상위 요청 배지 자체는 기존 체계를 유지해도 되지만, 상세 화면에는 중간 단계를 보여줘야 한다.

## 12-4. 매뉴얼 화면

추가해야 하는 안내:

- `monitoring_time`은 초 단위 입력
- 광고 길이와 버퍼 의미
- 자동 컷팅이 실패하는 대표 케이스
- 파일 경계 초과 시 대처 방법

---

## 13. 백엔드 모듈 구조 변경안

권장 추가 모듈:

```text
backend/src/modules/clips/
  clip.service.ts        # 클립 구간 계산, ffmpeg 실행, clip_jobs 상태 관리
  clip.types.ts          # clip DTO / 상태 타입
  clip.utils.ts          # 시간 계산, 파일명 생성, 경계 검사
```

기존 모듈과 연결:

- `files.service.ts`
  - 기존 역할 유지
  - 다만 상세 응답에서 클립 가능 여부 계산용 헬퍼를 공유할 수 있음

- `copy.service.ts`
  - 입력 source가 원본인지 클립 결과물인지 구분 가능해야 함
  - `clip_job_id` 지원

- `requests.service.ts`
  - 요청 생성/수정 시 새 컬럼 저장
  - 요청 상세 응답에 `clip_job` 병합

---

## 14. 타 기능 영향 분석

| 대상 기능 | 영향 여부 | 설명 |
|---|---|---|
| 요청 등록 | 큼 | 새 필드, 시간 입력 규칙, 검증 규칙이 바뀜 |
| 요청 상세 | 큼 | 클립 상태, 계산 구간, 실패 사유 표시 필요 |
| 파일 선택 | 큼 | “파일 범위 안에 clip 구간이 들어오는가” 검증 추가 |
| 승인/재전송 | 큼 | 복사만 하던 파이프라인이 추출+복사 2단계로 바뀜 |
| 오전송 수정 | 큼 | 수정 후 재탐색뿐 아니라 재추출 규칙도 필요 |
| 파일 삭제 | 큼 | NAS 결과물과 temp clip 정리를 분리/연계해야 함 |
| 감사 로그 | 큼 | clip 관련 액션 코드와 세부 파라미터 기록 필요 |
| 통계 | 중간 | V1은 영향 없음. 향후 clip 성공률/실패율 통계 가능 |
| 권한 정책 | 낮음 | 기존 권한 체계 재사용 가능 |
| Electron/배포 | 중간 | `ffmpeg` 설치/배포 전략이 새로 필요 |
| 백업 | 낮음 | DB 백업 대상에 `clip_jobs` 추가 |

---

## 15. 단계별 구현 로드맵

### Phase A. 계약 정리

1. `monitoring_time`을 `HH:MM:SS`로 표준화
2. UI/DTO/검증을 초 단위 기준으로 정리
3. `request_items` 새 컬럼 추가

### Phase B. 추출 엔진 도입

1. `clip_jobs` 테이블 추가
2. `clip.service.ts` 구현
3. 로컬 temp 클립 생성 및 정리 로직 구현
4. `ffmpeg` 의존성/헬스체크 추가

### Phase C. 전달 파이프라인 연결

1. `clip_jobs -> copy_jobs` 오케스트레이션 연결
2. 재전송/삭제/오전송 수정 연동
3. 감사 로그 액션 추가

### Phase D. 화면 반영

1. 등록 화면 필드 추가
2. 상세 화면 계산 구간/상태 표시
3. 매뉴얼/문서 업데이트

### Phase E. 운영 안정화

1. 파일 경계 오류 메시지 개선
2. temp 파일 청소 작업 추가
3. 실패 재시도 정책 고도화

---

## 16. 테스트 시나리오

### 16-1. 정상 케이스

- `11:12:00`, `30초`, `5/5` 버퍼 입력
- 선택 파일이 `11:11:55 ~ 11:12:35`를 완전히 포함
- `clip_job done -> copy_job done -> request done`

### 16-2. 자정 넘김

- 방송일자 `2026-03-24`
- 송출 시각 `23:59:58`
- 광고 길이 `30`
- `clip_end`가 다음날로 넘어가는지 확인

### 16-3. 파일 경계 초과

- 계산된 `clip_start`가 파일 시작보다 앞
- `clip_job failed`
- UI에 “다른 파일 선택 또는 full_file 전환” 안내 노출

### 16-4. 재전송

- 기존 `clip_job done`, `copy_job failed`
- 재처리 시 클립 재생성 없이 NAS 복사만 재실행되는지 확인

### 16-5. 오전송 수정

- 완료 항목의 채널/송출 시각/길이 수정
- 기존 클립/복사 산출물 정리 후 재탐색 -> 재추출 -> 재복사 흐름 확인

### 16-6. 삭제

- NAS 결과물 삭제 시 `copy_jobs.deleted_at` 기록
- 로컬 temp clip 정리 정책이 중복 삭제에 안전한지 확인

---

## 17. 권장 결정 사항

지금 시점에서 바로 확정해두는 것이 좋은 항목:

1. `monitoring_time`은 앞으로 `HH:MM:SS` 표준으로 간다.
2. V1은 `clip_jobs`를 별도 도입한다.
3. V1은 다중 파일 자동 병합을 하지 않는다.
4. V1 클립 출력 포맷은 `mp4`를 우선 권장한다.
5. 신규 요청 기본 전달 방식은 `clip_with_buffer`로 두되, 예외용 `full_file`은 남긴다.

---

## 18. 이 설계가 기존 감사 결과에 주는 영향

이 설계에 따라 기존 감사 문서의 아래 항목은 “미래 고도화까지 고려한 수정”으로 해석해야 한다.

- `A-05 monitoring_time 정규화 누락`
  - 단순 `HH:MM` 보정이 아니라 `HH:MM:SS` 표준화로 처리

- `A-06 / A-07 match_score=100 강제 및 저점수 파일 숨김`
  - 자동 컷팅으로 갈수록 잘못된 원본 선택의 비용이 커지므로 우선순위가 더 높다

- `A-09 / A-10 삭제/재전송/감사 추적`
  - 앞으로는 `clip_jobs`까지 포함한 이력 구조가 필요하다

- `B-01 UTC/KST 혼재`
  - 초 단위 추출 시각과 감사 로그 추적 때문에 시간 저장 정책 정리가 더 중요해진다

이 문서는 이후 구현 시 “기능 아이디어 메모”가 아니라 실제 기준 설계서로 사용한다.
