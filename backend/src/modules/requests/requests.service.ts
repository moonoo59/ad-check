/**
 * 요청 서비스
 *
 * 광고 증빙 요청의 생성, 조회, 상태 전환을 담당한다.
 * 파일 탐색과 복사 실행은 각각 files.service, copy.service에서 처리하고
 * 이 서비스는 요청/항목의 상태 전환 로직에 집중한다.
 *
 * 상태 흐름:
 *   pending → searching → search_done → approved → copying → done
 *                                    └→ rejected
 *                       └→ failed (탐색 실패)
 *
 * 오전송 수정 흐름:
 *   done → editing → copying → done
 *                  └→ failed(item 단위)
 */
import db from '../../config/database';
import { deleteActiveCopiedFileForItem } from '../files/storage-cleanup.service';
import { kstDateEndToUtc, kstDateStartToUtc, utcNow } from '../../common/datetime';

// 요청 DB 행 타입
export interface RequestRow {
  id: number;
  requester_id: number;
  requester_name: string;
  request_memo: string | null;
  status: string;
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  item_count: number;
  broadcast_dates: string | null;
  created_at: string;
  updated_at: string;
}

// 요청 항목 DB 행 타입
export interface RequestItemRow {
  id: number;
  request_id: number;
  channel_mapping_id: number;
  channel_display_name: string;
  channel_storage_folder: string;
  channel_nas_folder: string;
  sales_manager: string;
  advertiser: string;
  broadcast_date: string;
  req_time_start: string;
  req_time_end: string;
  monitoring_time: string;
  item_memo: string | null;
  item_status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// 파일 탐색 결과 행 타입
export interface FileSearchResultRow {
  id: number;
  request_item_id: number;
  file_path: string;
  file_name: string;
  file_size_bytes: number | null;
  file_start_time: string | null;
  file_end_time: string | null;
  file_mtime: string | null;
  match_score: number;
  match_reason: string | null;
  is_selected: number;
  created_at: string;
}

// 복사 작업 행 타입
export interface CopyJobRow {
  id: number;
  request_item_id: number;
  file_search_result_id: number;
  source_path: string;
  dest_path: string;
  status: string;
  approved_by: number | null;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  retry_count: number;
  total_bytes: number | null;
  progress_bytes: number;
  deleted_at: string | null;
  deleted_by: number | null;
  created_at: string;
}

// 요청 생성 DTO
export interface CreateRequestDto {
  request_memo?: string;
  items: CreateRequestItemDto[];
}

// 요청 항목 생성 DTO
export interface CreateRequestItemDto {
  channel_mapping_id: number;
  sales_manager: string;
  advertiser: string;
  broadcast_date: string;
  req_time_start: string;
  req_time_end: string;
  monitoring_time: string;
  item_memo?: string;
  sort_order: number;
}

// 오전송 수정 DTO
export interface UpdateRequestItemDto {
  channel_mapping_id: number;
  broadcast_date: string;
  req_time_start: string;
  req_time_end: string;
  monitoring_time: string;
}

// 목록 조회 필터
export interface RequestListFilter {
  status?: string | string[];
  from?: string;
  to?: string;
  requester_id?: number;
  page?: number;
  limit?: number;
  sort?: string;
}

const SORT_MAP: Record<string, string> = {
  created_at_desc: 'r.created_at DESC',
  created_at_asc: 'r.created_at ASC',
  id_desc: 'r.id DESC',
  id_asc: 'r.id ASC',
};

/**
 * 요청 + 항목 일괄 생성
 */
export function createRequest(dto: CreateRequestDto, requesterId: number): number {
  const now = utcNow();

  const requestId = db.transaction(() => {
    const requestResult = db.prepare(`
      INSERT INTO requests (requester_id, request_memo, status, is_deleted, created_at, updated_at)
      VALUES (@requester_id, @request_memo, 'pending', 0, @now, @now)
    `).run({
      requester_id: requesterId,
      request_memo: dto.request_memo?.trim() ?? null,
      now,
    });

    const reqId = requestResult.lastInsertRowid as number;

    const itemInsert = db.prepare(`
      INSERT INTO request_items
        (request_id, channel_mapping_id, sales_manager, advertiser, broadcast_date,
         req_time_start, req_time_end, monitoring_time, item_memo, item_status, sort_order, created_at, updated_at)
      VALUES
        (@request_id, @channel_mapping_id, @sales_manager, @advertiser, @broadcast_date,
         @req_time_start, @req_time_end, @monitoring_time, @item_memo, 'pending', @sort_order, @now, @now)
    `);

    for (const item of dto.items) {
      itemInsert.run({
        request_id: reqId,
        channel_mapping_id: item.channel_mapping_id,
        sales_manager: item.sales_manager.trim(),
        advertiser: item.advertiser.trim(),
        broadcast_date: item.broadcast_date,
        req_time_start: item.req_time_start,
        req_time_end: item.req_time_end,
        monitoring_time: item.monitoring_time,
        item_memo: item.item_memo?.trim() ?? null,
        sort_order: item.sort_order,
        now,
      });
    }

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, created_at)
      VALUES (?, 'request_create', 'requests', ?, ?)
    `).run(requesterId, reqId, now);

    return reqId;
  })();

  return requestId as number;
}

/**
 * 요청 목록 조회
 */
export function getRequests(
  filter: RequestListFilter,
  currentUserRole: string,
  currentUserId: number,
  currentUserCanCopy = false,
): { requests: RequestRow[]; total: number } {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = ['r.is_deleted = 0'];
  const params: (string | number)[] = [];

  if (filter.requester_id) {
    conditions.push('r.requester_id = ?');
    params.push(filter.requester_id);
  }

  if (filter.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    const placeholders = statuses.map(() => '?').join(', ');
    conditions.push(`r.status IN (${placeholders})`);
    params.push(...statuses);
  }

  if (filter.from) {
    conditions.push('r.created_at >= ?');
    params.push(kstDateStartToUtc(filter.from));
  }

  if (filter.to) {
    conditions.push('r.created_at <= ?');
    params.push(kstDateEndToUtc(filter.to));
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countSql = `SELECT COUNT(*) as total FROM requests r ${whereClause}`;
  const { total } = db.prepare(countSql).get(...params) as { total: number };

  const listSql = `
    SELECT
      r.id,
      r.requester_id,
      u_req.display_name AS requester_name,
      r.request_memo,
      r.status,
      r.reviewed_by,
      u_rev.display_name AS reviewed_by_name,
      r.reviewed_at,
      r.reject_reason,
      (SELECT COUNT(*) FROM request_items ri WHERE ri.request_id = r.id) AS item_count,
      (
        SELECT GROUP_CONCAT(bd ORDER BY bd)
        FROM (SELECT DISTINCT ri2.broadcast_date AS bd FROM request_items ri2 WHERE ri2.request_id = r.id)
      ) AS broadcast_dates,
      r.created_at,
      r.updated_at,
      r.resend_count
    FROM requests r
    LEFT JOIN users u_req ON u_req.id = r.requester_id
    LEFT JOIN users u_rev ON u_rev.id = r.reviewed_by
    ${whereClause}
    ORDER BY ${SORT_MAP[filter.sort ?? ''] ?? 'r.created_at DESC'}
    LIMIT ? OFFSET ?
  `;

  const requests = db.prepare(listSql).all(...params, limit, offset) as RequestRow[];

  return { requests, total };
}

/**
 * 요청 상세 조회
 */
export function getRequestDetail(
  requestId: number,
  currentUserRole: string,
  currentUserId: number,
  currentUserCanCopy = false,
): { request: RequestRow; items: (RequestItemRow & { file_search_results: FileSearchResultRow[]; copy_job: CopyJobRow | null })[] } | null {
  const params: (number | string)[] = [requestId];
  const accessCondition = '';

  const request = db.prepare(`
    SELECT
      r.id,
      r.requester_id,
      u_req.display_name AS requester_name,
      r.request_memo,
      r.status,
      r.reviewed_by,
      u_rev.display_name AS reviewed_by_name,
      r.reviewed_at,
      r.reject_reason,
      (SELECT COUNT(*) FROM request_items ri WHERE ri.request_id = r.id) AS item_count,
      r.created_at,
      r.updated_at,
      r.resend_count
    FROM requests r
    LEFT JOIN users u_req ON u_req.id = r.requester_id
    LEFT JOIN users u_rev ON u_rev.id = r.reviewed_by
    WHERE r.id = ? AND r.is_deleted = 0
  `).get(...params) as RequestRow | undefined;

  if (!request) {
    return null;
  }

  const items = db.prepare(`
    SELECT
      ri.*,
      cm.display_name AS channel_display_name,
      cm.storage_folder AS channel_storage_folder,
      cm.nas_folder AS channel_nas_folder
    FROM request_items ri
    LEFT JOIN channel_mappings cm ON cm.id = ri.channel_mapping_id
    WHERE ri.request_id = ?
    ORDER BY ri.sort_order ASC
  `).all(requestId) as RequestItemRow[];

  if (items.length === 0) {
    return { request, items: [] };
  }

  const itemIds = items.map((item) => item.id);
  const placeholders = itemIds.map(() => '?').join(',');

  const fileResults = db.prepare(`
    SELECT *
    FROM file_search_results
    WHERE request_item_id IN (${placeholders})
    ORDER BY request_item_id ASC, match_score DESC, created_at ASC
  `).all(...itemIds) as FileSearchResultRow[];

  const copyJobs = db.prepare(`
    SELECT *
    FROM copy_jobs
    WHERE request_item_id IN (${placeholders})
    ORDER BY request_item_id ASC, created_at DESC
  `).all(...itemIds) as CopyJobRow[];

  const fileResultsByItem = new Map<number, FileSearchResultRow[]>();
  for (const result of fileResults) {
    const results = fileResultsByItem.get(result.request_item_id) ?? [];
    results.push(result);
    fileResultsByItem.set(result.request_item_id, results);
  }

  const latestCopyJobByItem = new Map<number, CopyJobRow>();
  for (const copyJob of copyJobs) {
    if (!latestCopyJobByItem.has(copyJob.request_item_id)) {
      latestCopyJobByItem.set(copyJob.request_item_id, copyJob);
    }
  }

  const itemsWithDetails = items.map((item) => ({
    ...item,
    file_search_results: fileResultsByItem.get(item.id) ?? [],
    copy_job: latestCopyJobByItem.get(item.id) ?? null,
  }));

  return { request, items: itemsWithDetails };
}

/**
 * 파일 선택 업데이트
 */
export function selectFile(
  requestItemId: number,
  fileSearchResultId: number,
): boolean {
  const item = db.prepare(`
    SELECT
      ri.id,
      ri.item_status,
      r.status AS request_status
    FROM request_items ri
    JOIN requests r ON r.id = ri.request_id
    WHERE ri.id = ? AND r.is_deleted = 0
  `).get(requestItemId) as { id: number; item_status: string; request_status: string } | undefined;

  if (!item) {
    return false;
  }
  // done: 이미 완료된 항목, copying: 복사 진행 중인 항목 — 둘 다 파일 선택 변경 불가
  if (item.item_status === 'done' || item.item_status === 'copying') {
    return false;
  }

  const fileResult = db.prepare(`
    SELECT id FROM file_search_results WHERE id = ? AND request_item_id = ?
  `).get(fileSearchResultId, requestItemId);

  if (!fileResult) {
    return false;
  }

  db.transaction(() => {
    const now = utcNow();

    db.prepare(`
      UPDATE file_search_results
      SET is_selected = 0, updated_at = ?
      WHERE request_item_id = ?
    `).run(now, requestItemId);

    db.prepare(`
      UPDATE file_search_results
      SET is_selected = 1, updated_at = ?
      WHERE id = ?
    `).run(now, fileSearchResultId);

    if (item.request_status === 'editing' && item.item_status === 'search_done') {
      db.prepare(`
        UPDATE request_items
        SET item_status = 'approved', updated_at = ?
        WHERE id = ?
      `).run(now, requestItemId);
    }
  })();

  return true;
}

/**
 * 요청 반려 처리
 */
export function rejectRequest(
  requestId: number,
  rejectReason: string,
  reviewerId: number,
): boolean {
  const request = db.prepare(`
    SELECT id, status FROM requests WHERE id = ? AND is_deleted = 0
  `).get(requestId) as { id: number; status: string } | undefined;

  if (!request) {
    return false;
  }

  const rejectableStatuses = ['pending', 'searching', 'search_done', 'failed'];
  if (!rejectableStatuses.includes(request.status)) {
    return false;
  }

  const now = utcNow();

  db.transaction(() => {
    db.prepare(`
      UPDATE requests
      SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, reject_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(reviewerId, now, rejectReason.trim(), now, requestId);

    db.prepare(`
      UPDATE request_items
      SET item_status = 'rejected', updated_at = ?
      WHERE request_id = ?
        AND item_status IN ('pending', 'searching', 'search_done', 'failed', 'approved')
    `).run(now, requestId);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, created_at)
      VALUES (?, 'request_reject', 'requests', ?, ?)
    `).run(reviewerId, requestId, now);
  })();

  return true;
}

/**
 * 파일 탐색 시작 준비
 */
export function prepareForSearch(requestId: number): boolean {
  const request = db.prepare(`
    SELECT id, status FROM requests WHERE id = ? AND is_deleted = 0
  `).get(requestId) as { id: number; status: string } | undefined;

  if (!request) {
    return false;
  }

  const searchableStatuses = ['pending', 'failed', 'search_done'];
  if (!searchableStatuses.includes(request.status)) {
    return false;
  }

  const now = utcNow();

  db.transaction(() => {
    db.prepare(`
      UPDATE requests SET status = 'searching', updated_at = ? WHERE id = ?
    `).run(now, requestId);

    db.prepare(`
      UPDATE request_items SET item_status = 'searching', updated_at = ? WHERE request_id = ?
    `).run(now, requestId);
  })();

  return true;
}

/**
 * 전체 승인 가능 여부 검증
 */
export function validateApproval(requestId: number): true | string {
  const request = db.prepare(`
    SELECT id, status FROM requests WHERE id = ? AND is_deleted = 0
  `).get(requestId) as { id: number; status: string } | undefined;

  if (!request) {
    return '요청을 찾을 수 없습니다.';
  }
  if (request.status !== 'search_done') {
    return `현재 상태(${request.status})에서는 승인할 수 없습니다. 탐색 완료 상태에서만 승인 가능합니다.`;
  }

  const items = db.prepare(`
    SELECT id FROM request_items WHERE request_id = ?
  `).all(requestId) as { id: number }[];

  if (items.length === 0) {
    return '요청 항목이 없습니다.';
  }

  for (const item of items) {
    const selected = db.prepare(`
      SELECT id FROM file_search_results WHERE request_item_id = ? AND is_selected = 1
    `).get(item.id);

    if (!selected) {
      return '파일이 선택되지 않은 항목이 있습니다. 모든 항목에 파일을 선택해주세요.';
    }
  }

  return true;
}

/**
 * 복사 재시도 또는 수정 항목 복사 준비
 */
export function prepareForRetryCopy(requestId: number, userId: number): true | string {
  const request = db.prepare(`
    SELECT id, status FROM requests WHERE id = ? AND is_deleted = 0
  `).get(requestId) as { id: number; status: string } | undefined;

  if (!request) {
    return '요청을 찾을 수 없습니다.';
  }

  // copying 상태는 비동기 복사가 이미 진행 중 — 중복 실행 방지를 위해 명시적으로 차단
  if (request.status === 'copying') {
    return '복사가 이미 진행 중입니다. 완료 후 재시도해주세요.';
  }

  if (!['failed', 'approved', 'editing'].includes(request.status)) {
    return `현재 상태(${request.status})에서는 복사 실행이 불가능합니다.`;
  }

  if (request.status === 'failed') {
    const failedItems = db.prepare(`
      SELECT id FROM request_items WHERE request_id = ? AND item_status = 'failed'
    `).all(requestId) as { id: number }[];

    if (failedItems.length === 0) {
      return '재시도할 항목이 없습니다.';
    }

    for (const item of failedItems) {
      const selected = db.prepare(`
        SELECT id FROM file_search_results WHERE request_item_id = ? AND is_selected = 1
      `).get(item.id);

      if (!selected) {
        return '파일이 선택되지 않은 항목이 있습니다. 탐색 재시도 후 파일을 선택해주세요.';
      }
    }

    const now = utcNow();
    db.transaction(() => {
      db.prepare(`
        UPDATE requests SET status = 'approved', updated_at = ? WHERE id = ?
      `).run(now, requestId);

      db.prepare(`
        UPDATE request_items
        SET item_status = 'approved', updated_at = ?
        WHERE request_id = ? AND item_status = 'failed'
      `).run(now, requestId);

      db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
        VALUES (?, 'copy_retry', 'requests', ?, ?, ?)
      `).run(userId, requestId, '복사 재시도 준비', now);
    })();

    return true;
  }

  if (request.status === 'approved') {
    const allItems = db.prepare(`
      SELECT id FROM request_items WHERE request_id = ?
    `).all(requestId) as { id: number }[];

    for (const item of allItems) {
      const selected = db.prepare(`
        SELECT id FROM file_search_results WHERE request_item_id = ? AND is_selected = 1
      `).get(item.id);

      if (!selected) {
        return '파일이 선택되지 않은 항목이 있습니다.';
      }
    }

    return true;
  }

  const editingItems = db.prepare(`
    SELECT id, item_status
    FROM request_items
    WHERE request_id = ? AND item_status <> 'done'
    ORDER BY sort_order ASC
  `).all(requestId) as { id: number; item_status: string }[];

  if (editingItems.length === 0) {
    return '수정 중인 항목이 없습니다.';
  }

  const readyItemIds: number[] = [];

  for (const item of editingItems) {
    if (item.item_status === 'searching') {
      return '수정 중인 항목의 파일 탐색이 아직 진행 중입니다.';
    }

    const selected = db.prepare(`
      SELECT id FROM file_search_results WHERE request_item_id = ? AND is_selected = 1
    `).get(item.id);

    if (!selected) {
      return '수정 중인 항목에 선택된 파일이 없습니다.';
    }

    readyItemIds.push(item.id);
  }

  const now = utcNow();
  const placeholders = readyItemIds.map(() => '?').join(', ');

  db.transaction(() => {
    db.prepare(`
      UPDATE request_items
      SET item_status = 'approved', updated_at = ?
      WHERE id IN (${placeholders})
    `).run(now, ...readyItemIds);

    db.prepare(`
      UPDATE requests SET updated_at = ? WHERE id = ?
    `).run(now, requestId);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, 'copy_retry', 'requests', ?, ?, ?)
    `).run(userId, requestId, '수정 항목 복사 준비', now);
  })();

  return true;
}

/**
 * 요청을 approved 상태로 변경
 */
export function approveRequest(requestId: number, reviewerId: number): boolean {
  // 내부 상태 재검증: validateApproval()을 거쳐야 호출되지만,
  // 미래 코드 추가 등으로 단독 호출되는 경로를 대비해 방어적으로 체크
  const current = db.prepare(`
    SELECT status FROM requests WHERE id = ? AND is_deleted = 0
  `).get(requestId) as { status: string } | undefined;

  if (!current || current.status !== 'search_done') {
    return false;
  }

  const now = utcNow();

  db.transaction(() => {
    db.prepare(`
      UPDATE requests
      SET status = 'approved', reviewed_by = ?, reviewed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(reviewerId, now, now, requestId);

    db.prepare(`
      UPDATE request_items
      SET item_status = 'approved', updated_at = ?
      WHERE request_id = ?
        AND item_status IN ('search_done', 'approved')
        AND EXISTS (
          SELECT 1
          FROM file_search_results fsr
          WHERE fsr.request_item_id = request_items.id
            AND fsr.is_selected = 1
        )
    `).run(now, requestId);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, created_at)
      VALUES (?, 'request_approve', 'requests', ?, ?)
    `).run(reviewerId, requestId, now);
  })();

  return true;
}

/**
 * 재전송 준비
 */
export function prepareForResend(
  requestId: number,
  reason: string,
  userId: number,
  userDisplayName: string,
  currentUserRole: string,
): true | string {
  const request = db.prepare(`
    SELECT id, status, requester_id FROM requests WHERE id = ? AND is_deleted = 0
  `).get(requestId) as { id: number; status: string; requester_id: number } | undefined;

  if (!request) {
    return '요청을 찾을 수 없습니다.';
  }
  if (request.status !== 'done') {
    return `현재 상태(${request.status})에서는 재전송이 불가능합니다. 완료 상태에서만 재전송할 수 있습니다.`;
  }

  const now = utcNow();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO resend_logs (request_id, reason, requested_by, requested_by_name, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(requestId, reason.trim(), userId, userDisplayName, now);

    db.prepare(`
      UPDATE copy_jobs
      SET status = 'failed', error_message = '재전송으로 대체됨', updated_at = ?
      WHERE request_item_id IN (
        SELECT id FROM request_items WHERE request_id = ?
      )
        AND status = 'done'
        AND deleted_at IS NULL
    `).run(now, requestId);

    db.prepare(`
      UPDATE request_items SET item_status = 'approved', updated_at = ? WHERE request_id = ?
    `).run(now, requestId);

    db.prepare(`
      UPDATE requests SET status = 'approved', resend_count = resend_count + 1, updated_at = ? WHERE id = ?
    `).run(now, requestId);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, 'request_resend', 'requests', ?, ?, ?)
    `).run(userId, requestId, `재전송 사유: ${reason.trim()}`, now);
  })();

  return true;
}

