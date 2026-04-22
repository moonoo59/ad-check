/**
 * Label 컴포넌트 (shadcn/ui 기반)
 *
 * @radix-ui/react-label 래핑 컴포넌트.
 * 기존 .app-label 스타일(전체 대문자, 작은 크기, 볼드)을 그대로 적용.
 */

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      // 기존 app-label 스타일과 동일
      'block mb-1.5 text-[11px] font-bold tracking-[0.08em] uppercase text-[var(--app-text-soft)]',
      'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className
    )}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
