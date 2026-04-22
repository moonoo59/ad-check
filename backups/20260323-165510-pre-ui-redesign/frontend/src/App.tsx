/**
 * 루트 앱 컴포넌트
 *
 * 라우팅 및 전역 Provider 구성.
 *
 * 라우트 보호 규칙:
 * - 비로그인: 모든 페이지 → /login 리다이렉트
 * - ad_team/tech_team: /admin/* 접근 불가 → /requests 리다이렉트
 * - admin: 모든 라우트 접근 가능
 *
 * Phase 1 라우트 구성:
 * /login              → 로그인 페이지
 * /requests           → 화면 2: 요청 목록
 * /requests/new       → 화면 1: 요청 등록
 * /requests/:id       → 화면 3: 요청 상세 (파일 탐색 결과 + 승인/반려)
 * /admin/channels     → 화면 4: 채널 매핑 관리 (admin only)
 * /                   → /requests로 리다이렉트
 */

import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/ToastMessage';
import GlobalNav from './components/GlobalNav';

import LoginPage           from './pages/LoginPage';
import RequestListPage     from './pages/RequestListPage';
import RequestNewPage      from './pages/RequestNewPage';
import RequestDetailPage   from './pages/RequestDetailPage';
import ChannelMappingPage  from './pages/ChannelMappingPage';
import UserManagementPage  from './pages/UserManagementPage';
import AuditLogPage        from './pages/AuditLogPage';
import ChangePasswordPage  from './pages/ChangePasswordPage';
import ManualPage          from './pages/ManualPage';
import StatsDashboardPage  from './pages/StatsDashboardPage';

/**
 * 로그인 필요 레이아웃
 * - 비로그인 시 /login 리다이렉트
 * - GlobalNav + 페이지 본문 레이아웃
 */
function RequireAuth() {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="text-sm text-gray-400">로딩 중...</span>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <GlobalNav />
      <main>
        <Outlet />
      </main>
    </div>
  );
}

/**
 * admin 전용 라우트
 * - admin이 아니면 /requests로 리다이렉트
 */
function RequireAdmin() {
  const { user } = useAuth();

  if (user?.role !== 'admin') {
    return <Navigate to="/requests" replace />;
  }

  return <Outlet />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route index element={<Navigate to="/requests" replace />} />
        <Route path="/requests"      element={<RequestListPage />} />
        <Route path="/requests/new"  element={<RequestNewPage />} />
        <Route path="/requests/:id"  element={<RequestDetailPage />} />
        <Route path="/manual"        element={<ManualPage />} />

        {/* 비밀번호 변경은 모든 로그인 사용자 가능 */}
        <Route path="/change-password" element={<ChangePasswordPage />} />

        <Route path="/admin" element={<RequireAdmin />}>
          <Route path="channels" element={<ChannelMappingPage />} />
          <Route path="users"    element={<UserManagementPage />} />
          <Route path="audit"    element={<AuditLogPage />} />
          <Route path="stats"    element={<StatsDashboardPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/requests" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}
