/**
 * 로그인 페이지 — 단계형 UX
 *
 * 1단계: '서버 관리자' / '광고팀' 두 버튼으로 역할 선택
 * 2단계: 선택된 역할을 표시하고 비밀번호만 입력
 *
 * 비밀번호 초기화: 1단계 하단 링크 → 역할 선택 + 새 비밀번호 입력 패널
 * POST /api/auth/reset-password-direct 호출 (별도 인증 없이 즉시 초기화)
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MonitorPlay, Loader2, AlertCircle, Eye, EyeOff, ChevronLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { directResetPassword } from '../lib/apiService';

// 역할 선택 정보
const ROLES = [
  { username: 'admin', label: '서버 관리자', desc: '관리자 메뉴 포함 전체 기능' },
  { username: 'ad_team', label: '광고팀', desc: '요청 등록 및 파일 확인' },
] as const;

type Step = 'select' | 'password' | 'reset';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('select');
  const [selectedRole, setSelectedRole] = useState<(typeof ROLES)[number] | null>(null);

  // 로그인 상태
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 비밀번호 초기화 상태
  const [resetRole, setResetRole] = useState<(typeof ROLES)[number]>(ROLES[0]);
  const [resetNewPw, setResetNewPw] = useState('');
  const [resetConfirmPw, setResetConfirmPw] = useState('');
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // 역할 버튼 클릭 → 2단계 진입
  function handleRoleSelect(role: (typeof ROLES)[number]) {
    setSelectedRole(role);
    setPassword('');
    setLoginError('');
    setShowPassword(false);
    setStep('password');
  }

  // 뒤로 버튼
  function handleBack() {
    setStep('select');
    setPassword('');
    setLoginError('');
  }

  // 로그인 제출
  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRole || !password) return;
    setLoginError('');
    setIsLoading(true);
    try {
      await login(selectedRole.username, password);
      navigate('/requests/new', { replace: true });
    } catch {
      setLoginError('비밀번호가 올바르지 않습니다.');
    } finally {
      setIsLoading(false);
    }
  }

  // 비밀번호 초기화 진입
  function handleResetOpen() {
    setResetRole(ROLES[0]);
    setResetNewPw('');
    setResetConfirmPw('');
    setResetError('');
    setResetSuccess('');
    setShowResetPw(false);
    setStep('reset');
  }

  // 비밀번호 초기화 제출
  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');
    if (resetNewPw.length < 6) {
      setResetError('새 비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (resetNewPw !== resetConfirmPw) {
      setResetError('새 비밀번호와 확인 비밀번호가 일치하지 않습니다.');
      return;
    }
    setIsResetting(true);
    try {
      await directResetPassword(resetRole.username, resetNewPw, resetConfirmPw);
      setResetSuccess(`${resetRole.label} 비밀번호가 초기화되었습니다. 새 비밀번호로 로그인해주세요.`);
      setResetNewPw('');
      setResetConfirmPw('');
    } catch {
      setResetError('비밀번호 초기화에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-xl items-center justify-center">
        <div className="w-full">
          {/* 서비스 타이틀 */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] bg-gradient-to-b from-[#86624b] to-[var(--app-primary)] shadow-[0_12px_24px_rgba(120,88,68,0.22)]">
              <MonitorPlay size={26} className="text-[#fffdf9]" strokeWidth={1.6} />
            </div>
            <p className="app-eyebrow">Ad Evidence Workflow</p>
            <h1 className="text-[30px] font-bold tracking-[-0.04em] text-[var(--app-text)]">
              광고 증빙 요청 시스템
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-[var(--app-text-soft)]">
              요청 등록, 파일 확인, 복사 상태를 관리하는 내부 업무 화면입니다.
            </p>
          </div>

          {/* ─── 1단계: 역할 선택 ─── */}
          {step === 'select' && (
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="app-eyebrow mb-1">로그인</p>
                    <h2 className="text-xl font-bold tracking-[-0.03em] text-[var(--app-text)]">
                      로그인할 계정을 선택하세요
                    </h2>
                  </div>
                  <span className="app-chip">내부 업무 도구</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {ROLES.map((role) => (
                  <button
                    key={role.username}
                    type="button"
                    onClick={() => handleRoleSelect(role)}
                    className="w-full rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-5 py-4 text-left transition hover:border-[var(--app-primary)] hover:bg-[var(--app-surface-hover)] active:scale-[0.99]"
                  >
                    <p className="text-base font-semibold text-[var(--app-text)]">{role.label}</p>
                    <p className="mt-0.5 text-xs text-[var(--app-text-soft)]">{role.desc}</p>
                  </button>
                ))}

                <p className="pt-1 text-center text-xs text-[var(--app-text-faint)]">
                  비밀번호를 잊으셨나요?{' '}
                  <button
                    type="button"
                    onClick={handleResetOpen}
                    className="text-[var(--app-primary)] hover:underline"
                  >
                    비밀번호 초기화
                  </button>
                </p>
              </CardContent>
            </Card>
          )}

          {/* ─── 2단계: 비밀번호 입력 ─── */}
          {step === 'password' && selectedRole && (
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-text-soft)] hover:bg-[var(--app-surface-hover)]"
                    aria-label="뒤로"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div>
                    <p className="app-eyebrow mb-1">{selectedRole.label}</p>
                    <h2 className="text-xl font-bold tracking-[-0.03em] text-[var(--app-text)]">
                      비밀번호를 입력해주세요
                    </h2>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLoginSubmit} noValidate>
                  <div className="mb-5">
                    <Label htmlFor="password">비밀번호</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        autoFocus
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                        aria-required="true"
                        placeholder="비밀번호 입력"
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

                  {loginError && (
                    <div
                      className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-[rgba(255,244,244,0.96)] px-3 py-2.5 text-xs text-rose-700"
                      role="alert"
                    >
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{loginError}</span>
                    </div>
                  )}

                  <button type="submit" disabled={isLoading} className="app-btn app-btn--primary w-full">
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
          )}

          {/* ─── 비밀번호 초기화 패널 ─── */}
          {step === 'reset' && (
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('select')}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-text-soft)] hover:bg-[var(--app-surface-hover)]"
                    aria-label="뒤로"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div>
                    <p className="app-eyebrow mb-1">비밀번호 초기화</p>
                    <h2 className="text-xl font-bold tracking-[-0.03em] text-[var(--app-text)]">
                      새 비밀번호를 설정하세요
                    </h2>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleResetSubmit} noValidate>
                  {/* 역할 선택 */}
                  <div className="mb-4">
                    <Label>계정 선택</Label>
                    <div className="mt-1.5 flex gap-2">
                      {ROLES.map((role) => (
                        <button
                          key={role.username}
                          type="button"
                          onClick={() => setResetRole(role)}
                          className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                            resetRole.username === role.username
                              ? 'border-[var(--app-primary)] bg-[var(--app-primary-bg)] text-[var(--app-primary)]'
                              : 'border-[var(--app-border)] text-[var(--app-text-soft)] hover:border-[var(--app-primary)]'
                          }`}
                        >
                          {role.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 새 비밀번호 */}
                  <div className="mb-3">
                    <Label htmlFor="resetNewPw">새 비밀번호</Label>
                    <div className="relative">
                      <Input
                        id="resetNewPw"
                        type={showResetPw ? 'text' : 'password'}
                        autoFocus
                        value={resetNewPw}
                        onChange={(e) => setResetNewPw(e.target.value)}
                        disabled={isResetting}
                        placeholder="6자 이상"
                        className="h-10 pr-10 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPw((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-faint)] hover:text-[var(--app-text-soft)]"
                        tabIndex={-1}
                      >
                        {showResetPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* 비밀번호 확인 */}
                  <div className="mb-5">
                    <Label htmlFor="resetConfirmPw">비밀번호 확인</Label>
                    <Input
                      id="resetConfirmPw"
                      type={showResetPw ? 'text' : 'password'}
                      value={resetConfirmPw}
                      onChange={(e) => setResetConfirmPw(e.target.value)}
                      disabled={isResetting}
                      placeholder="동일한 비밀번호 재입력"
                      className="h-10 text-sm"
                    />
                  </div>

                  {resetError && (
                    <div className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-[rgba(255,244,244,0.96)] px-3 py-2.5 text-xs text-rose-700" role="alert">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{resetError}</span>
                    </div>
                  )}
                  {resetSuccess && (
                    <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700" role="status">
                      {resetSuccess}
                    </div>
                  )}

                  <button type="submit" disabled={isResetting} className="app-btn app-btn--primary w-full">
                    {isResetting ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        초기화 중...
                      </>
                    ) : (
                      '비밀번호 초기화'
                    )}
                  </button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
