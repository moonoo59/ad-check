/**
 * express-session 타입 확장
 *
 * express-session의 SessionData 인터페이스에 커스텀 필드를 추가한다.
 * 이 파일이 있어야 req.session.userId 등을 TypeScript에서 타입 안전하게 사용할 수 있다.
 */
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    // 로그인한 사용자 ID (users.id)
    userId: number;
    // 로그인한 사용자 역할 (ad_team / tech_team / admin)
    userRole: string;
    // 로그인한 사용자 표시명
    displayName: string;
    // 로그인한 사용자 계정명
    username: string;
  }
}
