#!/usr/bin/env python3
"""
Script d'audit/réorganisation de la banque d'images + mise à jour des URLs.

Ordre d'exécution respecté :
1) Backup du site
2) Nettoyage des noms (ASCII / encodage)
3) Inventaire + map des références
4) Suppression doublons + mise à jour map
5) Classification + déplacement/renommage final
6) Mise à jour URLs dans le code source
7) Rapport final
"""

from __future__ import annotations

import codecs
import hashlib
import os
import re
import shutil
import sys
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple
from urllib.parse import unquote

import chardet
import imagehash
from PIL import Image
from tqdm import tqdm
from unidecode import unidecode

try:
    from transformers import pipeline
except Exception:
    pipeline = None


# =========================================================
# CONFIG
# =========================================================
DRY_RUN = True

# Chemin racine du site
SITE_ROOT = Path("./").resolve()

# Chemin banque image (demandé dans le prompt)
# Si projet Next.js, adaptez souvent en "./public/banqueimage"
BANQUEIMAGE_ROOT = Path("./banqueimage").resolve()

# Seuil de quasi-doublons visuels
PHASH_THRESHOLD = 8

# Score minimum CLIP pour accepter la classe
CLIP_MIN_SCORE = 0.40

EXCLUDED_DIRS = {
    ".git",
    ".next",
    "node_modules",
    "backup_site",
    "dist",
    "build",
    "venv",
    ".venv",
    "__pycache__",
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".tif"}
SOURCE_EXTENSIONS = {
    ".html",
    ".css",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".vue",
    ".php",
    ".twig",
    ".json",
    ".yaml",
    ".yml",
    ".md",
}

CATEGORIES = [
    "ski",
    "surf",
    "plage",
    "portraits",
    "groupes",
    "animation",
    "nature",
    "sport_nautique",
    "architecture",
    "divers",
]

LOG_RENAME = SITE_ROOT / "renommage_encodage.log"
LOG_DUP = SITE_ROOT / "doublons_supprimes.log"
LOG_REORG = SITE_ROOT / "reorganisation.log"
REPORT_FILE = SITE_ROOT / "rapport_final.txt"


# =========================================================
# STRUCTURES
# =========================================================
@dataclass
class ImageRecord:
    path: Path
    canonical: str
    ext: str
    width: int = 0
    height: int = 0
    size_bytes: int = 0
    sha256: str = ""
    phash: Optional[imagehash.ImageHash] = None
    category: str = "divers"


# =========================================================
# UTILITAIRES
# =========================================================
def log_line(log_path: Path, message: str) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as f:
        f.write(message.rstrip("\n") + "\n")


def reset_logs() -> None:
    for p in [LOG_RENAME, LOG_DUP, LOG_REORG, REPORT_FILE]:
        if p.exists() and not DRY_RUN:
            p.unlink()
        elif p.exists() and DRY_RUN:
            log_line(p, "\n===== NOUVEAU DRY-RUN =====")


def normalize_unicode(value: str) -> str:
    return unicodedata.normalize("NFKC", value)


def iter_files(root: Path, allowed_exts: Set[str]) -> Iterable[Path]:
    excluded = {d.lower() for d in EXCLUDED_DIRS}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d.lower() not in excluded]
        base = Path(dirpath)
        for file_name in filenames:
            p = base / file_name
            if p.suffix.lower() in allowed_exts:
                yield p


def slugify_component(component: str, is_file: bool = False) -> str:
    if is_file:
        stem = Path(component).stem
        suffix = Path(component).suffix.lower()

        stem_ascii = unidecode(normalize_unicode(stem)).lower()
        stem_ascii = stem_ascii.replace(" ", "_")
        stem_ascii = re.sub(r"[^a-z0-9_]", "", stem_ascii)
        stem_ascii = re.sub(r"_+", "_", stem_ascii).strip("_")
        if not stem_ascii:
            stem_ascii = "image"

        ext_ascii = unidecode(normalize_unicode(suffix)).lower()
        ext_ascii = re.sub(r"[^a-z0-9.]", "", ext_ascii)
        if not ext_ascii.startswith("."):
            ext_ascii = ".jpg"
        return f"{stem_ascii}{ext_ascii}"

    dir_ascii = unidecode(normalize_unicode(component)).lower()
    dir_ascii = dir_ascii.replace(" ", "_")
    dir_ascii = re.sub(r"[^a-z0-9_]", "", dir_ascii)
    dir_ascii = re.sub(r"_+", "_", dir_ascii).strip("_")
    return dir_ascii or "dossier"


