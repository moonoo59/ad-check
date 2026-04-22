# 버그 점검 보고서

> 작성일: 2026-04-06  
> 점검 방법: 5개 에이전트 병렬 코드 정적 분석  
> 점검 범위: 전체 기능 (사용자 플로우 기준, 단계 실패 연쇄 포함)
> 
> **수정 완료일: 2026-04-06**  
> Critical 4건 ✅ / Major 6건 ✅ (M-2 제외) / Minor 2건 ✅ (m-1, m-2 제외)

---

## 점검 영역

| 에이전트 | 담당 영역 |
|---|---|
| #1 | 인증 / 사용자 관리 (로그인, 세션, 비밀번호, 권한) |
| #2 | 요청 등록 / 목록 / 상세 조회 |
| #3 | 파일 탐색 / 매칭 알고리즘 / 복사 / 자동 정리 |
| #4 | 승인 / 반려 / 다운로드 / 재전송 / 오전송 수정 |
| #5 | 채널 매핑 / 감사 로그 / 통계 / Excel 내보내기 |

---

## 🔴 Critical — 즉시 수정 필요 (4건)

### C-1. 비밀번호 변경 후 세션 강제 종료 없음 ✅ 수정 완료 (2026-04-06)

- **파일**: `backend/src/modules/auth/auth.router.ts:172-184`
- **문제**: `changePassword()` 호출 후 `req.session.destroy()` 또는 `req.session.regenerate()`를 호출하지 않음. 비밀번호를 변경해도 기존 세션이 최대 8시간 유효하게 유지됨.
- **영향**: 타인 PC에서 세션이 탈취된 상태라면, 비밀번호를 바꿔도 공격자 세션이 살아있음.
- **재현 경로**: 비밀번호 변경 → 로그아웃 안 함 → 다른 브라우저에서 기존 쿠키로 접근 → 성공
- **수정 내용**: changePassword 성공 콜백 내에서 `req.session.regenerate()` 호출. 클라이언트는 재로그인 안내 메시지 수신.

---

### C-2. 복사 진행 중(copying) 파일 선택 변경 가능 ✅ 수정 완료 (2026-04-06)

- **파일**: `backend/src/modules/requests/requests.service.ts:393`
- **문제**: `selectFile()` 함수가 `item.item_status !== 'done'` 만 체크하여, `copying` 상태인 항목도 파일 선택 변경이 가능함. 프론트엔드에서만 UI 레벨로 차단.
- **영향**: API 직접 호출 시 복사 진행 중 파일 대상이 바뀌어 복사 결과와 DB 기록이 불일치함.
- **재현 경로**: 승인 → 복사 시작(copying) → `PATCH /api/requests/:id/items/:itemId/select-file` 직접 호출 → 다른 파일로 교체 → 복사 완료 파일과 DB 기록 불일치
- **수정 내용**: `selectFile()` 내부에서 `item_status === 'copying'`도 거부 조건에 추가.

---

### C-3. copying 상태에서 재시도(retry-copy) API 차단 안 됨 ✅ 수정 완료 (2026-04-06)

- **파일**: `backend/src/modules/requests/requests.service.ts:558`
- **문제**: `prepareForRetryCopy()`의 허용 상태 목록 `['failed', 'approved', 'editing']`에 `'copying'`이 없으나, 실제로 `copying` 상태에서 호출 시 400 반환되지 않음. 비동기 복사 중 재시도 요청이 연속으로 들어오면 새 `copy_job`이 중복 생성될 수 있음.
- **영향**: 동일 파일이 여러 번 복사되어 로컬 스토리지 낭비, copy_job 레코드 중복.
- **재현 경로**: 승인 → 복사 시작 → 복사 완료 전 `POST /api/requests/:id/retry-copy` 반복 호출
- **수정 내용**: `prepareForRetryCopy()` 시작 부분에 `request.status === 'copying'` 명시 차단 조건 추가. 명확한 에러 메시지 반환.

---

### C-4. 복사 실패 후 재시도 경로 불명확 ✅ 수정 완료 (2026-04-06)

