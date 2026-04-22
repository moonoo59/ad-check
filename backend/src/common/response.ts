/**
 * 표준 API 응답 포맷
 *
 * 모든 API는 아래 구조를 동일하게 사용한다.
 * 프론트엔드에서 success 여부만 보고 처리 분기 가능.
 */
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message: string;
  errorCode?: string;
  timestamp: string;
  requestId: string;
}

/**
 * 성공 응답 반환
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message = '처리가 완료되었습니다.',
  statusCode = 200,
): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
    requestId: (res.locals.requestId as string) ?? uuidv4(),
  };
  res.status(statusCode).json(response);
}

/**
 * 실패 응답 반환
 */
export function sendError(
  res: Response,
  message: string,
  statusCode = 500,
  errorCode?: string,
): void {
  const response: ApiResponse = {
    success: false,
    message,
    errorCode,
    timestamp: new Date().toISOString(),
    requestId: (res.locals.requestId as string) ?? uuidv4(),
  };
  res.status(statusCode).json(response);
}