def unique_path(target: Path) -> Path:
    if not target.exists():
        return target
    parent, stem, suffix = target.parent, target.stem, target.suffix
    i = 2
    while True:
        candidate = parent / f"{stem}_{i}{suffix}"
        if not candidate.exists():
            return candidate
        i += 1


def canonical_from_image_path(image_path: Path, banque_root: Path) -> str:
    rel = image_path.relative_to(banque_root).as_posix()
    return f"{banque_root.name}/{rel}"


def lookup_key(path_value: str) -> str:
    v = unquote(path_value)
    v = normalize_unicode(v)
    v = v.replace("\\", "/")
    v = v.split("?", 1)[0].split("#", 1)[0]
    idx = v.lower().find("banqueimage/")
    if idx >= 0:
        v = v[idx:]
    v = re.sub(r"/+", "/", v)
    return v.lstrip("/").lower()


def extract_canonical_from_ref(path_value: str) -> Optional[str]:
    decoded = unquote(path_value)
    decoded = normalize_unicode(decoded)
    decoded = decoded.replace("\\", "/")
    decoded = decoded.split("?", 1)[0].split("#", 1)[0]
    idx = decoded.lower().find("banqueimage/")
    if idx < 0:
        return None
    canonical = re.sub(r"/+", "/", decoded[idx:]).lstrip("/")
    return canonical


def hash_file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def read_text_preserve_encoding(path: Path) -> Tuple[str, str, bool]:
    raw = path.read_bytes()
    has_bom = raw.startswith(codecs.BOM_UTF8)
    detected = chardet.detect(raw)
    encoding = detected.get("encoding") or "utf-8"
    try:
        text = raw.decode(encoding, errors="replace")
    except Exception:
        encoding = "utf-8"
        text = raw.decode("utf-8", errors="replace")
    if has_bom and text.startswith("\ufeff"):
        text = text.lstrip("\ufeff")
    return text, encoding, has_bom


def write_text_preserve_encoding(path: Path, text: str, encoding: str, has_utf8_bom: bool) -> None:
    if DRY_RUN:
        return
    if has_utf8_bom:
        raw = codecs.BOM_UTF8 + text.encode("utf-8", errors="replace")
    else:
        try:
            raw = text.encode(encoding, errors="replace")
        except Exception:
            raw = text.encode("utf-8", errors="replace")
    path.write_bytes(raw)


# =========================================================
# MAP REDIRECTIONS
# =========================================================
class RedirectMap:
    def __init__(self) -> None:
        self._map: Dict[str, str] = {}

    def add(self, old_canonical: str, new_canonical: str) -> None:
        if not old_canonical or not new_canonical:
            return
        if lookup_key(old_canonical) == lookup_key(new_canonical):
            return
        self._map[lookup_key(old_canonical)] = new_canonical

    def resolve(self, canonical: str) -> str:
        current = canonical
        seen = set()
        while True:
            key = lookup_key(current)
            if key in seen:
                break
            seen.add(key)
            nxt = self._map.get(key)
            if not nxt:
                break
            current = nxt
        return current

    def __len__(self) -> int:
        return len(self._map)


# =========================================================
# ÉTAPE 1 — BACKUP
# =========================================================
def build_source_file_list(site_root: Path) -> List[Path]:
    files = list(iter_files(site_root, SOURCE_EXTENSIONS))
    return sorted(set(files))


def create_backup(source_files: List[Path], site_root: Path) -> Path:
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    backup_root = site_root / "backup_site" / timestamp

    if DRY_RUN:
        print(f"[DRY_RUN] Backup simulé: {backup_root}")
        return backup_root

    backup_root.mkdir(parents=True, exist_ok=True)
    for src in tqdm(source_files, desc="Backup initial du site", unit="fichier"):
        rel = src.relative_to(site_root)
        dst = backup_root / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    return backup_root


