/**
 * 공유 NAS 내 복사본 정리 서비스
 *
 * 사용 시나리오:
 * - 완료된 복사본 수동 삭제 (#5)
 * - 오전송 수정 전 목적지 파일 제거 (#6)
 *
 * 동작 원칙:
 * - 대상 파일이 이미 없어도 성공으로 처리한다.
 * - 요청일자 폴더가 비었을 때만 폴더를 삭제한다.
 * - 삭제 이력은 copy_jobs.deleted_at / deleted_by 와 audit_logs 에 남긴다.
 */
import fs from 'fs/promises';
import path from 'path';
import db from '../../config/database';
import { createLogger } from '../../common/logger';

const log = createLogger('StorageCleanup');

interface CopyJobForCleanup {
  id: number;
  request_item_id: number;
  dest_path: string;
  status: string;
  deleted_at: string | null;
}

export interface CopiedFileDeleteResult {
  copy_job_id: number;
  request_item_id: number;
  dest_path: string;
  file_existed: boolean;
  folder_deleted: boolean;
  already_missing: boolean;
}

/**
 * 완료된 복사본 삭제
 *
 * - status='done'
 * - deleted_at IS NULL
 *
 * 파일이 이미 없더라도 삭제 메타데이터는 기록한다.
 */
export async function deleteCopiedFile(
  copyJobId: number,
  deletedBy: number,
): Promise<CopiedFileDeleteResult> {
  const job = db.prepare(`
    SELECT id, request_item_id, dest_path, status, deleted_at
    FROM copy_jobs
    WHERE id = ?
  `).get(copyJobId) as CopyJobForCleanup | undefined;

  if (!job) {
    throw new Error('복사 작업을 찾을 수 없습니다.');
  }
  if (job.status !== 'done') {
    throw new Error('완료된 복사본만 삭제할 수 있습니다.');
  }
  if (job.deleted_at) {
    throw new Error('이미 삭제 처리된 복사본입니다.');
  }

  return deleteFileForJob(job, deletedBy, 'copied_file_delete');
}

/**
 * 오전송 수정 전 현재 살아 있는 복사본을 먼저 제거한다.
 *
 * 삭제할 완료 복사본이 없으면 null 반환.
 */
export async function deleteActiveCopiedFileForItem(
  requestItemId: number,
  deletedBy: number,
): Promise<CopiedFileDeleteResult | null> {
  const job = db.prepare(`
    SELECT id, request_item_id, dest_path, status, deleted_at
    FROM copy_jobs
    WHERE request_item_id = ?
      AND status = 'done'
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `).get(requestItemId) as CopyJobForCleanup | undefined;

  if (!job) {
    return null;
  }

  return deleteFileForJob(job, deletedBy, 'copied_file_delete_for_correction');
}

async function deleteFileForJob(
  job: CopyJobForCleanup,
  deletedBy: number,
  auditAction: string,
): Promise<CopiedFileDeleteResult> {
  const { fileExisted, folderDeleted } = await removeFileAndEmptyParent(job.dest_path);
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(`
      UPDATE copy_jobs
      SET deleted_at = ?, deleted_by = ?, updated_at = ?
      WHERE id = ?
    `).run(now, deletedBy, now, job.id);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, ?, 'copy_jobs', ?, ?, datetime('now', 'localtime'))
    `).run(
      deletedBy,
      auditAction,
      job.id,
      JSON.stringify({
        request_item_id: job.request_item_id,
        dest_path: job.dest_path,
        file_existed: fileExisted,
        folder_deleted: folderDeleted,
      }),
    );
  })();

  log.info('공유 NAS 복사본 삭제 처리 완료', {
    copyJobId: job.id,
    requestItemId: job.request_item_id,
    destPath: job.dest_path,
    fileExisted,
    folderDeleted,
  });

  return {
    copy_job_id: job.id,
    request_item_id: job.request_item_id,
    dest_path: job.dest_path,
    file_existed: fileExisted,
    folder_deleted: folderDeleted,
    already_missing: !fileExisted,
  };
}

async function removeFileAndEmptyParent(filePath: string): Promise<{ fileExisted: boolean; folderDeleted: boolean }> {
  let fileExisted = false;
  let folderDeleted = false;

  try {
    await fs.unlink(filePath);
    fileExisted = true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') {
      throw error;
    }
  }

  const parentDir = path.dirname(filePath);

  try {
    const entries = await fs.readdir(parentDir);
    if (entries.length === 0) {
      await fs.rmdir(parentDir);
      folderDeleted = true;
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT' && err.code !== 'ENOTEMPTY') {
      throw error;
    }
  }

  return { fileExisted, folderDeleted };
}
