/**
 * 도메인 타입 정의
 *
 * 백엔드 API 응답과 1:1 대응하는 타입을 정의한다.
 * DB 스키마(db-schema.md)와 API 엔드포인트(4단계 구현 결과) 기준.
 */

// ─── 공통 API 응답 포맷 ─────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errorCode?: string;
  timestamp: string;
  requestId: string;
}

// ─── 사용자 ───────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'tech_team' | 'ad_team';

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  is_active: number; // 1 | 0
  created_at: string;
}

// ─── 채널 매핑 ────────────────────────────────────────────────────────────────

export interface ChannelMapping {
  id: number;
  storage_folder: string;   // Logger Storage 폴더명 (예: ETV)
  display_name: string;     // 화면 표시명 (예: 라이프)
  nas_folder: string;       // 공유 NAS 폴더명 (예: 라이프)
  description?: string;
  is_active: number;        // 1 | 0
  created_at: string;
  updated_at: string;
}

export interface ChannelMappingHistory {
  id: number;
  channel_mapping_id: number;
  changed_by: number;
  changed_by_name?: string; // JOIN 결과
  field_name: string;
  old_value?: string;
  new_value?: string;
  changed_at: string;
}

// ─── 재전송 이력 (resend_logs) ────────────────────────────────────────────────

/** 완료 요청의 파일 재전송 이력 (NAS 파일 삭제 후 재복사 요청 기록) */
export interface ResendLog {
  id: number;
  request_id: number;
  reason: string;           // 재전송 사유
  requested_by: number;     // 요청자 ID
  requested_by_name: string; // 요청자 표시명 (비정규화 보관)
  created_at: string;
}

// ─── 요청 상태 ────────────────────────────────────────────────────────────────

export type RequestStatus =
  | 'pending'       // 대기 중 (등록 직후)
  | 'searching'     // 탐색 중
  | 'search_done'   // 탐색 완료
  | 'failed'        // 탐색 실패
  | 'editing'       // 요청 수정중
  | 'approved'      // 승인됨
  | 'copying'       // 복사 중
  | 'done'          // 완료
  | 'rejected';     // 반려

export type ItemStatus =
  | 'pending'
  | 'searching'
  | 'search_done'
  | 'failed'
  | 'approved'
  | 'copying'
  | 'done';

// ─── 요청 (requests) ─────────────────────────────────────────────────────────

export interface Request {
  id: number;
  requester_id: number;
  requester_name?: string;    // JOIN 결과
  request_memo?: string;
  status: RequestStatus;
  reviewed_by?: number;
  reviewed_by_name?: string;  // JOIN 결과
  reviewed_at?: string;
  reject_reason?: string;
  is_deleted: number;         // 1 | 0
  created_at: string;
  updated_at: string;
  item_count?: number;        // 집계 결과
  broadcast_dates?: string;   // 항목별 방송일자 콤마 구분 (예: "2026-03-07,2026-03-08")
}

// ─── 요청 항목 (request_items) ────────────────────────────────────────────────

export interface RequestItem {
  id: number;
  request_id: number;
  channel_mapping_id: number;
  channel_display_name?: string;    // JOIN 결과
  channel_storage_folder?: string;  // JOIN 결과
  sales_manager: string;            // 영업담당자 (항목별 개별 지정, migration 006에서 이동)
  advertiser: string;
  broadcast_date: string;           // YYYY-MM-DD
  req_time_start: string;           // HH:MM
  req_time_end: string;             // HH:MM
  monitoring_time: string;          // HH:MM
  item_memo?: string;
  item_status: ItemStatus;
  sort_order: number;
  created_at: string;
}

// ─── 파일 탐색 결과 (file_search_results) ────────────────────────────────────

export interface FileSearchResult {
  id: number;
  request_item_id: number;
  file_name: string;
  file_path: string;
  file_size_bytes: number;
  file_start_time: string;  // HH:MM:SS
  file_end_time: string;    // HH:MM:SS
  match_score: number;      // 0~100
  match_reason: string;
  is_selected: number;      // 1 | 0
  created_at: string;
}

// ─── 복사 작업 (copy_jobs) ────────────────────────────────────────────────────

export type CopyJobStatus = 'pending' | 'copying' | 'done' | 'failed';