# =========================================================
# ÉTAPE 2 — NORMALISATION NOMS
# =========================================================
def normalize_banqueimage_names(banque_root: Path, redirects: RedirectMap) -> int:
    if not banque_root.exists():
        raise FileNotFoundError(f"Dossier introuvable: {banque_root}")

    rename_count = 0

    # Fichiers images
    files = [p for p in banque_root.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS]
    for old_path in tqdm(files, desc="Normalisation fichiers", unit="img"):
        new_name = slugify_component(old_path.name, is_file=True)
        if old_path.name == new_name:
            continue
        new_path = old_path.with_name(new_name)
        if new_path.exists() and new_path != old_path:
            new_path = unique_path(new_path)
        redirects.add(canonical_from_image_path(old_path, banque_root), canonical_from_image_path(new_path, banque_root))
        log_line(LOG_RENAME, f"FICHIER: {old_path} -> {new_path}")
        if not DRY_RUN:
            old_path.rename(new_path)
        rename_count += 1

    # Dossiers (profondeur descendante)
    dirs = [p for p in banque_root.rglob("*") if p.is_dir()]
    dirs.sort(key=lambda p: len(p.parts), reverse=True)
    for old_dir in tqdm(dirs, desc="Normalisation dossiers", unit="dir"):
        if old_dir == banque_root:
            continue
        new_name = slugify_component(old_dir.name, is_file=False)
        if old_dir.name == new_name:
            continue
        new_dir = old_dir.with_name(new_name)
        if new_dir.exists() and new_dir != old_dir:
            new_dir = unique_path(new_dir)

        # MAJ map pour tous les fichiers sous ce dossier
        old_imgs = [p for p in old_dir.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS]
        for old_img in old_imgs:
            rel = old_img.relative_to(old_dir)
            new_img = new_dir / rel
            redirects.add(canonical_from_image_path(old_img, banque_root), canonical_from_image_path(new_img, banque_root))

        log_line(LOG_RENAME, f"DOSSIER: {old_dir} -> {new_dir}")
        if not DRY_RUN:
            old_dir.rename(new_dir)
        rename_count += 1

    return rename_count


# =========================================================
# ÉTAPE 3 — INVENTAIRE
# =========================================================
REF_PATTERN = re.compile(
    r"(?P<path>(?:\.\./|\./|/)?(?:public/)?banqueimage/[^\s\"'`)<>{}]+)",
    flags=re.IGNORECASE,
)


def inventory_images(banque_root: Path) -> List[Path]:
    return sorted([p for p in banque_root.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS])


def inventory_references(source_files: List[Path], site_root: Path) -> Dict[str, List[str]]:
    refs: Dict[str, List[str]] = defaultdict(list)
    for src in tqdm(source_files, desc="Inventaire refs", unit="fichier"):
        try:
            text, _, _ = read_text_preserve_encoding(src)
        except Exception as exc:
            log_line(LOG_REORG, f"[WARN] Lecture impossible {src}: {exc}")
            continue
        rel_src = src.relative_to(site_root).as_posix()
        for i, line in enumerate(text.splitlines(), start=1):
            for m in REF_PATTERN.finditer(line):
                raw = m.group("path")
                canonical = extract_canonical_from_ref(raw)
                if canonical:
                    refs[canonical].append(f"{rel_src}:{i}")
    return refs


# =========================================================
# ÉTAPE 4 — DOUBLONS
# =========================================================
def build_image_records(image_paths: List[Path], banque_root: Path) -> List[ImageRecord]:
    records: List[ImageRecord] = []
    for img_path in tqdm(image_paths, desc="Analyse metadata", unit="img"):
        rec = ImageRecord(
            path=img_path,
            canonical=canonical_from_image_path(img_path, banque_root),
            ext=img_path.suffix.lower(),
            size_bytes=img_path.stat().st_size if img_path.exists() else 0,
        )
        try:
            rec.sha256 = hash_file_sha256(img_path)
        except Exception as exc:
            log_line(LOG_REORG, f"[WARN] Hash impossible {img_path}: {exc}")
        try:
            with Image.open(img_path) as im:
                rec.width, rec.height = im.size
                rec.phash = imagehash.phash(im)
        except Exception as exc:
            log_line(LOG_REORG, f"[WARN] Image corrompue/non lisible {img_path}: {exc}")
        records.append(rec)
    return records


def choose_best_record(records: List[ImageRecord]) -> ImageRecord:
    return sorted(records, key=lambda r: (r.width * r.height, r.size_bytes, -len(r.path.as_posix())), reverse=True)[0]


