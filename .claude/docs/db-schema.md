# 데이터베이스 스키마 현재 기준

> 작성일: 2026-03-24
> 기준:
> - `backend/src/config/migrations/001~009`
> - 로컬 DB 실제 스키마 확인 (`sqlite3`)
> 목적: 현재 런타임 기준 테이블, 관계, 상태값, 주의사항을 한 문서에 정리

---

## 1. 요약

현재 DB는 SQLite 단일 파일 구조이며, 서버 기동 시 마이그레이션이 자동 적용된다.

현재 존재 테이블:

- `users`
- `channel_mappings`
- `channel_mapping_histories`
- `requests`
- `request_items`
- `file_search_results`
- `copy_jobs`
- `resend_logs`
- `audit_logs`
- `mount_logs`
- `schema_migrations`

현재 제거된 테이블:

- `request_templates`

현재 아직 없는 테이블:

- `system_settings`
- `clip_jobs`

---

## 2. 마이그레이션 이력 요약

| 번호 | 파일 | 핵심 내용 |
|---|---|---|
| 001 | `001_initial_schema.sql` | 기본 9개 테이블 + 인덱스 생성 |
| 002 | `002_seed_channel_mappings.sql` | 초기 채널 매핑 시드 |
| 003 | `003_add_user_passwords.sql` | `users.password_hash` 추가 |
| 004 | `004_add_copy_progress.sql` | `copy_jobs.total_bytes`, `progress_bytes` 추가 |
| 005 | `005_add_request_templates.sql` | 요청 템플릿 테이블 추가 |
| 006 | `006_move_sales_manager_to_items.sql` | `sales_manager`를 `request_items`로 이동 |
| 007 | `007_add_resend_logs.sql` | `resend_logs` 추가 |
| 008 | `008_drop_request_templates.sql` | `request_templates` 제거 |
| 009 | `009_add_editing_status_and_copy_job_delete_meta.sql` | `requests.status=editing`, `copy_jobs.deleted_at/deleted_by` 추가 |

---

## 3. 현재 상태값 / ENUM 기준

### 3-1. `users.role`

- `admin`
- `tech_team`
- `ad_team`

### 3-2. `requests.status`

- `pending`
- `searching`
- `search_done`
- `approved`
- `copying`
- `editing`
- `done`
- `failed`
- `rejected`

### 3-3. `request_items.item_status`

- `pending`
- `searching`
- `search_done`
- `approved`
- `copying`
- `done`
- `failed`
- `rejected`

### 3-4. `copy_jobs.status`

- `pending`
- `copying`
- `done`
- `failed`

### 3-5. `mount_logs.storage_type`

- `logger_storage`
- `shared_nas`

### 3-6. `mount_logs.action`

- `mount`
- `unmount`

### 3-7. `mount_logs.status`

- `success`
- `failed`

### 3-8. `mount_logs.triggered_by`

- `startup`
- `shutdown`
- `admin`
- `system`

---

## 4. 논리 관계 요약

핵심 관계:

- `users` 1:N `requests`
- `requests` 1:N `request_items`
- `channel_mappings` 1:N `request_items`
- `request_items` 1:N `file_search_results`
- `request_items` 1:N `copy_jobs`
- `file_search_results` 1:N `copy_jobs`
- `requests` 1:N `resend_logs`
- `channel_mappings` 1:N `channel_mapping_histories`
- `users` 1:N `channel_mapping_histories`

느슨한 감사 관계:

- `audit_logs.user_id -> users.id`
- `audit_logs.entity_type/entity_id`는 느슨한 참조

---

## 5. 테이블 상세

## 5-1. `users`

사용자 계정과 역할 관리.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER PK | 사용자 ID |
| `username` | TEXT UNIQUE | 로그인 계정명 |
| `display_name` | TEXT | 화면 표시명 |
| `role` | TEXT | 역할 |
| `is_active` | INTEGER | 활성 여부 (`1/0`) |
| `password_hash` | TEXT | bcrypt 해시 |
| `created_at` | TEXT | 생성 시각 |
| `updated_at` | TEXT | 수정 시각 |

주요 인덱스:

- `idx_users_username`
- `idx_users_role`

## 5-2. `channel_mappings`

Logger Storage 경로용 채널명과 화면 표시명/NAS 폴더명 매핑.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER PK | 채널 매핑 ID |
| `storage_folder` | TEXT UNIQUE | Logger Storage 폴더명 |
| `display_name` | TEXT | 화면 표시명 |
| `nas_folder` | TEXT | 공유 NAS 폴더명 |
| `description` | TEXT nullable | 설명 |
| `is_active` | INTEGER | 활성 여부 (`1/0`) |
| `created_at` | TEXT | 생성 시각 |
| `updated_at` | TEXT | 수정 시각 |

주요 인덱스:

- `idx_channel_mappings_storage_folder`
- `idx_channel_mappings_is_active`

## 5-3. `channel_mapping_histories`

