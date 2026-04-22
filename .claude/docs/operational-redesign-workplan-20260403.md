# 운영 재설계 작업 계획

> 작성일: 2026-04-03
> 
> 현황: 서비스 직전 단계, 운영 병목 개선 + 웹 기반 다운로드 전환
>
> 핵심 변경: NAS → 서버 로컬 스토리지, 1일 자동 정리, 웹 다운로드, Excel 내보내기

---

## 1. 방향 정리

### 1-1. 현재 병목

**As-Is (현재)**
```
광고팀(ad_team)
  ↓ 구글 시트 작성
대표 담당자
  ↓ 구글 시트 → 엑셀 수동 재입력 + 이미지 첨부 (병목)
메일 전송
  ↓ 운영자
시스템에 재입력
  ↓
Logging Storage → NAS 복사
  ↓ 
사용자가 NAS 웹 별도 접속해서 다운로드
```

**To-Be (목표)**
```
채널 담당자(ad_team)
  ↓ 웹 시스템에 직접 입력
대표 담당자(tech_team)
  ↓ 웹에서 검수/승인/반려
웹 시스템
  ↓
Logging Storage → 서버 로컬 디스크 (자동 복사)
  ↓ (1일 보관)
담당자가 웹 다운로드 버튼으로 받음
  ↓ (다음날 자동 삭제, 필요하면 재요청)
```

### 1-2. 핵심 개선사항

| 항목 | 현재 | 변경 |
|------|------|------|
| 입력 방식 | 메일/구글시트 → 엑셀 재입력 | 웹 시스템 직접 입력 |
| 다운로드 | NAS 별도 웹 접속 | 웹 시스템 다운로드 버튼 |
| 스토리지 | NAS (별도 운영) | 서버 로컬 (시스템 통제) |
| 보관 정책 | 수동 관리 | 1일 자동 정리 |
| 감사 추적 | 메일 기반 | 시스템 이력 기록 |

### 1-3. 역할 정리

코드상 역할은 **변경 없음**. 화면 표시명만 정리.

| 역할 (코드) | 운영 명칭 | 권한 |
|---|---|---|
| `ad_team` | 채널 담당자 | 자신의 요청 입력/조회/다운로드 |
| `tech_team` | 대표 담당자 | 전체 요청 검수, 승인/반려, 전송 관리, Excel 다운로드 |
| `admin` | 시스템 관리자 | 모든 것 |

---

## 2. 기술 아키텍처

### 2-1. 저장소 전환

**현재**
```
env.SHARED_NAS_MOUNT = "/Volumes/광고"
→ copy.service.ts가 여기로 복사
→ 사용자가 NAS 웹 접속해서 다운로드
```

**변경 후**
```
env.LOCAL_DELIVERY_PATH = "backend/data/delivery" (또는 절대 경로)
→ copy.service.ts가 여기로 복사
→ 웹 다운로드 API가 서빙
→ 1일 경과 후 delivery-cleanup.service가 자동 삭제
```

### 2-2. 파일 구조

```
backend/data/delivery/
├── 2026-04-03/
│   ├── 비즈/                      (채널 NAS 폴더명)
│   │   └── CNBC_20260403_140000_1500.avi
│   ├── 스포츠/
│   │   └── ESPN_20260403_165030_1730.avi
│   └── 라이프/
│       └── ETV_20260403_090015_0900.avi
├── 2026-04-04/
│   └── ...
```

- 요청 생성일자 기준 폴더 구성
- 채널별 NAS 폴더명으로 하위 폴더 생성 (기존과 동일)
- 파일명 그대로 유지

### 2-3. 파일 생명주기

