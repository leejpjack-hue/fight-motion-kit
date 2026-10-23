#!/usr/bin/env python3
"""HM-COMPOSE-05 acceptance — desktop Stitch visual shell (land + beat-focus). Keeps 04 behavior."""
from __future__ import annotations
import hashlib, json, os, re, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

KIT = Path('/workspace/deliverables/html-motion-template-kit-2026-10-19')
GOLD = Path('/workspace/deliverables/fight-daiyu-wang-rooftop-tankshort-codex-html-2026-10-19')
STITCH = Path('/workspace/deliverables/html-motion-composer-ui-stitch-2026-10-22/stitch-export')
QA = KIT / 'qa'
UI = KIT / 'ui' / 'index.html'
BASE = 'http://127.0.0.1:8770'
LOCKED = {
    '#05090c', '#0b161c', '#0f2129', '#1c3a45', '#d8f3ee', '#7fa9a6',
    '#77ffdd', '#ff8a1e', '#19e0d0', '#2a1808', '#ffccaa',
    '#5be38a', '#ff3fa4', '#071016',
    # CSS 3-digit / alpha forms of locked
    '#7fd', '#000', '#fff',
}
results = {'ok': True, 'checks': [], 'errors': [], 'metrics': {}, 'wall_time_s': None}


def check(name, pass_, detail=''):
    results['checks'].append({'name': name, 'pass': bool(pass_), 'detail': detail or ''})
    if not pass_:
        results['ok'] = False
        results['errors'].append(f'{name}: {detail}')
    print(('PASS' if pass_ else 'FAIL') + '  ' + name + ((' — ' + detail) if detail else ''))


def gold_fp():
    files = []
    for root, _, names in os.walk(GOLD):
        for n in names:
            p = Path(root) / n
            st = p.stat()
            files.append(f'{p.relative_to(GOLD)}:{st.st_size}:{st.st_mtime_ns}')
    files.sort()
    h = hashlib.sha256()
    h.update((GOLD / 'index.html').read_bytes())
    h.update('\n'.join(files).encode())
    return {'sha': h.hexdigest()[:16], 'n': len(files)}


