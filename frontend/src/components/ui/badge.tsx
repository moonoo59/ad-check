/**
 * Badge 컴포넌트 (shadcn/ui 기반)
 *
 * 상태, 역할, 태그 등을 표시하는 인라인 배지.
 * StatusBadge 내부에서 사용하거나 독립적으로도 활용 가능.
 *
 * variant:
 *   - default: 기본 (브라운 계열)
 *   - secondary: 중립 회색
 *   - destructive: 오류/위험 (빨간 계열)
 *   - outline: 테두리만
 *   - success: 성공/완료 (초록 계열)
 *   - warning: 경고/주의 (노란 계열)
 *   - info: 진행 중 (파란 계열)
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em] transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
  {
    variants: {
      variant: {
        // 기본 — 브라운 계열
        default:
          'border border-[rgba(120,88,68,0.25)] bg-[var(--app-primary-soft)] text-[var(--app-primary)]',
        // 중립 — 그레이 계열
        secondary:
          'border border-stone-200 bg-stone-100 text-stone-700',
        // 오류/실패 — 기존 StatusBadge red 대응
        destructive:
          'border border-rose-200 bg-rose-50 text-rose-800',
        // 테두리만
        outline:
          'border border-[var(--app-border)] text-[var(--app-text-soft)]',
        // 성공/완료 — 기존 StatusBadge green 대응
        success:
          'border border-emerald-200 bg-emerald-50 text-emerald-800',
        // 경고 — 기존 StatusBadge yellow 대응
        warning:
          'border border-amber-200 bg-amber-50 text-amber-800',
        // 진행 중 — 기존 StatusBadge blue 대응
        info:
          'border border-sky-200 bg-sky-50 text-sky-800',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
