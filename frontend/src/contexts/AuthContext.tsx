/**
 * 인증 컨텍스트
 *
 * 앱 전체에서 로그인 상태와 현재 사용자 정보를 공유한다.
 * - 앱 최초 로드 시 GET /api/auth/me로 세션 확인
 * - 로그인/로그아웃 함수 제공
 * - useAuth() 훅으로 하위 컴포넌트에서 사용
 *
 * 주의: MemoryStore 기반 세션이므로 서버 재시작 시 세션 소멸 → 자동 로그인 페이지 이동
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '../types';
import { getMe, login as apiLogin, logout as apiLogout } from '../lib/apiService';
import { subscribeAuthInvalidated } from '../lib/authEvents';
import { useToast } from '../components/ToastMessage';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;     // 초기 세션 확인 중
  isLoggedIn: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true); // 초기 세션 확인 상태

  // 앱 시작 시 기존 세션 확인
  useEffect(() => {
    getMe()
      .then((me) => setUser(me))
      .catch(() => setUser(null)) // 세션 없으면 null (401)
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => subscribeAuthInvalidated((detail) => {
    setUser(null);
    showToast(detail.message ?? '세션이 만료되어 다시 로그인해야 합니다.', 'warning');
  }), [showToast]);

  const login = useCallback(async (username: string, password: string) => {
    const me = await apiLogin(username, password);
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isLoggedIn: !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** 인증 컨텍스트 접근 훅 — Provider 외부에서 사용하면 에러 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth는 AuthProvider 내부에서 사용해야 합니다.');
  }
  return ctx;
}
