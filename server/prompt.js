// Samme opgave som fotoPrompt() i appens index.html (web-versionen spørger Claude direkte på claude.ai).
// Ret begge steder, hvis prompten ændres.
const ren = (s, m) => String(s == null ? '' : s).replace(/[\u0000-\u001f"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, m);

export function fotoPrompt(F) {
  const navn = ren(F.navn, 80), hvor = ren(F.hvor, 80), hint = ren(F.hint, 80);
  return `Du hjælper i Kostbar, en dansk app til madplan og madlog. Brugeren har taget billedet, fordi de ikke ved, hvad maden indeholder.
${F.kind === 'dekl' ? 'Billedet skulle være af en næringsdeklaration eller emballage.\n' : ''}${navn ? 'Varen hedder ifølge stregkoden: ' + navn + '\n' : ''}${hvor ? 'Maden er fra: ' + hvor + '\n' : ''}${hint ? 'Brugeren skriver om billedet: "' + hint + '". Stol på det, når det kan passe med billedet.\n' : ''}
Gør sådan:
1. Kan du læse en næringsdeklaration (energi og protein pr. 100 g eller ml), så aflæs tallene præcist og svar med type "vare". Står der kun kJ, så regn om til kcal (kJ / 4,184).
2. Ellers er det et måltid, en snack eller en drik: del det op i de dele, du kan se (højst 8). Skøn vægten i gram af hver del, som den ligger der, og kcal og protein pr. 100 g af delen, som den er tilberedt (fx kogt pasta, ikke tør). Tag sauce, dressing, olie og smør med som egne dele, når de er der.
3. Brug tallerkenen (en middagstallerken er ca. 26 cm), bestik, hænder eller emballage til at skønne størrelsen. Er der mad til flere, så skøn det, én person spiser, og nævn det i note.
4. Er der ikke mad eller drikke på billedet, så svar type "ikke_mad".
Skriv navne på dansk. Rettens navn er højst 40 tegn og nævner kun det, man kan se. note er én kort sætning til brugeren på dansk, fx hvad du er usikker på, eller en tom streng.
Felter, der ikke passer til typen, sættes til 0, en tom streng eller en tom liste. sikkerhed er "høj", "middel" eller "lav". enhed er "g" eller "ml".`;
}

// Struktureret svar: ét objekt, som appens fotoNorm() tjekker igen, før noget bruges.
export const SKEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['maaltid', 'vare', 'ikke_mad'] },
    navn: { type: 'string' },
    maerke: { type: 'string' },
    sikkerhed: { type: 'string', enum: ['høj', 'middel', 'lav'] },
    note: { type: 'string' },
    kcal100: { type: 'number' },
    prot100: { type: 'number' },
    enhed: { type: 'string', enum: ['g', 'ml'] },
    pakke: { type: 'number' },
    dele: {
      type: 'array',
      items: {
        type: 'object',
        properties: { navn: { type: 'string' }, g: { type: 'number' }, kcal100: { type: 'number' }, prot100: { type: 'number' } },
        required: ['navn', 'g', 'kcal100', 'prot100'],
        additionalProperties: false,
      },
    },
  },
  required: ['type', 'navn', 'maerke', 'sikkerhed', 'note', 'kcal100', 'prot100', 'enhed', 'pakke', 'dele'],
  additionalProperties: false,
};