- **파일**: `backend/src/modules/copy/copy.service.ts:82-96`
- **문제**: 복사 실패 시 `item_status`가 변경되는데, 재시도 시 실행되는 쿼리가 `item_status = 'approved'` 조건으로 항목을 조회하는 구조라면 실패한 항목이 0건으로 조회될 수 있음.
- **영향**: 실패한 항목을 재복사할 수 없는 상황 발생.
- **재현 경로**: 승인 → 복사 실패 → 재시도 버튼 클릭 → 재시도 쿼리에서 해당 항목 미조회 → 복사 0건 실행
- **수정 내용**: `executeCopyJobs()` 조회 쿼리를 `item_status IN ('approved', 'failed')`로 수정. 안전망으로 `failed` 항목도 복사 대상에 포함.

---

## 🟠 Major — 중요 수정 권고 (7건)

### M-1. 새 비밀번호 confirm 백엔드 검증 부재 ✅ 수정 완료 (2026-04-06)

- **파일**: `backend/src/modules/auth/auth.router.ts:154-157`
- **문제**: `POST /api/auth/change-password` 요청 body가 `{ current_password, new_password }` 2개 필드만 받음. confirm 필드를 받지 않아 프론트 검증 우회 시 확인 입력 검증이 불가능함.
- **영향**: 프론트를 우회하고 API 직접 호출 시 오타가 있는 비밀번호로 변경 가능.
- **수정 내용**: 백엔드 `new_password_confirm` 필드 추가 및 일치 검증. `apiService.ts` 시그니처 확장, `ChangePasswordPage.tsx`에서 confirm 값 전송 추가.

---

### M-2. 파일 탐색 비동기 실패 시 사용자 알림 없음

- **파일**: `backend/src/modules/requests/requests.router.ts:107-111`
- **문제**: 요청 등록 후 `201` 응답을 먼저 보내고, `setImmediate()`로 파일 탐색을 백그라운드 실행. 탐색이 실패해 `status='failed'`로 전환되어도 사용자는 이미 성공 메시지를 받은 상태.
- **영향**: 사용자가 요청이 등록됐다고 인식한 뒤, 상세 화면에 들어가야만 실패 상태를 확인할 수 있음.
- **재현 경로**: Logger Storage 미마운트 상태에서 요청 등록 → 201 성공 응답 → 상세 화면에서 failed 상태 확인
- **권장 수정**: 상세 화면에서 `status === 'failed'`인 경우 명확한 실패 배너 표시. 또는 요청 등록 직후 폴링으로 탐색 상태 확인.

---

### M-3. selectFile() 권한 검증 불일치 ✅ 수정 완료 (2026-04-06)

- **파일**: `backend/src/modules/requests/requests.service.ts:370-378`, `backend/src/modules/requests/requests.router.ts`
- **문제**: 라우터에서는 `requirePermission('canCopy')`만 체크하고, 서비스 함수 내부에서는 role도 함께 체크. `ad_team`에게 `can_copy=1`이 부여되면 파일 선택 API를 호출할 수 있음.
- **영향**: 권한 설정 오류 시 광고팀 사용자가 파일을 직접 선택/변경 가능.
- **수정 내용**: `PATCH /items/:itemId/select-file` 라우터에 `requireRole('tech_team', 'admin')` 추가. 라우터+서비스 이중 차단 완성.

---

### M-4. 복사 실패 시 불완전 파일 미정리 ✅ 수정 완료 (2026-04-06)

- **파일**: `backend/src/modules/copy/copy.service.ts:265-266`
- **문제**: 복사 도중 오류 발생 시 `destPath`에 부분 복사된 파일이 남음. 정리 로직 없음.
- **영향**: 로컬 스토리지에 불완전한 파일 누적. 재시도 시 덮어쓰기 과정에서 디스크 부족·권한 오류 가능.
- **수정 내용**: catch 블록에 `destPath` 파일 존재 시 `fs.unlink()` 삭제 처리 추가. 삭제 실패는 경고 로그만 남기고 진행.

---

### M-5. 복사 실패 시 progress_bytes 미초기화 ✅ 수정 완료 (2026-04-06)

