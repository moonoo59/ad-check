/**
 * 화면 2: 요청 목록/상태 조회 페이지
 *
 * - 상태 필터(멀티 선택) + 기간 + 요청자 필터
 * - 필터 상태는 URL 쿼리 파라미터로 관리 (새로고침/뒤로가기 유지)
 * - ad_team은 요청자 필터 고정(본인만)
 * - 행 클릭 시 요청 상세(화면 3)로 이동
 * - 페이지당 20건, 기본 최신 내림차순
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getRequests, getUsers } from '../lib/apiService';
import type { Request, RequestStatus, User } from '../types';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import LoadingRow from '../components/LoadingRow';
import ErrorBanner from '../components/ErrorBanner';

// 정렬 옵션
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'created_at_desc', label: '최신순' },
  { value: 'created_at_asc',  label: '오래된순' },
  { value: 'id_desc',         label: 'ID 내림차순' },
  { value: 'id_asc',          label: 'ID 오름차순' },
];

// 상태 필터 버튼 목록
const STATUS_FILTERS: { value: RequestStatus | 'all'; label: string }[] = [
  { value: 'all',         label: '전체' },
  { value: 'pending',     label: '대기 중' },
  { value: 'searching',   label: '탐색 중' },
  { value: 'search_done', label: '탐색 완료' },
  { value: 'editing',     label: '요청 수정중' },
  { value: 'approved',    label: '승인됨' },
  { value: 'copying',     label: '복사 중' },
  { value: 'done',        label: '완료' },
  { value: 'rejected',    label: '반려' },
  { value: 'failed',      label: '실패' },
];

const PAGE_LIMIT = 20;

/** 요청일시를 YYYY-MM-DD HH:MM 형식으로 변환 */
function formatDatetime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 기본 날짜 범위: 최근 30일 */
function getDefaultDateRange() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 30);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: fmt(from), to: fmt(today) };
}

