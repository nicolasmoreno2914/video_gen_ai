import { useQuery } from '@tanstack/react-query';
import { costService } from '../services/costService';
import type { VideoCostItem, Pagination, VideoCostsParams } from '../types/costs';

export function useVideoCosts(params: VideoCostsParams) {
  return useQuery<{ items: VideoCostItem[]; pagination: Pagination }>({
    queryKey: ['video-costs', params],
    queryFn: () => costService.getVideos(params),
    staleTime: 30_000,
    enabled: Boolean(params.from && params.to),
  });
}
