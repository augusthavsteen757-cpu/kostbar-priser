# Kostbar foto-server

Når man i iPhone-appen tager et billede af maden, sender appen billedet hertil. Serveren spørger Claude, hvad maden er, og sender kcal og protein tilbage. Billeder gemmes ikke.

Kører på Render (tjenesten `kostbar-foto`, Frankfurt). Den deployes ikke automatisk, når `priser.json` opdateres; tryk "Manual Deploy" på Render, når koden her ændres.

## Miljøvariabler på Render

| Navn | Betydning |
| --- | --- |
| `ANTHROPIC_API_KEY` | Nøglen fra console.anthropic.com. Skrives kun på Render, aldrig her. Uden den svarer `/ok` `{"klar":false}`, og appen skjuler knappen. |
| `MODEL` | `claude-sonnet-5-5` (standard, mest præcis) eller `claude-haiku-5-5` (billigst). |
| `DAGLIG_MAX` | Højst så mange billeder i alt pr. døgn (standard 300). |
| `GITHUB_TOKEN` | Valgfri. Fine-grained token med Contents: Read and write på kostbar-priser. Så gemmes prisrapporter også i `rapporter/<måned>.jsonl`. Uden den ligger de kun i Render-loggen (7 dage). |
| `IP_TI_MIN`, `IP_DAG` | Højst 10 billeder pr. 10 min og 40 pr. døgn fra samme adresse. |

## Endepunkter

- `GET /ok` giver `{"klar": true|false, "model": "..."}`.
- `POST /foto` med `{"billede": "<base64 jpeg/png/webp>", "kind": "mad"|"dekl", "navn", "hvor", "hint"}` giver `{"svar": {...}}` eller `{"fejl": "not_ready"|"rate_limited"|"daily_limit"|"image_rejected"|"too_big"|"refused"|"invalid_json"|"upstream_error"|"bad_request"}`.

- `POST /pris` med `{"st", "id", "navn", "p", "pak", "tb", "vist", "dato", "postnr", "priser"}` ("Forkert pris?" i indkøbslisten) giver `{"ok": true}`. Højst 30 pr. adresse pr. døgn. Rapporten skrives i loggen som `{"kode":"prisrapport","r":{...}}`.

Prompten står i `prompt.js` og skal svare til `fotoPrompt()` i appens `index.html`.
