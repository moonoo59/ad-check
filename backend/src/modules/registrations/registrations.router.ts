/**
 * 회원가입 신청 관리 라우터
 *
 * GET  /api/registrations                  — 신청 목록 (tech_team + admin)
 * GET  /api/registrations/pending-count    — 대기 건수 (뱃지용, tech_team + admin)
 * POST /api/registrations/:id/approve      — 승인 (역할 기반 권한 확인)
 * POST /api/registrations/:id/reject       — 반려 (역할 기반 권한 확인)
 *
 * POST /api/auth/register 는 auth.router.ts에 공개 엔드포인트로 별도 등록
 */

import { Router, Request, Response, IRouter } from 'express';
import {
  getRegistrations,
  getPendingCount,
  approveRegistration,
  rejectRegistration,
} from './registrations.service';
import { sendSuccess, sendError } from '../../common/response';
import { requireAuth, requireRole, getCurrentUser } from '../../common/auth.middleware';

const router: IRouter = Router();

// tech_team, admin만 접근 가능 (ad_team은 자신의 신청 목록 접근 불가)
router.use(requireAuth, requireRole('tech_team', 'admin'));

/**
 * GET /api/registrations
 * 신청 목록 조회
 * query: ?status=pending|approved|rejected (미지정 시 전체)
 *
 * tech_team: ad_team 신청만 반환
 * admin: 전체 반환
 */
router.get('/', (req: Request, res: Response): void => {
  const { role } = getCurrentUser(req);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  // 유효한 status 값만 허용
  if (status && !['pending', 'approved', 'rejected'].includes(status)) {
    sendError(res, 'status는 pending, approved, rejected 중 하나여야 합니다.', 400, 'INVALID_INPUT');
    return;
  }

  const registrations = getRegistrations(role, status);
  sendSuccess(res, { registrations, total: registrations.length });
});

/**
 * GET /api/registrations/pending-count
 * 대기 중인 신청 건수 반환 (GlobalNav 뱃지용)
 */
router.get('/pending-count', (req: Request, res: Response): void => {
  const { role } = getCurrentUser(req);
  const count = getPendingCount(role);
  sendSuccess(res, { count });
});

/**
 * POST /api/registrations/:id/approve
 * 신청 승인 — 역할 기반 권한 확인
 * tech_team: ad_team 신청만 승인 가능
 * admin: 전체 승인 가능
 */
router.post('/:id/approve', async (req: Request, res: Response): Promise<void> => {
  const approver = getCurrentUser(req);
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    sendError(res, '유효하지 않은 신청 ID입니다.', 400, 'INVALID_ID');
    return;
  }

  const result = await approveRegistration(id, approver.id, approver.role);

  if (result === 'not_found') {
    sendError(res, '신청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
    return;
  }
  if (result === 'not_pending') {
    sendError(res, '이미 처리된 신청입니다.', 409, 'ALREADY_PROCESSED');
    return;
  }
  if (result === 'forbidden') {
    sendError(res, '해당 역할의 신청을 승인할 권한이 없습니다.', 403, 'FORBIDDEN');
    return;
  }
  if (result === 'duplicate_username') {
    sendError(res, '이미 동일한 아이디의 계정이 존재합니다.', 409, 'DUPLICATE_USERNAME');
    return;
  }

  sendSuccess(res, { user_id: result }, '신청이 승인되었습니다. 계정이 생성되었습니다.');
});

/**
 * POST /api/registrations/:id/reject
 * 신청 반려 — 역할 기반 권한 확인
 * body: { reason: string }
 */
router.post('/:id/reject', (req: Request, res: Response): void => {
  const approver = getCurrentUser(req);
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    sendError(res, '유효하지 않은 신청 ID입니다.', 400, 'INVALID_ID');
    return;
  }

  const { reason } = req.body as { reason?: string };
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    sendError(res, '반려 사유를 입력해주세요.', 400, 'INVALID_INPUT');
    return;
  }

  const result = rejectRegistration(id, approver.id, approver.role, reason);

  if (result === 'not_found') {
    sendError(res, '신청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
    return;
  }
  if (result === 'not_pending') {
    sendError(res, '이미 처리된 신청입니다.', 409, 'ALREADY_PROCESSED');
    return;
  }
  if (result === 'forbidden') {
    sendError(res, '해당 역할의 신청을 반려할 권한이 없습니다.', 403, 'FORBIDDEN');
    return;
  }

  sendSuccess(res, null, '신청이 반려되었습니다.');
});

export default router;
