import { useQuery } from '@tanstack/react-query';
import { videoService } from '../services/videoService';
import { VideoJob } from '../types';

export function useVideoList(params?: { status?: string; page?: number; limit?: number }) {
  return useQuery<{ jobs: VideoJob[]; total: number }, Error>({
    queryKey: ['video-list', params],
    queryFn: () => videoService.list(params),
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs ?? [];
      const hasActive = jobs.some(
        (j) => j.status === 'queued' || j.status === 'processing',
      );
      return hasActive ? 5000 : false;
    },
    staleTime: 10000,
  });
}
