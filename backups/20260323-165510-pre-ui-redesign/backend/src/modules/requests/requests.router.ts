/**
 * 요청 라우터
 *
 * POST   /api/requests                           - 요청 등록
 * GET    /api/requests                           - 요청 목록 (필터/페이지네이션)
 * GET    /api/requests/:id                       - 요청 상세
 * POST   /api/requests/:id/search               - 파일 탐색 시작 (백그라운드)
 * POST   /api/requests/:id/retry-search         - 탐색 재시도 (기존 결과 초기화)
 * POST   /api/requests/:id/approve              - 전체 승인 + 복사 실행
 * POST   /api/requests/:id/retry-copy           - 복사 재시도 (실패 항목만, 파일 선택 유지)
 * POST   /api/requests/:id/reject               - 반려 처리
 * DELETE /api/requests/:id                      - 요청 삭제 (관리자 전용, 소프트 삭제)
 * POST   /api/requests/:id/resend               - 재전송 요청 (완료 상태에서 재복사)
 * PATCH  /api/requests/:id/items/:itemId        - 오전송 항목 수정 + 단일 재탐색
 * PATCH  /api/requests/items/:itemId/select-file - 파일 선택
 */
import { Router, Request, Response, IRouter } from 'express';
import {
  createRequest,
  getRequests,
  getRequestDetail,
  selectFile,
  rejectRequest,
  prepareForSearch,
  validateApproval,
  approveRequest,
  prepareForRetryCopy,
  prepareForResend,
  updateRequestItemForCorrection,
  deleteRequest,
  CreateRequestDto,
  UpdateRequestItemDto,
} from './requests.service';
import { runFileSearch, runSingleItemFileSearch } from '../files/files.service';
import { executeCopyJobs } from '../copy/copy.service';
import { sendSuccess, sendError } from '../../common/response';
import { requireAuth, requireRole, getCurrentUser } from '../../common/auth.middleware';

const router: IRouter = Router();

/**
 * POST /api/requests
 * 요청 등록 (모든 인증 사용자)
 */
router.post('/', requireAuth, (req: Request, res: Response): void => {
  const user = getCurrentUser(req);
  const body = req.body as CreateRequestDto;

  // 필수값 검증
  if (!Array.isArray(body.items) || body.items.length === 0) {
    sendError(res, '요청 항목이 최소 1개 이상 필요합니다.', 400, 'INVALID_INPUT');
    return;
  }

  // 각 항목 검증
  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];
    const idx = i + 1;
    if (!item.channel_mapping_id || typeof item.channel_mapping_id !== 'number') {
      sendError(res, `항목 ${idx}: 채널을 선택해주세요.`, 400, 'INVALID_INPUT');
      return;
    }
    // 영업담당자는 항목별 필수 입력 (migration 006에서 헤더에서 이동)
    if (!item.sales_manager || typeof item.sales_manager !== 'string' || item.sales_manager.trim() === '') {
      sendError(res, `항목 ${idx}: 영업담당자를 입력해주세요.`, 400, 'INVALID_INPUT');
      return;
    }
    if (!item.advertiser || typeof item.advertiser !== 'string' || item.advertiser.trim() === '') {
      sendError(res, `항목 ${idx}: 광고주를 입력해주세요.`, 400, 'INVALID_INPUT');
      return;
    }
    if (!item.broadcast_date || !/^\d{4}-\d{2}-\d{2}$/.test(item.broadcast_date)) {
      sendError(res, `항목 ${idx}: 방송일자 형식이 올바르지 않습니다. (YYYY-MM-DD)`, 400, 'INVALID_INPUT');
      return;
    }
    if (!item.req_time_start || !/^\d{2}:\d{2}$/.test(item.req_time_start)) {
      sendError(res, `항목 ${idx}: 시작 시간 형식이 올바르지 않습니다. (HH:MM)`, 400, 'INVALID_INPUT');
      return;
    }
    if (!item.req_time_end || !/^\d{2}:\d{2}$/.test(item.req_time_end)) {
      sendError(res, `항목 ${idx}: 종료 시간 형식이 올바르지 않습니다. (HH:MM)`, 400, 'INVALID_INPUT');
      return;
    }
    if (!item.monitoring_time || !/^\d{2}:\d{2}(:\d{2})?$/.test(item.monitoring_time)) {
      sendError(res, `항목 ${idx}: 송출 시간 형식이 올바르지 않습니다. (HH:MM)`, 400, 'INVALID_INPUT');
      return;
    }
  }

  try {
    const requestId = createRequest(body, user.id);

    // 요청 등록 직후 자동으로 파일 탐색 시작
    // 관리자/기술팀이 조회할 때 이미 탐색 결과가 있어야 하므로 등록과 동시에 실행
    prepareForSearch(requestId);
    sendSuccess(res, { id: requestId }, '요청이 등록되었습니다.', 201);

    // 응답 전송 후 백그라운드에서 탐색 실행 (HTTP 응답과 무관하게 진행)
    setImmediate(() => {
      runFileSearch(requestId, user.id).catch((err) => {
        console.error(`[Files] 요청 ${requestId} 자동 파일 탐색 오류:`, err);
      });
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('FOREIGN KEY')) {
      sendError(res, '유효하지 않은 채널이 포함되어 있습니다.', 400, 'INVALID_CHANNEL');
      return;
    }
    throw err;
  }
});