export default function RequestListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL 쿼리에서 필터 초기값 읽기
  const defaultRange = getDefaultDateRange();
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(() => {
    const s = searchParams.get('status');
    return s ? new Set(s.split(',')) : new Set(['all']);
  });
  const [fromDate, setFromDate] = useState(searchParams.get('from') ?? defaultRange.from);
  const [toDate, setToDate] = useState(searchParams.get('to') ?? defaultRange.to);
  const [page, setPage] = useState(Number(searchParams.get('page') ?? 1));

  // 정렬 상태
  const [sort, setSort] = useState(searchParams.get('sort') ?? 'created_at_desc');
  // 요청자 필터 (tech_team/admin만 사용 가능; ad_team은 서버에서 자동 본인 고정)
  const [requesterId, setRequesterId] = useState<string>(searchParams.get('requester_id') ?? '');
  // admin/tech_team만 요청자 목록 로드
  const [userList, setUserList] = useState<User[]>([]);

  const [requests, setRequests] = useState<Request[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // admin/tech_team은 요청자 목록을 한 번만 로드 (필터 드롭다운용)
  useEffect(() => {
    if (user?.role === 'ad_team') return;   // ad_team은 본인 고정, 목록 불필요
    getUsers().catch(() => []).then(setUserList);
  }, [user?.role]);

  // 데이터 로드
  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const statusParam = selectedStatuses.has('all')
        ? undefined
        : Array.from(selectedStatuses).join(',');

      const res = await getRequests({
        page,
        limit: PAGE_LIMIT,
        status: statusParam,
        from: fromDate || undefined,
        to: toDate || undefined,
        sort,
        requester_id: requesterId ? Number(requesterId) : undefined,
        // ad_team은 서버에서 자동으로 본인만 필터링
      });
      setRequests(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch {
      setError('요청 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedStatuses, fromDate, toDate, page, sort, requesterId]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // 필터 변경 시 URL 쿼리 동기화
  useEffect(() => {
    const params: Record<string, string> = { page: String(page) };
    if (!selectedStatuses.has('all')) {
      params.status = Array.from(selectedStatuses).join(',');
    }
    if (fromDate) params.from = fromDate;
    if (toDate) params.to = toDate;
    if (sort !== 'created_at_desc') params.sort = sort;
    if (requesterId) params.requester_id = requesterId;
    setSearchParams(params, { replace: true });
  }, [selectedStatuses, fromDate, toDate, page, sort, requesterId, setSearchParams]);

  // 상태 필터 토글
  const toggleStatus = (value: string) => {
    if (value === 'all') {
      setSelectedStatuses(new Set(['all']));
    } else {
      setSelectedStatuses((prev) => {
        const next = new Set(prev);
        next.delete('all');
        if (next.has(value)) {
          next.delete(value);
          if (next.size === 0) next.add('all');
        } else {
          next.add(value);
        }
        return next;
      });
    }
    setPage(1);
  };

  // 필터 초기화
  const resetFilters = () => {
    setSelectedStatuses(new Set(['all']));
    setFromDate(defaultRange.from);
    setToDate(defaultRange.to);
    setSort('created_at_desc');
    setRequesterId('');
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-6">
      <PageHeader title="요청 목록">
        <button
          type="button"
          onClick={() => navigate('/requests/new')}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          + 새 요청 등록
        </button>
      </PageHeader>

      {/* 필터 바 */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        {/* 상태 필터 버튼 그룹 */}
        <div className="flex flex-wrap gap-2 mb-3">
          {STATUS_FILTERS.map(({ value, label }) => {
            const isActive = selectedStatuses.has(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleStatus(value)}
                className={`px-3 py-1 text-xs rounded border transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* 기간 + 요청자 + 정렬 + 초기화 */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* 기간 필터 */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-xs">기간</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded px-2 py-1 text-xs"
            />
            <span className="text-gray-400">~</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded px-2 py-1 text-xs"
            />
          </div>

          {/* 요청자 필터: admin/tech_team만 표시 */}
          {user?.role !== 'ad_team' && (
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-xs">요청자</span>
              <select
                value={requesterId}
                onChange={(e) => { setRequesterId(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">전체</option>
                {userList.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.display_name} ({u.username})
                  </option>
                ))}
              </select>
            </div>
          )}
          {user?.role === 'ad_team' && (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
              본인 요청만 조회 (고정)
            </span>
          )}

          {/* 정렬 드롭다운 */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-xs">정렬</span>
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1"
          >
            필터 초기화
          </button>
        </div>
      </div>

      {/* 오류 배너 */}
      {error && <ErrorBanner message={error} onRetry={loadRequests} />}

      {/* 결과 요약 */}
      <p className="text-xs text-gray-500 mb-2">총 {total}건 조회됨</p>

      {/* 요청 목록 테이블 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-20">요청 ID</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-40">요청일시</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-36">방송송출일자</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">요청자</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-16">항목 수</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-28">상태</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">검토자</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <LoadingRow colSpan={7} rows={5} />
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    message={error ? '오류가 발생했습니다.' : '현재 조건에 맞는 요청이 없습니다.'}
                    actionLabel={!error ? '필터 초기화' : undefined}
                    onAction={!error ? resetFilters : undefined}
                  />
                </td>
              </tr>
            ) : (
              requests.map((req) => (
                <tr
                  key={req.id}
                  onClick={() => navigate(`/requests/${req.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/requests/${req.id}`)}
                  className={`cursor-pointer hover:bg-gray-50 transition-colors ${
                    // search_done 상태 — 검토 요망 시각 신호 (기술팀 기준)
                    req.status === 'search_done' && user?.role !== 'ad_team'
                      ? 'border-l-4 border-l-yellow-400'
                      : ''
                  }`}
                >
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">#{req.id}</td>
                  <td className="px-4 py-3 text-gray-700 tabular-nums text-xs">
                    {formatDatetime(req.created_at)}
                  </td>
                  {/* 방송일자: 항목들의 broadcast_date를 콤마 구분으로 표시 */}
                  <td className="px-4 py-3 text-gray-700 tabular-nums text-xs">
                    {req.broadcast_dates
                      ? req.broadcast_dates.split(',').map((d, i) => (
                          <span key={d}>
                            {i > 0 && <br />}
                            {d}
                          </span>
                        ))
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{req.requester_name ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500 text-center">
                    {req.item_count ?? '-'}건
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <StatusBadge status={req.status} />
                      {/* 복사 중 깜빡이는 점 인디케이터 */}
                      {req.status === 'copying' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{req.reviewed_by_name ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4 text-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600"
          >
            &lt; 이전
          </button>
          <span className="text-gray-500 text-xs">
            {page} / {totalPages} 페이지
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600"
          >
            다음 &gt;
          </button>
        </div>
      )}
    </div>
  );
}
