#!/usr/bin/env python3
import argparse
import csv
import json
import os
import re
import sys
import time
from datetime import datetime
from html import unescape
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser
import xml.etree.ElementTree as ET

DEFAULT_USER_AGENT = "ColoCrewCrawler/1.0"
MAX_BYTES = 2_500_000
MAX_TEXT_CHARS = 200_000

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"\b(?:\+33|0)\s?[1-9](?:[\s.\-]?\d{2}){4}\b")

CAPACITY_PATTERNS = [
    (re.compile(r"(capacit\u00e9|capacity|personnes|couchages|places|lits)\s*[:\-]?\s*(\d{1,4})", re.I), 2),
    (re.compile(r"(\d{1,4})\s*(personnes|couchages|places|lits|pax)\b", re.I), 1),
]

ACCOM_KEYWORDS = [
    "gite",
    "g\u00eete",
    "hebergement",
    "h\u00e9bergement",
    "camping",
    "centre de vacances",
    "village vacances",
    "auberge",
    "hotel",
    "h\u00f4tel",
    "residence",
    "r\u00e9sidence",
    "chambres d'hotes",
    "chambre d'hotes",
    "hostel",
    "colonie",
    "accueil de groupes",
    "groupe",
    "groupes",
    "seminaire",
    "s\u00e9minaire",
]

TYPE_KEYWORDS = [
    ("camping", "camping"),
    ("gite", "gite"),
    ("g\u00eete", "gite"),
    ("centre de vacances", "centre_de_vacances"),
    ("village vacances", "village_de_vacances"),
    ("auberge", "auberge"),
    ("hotel", "hotel"),
    ("h\u00f4tel", "hotel"),
    ("residence", "residence"),
    ("r\u00e9sidence", "residence"),
    ("chambres d'hotes", "chambres_d_hotes"),
    ("chambre d'hotes", "chambres_d_hotes"),
    ("hostel", "hostel"),
    ("colonie", "colonie"),
]

SOCIAL_DOMAINS = [
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "tiktok.com",
    "linkedin.com",
    "youtube.com",
    "pinterest.com",
    "whatsapp.com",
]

DEPT_NAME_MAP = {
    "33": ["gironde"],
    "40": ["landes"],
    "64": ["pyrenees-atlantiques", "pays basque"],
}


def strip_utm(query):
    if not query:
        return ""
    kept = [
        (k, v)
        for k, v in parse_qsl(query, keep_blank_values=True)
        if not k.lower().startswith("utm_")
    ]
    return urlencode(kept, doseq=True)


def normalize_url(url, base=None):
    if base:
        url = urljoin(base, url)
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return None
    query = strip_utm(parsed.query)
    return parsed._replace(fragment="", query=query).geturl()


def clean_text(text):
    text = unescape(text or "")
    text = text.replace("\r", " ").replace("\t", " ")
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.split("\n")]
    return "\n".join([line for line in lines if line])


def domain_allowed(netloc, allowed_domains):
    if not allowed_domains:
        return True
    for domain in allowed_domains:
        if netloc == domain or netloc.endswith("." + domain):
            return True
    return False


def is_social_link(url):
    netloc = urlparse(url).netloc.lower()
    return any(d in netloc for d in SOCIAL_DOMAINS)


class SimpleHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.mailtos = set()
        self.tels = set()
        self.h1 = []
        self.h2 = []
        self.title = ""
        self.jsonld = []
        self.text_parts = []
        self._text_len = 0
        self._current_link = None
        self._current_link_text = []
        self._capture = None
        self._in_script = False
        self._script_type = ""
        self._script_buf = []
        self._in_style = False

    def _append_text(self, data):
        if not data:
            return
        if self._text_len > MAX_TEXT_CHARS:
            return
        self.text_parts.append(data)
        self._text_len += len(data)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs or [])
        if tag == "a":
            href = attrs.get("href", "")
            self._current_link = href
            self._current_link_text = []
            if href.startswith("mailto:"):
                self.mailtos.add(href[7:].split("?")[0])
            elif href.startswith("tel:"):
                self.tels.add(href[4:].split("?")[0])
        elif tag == "title":
            self._capture = "title"
        elif tag == "h1":
            self._capture = "h1"
        elif tag == "h2":
            self._capture = "h2"
        elif tag == "script":
            self._in_script = True
            self._script_type = attrs.get("type", "")
            self._script_buf = []
        elif tag == "style":
            self._in_style = True
        elif tag in ("br",):
            self._append_text("\n")

    def handle_endtag(self, tag):
        if tag == "a":
            text = clean_text("".join(self._current_link_text))
            if self._current_link:
                self.links.append((self._current_link, text))
            self._current_link = None
            self._current_link_text = []
        elif tag == "script":
            if self._script_type == "application/ld+json":
                raw = "".join(self._script_buf).strip()
                if raw:
                    self.jsonld.append(raw)
            self._in_script = False
            self._script_type = ""
            self._script_buf = []
        elif tag == "style":
            self._in_style = False
        elif tag in ("p", "li", "div", "tr", "section", "article"):
            self._append_text("\n")
        elif tag in ("title", "h1", "h2"):
            self._capture = None

    def handle_data(self, data):
        if self._in_script:
            self._script_buf.append(data)
            return
        if self._in_style:
            return
        if self._capture == "title":
            self.title += data
        elif self._capture == "h1":
            self.h1.append(data)
        elif self._capture == "h2":
            self.h2.append(data)
        if self._current_link is not None:
            self._current_link_text.append(data)
        self._append_text(data)


