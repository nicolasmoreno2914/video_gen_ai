// Runtime de animación para slides capturados por fotogramas clave.
//
// Las plantillas marcan los elementos que se animan:
//   .header                  → entra al inicio de la escena
//   [data-anim="image"]      → imagen IA, entra poco después del header
//   [data-reveal="N"]        → elemento N (1-based) aparece en timeline.revealTimes[N-1]
//
// Todas las animaciones se crean con la Web Animations API y quedan EN PAUSA:
// el capturador llama window.__anim.seek(t) para fijar el instante exacto de cada
// fotograma, así el render es determinista y no depende de la velocidad del CPU.
// window.__anim.motionWindows() devuelve los intervalos [inicio, fin] con movimiento,
// para capturar fotogramas solo ahí y rellenar los tramos quietos con una sola imagen.

export interface SceneTimeline {
  /** Segundo (desde el inicio de la escena) en que aparece cada elemento data-reveal. */
  revealTimes: number[];
}

export function animationRuntime(timeline?: SceneTimeline | null): string {
  if (!timeline) return '';
  return `<script>
(function () {
  var timeline = ${JSON.stringify(timeline)};
  var EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  var anims = [];

  function add(el, keyframes, delayMs, durationMs) {
    var a = el.animate(keyframes, { delay: delayMs, duration: durationMs, fill: 'both', easing: EASE });
    a.pause();
    anims.push({ a: a, start: delayMs / 1000, end: (delayMs + durationMs) / 1000 });
  }

  var header = document.querySelector('.header');
  if (header) {
    add(header, [{ opacity: 0, transform: 'translateY(-16px)' }, { opacity: 1, transform: 'none' }], 0, 500);
  }

  document.querySelectorAll('[data-anim="image"]').forEach(function (el) {
    add(el, [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], 250, 800);
  });

  document.querySelectorAll('[data-reveal]').forEach(function (el) {
    var idx = Number(el.getAttribute('data-reveal')) - 1;
    var t = timeline.revealTimes[idx];
    if (typeof t !== 'number') t = 0.6 + idx * 0.4;
    var delay = Math.round(t * 1000);
    add(el, [
      { opacity: 0, transform: 'translateY(28px) scale(0.98)' },
      { opacity: 1, transform: 'none' },
    ], delay, 550);
    // Resaltado: el amarillo se "enciende" justo después de que aparece el bullet
    el.querySelectorAll('mark').forEach(function (mark) {
      add(mark, [{ backgroundColor: 'rgba(255,229,0,0)' }, { backgroundColor: 'rgba(255,229,0,1)' }], delay + 350, 400);
    });
  });

  window.__anim = {
    seek: function (seconds) {
      var ms = seconds * 1000;
      anims.forEach(function (x) { x.a.currentTime = ms; });
    },
    motionWindows: function () {
      var w = anims.map(function (x) { return [x.start, x.end]; }).sort(function (p, q) { return p[0] - q[0]; });
      var merged = [];
      w.forEach(function (p) {
        var last = merged[merged.length - 1];
        if (last && p[0] <= last[1]) last[1] = Math.max(last[1], p[1]);
        else merged.push([p[0], p[1]]);
      });
      return merged;
    },
  };
  window.__anim.seek(0);
})();
</script>`;
}
