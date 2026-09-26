# AGENTS.md — Polyglot Studio

Persoonlijke leerapp van Thibaud: **Nieuwgrieks, Frans C1–C2, Solidity, AI/LLM, Workflow Automation (n8n) en Jev & Decision AI**. Statische single-page app op GitHub Pages; voortgang in de eigen Supabase op MacBook 2 (tabellen `polyglot_*`); elke ochtend om 07:30 stuurt Antigravity de lessen bij.

## Structuur

| Pad | Inhoud |
|---|---|
| `index.html`, `sw.js`, `manifest.webmanifest`, `solc-worker.js` | **gebouwde** bestanden — nooit met de hand bewerken |
| `studio/app/*.js`, `styles.css` | broncode van de app (vanilla JS, geen framework) |
| `studio/app/box/n8n-box.src.js` | sandbox voor n8n-expressies en Code-node (browser-iframe + node-verificatie) |
| `studio/content/lessons/<track>/NN.json` | lessen (contract: `studio/schema/lesson.schema.json`) |
| `studio/content/syllabus/<track>.json` | roadmaps: het volledige leertraject per vak |
| `studio/content/daily/<datum>.json` | coach-pakketten (alleen als Supabase niet is ingesteld) |
| `studio/prompts/` | prompts voor de dagelijkse Antigravity-run |
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
```

## Harde regels

1. **Lessen waar Thibaud aan begonnen is, zijn bevroren.** Nooit wijzigen, hernummeren of verwijderen (zie `frozen_lessons` in `~/scripts/polyglot-data/learner_profile.json`). Enkel nog niet gestarte lessen mogen bijgestuurd worden.
2. Elke les moet slagen voor `validate.py` **én** `verify_code.js` vóór ze in `main` komt. De build draait strikt; de ochtendrun gebruikt `--lenient` en slaat ongeldige lessen over.
3. Volg de roadmap in `studio/content/syllabus/`. Afwijken mag alleen via een consolidatieles (`kind: "consolidation"`) of door twee onderwerpen te combineren (`"roadmap": "id1+id2"`).
4. Geen geheimen in de repo. De anon key in `studio/cloud/config.json` is publiek en veilig (rijbeveiliging). De ochtendrun leest de database via SSH (`ssh macbook2`, container `supabase-db`), zonder sleutels.
5. **De Supabase op MacBook 2 is van Lullaby.** Raak enkel de `polyglot_*`-tabellen aan; nooit Lullaby-tabellen, -instellingen, containers of de Lullaby-crontab.
6. Apple Herinneringen: exact één algemene herinnering `Polyglot` (met als doelstelling minstens 1 les per dag), datum vandaag, **geen uur en geen alarm**. Alleen via EventKit (`sync_reminders.swift`), nooit AppleScript.
7. Taal van de interface en uitleg: Nederlands. Griekse accenten en Franse spelling zijn niet onderhandelbaar.
8. Werk op de lokale APFS-schijf; niets in OneDrive.
