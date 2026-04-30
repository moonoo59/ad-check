/**
 * 요청 라우터
 *
 * POST   /api/requests                              - 요청 등록
 * GET    /api/requests                              - 요청 목록 (필터/페이지네이션)
 * GET    /api/requests/export-excel                 - 요청 목록 Excel(CSV) 내보내기 (모든 인증 사용자)
 * GET    /api/requests/:id                          - 요청 상세
 * POST   /api/requests/:id/search                  - 파일 탐색 시작 (백그라운드)
 * POST   /api/requests/:id/retry-search            - 탐색 재시도 (기존 결과 초기화)
 * POST   /api/requests/:id/approve                 - 전체 승인 + 복사 실행
 * POST   /api/requests/:id/retry-copy              - 복사 재시도 (실패 항목만, 파일 선택 유지)
 * POST   /api/requests/:id/reject                  - 반려 처리
 * DELETE /api/requests/:id                         - 요청 삭제 (관리자 전용, 소프트 삭제)
 * POST   /api/requests/:id/resend                  - 재전송 요청 (완료 상태에서 재복사)
 * PATCH  /api/requests/:id/items/:itemId           - 오전송 항목 수정 + 단일 재탐색
 * GET    /api/requests/:id/items/:itemId/download  - 완료 파일 웹 다운로드
 * PATCH  /api/requests/items/:itemId/select-file   - 파일 선택
 */
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
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
  getUniqueAdvertisers,
  CreateRequestDto,
  UpdateRequestItemDto,
} from './requests.service';
import { runFileSearch, runSingleItemFileSearch } from '../files/files.service';
import { executeCopyJobs } from '../copy/copy.service';
import { sendSuccess, sendError } from '../../common/response';
import { requireAuth, requireRole, getCurrentUser } from '../../common/auth.middleware';
import db from '../../config/database';
import { getChannelById } from '../channels/channels.service';
import { resolveDeliveryPath } from '../../common/path-guards';
import { utcNow, kstDateStartToUtc, kstDateEndToUtc } from '../../common/datetime';

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
      sendError(res, `항목 ${idx}: 송출 시간 형식이 올바르지 않습니다. (HH:MM 또는 HH:MM:SS)`, 400, 'INVALID_INPUT');
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
 * ad_team은 본인 요청만 조회한다. 단, 파일 전송 권한이 있으면 전송 작업을 위해 전체 요청을 조회할 수 있다.
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
 * GET /api/requests/export-excel
 * 요청 목록을 CSV(Excel 호환) 형식으로 내보내기
 *
 * 권한: 모든 인증 사용자
 * 쿼리 파라미터: from (YYYY-MM-DD), to (YYYY-MM-DD), status (콤마 구분)
 *
 * 주의: /:id 앞에 등록해야 'export-excel'이 ID로 오인되지 않는다.
 */
router.get(
  '/export-excel',
  requireAuth,
  (req: Request, res: Response): void => {
    const user = getCurrentUser(req);
    const { from, to, status } = req.query as Record<string, string>;

    // 날짜/상태 필터 조건 구성
    const conditions: string[] = ['r.is_deleted = 0'];
    const params: (string | number)[] = [];

    if (from) {
      conditions.push('r.created_at >= ?');
      params.push(kstDateStartToUtc(from));
    }
    if (to) {
      conditions.push('r.created_at <= ?');
      params.push(kstDateEndToUtc(to));
    }
    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        conditions.push(`r.status IN (${statuses.map(() => '?').join(',')})`);
        params.push(...statuses);
      }
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    // 요청 항목 단위로 조회 (요청 1건에 항목 여러 개 가능)
    const rows = db.prepare(`
      SELECT
        r.id                                        AS '요청ID',
        datetime(r.created_at, '+9 hours')          AS '요청일시',
        u_req.display_name                          AS '요청자',
        ri.sales_manager                            AS '영업담당자',
        r.status                                    AS '요청상태',
        cm.display_name                             AS '채널',
        ri.advertiser                               AS '광고주',
        ri.broadcast_date                           AS '방송일자',
        ri.req_time_start                           AS '시작시간',
        ri.req_time_end                             AS '종료시간',
        ri.monitoring_time                          AS '송출시간',
        ri.item_status                              AS '항목상태',
        r.request_memo                              AS '요청비고',
        ri.item_memo                                AS '항목비고'
      FROM requests r
      JOIN request_items ri ON ri.request_id = r.id
      JOIN users u_req ON u_req.id = r.requester_id
      JOIN channel_mappings cm ON cm.id = ri.channel_mapping_id
      ${where}
      ORDER BY r.created_at DESC, ri.sort_order ASC
    `).all(...params) as Record<string, string | number | null>[];

    // CSV 변환 (Excel 열기 호환: UTF-8 BOM 포함)
    const headers = [
      '요청ID', '요청일시', '요청자', '영업담당자', '요청상태',
      '채널', '광고주', '방송일자', '시작시간', '종료시간',
      '송출시간', '항목상태', '요청비고', '항목비고',
    ];

    // 데이터 없을 때 헤더만 포함한 CSV 반환 (stats.router.ts와 동일한 방식으로 일관성 유지)
    if (rows.length === 0) {
      const today = new Date().toISOString().split('T')[0];
      const emptyFileName = `adcheck-requests-${today}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${emptyFileName}"`);
      res.send('\ufeff' + headers.join(',') + '\n');
      return;
    }

    const escapeCell = (val: string | number | null): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      // CSV 인젝션 방지: =, +, -, @ 로 시작하는 값은 앞에 탭을 추가해 수식으로 해석되지 않도록 함
      // (Excel이 해당 문자로 시작하는 셀을 수식으로 실행하는 취약점 차단)
      if (/^[=+\-@\t\r]/.test(str)) {
        return `\t${str}`;
      }
      // 콤마, 줄바꿈, 큰따옴표가 포함된 셀은 큰따옴표로 감싸고 내부 큰따옴표는 ""로 이스케이프
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(',')),
    ];

    // '\ufeff': UTF-8 BOM — Windows Excel에서 한글 깨짐 방지
    const csv = '\ufeff' + csvLines.join('\n');

    const today = new Date().toISOString().split('T')[0];
    const fileName = `adcheck-requests-${today}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csv);

    // 감사 로그 기록 (응답 완료 후 비동기)
    setImmediate(() => {
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, detail, created_at)
        VALUES (?, 'excel_export', 'requests', ?, ?)
      `).run(user.id, `Excel 내보내기 (${rows.length}행)`, utcNow());
    });
  },
);

