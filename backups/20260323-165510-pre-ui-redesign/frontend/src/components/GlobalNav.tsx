/**
 * GlobalNav 컴포넌트
 *
 * 전역 상단 네비게이션 바.
 * 역할에 따라 메뉴 표시/숨김을 제어한다.
 * - admin만: [관리자 메뉴] 드롭다운 (채널 매핑 관리)
 * - 전체: [요청 등록] [요청 목록]
 * - 우측: 로그인 사용자 display_name + 역할 배지 + 로그아웃 버튼
 * - Electron 앱 환경에서만: [종료] 버튼 (앱 전체 종료)
 *
 * 현재 위치 메뉴 항목에는 하단 강조선 표시.
 */

import { useState } from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ToastMessage';

const ROLE_LABELS: Record<string, string> = {
  admin:     '관리자',
  tech_team: '기술팀',
  ad_team:   '광고팀',
};

// Electron preload.ts 에서 노출한 API 타입 선언
// (contextBridge.exposeInMainWorld('electronAPI', { quit, isElectron }))
declare global {
  interface Window {
    electronAPI?: {
      quit: () => void;
      isElectron: boolean;
    };
  }
}

// Electron 환경 여부 (preload 스크립트 주입 여부로 판단)
const isElectronEnv = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;

export default function GlobalNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    showToast('로그아웃 되었습니다.', 'success');
    navigate('/login');
  };

  // NavLink 활성 상태 클래스 핸들러
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium px-1 pb-1 transition-colors ${
      isActive
        ? 'text-blue-600 border-b-2 border-blue-600'
        : 'text-gray-600 hover:text-gray-900'
    }`;

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-screen-xl mx-auto px-6 h-12 flex items-center justify-between gap-6">
        {/* 로고 / 시스템명 */}
        <NavLink
          to="/requests"
          className="text-sm font-bold text-gray-900 whitespace-nowrap shrink-0"
        >
          광고 증빙 요청 시스템
        </NavLink>

        {/* 메인 네비게이션 */}
        <nav className="flex items-center gap-6">
          <NavLink to="/requests/new" className={navClass}>
            요청 등록
          </NavLink>
          <NavLink to="/requests" end className={navClass}>
            요청 목록
          </NavLink>
          <NavLink to="/manual" className={navClass}>
            매뉴얼
          </NavLink>

          {/* 관리자 메뉴 드롭다운 — admin만 표시 */}
          {user?.role === 'admin' && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAdminMenuOpen((v) => !v)}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 flex items-center gap-1"
              >
                관리자 메뉴
                <span className="text-xs text-gray-400">▼</span>
              </button>
              {adminMenuOpen && (
                <div
                  className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg min-w-[160px] z-50"
                  onMouseLeave={() => setAdminMenuOpen(false)}
                >
                  <NavLink
                    to="/admin/channels"
                    className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setAdminMenuOpen(false)}
                  >
                    채널 매핑 관리
                  </NavLink>
                  <NavLink
                    to="/admin/users"
                    className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setAdminMenuOpen(false)}
                  >
                    사용자 관리
                  </NavLink>
                  <NavLink
                    to="/admin/audit"
                    className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setAdminMenuOpen(false)}
                  >
                    감사 로그
                  </NavLink>
                  <NavLink
                    to="/admin/stats"
                    className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setAdminMenuOpen(false)}
                  >
                    통계 대시보드
                  </NavLink>
                </div>
              )}
            </div>
          )}
        </nav>

        {/* 사용자 정보 + 로그아웃 */}
        {user && (
          <div className="flex items-center gap-3 shrink-0 ml-auto">
            <span className="text-sm text-gray-600">
              {user.display_name}
            </span>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
            <Link
              to="/change-password"
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50"
            >
              비밀번호 변경
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50"
            >
              로그아웃
            </button>

            {/* Electron 앱 환경에서만 표시 — 클릭 시 앱 전체 종료 */}
            {isElectronEnv && (
              <button
                type="button"
                onClick={() => window.electronAPI?.quit()}
                className="text-xs text-red-500 hover:text-red-700 border border-red-300 rounded px-2 py-1 hover:bg-red-50 font-medium"
                title="서비스를 종료합니다"
              >
                종료
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
