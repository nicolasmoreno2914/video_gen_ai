import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VideoJob } from './video-job.entity';
import { InstitutionUser } from './institution-user.entity';
import { ApiKey } from './api-key.entity';
import { WebhookEndpoint } from './webhook-endpoint.entity';
import { OAuthConnection } from './oauth-connection.entity';

@Entity('institutions')
export class Institution {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug!: string;

  @Column({ type: 'int', default: 10 })
  daily_video_limit!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  brand_logo_url!: string | null;

  @Column({ type: 'varchar', length: 20, default: '#003366' })
  brand_primary_color!: string;

  @Column({ type: 'varchar', length: 20, default: '#00AEEF' })
  brand_secondary_color!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  elevenlabs_voice_id!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  youtube_client_id!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  youtube_client_secret!: string | null;

  @Column({ type: 'text', nullable: true })
  youtube_refresh_token!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  youtube_channel_id!: string | null;

  @Column({ type: 'varchar', length: 50, default: 'notebooklm' })
  visual_style!: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany(() => VideoJob, (job) => job.institution)
  video_jobs!: VideoJob[];

  @OneToMany(() => InstitutionUser, (u) => u.institution)
  users!: InstitutionUser[];

  @OneToMany(() => ApiKey, (k) => k.institution)
  api_keys!: ApiKey[];

  @OneToMany(() => WebhookEndpoint, (w) => w.institution)
  webhook_endpoints!: WebhookEndpoint[];

  @OneToMany(() => OAuthConnection, (o) => o.institution)
  oauth_connections!: OAuthConnection[];
}
