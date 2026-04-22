/**
 * SideDrawer 컴포넌트
 *
 * 화면 우측에서 슬라이드 인하는 드로어 패널.
 * 채널 변경 이력, 사용자 생성 폼 등 보조 정보 표시에 사용.
 * lucide-react X 아이콘으로 닫기 버튼 개선.
 *
 * 접근성:
 * - role="dialog", aria-modal="true"
 * - 외부 클릭 또는 닫기 버튼으로 닫힘
 */

import React from 'react';
import { X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

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
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgba(49,35,25,0.18)] backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex outline-none"
          style={{ width }}
        >
          <div className="app-drawer-panel relative flex h-full w-full flex-col overflow-hidden">
            <div className="border-b border-[var(--app-border)] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="app-eyebrow">Details</p>
                  <DialogPrimitive.Title asChild>
                    <h2 className="text-base font-semibold text-[var(--app-text)]">{title}</h2>
                  </DialogPrimitive.Title>
                </div>
                <DialogPrimitive.Close asChild>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-text-soft)] transition-colors hover:bg-[rgba(120,88,68,0.08)] hover:text-[var(--app-text)]"
                    aria-label="닫기"
                  >
                    <X size={16} />
                  </button>
                </DialogPrimitive.Close>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
