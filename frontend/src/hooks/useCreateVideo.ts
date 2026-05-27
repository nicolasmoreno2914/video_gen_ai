import { useMutation } from '@tanstack/react-query';
import { videoService } from '../services/videoService';
import { CreateVideoPayload, CreateVideoResponse } from '../types';

export function useCreateVideo() {
  return useMutation<CreateVideoResponse, Error, CreateVideoPayload>({
    mutationFn: (payload) => videoService.create(payload),
  });
}
