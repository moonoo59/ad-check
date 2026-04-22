#!/usr/bin/env bash
# =============================================
# macOS 응용프로그램 번들 생성 스크립트
#
# 실행: bash scripts/create-app.sh
#
# 하는 일:
#   1. 광고증빙요청시스템.app 번들 구조 생성
#   2. 런처 스크립트 작성 (백엔드 시작 + 브라우저 열기 + 종료 다이얼로그)
#   3. Desktop 에 .app 배치 (원하면 /Applications 으로 옮길 수 있음)
#
# 결과:
#   ~/Desktop/광고증빙요청시스템.app  — 더블클릭으로 실행
# =============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

APP_NAME="광고증빙요청시스템"
APP_DEST="$HOME/Desktop/${APP_NAME}.app"

echo ""
echo "======================================"
echo "  macOS 응용프로그램 번들 생성"
echo "======================================"
echo ""
echo "  프로젝트 위치: $PROJECT_DIR"
echo "  앱 생성 위치:  $APP_DEST"
echo ""

# ---- 빌드 확인 ----
if [ ! -f "$PROJECT_DIR/backend/dist/index.js" ] || [ ! -f "$PROJECT_DIR/frontend/dist/index.html" ]; then
  echo "[INFO] 빌드 결과물이 없습니다. 먼저 빌드합니다..."
  cd "$PROJECT_DIR"
  pnpm build
  echo "[OK]   빌드 완료"
fi

# ---- .app 번들 디렉토리 구조 생성 ----
rm -rf "$APP_DEST"
mkdir -p "$APP_DEST/Contents/MacOS"
mkdir -p "$APP_DEST/Contents/Resources"

# ---- Info.plist ----
cat > "$APP_DEST/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>

  <key>CFBundleDisplayName</key>
  <string>광고 증빙 요청 시스템</string>

  <key>CFBundleIdentifier</key>
  <string>com.broadcast.adcheck</string>

  <key>CFBundleVersion</key>
  <string>1.0.0</string>

  <key>CFBundleShortVersionString</key>
  <string>1.0</string>

  <key>CFBundlePackageType</key>
  <string>APPL</string>

  <key>CFBundleExecutable</key>
  <string>launcher</string>

  <!-- Terminal 창 없이 백그라운드 실행 -->
  <key>LSUIElement</key>
  <false/>

  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>

  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

echo "[OK]   Info.plist 생성"

# ---- 런처 스크립트 ----
# 이 스크립트가 .app 의 실제 실행 파일이다.
# 더블클릭 → macOS 가 이 스크립트를 실행함.
cat > "$APP_DEST/Contents/MacOS/launcher" << LAUNCHER
#!/usr/bin/env bash
# =============================================
# 광고 증빙 요청 시스템 — macOS 앱 런처
#
# 실행 순서:
#   1. 프로젝트 경로 확인
#   2. 이미 실행 중이면 브라우저만 열기
#   3. Node.js 로 백엔드 서버 기동
#   4. 서버 준비 대기 (헬스체크 폴링)
#   5. 기본 브라우저로 http://localhost:4000 열기
#   6. AppleScript 다이얼로그 표시 ("종료" 버튼 클릭 대기)
#   7. "종료" 클릭 시: 백엔드 프로세스 종료
# =============================================

# 프로젝트 고정 경로 (이 PC에서 변경되지 않음)
PROJECT_DIR="${PROJECT_DIR}"

# ---- Node.js 경로 탐색 ----
# macOS .app 에서는 PATH 가 제한적이므로 주요 경로를 직접 확인
NODE_BIN=""
for candidate in \
  "\$HOME/.nvm/versions/node/\$(ls \$HOME/.nvm/versions/node/ 2>/dev/null | sort -V | tail -1)/bin/node" \
  "/usr/local/bin/node" \
  "/opt/homebrew/bin/node" \
  "/opt/local/bin/node" \
  "\$(which node 2>/dev/null)"; do
  if [ -x "\$candidate" ] && "\$candidate" -v &>/dev/null; then
    NODE_BIN="\$candidate"
    break
  fi
done

if [ -z "\$NODE_BIN" ]; then
  osascript -e 'display alert "실행 오류" message "Node.js 를 찾을 수 없습니다.
https://nodejs.org 에서 Node.js v20 이상을 설치하세요." as critical'
  exit 1
fi

# ---- pnpm 경로 탐색 ----
PNPM_BIN=""
for candidate in \
  "\$HOME/.local/share/pnpm/pnpm" \
  "\$HOME/Library/pnpm/pnpm" \
  "/usr/local/bin/pnpm" \
  "/opt/homebrew/bin/pnpm" \
  "\$(which pnpm 2>/dev/null)"; do
  if [ -x "\$candidate" ] && "\$candidate" -v &>/dev/null 2>&1; then
    PNPM_BIN="\$candidate"
    break
  fi
done

# pnpm 없으면 NODE_PATH에서 corepack 시도
if [ -z "\$PNPM_BIN" ] && "\$NODE_BIN" "\$(dirname \$NODE_BIN)/corepack" --version &>/dev/null 2>&1; then
  PNPM_BIN="\$(dirname \$NODE_BIN)/pnpm"
fi

