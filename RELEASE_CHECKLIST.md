# 광고 증빙 요청 시스템 — 출시 전 체크리스트

## 1. 정적 검증

```bash
pnpm verify:static
```

- `pnpm lint`
- `pnpm build`

## 2. 앱 생성

```bash
export PUBLIC_BASE_URL=http://adcheck.tech.net
pnpm create-app
```

- `.app` 번들 생성 성공
- Finder/Dock에서 커스텀 앱 아이콘 표시 확인
- 제어센터 창 표시 확인
- 제어센터에서 `서버 시작` 성공 후 브라우저가 `http://localhost:4000` 으로 열림
- 제어센터에 공용 접속 주소, DB 경로, 로그 경로, 최근 로그가 표시됨
- 내부망 사용자는 번들에 저장된 `PUBLIC_BASE_URL` 주소로 접속 가능

## 3. 헬스체크

```bash
curl http://localhost:4000/api/health
```

- `server: ok`
- `db: ok`
- `public_base_url` 값이 운영 공유 주소와 일치

## 4. 핵심 수동 스모크

- `admin` 로그인
- 사용자 매뉴얼에서 접속 주소/헬스체크 주소 표시 확인
- `ad_team` 회원가입 신청 또는 로그인
- 요청 등록 → 목록/상세 조회
- `tech_team` 승인/반려/재시도 흐름 확인
- `admin` 채널 관리, 사용자 관리, 통계, 감사 로그 접근 확인
- 서버 재시작 후 세션 만료 안내와 재로그인 확인

## 5. 운영 점검

- Logger Storage 마운트 확인: `/Volumes/data`
- DB 백업 스크립트 실행 확인
- 로그 파일 확인: `~/Library/Application Support/AdCheck/logs/app-YYYY-MM-DD.log`
- 포트 4000 충돌 시 기존 프로세스 정리 가능 여부 확인
- 제어센터 `서버 중지`, `서비스 열기`, `전체 로그 열기`, `서버 종료` 버튼 동작 확인