def remove_exact_duplicates(records: List[ImageRecord], redirects: RedirectMap) -> Tuple[List[ImageRecord], int]:
    grouped: Dict[str, List[ImageRecord]] = defaultdict(list)
    for rec in records:
        grouped[rec.sha256].append(rec)

    removed = 0
    keep_paths: Set[Path] = set()

    for sha, group in grouped.items():
        if not sha or len(group) <= 1:
            keep_paths.update(r.path for r in group)
            continue
        best = choose_best_record(group)
        keep_paths.add(best.path)
        for rec in group:
            if rec.path == best.path:
                continue
            redirects.add(rec.canonical, best.canonical)
            log_line(LOG_DUP, f"SUPPRIMÉ: {rec.canonical} -> REMPLACÉ PAR: {best.canonical} (doublon exact SHA256={sha})")
            if not DRY_RUN:
                try:
                    rec.path.unlink(missing_ok=True)
                except Exception as exc:
                    log_line(LOG_REORG, f"[WARN] Suppression impossible {rec.path}: {exc}")
            removed += 1

    return [r for r in records if r.path in keep_paths], removed


class UnionFind:
    def __init__(self, n: int) -> None:
        self.p = list(range(n))
        self.r = [0] * n

    def find(self, x: int) -> int:
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return
        if self.r[ra] < self.r[rb]:
            self.p[ra] = rb
        elif self.r[ra] > self.r[rb]:
            self.p[rb] = ra
        else:
            self.p[rb] = ra
            self.r[ra] += 1


def remove_near_duplicates(records: List[ImageRecord], redirects: RedirectMap, threshold: int) -> Tuple[List[ImageRecord], int]:
    valid = [r for r in records if r.phash is not None]
    if len(valid) < 2:
        return records, 0

    uf = UnionFind(len(valid))

    for i in tqdm(range(len(valid)), desc="Quasi-doublons pHash", unit="img"):
        hi = valid[i].phash
        if hi is None:
            continue
        for j in range(i + 1, len(valid)):
            hj = valid[j].phash
            if hj is None:
                continue
            try:
                dist = hi - hj
            except Exception:
                continue
            if dist <= threshold:
                uf.union(i, j)

    groups: Dict[int, List[ImageRecord]] = defaultdict(list)
    for idx, rec in enumerate(valid):
        groups[uf.find(idx)].append(rec)

    to_remove: Set[Path] = set()
    removed = 0

    for group in groups.values():
        if len(group) <= 1:
            continue
        best = choose_best_record(group)
        for rec in group:
            if rec.path == best.path or rec.path in to_remove:
                continue
            to_remove.add(rec.path)
            redirects.add(rec.canonical, best.canonical)
            log_line(LOG_DUP, f"SUPPRIMÉ: {rec.canonical} -> REMPLACÉ PAR: {best.canonical} (quasi-doublon pHash)")
            if not DRY_RUN:
                try:
                    rec.path.unlink(missing_ok=True)
                except Exception as exc:
                    log_line(LOG_REORG, f"[WARN] Suppression impossible {rec.path}: {exc}")
            removed += 1

    return [r for r in records if r.path not in to_remove], removed


# =========================================================
# ÉTAPE 5 — CLASSIFICATION + RÉORGANISATION
# =========================================================
CLIP_LABELS = {
    "ski": "skiing or snowboarding on snowy mountain",
    "surf": "surfing on ocean waves",
    "plage": "beach with sand and calm sea",
    "portraits": "close-up portrait of one person",
    "groupes": "group photo with multiple people",
    "animation": "camp activity workshop or team game",
    "nature": "natural landscape forest mountain or wildlife",
    "sport_nautique": "water sport like kayak sailing diving",
    "architecture": "building architecture hostel or infrastructure",
}

FALLBACK_KEYWORDS = {
    "ski": ["ski", "snow", "neige", "piste", "snowboard", "montagne_neige"],
    "surf": ["surf", "vague", "waves", "board", "ocean"],
    "plage": ["plage", "beach", "sable", "sea", "sunset"],
    "portraits": ["portrait", "visage", "face", "headshot", "selfie"],
    "groupes": ["groupe", "group", "team", "famille", "crew"],
    "animation": ["atelier", "animation", "jeu", "camp", "activity", "workshop"],
    "nature": ["nature", "forest", "forêt", "paysage", "landscape", "faune", "flore"],
    "sport_nautique": ["kayak", "voile", "sailing", "plongee", "plongée", "canoe", "jet"],
    "architecture": ["batiment", "bâtiment", "hotel", "hostel", "building", "maison", "centre"],
}


