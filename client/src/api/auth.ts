import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './client';

export interface AuthSessionResponse {
  authenticated: boolean;
  username: string | null;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export const AUTH_SESSION_QUERY_KEY = ['auth', 'session'];

export function useAuthSession() {
  return useQuery({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: () => api.get('/auth/session').then((response) => response.data as AuthSessionResponse),
    retry: false,
    staleTime: 30_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: LoginPayload) => api.post('/auth/login', payload).then((response) => response.data as AuthSessionResponse),
    onSuccess: (session) => {
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, session);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post('/auth/logout').then((response) => response.data as AuthSessionResponse),
    onSuccess: () => {
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, { authenticated: false, username: null } satisfies AuthSessionResponse);
      queryClient.removeQueries({ queryKey: ['templates'] });
      queryClient.removeQueries({ queryKey: ['servers'] });
      queryClient.removeQueries({ queryKey: ['sites'] });
    },
  });
}