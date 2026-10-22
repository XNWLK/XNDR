# Changelog - XNDR

What changed in each version, newest first. Download a version from the
[Releases page](https://github.com/XNWLK/XNDR/releases).

## v2.0.0

XNDR now works for every class.

- Tracks all eight DR groups of WoW: Forever: stuns, Kidney Shot, random stuns, incapacitates, fears, Mind Control,
  silences and roots. Use different kinds of CC on a player and their icons sit side by side.
- Which spell shares DR with which comes straight from Forever's own game data, so it matches the game, Forever's own
  changes included. Over 160 spells, pet abilities and items are covered.
- Changed to match the game: Death Coil, Blind and Disarm have no DR on Forever and are no longer shown. Banish now
  shares DR with Polymorph, Sap and the other incapacitates. Kidney Shot has its own group.
- Each group's icon is made from your own spells in it (two of them split along the diagonal), so a Rogue sees
  Cheap Shot and a Paladin Hammer of Justice for stuns.
- Area spells (Psychic Scream, Frost Nova, War Stomp, bombs) count on your target and focus, each only if it landed.
- The countdown is more exact: when XNDR sees your CC end early, the DR starts running out from that moment.
- Kick, Shield Bash and Counterspell count as silences only when you have the talent that makes them silence.
- Test mode shows your own class's DR groups. New commands: `/xndr groups`, `/xndr probe`.
- Hover an icon to see its group.

## v1.0.0

The first release.

- Shows the diminishing returns of your own crowd control next to your target's and focus's portrait: one icon per
  DR group, how much the next one is reduced (50%, 75%, 100% = immune) and a countdown until the DR is gone.
- Groups: Fear (Fear, Howl of Terror and your Succubus's Seduction, one icon split along the diagonal), Death Coil,
  Banish, and engineering stun gadgets (bombs, grenades, Goblin Mortar).
- Every player keeps their own DR, and pets of enemy players count too.
- A cast only counts when it landed: one eaten by a Grounding Totem, resisted or immuned adds no DR.
- Minimap button and settings window (`/xndr`): icon size, text size, target and/or focus frame, DR reset time,
  debug messages.
- Test mode shows all three stages and lets you drag the icons where you want them.