- **파일**: `backend/src/modules/copy/copy.service.ts:301-327`
- **문제**: 복사 실패 시 `status='failed'`와 에러 메시지만 기록하고, `progress_bytes`는 마지막 값으로 남음.
- **영향**: 실패한 항목의 진행률 표시가 부정확 (예: 75% 완료처럼 보임).
- **수정 내용**: catch 블록 `UPDATE copy_jobs`에 `progress_bytes = 0` 추가. M-4 수정과 함께 동일 블록에서 처리.

---

### M-6. approveRequest() 내부 상태 재검증 없음 ✅ 수정 완료 (2026-04-06)

- **파일**: `backend/src/modules/requests/requests.service.ts:675`
- **문제**: `approveRequest()` 함수가 현재 `request.status`를 확인하지 않고 무조건 `UPDATE` 실행. `validateApproval()`이 사전에 막아주지만, 함수를 단독으로 호출하는 경로에서는 취약.
- **영향**: 미래 코드 추가 시 잘못된 상태에서 승인 가능성.
- **수정 내용**: `approveRequest()` 내부에서 `status === 'search_done'` 검증 추가. 상태 불일치 시 false 반환.

---

### M-7. CSV 인젝션 취약점 ✅ 수정 완료 (2026-04-06)

- **파일**: `backend/src/modules/requests/requests.router.ts:234-241`, `backend/src/modules/stats/stats.router.ts:356-364`
- **문제**: `escapeCell()` 함수가 쉼표·줄바꿈·큰따옴표만 처리하고, `=`, `+`, `-`, `@`로 시작하는 값은 이스케이프하지 않음. Excel에서 수식으로 해석될 수 있음.
- **영향**: 광고주명·채널명 등에 악의적인 수식(`=cmd|'/c calc'` 등)이 입력되면 Excel 파일을 열 때 실행될 수 있음.
- **재현 경로**: 광고주 이름을 `=1+1`로 요청 등록 → Excel 내보내기 → 파일 열기 → 셀에서 수식 실행
- **수정 내용**: requests.router.ts `escapeCell()` 및 stats.router.ts `escape()` 양쪽에 `/^[=+\-@\t\r]/` 패턴 체크 추가. 해당 문자로 시작하면 앞에 탭 삽입.

---

## 🟡 Minor — 개선 권고 (4건)

### m-1. 다운로드/자동정리 race condition

- **파일**: `backend/src/modules/files/delivery-cleanup.service.ts:86-98`
- **문제**: 자동 정리가 파일을 임시 경로로 이동하는 도중 다운로드 요청이 오면 `ENOENT` 에러 발생.
- **영향**: 사용자가 다운로드 클릭 시 간헐적으로 "파일을 찾을 수 없습니다" 오류.
- **권장 수정**: 다운로드 API에서 파일 존재 확인 후 404 응답 시 "파일이 자동 삭제됐을 수 있습니다" 안내 메시지 추가.

---

### m-2. 1일 경과 판단의 KST 자정 미적용

- **파일**: `backend/src/modules/files/delivery-cleanup.service.ts:50`
- **문제**: `Date.now() - 24 * 60 * 60 * 1000`은 정확히 24시간 전 UTC 기준. KST 자정(00:00) 기준 "하루 경과"와 최대 9시간 차이가 발생할 수 있음.
- **영향**: 한국 시간 기준 하루가 지났어도 삭제되지 않거나, 반대로 기대보다 일찍 삭제될 수 있음.
- **권장 수정**: 운영 맥락상 "정확히 24시간"이 맞다면 현행 유지. KST 자정 기준이 필요하다면 `datetime.ts`의 KST 유틸로 경계를 계산.

---

### m-3. 요청 내보내기 빈 데이터 처리 누락 ✅ 수정 완료 (2026-04-06)

- **파일**: `backend/src/modules/requests/requests.router.ts:244-247`
- **문제**: `stats.router.ts`와 달리 `rows.length === 0` 체크 없이 헤더만 있는 CSV를 응답. 코드 간 일관성 부재.
- **영향**: 실제 동작 문제는 없으나, 빈 파일 다운로드 시 사용자 혼란 가능.
- **수정 내용**: `rows.length === 0` 조기 반환 추가. 헤더만 포함한 CSV 응답으로 stats.router.ts와 동일한 패턴으로 통일.

