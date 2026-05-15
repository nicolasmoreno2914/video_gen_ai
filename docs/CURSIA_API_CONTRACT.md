# Cursia ↔ Videogen — API Contract

> **Version:** 1.0  
> **Status:** Implemented  
> **Scope:** Videogen acts as an external video-generation engine. Cursia sends batch requests, Videogen generates MP4s, stores them temporarily, and sends signed callbacks back to Cursia. Cursia downloads the MP4s and uploads them to each user's YouTube channel. Videogen never touches YouTube.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Authentication — HMAC Signatures](#2-authentication--hmac-signatures)
3. [Endpoints](#3-endpoints)
4. [Callback Events (Videogen → Cursia)](#4-callback-events-videogen--cursia)
5. [Batch & Item States](#5-batch--item-states)
6. [Storage & File URLs](#6-storage--file-urls)
7. [Error Responses](#7-error-responses)
8. [Test Mode](#8-test-mode)
9. [Environment Variables](#9-environment-variables)
10. [Example — Full Flow with cURL](#10-example--full-flow-with-curl)

---

## 1. Architecture Overview

```
Cursia backend
  │
  │  POST /api/v1/video-batches   (HMAC signed)
  ▼
Videogen API
  │
  ├─ creates cursia_batch + cursia_items in DB
  ├─ queues VideoJobs (BullMQ)
  └─ processes videos asynchronously
        │
        │  on each video completion:
        ├─ stores MP4 in R2/local storage (TTL 3h)
        ├─ generates signed URL
        └─ POST {callback_url}  (HMAC signed)
              │
              ▼
        Cursia backend
          ├─ downloads MP4 from URL
          ├─ uploads to user's YouTube
          └─ saves YouTube URL in course
```

**Videogen responsibilities:**
- Receive batch request from Cursia ✅
- Validate HMAC signature ✅
- Create and track batch jobs ✅
- Generate each video ✅
- Store MP4 temporarily (TTL 3h) ✅
- Send signed callback per video + batch completion ✅
- Expose polling endpoints for status ✅

**Cursia responsibilities:**
- Sign requests with HMAC ✅
- Handle callbacks ✅
- Download MP4 before URL expires ✅
- Upload to user's YouTube ✅
- Save YouTube URL in course ✅

**Neither side does:**
- Videogen does NOT handle YouTube tokens or uploads ❌
- Videogen does NOT store MP4 permanently ❌
- Videogen does NOT return base64 ❌

---

## 2. Authentication — HMAC Signatures

### Cursia → Videogen (incoming requests)

Every request from Cursia must include:

```
X-Cursia-Request-ID: <same as request_id in body>
X-Cursia-Timestamp: <unix timestamp seconds>
X-Cursia-Signature: <hmac_hex>
```

Signature algorithm:
```
HMAC-SHA256(VIDEOGEN_SHARED_SECRET, "{timestamp}.{raw_body}")
```

**Example (Node.js):**
```typescript
import { createHmac } from 'crypto';

const timestamp = Math.floor(Date.now() / 1000).toString();
const body = JSON.stringify(payload);
const signature = createHmac('sha256', VIDEOGEN_SHARED_SECRET)
  .update(`${timestamp}.${body}`)
  .digest('hex');

fetch('https://videosb.nomaddi.com/api/v1/video-batches', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Cursia-Request-ID': payload.request_id,
    'X-Cursia-Timestamp': timestamp,
    'X-Cursia-Signature': signature,
  },
  body,
});
```

**Validation rules:**
- Timestamp must be within **±5 minutes** of server time (replay protection)
- Signature must match exactly (timing-safe comparison)
- Missing headers → `401 MISSING_SIGNATURE`
- Old timestamp → `401 EXPIRED_TIMESTAMP`
- Wrong signature → `401 INVALID_SIGNATURE`

### Videogen → Cursia (outgoing callbacks)

Every callback from Videogen includes:

```
X-Videogen-Batch-ID: <batch_id>
X-Videogen-Timestamp: <unix timestamp>
X-Videogen-Signature: <hmac_hex>
```

Signature algorithm:
```
HMAC-SHA256(VIDEOGEN_WEBHOOK_SECRET, "{timestamp}.{raw_body}")
```

**Cursia must verify** this signature on its callback endpoint to reject spoofed callbacks.

---

## 3. Endpoints

Base URL: `https://videosb.nomaddi.com`

All endpoints require HMAC signature (see §2).

---

### `POST /api/v1/video-batches`

Submit a batch of videos to generate.

**Request body:**
```json
{
  "request_id": "cursia_batch_2026_05_15_course123",
  "course_id": "123",
  "callback_url": "https://api.cursia.com/api/v1/videogen/callback",
  "options": {
    "language": "es",
    "style": "professional",
    "format": "mp4",
    "resolution": "1080p"
  },
  "videos": [
    {
      "chapter_number": 1,
      "title": "Introducción al curso",
      "script": "Texto completo del guion para el capítulo 1...",
      "duration_hint_seconds": 300
    },
    {
      "chapter_number": 2,
      "title": "Conceptos clave",
      "script": "Texto completo del guion para el capítulo 2...",
      "duration_hint_seconds": 300
    }
  ]
}
```

**Rules:**
- `request_id` must be unique per batch — idempotent (same `request_id` returns same batch, no duplicate)
- `videos` array: 1–9 items (> 9 → `400 TOO_MANY_VIDEOS`)
- Each video must have `chapter_number`, `title`, `script`
- `callback_url` must be a valid URL

**Response `202 Accepted`:**
```json
{
  "success": true,
  "batch_id": "a1b2c3d4-...",
  "status": "queued",
  "estimated_seconds": 1620,
  "items": [
    { "chapter_number": 1, "item_id": "e5f6...", "status": "queued" },
    { "chapter_number": 2, "item_id": "g7h8...", "status": "queued" }
  ]
}
```

**Duplicate request (same `request_id`):**
```json
{
  "success": true,
  "batch_id": "a1b2c3d4-...",
  "status": "processing",
  "duplicate_request": true,
  "estimated_seconds": 0,
  "items": [...]
}
```

---

### `GET /api/v1/video-batches/:batch_id`

Poll batch status by Videogen batch ID.

**Response `200 OK`:**
```json
{
  "batch_id": "a1b2c3d4-...",
  "request_id": "cursia_batch_2026_05_15_course123",
  "status": "processing",
  "total": 2,
  "completed": 1,
  "failed": 0,
  "items": [
    {
      "chapter_number": 1,
      "item_id": "e5f6...",
      "status": "generated",
      "file_url": "https://r2.example.com/jobs/.../final.mp4",
      "expires_at": "2026-05-15T17:00:00Z",
      "size_bytes": 187432110,
      "duration_seconds": 312,
      "error": null
    },
    {
      "chapter_number": 2,
      "item_id": "g7h8...",
      "status": "generating",
      "file_url": null,
      "expires_at": null,
      "size_bytes": null,
      "duration_seconds": null,
      "error": null
    }
  ]
}
```

---

### `GET /api/v1/video-batches/by-request/:request_id`

Poll batch status by Cursia's original `request_id` (useful for idempotency/debug).

**Response:** same structure as above.

---

## 4. Callback Events (Videogen → Cursia)

Videogen sends `POST {callback_url}` for each event. Cursia must respond with `2xx` within 10 seconds or Videogen will retry.

**Retry policy:** 5 attempts with delays: 5s, 15s, 30s, 60s, 120s.

---

### `video.generated` — single video ready

```json
{
  "event": "video.generated",
  "batch_id": "a1b2c3d4-...",
  "item_id": "e5f6...",
  "request_id": "cursia_batch_2026_05_15_course123",
  "chapter_number": 1,
  "status": "generated",
  "file_url": "https://r2.example.com/jobs/.../final.mp4",
  "expires_at": "2026-05-15T17:00:00Z",
  "size_bytes": 187432110,
  "duration_seconds": 312,
  "checksum_sha256": "abc123..."
}
```

> ⚠️ `file_url` expires at `expires_at` (3 hours). Cursia must download the MP4 before then.

---

### `video.failed` — single video failed

```json
{
  "event": "video.failed",
  "batch_id": "a1b2c3d4-...",
  "item_id": "g7h8...",
  "request_id": "cursia_batch_2026_05_15_course123",
  "chapter_number": 2,
  "status": "failed",
  "error": "generation_timeout"
}
```

---

### `batch.completed` — entire batch finished (success, partial, or failed)

```json
{
  "event": "batch.completed",
  "batch_id": "a1b2c3d4-...",
  "request_id": "cursia_batch_2026_05_15_course123",
  "status": "completed",
  "total": 2,
  "succeeded": 2,
  "failed": 0
}
```

`status` values:
- `completed` → all videos succeeded
- `partial` → some succeeded, some failed
- `failed` → all videos failed

---

## 5. Batch & Item States

### Batch states

| State | Meaning |
|---|---|
| `queued` | Batch received, jobs not yet started |
| `processing` | At least one job is running |
| `completed` | All items succeeded |
| `partial` | Some succeeded, some failed |
| `failed` | All items failed |

### Item states

| State | Meaning |
|---|---|
| `queued` | Waiting in queue |
| `generating` | Video is being generated |
| `generated` | MP4 ready, `file_url` available |
| `failed` | Generation failed |
| `expired` | `file_url` TTL exceeded |

---

## 6. Storage & File URLs

### v1 — Local temp storage (active)

In v1, Videogen uses **local temporary storage** on the server. No external object storage is required.

- MP4 files are saved in `TEMP_VIDEO_DIR` (default: `./storage/temp-videos/`)
- Each file gets a UUID `file_id` and a **HMAC-signed download URL** with a **3-hour TTL**
- Cursia downloads the MP4 via `GET /api/v1/temp-files/:file_id/download?exp=...&sig=...`
- A scheduled cleanup job runs every hour and deletes expired files from disk and DB
- Videogen does NOT store MP4 permanently
- Videogen does NOT embed files in API responses (no base64)

**Download URL format:**
```
https://videosb.nomaddi.com/api/v1/temp-files/{file_id}/download?exp={unix_ts}&sig={hmac}
```

HMAC: `HMAC-SHA256(TEMP_DOWNLOAD_SECRET, "{file_id}.{exp}")`

**Required env vars (Hostinger):**
```
TEMP_STORAGE_PROVIDER=local
TEMP_VIDEO_DIR=./storage/temp-videos
TEMP_FILE_TTL_SECONDS=10800
TEMP_DOWNLOAD_SECRET=<random 32+ chars>
PUBLIC_API_URL=https://videosb.nomaddi.com
```

### v2 — Cloudflare R2 (future)

When traffic/volume justifies it, switch to R2 by setting `TEMP_STORAGE_PROVIDER=r2` and providing R2 credentials. The API contract for Cursia does not change — only the `download_url` format changes to a pre-signed R2 URL.

```
# Future — not required for v1
# R2_ACCOUNT_ID=
# R2_ACCESS_KEY_ID=
# R2_SECRET_ACCESS_KEY=
# R2_BUCKET=videogen-outputs
# R2_PUBLIC_BASE_URL=https://...
```

---

## 7. Error Responses

All errors follow this format:

```json
{
  "success": false,
  "code": "ERROR_CODE",
  "message": "Human readable description"
}
```

| HTTP | Code | Cause |
|---|---|---|
| `401` | `MISSING_SIGNATURE` | Missing `X-Cursia-Timestamp` or `X-Cursia-Signature` |
| `401` | `EXPIRED_TIMESTAMP` | Timestamp older than 5 minutes |
| `401` | `INVALID_SIGNATURE` | HMAC mismatch |
| `400` | `TOO_MANY_VIDEOS` | More than 9 videos in batch |
| `400` | `VALIDATION_ERROR` | Missing required fields |
| `404` | `NOT_FOUND` | Batch not found |
| `500` | `INTERNAL_ERROR` | Unexpected server error |

---

## 8. Test Mode

Set `VIDEOGEN_TEST_MODE=true` on the Videogen server to enable test mode.

In test mode:
- No real video generation occurs
- All items are immediately marked as `generated`
- A real sample MP4 URL is returned
- Real callbacks are sent to `callback_url`
- The full Cursia → Videogen → callback flow is exercised without API costs

**Use this to validate the integration before going live.**

Test mode is transparent — the API contract is identical.

---

## 9. Environment Variables

### Videogen server (Hostinger)

```env
# Cursia integration
VIDEOGEN_SHARED_SECRET=<random 32+ chars>   # Cursia uses this to sign requests
VIDEOGEN_WEBHOOK_SECRET=<random 32+ chars>  # Videogen uses this to sign callbacks
VIDEOGEN_TEST_MODE=false                    # Set true to test without real generation
```

### Cursia backend

```env
VIDEOGEN_API_URL=https://videosb.nomaddi.com
VIDEOGEN_SHARED_SECRET=<same as above>      # Must match Videogen's VIDEOGEN_SHARED_SECRET
VIDEOGEN_WEBHOOK_SECRET=<same as above>     # Must match Videogen's VIDEOGEN_WEBHOOK_SECRET
```

---

## 10. Example — Full Flow with cURL

### Step 1 — Generate HMAC and submit batch

```bash
SECRET="your_shared_secret_here"
TIMESTAMP=$(date +%s)
BODY='{"request_id":"test_001","course_id":"42","callback_url":"https://webhook.site/your-uuid","options":{"language":"es"},"videos":[{"chapter_number":1,"title":"Intro","script":"Bienvenidos al curso de ejemplo.","duration_hint_seconds":60}]}'

SIG=$(echo -n "${TIMESTAMP}.${BODY}" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -X POST https://videosb.nomaddi.com/api/v1/video-batches \
  -H "Content-Type: application/json" \
  -H "X-Cursia-Request-ID: test_001" \
  -H "X-Cursia-Timestamp: $TIMESTAMP" \
  -H "X-Cursia-Signature: $SIG" \
  -d "$BODY"
```

### Step 2 — Poll batch status

```bash
BATCH_ID="a1b2c3d4-..."
TIMESTAMP=$(date +%s)
SIG=$(echo -n "${TIMESTAMP}." | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl https://videosb.nomaddi.com/api/v1/video-batches/$BATCH_ID \
  -H "X-Cursia-Timestamp: $TIMESTAMP" \
  -H "X-Cursia-Signature: $SIG"
```

### Step 3 — Cursia receives callback

Videogen will POST to `callback_url` with payload signed via `X-Videogen-Signature`.

Cursia verifies:
```typescript
const expected = createHmac('sha256', VIDEOGEN_WEBHOOK_SECRET)
  .update(`${req.headers['x-videogen-timestamp']}.${rawBody}`)
  .digest('hex');

if (expected !== req.headers['x-videogen-signature']) {
  return res.status(401).json({ error: 'invalid signature' });
}
```

Then downloads the MP4:
```typescript
const { file_url, expires_at, chapter_number } = callbackPayload;
const mp4Buffer = await fetch(file_url).then(r => r.arrayBuffer());
// upload mp4Buffer to user's YouTube...
```

---

## Running the Migration

After deploying, run:

```bash
npm run migration:run
```

This creates the `cursia_batches` and `cursia_items` tables in Supabase.

---

*Videogen is a stateless video generation engine. It does not manage YouTube accounts, user identity, or permanent storage.*
