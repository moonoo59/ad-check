/**
 * 감사 로그 라우터 (admin 전용)
 *
 * GET /api/audit/logs
 *   — 감사 로그 목록 (이벤트 유형 / 날짜 / 사용자 필터, 페이지네이션)
 *
 * 쿼리 파라미터:
 *   action      : 이벤트 코드 (예: user_login, copy_done)
 *   user_id     : 특정 사용자 행위만 조회
 *   from        : YYYY-MM-DD (KST 기준, UTC 변환)
 *   to          : YYYY-MM-DD (KST 기준, UTC 변환)
 *   entity_type : 대상 엔티티 종류 (예: requests, copy_jobs)
 *   page        : 페이지 번호 (기본 1)
 *   limit       : 페이지당 건수 (기본 50, 최대 200)
 */

import { Router, Request, Response, IRouter } from 'express';
import db from '../../config/database';
import { sendSuccess } from '../../common/response';
import { requireAuth, requireRole } from '../../common/auth.middleware';

const router: IRouter = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/logs', (req: Request, res: Response): void => {
  const {
    action,
    user_id,
    from,
    to,
    entity_type,
    page,
    limit: limitStr,
  } = req.query as Record<string, string>;

  const limit = Math.min(parseInt(limitStr ?? '50', 10), 200);
  const offset = (Math.max(parseInt(page ?? '1', 10), 1) - 1) * limit;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (action) {
    conditions.push('al.action = ?');
    params.push(action);
  }
  if (user_id) {
    conditions.push('al.user_id = ?');
    params.push(parseInt(user_id, 10));
  }
  if (entity_type) {
    conditions.push('al.entity_type = ?');
    params.push(entity_type);
  }
  if (from) {
    conditions.push('al.created_at >= ?');
    params.push(new Date(`${from}T00:00:00+09:00`).toISOString());
  }
  if (to) {
    conditions.push('al.created_at <= ?');
    params.push(new Date(`${to}T23:59:59+09:00`).toISOString());
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM audit_logs al ${where}`).get(...params) as { cnt: number }).cnt;

  const logs = db.prepare(`
    SELECT
      al.id,
      al.user_id,
      u.display_name AS user_name,
      u.username,
      al.action,
      al.entity_type,
      al.entity_id,
      al.detail,
      al.ip_address,
      al.created_at
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    ${where}
    ORDER BY al.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  sendSuccess(res, { logs, total, page: parseInt(page ?? '1', 10), limit });
});

export default router;