export interface CopyJob {
  id: number;
  request_item_id: number;
  file_search_result_id: number;
  source_path: string;   // 원본 경로 (Logger Storage)
  dest_path: string;     // 목적지 경로 (공유 NAS)
  status: CopyJobStatus;
  retry_count: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  deleted_at?: string | null;
  deleted_by?: number | null;
  total_bytes: number | null;   // 전체 파일 크기 (null: 조회 실패)
  progress_bytes: number;       // 현재까지 복사된 바이트 수
  created_at: string;
}


// ─── API 요청/응답 전용 DTO ───────────────────────────────────────────────────

/** POST /api/requests 요청 바디 */
export interface CreateRequestBody {
  request_memo?: string;
  items: {
    channel_mapping_id: number;
    sales_manager: string;   // 영업담당자 (항목별 개별 지정)
    advertiser: string;
    broadcast_date: string;
    req_time_start: string;
    req_time_end: string;
    monitoring_time: string;
    item_memo?: string;
    sort_order: number;
  }[];
}

export interface CreateRequestResponse {
  id: number;
}

/** GET /api/requests 쿼리 파라미터 */
export interface RequestListQuery {
  page?: number;
  limit?: number;
  status?: string;       // 콤마 구분 복수 가능
  from?: string;         // YYYY-MM-DD
  to?: string;           // YYYY-MM-DD
  requester_id?: number;
  sort?: string;   // 허용값: created_at_desc | created_at_asc | id_desc | id_asc (서버에서 화이트리스트 검증)
}

/** GET /api/requests 응답 */
export interface RequestListResponse {
  items: Request[];
  total: number;
  page: number;
  limit: number;
}

/** 요청 상세 (항목 + 파일 탐색 결과 + 복사 작업 포함) */
export interface RequestDetail extends Request {
  items: (RequestItem & {
    file_search_results: FileSearchResult[];
    copy_job: CopyJob | null;  // 복사 작업 정보 (copying 상태 시 진행률 표시용)
  })[];
}

/** POST /api/requests/:id/reject 요청 바디 */
export interface RejectRequestBody {
  reject_reason: string;
}

/** PATCH /api/requests/items/:itemId/select-file 요청 바디 */
export interface SelectFileBody {
  file_search_result_id: number;
}

/** PATCH /api/requests/:id/items/:itemId 요청 바디 */
export interface UpdateRequestItemBody {
  channel_mapping_id: number;
  broadcast_date: string;
  req_time_start: string;
  req_time_end: string;
  monitoring_time: string;
}

/** PATCH /api/channels/:id 요청 바디 */
export interface UpdateChannelBody {
  storage_folder?: string;
  display_name?: string;
  nas_folder?: string;
  description?: string;
  is_active?: number;
}

/** POST /api/channels 요청 바디 */
export interface CreateChannelBody {
  storage_folder: string;
  display_name: string;
  nas_folder: string;
  description?: string;
}

// ─── 사용자 관리 DTO ──────────────────────────────────────────────────────────

/** POST /api/users 요청 바디 */
export interface CreateUserBody {
  username: string;
  display_name: string;
  role: UserRole;
  password: string;
}

/** PATCH /api/users/:id 요청 바디 */
export interface UpdateUserBody {
  display_name?: string;
  role?: UserRole;
  is_active?: number;
}

// ─── 감사 로그 ────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: number;
  user_id: number | null;
  user_name: string | null;
  username: string | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  detail: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogQuery {
  action?: string;
  user_id?: number;
  from?: string;    // YYYY-MM-DD
  to?: string;      // YYYY-MM-DD
  entity_type?: string;
  page?: number;
  limit?: number;
}

// ─── 통계 ────────────────────────────────────────────────────────────────────

export interface StatsSummary {
  total: number;
  done: number;
  rejected: number;
  in_progress: number;
  // 기간 필터 없을 때만 값 존재, 필터 있으면 null
  this_month: number | null;
  // 기간 필터 적용 여부 (true면 this_month 대신 total로 기간 내 수치 표시)
  is_filtered: boolean;
}

export interface StatsMonthly {
  month: string;   // MM (01~12)
  count: number;
}

/** 일별 요청 건수 (GET /api/stats/daily 응답 항목) */
export interface StatsDaily {
  day: string;   // DD (01~31)
  count: number;
}

export interface StatsByChannel {
  channel_name: string;
  count: number;
}

export interface StatsByAdvertiser {
  advertiser: string;
  count: number;
}

export interface StatsBySalesManager {
  sales_manager: string;   // 미입력 항목은 '미입력' 레이블로 표시됨
  count: number;
}
