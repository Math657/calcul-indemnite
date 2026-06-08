/**
 * Indemnité légale de licenciement — client-side computation.
 *
 * Reads ../data/indemnite-licenciement.json (bundled at build). Applies the
 * Code du travail formula (art. R1234-2): a quarter of a month of salary per
 * year of seniority up to 10 years, a third per year beyond 10 years, with a
 * pro-rata on incomplete years. Right opens at 8 months of seniority
 * (art. L1234-9).
 *
 * No PII leaves the browser — computation is entirely client-side. The user
 * enters their own salaire de référence; nothing is sent to a server.
 */
import data from '../data/indemnite-licenciement.json';
import { formatEUR } from '../lib/locale';

const SEUIL_MOIS = data.anciennete_minimale_mois;
const T1 = data.taux.jusqua_10_ans;
const T2 = data.taux.au_dela_10_ans;

interface Inputs {
  salaireRef: number;
  annees: number;
  mois: number;
}

interface Result {
  eligible: boolean;
  raison?: string;
  ancienneteDecimale: number;
  moisJusqua10: number;
  moisAuDela: number;
  totalMois: number;
  indemnite: number;
}

function compute(i: Inputs): Result {
  const ancienneteMois = i.annees * 12 + i.mois;
  const A = ancienneteMois / 12;
  const base: Result = {
    eligible: false,
    ancienneteDecimale: A,
    moisJusqua10: 0,
    moisAuDela: 0,
    totalMois: 0,
    indemnite: 0,
  };

  if (i.salaireRef <= 0 || ancienneteMois <= 0) {
    return { ...base, raison: 'Renseignez votre salaire de référence et votre ancienneté.' };
  }
  if (ancienneteMois < SEUIL_MOIS) {
    return {
      ...base,
      raison: `L’indemnité légale suppose au moins ${SEUIL_MOIS} mois d’ancienneté ininterrompue. Votre convention collective peut prévoir une indemnité plus favorable, sans condition de durée.`,
    };
  }

  const moisJusqua10 = T1 * Math.min(A, 10);
  const moisAuDela = T2 * Math.max(A - 10, 0);
  const totalMois = moisJusqua10 + moisAuDela;
  const indemnite = Math.round(i.salaireRef * totalMois * 100) / 100;

  return {
    eligible: true,
    ancienneteDecimale: A,
    moisJusqua10,
    moisAuDela,
    totalMois,
    indemnite,
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
    salaireRef: numVal('salaire-ref'),
    annees: Math.floor(numVal('anciennete-annees')),
    mois: Math.floor(numVal('anciennete-mois')),
  };
}

function moisLabel(n: number): string {
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mois`;
}

function render(res: Result): string {
  if (!res.eligible) {
    return `
      <div class="rounded-md border-l-4 border-amber-400 bg-amber-50 p-4 text-sm text-slate-700">
        <p>${res.raison ?? ''}</p>
      </div>`;
  }
  const anneesEntieres = Math.floor(res.ancienneteDecimale);
  const moisRestants = Math.round((res.ancienneteDecimale - anneesEntieres) * 12);
  return `
    <p class="text-sm text-slate-600">Ancienneté retenue : <strong>${anneesEntieres} an(s) et ${moisRestants} mois</strong></p>
    <div class="mt-4 rounded-lg bg-white p-4 ring-1 ring-indigo-200">
      <p class="text-sm text-slate-600">Indemnité légale de licenciement estimée</p>
      <p class="mt-1 text-3xl font-extrabold text-indigo-700">${formatEUR(res.indemnite)}</p>
      <p class="mt-1 text-xs text-slate-500">soit ${moisLabel(res.totalMois)} de salaire de référence</p>
    </div>
    <table class="mt-4 w-full text-sm">
      <tbody>
        <tr class="border-b border-slate-100">
          <td class="py-2 text-slate-600">Années jusqu’à 10 ans (¼ de mois / an)</td>
          <td class="py-2 text-right font-medium">${moisLabel(res.moisJusqua10)}</td>
        </tr>
        <tr class="border-b border-slate-100">
          <td class="py-2 text-slate-600">Années au-delà de 10 ans (⅓ de mois / an)</td>
          <td class="py-2 text-right font-medium">${moisLabel(res.moisAuDela)}</td>
        </tr>
        <tr>
          <td class="py-2 font-semibold text-slate-900">Total en mois de salaire</td>
          <td class="py-2 text-right font-bold">${moisLabel(res.totalMois)}</td>
        </tr>
      </tbody>
    </table>`;
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
    .querySelectorAll<HTMLInputElement>('#indemnite-form input')
    .forEach((el) => el.addEventListener('input', recompute));
  recompute();
}