채널 매핑 변경 이력.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER PK | 이력 ID |
| `channel_mapping_id` | INTEGER FK | 대상 채널 |
| `changed_by` | INTEGER FK | 변경 사용자 |
| `field_name` | TEXT | 변경 필드명 |
| `old_value` | TEXT nullable | 변경 전 값 |
| `new_value` | TEXT nullable | 변경 후 값 |
| `changed_at` | TEXT | 실제 변경 시각 |
| `created_at` | TEXT | 생성 시각 |

주요 인덱스:

- `idx_channel_mapping_histories_mapping_id`

## 5-4. `requests`

요청 헤더. 상태는 요청 전체 단위로 관리한다.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER PK | 요청 ID |
| `requester_id` | INTEGER FK | 요청자 |
| `request_memo` | TEXT nullable | 요청 전체 메모 |
| `status` | TEXT | 요청 전체 상태 |
| `reviewed_by` | INTEGER FK nullable | 승인/반려 사용자 |
| `reviewed_at` | TEXT nullable | 승인/반려 시각 |
| `reject_reason` | TEXT nullable | 반려 사유 |
| `is_deleted` | INTEGER | 소프트 삭제 여부 (`1/0`) |
| `deleted_at` | TEXT nullable | 삭제 시각 |
| `created_at` | TEXT | 생성 시각 |
| `updated_at` | TEXT | 수정 시각 |

주요 인덱스:

- `idx_requests_requester_id`
- `idx_requests_status`
- `idx_requests_created_at`
- `idx_requests_active`

주의:

- `sales_manager`는 더 이상 `requests`에 없고 `request_items`에 있다.

## 5-5. `request_items`

요청의 개별 행. 채널/광고주/시간대를 행 단위로 저장한다.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER PK | 항목 ID |
| `request_id` | INTEGER FK | 소속 요청 |
| `channel_mapping_id` | INTEGER FK | 채널 매핑 |
| `sales_manager` | TEXT | 영업담당자 |
| `advertiser` | TEXT | 광고주 |
| `broadcast_date` | TEXT | 방송일자 (`YYYY-MM-DD`) |
| `req_time_start` | TEXT | 탐색 시간대 시작 (`HH:MM`) |
| `req_time_end` | TEXT | 탐색 시간대 종료 (`HH:MM`) |
| `monitoring_time` | TEXT | 송출 시각 (`HH:MM` 또는 `HH:MM:SS`) |
| `item_memo` | TEXT nullable | 항목 메모 |
| `item_status` | TEXT | 항목 상태 |
| `sort_order` | INTEGER | 요청 내 정렬 순서 |
| `created_at` | TEXT | 생성 시각 |
| `updated_at` | TEXT | 수정 시각 |

주요 인덱스:

- `idx_request_items_request_id`
- `idx_request_items_channel_date`
- `idx_request_items_status`

## 5-6. `file_search_results`

자동 파일 탐색 결과 목록.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER PK | 결과 ID |
| `request_item_id` | INTEGER FK | 대상 요청 항목 |
| `file_path` | TEXT | 원본 절대 경로 |
| `file_name` | TEXT | 파일명 |
| `file_size_bytes` | INTEGER nullable | 파일 크기 |
| `file_start_time` | TEXT nullable | 파일 시작 시각 (`HH:MM:SS`) |
| `file_end_time` | TEXT nullable | 파일 종료 시각 (`HH:MM:SS`) |
| `file_mtime` | TEXT nullable | 파일 수정 시각 |
| `match_score` | INTEGER | 0~100 점수 |
| `match_reason` | TEXT nullable | 매칭 근거 |
| `is_selected` | INTEGER | 최종 선택 여부 (`1/0`) |
| `created_at` | TEXT | 생성 시각 |
| `updated_at` | TEXT | 수정 시각 |

주요 인덱스:

- `idx_file_search_results_item_id`
- `idx_file_search_results_selected`

## 5-7. `copy_jobs`

선택된 파일의 공유 NAS 복사 작업 추적.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER PK | 복사 작업 ID |
| `request_item_id` | INTEGER FK | 대상 요청 항목 |
| `file_search_result_id` | INTEGER FK | 선택된 탐색 결과 |
| `source_path` | TEXT | 원본 경로 |
| `dest_path` | TEXT | 대상 경로 |
| `status` | TEXT | 복사 상태 |
| `approved_by` | INTEGER FK nullable | 승인 사용자 |
| `approved_at` | TEXT nullable | 승인 시각 |
| `started_at` | TEXT nullable | 복사 시작 시각 |
| `completed_at` | TEXT nullable | 완료 시각 |
| `error_message` | TEXT nullable | 실패 메시지 |
| `retry_count` | INTEGER | 재시도 횟수 |
| `total_bytes` | INTEGER nullable | 전체 파일 크기 |
| `progress_bytes` | INTEGER | 현재 진행 바이트 |
| `deleted_at` | TEXT nullable | 삭제 처리 시각 |
| `deleted_by` | INTEGER FK nullable | 삭제 처리 사용자 |
| `created_at` | TEXT | 생성 시각 |
| `updated_at` | TEXT | 수정 시각 |

주요 인덱스:

- `idx_copy_jobs_status`
- `idx_copy_jobs_request_item`

