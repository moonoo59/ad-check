/**
 * 사용자 관리 라우터 (admin 전용)
 *
 * GET    /api/users                  — 사용자 목록
 * GET    /api/users/:id              — 사용자 단건 조회
 * POST   /api/users                  — 신규 사용자 생성
 * PATCH  /api/users/:id              — 사용자 정보 수정 (display_name, role, is_active)
 * POST   /api/users/:id/reset-password — 비밀번호 초기화 (관리자)
 *
 * 주의: 모든 엔드포인트는 admin 전용
 */

import { Router, Request, Response, IRouter } from 'express';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  resetPassword,
  type CreateUserDto,
  type UpdateUserDto,
} from './users.service';
import { sendSuccess, sendError } from '../../common/response';
import { requireAuth, requireRole, getCurrentUser } from '../../common/auth.middleware';

const router: IRouter = Router();

// 모든 사용자 관리 라우트에 admin 권한 필요
router.use(requireAuth, requireRole('admin'));

/**
 * GET /api/users
 * 사용자 목록 조회 (비활성 포함)
 * query: ?include_inactive=true (기본 true)
 */
router.get('/', (req: Request, res: Response): void => {
  const includeInactive = req.query.include_inactive !== 'false';
  const users = getUsers(includeInactive);
  sendSuccess(res, { users, total: users.length });
});

/**
 * GET /api/users/:id
 * 사용자 단건 조회
 */
router.get('/:id', (req: Request, res: Response): void => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    sendError(res, '유효하지 않은 사용자 ID입니다.', 400, 'INVALID_ID');
    return;
  }

  const user = getUserById(id);
  if (!user) {
    sendError(res, '사용자를 찾을 수 없습니다.', 404, 'NOT_FOUND');
    return;
  }

  sendSuccess(res, user);
});

/**
 * POST /api/users
 * 신규 사용자 생성
 * body: { username, display_name, role, password }
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const admin = getCurrentUser(req);
  const body = req.body as Partial<CreateUserDto>;

  // 입력값 검증
  if (!body.username || typeof body.username !== 'string' || body.username.trim() === '') {
    sendError(res, '사용자 ID(username)를 입력해주세요.', 400, 'INVALID_INPUT');
    return;
  }
  if (!body.display_name || typeof body.display_name !== 'string' || body.display_name.trim() === '') {
    sendError(res, '표시 이름을 입력해주세요.', 400, 'INVALID_INPUT');
    return;
  }
  if (!body.role || !['admin', 'tech_team', 'ad_team'].includes(body.role)) {
    sendError(res, '유효한 역할을 선택해주세요. (admin / tech_team / ad_team)', 400, 'INVALID_INPUT');
    return;
  }
  if (!body.password || typeof body.password !== 'string' || body.password.length < 6) {
    sendError(res, '비밀번호는 6자 이상이어야 합니다.', 400, 'INVALID_INPUT');
    return;
  }

  // 권한 필드 파싱 (미지정 시 역할 기반 기본값 적용)
  const rawBody = req.body as Record<string, unknown>;
  const canCopy = rawBody.can_copy !== undefined ? Number(rawBody.can_copy) : undefined;
  const canViewStats = rawBody.can_view_stats !== undefined ? Number(rawBody.can_view_stats) : undefined;

  // assigned_channels: 배열로 전달 받아 JSON 문자열로 변환
  let assignedChannels: string | undefined;
  if (rawBody.assigned_channels !== undefined) {
    const ch = rawBody.assigned_channels;
    if (Array.isArray(ch)) {
      assignedChannels = JSON.stringify(ch.filter((c): c is string => typeof c === 'string'));
    } else {
      sendError(res, 'assigned_channels는 배열이어야 합니다.', 400, 'INVALID_INPUT');
      return;
    }
  }

  // phone/email: 빈 문자열은 null로 처리
  const phone = typeof rawBody.phone === 'string' ? rawBody.phone.trim() || null : null;
  const email = typeof rawBody.email === 'string' ? rawBody.email.trim() || null : null;

  const newUserId = await createUser(
    {
      username: body.username,
      display_name: body.display_name,
      role: body.role,
      password: body.password,
      can_copy: canCopy,
      can_view_stats: canViewStats,
      assigned_channels: assignedChannels,
      phone,
      email,
    },
    admin.id,
  );

  if (newUserId === null) {
    sendError(res, '이미 사용 중인 사용자 ID입니다.', 409, 'DUPLICATE_USERNAME');
    return;
  }

  const created = getUserById(newUserId);
  sendSuccess(res, created, '사용자가 등록되었습니다.', 201);
});

/**
 * PATCH /api/users/:id
 * 사용자 정보 수정 (display_name, role, is_active)
 * body: { display_name?, role?, is_active? }
 */
