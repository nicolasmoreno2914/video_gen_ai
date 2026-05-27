import { apiClient as api } from './api';
import type {
  CostSummary,
  VideoCostItem,
  VideoCostDetail,
  DailyCostEntry,
  ProviderBreakdownItem,
  Pagination,
  VideoCostsParams,
} from '../types/costs';

export const costService = {
  async getSummary(from: string, to: string): Promise<CostSummary> {
    const res = await api.get<CostSummary>('/api/costs/summary', {
      params: { from, to },
    });
    return res.data;
  },

  async getVideos(
    params: VideoCostsParams,
  ): Promise<{ items: VideoCostItem[]; pagination: Pagination }> {
    const res = await api.get<{ items: VideoCostItem[]; pagination: Pagination }>(
      '/api/costs/videos',
      { params },
    );
    return res.data;
  },

  async getVideoCostDetail(jobId: string): Promise<VideoCostDetail> {
    const res = await api.get<VideoCostDetail>(`/api/costs/videos/${jobId}`);
    return res.data;
  },

  async getProviderBreakdown(
    from: string,
    to: string,
  ): Promise<ProviderBreakdownItem[]> {
    const res = await api.get<ProviderBreakdownItem[]>(
      '/api/costs/provider-breakdown',
      { params: { from, to } },
    );
    return res.data;
  },

  async getDailyCosts(from: string, to: string): Promise<DailyCostEntry[]> {
    const res = await api.get<DailyCostEntry[]>('/api/costs/daily', {
      params: { from, to },
    });
    return res.data;
  },

  async rebuildJobCosts(jobId: string): Promise<void> {
    await api.post(`/api/costs/videos/${jobId}/rebuild`);
  },
};
