#!/usr/bin/env bash
# =============================================
# ad-check 원클릭 실행 스크립트
#
# 사용법: ./start.sh
# 또는:   bash start.sh
#
# 하는 일:
#   1. Node.js / pnpm 설치 여부 확인
#   2. .env 파일 없으면 .env.example 복사
#   3. node_modules 없으면 pnpm install 자동 실행
#   4. 프론트엔드 정적 빌드 생성
#   5. 백엔드(포트 4000)에서 앱 + API 동시 제공
#   6. 브라우저 자동 열기 (http://localhost:4000)
# =============================================

set -e  # 오류 발생 시 즉시 종료

# ----- 색상 정의 -----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # 색상 초기화

# ----- 출력 헬퍼 함수 -----
info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# 스크립트 위치 기준으로 프로젝트 루트로 이동
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "======================================"
echo "  광고 증빙 요청 시스템 — 서비스 시작"
echo "======================================"
echo ""

# ----- 1. Node.js 확인 -----
if ! command -v node &> /dev/null; then
  error "Node.js가 설치되어 있지 않습니다."
  error "https://nodejs.org 에서 v20 이상을 설치하세요."
  exit 1
fi

NODE_VERSION=$(node -v)
success "Node.js $NODE_VERSION"

# ----- 2. pnpm 확인 (없으면 corepack으로 활성화 시도) -----
if ! command -v pnpm &> /dev/null; then
  warn "pnpm이 없습니다. corepack으로 활성화를 시도합니다..."
  if command -v corepack &> /dev/null; then
    corepack enable
    corepack prepare pnpm@latest --activate
    success "pnpm 활성화 완료"
  else
    error "corepack도 없습니다. Node.js v16.13 이상을 설치하거나"
    error "npm install -g pnpm 으로 수동 설치하세요."
    exit 1
  fi
fi

PNPM_VERSION=$(pnpm -v)
success "pnpm v$PNPM_VERSION"

# ----- 3. .env 파일 확인 -----
if [ ! -f ".env" ]; then
  warn ".env 파일이 없습니다. .env.example을 복사합니다."
  cp .env.example .env
  success ".env 파일 생성 완료 (기본값으로 실행됩니다)"
  echo ""
  warn "※ 스토리지 탐색 기능을 사용하려면 .env의 경로를 확인하고"
  warn "  Logger Storage(/Volumes/data)가 macOS에 마운트되어 있어야 합니다."
  warn "  자세한 내용은 HOW_TO_RUN.md 의 '스토리지 마운트' 항목을 참고하세요."
  echo ""
else
  success ".env 파일 확인"
fi

# ----- 4. 의존성 설치 (node_modules 없을 때만) -----
if [ ! -d "node_modules" ] || [ ! -d "backend/node_modules" ] || [ ! -d "frontend/node_modules" ]; then
  info "의존성 설치 중... (최초 실행 시 수 분 소요될 수 있습니다)"
  pnpm install
  success "의존성 설치 완료"
else
  success "의존성 설치 확인"
fi

# ----- 5. 포트 충돌 확인 -----
check_port() {
  local port=$1
  local name=$2
  if lsof -ti:$port &> /dev/null; then
    warn "포트 $port ($name)가 이미 사용 중입니다."
    warn "기존 프로세스를 종료하려면: kill \$(lsof -ti:$port)"
  fi
}
check_port 4000 "백엔드"

# ----- 6. 프론트엔드 정적 빌드 -----
info "프론트엔드 정적 파일 빌드 중..."
pnpm --filter=frontend build
success "프론트엔드 빌드 완료"

# ----- 7. 마운트 포인트 디렉토리 생성 (최초 1회) -----
# /Volumes 는 root 소유라 Node.js 프로세스가 직접 mkdir 불가 → 여기서 사전 생성
info "스토리지 마운트 포인트 준비 중..."
sudo mkdir -p /Volumes/data 2>/dev/null && success "/Volumes/data 준비 완료" || warn "/Volumes/data 디렉토리 생성 실패 (이미 존재하거나 권한 없음)"
sudo mkdir -p "/Volumes/광고" 2>/dev/null && success "/Volumes/광고 준비 완료 (과거 호환용 경로)" || warn "/Volumes/광고 디렉토리 생성 생략 또는 권한 없음"

# ----- 8. 서비스 시작 -----
export FRONTEND_DIST_PATH="$SCRIPT_DIR/frontend/dist"

echo ""
info "서비스를 시작합니다..."
echo ""
echo "  앱:          http://localhost:4000"
echo "  공유 주소:   http://adcheck.tech.net"
echo "  헬스체크:    http://localhost:4000/api/health"
if [ -n "${PUBLIC_BASE_URL:-}" ]; then
  echo "  운영 공유 주소: ${PUBLIC_BASE_URL}"
fi
echo ""
echo "  종료하려면:  Ctrl + C"
echo ""

open_browser_when_ready() {
  local url="http://localhost:4000"
  local max_attempts=60

  for _ in $(seq 1 "$max_attempts"); do
    if curl -s --max-time 1 "$url" >/dev/null 2>&1; then
      open "$url"
      return 0
    fi
    sleep 1
  done

  warn "앱 준비 확인이 지연되어 브라우저를 자동으로 열지 못했습니다. 수동으로 $url 에 접속하세요."
  return 1
}

(open_browser_when_ready) &

# 백엔드가 프론트엔드 정적 파일과 API를 4000 포트에서 함께 제공
pnpm --filter=backend dev
