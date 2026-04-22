/**
 * 회원가입 신청 승인 화면 (/registrations)
 *
 * 접근 권한: tech_team, admin
 *   - tech_team: ad_team 신청만 조회/처리 (백엔드에서 필터링)
 *   - admin: 전체 조회/처리
 *
 * 기능:
 *   - 상태별 탭 필터 (전체 / 대기 / 승인 / 반려)
 *   - 각 행: 승인 / 반려 버튼
 *   - 반려 시 사유 입력 모달
 */

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Clock, RefreshCw, UserCheck } from 'lucide-react';
import {
  getRegistrations,
  approveRegistration,
  rejectRegistration,
} from '../lib/apiService';
import { useToast } from '../components/ToastMessage';
import type { Registration, RegistrationStatus } from '../types';
import { formatTimestampKst } from '../lib/datetime';
import PageHeader from '../components/PageHeader';

// 상태 탭 정의
const STATUS_TABS: { value: RegistrationStatus | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '대기' },
  { value: 'approved', label: '승인' },
  { value: 'rejected', label: '반려' },
];

const ROLE_LABELS: Record<string, string> = {
  admin: '시스템 관리자',
  tech_team: '대표 담당자',
  ad_team: '채널 담당자',
};

const STATUS_BADGE: Record<RegistrationStatus, { label: string; className: string }> = {
  pending:  { label: '대기',  className: 'bg-[rgba(120,88,68,0.08)] text-[var(--app-primary)] border border-[rgba(120,88,68,0.15)]' },
  approved: { label: '승인',  className: 'bg-[rgba(81,116,91,0.12)] text-[var(--app-success)] border border-[rgba(81,116,91,0.2)]' },
  rejected: { label: '반려',  className: 'bg-[rgba(148,77,62,0.12)] text-[var(--app-danger)] border border-[rgba(148,77,62,0.2)]' },
};

