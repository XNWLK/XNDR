--[[ XNDR ]]--

-- Diminishing returns of your own crowd control, shown next to the target and focus portraits.
--
-- WoW: Forever keeps the combat log and other players' casts away from addons, so XNDR only
-- counts what it can see: the spells you and your pet cast. CC from anyone else is not counted.
-- Which spell is in which DR group comes from Forever's own game data (Spells.lua, generated).
-- The countdown ends at the latest moment the DR can still be up: when the debuff's end can't be
-- seen, XNDR assumes it ran its full (diminished) length, and then adds the reset window.

local IsSecret = issecretvalue or function() return false end

-- the value, or nil when the client keeps it secret
local function Plain(value)
	if IsSecret(value) then
		return nil
	end
	return value
end

local SPELLS = XNDR_SPELLS or {} -- [spell ID] = {group, seconds, area, talent}

-- the DR groups of WoW: Forever, in the order they are shown
local GROUP_ORDER = {"stun", "kidney", "randomstun", "incapacitate", "fear", "charm", "silence", "root"}
local GROUP_NAMES = {
	stun = "Stuns", kidney = "Kidney Shot", randomstun = "Random stuns", incapacitate = "Incapacitates",
	fear = "Fears", charm = "Mind Control", silence = "Silences", root = "Roots",
}

-- which spells give a group its icon: the first two of these you know, split along the diagonal
-- (base rank IDs; any rank counts)
local ICON_SPELLS = {
	stun = {1833, 853, 5211, 20252, 12809, 100, 9005, 19577, 412788, 440488, 20549, 427745},
	kidney = {408, 400009},
	randomstun = {12355, 18093},
	incapacitate = {118, 6770, 1776, 20066, 2637, 19503, 710, 9484, 1277331, 1277455},
	fear = {5782, 6358, 8122, 5246, 5484, 1513, 2878},
	charm = {605, 1098},
	silence = {15487, 1766, 2139, 72},
	root = {339, 122, 19185},
}
-- when you know none of them (engineering bombs, or a class without that kind of CC)
local FALLBACK_ICONS = {
	stun = {"item:4390", "item:10577"}, -- Iron Grenade, Goblin Mortar
	kidney = {408},
	randomstun = {12355},
	incapacitate = {118, 6770},
	fear = {5782, 8122},
	charm = {605},
	silence = {15487, 1766},
	root = {339, 122},
}
-- pet spells your class always has, even while that pet isn't out
local CLASS_PET_SPELLS = {WARLOCK = {[6358] = true}} -- Seduction

-- duration multiplier of the 1st, 2nd and 3rd application; a 4th within the window does nothing
local MULTIPLIER = {1, 0.5, 0.25}
-- how much the NEXT application is reduced after 1, 2 or 3 applications (100 = immune)
local PERCENT = {50, 75, 100}
local PERCENT_COLOR = {
	{1, 0.82, 0}, -- 50%: yellow
	{1, 0.5, 0}, -- 75%: orange
	{1, 0.1, 0.1}, -- 100%: red, immune
}

local DEFAULT_DURATION = 10 -- seconds, for the few spells the game data gives no length for
local DUPLICATE_WINDOW = 1 -- a second report of the same group on the same player this soon is the same cast
local DEBUFF_CHECKS = {0.3, 0.8} -- seconds after a cast to look for its debuff
local TEST_PERIODS = {25, 20, 15} -- the test preview's countdowns for the three stages, looping

local DEFAULTS = {
	reset = 18, -- seconds after the CC ends until the DR is gone
	size = 30,
	fontSize = 12,
	target = true,
	focus = true,
	debug = false,
	offsets = {target = {x = 24, y = 0}, focus = {x = 24, y = 0}},
	minimap = {angle = 225, hide = false},
}

local db -- XNDRDB once the saved settings are loaded

-- [unit key][group] = {count = 1..3, applied, ccEnds, expires, watch = {key, ids, filter}}
local tracked = {}
-- who your casts in flight were aimed at, by cast GUID
local sentTargets = {}
-- spell name -> entry, for spell ranks whose IDs change in a later client build (filled at login)
local spellsByName = {}
-- [group] = {texture, texture or nil} and the groups you can apply, worked out from your spells
local groupIcons = {}
local myGroups = {}

local testMode = false
local testStart = 0
local probing = false

local function CopyDefaults(source, target)
	for key, value in pairs(source) do
		if type(value) == "table" then
			if type(target[key]) ~= "table" then
				target[key] = {}
			end
			CopyDefaults(value, target[key])
		elseif target[key] == nil then
			target[key] = value
		end
	end
end

local function Print(message)
	DEFAULT_CHAT_FRAME:AddMessage("|cff8f6fffXNDR|r " .. message)
end

local function Debug(message)
	if db and db.debug then
		Print(message)
	end
end

--[[ Spells ]]--

-- whether you (or with pet = true, your pet) know a spell; talents count too
local function Knows(spellID, pet)
	local book = C_SpellBook
	if not (book and book.IsSpellKnown) then
		return false
	end
	local bank = pet and Enum.SpellBookSpellBank and Enum.SpellBookSpellBank.Pet or nil
	local ok, known = pcall(book.IsSpellKnown, spellID, bank)
	if ok and Plain(known) then
		return true
	end
	if not pet and book.IsSpellKnownOrInSpellBook then
		ok, known = pcall(book.IsSpellKnownOrInSpellBook, spellID)
		return ok and Plain(known) and true or false
	end
	return false