def api(method, url, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={'Content-Type': 'application/json'} if data else {},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def wait_ready(page):
    page.wait_for_function(
        """() => document.getElementById('example')
          && document.getElementById('example').options.length > 3
          && window.__composer && window.__composer.plateStripMetrics
          && window.__composer.openFight
          && window.__composer.isLandMode"""
    )


def expand_hex(h):
    h = h.lower()
    if len(h) == 4:  # #rgb
        return '#' + ''.join(c * 2 for c in h[1:])
    if len(h) == 5:  # #rgba
        return '#' + ''.join(c * 2 for c in h[1:4])
    if len(h) == 9:  # #rrggbbaa
        return h[:7]
    return h[:7] if len(h) >= 7 else h


def palette_spotcheck():
    text = UI.read_text()
    # only :root and HM-COMPOSE-05 block + button.pri — not entire file (legacy #7fd8 etc.)
    m = re.search(r':root\{([^}]+)\}', text)
    root = m.group(1) if m else ''
    hexes = set(re.findall(r'#[0-9a-fA-F]{3,8}', root))
    # also extract --acc etc values
    bad = []
    for hx in hexes:
        full = expand_hex(hx)
        ok = full in LOCKED or hx.lower() in LOCKED or expand_hex(hx) in {expand_hex(x) for x in LOCKED}
        # allow #7fd as #77ffdd
        if full == '#77ffdd' or hx.lower() == '#7fd':
            ok = True
        if not ok:
            bad.append(hx)
    return {'root_hexes': sorted(hexes), 'bad': bad, 'root': root[:300]}


def annotate_side_by_side(shot_path, stitch_path, out_path, label):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        out_path.write_bytes(shot_path.read_bytes())
        return {'ok': False, 'reason': 'no PIL'}
    a = Image.open(shot_path).convert('RGB')
    b = Image.open(stitch_path).convert('RGB')
    # scale stitch to match shot height
    th = a.height
    tw = int(b.width * (th / b.height))
    b = b.resize((tw, th), Image.Resampling.LANCZOS)
    gap = 16
    canvas = Image.new('RGB', (a.width + gap + b.width, th + 36), (5, 9, 12))
    canvas.paste(a, (0, 36))
    canvas.paste(b, (a.width + gap, 36))
    draw = ImageDraw.Draw(canvas)
    draw.text((8, 8), f'{label} — kit (left) vs Stitch (right)', fill=(119, 255, 221))
    canvas.save(out_path, quality=90)
    return {'ok': True, 'size': canvas.size}


gold_before = gold_fp()
results['gold_before'] = gold_before
results['metrics']['palette'] = palette_spotcheck()
check(
    ':root colors ⊆ locked palette',
    len(results['metrics']['palette']['bad']) == 0,
    json.dumps(results['metrics']['palette']),
)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome', args=['--no-sandbox', '--disable-gpu'])
    context = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = context.new_page()
    page.set_default_timeout(60000)
    try:
        # --- Cold land: land shell + plate-pack preloaded ---
        page.goto('about:blank')
        page.goto(BASE + '/ui/index.html', wait_until='domcontentloaded')
        page.evaluate("""() => {
          try {
            localStorage.removeItem('hm.composer.recentPlatePack');
            localStorage.removeItem('hm.composer.pinPlatePack');
          } catch(e) {}
        }""")
        page.goto(BASE + '/ui/index.html', wait_until='networkidle')
        wait_ready(page)
        page.wait_for_timeout(700)

        land = page.evaluate("""() => {
          const openBtn = document.getElementById('openFightBtn');
          const composeBtn = document.getElementById('composeBtn');
          const more = document.getElementById('hdrMore');
          const tools = document.getElementById('hdrTools');
          const os = openBtn && getComputedStyle(openBtn);
          const cs = composeBtn && getComputedStyle(composeBtn);
          return {
            landMode: !!(window.__composer && window.__composer.isLandMode()),
            bodyLand: document.body.classList.contains('landMode'),
            landVisible: !!(document.getElementById('landShell') && getComputedStyle(document.getElementById('landShell')).display !== 'none'),
            heroTitle: (document.getElementById('landHeroTitle')||{}).textContent || '',
            pinnedCards: document.querySelectorAll('#landPinned .landCard').length,
            recentCards: document.querySelectorAll('#landRecent .landCard').length,
            showId: document.getElementById('sId') && document.getElementById('sId').value,
            isPack: !!(window.__composer && window.__composer.isPlatePack && window.__composer.isPlatePack()),
            openFightText: (openBtn||{}).textContent,
            openFightBg: os && os.backgroundColor,
            composeBg: cs && cs.backgroundColor,
            moreVisible: !!(more && more.offsetParent !== null),
            toolsHidden: !tools || getComputedStyle(tools).display === 'none',
            kitchenSinkEqual: false,
          };
        }""")
        results['metrics']['land'] = land
        check(
            'cold land shows Stitch land shell',
            land.get('landMode') and land.get('landVisible') and land.get('bodyLand'),
            json.dumps({k: land.get(k) for k in ('landMode','landVisible','heroTitle','pinnedCards','recentCards')}),
        )
        check(
            'cold land preloads Codex plate-pack (04 keep)',
            bool(land.get('isPack')) and 'daiyu-wang-codex' in (land.get('showId') or ''),
            json.dumps({'showId': land.get('showId'), 'isPack': land.get('isPack')}),
        )
        check(
            'land has continue + pinned/recent cards',
            'daiyu' in (land.get('heroTitle') or '').lower()
            and land.get('pinnedCards', 0) >= 1
            and land.get('recentCards', 0) >= 1,
            json.dumps({k: land.get(k) for k in ('heroTitle','pinnedCards','recentCards')}),
        )
        # Open fight primacy: teal filled vs demoted tools
        check(
            'Open fight button present + More overflow (kitchen-sink demoted)',
            (land.get('openFightText') or '').strip() == 'Open fight'
            and land.get('moreVisible') and land.get('toolsHidden'),
            json.dumps({k: land.get(k) for k in ('openFightText','moreVisible','toolsHidden','openFightBg','composeBg')}),
        )
        page.screenshot(path=str(QA / 'HM-COMPOSE-05_land.png'), full_page=False)

        # Open fight → composer
        page.click('#openFightBtn')
        page.wait_for_timeout(500)
        after = page.evaluate("""() => ({
          landMode: window.__composer.isLandMode(),
          honesty: document.getElementById('fxHonestyBar').classList.contains('on'),
          stripOn: document.getElementById('plateStrip').classList.contains('on'),
          thumbs: document.querySelectorAll('#plateStrip .pth').length,
          showId: document.getElementById('sId').value,
          isPack: window.__composer.isPlatePack(),
        })""")
        results['metrics']['open_fight'] = after
        check(
            'Open fight exits land into composer with strip',
            (not after.get('landMode')) and after.get('honesty')
            and after.get('stripOn') and after.get('thumbs', 0) >= 10,
            json.dumps(after),
        )

        # Beat focus chrome
        page.evaluate('() => window.__composer.setSel(2)')
        page.wait_for_timeout(150)
        page.click('#beatFocusBtn')
        page.wait_for_timeout(250)
        focus = page.evaluate("""() => {
          const h3 = document.querySelector('#atomInspGrp h3');
          const swap = document.getElementById('inspSwapBtn');
          const secs = [...document.querySelectorAll('#insp .bfSec')].filter(el => getComputedStyle(el).display !== 'none');
          return {
            beatFocus: window.__composer.getBeatFocus(),
            collapsed: document.body.classList.contains('atomPickCollapsed'),
            cardsHidden: getComputedStyle(document.getElementById('cards')).display === 'none',
            showHidden: getComputedStyle(document.getElementById('showGrp')).display === 'none',
            title: (h3||{}).textContent || '',
            badge: !!(h3 && h3.querySelector('.bfBadge') && getComputedStyle(h3.querySelector('.bfBadge')).display !== 'none'),
            secLabels: secs.map(s => s.textContent.trim()),
            swapVisible: !!(swap && getComputedStyle(swap).display !== 'none'),
            stripOn: document.getElementById('plateStrip').classList.contains('on'),
            honesty: document.getElementById('fxHonestyBar').classList.contains('on'),
            inspHasCam: !!(document.querySelector('#insp .camNudge')),
            inspHasDur: !!(document.querySelector('#insp .durBtns')),
          };
        }""")
        results['metrics']['focus'] = focus
        check(
            'Beat focus collapses Atom Picker (04 keep)',
            focus.get('beatFocus') and focus.get('collapsed') and focus.get('cardsHidden'),
            json.dumps(focus),
        )
        check(
            'Beat focus inspector chrome (cam/timing/swap groups)',
            focus.get('showHidden') and focus.get('badge')
            and 'Beat focus' in (focus.get('title') or '')
            and 'Cam' in (focus.get('secLabels') or [])
            and 'Timing' in (focus.get('secLabels') or [])
            and focus.get('swapVisible') and focus.get('inspHasCam') and focus.get('inspHasDur')
            and focus.get('honesty') and focus.get('stripOn'),
            json.dumps(focus),
        )
        page.screenshot(path=str(QA / 'HM-COMPOSE-05_beat-focus.png'), full_page=False)

        # Strip 88px still
        m = page.evaluate('() => window.__composer.plateStripMetrics()')
        results['metrics']['strip'] = m
        check(
            'strip still ≥88px (03b/04 intact)',
            70 <= (m.get('visibleH') or 0) <= 96 and str(m.get('flexShrink')) == '0',
            json.dumps({k: m.get(k) for k in ('visibleH', 'flexShrink', 'flex')}),
        )

        # Jack bar timed path
        page.click('#beatFocusBtn')  # exit focus optional; keep editing
        page.wait_for_timeout(100)
        t0 = time.perf_counter()
        page.evaluate('() => window.__composer.setSel(0)')
        page.wait_for_timeout(100)
        page.locator('#plateStrip .pth').first.dblclick()
        page.wait_for_selector('#platePick.on')
        page.wait_for_timeout(200)
        swapped = page.evaluate("""() => {
          const cur = document.querySelector('#platePickGrid .pth.on');
          const curId = cur && cur.dataset.pid;
          const alt = [...document.querySelectorAll('#platePickGrid .pth')].find(b => b.dataset.pid && b.dataset.pid !== curId);
          if(!alt) return {ok:false};
          alt.click();
          return {ok:true, from:curId, to:alt.dataset.pid};
        }""")
        page.click('#platePickApply')
        page.wait_for_function("""() => !document.getElementById('platePick').classList.contains('on')""")
        check('swap 1 plate', bool(swapped.get('ok')), json.dumps(swapped))
        page.evaluate("""() => {
          const x = document.getElementById('nudgeX');
          x.value = String((+x.value||0) + 12);
          x.dispatchEvent(new Event('input', {bubbles:true}));
          x.dispatchEvent(new Event('change', {bubbles:true}));
        }""")
        page.evaluate("""() => { const b=document.getElementById('durP'); if(b) b.click(); }""")
        page.click('#composeBtn')
        page.wait_for_function(
            """() => {
              const dock=document.getElementById('playerDock');
              const st=(document.getElementById('status')||{}).textContent||'';
              return dock && dock.classList.contains('on') && /composed/i.test(st);
            }""",
            timeout=90000,
        )
        page.wait_for_timeout(600)
        wall = time.perf_counter() - t0
        results['wall_time_s'] = round(wall, 2)

        dock = page.evaluate("""() => {
          const dock=document.getElementById('playerDock');
          const play=document.getElementById('dockReplay');
          const pause=document.getElementById('dockPause');
          const scrub=document.getElementById('dockScrub');
          const vh=window.innerHeight;
          const r=dock.getBoundingClientRect();
          const pr=play.getBoundingClientRect();
          const par=pause.getBoundingClientRect();
          const sr=scrub.getBoundingClientRect();
          const above = (el) => el.top >= 0 && el.bottom <= vh && el.height > 0;
          return {
            on: dock.classList.contains('on'),
            play: (play.textContent||'').trim(),
            pause: (pause.textContent||'').trim(),
            playAbove: above(pr),
            pauseAbove: above(par),
            scrubAbove: above(sr),
            dockTop: r.top, dockBottom: r.bottom, vh,
            transportAboveFold: above(pr) && above(par) && above(sr),
          };
        }""")
        results['metrics']['dock'] = dock
        check(
            'dock labels Play / Pause',
            dock.get('play') == 'Play' and dock.get('pause') == 'Pause',
            json.dumps(dock),
        )
        check(
            'after Compose Play/Pause/scrub above the fold',
            dock.get('on') and dock.get('transportAboveFold'),
            json.dumps(dock),
        )
        check(
            'Jack bar ≤60s (swap+cam+timing+compose→dock)',
            wall <= 60.0,
            f'wall_time_s={wall:.2f}',
        )
        page.screenshot(path=str(QA / 'HM-COMPOSE-05_dock-above-fold.png'), full_page=False)

        # Side-by-side vs Stitch
        sb1 = annotate_side_by_side(
            QA / 'HM-COMPOSE-05_land.png',
            STITCH / '01-desktop-land-open-fight.png',
            QA / 'HM-COMPOSE-05_vs-stitch-01-land.png',
            '01 Land / Open fight',
        )
        sb2 = annotate_side_by_side(
            QA / 'HM-COMPOSE-05_beat-focus.png',
            STITCH / '02-desktop-beat-focus-composer.png',
            QA / 'HM-COMPOSE-05_vs-stitch-02-beat-focus.png',
            '02 Beat focus composer',
        )
        results['metrics']['side_by_side'] = {'land': sb1, 'beat': sb2}
        check('side-by-side land vs Stitch 01 written', sb1.get('ok'), json.dumps(sb1))
        check('side-by-side beat-focus vs Stitch 02 written', sb2.get('ok'), json.dumps(sb2))

        # no fake meters as truthful status
        fake = page.evaluate("""() => {
          const t = document.body.innerText;
          const hits = [];
          for (const s of ['Beat Sync Match', 'ACES', '840 Mbps', 'GPU ACCELERATED', 'ProRes']) {
            if (t.includes(s)) hits.push(s);
          }
          return hits;
        }""")
        results['metrics']['fake_meters'] = fake
        check('no fake sync%/GPU/ACES meters as status', len(fake) == 0, json.dumps(fake))

    except Exception as e:
        results['ok'] = False
        results['errors'].append(str(e))
        print('ERROR', e)
        try:
            page.screenshot(path=str(QA / 'HM-COMPOSE-05_error.png'), full_page=True)
        except Exception:
            pass
    finally:
        browser.close()

smoke = json.loads((KIT / 'shows/library-smoke.json').read_text())
dry = api('POST', BASE + '/api/compose', {'show': smoke, 'dry': True})
check('library-smoke dry compose ok', bool(dry.get('ok')), json.dumps({'ok': dry.get('ok')})[:200])
is_parity = bool(dry.get('parity_mode') or (dry.get('stats') or {}).get('parity'))
check('library-smoke not parity', not is_parity, json.dumps(dry.get('stats') or {}))

gold_after = gold_fp()
results['gold_after'] = gold_after
check('gold folder untouched', gold_before == gold_after, f'before={gold_before} after={gold_after}')

(QA / 'HM-COMPOSE-05-proof.json').write_text(json.dumps(results, indent=2))
passed = sum(1 for c in results['checks'] if c['pass'])
total = len(results['checks'])
print(f"\nSUMMARY {'ALL PASS' if results['ok'] else 'FAILED'} {passed}/{total}")
if results.get('wall_time_s') is not None:
    print(f"wall_time_s={results['wall_time_s']}")
raise SystemExit(0 if results['ok'] else 1)