def fetch_url(url, user_agent, timeout):
    req = Request(
        url,
        headers={
            "User-Agent": user_agent,
            "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
        },
    )
    try:
        with urlopen(req, timeout=timeout) as resp:
            content_type = resp.headers.get("Content-Type", "")
            data = resp.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                return None, content_type
            charset = resp.headers.get_content_charset() or "utf-8"
            text = data.decode(charset, errors="replace")
            return text, content_type
    except (HTTPError, URLError, TimeoutError):
        return None, ""


def build_robot_parser(base_url, user_agent, timeout):
    parsed = urlparse(base_url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    text, _ = fetch_url(robots_url, user_agent, timeout)
    if not text:
        return None
    rp = RobotFileParser()
    rp.parse(text.splitlines())
    return rp


def can_fetch(url, rp, user_agent):
    if rp is None:
        return True
    try:
        return rp.can_fetch(user_agent, url)
    except Exception:
        return True


def iter_jsonld_objects(data):
    if isinstance(data, dict):
        yield data
        for key, value in data.items():
            if isinstance(value, (dict, list)):
                for obj in iter_jsonld_objects(value):
                    yield obj
    elif isinstance(data, list):
        for item in data:
            for obj in iter_jsonld_objects(item):
                yield obj


def extract_jsonld_fields(parser):
    name = None
    url = None
    email = None
    phone = None
    address = None
    postal_code = None
    city = None

    for raw in parser.jsonld:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        for obj in iter_jsonld_objects(data):
            if not isinstance(obj, dict):
                continue
            obj_type = obj.get("@type")
            if isinstance(obj_type, list):
                obj_type = ",".join(obj_type)
            if obj_type:
                obj_type = str(obj_type).lower()
            if obj_type and not any(
                t in obj_type
                for t in [
                    "lodgingbusiness",
                    "hotel",
                    "hostel",
                    "campground",
                    "touristaccommodation",
                    "localbusiness",
                    "organization",
                ]
            ):
                continue

            if not name and obj.get("name"):
                name = str(obj.get("name")).strip()
            if not url and obj.get("url"):
                url = str(obj.get("url")).strip()
            if not email and obj.get("email"):
                email = str(obj.get("email")).strip()
            if not phone and obj.get("telephone"):
                phone = str(obj.get("telephone")).strip()

            if not address and obj.get("address"):
                addr_obj = obj.get("address")
                if isinstance(addr_obj, dict):
                    parts = []
                    if addr_obj.get("streetAddress"):
                        parts.append(str(addr_obj.get("streetAddress")).strip())
                    if addr_obj.get("postalCode"):
                        postal_code = str(addr_obj.get("postalCode")).strip()
                    if addr_obj.get("addressLocality"):
                        city = str(addr_obj.get("addressLocality")).strip()
                    if postal_code or city:
                        parts.append(" ".join([p for p in [postal_code, city] if p]))
                    if addr_obj.get("addressRegion"):
                        parts.append(str(addr_obj.get("addressRegion")).strip())
                    address = ", ".join([p for p in parts if p])
                elif isinstance(addr_obj, str):
                    address = addr_obj.strip()

    return name, url, email, phone, address, postal_code, city


def extract_capacity(text):
    numbers = []
    snippets = []
    for pattern, num_group in CAPACITY_PATTERNS:
        for match in pattern.finditer(text):
            try:
                value = int(match.group(num_group))
                numbers.append(value)
                snippets.append(match.group(0))
            except (ValueError, TypeError, IndexError):
                continue
    if not numbers:
        return None, ""
    return max(numbers), "; ".join(dict.fromkeys(snippets))


def infer_type(text):
    text = text.lower()
    for keyword, label in TYPE_KEYWORDS:
        if keyword in text:
            return label
    return ""


def looks_like_accommodation(text):
    text = text.lower()
    return any(k in text for k in ACCOM_KEYWORDS)


def extract_address_from_text(text):
    for line in text.split("\n"):
        if re.search(r"\b\d{5}\b", line):
            return line.strip()
    return ""


def parse_postal_city(address_line):
    postal_code = ""
    city = ""
    if not address_line:
        return postal_code, city
    match = re.search(r"\b(\d{5})\b\s*([^\d,]+)?", address_line)
    if match:
        postal_code = match.group(1)
        if match.group(2):
            city = match.group(2).strip()
    return postal_code, city


def pick_contact_page(links, base_url):
    for href, text in links:
        if not href:
            continue
        if href.startswith("mailto:") or href.startswith("tel:"):
            continue
        joined = normalize_url(href, base_url)
        if not joined:
            continue
        label = (text or "").lower()
        if any(k in joined.lower() for k in ["contact", "reservation", "devis", "demande", "formulaire"]):
            return joined
        if any(k in label for k in ["contact", "reservation", "devis", "demande", "formulaire"]):
            return joined
    return ""


def pick_external_site(links, base_url):
    base_netloc = urlparse(base_url).netloc.lower()
    candidates = []
    for href, text in links:
        if not href:
            continue
        if href.startswith("mailto:") or href.startswith("tel:"):
            continue
        joined = normalize_url(href, base_url)
        if not joined:
            continue
        netloc = urlparse(joined).netloc.lower()
        if not netloc or netloc == base_netloc or netloc.endswith("." + base_netloc):
            continue
        if is_social_link(joined):
            continue
        candidates.append((joined, text or ""))
    for url, text in candidates:
        if any(k in text.lower() for k in ["site", "internet", "web"]):
            return url
    return candidates[0][0] if candidates else ""


def extract_record(url, parser, config, source_name, detail_hint=False):
    text = clean_text("".join(parser.text_parts))
    json_name, json_url, json_email, json_phone, json_address, json_postal, json_city = extract_jsonld_fields(parser)

    name = ""
    if parser.h1:
        name = clean_text(" ".join(parser.h1))
    elif parser.title:
        name = clean_text(parser.title)
    if json_name:
        name = json_name

    emails = set(parser.mailtos)
    for match in EMAIL_RE.findall(text):
        emails.add(match)
    email = next(iter(emails), "")
    if json_email:
        email = json_email

    phones = set(parser.tels)
    for match in PHONE_RE.findall(text):
        phones.add(match)
    phone = next(iter(phones), "")
    if json_phone:
        phone = json_phone

    website = pick_external_site(parser.links, url)
    if not website and json_url:
        website = json_url

    contact_page = pick_contact_page(parser.links, url)

    address_line = json_address or extract_address_from_text(text)
    postal_code, city = parse_postal_city(address_line)
    if json_postal:
        postal_code = json_postal
    if json_city:
        city = json_city

    capacity_max, capacity_raw = extract_capacity(text)

    dept = postal_code[:2] if postal_code else ""

    type_label = infer_type(" ".join([name, text]))

    record = {
        "name": name,
        "type": type_label,
        "capacity_max": capacity_max or "",
        "capacity_raw": capacity_raw,
        "website": website,
        "email": email,
        "phone": phone,
        "contact_page": contact_page,
        "address": address_line,
        "postal_code": postal_code,
        "city": city,
        "department": dept,
        "source": source_name,
        "url": url,
    }

    if not name:
        return None

    text_for_match = (name + " " + text).lower()
    looks_like = looks_like_accommodation(text_for_match) or detail_hint
    has_contact = bool(email or phone or address_line or website or contact_page)

    if not looks_like or not has_contact:
        return None

    min_capacity = config.get("min_capacity", 25)
    include_unknown = config.get("include_unknown", False)
    if capacity_max is None:
        if not include_unknown:
            return None
    else:
        if capacity_max < min_capacity:
            return None

    require_coast = config.get("require_coast_keyword", False)
    coast_keywords = config.get("coast_keywords", [])
    if require_coast and coast_keywords:
        coast_match = any(k in text_for_match for k in coast_keywords)
        if not coast_match:
            return None

    dept_whitelist = config.get("dept_whitelist", [])
    allow_unknown_dept = config.get("allow_unknown_dept", True)
    if dept_whitelist:
        if dept:
            if dept not in dept_whitelist:
                return None
        else:
            if not allow_unknown_dept:
                return None
            dept_text = text_for_match
            allowed_by_name = False
            for d in dept_whitelist:
                for name_hint in DEPT_NAME_MAP.get(d, []):
                    if name_hint in dept_text:
                        allowed_by_name = True
                        break
                if allowed_by_name:
                    break
            if not allowed_by_name and not allow_unknown_dept:
                return None

    return record


def make_dedupe_key(record):
    name = re.sub(r"\W+", "", (record.get("name") or "").lower())
    city = re.sub(r"\W+", "", (record.get("city") or "").lower())
    postal = record.get("postal_code") or ""
    return "|".join([name, postal, city]) or record.get("url")


def parse_sitemap(xml_text):
    urls = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return urls, False

    def strip_ns(tag):
        return tag.split("}")[-1] if "}" in tag else tag

    root_tag = strip_ns(root.tag)
    if root_tag == "sitemapindex":
        for sitemap in root.findall(".//{*}sitemap"):
            loc = sitemap.findtext("{*}loc")
            if loc:
                urls.append(loc.strip())
        return urls, True
    if root_tag == "urlset":
        for url_el in root.findall(".//{*}url"):
            loc = url_el.findtext("{*}loc")
            if loc:
                urls.append(loc.strip())
        return urls, False
    return urls, False


def get_sitemap_urls(source, crawl_config):
    if not source.get("use_sitemap"):
        return []
    start_urls = source.get("start_urls", [])
    if not start_urls:
        return []
    seed = start_urls[0]
    parsed = urlparse(seed)
    base = f"{parsed.scheme}://{parsed.netloc}"
    candidates = [f"{base}/sitemap.xml", f"{base}/sitemap_index.xml"]

    user_agent = crawl_config.get("user_agent", DEFAULT_USER_AGENT)
    timeout = crawl_config.get("timeout_seconds", 15)
    filter_re = source.get("sitemap_filter_regex")
    compiled = re.compile(filter_re) if filter_re else None

    pending = list(candidates)
    seen = set()
    out = []

    while pending:
        sitemap_url = pending.pop()
        if sitemap_url in seen:
            continue
        seen.add(sitemap_url)

        xml_text, content_type = fetch_url(sitemap_url, user_agent, timeout)
        if not xml_text or "xml" not in content_type:
            continue

        urls, is_index = parse_sitemap(xml_text)
        if is_index:
            for u in urls:
                pending.append(u)
            continue
        for url in urls:
            if compiled and not compiled.search(url):
                continue
            out.append(url)

    return out


def crawl_source(source, config, crawl_config, writer, seen_records, global_seen_urls):
    from collections import deque

    start_urls = source.get("start_urls", [])
    if not start_urls:
        return 0, 0

    allow_domains = source.get("allow_domains", [])
    if not allow_domains:
        allow_domains = [urlparse(start_urls[0]).netloc]

    allow_re = re.compile(source["url_allow_regex"]) if source.get("url_allow_regex") else None
    detail_re = re.compile(source["detail_url_regex"]) if source.get("detail_url_regex") else None

    queue = deque()
    seed_set = set()
    for url in start_urls:
        normalized = normalize_url(url)
        if normalized:
            queue.append((normalized, 0))
            seed_set.add(normalized)

    for sitemap_url in get_sitemap_urls(source, crawl_config):
        normalized = normalize_url(sitemap_url)
        if normalized:
            queue.append((normalized, 0))

    fetched = 0
    stored = 0
    seen_urls = set()
    robots_cache = {}
    last_fetch = {}

    max_depth = crawl_config.get("max_depth", 2)
    max_pages = crawl_config.get("max_pages_per_domain", 1200)
    delay = crawl_config.get("delay_seconds", 1.0)
    timeout = crawl_config.get("timeout_seconds", 15)
    user_agent = crawl_config.get("user_agent", DEFAULT_USER_AGENT)
    respect_robots = crawl_config.get("respect_robots", True)

    while queue and fetched < max_pages:
        url, depth = queue.popleft()
        if url in seen_urls or url in global_seen_urls:
            continue
        seen_urls.add(url)

        parsed = urlparse(url)
        if not domain_allowed(parsed.netloc, allow_domains):
            continue
        if url not in seed_set and allow_re and not allow_re.search(url):
            continue

        if respect_robots:
            rp = robots_cache.get(parsed.netloc)
            if rp is None:
                rp = build_robot_parser(url, user_agent, timeout)
                robots_cache[parsed.netloc] = rp
            if not can_fetch(url, rp, user_agent):
                continue

        last_time = last_fetch.get(parsed.netloc)
        if last_time is not None:
            elapsed = time.time() - last_time
            if elapsed < delay:
                time.sleep(delay - elapsed)
        last_fetch[parsed.netloc] = time.time()

        html, content_type = fetch_url(url, user_agent, timeout)
        if not html or "text/html" not in content_type:
            continue

        fetched += 1
        global_seen_urls.add(url)

        parser = SimpleHTMLParser()
        try:
            parser.feed(html)
        except Exception:
            continue

        detail_hint = bool(detail_re and detail_re.search(url))
        record = extract_record(url, parser, config, source.get("name", ""), detail_hint)
        if record:
            key = make_dedupe_key(record)
            if key not in seen_records:
                seen_records.add(key)
                writer.writerow(record)
                stored += 1

        if depth >= max_depth:
            continue

        for href, _ in parser.links:
            next_url = normalize_url(href, url)
            if not next_url:
                continue
            next_parsed = urlparse(next_url)
            if not domain_allowed(next_parsed.netloc, allow_domains):
                continue
            if next_url in seen_urls:
                continue
            queue.append((next_url, depth + 1))

    return fetched, stored


def resolve_config_path(path):
    if path:
        return path
    default_path = os.path.join(os.path.dirname(__file__), "hebergements_config.json")
    if os.path.exists(default_path):
        return default_path
    return None


def merge_overrides(config, args):
    if args.min_capacity is not None:
        config["min_capacity"] = args.min_capacity
    if args.include_unknown:
        config["include_unknown"] = True
    if args.require_coast:
        config["require_coast_keyword"] = True
    if args.dept_whitelist:
        config["dept_whitelist"] = args.dept_whitelist.split(",")
    crawl = config.get("crawl", {})
    if args.max_depth is not None:
        crawl["max_depth"] = args.max_depth
    if args.max_pages_per_domain is not None:
        crawl["max_pages_per_domain"] = args.max_pages_per_domain
    if args.delay is not None:
        crawl["delay_seconds"] = args.delay
    if args.timeout is not None:
        crawl["timeout_seconds"] = args.timeout
    if args.user_agent:
        crawl["user_agent"] = args.user_agent
    if args.no_robots:
        crawl["respect_robots"] = False
    config["crawl"] = crawl
    return config


def ensure_output_path(path):
    if path:
        out_path = path
    else:
        ts = datetime.now().strftime("%Y%m%d_%H%M")
        out_dir = os.path.join(os.path.dirname(__file__), "..", "output")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"hebergements_{ts}.csv")
    return os.path.abspath(out_path)


