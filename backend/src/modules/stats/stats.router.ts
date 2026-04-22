/**
 * 통계 라우터 (admin 전용)
 *
 * GET /api/stats/summary            - 전체 요약 수치 (기간 필터 지원)
 * GET /api/stats/monthly            - 월별 요청 항목 건수 (연도별)
 * GET /api/stats/daily              - 일별 요청 항목 건수 (연+월 지정)
 * GET /api/stats/by-channel         - 채널별 요청 항목 건수 (기간 필터 지원)
 * GET /api/stats/by-advertiser      - 광고주별 요청 항목 건수 상위 N개 (기간 필터 지원)
 * GET /api/stats/by-sales-manager   - 영업담당자별 요청 항목 건수 (기간 필터 지원)
 * GET /api/stats/export-csv         - 기간별 전체 데이터 CSV 내보내기
 *
 * 모든 집계는 is_deleted = 0인 요청만 대상으로 한다.
 * 날짜 필터: KST 기준 YYYY-MM-DD → UTC 변환 후 비교
 * 주의: sales_manager는 migration 006 이후 request_items에 위치함
 */

import { Router, Request, Response, IRouter } from 'express';
import db from '../../config/database';
import { sendSuccess } from '../../common/response';
import { requireAuth, requirePermission } from '../../common/auth.middleware';
import { getKstNowParts, kstDateEndToUtc, kstDateStartToUtc } from '../../common/datetime';

const router: IRouter = Router();

// 통계 API는 can_view_stats 권한 필요 (admin은 항상 통과)
router.use(requireAuth, requirePermission('canViewStats'));

/**
 * KST 기준 날짜 문자열(YYYY-MM-DD)을 UTC ISO 문자열로 변환하는 헬퍼
 * - from 날짜: 해당 일의 KST 00:00:00 → UTC
 * - to 날짜:   해당 일의 KST 23:59:59 → UTC
 */
function toUtcFrom(dateStr: string): string {
  return kstDateStartToUtc(dateStr);
}
function toUtcTo(dateStr: string): string {
  return kstDateEndToUtc(dateStr);
}

/**
 * from/to 쿼리 파라미터에서 WHERE 조건 절을 생성하는 헬퍼
 * 반환: { conditions: string[], params: string[] }
 */
function buildDateFilter(
  from?: string,
  to?: string,
  tableAlias = 'r',
): { conditions: string[]; params: string[] } {
  const conditions: string[] = [];
  const params: string[] = [];
  if (from) {
    conditions.push(`${tableAlias}.created_at >= ?`);
    params.push(toUtcFrom(from));
  }
  if (to) {
    conditions.push(`${tableAlias}.created_at <= ?`);
    params.push(toUtcTo(to));
  }
  return { conditions, params };
}

/**
 * GET /api/stats/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 전체 요약 수치 (request_items 기준)
 *
 * 쿼리 파라미터:
 *   from, to: KST 기준 날짜 (선택). 제공 시 해당 기간 내 수치만 집계.
 *             미제공 시 전체 누적 + this_month(이번 달) 함께 반환.
 */
router.get('/summary', (req: Request, res: Response): void => {
  const { from, to } = req.query as { from?: string; to?: string };
  const { conditions, params } = buildDateFilter(from, to);

  const where = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

  const total = (db.prepare(`
    SELECT COUNT(ri.id) AS cnt
    FROM request_items ri
    JOIN requests r ON r.id = ri.request_id
    WHERE r.is_deleted = 0 ${where}
  `).get(...params) as { cnt: number }).cnt;

  const done = (db.prepare(`
    SELECT COUNT(ri.id) AS cnt
    FROM request_items ri
    JOIN requests r ON r.id = ri.request_id
    WHERE r.is_deleted = 0
      AND ri.item_status = 'done'
      ${where}
  `).get(...params) as { cnt: number }).cnt;

  const rejected = (db.prepare(`
    SELECT COUNT(ri.id) AS cnt
    FROM request_items ri
    JOIN requests r ON r.id = ri.request_id
    WHERE r.is_deleted = 0
      AND r.status = 'rejected'
      ${where}
  `).get(...params) as { cnt: number }).cnt;

  const inProgress = (db.prepare(`
    SELECT COUNT(ri.id) AS cnt
    FROM request_items ri
    JOIN requests r ON r.id = ri.request_id
    WHERE r.is_deleted = 0
      AND ri.item_status <> 'done'
      AND r.status <> 'rejected'
      ${where}
  `).get(...params) as { cnt: number }).cnt;

  let thisMonth: number | null = null;
  if (!from && !to) {
    const kstNow = getKstNowParts();
    const thisMonthStart = new Date(`${kstNow.year}-${String(kstNow.month).padStart(2, '0')}-01T00:00:00+09:00`);
    thisMonth = (db.prepare(`
      SELECT COUNT(ri.id) AS cnt
      FROM request_items ri
      JOIN requests r ON r.id = ri.request_id
      WHERE r.is_deleted = 0
        AND r.created_at >= ?
    `).get(thisMonthStart.toISOString()) as { cnt: number }).cnt;
  }

  sendSuccess(res, {
    total,
    done,
    rejected,
    in_progress: inProgress,
    this_month: thisMonth,
    is_filtered: !!(from || to),
  }, '통계 요약 조회 성공');
});

