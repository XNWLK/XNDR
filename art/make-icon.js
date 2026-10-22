// Draws XNDR's icon (CurseForge avatar), for every class: a stun daze (three stars circling over a swirl) on a dark
// disc with a cooldown sweep for the countdown, inside a ring of the three DR stages (50% yellow, 75% orange,
// 100% red) that gets thinner from stage to stage - a ring that diminishes. Writes art/icon.svg, then
// art/icon-512.png and art/icon-400.png with Edge headless. (The first, warlock icon: make-icon-v1.js.)
//   node art/make-icon.js
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const ART = __dirname;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const C = 200; // centre of the 400 x 400 drawing
const f = n => n.toFixed(2);
const pt = (r, deg, cx = C, cy = C) => [cx + r * Math.sin(deg * Math.PI / 180), cy - r * Math.cos(deg * Math.PI / 180)];

// an arc of a circle from angle a to b (degrees, 0 = top, clockwise)
function arc(r, a, b) {
  const [x1, y1] = pt(r, a), [x2, y2] = pt(r, b);
  return `M${f(x1)} ${f(y1)} A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${f(x2)} ${f(y2)}`;
}
// the ring: three stages, each thinner than the one before
const R = 172, GAP = 10;
const STAGES = [['#FFD100', '#FFF0A0', 24], ['#FF8000', '#FFC488', 16], ['#FF2020', '#FF9A8A', 9]];
const segments = STAGES.map(([col, hi, w], i) => {
  const a = -60 + i * 120 + GAP / 2, b = a + 120 - GAP;
  return { col, hi, w, a, b };
});
const ring = segments.map(s => `<path d="${arc(R, s.a, s.b)}" stroke="${s.col}" stroke-width="${s.w}" stroke-linecap="round" fill="none"/>`).join('\n    ');
const ringShine = segments.map(s => `<path d="${arc(R - s.w * 0.22, s.a + 2, s.b - 2)}" stroke="${s.hi}" stroke-width="${f(s.w * 0.22)}" stroke-linecap="round" fill="none" opacity="0.75"/>`).join('\n    ');

// a five-pointed star
function star(cx, cy, r, rot) {
  const p = [];
  for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r; const [x, y] = pt(rr, rot + i * 36, cx, cy); p.push(f(x) + ',' + f(y)); }
  return p.join(' ');
}
// the daze: an ellipse the stars sit on (tilted), the back half behind the swirl, the front half in front
const OX = C, OY = 152, ORX = 92, ORY = 30, TILT = -8;
const onOrbit = deg => { const t = deg * Math.PI / 180; return [OX + ORX * Math.cos(t), OY + ORY * Math.sin(t)]; };
const STARS = [[115, 31], [190, 25], [262, 19]].map(([deg, r]) => { const [x, y] = onOrbit(deg); return { x, y, r, front: Math.sin(deg * Math.PI / 180) > 0 }; });
const starSvg = s => `<g transform="rotate(${TILT} ${OX} ${OY})"><polygon points="${star(s.x, s.y, s.r, 0)}" fill="url(#gold)" stroke="#7A4A00" stroke-width="2.5" stroke-linejoin="round"/>` +
  `<polygon points="${star(s.x - s.r * 0.12, s.y - s.r * 0.12, s.r * 0.42, 0)}" fill="#FFF8D8" opacity="0.8"/></g>`;

// the swirl: a spiral in the middle of the disc
function spiral(cx, cy, turns, rMax) {
  const pts = [];
  for (let t = 0; t <= turns * 360; t += 6) { const r = rMax * t / (turns * 360); const [x, y] = pt(r, t, cx, cy); pts.push(f(x) + ' ' + f(y)); }
  return 'M' + pts.join(' L');
}

