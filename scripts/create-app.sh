#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

APP_NAME="광고증빙요청시스템"
APP_PORT="${APP_PORT:-4000}"
DEFAULT_PUBLIC_BASE_URL="http://adcheck.tech.net"
PUBLIC_BASE_URL_VALUE="${PUBLIC_BASE_URL:-$DEFAULT_PUBLIC_BASE_URL}"
APP_DEST="${APP_DEST:-$HOME/Desktop/${APP_NAME}.app}"
DIST_APP_DIR="$PROJECT_DIR/dist-app"
STAGE_DIR="$DIST_APP_DIR/control-app"
PACKAGE_DIR="$DIST_APP_DIR/package"
ICON_DIR="$DIST_APP_DIR/icon"
BACKEND_DEPLOY_LOG="$DIST_APP_DIR/backend-deploy.log"
ELECTRON_VERSION="$(node -p "require('./electron/package.json').devDependencies.electron.replace(/^[^0-9]*/, '')")"

info()    { echo "[INFO]  $1"; }
success() { echo "[OK]    $1"; }
error()   { echo "[ERROR] $1"; }

copy_dir() {
  local src="$1"
  local dest="$2"

  mkdir -p "$dest"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$src"/ "$dest"/
  else
    rm -rf "$dest"
    mkdir -p "$dest"
    cp -R "$src"/. "$dest"/
  fi
}

cleanup_backend_bundle() {
  local backend_dir="$1"
  rm -rf "$backend_dir/src" "$backend_dir/data" "$backend_dir/logs"
  rm -f "$backend_dir/tsconfig.json"
}

detect_electron_arch() {
  local machine_arch
  machine_arch="$(uname -m)"
  case "$machine_arch" in
    arm64) echo "arm64" ;;
    x86_64) echo "x64" ;;
    *) echo "x64" ;;
  esac
}

create_stage_package_json() {
  cat > "$STAGE_DIR/package.json" <<'JSON'
{
  "name": "adcheck-control-app",
  "private": true,
  "version": "1.0.0",
  "main": "dist/main.js"
}
JSON
}

create_runtime_config() {
  cat > "$STAGE_DIR/config/control-app.json" <<JSON
{
  "appPort": ${APP_PORT},
  "publicBaseUrl": "${PUBLIC_BASE_URL_VALUE}"
}
JSON
}

echo ""
echo "======================================"
echo "  Electron 제어 앱 번들 생성"
echo "======================================"
echo ""
echo "  프로젝트 위치: $PROJECT_DIR"
echo "  앱 생성 위치:  $APP_DEST"
echo "  공용 접속 주소: $PUBLIC_BASE_URL_VALUE"
echo ""

cd "$PROJECT_DIR"

if ! command -v node >/dev/null 2>&1; then
  error "Node.js가 필요합니다. v20 이상을 설치하세요."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  error "pnpm이 없습니다. corepack enable 후 다시 실행하세요."
  exit 1
fi

if ! command -v iconutil >/dev/null 2>&1; then
  error "macOS iconutil 명령을 찾을 수 없습니다."
  exit 1
fi

NODE_BIN="$(command -v node)"
ELECTRON_ARCH="$(detect_electron_arch)"
success "Node.js: $NODE_BIN"
success "Electron arch: $ELECTRON_ARCH"
success "Electron version: $ELECTRON_VERSION"

if [[ ! -d "$PROJECT_DIR/node_modules" || ! -x "$PROJECT_DIR/node_modules/.bin/electron" ]]; then
  info "Electron 의존성을 포함해 설치 상태를 확인합니다..."
  pnpm install
fi

info "정적 빌드 실행 중..."
pnpm build
success "빌드 완료"

info "앱 아이콘 생성 중..."
node scripts/generate-icon-assets.mjs
success "아이콘 생성 완료"

ICON_ICNS="$ICON_DIR/adcheck.icns"
ICON_BASE="$ICON_DIR/adcheck"
if [[ ! -f "$ICON_ICNS" ]]; then
  error "아이콘 파일 생성에 실패했습니다: $ICON_ICNS"
  exit 1
fi

rm -rf "$STAGE_DIR" "$PACKAGE_DIR" "$APP_DEST"
mkdir -p \
  "$STAGE_DIR/dist" \
  "$STAGE_DIR/renderer" \
  "$STAGE_DIR/assets" \
  "$STAGE_DIR/config" \
  "$STAGE_DIR/bin" \
  "$STAGE_DIR/frontend/dist" \
  "$PACKAGE_DIR"

create_stage_package_json
create_runtime_config

info "Electron 제어 앱 파일 복사 중..."
copy_dir "$PROJECT_DIR/electron/dist" "$STAGE_DIR/dist"
copy_dir "$PROJECT_DIR/electron/renderer" "$STAGE_DIR/renderer"
copy_dir "$PROJECT_DIR/electron/assets" "$STAGE_DIR/assets"
cp "$NODE_BIN" "$STAGE_DIR/bin/node"
chmod +x "$STAGE_DIR/bin/node"

info "백엔드 런타임 번들 생성 중..."
pnpm --filter backend deploy --legacy --prod "$STAGE_DIR/backend" >"$BACKEND_DEPLOY_LOG" 2>&1 || {
  cat "$BACKEND_DEPLOY_LOG"
  error "backend 런타임 번들 생성에 실패했습니다."
  exit 1
}
cleanup_backend_bundle "$STAGE_DIR/backend"
copy_dir "$PROJECT_DIR/frontend/dist" "$STAGE_DIR/frontend/dist"
success "런타임 파일 준비 완료"

info "Electron 패키징 중..."
pnpm exec electron-packager \
  "$STAGE_DIR" \
  "$APP_NAME" \
  --platform=darwin \
  --arch="$ELECTRON_ARCH" \
  --out="$PACKAGE_DIR" \
  --overwrite \
  --prune=false \
  --asar=false \
  --electron-version="$ELECTRON_VERSION" \
  --app-bundle-id=com.broadcast.adcheck \
  --app-version=1.0.0 \
  --build-version=1.0.0 \
  --icon="$ICON_BASE"

PACKAGED_APP="$(find "$PACKAGE_DIR" -type d -name "${APP_NAME}.app" | head -n 1)"
if [[ -z "$PACKAGED_APP" || ! -d "$PACKAGED_APP" ]]; then
  error "Electron 패키징 결과물을 찾지 못했습니다."
  exit 1
fi

cp -R "$PACKAGED_APP" "$APP_DEST"
cp "$ICON_ICNS" "$APP_DEST/Contents/Resources/adcheck.icns"
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile adcheck.icns" "$APP_DEST/Contents/Info.plist" >/dev/null 2>&1 \
  || plutil -replace CFBundleIconFile -string adcheck.icns "$APP_DEST/Contents/Info.plist"
touch "$APP_DEST"

echo -n "APPL????" > "$APP_DEST/Contents/PkgInfo"

echo ""
echo "======================================"
echo "  Electron 제어 앱 생성 완료"
echo "======================================"
echo ""
echo "  위치: $APP_DEST"
echo ""
echo "  사용 방법:"
echo "  1. '${APP_NAME}' 아이콘을 더블클릭합니다."
echo "  2. 제어센터에서 [서버 시작]을 누릅니다."
echo "  3. 서비스 PC 브라우저에서 http://localhost:${APP_PORT} 확인"
echo "  4. 내부망 사용자에게 '${PUBLIC_BASE_URL_VALUE}' 주소 안내"
echo "  5. 종료하려면 제어센터의 [서버 중지 후 종료] 버튼을 누릅니다."
echo ""
