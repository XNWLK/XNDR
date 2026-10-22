// Checks every game function, frame method, frame template and event the addon uses against the published lists of
// what the WoW: Forever client has (private/ref/*.lua: published lists of that client's functions; not in the repository).
// A name that is not on the lists is either guarded in the code (listed in GUARDED below, with the reason) or a mistake.
//   node tools/check-api.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), REF = path.join(ROOT, 'private', 'ref'), ADDON = path.join(ROOT, 'XNDR');
if (!fs.existsSync(path.join(REF, 'GlobalAPI.lua'))) { console.log('SKIPPED: private/ref/ is missing (the Forever API lists are not in the repository)'); process.exit(0); }
const names = f => new Set((fs.readFileSync(path.join(REF, f), 'utf8').match(/"([^"\n]+)"/g) || []).map(s => s.slice(1, -1)));
const api = names('GlobalAPI.lua'), framexml = names('FrameXML.lua'), frames = names('Frames.lua'), mixins = names('Mixins.lua'),
  widget = names('WidgetAPI.lua'), templates = names('Templates.lua'), events = names('Events.lua');

// Lua-made namespaces of the game: the lists hold e.g. "TooltipUtil.GetDisplayedItem", so "TooltipUtil" itself exists.
const namespaces = new Set();
[api, framexml].forEach(set => set.forEach(n => { const i = n.indexOf('.'); if (i > 0) namespaces.add(n.slice(0, i)); }));
const LUA = new Set(('assert error getmetatable ipairs next pairs pcall xpcall print rawequal rawget rawset select setmetatable tonumber tostring type unpack ' +
  'string table math coroutine bit date time strsplit strtrim tinsert tremove floor format _G').split(' '));
const KEYWORDS = new Set('and break do else elseif end false for function if in local nil not or repeat return then true until while'.split(' '));
// Not on the lists, used on purpose. Each is either the addon's own, a plain constant / font object of the game that the
// lists do not cover, or read behind an "exists?" test.
const GUARDED = {
  XNDRDB: 'the addon\'s saved settings', SLASH_XNDR1: 'slash command', SlashCmdList: 'the game\'s slash command table',
  XNDR_SPELLS: 'the addon\'s spell table (Spells.lua)', XNDR_BUILD: 'the addon\'s spell table (Spells.lua)',
  XNDROptions: 'the addon\'s settings window', XNDRMinimapButton: 'the addon\'s minimap button',
  DEFAULT_CHAT_FRAME: 'the chat frame (a frame; the lists hold functions)', STANDARD_TEXT_FONT: 'font path constant, "or" fallback',
  issecretvalue: 'tested before use', Enum: 'the game\'s table of constants, tested before use',
  UISpecialFrames: 'the game\'s list of windows Escape closes (a table); tested before use',
  Minimap: 'the minimap (named in its layout file); tested before use', GameTooltip: 'the game tooltip (a frame)',
  TargetFrame: 'the target frame', FocusFrame: 'the focus frame', UIParent: 'the UI root frame',
};
const strip = src => src.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, ' ').replace(/--[^\n]*/g, ' ')
  .replace(/\[(=*)\[[\s\S]*?\]\1\]/g, m => '"' + ' '.repeat(Math.max(0, m.length - 2)) + '"');
let problems = 0, checked = { functions: 0, methods: 0, templates: 0, events: 0 };
const say = (file, what) => { problems++; console.log('  ' + file + ': ' + what); };