```
승인(approved) → 복사 시작(copying)
  ├─ copy_jobs 생성: status=pending, dest_path="/path/to/file"
  ├─ 실제 파일 복사 (Logging → 로컬)
  ├─ copy_jobs 업데이트: status=done, completed_at=NOW
  └─ request/item 상태: done

[보관 기간 (1일)]
  ├─ 사용자 다운로드 가능 (audit_logs 기록)
  ├─ 재다운로드 가능 (파일이 존재하는 한)

[1일 경과]
  ├─ delivery-cleanup 실행
  ├─ 파일 삭제
  ├─ copy_jobs 갱신: deleted_at=NOW, deleted_by='system'
  └─ 사용자 다운로드 불가 (만료 안내)

[필요 시]
  └─ 재요청 → 새로운 copy_jobs 생성 → 다시 복사
```

---

## 3. 영향도 분석

### 3-1. 변경 필요 코드

| 파일 | 변경 내용 | 복잡도 | 우선순위 |
|------|---------|--------|---------|
| `backend/src/config/env.ts` | `LOCAL_DELIVERY_PATH` 추가 | 낮음 | 1 |
| `backend/src/modules/copy/copy.service.ts` | 복사 대상 경로 변경 | 중간 | 1 |
| `backend/src/modules/files/storage-cleanup.service.ts` | NAS → 로컬 경로 수정 | 중간 | 1 |
| `backend/src/common/path-guards.ts` | 로컬 경로 traversal 검증 추가 | 낮음 | 1 |
| `frontend/src/pages/RequestDetailPage.tsx` | 다운로드 버튼 추가 | 중간 | 2 |
| `frontend/src/pages/RequestListPage.tsx` | Excel 다운로드 버튼 추가 | 낮음 | 4 |
| `.env.example` | 새 환경변수 문서화 | 낮음 | 5 |

### 3-2. 신규 구현

| 항목 | 파일 | 내용 | 우선순위 |
|------|------|------|---------|
| 다운로드 API | `backend/src/modules/requests/requests.router.ts` | `GET /api/requests/:id/items/:itemId/download` | 필수 |
| 다운로드 권한 | `backend/src/common/auth.middleware.ts` | requireDownloadPermission() 미들웨어 | 필수 |
| 자동 정리 서비스 | `backend/src/modules/files/delivery-cleanup.service.ts` | 1일 경과 파일 삭제 | 필수 |
| 정리 스케줄러 | `backend/src/index.ts` | 서버 기동 시 + 1시간 간격 | 필수 |
| Excel 내보내기 | `backend/src/modules/requests/requests.router.ts` | `GET /api/requests/export-excel` | 필수 |
| 다운로드 버튼 UI | `frontend/src/pages/RequestDetailPage.tsx` | 항목별 다운로드 + 전체 상태 | 중간 |
| Excel 버튼 UI | `frontend/src/pages/RequestListPage.tsx` | 목록 화면 상단 버튼 | 낮음 |

### 3-3. 변경 없는 코드

```
✓ 요청 등록 (requests.router.ts POST /api/requests)
✓ 요청 목록/상세 조회 (requests.router.ts GET)
✓ 파일 탐색 (files.service.ts)
✓ 파일 매칭 (file-matcher.ts)
✓ 승인/반려/재전송 (requests.service.ts 상태 전이)
✓ 복사 상태 추적 (copy_jobs 테이블 스키마)
✓ 권한 체계 (role, can_copy, can_view_stats)
✓ 감사 로그 구조 (audit_logs 테이블)
✓ 통계 CSV (stats/export-csv 엔드포인트)
```

---

## 4. 작업 계획

### Phase 1: 저장소 전환 (우선순위: 필수)

#### 1-1. 환경변수 설정

**파일**: `backend/src/config/env.ts`

```typescript
// 추가
export const LOCAL_DELIVERY_PATH = process.env.LOCAL_DELIVERY_PATH 
  || 'backend/data/delivery';

// 기존 SHARED_NAS_MOUNT는 당분간 유지 (하위호환)
export const SHARED_NAS_MOUNT = process.env.SHARED_NAS_MOUNT
  || '/Volumes/광고';
```

**파일**: `.env.example`

```
# 로컬 전달 스토리지 경로
LOCAL_DELIVERY_PATH=backend/data/delivery

# (기존 NAS, 당분간 유지)
SHARED_NAS_MOUNT=/Volumes/광고
```

