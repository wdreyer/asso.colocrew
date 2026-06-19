import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const runtime = "nodejs";

const DEFAULT_WORKBOOK = "c:/Users/dreye/Downloads/Feuille de calcul sans titre.xlsx";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const useDefault = String(formData.get("useDefault") || "") === "true";

    let workbookPath = DEFAULT_WORKBOOK;
    let tempPath = "";

    if (file && file.name) {
      const bytes = Buffer.from(await file.arrayBuffer());
      tempPath = path.join(os.tmpdir(), `acompte-18-juin-${Date.now()}.xlsx`);
      fs.writeFileSync(tempPath, bytes);
      workbookPath = tempPath;
    } else if (!useDefault) {
      return Response.json({ error: "Fichier XLSX manquant" }, { status: 400 });
    }

    if (!fs.existsSync(workbookPath)) {
      return Response.json({ error: `Fichier introuvable: ${workbookPath}` }, { status: 404 });
    }

    const result = parseWorkbook(workbookPath);
    if (tempPath) fs.rmSync(tempPath, { force: true });

    return Response.json(result);
  } catch (error) {
    console.error("Erreur parse acompte 18 juin:", error);
    return Response.json({ error: error.message || "Erreur serveur" }, { status: 500 });
  }
}

function parseWorkbook(workbookPath) {
  const extraction = spawnSync("python", ["-c", String.raw`
import json, openpyxl, sys
from datetime import datetime, date
sys.stdout.reconfigure(encoding="utf-8")
path = sys.argv[1]
wb = openpyxl.load_workbook(path, data_only=True)
ws = wb[wb.sheetnames[0]]
raw_headers = [str(ws.cell(1, col).value or "").strip() for col in range(1, ws.max_column + 1)]
headers = []
seen = {}
for header in raw_headers:
    key = header
    if key == "transport":
        seen[key] = seen.get(key, 0) + 1
        key = "transport montant" if seen[key] == 1 else "transport ville"
    elif key:
        seen[key] = seen.get(key, 0) + 1
        if seen[key] > 1:
            key = f"{key} {seen[key]}"
    headers.append(key)
rows = []
for row in range(2, ws.max_row + 1):
    item = {"excelRow": row}
    empty = True
    for col, header in enumerate(headers, start=1):
        value = ws.cell(row, col).value
        if value not in (None, ""):
            empty = False
        if isinstance(value, (datetime, date)):
            value = value.isoformat()
        item[header] = value
    if not empty:
        rows.append(item)
print(json.dumps({"sheet": ws.title, "headers": headers, "rows": rows}, ensure_ascii=False))
`, workbookPath], {
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });

  if (extraction.status !== 0) {
    throw new Error(extraction.stderr || "Impossible de lire le fichier Excel.");
  }

  const payload = JSON.parse(extraction.stdout);
  const families = rowsToFamilies(payload.rows);
  return {
    source: workbookPath,
    sheet: payload.sheet,
    rows: payload.rows.length,
    families,
    summary: summarizeFamilies(families),
  };
}

function rowsToFamilies(rows) {
  const families = [];
  let current = null;

  for (const row of rows) {
    const stayPrice = hasValue(row["prix séjour"]) ? amount(row["prix séjour"]) : null;
    const total = hasValue(row.total) ? amount(row.total) : null;
    const hasNewPrice = hasValue(row["prix séjour"]) || hasValue(row.total);
    const hasResponsible = hasValue(row.mail) || hasValue(row["nom resp"]) || hasValue(row["prénom resp"]);
    const startsFamily = hasNewPrice || !current || (hasResponsible && cleanEmail(row.mail) && cleanEmail(row.mail) !== current.email);

    if (startsFamily) {
      current = buildFamily(row, families.length + 1);
      families.push(current);
    } else if (!current) {
      continue;
    }

    const child = buildChild(row);
    if (child.firstName || child.lastName || child.birthDate) {
      current.children.push(child);
    }

    if (!hasValue(current.pricing.stayPrice) && hasValue(stayPrice)) current.pricing.stayPrice = stayPrice;
    if (!hasValue(current.pricing.totalDue) && hasValue(total)) current.pricing.totalDue = total;
  }

  return families.map((family) => {
    const pricing = computePricing(family.pricing);
    return {
      ...family,
      childCount: family.children.length,
      pricing,
      tokenUnique: family.tokenUnique || makeToken(family),
      numeroDeReservation: family.numeroDeReservation || makeReference(family),
      valid: Boolean(family.email && family.children.length),
      warnings: buildWarnings(family, pricing),
    };
  });
}