fs.readdirSync(ADDON).filter(f => f.endsWith('.lua') && f !== 'Spells.lua').forEach(file => {
  const raw = strip(fs.readFileSync(path.join(ADDON, file), 'utf8'));
  // templates and events are inside strings: look at them before the strings are blanked
  (raw.match(/CreateFrame\([^)]*\)/g) || []).forEach(c => {
    const m = c.match(/,\s*["']([A-Za-z]+(?:Template|Button)[A-Za-z]*)["']\s*\)/);
    if (m && !m[1].startsWith('XNDR')) { checked.templates++; /* a frame name of the addon's own is not a template */ if (!templates.has(m[1])) say(file, 'frame template "' + m[1] + '" is not in the Forever client'); }
  });
  (raw.match(/Register(?:Unit)?Event[(,\s]+(?:frame,\s*)?["']([A-Z_]+)["']/g) || []).forEach(c => { const e = c.match(/["']([A-Z_]+)["']/)[1]; checked.events++; if (!events.has(e)) say(file, 'event ' + e + ' is not in the Forever client'); });
  const code = raw.replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, "''");   // one pass, so an apostrophe inside "..." is not taken for the start of a text
  // names made local somewhere in the file
  const locals = new Set(['self', '_']);
  (code.match(/\blocal\s+function\s+([A-Za-z_]\w*)/g) || []).forEach(m => locals.add(m.split(/\s+/)[2]));
  (code.match(/\blocal\s+([A-Za-z_][\w\s,]*?)(?==|\n|$| in\b)/g) || []).forEach(m => m.replace(/^local\s+/, '').split(',').forEach(n => locals.add(n.trim().split(/\s/)[0])));
  (code.match(/function\s*[\w.:]*\s*\(([^)]*)\)/g) || []).forEach(m => m.replace(/^[^(]*\(/, '').replace(')', '').split(',').forEach(n => locals.add(n.trim())));
  (code.match(/\bfor\s+([\w\s,]+?)\s+(?:in|=)/g) || []).forEach(m => m.replace(/^for\s+/, '').replace(/\s+(in|=)$/, '').split(',').forEach(n => locals.add(n.trim())));
  // C_Something.Function
  const seen = new Set();
  (code.match(/\bC_\w+\.\w+/g) || []).forEach(n => { if (seen.has(n)) return; seen.add(n); checked.functions++; if (!api.has(n)) say(file, n + ' is not in the Forever client'); });
  (code.match(/\bTooltipUtil\.\w+/g) || []).forEach(n => { if (seen.has(n)) return; seen.add(n); checked.functions++; if (!framexml.has(n)) say(file, n + ' is not in the Forever client'); });
  // plain globals: an identifier that is not a field, not a table key, not local
  const re = /([.:]?)\s*\b([A-Za-z_]\w*)\b(\s*=(?!=))?/g;
  let m;
  while ((m = re.exec(code))) {
    const [, dot, name, assign] = m;
    if (dot || KEYWORDS.has(name) || locals.has(name) || LUA.has(name) || seen.has(name) || /^C_\w+$/.test(name)) continue;
    if (assign) { const before = code.slice(0, m.index).replace(/\s+$/, '').slice(-1); if (before === '{' || before === ',') continue; }   // a table key
    seen.add(name); checked.functions++;
    if (api.has(name) || framexml.has(name) || frames.has(name) || mixins.has(name) || GUARDED[name] || namespaces.has(name)) continue;
    say(file, 'global "' + name + '" is not in the Forever client (line ' + code.slice(0, m.index).split('\n').length + ')');
  }
  // methods called on frames, font strings and textures
  const own = new Set(['Refresh', 'sync', 'gsub', 'find', 'match', 'sub', 'lower', 'gmatch', 'format', 'rep', 'byte', 'AddMessage',
    'SetBackdrop', 'SetBackdropColor', 'SetBackdropBorderColor']);   // from BackdropTemplate (a Lua mixin, on the Mixins list); only called behind 'if frame.SetBackdrop'
  const ms = new Set();
  (code.match(/:([A-Za-z_]\w*)\s*\(/g) || []).forEach(c => ms.add(c.slice(1).replace(/\s*\($/, '')));
  ms.forEach(n => { if (own.has(n)) return; checked.methods++; if (!widget.has(n)) say(file, 'method :' + n + '() is not in the Forever client'); });
});
console.log((problems ? 'FAIL: ' + problems + ' names are not on the Forever lists' : 'OK: everything the addon uses exists in the Forever client') +
  ' (' + checked.functions + ' functions and globals, ' + checked.methods + ' frame methods, ' + checked.templates + ' templates, ' + checked.events + ' events checked)');
process.exit(problems ? 1 : 0);
