import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AppConfig } from '../../config/configuration';
import { GeneratedScript, GeneratedScene } from '../../common/types';
import { VideoJob } from '../database/entities/video-job.entity';
import { VideoScene } from '../database/entities/video-scene.entity';
import { VideosService } from '../videos/videos.service';

const SCRIPT_MINIMUMS = {
  scenes: 18,
  words: 1200,
  chars: 8500,
  estimatedSeconds: 480,
} as const;

interface ScriptMetrics {
  scenes: number;
  words: number;
  chars: number;
  estimatedSeconds: number;
}

const SYSTEM_PROMPT = `Eres un experto mundial en storytelling educativo, instructional design, guionización pedagógica, microlearning y creación de videos educativos tipo NotebookLM Video Overview.

Tu tarea es convertir contenido educativo en un guion narrativo altamente estructurado para un video educativo visual y narrado por voz IA.

NO resumir. NO escribir como artículo. NO párrafos de libro de texto.
Escribir como un docente experto explicando visualmente paso a paso.

════════════════════════════════════
DURACIÓN Y LONGITUD — OBLIGATORIO
════════════════════════════════════
- Video de ENTRE 7 Y 9 MINUTOS de duración real
- Narración total: MÍNIMO 8.500 caracteres, preferiblemente 10.000–13.000
- Total de escenas: MÍNIMO 18, ideal entre 20 y 26
- Cada escena: 30–45 segundos, UNA sola idea educativa
- Suma de estimated_duration_seconds: entre 480 y 650
- Narración por escena: MÍNIMO 110 palabras, ideal 130–160 palabras, máximo 180 palabras
- NO generar escenas con menos de 110 palabras de narración, salvo que sea imposible por la extensión del contenido

════════════════════════════════════
SECUENCIA PEDAGÓGICA OBLIGATORIA
════════════════════════════════════
El video DEBE seguir este orden de tipos de escena:

BLOQUE 1 — APERTURA (1–2 escenas)
  → hook (escena 1, obligatoria)
     • Pregunta provocadora o problema real
     • Crea curiosidad genuina, conecta emocionalmente
     • El título DEBE terminar en "?" si es pregunta guía
  → hook (escena 2, opcional si el tema lo amerita)

BLOQUE 2 — CONTEXTO (1–2 escenas)
  → context
     • Explica por qué el tema importa
     • Conecta con situaciones reales o datos concretos
     • Si incluyes cifras, porcentajes o estadísticas → ponlas en on_screen_text[0]

BLOQUE 3 — DESARROLLO (8–16 escenas, núcleo del video)
  Usar los tipos: explanation, process, comparison
  Orden sugerido dentro del bloque:
  → explanation (tantas como el contenido requiera, mínimo 4)
  → process (1–3 escenas si el contenido tiene pasos, procedimientos o ciclos)
  → comparison (1–2 escenas si hay conceptos que contrastar)

  Reglas del bloque de desarrollo:
  - No mezclar más de una idea por escena
  - Progresión lógica: de lo general a lo específico
  - Si el tema tiene jerarquías o niveles → usar explanation con on_screen_text como lista de niveles cortos
  - Si el tema tiene pasos secuenciales → usar process
  - Si hay dos conceptos contrastables → usar comparison

BLOQUE 4 — APLICACIÓN (1–3 escenas)
  → application (cómo se aplica en la vida real)
  → example (caso concreto, situación real, historia breve)

BLOQUE 5 — CIERRE (2 escenas, obligatorias)
  → summary (resumen de ideas clave, máx 4 bullets con checkmarks)
  → conclusion (reflexión final, invitación a la acción o pregunta de cierre)

════════════════════════════════════
CÓMO ESCRIBIR on_screen_text SEGÚN TIPO
════════════════════════════════════
El on_screen_text determina el LAYOUT VISUAL. Escríbelo acorde:

• hook → 0–2 frases cortas. Si es pregunta, on_screen_text puede estar vacío.
• context → Si hay dato numérico, SIEMPRE poner en on_screen_text[0] la cifra completa: "87% de los estudiantes..."
• explanation (concepto general) → 2–4 bullets explicativos, máx 8 palabras c/u
• explanation (jerarquía/niveles) → 4–7 items CORTOS (1–4 palabras c/u): ["Átomo", "Molécula", "Célula", "Tejido", "Órgano"]
• process → 3–5 pasos accionables, cada uno empezando con verbo: ["Identificar el problema", "Analizar causas", "Diseñar solución"]
• comparison → Primera mitad del array = lado A, segunda mitad = lado B. El título DEBE contener " vs " o " versus ": "Mitosis vs Meiosis"
• application → 2–3 bullets aplicados, concretos, del mundo real
• example → 2–3 bullets que describan el caso. Pueden ser más narrativos.
• summary → Exactamente 3–4 bullets de conclusión, empezando cada uno con el concepto clave
• conclusion → 1–3 frases reflexivas o preguntas de cierre

════════════════════════════════════
ESTILO DE NARRACIÓN
════════════════════════════════════
Voz: humana, cercana, educativa, profesional sin ser rígida.
Suena como: "un docente moderno explicando de manera visual y amigable"

Usa: frases medianas, lenguaje accesible, transiciones suaves, preguntas al estudiante.
NO usar: tono robótico, texto de libro de texto, exceso de formalidad.

════════════════════════════════════
REGLAS VISUALES
════════════════════════════════════
- on_screen_text: MUY POCO texto. La narración explica, la pantalla apoya.
- image_prompt: SIEMPRE en inglés, fondo blanco, estilo doodle educativo, sin texto en imagen.
- highlight_words: 1–3 palabras que se resaltarán en amarillo en pantalla.

════════════════════════════════════
REQUIRES_AI_IMAGE — CAMPO OBLIGATORIO
════════════════════════════════════
Cada escena DEBE incluir "requires_ai_image": true o false.
Este campo indica si la escena necesita una imagen generada por IA.

LÍMITE GLOBAL: máximo 8 escenas con requires_ai_image: true por video.

REGLA FIJA por layout_type (NO se puede cambiar):
• process_steps      → requires_ai_image: FALSE (siempre)
• comparison         → requires_ai_image: FALSE (siempre)
• hierarchy_diagram  → requires_ai_image: FALSE (siempre)
• summary_checklist  → requires_ai_image: FALSE (siempre)
• big_stat           → requires_ai_image: FALSE (siempre)
• guiding_question   → requires_ai_image: FALSE (siempre)

REGLA CONDICIONAL:
• cover              → requires_ai_image: TRUE (portada, siempre)
• real_example       → requires_ai_image: TRUE (escena de ejemplo/aplicación, siempre)
• conclusion_reflection → requires_ai_image: TRUE si se quiere cierre visual fuerte, FALSE si el texto es suficiente
• content_split      → requires_ai_image: TRUE si la imagen ayuda a entender el concepto visual; FALSE si no aporta

Si requires_ai_image: false → image_prompt puede ser null o string vacío.
Si requires_ai_image: true → image_prompt debe ser específico, en inglés, estilo doodle educativo.

════════════════════════════════════
LAYOUT_TYPE — CAMPO OBLIGATORIO
════════════════════════════════════
Cada escena DEBE incluir el campo "layout_type". Este campo determina el diseño visual exacto de la diapositiva.

Valores posibles y cuándo usarlos:

• "cover"
  → Portada visual impactante. Solo para la primera escena hook cuando NO es pregunta.
  → on_screen_text: vacío o máx 2 frases cortas.

• "guiding_question"
  → Una pregunta central grande en pantalla. Para hook que plantea pregunta o problema.
  → on_screen_text: vacío o 1 frase que complemente la pregunta.

• "big_stat"
  → Dato, cifra, porcentaje o estadística protagonista en tipografía gigante.
  → Usar cuando on_screen_text[0] contiene un número, %, $, cifra o dato cuantitativo.
  → on_screen_text[0] DEBE ser la cifra completa: "87% de los adultos..."

• "content_split"
  → Layout estándar: bullets a un lado, imagen al otro.
  → Para explanation general, contexto sin dato numérico, cualquier contenido en lista.
  → on_screen_text: 2–4 bullets explicativos.

• "hierarchy_diagram"
  → Pirámide o escalera de niveles visuales.
  → Usar cuando el contenido tiene jerarquía, niveles, categorías o escalas.
  → on_screen_text: 4–7 items MUY cortos (1–4 palabras): ["Básico", "Intermedio", "Avanzado"]

• "process_steps"
  → Secuencia horizontal de pasos conectados con flechas.
  → Usar cuando el contenido es un proceso, procedimiento, ciclo o flujo de pasos.
  → on_screen_text: 3–5 pasos, cada uno empezando con verbo.

• "comparison"
  → Dos columnas enfrentadas. Primera mitad del array = columna A, segunda mitad = columna B.
  → Usar cuando se contrastan dos conceptos, teorías, enfoques o situaciones.
  → on_screen_text: array con cantidad par, primera mitad izquierda, segunda mitad derecha.

• "real_example"
  → Imagen protagonista (ocupa 60% de la pantalla), texto aplicado a la derecha.
  → Usar para application y example. Contenido concreto, caso real, historia breve.
  → on_screen_text: 2–3 bullets aplicados del mundo real.

• "summary_checklist"
  → Lista con checkmarks de conclusión. Fondo verde suave.
  → SOLO para escenas de tipo summary.
  → on_screen_text: exactamente 3–4 bullets que resuman lo aprendido.

• "conclusion_reflection"
  → Tarjeta centrada sobre fondo de color primario. Cierre reflexivo.
  → SOLO para escenas de tipo conclusion.
  → on_screen_text: 1–3 frases reflexivas o pregunta de cierre.

REGLA DE ASIGNACIÓN:
- hook sin pregunta → "cover"
- hook con pregunta o "¿" → "guiding_question"
- context con cifra → "big_stat"
- context sin cifra → "content_split"
- explanation con niveles/jerarquía/categorías → "hierarchy_diagram"
- explanation general → "content_split"
- process → "process_steps"
- comparison → "comparison"
- application → "real_example"
- example → "real_example"
- summary → "summary_checklist"
- conclusion → "conclusion_reflection"

════════════════════════════════════
FORMATO DE RESPUESTA
════════════════════════════════════
RESPONDE EXCLUSIVAMENTE con JSON válido puro. Sin markdown. Sin bloques de código. Sin texto extra.

{
  "video_title": "string",
  "estimated_duration_minutes": 0,
  "total_narration_characters": 0,
  "guiding_question": "La pregunta pedagógica central del capítulo",
  "scenes": [
    {
      "scene_order": 1,
      "scene_type": "hook|context|explanation|process|comparison|application|example|summary|conclusion",
      "layout_type": "cover|guiding_question|big_stat|content_split|hierarchy_diagram|process_steps|comparison|real_example|summary_checklist|conclusion_reflection",
      "requires_ai_image": true,
      "learning_goal": "Qué aprende el estudiante en esta escena (una oración)",
      "title": "Título corto (máx 50 chars)",
      "narration": "Texto completo para voz IA. MÍNIMO 110 palabras, ideal 130–160 palabras, máximo 180 palabras.",
      "on_screen_text": ["Bullet o item 1", "Bullet o item 2"],
      "visual_direction": "Descripción de cómo debe verse esta escena",
      "image_prompt": "DALL-E prompt in English: educational doodle illustration of [specific concept], white background, hand-drawn style, black ink lines, minimal color accents, no text in image, clean educational sketch",
      "highlight_words": ["palabra1", "palabra2"],
      "transition": "fade|slide|zoom|dissolve",
      "estimated_duration_seconds": 30
    }
  ]
}

REGLAS FINALES:
- layout_type es OBLIGATORIO en cada escena. Nunca omitirlo.
- requires_ai_image es OBLIGATORIO en cada escena. Nunca omitirlo.
- Si layout_type es process_steps, comparison, hierarchy_diagram, summary_checklist, big_stat o guiding_question → requires_ai_image DEBE ser false.
- El total de escenas con requires_ai_image: true NO debe superar 8.
- Si requires_ai_image: false → image_prompt puede ser null.
- on_screen_text: estructurarlo según lo que pide cada layout_type (ver sección LAYOUT_TYPE)
- La suma de estimated_duration_seconds debe estar entre 480 y 650
- Cada escena debe tener estimated_duration_seconds entre 30 y 45
- El orden de scene_type en el array DEBE respetar la secuencia pedagógica obligatoria`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly videosService: VideosService,
  ) {
    const apiKey = this.configService.get<AppConfig['openai']>('openai')?.apiKey ?? '';
    this.model = this.configService.get<AppConfig['openai']>('openai')?.model ?? 'gpt-4o';
    this.client = new OpenAI({ apiKey });
  }

  async generateScript(job: VideoJob): Promise<GeneratedScript> {
    this.logger.log(`[AiService] [${job.id}] Generando guion con ${this.model}`);

    const userPrompt = `Título del capítulo: ${job.title}
Duración objetivo: ${job.target_duration_minutes} minutos
Idioma de narración: español
Estilo visual del video: ${job.visual_style}

Texto del capítulo:
${job.content_txt}`;

    // Initial generation with up to 3 attempts
    const script = await this.callGptWithRetry(job.id, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ], 'generate_script');

    // Duration validation and pedagogical expansion
    const finalScript = await this.ensureMinimumDuration(job, script);

    await this.videosService['videoJobRepo'].update(job.id, {
      generated_script: finalScript as unknown as object,
    });

    this.logger.log(
      `[AiService] [${job.id}] Guion final: ${finalScript.scenes.length} escenas, ` +
      `${finalScript.total_narration_characters} chars narración`,
    );

    return finalScript;
  }

  private async ensureMinimumDuration(job: VideoJob, script: GeneratedScript): Promise<GeneratedScript> {
    const metrics = this.computeMetrics(script);
    this.logMetrics(job.id, metrics, 'inicial');

    if (this.meetsMinimums(metrics)) {
      return script;
    }

    this.logger.warn(
      `[AiService] [${job.id}] Guion NO cumple mínimos — intentando expansión pedagógica`,
    );

    // Up to 2 expansion attempts
    let current = script;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const currentMetrics = this.computeMetrics(current);
      const expansionMessages = this.buildExpansionMessages(job, current, currentMetrics);

      try {
        const expanded = await this.callGptWithRetry(
          job.id,
          expansionMessages,
          `expand_script_attempt_${attempt}`,
        );

        const expandedMetrics = this.computeMetrics(expanded);
        this.logMetrics(job.id, expandedMetrics, `expansión ${attempt}`);

        if (this.meetsMinimums(expandedMetrics)) {
          this.logger.log(`[AiService] [${job.id}] Expansión ${attempt} exitosa — mínimos alcanzados`);
          return expanded;
        }

        current = expanded;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[AiService] [${job.id}] Expansión ${attempt} fallida: ${msg}`);
        break;
      }
    }

    // Warn but don't block — return best effort
    const finalMetrics = this.computeMetrics(current);
    this.logger.warn(
      `[AiService] [${job.id}] No se alcanzaron los mínimos tras expansión. ` +
      `Escenas: ${finalMetrics.scenes}/${SCRIPT_MINIMUMS.scenes}, ` +
      `Chars: ${finalMetrics.chars}/${SCRIPT_MINIMUMS.chars}. Continuando con guion actual.`,
    );
    return current;
  }

  private buildExpansionMessages(
    job: VideoJob,
    script: GeneratedScript,
    metrics: ScriptMetrics,
  ): Array<{ role: 'system' | 'user'; content: string }> {
    const sceneSummary = script.scenes
      .map(s => `  Escena ${s.scene_order} [${s.scene_type}/${s.layout_type}]: "${s.title}"`)
      .join('\n');

    const needed = {
      scenes: Math.max(0, SCRIPT_MINIMUMS.scenes - metrics.scenes),
      chars: Math.max(0, SCRIPT_MINIMUMS.chars - metrics.chars),
      seconds: Math.max(0, SCRIPT_MINIMUMS.estimatedSeconds - metrics.estimatedSeconds),
    };

    const userPrompt = `El guion generado es demasiado corto para un video educativo de 7 minutos. Necesita expansión pedagógica OBLIGATORIA.

MÉTRICAS ACTUALES (insuficientes):
- Escenas: ${metrics.scenes} (mínimo requerido: ${SCRIPT_MINIMUMS.scenes})
- Palabras narradas: ${metrics.words} (mínimo requerido: ${SCRIPT_MINIMUMS.words})
- Caracteres de narración: ${metrics.chars} (mínimo requerido: ${SCRIPT_MINIMUMS.chars})
- Duración estimada: ${Math.floor(metrics.estimatedSeconds / 60)}:${String(metrics.estimatedSeconds % 60).padStart(2, '0')} min (mínimo requerido: 8:00 min)

NECESITAS AGREGAR AL MENOS:
- ${needed.scenes} escenas adicionales
- ${needed.chars} caracteres adicionales de narración

GUION ACTUAL (estructura para referencia):
${sceneSummary}

GUION ACTUAL (JSON completo — expandir desde aquí):
${JSON.stringify(script, null, 0)}

INSTRUCCIONES DE EXPANSIÓN PEDAGÓGICA OBLIGATORIA:
1. Devuelve el guion COMPLETO en JSON — las escenas originales MÁS las nuevas escenas intercaladas
2. Las nuevas escenas deben ir principalmente en el BLOQUE DE DESARROLLO (explanation, process, comparison)
3. Estrategias pedagógicas para expandir (usar las que apliquen al contenido):
   - Profundizar en un sub-concepto que se mencionó brevemente
   - Agregar un ejemplo concreto o caso real del contexto educativo
   - Incluir una analogía o metáfora que facilite la comprensión
   - Explicar una aplicación práctica del concepto en la vida real
   - Agregar una escena de proceso si hay pasos o procedimientos implícitos
   - Agregar una escena de comparación si hay dos enfoques o conceptos contrastables
   - Conectar el tema con conocimientos previos del estudiante
4. NUNCA inventar información que no esté en el contenido original
5. NUNCA rellenar con frases vacías, repeticiones o conclusiones anticipadas
6. Cada narración nueva: MÍNIMO 120 palabras, ideal 130–160 palabras
7. Cada escena nueva: estimated_duration_seconds entre 30 y 45
8. Asigna layout_type y requires_ai_image correctos a cada nueva escena
9. Renumera scene_order en orden consecutivo en el array final

Contenido educativo original (extrae profundidad adicional de aquí):
Título: ${job.title}
${job.content_txt}`;

    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];
  }

  private async callGptWithRetry(
    jobId: string,
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    operation: string,
  ): Promise<GeneratedScript> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages,
          temperature: attempt === 1 ? 0.7 : 0.3,
          max_tokens: 16000,
          response_format: { type: 'json_object' },
        });

        const rawContent = response.choices[0]?.message?.content ?? '';
        const script = this.parseAndValidateScript(rawContent, jobId);

        const inputTokens = response.usage?.prompt_tokens ?? 0;
        const outputTokens = response.usage?.completion_tokens ?? 0;
        await this.videosService.logApiUsage({
          videoJobId: jobId,
          institutionId: null,
          provider: 'openai_chat',
          operation,
          inputUnits: inputTokens,
          outputUnits: outputTokens,
          estimatedCost: this.estimateChatCost(inputTokens, outputTokens),
          modelName: this.model,
          unitType: 'tokens',
          metadata: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
        });

        return script;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(`[AiService] [${jobId}] ${operation} intento ${attempt}/3: ${lastError.message}`);
        if (attempt < 3) await this.sleep(2000);
      }
    }

    throw new Error(
      `${operation} falló después de 3 intentos: ${lastError?.message ?? 'Error desconocido'}`,
    );
  }

  private computeMetrics(script: GeneratedScript): ScriptMetrics {
    const chars = script.scenes.reduce((sum, s) => sum + (s.narration?.length ?? 0), 0);
    const words = script.scenes.reduce(
      (sum, s) => sum + (s.narration?.split(/\s+/).filter(Boolean).length ?? 0),
      0,
    );
    const estimatedSeconds = script.scenes.reduce(
      (sum, s) => sum + (s.estimated_duration_seconds ?? 0),
      0,
    );
    return { scenes: script.scenes.length, words, chars, estimatedSeconds };
  }

  private meetsMinimums(metrics: ScriptMetrics): boolean {
    return (
      metrics.scenes >= SCRIPT_MINIMUMS.scenes &&
      metrics.words >= SCRIPT_MINIMUMS.words &&
      metrics.chars >= SCRIPT_MINIMUMS.chars &&
      metrics.estimatedSeconds >= SCRIPT_MINIMUMS.estimatedSeconds
    );
  }

  private logMetrics(jobId: string, metrics: ScriptMetrics, label: string): void {
    const mins = Math.floor(metrics.estimatedSeconds / 60);
    const secs = metrics.estimatedSeconds % 60;
    const ok = this.meetsMinimums(metrics) ? '✓' : '✗';
    this.logger.log(
      `[AiService] [${jobId}] Métricas ${label} ${ok}: ` +
      `${metrics.scenes} escenas, ${metrics.words} palabras, ` +
      `${metrics.chars} chars, ${mins}:${String(secs).padStart(2, '0')} min estimados`,
    );
  }

  private parseAndValidateScript(raw: string, jobId: string): GeneratedScript {
    let cleaned = raw.trim();

    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    cleaned = cleaned.replace(/^```\s*/i, '').replace(/\s*```$/, '');

    let parsed: GeneratedScript;
    try {
      parsed = JSON.parse(cleaned) as GeneratedScript;
    } catch {
      throw new Error(`El modelo devolvió JSON inválido. Primeros 200 chars: ${cleaned.substring(0, 200)}`);
    }

    if (!parsed.video_title) {
      throw new Error('El guion generado no tiene campo video_title');
    }

    if (!Array.isArray(parsed.scenes) || parsed.scenes.length < 8) {
      throw new Error(
        `El guion tiene ${parsed.scenes?.length ?? 0} escenas pero se requieren al menos 8`,
      );
    }

    // Enforce requires_ai_image rules
    parsed.scenes = this.enforceAiImageRules(parsed.scenes, jobId);

    parsed.total_narration_characters = parsed.scenes.reduce(
      (sum: number, s: GeneratedScene) => sum + (s.narration?.length ?? 0),
      0,
    );

    this.logger.log(
      `[AiService] [${jobId}] Validación OK: ${parsed.scenes.length} escenas, ` +
      `${parsed.total_narration_characters} chars`,
    );

    return parsed;
  }

  private enforceAiImageRules(scenes: GeneratedScene[], jobId: string): GeneratedScene[] {
    const CSS_ONLY_LAYOUTS = new Set([
      'process_steps', 'comparison', 'hierarchy_diagram',
      'summary_checklist', 'big_stat', 'guiding_question',
    ]);
    const MAX_AI_IMAGES = 8;

    // Step 1: enforce layout_type → requires_ai_image rules
    scenes = scenes.map(s => {
      const layout = s.layout_type as string;
      if (CSS_ONLY_LAYOUTS.has(layout)) {
        return { ...s, requires_ai_image: false };
      }
      // Default true if field is missing
      if (s.requires_ai_image === undefined || s.requires_ai_image === null) {
        return { ...s, requires_ai_image: true };
      }
      return s;
    });

    // Step 2: count and cap at 8
    const aiScenes = scenes.filter(s => s.requires_ai_image);
    if (aiScenes.length > MAX_AI_IMAGES) {
      const excess = aiScenes.length - MAX_AI_IMAGES;
      this.logger.warn(
        `[AiService] [${jobId}] ${aiScenes.length} escenas con AI image — reduciendo a ${MAX_AI_IMAGES} (eliminando ${excess})`,
      );

      // Priority order to keep: cover, real_example, conclusion_reflection, content_split
      const KEEP_PRIORITY = ['cover', 'real_example', 'conclusion_reflection', 'content_split'];
      let kept = 0;
      scenes = scenes.map(s => {
        if (!s.requires_ai_image) return s;
        const priority = KEEP_PRIORITY.indexOf(s.layout_type as string);
        if (kept < MAX_AI_IMAGES && priority <= KEEP_PRIORITY.indexOf('real_example')) {
          kept++;
          return s;
        }
        if (kept < MAX_AI_IMAGES) {
          kept++;
          return s;
        }
        return { ...s, requires_ai_image: false };
      });
    }

    const finalAiCount = scenes.filter(s => s.requires_ai_image).length;
    const cssCount = scenes.length - finalAiCount;
    this.logger.log(
      `[AiService] [${jobId}] Imágenes IA: ${finalAiCount} | CSS layouts: ${cssCount}`,
    );

    return scenes;
  }

  async expandSceneNarrationsForDuration(params: {
    job: VideoJob;
    scenesToExpand: VideoScene[];
    missingSeconds: number;
    sourceContent: string;
  }): Promise<Array<{ scene_order: number; narration: string }>> {
    const { job, scenesToExpand, missingSeconds, sourceContent } = params;
    const additionalWords = Math.ceil(missingSeconds * 2.4);

    const sceneSummary = scenesToExpand.map(s => {
      const wordCount = (s.narration ?? '').split(/\s+/).filter(Boolean).length;
      return `  Escena ${s.scene_order} [${s.scene_type}] "${s.title}": ${wordCount} palabras, ${(s.duration_seconds ?? 0).toFixed(1)}s real`;
    }).join('\n');

    const prompt = `Necesitamos expandir las narraciones de estas escenas para alcanzar 7 minutos de video real.

FALTAN: ${Math.round(missingSeconds)} segundos (~${additionalWords} palabras adicionales en total)

ESCENAS A EXPANDIR:
${sceneSummary}

CONTENIDO EDUCATIVO ORIGINAL (extraer profundidad adicional):
Título: ${job.title}
${sourceContent}

INSTRUCCIONES:
1. Expande SOLO las escenas listadas arriba
2. Cada narración expandida debe ser MÁS LARGA que la original
3. Máximo 200 palabras por escena
4. Distribuye el aumento proporcional a cuánto falta en cada escena
5. NUNCA inventar información — extraer del contenido original
6. Mantener el tono educativo, conversacional y profesional
7. Agregar ejemplos, analogías, explicaciones adicionales, contexto real
8. NO repetir frases ya existentes — SOLO agregar contenido nuevo al final o entre ideas

Responde EXCLUSIVAMENTE con JSON válido, sin markdown:
{
  "expanded_scenes": [
    { "scene_order": N, "narration": "narración completa y expandida aquí" }
  ]
}`;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: 'Eres un experto en guionización educativa. Expandes narraciones de video para alcanzar la duración objetivo. Responde solo con JSON válido.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.6,
          max_tokens: 8000,
          response_format: { type: 'json_object' },
        });

        const raw = response.choices[0]?.message?.content ?? '';
        const parsed = JSON.parse(raw) as { expanded_scenes: Array<{ scene_order: number; narration: string }> };

        if (!Array.isArray(parsed.expanded_scenes)) {
          throw new Error('Respuesta GPT no contiene expanded_scenes array');
        }

        const validSceneOrders = new Set(scenesToExpand.map(s => s.scene_order));

        const validated = parsed.expanded_scenes.filter(e => {
          if (!validSceneOrders.has(e.scene_order)) return false;
          if (typeof e.narration !== 'string' || e.narration.trim().length < 50) return false;
          const words = e.narration.split(/\s+/).filter(Boolean).length;
          if (words > 200) {
            e.narration = e.narration.split(/\s+/).slice(0, 200).join(' ');
          }
          const original = scenesToExpand.find(s => s.scene_order === e.scene_order);
          const originalLen = original?.narration?.length ?? 0;
          if (e.narration.length <= originalLen) return false;
          return true;
        });

        const expIn = response.usage?.prompt_tokens ?? 0;
        const expOut = response.usage?.completion_tokens ?? 0;
        await this.videosService.logApiUsage({
          videoJobId: job.id,
          institutionId: null,
          provider: 'openai_chat',
          operation: 'expand_narrations',
          inputUnits: expIn,
          outputUnits: expOut,
          estimatedCost: this.estimateChatCost(expIn, expOut),
          modelName: this.model,
          unitType: 'tokens',
          metadata: { input_tokens: expIn, output_tokens: expOut, total_tokens: expIn + expOut },
        });

        this.logger.log(
          `[AiService] [${job.id}] Expansión post-audio: ${validated.length}/${scenesToExpand.length} escenas expandidas`,
        );

        return validated;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(`[AiService] [${job.id}] expandSceneNarrations intento ${attempt}/2: ${lastError.message}`);
        if (attempt < 2) await this.sleep(2000);
      }
    }

    throw new Error(`expandSceneNarrations falló: ${lastError?.message ?? 'Error desconocido'}`);
  }

  private estimateChatCost(inputTokens: number, outputTokens: number): number {
    // GPT-4o pricing: $5/1M input, $15/1M output
    return (inputTokens / 1_000_000) * 5 + (outputTokens / 1_000_000) * 15;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
