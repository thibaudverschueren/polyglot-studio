# Login en synchronisatie

## Zo is het nu ingesteld: je eigen server (MacBook 2)

Je voortgang staat in de **Supabase die al op MacBook 2 draait** (`macbook-server-2017`, map `~/lullaby/supabase`), in aparte tabellen `polyglot_*`. Lullaby gebruikt dezelfde installatie; Polyglot raakt niets van Lullaby aan.

| Onderdeel | Waar |
|---|---|
| Database | `supabase-db` op MacBook 2, tabellen `polyglot_members`, `polyglot_progress`, `polyglot_events`, `polyglot_coach` ([schema](supabase.sql)) |
| Bereikbaar voor de app | `https://macbook-server-2017.tail99c06b.ts.net:8443` (Tailscale Funnel, al ingesteld voor Lullaby) |
| Publieke sleutel in de app | [`config.json`](config.json) → `anonKey` (veilig: anoniem heeft geen enkel recht op de `polyglot_*`-tabellen) |
| Ochtendrun op je Mac | leest de tabellen via SSH (`POLYGLOT_SSH=macbook2` in `~/scripts/polyglot.env`), **zonder** sleutels op je Mac |
| Back-up | elke nacht om 03:30 naar `~/polyglot/backups/` op MacBook 2, 30 dagen bewaard (`~/polyglot/backup.sh`, eigen blok in `crontab`); elke ochtend kopieert de ochtendrun ze naar OneDrive → `Polyglot Studio/backups` (laatste 30 dagen + de 1e van elke maand, `studio/tools/offsite_backup.py`) |

### Eerste keer

1. Open de app → **Account aanmaken** → e-mailadres + wachtwoord (min. 8 tekens). Er wordt geen mail verstuurd: het account is meteen actief.
2. Het **eerste** account dat zich zo aanmeldt, wordt eigenaar (`polyglot_members`). Daarna kan geen enkel ander account nog bij de Polyglot-tabellen.
3. Op je andere toestellen kies je gewoon **Log in** met hetzelfde e-mailadres en wachtwoord.

### Beheer

```bash
# wie is eigenaar, hoeveel data?
ssh macbook2 "docker exec -i supabase-db psql -U postgres -d postgres -c 'select m.user_id, u.email, (select count(*) from polyglot_events e where e.user_id = m.user_id) as events from polyglot_members m join auth.users u on u.id = m.user_id'"
# schema opnieuw toepassen (idempotent)
ssh macbook2 'docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction' < studio/cloud/supabase.sql
# back-up terugzetten (van de server)
ssh macbook2 'gunzip -c ~/polyglot/backups/polyglot-JJJJ-MM-DD.sql.gz | docker exec -i supabase-db psql -U postgres -d postgres'
# … of vanuit OneDrive, als de server-schijf weg is
gunzip -c ~/Library/CloudStorage/OneDrive-Personnel/"Polyglot Studio"/backups/polyglot-JJJJ-MM-DD.sql.gz | ssh macbook2 'docker exec -i supabase-db psql -U postgres -d postgres'
```

Wachtwoord vergeten? Er is geen mailserver, dus herstel gaat via de server (nieuw wachtwoord instellen met de admin-API van Supabase op MacBook 2).

> **Let op bij Lullaby:** `docker compose down -v` of een database-reset in `~/lullaby/supabase` wist ook de Polyglot-tabellen. Zet dan het schema opnieuw en de laatste back-up terug. De app bewaart alles ook lokaal en synchroniseert het daarna opnieuw.

## Alternatief: Supabase in de cloud

Wil je later naar supabase.com: maak een project, voer [`supabase.sql`](supabase.sql) uit in de SQL Editor, en zet in `config.json` de project-URL en de *publishable key*. Met een echte mailserver kan `"auth": "otp"` (inloggen met een e-mailcode). Op de Mac: `SUPABASE_URL` en `SUPABASE_SERVICE_KEY` in `~/scripts/polyglot.env`, en `POLYGLOT_SSH` weghalen.
