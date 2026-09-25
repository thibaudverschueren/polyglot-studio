# Login en cloud-sync instellen (± 10 minuten, eenmalig)

Na deze stappen log je op iPhone, iPad en Mac in met een **e-mailcode**. Je voortgang, herhaalkaarten en leerlog staan dan privé in je eigen database, en je Mac leest ze elke ochtend in voor Antigravity.

## 1. Supabase-project aanmaken

1. Ga naar <https://supabase.com> → **Start your project** → log in (bv. met GitHub).
2. **New project** → naam `polyglot-studio`, regio **West EU (Ireland)** of **Central EU (Frankfurt)**, kies een sterk databasewachtwoord (bewaar het in je wachtwoordbeheer). Het gratis plan volstaat ruim.

## 2. Tabellen en beveiliging

1. Open in het project **SQL Editor** → **New query**.
2. Plak de volledige inhoud van [`supabase.sql`](supabase.sql) en klik **Run**. Je krijgt de tabellen `progress`, `events` en `coach`, telkens met rijbeveiliging: elke gebruiker ziet enkel zijn eigen rijen.

## 3. Inloggen met een e-mailcode

1. **Authentication → Providers → Email**: laat *Enable Email provider* aan. Zet **Confirm email** aan.
2. **Authentication → Emails → Templates → Magic Link** (in oudere dashboards: *Email Templates*): vervang de inhoud door:

   ```html
   <h2>Je Polyglot-code</h2>
   <p>Je inlogcode is: <strong style="font-size:24px;letter-spacing:4px">{{ .Token }}</strong></p>
   <p>De code is één uur geldig.</p>
   ```

   Doe hetzelfde bij **Confirm signup** (die mail krijg je bij je allereerste login).
3. **Authentication → URL Configuration**: zet *Site URL* op `https://thibaudverschueren.github.io/polyglot-studio/`.

> Waarom een code en geen link? Een app op je beginscherm (PWA) opent links in Safari, niet in de app. Met een code van 6 cijfers log je rechtstreeks in de app zelf in.

## 4. Gegevens invullen

De *Project URL* staat onder **Project Settings → Data API**, de sleutels onder **Project Settings → API Keys**. Nieuwe projecten tonen een *publishable* en een *secret* key; oudere projecten (tabblad *Legacy API keys*) een `anon`- en `service_role`-key. Beide soorten werken.

| Waarde | Waar invullen | Geheim? |
|---|---|---|
| Project URL (`https://<project>.supabase.co`) | `studio/cloud/config.json` → `url` **en** `~/scripts/polyglot.env` → `SUPABASE_URL` | nee |
| *Publishable key* (`sb_publishable_…`) of legacy `anon` key | `studio/cloud/config.json` → `anonKey` | nee — veilig in de website dankzij rijbeveiliging |
| *Secret key* (`sb_secret_…`) of legacy `service_role` key | **alleen** `~/scripts/polyglot.env` → `SUPABASE_SERVICE_KEY` | **ja** — nooit in de repo of website |

Daarna: `python3 ~/Developer/polyglot-studio/studio/tools/build.py`, committen en pushen (of wacht op de run van 07:30).

## 5. Eerste login en afsluiten

1. Open de app op je iPhone → je ziet het inlogscherm → vul je e-mailadres in → typ de code uit je mail.
2. Log ook in op je Mac en iPad met hetzelfde e-mailadres. Alles synchroniseert vanzelf.
3. **Sluit registratie af** zodat niemand anders een account kan maken: *Authentication → Providers → Email → Allow new users to sign up* uitzetten (of het optionele blok onderaan `supabase.sql` uitvoeren met jouw e-mailadres).

## Optioneel: Google of Apple

- **Google** (handig op de Mac): *Authentication → Providers → Google* aanzetten met een OAuth-client uit Google Cloud Console (redirect-URL: `https://<project>.supabase.co/auth/v1/callback`). Zet daarna `"google": true` in `config.json`.
- **Apple** vereist een betaald Apple Developer-account (€99/jaar) voor *Sign in with Apple*. De e-mailcode doet hetzelfde, gratis.

## Wat als …

- **Ik wis mijn Safari-gegevens?** Log opnieuw in met een code: alles komt terug uit de cloud.
- **Supabase pauzeert gratis projecten na een week zonder activiteit.** Je Mac leest elke ochtend de data in, dus dat gebeurt niet zolang de dagelijkse run loopt. Gepauzeerd? Eén klik op *Restore* in het dashboard; er gaat niets verloren.
- **Back-up?** In de app: *Voortgang → Exporteer* geeft een volledig JSON-bestand.