/**
 * GET /api/stats/monthly?year=YYYY
 * 월별 요청 항목 건수 집계
 *
 * 쿼리 파라미터:
 *   year: 연도 (기본값: 올해 KST 기준)
 */
router.get('/monthly', (req: Request, res: Response): void => {
  const kstNow = getKstNowParts();
  const year = parseInt((req.query.year as string) ?? String(kstNow.year), 10);

  const rows = db.prepare(`
    SELECT
      strftime('%m', datetime(r.created_at, '+9 hours')) AS month,
      COUNT(ri.id) AS count
    FROM request_items ri
    JOIN requests r ON r.id = ri.request_id
    WHERE r.is_deleted = 0
      AND strftime('%Y', datetime(r.created_at, '+9 hours')) = ?
    GROUP BY month
    ORDER BY month
  `).all(String(year)) as { month: string; count: number }[];

  const monthly = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    const found = rows.find((r) => r.month === m);
    return { month: m, count: found?.count ?? 0 };
  });

  sendSuccess(res, { year, monthly }, '월별 통계 조회 성공');
});

/**
 * GET /api/stats/daily?year=YYYY&month=MM
 * 일별 요청 항목 건수 집계 (월별 모드에서 사용)
 *
 * 쿼리 파라미터:
 *   year:  연도 (필수)
 *   month: 월 1~12 (필수)
 */
router.get('/daily', (req: Request, res: Response): void => {
  const kstNow = getKstNowParts();
  const year  = parseInt((req.query.year  as string) ?? String(kstNow.year), 10);
  const month = parseInt((req.query.month as string) ?? String(kstNow.month), 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    res.status(400).json({ success: false, message: 'year, month 파라미터가 올바르지 않습니다.' });
    return;
  }

  const lastDay = new Date(year, month, 0).getDate();

  const rows = db.prepare(`
    SELECT
      strftime('%d', datetime(r.created_at, '+9 hours')) AS day,
      COUNT(ri.id) AS count
    FROM request_items ri
    JOIN requests r ON r.id = ri.request_id
    WHERE r.is_deleted = 0
      AND strftime('%Y', datetime(r.created_at, '+9 hours')) = ?
      AND strftime('%m', datetime(r.created_at, '+9 hours')) = ?
    GROUP BY day
    ORDER BY day
  `).all(String(year), String(month).padStart(2, '0')) as { day: string; count: number }[];

  const daily = Array.from({ length: lastDay }, (_, i) => {
    const d = String(i + 1).padStart(2, '0');
    const found = rows.find((r) => r.day === d);
    return { day: d, count: found?.count ?? 0 };
  });

  sendSuccess(res, { year, month, daily }, '일별 통계 조회 성공');
});

/**
 * GET /api/stats/by-channel?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 채널별 요청 항목 건수 집계
 *
 * 쿼리 파라미터:
 *   from, to: KST 기준 날짜 (선택). 미제공 시 전체 기간.
 */
router.get('/by-channel', (req: Request, res: Response): void => {
  const { from, to } = req.query as { from?: string; to?: string };
  const { conditions, params } = buildDateFilter(from, to);
  const dateWhere = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

  const channels = db.prepare(`
    SELECT
      cm.display_name AS channel_name,
      COUNT(ri.id) AS count
    FROM request_items ri
    JOIN requests r ON r.id = ri.request_id
    JOIN channel_mappings cm ON cm.id = ri.channel_mapping_id
    WHERE r.is_deleted = 0 ${dateWhere}
    GROUP BY cm.id, cm.display_name
    ORDER BY count DESC
  `).all(...params) as { channel_name: string; count: number }[];

  sendSuccess(res, { channels }, '채널별 통계 조회 성공');
});

/**
 * GET /api/stats/by-advertiser?limit=N&from=YYYY-MM-DD&to=YYYY-MM-DD
 * 광고주별 요청 항목 건수 상위 N개
 *
 * 쿼리 파라미터:
 *   limit: 조회할 광고주 수 (기본 20, 최대 100)
 *   from, to: KST 기준 날짜 (선택). 미제공 시 전체 기간.
 */
