/**
 * Tailwind + clsx 유틸리티 함수
 *
 * shadcn/ui 컴포넌트에서 className 조합 시 사용.
 * clsx로 조건부 클래스를 처리하고, tailwind-merge로 중복/충돌 Tailwind 클래스를 정리.
 *
 * 사용 예:
 *   cn('px-4 py-2', isActive && 'bg-blue-500', className)
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
