export type VideoStatus =
  | 'queued'
  | 'processing'
  | 'dry_run_completed'
  | 'completed_local'
  | 'completed'
  | 'failed';

export type VisualStyle = 'notebooklm' | 'whiteboard' | 'sketch';

export interface VideoJob {
  job_id: string;
  status: VideoStatus;
  title?: string;
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
  created_at: string;
  updated_at: string;
}

export interface CreateVideoPayload {
  institution_id?: string;
  course_id: string;
  chapter_id: string;
  title: string;
  content_txt: string;
  language?: string;
  target_duration_minutes?: number;
  visual_style?: VisualStyle;
  dry_run?: boolean;
  brand?: {
    logo_url?: string;
    primary_color?: string;
    secondary_color?: string;
    institution_name: string;
    voice_id?: string;
  };
  youtube?: {
    privacy_status?: 'public' | 'unlisted' | 'private';
    title?: string;
    description?: string;
  };
  callback_url?: string;
}

export interface CreateVideoResponse {
  success: boolean;
  job_id: string;
  status: VideoStatus;
  is_regeneration: boolean;
  previous_job_id: string | null;
  dry_run: boolean;
}

export interface SSEProgressEvent {
  job_id: string;
  progress: number;
  current_step: string;
  step_label: string;
  status: VideoStatus;
}

export interface SSECompletedEvent {
  job_id: string;
  status: VideoStatus;
  progress: number;
  local_mp4_available: boolean;
  download_url: string | null;
  youtube_url: string | null;
  duration_seconds: number | null;
  scenes_count: number | null;
  thumbnail_url: string | null;
}

export interface SSEFailedEvent {
  job_id: string;
  status: 'failed';
  error: string;
  failed_step: string | null;
  can_retry: boolean;
}

export const STEP_LABELS: Record<string, string> = {
  analyzing_content: 'Analizando el contenido...',
  generating_script: 'Creando el guion educativo...',
  generating_scenes: 'Estructurando las escenas...',
  generating_images: 'Generando ilustraciones con IA...',
  generating_slides: 'Diseñando las diapositivas...',
  rendering_dry_run: 'Renderizando video sin audio...',
  generating_audio: 'Narrando el contenido con voz IA...',
  rendering_video: 'Renderizando el video final...',
  uploading_youtube: 'Subiendo a YouTube...',
  completed: '¡Video listo!',
  completed_local: '¡Video listo para descargar!',
  dry_run_completed: 'Dry-run completado.',
};

export const ALL_STEPS = [
  'analyzing_content',
  'generating_script',
  'generating_scenes',
  'generating_images',
  'generating_slides',
  'rendering_dry_run',
  'generating_audio',
  'rendering_video',
  'uploading_youtube',
];
