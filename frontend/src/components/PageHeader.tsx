/**
 * PageHeader 컴포넌트
 *
 * 모든 페이지의 최상단 헤더 영역.
 * 왼쪽: 선택적 아이콘 + 페이지 제목 + 부제목
 * 오른쪽: 액션 버튼 슬롯
 *
 * icon prop으로 lucide-react 아이콘 컴포넌트를 전달하면
 * 제목 왼쪽에 아이콘이 표시되어 페이지 성격을 한눈에 파악 가능.
 */

import React from 'react';
import { type LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** 선택적 lucide-react 아이콘 (제목 왼쪽에 표시) */
  icon?: LucideIcon;
  /** 우측 액션 버튼 영역 */
  children?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, icon: Icon, children }: PageHeaderProps) {
  return (
    <div className="app-page-header">
      <div>
        <p className="app-eyebrow">Operations</p>
        {/* 아이콘이 있으면 제목과 함께 가로 배치 */}
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--app-primary-soft)] text-[var(--app-primary)] shrink-0">
              <Icon size={18} strokeWidth={1.8} />
            </span>
          )}
          <h1 className="app-page-header__title">{title}</h1>
        </div>
        {subtitle && <p className="app-page-header__lead">{subtitle}</p>}
      </div>
      {children && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {children}
        </div>
      )}
    </div>
  );
}
