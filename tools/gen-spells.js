// Builds XNDR/Spells.lua from WoW: Forever's own game data: every spell a player, a pet or an item can use that puts
// its target on a diminishing returns (DR) group, with the group, the debuff's length and whether it hits an area.
//   node tools/gen-spells.js            writes XNDR/Spells.lua
//   node tools/gen-spells.js --review   prints the list instead (for checking by eye)
// The data are wago.tools CSV exports of the live client's tables, kept in private/db2/ (not in git); BUILD.txt
// there says which client build they are from. To refresh them:
//   for t in <tables below>; do curl -sL -o private/db2/$t.csv "https://wago.tools/db2/$t/csv?build=<build>"; done
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), DB = path.join(ROOT, 'private', 'db2');
const review = process.argv.includes('--review');

function csv(table) {
  const txt = fs.readFileSync(path.join(DB, table + '.csv'), 'utf8');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((k, i) => [k, r[i]])));
}

// Forever's DiminishType bits -> XNDR's group keys (bit 2 = a few NPC snares, bit 256 = Distract: not shown)
const GROUPS = { 1: 'root', 4: 'stun', 8: 'charm', 16: 'incapacitate', 32: 'fear', 64: 'silence', 128: 'kidney', 512: 'randomstun' };

const build = fs.readFileSync(path.join(DB, 'BUILD.txt'), 'utf8').trim();
const names = new Map(csv('SpellName').map(r => [r.ID, r.Name_lang]));
const drType = new Map();
for (const r of csv('SpellCategories')) if (r.DifficultyID === '0' && r.DiminishType !== '0') drType.set(r.SpellID, r.DiminishType);
const effects = {};
for (const e of csv('SpellEffect')) if (e.DifficultyID === '0') (effects[e.SpellID] = effects[e.SpellID] || []).push(e);
const durations = new Map(csv('SpellDuration').map(r => [r.ID, r]));
const misc = new Map();
for (const r of csv('SpellMisc')) if (r.DifficultyID === undefined || r.DifficultyID === '0') if (!misc.has(r.SpellID)) misc.set(r.SpellID, r);

// spells someone can use: class / race / pet / profession abilities, talents, items
const skillLines = new Map(csv('SkillLine').map(r => [r.ID, r]));
const usable = new Map(); // spellID -> where it comes from
for (const r of csv('SkillLineAbility')) {
  const line = skillLines.get(r.SkillLine);
  usable.set(r.Spell, line ? line.DisplayName_lang : 'skill ' + r.SkillLine);
}
for (const r of csv('TraitDefinition')) if (r.SpellID !== '0' && !usable.has(r.SpellID)) usable.set(r.SpellID, 'talent');
// items: only "Use:" effects (trigger type 0), not equip or chance-on-hit procs
for (const r of csv('ItemEffect')) if (r.TriggerType === '0' && r.SpellID !== '0' && !usable.has(r.SpellID)) usable.set(r.SpellID, 'item');
// passive spells (talents, auras) are never cast, so they never show up as a cast
const PASSIVE = 0x40;
const isPassive = id => { const m = misc.get(id); return m && (Number(m.Attributes_0) & PASSIVE) !== 0; };
// abilities that put an "on next hit" aura on you or your pet that applies the CC right after: counted at the cast
const PROC_CASTS = new Set(['19577']); // Intimidation

// talent procs the data doesn't link to the ability: the silence lands only if the player has the talent
const TALENT_SILENCES = [
  { names: ['Kick'], silence: '18425', talent: 13754 },          // Improved Kick -> Silenced - Kick
  { names: ['Shield Bash'], silence: '18498', talent: 12311 },   // Improved Shield Bash -> Silenced
  { names: ['Counterspell'], silence: '18469', talent: 11255 },  // Improved Counterspell -> Counterspell - Silenced
];

function seconds(spellID) {
  const m = misc.get(spellID);
  if (!m) return null;
  const index = m.PvPDurationIndex && m.PvPDurationIndex !== '0' ? m.PvPDurationIndex : m.DurationIndex;
  const d = durations.get(index);
  if (!d) return null;
  const ms = Math.max(Number(d.Duration), Number(d.MaxDuration));
  return ms > 0 ? ms / 1000 : null;
}

