import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { VideoJob } from './video-job.entity';

@Entity('video_scenes')
export class VideoScene {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  video_job_id!: string;

  @Column({ type: 'int' })
  scene_order!: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  scene_type!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  layout_type!: string | null;

  @Column({ type: 'boolean', default: true })
  requires_ai_image!: boolean;

  @Column({ type: 'text', nullable: true })
  learning_goal!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  title!: string | null;

  @Column({ type: 'text', nullable: true })
  narration!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  on_screen_text!: string[] | null;

  @Column({ type: 'text', nullable: true })
  visual_direction!: string | null;

  @Column({ type: 'text', nullable: true })
  image_prompt!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  highlight_words!: string[] | null;

  @Column({ type: 'varchar', length: 50, default: 'fade' })
  transition!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  image_url!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  slide_png_url!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  audio_url!: string | null;

  @Column({ type: 'float', nullable: true })
  duration_seconds!: number | null;

  @Column({ type: 'int', nullable: true })
  estimated_duration_seconds!: number | null;

  /** Tiempos por palabra de la narración (Whisper), en segundos desde el inicio del audio de la escena. */
  @Column({ type: 'jsonb', nullable: true })
  word_timings!: Array<{ text: string; start: number; end: number }> | null;

  /** Frase de la narración que marca cuándo aparece cada on_screen_text (mismo índice). */
  @Column({ type: 'jsonb', nullable: true })
  reveal_cues!: Array<string | null> | null;

  /** Icono Lucide por cada on_screen_text (mismo índice), de la lista cerrada de templates/icons.ts. */
  @Column({ type: 'jsonb', nullable: true })
  icons!: Array<string | null> | null;

  /** 'high' → modelo de imagen preciso + verificación con visión. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  image_precision!: string | null;

  /** Solo en videos realistas: 'atlas' (estructuras) o 'photo' (personas, procedimientos). */
  @Column({ type: 'varchar', length: 10, nullable: true })
  image_style!: string | null;

  /** Qué debe verse correcto en la imagen; lo verifica un modelo de visión. */
  @Column({ type: 'text', nullable: true })
  image_check!: string | null;

  /** Tutorial de software (layout software_demo): programa, estado inicial y pasos. */
  @Column({ type: 'jsonb', nullable: true })
  ui_demo!: object | null;

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(() => VideoJob, (job) => job.scenes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_job_id' })
  video_job!: VideoJob;
}
