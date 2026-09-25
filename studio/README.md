# Polyglot Studio v2

Persoonlijke leerapp voor vijf vakken: **Nieuwgrieks**, **Frans C1→C2**, **Solidity**, **AI & LLM's** en **Workflow Automation (n8n)**.
Eén statische pagina op GitHub Pages; werkt offline als app op iPhone, iPad en Mac.

## Hoe je leert

Elke les heeft vijf stappen. Een les is pas *geleerd* als je het kan **aantonen**:

| Stap | Wat | Waarom |
|---|---|---|
| 1. Opwarmen / Niveautest | herhaalkaarten van vroeger; in les 1 een niveautest | ophalen uit het geheugen versterkt het meest |
| 2. Leren | theorie in korte blokken, na elk blok 1–2 controlevragen | direct toepassen wat je net las |
| 3. Oefenen | adaptief: per leerdoel tot je het **twee keer foutloos** kan op niveau ≥ 2 | geen doorklikken; fouten komen terug |
| 4. Schrijven / Bouwen | een tekst, uitleg of werkende code die je zelf beoordeelt met een rubric | echt kunnen ≠ herkennen |
| 5. Meesterproef | **nieuwe** vragen, ≥ 80 % en elk leerdoel minstens één keer foutloos | bewijs, niet gevoel |

Daarna: **retentiecheck** na een dag (*Beheerst*) en na een week (*Verankerd*). Wat je vergeet, komt terug in de dagelijkse herhaling (SM-2) en — als een check faalt — in een herhalingsles.

De controle is streng maar eerlijk: accenten en de Griekse ς tellen (halve score als alleen dat fout is), typefouten worden enkel in Nederlands/Engels getolereerd, en bij code draait de app je code echt: **Solidity** wordt gecompileerd met solc 0.8.37 en getest op een ingebouwde EVM; **n8n-expressies en Code-nodes** draaien in een sandbox met `$json`, `$input`, `$('Node')`.

## Elke ochtend (07:30)

```
launchd → ~/scripts/run_daily.sh → ~/scripts/daily_orchestrator.py → studio/tools/daily.py
```

1. `git pull`
2. voortgang en leerlog uit Supabase → leerdersmodel (`~/scripts/polyglot-data/learner_profile.json`)
3. plan per vak: herhalingsles na een mislukte retentiecheck · de eerstvolgende niet-gestarte les bijsturen op nieuwe resultaten · nieuwe lessen tot er 5 klaarstaan (max. 2 per dag)
4. Antigravity schrijft (headless, zonder tools) → validatie + code uitvoeren → max. 2 herkansingen
5. bouwen → commit → push
6. Apple Herinneringen: `🎓 Polyglot Studio` met één subtaak per vak, zonder uur of alarm

Lessen waar je aan begonnen bent, worden nooit meer gewijzigd.

## Commando's

```bash
python3 studio/tools/validate.py                                   # alle lessen controleren
node studio/tools/verify_code.js studio/content/lessons/*/*.json   # alle code-oefeningen uitvoeren
python3 studio/tools/build.py                                      # index.html bouwen
python3 ~/scripts/daily_orchestrator.py --dry-run                  # plan van de ochtendrun tonen
python3 -m http.server 8765                                        # lokaal testen op http://localhost:8765
```

## Bestanden

- `studio/app/` — de app (vanilla JS + CSS), wordt door `build.py` in één `index.html` gezet
- `studio/content/lessons/<vak>/NN.json` — lessen · `studio/content/syllabus/<vak>.json` — volledige roadmaps
- `studio/schema/lesson.schema.json` — het contract voor elke les
- `studio/prompts/` — prompts voor Antigravity (`ANTIGRAVITY_MASTER_PROMPT.md` plak je zelf in Antigravity)
- `studio/cloud/` — Supabase-schema en [setup-gids](cloud/SETUP.md)
- `studio/tools/` — build, validatie, codeverificatie, leerdersmodel, ochtendrun

## Privacy en veiligheid

- Login met een e-mailcode via Supabase; elke rij in de database is afgeschermd per gebruiker (row level security).
- In de website staat alleen de publieke *anon key*. De *service-role key* staat alleen op je Mac in `~/scripts/polyglot.env`.
- Code die je schrijft draait in een afgeschermde sandbox zonder toegang tot je login.
- Antigravity krijgt geen toegang tot bestanden of terminal; alles wat het teruggeeft wordt eerst gecontroleerd.
