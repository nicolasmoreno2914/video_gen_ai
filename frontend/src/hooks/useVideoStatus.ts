import { useQuery } from '@tanstack/react-query';
import { videoService } from '../services/videoService';
import { VideoJob } from '../types';

export function useVideoStatus(jobId: string | null) {
  return useQuery<VideoJob, Error>({
    queryKey: ['video-status', jobId],
    queryFn: () => videoService.getStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return 4000;
      if (status === 'queued' || status === 'processing') return 4000;
      return false;
    },
    staleTime: 0,
  });
}
