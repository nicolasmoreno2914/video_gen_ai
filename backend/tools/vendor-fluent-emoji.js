#!/usr/bin/env node
// Copia las ilustraciones planas de Microsoft Fluent Emoji (licencia MIT) a assets/illustrations
// y genera el catálogo que usan las escenas animadas (nombre, palabras clave y grupo).
//
// Uso (desde backend/):
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/microsoft/fluentui-emoji.git /tmp/fluent
//   (cd /tmp/fluent && git sparse-checkout set --no-cone '/assets/*/Flat/*.svg' '/assets/*/Default/Flat/*.svg' '/assets/*/metadata.json' '/LICENSE')
//   node tools/vendor-fluent-emoji.js /tmp/fluent
//
// Estilo 3D (PNG, ~55 MB, fuera de git: se prepara en el servidor):
//   (cd /tmp/fluent && git sparse-checkout add '/assets/*/3D/*.png' '/assets/*/Default/3D/*.png')
//   node tools/vendor-fluent-emoji.js /tmp/fluent --3d
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
const threeD = process.argv.includes('--3d');
if (!src || !fs.existsSync(path.join(src, 'assets'))) {
  console.error('Uso: node tools/vendor-fluent-emoji.js <carpeta del repositorio fluentui-emoji>');
  process.exit(1);
}
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

if (threeD) {
  // Mismos nombres que el catálogo plano (el cldr de cada emoji): assets/illustrations-3d/<nombre>.png
  const out3d = path.join(__dirname, '..', 'assets', 'illustrations-3d');
  fs.mkdirSync(out3d, { recursive: true });
  let n = 0;
  for (const dir of fs.readdirSync(path.join(src, 'assets')).sort()) {
    const metaPath = path.join(src, 'assets', dir, 'metadata.json');
    if (!fs.existsSync(metaPath)) continue;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const png = [path.join(src, 'assets', dir, '3D'), path.join(src, 'assets', dir, 'Default', '3D')]
      .filter((d) => fs.existsSync(d))
      .flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith('.png')).map((f) => path.join(d, f)))[0];
    const name = slugify(meta.cldr || dir);
    const dst = path.join(out3d, `${name}.png`);
    if (!png || fs.existsSync(dst)) continue;
    fs.copyFileSync(png, dst);
    n++;
  }
  console.log(`${n} ilustraciones 3D → ${out3d}`);
  process.exit(0);
}

const out = path.join(__dirname, '..', 'assets', 'illustrations');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'svg'), { recursive: true });

// Banderas y señas de botón no sirven como ilustración de una escena
const SKIP_GROUPS = new Set(['Flags']);

const catalog = {};
for (const dir of fs.readdirSync(path.join(src, 'assets')).sort()) {
  const base = path.join(src, 'assets', dir);
  const metaPath = path.join(base, 'metadata.json');
  if (!fs.existsSync(metaPath)) continue;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (SKIP_GROUPS.has(meta.group)) continue;
  const svgPath = [path.join(base, 'Flat'), path.join(base, 'Default', 'Flat')]
    .filter((d) => fs.existsSync(d))
    .flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith('.svg')).map((f) => path.join(d, f)))[0];
  if (!svgPath) continue;
  const slug = slugify(meta.cldr || dir);
  if (!slug || catalog[slug]) continue;
  const svg = fs.readFileSync(svgPath, 'utf8').replace(/<\?xml[^>]*>/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '><').trim();
  fs.writeFileSync(path.join(out, 'svg', `${slug}.svg`), svg);
  const words = new Set([...(meta.keywords || []), meta.cldr, meta.tts].filter(Boolean).map((k) => k.toLowerCase()));
  catalog[slug] = { group: meta.group, keywords: [...words].filter((w) => w !== slug.replace(/-/g, ' ')) };
}
fs.writeFileSync(path.join(out, 'catalog.json'), JSON.stringify(catalog));
fs.copyFileSync(path.join(src, 'LICENSE'), path.join(out, 'LICENSE'));
fs.writeFileSync(path.join(out, 'README.md'), '# Ilustraciones\n\nMicrosoft Fluent Emoji, estilo plano (https://github.com/microsoft/fluentui-emoji), licencia MIT (ver LICENSE).\nGeneradas con `node tools/vendor-fluent-emoji.js`; no editar a mano.\n');
console.log(`${Object.keys(catalog).length} ilustraciones → ${out}`);
