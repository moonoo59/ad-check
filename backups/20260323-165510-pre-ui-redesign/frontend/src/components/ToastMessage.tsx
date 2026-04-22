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
    success: 'bg-green-100 text-green-800 border-green-300',
    error:   'bg-red-100 text-red-800 border-red-300',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-300',
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
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-2 px-4 py-3 rounded border text-sm shadow-md pointer-events-auto
              transition-all duration-300 ${TYPE_CLASSES[toast.type]}`}
          >
            <span className="font-bold">{TYPE_ICONS[toast.type]}</span>
            <span>{toast.message}</span>
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
