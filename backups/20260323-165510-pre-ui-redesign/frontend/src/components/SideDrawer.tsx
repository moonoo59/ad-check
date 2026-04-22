/**
 * SideDrawer 컴포넌트
 *
 * 화면 우측에서 슬라이드 인하는 드로어 패널.
 * 채널 변경 이력 등 보조 정보 표시에 사용.
 *
 * 접근성:
 * - role="dialog", aria-modal="true"
 * - 외부 클릭 또는 닫기 버튼으로 닫힘
 */

import React from 'react';

interface SideDrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string; // CSS width (기본 360px)
}

export default function SideDrawer({
  open,
  title,
  onClose,
  children,
  width = '360px',
}: SideDrawerProps) {
  if (!open) return null;

  return (
    // 배경 오버레이
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/20"
      onClick={onClose}
    >
      {/* 드로어 패널 */}
      <div
        className="relative bg-white h-full shadow-xl flex flex-col overflow-hidden"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* 드로어 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        {/* 드로어 내용 */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
