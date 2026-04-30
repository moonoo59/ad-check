import { Router, Request, Response, IRouter } from 'express';
import db from '../../config/database';
import { requireAuth, requireRole, getCurrentUser } from '../../common/auth.middleware';
import { sendSuccess, sendError } from '../../common/response';
import { utcNow } from '../../common/datetime';

const router: IRouter = Router();

/**
 * GET /api/system-settings
 * 시스템 설정 목록 조회 (admin 전용)
 */
router.get('/', requireAuth, requireRole('admin'), (req: Request, res: Response): void => {
  const rows = db.prepare(`
    SELECT s.*, u.display_name as updated_by_name
    FROM system_settings s
    LEFT JOIN users u ON s.updated_by = u.id
    ORDER BY s.setting_key ASC
  `).all();
  sendSuccess(res, { items: rows });
});

/**
 * PATCH /api/system-settings/:key
 * 시스템 설정 수정 (admin 전용)
 */
router.patch('/:key', requireAuth, requireRole('admin'), (req: Request, res: Response): void => {
  const user = getCurrentUser(req);
  const settingKey = req.params.key;
  const { setting_value } = req.body;

  if (typeof setting_value !== 'string') {
    sendError(res, 'setting_value는 문자열이어야 합니다.', 400);
    return;
  }

  const existing = db.prepare('SELECT * FROM system_settings WHERE setting_key = ?').get(settingKey) as any;
  if (!existing) {
    sendError(res, '설정을 찾을 수 없습니다.', 404);
    return;
  }

  db.prepare(`
    UPDATE system_settings
    SET setting_value = ?, updated_by = ?, updated_at = ?
    WHERE setting_key = ?
  `).run(setting_value, user.id, utcNow(), settingKey);

  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, detail, created_at)
    VALUES (?, 'system_setting_update', 'system_settings', ?, ?)
  `).run(user.id, `${settingKey}: ${existing.setting_value} -> ${setting_value}`, utcNow());

  sendSuccess(res, null, '설정이 수정되었습니다.');
});

/**
 * GET /api/system-settings/public
 * 인증된 사용자에게 공개적으로 필요한 설정만 제공
 */
router.get('/public', requireAuth, (req: Request, res: Response): void => {
  const rows = db.prepare(`
    SELECT setting_key, setting_value, value_type
    FROM system_settings
    WHERE setting_key LIKE 'feature.%'
  `).all();
  sendSuccess(res, { items: rows });
});

export default router;
