/**
 * 공유 NAS 복사본 정리 라우터
 *
 * DELETE /api/files/copied-files/:copyJobId
 *   완료된 복사본 삭제 (tech_team, admin)
 */
import { Router, Request, Response, IRouter } from 'express';
import { requireAuth, getCurrentUser } from '../../common/auth.middleware';
import { sendError, sendSuccess } from '../../common/response';
import { deleteCopiedFile } from './storage-cleanup.service';

const router: IRouter = Router();

router.delete(
  '/copied-files/:copyJobId',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = getCurrentUser(req);
    const copyJobId = parseInt(req.params.copyJobId, 10);

    if (isNaN(copyJobId)) {
      sendError(res, '유효하지 않은 복사 작업 ID입니다.', 400, 'INVALID_ID');
      return;
    }

    try {
      const result = await deleteCopiedFile(copyJobId, user.id);
      sendSuccess(res, result, result.already_missing ? '파일이 이미 없어 삭제 처리만 완료했습니다.' : '복사본을 삭제했습니다.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '복사본 삭제에 실패했습니다.';
      const statusCode = message.includes('찾을 수 없습니다')
        ? 404
        : message.includes('완료된 복사본')
          || message.includes('이미 삭제 처리')
          ? 400
          : 500;
      sendError(res, message, statusCode, 'DELETE_COPIED_FILE_FAILED');
    }
  },
);

export default router;
