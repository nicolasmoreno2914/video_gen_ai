# Tablero — motor de escenas animadas

Rama: `feat/motion-scenes` (base `staging`). El ciclo lee este archivo, toma la primera tarea `[ ]`,
la hace, la prueba, la revisa, hace commit, la marca `[x]` y anota lo aprendido.

**Paradas obligatorias** (avisar al usuario y esperar): gastar en APIs · fusionar o desplegar ·
fin de la fase 2 (los videos de prueba requieren costo aprobado) · algo que cambie el plan.

## Diseño (resumen)

- Nuevo `layout_type: motion_scene` con `scene.motion_spec` (jsonb). Lo demás no cambia.
- La IA escribe un guion de animación: `scenario`, `elements` (ilustración, ícono, texto, número,
  forma, vía) ubicados en una cuadrícula de 12×6 (`A1`…`L6`), y `beats` (cada uno con la frase
  literal de la narración que lo dispara y sus acciones: appear, hide, move, highlight, connect,
  count, mark, focus).
- `resolveMotionSpec` valida y traduce a posiciones en píxeles; cualquier error lanza
  `MotionSpecError` con un mensaje que se devuelve a la IA para reintentar.
- Runtime propio determinista (`seek(t)` + `motionWindows()`), compatible con `captureKeyframes`.
- Revisión en navegador: elementos fuera de pantalla, encimados o textos cortados.
- Si algo falla: un reintento con la explicación; después, diapositiva normal. Nunca falla el video.
- Ilustraciones: Microsoft Fluent Emoji plano (MIT), en `backend/assets/illustrations`.
  Íconos: Lucide (ya en uso, ISC).

## Fase 0 — preparación
- [x] Verificar licencia de ilustraciones (Fluent Emoji: MIT, 1.587 ilustraciones útiles)
- [x] Copiar ilustraciones + catálogo (`tools/vendor-fluent-emoji.js`)

## Fase 1 — motor (sin costo de API)
- [ ] 1.1 Buscador de piezas: ilustración/ícono por nombre o palabra clave, con sugerencias
- [ ] 1.2 Esquema del guion de animación + validador `resolveMotionSpec`
- [ ] 1.3 Distribución: cuadrícula → píxeles, tamaños, escenarios (lienzo, vista desde arriba, diagrama señalado, correcto vs incorrecto)
- [ ] 1.4 Runtime de animación determinista (todas las acciones) + ventanas de movimiento
- [ ] 1.5 Plantilla `buildMotionTemplate` (+ estado final estático)
- [ ] 1.6 Conectar en SlidesService (`motion_scene`, respaldo si falla) + columna `motion_spec` + migración
- [ ] 1.7 Revisión de distribución en navegador (fuera de pantalla, encimados, texto cortado)
- [ ] 1.8 Banco de pruebas local: 4 escenas de ejemplo (conducción, salud, finanzas, seguridad) a MP4, revisión visual e iteración

## Fase 2 — director de animación (apagado por defecto)
- [ ] 2.1 Interruptor `MOTION_SCENES` (off|on) y `MOTION_MAX_SCENES`
- [ ] 2.2 Elección de escenas + prompt del guion de animación + reintento con explicación + respaldo
- [ ] 2.3 Revisión de distribución en el ciclo de generación (+ revisión visual barata opcional)
- [ ] 2.4 Registro de costos; esas escenas no piden imagen
- [ ] 2.5 Prueba de punta a punta con la IA simulada (costo $0)
- [ ] 2.6 PR a staging (borrador, sin fusionar) → **PARADA: costo de videos de prueba**

## Fase 3 — videos de prueba (requiere aprobación de costo, tope US$7)
## Fase 4 — activación gradual (requiere aprobación en cada despliegue)
## Fase 5 — paquetes por sector (señales de tránsito de Colombia), cuando se firme

## Aprendizajes
- Fluent Emoji: personas en `assets/<Nombre>/Default/Flat`; se excluyen banderas.
