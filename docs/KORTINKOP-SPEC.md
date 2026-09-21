# Kortinköp & TCG-singlar – spec för implementation

Underlag för att bygga in inköp, värdering och försäljning av TCG-singlar (främst Pokémon) i Butik Lyktans befintliga system.

**Filer i den här mappen**
- `prototyp-kortinkop.html` – fungerande prototyp (fristående HTML/JS). Referens för UI, beräkningar och kunddokumentets utseende och text. Öppna den i en webbläsare.
- `ursprungligt-formular.pdf` – första förslaget på formulär, som prototypen ersätter.
- `DESIGN.md` – designsystemet (färger, typsnitt, komponenter). Gäller hela siten, även de nya vyerna här.

> **Till Claude Code:** Utforska först det befintliga repot: stack, datamodell, auth, hur produkter, lager och ordrar hanteras (t.ex. Shopify, egen databas). Föreslå sedan en plan för hur detta passar in, **innan** du skriver kod. Återanvänd befintliga mönster och komponenter. Prototypen är en referens, inte kod som ska kopieras rakt av.

---

## 1. Affärsflöde

1. **Inlämning.** Kunden lämnar in kort för värdering och betalar en fast värderingsavgift (standard 50 kr).
2. **Värdering.** Personalen registrerar varje kort med namn, nummer, set, skick, eventuell gradering, antal, marknadsvärde (Cardmarket trend) och procent vi betalar.
3. **Erbjudande.** Kunden får ett utskrivet eller PDF-erbjudande med pris per kort. Kunden väljer vilka kort hen säljer.
4. **Köp.** Kunden och personalen signerar. Personalen kontrollerar legitimation och vårdnadshavare vid säljare under 18. Utbetalning sker via Swish, bank, kontant eller butikskredit.
5. **Lager.** Sålda kort blir lagerartiklar med ett **inköpspris per kort**.
6. **Försäljning.** Korten säljs på Cardmarket, på den egna webbshopen och i butik.
7. **Provision.** Den anställde som sköter singlarna får provision på täckningsbidraget per sålt kort (se §5).

## 2. Datamodell (förslag)

```ts
type Condition = 'MT' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO' | 'GR' // Cardmarkets skala + GR = graderat
type PaymentMethod = 'swish' | 'bank' | 'cash' | 'store_credit'
type Channel = 'cardmarket' | 'webshop' | 'store'

interface BuyOffer {
  id: string
  number: string            // t.ex. "LYK-20260920-101", unikt och löpande
  status: 'draft' | 'offered' | 'accepted' | 'paid' | 'declined' | 'expired'
  evaluatedAt: string       // datum
  validDays: number         // standard 7
  evaluatorId: string       // anställd
  customer: {
    name: string; phone?: string; email?: string; address?: string
    submittedAt: string; note?: string
    idChecked: boolean; isMinor: boolean; guardianName?: string
    marketingConsent: boolean
  }
  fee: number               // värderingsavgift, standard 50
  feePaidAtSubmission: boolean
  payment: { method: PaymentMethod; to?: string }
  creditBonusPct: number    // standard 10
  lines: BuyOfferLine[]
}

interface BuyOfferLine {
  id: string
  sell: boolean             // kunden säljer denna rad
  name: string; number?: string; set?: string
  condition: Condition; grade?: string   // t.ex. "PSA 8", cert-nr i note
  qty: number
  marketValue: number       // per st, SEK, Cardmarket trend vid värdering
  pct: number               // 0–100, INTERNT
  note?: string             // INTERNT
  isBulk?: boolean
}

interface InventoryItem {   // skapas per såld rad när erbjudandet är betalt
  id: string
  sourceOfferId: string; sourceLineId: string
  name: string; number?: string; set?: string; condition: Condition; grade?: string
  qtyIn: number; qtyOnHand: number
  unitCost: number          // inköpspris per st = lineOffer / qty
  listedOn: Channel[]
}

interface Sale {
  id: string; inventoryItemId: string; channel: Channel
  qty: number; unitPriceExVat: number
  platformFee: number       // Cardmarket-avgift, betal-/Shopify-avgift, kortavgift
  shippingCost: number      // fraktmaterial + porto (om butiken betalar)
  soldAt: string; soldBy?: string
  returnedAt?: string
}
```

## 3. Beräkningar – erbjudande (identiskt med prototypen)

- `lineOffer = floor(marketValue * qty * pct / 100)`, alltid avrundat nedåt till hela kronor.
- `offer = Σ lineOffer` för rader där `sell = true`.
- `creditBonus = payment.method === 'store_credit' ? floor(offer * creditBonusPct / 100) : 0`
- Värderingsavgift, där `anySold = offer > 0`:

| feePaidAtSubmission | anySold | Effekt på total | Rad i dokumentet |
|---|---|---|---|
| true | true | +fee | "Värderingsavgift återbetalas" |
| true | false | 0 | "Värderingsavgift (betald)" |
| false | true | 0 | "Värderingsavgift – stryks" |
| false | false | −fee | "Värderingsavgift att betala" (kunden betalar oss) |