## 5-8. `resend_logs`

완료 요청에 대한 재전송 이력.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER PK | 재전송 이력 ID |
| `request_id` | INTEGER FK | 대상 요청 |
| `reason` | TEXT | 재전송 사유 |
| `requested_by` | INTEGER FK | 재전송 요청 사용자 |
| `requested_by_name` | TEXT | 요청자 표시명 스냅샷 |
| `created_at` | TEXT | 생성 시각 |

주요 인덱스:

- `idx_resend_logs_request_id`

## 5-9. `audit_logs`

전역 감사 로그. 불변 로그 성격으로 사용한다.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER PK | 로그 ID |
| `user_id` | INTEGER FK nullable | 행위 사용자 |
| `action` | TEXT | 행위 코드 |
| `entity_type` | TEXT nullable | 대상 엔티티 종류 |
| `entity_id` | INTEGER nullable | 대상 엔티티 ID |
| `detail` | TEXT nullable | 추가 상세 정보 |
| `ip_address` | TEXT nullable | 요청 IP |
| `created_at` | TEXT | 생성 시각 |

주요 인덱스:

- `idx_audit_logs_user_id`
- `idx_audit_logs_entity`
- `idx_audit_logs_action`
- `idx_audit_logs_created_at`

현재 코드에서 실제 사용되는 주요 action 예시:

- `user_login`
- `user_logout`
- `user_create`
- `user_update`
- `user_password_change`
- `user_password_reset`
- `request_create`
- `request_approve`
- `request_reject`
- `request_delete`
- `request_resend`
- `request_item_correct`
- `search_done`
- `search_failed`
- `item_search_done`
- `item_search_failed`
- `copy_start`
- `copy_done`
- `copy_failed`
- `copied_file_delete`
- `copied_file_delete_for_correction`

## 5-10. `mount_logs`

스토리지 마운트/언마운트 이력.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER PK | 로그 ID |
| `storage_type` | TEXT | 스토리지 종류 |
| `action` | TEXT | `mount` / `unmount` |
| `status` | TEXT | `success` / `failed` |
| `triggered_by` | TEXT | `startup` / `shutdown` / `admin` / `system` |
| `triggered_user_id` | INTEGER FK nullable | 관리자 직접 조작 시 사용자 |
| `mount_point` | TEXT nullable | 마운트 경로 |
| `error_message` | TEXT nullable | 실패 메시지 |
| `created_at` | TEXT | 생성 시각 |

주요 인덱스:

- `idx_mount_logs_created_at`
- `idx_mount_logs_storage_action`

주의:

- 테이블은 남아 있지만 현재 앱 런타임에서 mount 제어 API/화면은 연결되어 있지 않다.

## 5-11. `schema_migrations`

적용된 마이그레이션 파일 이력.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `filename` | TEXT PK | 마이그레이션 파일명 |
| `applied_at` | TEXT | 적용 시각 |

---

## 6. 현재 확인된 스키마 주의사항

### 6-1. `requests_old` FK 잔존 문제

2026-03-24 기준 이 이슈는 정리되었다.

- migration `010_normalize_timestamps_to_utc.sql`에서
  `requests`, `request_items`, `file_search_results`, `copy_jobs`, `resend_logs`를
  최신 FK 정의로 재구성했다.
- `backend/src/config/database.ts`는 서버 기동 시 `PRAGMA foreign_key_check`를 실행한다.

현재 기준:

- `PRAGMA foreign_key_check` 통과를 서버 부팅 조건으로 강제한다.
- FK가 깨진 DB는 서버가 즉시 기동 실패한다.

### 6-2. 시간 저장 형식 혼재

스키마는 대부분 `TEXT` 시각 컬럼을 사용한다.

2026-03-24 기준 현재 정책은 다음과 같이 정리되었다.

- 저장: UTC ISO 8601 문자열
- 화면/기간 해석: KST 기준
- 레거시 `YYYY-MM-DD HH:MM:SS` KST 문자열은 migration `010`에서 UTC ISO로 정규화

신규 스키마 기본값도 `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` 기준으로 갱신되었다.

### 6-3. mount 관련 잔존 스키마

`mount_logs` 테이블은 남아 있으나 현재 백엔드 라우터/프론트 화면에는 mount 제어 기능이 연결되어 있지 않다.

즉:

- 스키마는 존재
- 현재 사용자 기능으로는 직접 노출되지 않음

---

## 7. 제거/미구현 항목 정리

제거됨:

- `request_templates`

아직 미구현:

- `system_settings`
- `clip_jobs`
- feature flag 기반 관리자 ON/OFF
- 광고 구간 자동 컷팅 결과 추적 스키마

관련 미래 설계:

- `./clip-extraction-design.md`
- `./clip-extraction-implementation-plan.md`

---

## 8. 한 줄 요약

현재 DB는 요청/파일탐색/복사/재전송/감사 로그까지 핵심 흐름을 담고 있고, 2026-03-24 기준으로 FK 정합성과 시간 저장 정책도 UTC 저장/KST 표시 원칙으로 정리된 상태다.
