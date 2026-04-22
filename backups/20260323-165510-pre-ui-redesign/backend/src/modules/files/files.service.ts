/**
 * 파일 탐색 서비스
 *
 * - 전체 요청 탐색: 요청 등록/재탐색 시 사용
 * - 단일 항목 탐색: 오전송 수정 후 해당 항목만 다시 찾을 때 사용
 *
 * 공통 원칙:
 * - 기존 탐색 결과는 대상 항목 단위로 먼저 비운다.
 * - 파일 탐색 실패는 item_status='failed' 로 남긴다.
 * - 전체 요청 탐색은 request.status 를 search_done/failed 로 정리한다.
 * - 단일 항목 탐색은 request.status 를 editing 으로 유지한다.
 */
import fs from 'fs';
import db from '../../config/database';
import { findMatchingFiles, ReqItemForMatch } from './file-matcher';
import { env } from '../../config/env';
import { createLogger } from '../../common/logger';

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

  if (!fs.existsSync(env.LOGGER_STORAGE_MOUNT)) {
    log.error('Logger Storage 미마운트', { path: env.LOGGER_STORAGE_MOUNT });
    markRequestFailed(requestId, 'Logger Storage가 마운트되어 있지 않습니다.');
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

  for (const item of items) {
    const success = searchSingleItem(item);
    if (success) {
      successCount++;
    }
  }

  const now = new Date().toISOString();

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
      VALUES (?, 'search_done', 'requests', ?, datetime('now', 'localtime'))
    `).run(userId, requestId);
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

  if (!fs.existsSync(env.LOGGER_STORAGE_MOUNT)) {
    log.error('Logger Storage 미마운트', { path: env.LOGGER_STORAGE_MOUNT, itemId });
    markSingleItemFailed(item, 'Logger Storage가 마운트되어 있지 않습니다.');
    return;
  }

  clearSearchResults([item.id]);

  const success = searchSingleItem(item);
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE requests SET status = 'editing', updated_at = ? WHERE id = ?
  `).run(now, item.request_id);

  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
    VALUES (?, ?, 'request_items', ?, ?, datetime('now', 'localtime'))
  `).run(
    userId,
    success ? 'item_search_done' : 'item_search_failed',
    item.id,
    success ? '오전송 수정 후 단일 항목 탐색 완료' : '오전송 수정 후 단일 항목 탐색 실패',
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

function searchSingleItem(item: RequestItemWithChannel): boolean {
  try {
    const reqItemForMatch: ReqItemForMatch = {
      broadcast_date: item.broadcast_date,
      req_time_start: item.req_time_start,
      req_time_end: item.req_time_end,
      monitoring_time: item.monitoring_time,
    };

    const matches = findMatchingFiles(reqItemForMatch, item.storage_folder, env.LOGGER_STORAGE_MOUNT);
    const now = new Date().toISOString();

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
    `).run(new Date().toISOString(), item.id);

    return false;
  }
}

function markRequestFailed(requestId: number, reason: string): void {
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(`
      UPDATE requests SET status = 'failed', updated_at = ? WHERE id = ?
    `).run(now, requestId);

    db.prepare(`
      UPDATE request_items SET item_status = 'failed', updated_at = ? WHERE request_id = ?
    `).run(now, requestId);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (NULL, 'search_failed', 'requests', ?, ?, datetime('now', 'localtime'))
    `).run(requestId, reason);
  })();
}

function markSingleItemFailed(item: RequestItemWithChannel, reason: string): void {
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(`
      UPDATE request_items SET item_status = 'failed', updated_at = ? WHERE id = ?
    `).run(now, item.id);

    db.prepare(`
      UPDATE requests SET status = 'editing', updated_at = ? WHERE id = ?
    `).run(now, item.request_id);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (NULL, 'item_search_failed', 'request_items', ?, ?, datetime('now', 'localtime'))
    `).run(item.id, reason);
  })();
}
