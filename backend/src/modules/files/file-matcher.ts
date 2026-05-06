/**
 * 파일 탐색 및 매칭 알고리즘 (비동기 버전)
 */
import path from 'path';
import fs from 'fs/promises';
import { createLogger } from '../../common/logger';
import { joinPathWithinRoot } from '../../common/path-guards';
import { withTimeout, existsAsync } from '../../common/fs-utils';

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
 */
export async function parseFileName(filePath: string): Promise<ParsedFile | null> {
  const fileName = path.basename(filePath);
  const match = fileName.match(/^([A-Z0-9]+)_(\d{8})_(\d{6})_(\d{4})\.avi$/i);
  if (!match) return null;

  const [, channel, dateStr, startHHMMSS, endHHMM] = match;
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(4, 6), 10) - 1;
  const day = parseInt(dateStr.slice(6, 8), 10);

  const startH = parseInt(startHHMMSS.slice(0, 2), 10);
  const startM = parseInt(startHHMMSS.slice(2, 4), 10);
  const startS = parseInt(startHHMMSS.slice(4, 6), 10);

  const endH = parseInt(endHHMM.slice(0, 2), 10);
  const endM = parseInt(endHHMM.slice(2, 4), 10);

  const startTime = new Date(year, month, day, startH, startM, startS);
  let endTime = new Date(year, month, day, endH, endM, 0);

  if (endH < startH || (endH === startH && endM < startM)) {
    endTime = new Date(year, month, day + 1, endH, endM, 0);
  }

  let fileSizeBytes: number | null = null;
  let fileMtime: string | null = null;
  try {
    // 네트워크 볼륨 stat에 타임아웃 적용
    const stat = await withTimeout(fs.stat(filePath), 2000, `파일 정보 조회: ${fileName}`);
    fileSizeBytes = stat.size;
    fileMtime = stat.mtime.toISOString();
  } catch {
    // 접근 불가 시 로깅만 하고 무시
  }

  const fileStartTimeStr = `${pad(startH)}:${pad(startM)}:${pad(startS)}`;
  const fileEndTimeStr = `${pad(endTime.getHours())}:${pad(endTime.getMinutes())}:00`;

  return {
    channel, dateStr, startTime, endTime, filePath, fileName,
    fileSizeBytes, fileMtime, fileStartTimeStr, fileEndTimeStr,
  };
}

/**
 * 매칭 점수 계산 (순수 로직 함수)
 */
export function computeMatchScore(
  file: ParsedFile,
  item: ReqItemForMatch,
): { score: number; reason: string } {
  const [reqDateY, reqDateM, reqDateD] = item.broadcast_date.split('-').map(Number);
  const [reqStartH, reqStartM] = item.req_time_start.split(':').map(Number);
  const [reqEndH, reqEndM] = item.req_time_end.split(':').map(Number);

  const reqStart = new Date(reqDateY, reqDateM - 1, reqDateD, reqStartH, reqStartM, 0);
  let reqEnd = new Date(reqDateY, reqDateM - 1, reqDateD, reqEndH, reqEndM, 0);

  if (reqEnd <= reqStart) {
    reqEnd = new Date(reqDateY, reqDateM - 1, reqDateD + 1, reqEndH, reqEndM, 0);
  }

  const monParts = item.monitoring_time.split(':').map(Number);
  const monH = monParts[0];
  const monM = monParts[1];
  const monS = monParts[2] ?? 0;
  let monTime = new Date(reqDateY, reqDateM - 1, reqDateD, monH, monM, monS);

  if (monH < reqStartH || (monH === reqStartH && monM < reqStartM)) {
    monTime = new Date(reqDateY, reqDateM - 1, reqDateD + 1, monH, monM, monS);
  }

  let score = 0;
  const reasons: string[] = [];

  if (file.startTime <= monTime && monTime < file.endTime) {
    score += 60;
    reasons.push(`모니터링 송출시간(${item.monitoring_time})이 파일 범위 내 포함`);
  } else {
    reasons.push(`모니터링 송출시간(${item.monitoring_time})이 파일 범위 밖`);
  }

  const overlapStart = file.startTime > reqStart ? file.startTime : reqStart;
  const overlapEnd = file.endTime < reqEnd ? file.endTime : reqEnd;

  if (overlapStart < overlapEnd) {
    score += 30;
    const overlapMinutes = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 60000);
    reasons.push(`요청 시간대와 파일 범위 겹침(${overlapMinutes}분)`);

    const reqDuration = reqEnd.getTime() - reqStart.getTime();
    if (reqDuration > 0) {
      const overlapRatio = (overlapEnd.getTime() - overlapStart.getTime()) / reqDuration;
      if (overlapRatio >= 0.5) {
        score += 10;
        reasons.push(`겹침 비율 50% 이상`);
      }
    }
  }

  return { score, reason: reasons.join(' / ') };
}

/**
 * 특정 요청 항목에 대한 매칭 파일 목록 탐색 (비동기)
 */
export async function findMatchingFiles(
  item: ReqItemForMatch,
  storageFolder: string,
  storageMount: string,
): Promise<FileMatch[]> {
  const broadcastDate = item.broadcast_date;

  const dateToDirPath = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return joinPathWithinRoot(storageMount, [storageFolder, y, m, d], 'Logger Storage 탐색 경로');
  };

  let dirs: string[];
  try {
    dirs = [dateToDirPath(broadcastDate)];
  } catch {
    return [];
  }

  const [reqEndH, reqEndM] = item.req_time_end.split(':').map(Number);
  const [reqStartH] = item.req_time_start.split(':').map(Number);

  if (reqEndH < reqStartH || (reqEndH === reqStartH && reqEndM < parseInt(item.req_time_start.split(':')[1], 10))) {
    const nextDate = getNextDate(broadcastDate);
    try {
      dirs.push(dateToDirPath(nextDate));
    } catch { /* ignored */ }
  }

  const results: FileMatch[] = [];

  for (const dir of dirs) {
    // macOS 다이얼로그 블로킹 방지를 위한 타임아웃 존재 확인
    if (!(await existsAsync(dir, 3000))) {
      log.warn(`디렉토리 접근 실패(타임아웃 또는 미존재)`, { dir });
      continue;
    }

    let files: string[];
    try {
      files = await withTimeout(fs.readdir(dir), 3000, `디렉토리 읽기: ${dir}`);
    } catch (err) {
      log.error(`디렉토리 읽기 실패`, { dir, error: err instanceof Error ? err.message : String(err) });
      continue;
    }

    const aviFiles = files.filter((f) => f.toLowerCase().endsWith('.avi'));
    
    // 파일 파싱 병렬 처리 (개별 stat에도 타임아웃 있음)
    const matches = await Promise.all(
      aviFiles.map(async (fileName) => {
        const filePath = path.join(dir, fileName);
        const parsed = await parseFileName(filePath);
        if (!parsed) return null;

        const { score, reason } = computeMatchScore(parsed, item);
        if (score <= 0) return null;

        return { ...parsed, matchScore: score, matchReason: reason } as FileMatch;
      })
    );

    for (const m of matches) {
      if (m) results.push(m);
    }
  }

  results.sort((a, b) => b.matchScore - a.matchScore);
  return results;
}

function getNextDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(y, m - 1, d + 1);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