**작업 내용**
- [ ] env.ts에 LOCAL_DELIVERY_PATH 추가
- [ ] .env.example 업데이트
- [ ] 로컬 경로 존재 여부 확인 및 자동 생성 로직 추가 (database.ts 또는 index.ts)

#### 1-2. copy.service.ts 수정

**변경 전**
```typescript
const destPath = joinPathWithinRoot(env.SHARED_NAS_MOUNT, 
  `${nasFolder}/${fileName}`);
```

**변경 후**
```typescript
// 요청 생성일자 기준 폴더 구성
const requestDate = utcToKstDate(request_created_at).split(' ')[0]; // YYYY-MM-DD
const destPath = joinPathWithinRoot(env.LOCAL_DELIVERY_PATH,
  `${requestDate}/${nasFolder}/${fileName}`);
```

**작업 내용**
- [ ] copy.service.ts에서 복사 대상 경로를 로컬 디렉토리로 변경
- [ ] 요청 생성일자 기준 하위 폴더 구성
- [ ] 기존 파일 크기/진행률 로직은 그대로 유지
- [ ] path-guards.ts로 로컬 경로 검증 통과

#### 1-3. path-guards.ts 수정

**추가 내용**
```typescript
// 로컬 전달 경로에 대한 traversal 검증 함수 추가
export function resolveDeliveryPath(relativePath: string): string {
  return resolvePathWithinRoot(env.LOCAL_DELIVERY_PATH, relativePath);
}
```

**작업 내용**
- [ ] resolveDeliveryPath() 함수 추가
- [ ] copy.service.ts에서 사용하도록 수정

---

### Phase 2: 웹 다운로드 (우선순위: 필수)

#### 2-1. 다운로드 API 엔드포인트

**파일**: `backend/src/modules/requests/requests.router.ts`

```typescript
/**
 * GET /api/requests/:id/items/:itemId/download
 * 특정 요청 항목의 복사 완료 파일 다운로드
 * 
 * 권한: 로그인한 사용자
 *   - ad_team: 본인 요청만
 *   - tech_team/admin: 모든 요청
 */
router.get('/:id/items/:itemId/download', 
  requireAuth, 
  async (req: Request, res: Response): Promise<void> => {
    const user = getCurrentUser(req);
    const requestId = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);

    // 권한 검증
    const request = db.prepare(
      'SELECT requester_id FROM requests WHERE id = ?'
    ).get(requestId) as { requester_id: number } | undefined;

    if (!request) {
      sendError(res, '요청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      return;
    }

    // ad_team은 본인 요청만
    if (user.role === 'ad_team' && request.requester_id !== user.id) {
      sendError(res, '접근 권한이 없습니다.', 403, 'FORBIDDEN');
      return;
    }

    // 복사 완료 파일 조회
    const copyJob = db.prepare(`
      SELECT cj.dest_path, cj.status, cj.completed_at, cj.deleted_at
      FROM copy_jobs cj
      WHERE cj.request_item_id = ? AND cj.status = 'done'
      ORDER BY cj.completed_at DESC
      LIMIT 1
    `).get(itemId) as {
      dest_path: string;
      status: string;
      completed_at: string;
      deleted_at: string | null;
    } | undefined;

    if (!copyJob) {
      sendError(res, '다운로드 가능한 파일이 없습니다.', 404, 'NOT_FOUND');
      return;
    }

    if (copyJob.deleted_at) {
      sendError(res, '보관 기간이 만료되어 파일이 삭제되었습니다. 필요한 경우 재요청해주세요.', 410, 'FILE_EXPIRED');
      return;
    }

    // 파일 존재 확인
    const filePath = resolveDeliveryPath(copyJob.dest_path);
    const stat = await fs.stat(filePath).catch(() => null);

    if (!stat || !stat.isFile()) {
      sendError(res, '파일을 찾을 수 없습니다.', 404, 'FILE_NOT_FOUND');
      return;
    }

    // 감사 로그 기록
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, 'file_download', 'request_items', ?, ?, ?)
    `).run(user.id, itemId, path.basename(filePath), utcNow());

    // 파일 스트리밍
    res.setHeader('Content-Type', 'video/x-msvideo');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', 
      `attachment; filename="${path.basename(filePath)}"`);
    
    const stream = fsSync.createReadStream(filePath);
    stream.pipe(res);
  }
);
```

**작업 내용**
- [ ] GET /api/requests/:id/items/:itemId/download 엔드포인트 추가
- [ ] 권한 검증 (ad_team은 본인만, tech_team/admin은 모두)
- [ ] copy_jobs에서 done 상태 파일 조회
- [ ] 파일 존재 여부 확인
- [ ] 파일 만료(deleted_at) 확인
- [ ] 감사 로그 기록 (file_download 액션)
- [ ] 파일 스트리밍 응답

#### 2-2. RequestDetailPage 다운로드 버튼

**파일**: `frontend/src/pages/RequestDetailPage.tsx`

```typescript
// 항목 렌더링 부분에 추가
function renderItemActions(item: RequestItemDetail) {
  const isDone = item.item_status === 'done';
  const isExpired = item.copy_job?.deleted_at !== null;

  return (
    <div className="flex gap-2">
      {isDone && !isExpired && (
        <button
          onClick={() => handleDownload(item.id)}
          className="btn-secondary"
        >
          다운로드
        </button>
      )}
      {isDone && isExpired && (
        <span className="text-xs text-[var(--app-text-soft)]">
          보관 만료
        </span>
      )}
    </div>
  );
}

