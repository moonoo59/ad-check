/**
 * 로그인 페이지
 *
 * 사용자명 + 비밀번호를 입력받아 POST /api/auth/login 호출.
 * 성공 시 요청 목록 화면(/requests)으로 리다이렉트.
 * 실패 시 인라인 오류 메시지 표시.
 *
 * UI 개선:
 * - Card 컴포넌트로 중앙 폼 레이아웃
 * - MonitorPlay 아이콘으로 서비스 성격 표현
 * - 로딩 시 Loader2 아이콘 스피너 표시
 * - AlertCircle 아이콘으로 오류 표시
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MonitorPlay, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      navigate('/requests/new', { replace: true });
    } catch {
      setError('사용자명 또는 비밀번호가 올바르지 않습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-xl items-center justify-center">
        <div className="w-full">
          {/* 서비스 타이틀 */}
          <div className="mb-8 text-center">
            {/* 서비스 아이콘 */}
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] bg-gradient-to-b from-[#86624b] to-[var(--app-primary)] shadow-[0_12px_24px_rgba(120,88,68,0.22)]">
              <MonitorPlay size={26} className="text-[#fffdf9]" strokeWidth={1.6} />
            </div>
            <p className="app-eyebrow">Ad Evidence Workflow</p>
            <h1 className="text-[30px] font-bold tracking-[-0.04em] text-[var(--app-text)]">
              광고 증빙 요청 시스템
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-[var(--app-text-soft)]">
              광고팀, 기술팀, 관리자 모두 같은 흐름에서 요청 등록, 파일 확인, 복사 상태를 관리하는 내부 업무 화면입니다.
            </p>
          </div>

          {/* 로그인 카드 */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="app-eyebrow mb-1">로그인</p>
                  <h2 className="text-xl font-bold tracking-[-0.03em] text-[var(--app-text)]">
                    계정 정보를 입력해주세요
                  </h2>
                </div>
                <span className="app-chip">내부 업무 도구</span>
              </div>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} noValidate>
                {/* 사용자명 필드 */}
                <div className="mb-4">
                  <Label htmlFor="username">사용자명</Label>
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isLoading}
                    aria-required="true"
                    placeholder="username"
                    className="h-10 text-sm"
                  />
                </div>

                {/* 비밀번호 필드 — 눈 아이콘으로 표시/숨김 전환 */}
                <div className="mb-5">
                  <Label htmlFor="password">비밀번호</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      aria-required="true"
                      placeholder="password"
                      className="h-10 pr-10 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-faint)] hover:text-[var(--app-text-soft)]"
                      tabIndex={-1}
                      aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* 오류 메시지 — AlertCircle 아이콘 포함 */}
                {error && (
                  <div
                    className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-[rgba(255,244,244,0.96)] px-3 py-2.5 text-xs text-rose-700"
                    role="alert"
                    aria-live="assertive"
                  >
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* 로그인 버튼 — 로딩 시 스피너 표시 */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="app-btn app-btn--primary w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      로그인 중...
                    </>
                  ) : (
                    '로그인'
                  )}
                </button>
              </form>
            </CardContent>
          </Card>

          <p className="mt-4 text-center text-xs text-[var(--app-text-faint)]">
            계정이 없으신가요?{' '}
            <Link to="/register" className="text-[var(--app-primary)] hover:underline">
              회원가입 신청
            </Link>
          </p>
          <p className="mt-2 text-center text-xs text-[var(--app-text-faint)]">
            비밀번호를 잊으셨나요?{' '}
            <Link to="/forgot-password" className="text-[var(--app-primary)] hover:underline">
              비밀번호 초기화
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
