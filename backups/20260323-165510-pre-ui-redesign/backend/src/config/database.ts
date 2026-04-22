/**
 * SQLite 데이터베이스 연결 및 마이그레이션 설정
 *
 * better-sqlite3는 동기 방식 드라이버로, 단일 PC 환경에서
 * 복잡한 비동기 처리 없이 안정적으로 사용할 수 있다.
 *
 * DB 파일이 없으면 자동 생성되므로 별도 설치 불필요.
 *
 * 마이그레이션 방식:
 *   - migrations/ 디렉토리의 SQL 파일을 파일명 순서대로 실행
 *   - schema_migrations 테이블로 실행 이력 관리 (중복 실행 방지)
 *   - 서버 기동 시 자동 실행 (별도 CLI 불필요)
 */
import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { env } from './env';

// DB 파일이 저장될 디렉토리가 없으면 생성
const dbDir = path.dirname(env.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// DB 연결 (파일 없으면 자동 생성)
const db: DatabaseType = new Database(env.DB_PATH, {
  // 개발 환경에서는 SQL 실행 로그 출력
  verbose: env.NODE_ENV === 'development' ? console.log : undefined,
});

// 성능 최적화: WAL 모드 활성화 (읽기/쓰기 동시성 향상)
db.pragma('journal_mode = WAL');
// 외래키 제약조건 강제 활성화 (SQLite 기본값이 비활성)
db.pragma('foreign_keys = ON');

// ============================================================
// 마이그레이션 러너
//
// 실행 원칙:
//   1. schema_migrations 테이블에 기록된 파일은 건너뜀 (멱등성 보장)
//   2. 새 파일만 파일명 오름차순으로 실행
//   3. 실행 실패 시 즉시 서버 기동 중단 (DB 불일치 상태 방지)
//
// 마이그레이션 파일 추가 방법:
//   backend/src/config/migrations/ 에 NNN_설명.sql 형식으로 파일 추가
//   (예: 003_add_notifications.sql)
// ============================================================

/**
 * 마이그레이션 실행 이력 테이블 초기화
 * 서버 최초 기동 시 이 테이블이 없으면 생성한다.
 */
function initMigrationTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT NOT NULL PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);
}

/**
 * migrations/ 디렉토리의 SQL 파일을 순서대로 실행
 *
 * - 이미 적용된 파일은 건너뜀
 * - 각 파일 전체를 트랜잭션으로 감싸서 원자성 보장
 */
function runMigrations(): void {
  // MIGRATIONS_PATH: Electron 패키징 환경에서 .asar 밖 실제 경로로 주입됨
  // 없으면 빌드 결과물 기준 상대 경로 사용 (개발/일반 실행 환경)
  const migrationsDir = env.MIGRATIONS_PATH ?? path.join(__dirname, 'migrations');

  // migrations 디렉토리가 없으면 건너뜀 (초기 상태 허용)
  if (!fs.existsSync(migrationsDir)) {
    console.log('[DB] migrations 디렉토리 없음. 마이그레이션 건너뜀.');
    return;
  }

  // .sql 파일만 추려서 파일명 오름차순 정렬 (001 → 002 → ...)
  const sqlFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (sqlFiles.length === 0) {
    console.log('[DB] 적용할 마이그레이션 파일 없음.');
    return;
  }

  // 이미 적용된 마이그레이션 목록 조회
  const applied = db
    .prepare('SELECT filename FROM schema_migrations')
    .all() as { filename: string }[];
  const appliedSet = new Set(applied.map((r) => r.filename));

  let appliedCount = 0;

  for (const filename of sqlFiles) {
    if (appliedSet.has(filename)) {
      // 이미 실행된 파일: 건너뜀
      continue;
    }

    const filePath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filePath, 'utf-8');

    // 파일 전체를 트랜잭션으로 실행 (실패 시 자동 롤백)
    const migrate = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(filename);
    });

    try {
      migrate();
      console.log(`[DB] 마이그레이션 적용 완료: ${filename}`);
      appliedCount++;
    } catch (err) {
      // 마이그레이션 실패 시 서버 기동을 중단한다.
      // DB 불일치 상태에서 서버가 기동되면 데이터 손상 위험이 있음.
      console.error(`[DB] 마이그레이션 실패: ${filename}`, err);
      throw new Error(`DB 마이그레이션 실패로 서버를 기동할 수 없습니다. 파일: ${filename}`);
    }
  }

  if (appliedCount === 0) {
    console.log('[DB] 모든 마이그레이션이 이미 적용되어 있습니다.');
  } else {
    console.log(`[DB] 총 ${appliedCount}개의 마이그레이션 적용 완료.`);
  }
}

// ============================================================
// 기본 사용자 시딩
//
// 최초 실행 시 users 테이블이 비어 있으면 기본 계정 3개를 생성한다.
// - admin / adcheck2026 / role: admin
// - tech1 / adcheck2026 / role: tech_team
// - ad1   / adcheck2026 / role: ad_team
//
// 주의: password_hash 컬럼은 migration 003에서 추가된 이후에만 사용 가능하다.
//       runMigrations() 실행 후 호출해야 한다.
// ============================================================
async function seedDefaultUsers(): Promise<void> {
  // 이미 사용자가 존재하면 시딩 건너뜀
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  if (count > 0) {
    return;
  }

  console.log('[DB] 기본 사용자 시딩 시작...');

  const defaultUsers = [
    { username: 'admin',  display_name: '관리자', role: 'admin',     password: 'adcheck2026' },
    { username: 'tech1',  display_name: '기술팀1', role: 'tech_team', password: 'adcheck2026' },
    { username: 'ad1',    display_name: '광고팀1', role: 'ad_team',   password: 'adcheck2026' },
  ];

  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO users (username, display_name, role, password_hash, is_active, created_at, updated_at)
    VALUES (@username, @display_name, @role, @password_hash, 1, @now, @now)
  `);

  for (const user of defaultUsers) {
    // bcrypt 해시 생성 (rounds=10)
    const password_hash = await bcrypt.hash(user.password, 10);
    insert.run({
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      password_hash,
      now,
    });
    console.log(`[DB] 기본 사용자 생성: ${user.username} (${user.role})`);
  }

  console.log('[DB] 기본 사용자 시딩 완료. 초기 비밀번호: adcheck2026');
}

// 서버 기동 시 마이그레이션 자동 실행
initMigrationTable();
runMigrations();

// 기본 사용자 시딩 (비동기 - 서버 기동과 병렬로 실행되어도 무관)
seedDefaultUsers().catch((err) => {
  console.error('[DB] 기본 사용자 시딩 실패:', err);
});

export default db;
