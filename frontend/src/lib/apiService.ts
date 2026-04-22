/**
 * API 서비스 레이어
 *
 * 백엔드 API 엔드포인트별 요청 함수를 모듈화하여 정의한다.
 * 모든 함수는 api 인스턴스를 사용하며, 백엔드 표준 응답(ApiResponse<T>)을 파싱해서 반환한다.
 *
 * 에러 처리: axios 에러는 그대로 throw → 호출부에서 catch
 */

import { api } from './api';
import type {
  User,
  ChannelMapping,
  ChannelMappingHistory,
  RequestDetail,
  RequestListQuery,
  RequestListResponse,
  FileSearchResult,
  CreateRequestBody,
  CreateRequestResponse,
  RejectRequestBody,
  SelectFileBody,
  UpdateRequestItemBody,
  UpdateChannelBody,
  CreateChannelBody,
  CreateUserBody,
  UpdateUserBody,
  AuditLog,
  AuditLogQuery,
  StatsSummary,
  StatsMonthly,
  StatsDaily,
  StatsByChannel,
  StatsByAdvertiser,
  StatsBySalesManager,
  Registration,
  RegisterBody,
  HealthInfo,
} from '../types';

// ─── Auth API ────────────────────────────────────────────────────────────────

/** POST /api/auth/register — 회원가입 신청 (공개 엔드포인트, 비인증) */
export async function register(body: RegisterBody): Promise<{ registration_id: number }> {
  const res = await api.post<{ success: boolean; data: { registration_id: number } }>('/auth/register', body);
  return res.data.data!;
}

/** POST /api/auth/login */
export async function login(username: string, password: string): Promise<User> {
  const res = await api.post<{ success: boolean; data: User }>('/auth/login', { username, password });
  return res.data.data;
}

/** POST /api/auth/logout */
export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

/** GET /api/auth/me */
export async function getMe(): Promise<User> {
  const res = await api.get<{ success: boolean; data: User }>('/auth/me', { skipAuthRedirect: true });
  return res.data.data;
}

/** GET /api/health */
export async function getHealthInfo(): Promise<HealthInfo> {
  const res = await api.get<{ success: boolean; data: HealthInfo }>('/health', { skipAuthRedirect: true });
  return res.data.data;
}

// ─── Channels API ─────────────────────────────────────────────────────────────

/** GET /api/channels */
export async function getChannels(includeInactive = false): Promise<ChannelMapping[]> {
  // 백엔드는 { channels: [...], total: N } 구조로 반환 — channels 배열만 추출
  const res = await api.get<{ success: boolean; data: { channels: ChannelMapping[]; total: number } }>('/channels', {
    params: includeInactive ? { include_inactive: 'true' } : undefined,
  });
  return res.data.data?.channels ?? [];
}

/** POST /api/channels */
export async function createChannel(body: CreateChannelBody): Promise<ChannelMapping> {
  const res = await api.post<{ success: boolean; data: ChannelMapping }>('/channels', body);
  return res.data.data!;
}

/** PATCH /api/channels/:id */
export async function updateChannel(id: number, body: UpdateChannelBody): Promise<ChannelMapping> {
  const res = await api.patch<{ success: boolean; data: ChannelMapping }>(`/channels/${id}`, body);
  return res.data.data!;
}

/** GET /api/channels/:id/histories */
export async function getChannelHistories(id: number): Promise<ChannelMappingHistory[]> {
  // 백엔드는 { channel_id, storage_folder, histories: [...], limit, offset } 구조 — histories 배열만 추출
  const res = await api.get<{
    success: boolean;
    data: { channel_id: number; storage_folder: string; histories: ChannelMappingHistory[]; limit: number; offset: number };
  }>(`/channels/${id}/histories`);
  return res.data.data?.histories ?? [];
}

// ─── Requests API ─────────────────────────────────────────────────────────────

/** POST /api/requests */
export async function createRequest(body: CreateRequestBody): Promise<CreateRequestResponse> {
  const res = await api.post<{ success: boolean; data: CreateRequestResponse }>('/requests', body);
  return res.data.data!;
}

/** GET /api/requests */
export async function getRequests(query: RequestListQuery = {}): Promise<RequestListResponse> {
  // 백엔드는 { requests: [...], pagination: { total, page, limit, total_pages } } 구조
  // 프론트 타입 RequestListResponse { items, total, page, limit } 형태로 정규화
  const res = await api.get<{
    success: boolean;
    data: { requests: import('../types').Request[]; pagination: { total: number; page: number; limit: number; total_pages: number } };
  }>('/requests', { params: query });
  const { requests, pagination } = res.data.data!;
  return {
    items: requests,
    total: pagination.total,
    page: pagination.page,
    limit: pagination.limit,
  };
}

/** GET /api/requests/:id */
export async function getRequestDetail(id: number): Promise<RequestDetail> {
  // 백엔드는 { request: {...}, items: [...] } 구조 — request 필드를 펼쳐서 RequestDetail로 정규화
  const res = await api.get<{
    success: boolean;
    data: { request: import('../types').Request; items: RequestDetail['items'] };
  }>(`/requests/${id}`);
  const { request, items } = res.data.data!;
  return { ...request, items };
}

