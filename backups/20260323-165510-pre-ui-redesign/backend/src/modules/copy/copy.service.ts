/**
 * 파일 복사 서비스
 *
 * 승인된 요청의 파일을 Logger Storage → 공유 NAS로 복사한다.
 * requests.router에서 백그라운드로 호출된다 (setImmediate).
 *
 * 실행 흐름:
 * 1. 공유 NAS 마운트 확인
 * 2. 각 request_item의 is_selected=1 파일 조회
 * 3. copy_job 생성 (pending → copying)
 * 4. 대상 디렉토리 자동 생성
 * 5. 스트림 기반 복사 (4GB+ 파일 지원, 진행률 DB 업데이트)
 * 6. 완료/실패 시 job + item + request 상태 갱신
 *
 * 진행률 추적:
 * - 복사 시작 전 fs.stat으로 total_bytes 저장
 * - 스트림 data 이벤트마다 누적 바이트 집계
 * - 50MB 또는 파일 크기의 5% 중 큰 값 단위로 progress_bytes DB 업데이트
 * - 완료 시 progress_bytes = total_bytes 확정 저장
 *
 * 복사 중복 방지:
 * done 상태 copy_job이 이미 있는 request_item_id에 대해 새 job 생성 차단.
 *
 * 주의: 이 함수는 HTTP 응답 이후 비동기로 실행되므로
 *       에러는 콘솔 로그와 DB 기록으로만 남긴다.
 */
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import db from '../../config/database';
import { env } from '../../config/env';
import { createLogger } from '../../common/logger';

// 모듈 전용 로거 (파일 복사 흐름 전체에서 사용)
const log = createLogger('Copy');

// DB 조회 타입
interface RequestItemWithFile {
  item_id: number;
  file_result_id: number;
  file_path: string;
  file_name: string;
  broadcast_date: string;
  nas_folder: string;
  // 요청 생성일자 (복사 대상 폴더 구성에 사용)
  request_created_at: string;
}

/**
 * 요청의 복사 작업 전체 실행
 *
 * @param requestId 요청 ID
 * @param approvedByUserId 승인한 사용자 ID
 */
