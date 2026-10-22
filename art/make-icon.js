// Draws XNDR's icon (CurseForge avatar): a screaming Fear face on an icon split along the diagonal (Fear purple upper
// left, Seduction pink lower right, like the addon's fear-group icon), inside a ring of the three DR stages
// (50% yellow, 75% orange, 100% red). Writes art/icon.svg, then art/icon-512.png and art/icon-400.png with Edge headless.
//   node art/make-icon.js
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ART = __dirname;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const C = 200; // centre of the 400 x 400 drawing

// an arc of the ring from angle a to b (degrees, 0 = top, clockwise)
function arc(r, a, b) {
  const p = t => [C + r * Math.sin(t * Math.PI / 180), C - r * Math.cos(t * Math.PI / 180)];
  const [x1, y1] = p(a), [x2, y2] = p(b);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
const GAP = 9, R = 170;
const STAGES = [['#FFD100', '#FFE97A'], ['#FF8000', '#FFB766'], ['#FF2020', '#FF8A7A']];
const ring = STAGES.map(([col], i) => {
  const a = -60 + i * 120 + GAP / 2, b = a + 120 - GAP;
  return `<path d="${arc(R, a, b)}" stroke="${col}" stroke-width="20" stroke-linecap="round" fill="none"/>`;
}).join('\n    ');
const ringShine = STAGES.map(([, hi], i) => {
  const a = -60 + i * 120 + GAP / 2, b = a + 120 - GAP;
  return `<path d="${arc(R - 4, a + 2, b - 2)}" stroke="${hi}" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.7"/>`;
}).join('\n    ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs>
    <radialGradient id="field" cx="0.3" cy="0.25" r="0.95">
      <stop offset="0" stop-color="#2A1442"/>
      <stop offset="1" stop-color="#06030B"/>
    </radialGradient>
    <radialGradient id="light" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#9B5CFF" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#9B5CFF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fear" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8A3FD6"/>
      <stop offset="0.6" stop-color="#3E1370"/>
      <stop offset="1" stop-color="#22093F"/>
    </linearGradient>
    <linearGradient id="seduce" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0.35" stop-color="#C2378F"/>
      <stop offset="1" stop-color="#4C0A3A"/>
    </linearGradient>
    <linearGradient id="ghost" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F3E6FF"/>
      <stop offset="0.5" stop-color="#C9A2F5"/>
      <stop offset="1" stop-color="#7A44C0" stop-opacity="0.75"/>
    </linearGradient>
    <radialGradient id="hole" cx="0.5" cy="0.4" r="0.6">
      <stop offset="0" stop-color="#05010A"/>
      <stop offset="0.75" stop-color="#1A0630"/>
      <stop offset="1" stop-color="#3A1468"/>
    </radialGradient>
    <clipPath id="disc"><circle cx="${C}" cy="${C}" r="138"/></clipPath>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>

  <rect width="400" height="400" fill="url(#field)"/>
  <circle cx="${C}" cy="${C}" r="200" fill="url(#light)"/>

  <!-- the DR ring: 50% / 75% / 100% -->
  <g filter="url(#glow)" opacity="0.8">
    ${ring}
  </g>
  <g>
    ${ring}
    ${ringShine}
  </g>

  <!-- the split icon -->
  <circle cx="${C}" cy="${C}" r="146" fill="#0B0414"/>
  <g clip-path="url(#disc)">
    <rect x="0" y="0" width="400" height="400" fill="url(#fear)"/>
    <polygon points="400,0 400,400 0,400" fill="url(#seduce)"/>
    <line x1="400" y1="0" x2="0" y2="400" stroke="#F6D8FF" stroke-width="3" opacity="0.55"/>
    <circle cx="${C}" cy="${C - 10}" r="105" fill="#E9CCFF" opacity="0.28" filter="url(#glow)"/>

    <!-- the screaming face -->
    <g filter="url(#soft)" opacity="0.7">
      <path d="M200 92 C252 92 270 140 266 190 C262 245 236 300 200 318 C164 300 138 245 134 190 C130 140 148 92 200 92 Z" fill="#E7CCFF"/>
    </g>
    <path d="M200 96 C248 96 264 140 260 190 C256 242 232 294 200 312 C168 294 144 242 140 190 C136 140 152 96 200 96 Z" fill="url(#ghost)"/>
    <!-- eyes: wide and hollow, drooping at the outer corners (scared) -->
    <ellipse cx="173" cy="182" rx="19" ry="26" transform="rotate(14 173 182)" fill="url(#hole)"/>
    <ellipse cx="227" cy="182" rx="19" ry="26" transform="rotate(-14 227 182)" fill="url(#hole)"/>
    <circle cx="175" cy="186" r="4" fill="#F4E4FF" opacity="0.9"/>
    <circle cx="225" cy="186" r="4" fill="#F4E4FF" opacity="0.9"/>
    <!-- the scream -->
    <ellipse cx="200" cy="256" rx="21" ry="38" fill="url(#hole)"/>
    <!-- brows: raised in the middle (fear), not lowered (anger) -->
    <path d="M150 154 Q160 138 186 132" stroke="#5A2A96" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M250 154 Q240 138 214 132" stroke="#5A2A96" stroke-width="5" fill="none" stroke-linecap="round"/>
  </g>
  <circle cx="${C}" cy="${C}" r="140" fill="none" stroke="#0B0414" stroke-width="6"/>
  <circle cx="${C}" cy="${C}" r="137" fill="none" stroke="#C9A2FF" stroke-width="1.5" opacity="0.5"/>
</svg>
`;
fs.writeFileSync(path.join(ART, 'icon.svg'), svg);

// PNGs: the SVG in a page of exactly that size, screenshot by Edge headless
for (const size of [512, 400]) {
  const html = path.join(ART, `_icon-${size}.html`), out = path.join(ART, `icon-${size}.png`);
  fs.writeFileSync(html, `<!doctype html><html><body style="margin:0;overflow:hidden;background:#06030B">` +
    svg.replace('width="400" height="400"', `width="${size}" height="${size}"`) + `</body></html>`);
  if (fs.existsSync(out)) fs.unlinkSync(out);
  const profile = path.join(require('os').tmpdir(), 'xndr-icon-edge');
  execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--user-data-dir=' + profile, `--window-size=${size},${size}`, `--screenshot=${out}`,
    'file:///' + html.replace(/\\/g, '/')], { stdio: 'ignore' });
  // Edge hands the work to another process and returns early: wait for the file
  for (let i = 0; i < 100 && !fs.existsSync(out); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  fs.unlinkSync(html);
  console.log(out, fs.statSync(out).size, 'bytes');
}
