import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('temp_files')
export class TempFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Relative path inside TEMP_VIDEO_DIR, e.g. "{id}.mp4" */
  @Column({ length: 500 })
  file_path: string;

  /** Original job that produced this file (nullable for test files) */
  @Column({ nullable: true, type: 'uuid' })
  job_id: string | null;

  @Column({ type: 'bigint', nullable: true })
  size_bytes: number | null;

  @Column({ type: 'float', nullable: true })
  duration_seconds: number | null;

  @Column({ nullable: true, length: 64 })
  checksum_sha256: string | null;

  @Column({ type: 'timestamptz' })
  @Index()
  expires_at: Date;

  @Column({ nullable: true, type: 'timestamptz' })
  downloaded_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
