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
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { List } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { exportRequestsCsv, getRequests, getUsers } from '../lib/apiService';
import type { Request, RequestStatus, User } from '../types';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import LoadingRow from '../components/LoadingRow';
import ErrorBanner from '../components/ErrorBanner';
import { useToast } from '../components/ToastMessage';
import { formatTimestampKst, getKstNowParts } from '../lib/datetime';

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

/** 기본 날짜 범위: 최근 30일 */
function getDefaultDateRange() {
  const today = getKstNowParts().date;
  const from = new Date(`${today}T00:00:00+09:00`);
  from.setDate(from.getDate() - 30);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { from: fmt(from), to: today };
}

export default function RequestListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  // Excel 다운로드 중 버튼 비활성화용 상태
  const [isExporting, setIsExporting] = useState(false);

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

  // tech_team/admin: 현재 필터 조건 그대로 CSV 다운로드
  const handleExcelDownload = async () => {
    setIsExporting(true);
    try {
      const statusParam = selectedStatuses.has('all')
        ? undefined
        : Array.from(selectedStatuses).join(',');

      await exportRequestsCsv({
        from: fromDate || undefined,
        to: toDate || undefined,
        status: statusParam,
      });
      showToast('Excel 다운로드 완료', 'success');
    } catch {
      showToast('Excel 다운로드에 실패했습니다.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="app-page">
      <PageHeader
        title="요청 목록"
        subtitle="요청 상태, 기간, 요청자를 기준으로 현재 진행 상황을 빠르게 확인할 수 있습니다."
        icon={List}
      >
        {/* tech_team/admin: Excel 내보내기 버튼 (현재 필터 조건 적용) */}
        {(user?.role === 'tech_team' || user?.role === 'admin') && (
          <button
            type="button"
            onClick={handleExcelDownload}
            disabled={isExporting}
            className="app-btn app-btn--secondary"
          >
            {isExporting ? 'Excel 준비 중...' : 'Excel 다운로드'}
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/requests/new')}
          className="app-btn app-btn--primary"
        >
          새 요청 등록
        </button>
      </PageHeader>

      {/* 필터 바 */}
      <div className="app-toolbar-card app-toolbar-card--compact mb-4 p-5">
        {/* 상태 필터 버튼 그룹 */}
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_FILTERS.map(({ value, label }) => {
            const isActive = selectedStatuses.has(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleStatus(value)}
                className={`app-chip ${isActive ? 'app-chip--active' : ''}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* 기간 + 요청자 + 정렬 + 초기화 — 한 줄 가로 배치 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* 기간 필터 */}
          <div className="flex min-w-0 items-center gap-2 shrink-0">
            <span className="whitespace-nowrap text-sm font-semibold text-[var(--app-text-soft)]">
              기간
            </span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              className="app-field app-field--dense text-sm w-[140px]"
            />
            <span className="shrink-0 text-[var(--app-text-faint)]">~</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              className="app-field app-field--dense text-sm w-[140px]"
            />
          </div>

          {/* 요청자 필터: admin/tech_team만 표시 */}
          {user?.role !== 'ad_team' && (
            <div className="flex min-w-0 items-center gap-2 shrink-0">
              <span className="whitespace-nowrap text-sm font-semibold text-[var(--app-text-soft)]">
                요청자
              </span>
              <select
                value={requesterId}
                onChange={(e) => { setRequesterId(e.target.value); setPage(1); }}
                className="app-select app-select--dense text-sm w-[150px]"
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

          {/* 정렬 드롭다운 */}
          <div className="flex min-w-0 items-center gap-2 shrink-0">
            <span className="whitespace-nowrap text-sm font-semibold text-[var(--app-text-soft)]">
              정렬
            </span>
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value); setPage(1); }}
              className="app-select app-select--dense text-sm w-[120px]"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="app-btn app-btn--ghost app-btn--sm shrink-0"
          >
            필터 초기화
          </button>
        </div>
      </div>

      {/* 오류 배너 */}
      {error && <ErrorBanner message={error} onRetry={loadRequests} />}

      {/* 결과 요약 */}
      <p className="mb-3 text-[15px] text-[var(--app-text-soft)]">총 {total}건 조회됨</p>

      {/* 요청 목록 테이블 */}
      <div className="app-table-shell">
        <table className="app-table app-table--readable">
          <thead>
            <tr>
              <th className="min-w-[88px]">요청 ID</th>
              <th className="min-w-[150px]">요청일시</th>
              <th className="min-w-[140px]">방송송출일자</th>
              <th className="min-w-[120px]">요청자</th>
              <th className="min-w-[72px]">항목 수</th>
              <th className="min-w-[112px]">상태</th>
              <th className="min-w-[120px]">검토자</th>
            </tr>
          </thead>
          <tbody>
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
                  className={`transition-colors ${
                    // search_done 상태 — 검토 요망 시각 신호 (기술팀 기준)
                    req.status === 'search_done' && user?.role !== 'ad_team'
                      ? 'border-l-[3px] border-l-amber-400'
                      : ''
                  } cursor-pointer`}
                >
                  <td className="font-mono text-sm text-[var(--app-text-soft)]">
                    <Link
                      to={`/requests/${req.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="font-medium text-[var(--app-primary)] underline-offset-2 hover:underline"
                    >
                      #{req.id}
                    </Link>
                  </td>
                  <td className="tabular-nums text-sm text-[var(--app-text)]">
                    {formatTimestampKst(req.created_at)}
                  </td>
                  {/* 방송일자: 항목들의 broadcast_date를 콤마 구분으로 표시 */}
                  <td className="tabular-nums text-sm text-[var(--app-text)]">
                    {req.broadcast_dates
                      ? req.broadcast_dates.split(',').map((d, i) => (
                          <span key={d}>
                            {i > 0 && <br />}
                            {d}
                          </span>
                        ))
                      : '-'}
                  </td>
                  <td>{req.requester_name ?? '-'}</td>
                  <td className="text-center text-[var(--app-text-soft)]">
                    {req.item_count ?? '-'}건
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <StatusBadge status={req.status} />
                      {/* 복사 중 깜빡이는 점 인디케이터 */}
                      {req.status === 'copying' && (
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
                      )}
                    </div>
                  </td>
                  <td className="text-[var(--app-text-soft)]">{req.reviewed_by_name ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="app-btn app-btn--secondary app-btn--sm"
          >
            &lt; 이전
          </button>
          <span className="text-xs text-[var(--app-text-soft)]">
            {page} / {totalPages} 페이지
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="app-btn app-btn--secondary app-btn--sm"
          >
            다음 &gt;
          </button>
        </div>
      )}
    </div>
  );
}
