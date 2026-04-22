/**
 * 로그인 페이지
 *
 * 사용자명 + 비밀번호를 입력받아 POST /api/auth/login 호출.
 * 성공 시 요청 목록 화면(/requests)으로 리다이렉트.
 * 실패 시 인라인 오류 메시지 표시.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('사용자명과 비밀번호를 입력하세요.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      await login(username, password);
      navigate('/requests', { replace: true });
    } catch {
      setError('사용자명 또는 비밀번호가 올바르지 않습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-lg shadow border border-gray-200 p-8 w-full max-w-sm">
        {/* 시스템명 */}
        <h1 className="text-lg font-bold text-gray-900 text-center mb-1">
          광고 증빙 요청 시스템
        </h1>
        <p className="text-xs text-gray-400 text-center mb-7">내부 업무 도구 · 로그인이 필요합니다</p>

        <form onSubmit={handleSubmit} noValidate>
          {/* 사용자명 */}
          <div className="mb-4">
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              사용자명
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              aria-required="true"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              placeholder="username"
            />
          </div>

          {/* 비밀번호 */}
          <div className="mb-5">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              aria-required="true"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              placeholder="password"
            />
          </div>

          {/* 에러 메시지 */}
          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2 mb-4">
              {error}
            </p>
          )}

          {/* 로그인 버튼 */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
