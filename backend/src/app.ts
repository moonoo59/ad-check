/**
 * Express 애플리케이션 설정
 *
 * 미들웨어 등록 순서:
 * 1. 요청 ID 부여 (모든 요청 추적 가능하도록)
 * 2. 로깅 (morgan)
 * 3. CORS
 * 4. JSON 파싱
 * 5. 세션 (express-session) ← 라우터보다 반드시 앞에 위치
 * 6. 라우터 (API)
 * 7. 정적 파일 서빙 (frontend/dist)
 * 8. SPA fallback → index.html
 * 9. 404 처리 (API 경로 한정)
 * 10. 전역 에러 핸들러
 *
 * 주의: 에러 핸들러는 반드시 마지막에 등록해야 한다.
 */
import express, { Application } from 'express';
import path from 'path';
import cors from 'cors';
import morgan from 'morgan';
import session from 'express-session';
import { env } from './config/env';
import { requestIdMiddleware, errorHandler, notFoundHandler } from './common/middleware';
import { morganStream } from './common/logger';

// 라우터 임포트
import healthRouter from './modules/health/health.router';
import authRouter from './modules/auth/auth.router';
import channelsRouter from './modules/channels/channels.router';
import requestsRouter from './modules/requests/requests.router';
// import storageCleanupRouter from './modules/files/storage-cleanup.router';
import auditRouter from './modules/audit/audit.router';
import statsRouter from './modules/stats/stats.router';
import systemSettingsRouter from './modules/system-settings/system-settings.router';

const app: Application = express();
const REQUEST_BODY_LIMIT = '256kb';

// 요청 추적 ID 부여 (가장 먼저 실행되어야 함)
app.use(requestIdMiddleware);

// HTTP 요청 로그 — 콘솔 + 파일 동시 기록
// 형식: :method :url :status :response-time ms - :res[content-length]
app.use(morgan(':method :url :status :response-time ms - :res[content-length] [:date[iso]]', {
  stream: morganStream,
}));

// CORS 설정 - 별도 Vite 개발 서버를 사용할 때 필요
// credentials: true는 세션 쿠키 전송에 필수
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));

// 요청 본문 파싱
// 이 앱은 파일 업로드를 받지 않고 소형 JSON 위주로 동작하므로
// 과도한 본문 크기를 초기에 차단해 메모리 압박을 줄인다.
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT, parameterLimit: 200 }));

// ===== 세션 미들웨어 =====
// 라우터보다 반드시 앞에 위치해야 req.session을 사용할 수 있다.
// MemoryStore 사용 (단일 PC 내부망 환경에서 충분)
// 주의: 서버 재시작 시 모든 세션이 소멸된다 (재로그인 필요).
//
// secure 플래그:
//   - 웹 개발서버: false (HTTP)
//   - Electron 앱: false (HTTP localhost — HTTPS 불필요, secure=true 시 쿠키 전송 안 됨)
//   - 향후 HTTPS 운영 서버 배포 시: true 로 변경
const isSecureCookie = env.NODE_ENV === 'production' && !env.IS_ELECTRON;

app.use(
  session({
    secret: env.SESSION_SECRET,
    resave: false,               // 변경 없으면 세션 재저장 안 함
    saveUninitialized: false,    // 로그인 전 빈 세션 저장 안 함
    cookie: {
      httpOnly: true,            // XSS 방어: JS에서 쿠키 접근 차단
      secure: isSecureCookie,
      maxAge: 8 * 60 * 60 * 1000,  // 세션 유효 시간: 8시간 (업무 시간 기준)
      sameSite: 'lax',           // CSRF 방어: 동일 사이트 요청만 허용
    },
  }),
);

// ===== 라우터 등록 =====

// 헬스체크 (인증 불필요)
app.use('/api/health', healthRouter);

// 인증 (로그인/로그아웃/me)
app.use('/api/auth', authRouter);

// 채널 매핑 관리
app.use('/api/channels', channelsRouter);

// 요청 관리 (등록/목록/상세/승인/반려 + 항목 파일 선택)
app.use('/api/requests', requestsRouter);

// 공유 NAS 복사본 삭제 (매뉴얼 삭제 기능 제거로 인해 비활성화. 1일 후 자동 삭제 스케줄러가 처리함)
// app.use('/api/files', storageCleanupRouter);

// 감사 로그 조회 (admin 전용)
app.use('/api/audit', auditRouter);

// 통계 대시보드 + CSV 내보내기 (admin 전용)
app.use('/api/stats', statsRouter);



// 시스템 설정 (admin 전용 + public)
app.use('/api/system-settings', systemSettingsRouter);

// ===== React 정적 파일 서빙 =====
// FRONTEND_DIST_PATH 가 주입된 경우 Vite 빌드 결과물(frontend/dist)을
// Express가 직접 서빙한다. 이 모드에서는 앱과 API가 모두 4000 포트를 쓴다.
// /api/* 경로는 위의 라우터가 먼저 처리하므로 충돌 없음.
if (env.FRONTEND_DIST_PATH) {
  const distPath = env.FRONTEND_DIST_PATH;

  // 정적 파일 서빙 (JS, CSS, 이미지 등)
  app.use(express.static(distPath));

  // SPA fallback: React Router 가 처리해야 하는 경로 → index.html 반환
  // (예: /requests, /requests/new 등)
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// 404 처리 (라우터 등록 이후에 위치해야 함)
// 정적 파일 fallback 이 활성화된 경우 먼저 처리되므로 API 404 전용
app.use(notFoundHandler);

// 전역 에러 핸들러 (반드시 마지막에 등록)
app.use(errorHandler);

export default app;
