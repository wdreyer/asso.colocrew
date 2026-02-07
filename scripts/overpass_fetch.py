#!/usr/bin/env python3
import argparse
import csv
import json
import re
import sys
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
]

ACCOM_TOURISM_VALUES = [
    "hotel",
    "hostel",
    "guest_house",
    "motel",
    "resort",
    "chalet",
    "camp_site",
    "caravan_site",
    "apartment",
    "bed_and_breakfast",
]

PHONE_KEYS = ["phone", "contact:phone", "contact:mobile", "mobile"]
EMAIL_KEYS = ["email", "contact:email"]
WEBSITE_KEYS = ["website", "contact:website", "url"]


def build_query(bbox):
    tourism_regex = "|".join(ACCOM_TOURISM_VALUES)
    return f"""
[out:json][timeout:60];
(
  nwr[\"tourism\"~\"{tourism_regex}\"]({bbox});
  nwr[\"leisure\"=\"holiday_camp\"]({bbox});
);
out center tags;
""".strip()


def build_office_query(bbox):
    return f"""
[out:json][timeout:60];
(
  nwr[\"tourism\"=\"information\"][\"information\"=\"office\"]({bbox});
);
out center tags;
""".strip()


def fetch_overpass(query, timeout):
    data = query.encode("utf-8")
    last_error = None
    for endpoint in ENDPOINTS:
        try:
            req = Request(
                endpoint,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            with urlopen(req, timeout=timeout) as resp:
                payload = resp.read().decode("utf-8", errors="replace")
                return json.loads(payload), endpoint
        except (URLError, HTTPError, json.JSONDecodeError) as exc:
            last_error = exc
            time.sleep(1)
            continue
    raise RuntimeError(f"Overpass failed: {last_error}")


def first_tag(tags, keys):
    for key in keys:
        value = tags.get(key)
        if value:
            return value
    return ""


def parse_capacity(tags):
    raw = tags.get("capacity") or tags.get("capacity:persons") or tags.get("beds")
    if not raw:
        return "", ""
    raw_str = str(raw)
    match = re.search(r"\d+", raw_str)
    if not match:
        return "", raw_str
    return match.group(0), raw_str


def build_address(tags):
    parts = []
    street = tags.get("addr:housenumber") or ""
    if tags.get("addr:street"):
        street = (street + " " + tags.get("addr:street")).strip()
    if street:
        parts.append(street)
    if tags.get("addr:postcode") or tags.get("addr:city"):
        parts.append(" ".join(filter(None, [tags.get("addr:postcode", ""), tags.get("addr:city", "")])))
    if tags.get("addr:place") and not tags.get("addr:city"):
        parts.append(tags.get("addr:place"))
    return ", ".join([p for p in parts if p])


def guess_type(tags):
    if tags.get("tourism"):
        return tags.get("tourism")
    if tags.get("leisure"):
        return tags.get("leisure")
    return ""


def normalize_website(url):
    if not url:
        return ""
    url = url.strip()
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return "https://" + url


def department_from_postcode(postcode):
    if not postcode:
        return ""
    match = re.search(r"\d{2}", postcode)
    return match.group(0) if match else ""


def write_csv(path, rows, fields):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main():
    parser = argparse.ArgumentParser(description="Fetch accommodations from OSM Overpass.")
    parser.add_argument("--bbox", default="43.2,-1.9,45.8,-0.7", help="south,west,north,east")
    parser.add_argument("--out", required=True, help="Output CSV path")
    parser.add_argument("--offices-out", help="Output CSV for tourism offices")
    parser.add_argument("--offices-seeds", help="Output TXT with tourism office websites")
    parser.add_argument("--min-capacity", type=int, default=25)
    parser.add_argument("--include-unknown", action="store_true")
    parser.add_argument("--dept-whitelist", default="33,40,64")
    parser.add_argument("--timeout", type=int, default=120)
    args = parser.parse_args()

    dept_whitelist = [d.strip() for d in args.dept_whitelist.split(",") if d.strip()]

    query = build_query(args.bbox)
    data, endpoint = fetch_overpass(query, args.timeout)

    rows = []
    for el in data.get("elements", []):
        tags = el.get("tags", {})
        name = tags.get("name", "").strip()
        if not name:
            continue

        website = normalize_website(first_tag(tags, WEBSITE_KEYS))
        email = first_tag(tags, EMAIL_KEYS)
        phone = first_tag(tags, PHONE_KEYS)
        capacity_max, capacity_raw = parse_capacity(tags)

        if capacity_max:
            try:
                cap_val = int(capacity_max)
            except ValueError:
                cap_val = None
        else:
            cap_val = None

        if cap_val is None and not args.include_unknown:
            continue
        if cap_val is not None and cap_val < args.min_capacity:
            continue

        postal = tags.get("addr:postcode", "")
        city = tags.get("addr:city", "") or tags.get("addr:place", "")
        dept = department_from_postcode(postal)
        if dept_whitelist and dept and dept not in dept_whitelist:
            continue

        address = build_address(tags)
        lat = el.get("lat")
        lon = el.get("lon")
        if not lat and el.get("center"):
            lat = el.get("center", {}).get("lat")
            lon = el.get("center", {}).get("lon")

        row = {
            "name": name,
            "type": guess_type(tags),
            "capacity_max": capacity_max,
            "capacity_raw": capacity_raw,
            "website": website,
            "email": email,
            "phone": phone,
            "contact_page": "",
            "address": address,
            "postal_code": postal,
            "city": city,
            "department": dept,
            "lat": lat or "",
            "lon": lon or "",
            "osm_type": el.get("type"),
            "osm_id": el.get("id"),
            "source": f"OSM/Overpass ({endpoint})",
            "url": "",
        }
        rows.append(row)

    fields = [
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
    write_csv(args.out, rows, fields)
    print(f"OSM accommodations: {len(rows)} -> {args.out}")

    if args.offices_out or args.offices_seeds:
        office_query = build_office_query(args.bbox)
        office_data, office_endpoint = fetch_overpass(office_query, args.timeout)
        office_rows = []
        seeds = set()
        for el in office_data.get("elements", []):
            tags = el.get("tags", {})
            name = tags.get("name", "").strip()
            if not name:
                continue
            website = normalize_website(first_tag(tags, WEBSITE_KEYS))
            if website:
                seeds.add(website)
            email = first_tag(tags, EMAIL_KEYS)
            phone = first_tag(tags, PHONE_KEYS)
            postal = tags.get("addr:postcode", "")
            city = tags.get("addr:city", "") or tags.get("addr:place", "")
            dept = department_from_postcode(postal)
            if dept_whitelist and dept and dept not in dept_whitelist:
                continue
            address = build_address(tags)
            lat = el.get("lat")
            lon = el.get("lon")
            if not lat and el.get("center"):
                lat = el.get("center", {}).get("lat")
                lon = el.get("center", {}).get("lon")
            office_rows.append({
                "name": name,
                "website": website,
                "email": email,
                "phone": phone,
                "address": address,
                "postal_code": postal,
                "city": city,
                "department": dept,
                "lat": lat or "",
                "lon": lon or "",
                "osm_type": el.get("type"),
                "osm_id": el.get("id"),
                "source": f"OSM/Overpass ({office_endpoint})",
            })

        if args.offices_out:
            office_fields = [
                "name",
                "website",
                "email",
                "phone",
                "address",
                "postal_code",
                "city",
                "department",
                "lat",
                "lon",
                "osm_type",
                "osm_id",
                "source",
            ]
            write_csv(args.offices_out, office_rows, office_fields)
            print(f"OSM offices: {len(office_rows)} -> {args.offices_out}")

        if args.offices_seeds:
            with open(args.offices_seeds, "w", encoding="utf-8") as f:
                for url in sorted(seeds):
                    f.write(url + "\n")
            print(f"Office website seeds: {len(seeds)} -> {args.offices_seeds}")


if __name__ == "__main__":
    main()
