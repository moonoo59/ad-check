/**
 * 비밀번호 변경 페이지
 *
 * 모든 로그인 사용자가 자신의 비밀번호를 변경할 수 있다.
 * - 현재 비밀번호 확인 필수
 * - 새 비밀번호 6자 이상
 * - 현재 비밀번호와 동일한 값은 불가
 *
 * UI 개선: Card + Label + Input + lucide-react 아이콘 적용
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Loader2, AlertCircle, KeyRound, Eye, EyeOff } from 'lucide-react';
import { changePassword } from '../lib/apiService';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/ToastMessage';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError]     = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 비밀번호 표시/숨김 상태 — 각 필드 독립 제어
  const [showCurrent, setShowCurrent]   = useState(false);
  const [showNext, setShowNext]         = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!current) { setError('현재 비밀번호를 입력해주세요.'); return; }
    if (next.length < 6) { setError('새 비밀번호는 6자 이상이어야 합니다.'); return; }
    if (next !== confirm) { setError('새 비밀번호와 확인이 일치하지 않습니다.'); return; }
    if (current === next) { setError('새 비밀번호는 현재 비밀번호와 달라야 합니다.'); return; }

    setIsSaving(true);
    try {
      await changePassword(current, next, confirm);
      showToast('비밀번호가 변경되었습니다.', 'success');
      navigate('/requests');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? '변경 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="app-page app-page--compact">
      <PageHeader
        title="비밀번호 변경"
        subtitle="현재 비밀번호 확인 후 새 비밀번호로 교체합니다."
        icon={KeyRound}
      />

      <Card className="mt-6">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* 현재 비밀번호 */}
            <div>
              <Label htmlFor="current-password">현재 비밀번호</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrent ? 'text' : 'password'}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className="h-10 pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-faint)] hover:text-[var(--app-text-soft)]"
                  tabIndex={-1}
                  aria-label={showCurrent ? '비밀번호 숨기기' : '비밀번호 표시'}
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* 새 비밀번호 */}
            <div>
              <Label htmlFor="new-password">새 비밀번호</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNext ? 'text' : 'password'}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  placeholder="6자 이상"
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNext((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-faint)] hover:text-[var(--app-text-soft)]"
                  tabIndex={-1}
                  aria-label={showNext ? '비밀번호 숨기기' : '비밀번호 표시'}
                >
                  {showNext ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* 새 비밀번호 확인 */}
            <div>
              <Label htmlFor="confirm-password">새 비밀번호 확인</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="h-10 pr-10"
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

            {/* 오류 메시지 */}
            {error && (
              <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-[rgba(255,244,244,0.96)] px-3 py-2.5 text-sm text-rose-700">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* 버튼 영역 */}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="app-btn app-btn--secondary"
                disabled={isSaving}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="app-btn app-btn--primary flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    변경 중...
                  </>
                ) : (
                  <>
                    <Lock size={13} />
                    변경
                  </>
                )}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
