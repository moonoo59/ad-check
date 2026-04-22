/**
 * 루트 앱 컴포넌트
 *
 * 라우팅 및 전역 Provider 구성.
 *
 * 라우트 보호 규칙:
 * - 비로그인: 모든 페이지 → /login 리다이렉트 (단, /register는 공개)
 * - ad_team/tech_team: /admin/* 접근 불가 → /requests/new 리다이렉트
 * - admin: 모든 라우트 접근 가능
 * - 통계 대시보드: can_view_stats 권한이 있는 사용자만 접근 가능
 * - 신청 승인 화면: tech_team, admin만 접근 가능
 *
 * 라우트 구성:
 * /login              → 로그인 페이지
 * /register           → 회원가입 신청 (공개)
 * /forgot-password    → 비밀번호 찾기 안내 (공개)
 * /requests/new       → 화면 1: 요청 등록 (기본 페이지)
 * /requests           → 화면 2: 요청 목록
 * /requests/:id       → 화면 3: 요청 상세 (파일 탐색 결과 + 승인/반려)
 * /stats              → 통계 대시보드 (can_view_stats 권한 필요)
 * /registrations      → 회원가입 신청 승인 (tech_team + admin)
 * /admin/channels     → 화면 4: 채널 매핑 관리 (admin only)
 * /                   → /requests/new로 리다이렉트
 */

import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/ToastMessage';
import GlobalNav from './components/GlobalNav';

import LoginPage              from './pages/LoginPage';
import RegisterPage            from './pages/RegisterPage';
import ForgotPasswordPage      from './pages/ForgotPasswordPage';
import RequestListPage         from './pages/RequestListPage';
import RequestNewPage          from './pages/RequestNewPage';
import RequestDetailPage       from './pages/RequestDetailPage';
import ChannelMappingPage      from './pages/ChannelMappingPage';
import UserManagementPage      from './pages/UserManagementPage';
import AuditLogPage            from './pages/AuditLogPage';
import ChangePasswordPage      from './pages/ChangePasswordPage';
import ManualPage              from './pages/ManualPage';
import StatsDashboardPage      from './pages/StatsDashboardPage';
import RegistrationListPage    from './pages/RegistrationListPage';

/**
 * 로그인 필요 레이아웃
 * - 비로그인 시 /login 리다이렉트
 * - GlobalNav + 페이지 본문 레이아웃
 */
function RequireAuth() {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="app-surface px-6 py-5 text-sm text-[var(--app-text-soft)]">
          로딩 중...
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen">
      <GlobalNav />
      <main className="app-main-shell">
        <Outlet />
      </main>
    </div>
  );
}

/**
 * admin 전용 라우트
 * - admin이 아니면 /requests/new로 리다이렉트
 */
function RequireAdmin() {
  const { user } = useAuth();

  if (user?.role !== 'admin') {
    return <Navigate to="/requests/new" replace />;
  }

  return <Outlet />;
}

/**
 * tech_team 또는 admin 전용 라우트 (신청 승인 화면 등)
 * - ad_team이면 /requests/new로 리다이렉트
 */
function RequireTechOrAdmin() {
  const { user } = useAuth();

  if (user?.role !== 'tech_team' && user?.role !== 'admin') {
    return <Navigate to="/requests/new" replace />;
  }

  return <Outlet />;
}

/**
 * 통계 조회 권한 확인 라우트
 * - can_view_stats 권한이 없으면 /requests/new로 리다이렉트
 */
function RequireStatsPermission() {
  const { user } = useAuth();

  if (!user?.can_view_stats) {
    return <Navigate to="/requests/new" replace />;
  }

  return <Outlet />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* 공개 접근: 회원가입 신청, 비밀번호 찾기 (로그인 불필요) */}
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route index element={<Navigate to="/requests/new" replace />} />
        <Route path="/requests"      element={<RequestListPage />} />
        <Route path="/requests/new"  element={<RequestNewPage />} />
        <Route path="/requests/:id"  element={<RequestDetailPage />} />
        <Route path="/manual"        element={<ManualPage />} />

        {/* 비밀번호 변경은 모든 로그인 사용자 가능 */}
        <Route path="/change-password" element={<ChangePasswordPage />} />

        {/* 통계 대시보드 — can_view_stats 권한 필요 (admin 또는 개별 부여) */}
        <Route element={<RequireStatsPermission />}>
          <Route path="/stats" element={<StatsDashboardPage />} />
        </Route>

        {/* 신청 승인 — tech_team + admin */}
        <Route element={<RequireTechOrAdmin />}>
          <Route path="/registrations" element={<RegistrationListPage />} />
        </Route>

        {/* 관리자 전용 메뉴 — admin 역할 필요 */}
        <Route path="/admin" element={<RequireAdmin />}>
          <Route path="channels" element={<ChannelMappingPage />} />
          <Route path="users"    element={<UserManagementPage />} />
          <Route path="audit"    element={<AuditLogPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/requests/new" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ToastProvider>
  );
}