/**
 * 완료된 항목을 수정하고 단일 항목 재탐색을 준비한다.
 */
export async function updateRequestItemForCorrection(
  requestId: number,
  itemId: number,
  dto: UpdateRequestItemDto,
  userId: number,
): Promise<true | string> {
  const target = db.prepare(`
    SELECT
      r.id AS request_id,
      r.status AS request_status,
      ri.id AS item_id,
      ri.item_status,
      ri.channel_mapping_id,
      ri.broadcast_date,
      ri.req_time_start,
      ri.req_time_end,
      ri.monitoring_time
    FROM requests r
    JOIN request_items ri ON ri.request_id = r.id
    WHERE r.id = ? AND ri.id = ? AND r.is_deleted = 0
  `).get(requestId, itemId) as {
    request_id: number;
    request_status: string;
    item_id: number;
    item_status: string;
    channel_mapping_id: number;
    broadcast_date: string;
    req_time_start: string;
    req_time_end: string;
    monitoring_time: string;
  } | undefined;

  if (!target) {
    return '요청 또는 항목을 찾을 수 없습니다.';
  }

  if (!['done', 'editing'].includes(target.request_status)) {
    return `현재 상태(${target.request_status})에서는 오전송 수정을 진행할 수 없습니다.`;
  }

  if (target.item_status === 'searching' || target.item_status === 'copying') {
    return '현재 항목은 작업 중이어서 수정할 수 없습니다.';
  }

  const otherInProgressCount = (db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM request_items
    WHERE request_id = ?
      AND id <> ?
      AND item_status IN ('searching', 'copying')
  `).get(requestId, itemId) as { cnt: number }).cnt;

  if (otherInProgressCount > 0) {
    return '다른 항목 수정이 진행 중입니다. 한 번에 한 항목만 수정할 수 있습니다.';
  }

  try {
    await deleteActiveCopiedFileForItem(itemId, userId);
  } catch (error) {
    return error instanceof Error ? error.message : '기존 복사본 삭제에 실패했습니다.';
  }

  const now = utcNow();

  db.transaction(() => {
    db.prepare(`DELETE FROM copy_jobs WHERE request_item_id = ?`).run(itemId);
    db.prepare(`DELETE FROM file_search_results WHERE request_item_id = ?`).run(itemId);

    db.prepare(`
      UPDATE request_items
      SET
        channel_mapping_id = ?,
        broadcast_date = ?,
        req_time_start = ?,
        req_time_end = ?,
        monitoring_time = ?,
        item_status = 'searching',
        updated_at = ?
      WHERE id = ?
    `).run(
      dto.channel_mapping_id,
      dto.broadcast_date,
      dto.req_time_start,
      dto.req_time_end,
      dto.monitoring_time,
      now,
      itemId,
    );

    db.prepare(`
      UPDATE requests
      SET status = 'editing', updated_at = ?
      WHERE id = ?
    `).run(now, requestId);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, 'request_item_correct', 'request_items', ?, ?, ?)
    `).run(
      userId,
      itemId,
      JSON.stringify({
        before: {
          channel_mapping_id: target.channel_mapping_id,
          broadcast_date: target.broadcast_date,
          req_time_start: target.req_time_start,
          req_time_end: target.req_time_end,
          monitoring_time: target.monitoring_time,
        },
        after: dto,
      }),
      now,
    );
  })();

  return true;
}