/** POST /api/requests/:id/search */
export async function startFileSearch(id: number): Promise<void> {
  await api.post(`/requests/${id}/search`);
}

/** POST /api/requests/:id/retry-search */
export async function retryFileSearch(id: number): Promise<void> {
  await api.post(`/requests/${id}/retry-search`);
}

/** POST /api/requests/:id/approve */
export async function approveRequest(id: number): Promise<void> {
  await api.post(`/requests/${id}/approve`);
}

/** POST /api/requests/:id/retry-copy — 복사 실패 또는 수정 항목 재복사 */
export async function retryCopy(id: number): Promise<void> {
  await api.post(`/requests/${id}/retry-copy`);
}

/** POST /api/requests/:id/reject */
export async function rejectRequest(id: number, body: RejectRequestBody): Promise<void> {
  await api.post(`/requests/${id}/reject`, body);
}

/** POST /api/requests/:id/resend — 완료 상태 요청의 NAS 파일 재전송 (재복사) */
export async function resendRequest(id: number, reason: string): Promise<void> {
  await api.post(`/requests/${id}/resend`, { reason });
}

/** DELETE /api/requests/:id — 요청 소프트 삭제 (관리자 전용) */
export async function deleteRequest(id: number): Promise<void> {
  await api.delete(`/requests/${id}`);
}

/** DELETE /api/files/copied-files/:copyJobId */
export async function deleteCopiedFile(copyJobId: number): Promise<void> {
  await api.delete(`/files/copied-files/${copyJobId}`);
}

/** PATCH /api/requests/:id/items/:itemId */
export async function updateRequestItem(
  requestId: number,
  itemId: number,
  body: UpdateRequestItemBody,
): Promise<void> {
  await api.patch(`/requests/${requestId}/items/${itemId}`, body);
}

/** PATCH /api/requests/items/:itemId/select-file */
export async function selectFile(itemId: number, body: SelectFileBody): Promise<FileSearchResult> {
  const res = await api.patch<{ success: boolean; data: FileSearchResult }>(
    `/requests/items/${itemId}/select-file`,
    body,
  );
  return res.data.data!;
}

// ─── Registrations API (tech_team + admin) ───────────────────────────────────

/** GET /api/registrations?status=pending|approved|rejected */
export async function getRegistrations(status?: string): Promise<Registration[]> {
  const res = await api.get<{ success: boolean; data: { registrations: Registration[]; total: number } }>(
    '/registrations',
    { params: status ? { status } : undefined },
  );
  return res.data.data?.registrations ?? [];
}

/** GET /api/registrations/pending-count — GlobalNav 뱃지용 */
export async function getRegistrationPendingCount(): Promise<number> {
  const res = await api.get<{ success: boolean; data: { count: number } }>('/registrations/pending-count');
  return res.data.data?.count ?? 0;
}

/** POST /api/registrations/:id/approve */
export async function approveRegistration(id: number): Promise<{ user_id: number }> {
  const res = await api.post<{ success: boolean; data: { user_id: number } }>(`/registrations/${id}/approve`);
  return res.data.data!;
}

/** POST /api/registrations/:id/reject */
export async function rejectRegistration(id: number, reason: string): Promise<void> {
  await api.post(`/registrations/${id}/reject`, { reason });
}

// ─── Users API (admin 전용) ────────────────────────────────────────────────────

/** GET /api/users */
export async function getUsers(includeInactive = false): Promise<User[]> {
  const res = await api.get<{ success: boolean; data: { users: User[]; total: number } }>('/users', {
    params: includeInactive ? { include_inactive: 'true' } : undefined,
  });
  return res.data.data?.users ?? [];
}

/** GET /api/users/:id */
export async function getUserById(id: number): Promise<User> {
  const res = await api.get<{ success: boolean; data: User }>(`/users/${id}`);
  return res.data.data!;
}

/** POST /api/users */
export async function createUser(body: CreateUserBody): Promise<User> {
  const res = await api.post<{ success: boolean; data: User }>('/users', body);
  return res.data.data!;
}

/** PATCH /api/users/:id */
export async function updateUser(id: number, body: UpdateUserBody): Promise<User> {
  const res = await api.patch<{ success: boolean; data: User }>(`/users/${id}`, body);
  return res.data.data!;
}

/** POST /api/users/:id/reset-password */
export async function resetUserPassword(id: number, new_password: string): Promise<void> {
  await api.post(`/users/${id}/reset-password`, { new_password });
}

/** POST /api/auth/change-password — 본인 비밀번호 변경 (로그인 상태) */
export async function changePassword(current_password: string, new_password: string, new_password_confirm: string): Promise<void> {
  await api.post('/auth/change-password', { current_password, new_password, new_password_confirm });
}

/** POST /api/auth/reset-password — 비밀번호 자가 초기화 (로그인 없이, 연락처로 본인 확인) */
export async function selfResetPassword(
  username: string,
  contact: string,
  new_password: string,
  new_password_confirm: string,
): Promise<void> {
  await api.post('/auth/reset-password', { username, contact, new_password, new_password_confirm });
}