end

local function SpellName(spellID)
	return Plain(C_Spell.GetSpellName(spellID))
end

-- the spell's DR entry, or nil if it puts nobody on DR (or needs a talent you don't have)
local function SpellInfo(spellID)
	local info = SPELLS[spellID]
	if not info then
		local name = SpellName(spellID)
		info = name and spellsByName[name]
	end
	if not info then
		return nil
	end
	if info[4] and not Knows(info[4]) then
		return nil -- e.g. Kick only silences with Improved Kick
	end
	return info
end

local function BuildNameLookup()
	wipe(spellsByName)
	local conflicts = {}
	for spellID, info in pairs(SPELLS) do
		local name = SpellName(spellID)
		if name then
			local known = spellsByName[name]
			if known and known[1] ~= info[1] then
				conflicts[name] = true -- the same name in two groups: only exact IDs count
			elseif not known or (info[2] or 0) > (known[2] or 0) then
				spellsByName[name] = info
			end
		end
	end
	for name in pairs(conflicts) do
		spellsByName[name] = nil
	end
end

local function IconFor(source)
	if type(source) == "string" then
		return Plain(C_Item.GetItemIconByID(tonumber(source:match("item:(%d+)"))))
	end
	return Plain(C_Spell.GetSpellTexture(source))
end