function buildFamily(row, index) {
  const lastName = cleanText(row["nom resp"]);
  const firstName = cleanText(row["prénom resp"]);
  const email = cleanEmail(row.mail);
  const phone = formatPhone(row.num);
  const stayCode = cleanText(row["séjour"]);
  const week = cleanText(row.semaine);

  return {
    row: row.excelRow,
    index,
    responsible: { firstName, lastName, fullName: `${firstName} ${lastName}`.trim(), phone },
    email,
    address: cleanText(row.adresse),
    cafNumber: cleanText(row["num alloc"]),
    qf: cleanText(row.qf),
    stayCode,
    stayName: stayLabel(stayCode),
    week,
    startDate: weekDates(week).startDate,
    endDate: weekDates(week).endDate,
    transportCity: cleanText(row["transport ville"]),
    children: [],
    pricing: {
      stayPrice: hasValue(row["prix séjour"]) ? amount(row["prix séjour"]) : null,
      cafAid: hasValue(row.vacaf) ? amount(row.vacaf) : 0,
      discountRate: normalizeDiscount(row["réduc"]),
      transportAmount: hasValue(row["transport montant"]) ? amount(row["transport montant"]) : 0,
      totalDue: hasValue(row.total) ? amount(row.total) : null,
    },
  };
}

function buildChild(row) {
  return {
    lastName: cleanText(row["nom enf"]),
    firstName: cleanText(row["prénom enf"]),
    birthDate: cleanDate(row["date de naissance"]),
    stayCode: cleanText(row["séjour"]),
    week: cleanText(row.semaine),
  };
}

function computePricing(raw) {
  const stayPrice = amount(raw.stayPrice);
  const cafAid = amount(raw.cafAid);
  const discountRate = normalizeDiscount(raw.discountRate);
  const transportAmount = amount(raw.transportAmount);
  const discountAmount = round(stayPrice * discountRate);
  const priceAfterDiscount = round(stayPrice - discountAmount);
  const totalBeforeAid = round(priceAfterDiscount + transportAmount);
  const totalDue = hasValue(raw.totalDue)
    ? amount(raw.totalDue)
    : round(Math.max(totalBeforeAid - cafAid, 0));

  return {
    stayPrice,
    discountRate,
    discountAmount,
    priceAfterDiscount,
    transportAmount,
    totalBeforeAid,
    cafAid,
    totalDue,
    depositAmount: 100,
    remainingAfterDeposit: round(Math.max(totalDue - 100, 0)),
    priceWasCalculated: !hasValue(raw.totalDue),
  };
}

function buildWarnings(family, pricing) {
  const warnings = [];
  if (!family.email) warnings.push("Email manquant");
  if (!family.children.length) warnings.push("Aucun enfant renseigné");
  if (!pricing.totalDue && pricing.totalDue !== 0) warnings.push("Prix manquant");
  if (!family.stayCode) warnings.push("Séjour manquant");
  if (!family.week) warnings.push("Semaine manquante");
  return warnings;
}

function summarizeFamilies(families) {
  const valid = families.filter((family) => family.valid);
  return {
    families: families.length,
    validFamilies: valid.length,
    children: families.reduce((sum, family) => sum + family.children.length, 0),
    missingEmail: families.filter((family) => !family.email).length,
    calculatedPrices: families.filter((family) => family.pricing.priceWasCalculated).length,
    totalDue: round(families.reduce((sum, family) => sum + amount(family.pricing.totalDue), 0)),
  };
}

function weekDates(week) {
  const map = {
    S1: { startDate: "2026-07-06", endDate: "2026-07-17" },
    S2: { startDate: "2026-07-20", endDate: "2026-07-31" },
    S3: { startDate: "2026-08-03", endDate: "2026-08-14" },
    S4: { startDate: "2026-08-17", endDate: "2026-08-28" },
  };
  return map[cleanText(week).toUpperCase()] || { startDate: "", endDate: "" };
}

function stayLabel(value) {
  const code = cleanText(value).toUpperCase();
  if (code === "MCSC") return "My Creative Surf Camp";
  if (code === "EVCC") return "Eaux Vives Creative Camp";
  return cleanText(value);
}

function makeReference(family) {
  const letters = (family.responsible.lastName || family.email || "ACOMPTE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/gi, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  return `AC18-${String(family.index).padStart(2, "0")}${letters}`;
}

function makeToken(family) {
  return `AC18-${String(family.index).padStart(2, "0")}-${cleanText(family.responsible.lastName || family.email)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()}`;
}

function cleanEmail(value) {
  const match = String(value || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].replace(/[),.;:]+$/g, "") : "";
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 9) return `0${digits}`;
  return digits;
}

function cleanDate(value) {
  const raw = cleanText(value);
  return raw ? raw.slice(0, 10) : "";
}

function cleanText(value) {
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function amount(value) {
  const parsed = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDiscount(value) {
  const parsed = amount(value);
  if (parsed > 1) return parsed / 100;
  return parsed > 0 ? parsed : 0;
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function round(value) {
  return Number((Number(value) || 0).toFixed(2));
}
