<script setup lang="ts">
import type { PaymentMethod } from '~/utils/kortinkop'

type Offer = {
  number: string
  evaluated_at: string
  valid_days: number
  evaluator_name: string | null
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  customer_address: string | null
  id_checked: boolean
  is_minor: boolean
  fee_kr: number
  fee_paid_at_submission: boolean
  payment_method: PaymentMethod
  payment_to: string | null
  credit_bonus_pct: number
}

type Line = {
  sell: boolean
  name: string
  card_number: string
  card_set: string
  condition: string
  grade: string
  qty: number
  market_value_kr: number
  pct: number
  note: string
}

type Settings = {
  pickup_days: number
  company_legal_name: string
  company_org_number: string
  company_address: string
  company_contact: string
}

const props = defineProps<{
  offer: Offer
  lines: Line[]
  internal: boolean
  settings: Settings
}>()

const rows = computed(() => props.lines.filter((l) => l.name || l.market_value_kr))
const totals = computed(() => calcTotals(props.offer, props.lines))
const until = computed(() => validUntil(props.offer.evaluated_at, props.offer.valid_days))

const terms = computed(() => [
  `Erbjudandet gäller till och med ${until.value}. Kortpriser ändras snabbt, så efter det gör vi en ny värdering.`,
  'Marknadsvärdet är Cardmarkets trendpris för kortet vid värderingen. Skick bedöms enligt Cardmarkets skala.',
  'Du intygar att du äger korten, att de är äkta och att du har rätt att sälja dem.',
  `Köpet är klart när vi har betalat. Då övergår äganderätten till ${props.settings.company_legal_name}.`,
  'Visar det sig att ett kort är förfalskat eller stulet har vi rätt att häva köpet av det kortet och få tillbaka betalningen.',
  'Säljare under 18 år behöver en vårdnadshavares godkännande och underskrift.',
  `Kort du inte säljer hämtar du inom ${props.settings.pickup_days} dagar.`,
  'Vi sparar dina uppgifter i vår bokföring i sju år enligt bokföringslagen. Vi skickar inga utskick utan att du har sagt ja.'
])
</script>

