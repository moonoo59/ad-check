import path from 'path';
import { env } from '../config/env';

function isWithinRoot(rootPath: string, targetPath: string): boolean {
  return targetPath === rootPath || targetPath.startsWith(`${rootPath}${path.sep}`);
}

export function resolvePathWithinRoot(
  rootPath: string,
  targetPath: string,
  label = '경로',
): string {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);

  if (!isWithinRoot(resolvedRoot, resolvedTarget)) {
    throw new Error(`${label}가 허용된 루트 경로를 벗어났습니다.`);
  }

  return resolvedTarget;
}

export function joinPathWithinRoot(
  rootPath: string,
  segments: string[],
  label = '경로',
): string {
  const joinedPath = path.join(rootPath, ...segments);
  return resolvePathWithinRoot(rootPath, joinedPath, label);
}

/**
 * 로컬 전달 스토리지 경로 traversal 차단 헬퍼
 *
 * copy.service, delivery-cleanup.service, 다운로드 API 등에서
 * LOCAL_DELIVERY_PATH 루트를 벗어나는 경로를 차단한다.
 *
 * @param targetPath 검증할 경로 (절대 경로 또는 상대 경로)
 */
export function resolveDeliveryPath(targetPath: string): string {
  try {
    return resolvePathWithinRoot(env.LOCAL_DELIVERY_PATH, targetPath, '전달 스토리지 경로');
  } catch (primaryError) {
    // 이전 버전에서 잘못 저장된 레거시 전달 경로도 정리/다운로드 호환을 위해 허용한다.
    if (env.LEGACY_LOCAL_DELIVERY_PATH) {
      try {
        return resolvePathWithinRoot(env.LEGACY_LOCAL_DELIVERY_PATH, targetPath, '전달 스토리지 경로');
      } catch {
        // no-op: 아래에서 원래 오류를 다시 던진다.
      }
    }
    throw primaryError;
  }
}
