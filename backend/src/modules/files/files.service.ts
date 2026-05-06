/**
 * 파일 탐색 서비스 (비동기 및 타임아웃 처리 적용)
 */
import db from '../../config/database';
import { findMatchingFiles, ReqItemForMatch } from './file-matcher';
import { env } from '../../config/env';
import { createLogger } from '../../common/logger';
import { utcNow } from '../../common/datetime';
import { existsAsync } from '../../common/fs-utils';

const log = createLogger('FileSearch');

interface RequestItemWithChannel {
  id: number;
  request_id: number;
  storage_folder: string;
  advertiser: string;
  broadcast_date: string;
  req_time_start: string;
  req_time_end: string;
  monitoring_time: string;
}

const insertResult = db.prepare(`
  INSERT INTO file_search_results
    (request_item_id, file_path, file_name, file_size_bytes, file_start_time, file_end_time,
     file_mtime, match_score, match_reason, is_selected, created_at, updated_at)
  VALUES
    (@request_item_id, @file_path, @file_name, @file_size_bytes, @file_start_time, @file_end_time,
     @file_mtime, @match_score, @match_reason, 0, @now, @now)
`);

/**
 * 지정된 요청에 대한 전체 파일 탐색 실행
 */
export async function runFileSearch(requestId: number, userId: number): Promise<void> {
  log.info(`요청 ${requestId} 파일 탐색 시작`);

  // macOS 보안 다이얼로그 블로킹 방지를 위해 비동기 타임아웃 체크 (3초)
  if (!(await existsAsync(env.LOGGER_STORAGE_MOUNT, 3000))) {
    log.error('Logger Storage 접근 불가(타임아웃 또는 미마운트)', { path: env.LOGGER_STORAGE_MOUNT });
    markRequestFailed(requestId, 'Logger Storage 접근 권한이 없거나 마운트되어 있지 않습니다.');
    return;
  }

  const items = getItemsForRequest(requestId);
  if (items.length === 0) {
    log.error(`요청 ${requestId}에 항목이 없음`);
    markRequestFailed(requestId, '요청 항목이 없습니다.');
    return;
  }

  clearSearchResults(items.map((item) => item.id));

  let successCount = 0;

  // 비동기 순차 처리 (개별 항목 탐색)
  for (const item of items) {
    const success = await searchSingleItem(item);
    if (success) {
      successCount++;
    }
  }

  const now = utcNow();

  if (successCount === 0) {
    db.prepare(`
      UPDATE requests SET status = 'failed', updated_at = ? WHERE id = ?
    `).run(now, requestId);
    log.error(`요청 ${requestId} 전체 항목 탐색 실패`);
    return;
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE requests SET status = 'search_done', updated_at = ? WHERE id = ?
    `).run(now, requestId);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, created_at)
      VALUES (?, 'search_done', 'requests', ?, ?)
    `).run(userId, requestId, now);
  })();

  log.info(`요청 ${requestId} 파일 탐색 완료`, { successCount, totalItems: items.length });
}

/**
 * 오전송 수정 후 단일 항목 파일 탐색
 */
