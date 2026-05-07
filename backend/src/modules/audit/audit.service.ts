import db from '../../config/database';
import { createLogger } from '../../common/logger';

const log = createLogger('Audit');

/**
 * 오래된 DB 감사 로그 자동 정리 (기본 365일)
 * audit_logs, resend_logs, mount_logs 테이블 대상
 */
export function cleanupOldAuditLogs(daysToKeep = 365): void {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    // SQLite에 저장된 형태와 맞추기 위해 ISO string 사용
    const cutoffDateStr = cutoffDate.toISOString();

    const stmtAudit = db.prepare('DELETE FROM audit_logs WHERE created_at < ?');
    const resultAudit = stmtAudit.run(cutoffDateStr);

    const stmtResend = db.prepare('DELETE FROM resend_logs WHERE created_at < ?');
    const resultResend = stmtResend.run(cutoffDateStr);

    const stmtMount = db.prepare('DELETE FROM mount_logs WHERE created_at < ?');
    const resultMount = stmtMount.run(cutoffDateStr);

    const totalDeleted = resultAudit.changes + resultResend.changes + resultMount.changes;
    if (totalDeleted > 0) {
      log.info(`오래된 DB 감사 로그 정리 완료 (${daysToKeep}일 경과)`, {
        audit_logs: resultAudit.changes,
        resend_logs: resultResend.changes,
        mount_logs: resultMount.changes,
      });
    }
  } catch (err: any) {
    log.error('DB 감사 로그 정리 중 오류 발생', { error: err.message });
  }
}
