/**
 * GlobalNav 컴포넌트
 *
 * 전역 상단 네비게이션 바.
 * 역할에 따라 메뉴 표시/숨김을 제어한다.
 * - admin만: [관리자 메뉴] 드롭다운 (@radix-ui/react-dropdown-menu 기반)
 * - 전체: [요청 등록] [요청 목록] [매뉴얼]
 * - 우측: 로그인 사용자 display_name + 역할 배지 + 로그아웃 버튼
 * - Electron 앱 환경에서만: [종료] 버튼
 *
 * 현재 위치 메뉴 항목에는 하단 강조선 표시.
 */

import { NavLink, useNavigate, Link } from 'react-router-dom';
import { ChevronDown, Settings, ClipboardList, LogOut, Lock, Power } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ToastMessage';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ROLE_LABELS: Record<string, string> = {
  admin:   '서버 관리자',
  ad_team: '광고팀',
};

// 역할별 배지 색상
const ROLE_BADGE_CLASSES: Record<string, string> = {
  admin:   'bg-[rgba(148,77,62,0.12)] text-[var(--app-danger)] border-[rgba(148,77,62,0.2)]',
  ad_team: 'bg-[rgba(120,88,68,0.08)] text-[var(--app-primary)] border-[rgba(120,88,68,0.15)]',
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



  const handleLogout = async () => {
    await logout();
    showToast('로그아웃 되었습니다.', 'success');
    navigate('/login');
  };

  // NavLink 활성 상태 클래스 핸들러
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `app-nav-link ${isActive ? 'app-nav-link--active' : ''}`;

  const roleBadgeClass = ROLE_BADGE_CLASSES[user?.role ?? ''] ?? ROLE_BADGE_CLASSES['ad_team'];

  return (
    <header className="app-nav-shell">
      <div className="app-nav-inner">
        {/* 로고 / 시스템명 */}
        <NavLink
          to="/requests"
          className="app-nav-logo shrink-0"
        >
          <span className="app-nav-logo__eyebrow">Ad Evidence Workflow</span>
          <span className="app-nav-logo__title">광고 증빙 요청 시스템</span>
        </NavLink>

        {/* 메인 네비게이션 */}
        <nav className="app-nav-links">
          <NavLink to="/requests/new" className={navClass}>
            요청 등록
          </NavLink>
          <NavLink to="/requests" end className={navClass}>
            요청 목록
          </NavLink>
          <NavLink to="/manual" className={navClass}>
            매뉴얼
          </NavLink>

          {/* 통계 대시보드 — 모든 로그인 사용자 */}
          <NavLink to="/stats" className={navClass}>
            통계
          </NavLink>



          {/* 관리자 메뉴 드롭다운 — admin만 표시, Radix DropdownMenu 사용 */}
          {user?.role === 'admin' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="app-nav-link data-[state=open]:app-nav-link--active inline-flex items-center gap-1"
                >
                  관리자 메뉴

                  <ChevronDown
                    size={13}
                    className="opacity-60 transition-transform duration-150 [[data-state=open]_&]:rotate-180"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={6}>
                <DropdownMenuLabel>관리 기능</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <NavLink
                    to="/admin/channels"
                    className="flex items-center gap-2 cursor-default"
                  >
                    <Settings size={14} />
                    채널 매핑 관리
                  </NavLink>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <NavLink
                    to="/admin/audit"
                    className="flex items-center gap-2 cursor-default"
                  >
                    <ClipboardList size={14} />
                    감사 로그
                  </NavLink>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>

        {/* 사용자 정보 + 로그아웃 */}
        {user && (
          <div className="app-nav-user ml-auto shrink-0">
            {/* 사용자 카드 — 이름 + 역할 배지 */}
            <div className="app-nav-user__card">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--app-text)]">{user.display_name}</div>
                <div className="text-[11px] text-[var(--app-text-faint)]">
                  {ROLE_LABELS[user.role] ?? user.role}
                </div>
              </div>
              {/* 역할 배지 — 역할별 색상 구분 */}
              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${roleBadgeClass}`}
              >
                {user.username}
              </span>
            </div>

            {/* 비밀번호 변경 */}
            <Link
              to="/change-password"
              className="app-btn app-btn--secondary app-btn--sm flex items-center gap-1.5"
            >
              <Lock size={12} />
              비밀번호
            </Link>

            {/* 로그아웃 */}
            <button
              type="button"
              onClick={handleLogout}
              className="app-btn app-btn--secondary app-btn--sm flex items-center gap-1.5"
            >
              <LogOut size={12} />
              로그아웃
            </button>

            {/* Electron 앱 환경에서만 표시 — 클릭 시 앱 전체 종료 */}
            {isElectronEnv && (
              <button
                type="button"
                onClick={() => window.electronAPI?.quit()}
                className="app-btn app-btn--danger app-btn--sm flex items-center gap-1.5"
                title="서비스를 종료합니다"
              >
                <Power size={12} />
                종료
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
