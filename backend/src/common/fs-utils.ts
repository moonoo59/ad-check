import fs from 'fs/promises';

/**
 * 특정 시간(ms) 내에 프로미스가 완료되지 않으면 에러를 던집니다.
 * macOS 보안 다이얼로그 등으로 인한 블로킹을 방지하기 위해 사용합니다.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorContext: string,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`[Timeout] ${errorContext} (응답 대기 시간 ${timeoutMs}ms 초과)`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

/**
 * 경로가 존재하는지 타임아웃을 걸어 확인합니다.
 */
export async function existsAsync(path: string, timeoutMs: number = 3000): Promise<boolean> {
  try {
    await withTimeout(fs.access(path), timeoutMs, `경로 접근 확인: ${path}`);
    return true;
  } catch {
    return false;
  }
}
