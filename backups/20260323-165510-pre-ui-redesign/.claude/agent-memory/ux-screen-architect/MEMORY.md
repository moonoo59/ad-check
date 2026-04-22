# UX Screen Architect - 프로젝트 메모리

## 프로젝트: ad-check (광고 증빙 요청 자동화 시스템)

### 확립된 색상 팔레트 (변경 금지)
- green: 성공/완료/활성 (done, approved, is_active=true)
- red: 오류/실패/차단 (failed, rejected, 마운트 해제)
- yellow: 경고/낮은 신뢰도 (match_score < 60, 주의 상태)
- gray: 중립/대기/비활성 (pending, inactive)
- blue: 진행 중/처리 중 (searching, copying)
- Primary CTA: `bg-blue-600 text-white` 단 하나

### 확립된 상태값 한글 레이블
| DB 값 | 한글 |
|-------|------|
| pending | 대기 중 |
| searching | 탐색 중 |
| search_done | 탐색 완료 |
| failed | 탐색 실패 |
| approved | 승인됨 |
| copying | 복사 중 |
| done | 완료 |
| rejected | 반려 |

### 핵심 설계 결정사항
- 데스크톱 전용 (1280px 이상), 모바일 반응형 없음
- ad_team 역할: 본인 요청만 조회 (서버 사이드 강제)
- done 상태 항목 재승인/재복사 차단 (서버 400 + 클라이언트 UI 비활성)
- match_score 60 미만: 선택 가능하되 승인 시 추가 확인 다이얼로그
- 채널 매핑 삭제 없음 — is_active 토글로만 관리
- 인라인 수정 패턴 (모달 없이 행 내 편집) — 채널 매핑 화면에서 사용

### 공통 컴포넌트 16개 (ux-screen-design.md 참조)
StatusBadge, PageHeader, ConfirmDialog, ToastMessage, ChannelDropdown,
FilterBar, EmptyState, LoadingRow, ErrorBanner, InfoCard, SideDrawer,
MatchScoreBadge, MountStatusCard, GlobalNav, FileSizeDisplay, TimeRangeDisplay

### 설계 문서 위치
`.claude/docs/ux-screen-design.md`
