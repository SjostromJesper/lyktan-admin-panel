# Butik Lyktan – designsystem

Stilen kommer från kortinköpsprototypen (`prototyp-kortinkop.html`). Den ska användas på **hela** siten: webbshop, interna verktyg och dokument.

> **Till Claude Code:** Inventera först hur styling görs i repot, till exempel Tailwind-config, globala CSS-variabler, en komponentbibliotek eller ett Shopify-tema. Lägg in tokens nedan på **ett** ställe (CSS-variabler, och vid behov även i Tailwind-temat). Migrera sedan komponent för komponent. Ta inte bort befintlig funktionalitet, och ändra inte text eller innehåll i samma veva som stilen. Visa en plan och börja med tokens, typografi och basknappar innan du går vidare.

---

## 1. Känsla

Lugn, saklig och tydlig, som en välordnad samlarpärm. Grå-gröna neutraler, mörkt bläck och **en** varm accent: lyktans bärnstensfärg. Accenten används sparsamt, till exempel på primärknappen, lågan i logotypen och markeringar. Allt annat bärs av typografi och luft.

## 2. Färger (tokens)

Definiera dem som CSS-variabler på `:root`. Mörkt läge är obligatoriskt och följer systemet, med möjlighet att tvinga fram ljust eller mörkt via `data-theme`.

```css
:root{
  --ink:#1D2230;        /* text, rubriker, aktiv flik */
  --paper:#EEF0EC;      /* sidans bakgrund */
  --surface:#FFFFFF;    /* paneler, kort */
  --surface-2:#F6F7F4;  /* fält, hover-ytor */
  --line:#D9DBD4;       /* ramar, avdelare */
  --muted:#666B76;      /* sekundär text, etiketter */
  --accent:#C97A12;     /* lyktans bärnsten – primärknapp, logotypens låga */
  --accent-soft:#F7E6CC;/* notiser, subtila markeringar */
  --focus:#2F6FDB;      /* fokusring */
  --ok:#2E7D4F; --warn:#B7791F; --bad:#B4412F;  /* semantiska, ej accent */
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --ink:#E9EAE6; --paper:#15181F; --surface:#1D212A; --surface-2:#232833;
    --line:#333946; --muted:#9AA0AB; --accent:#E9A13F; --accent-soft:#3A2E1C; --focus:#7AA7F2;
  }
}
:root[data-theme="dark"]{
  --ink:#E9EAE6; --paper:#15181F; --surface:#1D212A; --surface-2:#232833;
  --line:#333946; --muted:#9AA0AB; --accent:#E9A13F; --accent-soft:#3A2E1C; --focus:#7AA7F2;
}
body{background:var(--paper);color:var(--ink)}
```

Regler:
- Text på accentfärgad yta är alltid mörk (`#1D1406`), aldrig vit.
- Semantiska färger (ok, varning, fel) används bara för status, aldrig som dekoration.
- Kortskick har egna färger och visas som konturchips: MT `#1F7A4A`, NM `#2E8B57`, EX `#2B7F86`, GD `#9A7B12`, LP `#B7791F`, PL `#B4552F`, PO `#A23A3A`, graderat `#5B4BB0`.
- Använd aldrig gradienter, och inga färger utöver dessa utan att lägga till en token.

## 3. Typografi

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
```

- **Familjen Grotesk** (svenskritat typsnitt) för allt: rubriker, brödtext och knappar.
  `font-family:"Familjen Grotesk", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;`
- **IBM Plex Mono** för siffror och koder: priser i tabeller, kortnummer (`149/147`), ordernummer och datum i metadata.
  `font-family:"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;` plus `font-variant-numeric:tabular-nums`.
- Grundstorlek 15px, radavstånd 1.45.
- Skala: 13 (etiketter) / 15 (bröd) / 18 (varumärke, små rubriker) / 20 (summor) / 28–36 (sidrubriker på webbshopen).
- Rubriker: vikt 700, `letter-spacing:-.01em`, `text-wrap:balance`.
- Sektionsetiketter: 11.5–13px, VERSALER, `letter-spacing:.07em`, färg `--muted`, vikt 600. Det här är ett signaturdrag och ska användas konsekvent.
- Brödtext max cirka 65 tecken per rad.

