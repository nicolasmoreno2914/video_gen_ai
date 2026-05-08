import axios from 'axios';
import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const API_SECRET = import.meta.env.VITE_API_SECRET ?? 'change_me_in_production';
const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Attach auth header dynamically: JWT when logged in, static API key as fallback
apiClient.interceptors.request.use(async (config) => {
  if (SKIP_AUTH) {
    config.headers['Authorization'] = `Bearer ${API_SECRET}`;
    return config;
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  config.headers['Authorization'] = token ? `Bearer ${token}` : `Bearer ${API_SECRET}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const message =
        (error.response?.data as Record<string, string>)?.['message'] ??
        error.message ??
        'Error de red';
      return Promise.reject(new Error(message));
    }
    return Promise.reject(error);
  },
);
