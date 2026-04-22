/**
 * 사용자 관리 페이지 (admin 전용)
 *
 * 기능:
 * - 사용자 목록 조회 (비활성 포함 토글)
 * - 신규 사용자 생성 (사이드 드로어)
 * - 표시명 / 역할 / 활성 여부 수정
 * - 비밀번호 초기화 (admin이 임의 비밀번호 입력)
 *
 * 주의사항:
 * - 자기 자신은 비활성화할 수 없음 (백엔드에서도 막음)
 * - 비밀번호는 6자 이상 필수
 */

import { useState, useEffect, useCallback } from 'react';
import { Users, Eye, EyeOff } from 'lucide-react';
import { getUsers, createUser, updateUser, resetUserPassword, getChannels } from '../lib/apiService';
import type { User, UserRole, CreateUserBody, UpdateUserBody, ChannelMapping } from '../types';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import SideDrawer from '../components/SideDrawer';
import ConfirmDialog from '../components/ConfirmDialog';
import ErrorBanner from '../components/ErrorBanner';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/ToastMessage';
import { formatTimestampKst } from '../lib/datetime';

const ROLE_LABELS: Record<UserRole, string> = {
  admin:     '시스템 관리자',
  tech_team: '대표 담당자',
  ad_team:   '채널 담당자',
};

const ROLE_OPTIONS: UserRole[] = ['admin', 'tech_team', 'ad_team'];

/** 사용자 생성 / 수정 폼 초기값 */
const defaultForm = (): {
  username: string;
  display_name: string;
  role: UserRole;
  password: string;
  can_copy: number;
  can_view_stats: number;
  assigned_channels: string[];
  phone: string;
  email: string;
} => ({
  username: '',
  display_name: '',
  role: 'ad_team',
  password: '',
  can_copy: 0,
  can_view_stats: 0,
  assigned_channels: [],
  phone: '',
  email: '',
});

