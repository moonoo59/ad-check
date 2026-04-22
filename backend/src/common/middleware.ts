/**
 * 공통 미들웨어 모음
 *
 * - requestId: 모든 요청에 추적용 고유 ID 부여
 * - errorHandler: 전역 예외 처리기 (에러를 숨기지 않고 구조화해서 반환)
 * - notFound: 미정의 라우트에 대한 404 처리
 */
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { sendError } from './response';
import { createLogger } from './logger';

const log = createLogger('HTTP');

interface BodyParserError extends Error {
  status?: number;
  type?: string;
}

/**
 * 요청마다 고유 ID를 부여하여 로그 추적을 가능하게 한다.
 * res.locals.requestId로 어디서든 접근 가능.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.locals.requestId = uuidv4();
  res.setHeader('X-Request-Id', res.locals.requestId as string);
  next();
}

/**
 * 전역 에러 핸들러
 * Express에서 next(error)로 넘긴 모든 에러가 여기서 처리된다.
 * 에러 메시지, 스택 트레이스, 영향 범위를 로그에 남긴다.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const parserError = err as BodyParserError;

  if (parserError.type === 'entity.too.large' || parserError.status === 413) {
    log.warn(`${req.method} ${req.path} — 요청 본문 크기 초과`, {
      requestId: res.locals.requestId,
      message: err.message,
    });
    sendError(res, '요청 본문이 너무 큽니다. 입력 데이터를 줄여 다시 시도해주세요.', 413, 'PAYLOAD_TOO_LARGE');
    return;
  }

  // 원인 파악: 어디서 발생했는지 서버 로그에 기록
  log.error(`${req.method} ${req.path} — 처리되지 않은 예외`, {
    requestId: res.locals.requestId,
    message: err.message,
    stack: err.stack,
  });

  // 운영 환경에서는 스택 트레이스를 클라이언트에게 노출하지 않음
  const message =
    process.env.NODE_ENV === 'production'
      ? '서버 내부 오류가 발생했습니다. 관리자에게 문의하세요.'
      : err.message;

  sendError(res, message, 500, 'INTERNAL_SERVER_ERROR');
}

/**
 * 404 처리: 정의되지 않은 라우트에 대한 응답
 */
export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, `요청한 경로를 찾을 수 없습니다: ${req.method} ${req.path}`, 404, 'NOT_FOUND');
}
