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

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(() => VideoJob, (job) => job.scenes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_job_id' })
  video_job!: VideoJob;
}
