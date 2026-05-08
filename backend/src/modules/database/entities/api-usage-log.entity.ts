import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { VideoJob } from './video-job.entity';
import { Institution } from './institution.entity';
import { ApiProvider } from '../../../common/types';

@Entity('api_usage_logs')
export class ApiUsageLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  video_job_id!: string;

  @Column({ type: 'uuid', nullable: true })
  institution_id!: string | null;

  @Column({ length: 50 })
  provider!: ApiProvider;

  @Column({ length: 100 })
  operation!: string;

  @Column({ type: 'int', nullable: true })
  input_units!: number | null;

  @Column({ type: 'int', nullable: true })
  output_units!: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  estimated_cost!: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model_name!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  unit_type!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: object | null;

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(() => VideoJob, (job) => job.usage_logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_job_id' })
  video_job!: VideoJob;

  @ManyToOne(() => Institution, { nullable: true })
  @JoinColumn({ name: 'institution_id' })
  institution!: Institution | null;
}
