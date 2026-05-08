import { VideoStatus } from '../../../common/types';

export interface VideoStatusResponse {
  job_id: string;
  status: VideoStatus;
  progress: number;
  current_step: string | null;
  step_label: string | null;
  completed_steps: string[];
  dry_run: boolean;
  local_mp4_available: boolean;
  youtube_url: string | null;
  embed_url: string | null;
  duration_seconds: number | null;
  scenes_count: number | null;
  thumbnail_url: string | null;
  error: string | null;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
  title?: string | null;
}

export interface CreateVideoResponse {
  success: true;
  job_id: string;
  status: VideoStatus;
  is_regeneration: boolean;
  previous_job_id: string | null;
  dry_run: boolean;
}
