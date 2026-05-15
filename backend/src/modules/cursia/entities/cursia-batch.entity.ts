import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';

export type BatchStatus = 'queued' | 'processing' | 'completed' | 'partial' | 'failed';

@Entity('cursia_batches')
export class CursiaBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 255 })
  request_id: string;

  @Column({ nullable: true, length: 255 })
  cursia_course_id: string | null;

  @Column({ length: 500 })
  callback_url: string;

  @Column({ type: 'enum', enum: ['queued', 'processing', 'completed', 'partial', 'failed'], default: 'queued' })
  status: BatchStatus;

  @Column({ default: 0 })
  total_items: number;

  @Column({ default: 0 })
  completed_items: number;

  @Column({ default: 0 })
  failed_items: number;

  @Column({ type: 'jsonb', nullable: true })
  options: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