## 4. Form och yta

- Radie: paneler 10px, knappar och flikar 7–8px, fält 6px, chips 99px.
- Paneler: bakgrund `--surface` och 1px ram `--line`. **Ingen skugga.** Skugga används bara på "papper" (dokument, modaler).
- Luft: 16–20px mellan paneler och 18px inre padding i paneler. Minst 16px sidomarginal på mobil.
- Layout: innehållet är max 1180px brett och centrerat. Sidopanelen med sammanfattning eller varukorg är 300px och sticky på desktop, och staplas under på skärmar smalare än 900px.
- Toppraden: sticky, bakgrund `--paper`, 1px underkant `--line`. Logotypen och namnet står till vänster och navigationen till höger.

## 5. Komponenter

**Knappar**
- Standard: `--surface`, 1px `--line`, vikt 500, padding 7px 12px. Vid hover blir ramen `--muted`.
- Primär: bakgrund och ram `--accent`, text `#1D1406`. Max **en** primärknapp per vy.
- Farlig: standardknapp med text i `--bad`. Destruktiva åtgärder bekräftas med ett andra klick ("Klicka igen för att …"), inte med en popup.

**Flikar / segmentkontroll:** en behållare i `--surface` med 1px ram och 3px padding. Den aktiva fliken har bakgrund `--ink` och text `--paper`.

**Formulärfält:** etikett ovanför (12.5px, `--muted`), fält med bakgrund `--surface-2`, 1px `--line` och radie 6px. Fältnätet använder `repeat(auto-fill,minmax(190px,1fr))`.

**Tabeller:** kolumnrubriker i versaler med spärrning i `--muted`, 1px radavdelare och inga zebraränder. Siffror högerställs i mono. Tabellen scrollar horisontellt i sin egen behållare på mobil.

**Summering:** etikett till vänster i `--muted` och värde till höger i mono. Totalraden har en linje ovanför, vikt 600 och värde i 20px.

**Notis:** bakgrund `--accent-soft`, radie 8px, 14px text.

**Toast:** mörk (`--ink`/`--paper`), centrerad längst ner, försvinner efter cirka 2 sekunder. Texten säger vad som hände, till exempel "Kortlistan kopierad".

**Fokus:** 2px kontur i `--focus` med 2px offset på allt interaktivt. Respektera `prefers-reduced-motion`.

## 6. Logotyp

En enkel lykta i linjeteckning (1.8px streck i `currentColor`) med en låga i `--accent`. SVG:n finns i prototypens topprad och kan återanvändas som den är. Den står bredvid ordmärket "Butik Lyktan" i 18–19pt, vikt 700 och `letter-spacing:-.02em`.

## 7. Dokument och utskrift

Utskrivna dokument, som erbjudanden, kvitton och följesedlar, är alltid ljusa (vitt papper) oavsett tema. De har en 2px linje under huvudet i `--ink`, etiketter i versaler och siffror i mono. Se `.doc` i prototypen.

## 8. Webbshopen specifikt

Prototypen är ett verktyg. På kundsidor gäller samma tokens och typsnitt, men:
- Produktkort: panel utan skugga, bilden överst och namnet i vikt 600. Priset står i mono, och skicket visas som chip för singlar.
- Sidrubriker får vara större (28–36px), men ingen jättelik hero. Visa gärna sortimentet direkt.
- Accenten används för "Lägg i varukorg" och kassaknappen, alltså den primära handlingen på sidan.
- Om siten kör på ett Shopify-tema: lägg in tokens i temats CSS eller inställningar och ändra teman via temafilerna, inte via inline-stilar.

## 9. Undvik

Gradienter, skuggor på vanliga paneler, flera accentfärger, emojis som ikoner, centrerad brödtext, vit text på bärnsten och helsvart eller helgrå text i stället för tokens.