router.patch('/:id', (req: Request, res: Response): void => {
  const admin = getCurrentUser(req);
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    sendError(res, '유효하지 않은 사용자 ID입니다.', 400, 'INVALID_ID');
    return;
  }

  const body = req.body as Partial<UpdateUserDto>;

  // role 검증
  if (body.role !== undefined && !['admin', 'tech_team', 'ad_team'].includes(body.role)) {
    sendError(res, '유효한 역할을 선택해주세요. (admin / tech_team / ad_team)', 400, 'INVALID_INPUT');
    return;
  }
  // is_active 검증
  if (body.is_active !== undefined && ![0, 1].includes(Number(body.is_active))) {
    sendError(res, 'is_active는 0 또는 1이어야 합니다.', 400, 'INVALID_INPUT');
    return;
  }

  // 권한 필드 검증 (0 또는 1만 허용)
  const rawPatch = req.body as Record<string, unknown>;
  if (rawPatch.can_copy !== undefined) {
    (body as UpdateUserDto).can_copy = Number(rawPatch.can_copy);
    if (![0, 1].includes((body as UpdateUserDto).can_copy!)) {
      sendError(res, 'can_copy는 0 또는 1이어야 합니다.', 400, 'INVALID_INPUT');
      return;
    }
  }
  if (rawPatch.can_view_stats !== undefined) {
    (body as UpdateUserDto).can_view_stats = Number(rawPatch.can_view_stats);
    if (![0, 1].includes((body as UpdateUserDto).can_view_stats!)) {
      sendError(res, 'can_view_stats는 0 또는 1이어야 합니다.', 400, 'INVALID_INPUT');
      return;
    }
  }
  if (rawPatch.assigned_channels !== undefined) {
    const ch = rawPatch.assigned_channels;
    if (!Array.isArray(ch)) {
      sendError(res, 'assigned_channels는 배열이어야 합니다.', 400, 'INVALID_INPUT');
      return;
    }
    (body as UpdateUserDto).assigned_channels = JSON.stringify(
      ch.filter((c): c is string => typeof c === 'string'),
    );
  }
  // phone/email: 빈 문자열은 null로 처리
  if (rawPatch.phone !== undefined) {
    (body as UpdateUserDto).phone = typeof rawPatch.phone === 'string' ? rawPatch.phone.trim() || null : null;
  }
  if (rawPatch.email !== undefined) {
    (body as UpdateUserDto).email = typeof rawPatch.email === 'string' ? rawPatch.email.trim() || null : null;
  }

  // 자기 자신 비활성화 방지
  if (body.is_active === 0 && id === admin.id) {
    sendError(res, '자기 자신을 비활성화할 수 없습니다.', 400, 'SELF_DEACTIVATE');
    return;
  }

  const ok = updateUser(id, body as UpdateUserDto, admin.id);
  if (!ok) {
    sendError(res, '사용자를 찾을 수 없습니다.', 404, 'NOT_FOUND');
    return;
  }

  const updated = getUserById(id);
  sendSuccess(res, updated, '사용자 정보가 수정되었습니다.');
});

/**
 * POST /api/users/:id/reset-password
 * 관리자가 사용자 비밀번호 초기화
 * body: { new_password: string } (최소 6자)
 */
router.post('/:id/reset-password', async (req: Request, res: Response): Promise<void> => {
  const admin = getCurrentUser(req);
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    sendError(res, '유효하지 않은 사용자 ID입니다.', 400, 'INVALID_ID');
    return;
  }

  const { new_password } = req.body as { new_password?: string };
  if (!new_password || typeof new_password !== 'string' || new_password.length < 6) {
    sendError(res, '새 비밀번호는 6자 이상이어야 합니다.', 400, 'INVALID_INPUT');
    return;
  }

  const ok = await resetPassword(id, new_password, admin.id);
  if (!ok) {
    sendError(res, '사용자를 찾을 수 없습니다.', 404, 'NOT_FOUND');
    return;
  }

  sendSuccess(res, { user_id: id }, '비밀번호가 초기화되었습니다.');
});

export default router;