// ─── Audit API (admin 전용) ────────────────────────────────────────────────────

/** GET /api/audit/logs */
export async function getAuditLogs(
  query: AuditLogQuery = {},
): Promise<{ logs: AuditLog[]; total: number; page: number; limit: number }> {
  const res = await api.get<{
    success: boolean;
    data: { logs: AuditLog[]; total: number; page: number; limit: number };
  }>('/audit/logs', { params: query });
  return res.data.data!;
}

// ─── Stats API (admin 전용) ────────────────────────────────────────────────────

/**
 * GET /api/stats/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 기간 미제공 시 전체 누적 집계. 기간 제공 시 해당 기간 내 수치만 집계.
 */
export async function getStatsSummary(from?: string, to?: string): Promise<StatsSummary> {
  const params: Record<string, string> = {};
  if (from) params.from = from;
  if (to)   params.to   = to;
  const res = await api.get<{ success: boolean; data: StatsSummary }>('/stats/summary', { params });
  return res.data.data!;
}

/** GET /api/stats/monthly?year=YYYY — 해당 연도의 월별 요청 항목 건수 */
export async function getStatsMonthly(year: number): Promise<StatsMonthly[]> {
  const res = await api.get<{ success: boolean; data: { year: number; monthly: StatsMonthly[] } }>(
    '/stats/monthly', { params: { year } },
  );
  return res.data.data?.monthly ?? [];
}

/** GET /api/stats/daily?year=YYYY&month=MM — 해당 연월의 일별 요청 항목 건수 */
export async function getStatsDaily(year: number, month: number): Promise<StatsDaily[]> {
  const res = await api.get<{ success: boolean; data: { year: number; month: number; daily: StatsDaily[] } }>(
    '/stats/daily', { params: { year, month } },
  );
  return res.data.data?.daily ?? [];
}

/** GET /api/stats/by-channel?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function getStatsByChannel(from?: string, to?: string): Promise<StatsByChannel[]> {
  const params: Record<string, string> = {};
  if (from) params.from = from;
  if (to)   params.to   = to;
  const res = await api.get<{ success: boolean; data: { channels: StatsByChannel[] } }>('/stats/by-channel', { params });
  return res.data.data?.channels ?? [];
}

/** GET /api/stats/by-advertiser?limit=N&from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function getStatsByAdvertiser(limit = 20, from?: string, to?: string): Promise<StatsByAdvertiser[]> {
  const params: Record<string, string | number> = { limit };
  if (from) params.from = from;
  if (to)   params.to   = to;
  const res = await api.get<{ success: boolean; data: { advertisers: StatsByAdvertiser[] } }>(
    '/stats/by-advertiser', { params },
  );
  return res.data.data?.advertisers ?? [];
}

/** GET /api/stats/by-sales-manager?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function getStatsBySalesManager(from?: string, to?: string): Promise<StatsBySalesManager[]> {
  const params: Record<string, string> = {};
  if (from) params.from = from;
  if (to)   params.to   = to;
  const res = await api.get<{ success: boolean; data: { sales_managers: StatsBySalesManager[] } }>(
    '/stats/by-sales-manager', { params },
  );
  return res.data.data?.sales_managers ?? [];
}

/**
 * GET /api/requests/:requestId/items/:itemId/download — 완료 파일 다운로드
 * blob 응답으로 받아 브라우저에서 파일 다운로드 트리거
 * 대용량 파일(수 GB)도 지원하므로 timeout을 0(무제한)으로 설정한다.
 */
export async function downloadRequestItemFile(requestId: number, itemId: number): Promise<void> {
  const res = await api.get(`/requests/${requestId}/items/${itemId}/download`, {
    responseType: 'blob',
    timeout: 0, // 대용량 파일 다운로드: 타임아웃 무제한
  });
  // Content-Disposition 헤더에서 파일명 추출 (없으면 기본명 사용)
  const disposition = res.headers['content-disposition'] as string | undefined;
  let fileName = `download.avi`;
  if (disposition) {
    // filename*=UTF-8''... 형식 우선, 없으면 filename="..." 형식
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const basicMatch = disposition.match(/filename="([^"]+)"/i);
    if (utf8Match) {
      fileName = decodeURIComponent(utf8Match[1]);
    } else if (basicMatch) {
      fileName = basicMatch[1];
    }
  }
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * GET /api/requests/export-excel — 요청 목록 Excel(CSV) 다운로드
 * blob 응답으로 받아 브라우저에서 파일 다운로드 트리거
 */
export async function exportRequestsCsv(params: {
  from?: string;
  to?: string;
  status?: string;
}): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const res = await api.get('/requests/export-excel', {
    params,
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `adcheck-requests-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * GET /api/stats/export-csv — CSV 파일 다운로드
 * blob 응답으로 받아 브라우저에서 파일 다운로드 트리거
 */
export async function exportStatsCsv(from: string, to: string): Promise<void> {
  const res = await api.get('/stats/export-csv', {
    params: { from, to },
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `adcheck-export-${from}-${to}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
