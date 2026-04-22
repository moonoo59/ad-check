/**
 * 파일 탐색 및 매칭 알고리즘
 *
 * Logger Storage 파일명 패턴: {채널}_{YYYYMMDD}_{HHMMSS}_{HHMM}.avi
 * - {HHMM}은 종료 시각 (시분), 길이가 아님
 * - 자정 넘김: 종료 HH < 시작 HH → 종료 날짜 +1일 적용 (필수)
 *
 * 매칭 점수 (match_score: 0~100):
 *   +60: monitoring_time이 파일 범위(start~end) 내 포함
 *   +30: 요청 시간대와 파일 범위가 겹침
 *   +10: 겹침 비율이 요청 범위의 50% 이상
 *
 * 이 모듈은 순수 함수만 포함 (DB/파일시스템 접근 없음).
 * files.service.ts에서 파일시스템 탐색 후 이 함수를 호출한다.
 *
 * 참고: .claude/docs/file-matching-spec.md
 */
import path from 'path';
import fs from 'fs';
import { createLogger } from '../../common/logger';

const log = createLogger('FileMatcher');

// 파일명 파싱 결과 타입
export interface ParsedFile {
  channel: string;
  dateStr: string;        // YYYYMMDD
  startTime: Date;        // 파싱+보정된 시작 DateTime
  endTime: Date;          // 파싱+보정된 종료 DateTime (자정 넘김 처리 완료)
  filePath: string;
  fileName: string;
  fileSizeBytes: number | null;
  fileMtime: string | null;
  fileStartTimeStr: string;  // HH:MM:SS 형식 (화면 표시용)
  fileEndTimeStr: string;    // HH:MM:SS 형식 (화면 표시용, 자정 넘김 포함)
}

// 매칭 결과 타입
export interface FileMatch extends ParsedFile {
  matchScore: number;
  matchReason: string;
}

// 요청 항목 정보 (매칭 계산용)
export interface ReqItemForMatch {
  broadcast_date: string;   // YYYY-MM-DD
  req_time_start: string;   // HH:MM
  req_time_end: string;     // HH:MM
  monitoring_time: string;  // HH:MM 또는 HH:MM:SS
}

/**
 * 파일명 파싱
 *
 * 파일명 형식: {채널}_{YYYYMMDD}_{HHMMSS}_{HHMM}.avi
 * 반환: null이면 패턴 불일치 (무시할 파일)
 */
export function parseFileName(filePath: string): ParsedFile | null {
  const fileName = path.basename(filePath);
  // 패턴: 채널_날짜(8자리)_시작시각(6자리)_종료시각(4자리).avi
  const match = fileName.match(/^([A-Z0-9]+)_(\d{8})_(\d{6})_(\d{4})\.avi$/i);
  if (!match) return null;

  const [, channel, dateStr, startHHMMSS, endHHMM] = match;

  // 날짜 파싱
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(4, 6), 10) - 1;  // 0-indexed
  const day = parseInt(dateStr.slice(6, 8), 10);

  // 시작 시각 파싱 (HHMMSS)
  const startH = parseInt(startHHMMSS.slice(0, 2), 10);
  const startM = parseInt(startHHMMSS.slice(2, 4), 10);
  const startS = parseInt(startHHMMSS.slice(4, 6), 10);

  // 종료 시각 파싱 (HHMM)
  const endH = parseInt(endHHMM.slice(0, 2), 10);
  const endM = parseInt(endHHMM.slice(2, 4), 10);

  // 시작 DateTime 구성
  const startTime = new Date(year, month, day, startH, startM, startS);

  // 종료 DateTime 구성 (처음엔 같은 날짜)
  let endTime = new Date(year, month, day, endH, endM, 0);

  // 자정 넘김 처리:
  // - 종료 HH < 시작 HH: 명확한 자정 넘김
  // - 종료 HH == 시작 HH && 종료 MM < 시작 MM: 동일 시 자정 넘김
  if (
    endH < startH ||
    (endH === startH && endM < startM)
  ) {
    endTime = new Date(year, month, day + 1, endH, endM, 0);
  }

  // 파일 크기와 mtime 조회
  let fileSizeBytes: number | null = null;
  let fileMtime: string | null = null;
  try {
    const stat = fs.statSync(filePath);
    fileSizeBytes = stat.size;
    fileMtime = stat.mtime.toISOString();
  } catch {
    // 파일 접근 불가 시 null 유지
  }

  // 화면 표시용 시각 문자열 (HH:MM:SS)
  const fileStartTimeStr = `${pad(startH)}:${pad(startM)}:${pad(startS)}`;
  const fileEndTimeStr = `${pad(endTime.getHours())}:${pad(endTime.getMinutes())}:00`;

  return {
    channel,
    dateStr,
    startTime,
    endTime,
    filePath,
    fileName,
    fileSizeBytes,
    fileMtime,
    fileStartTimeStr,
    fileEndTimeStr,
  };
}

