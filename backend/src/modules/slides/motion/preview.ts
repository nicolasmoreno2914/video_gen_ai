import * as puppeteer from 'puppeteer';
import { VideoScene } from '../../database/entities/video-scene.entity';
import { checkMotionLayout, LayoutIssue } from './layout-check';
import { buildMotionTemplate } from './motion.template';
import { MotionSpec } from './spec';

// Navegador para revisar la distribución de las escenas animadas mientras se escribe el guion
// (antes de gastar en voz e imágenes). Uno por video: se abre al primer uso y se cierra al final.

const BRAND = { primaryColor: '#1E3A8A', secondaryColor: '#0EA5E9', institutionName: 'Cursia', logoBase64: null };

export class MotionPreview {
  private browser: puppeteer.Browser | null = null;

  /** Problemas de distribución de la escena (lista vacía si está bien) y captura del estado final (JPEG base64). */
  async check(spec: MotionSpec, title: string, estimatedSeconds: number): Promise<{ issues: LayoutIssue[]; snapshot: string }> {
    this.browser ??= await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const duration = Math.max(estimatedSeconds, spec.beats.length * 2.5 + 2);
    // Sin voz todavía: los beats se reparten a lo largo de la duración estimada
    const revealTimes = spec.beats.map((_, i) => 0.8 + (i * (duration - 3)) / spec.beats.length);
    const scene = { title, scene_type: 'explanation', duration_seconds: duration } as unknown as VideoScene;
    const html = buildMotionTemplate({ scene, brand: BRAND, imageBase64: null, requiresAiImage: false, timeline: { revealTimes } }, spec, duration);
    const page = await this.browser.newPage();
    try {
      // Media resolución: la revisión de distribución mide en px CSS (no cambia) y la captura pesa menos
      await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 0.5 });
      await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
      await page.evaluate(() =>
        Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]).then(() => undefined),
      );
      const issues = await checkMotionLayout(page);
      // Al terminar la revisión la escena quedó en su último beat: lo que el estudiante ve al final
      const snapshot = (await page.screenshot({ type: 'jpeg', quality: 75, encoding: 'base64' })) as string;
      return { issues, snapshot };
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
  }
}