router.get('/by-advertiser', (req: Request, res: Response): void => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? '20', 10), 100);
  const { from, to } = req.query as { from?: string; to?: string };
  const { conditions, params } = buildDateFilter(from, to);
  const dateWhere = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

  const advertisers = db.prepare(`
    SELECT
      ri.advertiser,
      COUNT(ri.id) AS count
    FROM request_items ri
    JOIN requests r ON r.id = ri.request_id
    WHERE r.is_deleted = 0 ${dateWhere}
    GROUP BY ri.advertiser
    ORDER BY count DESC
    LIMIT ?
  `).all(...params, limit) as { advertiser: string; count: number }[];

  sendSuccess(res, { advertisers }, '광고주별 통계 조회 성공');
});

/**
 * GET /api/stats/by-sales-manager?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 영업담당자별 요청 항목 건수 집계
 *
 * 값이 비어 있는 항목(미입력)은 '미입력' 레이블로 묶어서 표시한다.
 *
 * 쿼리 파라미터:
 *   from, to: KST 기준 날짜 (선택). 미제공 시 전체 기간.
 */
router.get('/by-sales-manager', (req: Request, res: Response): void => {
  const { from, to } = req.query as { from?: string; to?: string };
  const { conditions, params } = buildDateFilter(from, to);
  const dateWhere = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

  const salesManagers = db.prepare(`
    SELECT
      CASE
        WHEN ri.sales_manager IS NULL OR ri.sales_manager = '' THEN '미입력'
        ELSE ri.sales_manager
      END AS sales_manager,
      COUNT(ri.id) AS count
    FROM request_items ri
    JOIN requests r ON r.id = ri.request_id
    WHERE r.is_deleted = 0 ${dateWhere}
    GROUP BY sales_manager
    ORDER BY count DESC
  `).all(...params) as { sales_manager: string; count: number }[];

  sendSuccess(res, { sales_managers: salesManagers }, '영업담당자별 통계 조회 성공');
});

/**
 * GET /api/stats/export-csv?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 기간별 요청 전체 데이터 CSV 내보내기
 *
 * - Content-Type: text/csv; charset=utf-8
 * - BOM: \ufeff (UTF-8 BOM, Excel 한글 깨짐 방지)
 * - 날짜 필터: KST 기준 YYYY-MM-DD → UTC 변환
 */
router.get('/export-csv', (req: Request, res: Response): void => {
  const { from, to } = req.query as { from?: string; to?: string };

  const conditions: string[] = ['r.is_deleted = 0'];
  const params: string[] = [];

  if (from) {
    conditions.push('r.created_at >= ?');
    params.push(toUtcFrom(from));
  }
  if (to) {
    conditions.push('r.created_at <= ?');
    params.push(toUtcTo(to));
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  // 요청 항목 단위로 행 구성 (헤더 정보 JOIN)
  const rows = db.prepare(`
    SELECT
      r.id                                                              AS 요청ID,
      datetime(r.created_at, '+9 hours')                               AS 요청일시,
      u_req.display_name                                               AS 요청자,
      ri.sales_manager                                                 AS 영업담당자,
      r.status                                                         AS 요청상태,
      cm.display_name                                                  AS 채널,
      ri.advertiser                                                    AS 광고주,
      ri.broadcast_date                                                AS 방송일자,
      ri.req_time_start                                                AS 시작시간,
      ri.req_time_end                                                  AS 종료시간,
      ri.monitoring_time                                               AS 송출시간,
      ri.item_status                                                   AS 항목상태,
      r.request_memo                                                   AS 요청비고,
      ri.item_memo                                                     AS 항목비고
    FROM requests r
    JOIN request_items ri ON ri.request_id = r.id
    JOIN users u_req ON u_req.id = r.requester_id
    JOIN channel_mappings cm ON cm.id = ri.channel_mapping_id
    ${where}
    ORDER BY r.created_at DESC, ri.sort_order ASC
  `).all(...params) as Record<string, string | number | null>[];

  if (rows.length === 0) {
    // 데이터 없어도 헤더만 포함한 CSV 반환
    const header = '요청ID,요청일시,요청자,영업담당자,요청상태,채널,광고주,방송일자,시작시간,종료시간,송출시간,항목상태,요청비고,항목비고';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="adcheck-export.csv"`);
    res.send('\ufeff' + header + '\n');
    return;
  }

  // CSV 직렬화 (쉼표/줄바꿈 포함 필드는 큰따옴표로 감쌈)
  const headers = Object.keys(rows[0]);
  const escape = (val: string | number | null): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    // CSV 인젝션 방지: =, +, -, @ 로 시작하는 값은 앞에 탭을 추가해 수식으로 해석되지 않도록 함
    if (/^[=+\-@\t\r]/.test(str)) {
      return `\t${str}`;
    }
    // 쉼표, 줄바꿈, 큰따옴표가 포함된 경우 큰따옴표로 감싸기
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvLines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ];

  const csv = '\ufeff' + csvLines.join('\n');   // UTF-8 BOM 포함 (Excel 한글 깨짐 방지)

  const fileName = `adcheck-export${from ? `-${from}` : ''}${to ? `-${to}` : ''}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(csv);
});

export default router;