def main():
    parser = argparse.ArgumentParser(description="Collect hebergements for groups (25+).")
    parser.add_argument("--config", help="Path to JSON config file")
    parser.add_argument("--out", help="Output CSV path")
    parser.add_argument("--min-capacity", type=int, default=None)
    parser.add_argument("--include-unknown", action="store_true")
    parser.add_argument("--require-coast", action="store_true")
    parser.add_argument("--dept-whitelist", help="Comma-separated dept codes (e.g., 33,40,64)")
    parser.add_argument("--max-depth", type=int)
    parser.add_argument("--max-pages-per-domain", type=int)
    parser.add_argument("--delay", type=float)
    parser.add_argument("--timeout", type=float)
    parser.add_argument("--user-agent", type=str)
    parser.add_argument("--no-robots", action="store_true")
    args = parser.parse_args()

    config_path = resolve_config_path(args.config)
    if not config_path:
        print("No config file found. Provide --config.", file=sys.stderr)
        sys.exit(1)

    with open(config_path, "r", encoding="utf-8-sig") as f:
        config = json.load(f)

    config = merge_overrides(config, args)

    out_path = ensure_output_path(args.out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

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
        "source",
        "url",
    ]

    total_fetched = 0
    total_stored = 0
    global_seen_urls = set()
    seen_records = set()

    with open(out_path, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fields)
        writer.writeheader()

        for source in config.get("sources", []):
            crawl_config = config.get("crawl", {})
            fetched, stored = crawl_source(
                source,
                config,
                crawl_config,
                writer,
                seen_records,
                global_seen_urls,
            )
            total_fetched += fetched
            total_stored += stored
            print(f"[{source.get('name','source')}] pages: {fetched}, records: {stored}")

    print(f"Done. Total pages: {total_fetched}. Total records: {total_stored}.")
    print(f"CSV: {out_path}")


if __name__ == "__main__":
    main()
