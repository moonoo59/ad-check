/**
 * Input 컴포넌트 (shadcn/ui 기반)
 *
 * 기존 .app-field 클래스 대신 사용할 수 있는 타입 안전한 입력 컴포넌트.
 * 기존 웜 그레이 팔레트에 맞춰 포커스 링 색상을 조정.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // 기존 app-field 스타일과 동일한 디자인
          'flex h-9 w-full rounded-2xl border border-[var(--app-border)] bg-[rgba(255,252,248,0.95)] px-3 py-1 text-sm text-[var(--app-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] transition-all',
          'placeholder:text-[var(--app-text-faint)]',
          'focus-visible:outline-none focus-visible:border-[#a3866f] focus-visible:ring-4 focus-visible:ring-[rgba(120,88,68,0.1)] focus-visible:bg-[#fffdf9]',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'disabled:cursor-not-allowed disabled:bg-[rgba(239,231,222,0.8)] disabled:opacity-70',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
