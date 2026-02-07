#!/usr/bin/env python3
import argparse
import json
from urllib.parse import urlparse

DEFAULT_ALLOW_REGEX = r"(heberg|h[ee]bergement|g[ii]te|groupe|groupes|collectif|camping|hotel|h[oo]tel|seminaire|village|centre)"
DEFAULT_DETAIL_REGEX = r"(heberg|h[ee]bergement|g[ii]te|camping|hotel|h[oo]tel|centre|groupe|groupes|collectif)"


def main():
    parser = argparse.ArgumentParser(description="Build crawler config from seed URLs.")
    parser.add_argument("--seeds", required=True, help="TXT file with one URL per line")
    parser.add_argument("--out", required=True, help="Output JSON config")
    parser.add_argument("--max-depth", type=int, default=2)
    parser.add_argument("--max-pages", type=int, default=800)
    parser.add_argument("--delay", type=float, default=0.6)
    parser.add_argument("--user-agent", default="ColoCrewCrawler/1.0")
    parser.add_argument("--timeout", type=int, default=15)
    args = parser.parse_args()

    with open(args.seeds, "r", encoding="utf-8") as f:
        seeds = [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]

    sources = []
    for url in seeds:
        parsed = urlparse(url)
        if not parsed.scheme:
            url = "https://" + url
            parsed = urlparse(url)
        if not parsed.netloc:
            continue
        sources.append({
            "name": f"Seed {parsed.netloc}",
            "start_urls": [url],
            "allow_domains": [parsed.netloc],
            "url_allow_regex": DEFAULT_ALLOW_REGEX,
            "detail_url_regex": DEFAULT_DETAIL_REGEX,
        })

    config = {
        "min_capacity": 25,
        "include_unknown": True,
        "require_coast_keyword": False,
        "allow_unknown_dept": True,
        "dept_whitelist": ["33", "40", "64"],
        "coast_keywords": ["ocean", "plage", "cote", "littoral", "bord de mer", "front de mer"],
        "sources": sources,
        "crawl": {
            "max_depth": args.max_depth,
            "max_pages_per_domain": args.max_pages,
            "delay_seconds": args.delay,
            "timeout_seconds": args.timeout,
            "user_agent": args.user_agent,
            "respect_robots": True
        }
    }

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

    print(f"Seeds: {len(sources)} -> {args.out}")


if __name__ == "__main__":
    main()