async function handleDownload(itemId: number) {
  try {
    const response = await api.get(
      `/requests/${requestId}/items/${itemId}/download`,
      { responseType: 'blob' }
    );
    
    const fileName = response.headers['content-disposition']
      ?.split('filename=')[1]?.replace(/"/g, '') || 'download.avi';
    
    const url = window.URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    toast.error('다운로드 실패: ' + (error?.response?.data?.message || error.message));
  }
}
```

**작업 내용**
- [ ] 항목 상태별 렌더링 로직 추가
- [ ] done 상태 + 미만료: 다운로드 버튼 표시
- [ ] done 상태 + 만료: "보관 만료" 텍스트 표시
- [ ] 다운로드 버튼 클릭 → API 호출 → 브라우저 다운로드

---

### Phase 3: 자동 정리 (우선순위: 필수)

#### 3-1. 정리 서비스 구현

**파일**: `backend/src/modules/files/delivery-cleanup.service.ts` (신규)

```typescript
/**
 * 로컬 전달 스토리지 정리 서비스
 * 
 * 1일 경과한 완료 파일을 삭제하고 copy_jobs를 갱신한다.
 */

import fs from 'fs/promises';
import path from 'path';
import db from '../../config/database';
import { env } from '../../config/env';
import { createLogger } from '../../common/logger';
import { utcNow } from '../../common/datetime';
import { resolveDeliveryPath } from '../../common/path-guards';

const log = createLogger('DeliveryCleanup');

const RETENTION_HOURS = 24; // 1일

/**
 * 보관 기간 만료한 파일 삭제
 */
export async function cleanupExpiredDeliveries(): Promise<{ deleted: number; errors: number }> {
  log.info('로컬 전달 스토리지 정리 시작');

  const now = new Date();
  const expiryTime = new Date(now.getTime() - RETENTION_HOURS * 60 * 60 * 1000);

  // 정리 대상: copy_jobs where status='done' AND deleted_at IS NULL AND completed_at < expiryTime
  const jobs = db.prepare(`
    SELECT id, dest_path, request_item_id
    FROM copy_jobs
    WHERE status = 'done'
      AND deleted_at IS NULL
      AND completed_at < ?
    ORDER BY completed_at ASC
  `).all(expiryTime.toISOString()) as Array<{
    id: number;
    dest_path: string;
    request_item_id: number;
  }>;

  let deleted = 0;
  let errors = 0;

  for (const job of jobs) {
    try {
      const filePath = resolveDeliveryPath(job.dest_path);
      
      // 파일 삭제
      await fs.unlink(filePath);
      
      // copy_jobs 갱신
      db.prepare(`
        UPDATE copy_jobs
        SET deleted_at = ?, deleted_by = 'system'
        WHERE id = ?
      `).run(utcNow(), job.id);

      // 감사 로그
      db.prepare(`
        INSERT INTO audit_logs (action, entity_type, entity_id, detail, created_at)
        VALUES ('file_cleanup', 'copy_jobs', ?, ?, ?)
      `).run(job.id, `자동 정리 (보관 기간 만료)`, utcNow());

      deleted++;
      log.info(`파일 삭제: ${job.dest_path}`);
    } catch (err) {
      errors++;
      log.error(`파일 삭제 실패 (job ${job.id}): ${err}`);
    }

    // 빈 디렉토리 정리 (선택)
    try {
      const dirPath = path.dirname(resolveDeliveryPath(job.dest_path));
      const files = await fs.readdir(dirPath);
      if (files.length === 0) {
        await fs.rmdir(dirPath);
      }
    } catch (err) {
      // 디렉토리 삭제 실패는 무시 (파일이 남아있거나 권한 문제)
    }
  }

  log.info(`정리 완료: ${deleted}개 삭제, ${errors}개 오류`);
  return { deleted, errors };
}

/**
 * 로컬 전달 경로 존재 확인 및 자동 생성
 */
export function ensureDeliveryPathExists(): void {
  const dirPath = env.LOCAL_DELIVERY_PATH;
  try {
    // 동기 방식으로 체크 (서버 부팅 시점이므로 OK)
    const fs = require('fs');
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      log.info(`로컬 전달 디렉토리 생성: ${dirPath}`);
    } else {
      log.info(`로컬 전달 디렉토리 확인: ${dirPath}`);
    }
  } catch (err) {
    log.error(`로컬 전달 디렉토리 생성 실패: ${err}`);
    process.exit(1);
  }
}
```

**작업 내용**
- [ ] delivery-cleanup.service.ts 파일 신규 생성
- [ ] cleanupExpiredDeliveries() 함수 구현
- [ ] ensureDeliveryPathExists() 함수 구현
- [ ] 감사 로그 기록 (file_cleanup 액션)

#### 3-2. 스케줄러 등록

**파일**: `backend/src/index.ts`

```typescript
import { ensureDeliveryPathExists, cleanupExpiredDeliveries } from './modules/files/delivery-cleanup.service';

