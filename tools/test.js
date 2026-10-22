// Plays XNDR outside the game: a small stand-in for the WoW client (written in Lua below) runs the addon's real files,
// casts spells at stand-in enemy players and checks what XNDR counts and shows. Needs fengari (a Lua VM in JavaScript,
// test tool only), taken from the Warlock Sim addon's tools folder next to this project.
//   node tools/test.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const FENGARI = path.join(ROOT, '..', 'warlock-sim-addon', 'tools', 'node_modules', 'fengari');
if (!fs.existsSync(FENGARI)) { console.log('SKIPPED: fengari not found at ' + FENGARI); process.exit(0); }
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require(FENGARI);

// spell names for the stand-in client, from the comments of the generated spell table
const spellsSrc = fs.readFileSync(path.join(ROOT, 'XNDR', 'Spells.lua'), 'utf8');
const names = [];
for (const m of spellsSrc.matchAll(/^\t\[(\d+)\] = \{[^}]*\}, -- (.+?)(?: -> .*)?$/gm)) names.push('[' + m[1] + ']=' + JSON.stringify(m[2]));
names.push('[13754]="Improved Kick"');

const GAME = `
unpack = unpack or table.unpack
SECRET = setmetatable({}, {__tostring = function() return "<secret>" end})
function issecretvalue(v) return v == SECRET end
NOW = 1000
function GetTime() return NOW end
TIMERS = {}
C_Timer = {After = function(d, f) TIMERS[#TIMERS + 1] = {t = NOW + d, f = f} end}
NAMES = {${names.join(',')}}
KNOWN, PETKNOWN = {}, {}
C_Spell = {GetSpellName = function(id) return NAMES[id] end, GetSpellTexture = function(id) return "spell" .. id end}
C_Item = {GetItemIconByID = function(id) return "item" .. id end}
C_SpellBook = {IsSpellKnown = function(id, bank) if bank == 1 then return PETKNOWN[id] or false end return KNOWN[id] or false end}
Enum = {SpellBookSpellBank = {Player = 0, Pet = 1}}
CLASS = "ROGUE"
function UnitClass(u) return CLASS, CLASS end
STANDARD_TEXT_FONT = "font"

-- enemy players: UNITS[token] = {guid, name, ids = {aura instance IDs}, near = true/false/nil, hidden = auras unreadable}
UNITS = {}
local function U(u) return UNITS[u] end
function UnitExists(u) return U(u) ~= nil end
function UnitGUID(u) return U(u) and U(u).guid end
function GetUnitName(u) return U(u) and U(u).name end
function UnitName(u) return U(u) and U(u).name end
function UnitIsPlayer(u) return U(u) and not U(u).pet or false end
function UnitPlayerControlled(u) return U(u) ~= nil end
function UnitCanAttack(a, u) return U(u) ~= nil end
function CheckInteractDistance(u, i) return U(u) and U(u).near end
NEXT_AURA = 1
C_UnitAuras = {
  GetUnitAuraInstanceIDs = function(u, filter)
    local x = U(u); if not x then return nil end
    if x.hidden then return SECRET end
    local list = {}
    for id in pairs(x.ids) do list[#list + 1] = id end
    return list
  end,
  GetAuraDataByIndex = function(u, i, filter) -- in combat: names are secret
    local x = U(u); if not x then return nil end
    local n = 0
    for id in pairs(x.ids) do n = n + 1; if n == i then return {name = SECRET} end end
    return nil
  end,
}

-- frames: every method exists; the ones that matter keep their state
FRAMES, EVENTS = {}, {}
local Frame = {}
local function noop() end
local meta = {__index = function(t, k) return Frame[k] or noop end}
local function New(kind, name, parent) local f = setmetatable({kind = kind, name = name, parent = parent, scripts = {}, shown = true}, meta); FRAMES[#FRAMES + 1] = f; if name then _G[name] = f end; return f end
function CreateFrame(kind, name, parent, template) return New(kind, name, parent) end
function Frame:CreateTexture() return New("Texture") end
function Frame:CreateFontString() return New("FontString") end
function Frame:CreateMaskTexture() return New("MaskTexture") end
function Frame:SetScript(k, f) self.scripts[k] = f end
function Frame:GetScript(k) return self.scripts[k] end
function Frame:RegisterEvent(e) EVENTS[e] = EVENTS[e] or {}; EVENTS[e][self] = true end
function Frame:RegisterUnitEvent(e) self:RegisterEvent(e) end
function Frame:UnregisterEvent(e) if EVENTS[e] then EVENTS[e][self] = nil end end
function Frame:SetText(t) self.text = t end
function Frame:GetText() return self.text end
function Frame:SetTexture(t) self.texture = t end
function Frame:Show() self.shown = true end
function Frame:Hide() self.shown = false end
function Frame:SetShown(s) self.shown = s and true or false end
function Frame:IsShown() return self.shown end
function Frame:IsVisible() return self.shown end
function Frame:GetEffectiveScale() return 1 end
function Frame:GetWidth() return 140 end
function Frame:GetCenter() return 0, 0 end
function Frame:GetName() return self.name end
function Frame:GetChecked() return false end
UIParent = New("Frame", "UIParent")
TargetFrame = New("Frame", "TargetFrame"); TargetFrame.TargetFrameContainer = {Portrait = New("Texture")}
FocusFrame = New("Frame", "FocusFrame"); FocusFrame.TargetFrameContainer = {Portrait = New("Texture")}
Minimap = New("Frame", "Minimap")
GameTooltip = New("Frame", "GameTooltip")
function GameTooltip_Hide() end
UISpecialFrames = {}
CHAT = {}
DEFAULT_CHAT_FRAME = {AddMessage = function(_, m) CHAT[#CHAT + 1] = m end}
SlashCmdList = {}
function strsplit(sep, s, n) local a, b = s:match("^(%S*)%s*(.-)$"); return a, b ~= "" and b or nil end
function strtrim(s) return (s:gsub("^%s+", ""):gsub("%s+$", "")) end
strlower = string.lower
tinsert = table.insert
function wipe(t) for k in pairs(t) do t[k] = nil end return t end
function GetCursorPosition() return 0, 0 end
math.atan2 = math.atan2 or math.atan

function FIRE(event, ...) for f in pairs(EVENTS[event] or {}) do f.scripts.OnEvent(f, event, ...) end end
function ADVANCE(dt)
  local stop = NOW + dt
  while true do
    table.sort(TIMERS, function(a, b) return a.t < b.t end)
    local x = TIMERS[1]
    if not x or x.t > stop then break end
    table.remove(TIMERS, 1); NOW = x.t; x.f()
  end
  NOW = stop
  for _, f in ipairs(FRAMES) do if f.scripts.OnUpdate then f.scripts.OnUpdate(f, 0.2) end end
end
-- cast a spell at a unit; landsOn = the units its debuff lands on (default: that unit)
function CAST(spellID, unit, landsOn, caster)
  caster = caster or "player"
  local guid = "cast" .. math.random(1e9)
  if caster == "player" then FIRE("UNIT_SPELLCAST_SENT", "player", U(unit) and U(unit).name or "", guid, spellID)
  else FIRE("UNIT_SPELLCAST_START", "pet", guid, spellID) end
  for _, v in ipairs(landsOn or {unit}) do U(v).ids[NEXT_AURA] = true; LAST_AURA = NEXT_AURA; NEXT_AURA = NEXT_AURA + 1 end
  FIRE("UNIT_SPELLCAST_SUCCEEDED", caster, guid, spellID)
  ADVANCE(1)
  return LAST_AURA
end
-- what the target / focus tray shows: "group count, group count"
function SHOWN(unit)
  for _, f in ipairs(FRAMES) do
    if f.unit == unit and f.icons then
      local out = {}
      for _, icon in ipairs(f.icons) do if icon.shown and icon.group then out[#out + 1] = icon.group .. " " .. icon.count end end
      return table.concat(out, ", ")
    end
  end
  return "no tray"
end
function TIMER(unit, i)
  for _, f in ipairs(FRAMES) do if f.unit == unit and f.icons then return tonumber(f.icons[i or 1].Timer.text) end end
end
function RESET() for k in pairs(UNITS) do UNITS[k] = nil end; FIRE("UNIT_SPELLCAST_SUCCEEDED", "player", "x", 0); SlashCmdList.XNDR("clear"); CHAT = {} end
function NEWENEMY(unit, guid, name) UNITS[unit] = {guid = guid, name = name, ids = {}, near = true} end
`;

