import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';

const MAX_TIMESTAMP_DIFF_SECONDS = 300;

function cursiaError(code: string, message: string): UnauthorizedException {
  return new UnauthorizedException({ success: false, code, message });
}

@Injectable()
export class CursiaHmacGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const secret = process.env.VIDEOGEN_SHARED_SECRET;

    if (!secret) {
      throw cursiaError('CONFIGURATION_ERROR', 'Shared secret not configured');
    }

    const timestamp = req.headers['x-cursia-timestamp'] as string | undefined;
    const signature = req.headers['x-cursia-signature'] as string | undefined;

    if (!timestamp || !signature) {
      throw cursiaError('MISSING_SIGNATURE', 'Missing X-Cursia-Timestamp or X-Cursia-Signature header');
    }

    const ts = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (isNaN(ts) || Math.abs(now - ts) > MAX_TIMESTAMP_DIFF_SECONDS) {
      throw cursiaError('EXPIRED_TIMESTAMP', 'Request timestamp is too old or invalid (max 5 minutes)');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw cursiaError('MISSING_BODY', 'Could not read raw request body');
    }

    const payload = `${timestamp}.${rawBody.toString('utf8')}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    let sigBuffer: Buffer;
    let expectedBuffer: Buffer;
    try {
      sigBuffer = Buffer.from(signature, 'hex');
      expectedBuffer = Buffer.from(expected, 'hex');
    } catch {
      throw cursiaError('INVALID_SIGNATURE', 'Invalid signature format');
    }

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw cursiaError('INVALID_SIGNATURE', 'Invalid request signature');
    }

    return true;
  }
}
