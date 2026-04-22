/**
 * PageHeader 컴포넌트
 *
 * 모든 페이지의 최상단 헤더 영역.
 * 왼쪽: 페이지 제목 / 오른쪽: 액션 버튼 슬롯
 */

import React from 'react';

interface PageHeaderProps {
  title: string;
  children?: React.ReactNode; // 우측 액션 버튼 영역
}

export default function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