const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
function run(code, name) {
  if (lauxlib.luaL_loadbuffer(L, to_luastring(code), null, to_luastring(name || '=test')) !== lua.LUA_OK || lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) {
    const msg = to_jsstring(lua.lua_tostring(L, -1)); lua.lua_pop(L, 1); throw new Error(msg);
  }
  const v = lua.lua_isnil(L, -1) ? null : to_jsstring(lua.lua_tolstring(L, -1)); lua.lua_pop(L, 1); return v;
}
run(GAME, '=game');
for (const f of ['Spells.lua', 'XNDR.lua']) run(fs.readFileSync(path.join(ROOT, 'XNDR', f), 'utf8'), '@' + f);
run('FIRE("ADDON_LOADED", "XNDR"); XNDRDB.debug = true');

let fails = 0, passes = 0;
function scene(title, code, expect) {
  let got;
  try { got = run(code, '=' + title); } catch (e) { got = 'ERROR ' + e.message; }
  if (got === expect) passes++; else { fails++; console.log('FAIL ' + title + '\n  expected: ' + expect + '\n  got:      ' + got + '\n  chat: ' + run('return table.concat(CHAT, " | ")')); }
}

// a rogue who knows Cheap Shot, Kidney Shot, Sap, Kick (no Improved Kick yet)
run('KNOWN[1833]=true KNOWN[408]=true KNOWN[6770]=true KNOWN[1766]=true FIRE("PLAYER_LOGIN")');
scene('test mode shows the rogue\'s groups', 'SlashCmdList.XNDR("test") ADVANCE(0.1) local s = SHOWN("target") SlashCmdList.XNDR("test") return s',
  'stun 1, kidney 2, incapacitate 3');
