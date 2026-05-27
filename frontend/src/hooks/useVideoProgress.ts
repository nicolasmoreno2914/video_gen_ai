import { useEffect, useRef, useState, useCallback } from 'react';
import { videoService } from '../services/videoService';
import {
  VideoStatus,
  SSEProgressEvent,
  SSECompletedEvent,
  SSEFailedEvent,
} from '../types';

export interface VideoProgressState {
  progress: number;
  currentStep: string | null;
  stepLabel: string | null;
  status: VideoStatus | null;
  localMp4Available: boolean;
  downloadUrl: string | null;
  youtubeUrl: string | null;
  durationSeconds: number | null;
  scenesCount: number | null;
  thumbnailUrl: string | null;
  error: string | null;
  canRetry: boolean;
}

const INITIAL_STATE: VideoProgressState = {
  progress: 0,
  currentStep: null,
  stepLabel: null,
  status: null,
  localMp4Available: false,
  downloadUrl: null,
  youtubeUrl: null,
  durationSeconds: null,
  scenesCount: null,
  thumbnailUrl: null,
  error: null,
  canRetry: false,
};

export function useVideoProgress(jobId: string | null) {
  const [state, setState] = useState<VideoProgressState>(INITIAL_STATE);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseFailedRef = useRef(false);

  const startPolling = useCallback((id: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const status = await videoService.getStatus(id);
        setState((prev) => ({
          ...prev,
          progress: status.progress,
          currentStep: status.current_step,
          stepLabel: status.step_label,
          status: status.status,
          localMp4Available: status.local_mp4_available,
          downloadUrl: status.local_mp4_available
            ? videoService.getDownloadUrl(id)
            : null,
          youtubeUrl: status.youtube_url,
          durationSeconds: status.duration_seconds,
          scenesCount: status.scenes_count,
          thumbnailUrl: status.thumbnail_url,
          error: status.error,
        }));

        if (
          status.status !== 'queued' &&
          status.status !== 'processing' &&
          pollingRef.current
        ) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      } catch {
        // Retry on next tick
      }
    }, 4000);
  }, []);

  const startSSE = useCallback(
    (id: string) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const url = videoService.getProgressStreamUrl(id);
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener('progress', (e: MessageEvent<string>) => {
        const data = JSON.parse(e.data) as SSEProgressEvent;
        setState((prev) => ({
          ...prev,
          progress: data.progress,
          currentStep: data.current_step,
          stepLabel: data.step_label,
          status: data.status,
        }));
      });

      es.addEventListener('completed', (e: MessageEvent<string>) => {
        const data = JSON.parse(e.data) as SSECompletedEvent;
        setState((prev) => ({
          ...prev,
          progress: 100,
          status: data.status,
          localMp4Available: data.local_mp4_available,
          downloadUrl: data.download_url,
          youtubeUrl: data.youtube_url,
          durationSeconds: data.duration_seconds,
          scenesCount: data.scenes_count,
          thumbnailUrl: data.thumbnail_url,
        }));
        es.close();
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      });

      es.addEventListener('failed', (e: MessageEvent<string>) => {
        const data = JSON.parse(e.data) as SSEFailedEvent;
        setState((prev) => ({
          ...prev,
          status: 'failed',
          error: data.error,
          canRetry: data.can_retry,
        }));
        es.close();
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      });

      es.onerror = () => {
        if (!sseFailedRef.current) {
          sseFailedRef.current = true;
          es.close();
        }
      };
    },
    [],
  );

  useEffect(() => {
    if (!jobId) return;

    sseFailedRef.current = false;
    setState(INITIAL_STATE);
    startSSE(jobId);
    // Always poll in parallel — SSE events take priority but polling
    // ensures the UI never stays at 0% if SSE is slow or misses the first event
    startPolling(jobId);

    return () => {
      eventSourceRef.current?.close();
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [jobId, startSSE]);

  const reset = useCallback(() => {
    eventSourceRef.current?.close();
    if (pollingRef.current) clearInterval(pollingRef.current);
    setState(INITIAL_STATE);
  }, []);

  const reconnect = useCallback(() => {
    if (!jobId) return;
    eventSourceRef.current?.close();
    if (pollingRef.current) clearInterval(pollingRef.current);
    sseFailedRef.current = false;
    setState(INITIAL_STATE);
    startSSE(jobId);
  }, [jobId, startSSE]);

  return { ...state, reset, reconnect };
}
