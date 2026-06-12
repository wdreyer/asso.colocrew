#!/usr/bin/env python3
import csv
import json
import sys
import time
from urllib.request import Request, urlopen

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
]

TOURISM = "hotel|hostel|guest_house|motel|resort|chalet|camp_site|caravan_site|apartment|bed_and_breakfast"

BBOXES = [
    ("pays_basque", "43.25,-1.95,43.75,-1.20"),
    ("landes_sud", "43.65,-1.55,44.05,-1.00"),
    ("landes_nord", "44.05,-1.55,44.45,-1.00"),
    ("bassin_arcachon", "44.45,-1.35,44.90,-0.80"),
    ("medoc", "44.85,-1.35,45.60,-0.85"),
]


def query(bbox):
    return f"""
[out:json][timeout:90];
(
  nwr["tourism"~"{TOURISM}"]["email"]({bbox});
  nwr["tourism"~"{TOURISM}"]["contact:email"]({bbox});
  nwr["tourism"~"{TOURISM}"]["website"]({bbox});
  nwr["tourism"~"{TOURISM}"]["contact:website"]({bbox});
  nwr["leisure"="holiday_camp"]["email"]({bbox});
  nwr["leisure"="holiday_camp"]["website"]({bbox});
);
out center tags;
""".strip()


def fetch(q):
    last = None
    for endpoint in ENDPOINTS:
        try:
            req = Request(endpoint, data=q.encode("utf-8"), headers={"Content-Type": "application/x-www-form-urlencoded"})
            with urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8")), endpoint
        except Exception as exc:
            last = exc
            time.sleep(1)
    raise RuntimeError(last)


def tag(tags, *names):
    for name in names:
        if tags.get(name):
            return tags[name]
    return ""


def norm_site(url):
    url = (url or "").strip()
    if not url:
        return ""
    if url.startswith(("http://", "https://")):
        return url
    return "https://" + url


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "tmp_osm_contact_accommodations.csv"
    rows = []
    seen = set()
    for label, bbox in BBOXES:
        data, endpoint = fetch(query(bbox))
        for el in data.get("elements", []):
            tags = el.get("tags", {})
            name = tag(tags, "name")
            if not name:
                continue
            lat = el.get("lat") or (el.get("center") or {}).get("lat") or ""
            lon = el.get("lon") or (el.get("center") or {}).get("lon") or ""
            key = (el.get("type"), el.get("id"))
            if key in seen:
                continue
            seen.add(key)
            rows.append({
                "name": name,
                "type": tag(tags, "tourism", "leisure"),
                "capacity_max": tag(tags, "capacity", "capacity:persons", "beds"),
                "capacity_raw": tag(tags, "capacity", "capacity:persons", "beds"),
                "website": norm_site(tag(tags, "website", "contact:website", "url")),
                "email": tag(tags, "email", "contact:email"),
                "phone": tag(tags, "phone", "contact:phone", "mobile"),
                "contact_page": "",
                "address": " ".join(x for x in [tag(tags, "addr:housenumber"), tag(tags, "addr:street")] if x),
                "postal_code": tag(tags, "addr:postcode"),
                "city": tag(tags, "addr:city", "addr:place"),
                "department": "",
                "lat": lat,
                "lon": lon,
                "osm_type": el.get("type"),
                "osm_id": el.get("id"),
                "source": f"OSM/Overpass contact {label} ({endpoint})",
                "url": "",
            })
        print(label, len(rows))
    fields = ["name","type","capacity_max","capacity_raw","website","email","phone","contact_page","address","postal_code","city","department","lat","lon","osm_type","osm_id","source","url"]
    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} -> {out}")


if __name__ == "__main__":
    main()