def load_clip_classifier():
    if pipeline is None:
        log_line(LOG_REORG, "[WARN] transformers indisponible, fallback règles uniquement.")
        return None
    try:
        return pipeline("zero-shot-image-classification", model="openai/clip-vit-base-patch32")
    except Exception as exc:
        log_line(LOG_REORG, f"[WARN] CLIP indisponible: {exc}")
        return None


def fallback_category_from_name_exif(img_path: Path) -> str:
    haystack = unidecode(normalize_unicode(img_path.as_posix())).lower()
    try:
        with Image.open(img_path) as im:
            exif = im.getexif()
            if exif:
                exif_text = " ".join(str(v) for v in exif.values() if isinstance(v, (str, int, float)))
                haystack += " " + unidecode(normalize_unicode(exif_text)).lower()
    except Exception:
        pass
    for cat, kws in FALLBACK_KEYWORDS.items():
        if any(k in haystack for k in kws):
            return cat
    return "divers"


def classify_image(img_path: Path, clip_model) -> str:
    if clip_model is not None:
        try:
            labels = list(CLIP_LABELS.values())
            preds = clip_model(images=str(img_path), candidate_labels=labels)
            if preds:
                best = preds[0]
                score = float(best.get("score", 0.0))
                label = best.get("label", "")
                if score >= CLIP_MIN_SCORE:
                    for cat, lbl in CLIP_LABELS.items():
                        if lbl == label:
                            return cat
        except Exception as exc:
            log_line(LOG_REORG, f"[WARN] CLIP erreur sur {img_path}: {exc}")
    return fallback_category_from_name_exif(img_path)


def collect_used_indices(category_dir: Path, category: str) -> Set[int]:
    used = set()
    rx = re.compile(rf"^{re.escape(category)}_(\d{{3}})\.[a-z0-9]+$", re.IGNORECASE)
    if not category_dir.exists():
        return used
    for p in category_dir.iterdir():
        if not p.is_file():
            continue
        m = rx.match(p.name)
        if m:
            used.add(int(m.group(1)))
    return used


def next_free_index(used: Set[int]) -> int:
    i = 1
    while i in used:
        i += 1
    used.add(i)
    return i


def reorganize_by_category(records: List[ImageRecord], banque_root: Path, redirects: RedirectMap) -> Dict[str, int]:
    category_counts = {cat: 0 for cat in CATEGORIES}
    for cat in CATEGORIES:
        if not DRY_RUN:
            (banque_root / cat).mkdir(parents=True, exist_ok=True)

    clip_model = load_clip_classifier()
    used_indices = {cat: collect_used_indices(banque_root / cat, cat) for cat in CATEGORIES}

    for rec in tqdm(records, desc="Classification + réorganisation", unit="img"):
        if not DRY_RUN and not rec.path.exists():
            continue

        category = classify_image(rec.path, clip_model)
        if category not in CATEGORIES:
            category = "divers"
        rec.category = category

        target_dir = banque_root / category
        current_name_ok = re.fullmatch(rf"{re.escape(category)}_\d{{3}}\.[a-z0-9]+", rec.path.name, flags=re.IGNORECASE)

        if rec.path.parent == target_dir and current_name_ok:
            category_counts[category] += 1
            continue

        ext = rec.path.suffix.lower()
        idx = next_free_index(used_indices[category])
        target_path = target_dir / f"{category}_{idx:03d}{ext}"
        while target_path.exists() and target_path != rec.path:
            idx = next_free_index(used_indices[category])
            target_path = target_dir / f"{category}_{idx:03d}{ext}"

        old_c = canonical_from_image_path(rec.path, banque_root)
        new_c = canonical_from_image_path(target_path, banque_root)
        redirects.add(old_c, new_c)
        log_line(LOG_REORG, f"MOVE: {rec.path} -> {target_path} (cat={category})")

        if not DRY_RUN:
            target_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                shutil.move(str(rec.path), str(target_path))
            except Exception as exc:
                log_line(LOG_REORG, f"[WARN] Move impossible {rec.path} -> {target_path}: {exc}")

        rec.path = target_path
        rec.canonical = new_c
        category_counts[category] += 1

    # Supprime les anciens dossiers vides
    dirs = [p for p in banque_root.rglob("*") if p.is_dir()]
    dirs.sort(key=lambda p: len(p.parts), reverse=True)
    protected = {banque_root, *(banque_root / c for c in CATEGORIES)}
    for d in dirs:
        if d in protected:
            continue
        try:
            if not any(d.iterdir()):
                log_line(LOG_REORG, f"RMDIR: {d}")
                if not DRY_RUN:
                    d.rmdir()
        except Exception:
            pass

    return category_counts


