# 광고 증빙 요청 시스템 — 실행 방법

## 앱 실행 (권장 — 운영용)

바탕화면 또는 `/Applications` 의 **광고증빙요청시스템** 아이콘을 더블클릭합니다.

- 브라우저가 자동으로 열립니다 → **http://localhost:4000**
- 다이얼로그의 **[종료]** 버튼을 누르면 서비스가 종료됩니다.

앱이 없으면 아래 **앱 생성** 단계를 먼저 진행하세요.

---

## 앱 생성 (최초 1회 또는 코드 업데이트 후)

```bash
# 프로젝트 폴더에서 실행
pnpm create-app

# 바탕화면에 생성된 앱을 Applications 폴더로 이동 (선택)
mv ~/Desktop/광고증빙요청시스템.app /Applications/
```

- 빌드 결과물이 없으면 자동으로 `pnpm build`를 먼저 실행합니다.
- 코드가 변경되었을 때도 이 명령으로 앱을 재생성하세요.

---

## 개발 서버 실행 (개발/디버그 시)

```bash
# 프로젝트 루트에서 실행
./start.sh
```

또는 수동으로:

```bash
pnpm install        # 최초 1회
pnpm dev            # 백엔드(4000) + 프론트엔드(5173) 동시 실행
```

접속 주소: **http://localhost:5173**

> ⚠️ 개발 서버는 앱(광고증빙요청시스템.app)과 **DB를 공유하지 않습니다**.
> 자세한 내용은 아래 **DB 관리** 항목을 참고하세요.

---

## 최초 1회 설정 (신규 PC에서 처음 실행할 때만)

### 1. Node.js 설치

- https://nodejs.org 에서 **v20 이상** LTS 버전 설치
- 설치 후 확인: `node -v`

### 2. pnpm 활성화

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

- 확인: `pnpm -v`

### 3. 의존성 설치

```bash
cd 프로젝트폴더
pnpm install
```

---

## 초기 로그인 계정

| 계정 | 역할 | 초기 비밀번호 |
|------|------|-------------|
| admin | 관리자 | adcheck2026 |
| tech1 | 기술팀 | adcheck2026 |
| ad1 | 광고팀 | adcheck2026 |

> 최초 로그인 후 반드시 비밀번호를 변경하세요. (우측 상단 → 비밀번호 변경)

---

## DB 관리

### DB 파일 위치

| 실행 방식 | DB 경로 |
|-----------|---------|
| 앱 (광고증빙요청시스템.app) | `~/Library/Application Support/AdCheck/data/adcheck.db` |
| 개발 서버 (pnpm dev / start.sh) | `프로젝트폴더/backend/data/adcheck.db` |

앱과 개발 서버는 **서로 다른 DB를 사용**합니다.

### 개발 서버 DB → 앱 DB로 복사

앱을 완전히 종료한 뒤 실행:

```bash
cp 프로젝트폴더/backend/data/adcheck.db \
   ~/Library/Application\ Support/AdCheck/data/adcheck.db

# WAL/SHM 파일 정리 (잔여 파일 제거)
rm -f ~/Library/Application\ Support/AdCheck/data/adcheck.db-shm \
      ~/Library/Application\ Support/AdCheck/data/adcheck.db-wal
```

앱을 다시 열면 복사한 데이터가 그대로 보입니다.

### DB 초기화 (앱 DB 완전 리셋)

앱을 완전히 종료한 뒤 실행:

```bash
rm  ~/Library/Application\ Support/AdCheck/data/adcheck.db
rm -f ~/Library/Application\ Support/AdCheck/data/adcheck.db-shm \
      ~/Library/Application\ Support/AdCheck/data/adcheck.db-wal
```

앱을 다시 열면 마이그레이션이 자동 실행되고 기본 계정 3개(admin/tech1/ad1)가 새로 생성됩니다.

### DB 백업

```bash
# 날짜별 백업 스크립트 (30일 보관)
bash 프로젝트폴더/scripts/backup-db.sh
```

백업 파일은 `~/Library/Application Support/AdCheck/data/backups/` 에 저장됩니다.

---

## 스토리지 마운트

파일 탐색·복사 기능은 스토리지가 macOS에 마운트된 상태에서만 동작합니다.
마운트는 **macOS Finder 또는 터미널에서 직접** 수행합니다. 앱이 자동으로 마운트하지 않습니다.

| 스토리지 | SMB 주소 | 마운트 경로 |
|---------|---------|-----------|
| Logger Storage (녹화 서버) | smb://10.93.101.100/data | /Volumes/data |
| 공유 NAS | smb://58.234.220.242/광고 | /Volumes/광고 |

Finder 메뉴 → **이동 → 서버에 연결 (⌘K)** → 위 SMB 주소 입력

---

## 수동 실행 (문제 발생 시)

```bash
# 각각 따로 실행
pnpm dev:backend    # 백엔드만  → http://localhost:4000
pnpm dev:frontend   # 프론트엔드만 → http://localhost:5173
```

### 포트 충돌 해결

```bash
kill $(lsof -ti:4000)   # 4000번 포트 종료
kill $(lsof -ti:5173)   # 5173번 포트 종료
```

---

## 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| 앱 더블클릭해도 브라우저 안 열림 | Node.js 미설치 또는 경로 문제 | Node.js v20 이상 설치 확인 |
| 앱 실행 후 데이터가 없음 | 앱과 개발 서버가 다른 DB 사용 | 위 **DB 복사** 절차 수행 (앱 종료 후) |
| `pnpm: command not found` | pnpm 미설치 | `corepack enable` 실행 |
| `Cannot find module 'better-sqlite3'` | 네이티브 빌드 누락 | `pnpm install` 재실행 |
| 브라우저에서 API 오류 | 백엔드 미기동 | 터미널에서 백엔드 로그 확인 |
| 파일 탐색 실패 | Logger Storage 미마운트 | Finder → 서버에 연결 → smb://10.93.101.100/data |
| 파일 복사 실패 | 공유 NAS 미마운트 | Finder → 서버에 연결 → smb://58.234.220.242/광고 |
| `DB migration failed` | DB 파일 권한 문제 | DB 폴더 쓰기 권한 확인 |
| 서버 재시작 후 로그아웃 | MemoryStore 세션 초기화 (정상) | 재로그인 |

---

## 로그 위치

| 실행 방식 | 로그 경로 |
|-----------|---------|
| 앱 | `~/Library/Application Support/AdCheck/logs/` |
| 개발 서버 | `프로젝트폴더/backend/logs/` |

---

## 접속 주소 요약

| 구분 | URL |
|------|-----|
| 앱 (운영) | http://localhost:4000 |
| 개발 서버 | http://localhost:5173 |
| API 헬스체크 | http://localhost:4000/api/health |