---

### m-4. 감사 로그 날짜 필터 유효성 검증 부재 ✅ 수정 완료 (2026-04-06)

- **파일**: `backend/src/modules/audit/audit.router.ts:56-62`
- **문제**: `from`, `to` 파라미터에 잘못된 날짜 포맷(`2024-13-01` 등)이 들어와도 검증 없이 쿼리에 전달됨. `Invalid Date`가 SQL로 들어갈 수 있음.
- **영향**: 쿼리 오류 또는 예기치 않은 결과 반환.
- **수정 내용**: `/^\d{4}-\d{2}-\d{2}$/` 정규식 + `Date.parse()` 유효성 검증 추가. 오류 시 400 응답. `sendError` 임포트도 추가.

---

## ✅ 정상 확인 항목

| 영역 | 확인 항목 |
|---|---|
| 로그인 | session fixation 방지 (regenerate), 타이밍 공격 방지 (동일 에러 메시지), 레이트 리밋 (IP/계정/조합) |
| 세션 | 매 요청마다 DB 재조회, 비활성 계정 즉시 차단, 401 시 자동 로그인 리디렉션 |
| 사용자 관리 | 비밀번호 해시 응답 미포함, admin 자신 비활성화 차단 |
| 요청 등록 | 필수 필드 백엔드 검증, FK 검증, monitoring_time 형식 검증 |
| 요청 목록 | KST 날짜 필터, ad_team 권한 분리, 페이지네이션 변조 방어, SQL injection 방지 (화이트리스트) |
| 요청 상세 | 소유권 검증, N+1 쿼리 배치 처리, 상태 전이 유효성 검증 |
| 반려 | 사유 필수 (최소 5자), done 상태 반려 차단 |
| 다운로드 | 권한 검증, 파일 존재 확인, path traversal 방지, Content-Disposition RFC 5987 인코딩 |
| 파일 매칭 | 자정 넘김 +1일 처리, 점수 0~100 범위, 채널 매핑 JOIN 적용, 잘못된 파일명 파싱 오류 처리 |
| 채널 매핑 | 중복 방지, 삭제 대신 비활성화로 참조 무결성 유지, 백엔드 admin 권한 이중 검사 |
| 감사 로그 | 민감 정보 미기록, 삭제 API 미노출 |
| 통계 | KST 기준 집계 (+9시간 변환), 빈 기간 처리, 에러 배너 표시 |

---

## 수정 현황 (2026-04-06 완료)

```
✅ 완료
  C-1 비밀번호 변경 세션 처리 → session.regenerate() 추가
  C-2 복사 중 파일 선택 변경 → copying 상태 차단
  C-3 copying 상태 재시도 중복 → 명시 차단 조건 추가
  C-4 재시도 경로 item_status 조건 → IN ('approved', 'failed') 수정
  M-1 새 비밀번호 confirm 백엔드 검증 → new_password_confirm 필드 추가
  M-3 selectFile 권한 불일치 → 라우터에 requireRole 이중 차단 추가
  M-4 복사 실패 파일 미정리 → catch 블록 fs.unlink 추가
  M-5 progress_bytes 미초기화 → 실패 업데이트 시 0 초기화 추가
  M-6 approveRequest 상태 재검증 → 내부 status 체크 추가
  M-7 CSV 인젝션 → escapeCell/escape 수식 문자 앞 탭 삽입
  m-3 requests export 빈 데이터 → rows.length === 0 조기 반환
  m-4 감사 로그 날짜 검증 → YYYY-MM-DD 형식 + 유효성 400 응답

⏸ 미수정 (프론트엔드 개선 사항)
  M-2 탐색 실패 알림 → 상세 화면 failed 배너 강화 (기능 동작에 영향 없음)
  m-1 다운로드/자동정리 race condition → 404 안내 메시지 개선 (간헐적 오류)
  m-2 1일 경과 KST 자정 미적용 → 현행 24시간 기준 유지 결정 시 보류
```

---

## 관련 문서

- 오픈 버그/리스크 원본: `./comprehensive-audit-roadmap-20260324.md`
- 프로젝트 현재 상태: `./project-status.md`
