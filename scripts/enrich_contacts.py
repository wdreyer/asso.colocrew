#!/usr/bin/env python3
import argparse
import csv
import re
import time
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, urlsplit, urlunsplit, quote
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from http.client import RemoteDisconnected
from urllib.robotparser import RobotFileParser

MAX_BYTES = 2_000_000
MAX_TEXT_CHARS = 200_000

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"\b(?:\+33|0)\s?[1-9](?:[\s.\-]?\d{2}){4}\b")

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


def clean_text(text):
    text = unescape(text or "")
    text = text.replace("\r", " ").replace("\t", " ")
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.split("\n")]
    return "\n".join([line for line in lines if line])


def normalize_url(url, base=None):
    if base:
        url = urljoin(base, url)
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return None
    return parsed._replace(fragment="").geturl()


def is_social_link(url):
    netloc = urlparse(url).netloc.lower()
    return any(d in netloc for d in SOCIAL_DOMAINS)


class SimpleHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.mailtos = set()
        self.tels = set()
        self.text_parts = []
        self._text_len = 0
        self._current_link = None
        self._current_link_text = []
        self._in_script = False
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
        elif tag == "script":
            self._in_script = True
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
            self._in_script = False
        elif tag == "style":
            self._in_style = False
        elif tag in ("p", "li", "div", "tr", "section", "article"):
            self._append_text("\n")

    def handle_data(self, data):
        if self._in_script or self._in_style:
            return
        if self._current_link is not None:
            self._current_link_text.append(data)
        self._append_text(data)


def safe_url(url):
    parts = urlsplit(url)
    path = quote(parts.path, safe="/%")
    query = quote(parts.query, safe="=&%")
    fragment = quote(parts.fragment, safe="")
    return urlunsplit((parts.scheme, parts.netloc, path, query, fragment))


def fetch_url(url, user_agent, timeout):
    url = safe_url(url)
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
    except (HTTPError, URLError, TimeoutError, RemoteDisconnected):
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


def extract_from_html(html, base_url):
    parser = SimpleHTMLParser()
    try:
        parser.feed(html)
    except Exception:
        return {}, parser

    text = clean_text("".join(parser.text_parts))
    emails = set(parser.mailtos)
    for match in EMAIL_RE.findall(text):
        emails.add(match)
    phones = set(parser.tels)
    for match in PHONE_RE.findall(text):
        phones.add(match)

    contact_page = pick_contact_page(parser.links, base_url)

    data = {
        "email": next(iter(emails), ""),
        "phone": next(iter(phones), ""),
        "contact_page": contact_page,
    }
    return data, parser


def normalize_website(url):
    if not url:
        return ""
    url = url.strip()
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return "https://" + url


def main():
    parser = argparse.ArgumentParser(description="Enrich CSV with emails/phones/contact pages.")
    parser.add_argument("--in", dest="input_path", required=True, help="Input CSV")
    parser.add_argument("--out", dest="output_path", required=True, help="Output CSV")
    parser.add_argument("--delay", type=float, default=0.4)
    parser.add_argument("--timeout", type=float, default=15)
    parser.add_argument("--user-agent", type=str, default="ColoCrewCrawler/1.0")
    parser.add_argument("--max-sites", type=int, default=0)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--respect-robots", action="store_true")
    args = parser.parse_args()

    with open(args.input_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fields = reader.fieldnames or []

    base_fields = ["email", "phone", "contact_page", "website"]
    for field in base_fields:
        if field not in fields:
            fields.append(field)

    robots_cache = {}
    last_fetch = {}

    processed = 0
    index = 0

    with open(args.output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()

        for row in rows:
            index += 1
            if args.offset and index <= args.offset:
                writer.writerow(row)
                continue
            website = normalize_website(row.get("website", ""))
            if website:
                row["website"] = website

            need_fetch = website and (not row.get("email") or not row.get("phone") or not row.get("contact_page"))
            if not need_fetch:
                writer.writerow(row)
                continue

            parsed = urlparse(website)
            if args.respect_robots:
                rp = robots_cache.get(parsed.netloc)
                if rp is None:
                    rp = build_robot_parser(website, args.user_agent, args.timeout)
                    robots_cache[parsed.netloc] = rp
                if not can_fetch(website, rp, args.user_agent):
                    writer.writerow(row)
                    continue

            last_time = last_fetch.get(parsed.netloc)
            if last_time is not None:
                elapsed = time.time() - last_time
                if elapsed < args.delay:
                    time.sleep(args.delay - elapsed)
            last_fetch[parsed.netloc] = time.time()

            html, content_type = fetch_url(website, args.user_agent, args.timeout)
            if not html or "text/html" not in content_type:
                writer.writerow(row)
                continue

            data, parser_obj = extract_from_html(html, website)

            if not row.get("email") and data.get("email"):
                row["email"] = data["email"]
            if not row.get("phone") and data.get("phone"):
                row["phone"] = data["phone"]
            if not row.get("contact_page") and data.get("contact_page"):
                row["contact_page"] = data["contact_page"]

            if row.get("contact_page") and (not row.get("email") or not row.get("phone")):
                contact_url = row.get("contact_page")
                if not is_social_link(contact_url):
                    if args.respect_robots:
                        rp = robots_cache.get(urlparse(contact_url).netloc)
                        if rp is None:
                            rp = build_robot_parser(contact_url, args.user_agent, args.timeout)
                            robots_cache[urlparse(contact_url).netloc] = rp
                        if not can_fetch(contact_url, rp, args.user_agent):
                            writer.writerow(row)
                            processed += 1
                            if args.max_sites and processed >= args.max_sites:
                                for remaining in rows[index:]:
                                    writer.writerow(remaining)
                                break
                            continue

                    html2, content_type2 = fetch_url(contact_url, args.user_agent, args.timeout)
                    if html2 and "text/html" in content_type2:
                        data2, _ = extract_from_html(html2, contact_url)
                        if not row.get("email") and data2.get("email"):
                            row["email"] = data2["email"]
                        if not row.get("phone") and data2.get("phone"):
                            row["phone"] = data2["phone"]

            writer.writerow(row)
            processed += 1
            if args.max_sites and processed >= args.max_sites:
                for remaining in rows[index:]:
                    writer.writerow(remaining)
                break

    print(f"Enriched {processed} rows -> {args.output_path}")


if __name__ == "__main__":
    main()
