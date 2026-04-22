/**
 * 감사 로그 조회 페이지 (admin 전용)
 *
 * 기능:
 * - 이벤트 유형 / 날짜 범위 / 사용자 / 대상 엔티티 필터
 * - 페이지네이션 (기본 50건)
 * - 로그 테이블 (시간 / 사용자 / 이벤트 / 대상 / IP)
 *
 * 주의사항:
 * - 날짜 필터는 KST 기준으로 입력받아 백엔드에서 UTC 변환
 * - detail 필드는 JSON 문자열 가능
 */

import { useState, useEffect, useCallback } from 'react';
import { ClipboardList } from 'lucide-react';
import { getAuditLogs, getUsers } from '../lib/apiService';
import type { AuditLog, AuditLogQuery, User } from '../types';
import PageHeader from '../components/PageHeader';
import ErrorBanner from '../components/ErrorBanner';
import EmptyState from '../components/EmptyState';
import { formatTimestampKst } from '../lib/datetime';

/** 액션 코드 → 한글 레이블 */
const ACTION_LABELS: Record<string, string> = {
  user_login:           '로그인',
  user_logout:          '로그아웃',
  request_created:      '요청 등록',
  request_approved:     '요청 승인',
  request_rejected:     '요청 반려',
  request_retry_copy:   '복사 재시도',
  copy_done:            '복사 완료',
  copy_failed:          '복사 실패',
  channel_created:      '채널 생성',
  channel_updated:      '채널 수정',
  user_created:         '사용자 생성',
  user_updated:         '사용자 수정',
  user_deactivated:     '사용자 비활성화',
  password_reset:       '비밀번호 초기화',
  mount_logger_storage: '로거 스토리지 마운트',
  unmount_logger_storage: '로거 스토리지 언마운트',
  mount_shared_nas:     '공유 NAS 마운트',
  unmount_shared_nas:   '공유 NAS 언마운트',
};

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [logs, setLogs]         = useState<AuditLog[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // 필터 상태
  const [action, setAction]         = useState('');
  const [userId, setUserId]         = useState('');
  const [from, setFrom]             = useState('');
  const [to, setTo]                 = useState('');
  const [entityType, setEntityType] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({
    action: '',
    userId: '',
    from: '',
    to: '',
    entityType: '',
  });

  // 사용자 목록 (user_id 필터 드롭다운)
  const [userList, setUserList] = useState<User[]>([]);

  useEffect(() => {
    getUsers(true).then(setUserList).catch(() => {});
  }, []);

  const load = useCallback(async (p: number) => {
    setIsLoading(true);
    setLoadError('');
    try {
      const query: AuditLogQuery = { page: p, limit: PAGE_SIZE };
      if (appliedFilters.action) query.action = appliedFilters.action;
      if (appliedFilters.userId) query.user_id = parseInt(appliedFilters.userId, 10);
      if (appliedFilters.from)   query.from = appliedFilters.from;
      if (appliedFilters.to)     query.to = appliedFilters.to;
      if (appliedFilters.entityType) query.entity_type = appliedFilters.entityType;

      const result = await getAuditLogs(query);
      setLogs(result.logs);
      setTotal(result.total);
      setPage(result.page);
    } catch {
      setLoadError('감사 로그를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [appliedFilters]);

  // 필터/페이지 변경 시 재조회
  useEffect(() => { load(page); }, [load, page]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const nextFilters = { action, userId, from, to, entityType };
    setAppliedFilters(nextFilters);
    // 필터 적용 시 1페이지로 초기화
    if (page !== 1) {
      setPage(1); // load는 useEffect가 자동 호출
    } else {
      load(1);
    }
  }

  function handleReset() {
    setAction('');
    setUserId('');
    setFrom('');
    setTo('');
    setEntityType('');
    setAppliedFilters({
      action: '',
      userId: '',
      from: '',
      to: '',
      entityType: '',
    });
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="app-page">
      <PageHeader
        title="감사 로그"
        subtitle="사용자 작업 이력과 시스템 이벤트를 날짜, 대상, 사용자별로 조회할 수 있습니다."
        icon={ClipboardList}
      >
        <span className="text-sm text-[var(--app-text-soft)]">총 {total.toLocaleString()}건</span>
      </PageHeader>

      {/* ─── 필터 영역 ─── */}
      <form onSubmit={handleSearch} className="app-toolbar-card mt-4 flex flex-wrap items-end gap-3 p-4">
        {/* 이벤트 유형 */}
        <div className="flex flex-col gap-1">
          <label className="app-label">이벤트</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="app-select min-w-[160px]"
          >
            <option value="">전체</option>
            {Object.entries(ACTION_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        {/* 사용자 */}
        <div className="flex flex-col gap-1">
          <label className="app-label">사용자</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="app-select min-w-[140px]"
          >
            <option value="">전체</option>
            {userList.map((u) => (
              <option key={u.id} value={String(u.id)}>{u.display_name} ({u.username})</option>
            ))}
          </select>
        </div>

        {/* 날짜 범위 */}
        <div className="flex flex-col gap-1">
          <label className="app-label">시작일 (KST)</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="app-field"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="app-label">종료일 (KST)</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="app-field"
          />
        </div>

        {/* 대상 엔티티 */}
        <div className="flex flex-col gap-1">
          <label className="app-label">대상</label>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="app-select"
          >
            <option value="">전체</option>
            <option value="users">사용자</option>
            <option value="requests">요청</option>
            <option value="copy_jobs">복사작업</option>
            <option value="channels">채널</option>
            <option value="mount">마운트</option>
          </select>
        </div>

        <div className="flex gap-2 pb-0.5">
          <button
            type="submit"
            className="app-btn app-btn--primary"
          >
            검색
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="app-btn app-btn--secondary"
          >
            초기화
          </button>
        </div>
      </form>

      {loadError && <ErrorBanner message={loadError} onRetry={() => load(page)} />}

      {/* ─── 로그 테이블 ─── */}
      {isLoading ? (
        <p className="mt-8 text-center text-sm text-[var(--app-text-soft)]">불러오는 중...</p>
      ) : logs.length === 0 ? (
        <EmptyState message="조건에 맞는 감사 로그가 없습니다." />
      ) : (
        <>
          <div className="app-table-shell mt-4 overflow-x-auto">
            <table className="app-table text-sm">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">일시</th>
                  <th>사용자</th>
                  <th>이벤트</th>
                  <th>대상</th>
                  <th>상세</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap text-xs font-mono text-[var(--app-text-soft)]">
                      {formatTimestampKst(log.created_at, { seconds: true })}
                    </td>
                    <td>
                      {log.user_name ? (
                        <span>
                          {log.user_name}
                          <span className="ml-1 text-xs text-[var(--app-text-faint)]">({log.username})</span>
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--app-text-faint)]">시스템</span>
                      )}
                    </td>
                    <td>
                      <span className="inline-flex rounded-full border border-stone-200 bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="text-xs text-[var(--app-text-soft)]">
                      {log.entity_type ? `${log.entity_type}/${log.entity_id ?? '-'}` : '-'}
                    </td>
                    <td className="max-w-[360px] whitespace-normal break-words text-xs leading-6 text-[var(--app-text)]" title={log.detail ?? ''}>
                      {log.detail ?? '-'}
                    </td>
                    <td className="text-xs font-mono text-[var(--app-text-faint)]">
                      {log.ip_address ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ─── 페이지네이션 ─── */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="app-btn app-btn--secondary app-btn--sm"
              >
                이전
              </button>
              <span className="px-3 py-1.5 text-sm text-[var(--app-text-soft)]">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="app-btn app-btn--secondary app-btn--sm"
              >
                다음
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
