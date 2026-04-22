/**
 * ToastMessage 컴포넌트 + useToast 훅
 *
 * 화면 우측 하단에 3초 후 자동 사라지는 알림 메시지를 표시한다.
 * success(녹색) / error(빨간) / warning(노란) 3가지 타입.
 *
 * 사용법:
 * 1. <ToastContainer /> 를 App 최상단에 렌더링
 * 2. const { showToast } = useToast()
 * 3. showToast('저장 완료', 'success')
 */

import { useState, useCallback, createContext, useContext } from 'react';
import React from 'react';

type ToastType = 'success' | 'error' | 'warning';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

let toastId = 0;

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    // error는 5초, 나머지는 3초 후 자동 제거
    const duration = type === 'error' ? 5000 : 3000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const TYPE_CLASSES: Record<ToastType, string> = {
    success: 'border-emerald-200/80 bg-[rgba(242,249,244,0.96)] text-emerald-900',
    error:   'border-rose-200/80 bg-[rgba(254,244,244,0.96)] text-rose-900',
    warning: 'border-amber-200/80 bg-[rgba(255,248,236,0.96)] text-amber-900',
  };

  const TYPE_ICONS: Record<ToastType, string> = {
    success: '✓',
    error:   '✕',
    warning: '!',
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* 토스트 컨테이너: 화면 우측 하단 */}
      <div
        className="pointer-events-none fixed bottom-5 right-5 z-50 flex max-w-sm flex-col gap-3"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-[0_18px_40px_rgba(73,48,26,0.12)] backdrop-blur
              transition-all duration-300 ${TYPE_CLASSES[toast.type]}`}
            role={toast.type === 'error' ? 'alert' : 'status'}
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
            aria-atomic="true"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/80 text-xs font-bold shadow-sm">
              {TYPE_ICONS[toast.type]}
            </span>
            <span className="leading-5">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast는 ToastProvider 내부에서 사용해야 합니다.');
  return ctx;
}
