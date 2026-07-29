"""Veille sur les paramètres d'indemnisation chômage (§3.4 point 4 du plan).

Contrairement à ``cdtn_watch``, qui hache des fichiers YAML bruts et stables,
les sources utiles ici sont des pages HTML publiques dont le balisage bouge en
permanence. Un hash de page entière alerterait à chaque refonte de template,
donc à chaque fois pour rien, et finirait ignoré.

La veille porte donc sur les **valeurs**, pas sur le document, et remplit deux
rôles distincts :

1. *Régression* — chaque constante ARE citée par le site doit rester présente
   sur au moins une source officielle. Une constante qui disparaît des deux
   sources signale une revalorisation : ``chomage.json`` est à revoir.

2. *Arrivée* — les durées d'indemnisation issues de la réforme du 1ᵉʳ septembre
   2026 sont aujourd'hui absentes des fiches, qui décrivent encore le régime en
   vigueur. Leur apparition signale que la documentation officielle a rattrapé
   la réforme, moment où les pages « avant/après » du site doivent être relues.

Les valeurs attendues sont lues dans ``src/data/chomage.json`` plutôt que
recopiées ici : la veille ne peut donc pas diverger silencieusement de ce que
le site affiche réellement.
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

import requests

from ..settings import load
from .base import BaseScraper

REPO_ROOT = Path(__file__).resolve().parents[3]
CHOMAGE_JSON = REPO_ROOT / "src" / "data" / "chomage.json"

SOURCES = {
    "unedic_are": (
        "https://www.unedic.org/la-reglementation/fiches-thematiques/"
        "allocation-d-aide-au-retour-a-l-emploi-are"
    ),
    "service_public_are": "https://www.service-public.gouv.fr/particuliers/vosdroits/F14860",
}

_SCRIPTS = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.S | re.I)
_TAGS = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")

# Motifs indiquant que les durées de la réforme sont entrées dans la doc
# officielle. Volontairement larges : on veut être prévenu, pas filtrer.
ARRIVEE_REFORME = {
    "duree_15_mois": r"\b15\s*mois\b",
    "duree_20_5_mois": r"\b20,5\s*mois\b",
}


def _to_text(html: str) -> str:
    """HTML -> texte brut normalisé, espaces insécables compris."""
    s = _SCRIPTS.sub(" ", html)
    s = _TAGS.sub(" ", s)
    s = unicodedata.normalize("NFKC", s)
    s = s.replace(" ", " ").replace(" ", " ").replace(" ", " ")
    return _SPACE.sub(" ", s)


def _fr(value: float) -> str:
    """12.31 -> '12,31' ; 57.0 -> '57'. Format tel qu'écrit dans les sources."""
    txt = f"{value:.2f}".rstrip("0").rstrip(".")
    return txt.replace(".", ",")


def _attendus() -> dict[str, str]:
    """Constantes ARE du site, converties en motifs de recherche."""
    are = json.loads(CHOMAGE_JSON.read_text(encoding="utf-8"))["are"]
    montant = lambda v: rf"{re.escape(_fr(v))}\s*(?:€|EUR)?"  # noqa: E731
    pourcent = lambda v: rf"{re.escape(_fr(v * 100))}\s*%"  # noqa: E731
    return {
        "partie_fixe": montant(are["partie_fixe"]),
        "allocation_min_journaliere": montant(are["allocation_min_journaliere"]),
        "taux_sjr": pourcent(are["taux_sjr"]),
        "taux_plancher_sjr": pourcent(are["taux_plancher_sjr"]),
        "plafond_sjr": pourcent(are["plafond_sjr"]),
    }


class ReformeWatchScraper(BaseScraper):
    source_name = "reforme_watch"

    def fetch(self) -> dict[str, Any]:
        settings = load()
        headers = {"User-Agent": settings.user_agent}
        textes: dict[str, str] = {}
        for key, url in SOURCES.items():
            r = requests.get(url, headers=headers, timeout=45)
            r.raise_for_status()
            textes[key] = _to_text(r.text)
            self.log.info("%s: %d caractères de texte", key, len(textes[key]))

        attendus = _attendus()
        constantes: dict[str, list[str]] = {}
        for nom, motif in attendus.items():
            presentes = [k for k, txt in textes.items() if re.search(motif, txt)]
            constantes[nom] = presentes
            self.log.info(
                "constante %-28s %s", nom, ", ".join(presentes) if presentes else "ABSENTE PARTOUT"
            )

        reforme: dict[str, list[str]] = {}
        for nom, motif in ARRIVEE_REFORME.items():
            presentes = [k for k, txt in textes.items() if re.search(motif, txt, re.I)]
            reforme[nom] = presentes
            if presentes:
                self.log.info("réforme %s désormais citée par: %s", nom, ", ".join(presentes))

        return {"constantes": constantes, "reforme": reforme}

    def write(self, raw: dict[str, Any]) -> tuple[int, str]:
        disparues = [nom for nom, srcs in raw["constantes"].items() if not srcs]
        arrivees = [nom for nom, srcs in raw["reforme"].items() if srcs]

        # Empreinte stable de l'état observé : sert de mémoire entre deux runs,
        # pour n'alerter qu'au changement et pas à chaque passage.
        etat = json.dumps(
            {
                "constantes": {k: sorted(v) for k, v in raw["constantes"].items()},
                "reforme": {k: sorted(v) for k, v in raw["reforme"].items()},
            },
            sort_keys=True,
            ensure_ascii=False,
        )
        empreinte = hashlib.sha256(etat.encode("utf-8")).hexdigest()
        # Lisible tel quel dans un psql, sans avoir à décoder un hash.
        resume = (
            f"{len(raw['constantes']) - len(disparues)}/{len(raw['constantes'])} constantes ARE "
            f"confirmées ; réforme citée : "
            f"{', '.join(arrivees) if arrivees else 'pas encore'}"
        )

        with self.conn.cursor() as cur:
            cur.execute("SELECT last_hash FROM source_hashes WHERE source = %s", (self.source_name,))
            row = cur.fetchone()
            precedent = row[0] if row else None
            cur.execute(
                """
                INSERT INTO source_hashes (source, source_url, last_hash, last_checked, content_snippet)
                VALUES (%s, %s, %s, now(), %s)
                ON CONFLICT (source) DO UPDATE
                   SET last_hash = EXCLUDED.last_hash,
                       last_checked = now(),
                       last_changed = CASE
                           WHEN source_hashes.last_hash IS DISTINCT FROM EXCLUDED.last_hash
                           THEN now() ELSE source_hashes.last_changed END,
                       content_snippet = EXCLUDED.content_snippet
                """,
                (self.source_name, SOURCES["unedic_are"], empreinte, resume),
            )
        self.conn.commit()

        inchange = precedent == empreinte
        if inchange:
            return (len(raw["constantes"]), "no_change")

        alertes: list[str] = []
        if disparues:
            alertes.append(
                "constantes ARE introuvables sur les sources officielles ("
                + ", ".join(disparues)
                + ") — probable revalorisation, revoir src/data/chomage.json"
            )
        if arrivees:
            alertes.append(
                "durées de la réforme désormais citées par les sources ("
                + ", ".join(arrivees)
                + ") — relire les pages rupture conventionnelle et le simulateur"
            )
        if alertes:
            # Le nouvel état est déjà enregistré : la prochaine exécution
            # repartira de cette base et ne réalertera pas.
            raise RuntimeError("SOURCE_CHANGED: " + " | ".join(alertes))

        return (len(raw["constantes"]), "success")
