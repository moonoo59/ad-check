/**
 * Progress 컴포넌트 (shadcn/ui 기반)
 *
 * 파일 복사 진행률 등 퍼센트 기반 진행 상태 표시.
 * RequestDetailPage의 CopyProgressRow에서 활용.
 *
 * value: 0~100 (null/undefined 시 인디터미네이트 애니메이션)
 */

import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '@/lib/utils';

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      'relative h-2 w-full overflow-hidden rounded-full bg-[rgba(120,88,68,0.12)]',
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-sky-500 transition-all duration-500"
      style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