/**
 * GET /api/requests/advertisers
 * 중복 없는 광고주 목록 조회 (연관 검색어용)
 */
router.get('/advertisers', requireAuth, (_req: Request, res: Response): void => {
  const advertisers = getUniqueAdvertisers();
  sendSuccess(res, { advertisers });
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
  (req: Request, res: Response): void => {
    const user = getCurrentUser(req);
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      sendError(res, '유효하지 않은 요청 ID입니다.', 400, 'INVALID_ID');
      return;
    }

    const prepared = prepareForRetryCopy(id, user.id);
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
      sendError(res, '송출 시간 형식이 올바르지 않습니다. (HH:MM 또는 HH:MM:SS)', 400, 'INVALID_INPUT');
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

    const result = prepareForResend(id, reason.trim(), user.id, user.displayName, user.role);
    if (result !== true) {
      const statusCode = result.includes('본인 요청') || result.includes('권한') ? 403 : 400;
      sendError(res, result, statusCode, 'RESEND_FAILED');
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
  (req: Request, res: Response): void => {
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

    const ok = selectFile(itemId, file_search_result_id);
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

/**
 * GET /api/requests/:id/items/:itemId/download
 * 완료 파일 웹 다운로드
 *
 * 권한:
 *   - ad_team: 본인 요청만 다운로드 가능
 *   - 관리자: 모든 요청 다운로드 가능
 *
 * 응답:
 *   - 200 + 파일 스트림: 정상
 *   - 404: 요청/파일 없음
 *   - 403: 권한 없음
 *   - 410: 보관 기간 만료 (deleted_at이 존재)
 */
router.get(
  '/:id/items/:itemId/download',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = getCurrentUser(req);
    const requestId = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);

    if (isNaN(requestId) || isNaN(itemId)) {
      sendError(res, '유효하지 않은 요청 또는 항목 ID입니다.', 400, 'INVALID_ID');
      return;
    }

    // 요청 존재 및 소유권 확인
    const request = db.prepare(`
      SELECT requester_id FROM requests WHERE id = ? AND is_deleted = 0
    `).get(requestId) as { requester_id: number } | undefined;

    if (!request) {
      sendError(res, '요청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      return;
    }

    // ad_team은 본인 요청만 다운로드 가능
    if (user.role === 'ad_team' && request.requester_id !== user.id) {
      sendError(res, '본인 요청의 파일만 다운로드할 수 있습니다.', 403, 'FORBIDDEN');
      return;
    }

    // 완료 상태 copy_job 조회 (가장 최근 완료 기준)
    const copyJob = db.prepare(`
      SELECT dest_path, status, completed_at, deleted_at
      FROM copy_jobs
      WHERE request_item_id = ? AND status = 'done'
      ORDER BY completed_at DESC
      LIMIT 1
    `).get(itemId) as {
      dest_path: string;
      status: string;
      completed_at: string;
      deleted_at: string | null;
    } | undefined;

    if (!copyJob) {
      sendError(res, '다운로드 가능한 파일이 없습니다. 복사가 완료되지 않았거나 해당 항목이 없습니다.', 404, 'NOT_FOUND');
      return;
    }

    // 보관 기간 만료 확인
    if (copyJob.deleted_at) {
      sendError(res, '보관 기간이 만료되어 파일이 삭제되었습니다. 필요한 경우 재요청해주세요.', 410, 'FILE_EXPIRED');
      return;
    }

    // 파일 실제 존재 여부 확인 (traversal 검증 포함)
    let filePath: string;
    try {
      filePath = resolveDeliveryPath(copyJob.dest_path);
    } catch {
      sendError(res, '유효하지 않은 파일 경로입니다.', 400, 'INVALID_PATH');
      return;
    }

    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) {
      sendError(res, '파일을 찾을 수 없습니다. 1일 보관 기간이 지나 자동 삭제됐을 수 있습니다.', 404, 'FILE_NOT_FOUND');
      return;
    }

    // 감사 로그 기록
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, 'file_download', 'request_items', ?, ?, ?)
    `).run(user.id, itemId, path.basename(filePath), utcNow());

    // 파일 스트리밍 응답
    const fileName = path.basename(filePath);
    res.setHeader('Content-Type', 'video/x-msvideo');
    res.setHeader('Content-Length', String(stat.size));
    // RFC 5987 인코딩으로 한글/특수문자 파일명 처리
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );

    const stream = fsSync.createReadStream(filePath);
    stream.on('error', (err) => {
      // 스트리밍 도중 에러 — 이미 헤더를 보냈으므로 JSON 에러 응답 불가, 연결 종료
      console.error(`[Download] 파일 스트림 오류 (itemId=${itemId}):`, err);
      res.destroy();
    });
    stream.pipe(res);
  },
);

export default router;
