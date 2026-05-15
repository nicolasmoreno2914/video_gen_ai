import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CursiaBatch } from './cursia-batch.entity';

export type ItemStatus = 'queued' | 'generating' | 'generated' | 'failed' | 'expired';

@Entity('cursia_items')
export class CursiaItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  batch_id: string;

  @ManyToOne(() => CursiaBatch, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id' })
  batch: CursiaBatch;

  @Column({ default: 1 })
  chapter_number: number;

  @Column({ length: 500 })
  title: string;

  @Column({ nullable: true, length: 64 })
  script_hash: string | null;

  @Column({ type: 'enum', enum: ['queued', 'generating', 'generated', 'failed', 'expired'], default: 'queued' })
  status: ItemStatus;

  @Column({ nullable: true, length: 1000 })
  file_url: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  file_expires_at: Date | null;

  @Column({ nullable: true, type: 'bigint' })
  file_size_bytes: number | null;

  @Column({ nullable: true, type: 'float' })
  duration_seconds: number | null;

  @Column({ nullable: true, length: 64 })
  checksum_sha256: string | null;

  @Column({ nullable: true, type: 'text' })
  error: string | null;

  @Column({ default: 0 })
  retry_count: number;

  @Column({ nullable: true, type: 'uuid' })
  video_job_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
