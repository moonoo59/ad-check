# DB Schema Architect - 프로젝트 메모리

## 프로젝트 개요
- 방송 광고 증빙 요청 자동화 시스템 (내부 업무 도구)
- DB: SQLite (better-sqlite3, WAL 모드, foreign_keys=ON)
- 마이그레이션: `database.ts` 내 자동 실행 러너 구현

## 테이블 구조 요약 (Phase 1 완료)

| 테이블 | 분류 | 핵심 관계 |
|--------|------|---------|
| users | Core | 모든 행위자의 기준 |
| channel_mappings | Core | request_items, file_search_results의 채널 기준 |
| channel_mapping_histories | Audit | channel_mappings 변경 시 기록 |
| requests | Core | request_items의 부모 |
| request_items | Core | 처리 단위; file_search_results, copy_jobs의 부모 |
| file_search_results | Operation | 탐색 결과; copy_jobs에서 참조 |
| copy_jobs | Operation | 실제 복사 작업 추적 |
| mount_logs | Audit | 스토리지 접근 이력 |
| audit_logs | Audit | 전체 행위 감사 |
| schema_migrations | System | 마이그레이션 실행 이력 |

## 확정된 설계 결정사항

### 네이밍
- 테이블: snake_case 복수형
- 인덱스: `idx_{테이블}_{컬럼}` 패턴
- FK: 컬럼명에 `_id` 접미사

### 상태(status) 값 목록
- requests / request_items 공통: `pending`, `searching`, `search_done`, `approved`, `copying`, `done`, `failed`, `rejected`
- copy_jobs: `pending`, `copying`, `done`, `failed`
- mount_logs.action: `mount`, `unmount`
- mount_logs.triggered_by: `startup`, `shutdown`, `admin`, `system`

### 소프트 삭제 정책
- `requests`: `is_deleted` + `deleted_at` 사용
- `users`: `is_active` 플래그 사용 (삭제 금지, RESTRICT)
- `channel_mappings`: `is_active` 플래그 사용 (폐채널 처리)
- 감사 로그(`audit_logs`, `mount_logs`): 불변, 삭제 없음

### 마이그레이션 파일 위치
`backend/src/config/migrations/NNN_설명.sql`
- 001: 전체 스키마
- 002: 채널 매핑 시드 데이터

## 채널 매핑 초기값
| storage_folder | display_name | nas_folder |
|---------------|-------------|-----------|
| CNBC | 비즈 | 비즈 |
| ESPN | 스포츠 | 스포츠 |
| ETV | 라이프 | 라이프 |
| FIL | 퍼니 | 퍼니 |
| GOLF | 골프 | 골프 |
| NICK | 골프2 | 골프2 |
| PLUS | 플러스 | 플러스 |

## 주의사항
- `audit_logs`의 entity_type/entity_id는 외래키 없는 느슨한 참조 (소프트 레퍼런스)
- 중복 복사 방지는 DB가 아닌 앱 레벨에서 제어 (status='done' 체크)
- 파일명 패턴: `{채널}_{YYYYMMDD}_{HHMMSS}_{HHMM}.avi` (1시간5분 단위)
- mount 현재 상태 판단: storage_type별 최신 레코드의 action + status 기준