# =========================================================
# ÉTAPE 6 — MISE À JOUR URLS CODE SOURCE
# =========================================================
def build_existing_image_lookup(image_paths: List[Path], banque_root: Path) -> Dict[str, str]:
    out = {}
    for p in image_paths:
        c = canonical_from_image_path(p, banque_root)
        out[lookup_key(c)] = c
    return out


def replace_refs_in_text(
    text: str,
    redirects: RedirectMap,
    existing_lookup: Dict[str, str],
    missing_refs: Set[str],
) -> Tuple[str, int]:
    replaced = 0

    def _repl(match: re.Match) -> str:
        nonlocal replaced
        token = match.group("path")
        m = re.match(r"^(.*?)([?#].*)?$", token)
        base = m.group(1) if m else token
        suffix = m.group(2) if m and m.group(2) else ""

        canonical = extract_canonical_from_ref(base)
        if not canonical:
            return token

        resolved = redirects.resolve(canonical)
        if lookup_key(canonical) == lookup_key(resolved):
            # Pas de redirection, garder tel quel
            if lookup_key(canonical) not in existing_lookup:
                missing_refs.add(canonical)
            return token

        idx = re.search(r"banqueimage/", base, flags=re.IGNORECASE)
        if not idx:
            return token
        prefix = base[: idx.start()]
        new_token = f"{prefix}{resolved}{suffix}"
        if new_token != token:
            replaced += 1
        return new_token

    return REF_PATTERN.sub(_repl, text), replaced


def update_source_urls(
    source_files: List[Path],
    redirects: RedirectMap,
    existing_lookup: Dict[str, str],
    site_root: Path,
) -> Tuple[int, int, Set[str]]:
    files_updated = 0
    replacements = 0
    missing_refs: Set[str] = set()

    for src in tqdm(source_files, desc="Mise à jour URLs", unit="fichier"):
        try:
            text, enc, has_bom = read_text_preserve_encoding(src)
        except Exception as exc:
            log_line(LOG_REORG, f"[WARN] Lecture impossible {src}: {exc}")
            continue

        new_text, count = replace_refs_in_text(text, redirects, existing_lookup, missing_refs)
        if count <= 0:
            continue

        files_updated += 1
        replacements += count
        log_line(LOG_REORG, f"UPDATE: {src.relative_to(site_root).as_posix()} ({count} remplacement(s))")
        write_text_preserve_encoding(src, new_text, enc, has_bom)

    return files_updated, replacements, missing_refs


# =========================================================
# ÉTAPE 7 — RAPPORT FINAL
# =========================================================
def write_report(
    backup_dir: Path,
    images_before: int,
    images_after: int,
    removed_exact: int,
    removed_near: int,
    files_updated: int,
    replacements: int,
    category_counts: Dict[str, int],
    divers_images: List[str],
    missing_refs: Set[str],
) -> None:
    total_after = max(images_after, 1)

    lines: List[str] = []
    lines.append("=== Rapport final banqueimage ===")
    lines.append(f"Date: {datetime.now().isoformat(timespec='seconds')}")
    lines.append("")
    lines.append(f"Images avant: {images_before}")
    lines.append(f"Images après: {images_after}")
    lines.append(f"Doublons supprimés (exacts): {removed_exact}")
    lines.append(f"Doublons supprimés (quasi): {removed_near}")
    lines.append(f"Total doublons supprimés: {removed_exact + removed_near}")
    lines.append("")
    lines.append(f"Fichiers source mis à jour: {files_updated}")
    lines.append(f"Lignes/références modifiées: {replacements}")
    lines.append("")
    lines.append("Répartition par catégorie:")
    for cat in CATEGORIES:
        count = category_counts.get(cat, 0)
        pct = (count / total_after) * 100
        lines.append(f"- {cat}: {count} ({pct:.1f}%)")
    lines.append("")
    lines.append("⚠️ Images dans divers/ (à vérifier manuellement):")
    if divers_images:
        for p in divers_images:
            lines.append(f"- {p}")
    else:
        lines.append("- Aucune")
    lines.append("")
    lines.append("⚠️ Références introuvables dans la MAP:")
    if missing_refs:
        for ref in sorted(missing_refs):
            lines.append(f"- {ref}")
    else:
        lines.append("- Aucune")
    lines.append("")
    lines.append(f"Backup: {backup_dir.resolve()}")
    lines.append(f"DRY_RUN: {DRY_RUN}")

    content = "\n".join(lines) + "\n"
    REPORT_FILE.write_text(content, encoding="utf-8")
    if DRY_RUN:
        try:
            print("\n" + content)
        except UnicodeEncodeError:
            safe = content.encode(sys.stdout.encoding or "utf-8", errors="replace").decode(
                sys.stdout.encoding or "utf-8",
                errors="replace",
            )
            print("\n" + safe)