<template>
  <div class="doc-stage">
    <article class="doc">
      <div class="d-head">
        <div class="d-mark">
          <svg width="30" height="36" viewBox="0 0 22 26" aria-hidden="true">
            <path d="M7 2h8M11 2v3" stroke="#1B1E26" stroke-width="1.8" stroke-linecap="round" fill="none" />
            <rect x="3" y="5" width="16" height="17" rx="3" fill="none" stroke="#1B1E26" stroke-width="1.8" />
            <path d="M11 10c2 2.2 2.4 4 0 7-2.4-3-2-4.8 0-7z" fill="#C97A12" />
            <path d="M5 22v2h12v-2" stroke="#1B1E26" stroke-width="1.8" fill="none" />
          </svg>
          <div>
            <div class="name">Butik Lyktan</div>
            <div class="legal">{{ settings.company_legal_name }} · Org.nr {{ settings.company_org_number }}</div>
          </div>
        </div>
        <div class="d-title">
          <h1>{{ internal ? 'Inköpsunderlag – internt' : 'Erbjudande om köp av kort' }}</h1>
          <div class="meta">
            Nr {{ offer.number }}<br>
            Värderat {{ offer.evaluated_at }} av {{ offer.evaluator_name }}<br>
            Giltigt t.o.m. {{ until }}
          </div>
        </div>
      </div>

      <div class="d-parties">
        <div>
          <h3>Säljare</h3>
          <p>
            <b>{{ offer.customer_name || '—' }}</b><br>
            <template v-for="(line, i) in [offer.customer_address, offer.customer_phone, offer.customer_email].filter(Boolean)" :key="i">{{ line }}<br></template>
          </p>
        </div>
        <div>
          <h3>Köpare</h3>
          <p>
            <b>{{ settings.company_legal_name }}</b><br>
            {{ settings.company_address }}<br>
            {{ settings.company_contact }}
          </p>
        </div>
      </div>

      <div v-if="!internal" class="d-lead">
        Tack för att du lät oss värdera dina kort. Nedan ser du vad vi kan betala för varje kort. Du väljer själv vilka du vill sälja – överstrukna kort behåller du.
      </div>

      <table class="d-cards">
        <thead>
          <tr>
            <th>Kort</th><th>Nr</th><th>Skick</th><th class="num">Antal</th><th class="num">Marknadsvärde</th>
            <th v-if="internal" class="num">%</th><th class="num">Vårt pris</th><th v-if="internal">Anteckning</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in rows" :key="i" :class="{ off: !row.sell }">
            <td><div class="nm">{{ row.name || '—' }}</div><div class="sub">{{ row.card_set }}</div></td>
            <td class="d-mono">{{ row.card_number }}</td>
            <td class="keep">
              <span class="d-cond" :style="{ color: conditionMeta(row.condition).color }">{{ row.condition }}</span>
              <span v-if="row.grade" class="sub">{{ row.grade }}</span>
            </td>
            <td class="num d-mono">{{ row.qty }}</td>
            <td class="num d-mono">{{ kr((row.market_value_kr || 0) * (row.qty || 0)) }}</td>
            <td v-if="internal" class="num d-mono">{{ row.pct }} %</td>
            <td class="num d-mono"><b>{{ kr(offerOf(row)) }}</b></td>
            <td v-if="internal" class="sub">{{ row.note }}</td>
          </tr>
        </tbody>
      </table>

      <div class="d-foot">
        <div class="d-pay">
          <h3 style="font-size:7.5pt;letter-spacing:.1em;text-transform:uppercase;color:#5E636E;margin:0 0 5px">Utbetalning</h3>
          <p><b>{{ PAYMENT_LABELS[offer.payment_method] }}</b><template v-if="offer.payment_to"> till {{ offer.payment_to }}</template></p>
          <p v-if="offer.fee_kr" style="color:#5E636E;font-size:8.5pt;margin-top:6px">Värderingsavgiften {{ kr(offer.fee_kr) }} dras inte om du säljer minst ett kort till oss.</p>
          <p v-if="offer.credit_bonus_pct" style="color:#5E636E;font-size:8.5pt">Väljer du butikskredit får du {{ offer.credit_bonus_pct }} % extra.</p>
        </div>
        <dl class="d-totals">
          <dt>Kort du säljer</dt><dd>{{ rows.filter(r => r.sell).reduce((a, r) => a + (r.qty || 0), 0) }} st</dd>
          <dt>Summa för korten</dt><dd>{{ kr(totals.offerTotalKr) }}</dd>
          <template v-if="offer.payment_method === 'store_credit' && totals.creditBonusKr">
            <dt>Bonus butikskredit +{{ offer.credit_bonus_pct }} %</dt><dd>+{{ kr(totals.creditBonusKr) }}</dd>
          </template>
          <template v-if="offer.fee_kr">
            <dt>{{ totals.feeEffectKr > 0 ? 'Värderingsavgift återbetalas' : totals.feeEffectKr < 0 ? 'Värderingsavgift att betala' : (offer.fee_paid_at_submission ? 'Värderingsavgift (betald)' : 'Värderingsavgift – stryks') }}</dt>
            <dd>{{ totals.feeEffectKr > 0 ? '+' : '' }}{{ kr(totals.feeEffectKr) }}</dd>
          </template>
          <dt class="grand">{{ totals.grandTotalKr < 0 ? 'Att betala till oss' : (offer.payment_method === 'store_credit' ? 'Du får i butikskredit' : 'Du får betalt') }}</dt>
          <dd class="grand">{{ kr(Math.abs(totals.grandTotalKr)) }}</dd>
        </dl>
      </div>

      <div class="d-sec">
        <h3>Villkor</h3>
        <ol class="d-terms">
          <li v-for="(term, i) in terms" :key="i">{{ term }}</li>
        </ol>
      </div>

      <div class="d-sec">
        <h3>Kontroll</h3>
        <div class="d-boxes">
          <div><span class="box">{{ offer.id_checked ? '✓' : '' }}</span>Legitimation kontrollerad av personal</div>
          <div><span class="box">{{ !offer.is_minor && offer.id_checked ? '✓' : '' }}</span>Säljaren är 18 år eller äldre</div>
          <div><span class="box">{{ offer.is_minor ? '✓' : '' }}</span>Säljaren är under 18 år – vårdnadshavare godkänner försäljningen</div>
        </div>
      </div>

      <div class="d-sign">
        <div><b>Säljare</b>Underskrift, namnförtydligande, datum</div>
        <div><b>Vårdnadshavare</b>Vid säljare under 18 år</div>
        <div><b>För {{ settings.company_legal_name }}</b>{{ offer.evaluator_name }}</div>
      </div>

      <div class="d-small">{{ settings.company_legal_name }} · {{ settings.company_address }} · {{ settings.company_contact }}</div>
    </article>
  </div>
</template>

<style>
/* Printed document — always light regardless of theme (see docs/DESIGN.md
 * §7). Not scoped: @media print needs to hide the whole app shell, not
 * just this component, so it reaches outside via the plain `body *` rule. */
