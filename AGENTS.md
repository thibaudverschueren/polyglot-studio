# AGENTS.md — Polyglot Studio

Persoonlijke leerapp van Thibaud: **Nieuwgrieks, Frans C1–C2, Spaans A0–B2, Solidity, AI/LLM, Workflow Automation (n8n), Jev & Decision AI en Netwerken & Routing** (de actuele lijst staat in `studio/content/tracks.json`). Statische single-page app op GitHub Pages; voortgang in de eigen Supabase op MacBook 2 (tabellen `polyglot_*`); elke ochtend om 07:30 stuurt Antigravity de lessen bij.

## Structuur

| Pad | Inhoud |
|---|---|
| `index.html`, `sw.js`, `manifest.webmanifest`, `solc-worker.js` | **gebouwde** bestanden — nooit met de hand bewerken |
| `studio/app/*.js`, `styles.css` | broncode van de app (vanilla JS, geen framework) |
| `studio/app/box/n8n-box.src.js` | sandbox voor n8n-expressies en Code-node (browser-iframe + node-verificatie) |
| `studio/content/lessons/<track>/NN.json` | lessen (contract: `studio/schema/lesson.schema.json`) |
| `studio/content/syllabus/<track>.json` | roadmaps: het volledige leertraject per vak |
| `studio/content/daily/<datum>.json` | coach-pakketten (alleen als Supabase niet is ingesteld) |
| `studio/prompts/` | prompts voor de dagelijkse Antigravity-run (lessen, coach, en `RADAR_*` voor ‘Onder de motorkap’) |
| `studio/content/radar/` | ‘Onder de motorkap’: `interests.json` (onderwerpen), `canon.json` (klassiekers), `requests.json` (vragen), `items/` (artikels) |
| `radar/` | **gebouwde** artikels + `index.json` voor de app — nooit met de hand bewerken |
| `studio/tools/` | build, validatie, codeverificatie, leerdersmodel, dagelijkse run |
| `studio/cloud/` | databaseschema (`supabase.sql`), app-config en [setup-gids](studio/cloud/SETUP.md) |
| `assets/` | KaTeX-fonts, Solidity-compiler (soljson 0.8.37) |
| `~/scripts/` (buiten de repo) | `daily_orchestrator.py` (launchd), `sync_reminders.swift`, `polyglot.env` (geheimen) |

## Commando's

```bash
python3 studio/tools/validate.py                       # schema + didactische regels
node studio/tools/verify_code.js studio/content/lessons/*/*.json   # voert alle code-oefeningen uit
python3 studio/tools/build.py                          # bouwt index.html (strikt)
python3 ~/scripts/daily_orchestrator.py --dry-run      # toont het plan van de ochtendrun
python3 studio/tools/radar.py --dry-run                # ‘Onder de motorkap’: vragen, kandidaten, plan
python3 studio/tools/radar.py --ask "Hoe werkt …?"     # vraag in de wachtrij zetten
python3 studio/tools/radar.py --classic attention      # één klassieker nu schrijven
```

## Harde regels

1. **Lessen waar Thibaud aan begonnen is, zijn bevroren.** Nooit wijzigen, hernummeren of verwijderen (zie `frozen_lessons` in `~/scripts/polyglot-data/learner_profile.json`). Enkel nog niet gestarte lessen mogen bijgestuurd worden.
2. Elke les moet slagen voor `validate.py` **én** `verify_code.js` vóór ze in `main` komt. De build draait strikt; de ochtendrun gebruikt `--lenient` en slaat ongeldige lessen over.
3. Volg de roadmap in `studio/content/syllabus/`. Afwijken mag alleen via een consolidatieles (`kind: "consolidation"`) of door twee onderwerpen te combineren (`"roadmap": "id1+id2"`).
4. Geen geheimen in de repo. De anon key in `studio/cloud/config.json` is publiek en veilig (rijbeveiliging). De ochtendrun leest de database via SSH (`ssh macbook2`, container `supabase-db`), zonder sleutels.
5. **De Supabase op MacBook 2 is van Lullaby.** Raak enkel de `polyglot_*`-tabellen aan; nooit Lullaby-tabellen, -instellingen, containers of de Lullaby-crontab.
6. Apple Herinneringen: exact één algemene herinnering `Polyglot` (met als doelstelling minstens 1 les per dag), datum vandaag, **geen uur en geen alarm**. Alleen via EventKit (`sync_reminders.swift`), nooit AppleScript.
7. Taal van de interface en uitleg: Nederlands. Griekse accenten, Franse spelling en Spaanse tildes (RAE) zijn niet onderhandelbaar.
8. Werk op de lokale APFS-schijf; niets in OneDrive.
9. **Een nieuw vak toevoegen** doe je in deze volgorde, en nergens anders (de tools lezen de lijst uit `tracks.json`; een hardcoded lijst crasht de ochtendrun, zoals gebeurde met `routing` op 3 oktober):
   1. `studio/content/tracks.json`: titel, `short`, `glyph`, `emoji`, `promptName`, `levels`, `goal`, `subtitle`, `lang`;
   2. `studio/content/syllabus/<vak>.json`;
   3. kleurvariabelen `--<vak>`, `--<vak>-soft`, `--<vak>-ink` (licht én donker) en `[data-track="<vak>"]` in `studio/app/styles.css`, in een tint die zichtbaar verschilt van alle bestaande vakken;
   4. de lessen zelf.
   Daarna moeten `python3 studio/tools/validate.py` (controleert stappen 1 tot 3) **en** `python3 ~/scripts/daily_orchestrator.py --dry-run` (moet tot het einde lopen) slagen vóór je pusht.
10. **‘Onder de motorkap’ (artikels in `studio/content/radar/items/`) bewerk je nooit met de hand.** Elk artikel ontstaat via `python3 studio/tools/radar.py` (bronnen worden opgehaald, de tekst steunt uitsluitend op die bronnen, een factcheck-lus moet schoon eindigen) en is pas zichtbaar met `meta.verified`. Voeg dus nooit zelf `numbers`, citaten, bronnen of beweringen toe: een eerdere ‘audit’ voegde zo citaten toe die niet in de bron stonden. Iets te corrigeren? Pas `studio/prompts/RADAR_*.md` of de bronnen aan en laat `radar.py --backfill` het artikel opnieuw controleren. Een eigen vraag laten uitleggen: `radar.py --ask "…"`.