/**
 * GET /api/requests
 * 요청 목록 조회 (필터 + 페이지네이션)
 * ad_team은 본인 요청만 조회 (서버 강제)
 */
router.get('/', requireAuth, (req: Request, res: Response): void => {
  const user = getCurrentUser(req);
  const {
    status,
    from,
    to,
    requester_id,
    page,
    limit,
    sort,
  } = req.query as Record<string, string>;

  const filter = {
    status: status ? status.split(',') : undefined,
    from: from || undefined,
    to: to || undefined,
    requester_id: requester_id ? parseInt(requester_id, 10) : undefined,
    page: page ? parseInt(page, 10) : 1,
    limit: limit ? parseInt(limit, 10) : 20,
    sort: sort || undefined,  // SORT_MAP 화이트리스트로 SQL 인젝션 방지 (서비스에서 처리)
  };

  const { requests, total } = getRequests(filter, user.role, user.id);
  const totalPages = Math.ceil(total / (filter.limit ?? 20));

  sendSuccess(res, {
    requests,
    pagination: {
      total,
      page: filter.page ?? 1,
      limit: filter.limit ?? 20,
      total_pages: totalPages,
    },
  });
});

/**
 * GET /api/requests/:id
 * 요청 상세 조회 (항목 + 파일 탐색 결과 + 복사 작업 포함)
 */
router.get('/:id', requireAuth, (req: Request, res: Response): void => {
  const user = getCurrentUser(req);
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    sendError(res, '유효하지 않은 요청 ID입니다.', 400, 'INVALID_ID');
    return;
  }

  const detail = getRequestDetail(id, user.role, user.id);
  if (!detail) {
    sendError(res, '요청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
    return;
  }

  sendSuccess(res, detail);
});

/**
 * POST /api/requests/:id/search
 * 파일 탐색 시작
 * 상태를 searching으로 변경 후 백그라운드에서 탐색 실행
 * 클라이언트는 GET /api/requests/:id 폴링으로 결과 확인
 */
router.post(
  '/:id/search',
  requireAuth,
  requireRole('tech_team', 'admin'),
  (req: Request, res: Response): void => {
    const user = getCurrentUser(req);
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      sendError(res, '유효하지 않은 요청 ID입니다.', 400, 'INVALID_ID');
      return;
    }

    const prepared = prepareForSearch(id);
    if (!prepared) {
      sendError(
        res,
        '현재 상태에서는 파일 탐색을 시작할 수 없습니다. (대기중/탐색실패/탐색완료 상태에서만 가능)',
        400,
        'INVALID_STATE',
      );
      return;
    }

    // 202 Accepted: 탐색은 백그라운드에서 진행됨
    sendSuccess(res, { request_id: id, status: 'searching' }, '파일 탐색을 시작했습니다.', 202);

    // 백그라운드 탐색 실행 (응답 전송 후 비동기로 실행)
    setImmediate(() => {
      runFileSearch(id, user.id).catch((err) => {
        console.error(`[Files] 요청 ${id} 파일 탐색 오류:`, err);
      });
    });
  },
);

/**
 * POST /api/requests/:id/retry-search
 * 탐색 재시도 (기존 탐색 결과 초기화 후 재실행)
 * search 엔드포인트와 동일 로직 (prepareForSearch가 search_done도 허용)
 */
router.post(
  '/:id/retry-search',
  requireAuth,
  requireRole('tech_team', 'admin'),
  (req: Request, res: Response): void => {
    const user = getCurrentUser(req);
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      sendError(res, '유효하지 않은 요청 ID입니다.', 400, 'INVALID_ID');
      return;
    }

    const prepared = prepareForSearch(id);
    if (!prepared) {
      sendError(
        res,
        '현재 상태에서는 탐색 재시도가 불가능합니다.',
        400,
        'INVALID_STATE',
      );
      return;
    }

    sendSuccess(res, { request_id: id, status: 'searching' }, '파일 탐색을 재시도합니다.', 202);

    setImmediate(() => {
      runFileSearch(id, user.id).catch((err) => {
        console.error(`[Files] 요청 ${id} 탐색 재시도 오류:`, err);
      });
    });
  },
);

