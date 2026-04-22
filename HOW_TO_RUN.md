# 광고 증빙 요청 시스템 — 실행 방법

## 앱 실행 (권장 — 운영용)

바탕화면 또는 `/Applications` 의 **광고증빙요청시스템** 아이콘을 더블클릭합니다.

- Electron 제어센터가 먼저 열립니다.
- 제어센터에서 **[서버 시작]** 을 누르면 서비스 PC 브라우저가 자동으로 열립니다 → **http://localhost:4000**
- 내부망 사용자는 앱 생성 시 반영된 `PUBLIC_BASE_URL` 주소로 접속합니다. 기본 운영 주소는 **http://adcheck.tech.net** 입니다.
- 서비스 PC의 nginx가 80번 포트를 4000번 앱 서버로 프록시하므로 사용자는 포트 번호 없이 접속합니다.
- **[서버 중지]** 는 서버만 종료하고, **[서버 중지 후 종료]** 는 서버 종료 후 제어센터도 닫습니다.

앱이 없으면 아래 **앱 생성** 단계를 먼저 진행하세요.

- 앱은 최초 실행 시 세션 시크릿을 `~/Library/Application Support/.../config/session-secret`에 설치별로 자동 생성합니다.
- 앱은 번들된 Node 런타임과 빌드 산출물로 실행되므로, 실행 시 프로젝트 폴더나 `pnpm dev`에 의존하지 않습니다.
- 앱은 생성 시점의 `PUBLIC_BASE_URL` 값을 번들 내부 설정에 저장합니다. 운영 주소가 바뀌면 `pnpm create-app`으로 다시 생성하세요.
- 서버 재시작 시 세션이 초기화되므로 모든 사용자는 다시 로그인해야 합니다. (`MemoryStore` 사용)

---

## 앱 생성 (최초 1회 또는 코드 업데이트 후)

```bash
# 프로젝트 폴더에서 실행
export PUBLIC_BASE_URL=http://adcheck.tech.net
pnpm create-app

# 바탕화면에 생성된 앱을 Applications 폴더로 이동 (선택)
mv ~/Desktop/광고증빙요청시스템.app /Applications/
```

- 빌드 결과물이 없으면 자동으로 `pnpm build`를 먼저 실행합니다.
- 코드나 운영 접속 주소가 변경되었을 때도 이 명령으로 앱을 재생성하세요.

---

## 개발 서버 실행 (개발/디버그 시)

```bash
# 프로젝트 루트에서 실행
./start.sh
```

또는 수동으로:

```bash
pnpm install        # 최초 1회
pnpm dev            # 앱 + API를 4000 포트에서 함께 실행
```

접속 주소: **http://localhost:4000**

> ⚠️ 실제 사용자 오픈은 `pnpm dev`가 아니라 패키징 앱 실행 + `PUBLIC_BASE_URL` 공유 기준입니다.
> ⚠️ `NODE_ENV=production`으로 백엔드만 실행할 경우에는 `.env`에 안전한 `SESSION_SECRET`을 직접 넣어야 합니다.
> ℹ️ 현재는 개발 서버와 앱이 기본적으로 같은 공용 운영 DB를 사용합니다.

---

## 최초 1회 설정 (신규 PC에서 처음 실행할 때만)

> 앱만 실행하는 최종 사용자라면 이 단계는 보통 필요 없습니다.
> 이 단계는 개발 서버 실행 또는 `.app` 재생성 담당자 기준입니다.

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
| 개발 서버 (pnpm dev / start.sh) | `~/Library/Application Support/AdCheck/data/adcheck.db` |

앱과 개발 서버는 **같은 DB를 사용**합니다.

별도 복사 절차는 필요하지 않습니다. 개발 서버에서 본 데이터가 앱에서도 그대로 보입니다.

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

기본값으로는 앱 DB를 우선 찾아 `~/Library/Application Support/AdCheck/data/backups/`에 저장합니다.
개발 서버와 앱이 같은 DB를 쓰므로 이 백업은 공용 운영 DB를 백업합니다.

원하는 DB를 직접 지정하려면:

```bash
DB_PATH=/원하는/경로/adcheck.db bash 프로젝트폴더/scripts/backup-db.sh
```

---

## 스토리지 마운트

파일 탐색·복사 기능은 스토리지가 macOS에 마운트된 상태에서만 동작합니다.
마운트는 **macOS Finder 또는 터미널에서 직접** 수행합니다. 앱이 자동으로 마운트하지 않습니다.

| 스토리지 | SMB 주소 | 마운트 경로 |
|---------|---------|-----------|
| Logger Storage (녹화 서버) | smb://10.93.101.100/data | /Volumes/data |

Finder 메뉴 → **이동 → 서버에 연결 (⌘K)** → 위 SMB 주소 입력

공유 NAS 경로(`/Volumes/광고`)는 과거 호환용 설정으로만 남아 있습니다. 현재 기본 복사 목적지는 서버 로컬 전달 스토리지이므로 운영 필수 마운트는 아닙니다.

---

## 수동 실행 (문제 발생 시)

```bash
# 각각 따로 실행
pnpm dev:backend    # 백엔드만  → http://localhost:4000
pnpm dev:frontend   # Vite 프론트엔드만 → http://localhost:5173
```

### 포트 충돌 해결

```bash
kill $(lsof -ti:4000)   # 4000번 포트 종료
```

---

## 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| 앱 더블클릭 후 제어센터가 안 열림 | 앱 번들 손상 또는 실행 권한 문제 | `pnpm create-app`으로 앱 재생성 후 다시 배치 |
| 서버 시작이 실패함 | 포트 충돌 또는 내부 런타임 파일 누락 | 제어센터 최근 로그 확인 후 `kill $(lsof -ti:4000)` 실행 |
| `pnpm: command not found` | pnpm 미설치 | `corepack enable` 실행 |
| `Cannot find module 'better-sqlite3'` | 네이티브 빌드 누락 | `pnpm install` 재실행 |
| 브라우저에서 API 오류 | 백엔드 미기동 | 터미널에서 백엔드 로그 확인 |
| 파일 탐색 실패 | Logger Storage 미마운트 | Finder → 서버에 연결 → smb://10.93.101.100/data |
| 파일 복사 실패 | 서버 로컬 전달 경로 권한 문제 또는 디스크 공간 부족 | 로그 확인 후 `LOCAL_DELIVERY_PATH` 권한과 여유 공간 점검 |
| `DB migration failed` | DB 파일 권한 문제 | DB 폴더 쓰기 권한 확인 |
| 서버 재시작 후 로그아웃 | MemoryStore 세션 초기화 (정상) | 재로그인 |

---

## 로그 위치

| 실행 방식 | 로그 경로 |
|-----------|---------|
| 앱 | `~/Library/Application Support/AdCheck/logs/` |
| 개발 서버 | `~/Library/Application Support/AdCheck/logs/` |

대표 로그 파일은 날짜별 `app-YYYY-MM-DD.log` 형식으로 생성됩니다.

---

## 접속 주소 요약

| 구분 | URL |
|------|-----|
| 앱 (운영, 내부망 사용자 공유 주소) | 앱 생성 시 저장된 `PUBLIC_BASE_URL` 값 예: http://adcheck.tech.net |
| 서비스 PC (로컬 확인용) | http://localhost:4000 |
| 개발 서버 | http://localhost:4000 |
| API 헬스체크 | http://localhost:4000/api/health |
