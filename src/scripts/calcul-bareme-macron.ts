/**
 * Barème Macron — indemnité prud’homale, calcul côté client.
 *
 * Lit ../data/bareme-macron.json (intégré au build). Pour un licenciement
 * jugé sans cause réelle et sérieuse, l’article L1235-3 du Code du travail
 * fixe une fourchette (plancher et plafond, en mois de salaire brut) selon
 * l’ancienneté. Le plafond est identique quelle que soit la taille de
 * l’entreprise ; le plancher est réduit dans les entreprises de moins de
 * 11 salariés pour une ancienneté de 0 à 10 ans. Un licenciement nul échappe
 * au barème : plancher de 6 mois, sans plafond.
 *
 * Aucune donnée ne quitte le navigateur : le calcul est entièrement local.
 */
import data from '../data/bareme-macron.json';
import { formatEUR } from '../lib/locale';

const STANDARD = data.standard;
const PETITE = data.petite_entreprise_plancher;
const A_MAX = data.anciennete_max_baremee;
const NUL_PLANCHER = data.licenciement_nul_plancher_mois;
const PLANCHER_COMMUN = STANDARD[STANDARD.length - 1].plancher; // 3 mois dès 2 ans

type Taille = 'grande' | 'petite';

interface Inputs {
  salaire: number;
  annees: number;
  taille: Taille;
  nul: boolean;
}

interface Result {
  ok: boolean;
  raison?: string;
  annees: number;
  nul: boolean;
  plancherMois: number;
  plafondMois: number | null;
  plancherEur: number;
  plafondEur: number | null;
}

/** Ligne du barème standard pour une ancienneté, plafonnée à la dernière ligne. */
function ligneStandard(annees: number) {
  const a = Math.min(annees, A_MAX);
  return STANDARD.find((r) => r.anciennete === a) ?? STANDARD[STANDARD.length - 1];
}

/** Plancher en mois selon la taille de l’entreprise et l’ancienneté. */
function plancherMois(annees: number, taille: Taille): number {
  if (taille === 'petite' && annees <= 10) {
    const row = PETITE.find((r) => r.anciennete === annees);
    if (row) return row.plancher;
  }
  return ligneStandard(annees).plancher;
}

function compute(i: Inputs): Result {
  const base: Result = {
    ok: false,
    annees: i.annees,
    nul: i.nul,
    plancherMois: 0,
    plafondMois: 0,
    plancherEur: 0,
    plafondEur: 0,
  };

  if (i.salaire <= 0) {
    return { ...base, raison: 'Renseignez votre salaire de référence pour estimer la fourchette.' };
  }

  if (i.nul) {
    const plancherEur = Math.round(i.salaire * NUL_PLANCHER * 100) / 100;
    return {
      ...base,
      ok: true,
      plancherMois: NUL_PLANCHER,
      plafondMois: null,
      plancherEur,
      plafondEur: null,
    };
  }

  const plancher = plancherMois(i.annees, i.taille);
  const plafond = ligneStandard(i.annees).plafond;
  return {
    ok: true,
    annees: i.annees,
    nul: false,
    plancherMois: plancher,
    plafondMois: plafond,
    plancherEur: Math.round(i.salaire * plancher * 100) / 100,
    plafondEur: Math.round(i.salaire * plafond * 100) / 100,
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

function tailleVal(): Taille {
  const checked = document.querySelector<HTMLInputElement>('input[name="taille"]:checked');
  return checked?.value === 'petite' ? 'petite' : 'grande';
}

function readInputs(): Inputs {
  return {
    salaire: numVal('salaire-brut'),
    annees: Math.floor(numVal('anciennete-annees')),
    taille: tailleVal(),
    nul: (($('licenciement-nul') as HTMLInputElement | null)?.checked) ?? false,
  };
}

function moisLabel(n: number): string {
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mois`;
}

function render(res: Result): string {
  if (!res.ok) {
    return `
      <div class="rounded-md border-l-4 border-amber-400 bg-amber-50 p-4 text-sm text-slate-700">
        <p>${res.raison ?? ''}</p>
      </div>`;
  }

  if (res.nul) {
    return `
      <p class="text-sm text-slate-600">Licenciement <strong>nul</strong> — le barème ne s’applique pas.</p>
      <div class="mt-4 rounded-lg bg-white p-4 ring-1 ring-indigo-200">
        <p class="text-sm text-slate-600">Indemnité prud’homale minimale</p>
        <p class="mt-1 text-3xl font-extrabold text-indigo-700">au moins ${formatEUR(res.plancherEur)}</p>
        <p class="mt-1 text-xs text-slate-500">soit au minimum ${moisLabel(res.plancherMois)} de salaire brut, sans plafond légal</p>
      </div>`;
  }

  const anneesLabel = res.annees >= A_MAX ? `${A_MAX} ans ou plus` : `${res.annees} an(s)`;
  return `
    <p class="text-sm text-slate-600">Ancienneté retenue : <strong>${anneesLabel}</strong></p>
    <div class="mt-4 rounded-lg bg-white p-4 ring-1 ring-indigo-200">
      <p class="text-sm text-slate-600">Fourchette d’indemnité prud’homale</p>
      <p class="mt-1 text-3xl font-extrabold text-indigo-700">${formatEUR(res.plancherEur)} – ${formatEUR(res.plafondEur ?? 0)}</p>
      <p class="mt-1 text-xs text-slate-500">soit de ${moisLabel(res.plancherMois)} à ${moisLabel(res.plafondMois ?? 0)} de salaire brut</p>
    </div>
    <table class="mt-4 w-full text-sm">
      <tbody>
        <tr class="border-b border-slate-100">
          <td class="py-2 text-slate-600">Plancher (minimum que le juge peut accorder)</td>
          <td class="py-2 text-right font-medium">${moisLabel(res.plancherMois)}</td>
        </tr>
        <tr>
          <td class="py-2 text-slate-600">Plafond (maximum fixé par le barème)</td>
          <td class="py-2 text-right font-medium">${moisLabel(res.plafondMois ?? 0)}</td>
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
  document.querySelectorAll<HTMLInputElement>('#bareme-form input').forEach((el) => {
    // Text inputs fire `input`; radios and the checkbox are caught on `change`.
    el.addEventListener('input', recompute);
    el.addEventListener('change', recompute);
  });
  const btn = document.getElementById('calc-btn');
  if (btn) btn.addEventListener('click', recompute);
  recompute();
}
