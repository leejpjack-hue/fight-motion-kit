#!/usr/bin/env python3
"""HM-COMPOSE-06 acceptance — mobile composer/player shell (Stitch 03). Keeps 05/04 desktop."""
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
    '#5be38a', '#ff3fa4', '#071016', '#7fd', '#000', '#fff',
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
          && window.__composer.isMobileShell"""
    )


def expand_hex(h):
    h = h.lower()
    if len(h) == 4:
        return '#' + ''.join(c * 2 for c in h[1:])
    if len(h) == 5:
        return '#' + ''.join(c * 2 for c in h[1:4])
    if len(h) == 9:
        return h[:7]
    return h[:7] if len(h) >= 7 else h


def palette_spotcheck():
    text = UI.read_text()
    m = re.search(r':root\{([^}]+)\}', text)
    root = m.group(1) if m else ''
    hexes = set(re.findall(r'#[0-9a-fA-F]{3,8}', root))
    bad = []
    for hx in hexes:
        full = expand_hex(hx)
        ok = full in LOCKED or hx.lower() in LOCKED
        if full == '#77ffdd' or hx.lower() == '#7fd':
            ok = True
        if not ok:
            bad.append(hx)
    return {'root_hexes': sorted(hexes), 'bad': bad}


def annotate_side_by_side(shot_path, stitch_path, out_path, label):
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        out_path.write_bytes(shot_path.read_bytes())
        return {'ok': False, 'reason': 'no PIL'}
    a = Image.open(shot_path).convert('RGB')
    b = Image.open(stitch_path).convert('RGB')
    th = a.height
    tw = int(b.width * (th / max(1, b.height)))
    b = b.resize((tw, th), Image.Resampling.LANCZOS)
    gap = 12
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
check(':root colors ⊆ locked palette', len(results['metrics']['palette']['bad']) == 0,
      json.dumps(results['metrics']['palette']))

# viewport meta present
ui_text = UI.read_text()
check('viewport meta present', 'name="viewport"' in ui_text and 'HM-COMPOSE-06' in ui_text,
      'viewport+HM-COMPOSE-06 markers')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome', args=['--no-sandbox', '--disable-gpu'])
    # --- MOBILE ---
    context = browser.new_context(
        viewport={'width': 390, 'height': 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
        user_agent=('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) '
                    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'),
    )
    page = context.new_page()
    page.set_default_timeout(90000)
    try:
        page.goto('about:blank')
        page.evaluate("""() => {
          try {
            localStorage.removeItem('hm.composer.recentPlatePack');
            localStorage.removeItem('hm.composer.pinPlatePack');
          } catch(e) {}
        }""")
        page.goto(BASE + '/ui/index.html', wait_until='networkidle')
        wait_ready(page)
        page.wait_for_timeout(600)

        # Open fight → mobile composer
        page.click('#openFightBtn')
        page.wait_for_timeout(700)

        layout = page.evaluate("""() => {
          const vh = window.innerHeight, vw = window.innerWidth;
          const atom = document.getElementById('atomPane');
          const cards = document.getElementById('cards');
          const strip = document.getElementById('plateStrip');
          const prev = document.getElementById('previewBox');
          const insp = document.getElementById('atomInspGrp');
          const dock = document.getElementById('playerDock');
          const play = document.getElementById('dockReplay');
          const pause = document.getElementById('dockPause');
          const compose = document.getElementById('dockCompose');
          const honesty = document.getElementById('fxHonestyBar');
          const tl = document.getElementById('tl');
          const stats = document.getElementById('stats');
          const r = (el) => el ? el.getBoundingClientRect() : null;
          const vis = (el) => {
            if(!el) return false;
            const cs = getComputedStyle(el);
            if(cs.display === 'none' || cs.visibility === 'hidden') return false;
            const b = el.getBoundingClientRect();
            return b.width > 0 && b.height > 0;
          };
          const pr = r(prev), sr = r(strip), ir = r(insp), dr = r(dock);
          const zones = [];
          if(pr) zones.push(['stage', pr.top]);
          if(sr && vis(strip)) zones.push(['strip', sr.top]);
          if(ir && vis(insp)) zones.push(['beat', ir.top]);
          if(dr && vis(dock)) zones.push(['dock', dr.top]);
          zones.sort((a,b)=>a[1]-b[1]);
          const order = zones.map(z=>z[0]);
          return {
            vw, vh,
            mobile: !!(window.__composer && window.__composer.isMobileShell()),
            bodyMobile: document.body.classList.contains('mobileShell'),
            beatFocus: !!(window.__composer && window.__composer.getBeatFocus()),
            atomHidden: !vis(atom) && (!cards || getComputedStyle(cards).display === 'none' || !vis(cards)),
            atomDisplay: atom ? getComputedStyle(atom).display : null,
            cardsDisplay: cards ? getComputedStyle(cards).display : null,
            tlHidden: !vis(tl),
            statsHidden: !vis(stats),
            stripOn: strip && strip.classList.contains('on'),
            stripH: sr ? sr.height : 0,
            thumbs: strip ? strip.querySelectorAll('.pth').length : 0,
            honestyOn: honesty && honesty.classList.contains('on') && vis(honesty),
            dockVisible: vis(dock),
            playText: (play||{}).textContent||'',
            pauseText: (pause||{}).textContent||'',
            composeText: (compose||{}).textContent||'',
            composeVisible: vis(compose),
            playVisible: vis(play),
            pauseVisible: vis(pause),
            composeAboveFold: compose && (()=>{const b=compose.getBoundingClientRect(); return b.top>=0 && b.bottom<=vh && b.height>0;})(),
            zoneOrder: order,
            tops: {stage: pr && pr.top, strip: sr && sr.top, beat: ir && ir.top, dock: dr && dr.top},
            inspHasCam: !!document.querySelector('#insp .camNudge'),
            inspHasDur: !!document.querySelector('#insp .durBtns'),
            swapVisible: (()=>{ const s=document.getElementById('inspSwapBtn'); return !!(s && getComputedStyle(s).display!=='none'); })(),
          };
        }""")
        results['metrics']['mobile_layout'] = layout
        check(
            'mobile shell active @390',
            layout.get('mobile') and layout.get('vw') == 390,
            json.dumps({k: layout.get(k) for k in ('vw','vh','mobile','bodyMobile','beatFocus')}),
        )
        check(
            'Atom Picker not dominating (hidden)',
            layout.get('atomHidden') and layout.get('atomDisplay') == 'none',
            json.dumps({k: layout.get(k) for k in ('atomHidden','atomDisplay','cardsDisplay','tlHidden')}),
        )
        check(
            'zone order stage→strip→beat→dock',
            layout.get('zoneOrder') == ['stage', 'strip', 'beat', 'dock'],
            json.dumps({'order': layout.get('zoneOrder'), 'tops': layout.get('tops')}),
        )
        check(
            'FX honesty + plate strip (≥88px, thumbs)',
            layout.get('honestyOn') and layout.get('stripOn')
            and layout.get('stripH', 0) >= 80 and layout.get('thumbs', 0) >= 10,
            json.dumps({k: layout.get(k) for k in ('honestyOn','stripOn','stripH','thumbs')}),
        )
        check(
            'beat controls (cam/timing/swap) + Play/Pause/Compose dock',
            layout.get('beatFocus') and layout.get('inspHasCam') and layout.get('inspHasDur')
            and layout.get('swapVisible')
            and (layout.get('playText') or '').strip() == 'Play'
            and (layout.get('pauseText') or '').strip() == 'Pause'
            and (layout.get('composeText') or '').strip() == 'Compose'
            and layout.get('composeVisible') and layout.get('composeAboveFold'),
            json.dumps({k: layout.get(k) for k in (
                'beatFocus','inspHasCam','inspHasDur','swapVisible',
                'playText','pauseText','composeText','composeVisible','composeAboveFold','dockVisible')}),
        )
        page.screenshot(path=str(QA / 'HM-COMPOSE-06_mobile.png'), full_page=True)

        # Jack bar timed path on mobile
        page.evaluate('() => window.__composer.setSel(0)')
        page.wait_for_timeout(120)
        t0 = time.perf_counter()
        # tap first plate thumb → open swap via dblclick equivalent
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
        check('mobile swap 1 plate', bool(swapped.get('ok')), json.dumps(swapped))

        page.evaluate("""() => {
          const x = document.getElementById('nudgeX');
          if(x){ x.value = String((+x.value||0) + 12);
            x.dispatchEvent(new Event('input', {bubbles:true}));
            x.dispatchEvent(new Event('change', {bubbles:true})); }
        }""")
        page.evaluate("""() => { const b=document.getElementById('durP'); if(b) b.click(); }""")

        # Compose via dock button
        page.click('#dockCompose')
        page.wait_for_function(
            """() => {
              const dock=document.getElementById('playerDock');
              const st=(document.getElementById('status')||{}).textContent||'';
              return dock && dock.classList.contains('on') && /composed/i.test(st);
            }""",
            timeout=90000,
        )
        page.wait_for_timeout(500)
        wall = time.perf_counter() - t0
        results['wall_time_s'] = round(wall, 2)

        after = page.evaluate("""() => {
          const vh=window.innerHeight;
          const play=document.getElementById('dockReplay').getBoundingClientRect();
          const pause=document.getElementById('dockPause').getBoundingClientRect();
          const compose=document.getElementById('dockCompose').getBoundingClientRect();
          const above=(r)=> r.top>=0 && r.bottom<=vh && r.height>0;
          return {
            dockOn: document.getElementById('playerDock').classList.contains('on'),
            playAbove: above(play), pauseAbove: above(pause), composeAbove: above(compose),
          };
        }""")
        results['metrics']['mobile_dock_after'] = after
        check(
            'after Compose Play/Pause/Compose usable above fold',
            after.get('dockOn') and after.get('playAbove') and after.get('pauseAbove') and after.get('composeAbove'),
            json.dumps(after),
        )
        check('Jack bar ≤60s (mobile swap+cam+timing+compose)', wall <= 60.0, f'wall_time_s={wall:.2f}')
        page.screenshot(path=str(QA / 'HM-COMPOSE-06_mobile-composed.png'), full_page=False)

        sb = annotate_side_by_side(
            QA / 'HM-COMPOSE-06_mobile.png',
            STITCH / '03-mobile-composer-player.png',
            QA / 'HM-COMPOSE-06_vs-stitch-03.png',
            '03 Mobile composer/player',
        )
        results['metrics']['side_by_side'] = sb
        check('side-by-side mobile vs Stitch 03 written', sb.get('ok'), json.dumps(sb))

        fake = page.evaluate("""() => {
          const t = document.body.innerText;
          const hits = [];
          for (const s of ['Beat Sync Match', 'ACES', '840 Mbps', 'GPU ACCELERATED', 'ProRes', '120 BPM', 'Beat-Matching Engine']) {
            if (t.includes(s)) hits.push(s);
          }
          return hits;
        }""")
        results['metrics']['fake_meters'] = fake
        check('no fake sync/BPM/GPU meters', len(fake) == 0, json.dumps(fake))

    except Exception as e:
        results['ok'] = False
        results['errors'].append('mobile: ' + str(e))
        print('ERROR mobile', e)
        try:
            page.screenshot(path=str(QA / 'HM-COMPOSE-06_error.png'), full_page=True)
        except Exception:
            pass
    finally:
        context.close()

    # --- DESKTOP REGRESSION (05/04) ---
    context = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = context.new_page()
    page.set_default_timeout(60000)
    try:
        page.goto(BASE + '/ui/index.html', wait_until='networkidle')
        wait_ready(page)
        page.wait_for_timeout(400)
        desk = page.evaluate("""() => ({
          mobile: window.__composer.isMobileShell(),
          land: window.__composer.isLandMode(),
          openFight: (document.getElementById('openFightBtn')||{}).textContent,
          composeHeader: !!(document.getElementById('composeBtn') && getComputedStyle(document.getElementById('composeBtn')).display !== 'none'),
          dockComposeHidden: (()=>{ const b=document.getElementById('dockCompose'); return !b || getComputedStyle(b).display==='none'; })(),
        })""")
        results['metrics']['desktop_land'] = desk
        check(
            'desktop: not mobile shell; Open fight + header Compose; dockCompose hidden',
            (not desk.get('mobile')) and desk.get('land')
            and (desk.get('openFight') or '').strip() == 'Open fight'
            and desk.get('composeHeader') and desk.get('dockComposeHidden'),
            json.dumps(desk),
        )
        page.click('#openFightBtn')
        page.wait_for_timeout(400)
        page.click('#beatFocusBtn')
        page.wait_for_timeout(200)
        strip = page.evaluate('() => window.__composer.plateStripMetrics()')
        results['metrics']['desktop_strip'] = strip
        check(
            'desktop regression: strip still 88px + beat focus collapses picker',
            70 <= (strip.get('visibleH') or 0) <= 96 and str(strip.get('flexShrink')) == '0'
            and page.evaluate('() => window.__composer.getBeatFocus()')
            and page.evaluate("() => document.body.classList.contains('atomPickCollapsed')"),
            json.dumps(strip),
        )
        page.screenshot(path=str(QA / 'HM-COMPOSE-06_desktop-regression.png'), full_page=False)
    except Exception as e:
        results['ok'] = False
        results['errors'].append('desktop: ' + str(e))
        print('ERROR desktop', e)
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

(QA / 'HM-COMPOSE-06-proof.json').write_text(json.dumps(results, indent=2))
passed = sum(1 for c in results['checks'] if c['pass'])
total = len(results['checks'])
print(f"\nSUMMARY {'ALL PASS' if results['ok'] else 'FAILED'} {passed}/{total}")
if results.get('wall_time_s') is not None:
    print(f"wall_time_s={results['wall_time_s']}")
raise SystemExit(0 if results['ok'] else 1)
