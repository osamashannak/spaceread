#!/usr/bin/env python3
"""Collect Zayed University's public teaching-faculty directory (no DB writes).

Python standard library only. Fetches the seven college directories and their
linked campus/department directories, then published profile email addresses.
The JSON is a reviewable snapshot, not an assertion of current employment.

Run from services:
  python scripts/collect_zayed_faculty.py --output data/zayed_faculty.json
  python -m unittest discover -s scripts -p 'test_collect_zayed_faculty.py'

Use --transport curl where Python's TLS stack cannot reach the university.
Cached public HTML lives in the system temp directory, outside the repository;
use --refresh to retrieve a fresh snapshot. Directory failures abort collection.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
import hashlib
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import tempfile
import time
from urllib.parse import quote, unquote, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen

BASE = 'https://www.zu.ac.ae/main/en/colleges/colleges/'
COLLEGES = {
    'College of Arts and Creative Enterprises': '__college_of_arts_and_creative_enterprises/faculty_and_staff/index',
    'College of Business': '__college_of_business/faculty_and_staff/index',
    'College of Communication and Media Sciences': '__college_of_comm_media_sciences/faculty-and-staff/index',
    'College of Humanities and Social Sciences': '__college_of_humanities_and_social_sciences/faculty_and_staff/index',
    'College of Interdisciplinary Studies': '__college_of_interdisciplinary_studies/faculty_and_staff/index',
    'College of Natural and Health Sciences': '__college_of_natural_and_health_sciences/faculty_and_staff/index',
    'College of Technological Innovation': '__college_of_technological_innovation/faculty_and_staff/index',
}
SUPPLEMENTAL_CONTACTS = ['https://www.zu.ac.ae/main/en/colleges/colleges/__college_of_technological_innovation/contactus']
TEACHING_RANK = re.compile(r'prof\w*sor|instructor|lecturer|faculty', re.I)
EMAIL_RE = re.compile(r'(?<![\w.+-])[A-Z0-9._%+-]+@zu\.ac\.ae\b', re.I)
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}


def clean(value: str) -> str:
    return ' '.join(unescape(value).replace('\xa0', ' ').split())


def normalize_name(value: str) -> str:
    value = clean(value.replace('_', ' '))
    value = re.sub(r'^(?:(?:Prof(?:essor)?|Dr|Ms|Mr)\.\s*|(?:Professor|Dr|Prof)\s+)+', '', value, flags=re.I)
    value = re.split(r'\s[-–]\s|,\s*(?:Adjunct|Assistant|Associate|Acting|Professor|Instructor|Chair|Dean|FHEA)', value, maxsplit=1, flags=re.I)[0]
    return value.strip(' ,')


def canonical_url(value: str, base: str = BASE) -> str:
    value = unescape(value).strip()
    parts = urlsplit(urljoin(base, value))
    if parts.hostname not in {'zu.ac.ae', 'www.zu.ac.ae'}:
        raise ValueError(f'Not an official ZU URL: {value}')
    path = unquote(parts.path).lower()
    path = re.sub(r'\.aspx$', '', path).rstrip('/')
    return urlunsplit(('https', 'www.zu.ac.ae', quote(path, safe='/@-._~'), '', ''))


@dataclass(eq=False)
class Node:
    tag: str
    attrs: dict[str, str] = field(default_factory=dict)
    children: list = field(default_factory=list)
    parent: Node | None = field(default=None, repr=False)

    @property
    def classes(self):
        return set(self.attrs.get('class', '').split())

    @property
    def raw_text(self):
        return ''.join(child.raw_text if isinstance(child, Node) else child for child in self.children)

    @property
    def text(self):
        return clean(' '.join(child.text if isinstance(child, Node) else child for child in self.children))

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()


class Document(HTMLParser):
    def __init__(self, markup: str):
        super().__init__(convert_charrefs=True)
        self.root = Node('document')
        self.stack = [self.root]
        self.feed(markup)
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Node(tag, dict(attrs), parent=self.stack[-1])
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)

    def content(self):
        return next((n for n in self.root.walk() if n.attrs.get('id') == 'readable'), self.root)


def parse_directory(markup: str, url: str, college: str):
    """Return teaching cards, excluded staff cards, and canonical child listings."""
    doc = Document(markup)
    teaching, staff, children = [], [], set()
    section = 'Faculty'
    root = canonical_url(BASE + COLLEGES[college]).rsplit('/', 1)[0] + '/'
    for node in doc.content().walk():
        if node.tag in {'h2', 'h3', 'h4'} and 'media-heading' not in node.classes:
            label = node.text
            if 'ar-static-heading' not in node.classes and label and re.search('[A-Za-z]', label):
                section = label
        if node.tag != 'a':
            continue
        href = node.attrs.get('href', '') or ''
        if 'inside-media-body' in node.classes:
            heading = next((n for n in node.walk() if 'media-heading' in n.classes), None)
            name = normalize_name(heading.text if heading else '')
            if not name or not href.strip():
                continue
            profile_url = canonical_url(href, url)
            rank = ' '.join(n.text for n in node.walk() if n.tag == 'p' and 'design' not in n.classes)
            position = ' '.join(n.text for n in node.walk() if n.tag == 'p' and 'design' in n.classes)
            card = {'name': name, 'college': college, 'section': section, 'rank': rank, 'position': position, 'profile_url': profile_url, 'directory_url': url}
            is_staff = bool(re.search(r'\bstaff\b', section, re.I)) and not re.search(r'faculty\s+and\s+staff', section, re.I)
            non_teaching_role = re.search(r'officer|technician|administrative assistant|lab architect|studio assistant', rank + ' ' + position, re.I)
            is_staff = is_staff or (bool(non_teaching_role) and not TEACHING_RANK.search(rank + ' ' + position))
            (staff if is_staff else teaching).append(card)
        elif href.strip() and not href.startswith(('#', 'mailto:', 'javascript:')):
            try:
                child = canonical_url(href, url)
            except ValueError:
                continue
            # Follow only directory links under this college's active faculty root.
            # _profiles/index and _links/index are stale CMS template copies.
            if child.startswith(root) and child.endswith('/index') and not re.search(r'/(?:_profiles|_links)/', child) and child != url:
                children.add(child)
    return teaching, staff, sorted(children)


def email_addresses(value: str):
    # Normalize formatting whitespace only; never construct an address from names.
    value = re.sub(r'\s*@\s*', '@', unescape(unquote(value)))
    return {email.lower() for email in EMAIL_RE.findall(value)}


def extract_profile(markup: str):
    doc = Document(markup)
    content = doc.content()
    labelled_visible, labelled_href, visible, mailto = set(), set(), set(), set()
    has_email_label = False
    for node in content.walk():
        if node.tag == 'a':
            href = unescape(node.attrs.get('href', '') or '').strip()
            if href.lower().startswith('mailto:'):
                mailto.update(email_addresses(href))
                visible.update(email_addresses(node.raw_text))
            if 'email' in node.classes:
                has_email_label = True
                labelled_visible.update(email_addresses(node.raw_text))
                if href.lower().startswith('mailto:'):
                    labelled_href.update(email_addresses(href))
        if node.tag in {'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'label', 'p'} and node.text.lower().strip(': ') == 'email':
            has_email_label = True
            label = node
            # Legacy pages wrap <strong>Email</strong> inside a paragraph.
            while label.parent and label.parent.text == node.text:
                label = label.parent
            siblings = label.parent.children if label.parent else []
            position = siblings.index(label)
            following = []
            for sibling in siblings[position + 1:]:
                if isinstance(sibling, Node) and sibling.tag in {'h3', 'h4', 'h5', 'h6'}:
                    break
                if isinstance(sibling, Node) and sibling.raw_text.strip():
                    following.append(sibling)
                    # A paragraph holds the full email, including split inline links.
                    if sibling.tag == 'p' or len(following) >= 2:
                        break
            labelled_visible.update(email_addresses(''.join(n.raw_text for n in following)))
    # Some CMS profiles have stale mailto targets; visible contact text wins.
    emails = labelled_visible or labelled_href
    if not emails and not has_email_label:
        emails = visible or mailto
    title = next((n.text for n in doc.root.walk() if n.tag == 'title'), '')
    title = normalize_name(re.split(r'\s[|]\s', title)[0])
    if re.fullmatch(r'(?:faculty(?: and staff)?|staff|zayed university|not found|error)', title, re.I):
        title = ''
    return sorted(emails), title


def parse_contact_directory(markup: str):
    """Read explicit name/email table rows, excluding contact form endpoints."""
    contacts = []
    for row in Document(markup).content().walk():
        if row.tag != 'tr':
            continue
        cells = [n for n in row.children if isinstance(n, Node) and n.tag == 'td']
        if len(cells) != 2 or not cells[0].text:
            continue
        emails = set()
        for node in cells[1].walk():
            href = (node.attrs.get('href') or '').strip()
            if node.tag == 'a' and href.lower().startswith('mailto:'):
                emails.update(email_addresses(node.raw_text) or email_addresses(href))
        if len(emails) == 1:
            contacts.append({'name': normalize_name(cells[0].text), 'email': next(iter(emails))})
    return contacts


def name_key(name: str):
    return re.sub(r'[^\w]', '', normalize_name(name).casefold())


def has_teaching_rank(markup: str):
    return any(TEACHING_RANK.search(node.text) for node in Document(markup).content().walk() if node.tag in {'h3', 'h4', 'h5', 'h6'})


class Fetcher:
    def __init__(self, cache_dir: Path, transport='urllib', refresh=False):
        self.cache_dir, self.transport, self.refresh = cache_dir, transport, refresh
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def __call__(self, url: str):
        cache = self.cache_dir / (hashlib.sha256(url.encode()).hexdigest() + '.html')
        if not self.refresh and cache.exists() and time.time() - cache.stat().st_mtime < 86400:
            return cache.read_text(encoding='utf-8')
        error = None
        for attempt in range(3):
            try:
                if self.transport == 'curl':
                    result = subprocess.run(['curl', '--silent', '--show-error', '--fail', '--location', '--proto', '=https', '--proto-redir', '=https', '--max-time', '45', url], capture_output=True, check=True)
                    body = result.stdout
                else:
                    req = Request(url, headers={'User-Agent': 'SpaceRead faculty directory collector; public academic profiles'})
                    with urlopen(req, timeout=45) as response:
                        canonical_url(response.url)  # Reject an unexpected external redirect.
                        body = response.read()
                markup = body.decode('utf-8-sig', errors='replace')
                if '<html' not in markup.lower():
                    raise ValueError('Response is not an HTML page')
                cache.write_text(markup, encoding='utf-8')
                return markup
            except Exception as exc:
                error = exc
                if attempt < 2:
                    time.sleep(attempt + 1)
        if isinstance(error, subprocess.CalledProcessError):
            raise RuntimeError(error.stderr.decode('utf-8', errors='replace').strip())
        raise RuntimeError(str(error))


def compatible_names(left: str, right: str):
    """Permit spelling/middle-name variants, never just a shared common name."""
    if name_key(left) == name_key(right):
        return True
    def tokens(value):
        return [token.removeprefix('al') for token in re.findall(r'\w+', value.casefold()) if token not in {'al', 'el'}]
    a, b = tokens(left), tokens(right)
    if min(len(a), len(b)) < 2:
        return False
    if set(a) <= set(b) or set(b) <= set(a):
        return True
    def matches(x, y):
        return x == y or (min(len(x), len(y)) >= 4 and SequenceMatcher(None, x, y).ratio() >= 0.85)
    return matches(a[0], b[0]) and matches(a[-1], b[-1]) and SequenceMatcher(None, name_key(left), name_key(right)).ratio() >= 0.85


def merge_faculty(records):
    """One faculty identity per published email, with every source affiliation."""
    merged = {}
    for record in sorted(records, key=lambda row: (row['name'].casefold(), row['name'])):
        email = record['email'].lower().strip()
        current = merged.setdefault(email, {'name': record['name'], 'email': email, 'colleges': set(), 'source_urls': set()})
        if not compatible_names(current['name'], record['name']):
            raise ValueError(f"Conflicting identities share {email}: {current['name']} / {record['name']}; review the published source before importing")
        current['colleges'].update(record['colleges'])
        current['source_urls'].update(record['source_urls'])
        # Prefer a full name over an abbreviated spelling; keep first on ties.
        if len(record['name'].split()) > len(current['name'].split()):
            current['name'] = record['name']
    return [dict(value, colleges=sorted(value['colleges']), source_urls=sorted(value['source_urls'])) for _, value in sorted(merged.items(), key=lambda pair: (pair[1]['name'].casefold(), pair[0]))]


def collect(fetch, workers=6):
    profiles, coverage, exclusions = {}, [], []
    directory_jobs = [(college, canonical_url(BASE + suffix)) for college, suffix in COLLEGES.items()]
    visited = set()
    while directory_jobs:
        batch, directory_jobs = directory_jobs, []
        with ThreadPoolExecutor(max_workers=workers) as pool:
            pending = {pool.submit(fetch, url): (college, url) for college, url in batch if url not in visited}
            for future in as_completed(pending):
                college, url = pending[future]
                visited.add(url)
                # Directory failure must abort: a snapshot missing a college is unsafe.
                teaching, staff, children = parse_directory(future.result(), url, college)
                if not teaching and not children:
                    raise ValueError(f'Directory has no teaching cards or child directories: {url}')
                coverage.append({'college': college, 'url': url, 'teaching_entries': len(teaching), 'staff_entries': len(staff), 'child_directories': children})
                for card in teaching:
                    profiles.setdefault(card['profile_url'], []).append(card)
                exclusions.extend({'name': card['name'], 'colleges': [college], 'source_urls': [url, card['profile_url']], 'reason': 'non_teaching_staff'} for card in staff)
                directory_jobs.extend((college, child) for child in children if child not in visited)
        print(f'Directories: {len(visited)}; unique teaching profile URLs: {len(profiles)}', flush=True)
    records, name_variants = [], {}
    supplemental_coverage = []
    for source in SUPPLEMENTAL_CONTACTS:
        contacts = parse_contact_directory(fetch(source))
        if not contacts:
            raise ValueError(f'Supplemental contact directory has no email/name rows: {source}')
        matched = 0
        for contact in contacts:
            cards = [card for group in profiles.values() for card in group if name_key(card['name']) == name_key(contact['name'])]
            if not cards:
                continue  # Current directory membership is required.
            matched += 1
            records.append(dict(contact, colleges=sorted({card['college'] for card in cards}), source_urls=sorted({source} | {card['profile_url'] for card in cards} | {card['directory_url'] for card in cards})))
            name_variants.setdefault(contact['email'], set()).update([contact['name']] + [card['name'] for card in cards])
        supplemental_coverage.append({'url': source, 'published_contacts': len(contacts), 'matched_current_faculty': matched})
    with ThreadPoolExecutor(max_workers=workers) as pool:
        pending = {pool.submit(fetch, url): url for url in profiles}
        for index, future in enumerate(as_completed(pending), 1):
            url = pending[future]
            cards = profiles[url]
            colleges = sorted({card['college'] for card in cards})
            sources = sorted({url} | {card['directory_url'] for card in cards})
            name = cards[0]['name']
            try:
                markup = future.result()
                page_title = next((n.text for n in Document(markup).root.walk() if n.tag == 'title'), '')
                if re.search(r'page.*not found|404|page.*unavailable', page_title, re.I):
                    raise ValueError('Official profile returns a page-not-found template')
                if all(not TEACHING_RANK.search(card['rank'] + ' ' + card['position']) and re.search('administrator|chair', card['section'], re.I) for card in cards) and not has_teaching_rank(markup):
                    exclusions.append({'name': name, 'colleges': colleges, 'source_urls': sources, 'reason': 'academic_administrator_without_verified_teaching_rank'})
                    continue
                emails, profile_name = extract_profile(markup)
                if len(emails) != 1:
                    exclusions.append({'name': name, 'colleges': colleges, 'source_urls': sources, 'reason': 'missing_published_email' if not emails else 'ambiguous_published_email', 'published_emails': emails})
                    continue
                # Current directory display names are authoritative. Profile titles
                # can contain obsolete surnames, role suffixes, or malformed text.
                records.append({'name': name, 'email': emails[0], 'colleges': colleges, 'source_urls': sources})
                name_variants.setdefault(emails[0], set()).update([name] + [card['name'] for card in cards])
            except Exception as exc:
                exclusions.append({'name': name, 'colleges': colleges, 'source_urls': sources, 'reason': 'profile_unavailable', 'detail': str(exc)})
            finally:
                if index % 25 == 0 or index == len(pending):
                    print(f'Profiles: {index}/{len(pending)}; usable: {len(records)}', flush=True)
    # Reuse a verified address from another official profile only when its exact
    # normalized name identifies one email. This reconciles duplicate CMS paths
    # and shared college appointments without guessing an email address.
    name_index = {}
    for email, variants in name_variants.items():
        for variant in variants:
            key = name_key(variant)
            name_index.setdefault(key, set()).add(email)
    reconciled = []
    remaining = []
    for entry in exclusions:
        key = name_key(entry['name'])
        matches = name_index.get(key, set())
        if entry['reason'] in {'missing_published_email', 'profile_unavailable', 'academic_administrator_without_verified_teaching_rank'} and len(matches) == 1:
            email = next(iter(matches))
            record = next(record for record in records if record['email'] == email)
            records.append(dict(record, colleges=entry['colleges'], source_urls=sorted(set(entry['source_urls']) | set(record['source_urls']))))
            reconciled.append({'name': entry['name'], 'email': email, 'source_urls': entry['source_urls'], 'reason': 'exact_name_matches_verified_official_profile'})
        else:
            remaining.append(entry)
    exclusions = remaining
    # A person listed in staff and faculty is included through their teaching role.
    teaching_urls = set(profiles)
    exclusions = [e for e in exclusions if e['reason'] != 'non_teaching_staff' or not teaching_urls.intersection(e['source_urls'])]
    return {
        'university': 'Zayed University',
        'retrieved_at': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'source_index': 'https://www.zu.ac.ae/main/en/colleges/index',
        'supplemental_coverage': supplemental_coverage,
        'coverage': sorted(coverage, key=lambda row: (row['college'], row['url'])),
        'faculty': merge_faculty(records),
        'exclusions': sorted(exclusions, key=lambda row: (row['reason'], row['name'].casefold())),
        'reconciled_profiles': sorted(reconciled, key=lambda row: row['name'].casefold()),
        'name_variants': [{'email': email, 'names': sorted(names)} for email, names in sorted(name_variants.items()) if len(names) > 1],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'data' / 'zayed_faculty.json')
    parser.add_argument('--cache-dir', type=Path, default=Path(tempfile.gettempdir()) / 'spaceread-zayed-faculty')
    parser.add_argument('--workers', type=int, default=6)
    parser.add_argument('--transport', choices=['urllib', 'curl'], default='urllib')
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    if not 1 <= args.workers <= 12:
        parser.error('--workers must be between 1 and 12')
    manifest = collect(Fetcher(args.cache_dir, args.transport, args.refresh), args.workers)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Wrote {len(manifest['faculty'])} faculty and {len(manifest['exclusions'])} exclusions to {args.output}")


if __name__ == '__main__':
    main()
