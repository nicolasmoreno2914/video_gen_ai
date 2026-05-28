import { apiClient } from './api';
import {
  CreateVideoPayload,
  CreateVideoResponse,
  VideoJob,
} from '../types';

export const videoService = {
  async create(payload: CreateVideoPayload): Promise<CreateVideoResponse> {
    const { data } = await apiClient.post<CreateVideoResponse>('/api/videos/create', payload);
    return data;
  },

  async getStatus(jobId: string): Promise<VideoJob> {
    const { data } = await apiClient.get<VideoJob>(`/api/videos/${jobId}/status`);
    return data;
  },

  async retry(jobId: string): Promise<{ success: boolean; resuming_from: string }> {
    const { data } = await apiClient.post<{ success: boolean; resuming_from: string }>(
      `/api/videos/${jobId}/retry`,
    );
    return data;
  },

  async cancel(jobId: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.post<{ success: boolean }>(`/api/videos/${jobId}/cancel`);
    return data;
  },

  async list(params?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ jobs: VideoJob[]; total: number }> {
    const { data } = await apiClient.get<{ jobs: VideoJob[]; total: number }>('/api/videos', {
      params,
    });
    return data;
  },

  async deleteJob(jobId: string): Promise<void> {
    await apiClient.delete(`/api/videos/${jobId}`);
  },

  getDownloadUrl(jobId: string): string {
    const base = import.meta.env.VITE_API_URL ?? '';
    return `${base}/api/videos/${jobId}/download`;
  },

  getProgressStreamUrl(jobId: string): string {
    const base = import.meta.env.VITE_API_URL ?? '';
    return `${base}/api/videos/${jobId}/progress-stream`;
  },
};
