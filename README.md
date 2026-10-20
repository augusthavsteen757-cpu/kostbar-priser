# Kostbar: ugens priser

`priser.json` er de priser og tilbud, som Kostbar-appen henter, når den åbnes:
https://raw.githubusercontent.com/augusthavsteen757-cpu/kostbar-priser/main/priser.json

Filen opdateres automatisk hver torsdag morgen af prisopdateringen i projektet (madplanen-app/priser/opdater.py). Ret den ikke i hånden.

- `hentet`: datoen priserne blev hentet. Appen bruger kun en fil, der er nyere end den, den har.
- `reg`: normalpriser pr. kæde. `off`: ugens tilbud med gyldighedsperiode.