/**
 * 매칭 점수 계산
 *
 * @param file 파싱된 파일 정보
 * @param item 요청 항목 정보
 * @returns { score, reason } score=0이면 결과에 포함하지 않음
 */
export function computeMatchScore(
  file: ParsedFile,
  item: ReqItemForMatch,
): { score: number; reason: string } {
  // 요청 시간대 절대 DateTime 계산
  const [reqDateY, reqDateM, reqDateD] = item.broadcast_date.split('-').map(Number);
  const [reqStartH, reqStartM] = item.req_time_start.split(':').map(Number);
  const [reqEndH, reqEndM] = item.req_time_end.split(':').map(Number);

  const reqStart = new Date(reqDateY, reqDateM - 1, reqDateD, reqStartH, reqStartM, 0);
  let reqEnd = new Date(reqDateY, reqDateM - 1, reqDateD, reqEndH, reqEndM, 0);

  // 요청 시간대도 자정 넘김 가능
  if (reqEnd <= reqStart) {
    reqEnd = new Date(reqDateY, reqDateM - 1, reqDateD + 1, reqEndH, reqEndM, 0);
  }

  // monitoring_time 절대 DateTime 계산
  const monParts = item.monitoring_time.split(':').map(Number);
  const monH = monParts[0];
  const monM = monParts[1];
  const monS = monParts[2] ?? 0;
  let monTime = new Date(reqDateY, reqDateM - 1, reqDateD, monH, monM, monS);

  // monitoring_time도 자정 넘김 가능 (req_time_start보다 작으면)
  if (monH < reqStartH || (monH === reqStartH && monM < reqStartM)) {
    monTime = new Date(reqDateY, reqDateM - 1, reqDateD + 1, monH, monM, monS);
  }

  let score = 0;
  const reasons: string[] = [];

  // 조건 1: monitoring_time이 파일 범위 내 포함 (+60점)
  if (file.startTime <= monTime && monTime < file.endTime) {
    score += 60;
    reasons.push(
      `모니터링 송출시간(${item.monitoring_time})이 파일 범위(${file.fileStartTimeStr}~${file.fileEndTimeStr}) 내 포함`,
    );
  } else {
    reasons.push(
      `모니터링 송출시간(${item.monitoring_time})이 파일 범위(${file.fileStartTimeStr}~${file.fileEndTimeStr}) 밖`,
    );
  }

  // 조건 2: 요청 시간대와 파일 범위 겹침 (+30점)
  const overlapStart = file.startTime > reqStart ? file.startTime : reqStart;
  const overlapEnd = file.endTime < reqEnd ? file.endTime : reqEnd;

  if (overlapStart < overlapEnd) {
    score += 30;
    const overlapMinutes = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 60000);
    reasons.push(`요청 시간대(${item.req_time_start}~${item.req_time_end})와 파일 범위 겹침(${overlapMinutes}분)`);

    // 조건 3: 겹침 비율 50% 이상 (+10점)
    const reqDuration = reqEnd.getTime() - reqStart.getTime();
    if (reqDuration > 0) {
      const overlapRatio = (overlapEnd.getTime() - overlapStart.getTime()) / reqDuration;
      if (overlapRatio >= 0.5) {
        score += 10;
        reasons.push(`겹침 비율 ${Math.round(overlapRatio * 100)}% (50% 이상)`);
      }
    }
  } else {
    reasons.push(`요청 시간대(${item.req_time_start}~${item.req_time_end})와 파일 범위 겹침 없음`);
  }

  return {
    score,
    reason: reasons.join(' / '),
  };
}

