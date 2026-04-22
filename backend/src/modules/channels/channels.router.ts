/**
 * 채널 매핑 라우터
 *
 * GET    /api/channels              - 채널 목록 (공개 — 회원가입 폼에서도 조회)
 * POST   /api/channels              - 채널 추가 (admin)
 * PATCH  /api/channels/:id          - 채널 수정 (admin)
 * GET    /api/channels/:id/histories - 채널 변경 이력 (admin)
 *
 * 목록 조회는 비로그인 포함 공개 접근 허용.
 * (회원가입 신청 화면에서 담당채널 선택에 사용됨)
 * 추가/수정/이력은 admin만 가능.
 */
import { Router, Request, Response, IRouter } from 'express';
import {
  getChannels,
  getChannelById,
  createChannel,
  updateChannel,
  getChannelHistories,
  CreateChannelDto,
  UpdateChannelDto,
} from './channels.service';
import { sendSuccess, sendError } from '../../common/response';
import { requireAuth, requireRole, getCurrentUser } from '../../common/auth.middleware';

const router: IRouter = Router();

/**
 * GET /api/channels
 * 채널 목록 조회
 * 비로그인 공개 접근 허용 — 회원가입 화면에서 담당채널 선택 시 사용
 * query: include_inactive=true 이면 비활성 채널 포함 (admin만 의미 있음)
 */
router.get('/', (req: Request, res: Response): void => {
  const includeInactive = req.query.include_inactive === 'true';
  const channels = getChannels(includeInactive);

  sendSuccess(res, {
    channels,
    total: channels.length,
  });
});

/**
 * POST /api/channels
 * 채널 추가 (admin만)
 */
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  (req: Request, res: Response): void => {
    const { storage_folder, display_name, nas_folder, description } = req.body as CreateChannelDto;

    // 필수값 검증
    if (!storage_folder || typeof storage_folder !== 'string' || storage_folder.trim() === '') {
      sendError(res, '스토리지 폴더명은 필수입니다.', 400, 'INVALID_INPUT');
      return;
    }
    if (!display_name || typeof display_name !== 'string' || display_name.trim() === '') {
      sendError(res, '표시명은 필수입니다.', 400, 'INVALID_INPUT');
      return;
    }
    if (!nas_folder || typeof nas_folder !== 'string' || nas_folder.trim() === '') {
      sendError(res, 'NAS 폴더명은 필수입니다.', 400, 'INVALID_INPUT');
      return;
    }

    try {
      const channel = createChannel({ storage_folder, display_name, nas_folder, description });
      sendSuccess(res, channel, '채널이 추가되었습니다.', 201);
    } catch (err: unknown) {
      // UNIQUE 제약 위반 (storage_folder 중복)
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE')) {
        sendError(res, '이미 사용 중인 스토리지 폴더명입니다.', 409, 'DUPLICATE_STORAGE_FOLDER');
        return;
      }
      throw err;
    }
  },
);

/**
 * PATCH /api/channels/:id
 * 채널 수정 (admin만)
 * 변경된 필드만 이력에 자동 기록
 */
router.patch(
  '/:id',
  requireAuth,
  requireRole('admin'),
  (req: Request, res: Response): void => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, '유효하지 않은 채널 ID입니다.', 400, 'INVALID_ID');
      return;
    }

    const existing = getChannelById(id);
    if (!existing) {
      sendError(res, '채널을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      return;
    }

    const dto = req.body as UpdateChannelDto;

    // 수정 가능 필드 외에 다른 값은 무시 (화이트리스트 방식)
    const allowed: UpdateChannelDto = {};
    if ('storage_folder' in dto) allowed.storage_folder = dto.storage_folder;
    if ('display_name' in dto) allowed.display_name = dto.display_name;
    if ('nas_folder' in dto) allowed.nas_folder = dto.nas_folder;
    if ('description' in dto) allowed.description = dto.description;
    if ('is_active' in dto) {
      // is_active는 0 또는 1만 허용
      allowed.is_active = dto.is_active === 0 ? 0 : 1;
    }

    if (Object.keys(allowed).length === 0) {
      sendError(res, '수정할 필드가 없습니다.', 400, 'NOTHING_TO_UPDATE');
      return;
    }

    const user = getCurrentUser(req);

    try {
      const updated = updateChannel(id, allowed, user.id);
      sendSuccess(res, updated, '채널이 수정되었습니다.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE')) {
        sendError(res, '이미 사용 중인 스토리지 폴더명입니다.', 409, 'DUPLICATE_STORAGE_FOLDER');
        return;
      }
      throw err;
    }
  },
);

/**
 * GET /api/channels/:id/histories
 * 채널 변경 이력 조회 (admin만)
 * query: limit, offset
 */
router.get(
  '/:id/histories',
  requireAuth,
  requireRole('admin'),
  (req: Request, res: Response): void => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, '유효하지 않은 채널 ID입니다.', 400, 'INVALID_ID');
      return;
    }

    const channel = getChannelById(id);
    if (!channel) {
      sendError(res, '채널을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      return;
    }

    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10), 100);
    const offset = parseInt(String(req.query.offset ?? '0'), 10);

    const histories = getChannelHistories(id, limit, offset);

    sendSuccess(res, {
      channel_id: id,
      storage_folder: channel.storage_folder,
      histories,
      limit,
      offset,
    });
  },
);

export default router;