-- the names of every spell you (or your pet, or your class's pets) can cast, per group
local function KnownSpellNames()
	local _, class = UnitClass("player")
	local classPets = CLASS_PET_SPELLS[class] or {}
	local known = {}
	for spellID, info in pairs(SPELLS) do
		local isKnown = classPets[spellID] or Knows(spellID) or Knows(spellID, true)
		if isKnown and not (info[4] and not Knows(info[4])) then
			local name = SpellName(spellID)
			if name then
				known[name] = true
			end
		end
	end
	return known
end

-- each group's icon: the first two spells of ICON_SPELLS you know, else the fallback pair
local function UpdateGroupIcons()
	local known = KnownSpellNames()
	wipe(myGroups)
	for _, group in ipairs(GROUP_ORDER) do
		local textures = {}
		for _, spellID in ipairs(ICON_SPELLS[group]) do
			local name = SpellName(spellID)
			if name and known[name] and #textures < 2 then
				textures[#textures + 1] = IconFor(spellID)
			end
		end
		if #textures > 0 then
			myGroups[#myGroups + 1] = group
		else
			for _, source in ipairs(FALLBACK_ICONS[group]) do
				textures[#textures + 1] = IconFor(source)
			end
		end
		textures[1] = textures[1] or "Interface\\Icons\\INV_Misc_QuestionMark"
		groupIcons[group] = textures
	end
end

--[[ Units ]]--

-- what XNDR remembers a unit by: its GUID, or its name when the GUID is hidden
local function UnitKey(unit)
	if not Plain(UnitExists(unit)) then
		return nil
	end
	return Plain(UnitGUID(unit)) or Plain(GetUnitName(unit, true))
end

local function UnitLabel(unit)
	return Plain(GetUnitName(unit, true)) or unit
end

-- an enemy player or player-controlled pet (PvP DR counts against both)
local function IsEnemyPlayer(unit)
	return Plain(UnitExists(unit)) and (Plain(UnitIsPlayer(unit)) or Plain(UnitPlayerControlled(unit)))
		and Plain(UnitCanAttack("player", unit)) and true or false
end

local WATCH_UNITS = {"target", "focus", "mouseover", "pettarget"}

-- the unit among target, focus and mouseover that a cast was sent at, by name
local function UnitByName(name)
	if not name or name == "" then
		return nil
	end
	for _, unit in ipairs({"target", "focus", "mouseover"}) do
		if Plain(UnitExists(unit)) and (Plain(GetUnitName(unit, true)) == name or Plain(UnitName(unit)) == name) then
			return unit
		end
	end
end

-- a unit token that shows the player XNDR remembers by this key right now
local function UnitForKey(key)
	for _, unit in ipairs(WATCH_UNITS) do
		if UnitKey(unit) == key then
			return unit
		end
	end
end

-- true, false, or nil when the client won't say (range checks on enemies can be blocked in combat)
local function WithinTenYards(unit)
	if not CheckInteractDistance then
		return nil
	end
	local ok, near = pcall(CheckInteractDistance, unit, 3)
	if not ok then
		return nil
	end
	return Plain(near)
end

-- true if the unit has a debuff of this name, false if it surely hasn't, nil if the client won't say
local function HasDebuff(unit, name)
	if not (name and C_UnitAuras and C_UnitAuras.GetAuraDataByIndex) then
		return nil
	end
	for i = 1, 40 do
		local ok, aura = pcall(C_UnitAuras.GetAuraDataByIndex, unit, i, "HARMFUL")
		if not ok or IsSecret(aura) then
			return nil
		elseif not aura then
			return false
		end
		local auraName = aura.name
		if IsSecret(auraName) then
			return nil
		elseif auraName == name then
			return true
		end
	end
	return false
end

-- the unit's debuff instance IDs as a set, or nil if the client won't say. Debuff names are
-- secret in combat, but the instance IDs aren't, so a new ID shows that something landed.
local function DebuffIDs(unit, filter)
	if not (C_UnitAuras and C_UnitAuras.GetUnitAuraInstanceIDs) then
		return nil
	end
	local ok, ids = pcall(C_UnitAuras.GetUnitAuraInstanceIDs, unit, filter)
	if not ok or type(ids) ~= "table" or IsSecret(ids) then
		return nil
	end
	local set = {}
	for _, id in ipairs(ids) do
		if IsSecret(id) then
			return nil
		end
		set[id] = true
	end
	return set
end

-- debuffs on the enemies in view just before a cast, by filter and unit key, to compare with
-- afterwards: your own debuffs for your casts, all debuffs for your pet's
local PLAYER_FILTER, PET_FILTER = "HARMFUL|PLAYER", "HARMFUL"
local snapshots = {[PLAYER_FILTER] = {}, [PET_FILTER] = {}}
local SNAPSHOT_AGE = 10

local function TakeSnapshots(filter)
	local now = GetTime()
	for _, unit in ipairs(WATCH_UNITS) do
		local key = IsEnemyPlayer(unit) and UnitKey(unit)
		if key then
			local ids = DebuffIDs(unit, filter)
			snapshots[filter][key] = ids and {ids = ids, time = now} or nil
		end
	end
end

-- the debuffs that appeared on the unit since the snapshot (a set, maybe empty), or nil if unknown
local function NewDebuffs(unit, key, filter)
	local before = snapshots[filter][key]
	if not before or GetTime() - before.time > SNAPSHOT_AGE then
		return nil
	end
	local after = DebuffIDs(unit, filter)
	if not after then
		return nil
	end
	local new = {}
	for id in pairs(after) do
		if not before.ids[id] then
			new[id] = true
		end
	end
	return new
end

--[[ Tracking ]]--

local function Record(key, label, info, spellName, watch)
	local now = GetTime()
	local group = info[1]
	tracked[key] = tracked[key] or {}
	local entry = tracked[key][group]
	if entry and entry.expires > now then
		if now - entry.applied < DUPLICATE_WINDOW then
			Debug(spellName .. " on " .. label .. ": same cast reported twice, not counted again")
			return
		elseif entry.count >= 3 then
			Debug(spellName .. " on " .. label .. ": immune, DR timer unchanged")
			return -- immune: the cast did nothing, and the DR window keeps running as it was
		end
		entry.count = entry.count + 1
	else
		entry = {count = 1}
		tracked[key][group] = entry
	end
	entry.applied = now
	entry.ccEnds = now + (info[2] or DEFAULT_DURATION) * MULTIPLIER[entry.count]
	entry.expires = entry.ccEnds + db.reset
	entry.watch = watch
	Debug(spellName .. " on " .. label .. ": " .. GROUP_NAMES[group] .. " application " .. entry.count
		.. ", next one " .. (entry.count >= 3 and "immune" or PERCENT[entry.count] .. "% shorter"))
end

-- counts a cast on a player once its debuff has had time to show; a cast that was grounded
-- (Grounding Totem), resisted or immuned leaves no debuff and adds no DR.
-- ifUnknown(unit) decides when the client won't say whether anything landed.
local function ApplyToKey(key, label, info, spellName, filter, ifUnknown)
	filter = filter or PLAYER_FILTER
	local check = 1
	local function Check()
		local unit = UnitForKey(key)
		local landed, new
		if unit then
			new = NewDebuffs(unit, key, filter)
			landed = HasDebuff(unit, spellName)
			if landed == nil and new then
				landed = next(new) ~= nil -- names hidden in combat: any new debuff of yours
			end
		end
		if landed == false and DEBUFF_CHECKS[check + 1] then
			check = check + 1
			C_Timer.After(DEBUFF_CHECKS[check] - DEBUFF_CHECKS[check - 1], Check)
		elseif landed == false then
			Debug(spellName .. " on " .. label .. ": no debuff landed (grounded, resisted, immune or out of reach), not counted")
		elseif landed == nil and ifUnknown and not ifUnknown(unit) then
			Debug(spellName .. " on " .. label .. ": can't see whether it landed, probably out of reach, not counted")
		else
			if landed == nil then
				Debug(spellName .. " on " .. label .. ": can't see the debuffs, counted anyway")
			end
			local watch = new and next(new) and {key = key, ids = new, filter = filter} or nil
			Record(key, label, info, spellName, watch)
		end
	end
	C_Timer.After(DEBUFF_CHECKS[1], Check)
end

local function Apply(unit, info, spellName, filter, ifUnknown)
	if not IsEnemyPlayer(unit) then
		return
	end
	local key = UnitKey(unit)
	if not key then
		Debug(spellName .. ": the client hides who the target is, not counted")
		return
	end
	ApplyToKey(key, UnitLabel(unit), info, spellName, filter, ifUnknown)
end

-- remembers who a cast was aimed at when you pressed it, so switching targets mid-cast
-- doesn't credit it to the new target
local function OnSpellSent(castGUID, targetName, spellID)
	castGUID = Plain(castGUID)
	if not castGUID then
		return
	end
	spellID = Plain(spellID)
	if spellID and SpellInfo(spellID) then
		TakeSnapshots(PLAYER_FILTER)
	end
	local unit = UnitByName(Plain(targetName)) or "target"
	if IsEnemyPlayer(unit) and UnitKey(unit) then
		sentTargets[castGUID] = {key = UnitKey(unit), label = UnitLabel(unit)}
	else
		sentTargets[castGUID] = false
	end
end

local function NearYou(unit)
	return WithinTenYards(unit) ~= false -- range unknown: assume it was in reach
end

local function IsTarget(unit)
	return unit == "target"
end

local function OnSpellSucceeded(unit, castGUID, spellID)
	spellID = Plain(spellID)
	castGUID = Plain(castGUID)
	local sent = castGUID and sentTargets[castGUID]
	if castGUID then
		sentTargets[castGUID] = nil
	end
	local info = spellID and SpellInfo(spellID)
	if not info then
		return
	end
	local spellName = SpellName(spellID) or tostring(spellID)
	local filter = unit == "pet" and PET_FILTER or PLAYER_FILTER
	Debug(unit .. " cast " .. spellName .. " (" .. spellID .. ", " .. GROUP_NAMES[info[1]] .. ")")

	if info[3] then
		-- an area spell: every enemy in view that it landed on. When the client won't say, one
		-- around you counts if they are within 10 yards, one at a point counts on your target.
		local ifUnknown = info[3] == "caster" and NearYou or IsTarget
		local done = {}
		for _, victim in ipairs({"target", "focus"}) do
			local key = IsEnemyPlayer(victim) and UnitKey(victim)
			if key and not done[key] then
				done[key] = true
				Apply(victim, info, spellName, filter, ifUnknown)
			end
		end
	elseif unit == "pet" then
		Apply(IsEnemyPlayer("pettarget") and "pettarget" or "target", info, spellName, filter)
	elseif sent then
		ApplyToKey(sent.key, sent.label, info, spellName, filter)
	elseif sent == nil then
		Apply("target", info, spellName, filter) -- no record of the cast being sent: assume your target
	end
end

-- a CC that visibly ended early (broken by damage, dispelled, trinketed): the DR starts
-- running out from now instead of from the latest possible end
local function WatchEnds(now)
	for key, groups in pairs(tracked) do
		for _, entry in pairs(groups) do
			local watch = entry.watch
			if watch and entry.ccEnds > now then
				local unit = UnitForKey(key)
				local ids = unit and DebuffIDs(unit, watch.filter)
				if ids then
					local left = false
					for id in pairs(watch.ids) do
						if ids[id] then
							left = true
							break
						end
					end
					if not left then
						entry.ccEnds = now
						entry.expires = now + db.reset
						entry.watch = nil
					end
				end
			end
		end
	end
end

local function ForgetExpired(now)
	for key, groups in pairs(tracked) do
		for group, entry in pairs(groups) do
			if entry.expires <= now then
				groups[group] = nil
			end
		end
		if not next(groups) then
			tracked[key] = nil
		end
	end
end

--[[ Display ]]--

local FONT = STANDARD_TEXT_FONT or "Fonts\\FRIZQT__.TTF"
local MAX_ICONS = #GROUP_ORDER
local ICON_GAP = 6
local trays = {}

local function CreateIcon(tray)
	local icon = CreateFrame("Frame", nil, tray)

	icon.Border = icon:CreateTexture(nil, "BACKGROUND")
	icon.Border:SetPoint("TOPLEFT", -2, 2)
	icon.Border:SetPoint("BOTTOMRIGHT", 2, -2)
	icon.Border:SetColorTexture(0, 0, 0, 1)

	icon.Texture = icon:CreateTexture(nil, "ARTWORK", nil, 1)
	icon.Texture:SetAllPoints()
	icon.Texture:SetTexCoord(0.07, 0.93, 0.07, 0.93)

	-- second spell's icon on the lower-right half, cut along the diagonal by a mask
	icon.Texture2 = icon:CreateTexture(nil, "ARTWORK", nil, 2)
	icon.Texture2:SetAllPoints()
	icon.Texture2:SetTexCoord(0.07, 0.93, 0.07, 0.93)
	icon.Mask = icon:CreateMaskTexture()
	icon.Mask:SetTexture("Interface\\AddOns\\XNDR\\diagonal", "CLAMPTOBLACKADDITIVE", "CLAMPTOBLACKADDITIVE")
	icon.Mask:SetAllPoints()
	icon.Texture2:AddMaskTexture(icon.Mask)

	icon.Percent = icon:CreateFontString(nil, "OVERLAY")
	icon.Percent:SetPoint("CENTER", 0, 0)

	icon.Timer = icon:CreateFontString(nil, "OVERLAY")
	icon.Timer:SetPoint("TOP", icon, "BOTTOM", 0, -2)
	icon.Timer:SetTextColor(1, 1, 1)

	icon:SetScript("OnEnter", function(self)
		if self.group then
			GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
			GameTooltip:AddLine(GROUP_NAMES[self.group])
			GameTooltip:AddLine(self.count >= 3 and "Immune until the timer runs out"
				or "Next one " .. PERCENT[self.count] .. "% shorter", 1, 1, 1)
			GameTooltip:Show()
		end
	end)
	icon:SetScript("OnLeave", GameTooltip_Hide)

	icon:Hide()
	return icon
end

local function AnchorTray(tray)
	local offset = db.offsets[tray.unit]
	tray:ClearAllPoints()
	tray:SetPoint("LEFT", tray.anchor, "RIGHT", offset.x, offset.y)
end

-- sizes and fonts from the settings
local function LayoutTray(tray)
	local size = db.size
	tray:SetSize(size * MAX_ICONS + ICON_GAP * (MAX_ICONS - 1), size)
	for i, icon in ipairs(tray.icons) do
		icon:SetSize(size, size)
		icon:ClearAllPoints()
		if i == 1 then
			icon:SetPoint("LEFT", tray, "LEFT", 0, 0)
		else
			icon:SetPoint("LEFT", tray.icons[i - 1], "RIGHT", ICON_GAP, 0)
		end
		icon.Percent:SetFont(FONT, db.fontSize, "OUTLINE")
		icon.Timer:SetFont(FONT, db.fontSize, "OUTLINE")
	end
	AnchorTray(tray)
end

local function LayoutAll()
	for _, tray in ipairs(trays) do
		LayoutTray(tray)
	end
end

-- dragging moves the tray by the cursor's movement, kept as an offset from the portrait
local function TrayOnUpdateDrag(tray)
	local x, y = GetCursorPosition()
	local scale = tray:GetEffectiveScale()
	local offset = db.offsets[tray.unit]
	offset.x = tray.dragOffsetX + (x - tray.dragCursorX) / scale
	offset.y = tray.dragOffsetY + (y - tray.dragCursorY) / scale
	AnchorTray(tray)
end

local function TrayOnMouseDown(tray, button)
	if button ~= "LeftButton" or not testMode then
		return
	end
	local offset = db.offsets[tray.unit]
	tray.dragCursorX, tray.dragCursorY = GetCursorPosition()
	tray.dragOffsetX, tray.dragOffsetY = offset.x, offset.y
	tray:SetScript("OnUpdate", TrayOnUpdateDrag)
end

local function TrayOnMouseUp(tray)
	tray:SetScript("OnUpdate", nil)
end

-- a row of icons just right of a unit frame's portrait
local function CreateTray(unitFrame, unit)
	if not unitFrame then
		return
	end
	local tray = CreateFrame("Frame", nil, UIParent)
	tray:SetFrameStrata("MEDIUM")
	tray.unitFrame = unitFrame
	tray.anchor = unitFrame.TargetFrameContainer and unitFrame.TargetFrameContainer.Portrait or unitFrame
	tray.unit = unit
	tray.icons = {}
	for i = 1, MAX_ICONS do
		tray.icons[i] = CreateIcon(tray)
	end

	tray.Highlight = tray:CreateTexture(nil, "BACKGROUND")
	tray.Highlight:SetPoint("TOPLEFT", -4, 4)
	tray.Highlight:SetPoint("BOTTOMRIGHT", 4, -18)
	tray.Highlight:SetColorTexture(0.56, 0.44, 1, 0.25)
	tray.Label = tray:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
	tray.Label:SetPoint("BOTTOMLEFT", tray, "TOPLEFT", 0, 6)
	tray.Label:SetText("XNDR " .. unit .. " (drag me)")

	tray:SetScript("OnMouseDown", TrayOnMouseDown)
	tray:SetScript("OnMouseUp", TrayOnMouseUp)
	tray:SetScript("OnHide", TrayOnMouseUp)

	LayoutTray(tray)
	trays[#trays + 1] = tray
end

local function ShowIcon(icon, group, count, remaining)
	local textures = groupIcons[group] or {"Interface\\Icons\\INV_Misc_QuestionMark"}
	icon.group, icon.count = group, count
	icon.Texture:SetTexture(textures[1])
	icon.Texture2:SetTexture(textures[2])
	icon.Texture2:SetShown(textures[2] ~= nil)
	icon.Percent:SetText(PERCENT[count] .. "%")
	icon.Percent:SetTextColor(unpack(PERCENT_COLOR[count]))
	if count >= 3 then
		icon.Border:SetColorTexture(0.8, 0, 0, 1)
	else
		icon.Border:SetColorTexture(0, 0, 0, 1)
	end
	icon.Timer:SetText(math.ceil(remaining))
	icon:Show()
end

-- the groups the test shows: yours, or three common ones if your class has none
local function TestGroups()
	if #myGroups > 0 then
		return myGroups
	end
	return {"stun", "incapacitate", "fear"}
end

local function UpdateTray(tray, now)
	local enabled = db[tray.unit]
	-- follow the unit frame's scale (Edit Mode can resize it)
	tray:SetScale(tray.unitFrame:GetEffectiveScale() / UIParent:GetEffectiveScale())

	local shown = 0
	if testMode and enabled then
		-- each of your groups side by side, going through the three stages
		for i, group in ipairs(TestGroups()) do
			local count = (i - 1) % 3 + 1
			local period = TEST_PERIODS[count]
			shown = shown + 1
			ShowIcon(tray.icons[shown], group, count, period - ((now - testStart) % period))
		end
	elseif enabled and tray.unitFrame:IsVisible() then
		local key = UnitKey(tray.unit)
		local groups = key and tracked[key]
		for _, group in ipairs(GROUP_ORDER) do
			local entry = groups and groups[group]
			if entry and entry.expires > now then
				shown = shown + 1
				ShowIcon(tray.icons[shown], group, entry.count, entry.expires - now)
			end
		end
	end
	for i = shown + 1, #tray.icons do
		tray.icons[i]:Hide()
	end
	tray:SetShown(shown > 0)
end

local function UpdateAll()
	if not db then
		return
	end
	local now = GetTime()
	WatchEnds(now)
	ForgetExpired(now)
	for _, tray in ipairs(trays) do
		UpdateTray(tray, now)
	end
end

local function SetTestMode(on)
	testMode = on and true or false
	testStart = GetTime()
	for _, tray in ipairs(trays) do
		tray:EnableMouse(testMode)
		tray.Highlight:SetShown(testMode)
		tray.Label:SetShown(testMode)
		-- the icons show their tooltip only outside the test, so they don't catch the drag
		for _, icon in ipairs(tray.icons) do
			icon:SetMouseMotionEnabled(not testMode)
			icon:SetMouseClickEnabled(false) -- hover only: clicks go through to the game
		end
		if not testMode then
			TrayOnMouseUp(tray)
		end
	end
	if XNDROptions and XNDROptions.TestButton then
		XNDROptions.TestButton:SetText(testMode and "Stop test" or "Test all 3 stages")
	end
	UpdateAll()
end

--[[ Blizzard's own DR updates (probe) ]]--

-- WoW: Forever has a DR system of its own that reports DR changes to its arena frames. Whether an
-- addon may read those reports is unknown, so /xndr probe prints what arrives, for finding out.
local function Describe(value)
	if IsSecret(value) then
		return "secret"
	end
	return tostring(value)
end

local function OnDiminishUpdate(unit, info)
	local fields = {}
	if IsSecret(info) then
		fields[1] = "the whole report is secret"
	elseif type(info) == "table" then
		for _, field in ipairs({"category", "startTime", "duration", "showCountdown", "isImmune"}) do
			local ok, value = pcall(function() return info[field] end)
			fields[#fields + 1] = field .. "=" .. (ok and Describe(value) or "error")
		end
	else
		fields[1] = Describe(info)
	end
	Print("probe: DR report for " .. Describe(unit) .. ": " .. table.concat(fields, ", "))
end

--[[ Options window ]]--

local options
local optionWidgets = {}
local widgetCount = 0

local function CreateCheckbox(parent, label, get, set)
	widgetCount = widgetCount + 1
	local check = CreateFrame("CheckButton", "XNDROptionsCheck" .. widgetCount, parent, "UICheckButtonTemplate")
	check:SetSize(24, 24)
	local templateText = check.Text or check.text or _G[check:GetName() .. "Text"]
	if templateText then
		templateText:SetText("")
	end
	check.Label = check:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
	check.Label:SetPoint("LEFT", check, "RIGHT", 2, 0)
	check.Label:SetText(label)
	check:SetScript("OnClick", function(self)
		set(self:GetChecked() and true or false)
	end)
	check.Refresh = function(self)
		self:SetChecked(get())
	end
	optionWidgets[#optionWidgets + 1] = check
	return check
end

local function CreateSlider(parent, label, minValue, maxValue, step, get, set)
	widgetCount = widgetCount + 1
	local name = "XNDROptionsSlider" .. widgetCount
	local slider = CreateFrame("Slider", name, parent, "OptionsSliderTemplate")
	slider:SetWidth(220)
	slider:SetMinMaxValues(minValue, maxValue)
	slider:SetValueStep(step)
	slider:SetObeyStepOnDrag(true)
	for _, part in ipairs({"Low", "High", "Text"}) do
		local text = slider[part] or _G[name .. part]
		if text then
			text:SetText("")
		end
	end
	slider.Label = slider:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
	slider.Label:SetPoint("BOTTOMLEFT", slider, "TOPLEFT", 0, 3)
	slider:SetScript("OnValueChanged", function(self, value)
		value = math.floor(value / step + 0.5) * step
		self.Label:SetText(label .. ": " .. value)
		if not self.refreshing then
			set(value)
		end
	end)
	slider.Refresh = function(self)
		self.refreshing = true
		self:SetValue(get())
		self.Label:SetText(label .. ": " .. get())
		self.refreshing = nil
	end
	optionWidgets[#optionWidgets + 1] = slider
	return slider
end

local function CreateButton(parent, text, width, onClick)
	local button = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
	button:SetSize(width, 24)
	button:SetText(text)
	button:SetScript("OnClick", onClick)
	return button
end

local UpdateMinimapButton -- defined with the minimap button below

local function CreateOptions()
	options = CreateFrame("Frame", "XNDROptions", UIParent, "BasicFrameTemplateWithInset")
	options:SetSize(290, 440)
	options:SetPoint("CENTER")
	options:SetFrameStrata("DIALOG")
	options:SetMovable(true)
	options:EnableMouse(true)
	options:RegisterForDrag("LeftButton")
	options:SetScript("OnDragStart", options.StartMoving)
	options:SetScript("OnDragStop", options.StopMovingOrSizing)
	options:SetClampedToScreen(true)
	options:Hide()
	if UISpecialFrames then
		tinsert(UISpecialFrames, "XNDROptions") -- Escape closes it
	end

	local title = options:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
	title:SetPoint("TOP", 0, -5)
	title:SetText("XNDR")

	local test = CreateButton(options, "Test all 3 stages", 220, function()
		SetTestMode(not testMode)
	end)
	test:SetPoint("TOP", 0, -36)
	options.TestButton = test

	local hint = options:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
	hint:SetPoint("TOP", test, "BOTTOM", 0, -4)
	hint:SetText("While testing, drag the icons to move them.")

	local target = CreateCheckbox(options, "Show on target frame",
		function() return db.target end, function(value) db.target = value UpdateAll() end)
	target:SetPoint("TOPLEFT", 30, -92)
	local focus = CreateCheckbox(options, "Show on focus frame",
		function() return db.focus end, function(value) db.focus = value UpdateAll() end)
	focus:SetPoint("TOPLEFT", target, "BOTTOMLEFT", 0, -2)

	local size = CreateSlider(options, "Icon size", 16, 60, 1,
		function() return db.size end, function(value) db.size = value LayoutAll() UpdateAll() end)
	size:SetPoint("TOPLEFT", focus, "BOTTOMLEFT", 4, -26)
	local fontSize = CreateSlider(options, "Text size", 8, 24, 1,
		function() return db.fontSize end, function(value) db.fontSize = value LayoutAll() UpdateAll() end)
	fontSize:SetPoint("TOPLEFT", size, "BOTTOMLEFT", 0, -30)
	local reset = CreateSlider(options, "DR reset (seconds after the CC ends)", 10, 25, 1,
		function() return db.reset end, function(value) db.reset = value end)
	reset:SetPoint("TOPLEFT", fontSize, "BOTTOMLEFT", 0, -30)

	local debug = CreateCheckbox(options, "Debug messages in chat",
		function() return db.debug end, function(value) db.debug = value end)
	debug:SetPoint("TOPLEFT", reset, "BOTTOMLEFT", -4, -18)
	local minimap = CreateCheckbox(options, "Show minimap button",
		function() return not db.minimap.hide end, function(value) db.minimap.hide = not value UpdateMinimapButton() end)
	minimap:SetPoint("TOPLEFT", debug, "BOTTOMLEFT", 0, -2)

	local resetPositions = CreateButton(options, "Reset icon positions", 220, function()
		db.offsets = nil
		CopyDefaults(DEFAULTS, db)
		LayoutAll()
		UpdateAll()
	end)
	resetPositions:SetPoint("BOTTOM", 0, 48)
	local clear = CreateButton(options, "Clear tracked DR", 220, function()
		wipe(tracked)
		UpdateAll()
	end)
	clear:SetPoint("BOTTOM", 0, 18)

	options:SetScript("OnShow", function()
		for _, widget in ipairs(optionWidgets) do
			widget:Refresh()
		end
	end)
end

local function ToggleOptions()
	if not options then
		CreateOptions()
	end
	options:SetShown(not options:IsShown())
end

--[[ Minimap button ]]--

local minimapButton
local minimapIcon

local function PlaceMinimapButton()
	local angle = math.rad(db.minimap.angle)
	local radius = Minimap:GetWidth() / 2 + 5
	minimapButton:ClearAllPoints()
	minimapButton:SetPoint("CENTER", Minimap, "CENTER", math.cos(angle) * radius, math.sin(angle) * radius)
end

local function MinimapButtonOnUpdateDrag()
	local centerX, centerY = Minimap:GetCenter()
	local scale = Minimap:GetEffectiveScale()
	local x, y = GetCursorPosition()
	db.minimap.angle = math.deg(math.atan2(y / scale - centerY, x / scale - centerX)) % 360
	PlaceMinimapButton()
end

function UpdateMinimapButton()
	if minimapButton then
		minimapButton:SetShown(not db.minimap.hide)
		local first = myGroups[1] and groupIcons[myGroups[1]]
		minimapIcon:SetTexture(first and first[1] or "Interface\\Icons\\Spell_Shadow_Possession")
	end
end

local function CreateMinimapButton()
	if not Minimap then
		return
	end
	minimapButton = CreateFrame("Button", "XNDRMinimapButton", Minimap)
	minimapButton:SetSize(31, 31)
	minimapButton:SetFrameStrata("MEDIUM")
	minimapButton:SetFrameLevel(8)
	minimapButton:RegisterForClicks("LeftButtonUp", "RightButtonUp")
	minimapButton:RegisterForDrag("LeftButton")
	minimapButton:SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")

	local background = minimapButton:CreateTexture(nil, "BACKGROUND")
	background:SetSize(20, 20)
	background:SetTexture("Interface\\Minimap\\UI-Minimap-Background")
	background:SetPoint("TOPLEFT", 7, -5)
	minimapIcon = minimapButton:CreateTexture(nil, "ARTWORK")
	minimapIcon:SetSize(17, 17)
	minimapIcon:SetTexCoord(0.07, 0.93, 0.07, 0.93)
	minimapIcon:SetPoint("TOPLEFT", 7, -6)
	local border = minimapButton:CreateTexture(nil, "OVERLAY")
	border:SetSize(53, 53)
	border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
	border:SetPoint("TOPLEFT")

	minimapButton:SetScript("OnClick", function(_, button)
		if button == "RightButton" then
			SetTestMode(not testMode)
		else
			ToggleOptions()
		end
	end)
	minimapButton:SetScript("OnDragStart", function(self)
		self:SetScript("OnUpdate", MinimapButtonOnUpdateDrag)
	end)
	minimapButton:SetScript("OnDragStop", function(self)
		self:SetScript("OnUpdate", nil)
	end)
	minimapButton:SetScript("OnEnter", function(self)
		GameTooltip:SetOwner(self, "ANCHOR_LEFT")
		GameTooltip:AddLine("XNDR")
		GameTooltip:AddLine("Left-click: settings", 1, 1, 1)
		GameTooltip:AddLine("Right-click: test all 3 stages", 1, 1, 1)
		GameTooltip:AddLine("Drag: move this button", 1, 1, 1)
		GameTooltip:Show()
	end)
	minimapButton:SetScript("OnLeave", GameTooltip_Hide)

	PlaceMinimapButton()
	UpdateMinimapButton()
end

--[[ Events ]]--

local frame = CreateFrame("Frame")
local sinceUpdate = 0

frame:SetScript("OnUpdate", function(_, elapsed)
	sinceUpdate = sinceUpdate + elapsed
	if sinceUpdate >= 0.1 then
		sinceUpdate = 0
		UpdateAll()
	end
end)

frame:SetScript("OnEvent", function(_, event, ...)
	if event == "UNIT_SPELLCAST_SENT" then
		local _, targetName, castGUID = ...
		OnSpellSent(castGUID, targetName, select(4, ...))
	elseif event == "UNIT_SPELLCAST_START" then
		-- your pet's casts send no UNIT_SPELLCAST_SENT: look at the debuffs when its CC starts
		local spellID = Plain(select(3, ...))
		if spellID and SpellInfo(spellID) then
			TakeSnapshots(PET_FILTER)
		end
	elseif event == "UNIT_SPELLCAST_SUCCEEDED" then
		OnSpellSucceeded(...)
	elseif event == "PLAYER_TARGET_CHANGED" or event == "PLAYER_FOCUS_CHANGED" then
		UpdateAll()
	elseif event == "SPELLS_CHANGED" or event == "UNIT_PET" then
		UpdateGroupIcons()
		if minimapButton then
			UpdateMinimapButton()
		end
	elseif event == "UNIT_SPELL_DIMINISH_CATEGORY_STATE_UPDATED" then
		if probing then
			OnDiminishUpdate(...)
		end
	elseif event == "ADDON_LOADED" and ... == "XNDR" then
		XNDRDB = XNDRDB or {}
		db = XNDRDB
		CopyDefaults(DEFAULTS, db)
	elseif event == "PLAYER_LOGIN" then
		BuildNameLookup()
		UpdateGroupIcons()
		CreateTray(TargetFrame, "target")
		CreateTray(FocusFrame, "focus")
		SetTestMode(false)
		CreateMinimapButton()
		frame:RegisterEvent("SPELLS_CHANGED")
		frame:RegisterUnitEvent("UNIT_PET", "player")
	end
end)

frame:RegisterEvent("ADDON_LOADED")
frame:RegisterEvent("PLAYER_LOGIN")
frame:RegisterEvent("PLAYER_TARGET_CHANGED")
frame:RegisterEvent("PLAYER_FOCUS_CHANGED")
frame:RegisterUnitEvent("UNIT_SPELLCAST_SENT", "player")
frame:RegisterUnitEvent("UNIT_SPELLCAST_SUCCEEDED", "player", "pet")
frame:RegisterUnitEvent("UNIT_SPELLCAST_START", "pet")

--[[ Slash command ]]--

local function ToggleProbe()
	probing = not probing
	if probing then
		local ok = pcall(frame.RegisterEvent, frame, "UNIT_SPELL_DIMINISH_CATEGORY_STATE_UPDATED")
		local supported = C_SpellDiminish and C_SpellDiminish.IsSystemSupported
			and Describe(select(2, pcall(C_SpellDiminish.IsSystemSupported))) or "no such function"
		local cvar = C_CVar and Describe(C_CVar.GetCVar("spellDiminishPVPEnemiesEnabled")) or "?"
		Print("probe on" .. (ok and "" or " (the game refused the event)") .. ". DR system supported: "
			.. supported .. ", enemy DR display setting: " .. cvar .. ". CC an enemy player and watch the chat.")
	else
		pcall(frame.UnregisterEvent, frame, "UNIT_SPELL_DIMINISH_CATEGORY_STATE_UPDATED")
		Print("probe off.")
	end
end

SLASH_XNDR1 = "/xndr"
SlashCmdList.XNDR = function(message)
	local command, argument = strsplit(" ", strlower(strtrim(message or "")), 2)
	if command == "test" then
		SetTestMode(not testMode)
		Print(testMode and "test on: your DR groups are shown, drag them to move them." or "test off.")
	elseif command == "reset" and tonumber(argument) then
		db.reset = tonumber(argument)
		Print("DR reset window set to " .. db.reset .. " seconds.")
	elseif command == "debug" then
		db.debug = not db.debug
		Print("debug messages " .. (db.debug and "on: every counted or skipped cast is printed." or "off."))
	elseif command == "minimap" then
		db.minimap.hide = not db.minimap.hide
		UpdateMinimapButton()
	elseif command == "clear" then
		wipe(tracked)
		UpdateAll()
		Print("cleared.")
	elseif command == "probe" then
		ToggleProbe()
	elseif command == "groups" then
		local names = {}
		for _, group in ipairs(myGroups) do
			names[#names + 1] = GROUP_NAMES[group]
		end
		Print("your DR groups: " .. (#names > 0 and table.concat(names, ", ") or "none found among your spells"))
	elseif command == "help" then
		Print("/xndr - settings")
		Print("/xndr test - show your DR groups and move the icons")
		Print("/xndr groups - list the DR groups your spells can apply")
		Print("/xndr reset <seconds> - DR reset window (now " .. db.reset .. ")")
		Print("/xndr debug - print every cast XNDR counts or skips")
		Print("/xndr minimap - show or hide the minimap button")
		Print("/xndr clear - forget everything tracked")
		Print("/xndr probe - print the game's own DR reports, if the game lets addons see them")
	else
		ToggleOptions()
	end
end