/**
 * 특정 요청 항목에 대한 매칭 파일 목록 탐색
 *
 * @param item 요청 항목 정보
 * @param storageFolder Logger Storage 채널 폴더명 (예: ETV)
 * @param storageMount Logger Storage 마운트 경로 (예: /Volumes/LoggerStorage)
 * @returns 매칭 결과 목록 (score>0인 파일만, score 내림차순)
 */
export function findMatchingFiles(
  item: ReqItemForMatch,
  storageFolder: string,
  storageMount: string,
): FileMatch[] {
  const broadcastDate = item.broadcast_date;  // YYYY-MM-DD

  // 탐색할 날짜 디렉토리 목록 구성
  // Logger Storage 실제 폴더 구조: {채널}/{YYYY}/{MM}/{DD}/
  // broadcast_date(YYYY-MM-DD)를 분리하여 연/월/일 경로로 조합
  // 예: "2026-03-02" → path.join(mount, channel, "2026", "03", "02")
  const dateToDirPath = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return path.join(storageMount, storageFolder, y, m, d);
  };

  const dirs: string[] = [
    dateToDirPath(broadcastDate),
  ];

  const [reqEndH, reqEndM] = item.req_time_end.split(':').map(Number);
  const [reqStartH] = item.req_time_start.split(':').map(Number);

  if (reqEndH < reqStartH || (reqEndH === reqStartH && reqEndM < parseInt(item.req_time_start.split(':')[1], 10))) {
    // 자정 넘김 요청: 다음날 폴더도 탐색
    const nextDate = getNextDate(broadcastDate);
    dirs.push(dateToDirPath(nextDate));
  }

  const results: FileMatch[] = [];

  log.debug(`파일 탐색 시작`, {
    storageFolder,
    broadcastDate,
    req_time_start: item.req_time_start,
    req_time_end: item.req_time_end,
    monitoring_time: item.monitoring_time,
    scanDirs: dirs,
  });

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      log.warn(`탐색 디렉토리 없음 — 해당 날짜에 녹화 파일이 없거나 채널명 불일치 가능`, { dir });
      continue;
    }

    let files: string[];
    try {
      files = fs.readdirSync(dir);
    } catch (err) {
      log.error(`디렉토리 읽기 실패`, { dir, error: err instanceof Error ? err.message : String(err) });
      continue;
    }

    const aviFiles = files.filter((f) => f.toLowerCase().endsWith('.avi'));
    log.debug(`디렉토리 스캔 완료`, { dir, totalFiles: files.length, aviFiles: aviFiles.length });

    let parseFailed = 0;
    let scoreZero = 0;

    for (const fileName of aviFiles) {
      const filePath = path.join(dir, fileName);
      const parsed = parseFileName(filePath);
      if (!parsed) {
        parseFailed++;
        log.debug(`파일명 파싱 실패 (패턴 불일치)`, { fileName });
        continue;
      }

      const { score, reason } = computeMatchScore(parsed, item);
      if (score <= 0) {
        scoreZero++;
        log.debug(`매칭 점수 0 — 제외`, { fileName, reason });
        continue;
      }

      log.debug(`매칭 파일 발견`, { fileName, score, reason });
      results.push({ ...parsed, matchScore: score, matchReason: reason });
    }

    if (parseFailed > 0 || scoreZero > 0) {
      log.debug(`스캔 요약`, { dir, parseFailed, scoreZero, matched: results.length });
    }
  }

  // match_score 내림차순 정렬
  results.sort((a, b) => b.matchScore - a.matchScore);

  log.info(`파일 탐색 완료`, {
    storageFolder,
    broadcastDate,
    matched: results.length,
    topScore: results[0]?.matchScore ?? null,
    topFile: results[0]?.fileName ?? null,
  });

  return results;
}

/**
 * YYYY-MM-DD 형식 날짜의 다음날 반환
 *
 * 주의: toISOString()은 UTC로 변환하므로 KST(+09:00)에서는
 *       자정 기준 Date를 UTC 변환하면 전날 날짜가 나온다.
 *       → 문자열 기반 날짜 계산으로 timezone 이슈 완전 회피
 */
function getNextDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  // 로컬 날짜 객체로 +1일 계산 (UTC 변환 없이 날짜 부분만 추출)
  const next = new Date(y, m - 1, d + 1);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
}

/** 2자리 숫자 패딩 (예: 9 → '09') */
function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