export async function runSingleItemFileSearch(itemId: number, userId: number): Promise<void> {
  log.info(`항목 ${itemId} 단일 파일 탐색 시작`);

  const item = getItemById(itemId);
  if (!item) {
    log.error(`항목 ${itemId}를 찾을 수 없음`);
    return;
  }

  // 타임아웃 체크 적용
  if (!(await existsAsync(env.LOGGER_STORAGE_MOUNT, 3000))) {
    log.error('Logger Storage 접근 불가', { path: env.LOGGER_STORAGE_MOUNT, itemId });
    markSingleItemFailed(item, 'Logger Storage 접근 권한이 없거나 마운트되어 있지 않습니다.');
    return;
  }

  clearSearchResults([item.id]);

  const success = await searchSingleItem(item);
  const now = utcNow();

  db.prepare(`
    UPDATE requests SET status = 'editing', updated_at = ? WHERE id = ?
  `).run(now, item.request_id);

  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
    VALUES (?, ?, 'request_items', ?, ?, ?)
  `).run(
    userId,
    success ? 'item_search_done' : 'item_search_failed',
    item.id,
    success ? '오전송 수정 후 단일 항목 탐색 완료' : '오전송 수정 후 단일 항목 탐색 실패',
    now,
  );

  log.info(`항목 ${itemId} 단일 파일 탐색 종료`, { success });
}

function getItemsForRequest(requestId: number): RequestItemWithChannel[] {
  return db.prepare(`
    SELECT
      ri.id,
      ri.request_id,
      cm.storage_folder,
      ri.advertiser,
      ri.broadcast_date,
      ri.req_time_start,
      ri.req_time_end,
      ri.monitoring_time
    FROM request_items ri
    JOIN channel_mappings cm ON cm.id = ri.channel_mapping_id
    WHERE ri.request_id = ?
    ORDER BY ri.sort_order ASC
  `).all(requestId) as RequestItemWithChannel[];
}

function getItemById(itemId: number): RequestItemWithChannel | undefined {
  return db.prepare(`
    SELECT
      ri.id,
      ri.request_id,
      cm.storage_folder,
      ri.advertiser,
      ri.broadcast_date,
      ri.req_time_start,
      ri.req_time_end,
      ri.monitoring_time
    FROM request_items ri
    JOIN channel_mappings cm ON cm.id = ri.channel_mapping_id
    WHERE ri.id = ?
  `).get(itemId) as RequestItemWithChannel | undefined;
}

function clearSearchResults(itemIds: number[]): void {
  if (itemIds.length === 0) {
    return;
  }

  const placeholders = itemIds.map(() => '?').join(',');
  db.prepare(`DELETE FROM file_search_results WHERE request_item_id IN (${placeholders})`).run(...itemIds);
}

/**
 * 단일 항목 탐색 (비동기 처리)
 */
async function searchSingleItem(item: RequestItemWithChannel): Promise<boolean> {
  try {
    const reqItemForMatch: ReqItemForMatch = {
      broadcast_date: item.broadcast_date,
      req_time_start: item.req_time_start,
      req_time_end: item.req_time_end,
      monitoring_time: item.monitoring_time,
    };

    // 비동기 함수로 변경된 findMatchingFiles 호출
    const matches = await findMatchingFiles(reqItemForMatch, item.storage_folder, env.LOGGER_STORAGE_MOUNT);
    const now = utcNow();

    if (matches.length === 0) {
      db.prepare(`
        UPDATE request_items SET item_status = 'failed', updated_at = ? WHERE id = ?
      `).run(now, item.id);

      log.warn(`항목 ${item.id} 매칭 파일 없음`, {
        channel: item.storage_folder,
        date: item.broadcast_date,
      });
      return false;
    }

    db.transaction(() => {
      for (const match of matches) {
        insertResult.run({
          request_item_id: item.id,
          file_path: match.filePath,
          file_name: match.fileName,
          file_size_bytes: match.fileSizeBytes,
          file_start_time: match.fileStartTimeStr,
          file_end_time: match.fileEndTimeStr,
          file_mtime: match.fileMtime,
          match_score: match.matchScore,
          match_reason: match.matchReason,
          now,
        });
      }

      db.prepare(`
        UPDATE request_items SET item_status = 'search_done', updated_at = ? WHERE id = ?
      `).run(now, item.id);
    })();

    log.info(`항목 ${item.id} 탐색 완료`, { matchCount: matches.length });
    return true;
  } catch (error) {
    log.error(`항목 ${item.id} 처리 중 오류`, {
      error: error instanceof Error ? error.message : String(error),
    });

    db.prepare(`
      UPDATE request_items SET item_status = 'failed', updated_at = ? WHERE id = ?
    `).run(utcNow(), item.id);

    return false;
  }
}

function markRequestFailed(requestId: number, reason: string): void {
  const now = utcNow();

  db.transaction(() => {
    db.prepare(`
      UPDATE requests SET status = 'failed', updated_at = ? WHERE id = ?
    `).run(now, requestId);

    db.prepare(`
      UPDATE request_items SET item_status = 'failed', updated_at = ? WHERE request_id = ?
    `).run(now, requestId);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (NULL, 'search_failed', 'requests', ?, ?, ?)
    `).run(requestId, reason, now);
  })();
}

function markSingleItemFailed(item: RequestItemWithChannel, reason: string): void {
  const now = utcNow();

  db.transaction(() => {
    db.prepare(`
      UPDATE request_items SET item_status = 'failed', updated_at = ? WHERE id = ?
    `).run(now, item.id);

    db.prepare(`
      UPDATE requests SET status = 'editing', updated_at = ? WHERE id = ?
    `).run(now, item.request_id);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (NULL, 'item_search_failed', 'request_items', ?, ?, ?)
    `).run(item.id, reason, now);
  })();
}
