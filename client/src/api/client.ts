import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = String(error?.config?.url || '');
    const isAuthEndpoint = url.startsWith('/auth/login') || url.startsWith('/auth/logout') || url.startsWith('/auth/session');

    if (typeof window !== 'undefined' && status === 401 && !isAuthEndpoint && window.location.pathname !== '/login') {
      window.location.replace('/login');
    }

    return Promise.reject(error);
  },
);

export default api;