/**
 * POST /api/requests/:id/approve
 * 전체 승인 및 복사 실행
 * 모든 항목에 파일이 선택되어 있어야 한다.
 */
router.post(
  '/:id/approve',
  requireAuth,
  requireRole('tech_team', 'admin'),
  (req: Request, res: Response): void => {
    const user = getCurrentUser(req);
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      sendError(res, '유효하지 않은 요청 ID입니다.', 400, 'INVALID_ID');
      return;
    }

    // 승인 가능 여부 사전 검증
    const validationResult = validateApproval(id);
    if (validationResult !== true) {
      sendError(res, validationResult, 400, 'APPROVAL_FAILED');
      return;
    }

    // 요청 상태를 approved로 변경
    approveRequest(id, user.id);

    sendSuccess(res, { request_id: id, status: 'copying' }, '승인되었습니다. 파일 복사를 시작합니다.', 202);

    // 백그라운드 복사 실행
    setImmediate(() => {
      executeCopyJobs(id, user.id).catch((err) => {
        console.error(`[Copy] 요청 ${id} 복사 실행 오류:`, err);
      });
    });
  },
);

/**
 * POST /api/requests/:id/retry-copy
 * 복사 재시도
 * - failed / approved / editing 상태 요청에서 가능
 * - 실패한 항목만 재처리 (done 항목은 유지)
 * - 파일 선택 상태 유지 (재탐색 불필요)
 */
router.post(
  '/:id/retry-copy',
  requireAuth,
  requireRole('tech_team', 'admin'),
  (req: Request, res: Response): void => {
    const user = getCurrentUser(req);
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      sendError(res, '유효하지 않은 요청 ID입니다.', 400, 'INVALID_ID');
      return;
    }

    const prepared = prepareForRetryCopy(id);
    if (prepared !== true) {
      sendError(res, prepared, 400, 'RETRY_COPY_FAILED');
      return;
    }

    sendSuccess(res, { request_id: id, status: 'copying' }, '복사를 재시도합니다.', 202);

    // 백그라운드 복사 실행 (실패 항목만 처리됨)
    setImmediate(() => {
      executeCopyJobs(id, user.id).catch((err) => {
        console.error(`[Copy] 요청 ${id} 복사 재시도 오류:`, err);
      });
    });
  },
);

/**
 * POST /api/requests/:id/reject
 * 요청 반려
 * body: { reject_reason: string } (필수, 최소 5자)
 */
router.post(
  '/:id/reject',
  requireAuth,
  requireRole('tech_team', 'admin'),
  (req: Request, res: Response): void => {
    const user = getCurrentUser(req);
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      sendError(res, '유효하지 않은 요청 ID입니다.', 400, 'INVALID_ID');
      return;
    }

    const { reject_reason } = req.body as { reject_reason?: string };

    if (!reject_reason || typeof reject_reason !== 'string' || reject_reason.trim().length < 5) {
      sendError(res, '반려 사유를 5자 이상 입력해주세요.', 400, 'INVALID_INPUT');
      return;
    }

    const rejected = rejectRequest(id, reject_reason.trim(), user.id);
    if (!rejected) {
      sendError(
        res,
        '반려 처리에 실패했습니다. 요청이 없거나 반려 불가능한 상태입니다.',
        400,
        'REJECT_FAILED',
      );
      return;
    }

    sendSuccess(res, { request_id: id, status: 'rejected' }, '반려 처리되었습니다.');
  },
);

/**
 * DELETE /api/requests/:id
 * 요청 삭제 (관리자 전용, 소프트 삭제)
 * - copying/searching 상태는 삭제 불가
 * - is_deleted = 1 처리 (실제 DB 행 유지, 감사 추적 보존)
 */
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  (req: Request, res: Response): void => {
    const user = getCurrentUser(req);
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      sendError(res, '유효하지 않은 요청 ID입니다.', 400, 'INVALID_ID');
      return;
    }

    const result = deleteRequest(id, user.id);
    if (result !== true) {
      sendError(res, result, 400, 'DELETE_FAILED');
      return;
    }

    sendSuccess(res, { request_id: id }, '요청이 삭제되었습니다.');
  },
);

/**
 * PATCH /api/requests/:id/items/:itemId
 * 오전송 수정
 *
 * 완료 또는 수정중 요청의 특정 항목만 다시 탐색 대상으로 되돌린다.
 * 수정 직후 해당 항목에 대해서만 단일 파일 탐색이 백그라운드에서 실행된다.
 */
