/**
 * 비밀번호 변경 페이지
 *
 * 모든 로그인 사용자가 자신의 비밀번호를 변경할 수 있다.
 * - 현재 비밀번호 확인 필수
 * - 새 비밀번호 6자 이상
 * - 현재 비밀번호와 동일한 값은 불가
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword } from '../lib/apiService';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/ToastMessage';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError]     = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!current) { setError('현재 비밀번호를 입력해주세요.'); return; }
    if (next.length < 6) { setError('새 비밀번호는 6자 이상이어야 합니다.'); return; }
    if (next !== confirm) { setError('새 비밀번호와 확인이 일치하지 않습니다.'); return; }
    if (current === next) { setError('새 비밀번호는 현재 비밀번호와 달라야 합니다.'); return; }

    setIsSaving(true);
    try {
      await changePassword(current, next);
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
    <div className="max-w-md mx-auto px-6 py-8">
      <PageHeader title="비밀번호 변경" />

      <form onSubmit={handleSubmit} className="mt-6 bg-white border border-gray-200 rounded-lg p-6 flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">현재 비밀번호</label>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="6자 이상"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호 확인</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? '변경 중...' : '변경'}
          </button>
        </div>
      </form>
    </div>
  );
}