# ---- 빌드 결과물 없으면 자동 빌드 ----
# 더블클릭 실행 시 dist 가 없거나 오래된 경우 자동으로 빌드한다.
if [ ! -f "\$PROJECT_DIR/backend/dist/index.js" ] || [ ! -f "\$PROJECT_DIR/frontend/dist/index.html" ]; then
  osascript -e 'display notification "빌드 중... 잠시 기다려 주세요." with title "광고 증빙 요청 시스템"'

  if [ -n "\$PNPM_BIN" ]; then
    cd "\$PROJECT_DIR" && "\$PNPM_BIN" build >> "\$LOGS_DIR/build.log" 2>&1
  elif [ -n "\$NODE_BIN" ]; then
    # pnpm 없을 때 node 직접 실행 (tsc + vite)
    cd "\$PROJECT_DIR"
    "\$NODE_BIN" "\$(dirname \$NODE_BIN)/tsc" -p backend/tsconfig.json >> "\$LOGS_DIR/build.log" 2>&1 || true
    "\$NODE_BIN" "\$(dirname \$NODE_BIN)/vite" build --root frontend >> "\$LOGS_DIR/build.log" 2>&1 || true
  fi

  # 빌드 후에도 파일이 없으면 에러
  if [ ! -f "\$PROJECT_DIR/backend/dist/index.js" ]; then
    osascript -e "display alert \"빌드 실패\" message \"백엔드 빌드에 실패했습니다.
로그 확인: ~/Library/Application Support/AdCheck/logs/build.log\" as critical"
    exit 1
  fi
fi

# ---- 이미 실행 중이면 브라우저만 열기 ----
if curl -s --max-time 1 http://localhost:4000/api/health > /dev/null 2>&1; then
  open "http://localhost:4000"

  osascript << 'APPLESCRIPT'
  display dialog "광고 증빙 요청 시스템이 이미 실행 중입니다." & return & return & ¬
    "브라우저에서 http://localhost:4000 으로 접속하세요." ¬
    buttons {"확인"} default button "확인" ¬
    with title "광고 증빙 요청 시스템" with icon note
APPLESCRIPT
  exit 0
fi

# ---- DB / 로그 디렉토리 생성 ----
DATA_DIR="\$HOME/Library/Application Support/AdCheck/data"
LOGS_DIR="\$HOME/Library/Application Support/AdCheck/logs"
mkdir -p "\$DATA_DIR" "\$LOGS_DIR"

# ---- 백엔드 기동 ----
# 환경변수를 직접 설정해서 Node.js 프로세스 실행
NODE_ENV=production \\
PORT=4000 \\
DB_PATH="\$DATA_DIR/adcheck.db" \\
LOGS_PATH="\$LOGS_DIR" \\
MIGRATIONS_PATH="\$PROJECT_DIR/backend/dist/config/migrations" \\
FRONTEND_DIST_PATH="\$PROJECT_DIR/frontend/dist" \\
IS_ELECTRON=true \\
CORS_ORIGIN="http://localhost:4000" \\
"\$NODE_BIN" "\$PROJECT_DIR/backend/dist/index.js" \\
  >> "\$LOGS_DIR/app.log" 2>&1 &

BACKEND_PID=\$!
echo "[Launcher] 백엔드 시작 (PID: \$BACKEND_PID)" >> "\$LOGS_DIR/launcher.log"

# ---- 서버 준비 대기 (최대 30초) ----
READY=false
for i in \$(seq 1 30); do
  sleep 1
  if curl -s --max-time 1 http://localhost:4000/api/health > /dev/null 2>&1; then
    READY=true
    break
  fi
done

if [ "\$READY" = false ]; then
  kill \$BACKEND_PID 2>/dev/null
  osascript -e 'display alert "실행 오류" message "서버가 30초 내에 시작되지 않았습니다.
로그를 확인하세요: ~/Library/Application Support/AdCheck/logs/app.log" as critical'
  exit 1
fi

# ---- 기본 브라우저 열기 ----
open "http://localhost:4000"

# ---- 종료 다이얼로그 (클릭할 때까지 화면에 유지) ----
# 사용자가 "종료" 버튼을 누를 때까지 이 스크립트는 블로킹됨
osascript << APPLESCRIPT
display dialog "광고 증빙 요청 시스템이 실행 중입니다." & return & return & ¬
  "주소: http://localhost:4000" & return & ¬
  "브라우저가 자동으로 열렸습니다." & return & return & ¬
  "종료하려면 아래 버튼을 누르세요." ¬
  buttons {"종료"} default button "종료" ¬
  with title "광고 증빙 요청 시스템" ¬
  with icon note
APPLESCRIPT

# ---- 종료 처리 ----
echo "[Launcher] 종료 요청 수신. 백엔드 종료 중..." >> "\$LOGS_DIR/launcher.log"

# SIGTERM 전송 (백엔드의 gracefulShutdown 핸들러 호출)
kill -TERM \$BACKEND_PID 2>/dev/null

# 최대 5초 대기 후 강제 종료
for i in 1 2 3 4 5; do
  sleep 1
  if ! kill -0 \$BACKEND_PID 2>/dev/null; then
    break
  fi
done
kill -KILL \$BACKEND_PID 2>/dev/null || true

echo "[Launcher] 종료 완료" >> "\$LOGS_DIR/launcher.log"
LAUNCHER

# 실행 권한 부여
chmod +x "$APP_DEST/Contents/MacOS/launcher"

echo "[OK]   런처 스크립트 생성"

# ---- PkgInfo 파일 (macOS 앱 번들 필수) ----
echo -n "APPL????" > "$APP_DEST/Contents/PkgInfo"

echo ""
echo "======================================"
echo "  앱 번들 생성 완료!"
echo "======================================"
echo ""
echo "  위치: $APP_DEST"
echo ""
echo "  사용 방법:"
echo "  1. 바탕화면의 '${APP_NAME}' 아이콘을 더블클릭"
echo "  2. 브라우저에서 http://localhost:4000 접속"
echo "  3. 종료하려면 다이얼로그의 [종료] 버튼 클릭"
echo ""
echo "  /Applications 으로 이동하려면:"
echo "  mv \"$APP_DEST\" /Applications/"
echo ""