# =========================================================
# MAIN
# =========================================================
def main() -> int:
    reset_logs()

    print("=== Réorganisation banqueimage + update URLs ===")
    print(f"SITE_ROOT        : {SITE_ROOT}")
    print(f"BANQUEIMAGE_ROOT : {BANQUEIMAGE_ROOT}")
    print(f"DRY_RUN          : {DRY_RUN}")

    if not BANQUEIMAGE_ROOT.exists():
        print(f"[ERREUR] BANQUEIMAGE_ROOT introuvable: {BANQUEIMAGE_ROOT}")
        print("Astuce: dans ce repo Next.js, essayez './public/banqueimage'.")
        return 1

    redirects = RedirectMap()

    # 1) Backup
    source_files = build_source_file_list(SITE_ROOT)
    backup_dir = create_backup(source_files, SITE_ROOT)

    # 2) Nettoyage encodage / noms
    rename_count = normalize_banqueimage_names(BANQUEIMAGE_ROOT, redirects)
    print(f"Renommages effectués: {rename_count}")

    # 3) Inventaire + MAP
    images_before = inventory_images(BANQUEIMAGE_ROOT)
    refs_map = inventory_references(source_files, SITE_ROOT)
    print(f"Images inventoriées: {len(images_before)}")
    print(f"Fichiers source concernés: {len(source_files)}")
    print(f"Entrées MAP refs: {len(refs_map)}")

    # 4) Doublons
    records = build_image_records(images_before, BANQUEIMAGE_ROOT)
    records, removed_exact = remove_exact_duplicates(records, redirects)
    records = [r for r in records if r.path.exists() or DRY_RUN]
    records, removed_near = remove_near_duplicates(records, redirects, PHASH_THRESHOLD)

    # 5) Classification + déplacement
    category_counts = reorganize_by_category(records, BANQUEIMAGE_ROOT, redirects)
    images_after = inventory_images(BANQUEIMAGE_ROOT)
    existing_lookup = build_existing_image_lookup(images_after, BANQUEIMAGE_ROOT)

    # 6) Mise à jour URLs
    files_updated, replacements, missing_refs = update_source_urls(
        source_files=source_files,
        redirects=redirects,
        existing_lookup=existing_lookup,
        site_root=SITE_ROOT,
    )

    # Divers list
    divers_images: List[str] = []
    divers_dir = BANQUEIMAGE_ROOT / "divers"
    if divers_dir.exists():
        divers_images = [
            canonical_from_image_path(p, BANQUEIMAGE_ROOT)
            for p in sorted(divers_dir.glob("*"))
            if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
        ]

    # 7) Rapport final
    write_report(
        backup_dir=backup_dir,
        images_before=len(images_before),
        images_after=len(images_after),
        removed_exact=removed_exact,
        removed_near=removed_near,
        files_updated=files_updated,
        replacements=replacements,
        category_counts=category_counts,
        divers_images=divers_images,
        missing_refs=missing_refs,
    )

    print("Terminé.")
    print(f"- Redirects cumulés: {len(redirects)}")
    print(f"- Doublons supprimés: {removed_exact + removed_near}")
    print(f"- Fichiers source modifiés: {files_updated}")
    print(f"- Rapport: {REPORT_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
