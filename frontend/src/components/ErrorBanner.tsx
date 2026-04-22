/**
 * ErrorBanner 컴포넌트
 *
 * 화면 상단에 표시하는 오류 배너.
 * lucide-react AlertCircle 아이콘으로 시각적 명확성 개선.
 * 오류 메시지 + 다시 시도 버튼으로 구성.
 */

import { AlertCircle } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-[rgba(255,245,245,0.96)] px-4 py-3 text-sm text-rose-900 shadow-[0_10px_24px_rgba(132,51,53,0.08)]">
      {/* 아이콘 + 메시지 */}
      <div className="flex items-center gap-2.5 min-w-0">
        <AlertCircle size={16} className="text-rose-500 shrink-0" />
        <span className="font-medium">주의: {message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="app-btn app-btn--secondary app-btn--sm shrink-0"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}
