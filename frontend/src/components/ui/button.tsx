/**
 * Button 컴포넌트 (shadcn/ui 기반)
 *
 * 기존 .app-btn 클래스 대신 사용할 수 있는 타입 안전한 버튼 컴포넌트.
 * variant와 size를 prop으로 전달하여 일관된 스타일을 유지.
 *
 * variant:
 *   - default: 주요 액션 (파란/브라운 배경)
 *   - destructive: 위험/삭제 액션 (빨간 배경)
 *   - outline: 테두리 버튼
 *   - secondary: 보조 버튼
 *   - ghost: 배경 없음
 *   - link: 링크 스타일
 *
 * asChild: true 시 Slot으로 렌더링 (Link 등 래핑 가능)
 */

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // 기본 — 기존 app-btn--primary 대응 (웜 브라운 그라디언트)
        default:
          'bg-gradient-to-b from-[#86624b] to-[var(--app-primary)] border border-[rgba(97,69,51,0.34)] text-[#fffdf9] shadow-[0_12px_20px_rgba(120,88,68,0.18)] hover:-translate-y-px hover:from-[#7a5a45] hover:to-[var(--app-primary-hover)] focus-visible:ring-[var(--app-primary)]',
        // 위험/삭제 — 기존 app-btn--danger 대응
        destructive:
          'bg-gradient-to-b from-[#a35847] to-[var(--app-danger)] border border-[rgba(122,59,48,0.32)] text-[#fffaf7] shadow-[0_12px_20px_rgba(148,77,62,0.18)] hover:-translate-y-px hover:from-[#944d3e] hover:to-[var(--app-danger-hover)] focus-visible:ring-[var(--app-danger)]',
        // 테두리 — 기존 app-btn--secondary 대응
        outline:
          'border border-[var(--app-border)] bg-[rgba(255,252,247,0.9)] text-[var(--app-text)] hover:-translate-y-px hover:bg-[#fffaf3] hover:border-[var(--app-border-strong)] focus-visible:ring-[var(--app-primary)]',
        // 보조 — app-btn--secondary 동일
        secondary:
          'border border-[var(--app-border)] bg-[rgba(255,252,247,0.9)] text-[var(--app-text)] hover:-translate-y-px hover:bg-[#fffaf3] hover:border-[var(--app-border-strong)] focus-visible:ring-[var(--app-primary)]',
        // 소프트 — 기존 app-btn--soft 대응
        soft:
          'bg-[var(--app-primary-soft)] border border-[rgba(120,88,68,0.12)] text-[var(--app-primary)] hover:-translate-y-px hover:bg-[#e2cfbf] focus-visible:ring-[var(--app-primary)]',
        // 고스트 — 기존 app-btn--ghost 대응
        ghost:
          'text-[var(--app-text-soft)] hover:bg-[rgba(120,88,68,0.06)] hover:text-[var(--app-text)] focus-visible:ring-[var(--app-primary)]',
        // 링크 스타일
        link:
          'text-[var(--app-primary)] underline-offset-4 hover:underline focus-visible:ring-[var(--app-primary)]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-[34px] px-3 text-xs',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** true 시 자식 요소를 Slot으로 렌더링 (Link 등 래핑 가능) */
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
