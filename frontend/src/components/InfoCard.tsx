/**
 * InfoCard 컴포넌트
 *
 * 읽기 전용 정보를 레이블-값 쌍 그리드로 표시하는 카드.
 * 요청 상세 화면의 요청 헤더 정보 카드 등에 사용.
 */

import React from 'react';

export interface InfoItem {
  label: string;
  value: React.ReactNode;
  span?: boolean; // 전체 너비 차지 여부
}

interface InfoCardProps {
  items: InfoItem[];
  className?: string;
  compact?: boolean;
}

export default function InfoCard({ items, className = '', compact = false }: InfoCardProps) {
  return (
    <div className={`app-surface ${compact ? 'p-4' : 'p-6'} ${className}`}>
      <dl className={`grid grid-cols-1 md:grid-cols-2 ${compact ? 'gap-x-6 gap-y-3' : 'gap-x-8 gap-y-4'}`}>
        {items.map((item, i) => (
          <div key={i} className={item.span ? 'col-span-2' : ''}>
            <dt className={`app-label ${compact ? 'mb-0.5' : 'mb-1'}`}>{item.label}</dt>
            <dd className="text-sm text-[var(--app-text)]">{item.value ?? '-'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
