# XNDR

**Diminishing returns of your crowd control**, for every class in World of Warcraft: Forever. Next to your target's
and your focus's portrait, XNDR shows an icon for each DR group you have used on that player, how much shorter the
next one will be, and a countdown until the DR is gone. Stun someone and fear them, and the two icons sit side by side.

**Download it on [CurseForge](https://www.curseforge.com/wow/addons/xndr)** (or from the
[Releases page](https://github.com/XNWLK/XNDR/releases) here).

> Built for the WoW: Forever client (interface 16001). What changed in each version: [changelog](CHANGELOG.md).

## Install

1. Install it from [CurseForge](https://www.curseforge.com/wow/addons/xndr) (with the CurseForge app, or download the
   file there), or download `XNDR-x.y.z.zip` from the newest entry on the
   [Releases page](https://github.com/XNWLK/XNDR/releases).
2. Unzip it into `World of Warcraft\_forever_\Interface\AddOns`, so that there is a folder `AddOns\XNDR`.
   (To update, unzip over the old folder. The CurseForge app does this step for you.)
3. Restart the game and tick **XNDR** in the AddOns list.
4. Type `/xndr test` to see how it looks with your class.

## What it shows

Each icon is one DR group. The number in the middle is how much shorter your **next** one will be on that player:

| | |
|---|---|
| **50%** (yellow) | after one: the next lasts half as long |
| **75%** (orange) | after two: the next lasts a quarter |
| **100%** (red, red border) | after three: immune until the DR is gone |

The countdown under the icon is the time until the player is back to full duration. Hover an icon to see its group.

Each group's icon is made from your own spells in that group, the two you are most likely to use split along the
diagonal: Fear and Seduction for a Warlock's fears, Sap and Gouge for a Rogue's incapacitates, and so on.

## The DR groups of WoW: Forever

Which spell shares DR with which comes straight from Forever's own game data, so it matches the game, including
Forever's changes (Entrapment got its DR on October 8, for example). Spells in the same group share one DR; different
groups don't touch each other.

| Group | Spells | Items |
|---|---|---|
| **Stuns** | Cheap Shot, Hammer of Justice, Bash, Pounce, Charge, Intercept, Concussion Blow, Shockwave, Demon Charge, Intimidation (hunter pet), the Felguard's Intercept, Sonic Blast (bat), War Stomp | Engineering bombs, grenades and mortars (copper to Dark Iron, the EZ-Thro and SAF-T ones, The Big One), Tidal Charm and other stun items |
| **Kidney Shot** | Kidney Shot, Between the Eyes (its own group, apart from the other stuns) | |
| **Random stuns** | Stuns that proc from talents (Impact, Pyroclasm); counted only when the game reports them as your cast | Linken's Boomerang |
| **Incapacitates** | Polymorph, Sap, Gouge, Repentance, Hibernate, Scatter Shot, Banish, Shackle Undead, Chastise, Confounding Flash | Sleep and Polymorph items, Reckless Charge |
| **Fears** | Fear, Howl of Terror, Seduction (Succubus), Psychic Scream, Intimidating Shout, Scare Beast, Turn Undead | Flash Bomb and other fear items |
| **Mind Control** | Mind Control, Subjugate Demon | Gnomish Mind Control Cap and other charm items |
| **Silences** | Silence, plus the silence from Kick, Shield Bash and Counterspell with their talents (Improved Kick, Improved Shield Bash, Improved Counterspell) | Arcane Bomb, Arcane Megabomb, EZ-Thro Mana and Radiation Bombs |
| **Roots** | Entangling Roots, Frost Nova, Entrapment, Web (spider) | Infernal Lasso |

**No DR at all on Forever:** Death Coil, Blind, Disarm, Riposte, Counterattack and Spell Lock's silence. XNDR doesn't
show them, because the game doesn't diminish them.

## Settings

Click the minimap button, or type `/xndr`:

- **Test all 3 stages:** shows your class's DR groups side by side, going through 50%, 75% and 100%, on the target and
  focus frames, even without a target. While the test is on, drag the icon rows with the left mouse button to move
  them. Target and focus remember their own positions.
- Show on the target frame and/or the focus frame.
- Icon size and text size.
- **DR reset:** seconds after the CC ends until the DR is gone (18 by default).
- Debug messages in chat, show or hide the minimap button, reset icon positions, clear everything tracked.

The minimap button: left-click opens the settings, right-click turns the test on or off, drag moves it around the
minimap. The icons follow the size of your target and focus frames, so scaling those in Edit Mode scales the icons too.

| Command | |
|---|---|
| `/xndr` | Opens or closes the settings. |
| `/xndr test` | Shows your DR groups; drag the icons to move them. |
| `/xndr groups` | Lists the DR groups your spells can apply. |
| `/xndr reset <seconds>` | Sets the DR reset time. |
| `/xndr debug` | Prints every cast XNDR counts or skips, and why. |
| `/xndr minimap` | Shows or hides the minimap button. |
| `/xndr clear` | Forgets everything tracked. |
| `/xndr probe` | Prints the game's own DR reports, if the game lets addons see them (for testing). |
| `/xndr help` | Lists these commands. |

## Good to know

- **Only your own CC counts.** The Forever client gives addons no combat log and hides other players' casts, so XNDR
  only sees what you and your pet cast. A stun from someone else in your group is not counted.
- **Only what landed counts.** Shortly after each cast XNDR checks whether a new debuff of yours appeared on the
  player. A cast eaten by a Grounding Totem, resisted, immuned or out of reach adds no DR.
- **Area spells** (Psychic Scream, Frost Nova, Howl of Terror, War Stomp, bombs) count on your target and your focus,
  each only if it landed on them.
- **The countdown is the latest it can be.** When XNDR sees the debuff disappear early (broken by damage, dispelled),
  the DR starts running out from that moment. When it can't see that, it counts as if the CC ran its full (diminished)
  length.
- **Not counted:** traps (Freezing Trap) and totems, because the game doesn't say who walked into them, and most effects
  that proc on their own from talents, seals or weapons (Blackout, Mace Stun, Seal of Justice), since you never cast
  them.
- **The DR steps** follow the classic rules: 100%, then 50%, then 25%, then immune, and the DR resets 18 seconds
  after the last CC ends. If Forever's reset turns out to be different, change it in the settings.
- If a count looks wrong, turn on `/xndr debug`, and the chat shows what XNDR did with each cast.

## For maintainers

`XNDR/Spells.lua` is generated from WoW: Forever's game data tables (exported from wago.tools for the client build named
at its top) by `tools/gen-spells.js`. `tools/check-api.js` checks every game function the addon uses against the
Forever client's published lists; `tools/test.js` plays casts against stand-in players outside the game.

## Notice

World of Warcraft and Warcraft are trademarks of Blizzard Entertainment, Inc. This is a fan project, not affiliated
with or endorsed by Blizzard. Spell names and icons belong to their owner.
