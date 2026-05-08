export type VideoStatus =
  | 'queued'
  | 'processing'
  | 'dry_run_completed'
  | 'completed_local'
  | 'completed'
  | 'failed';

export type SceneType =
  | 'hook'
  | 'context'
  | 'explanation'
  | 'process'
  | 'example'
  | 'comparison'
  | 'application'
  | 'summary'
  | 'conclusion';

export type LayoutType =
  | 'cover'
  | 'guiding_question'
  | 'big_stat'
  | 'content_split'
  | 'hierarchy_diagram'
  | 'process_steps'
  | 'comparison'
  | 'real_example'
  | 'summary_checklist'
  | 'conclusion_reflection';

export type TransitionType = 'fade' | 'slide' | 'zoom' | 'dissolve';

export type VisualStyle = 'notebooklm' | 'whiteboard' | 'sketch';

export type YoutubePrivacy = 'public' | 'unlisted' | 'private';

export type ApiProvider = 'openai_chat' | 'openai_dalle' | 'elevenlabs' | 'youtube' | 'internal';

export interface GeneratedScene {
  scene_order: number;
  scene_type: SceneType;
  layout_type: LayoutType;
  requires_ai_image: boolean;
  learning_goal: string;
  title: string;
  narration: string;
  on_screen_text: string[];
  visual_direction: string;
  image_prompt: string | null;
  highlight_words: string[];
  transition: TransitionType;
  estimated_duration_seconds: number;
}

export interface GeneratedScript {
  video_title: string;
  estimated_duration_minutes: number;
  total_narration_characters: number;
  guiding_question: string;
  scenes: GeneratedScene[];
}

export interface BrandConfig {
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  institution_name: string;
  voice_id?: string;
}

export interface YoutubeConfig {
  privacy_status?: YoutubePrivacy;
  title?: string;
  description?: string;
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
  brand?: BrandConfig;
  youtube?: YoutubeConfig;
  callback_url?: string;
}

export interface VideoProgressEvent {
  job_id: string;
  progress: number;
  current_step: string;
  step_label: string;
  status: VideoStatus;
}

export interface VideoCompletedEvent {
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

export interface VideoFailedEvent {
  job_id: string;
  status: 'failed';
  error: string;
  failed_step: string | null;
  can_retry: boolean;
}

export interface RenderResult {
  outputPath: string;
  durationSeconds: number;
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

export const STEP_PROGRESS: Record<string, number> = {
  analyzing_content: 5,
  generating_script: 15,
  generating_scenes: 22,
  generating_images: 40,
  generating_slides: 55,
  rendering_dry_run: 75,
  generating_audio: 70,
  rendering_video: 85,
  uploading_youtube: 95,
  completed: 100,
  completed_local: 100,
  dry_run_completed: 55,
};