export default function RegistrationListPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<RegistrationStatus | 'all'>('pending');
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 반려 모달 상태
  const [rejectTarget, setRejectTarget] = useState<Registration | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  // 승인 진행 중인 ID 추적 (중복 클릭 방지)
  const [approvingId, setApprovingId] = useState<number | null>(null);

  const loadRegistrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = activeTab === 'all' ? undefined : activeTab;
      const data = await getRegistrations(status);
      setRegistrations(data);
    } catch {
      setError('목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    void loadRegistrations();
  }, [loadRegistrations]);

  // 승인 처리
  const handleApprove = async (reg: Registration) => {
    if (approvingId !== null) return;
    setApprovingId(reg.id);
    try {
      await approveRegistration(reg.id);
      showToast(`${reg.display_name}(${reg.username}) 신청이 승인되었습니다.`, 'success');
      void loadRegistrations();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      showToast(axiosErr.response?.data?.message ?? '승인 처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setApprovingId(null);
    }
  };

  // 반려 모달 열기
  const openRejectModal = (reg: Registration) => {
    setRejectTarget(reg);
    setRejectReason('');
  };

  // 반려 제출
  const handleRejectSubmit = async () => {
    if (!rejectTarget || rejectReason.trim() === '') return;
    setRejectSubmitting(true);
    try {
      await rejectRegistration(rejectTarget.id, rejectReason.trim());
      showToast(`${rejectTarget.display_name}(${rejectTarget.username}) 신청이 반려되었습니다.`, 'success');
      setRejectTarget(null);
      void loadRegistrations();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      showToast(axiosErr.response?.data?.message ?? '반려 처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setRejectSubmitting(false);
    }
  };

  // 담당채널 JSON 파싱 헬퍼
  const parseChannels = (json: string): string[] => {
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  return (
    <div className="app-page app-page--compact space-y-6">
      <PageHeader
        title="회원가입 신청 승인"
        subtitle="신청된 계정을 검토하고 승인 또는 반려할 수 있습니다."
        icon={UserCheck}
      >
        <button
          type="button"
          onClick={() => void loadRegistrations()}
          className="app-btn app-btn--secondary app-btn--sm flex items-center gap-1.5"
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          새로고침
        </button>
      </PageHeader>

      {/* 상태 탭 */}
      <div className="app-toolbar-card app-toolbar-card--compact mx-auto w-full max-w-[920px] p-2">
        <div className="flex gap-1 border-b border-[var(--app-border)] px-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.value
                  ? 'border-[var(--app-primary)] text-[var(--app-primary)]'
                  : 'border-transparent text-[var(--app-text-soft)] hover:text-[var(--app-text)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 오류 배너 */}
      {error && (
        <div className="app-banner app-banner--error text-sm">{error}</div>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="text-sm text-[var(--app-text-faint)] py-10 text-center">불러오는 중...</div>
      ) : registrations.length === 0 ? (
        <div className="app-surface mx-auto w-full max-w-[920px] py-14 text-center text-sm text-[var(--app-text-faint)]">
          {activeTab === 'pending' ? '대기 중인 신청이 없습니다.' : '해당 조건의 신청이 없습니다.'}
        </div>
      ) : (
        <div className="app-surface mx-auto w-full max-w-[920px] overflow-x-auto">
          <table className="app-table w-full">
            <thead>
              <tr>
                <th>이름</th>
                <th>아이디</th>
                <th>역할</th>
                <th>담당채널</th>
                <th>신청일</th>
                <th>상태</th>
                <th>처리자</th>
                <th>반려사유</th>
                <th className="text-center">작업</th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((reg) => {
                const channels = parseChannels(reg.assigned_channels);
                const badge = STATUS_BADGE[reg.status];
                return (
                  <tr key={reg.id}>
                    <td className="font-medium text-[var(--app-text)]">{reg.display_name}</td>
                    <td className="text-[var(--app-text-soft)]">{reg.username}</td>
                    <td>{ROLE_LABELS[reg.role] ?? reg.role}</td>
                    <td>
                      {channels.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {channels.map((ch) => (
                            <span
                              key={ch}
                              className="inline-block rounded px-1.5 py-0.5 text-[11px] bg-[var(--app-surface-raised)] text-[var(--app-text-soft)] border border-[var(--app-border)]"
                            >
                              {ch}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[var(--app-text-faint)] text-xs">—</span>
                      )}
                    </td>
                    <td className="text-[var(--app-text-soft)] text-xs">
                      {formatTimestampKst(reg.created_at, { dateOnly: true })}
                    </td>
                    <td>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
                        {reg.status === 'pending'  && <Clock size={10} />}
                        {reg.status === 'approved' && <CheckCircle size={10} />}
                        {reg.status === 'rejected' && <XCircle size={10} />}
                        {badge.label}
                      </span>
                    </td>
                    <td className="text-xs text-[var(--app-text-soft)]">
                      {reg.reviewer_name ?? '—'}
                    </td>
                    <td className="text-xs text-[var(--app-text-soft)] max-w-[160px] truncate" title={reg.reject_reason ?? ''}>
                      {reg.reject_reason ?? '—'}
                    </td>
                    <td>
                      {reg.status === 'pending' && (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleApprove(reg)}
                            disabled={approvingId !== null}
                            className="app-btn app-btn--success app-btn--sm flex items-center gap-1"
                          >
                            <CheckCircle size={12} />
                            {approvingId === reg.id ? '처리 중...' : '승인'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openRejectModal(reg)}
                            disabled={approvingId !== null}
                            className="app-btn app-btn--danger app-btn--sm flex items-center gap-1"
                          >
                            <XCircle size={12} />
                            반려
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 반려 사유 입력 모달 */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setRejectTarget(null); }}
        >
          <div className="app-surface w-full max-w-sm mx-4 px-6 py-6 space-y-4">
            <h2 className="text-base font-bold text-[var(--app-text)]">신청 반려</h2>
            <p className="text-sm text-[var(--app-text-soft)]">
              <span className="font-medium text-[var(--app-text)]">{rejectTarget.display_name}</span>({rejectTarget.username}) 신청을 반려합니다.
            </p>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--app-text)]">
                반려 사유 <span className="text-[var(--app-danger)]">*</span>
              </label>
              <textarea
                className="app-input w-full min-h-[80px] resize-none"
                placeholder="반려 사유를 입력해주세요."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                disabled={rejectSubmitting}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="app-btn app-btn--secondary app-btn--sm"
                disabled={rejectSubmitting}
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleRejectSubmit()}
                disabled={rejectReason.trim() === '' || rejectSubmitting}
                className="app-btn app-btn--danger app-btn--sm"
              >
                {rejectSubmitting ? '처리 중...' : '반려 확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
