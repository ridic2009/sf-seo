import { useCallback } from 'react';

interface ApiLikeError {
  response?: {
    data?: {
      error?: string;
    };
  };
  message?: string;
}

export function useApiErrorMessage() {
  return useCallback((error: unknown, fallbackMessage: string) => {
    const apiError = error as ApiLikeError | undefined;
    return apiError?.response?.data?.error || apiError?.message || fallbackMessage;
  }, []);
}