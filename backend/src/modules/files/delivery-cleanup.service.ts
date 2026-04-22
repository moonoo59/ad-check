/**
 * 로컬 전달 스토리지 자동 정리 서비스
 *
 * 1일(24시간) 이상 경과한 완료 파일을 삭제하고 copy_jobs를 갱신한다.
 * index.ts에서 서버 기동 시 1회 실행 + 이후 1시간 간격으로 반복 실행한다.
 *
 * 삭제 기준:
 *   copy_jobs.status = 'done'
 *   AND copy_jobs.deleted_at IS NULL
 *   AND copy_jobs.completed_at < NOW() - 24시간
 *
 * 삭제 흐름:
 *   1. 대상 copy_jobs 조회
 *   2. 파일 삭제 (fs.unlink)
 *   3. copy_jobs.deleted_at = NOW, deleted_by = NULL 업데이트
 *   4. audit_logs에 'file_cleanup' 액션 기록
 *   5. 빈 디렉토리 정리 (파일이 없어진 채널 폴더 / 날짜 폴더)
 *
 * 파일이 이미 없는 경우:
 *   ENOENT 오류는 조용히 무시하고 copy_jobs는 정상 업데이트 처리한다.
 *   (수동 삭제된 파일도 DB 기록은 일치시킴)
 */
import fs from 'fs/promises';
import path from 'path';
import db from '../../config/database';
import { env } from '../../config/env';
import { createLogger } from '../../common/logger';
import { utcNow } from '../../common/datetime';
import { resolveDeliveryPath } from '../../common/path-guards';

const log = createLogger('DeliveryCleanup');

// 보관 기간: 24시간 (1일)
const RETENTION_HOURS = 24;

interface ExpiredCopyJob {
  id: number;
  dest_path: string;
  request_item_id: number;
}

/**
 * 보관 기간 만료 파일 일괄 삭제
 *
 * @returns 삭제 성공 건수, 오류 건수
 */
export async function cleanupExpiredDeliveries(): Promise<{ deleted: number; errors: number }> {
  log.info('로컬 전달 스토리지 정리 시작');

  const expiryTime = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000).toISOString();

  const jobs = db.prepare(`
    SELECT id, dest_path, request_item_id
    FROM copy_jobs
    WHERE status = 'done'
      AND deleted_at IS NULL
      AND completed_at < ?
    ORDER BY completed_at ASC
  `).all(expiryTime) as ExpiredCopyJob[];

  if (jobs.length === 0) {
    log.info('정리 대상 없음');
    return { deleted: 0, errors: 0 };
  }

  log.info(`정리 대상: ${jobs.length}개`);

  let deleted = 0;
  let errors = 0;
  const now = utcNow();

  for (const job of jobs) {
    let filePath: string;
    try {
      filePath = resolveDeliveryPath(job.dest_path);
    } catch (err) {
      // dest_path가 traversal 위반이면 DB만 업데이트하고 넘어감
      log.warn(`파일 경로 검증 실패 (job ${job.id}): ${err}`);
      db.prepare(`
        UPDATE copy_jobs SET deleted_at = ?, deleted_by = NULL WHERE id = ?
      `).run(now, job.id);
      errors++;
      continue;
    }

    // 파일 삭제
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      // ENOENT: 이미 없는 파일은 정상 처리로 간주 (수동 삭제 등)
      const code = (err as { code?: string }).code;
      if (code !== 'ENOENT') {
        log.error(`파일 삭제 실패 (job ${job.id}): ${err}`);
        errors++;
        continue;
      }
      log.warn(`파일 이미 없음, DB만 업데이트 (job ${job.id}): ${job.dest_path}`);
    }

    // copy_jobs 상태 갱신
    db.prepare(`
      UPDATE copy_jobs SET deleted_at = ?, deleted_by = NULL WHERE id = ?
    `).run(now, job.id);

    // 감사 로그 기록
    db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, detail, created_at)
      VALUES ('file_cleanup', 'copy_jobs', ?, ?, ?)
    `).run(job.id, '자동 정리 (보관 기간 만료)', now);

    deleted++;
    log.info(`파일 삭제 완료 (job ${job.id}): ${job.dest_path}`);

    // 빈 채널 폴더 정리 (선택적)
    await tryRemoveEmptyDir(path.dirname(filePath));
  }

  // 빈 날짜 폴더 정리 (채널 폴더가 모두 비면)
  await tryCleanupDateDirs();

  log.info(`정리 완료: ${deleted}개 삭제, ${errors}개 오류`);
  return { deleted, errors };
}

/**
 * 디렉토리가 비어있으면 삭제, 파일이 있으면 무시
 */
async function tryRemoveEmptyDir(dirPath: string): Promise<void> {
  try {
    const files = await fs.readdir(dirPath);
    if (files.length === 0) {
      await fs.rmdir(dirPath);
      log.info(`빈 디렉토리 삭제: ${dirPath}`);
    }
  } catch {
    // 디렉토리 삭제 실패는 무시 (권한 문제, 레이스 컨디션 등)
  }
}

/**
 * LOCAL_DELIVERY_PATH 하위의 날짜 폴더 중 비어있는 것 정리
 * 구조: LOCAL_DELIVERY_PATH/{YYYY-MM-DD}/{채널}/
 */
async function tryCleanupDateDirs(): Promise<void> {
  try {
    const basePath = env.LOCAL_DELIVERY_PATH;
    const dateDirs = await fs.readdir(basePath);

    for (const dateDir of dateDirs) {
      const dateDirPath = path.join(basePath, dateDir);
      try {
        const stat = await fs.stat(dateDirPath);
        if (!stat.isDirectory()) continue;

        // 날짜 폴더 하위 항목 확인
        const subDirs = await fs.readdir(dateDirPath);
        if (subDirs.length === 0) {
          await fs.rmdir(dateDirPath);
          log.info(`빈 날짜 폴더 삭제: ${dateDirPath}`);
        }
      } catch {
        // 개별 폴더 정리 실패는 무시
      }
    }
  } catch {
    // 전체 정리 실패도 무시 (다음 실행에서 재시도)
  }
}