router.patch(
  '/:id/items/:itemId',
  requireAuth,
  requireRole('tech_team', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const user = getCurrentUser(req);
    const requestId = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);
    const body = req.body as Partial<UpdateRequestItemDto>;

    if (isNaN(requestId) || isNaN(itemId)) {
      sendError(res, '유효하지 않은 요청 또는 항목 ID입니다.', 400, 'INVALID_ID');
      return;
    }

    if (!body.channel_mapping_id || typeof body.channel_mapping_id !== 'number') {
      sendError(res, '수정할 채널을 선택해주세요.', 400, 'INVALID_INPUT');
      return;
    }
    if (!body.broadcast_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.broadcast_date)) {
      sendError(res, '방송일자 형식이 올바르지 않습니다. (YYYY-MM-DD)', 400, 'INVALID_INPUT');
      return;
    }
    if (!body.req_time_start || !/^\d{2}:\d{2}$/.test(body.req_time_start)) {
      sendError(res, '시작 시간 형식이 올바르지 않습니다. (HH:MM)', 400, 'INVALID_INPUT');
      return;
    }
    if (!body.req_time_end || !/^\d{2}:\d{2}$/.test(body.req_time_end)) {
      sendError(res, '종료 시간 형식이 올바르지 않습니다. (HH:MM)', 400, 'INVALID_INPUT');
      return;
    }
    if (!body.monitoring_time || !/^\d{2}:\d{2}(:\d{2})?$/.test(body.monitoring_time)) {
      sendError(res, '송출 시간 형식이 올바르지 않습니다. (HH:MM)', 400, 'INVALID_INPUT');
      return;
    }

    const result = await updateRequestItemForCorrection(
      requestId,
      itemId,
      {
        channel_mapping_id: body.channel_mapping_id,
        broadcast_date: body.broadcast_date,
        req_time_start: body.req_time_start,
        req_time_end: body.req_time_end,
        monitoring_time: body.monitoring_time,
      },
      user.id,
    );

    if (result !== true) {
      sendError(res, result, 400, 'REQUEST_ITEM_UPDATE_FAILED');
      return;
    }

    sendSuccess(
      res,
      { request_id: requestId, item_id: itemId, status: 'editing' },
      '항목 수정이 저장되었습니다. 단일 파일 탐색을 시작합니다.',
      202,
    );

    setImmediate(() => {
      runSingleItemFileSearch(itemId, user.id).catch((err) => {
        console.error(`[Files] 항목 ${itemId} 단일 탐색 오류:`, err);
      });
    });
  },
);

/**
 * POST /api/requests/:id/resend
 * 재전송 요청 (모든 인증 사용자 가능)
 *
 * 완료(done) 상태 요청의 파일이 NAS에서 삭제된 경우 재복사를 실행한다.
 * resend_logs에 사유와 함께 이력을 기록하고, 백그라운드에서 파일 복사를 재실행한다.
 *
 * body: { reason: string } (필수, 최소 5자)
 */
router.post(
  '/:id/resend',
  requireAuth,
  (req: Request, res: Response): void => {
    const user = getCurrentUser(req);
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      sendError(res, '유효하지 않은 요청 ID입니다.', 400, 'INVALID_ID');
      return;
    }

    const { reason } = req.body as { reason?: string };

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      sendError(res, '재전송 사유를 5자 이상 입력해주세요.', 400, 'INVALID_INPUT');
      return;
    }

    const result = prepareForResend(id, reason.trim(), user.id, user.displayName);
    if (result !== true) {
      sendError(res, result, 400, 'RESEND_FAILED');
      return;
    }

    // 재전송 후 approved 상태로 전환됨 — 관리자/기술팀이 목록에서 확인 후 수동 복사 실행
    sendSuccess(res, { request_id: id, status: 'approved' }, '재전송 요청이 등록되었습니다. 관리자/기술팀이 복사를 실행해주세요.');
  },
);

/**
 * PATCH /api/requests/items/:itemId/select-file
 * 파일 선택 (라디오 버튼 변경 시 즉시 호출)
 * body: { file_search_result_id: number }
 */
router.patch(
  '/items/:itemId/select-file',
  requireAuth,
  requireRole('tech_team', 'admin'),
  (req: Request, res: Response): void => {
    const user = getCurrentUser(req);
    const itemId = parseInt(req.params.itemId, 10);
    const { file_search_result_id } = req.body as { file_search_result_id?: number };

    if (isNaN(itemId)) {
      sendError(res, '유효하지 않은 항목 ID입니다.', 400, 'INVALID_ID');
      return;
    }
    if (!file_search_result_id || typeof file_search_result_id !== 'number') {
      sendError(res, '파일 ID를 지정해주세요.', 400, 'INVALID_INPUT');
      return;
    }

    const ok = selectFile(itemId, file_search_result_id, user.role, user.id);
    if (!ok) {
      sendError(
        res,
        '파일 선택에 실패했습니다. 항목이 없거나 이미 완료된 항목입니다.',
        400,
        'SELECT_FAILED',
      );
      return;
    }

    sendSuccess(res, { request_item_id: itemId, file_search_result_id }, '파일이 선택되었습니다.');
  },
);

export default router;
