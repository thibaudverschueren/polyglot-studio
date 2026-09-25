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
5. Geen geheimen in de repo; de service-role key staat alleen in `~/scripts/polyglot.env`.
6. Herinneringen: 1 master + 1 subtaak per vak, zonder uur of alarm, via `~/scripts/sync_reminders.swift`.
