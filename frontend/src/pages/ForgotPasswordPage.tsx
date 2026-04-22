/**
 * 비밀번호 초기화 페이지 (/forgot-password)
 *
 * 로그인 없이 자신의 비밀번호를 재설정할 수 있다.
 * 본인 확인: 계정명 + 가입 시 등록한 전화번호 또는 이메일 일치 여부로 확인.
 *
 * UI 구성:
 *   섹션 1. 본인 확인 — 계정명 + 전화번호/이메일
 *   섹션 2. 새 비밀번호 — 새 비밀번호 + 확인
 *   → 두 섹션을 한 번에 제출 (POST /api/auth/reset-password)
 *
 * 주의:
 * - 연락처를 등록하지 않은 계정은 자가 초기화 불가 → 관리자에게 문의 안내
 * - rate-limit: 5분 내 5회 초과 시 10분 차단
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, AlertCircle, Eye, EyeOff, CheckCircle2, ArrowLeft } from 'lucide-react';
import { selfResetPassword } from '../lib/apiService';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  // 폼 값
  const [username, setUsername]           = useState('');
  const [contact, setContact]             = useState('');
  const [newPassword, setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 비밀번호 표시/숨김
  const [showNew, setShowNew]             = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);

  // UI 상태
  const [isLoading, setIsLoading]         = useState(false);
  const [error, setError]                 = useState('');
  const [done, setDone]                   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // 클라이언트 검증
    if (!username.trim()) { setError('계정명을 입력해주세요.'); return; }
    if (!contact.trim()) { setError('전화번호 또는 이메일을 입력해주세요.'); return; }
    if (newPassword.length < 6) { setError('새 비밀번호는 6자 이상이어야 합니다.'); return; }
    if (newPassword !== confirmPassword) { setError('새 비밀번호와 확인이 일치하지 않습니다.'); return; }

    setIsLoading(true);
    try {
      await selfResetPassword(username.trim(), contact.trim(), newPassword, confirmPassword);
      setDone(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? '처리 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  }

  // 완료 화면
  if (done) {
    return (
      <div className="min-h-screen px-4 py-10">
        <div className="mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-xl items-center justify-center">
          <div className="w-full text-center space-y-5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-emerald-100">
              <CheckCircle2 size={28} className="text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold tracking-[-0.03em] text-[var(--app-text)]">
              비밀번호가 초기화되었습니다
            </h1>
            <p className="text-sm text-[var(--app-text-soft)]">
              새 비밀번호로 로그인해주세요.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="app-btn app-btn--primary"
            >
              로그인 화면으로
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-xl items-center justify-center">
        <div className="w-full">
          {/* 타이틀 */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] bg-gradient-to-b from-[#86624b] to-[var(--app-primary)] shadow-[0_12px_24px_rgba(120,88,68,0.22)]">
              <KeyRound size={24} className="text-[#fffdf9]" strokeWidth={1.6} />
            </div>
            <p className="app-eyebrow">Account Recovery</p>
            <h1 className="text-[28px] font-bold tracking-[-0.04em] text-[var(--app-text)]">
              비밀번호 초기화
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-[var(--app-text-soft)]">
              가입 시 등록한 전화번호 또는 이메일로 본인을 확인합니다.
            </p>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <p className="app-eyebrow mb-1">본인 확인 후 새 비밀번호 설정</p>
              <h2 className="text-xl font-bold tracking-[-0.03em] text-[var(--app-text)]">
                아래 정보를 모두 입력해주세요
              </h2>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} noValidate>
                {/* ─── 섹션 1: 본인 확인 ─── */}
                <div className="mb-6 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--app-text-faint)]">
                    본인 확인
                  </p>

                  {/* 계정명 */}
                  <div>
                    <Label htmlFor="reset-username">계정명 (아이디)</Label>
                    <Input
                      id="reset-username"
                      type="text"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={isLoading}
                      placeholder="username"
                      className="h-10 text-sm"
                      autoFocus
                    />
                  </div>

                  {/* 전화번호 또는 이메일 */}
                  <div>
                    <Label htmlFor="reset-contact">
                      전화번호 또는 이메일
                      <span className="ml-1 text-xs font-normal text-[var(--app-text-faint)]">
                        (가입 시 등록한 연락처)
                      </span>
                    </Label>
                    <Input
                      id="reset-contact"
                      type="text"
                      autoComplete="off"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      disabled={isLoading}
                      placeholder="010-0000-0000 또는 example@email.com"
                      className="h-10 text-sm"
                    />
                  </div>
                </div>

                {/* 구분선 */}
                <div className="mb-6 border-t border-[var(--app-border)]" />

                {/* ─── 섹션 2: 새 비밀번호 ─── */}
                <div className="mb-6 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--app-text-faint)]">
                    새 비밀번호
                  </p>

                  {/* 새 비밀번호 */}
                  <div>
                    <Label htmlFor="reset-new-password">새 비밀번호</Label>
                    <div className="relative">
                      <Input
                        id="reset-new-password"
                        type={showNew ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={isLoading}
                        placeholder="6자 이상"
                        className="h-10 pr-10 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-faint)] hover:text-[var(--app-text-soft)]"
                        tabIndex={-1}
                        aria-label={showNew ? '비밀번호 숨기기' : '비밀번호 표시'}
                      >
                        {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* 새 비밀번호 확인 */}
                  <div>
                    <Label htmlFor="reset-confirm-password">새 비밀번호 확인</Label>
                    <div className="relative">
                      <Input
                        id="reset-confirm-password"
                        type={showConfirm ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={isLoading}
                        className="h-10 pr-10 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-faint)] hover:text-[var(--app-text-soft)]"
                        tabIndex={-1}
                        aria-label={showConfirm ? '비밀번호 숨기기' : '비밀번호 표시'}
                      >
                        {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 오류 메시지 */}
                {error && (
                  <div
                    className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-[rgba(255,244,244,0.96)] px-3 py-2.5 text-xs text-rose-700"
                    role="alert"
                  >
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* 제출 버튼 */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="app-btn app-btn--primary w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      확인 중...
                    </>
                  ) : (
                    '비밀번호 초기화'
                  )}
                </button>
              </form>
            </CardContent>
          </Card>

          {/* 안내 텍스트 */}
          <div className="mt-4 space-y-1.5 text-center text-xs text-[var(--app-text-faint)]">
            <p>
              연락처를 등록하지 않은 경우 관리자에게 초기화를 요청해주세요.
            </p>
            <p>
              <Link
                to="/login"
                className="inline-flex items-center gap-1 text-[var(--app-primary)] hover:underline"
              >
                <ArrowLeft size={12} />
                로그인으로 돌아가기
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
