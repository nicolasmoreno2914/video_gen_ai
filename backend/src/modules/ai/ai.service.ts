import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AppConfig } from '../../config/configuration';
import { GeneratedScript, GeneratedScene } from '../../common/types';
import { VideoJob } from '../database/entities/video-job.entity';
import { VideoScene } from '../database/entities/video-scene.entity';
import { VideosService } from '../videos/videos.service';
import { priceChat } from '../costs/cost-config';
import { ICON_NAMES, isValidIcon } from '../slides/templates/icons';

// Duración según el contenido, con tope (decisión de producto 2026-10-31)
const MAX_VIDEO_SECONDS = 420;
const WORDS_PER_MINUTE = 140;

const SYSTEM_PROMPT = `Eres un experto mundial en storytelling educativo, instructional design, guionización pedagógica, microlearning y creación de videos educativos tipo NotebookLM Video Overview.

Tu tarea es convertir contenido educativo en un guion narrativo altamente estructurado para un video educativo visual y narrado por voz IA.

NO resumir. NO escribir como artículo. NO párrafos de libro de texto.
Escribir como un docente experto explicando visualmente paso a paso.

════════════════════════════════════
DURACIÓN Y LONGITUD — OBLIGATORIO
════════════════════════════════════
- La duración la decide el CONTENIDO: cubre todo lo importante del capítulo, sin relleno ni repeticiones.
- TOPE: máximo 7 minutos de video (unas 950 palabras de narración en total). Si el capítulo es largo,
  prioriza lo esencial y sintetiza; nunca superes el tope.
- Cada escena: UNA sola idea, 25–45 segundos, entre 60 y 110 palabras de narración.
- Número de escenas: el que el contenido necesite (normalmente entre 8 y 16).
- estimated_duration_seconds: palabras de la narración ÷ 140 × 60.

════════════════════════════════════
SECUENCIA PEDAGÓGICA OBLIGATORIA
════════════════════════════════════
El video DEBE seguir este orden de tipos de escena:

BLOQUE 1 — APERTURA (1–2 escenas)
  → hook (escena 1, obligatoria)
     • El hook DEBE ser variado según el contenido. NO usar siempre el mismo tipo.
     • Elige el hook_type más adecuado al tema (ver sección HOOK_TYPE más abajo).
     • Crea curiosidad genuina, conecta emocionalmente con el estudiante.
     • NO usar hook_stat por defecto. Solo cuando el dato sea verdaderamente impactante.
     • NO empezar siempre con pregunta ni siempre con portada. Varía entre capítulos.
  → hook (escena 2, opcional si el tema lo amerita y refuerza el gancho inicial)

BLOQUE 2 — CONTEXTO (1–2 escenas)
  → context
     • Explica por qué el tema importa.
     • El contexto NO siempre es un dato numérico. Elige según el contenido:
       - context_stat: tienes una cifra realmente sorprendente que justifica el tema por sí sola.
       - context_narrative: la relevancia se explica mejor con una situación breve o historia real.
       - context_problem: el valor del tema viene de resolver un problema concreto y cotidiano.
       - context_scenario: conviene situar al estudiante en un escenario antes de explicar.
     • Solo si es context_stat → incluir la cifra en on_screen_text[0]: "87% de los adultos..."
     • Si es context_narrative o context_problem → usar content_split normal sin forzar cifras.

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

• hook → depende del hook_type:
    hook_question/hook_cover: 0–1 frase corta o vacío.
    hook_story/hook_problem: 2–3 bullets narrativos (situación → tensión → aprendizaje).
    hook_stat: la cifra completa en [0] + 1–2 bullets de contexto.
    hook_contrast/hook_myth: 4–6 bullets divididos en mitades iguales (columna A / columna B).
    hook_scenario: 1–2 frases que describan el escenario imaginado.
    hook_decision: 2 opciones claras enfrentadas (columna A / columna B).
    hook_visual_metaphor: 0–1 frase, imagen IA es lo central.
• context → SOLO si es context_stat: cifra en on_screen_text[0]. Para context_narrative, context_problem o context_scenario: 2–3 bullets explicativos normales sin cifra obligatoria.
• explanation (concepto general) → 2–4 bullets explicativos, máx 8 palabras c/u
• explanation (jerarquía/niveles) → 4–7 items CORTOS (1–4 palabras c/u): ["Átomo", "Molécula", "Célula", "Tejido", "Órgano"]
• process → 3–5 pasos accionables, cada uno empezando con verbo: ["Identificar el problema", "Analizar causas", "Diseñar solución"]
• comparison → Primera mitad del array = lado A, segunda mitad = lado B. El título DEBE contener " vs " o " versus ": "Mitosis vs Meiosis"
• application → 2–3 bullets aplicados, concretos, del mundo real
• example → 2–3 bullets que describan el caso. Pueden ser más narrativos.
• summary → Exactamente 3–4 bullets de conclusión, empezando cada uno con el concepto clave
• conclusion → 1–3 frases reflexivas o preguntas de cierre
• icon_cards → 2–6 ideas paralelas, máx 8 palabras c/u
• cycle_diagram → 3–6 etapas de 1–3 palabras c/u, en el orden del ciclo
• concept_map → 3–6 componentes o factores, máx 6 palabras c/u. highlight_words[0] = el concepto central (1–2 palabras)
• timeline → 3–6 hitos con formato "FECHA: hecho" (ej. "1969: Nace ARPANET"), en orden cronológico

════════════════════════════════════
ESTILO DE NARRACIÓN — ESCRIBIR PARA EL OÍDO
════════════════════════════════════
La narración se ESCUCHA, no se lee. Escríbela como habla un docente cercano frente a su clase,
en español latinoamericano neutro (tú, no vos ni vosotros).

Reglas:
- Frases cortas: la mayoría de menos de 20 palabras. Una idea por frase.
- Háblale directo al estudiante: "imagina que…", "¿te ha pasado que…?", "fíjate en esto".
- Usa la puntuación para marcar pausas: punto para pausas claras, coma para pausas breves,
  puntos suspensivos (…) antes de una idea importante. Nunca frases encadenadas con muchas comas.
- Ejemplos concretos y cotidianos antes que definiciones abstractas.
- Repite la idea clave al cerrar la escena con otras palabras ("En resumen: …", "O sea: …").
- Las enumeraciones se dicen como habla una persona: "Primero… Después… Y al final…",
  nunca "los elementos son: a, b, c".
- Escribe los números, siglas y símbolos como se pronuncian: "el treinta y cinco por ciento",
  "la O-M-S", "más de mil personas".
- Transiciones naturales entre escenas: "Ahora que sabes esto…", "Pero hay algo más…".

NO usar: lenguaje de libro de texto o de artículo académico, frases largas con subordinadas,
voz pasiva ("es considerado", "se lleva a cabo"), muletillas como "cabe destacar" o
"es importante mencionar", ni paréntesis o listas con viñetas dentro de la narración.

════════════════════════════════════
HOOK_TYPE — VARIEDAD DE APERTURA (OBLIGATORIO)
════════════════════════════════════
Cada escena con scene_type: "hook" DEBE incluir el campo hook_type.
Para todas las demás escenas, incluir hook_type: null.

NO uses siempre el mismo hook_type. El inicio de cada capítulo debe sentirse diferente.

TIPOS DISPONIBLES:

• "hook_question"
  → Pregunta central fuerte que genera reflexión o intriga.
  → layout_type: guiding_question. Título DEBE terminar en "?".
  → Ideal para: conceptos abstractos, filosóficos, éticos o que generan dilema.

• "hook_cover"
  → Portada visual con frase de impacto. Sin pregunta, sin dato. Pura presencia visual.
  → layout_type: cover. requires_ai_image: true.
  → Ideal para: temas identitarios, motivacionales, con imagen fuerte disponible.

• "hook_story"
  → Mini situación real o anécdota concreta que sitúa al estudiante.
  → layout_type: real_example. requires_ai_image: true.
  → on_screen_text: 2–3 bullets narrativos (situación → tensión → aprendizaje).
  → Ideal para: emprendimiento, liderazgo, educación, salud, relaciones, historia.

• "hook_problem"
  → Problema cotidiano o profesional que el capítulo va a resolver.
  → layout_type: content_split (requires_ai_image: true) o guiding_question.
  → on_screen_text: 2–3 señales o consecuencias del problema.
  → Ideal para: temas técnicos con aplicación práctica, resolución de problemas.

• "hook_stat"
  → Cifra o dato verdaderamente sorprendente. SOLO usar si el número impacta por sí solo.
  → layout_type: big_stat.
  → NO usar por defecto. Solo si el dato es el argumento más poderoso del capítulo.
  → Evitar si el dato es genérico o predecible.

• "hook_contrast"
  → Dos situaciones, realidades o resultados opuestos enfrentados.
  → layout_type: comparison. Título DEBE contener " vs " o " versus ".
  → on_screen_text: array par, primera mitad columna A, segunda mitad columna B.
  → Ideal para: antes/después, con/sin, error frecuente vs buena práctica.

• "hook_myth"
  → Mito, creencia errónea o idea equivocada muy común que el capítulo va a corregir.
  → layout_type: comparison. Columna A = mito, columna B = realidad.
  → Ideal para: ciencias, medicina, finanzas, psicología, educación.

• "hook_decision"
  → Dilema o decisión con dos caminos posibles. Invita al estudiante a elegir.
  → layout_type: comparison o process_steps.
  → Ideal para: estrategia, gestión, ética, toma de decisiones.

• "hook_scenario"
  → "Imagina que..." — sitúa al estudiante en una situación concreta e inmersiva.
  → layout_type: content_split. requires_ai_image: true (imagen contextual).
  → on_screen_text: 1–2 frases que describan el escenario.
  → Ideal para: simulaciones, casos hipotéticos, aprendizaje situacional.

• "hook_visual_metaphor"
  → Abre con una metáfora visual poderosa que representa el concepto central.
  → layout_type: cover o content_split. requires_ai_image: true (imagen es lo esencial).
  → on_screen_text: 0–1 frase que refuerce la metáfora.
  → Ideal para: conceptos abstractos, sistemas complejos, ideas difíciles de verbalizar.

REGLAS DE SELECCIÓN DE HOOK_TYPE según el contenido:
  - Temas humanos (emprendimiento, liderazgo, educación, salud, motivación) → hook_story o hook_problem
  - Procesos técnicos o secuencias de pasos (programación, medicina, ingeniería) → hook_question o hook_scenario
  - Dos enfoques, corrientes o teorías opuestas → hook_contrast
  - Mito frecuente o error conceptual muy común en el área → hook_myth
  - Dato estadístico realmente impactante disponible en el contenido → hook_stat
  - Concepto abstracto, filosófico o difícil de visualizar → hook_visual_metaphor o hook_question
  - Decisión estratégica o dilema con consecuencias reales → hook_decision
  - Tema visual o identitario fuerte → hook_cover o hook_visual_metaphor
  - Situación cotidiana que conecta con el estudiante → hook_scenario o hook_story

IMPORTANTE:
  - NO usar hook_stat como default.
  - Si no tienes un dato realmente sorprendente, elige otro hook_type.
  - El primer slide de cada capítulo debe variar en tipo y tono.

════════════════════════════════════
REGLAS VISUALES
════════════════════════════════════
- on_screen_text: MUY POCO texto. La narración explica, la pantalla apoya.
- image_prompt: SIEMPRE en inglés. Describe SOLO el contenido de la imagen (qué se ve, quién, dónde,
  qué hace), con detalles concretos y correctos. NO describas el estilo artístico ni los colores:
  el estilo se añade automáticamente según visual_family. Nunca pidas texto, etiquetas ni números en la imagen.
  VARIEDAD DE COMPOSICIÓN — alterna entre estos tipos para que las escenas no sean monótonas:
  • wide_establishing: panorámica amplia con múltiples elementos del concepto en contexto
  • close_up_detail: primer plano de un objeto o mecanismo clave, detalle técnico
  • birds_eye_diagram: vista cenital, diagrama aéreo con conexiones y relaciones
  • editorial_collage: varios iconos/objetos flotantes organizados en una composición libre
  • symbolic_object: un único objeto icónico que simboliza el concepto (simple, poderoso)
  • human_context: persona o mano interactuando con herramientas/objetos del tema
  • isometric_diagram: vista isométrica educativa con capas, edificios, máquinas o sistemas
  • visual_metaphor: metáfora visual abstracta que representa el concepto de forma creativa
  No repitas el mismo tipo de composición en dos escenas consecutivas.
- highlight_words: 1–3 palabras que se resaltarán en amarillo en pantalla.
- icons: para CADA elemento de on_screen_text (mismo orden y cantidad) elige el icono que mejor
  lo represente, SOLO de esta lista (si ninguno encaja, null):
  ${ICON_NAMES.join(', ')}
- visual_family (nivel video): "realistic" si el tema es salud, medicina, anatomía, biología,
  ciencias naturales u oficios técnicos/prácticos; "illustration" para todo lo demás.
- image_precision (por escena con imagen): "high" si la imagen debe ser técnicamente exacta
  (anatomía, procedimientos clínicos o de seguridad, técnica correcta, máquinas, mapas); si no, "normal".
- image_style (solo si visual_family es "realistic"): "atlas" para estructuras (órganos, células,
  piezas, máquinas) y "photo" para personas en situaciones o procedimientos. En "illustration": null.
- image_check (solo si image_precision es "high"): lista breve en español de lo que DEBE verse
  correcto en la imagen, verificable a simple vista (ej. "manos entrelazadas en el centro del pecho;
  brazos rectos; hombros sobre las manos"). Si no aplica: null.
- reveal_cues: los elementos de on_screen_text aparecen en pantalla en el momento en que la voz
  los menciona. Para CADA elemento de on_screen_text (mismo orden y misma cantidad) copia una
  frase LITERAL de 3 a 6 palabras de la narración donde empieza a hablarse de ese elemento.
  Debe aparecer tal cual en la narración y en orden creciente. Si un elemento no se menciona
  explícitamente, usa null.

════════════════════════════════════
REQUIRES_AI_IMAGE — CAMPO OBLIGATORIO
════════════════════════════════════
Cada escena DEBE incluir "requires_ai_image": true o false.
Este campo indica si la escena necesita una imagen generada por IA.

LÍMITE GLOBAL: máximo 12 escenas con requires_ai_image: true por video.
Las escenas con layout_type "cover" y "conclusion_reflection" NO cuentan para este límite (siempre tienen imagen).

REGLA FIJA por layout_type (NO se puede cambiar):
• process_steps      → requires_ai_image: FALSE (siempre)
• comparison         → requires_ai_image: FALSE (siempre)
• hierarchy_diagram  → requires_ai_image: FALSE (siempre)
• summary_checklist  → requires_ai_image: FALSE (siempre)
• big_stat           → requires_ai_image: FALSE (siempre)
• guiding_question   → requires_ai_image: FALSE (siempre)
• icon_cards         → requires_ai_image: FALSE (siempre)
• cycle_diagram      → requires_ai_image: FALSE (siempre)
• concept_map        → requires_ai_image: FALSE (siempre)
• timeline           → requires_ai_image: FALSE (siempre)

REGLA CONDICIONAL:
• cover              → requires_ai_image: TRUE (portada, siempre)
• real_example       → requires_ai_image: TRUE (escena de ejemplo/aplicación, siempre)
• conclusion_reflection → requires_ai_image: TRUE si se quiere cierre visual fuerte, FALSE si el texto es suficiente
• content_split      → requires_ai_image: TRUE si la imagen ayuda a entender el concepto visual; FALSE si no aporta

Si requires_ai_image: false → image_prompt puede ser null o string vacío.
Si requires_ai_image: true → image_prompt debe ser específico y en inglés (solo contenido, sin estilo).

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

• "icon_cards"
  → Tarjetas grandes con un icono por idea. Sin imagen IA.
  → Para explicaciones con 2–6 ideas paralelas que no necesitan una ilustración.

• "cycle_diagram"
  → Diagrama circular con flechas entre etapas que se repiten (ciclo del agua, ciclo de mejora, PDCA).

• "concept_map"
  → Concepto central con 3–6 ramas (componentes, factores, causas, tipos).

• "timeline"
  → Línea de tiempo con 3–6 hitos fechados, para historia, evolución o cronologías.

DIAGRAMAS — OBLIGATORIO: los diagramas animados explican mejor que una lista de texto.
- Cada video debe tener AL MENOS 3 escenas con icon_cards, cycle_diagram, concept_map o timeline.
- Si el contenido menciona fechas o una evolución histórica → timeline (siempre).
- Si hay un concepto con partes, causas, factores o tipos → concept_map.
- Si hay etapas que se repiten → cycle_diagram.
- Prefiere icon_cards a content_split cuando la escena no necesita una ilustración.
- No repitas el mismo layout_type en dos escenas seguidas.

REGLA DE ASIGNACIÓN:
- hook → el layout_type lo determina el hook_type elegido (ver sección HOOK_TYPE).
- context (context_stat, con cifra impactante) → "big_stat"
- context (context_narrative / context_problem / context_scenario) → "content_split"
- explanation con niveles/jerarquía/categorías → "hierarchy_diagram"
- explanation general → "content_split" si una ilustración ayuda; si no, "icon_cards"
- explanation con concepto central y componentes/causas/tipos → "concept_map"
- explanation o context con fechas o evolución histórica → "timeline"
- process cíclico (las etapas se repiten) → "cycle_diagram"
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
  "visual_family": "illustration|realistic",
  "scenes": [
    {
      "scene_order": 1,
      "scene_type": "hook|context|explanation|process|comparison|application|example|summary|conclusion",
      "hook_type": "hook_question|hook_cover|hook_story|hook_problem|hook_stat|hook_contrast|hook_myth|hook_decision|hook_scenario|hook_visual_metaphor|null",
      "layout_type": "cover|guiding_question|big_stat|content_split|hierarchy_diagram|process_steps|comparison|real_example|summary_checklist|conclusion_reflection|icon_cards|cycle_diagram|concept_map|timeline",
      "requires_ai_image": true,
      "learning_goal": "Qué aprende el estudiante en esta escena (una oración)",
      "title": "Título corto (máx 50 chars)",
      "narration": "Texto completo para voz IA, escrito para el oído. Entre 60 y 110 palabras.",
      "on_screen_text": ["Bullet o item 1", "Bullet o item 2"],
      "visual_direction": "Descripción de cómo debe verse esta escena",
      "image_prompt": "[composition_type] — concrete English description of what the image shows (content only, no style)",
      "image_precision": "high|normal",
      "image_style": "atlas|photo|null",
      "image_check": "qué debe verse correcto, o null",
      "icons": ["bell", "footprints"],
      "highlight_words": ["palabra1", "palabra2"],
      "reveal_cues": ["Primero, necesitas una señal", "Después, la rutina"],
      "transition": "fade|slide|zoom|dissolve",
      "estimated_duration_seconds": 30
    }
  ]
}

REGLAS FINALES:
- layout_type es OBLIGATORIO en cada escena. Nunca omitirlo.
- requires_ai_image es OBLIGATORIO en cada escena. Nunca omitirlo.
- hook_type es OBLIGATORIO en escenas con scene_type "hook". Para todas las demás: hook_type: null.
- Si layout_type es process_steps, comparison, hierarchy_diagram, summary_checklist, big_stat, guiding_question, icon_cards, cycle_diagram, concept_map o timeline → requires_ai_image DEBE ser false.
- El total de escenas con requires_ai_image: true NO debe superar 12 (cover y conclusion_reflection no cuentan para ese límite).
- Si requires_ai_image: false → image_prompt puede ser null.
- on_screen_text: estructurarlo según lo que pide cada layout_type y hook_type (ver secciones anteriores).
- La suma de estimated_duration_seconds NO debe superar 420 (7 minutos).
- Cada escena debe tener estimated_duration_seconds entre 25 y 45.
- El orden de scene_type en el array DEBE respetar la secuencia pedagógica obligatoria.
- NO usar hook_stat por defecto. Solo si el dato es realmente el argumento más poderoso del capítulo.
- NO repetir el mismo hook_type en dos capítulos consecutivos del mismo curso.
- El contexto (BLOQUE 2) NO debe forzar cifras. Usar context_stat solo cuando el dato realmente impacte.`;

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
    ], 'generate_script', job.institution_id);

    // La duración la decide el contenido (sin relleno); solo se avisa si supera el tope
    const finalScript = script;
    this.logDuration(job.id, finalScript);

    await this.videosService['videoJobRepo'].update(job.id, {
      generated_script: finalScript as unknown as object,
    });

    this.logger.log(
      `[AiService] [${job.id}] Guion final: ${finalScript.scenes.length} escenas, ` +
      `${finalScript.total_narration_characters} chars narración`,
    );

    return finalScript;
  }

  private async callGptWithRetry(
    jobId: string,
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    operation: string,
    institutionId?: string | null,
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
        const modelName = response.model ?? this.model;
        const price = priceChat(modelName, inputTokens, outputTokens);
        await this.videosService.logApiUsage({
          videoJobId: jobId,
          institutionId: institutionId ?? null,
          provider: 'openai_chat',
          operation,
          inputUnits: inputTokens,
          outputUnits: outputTokens,
          estimatedCost: price.cost,
          modelName,
          unitType: 'tokens',
          metadata: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens, pricing: price.pricing },
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

  private logDuration(jobId: string, script: GeneratedScript): void {
    const words = script.scenes.reduce((sum, s) => sum + (s.narration?.split(/\s+/).filter(Boolean).length ?? 0), 0);
    const seconds = Math.round((words / WORDS_PER_MINUTE) * 60);
    const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const msg = `[AiService] [${jobId}] ${script.scenes.length} escenas, ${words} palabras, ~${label} min estimados`;
    if (seconds > MAX_VIDEO_SECONDS) this.logger.warn(`${msg} — supera el tope de ${MAX_VIDEO_SECONDS / 60} min`);
    else this.logger.log(msg);
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

    if (!Array.isArray(parsed.scenes) || parsed.scenes.length < 5) {
      throw new Error(
        `El guion tiene ${parsed.scenes?.length ?? 0} escenas pero se requieren al menos 5`,
      );
    }

    // Enforce requires_ai_image rules
    parsed.scenes = this.enforceAiImageRules(parsed.scenes, jobId);
    const family = parsed.visual_family === 'realistic' ? 'realistic' : 'illustration';
    parsed.visual_family = family;
    parsed.scenes = parsed.scenes.map((s) => this.sanitizeVisualFields(s, family));

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

  /** Normaliza los campos visuales del LLM: iconos de la lista cerrada y valores válidos. */
  private sanitizeVisualFields(s: GeneratedScene, family: 'illustration' | 'realistic'): GeneratedScene {
    const count = Array.isArray(s.on_screen_text) ? s.on_screen_text.length : 0;
    const icons = Array.isArray(s.icons) ? s.icons : [];
    const precise = s.image_precision === 'high';
    // Hitos con fecha ("1969: …") siempre se muestran como línea de tiempo
    const texts = Array.isArray(s.on_screen_text) ? s.on_screen_text : [];
    const dated = texts.length >= 3 && texts.every((t) => /^\s*\d{3,4}\s*[:–-]/.test(String(t)));
    const layout = dated && s.layout_type !== 'timeline' ? 'timeline' : s.layout_type;
    return {
      ...s,
      layout_type: layout,
      requires_ai_image: layout === 'timeline' ? false : s.requires_ai_image,
      icons: Array.from({ length: count }, (_, i) => (isValidIcon(icons[i]) ? icons[i] : null)),
      image_precision: precise ? 'high' : 'normal',
      image_style: family === 'realistic' ? (s.image_style === 'atlas' ? 'atlas' : 'photo') : null,
      image_check: precise && typeof s.image_check === 'string' && s.image_check.trim() ? s.image_check.trim() : null,
    };
  }

  private enforceAiImageRules(scenes: GeneratedScene[], jobId: string): GeneratedScene[] {
    const CSS_ONLY_LAYOUTS = new Set([
      'process_steps', 'comparison', 'hierarchy_diagram',
      'summary_checklist', 'big_stat', 'guiding_question',
      'icon_cards', 'cycle_diagram', 'concept_map', 'timeline',
    ]);
    // These layouts always get AI images and do NOT count against the cap
    const ALWAYS_IMAGE_LAYOUTS = new Set(['cover', 'conclusion_reflection']);
    const MAX_AI_IMAGES = 12;

    // Step 1: enforce layout_type → requires_ai_image rules
    scenes = scenes.map(s => {
      const layout = s.layout_type as string;
      if (CSS_ONLY_LAYOUTS.has(layout)) {
        return { ...s, requires_ai_image: false };
      }
      if (ALWAYS_IMAGE_LAYOUTS.has(layout)) {
        return { ...s, requires_ai_image: true };
      }
      // Default true if field is missing
      if (s.requires_ai_image === undefined || s.requires_ai_image === null) {
        return { ...s, requires_ai_image: true };
      }
      return s;
    });

    // Step 2: cap at MAX_AI_IMAGES — ALWAYS_IMAGE_LAYOUTS are exempt from the count
    const cappableAiScenes = scenes.filter(
      s => s.requires_ai_image && !ALWAYS_IMAGE_LAYOUTS.has(s.layout_type as string),
    );
    if (cappableAiScenes.length > MAX_AI_IMAGES) {
      const excess = cappableAiScenes.length - MAX_AI_IMAGES;
      this.logger.warn(
        `[AiService] [${jobId}] ${cappableAiScenes.length} escenas cappables con AI image — reduciendo a ${MAX_AI_IMAGES} (eliminando ${excess})`,
      );

      // Priority order to keep: real_example first, then content_split
      const KEEP_PRIORITY = ['real_example', 'content_split'];
      let kept = 0;
      scenes = scenes.map(s => {
        if (!s.requires_ai_image) return s;
        if (ALWAYS_IMAGE_LAYOUTS.has(s.layout_type as string)) return s; // always keep
        const priority = KEEP_PRIORITY.indexOf(s.layout_type as string);
        if (kept < MAX_AI_IMAGES && priority === 0) { // real_example: highest priority
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
