import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { AppConfig } from '../../config/configuration';
import { VideoJob } from '../database/entities/video-job.entity';
import { Institution } from '../database/entities/institution.entity';
import { VideosService } from '../videos/videos.service';

export interface YoutubeUploadResult {
  videoId: string;
  youtubeUrl: string;
  embedUrl: string;
}

@Injectable()
export class YouTubeService {
  private readonly logger = new Logger(YouTubeService.name);
  private readonly basePath: string;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly videosService: VideosService,
  ) {
    this.basePath =
      this.configService.get<AppConfig['storage']>('storage')?.basePath ?? '/tmp/video-engine';
  }

  hasCredentials(job: VideoJob, institution: Institution | null): boolean {
    const instHas =
      !!institution?.youtube_client_id &&
      !!institution?.youtube_client_secret &&
      !!institution?.youtube_refresh_token;

    const cfg = this.configService.get<AppConfig['youtube']>('youtube')!;
    const globalHas =
      !!cfg.clientId && !!cfg.clientSecret && !!cfg.refreshToken;

    return instHas || globalHas;
  }

  async upload(
    job: VideoJob,
    institution: Institution | null,
  ): Promise<YoutubeUploadResult | null> {
    if (!this.hasCredentials(job, institution)) {
      this.logger.log(
        `[YouTubeService] [${job.id}] Sin credenciales YouTube — omitiendo`,
      );
      return null;
    }

    const cfg = this.configService.get<AppConfig['youtube']>('youtube')!;

    const clientId =
      institution?.youtube_client_id ?? cfg.clientId;
    const clientSecret =
      institution?.youtube_client_secret ?? cfg.clientSecret;
    const refreshToken =
      institution?.youtube_refresh_token ?? cfg.refreshToken;

    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });

    const youtube = google.youtube({ version: 'v3', auth });

    const videoPath = path.join(this.basePath, 'jobs', job.id, 'output', 'final.mp4');
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video final no encontrado: ${videoPath}`);
    }

    const title = job.youtube_title ?? job.title;
    const description =
      job.youtube_description ??
      `Video educativo generado por Video Engine IA\nTítulo: ${job.title}`;
    const privacyStatus = job.youtube_privacy ?? 'unlisted';

    this.logger.log(`[YouTubeService] [${job.id}] Subiendo a YouTube: "${title}"`);

    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description,
          categoryId: '27',
          defaultLanguage: 'es',
        },
        status: { privacyStatus },
      },
      media: {
        mimeType: 'video/mp4',
        body: fs.createReadStream(videoPath),
      },
    });

    const videoId = response.data.id;
    if (!videoId) throw new Error('YouTube no devolvió video ID');

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const embedUrl = `https://www.youtube.com/embed/${videoId}`;

    await this.uploadThumbnail(job, institution, youtube, videoId);

    await this.videosService.logApiUsage({
      videoJobId: job.id,
      institutionId: job.institution_id,
      provider: 'youtube',
      operation: 'video_upload',
      inputUnits: 100,
      estimatedCost: 0,
      unitType: 'quota_units',
      metadata: { quota_units: 100, video_id: videoId },
    });

    this.logger.log(
      `[YouTubeService] [${job.id}] Subido exitosamente: ${youtubeUrl}`,
    );

    return { videoId, youtubeUrl, embedUrl };
  }

  private async uploadThumbnail(
    job: VideoJob,
    _institution: Institution | null,
    youtube: ReturnType<typeof google.youtube>,
    videoId: string,
  ): Promise<void> {
    const thumbnailPath = path.join(
      this.basePath,
      'jobs',
      job.id,
      'output',
      'thumbnail.png',
    );

    if (!fs.existsSync(thumbnailPath)) return;

    try {
      await youtube.thumbnails.set({
        videoId,
        media: {
          mimeType: 'image/png',
          body: fs.createReadStream(thumbnailPath),
        },
      });
      this.logger.log(`[YouTubeService] [${job.id}] Thumbnail subido`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[YouTubeService] [${job.id}] Thumbnail upload falló (no crítico): ${msg}`,
      );
    }
  }
}
