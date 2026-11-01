// Fichas de cada programa: los únicos botones y menús que un tutorial puede usar.
//
// El guion solo puede referirse a estos elementos (el código descarta cualquier otro), así el
// estudiante nunca busca un botón que no existe. Los nombres son los de la interfaz en español.
// Revisar cuando cambie la interfaz real del programa (última revisión: 2026-10).

export type UiApp = 'spreadsheet' | 'document' | 'email';

export interface UiElement {
  /** Texto visible o nombre del botón (lo que dice la narración). */
  label: string;
  /** Qué hace al pulsarlo en la simulación. */
  effect: string;
}

export interface UiPack {
  /** Nombre del programa para el guion y la ventana. */
  name: string;
  targets: Record<string, UiElement>;
  /** Acciones permitidas, con sus parámetros (para el prompt). */
  actions: string[];
}

export const UI_PACKS: Record<UiApp, UiPack> = {
  spreadsheet: {
    name: 'Hoja de cálculo (Excel)',
    targets: {
      tab_inicio: { label: 'Inicio', effect: 'pestaña de la cinta (ya activa)' },
      tab_insertar: { label: 'Insertar', effect: 'solo se señala' },
      tab_formulas: { label: 'Fórmulas', effect: 'solo se señala' },
      tab_datos: { label: 'Datos', effect: 'solo se señala' },
      btn_negrita: { label: 'Negrita (N)', effect: 'pone en negrita las celdas seleccionadas' },
      btn_cursiva: { label: 'Cursiva (K)', effect: 'pone en cursiva las celdas seleccionadas' },
      btn_subrayado: { label: 'Subrayado (S)', effect: 'subraya las celdas seleccionadas' },
      btn_autosuma: { label: 'Autosuma (Σ)', effect: 'en la celda activa (seleccionada justo debajo de los números) escribe =SUMA() de esos números y la calcula' },
      btn_contabilidad: { label: 'Formato de número de contabilidad ($)', effect: 'muestra las celdas seleccionadas como moneda' },
      btn_porcentaje: { label: 'Estilo porcentual (%)', effect: 'muestra las celdas seleccionadas como porcentaje' },
      btn_combinar: { label: 'Combinar y centrar', effect: 'une las celdas seleccionadas y centra el texto' },
    },
    actions: [
      '{"action":"select","range":"B2:B5"} selecciona una celda o un rango',
      '{"action":"type","cell":"B6","value":"=SUMA(B2:B5)"} escribe un número, texto o fórmula y pulsa Enter',
      '{"action":"click","target":"btn_negrita"} pulsa un botón de la ficha (actúa sobre la selección)',
    ],
  },
  document: {
    name: 'Documento (Google Docs)',
    targets: {
      menu_archivo: { label: 'Archivo', effect: 'solo se señala' },
      menu_insertar: { label: 'Insertar', effect: 'solo se señala' },
      menu_formato: { label: 'Formato', effect: 'solo se señala' },
      btn_estilos: { label: 'Estilos de párrafo (Texto normal)', effect: 'abre la lista de estilos; se usa con la acción "style"' },
      btn_negrita: { label: 'Negrita', effect: 'pone en negrita el texto seleccionado' },
      btn_cursiva: { label: 'Cursiva', effect: 'pone en cursiva el texto seleccionado' },
      btn_subrayado: { label: 'Subrayado', effect: 'subraya el texto seleccionado' },
      btn_centrar: { label: 'Centrar', effect: 'centra el párrafo seleccionado' },
      btn_lista_numerada: { label: 'Lista numerada', effect: 'convierte el párrafo seleccionado en lista numerada' },
      btn_vinetas: { label: 'Lista con viñetas', effect: 'convierte el párrafo seleccionado en lista con viñetas' },
    },
    actions: [
      '{"action":"select","paragraph":2,"text":"fragmento exacto"} selecciona un fragmento del párrafo (o todo si no hay "text")',
      '{"action":"click","target":"btn_negrita"} pulsa un botón de la ficha (actúa sobre la selección)',
      '{"action":"style","value":"Encabezado 1"} aplica un estilo de párrafo: Texto normal, Título, Subtítulo, Encabezado 1, Encabezado 2 o Encabezado 3',
      '{"action":"type","paragraph":"nuevo","text":"…"} escribe texto en un párrafo nuevo al final (o al final del párrafo N)',
    ],
  },
  email: {
    name: 'Correo electrónico (Gmail)',
    targets: {
      btn_redactar: { label: 'Redactar', effect: 'abre la ventana "Mensaje nuevo"' },
      carpeta_recibidos: { label: 'Recibidos', effect: 'muestra la bandeja de entrada' },
      carpeta_enviados: { label: 'Enviados', effect: 'muestra los mensajes enviados' },
      btn_cc_cco: { label: 'Cc / Cco', effect: 'muestra los campos Cc y Cco del mensaje' },
      btn_adjuntar: { label: 'Adjuntar archivos (clip)', effect: 'se usa con la acción "attach"' },
      btn_enviar: { label: 'Enviar', effect: 'envía el mensaje y muestra "Mensaje enviado"' },
      btn_enviar_menu: { label: 'Más opciones de envío (flecha junto a Enviar)', effect: 'muestra la opción "Programar envío"' },
    },
    actions: [
      '{"action":"click","target":"btn_redactar"} pulsa un botón de la ficha',
      '{"action":"type","field":"para","text":"ana.lopez@ejemplo.com"} escribe en un campo: para, cc, cco, asunto o cuerpo',
      '{"action":"attach","file":"informe.pdf"} adjunta un archivo con el clip',
    ],
  },
};

export const DOC_STYLES = ['Texto normal', 'Título', 'Subtítulo', 'Encabezado 1', 'Encabezado 2', 'Encabezado 3'] as const;
export const EMAIL_FIELDS = ['para', 'cc', 'cco', 'asunto', 'cuerpo'] as const;

/** Descripción de la ficha para el prompt del guion. */
export function describePack(app: UiApp): string {
  const pack = UI_PACKS[app];
  return `PROGRAMA: ${pack.name}
ELEMENTOS DISPONIBLES (target → nombre visible: efecto):
${Object.entries(pack.targets).map(([id, e]) => `- ${id} → ${e.label}: ${e.effect}`).join('\n')}
ACCIONES:
${pack.actions.map((a) => `- ${a}`).join('\n')}`;
}
