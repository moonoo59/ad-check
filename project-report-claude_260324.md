모든 7개 에이전트의 결과를 수집 완료했습니다. 종합 보고서를 작성합니다.

프로젝트 전체 점검 종합 보고서
프로젝트: ad-check (방송 광고 증빙 요청 자동화 시스템)
점검 일자: 2026-03-24
점검 범위: 전체 (backups/ 제외)
투입 에이전트: 7개 (시스템 무결성, 백엔드, 프론트엔드, DB 스키마, 인프라, UX, 문서)

전체 이슈 통계
심각도	건수
Critical	16
Warning	42
Info	26
Critical 이슈 (즉시 수정 필요)
보안 (최우선)
#	영역	파일	내용
1	BE	requests.service.ts:198	ad_team 목록 격리 미적용 — _currentUserRole 파라미터를 사용하지 않아 모든 사용자가 전체 요청 열람 가능
2	BE	requests.service.ts:271	ad_team 상세 격리 미적용 — 타인 요청 ID 직접 입력으로 상세 정보 접근 가능
3	BE	auth.router.ts:37	세션 destroy 경쟁 조건 — req.session.destroy() 비동기 완료 전 새 세션 데이터 기록
데이터 무결성
#	영역	파일	내용
4	DB	마이그레이션 전체 + 서비스 코드	타임스탬프 localtime/UTC 혼재 — DB DEFAULT는 KST, 앱 코드는 UTC, audit_logs는 KST → 최대 9~18시간 오차
5	DB	database.ts:119	FK OFF 마이그레이션 후 무결성 미검증 — PRAGMA foreign_key_check 누락
6	BE	requests.service.ts:628	복사 재시도 감사 로그 user_id = NULL — 행위자 추적 불가
7	BE	requests.service.ts:779	파일 삭제-DB 트랜잭션 원자성 미보장 — 파일 삭제 성공 후 DB 실패 시 불일치
인프라/빌드
#	영역	파일	내용
8	Infra	create-app.sh:184	프로덕션 앱에서 pnpm dev 실행 — 개발 서버를 운영에 사용
9	Infra	create-app.sh:33	빌드 단계 누락 — pnpm build 없이 이전 산출물로 앱 생성
10	Infra	backup-db.sh:63	WAL 모드 백업 불안전 — 별도 cp로 DB+WAL 복사 시 시점 불일치 → 복원 시 손상 가능
11	Infra	electron/main.ts:72	SESSION_SECRET 하드코딩 — 소스에 세션 서명 키 고정 문자열
기능 논리
#	영역	파일	내용
12	FE	RequestDetailPage.tsx:298	match_score === 100 강제 — 수동 파일 선택(100점 미만)이 있어도 승인 버튼 비활성화
13	BE	requests.service.ts:650	approveRequest 전체 항목 무조건 approved 덮어쓰기 — done/failed 상태도 초기화됨
문서/코드 불일치
#	영역	파일	내용
14	DOC	project-status.md	마운트 모듈 "완료"로 기록, 실제 미존재
15	DOC	db-schema.md	7개 마이그레이션(003~009) 미반영 — 15건+ 스키마 불일치
16	FE	RequestDetailPage, RequestNewPage	normalizeTimeInput + TIME_RANGE_OPTIONS 완전 중복 정의
Warning 이슈 요약 (카테고리별)
보안 (7건)
세션 고정 공격 방지(session.regenerate) 미적용
로그인 Rate Limiting 없음
Path Traversal 검증 없음 (file-matcher.ts:223)
SESSION_SECRET 기본값 사용 시 경고 없음
express.json() 본문 크기 제한 미명시
host: true로 모든 인터페이스에 Vite 개발 서버 노출
electron/dist/ gitignore 누락
데이터/DB (8건)
resend_logs FK 참조 액션 미지정
request_items.item_status CHECK에 editing 누락
broadcast_date/시간 필드 포맷 DB 레벨 검증 없음
deleteRequest에서 deleted_at 미기록
seedDefaultUsers 비동기 실행 레이스 컨디션
UNIQUE 컬럼에 중복 인덱스 2건
audit_logs action 코드 — 문서에 없는 11개 사용, 사용 안 하는 6개 기재
백엔드 로직 (7건)
N+1 쿼리 (getRequestDetail, validateApproval, prepareForRetryCopy)
bcrypt.hashSync / fs.appendFileSync 동기 블로킹
stats.router.ts 표준 응답 포맷 미사용
channels.service.ts 채널 수정 시 audit_logs 미기록
로그인/로그아웃 시 audit_logs 미기록
에러 메시지 기반 HTTP 상태코드 결정
프론트엔드 (10건)
window.confirm() 2곳 — ConfirmDialog 미사용
RequestDetailPage 1,122줄 — 분리 필요
날짜 포맷 함수 3개 파일 중복
ROLE_LABELS 2개 파일 중복
axios 에러 타입 캐스팅 4곳 반복
shadcn/ui vs 커스텀 클래스 혼재
로딩 상태 표현 불일치 (LoadingRow vs 텍스트)
401 세션 만료 시 자동 리다이렉트 없음
ad_team에게 "재전송 요청" 버튼 노출
날짜 범위 역전(from > to) 방어 없음
UX/접근성 (6건)
SideDrawer 포커스 트랩 없음
UserManagementPage 비밀번호 모달 — Radix Dialog 미사용
/requests/:id에서 네비게이션 현재 위치 미강조
관리자 메뉴 드롭다운 활성 상태 미유지
AuditLogPage 자동 조회 + 수동 검색 중복
승인 버튼 비활성화 이유 tooltip에만 존재
인프라 (4건)
TypeScript 버전 불일치 (백엔드 ^5.5.2, 프론트엔드 ~5.9.3)
@types/node 버전 불일치 (백엔드 20.x, 프론트엔드 24.x)
start.sh — sleep 3 고정 대기로 브라우저 열기
Electron userData 경로가 앱 이름에 의존
잘 된 점
SQL 인젝션 방어 — 파라미터 바인딩, SORT_MAP 화이트리스트 일관적 사용
XSS 방어 — dangerouslySetInnerHTML 미사용, React JSX 텍스트 렌더링
한글 주석 — 모든 모듈에서 CLAUDE.md 원칙 잘 준수
모듈 구조 — modules/{기능}/{기능}.service.ts|router.ts 패턴 일관
표준 API 응답 — sendSuccess/sendError 전체적으로 준수
AuthContext — 세션 확인 → isLoading → 라우트 보호 흐름 명확
공통 컴포넌트 — ErrorBanner, EmptyState, LoadingRow, ConfirmDialog 등 체계적
URL 필터 동기화 — RequestListPage 필터가 URL 쿼리에 반영
폴링 cleanup — useEffect cleanup에서 interval 올바르게 정리
환경변수 일관성 — .env.example과 env.ts 기본값 일치
수정 우선순위 권장
1순위: 보안 (즉시)
ad_team 데이터 격리 적용 (#1, #2)
세션 destroy/regenerate 경쟁 조건 수정 (#3)
match_score === 100 강제 조건 완화 (#12)
2순위: 데이터 무결성 (이번 주)
타임스탬프 UTC 통일 (#4)
감사 로그 user_id 누락 수정 (#6)
approveRequest 상태 덮어쓰기 조건 추가 (#13)
deleteRequest에서 deleted_at 기록
3순위: 인프라 안정성 (이번 주)
create-app.sh에 pnpm build 추가 (#9)
backup-db.sh → VACUUM INTO 방식 (#10)
SESSION_SECRET 하드코딩 제거 (#11)
4순위: 코드 품질 (단기)
중복 코드 통합 (normalizeTimeInput, TIME_RANGE_OPTIONS, 날짜 포맷, ROLE_LABELS)
window.confirm() → ConfirmDialog 교체
N+1 쿼리 최적화
동기 블로킹(hashSync, appendFileSync) → 비동기
5순위: 문서 현행화 (단기)
project-status.md 마운트 모듈 상태 정정
db-schema.md 마이그레이션 003~009 반영
audit_logs action 코드 목록 동기화
수정 작업을 시작할까요? 우선순위별로 진행하거나, 특정 이슈를 먼저 처리할 수도 있습니다.

지금 등록제출을 해도 에러가 나오는데, 이것도 반영되어 있을까?
현재 오류 메시지를 확인해야 정확히 파악할 수 있습니다. RequestNewPage의 제출 로직을 직접 확인해보겠습니다.

Grep "onSubmit|handleSubmit|createRequest|submitRequest" (in /Users/admin/ad-check/ad-check/frontend/src/pages/RequestNewPage.tsx)
50 lines of output
Read RequestNewPage.tsx (lines 119-178)
Grep "createRequest" (in /Users/admin/ad-check/ad-check/frontend/src/lib/apiService.ts)
17 lines of output
Grep "POST.*requests|createRequest|router\.post" (in /Users/admin/ad-check/ad-check/backend/src/modules/requests/requests.router.ts)
154 lines of output
Read requests.router.ts (lines 46-95)
Grep "monitoring_time|req_time|broadcast_date" (in /Users/admin/ad-check/ad-check/frontend/src/pages/RequestNewPage.tsx)
61 lines of output
Read RequestNewPage.tsx (lines 389-468)
Grep "normalizeTimeInput" (in /Users/admin/ad-check/ad-check/frontend/src/pages/RequestNewPage.tsx)
15 lines of output
Read RequestNewPage.tsx (lines 66-95)
버그를 찾았습니다. 점검 보고서에 반영되지 않은 별도 버그입니다.

문제: normalizeTimeInput이 검증에만 사용되고, 실제 제출값에는 적용되지 않음

RequestNewPage.tsx:442에서:


validate: (value) => !!normalizeTimeInput(value) || 'HH:MM (24시간)',
// 검증만 통과시킴 — 정규화된 값을 필드에 쓰지 않음
RequestNewPage.tsx:129에서:


monitoring_time: item.monitoring_time,  // 원본값(예: "1311")을 그대로 전송
백엔드(requests.router.ts:84)는:


!/^\d{2}:\d{2}(:\d{2})?$/.test(item.monitoring_time)  // "1311" → 검증 실패
재현 시나리오: 1311처럼 콜론 없이 입력 → 프론트 검증은 통과 → 백엔드에서 형식 오류

수정 방법: onSubmit에서 정규화 적용이 필요합니다:


monitoring_time: normalizeTimeInput(item.monitoring_time) ?? item.monitoring_time,