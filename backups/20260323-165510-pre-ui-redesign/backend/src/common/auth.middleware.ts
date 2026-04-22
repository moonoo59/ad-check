/**
 * 인증 및 권한 미들웨어
 *
 * requireAuth  : 로그인 여부만 확인 (모든 인증된 사용자)
 * requireRole  : 특정 역할을 가진 사용자만 허용
 * getCurrentUser: 세션에서 사용자 정보를 추출하는 헬퍼
 *
 * 세션은 express-session의 req.session에 저장된다.
 * types/session.d.ts에서 SessionData를 확장하여 userId, userRole 등을 선언.
 */
import { Request, Response, NextFunction } from 'express';
import { sendError } from './response';

/**
 * 로그인 여부 확인 미들웨어
 * 세션에 userId가 없으면 401 응답
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    sendError(res, '로그인이 필요합니다.', 401, 'UNAUTHORIZED');
    return;
  }
  next();
}

/**
 * 역할 기반 접근 제어 미들웨어
 *
 * 사용 예시:
 *   router.post('/channels', requireAuth, requireRole('admin'), handler)
 *   router.get('/requests', requireAuth, requireRole('tech_team', 'admin'), handler)
 *
 * @param roles 허용할 역할 목록 (하나 이상)
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // requireAuth 이후에 호출되어야 하므로 userId 존재를 가정
    if (!req.session.userId) {
      sendError(res, '로그인이 필요합니다.', 401, 'UNAUTHORIZED');
      return;
    }

    if (!roles.includes(req.session.userRole ?? '')) {
      sendError(
        res,
        `이 작업은 [${roles.join(', ')}] 역할만 수행할 수 있습니다.`,
        403,
        'FORBIDDEN',
      );
      return;
    }

    next();
  };
}

/**
 * 현재 로그인한 사용자 정보를 세션에서 추출한다.
 * requireAuth 이후에 호출하면 항상 값이 보장된다.
 */
export function getCurrentUser(req: Request) {
  return {
    id: req.session.userId as number,
    role: req.session.userRole as string,
    displayName: req.session.displayName as string,
    username: req.session.username as string,
  };
}