scene('stun, kidney and sap side by side', `RESET() NEWENEMY("target", "P1", "Bob")
  CAST(1833, "target") CAST(408, "target") CAST(6770, "target") return SHOWN("target")`, 'stun 1, kidney 1, incapacitate 1');
scene('kidney shot is not the stun group', `RESET() NEWENEMY("target", "P1", "Bob")
  CAST(1833, "target") ADVANCE(2) CAST(408, "target") ADVANCE(2) CAST(1833, "target") return SHOWN("target")`, 'stun 2, kidney 1');
scene('three of a group = immune, a fourth changes nothing', `RESET() NEWENEMY("target", "P1", "Bob")
  for i = 1, 4 do CAST(6770, "target") ADVANCE(2) end return SHOWN("target")`, 'incapacitate 3');
scene('a cast that lands nothing is not counted', `RESET() NEWENEMY("target", "P1", "Bob")
  CAST(6770, "target", {}) return SHOWN("target")`, '');
scene('the same cast reported twice counts once', `RESET() NEWENEMY("target", "P1", "Bob")
  local guid = "g1" FIRE("UNIT_SPELLCAST_SENT", "player", "Bob", guid, 1833) UNITS.target.ids[900] = true
  FIRE("UNIT_SPELLCAST_SUCCEEDED", "player", guid, 1833) FIRE("UNIT_SPELLCAST_SUCCEEDED", "player", guid, 1833) ADVANCE(1)
  return SHOWN("target")`, 'stun 1');
scene('each player keeps their own DR', `RESET() NEWENEMY("target", "P1", "Bob") NEWENEMY("focus", "P2", "Ann")
  CAST(6770, "target") ADVANCE(2) CAST(6770, "focus") ADVANCE(2) CAST(6770, "target") return SHOWN("target") .. " / " .. SHOWN("focus")`,
  'incapacitate 2 / incapacitate 1');
scene('countdown: full sap (45 s) + 18 s reset', `RESET() NEWENEMY("target", "P1", "Bob") CAST(11297, "target") return TIMER("target")`, '63');
scene('a CC that breaks early starts the reset from then', `RESET() NEWENEMY("target", "P1", "Bob")
  local aura = CAST(11297, "target") ADVANCE(4) UNITS.target.ids[aura] = nil ADVANCE(0.2) return TIMER("target")`, '18');