- `total = offer + creditBonus + feeEffect`
- Endast internt: snitt-% = `offer / marknadsvärde för sålda rader`, marginal mot trend = `marknadsvärde för sålda rader − offer`.
- Giltigt t.o.m. = `evaluatedAt + validDays`.

## 4. Kunddokumentet (A4, svenska)

Se prototypen, fliken "Kundens erbjudande". Två varianter:

- **Kundkopia** visar kort, nummer, set, skick, antal, marknadsvärde och vårt pris. Den visar **aldrig** procent eller interna anteckningar. Rader kunden inte säljer visas överstrukna.
- **Internkopia** visar dessutom procent, anteckningar och en intern sammanfattning.

Dokumentet ska innehålla: huvud (Butik Lyktan, Lyktan Spel AB, org.nr 559541-9564), erbjudandenummer, datum, värderare, giltighetstid, säljare, köpare, kortlista, summering, utbetalningssätt, villkor, kontrollrutor och tre signaturfält (säljare, vårdnadshavare, butiken).

**Villkor (ordagrant, med inskjutna värden):**
1. Erbjudandet gäller till och med {giltigTom}. Kortpriser ändras snabbt, så efter det gör vi en ny värdering.
2. Marknadsvärdet är Cardmarkets trendpris för kortet vid värderingen. Skick bedöms enligt Cardmarkets skala.
3. Du intygar att du äger korten, att de är äkta och att du har rätt att sälja dem.
4. Köpet är klart när vi har betalat. Då övergår äganderätten till Lyktan Spel AB.
5. Visar det sig att ett kort är förfalskat eller stulet har vi rätt att häva köpet av det kortet och få tillbaka betalningen.
6. Säljare under 18 år behöver en vårdnadshavares godkännande och underskrift.
7. Kort du inte säljer hämtar du inom {pickupDays} dagar.
8. Vi sparar dina uppgifter i vår bokföring i sju år enligt bokföringslagen. Vi skickar inga utskick utan att du har sagt ja.

Villkoren bör granskas juridiskt innan skarp användning.

PDF: generera helst på serversidan eller med print-CSS som i prototypen. Spara en PDF per erbjudande, eftersom den fungerar som inköpsverifikation i bokföringen.

## 5. Provision för den anställde

- Lön: **80 kr/h + 35 % av täckningsbidraget** per sålt kort. Semesterersättning (12 %) och arbetsgivaravgifter tillkommer i lönesystemet, inte här.
- `contribution = unitPriceExVat * qty − unitCost * qty − platformFee − shippingCost`
- `commission = max(0, contribution) * 0.35`. Negativt täckningsbidrag ger 0 och dras aldrig från lönen.
- Provision ges på **alla** sålda singlar ur singellagret, oavsett kanal och vem som sålde.
- Returer: provisionen för returnerad försäljning dras tillbaka nästa period.
- Rapport per månad: lista över försäljningar med pris, inköp, avgifter, täckningsbidrag och provision, plus summa. Rapporten ges till den anställde.
- Moms: om vinstmarginalbeskattning (VMB) används ska täckningsbidraget räknas **efter** moms på marginalen. Stäm av med redovisningskonsulten och gör det konfigurerbart.
- Prosentsatsen ska vara en inställning, inte hårdkodad.

## 6. Kontroller och regler

- Procentsatsen för inköp sätts enligt en formel: standard-% plus justering per rad. Riktvärden: bulk ca 25 %, vanliga kort ca 55–70 %, graderade eller dyra kort upp till ca 90 %.
- Inköp över **1 000 kr** kräver att ägaren (Beppe) godkänner.
- Den anställde får inte köpa från eller sälja till sig själv eller närstående utan godkännande. Logga vem som värderade och vem som sålde.
- Kort med gradering: spara certnummer.
- Legitimation ska kontrolleras vid varje köp. Spara inte ID-nummer, bara att kontrollen gjordes.
- Personuppgifter: bara det som behövs för verifikationen. Marknadsföringssamtycke är en separat, frivillig kryssruta.

## 7. Integration (att bekräfta i repot)

- Lagerartiklar ska kunna publiceras till webbshopen (Shopify, om det används) och exporteras till Cardmarket (CSV/API) med lagersynk mellan kanaler, så att ett kort inte säljs två gånger.
- Marknadsvärde: prototypen matar in det manuellt. Det kan på sikt hämtas från Cardmarket eller annan priskälla.
- Behörigheter: den anställde kan värdera, köpa in och sälja. Bara ägaren ser provisionsinställningar och kan godkänna stora inköp.

## 8. Förslag på ordning

1. Datamodell och migrering (BuyOffer, lines, InventoryItem, Sale).
2. Värderingsvy och kunddokument (PDF).
3. Från betalt erbjudande till lagerartiklar med inköpspris per kort.
4. Försäljningsregistrering per kanal och synk till webbshop och Cardmarket.
5. Provisionsrapport per månad.
