/**
 * 브라우저 알림 훅 (Notification API)
 *
 * 브라우저 푸시 알림 권한 요청 및 알림 전송 기능.
 * - 미지원 브라우저(알림 API 없음) 방어 처리
 * - 권한 상태: 'default' | 'granted' | 'denied'
 * - granted 상태에서만 알림 전송 가능
 *
 * 사용 예:
 *   const { permission, requestPermission, notify } = useNotification();
 *   await requestPermission();
 *   notify('파일 복사 완료', { body: '요청 #12 복사가 완료되었습니다.' });
 */

import { useState, useCallback } from 'react';

export type NotificationPermission = 'default' | 'granted' | 'denied' | 'unsupported';

interface UseNotificationReturn {
  /** 현재 알림 권한 상태 */
  permission: NotificationPermission;
  /** 알림 권한 요청 (이미 granted/denied면 현재 상태 반환) */
  requestPermission: () => Promise<NotificationPermission>;
  /** 알림 전송 (granted 상태가 아니면 무시) */
  notify: (title: string, options?: NotificationOptions) => void;
}

export function useNotification(): UseNotificationReturn {
  // 브라우저 지원 여부 확인
  const isSupported = typeof window !== 'undefined' && 'Notification' in window;

  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (!isSupported) return 'unsupported';
    return Notification.permission as NotificationPermission;
  });

  /**
   * 알림 권한 요청
   * - 이미 granted/denied면 바로 반환
   * - default 상태일 때 브라우저 권한 다이얼로그 표시
   */
  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!isSupported) return 'unsupported';

    if (Notification.permission !== 'default') {
      const current = Notification.permission as NotificationPermission;
      setPermission(current);
      return current;
    }

    try {
      const result = await Notification.requestPermission();
      const perm = result as NotificationPermission;
      setPermission(perm);
      return perm;
    } catch {
      // 일부 구형 브라우저에서 requestPermission이 콜백 기반일 수 있음
      // → 여기서는 그냥 현재 상태 반환
      const current = Notification.permission as NotificationPermission;
      setPermission(current);
      return current;
    }
  }, [isSupported]);

  /**
   * 알림 전송
   * - permission이 'granted'가 아니면 아무것도 하지 않음
   * - 포커스 없는 탭/창에서만 표시됨 (document.hidden 체크 없이 항상 전송)
   */
  const notify = useCallback((title: string, options?: NotificationOptions): void => {
    if (!isSupported || Notification.permission !== 'granted') return;

    try {
      new Notification(title, {
        icon: '/app-icon.svg',
        ...options,
      });
    } catch {
      // 알림 생성 실패는 조용히 무시 (비핵심 기능)
    }
  }, [isSupported]);

  return { permission, requestPermission, notify };
}
