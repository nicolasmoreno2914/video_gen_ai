import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Institution } from './institution.entity';
import { VideoScene } from './video-scene.entity';
import { ApiUsageLog } from './api-usage-log.entity';
import { VideoStatus } from '../../../common/types';

@Entity('video_jobs')
@Index(['institution_id', 'created_at'])
@Index(['course_id', 'chapter_id'])
export class VideoJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  institution_id!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  course_id!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  chapter_id!: string | null;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'text' })
  content_txt!: string;

  @Column({ type: 'varchar', length: 10, default: 'es' })
  language!: string;

  @Column({ type: 'int', default: 10 })
  target_duration_minutes!: number;

  @Column({ type: 'varchar', length: 50, default: 'notebooklm' })
  visual_style!: string;

  @Column({ type: 'boolean', default: false })
  dry_run!: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  brand_logo_url!: string | null;

  @Column({ type: 'varchar', length: 20, default: '#003366' })
  brand_primary_color!: string;

  @Column({ type: 'varchar', length: 20, default: '#00AEEF' })
  brand_secondary_color!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  brand_institution_name!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  brand_voice_id!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'unlisted' })
  youtube_privacy!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  youtube_title!: string | null;

  @Column({ type: 'text', nullable: true })
  youtube_description!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  callback_url!: string | null;

  @Column({ type: 'varchar', length: 50, default: 'queued' })
  status!: VideoStatus;

  @Column({ type: 'int', default: 0 })
  progress!: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  current_step!: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  completed_steps!: string[];

  @Column({ type: 'jsonb', nullable: true })
  generated_script!: object | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  youtube_url!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  embed_url!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  youtube_video_id!: string | null;

  @Column({ type: 'boolean', default: false })
  local_mp4_available!: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  local_mp4_path!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  downloaded_at!: Date | null;

  @Column({ type: 'int', nullable: true })
  duration_seconds!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  thumbnail_url!: string | null;

  @Column({ type: 'int', nullable: true })
  scenes_count!: number | null;

  @Column({ type: 'text', nullable: true })
  error_message!: string | null;

  @Column({ type: 'int', default: 0 })
  retry_count!: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, default: 0, nullable: true })
  estimated_total_cost!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  cost_breakdown!: object | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  source_system!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  client_reference_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  batch_id!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  batch_reference_id!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  external_metadata!: object | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @ManyToOne(() => Institution, (inst) => inst.video_jobs, { nullable: true })
  @JoinColumn({ name: 'institution_id' })
  institution!: Institution | null;

  @OneToMany(() => VideoScene, (scene) => scene.video_job, { cascade: true })
  scenes!: VideoScene[];

  @OneToMany(() => ApiUsageLog, (log) => log.video_job, { cascade: true })
  usage_logs!: ApiUsageLog[];
}
