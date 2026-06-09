/**
 * Estimation de l'allocation chômage (ARE) après rupture conventionnelle,
 * calcul côté client.
 *
 * Lit ../data/chomage.json (intégré au build). Estime l'allocation journalière
 * et mensuelle à partir d'un salaire mensuel brut, puis la durée maximale
 * d'indemnisation selon l'âge, en intégrant la réforme du 1ᵉʳ septembre 2026
 * (15 mois avant 55 ans, 20,5 mois à partir de 55 ans pour les ruptures
 * conventionnelles individuelles).
 *
 * Estimation indicative : France Travail calcule le SJR sur les salaires
 * réellement perçus et applique des différés. Aucune donnée ne quitte le
 * navigateur — le calcul est entièrement local.
 */
import data from '../data/chomage.json';
import { formatEUR, formatNumber } from '../lib/locale';

const ARE = data.are;
const DUREE = data.reforme_2026.duree_max_mois;

interface Inputs {
  salaire: number;
  age: number;
}

interface Result {
  ok: boolean;
  raison?: string;
  sjr: number;
  areJour: number;
  areMois: number;
  dureeMois: number;
  totalPotentiel: number;
  tauxRemplacement: number;
}

/** Allocation journalière brute : meilleure formule, plancher, plafond 75 % SJR. */
function areJournaliere(sjr: number): number {
  const base = Math.max(ARE.taux_sjr * sjr + ARE.partie_fixe, ARE.taux_plancher_sjr * sjr);
  const avecPlancher = Math.max(base, ARE.allocation_min_journaliere);
  return Math.min(avecPlancher, ARE.plafond_sjr * sjr);
}

function compute(i: Inputs): Result {
  const base: Result = {
    ok: false,
    sjr: 0,
    areJour: 0,
    areMois: 0,
    dureeMois: 0,
    totalPotentiel: 0,
    tauxRemplacement: 0,
  };

  if (i.salaire <= 0) {
    return { ...base, raison: 'Renseignez votre salaire mensuel brut pour estimer l’allocation.' };
  }
  if (i.age <= 0 || i.age > 120) {
    return { ...base, raison: 'Renseignez votre âge à la fin du contrat.' };
  }

  const sjr = (i.salaire * 12) / 365;
  const areJour = Math.round(areJournaliere(sjr) * 100) / 100;
  const areMois = Math.round(areJour * ARE.jours_mois_moyen * 100) / 100;
  const dureeMois = i.age >= 55 ? DUREE['55_ans_et_plus'] : DUREE['moins_55_ans'];
  const totalPotentiel = Math.round(areMois * dureeMois * 100) / 100;
  const tauxRemplacement = (areMois / i.salaire) * 100;

  return {
    ok: true,
    sjr: Math.round(sjr * 100) / 100,
    areJour,
    areMois,
    dureeMois,
    totalPotentiel,
    tauxRemplacement,
  };
}

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function numVal(id: string): number {
  const el = $(id) as HTMLInputElement | null;
  if (!el) return 0;
  const v = el.value.replace(/[^\d,.\-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function readInputs(): Inputs {
  return {
    salaire: numVal('salaire-brut'),
    age: Math.floor(numVal('age')),
  };
}

function moisLabel(n: number): string {
  return `${formatNumber(n, n % 1 === 0 ? 0 : 1)} mois`;
}

function render(res: Result): string {
  if (!res.ok) {
    return `
      <div class="rounded-md border-l-4 border-amber-400 bg-amber-50 p-4 text-sm text-slate-700">
        <p>${res.raison ?? ''}</p>
      </div>`;
  }
  return `
    <div class="rounded-lg bg-white p-4 ring-1 ring-indigo-200">
      <p class="text-sm text-slate-600">Allocation chômage mensuelle estimée</p>
      <p class="mt-1 text-3xl font-extrabold text-indigo-700">${formatEUR(res.areMois)}</p>
      <p class="mt-1 text-xs text-slate-500">soit ${formatEUR(res.areJour)} par jour, environ ${formatNumber(res.tauxRemplacement, 0)} % de votre salaire brut</p>
    </div>
    <table class="mt-4 w-full text-sm">
      <tbody>
        <tr class="border-b border-slate-100">
          <td class="py-2 text-slate-600">Salaire journalier de référence (estimé)</td>
          <td class="py-2 text-right font-medium">${formatEUR(res.sjr)}</td>
        </tr>
        <tr class="border-b border-slate-100">
          <td class="py-2 text-slate-600">Durée maximale d’indemnisation</td>
          <td class="py-2 text-right font-medium">${moisLabel(res.dureeMois)}</td>
        </tr>
        <tr>
          <td class="py-2 font-semibold text-slate-900">Total potentiel sur la période</td>
          <td class="py-2 text-right font-bold">${formatEUR(res.totalPotentiel)}</td>
        </tr>
      </tbody>
    </table>
    <p class="mt-3 text-xs text-slate-500">Durée applicable aux ruptures conventionnelles individuelles à compter du 1ᵉʳ septembre 2026. La durée réelle dépend du nombre de jours travaillés et ne peut pas dépasser ce plafond.</p>`;
}

function recompute(): void {
  const panel = $('result-panel');
  const out = $('result-body');
  const res = compute(readInputs());
  if (!out) return;
  out.innerHTML = render(res);
  if (panel) panel.hidden = false;
}

export function initSimulator(): void {
  document
    .querySelectorAll<HTMLInputElement>('#rupture-form input')
    .forEach((el) => el.addEventListener('input', recompute));
  const btn = document.getElementById('calc-btn');
  if (btn) btn.addEventListener('click', recompute);
  recompute();
}
