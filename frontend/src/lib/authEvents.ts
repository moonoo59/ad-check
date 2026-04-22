const AUTH_INVALIDATED_EVENT = 'ad-check:auth-invalidated';

export interface AuthInvalidatedDetail {
  message?: string;
  errorCode?: string;
}

export function emitAuthInvalidated(detail: AuthInvalidatedDetail): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<AuthInvalidatedDetail>(AUTH_INVALIDATED_EVENT, { detail }));
}

export function subscribeAuthInvalidated(
  listener: (detail: AuthInvalidatedDetail) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<AuthInvalidatedDetail>;
    listener(customEvent.detail ?? {});
  };

  window.addEventListener(AUTH_INVALIDATED_EVENT, handler);
  return () => window.removeEventListener(AUTH_INVALIDATED_EVENT, handler);
}
