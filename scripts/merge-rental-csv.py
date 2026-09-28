#!/usr/bin/env python3
"""Merge a Funda/Pararius/Kamernet-style huur CSV into dist/listings.json with dedupe.
Supports Appartement, Huis, Studio, Kamer. Photos: CDN URLs only (no binary rehost).
Usage:
  python3 scripts/merge-rental-csv.py file.csv
  python3 scripts/merge-rental-csv.py --surgical file.csv   # append-only, no addr collapse
"""
import csv, json, re, sys
from pathlib import Path
from collections import OrderedDict, Counter


def truthy_flag(v):
    return str(v or '').strip().lower() in ('1', 'true', 'yes', 'y')

def detect_is_new(row, source=''):
    """Source-market 'new' signals (not scrapedAt). Funda has none."""
    if truthy_flag(row.get('isNewAdvert')):
        return True
    if truthy_flag(row.get('isNew')):
        return True
    for k in ('listingLabel', 'labels/0', 'label'):
        if str(row.get(k) or '').strip().lower() == 'nieuw':
            return True
    for k, v in row.items():
        if str(k).startswith('labels/') and str(v or '').strip().lower() == 'nieuw':
            return True
    if str(row.get('status') or '').strip().lower() == 'nieuw':
        return True
    return False

REPO = Path(__file__).resolve().parents[1]
DATA_FULL = REPO / 'data' / 'listings.full.json'
DIST_FULL = REPO / 'dist' / 'listings.full.json'
PUBLIC = REPO / 'dist' / 'listings.json'
SOURCE_FIELDS = ('url', 'sourceUrl', 'originalUrl', 'listingUrl', 'externalUrl')