scene('kick without improved kick adds nothing', `RESET() NEWENEMY("target", "P1", "Bob") CAST(1766, "target") return SHOWN("target")`, '');
scene('kick with improved kick silences', `RESET() NEWENEMY("target", "P1", "Bob") KNOWN[13754] = true
  CAST(1766, "target") KNOWN[13754] = nil return SHOWN("target")`, 'silence 1');
scene('debuffs unreadable: counted anyway', `RESET() NEWENEMY("target", "P1", "Bob") UNITS.target.hidden = true
  CAST(1833, "target") return SHOWN("target")`, 'stun 1');

// a priest: Psychic Scream around you, on the target and focus
run('CLASS = "PRIEST" KNOWN = {[8122]=true, [15487]=true, [605]=true} FIRE("SPELLS_CHANGED")');
scene('psychic scream on both players it landed on', `RESET() NEWENEMY("target", "P1", "Bob") NEWENEMY("focus", "P2", "Ann")
  CAST(10890, "target", {"target", "focus"}) return SHOWN("target") .. " / " .. SHOWN("focus")`, 'fear 1 / fear 1');
scene('psychic scream only on the one it landed on', `RESET() NEWENEMY("target", "P1", "Bob") NEWENEMY("focus", "P2", "Ann")
  CAST(10890, "target", {"target"}) return SHOWN("target") .. " / " .. SHOWN("focus")`, 'fear 1 / ');
scene('scream, auras unreadable: counts who is within 10 yards', `RESET() NEWENEMY("target", "P1", "Bob") NEWENEMY("focus", "P2", "Ann")
  UNITS.target.hidden = true UNITS.focus.hidden = true UNITS.focus.near = false
  CAST(10890, "target", {"target"}) return SHOWN("target") .. " / " .. SHOWN("focus")`, 'fear 1 / ');
scene('priest groups in test mode', 'SlashCmdList.XNDR("test") ADVANCE(0.1) local s = SHOWN("target") SlashCmdList.XNDR("test") return s',
  'fear 1, charm 2, silence 3');

// a warlock: Fear and the succubus's Seduction share one group and one split icon
run('CLASS = "WARLOCK" KNOWN = {[5782]=true, [6215]=true} FIRE("SPELLS_CHANGED")');
scene('fear then seduction = one group, 2 applications', `RESET() NEWENEMY("target", "P1", "Bob") NEWENEMY("pettarget", "P1", "Bob")
  CAST(6215, "target") ADVANCE(2) CAST(6358, "pettarget", {"pettarget"}, "pet") return SHOWN("target")`, 'fear 2');
scene('the fear icon is Fear + Seduction', `for _, f in ipairs(FRAMES) do if f.unit == "target" and f.icons then
  SlashCmdList.XNDR("test") ADVANCE(0.1) local i = f.icons[1] local s = i.Texture.texture .. " + " .. tostring(i.Texture2.texture) SlashCmdList.XNDR("test") return s end end`,
  'spell5782 + spell6358');
scene('engineering bomb on a warlock shows the bomb icons', `RESET() NEWENEMY("target", "P1", "Bob") CAST(4068, "target")
  for _, f in ipairs(FRAMES) do if f.unit == "target" and f.icons then local i = f.icons[1] return i.group .. " " .. i.Texture.texture .. " + " .. tostring(i.Texture2.texture) end end`,
  'stun item4390 + item10577');
scene('death coil has no DR on Forever', `RESET() NEWENEMY("target", "P1", "Bob") CAST(6789, "target") return SHOWN("target")`, '');
scene('probe command runs', 'SlashCmdList.XNDR("probe") FIRE("UNIT_SPELL_DIMINISH_CATEGORY_STATE_UPDATED", "target", SECRET) SlashCmdList.XNDR("probe") return CHAT[#CHAT - 1]',
  '|cff8f6fffXNDR|r probe: DR report for target: the whole report is secret');

console.log(fails ? 'FAIL: ' + fails + ' of ' + (fails + passes) + ' scenes' : 'OK: all ' + passes + ' scenes passed');
process.exit(fails ? 1 : 0);
