/**
 * 헬스체크 라우터
 *
 * 서버가 정상 동작 중인지 확인하는 엔드포인트.
 * 추후 DB 연결 상태, 스토리지 마운트 상태도 여기서 반환 예정.
 */
import { Router, Request, Response, IRouter } from 'express';
import { sendSuccess } from '../../common/response';
import db from '../../config/database';
import { env } from '../../config/env';

const router: IRouter = Router();

router.get('/', (req: Request, res: Response) => {
  // DB 연결 상태 확인
  let dbStatus: 'ok' | 'error' = 'ok';
  try {
    db.prepare('SELECT 1').get();
  } catch {
    dbStatus = 'error';
  }

  sendSuccess(res, {
    server: 'ok',
    db: dbStatus,
    environment: env.NODE_ENV,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }, '서버가 정상 동작 중입니다.');
});

export default router;
