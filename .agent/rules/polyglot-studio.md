---
description: Werkregels voor de Polyglot Studio-repository (lessen, build, dagelijkse run)
always_on: true
---

# Polyglot Studio — werkregels

Lees `AGENTS.md` in de root van deze repository. Samengevat:

1. Gestarte lessen zijn bevroren: nooit wijzigen, hernummeren of verwijderen.
2. Nieuwe of bijgestuurde lessen volgen `studio/schema/lesson.schema.json` en de instructies in `studio/prompts/LESSON_AUTHOR.md`.
3. Vóór elke commit: `python3 studio/tools/validate.py`, `node studio/tools/verify_code.js studio/content/lessons/*/*.json` en `python3 studio/tools/build.py` moeten slagen.
4. Bewerk nooit `index.html`, `sw.js` of `manifest.webmanifest` rechtstreeks: die worden gebouwd.
5. Geen geheimen in de repo. De voortgang staat in de Supabase van Lullaby op MacBook 2 (`ssh macbook2-ts` via Tailscale, of `ssh macbook2` thuis): raak alleen de `polyglot_*`-tabellen aan, nooit iets van Lullaby.
6. Een nieuw vak toevoegen? Volg regel 9 in `AGENTS.md` (alleen `tracks.json`, syllabus, kleuren en lessen; nooit een vaklijst hardcoden). Daarna moet ook `python3 ~/scripts/daily_orchestrator.py --dry-run` zonder fouten lopen.
7. Artikels van ‘Onder de motorkap’ nooit met de hand bewerken of aanvullen: alleen via `studio/tools/radar.py` (regel 10 in `AGENTS.md`).
8. Herinneringen: exact 1 algemene herinnering 'Polyglot' (met minstens 1 les per dag vereist), datum vandaag, zonder uur of alarm, via `~/scripts/sync_reminders.swift`.
9. Afkortingen voluit bij het eerste gebruik in een les (lezer: eerstejaars master handelsingenieur): zie regel 11 in `AGENTS.md`; `python3 studio/tools/abbr.py --diff` toont wat ontbreekt, `--fix` vult aan.
10. Afbeeldingen: alleen lokale bestanden onder `assets/` met alt-tekst. Diagrammen teken je via `studio/tools/make_diagrams.py` (themakleuren, geen vaste kleuren): zie regel 12 in `AGENTS.md`.
