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
import { getUsers, createUser, updateUser, resetUserPassword } from '../lib/apiService';
import type { User, UserRole, CreateUserBody, UpdateUserBody } from '../types';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import SideDrawer from '../components/SideDrawer';
import ConfirmDialog from '../components/ConfirmDialog';
import ErrorBanner from '../components/ErrorBanner';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/ToastMessage';

const ROLE_LABELS: Record<UserRole, string> = {
  admin:     '관리자',
  tech_team: '기술팀',
  ad_team:   '광고팀',
};

const ROLE_OPTIONS: UserRole[] = ['admin', 'tech_team', 'ad_team'];

/** 사용자 생성 / 수정 폼 초기값 */
const defaultForm = (): { username: string; display_name: string; role: UserRole; password: string } => ({
  username: '',
  display_name: '',
  role: 'ad_team',
  password: '',
});

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers]               = useState<User[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [loadError, setLoadError]       = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

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

  // ─── 생성 드로어 ─────────────────────────────────────────────────────────

  function openCreate() {
    setForm(defaultForm());
    setFormError('');
    setEditingUser(null);
    setDrawerMode('create');
  }

  // ─── 수정 드로어 ─────────────────────────────────────────────────────────

  function openEdit(u: User) {
    setForm({ username: u.username, display_name: u.display_name, role: u.role, password: '' });
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
    <div className="max-w-screen-lg mx-auto px-6 py-8">
      <PageHeader title="사용자 관리">
        <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="accent-blue-600"
          />
          비활성 포함
        </label>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          + 사용자 추가
        </button>
      </PageHeader>

      {loadError && <ErrorBanner message={loadError} onRetry={load} />}

      {isLoading ? (
        <p className="text-sm text-gray-400 mt-8 text-center">불러오는 중...</p>
      ) : users.length === 0 ? (
        <EmptyState message="사용자가 없습니다." />
      ) : (
        <div className="mt-6 overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">계정명</th>
                <th className="px-4 py-3 font-medium">표시명</th>
                <th className="px-4 py-3 font-medium">역할</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">생성일</th>
                <th className="px-4 py-3 font-medium text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className={u.is_active ? '' : 'opacity-50'}>
                  <td className="px-4 py-3 font-mono">{u.username}</td>
                  <td className="px-4 py-3">{u.display_name}</td>
                  <td className="px-4 py-3">{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${
                        u.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {u.is_active ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(u.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => openReset(u)}
                        className="text-xs text-orange-600 hover:underline"
                      >
                        비밀번호 초기화
                      </button>
                      {/* 자기 자신은 비활성화 불가 */}
                      {u.id !== currentUser?.id && (
                        <button
                          type="button"
                          onClick={() => openDeactivate(u)}
                          className="text-xs text-gray-500 hover:underline"
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
        <div className="flex flex-col gap-4 p-4">
          {/* 계정명: 생성 시만 입력 가능 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">계정명</label>
            {drawerMode === 'create' ? (
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="영문+숫자, 공백 없이"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
            ) : (
              <p className="text-sm text-gray-800 font-mono">{form.username}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">표시명</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              placeholder="화면에 표시될 이름"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">역할</label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>

          {/* 비밀번호: 생성 시만 입력 (수정은 별도 초기화 기능 사용) */}
          {drawerMode === 'create' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">초기 비밀번호</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="6자 이상"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
            </div>
          )}

          {formError && (
            <p className="text-sm text-red-600">{formError}</p>
          )}

          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={closeDrawer}
              className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">비밀번호 초기화</h2>
            <p className="text-sm text-gray-500 mb-4">
              {resetTarget.display_name}({resetTarget.username}) 계정의 비밀번호를 변경합니다.
            </p>
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => { setResetPassword(e.target.value); setResetError(''); }}
              placeholder="새 비밀번호 (6자 이상)"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-2"
              autoFocus
            />
            {resetError && <p className="text-xs text-red-600 mb-2">{resetError}</p>}
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={isResetting}
                className="px-4 py-1.5 text-sm bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
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
