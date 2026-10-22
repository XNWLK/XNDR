# XNDR

**Diminishing returns of your crowd control**, for World of Warcraft: Forever. Next to your target's and your focus's
portrait, XNDR shows an icon for each DR group you have used on that player, how much the next one is reduced, and a
countdown until the DR is gone.

Made for Warlocks: Fear, Howl of Terror, Seduction, Death Coil, Banish, plus the engineering stun gadgets.

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
4. Fear someone, or type `/xndr test` to see how it looks.

## What it shows

Each icon is one DR group. The number in the middle is how much shorter your **next** one will be on that player:

| | |
|---|---|
| **50%** (yellow) | after one: the next lasts half as long |
| **75%** (orange) | after two: the next lasts a quarter |
| **100%** (red, red border) | after three: immune until the DR is gone |

The countdown under the icon is the time until the player is back to full duration.

| Group | Spells | Icon |
|---|---|---|
| **Fear** | Fear, Howl of Terror, Seduction (your Succubus) | Fear and Seduction, split along the diagonal |
| **Death Coil** | Death Coil | Death Coil |
| **Banish** | Banish (useful against enemy Warlock demons) | Banish |
| **Stun** | Engineering bombs and grenades (copper, bronze, iron, mithril, Hi-Explosive, Thorium, Dark Iron) and the Goblin Mortar | Iron Grenade and Goblin Mortar, split along the diagonal |

Every player keeps their own DR, so you can switch targets and come back without losing it. Pets that enemy players
control count too.

## Settings

Click the minimap button (the Fear icon), or type `/xndr`:

- **Test all 3 stages:** shows 50%, 75% and 100% on the target and focus frames, even without a target. While the test
  is on, drag the icon rows with the left mouse button to move them. Target and focus remember their own positions.
- Show on the target frame and/or the focus frame.
- Icon size and text size.
- **DR reset:** seconds after the CC ends until the DR is gone (18 by default).
- Debug messages in chat, show or hide the minimap button, reset icon positions, clear everything tracked.

The minimap button: left-click opens the settings, right-click turns the test on or off, drag moves it around the
minimap. The icons follow the size of your target and focus frames, so scaling those in Edit Mode scales the icons too.

| Command | |
|---|---|
| `/xndr` | Opens or closes the settings. |
| `/xndr test` | Shows all 3 stages; drag the icons to move them. |
| `/xndr reset <seconds>` | Sets the DR reset time. |
| `/xndr debug` | Prints every cast XNDR counts or skips, and why. |
| `/xndr minimap` | Shows or hides the minimap button. |
| `/xndr clear` | Forgets everything tracked. |
| `/xndr help` | Lists these commands. |

## Good to know

- **Only your own CC counts.** The Forever client gives addons no combat log and hides other players' casts, so XNDR
  only sees what you and your pet cast. A Fear from another Warlock in your group is not counted.
- **Only what landed counts.** Shortly after each cast XNDR checks whether a new debuff appeared on the player. A cast
  eaten by a Grounding Totem, resisted or immuned adds no DR.
- **The countdown is the latest it can be.** XNDR can't see when a Fear breaks early from damage, so it counts as if
  every CC ran its full (diminished) length. If it broke early, the DR really ends a little sooner.
- **Howl of Terror** counts on your target and focus when they are within 10 yards. If the game won't tell the range
  in combat, it counts on your target.
- **Durations and the reset time follow the Classic rules** (Fear 10/15/20 s by rank, Howl 10/15, Seduction 15, Death
  Coil 3, Banish 20/30, gadgets 1-4 s, reset 18 s). If Forever behaves differently, the reset can be changed in the
  settings.
- If a count looks wrong, turn on `/xndr debug`, and the chat shows what XNDR did with each cast.

## Notice

World of Warcraft and Warcraft are trademarks of Blizzard Entertainment, Inc. This is a fan project, not affiliated
with or endorsed by Blizzard. Spell names and icons belong to their owner.
