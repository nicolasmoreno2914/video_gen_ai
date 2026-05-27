import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';

export interface VideoGeneratedPayload {
  event: 'video.generated';
  batch_id: string;
  item_id: string;
  request_id: string;
  chapter_number: number;
  status: 'generated';
  file_url: string;
  expires_at: string;
  size_bytes: number | null;
  duration_seconds: number | null;
  checksum_sha256: string | null;
}

export interface VideoFailedPayload {
  event: 'video.failed';
  batch_id: string;
  item_id: string;
  request_id: string;
  chapter_number: number;
  status: 'failed';
  error: string;
}

export interface BatchCompletedPayload {
  event: 'batch.completed';
  batch_id: string;
  request_id: string;
  status: 'completed' | 'partial' | 'failed';
  total: number;
  succeeded: number;
  failed: number;
}

type CallbackPayload = VideoGeneratedPayload | VideoFailedPayload | BatchCompletedPayload;

const MAX_RETRIES = 5;
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 120_000];

@Injectable()
export class CursiaCallbackService {
  private readonly logger = new Logger(CursiaCallbackService.name);

  async send(callbackUrl: string, payload: CallbackPayload): Promise<void> {
    const secret = process.env.VIDEOGEN_WEBHOOK_SECRET;
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const signature = secret
      ? crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
      : 'unsigned';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Videogen-Batch-ID': payload.batch_id,
      'X-Videogen-Timestamp': timestamp,
      'X-Videogen-Signature': signature,
    };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await axios.post(callbackUrl, body, { headers, timeout: 10_000 });
        this.logger.log(`Callback sent [${payload.event}] to ${callbackUrl} (attempt ${attempt + 1})`);
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS_MS[attempt] ?? 120_000;
          this.logger.warn(`Callback failed [${payload.event}] attempt ${attempt + 1}/${MAX_RETRIES + 1}: ${msg}. Retrying in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          this.logger.error(`Callback permanently failed [${payload.event}] after ${MAX_RETRIES + 1} attempts: ${msg}`);
        }
      }
    }
  }
}