/**
 * 요청 소프트 삭제
 */
export function deleteRequest(requestId: number, adminId: number): true | string {
  const request = db.prepare(`
    SELECT id, status FROM requests WHERE id = ? AND is_deleted = 0
  `).get(requestId) as { id: number; status: string } | undefined;

  if (!request) {
    return '요청을 찾을 수 없습니다.';
  }

  if (request.status === 'copying' || request.status === 'searching') {
    return `현재 상태(${request.status})에서는 삭제할 수 없습니다. 작업이 완료된 후 삭제하세요.`;
  }

  const now = utcNow();

  db.transaction(() => {
    db.prepare(`
      UPDATE requests SET is_deleted = 1, updated_at = ? WHERE id = ?
    `).run(now, requestId);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, created_at)
      VALUES (?, 'request_delete', 'requests', ?, ?)
    `).run(adminId, requestId, now);
  })();

  return true;
}

/**
 * 중복 없는 광고주 목록 조회 (연관 검색어용)
 */
export function getUniqueAdvertisers(): string[] {
  const rows = db.prepare(`
    SELECT DISTINCT advertiser
    FROM request_items
    WHERE advertiser IS NOT NULL AND advertiser != ''
    ORDER BY advertiser ASC
    LIMIT 500
  `).all() as { advertiser: string }[];

  return rows.map((r) => r.advertiser);
}

