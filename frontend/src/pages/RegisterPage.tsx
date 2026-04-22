/**
 * 회원가입 신청 화면 (/register)
 *
 * 공개 접근 가능 (로그인 불필요).
 * 신청 후 관리자 승인이 필요하며, 승인 전까지 로그인 불가.
 *
 * 입력 필드:
 *   - 이름 (display_name)
 *   - 아이디 (username)
 *   - 비밀번호 / 확인
 *   - 역할 선택 (ad_team / tech_team)
 *     * admin은 신청 불가 (직접 생성만 가능)
 *   - 담당채널 다중 선택 (채널 API에서 동적 조회)
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { register, getChannels } from '../lib/apiService';
import type { ChannelMapping, PublicRegistrationRole } from '../types';

const ROLE_OPTIONS: { value: PublicRegistrationRole; label: string; description: string }[] = [
  {
    value: 'ad_team',
    label: '채널 담당자',
    description: '요청 등록 및 결과 확인',
  },
  {
    value: 'tech_team',
    label: '대표 담당자',
    description: '요청 검토·승인·파일 복사 실행',
  },
];

export default function RegisterPage() {
  // 폼 상태
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [role, setRole] = useState<PublicRegistrationRole>('ad_team');
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  // 비밀번호 초기화에 사용될 연락처 (전화번호 또는 이메일 중 하나 이상 권장)
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // 채널 목록
  const [channels, setChannels] = useState<ChannelMapping[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);

  // 제출 상태
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // 채널 목록 조회 (활성 채널만)
  useEffect(() => {
    getChannels(false)
      .then(setChannels)
      .catch(() => setChannels([]))
      .finally(() => setChannelsLoading(false));
  }, []);

  // 담당채널 체크박스 토글
  const toggleChannel = (displayNameStr: string) => {
    setSelectedChannels((prev) =>
      prev.includes(displayNameStr)
        ? prev.filter((c) => c !== displayNameStr)
        : [...prev, displayNameStr],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 클라이언트 측 검증
    if (displayName.trim() === '') {
      setError('이름을 입력해주세요.');
      return;
    }
    if (username.trim() === '') {
      setError('아이디를 입력해주세요.');
      return;
    }
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setSubmitting(true);
    try {
      await register({
        display_name: displayName.trim(),
        username: username.trim(),
        password,
        role,
        assigned_channels: selectedChannels,
        phone: phone.trim() || null,
        email: email.trim() || null,
      });
      setDone(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message ?? '신청 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  // 신청 완료 화면
  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-[var(--app-bg)]">
        <div className="app-surface w-full max-w-md px-8 py-10 text-center space-y-5">
          <div className="text-4xl">✓</div>
          <h1 className="text-xl font-bold text-[var(--app-text)]">신청이 완료되었습니다</h1>
          <p className="text-sm text-[var(--app-text-soft)] leading-relaxed">
            담당자 승인 후 로그인 가능합니다.<br />
            승인 완료 시 별도로 안내 받으세요.
          </p>
          <Link
            to="/login"
            className="app-btn app-btn--primary app-btn--sm inline-block mt-2"
          >
            로그인 화면으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-[var(--app-bg)]">
      <div className="app-surface w-full max-w-md px-8 py-8 space-y-6">
        {/* 헤더 */}
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-[var(--app-text)]">회원가입 신청</h1>
          <p className="text-xs text-[var(--app-text-faint)]">
            광고 증빙 요청 시스템 · 승인 후 로그인 가능합니다
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 이름 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--app-text)]">
              이름 <span className="text-[var(--app-danger)]">*</span>
            </label>
            <input
              type="text"
              className="app-input w-full"
              placeholder="홍길동"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={submitting}
              autoComplete="name"
            />
          </div>

          {/* 아이디 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--app-text)]">
              아이디 <span className="text-[var(--app-danger)]">*</span>
            </label>
            <input
              type="text"
              className="app-input w-full"
              placeholder="영문·숫자 조합"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
              autoComplete="username"
            />
          </div>

          {/* 비밀번호 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--app-text)]">
              비밀번호 <span className="text-[var(--app-danger)]">*</span>
            </label>
            <input
              type="password"
              className="app-input w-full"
              placeholder="6자 이상"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              autoComplete="new-password"
            />
          </div>

          {/* 비밀번호 확인 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--app-text)]">
              비밀번호 확인 <span className="text-[var(--app-danger)]">*</span>
            </label>
            <input
              type="password"
              className="app-input w-full"
              placeholder="비밀번호 재입력"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              disabled={submitting}
              autoComplete="new-password"
            />
          </div>

          {/* 연락처 (비밀번호 초기화용) */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[var(--app-text)]">
                전화번호
                <span className="ml-1 text-xs font-normal text-[var(--app-text-faint)]">(비밀번호 초기화 시 사용, 권장)</span>
              </label>
              <input
                type="tel"
                className="app-input w-full mt-1.5"
                placeholder="010-0000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={submitting}
                autoComplete="tel"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--app-text)]">
                이메일
                <span className="ml-1 text-xs font-normal text-[var(--app-text-faint)]">(비밀번호 초기화 시 사용, 권장)</span>
              </label>
              <input
                type="email"
                className="app-input w-full mt-1.5"
                placeholder="example@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                autoComplete="email"
              />
            </div>
          </div>

          {/* 역할 선택 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--app-text)]">
              역할 <span className="text-[var(--app-danger)]">*</span>
            </label>
            <div className="space-y-2">
              {ROLE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    role === opt.value
                      ? 'border-[var(--app-primary)] bg-[var(--app-primary-bg)]'
                      : 'border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={opt.value}
                    checked={role === opt.value}
                    onChange={() => setRole(opt.value)}
                    disabled={submitting}
                    className="mt-0.5 accent-[var(--app-primary)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--app-text)]">{opt.label}</div>
                    <div className="text-xs text-[var(--app-text-faint)]">{opt.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 담당채널 다중 선택 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--app-text)]">
              담당채널
              <span className="ml-1 text-xs font-normal text-[var(--app-text-faint)]">(복수 선택 가능)</span>
            </label>
            {channelsLoading ? (
              <p className="text-xs text-[var(--app-text-faint)]">채널 목록 불러오는 중...</p>
            ) : channels.length === 0 ? (
              <p className="text-xs text-[var(--app-text-faint)]">등록된 채널이 없습니다.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {channels.map((ch) => (
                  <label
                    key={ch.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer text-sm transition-colors ${
                      selectedChannels.includes(ch.display_name)
                        ? 'border-[var(--app-primary)] bg-[var(--app-primary-bg)] text-[var(--app-primary)]'
                        : 'border-[var(--app-border)] text-[var(--app-text-soft)] hover:border-[var(--app-border-strong)]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedChannels.includes(ch.display_name)}
                      onChange={() => toggleChannel(ch.display_name)}
                      disabled={submitting}
                      className="accent-[var(--app-primary)]"
                    />
                    {ch.display_name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 오류 메시지 */}
          {error && (
            <div className="app-banner app-banner--error text-sm">
              {error}
            </div>
          )}

          {/* 제출 버튼 */}
          <button
            type="submit"
            className="app-btn app-btn--primary w-full"
            disabled={submitting}
          >
            {submitting ? '신청 중...' : '회원가입 신청'}
          </button>
        </form>

        {/* 로그인 링크 */}
        <p className="text-center text-xs text-[var(--app-text-faint)]">
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="text-[var(--app-primary)] hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