// 서버 기동 시
async function startServer() {
  // ... 기존 코드 ...
  
  // 로컬 전달 경로 확인 및 생성
  ensureDeliveryPathExists();

  // 서버 기동 즉시 1회 정리 실행
  await cleanupExpiredDeliveries().catch(err => {
    log.error('초기 정리 실패:', err);
  });

  // 이후 1시간마다 정기 정리
  setInterval(async () => {
    await cleanupExpiredDeliveries().catch(err => {
      log.error('정기 정리 실패:', err);
    });
  }, 60 * 60 * 1000); // 1시간
}
```

**작업 내용**
- [ ] index.ts에서 ensureDeliveryPathExists() 호출 (부팅 시)
- [ ] cleanupExpiredDeliveries() 초기 실행
- [ ] setInterval 등록 (1시간 간격)

---

### Phase 4: Excel 다운로드 (우선순위: 필수)

#### 4-1. Excel 내보내기 API

**파일**: `backend/src/modules/requests/requests.router.ts`

```typescript
/**
 * GET /api/requests/export-excel?from=YYYY-MM-DD&to=YYYY-MM-DD&status=...
 * 
 * 요청 목록을 Excel(CSV) 형식으로 내보내기
 * 권한: tech_team, admin (can_view_stats는 불필요)
 */
