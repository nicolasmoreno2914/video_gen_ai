import { useQuery } from '@tanstack/react-query';
import { costService } from '../services/costService';
import type { VideoCostDetail } from '../types/costs';

export function useVideoCostDetail(jobId: string | null) {
  return useQuery<VideoCostDetail>({
    queryKey: ['video-cost-detail', jobId],
    queryFn: () => costService.getVideoCostDetail(jobId!),
    staleTime: 60_000,
    enabled: Boolean(jobId),
  });
}
