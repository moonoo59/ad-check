/**
 * API 클라이언트 설정
 *
 * 백엔드와 통신하는 axios 인스턴스를 생성한다.
 * 모든 API 요청/응답 처리는 이 인스턴스를 통한다.
 *
 * baseURL을 /api(상대경로)로 설정한다.
 * - Vite dev server의 proxy 설정을 통해 /api → localhost:4000/api 로 전달된다.
 * - 다른 PC에서 접속 시에도 브라우저가 Vite 서버의 /api로 요청하고,
 *   Vite proxy가 서버의 localhost:4000으로 정확히 포워딩한다.
 * - Electron 모드에서도 backend가 4000 포트에서 /api를 제공하므로 동일하게 동작한다.
 * - 환경변수(VITE_API_BASE_URL)로 오버라이드 가능 (특수 배포 환경용)
 */
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 30000, // 파일 복사 등 오래 걸리는 작업이 있으므로 30초 설정
  withCredentials: true, // 세션 쿠키 전송 (Vite proxy 경유 시에도 same-origin으로 처리됨)
  headers: {
    'Content-Type': 'application/json',
  },
});

// 응답 인터셉터: 백엔드 표준 응답 포맷 처리
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 네트워크 오류 또는 서버 다운 시
    if (!error.response) {
      console.error('[API] 서버에 연결할 수 없습니다:', error.message);
    }
    return Promise.reject(error);
  },
);