router.get('/export-excel', 
  requireAuth,
  requireRole('tech_team', 'admin'),
  (req: Request, res: Response): void => {
    const { from, to, status } = req.query as Record<string, string>;
    const user = getCurrentUser(req);

    // 날짜 필터
    const conditions: string[] = ['r.is_deleted = 0'];
    const params: string[] = [];

    if (from) {
      conditions.push('r.created_at >= ?');
      params.push(kstDateStartToUtc(from));
    }
    if (to) {
      conditions.push('r.created_at <= ?');
      params.push(kstDateEndToUtc(to));
    }

    // 상태 필터
    if (status) {
      const statuses = status.split(',').map(s => s.trim());
      conditions.push(`r.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    // 데이터 조회 (요청 항목 단위)
    const rows = db.prepare(`
      SELECT
        r.id                    AS '요청ID',
        datetime(r.created_at, '+9 hours')  AS '요청일시',
        u_req.display_name      AS '요청자',
        ri.sales_manager        AS '영업담당자',
        r.status                AS '요청상태',
        cm.display_name         AS '채널',
        ri.advertiser           AS '광고주',
        ri.broadcast_date       AS '방송일자',
        ri.req_time_start       AS '시작시간',
        ri.req_time_end         AS '종료시간',
        ri.monitoring_time      AS '송출시간',
        ri.item_status          AS '항목상태',
        r.request_memo          AS '요청비고',
        ri.item_memo            AS '항목비고'
      FROM requests r
      JOIN request_items ri ON ri.request_id = r.id
      JOIN users u_req ON u_req.id = r.requester_id
      JOIN channel_mappings cm ON cm.id = ri.channel_mapping_id
      ${where}
      ORDER BY r.created_at DESC, ri.sort_order ASC
    `).all(...params) as Record<string, string | number | null>[];

    // CSV 생성 (기존 stats.router.ts 패턴 재사용)
    const headers = ['요청ID', '요청일시', '요청자', '영업담당자', '요청상태', '채널', '광고주', '방송일자', '시작시간', '종료시간', '송출시간', '항목상태', '요청비고', '항목비고'];
    
    const escape = (val: string | number | null): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines = [
      headers.join(','),
      ...rows.map(row => headers.map(h => escape(row[h])).join(',')),
    ];

    const csv = '\ufeff' + csvLines.join('\n'); // UTF-8 BOM

    const fileName = `adcheck-requests${from ? `-${from}` : ''}${to ? `-${to}` : ''}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csv);

    // 감사 로그
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, detail, created_at)
      VALUES (?, 'excel_export', 'requests', ?, ?)
    `).run(user.id, `Excel 내보내기 (${rows.length}행)`, utcNow());
  }
);
```

**작업 내용**
- [ ] GET /api/requests/export-excel 엔드포인트 추가
- [ ] from/to/status 필터 지원
- [ ] CSV 형식으로 변환 (Excel 호환, BOM 포함)
- [ ] 감사 로그 기록 (excel_export 액션)

#### 4-2. RequestListPage Excel 버튼

**파일**: `frontend/src/pages/RequestListPage.tsx`

```typescript
// 목록 상단에 버튼 추가
function renderFilterBar() {
  const { user } = useAuth();
  const isDownloadAllowed = user?.role === 'tech_team' || user?.role === 'admin';

  return (
    <div className="flex justify-between items-center mb-4">
      {/* 기존 필터 UI */}
      <div className="flex gap-2">
        {/* ... 필터 UI ... */}
      </div>

      {/* Excel 다운로드 버튼 */}
      {isDownloadAllowed && (
        <button
          onClick={handleExcelDownload}
          className="btn-primary"
        >
          Excel 다운로드
        </button>
      )}
    </div>
  );
}

async function handleExcelDownload() {
  try {
    // 현재 필터 조건 수집
    const query = new URLSearchParams({
      from: filters.from || '',
      to: filters.to || '',
      status: filters.status?.join(',') || '',
    });

    const response = await api.get(
      `/requests/export-excel?${query}`,
      { responseType: 'blob' }
    );

    const fileName = `adcheck-requests-${new Date().toISOString().split('T')[0]}.csv`;
    const url = window.URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    toast.success('Excel 다운로드 완료');
  } catch (error) {
    toast.error('Excel 다운로드 실패: ' + error.message);
  }
}
```

**작업 내용**
- [ ] RequestListPage에 Excel 다운로드 버튼 추가
- [ ] tech_team, admin에게만 노출
- [ ] 현재 필터 조건을 query parameter로 전달
- [ ] 다운로드 진행 및 오류 처리

---

### Phase 5: 화면 레이블 정리 (우선순위: 낮음)

#### 5-1. 역할 표시명 정리

**파일**: `frontend/src/components/GlobalNav.tsx` 등

```typescript
function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    'ad_team': '채널 담당자',
    'tech_team': '대표 담당자',
    'admin': '관리자',
  };
  return labels[role] ?? role;
}
```

**작업 내용**
- [ ] 역할별 표시명 매핑 유틸 함수 생성
- [ ] GlobalNav, UserManagementPage, 사용자 정보 화면에서 사용
- [ ] 코드상 역할 값(`ad_team`, `tech_team`, `admin`)은 그대로 유지

---

## 5. 스키마 변경

### 5-1. 기존 테이블 (변경 없음)

```
users
├─ id, username, display_name, role, is_active
├─ can_copy, can_view_stats
└─ password_hash, created_at, updated_at

copy_jobs
├─ id, request_item_id, source_path, dest_path
├─ status (pending/copying/done/failed)
├─ deleted_at, deleted_by  ← 기존 컬럼 활용
└─ completed_at, retry_count, error_message, ...

audit_logs
├─ id, user_id, action, entity_type, entity_id, detail, created_at
└─ 새 action 추가: file_download, file_cleanup, excel_export
```

### 5-2. 신규 마이그레이션

마이그레이션 파일 필요 없음. 기존 스키마로 충분.

- `copy_jobs.deleted_at, deleted_by`는 이미 존재 (migration 009)
- `audit_logs`는 유연한 action 구조로 이미 대응 가능

---

## 6. 감사 로그 액션 정의

| 액션 | 설명 | entity_type | entity_id | 기록 위치 |
|------|------|-------------|----------|---------|
| `file_download` | 파일 다운로드 | request_items | itemId | requests.router download 엔드포인트 |
| `file_cleanup` | 보관 기간 만료 파일 삭제 | copy_jobs | jobId | delivery-cleanup.service |
| `excel_export` | Excel 내보내기 | requests | - | requests.router export 엔드포인트 |

---

## 7. 리스크 및 대응

| 리스크 | 영향도 | 대응 |
|--------|--------|------|
| **디스크 용량 부족** | 높음 | 일일 요청 건수 × 평균 파일 크기 추정. 현재 내부 사용이므로 500GB 정도면 충분할 것으로 예상. 1일 자동 정리로 일일 누적량 통제. |
| **대용량 파일 다운로드** | 중간 | 몇 GB 파일도 스트림 응답으로 처리 가능. 초기 버전은 Range 요청(재개) 미지원. 필요하면 추후 추가. |
| **동시 다운로드** | 낮음 | 내부망 소수 사용자이므로 현 단계에서는 병목 우려 없음. 필요 시 다운로드 큐 도입. |
| **파일 존재 여부 레이스 컨디션** | 낮음 | 다운로드 전 파일 존재 확인. 정리 중 다운로드는 거의 발생하지 않을 확률 높음. |
| **기존 NAS 코드 충돌** | 낮음 | LOCAL_DELIVERY_PATH 추가로 양쪽 모두 지원 가능. 당분간 SHARED_NAS_MOUNT 유지. |
| **서비스 직전 단계 변경 부담** | 중간 | copy 대상 경로만 변경, 요청/상태/권한 구조는 불변. 기존 테스트 시나리오 대부분 유효. |

---

## 8. 테스트 계획

### 8-1. 단위 테스트

- [ ] copy.service.ts: 로컬 경로 폴더 구성 테스트
- [ ] delivery-cleanup.service.ts: 1일 경과 파일 정리 테스트
- [ ] path-guards.ts: 로컬 경로 traversal 차단 테스트

### 8-2. 통합 테스트

- [ ] 요청 등록 → 파일 탐색 → 승인 → 로컬 복사 → 다운로드 전체 흐름
- [ ] ad_team 권한: 본인 요청만 다운로드 가능 확인
- [ ] tech_team 권한: 모든 요청 다운로드 가능 확인
- [ ] Excel 내보내기: 필터 조건 적용 확인

### 8-3. E2E 테스트 (수동)

- [ ] 파일 다운로드 성공 및 재다운로드
- [ ] 보관 기간 만료 후 다운로드 불가 확인
- [ ] Excel 다운로드 후 Excel 열기 및 한글 인코딩 확인
- [ ] 감사 로그에 다운로드/Excel 내보내기 기록 확인

---

## 9. 배포 체크리스트

### Phase 1 배포 (저장소 전환)

- [ ] 환경변수 env.ts, .env.example 수정
- [ ] copy.service.ts 수정 및 테스트
- [ ] path-guards.ts 수정 및 테스트
- [ ] 기존 요청 처리 흐름 회귀 테스트
- [ ] 로컬 디렉토리 생성/권한 확인 (macOS Finder 또는 CLI)

### Phase 2 배포 (웹 다운로드)

- [ ] API 엔드포인트 구현 및 단위 테스트
- [ ] RequestDetailPage 버튼 구현 및 UI 테스트
- [ ] 권한 검증 테스트 (ad_team 본인만, tech_team 모두)
- [ ] 감사 로그 기록 확인

### Phase 3 배포 (자동 정리)

- [ ] delivery-cleanup.service.ts 구현 및 단위 테스트
- [ ] index.ts 스케줄러 등록 및 로그 확인
- [ ] 실제 1일 경과 파일 삭제 시뮬레이션
- [ ] copy_jobs 상태 갱신 확인

### Phase 4 배포 (Excel 다운로드)

- [ ] API 엔드포인트 구현 및 필터 테스트
- [ ] RequestListPage 버튼 추가 및 다운로드 테스트
- [ ] Excel 파일 한글 인코딩 확인
- [ ] 감사 로그 기록 확인

### Phase 5 배포 (화면 정리)

- [ ] 역할 표시명 매핑 함수 생성 및 테스트
- [ ] 전체 화면 재확인 (GlobalNav, UserManagement, 사용자 정보)
- [ ] 기존 코드 변경 최소 확인

---

## 10. 일정 예상

| Phase | 내용 | 소요 시간 | 우선순위 |
|-------|------|---------|---------|
| 1 | 저장소 전환 | 1일 | 필수 |
| 2 | 웹 다운로드 | 1.5일 | 필수 |
| 3 | 자동 정리 | 0.5일 | 필수 |
| 4 | Excel 다운로드 | 1일 | 필수 |
| 5 | 화면 정리 | 0.5일 | 낮음 |
| 테스트 및 안정화 | 전 Phase 통합 테스트 | 1일 | 필수 |
| **합계** | | **5.5일** | |

---

## 11. 문서 업데이트

- [ ] CLAUDE.md: 저장소 구조 변경 반영
- [ ] HOW_TO_RUN.md: LOCAL_DELIVERY_PATH 환경변수 설명 추가
- [ ] project-status.md: 현재 상태 업데이트
- [ ] db-schema.md: copy_jobs 삭제 관련 컬럼 설명 갱신
- [ ] 운영 매뉴얼: 다운로드 기능, Excel 내보내기 기능 설명 추가

---

## 12. 향후 개선 사항 (미포함)

- Range 요청 (다운로드 재개) 지원
- 동시 다운로드 큐 관리
- 파일 압축 (여러 항목 ZIP)
- 다운로드 속도 제한
- S3 같은 외부 스토리지 지원

---

**작성**: 2026-04-03  
**상태**: 대기 중 (승인 후 Phase 1 착수)  
**담당자**: -

