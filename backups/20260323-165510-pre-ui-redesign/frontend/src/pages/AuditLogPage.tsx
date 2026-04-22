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
import { getAuditLogs, getUsers } from '../lib/apiService';
import type { AuditLog, AuditLogQuery, User } from '../types';
import PageHeader from '../components/PageHeader';
import ErrorBanner from '../components/ErrorBanner';
import EmptyState from '../components/EmptyState';

/** ISO 문자열 → 'YYYY-MM-DD HH:MM:SS' (로컬 시각) */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

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
      if (action) query.action = action;
      if (userId) query.user_id = parseInt(userId, 10);
      if (from)   query.from = from;
      if (to)     query.to = to;
      if (entityType) query.entity_type = entityType;

      const result = await getAuditLogs(query);
      setLogs(result.logs);
      setTotal(result.total);
      setPage(result.page);
    } catch {
      setLoadError('감사 로그를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [action, userId, from, to, entityType]);

  // 필터/페이지 변경 시 재조회
  useEffect(() => { load(page); }, [load, page]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
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
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      <PageHeader title="감사 로그">
        <span className="text-sm text-gray-400">총 {total.toLocaleString()}건</span>
      </PageHeader>

      {/* ─── 필터 영역 ─── */}
      <form onSubmit={handleSearch} className="mt-4 bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap gap-3 items-end">
        {/* 이벤트 유형 */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">이벤트</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm min-w-[160px]"
          >
            <option value="">전체</option>
            {Object.entries(ACTION_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        {/* 사용자 */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">사용자</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm min-w-[140px]"
          >
            <option value="">전체</option>
            {userList.map((u) => (
              <option key={u.id} value={String(u.id)}>{u.display_name} ({u.username})</option>
            ))}
          </select>
        </div>

        {/* 날짜 범위 */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">시작일 (KST)</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">종료일 (KST)</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </div>

        {/* 대상 엔티티 */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">대상</label>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
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
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            검색
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            초기화
          </button>
        </div>
      </form>

      {loadError && <ErrorBanner message={loadError} onRetry={() => load(page)} />}

      {/* ─── 로그 테이블 ─── */}
      {isLoading ? (
        <p className="text-sm text-gray-400 mt-8 text-center">불러오는 중...</p>
      ) : logs.length === 0 ? (
        <EmptyState message="조건에 맞는 감사 로그가 없습니다." />
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">일시</th>
                  <th className="px-4 py-3 font-medium">사용자</th>
                  <th className="px-4 py-3 font-medium">이벤트</th>
                  <th className="px-4 py-3 font-medium">대상</th>
                  <th className="px-4 py-3 font-medium">상세</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs font-mono">
                      {fmtDate(log.created_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      {log.user_name ? (
                        <span>
                          {log.user_name}
                          <span className="text-gray-400 text-xs ml-1">({log.username})</span>
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">시스템</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {log.entity_type ? `${log.entity_type}/${log.entity_id ?? '-'}` : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs max-w-xs truncate" title={log.detail ?? ''}>
                      {log.detail ?? '-'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs font-mono">
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
                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
              >
                이전
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
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
