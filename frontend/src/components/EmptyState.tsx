/**
 * EmptyState 컴포넌트
 *
 * 데이터가 없는 빈 상태를 안내하는 영역.
 * lucide-react 아이콘 + 메시지 + 액션 버튼(선택)으로 구성.
 * icon prop으로 커스텀 아이콘 전달 가능 (기본: InboxIcon).
 */

import { type LucideIcon, Inbox } from 'lucide-react';

interface EmptyStateProps {
  message: string;
  subMessage?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** 커스텀 아이콘 (lucide-react 아이콘 컴포넌트). 기본값: Inbox */
  icon?: LucideIcon;
}

export default function EmptyState({
  message,
  subMessage,
  actionLabel,
  onAction,
  icon: Icon = Inbox,
}: EmptyStateProps) {
  return (
    <div className="app-empty">
      {/* 아이콘 원형 배경 */}
      <div className="app-empty__mark">
        <Icon size={22} strokeWidth={1.5} />
      </div>
      <p className="app-empty__title">{message}</p>
      {subMessage && <p className="app-empty__description">{subMessage}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="app-btn app-btn--primary mt-4"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