function parseAssignedChannels(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((channel): channel is string => typeof channel === 'string')
      : [];
  } catch {
    return [];
  }
}

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers]               = useState<User[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [loadError, setLoadError]       = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [channels, setChannels]         = useState<ChannelMapping[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);

  // 드로어: 생성(mode=create) / 수정(mode=edit)
  const [drawerMode, setDrawerMode]     = useState<'create' | 'edit' | null>(null);
  const [editingUser, setEditingUser]   = useState<User | null>(null);
  const [form, setForm]                 = useState(defaultForm());
  const [formError, setFormError]       = useState('');
  const [isSaving, setIsSaving]         = useState(false);

  // 비밀번호 초기화 다이얼로그
  const [resetTarget, setResetTarget]   = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError]     = useState('');
  const [isResetting, setIsResetting]   = useState(false);
  const [showResetPwd, setShowResetPwd] = useState(false);

  // 사용자 생성 드로어 — 초기 비밀번호 표시/숨김
  const [showCreatePwd, setShowCreatePwd] = useState(false);

  // 비활성화 확인 다이얼로그
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const list = await getUsers(includeInactive);
      setUsers(list);
    } catch {
      setLoadError('사용자 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getChannels(false)
      .then(setChannels)
      .catch(() => showToast('채널 목록을 불러오지 못했습니다.', 'error'))
      .finally(() => setChannelsLoading(false));
  }, [showToast]);

  // ─── 생성 드로어 ─────────────────────────────────────────────────────────

  function openCreate() {
    setForm(defaultForm());
    setFormError('');
    setEditingUser(null);
    setDrawerMode('create');
  }

  // ─── 수정 드로어 ─────────────────────────────────────────────────────────

  function openEdit(u: User) {
    setForm({
      username: u.username,
      display_name: u.display_name,
      role: u.role,
      password: '',
      can_copy: u.can_copy ?? 0,
      can_view_stats: u.can_view_stats ?? 0,
      assigned_channels: parseAssignedChannels(u.assigned_channels),
      phone: u.phone ?? '',
      email: u.email ?? '',
    });
    setFormError('');
    setEditingUser(u);
    setDrawerMode('edit');
  }

  function closeDrawer() {
    setDrawerMode(null);
    setEditingUser(null);
  }

  async function handleSave() {
    setFormError('');

    if (drawerMode === 'create') {
      if (!form.username.trim()) { setFormError('계정명을 입력해주세요.'); return; }
      if (!form.display_name.trim()) { setFormError('표시명을 입력해주세요.'); return; }
      if (form.password.length < 6) { setFormError('비밀번호는 6자 이상이어야 합니다.'); return; }

      setIsSaving(true);
      try {
        const body: CreateUserBody = {
          username: form.username.trim(),
          display_name: form.display_name.trim(),
          role: form.role,
          password: form.password,
          can_copy: form.can_copy,
          can_view_stats: form.can_view_stats,
          assigned_channels: form.assigned_channels,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
        };
        await createUser(body);
        showToast('사용자가 생성되었습니다.', 'success');
        closeDrawer();
        load();
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setFormError(msg ?? '저장 중 오류가 발생했습니다.');
      } finally {
        setIsSaving(false);
      }
    } else if (drawerMode === 'edit' && editingUser) {
      if (!form.display_name.trim()) { setFormError('표시명을 입력해주세요.'); return; }

      setIsSaving(true);
      try {
        const body: UpdateUserBody = {
          display_name: form.display_name.trim(),
          role: form.role,
          can_copy: form.can_copy,
          can_view_stats: form.can_view_stats,
          assigned_channels: form.assigned_channels,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
        };
        await updateUser(editingUser.id, body);
        showToast('사용자 정보가 수정되었습니다.', 'success');
        closeDrawer();
        load();
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setFormError(msg ?? '저장 중 오류가 발생했습니다.');
      } finally {
        setIsSaving(false);
      }
    }
  }

  // ─── 활성/비활성 전환 ────────────────────────────────────────────────────

  function openDeactivate(u: User) { setDeactivateTarget(u); }

  async function handleToggleActive() {
    if (!deactivateTarget) return;
    try {
      await updateUser(deactivateTarget.id, { is_active: deactivateTarget.is_active ? 0 : 1 });
      showToast(deactivateTarget.is_active ? '비활성화했습니다.' : '활성화했습니다.', 'success');
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast(msg ?? '처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setDeactivateTarget(null);
    }
  }

  // ─── 비밀번호 초기화 ──────────────────────────────────────────────────────

  function openReset(u: User) {
    setResetTarget(u);
    setResetPassword('');
    setResetError('');
  }

  function toggleAssignedChannel(displayName: string) {
    setForm((prev) => ({
      ...prev,
      assigned_channels: prev.assigned_channels.includes(displayName)
        ? prev.assigned_channels.filter((channel) => channel !== displayName)
        : [...prev.assigned_channels, displayName],
    }));
  }

  async function handleResetPassword() {
    if (!resetTarget) return;
    if (resetPassword.length < 6) { setResetError('비밀번호는 6자 이상이어야 합니다.'); return; }

    setIsResetting(true);
    try {
      await resetUserPassword(resetTarget.id, resetPassword);
      showToast('비밀번호가 초기화되었습니다.', 'success');
      setResetTarget(null);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setResetError(msg ?? '초기화 중 오류가 발생했습니다.');
    } finally {
      setIsResetting(false);
    }
  }

  // ─── 렌더 ─────────────────────────────────────────────────────────────────

  return (
    <div className="app-page app-page--narrow">
      <PageHeader
        title="사용자 관리"
        subtitle="계정 생성, 역할 조정, 비밀번호 초기화를 한 화면에서 관리합니다."
        icon={Users}
      >
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--app-text-soft)]">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="accent-[var(--app-primary)]"
          />
          비활성 포함
        </label>
        <button
          type="button"
          onClick={openCreate}
          className="app-btn app-btn--primary"
        >
          사용자 추가
        </button>
      </PageHeader>

      {loadError && <ErrorBanner message={loadError} onRetry={load} />}

      {isLoading ? (
        <p className="mt-8 text-center text-sm text-[var(--app-text-soft)]">불러오는 중...</p>
      ) : users.length === 0 ? (
        <EmptyState message="사용자가 없습니다." />
      ) : (
        <div className="app-table-shell mt-6 overflow-x-auto">
          <table className="app-table text-sm">
            <thead>
              <tr>
                <th>계정명</th>
                <th>표시명</th>
                <th>역할</th>
                <th>담당 채널</th>
                <th>전송</th>
                <th>통계</th>
                <th>상태</th>
                <th>생성일</th>
                <th className="min-w-[260px] text-right">작업</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.is_active ? '' : 'opacity-50'}>
                  <td className="font-mono">{u.username}</td>
                  <td>{u.display_name}</td>
                  <td>{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td className="min-w-[160px]">
                    <AssignedChannelSummary channels={parseAssignedChannels(u.assigned_channels)} />
                  </td>
                  <td>
                    <PermissionPill
                      granted={u.role === 'admin' ? true : u.can_copy === 1}
                      isAdmin={u.role === 'admin'}
                    />
                  </td>
                  <td>
                    <PermissionPill
                      granted={u.role === 'admin' ? true : u.can_view_stats === 1}
                      isAdmin={u.role === 'admin'}
                    />
                  </td>
                  <td>
                    <StatusPill active={u.is_active === 1} />
                  </td>
                  <td className="text-xs text-[var(--app-text-faint)]">
                    {formatTimestampKst(u.created_at, { dateOnly: true })}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        className="app-btn app-btn--secondary app-btn--sm"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => openReset(u)}
                        className="app-btn app-btn--soft app-btn--sm"
                      >
                        비밀번호 초기화
                      </button>
                      {/* 자기 자신은 비활성화 불가 */}
                      {u.id !== currentUser?.id && (
                        <button
                          type="button"
                          onClick={() => openDeactivate(u)}
                          className="app-btn app-btn--ghost app-btn--sm"
                        >
                          {u.is_active ? '비활성화' : '활성화'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── 생성 / 수정 드로어 ─── */}
      <SideDrawer
        open={drawerMode !== null}
        title={drawerMode === 'create' ? '사용자 추가' : '사용자 수정'}
        onClose={closeDrawer}
      >
        <div className="flex flex-col gap-4">
          {/* 계정명: 생성 시만 입력 가능 */}
          <div>
            <label className="app-label">계정명</label>
            {drawerMode === 'create' ? (
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="영문+숫자, 공백 없이"
                className="app-field"
              />
            ) : (
              <p className="font-mono text-sm text-[var(--app-text)]">{form.username}</p>
            )}
          </div>

          <div>
            <label className="app-label">표시명</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              placeholder="화면에 표시될 이름"
              className="app-field"
            />
          </div>

          <div>
            <label className="app-label">역할</label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
              className="app-select"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>

          {/* 기능별 권한 — admin 역할은 항상 모든 권한 보유 */}
          {form.role !== 'admin' && (
            <div className="space-y-3">
              <label className="app-label">기능 권한</label>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[var(--app-border)] bg-[rgba(255,252,248,0.95)] px-4 py-3 text-sm transition-colors hover:bg-[rgba(255,250,244,0.98)]">
                <input
                  type="checkbox"
                  checked={form.can_copy === 1}
                  onChange={(e) => setForm((f) => ({ ...f, can_copy: e.target.checked ? 1 : 0 }))}
                  className="accent-[var(--app-primary)] h-4 w-4"
                />
                <div>
                  <span className="font-semibold text-[var(--app-text)]">파일 전송</span>
                  <p className="mt-0.5 text-xs text-[var(--app-text-faint)]">파일 탐색, 선택, 승인, 복사 실행 권한</p>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[var(--app-border)] bg-[rgba(255,252,248,0.95)] px-4 py-3 text-sm transition-colors hover:bg-[rgba(255,250,244,0.98)]">
                <input
                  type="checkbox"
                  checked={form.can_view_stats === 1}
                  onChange={(e) => setForm((f) => ({ ...f, can_view_stats: e.target.checked ? 1 : 0 }))}
                  className="accent-[var(--app-primary)] h-4 w-4"
                />
                <div>
                  <span className="font-semibold text-[var(--app-text)]">통계 조회</span>
                  <p className="mt-0.5 text-xs text-[var(--app-text-faint)]">통계 대시보드 및 CSV 내보내기 권한</p>
                </div>
              </label>
            </div>
          )}
          {form.role === 'admin' && (
            <div>
              <label className="app-label">기능 권한</label>
              <p className="text-xs text-[var(--app-text-faint)]">관리자 역할은 모든 기능 권한을 자동으로 보유합니다.</p>
            </div>
          )}

          <div>
            <label className="app-label">
              담당 채널
              <span className="ml-1 text-xs font-normal text-[var(--app-text-faint)]">(복수 선택 가능)</span>
            </label>
            {channelsLoading ? (
              <p className="text-xs text-[var(--app-text-faint)]">채널 목록 불러오는 중...</p>
            ) : channels.length === 0 ? (
              <p className="text-xs text-[var(--app-text-faint)]">등록된 활성 채널이 없습니다.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {channels.map((channel) => (
                  <label
                    key={channel.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                      form.assigned_channels.includes(channel.display_name)
                        ? 'border-[var(--app-primary)] bg-[var(--app-primary-bg)] text-[var(--app-primary)]'
                        : 'border-[var(--app-border)] text-[var(--app-text-soft)] hover:border-[var(--app-border-strong)]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.assigned_channels.includes(channel.display_name)}
                      onChange={() => toggleAssignedChannel(channel.display_name)}
                      className="h-4 w-4 accent-[var(--app-primary)]"
                    />
                    <span className="truncate">{channel.display_name}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-xs text-[var(--app-text-faint)]">
              채널 담당자는 선택된 담당 채널만 요청 등록할 수 있습니다.
            </p>
          </div>

          {/* 연락처: 비밀번호 자가 초기화 시 본인 확인에 사용 */}
          <div>
            <label className="app-label">
              전화번호
              <span className="ml-1 text-xs font-normal text-[var(--app-text-faint)]">(비밀번호 초기화용, 선택)</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="010-0000-0000"
              className="app-field"
              autoComplete="tel"
            />
          </div>

          <div>
            <label className="app-label">
              이메일
              <span className="ml-1 text-xs font-normal text-[var(--app-text-faint)]">(비밀번호 초기화용, 선택)</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="example@email.com"
              className="app-field"
              autoComplete="email"
            />
          </div>

          {/* 비밀번호: 생성 시만 입력 (수정은 별도 초기화 기능 사용) */}
          {drawerMode === 'create' && (
            <div>
              <label className="app-label">초기 비밀번호</label>
              <div className="relative">
                <input
                  type={showCreatePwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="6자 이상"
                  className="app-field pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePwd((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-faint)] hover:text-[var(--app-text-soft)]"
                  tabIndex={-1}
                  aria-label={showCreatePwd ? '비밀번호 숨기기' : '비밀번호 표시'}
                >
                  {showCreatePwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {formError && (
            <p className="rounded-2xl border border-rose-200 bg-[rgba(255,244,244,0.96)] px-3 py-2 text-sm text-rose-700">{formError}</p>
          )}

          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={closeDrawer}
              className="app-btn app-btn--secondary"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="app-btn app-btn--primary"
            >
              {isSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </SideDrawer>

      {/* ─── 비활성화 확인 ─── */}
      <ConfirmDialog
        open={!!deactivateTarget}
        title={deactivateTarget?.is_active ? '사용자 비활성화' : '사용자 활성화'}
        message={
          deactivateTarget?.is_active
            ? `${deactivateTarget.display_name}(${deactivateTarget.username}) 계정을 비활성화하면 로그인이 불가합니다. 계속하시겠습니까?`
            : `${deactivateTarget?.display_name}(${deactivateTarget?.username}) 계정을 다시 활성화합니다.`
        }
        confirmLabel={deactivateTarget?.is_active ? '비활성화' : '활성화'}
        onConfirm={handleToggleActive}
        onCancel={() => setDeactivateTarget(null)}
      />

      {/* ─── 비밀번호 초기화 다이얼로그 ─── */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(49,35,25,0.22)] px-4 backdrop-blur-[2px]">
          <div className="app-modal-panel w-full max-w-sm">
            <p className="app-eyebrow">Security</p>
            <h2 className="mb-1 text-lg font-semibold text-[var(--app-text)]">비밀번호 초기화</h2>
            <p className="mb-4 text-sm text-[var(--app-text-soft)]">
              {resetTarget.display_name}({resetTarget.username}) 계정의 비밀번호를 변경합니다.
            </p>
            <div className="relative mb-2">
              <input
                type={showResetPwd ? 'text' : 'password'}
                value={resetPassword}
                onChange={(e) => { setResetPassword(e.target.value); setResetError(''); }}
                placeholder="새 비밀번호 (6자 이상)"
                className="app-field pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowResetPwd((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-faint)] hover:text-[var(--app-text-soft)]"
                tabIndex={-1}
                aria-label={showResetPwd ? '비밀번호 숨기기' : '비밀번호 표시'}
              >
                {showResetPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {resetError && <p className="mb-2 text-xs text-rose-700">{resetError}</p>}
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="app-btn app-btn--secondary"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={isResetting}
                className="app-btn app-btn--soft"
              >
                {isResetting ? '처리 중...' : '초기화'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        active
          ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border border-stone-200 bg-stone-100 text-stone-600'
      }`}
    >
      {active ? '활성' : '비활성'}
    </span>
  );
}

function AssignedChannelSummary({ channels }: { channels: string[] }) {
  if (channels.length === 0) {
    return <span className="text-xs text-[var(--app-text-faint)]">미지정</span>;
  }

  return (
    <div className="flex max-w-[220px] flex-wrap gap-1">
      {channels.slice(0, 2).map((channel) => (
        <span
          key={channel}
          className="inline-flex rounded-full border border-[var(--app-border)] bg-[rgba(255,252,248,0.95)] px-2 py-0.5 text-[11px] font-semibold text-[var(--app-text-soft)]"
        >
          {channel}
        </span>
      ))}
      {channels.length > 2 && (
        <span className="inline-flex rounded-full border border-[var(--app-border)] bg-[rgba(255,252,248,0.95)] px-2 py-0.5 text-[11px] font-semibold text-[var(--app-text-faint)]">
          외 {channels.length - 2}개
        </span>
      )}
    </div>
  );
}

/** 권한 부여 상태 배지 */
function PermissionPill({ granted, isAdmin }: { granted: boolean; isAdmin: boolean }) {
  if (isAdmin) {
    // admin은 항상 모든 권한 보유 — 별도 색상으로 표시
    return (
      <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800">
        자동
      </span>
    );
  }
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        granted
          ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border border-stone-200 bg-stone-100 text-stone-500'
      }`}
    >
      {granted ? 'ON' : 'OFF'}
    </span>
  );
}
