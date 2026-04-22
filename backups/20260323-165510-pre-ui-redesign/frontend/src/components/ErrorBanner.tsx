/**
 * ErrorBanner 컴포넌트
 *
 * 화면 상단에 표시하는 오류 배너.
 * 오류 메시지 + 다시 시도 버튼으로 구성.
 */

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded p-4 text-sm text-red-700 mb-4">
      <span>⚠ {message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-4 px-3 py-1 border border-red-300 rounded hover:bg-red-100 text-red-700 text-xs"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}