// area: 'caster' = around you, 'dest' = around a point or the target, false = the target only
// target codes: 15/16 = enemies in an area; 22/18/1 = centred on you; anything else with 15/16 = a point or the target
function area(effect, castEffects) {
  const t = [effect.ImplicitTarget_0, effect.ImplicitTarget_1];
  const inArea = t.includes('15') || t.includes('16') || t.includes('8') || t.includes('31');
  if (inArea && (t.includes('22') || t.includes('18') || t.includes('1'))) return 'caster';
  if (inArea) return 'dest';
  // a triggered debuff takes its targets from the spell that triggered it
  if (castEffects) for (const e of castEffects) { const a = area(e); if (a) return a; }
  return false;
}

// the DR'd debuff a spell puts on its target: itself, or a spell it triggers (two steps deep)
function findDR(spellID, depth, castEffects) {
  if (drType.has(spellID) && GROUPS[drType.get(spellID)]) {
    const effs = effects[spellID] || [];
    const aura = effs.find(e => e.Effect === '6') || effs[0] || {};
    // an aura only on yourself (Phase Shift) is no CC on an enemy
    if (!castEffects && aura.ImplicitTarget_0 === '1' && !area(aura)) return null;
    return { aura: spellID, group: GROUPS[drType.get(spellID)], area: area(aura, castEffects) };
  }
  if (depth >= 2) return null;
  for (const e of effects[spellID] || []) {
    const trig = e.EffectTriggerSpell;
    if (!trig || trig === '0') continue;
    // 64 = trigger spell; 6 = an aura that triggers it (42 proc, 23 periodic); never 36 (learn a spell)
    if (e.Effect === '64' || (e.Effect === '6' && (e.EffectAura === '23' || (e.EffectAura === '42' && PROC_CASTS.has(spellID))))) {
      const found = findDR(trig, depth + 1, effects[spellID]);
      if (found) return found;
    }
  }
  return null;
}

const out = [];
for (const [id, from] of usable) {
  if (!names.has(id) || isPassive(id)) continue;
  const found = findDR(id, 0, null);
  if (!found) continue;
  out.push({ id: Number(id), name: names.get(id), from, group: found.group, aura: found.aura,
    auraName: names.get(found.aura), dur: seconds(found.aura), area: found.area });
}
const talentLinks = [];
for (const link of TALENT_SILENCES) {
  for (const [id, from] of usable) {
    if (!link.names.includes(names.get(id)) || isPassive(id)) continue;
    if (out.find(o => o.id === Number(id))) continue;
    const dur = seconds(link.silence);
    out.push({ id: Number(id), name: names.get(id), from, group: 'silence', aura: link.silence,
      auraName: names.get(link.silence), dur, area: false, talent: link.talent });
    talentLinks.push(id);
  }
}
out.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name) || a.id - b.id);

if (review) {
  for (const o of out) console.log([o.group.padEnd(12), String(o.id).padEnd(8), o.name.padEnd(28), (o.from || '').slice(0, 22).padEnd(22),
    ('-> ' + o.aura + ' ' + o.auraName).padEnd(36), (o.dur === null ? '?' : o.dur + 's').padEnd(6), o.area || '', o.talent ? 'talent ' + o.talent : ''].join(' '));
  const count = {}; for (const o of out) count[o.group] = (count[o.group] || 0) + 1;
  console.log(out.length, 'spells', JSON.stringify(count));
  process.exit(0);
}

const lua = ['-- GENERATED by tools/gen-spells.js from WoW: Forever ' + build + ' game data. Do not edit by hand.',
  '-- [spell ID] = {DR group, debuff length in seconds (PvP length where the game has one), area, talent needed}',
  '-- area: "caster" = enemies around you, "dest" = around a point or your target, nil = your target only',
  'XNDR_BUILD = "' + build + '"', 'XNDR_SPELLS = {'];
for (const o of out) {
  const parts = ['"' + o.group + '"', o.dur === null ? 'nil' : String(o.dur), o.area ? '"' + o.area + '"' : 'nil'];
  if (o.talent) parts.push(String(o.talent));
  while (parts[parts.length - 1] === 'nil') parts.pop();
  lua.push('\t[' + o.id + '] = {' + parts.join(', ') + '}, -- ' + o.name + (o.auraName !== o.name ? ' -> ' + o.auraName : ''));
}
lua.push('}', '');
fs.writeFileSync(path.join(ROOT, 'XNDR', 'Spells.lua'), lua.join('\n'));
console.log('XNDR/Spells.lua:', out.length, 'spells from build', build);
