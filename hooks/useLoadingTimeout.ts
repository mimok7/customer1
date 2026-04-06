import { useEffect, useRef } from 'react';

/**
 * Safety timeout for loading/submitting states.
 * If `loading` stays true for longer than `timeoutMs`, it is forcibly reset
 * and the user is notified so the page doesn't get stuck at "처리중..." forever.
 */
export function useLoadingTimeout(
  loading: boolean,
  setLoading: (v: boolean) => void,
  timeoutMs = 60000,
) {
  const alertShownRef = useRef(false);

  useEffect(() => {
    if (!loading) {
      alertShownRef.current = false;
      return;
    }

    const id = setTimeout(() => {
      if (!alertShownRef.current) {
        alertShownRef.current = true;
        setLoading(false);
        alert('요청 시간이 초과되었습니다. 페이지를 새로고침하고 다시 시도해주세요.');
      }
    }, timeoutMs);

    return () => clearTimeout(id);
  }, [loading, setLoading, timeoutMs]);
}