// the cooldown sweep: the dark part of a WoW cooldown, from 12 o'clock going clockwise past the shown part
const SWEEP_FROM = 0, SWEEP_TO = 125, DISC = 136;
const [sx, sy] = pt(DISC + 20, SWEEP_FROM), [ex, ey] = pt(DISC + 20, SWEEP_TO);
const sweep = `M${C} ${C} L${f(sx)} ${f(sy)} A${DISC + 20} ${DISC + 20} 0 0 1 ${f(ex)} ${f(ey)} Z`;
const [lx, ly] = pt(DISC, SWEEP_TO);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs>
    <radialGradient id="field" cx="0.3" cy="0.25" r="0.95">
      <stop offset="0" stop-color="#22183A"/>
      <stop offset="1" stop-color="#05040A"/>
    </radialGradient>
    <radialGradient id="light" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#FF9A2E" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#FF9A2E" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="disc" cx="0.42" cy="0.35" r="0.75">
      <stop offset="0" stop-color="#3B4C8C"/>
      <stop offset="0.55" stop-color="#1E2652"/>
      <stop offset="1" stop-color="#0C0F24"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFF2A8"/>
      <stop offset="0.5" stop-color="#FFC926"/>
      <stop offset="1" stop-color="#E08A00"/>
    </linearGradient>
    <linearGradient id="swirl" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#E8F0FF"/>
      <stop offset="1" stop-color="#8FA8FF"/>
    </linearGradient>
    <clipPath id="clip"><circle cx="${C}" cy="${C}" r="${DISC}"/></clipPath>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.5"/></filter>
  </defs>

  <rect width="400" height="400" fill="url(#field)"/>
  <circle cx="${C}" cy="${C}" r="200" fill="url(#light)"/>

  <!-- the DR ring: 50% / 75% / 100%, thinner each stage -->
  <g filter="url(#glow)" opacity="0.75">
    ${ring}
  </g>
  <g>
    ${ring}
    ${ringShine}
  </g>

  <!-- the disc -->
  <circle cx="${C}" cy="${C}" r="${DISC + 8}" fill="#05040A"/>
  <g clip-path="url(#clip)">
    <circle cx="${C}" cy="${C}" r="${DISC}" fill="url(#disc)"/>
    <circle cx="${C}" cy="${C + 30}" r="90" fill="#6F8CFF" opacity="0.18" filter="url(#glow)"/>

    <!-- the swirl -->
    <path d="${spiral(C, C + 34, 2.6, 78)}" stroke="#0A0D20" stroke-width="15" fill="none" stroke-linecap="round" opacity="0.6" filter="url(#soft)"/>
    <path d="${spiral(C, C + 34, 2.6, 78)}" stroke="url(#swirl)" stroke-width="10" fill="none" stroke-linecap="round"/>

    <!-- the daze: orbit, stars behind, stars in front -->
    ${STARS.filter(s => !s.front).map(starSvg).join('\n    ')}
    <ellipse cx="${OX}" cy="${OY}" rx="${ORX}" ry="${ORY}" transform="rotate(${TILT} ${OX} ${OY})" fill="none" stroke="#FFE27A" stroke-width="3" stroke-dasharray="10 9" opacity="0.65"/>
    ${STARS.filter(s => s.front).map(starSvg).join('\n    ')}

    <!-- the cooldown sweep -->
    <path d="${sweep}" fill="#000000" opacity="0.42"/>
    <line x1="${C}" y1="${C}" x2="${f(lx)}" y2="${f(ly)}" stroke="#FFE9A8" stroke-width="2.5" opacity="0.7"/>
  </g>
  <circle cx="${C}" cy="${C}" r="${DISC}" fill="none" stroke="#0B0716" stroke-width="5"/>
  <circle cx="${C}" cy="${C}" r="${DISC - 3}" fill="none" stroke="#B8C6FF" stroke-width="1.5" opacity="0.45"/>
</svg>
`;
fs.writeFileSync(path.join(ART, 'icon.svg'), svg);

// PNGs: the SVG in a page of exactly that size, screenshot by Edge headless
for (const size of [512, 400]) {
  const html = path.join(ART, `_icon-${size}.html`), out = path.join(ART, `icon-${size}.png`);
  fs.writeFileSync(html, `<!doctype html><html><body style="margin:0;overflow:hidden;background:#05040A">` +
    svg.replace('width="400" height="400"', `width="${size}" height="${size}"`) + `</body></html>`);
  if (fs.existsSync(out)) fs.unlinkSync(out);
  execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--user-data-dir=' + path.join(os.tmpdir(), 'xndr-icon-edge'), `--window-size=${size},${size}`, `--screenshot=${out}`,
    'file:///' + html.replace(/\\/g, '/')], { stdio: 'ignore' });
  // Edge hands the work to another process and returns early: wait for the file
  for (let i = 0; i < 100 && !fs.existsSync(out); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  fs.unlinkSync(html);
  console.log(out, fs.statSync(out).size, 'bytes');
}
