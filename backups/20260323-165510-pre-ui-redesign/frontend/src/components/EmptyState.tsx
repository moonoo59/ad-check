/**
 * EmptyState 컴포넌트
 *
 * 데이터가 없는 빈 상태를 안내하는 영역.
 * 아이콘(선택) + 메시지 + 액션 버튼(선택)으로 구성.
 */

interface EmptyStateProps {
  message: string;
  subMessage?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ message, subMessage, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
      {/* 기본 아이콘 */}
      <div className="text-4xl mb-3 text-gray-300">📋</div>
      <p className="text-sm font-medium text-gray-600 mb-1">{message}</p>
      {subMessage && <p className="text-xs text-gray-400 mb-4">{subMessage}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