.doc-stage { margin-top: 20px; overflow-x: auto; }
.doc {
  --d-ink: #1B1E26; --d-muted: #5E636E; --d-line: #D5D6D0; --d-soft: #F4F4F0; --d-accent: #C97A12;
  background: #FFFFFF; color: var(--d-ink); width: 210mm; max-width: 100%; min-height: 297mm; margin: 0 auto;
  padding: 16mm 15mm 14mm; box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 10px 30px rgba(0,0,0,.08); font-size: 10pt; line-height: 1.4;
  font-family: var(--sans);
}
@media (max-width: 820px) { .doc { padding: 20px 16px; min-height: 0; } }
.d-head { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; padding-bottom: 14px; border-bottom: 2px solid var(--d-ink); }
.d-mark { display: flex; gap: 10px; align-items: center; }
.d-mark .name { font-size: 19pt; font-weight: 700; letter-spacing: -.02em; line-height: 1; }
.d-mark .legal { font-size: 8.5pt; color: var(--d-muted); margin-top: 3px; }
.d-title { text-align: right; }
.d-title h1 { font-size: 15pt; margin: 0; font-weight: 700; letter-spacing: -.01em; }
.d-title .meta { font-family: var(--mono); font-size: 8.5pt; color: var(--d-muted); margin-top: 4px; line-height: 1.55; }
.d-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 16px 0 18px; }
.d-parties h3, .d-sec h3 { font-size: 7.5pt; letter-spacing: .1em; text-transform: uppercase; color: var(--d-muted); margin: 0 0 5px; font-weight: 600; }
.d-parties p { margin: 0; font-size: 9.5pt; line-height: 1.5; }
.d-lead { background: var(--d-soft); border-radius: 4px; padding: 10px 12px; font-size: 9.5pt; margin-bottom: 14px; }
table.d-cards { width: 100%; border-collapse: collapse; font-size: 9pt; }
.d-cards th { text-align: left; font-size: 7.5pt; letter-spacing: .08em; text-transform: uppercase; color: var(--d-muted); font-weight: 600; padding: 5px; border-bottom: 1px solid var(--d-ink); }
.d-cards td { padding: 5px; border-bottom: 1px solid var(--d-line); vertical-align: top; }
.d-cards .num { text-align: right; }
.d-cards tr.off td { color: var(--d-muted); text-decoration: line-through; text-decoration-color: #9A9EA6; }
.d-cards tr.off td.keep { text-decoration: none; }
.d-cards .nm { font-weight: 600; }
.d-cards .sub { color: var(--d-muted); font-size: 8pt; }
.d-cond { font-size: 7.5pt; font-weight: 600; border: 1px solid currentColor; border-radius: 99px; padding: 0 6px; white-space: nowrap; }
.d-foot { display: grid; grid-template-columns: 1fr 260px; gap: 22px; margin-top: 14px; align-items: start; }
.d-totals { display: grid; grid-template-columns: 1fr auto; gap: 5px 0; font-size: 9.5pt; }
.d-totals dd { margin: 0; padding-left: 10px; text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; }
.d-totals dt { color: var(--d-muted); }
.d-totals .grand { border-top: 2px solid var(--d-ink); padding-top: 7px; margin-top: 3px; font-weight: 700; color: var(--d-ink); font-size: 11.5pt; }
.d-pay p { margin: 0 0 3px; font-size: 9.5pt; }
.d-sec { margin-top: 18px; }
.d-terms { margin: 0; padding-left: 16px; font-size: 8.5pt; color: #2E323B; columns: 2; column-gap: 22px; }
.d-terms li { margin-bottom: 4px; break-inside: avoid; }
.d-boxes { display: grid; gap: 5px; font-size: 9pt; margin-top: 4px; }
.d-boxes span.box { display: inline-block; width: 10px; height: 10px; border: 1.2px solid var(--d-ink); margin-right: 7px; vertical-align: -1px; text-align: center; font-size: 8px; line-height: 8px; }
.d-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 22px; }
.d-sign div { border-top: 1px solid var(--d-ink); padding-top: 4px; font-size: 8pt; color: var(--d-muted); min-height: 44px; }
.d-sign b { display: block; color: var(--d-ink); font-weight: 600; font-size: 8.5pt; }
.d-small { font-size: 7.5pt; color: var(--d-muted); margin-top: 16px; text-align: center; }
@media (max-width: 640px) {
  .d-parties, .d-foot { grid-template-columns: 1fr; }
  .d-terms { columns: 1; }
  .d-sign { grid-template-columns: 1fr; }
  .d-head { flex-direction: column; }
  .d-title { text-align: left; }
}
@media print {
  @page { size: A4; margin: 0; }
  body * { visibility: hidden; }
  .doc-stage, .doc-stage * { visibility: visible; }
  .doc-stage { position: absolute; top: 0; left: 0; margin: 0; overflow: visible; width: 100%; }
  .doc { box-shadow: none; width: 210mm; min-height: 0; padding: 14mm 14mm 12mm; margin: 0 auto; }
  .d-cards tr { break-inside: avoid; }
  .d-sec, .d-foot { break-inside: avoid; }
}
</style>
