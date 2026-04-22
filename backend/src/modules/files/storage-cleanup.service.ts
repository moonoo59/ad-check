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
import { randomUUID } from 'crypto';
import db from '../../config/database';
import { createLogger } from '../../common/logger';
import { env } from '../../config/env';
import { utcNow } from '../../common/datetime';
import { resolvePathWithinRoot } from '../../common/path-guards';

const log = createLogger('StorageCleanup');

interface CopyJobForCleanup {
  id: number;
  request_item_id: number;
  dest_path: string;
  status: string;
  deleted_at: string | null;
}

interface StagedDeleteFile {
  originalPath: string;
  trashPath: string;
  parentDir: string;
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
  await ensureSharedNasMounted();

  const safeDestPath = resolvePathWithinSharedNas(job.dest_path);
  let fileExisted = false;
  let folderDeleted = false;
  let stagedFile: StagedDeleteFile | null = null;

  try {
    const staged = await stageFileForDeletion(safeDestPath, job.id);
    fileExisted = staged.fileExisted;
    folderDeleted = staged.folderDeleted;
    stagedFile = staged.stagedFile;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : '공유 NAS 복사본 삭제 준비에 실패했습니다.');
  }

  const now = utcNow();

  try {
    db.transaction(() => {
      db.prepare(`
        UPDATE copy_jobs
        SET deleted_at = ?, deleted_by = ?, updated_at = ?
        WHERE id = ?
      `).run(now, deletedBy, now, job.id);

      db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
        VALUES (?, ?, 'copy_jobs', ?, ?, ?)
      `).run(
        deletedBy,
        auditAction,
        job.id,
        JSON.stringify({
          request_item_id: job.request_item_id,
          dest_path: safeDestPath,
          file_existed: fileExisted,
          folder_deleted: folderDeleted,
        }),
        now,
      );
    })();
  } catch (error) {
    if (stagedFile) {
      try {
        await restoreStagedFile(stagedFile);
      } catch (restoreError) {
        log.error('복사본 삭제 후 DB 기록과 파일 복구 모두 실패', {
          copyJobId: job.id,
          requestItemId: job.request_item_id,
          destPath: safeDestPath,
          dbError: error instanceof Error ? error.message : String(error),
          restoreError: restoreError instanceof Error ? restoreError.message : String(restoreError),
        });
        throw new Error('파일 삭제 후 기록 저장과 파일 복구에 모두 실패했습니다. 즉시 관리자 확인이 필요합니다.');
      }

      throw new Error('삭제 기록 저장에 실패해 파일을 원래 위치로 복구했습니다. 다시 시도해주세요.');
    }

    if (folderDeleted) {
      try {
        await fs.mkdir(path.dirname(safeDestPath), { recursive: true });
      } catch (restoreError) {
        log.error('삭제 기록 실패 후 빈 폴더 복구 실패', {
          copyJobId: job.id,
          requestItemId: job.request_item_id,
          destPath: safeDestPath,
          dbError: error instanceof Error ? error.message : String(error),
          restoreError: restoreError instanceof Error ? restoreError.message : String(restoreError),
        });
        throw new Error('삭제 기록 저장과 폴더 복구에 실패했습니다. 즉시 관리자 확인이 필요합니다.');
      }
    }

    throw new Error(error instanceof Error ? error.message : '복사본 삭제 기록 저장에 실패했습니다.');
  }

  if (stagedFile) {
    await purgeStagedFile(stagedFile);
  }

  log.info('공유 NAS 복사본 삭제 처리 완료', {
    copyJobId: job.id,
    requestItemId: job.request_item_id,
    destPath: safeDestPath,
    fileExisted,
    folderDeleted,
  });

  return {
    copy_job_id: job.id,
    request_item_id: job.request_item_id,
    dest_path: safeDestPath,
    file_existed: fileExisted,
    folder_deleted: folderDeleted,
    already_missing: !fileExisted,
  };
}

async function ensureSharedNasMounted(): Promise<void> {
  try {
    const stat = await fs.stat(env.SHARED_NAS_MOUNT);
    if (!stat.isDirectory()) {
      throw new Error();
    }
  } catch {
    throw new Error('공유 NAS가 마운트되어 있지 않아 삭제를 진행할 수 없습니다.');
  }
}

function resolvePathWithinSharedNas(targetPath: string): string {
  return resolvePathWithinRoot(env.SHARED_NAS_MOUNT, targetPath, '공유 NAS 삭제 경로');
}

function getTrashRoot(): string {
  return path.join(path.resolve(env.SHARED_NAS_MOUNT), '.ad-check-trash');
}

async function stageFileForDeletion(
  filePath: string,
  copyJobId: number,
): Promise<{ fileExisted: boolean; folderDeleted: boolean; stagedFile: StagedDeleteFile | null }> {
  const parentDir = path.dirname(filePath);

  try {
    await fs.access(filePath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') {
      throw error;
    }

    const folderDeleted = await removeDirIfEmpty(parentDir);
    return { fileExisted: false, folderDeleted, stagedFile: null };
  }

  const trashRoot = getTrashRoot();
  await fs.mkdir(trashRoot, { recursive: true });

  const trashPath = path.join(
    trashRoot,
    `${Date.now()}-${copyJobId}-${randomUUID()}-${path.basename(filePath)}`,
  );

  await fs.rename(filePath, trashPath);
  const folderDeleted = await removeDirIfEmpty(parentDir);

  return {
    fileExisted: true,
    folderDeleted,
    stagedFile: {
      originalPath: filePath,
      trashPath,
      parentDir,
    },
  };
}

async function restoreStagedFile(stagedFile: StagedDeleteFile): Promise<void> {
  await fs.mkdir(stagedFile.parentDir, { recursive: true });
  await fs.rename(stagedFile.trashPath, stagedFile.originalPath);
}

async function purgeStagedFile(stagedFile: StagedDeleteFile): Promise<void> {
  try {
    await fs.unlink(stagedFile.trashPath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') {
      log.warn('임시 삭제 파일 정리에 실패', {
        trashPath: stagedFile.trashPath,
        error: err.message,
      });
      return;
    }
  }

  await removeDirIfEmpty(path.dirname(stagedFile.trashPath));
}

async function removeDirIfEmpty(dirPath: string): Promise<boolean> {
  const sharedRoot = path.resolve(env.SHARED_NAS_MOUNT);
  const trashRoot = getTrashRoot();
  const resolvedDir = path.resolve(dirPath);

  if (resolvedDir === sharedRoot || resolvedDir === trashRoot) {
    return false;
  }

  try {
    const entries = await fs.readdir(resolvedDir);
    if (entries.length === 0) {
      await fs.rmdir(resolvedDir);
      return true;
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT' && err.code !== 'ENOTEMPTY') {
      throw error;
    }
  }

  return false;
}
