#!/usr/bin/env python3
import argparse
import csv
import re

FIELDS = [
    "name",
    "type",
    "capacity_max",
    "capacity_raw",
    "website",
    "email",
    "phone",
    "contact_page",
    "address",
    "postal_code",
    "city",
    "department",
    "lat",
    "lon",
    "osm_type",
    "osm_id",
    "source",
    "url",
]


def norm_text(value):
    return re.sub(r"\W+", "", (value or "").lower())


def norm_url(url):
    return (url or "").strip().lower().rstrip("/")


def make_key(row):
    email = row.get("email", "").strip().lower()
    if email:
        return f"email:{email}"
    website = norm_url(row.get("website", ""))
    if website:
        return f"web:{website}"
    name = norm_text(row.get("name", ""))
    city = norm_text(row.get("city", ""))
    postal = (row.get("postal_code", "") or "").strip()
    if name or city or postal:
        return f"name:{name}|{postal}|{city}"
    url = norm_url(row.get("url", ""))
    if url:
        return f"url:{url}"
    return None


def merge_row(base, incoming):
    for field in FIELDS:
        if not base.get(field) and incoming.get(field):
            base[field] = incoming.get(field)
        elif field in ("source", "url") and incoming.get(field):
            if base.get(field):
                if incoming[field] not in base[field].split("|"):
                    base[field] = base[field] + "|" + incoming[field]
            else:
                base[field] = incoming[field]
    return base


def main():
    parser = argparse.ArgumentParser(description="Merge and dedupe CSV files.")
    parser.add_argument("--out", required=True, help="Output CSV")
    parser.add_argument("--inputs", nargs="+", required=True, help="Input CSV files")
    args = parser.parse_args()

    merged = {}

    for path in args.inputs:
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                key = make_key(row)
                if not key:
                    key = f"row:{len(merged)}"
                if key not in merged:
                    merged[key] = {field: row.get(field, "") for field in FIELDS}
                else:
                    merged[key] = merge_row(merged[key], row)

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for row in merged.values():
            writer.writerow(row)

    print(f"Merged {len(merged)} rows -> {args.out}")


if __name__ == "__main__":
    main()