def write_outputs(listings):
    """Sync full feeds and keep the browser-served feed source-redacted."""
    text = json.dumps(listings, ensure_ascii=False, indent=2) + '\n'
    DATA_FULL.write_text(text, encoding='utf-8')
    DIST_FULL.write_text(text, encoding='utf-8')
    public = []
    for listing in listings:
        row = dict(listing)
        for key in SOURCE_FIELDS:
            if key in row:
                row[key] = ''
        public.append(row)
    PUBLIC.write_text(json.dumps(public, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def norm_url(u):
    return (u or '').strip().rstrip('/').split('?')[0].split('#')[0].lower()

def funda_id(url):
    m = re.search(r'/(\d+)/?$', (url or '').rstrip('/'))
    return m.group(1) if m else None

def pararius_id(url):
    m = re.search(r'pararius\.nl/[^/]+/[^/]+/([0-9a-f]{8})/', url or '', re.I)
    return m.group(1).lower() if m else None

def kamernet_id(url):
    m = re.search(r'(?:room|studio|apartment|house)-(\d+)/?$', url or '', re.I)
    return m.group(1) if m else None

def addr_key(address, postal, city):
    a = re.sub(r'\s+', ' ', (address or '').strip().lower())
    pc = re.sub(r'\s+', '', (postal or '').upper())
    c = (city or '').strip().lower()
    return f'{a}|{pc}|{c}'

def dedupe_key(row):
    url = norm_url(row.get('url'))
    if 'funda.nl' in url:
        fid = funda_id(url)
        return f'funda:{fid}' if fid else f'url:{url}'
    if 'pararius.nl' in url:
        pid = pararius_id(url)
        return f'pararius:{pid}' if pid else f'url:{url}'
    if 'kamernet.nl' in url:
        kid = kamernet_id(url) or str(row.get('listingId') or '').strip()
        return f'kamernet:{kid}' if kid else f'url:{url}'
    return f'url:{url}' if url else f'addr:{addr_key(row.get("address"), row.get("postalCode"), row.get("city"))}'

def infer_type(url, title, explicit=''):
    if explicit in ('Appartement', 'Huis', 'Studio', 'Kamer'):
        return explicit
    lt = (explicit or '').strip().lower()
    if lt in ('room', 'kamer'):
        return 'Kamer'
    if lt == 'studio':
        return 'Studio'
    if lt in ('apartment', 'appartement', 'flat'):
        return 'Appartement'
    if lt in ('house', 'huis'):
        return 'Huis'
    u = (url or '').lower()
    t = (title or '').lower()
    if 'studio-te-huur' in u or '/studio-' in u or t.startswith('studio'):
        return 'Studio'
    if ('kamer-te-huur' in u or t.startswith('kamer') or '/kamer-' in u
            or '/room-' in u or '/for-rent/room' in u):
        return 'Kamer'
    if ('appartement' in u or t.startswith('appartement') or '/apartment-' in u
            or '/for-rent/apartment' in u):
        return 'Appartement'
    if ('huis-te-huur' in u or t.startswith('huis') or '/house-' in u
            or '/for-rent/house' in u):
        return 'Huis'
    return 'Appartement'

def address_from_title(title):
    t = (title or '').strip()
    for prefix in ['Appartement ', 'Huis ', 'Studio ', 'Kamer ', 'Apartment ', 'House ', 'Room ']:
        if t.startswith(prefix):
            return t[len(prefix):].strip()
    return t

def canonical_photo_url(value):
    """Keep portal-hosted originals; upgrade Funda's sized path to its max asset."""
    url = (value or '').strip()
    if not url.startswith('https://'):
        return ''
    if '://cloud.funda.nl/' in url.lower():
        # Funda's _1920x1280 route returns the largest available source asset
        # (and leaves genuinely smaller uploads unchanged). The UI may derive
        # responsive card/thumb variants without changing this stored URL.
        url = re.sub(
            r'_\d{2,5}x\d{2,5}(?=\.(?:jpe?g)(?:[?#]|$))',
            '_1920x1280',
            url,
            flags=re.I,
        )
    return url


def collect_photos(row):
    seen, out = set(), []
    # Prefer explicit original/photo arrays. `thumbnail` remains a last-resort
    # compatibility input; canonical_photo_url upgrades any sized Funda URL.
    keys = ['photo', 'photoUrl', 'imageUrl', 'images/0'] + [
        k for k in row if re.match(r'^(photos|images|imageUrls)/\d+$', k)
    ] + ['thumbnail']
    for k in keys:
        v = canonical_photo_url(row.get(k))
        if v and v not in seen:
            seen.add(v)
            out.append(v)
    return out

def to_listing(row):
    url = (row.get('url') or '').strip()
    if not url:
        return None
    title = (row.get('title') or '').strip()
    ptype = infer_type(url, title, (row.get('propertyType') or row.get('listingType') or '').strip())
    if ptype == 'Parkeergelegenheid':
        return None
    photos = collect_photos(row)
    price = row.get('priceMonthly') or row.get('totalRentalPrice') or row.get('price') or ''
    try:
        price = str(int(float(str(price).replace(',', '.')))) if str(price).strip() else ''
    except Exception:
        price = str(price).strip()
    beds = (row.get('bedrooms') or row.get('numOfBedrooms') or '').strip()
    if not beds:
        if ptype == 'Studio':
            beds = '0'
        elif ptype == 'Kamer':
            beds = '1'
    city = (row.get('city') or row.get('addressLocality') or '').strip()
    address = (row.get('streetAddress') or row.get('address') or '').strip()
    if not address:
        street = (row.get('street') or '').strip()
        hn = (row.get('houseNumber') or '').strip()
        address = (f'{street} {hn}'.strip() if street else '') or address_from_title(title)
    if 'pararius.nl' in url:
        source = 'pararius'
    elif 'funda.nl' in url:
        source = 'funda'
    elif 'kamernet.nl' in url:
        source = 'kamernet'
    else:
        source = (row.get('source') or '')
    listing = {
        'address': address, 'balcony': '', 'bedrooms': beds, 'brokerId': '',
        'brokerName': (row.get('agencyName') or row.get('brokerName') or '').strip(),
        'buildType': (row.get('constructionType') or row.get('buildingType') or row.get('buildType') or '').strip(),
        'city': city,
        'description': (row.get('description') or row.get('descriptionMarkdown') or title or '').strip(),
        'energyEfficient': '', 'energyLabel': (row.get('energyLabel') or '').strip(),
        'garden': '', 'heatPump': '', 'leasehold': '', 'listingType': 'huur',
        'livingArea': (row.get('surface') or row.get('surfaceArea') or row.get('livingArea') or row.get('livingAreaM2') or '').strip(),
        'municipality': city.lower() if city else '',
        'nationalMonument': 'false',
        'neighbourhood': (row.get('neighbourhood') or row.get('addressRegion') or '').strip(),
        'photo': photos[0] if photos else '', 'photoCount': str(len(photos)),
        'plotArea': '', 'postalCode': re.sub(r'\s+', '', (row.get('postalCode') or '')).upper(),
        'price': price, 'priceCurrency': (row.get('priceCurrency') or row.get('currency') or 'EUR').strip() or 'EUR',
        'priceType': 'rent_per_month', 'privateParking': '', 'propertyType': ptype,
        'province': (row.get('province') or '').strip(), 'roofTerrace': '',
        'rooms': (row.get('rooms') or row.get('numOfRooms') or '').strip(),
        'scrapedAt': (row.get('scrapedAt') or '').strip(), 'solarPanels': '',
        'status': (row.get('status') or row.get('listingLabel') or 'beschikbaar').strip() or 'beschikbaar',
        'url': url, 'yearBuilt': (row.get('constructionYear') or row.get('yearBuilt') or '').strip(),
        'source': source,
        'isNew': detect_is_new(row, source),
        'publishDate': (row.get('publishDate') or row.get('listedDate') or row.get('createDate') or '').strip(),
    }
    for i in range(max(6, len(photos))):
        listing[f'photos/{i}'] = photos[i] if i < len(photos) else ''
    return listing

def surgical_import(csv_path, existing):
    """Append-only: never re-dedupe/collapse the existing feed by address."""
    stats = Counter()
    existing_keys = set()
    for row in existing:
        existing_keys.add(dedupe_key(row))
        u = norm_url(row.get('url'))
        if u:
            existing_keys.add(f'url:{u}')
    added = []
    with csv_path.open(newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            listing = to_listing(row)
            if not listing:
                stats['skip'] += 1
                continue
            if not (listing.get('photo') or '').strip():
                stats['skip_no_photo'] += 1
                continue
            key = dedupe_key(listing)
            u = norm_url(listing.get('url'))
            if key in existing_keys or (u and f'url:{u}' in existing_keys):
                stats['dup'] += 1
                continue
            existing_keys.add(key)
            if u:
                existing_keys.add(f'url:{u}')
            added.append(listing)
            stats['entered'] += 1
    return existing + added, stats

def main():
    if len(sys.argv) < 2:
        print('Usage: merge-rental-csv.py [--surgical] file.csv', file=sys.stderr)
        sys.exit(2)
    args = sys.argv[1:]
    surgical = False
    if args and args[0] == '--surgical':
        surgical = True
        args = args[1:]
    if not args:
        print('Usage: merge-rental-csv.py [--surgical] file.csv', file=sys.stderr)
        sys.exit(2)
    csv_path = Path(args[0])
    existing = json.loads(DATA_FULL.read_text(encoding='utf-8'))
    if surgical:
        final, stats = surgical_import(csv_path, existing)
        write_outputs(final)
        types = Counter(x.get('propertyType') for x in final)
        rooms = sum(1 for x in final if x.get('propertyType') in ('Kamer', 'Studio'))
        homes = sum(1 for x in final if x.get('propertyType') in ('Huis', 'Appartement'))
        print(json.dumps({
            'before': len(existing), 'after': len(final), 'stats': dict(stats),
            'types': dict(types), 'page': {'kamers': rooms, 'huizen': homes},
        }, indent=2))
        return

    by_key, order, addr_index = OrderedDict(), [], {}
    stats = Counter()

    def upsert(listing, prefer_new=False):
        key = dedupe_key(listing)
        ak = addr_key(listing.get('address'), listing.get('postalCode'), listing.get('city'))
        if ak.count('|') == 2 and ak not in ('||',) and not ak.startswith('|') and ak in addr_index and addr_index[ak] != key:
            key = addr_index[ak]
            prefer_new = False
        if key in by_key:
            old = by_key[key]
            merged = dict(old)
            for k, v in listing.items():
                if v is None or (isinstance(v, str) and not str(v).strip() and k not in ('isNew',)):
                    continue
                if k == 'isNew':
                    merged['isNew'] = bool(merged.get('isNew')) or bool(v)
                    continue
                if k == 'publishDate' and merged.get('publishDate') and not prefer_new:
                    continue
                if prefer_new or not merged.get(k):
                    merged[k] = v
            old_p, new_p = collect_photos(old), collect_photos(listing)
            photos = new_p if len(new_p) > len(old_p) else old_p
            merged['photo'] = photos[0] if photos else merged.get('photo', '')
            merged['photoCount'] = str(len(photos))
            for i in range(max(6, len(photos))):
                merged[f'photos/{i}'] = photos[i] if i < len(photos) else ''
            by_key[key] = merged
            return 'overlay'
        by_key[key] = listing
        order.append(key)
        if ak.count('|') == 2 and ak != '||' and not ak.startswith('|'):
            addr_index[ak] = key
        return 'add'

    for row in existing:
        if 'source' not in row:
            row = {**row, 'source': 'funda' if 'funda.nl' in (row.get('url') or '') else row.get('source', '')}
        stats['existing_' + upsert(row)] += 1

    with csv_path.open(newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            listing = to_listing(row)
            if not listing:
                stats['skip'] += 1
                continue
            if not (listing.get('photo') or '').strip():
                stats['skip_no_photo'] += 1
                continue
            stats['csv_' + upsert(listing, prefer_new=True)] += 1

    final = [by_key[k] for k in order]
    write_outputs(final)
    types = Counter(x.get('propertyType') for x in final)
    print(json.dumps({'before': len(existing), 'after': len(final), 'stats': dict(stats), 'types': dict(types)}, indent=2))

if __name__ == '__main__':
    main()