export async function executeCopyJobs(requestId: number, approvedByUserId: number): Promise<void> {
  log.info(`요청 ${requestId} 복사 작업 시작`);

  const request = db.prepare(`
    SELECT id, status
    FROM requests
    WHERE id = ? AND is_deleted = 0
  `).get(requestId) as { id: number; status: string } | undefined;

  if (!request) {
    log.error(`요청 ${requestId}를 찾을 수 없어 복사를 중단합니다.`);
    return;
  }

  const wasEditing = request.status === 'editing';

  // 공유 NAS 마운트 확인
  if (!fsSync.existsSync(env.SHARED_NAS_MOUNT)) {
    log.error(`공유 NAS 미마운트`, { path: env.SHARED_NAS_MOUNT });
    markCopyFailed(requestId, '공유 NAS가 마운트되어 있지 않습니다.', wasEditing);
    return;
  }

  // 승인된 항목과 선택된 파일 조회
  // r.created_at: 요청 생성일자 — 복사 대상 폴더 이름으로 사용 (방송일자 대신 요청일자 기준)
  const items = db.prepare(`
    SELECT
      ri.id AS item_id,
      fsr.id AS file_result_id,
      fsr.file_path,
      fsr.file_name,
      ri.broadcast_date,
      cm.nas_folder,
      r.created_at AS request_created_at
    FROM request_items ri
    JOIN file_search_results fsr ON fsr.request_item_id = ri.id AND fsr.is_selected = 1
    JOIN channel_mappings cm ON cm.id = ri.channel_mapping_id
    JOIN requests r ON r.id = ri.request_id
    WHERE ri.request_id = ? AND ri.item_status = 'approved'
  `).all(requestId) as RequestItemWithFile[];

  if (items.length === 0) {
    log.error(`요청 ${requestId}: 복사할 항목 없음`);
    return;
  }

  const now = new Date().toISOString();

  // 요청 상태를 copying으로 변경
  db.prepare(`
    UPDATE requests SET status = 'copying', updated_at = ? WHERE id = ?
  `).run(now, requestId);

  // 각 항목에 대해 copy_job 생성 + 복사 실행
  const copyPromises = items.map((item) => copySingleFile(item, approvedByUserId));

  // 모든 복사 완료 대기
  const results = await Promise.allSettled(copyPromises);

  // 거부된 Promise의 에러를 명시적으로 로깅 (에러가 묻히지 않도록)
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      log.error(`항목 ${items[i].item_id} 복사 예외`, {
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  });

  const failCount = results.filter((r) => r.status === 'rejected').length;

  const completedNow = new Date().toISOString();

  if (failCount === 0) {
    const remainingNotDone = (db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM request_items
      WHERE request_id = ? AND item_status <> 'done'
    `).get(requestId) as { cnt: number }).cnt;

    const nextStatus = remainingNotDone === 0 ? 'done' : wasEditing ? 'editing' : 'failed';

    db.prepare(`
      UPDATE requests SET status = ?, updated_at = ? WHERE id = ?
    `).run(nextStatus, completedNow, requestId);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, created_at)
      VALUES (?, 'copy_done', 'requests', ?, datetime('now', 'localtime'))
    `).run(approvedByUserId, requestId);

    log.info(`요청 ${requestId} 전체 복사 완료`, {
      totalItems: items.length,
      nextStatus,
      remainingNotDone,
    });
  } else {
    const nextStatus = wasEditing ? 'editing' : 'failed';

    db.prepare(`
      UPDATE requests SET status = ?, updated_at = ? WHERE id = ?
    `).run(nextStatus, completedNow, requestId);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, 'copy_failed', 'requests', ?, ?, datetime('now', 'localtime'))
    `).run(approvedByUserId, requestId, `${failCount}개 항목 복사 실패`);

    log.error(`요청 ${requestId} 복사 일부 실패`, {
      failCount,
      totalItems: items.length,
      nextStatus,
    });
  }
}

/**
 * 단일 항목 파일 복사
 *
 * @param item 복사 대상 항목 정보
 * @param approvedByUserId 승인자 ID
 */
async function copySingleFile(
  item: RequestItemWithFile,
  approvedByUserId: number,
): Promise<void> {
  // 중복 복사 방지: 이미 done 상태 job이 있으면 건너뜀
  const existingDone = db.prepare(`
    SELECT id
    FROM copy_jobs
    WHERE request_item_id = ?
      AND status = 'done'
      AND deleted_at IS NULL
  `).get(item.item_id);

  if (existingDone) {
    log.warn(`항목 ${item.item_id}: 이미 복사 완료됨, 건너뜀`);
    return;
  }

  // 복사 대상 경로 구성
  // dest: /Volumes/SharedNAS/{nas_folder}/{요청일자 YYYY-MM-DD}/{파일명}
  // 요청일자 기준으로 폴더를 구성 (방송 송출일 대신 요청 생성일 사용)
  // DB는 UTC로 저장되므로 KST(+09:00) 기준 날짜로 변환
  const kstOffset = 9 * 60 * 60 * 1000; // 9시간(ms)
  const kstDate = new Date(new Date(item.request_created_at).getTime() + kstOffset);
  const requestDate = kstDate.toISOString().slice(0, 10);
  const destDir = path.join(env.SHARED_NAS_MOUNT, item.nas_folder, requestDate);
  const destPath = path.join(destDir, item.file_name);
  const now = new Date().toISOString();

  // copy_job 생성 (pending 상태)
  // 주의: DB 스키마 CHECK(status IN ('pending','copying','done','failed'))
  //       'waiting', 'running' 은 허용 안 됨 — 반드시 이 값만 사용
  const jobResult = db.prepare(`
    INSERT INTO copy_jobs
      (request_item_id, file_search_result_id, source_path, dest_path, status,
       approved_by, approved_at, retry_count, created_at, updated_at)
    VALUES
      (@request_item_id, @file_search_result_id, @source_path, @dest_path, 'pending',
       @approved_by, @approved_at, 0, @now, @now)
  `).run({
    request_item_id: item.item_id,
    file_search_result_id: item.file_result_id,
    source_path: item.file_path,
    dest_path: destPath,
    approved_by: approvedByUserId,
    approved_at: now,
    now,
  });

  const jobId = jobResult.lastInsertRowid as number;
  const startedAt = new Date().toISOString();
  // 소요 시간 측정용 시작 타임스탬프 (ms)
  const startMs = Date.now();

  // copy_job 상태를 copying으로 변경 (스키마: 'pending'→'copying'→'done'/'failed')
  db.prepare(`
    UPDATE copy_jobs SET status = 'copying', started_at = ?, updated_at = ? WHERE id = ?
  `).run(startedAt, startedAt, jobId);

  db.prepare(`
    UPDATE request_items SET item_status = 'copying', updated_at = ? WHERE id = ?
  `).run(startedAt, item.item_id);

  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, created_at)
    VALUES (?, 'copy_start', 'copy_jobs', ?, datetime('now', 'localtime'))
  `).run(approvedByUserId, jobId);

  try {
    // 대상 디렉토리 생성 (없으면 자동 생성)
    await fs.mkdir(destDir, { recursive: true });

    // 대상 파일이 이미 존재해도 덮어쓰기로 진행
    // - 재전송 요청 등으로 동일 파일을 재복사하는 경우를 정상 처리
    if (fsSync.existsSync(destPath)) {
      log.info(`항목 ${item.item_id}: 대상 파일 이미 존재, 덮어쓰기 진행`, { destPath });
    }

    // 복사 전 원본 파일 크기 조회 → total_bytes 저장 (진행률 계산 기준)
    let totalBytes: number | null = null;
    try {
      const srcStat = await fs.stat(item.file_path);
      totalBytes = srcStat.size;
      db.prepare(`UPDATE copy_jobs SET total_bytes = ? WHERE id = ?`).run(totalBytes, jobId);
    } catch {
      log.warn(`항목 ${item.item_id}: 원본 파일 크기 조회 실패, 진행률 표시 불가`);
    }

    // 스트림 기반 파일 복사 (진행률 추적 포함)
    await copyFileWithProgress(item.file_path, destPath, jobId, totalBytes);

    const completedAt = new Date().toISOString();
    // 복사 소요 시간 계산
    const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);

    // 복사된 파일 크기 조회 (로그용)
    let fileSizeMB = 'unknown';
    try {
      const stat = await fs.stat(destPath);
      fileSizeMB = (stat.size / 1024 / 1024).toFixed(1);
    } catch { /* 크기 조회 실패는 무시 */ }

    db.transaction(() => {
      db.prepare(`
        UPDATE copy_jobs
        SET status = 'done', completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(completedAt, completedAt, jobId);

      db.prepare(`
        UPDATE request_items SET item_status = 'done', updated_at = ? WHERE id = ?
      `).run(completedAt, item.item_id);
    })();

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, created_at)
      VALUES (?, 'copy_done', 'copy_jobs', ?, datetime('now', 'localtime'))
    `).run(approvedByUserId, jobId);

    log.info(`항목 ${item.item_id} 복사 완료`, {
      dest: destPath,
      sizeMB: fileSizeMB,
      elapsedSec,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const failedAt = new Date().toISOString();

    db.transaction(() => {
      db.prepare(`
        UPDATE copy_jobs
        SET status = 'failed', error_message = ?, updated_at = ?
        WHERE id = ?
      `).run(errorMessage, failedAt, jobId);

      db.prepare(`
        UPDATE request_items SET item_status = 'failed', updated_at = ? WHERE id = ?
      `).run(failedAt, item.item_id);
    })();

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, 'copy_failed', 'copy_jobs', ?, ?, datetime('now', 'localtime'))
    `).run(approvedByUserId, jobId, errorMessage);

    log.error(`항목 ${item.item_id} 복사 실패`, {
      error: err instanceof Error ? err.message : String(err),
      elapsedSec: ((Date.now() - startMs) / 1000).toFixed(1),
    });
    throw err;  // Promise.allSettled에서 집계하기 위해 re-throw
  }
}

/**
 * 스트림 기반 파일 복사 (진행률 DB 업데이트 포함)
 *
 * fs.copyFile 대신 ReadStream/WriteStream 파이프를 사용한다.
 * - data 이벤트에서 누적 바이트 집계
 * - UPDATE_THRESHOLD 단위마다 progress_bytes를 DB에 저장 (너무 잦은 DB 쓰기 방지)
 * - 완료 시 progress_bytes = totalBytes 확정 (100%)
 *
 * @param srcPath  원본 파일 경로 (Logger Storage)
 * @param destPath 대상 파일 경로 (공유 NAS)
 * @param jobId    copy_jobs.id (진행률 업데이트 대상)
 * @param totalBytes 전체 파일 크기 (null이면 진행률 업데이트 스킵)
 */
async function copyFileWithProgress(
  srcPath: string,
  destPath: string,
  jobId: number,
  totalBytes: number | null,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const readStream = fsSync.createReadStream(srcPath);
    const writeStream = fsSync.createWriteStream(destPath);

    let copiedBytes = 0;
    let lastReportedBytes = 0;

    // 업데이트 간격: 50MB 또는 파일 크기의 5% 중 큰 값
    // → 작은 파일은 5% 단위, 대용량 파일은 최소 50MB 단위로 DB 쓰기
    const UPDATE_THRESHOLD = totalBytes
      ? Math.max(50 * 1024 * 1024, Math.floor(totalBytes * 0.05))
      : 50 * 1024 * 1024;

    readStream.on('data', (chunk) => {
      copiedBytes += (chunk as Buffer).length;
      // 임계값 초과 시에만 DB 업데이트 (불필요한 쓰기 최소화)
      if (totalBytes && copiedBytes - lastReportedBytes >= UPDATE_THRESHOLD) {
        lastReportedBytes = copiedBytes;
        db.prepare(`UPDATE copy_jobs SET progress_bytes = ? WHERE id = ?`).run(copiedBytes, jobId);
      }
    });

    readStream.on('error', (err) => {
      writeStream.destroy();
      reject(err);
    });

    writeStream.on('error', (err) => {
      readStream.destroy();
      reject(err);
    });

    writeStream.on('finish', () => {
      // 완료 시 progress_bytes를 totalBytes로 확정 (100% 표시)
      if (totalBytes) {
        db.prepare(`UPDATE copy_jobs SET progress_bytes = ? WHERE id = ?`).run(totalBytes, jobId);
      }
      resolve();
    });

    readStream.pipe(writeStream);
  });
}

/**
 * 요청 전체를 failed 상태로 처리 (마운트 오류 등 치명적 실패 시)
 */
function markCopyFailed(requestId: number, reason: string, keepEditing = false): void {
  const now = new Date().toISOString();
  const requestStatus = keepEditing ? 'editing' : 'failed';
  db.transaction(() => {
    db.prepare(`
      UPDATE requests SET status = ?, updated_at = ? WHERE id = ?
    `).run(requestStatus, now, requestId);
    db.prepare(`
      UPDATE request_items SET item_status = 'failed', updated_at = ?
      WHERE request_id = ? AND item_status = 'approved'
    `).run(now, requestId);
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (NULL, 'copy_failed', 'requests', ?, ?, datetime('now', 'localtime'))
    `).run(requestId, reason);
  })();
}
