#!/usr/bin/env python3
"""HM-COMPOSE-04 acceptance proof — open fight + beat focus + strip sync + Play/Pause."""
from __future__ import annotations
import hashlib, json, os, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

KIT = Path('/workspace/deliverables/html-motion-template-kit-2026-10-19')
GOLD = Path('/workspace/deliverables/fight-daiyu-wang-rooftop-tankshort-codex-html-2026-10-19')
QA = KIT / 'qa'
BASE = 'http://127.0.0.1:8770'
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
        url,
        data=data,
        method=method,
        headers={'Content-Type': 'application/json'} if data else {},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def wait_ready(page):
    page.wait_for_function(
        """() => document.getElementById('example')
          && document.getElementById('example').options.length > 3
          && window.__composer && window.__composer.plateStripMetrics
          && window.__composer.openFight"""
    )


gold_before = gold_fp()
results['gold_before'] = gold_before

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome', args=['--no-sandbox', '--disable-gpu'])
    context = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = context.new_page()
    page.set_default_timeout(60000)
    try:
        # --- 1) Cold land: clear recent, open UI → should land on Codex plate-pack ---
        page.goto('about:blank')
        page.goto(BASE + '/ui/index.html', wait_until='domcontentloaded')
        page.evaluate("""() => {
          try {
            localStorage.removeItem('hm.composer.recentPlatePack');
            localStorage.removeItem('hm.composer.pinPlatePack');
          } catch(e) {}
        }""")
        # reload so land logic sees empty recent
        page.goto(BASE + '/ui/index.html', wait_until='networkidle')
        wait_ready(page)
        page.wait_for_timeout(600)
        land = page.evaluate("""() => ({
          showId: document.getElementById('sId') && document.getElementById('sId').value,
          example: document.getElementById('example') && document.getElementById('example').value,
          isPack: !!(window.__composer && window.__composer.isPlatePack && window.__composer.isPlatePack()),
          openFightVisible: !!(document.getElementById('openFightBtn')),
        })""")
        results['metrics']['land'] = land
        check(
            'cold land opens Codex plate-pack (not editor-features)',
            bool(land.get('isPack')) and 'editor-features' not in (land.get('example') or '')
            and 'daiyu-wang-codex' in (land.get('showId') or land.get('example') or ''),
            json.dumps(land),
        )
        check('Open fight button present', land.get('openFightVisible'), json.dumps(land))
        page.screenshot(path=str(QA / 'HM-COMPOSE-04_land.png'), full_page=True)

        # Open fight one-click (should load import or recent)
        page.click('#openFightBtn')
        page.wait_for_timeout(500)
        after_open = page.evaluate("""() => ({
          showId: document.getElementById('sId').value,
          isPack: window.__composer.isPlatePack(),
          stripOn: document.getElementById('plateStrip').classList.contains('on'),
          thumbs: document.querySelectorAll('#plateStrip .pth').length,
        })""")
        results['metrics']['open_fight'] = after_open
        check(
            'Open fight loads plate-pack with strip',
            after_open.get('isPack') and after_open.get('stripOn') and after_open.get('thumbs', 0) >= 10,
            json.dumps(after_open),
        )
        sid = after_open.get('showId') or 'daiyu-wang-codex-import'
        results['show'] = sid

        # --- 2) Beat focus ---
        page.evaluate('() => window.__composer.setSel(2)')
        page.wait_for_timeout(200)
        page.click('#beatFocusBtn')
        page.wait_for_timeout(200)
        focus_on = page.evaluate("""() => ({
          beatFocus: window.__composer.getBeatFocus(),
          bodyBeat: document.body.classList.contains('beatFocus'),
          collapsed: document.body.classList.contains('atomPickCollapsed'),
          cardsHidden: getComputedStyle(document.getElementById('cards')).display === 'none',
          stripOn: document.getElementById('plateStrip').classList.contains('on'),
          swapVisible: !!(document.getElementById('swapPlateBtn') && document.getElementById('swapPlateBtn').offsetParent !== null),
          inspHasCam: !!(document.querySelector('#insp .camNudge')),
          inspHasDur: !!(document.querySelector('#insp .durBtns')),
          abHidden: !document.getElementById('abDock').classList.contains('on') || getComputedStyle(document.getElementById('abDock')).display==='none',
        })""")
        results['metrics']['focus_on'] = focus_on
        check(
            'Beat focus collapses Atom Picker',
            focus_on.get('beatFocus') and focus_on.get('collapsed') and focus_on.get('cardsHidden'),
            json.dumps(focus_on),
        )
        check(
            'Beat focus keeps strip + cam + timing + swap',
            focus_on.get('stripOn') and focus_on.get('swapVisible') and focus_on.get('inspHasCam') and focus_on.get('inspHasDur'),
            json.dumps(focus_on),
        )
        page.screenshot(path=str(QA / 'HM-COMPOSE-04_focus-on.png'), full_page=True)

        page.click('#beatFocusBtn')
        page.wait_for_timeout(200)
        focus_off = page.evaluate("""() => ({
          beatFocus: window.__composer.getBeatFocus(),
          bodyBeat: document.body.classList.contains('beatFocus'),
          collapsed: document.body.classList.contains('atomPickCollapsed'),
        })""")
        results['metrics']['focus_off'] = focus_off
        check(
            'Exit Beat focus restores chrome',
            (not focus_off.get('beatFocus')) and (not focus_off.get('bodyBeat')),
            json.dumps(focus_off),
        )
        page.screenshot(path=str(QA / 'HM-COMPOSE-04_focus-off.png'), full_page=True)

        # --- 3) Strip ↔ timeline sync ---
        # Select a later atom so scroll must move
        n_atoms = page.evaluate('() => (window.__composer.getShow().atoms||[]).length')
        target_ai = min(max(n_atoms - 3, 4), max(n_atoms - 1, 0))
        before_sl = page.evaluate('() => document.getElementById("plateStrip").scrollLeft')
        page.evaluate(f'() => window.__composer.setSel({target_ai})')
        page.wait_for_timeout(350)
        sync = page.evaluate(
            """(ai) => {
          const box=document.getElementById('plateStrip');
          const atomOns=[...box.querySelectorAll('.pth.atomOn')];
          const first=atomOns[0];
          const br=box.getBoundingClientRect();
          const fr=first && first.getBoundingClientRect();
          const inView = !!(fr && fr.left < br.right && fr.right > br.left);
          return {
            scrollLeft: box.scrollLeft,
            atomOnCount: atomOns.length,
            aiMatch: atomOns.every(b => +b.dataset.ai === ai),
            inView,
            firstPid: first && first.dataset.pid,
            hasStrong: atomOns.length>0 && getComputedStyle(atomOns[0]).boxShadow !== 'none',
          };
        }""",
            target_ai,
        )
        results['metrics']['strip_sync'] = {'target_ai': target_ai, 'before': before_sl, **sync}
        check(
            'timeline select → strip atomOn highlight',
            sync.get('atomOnCount', 0) >= 1 and sync.get('aiMatch'),
            json.dumps(sync),
        )
        check(
            'timeline select → strip scrolls selected into view',
            sync.get('inView'),
            json.dumps(sync),
        )
        page.locator('#plateStrip').screenshot(path=str(QA / 'HM-COMPOSE-04_strip-sync.png'))

        # Follow playhead: enable, scrub far, strip should follow
        page.evaluate('() => window.__composer.setFollowPlayhead(true)')
        page.evaluate("""() => {
          const dur=(window.__composer.getShow().atoms||[]).reduce((s,a)=>s+(+a.duration_s||0),0)||30;
          const t=Math.max(8, dur*0.55);
          const scrub=document.getElementById('scrub');
          scrub.value=String(t);
          scrub.dispatchEvent(new Event('input', {bubbles:true}));
        }""")
        page.wait_for_timeout(400)
        follow = page.evaluate("""() => {
          const box=document.getElementById('plateStrip');
          const on=box.querySelector('.pth.on');
          const br=box.getBoundingClientRect();
          const fr=on && on.getBoundingClientRect();
          return {
            scrub: +document.getElementById('scrub').value,
            scrollLeft: box.scrollLeft,
            onPid: on && on.dataset.pid,
            inView: !!(fr && fr.left < br.right && fr.right > br.left),
          };
        }""")
        results['metrics']['follow'] = follow
        check(
            'follow playhead keeps scrub plate in strip view',
            follow.get('inView') and follow.get('scrub', 0) > 5,
            json.dumps(follow),
        )
        page.evaluate('() => window.__composer.setFollowPlayhead(false)')

        # --- 4) Dock Play/Pause labels + compose scroll ---
        labels = page.evaluate("""() => ({
          play: (document.getElementById('dockReplay')||{}).textContent,
          pause: (document.getElementById('dockPause')||{}).textContent,
        })""")
        results['metrics']['dock_labels'] = labels
        check(
            'dock labels are Play / Pause (not replay / pause@t)',
            (labels.get('play') or '').strip() == 'Play' and (labels.get('pause') or '').strip() == 'Pause',
            json.dumps(labels),
        )
        check(
            'no pause@t primary label',
            'pause@t' not in (labels.get('pause') or '') and 'replay' not in (labels.get('play') or '').lower(),
            json.dumps(labels),
        )

        # Timed happy path: swap 1 plate + nudge cam + change timing + compose
        t0 = time.perf_counter()
        # ensure sel atom 0 for predictable edits
        page.evaluate('() => window.__composer.setSel(0)')
        page.wait_for_timeout(150)
        # swap: open picker on first strip thumb dblclick, pick another plate
        page.locator('#plateStrip .pth').first.dblclick()
        page.wait_for_selector('#platePick.on')
        page.wait_for_timeout(300)
        swapped = page.evaluate("""() => {
          const cur = document.querySelector('#platePickGrid .pth.on');
          const curId = cur && cur.dataset.pid;
          const alt = [...document.querySelectorAll('#platePickGrid .pth')].find(b => b.dataset.pid && b.dataset.pid !== curId);
          if(!alt) return {ok:false, reason:'no alt'};
          alt.click();
          return {ok:true, from:curId, to:alt.dataset.pid};
        }""")
        page.click('#platePickApply')
        page.wait_for_function("""() => !document.getElementById('platePick').classList.contains('on')""")
        results['metrics']['swap'] = swapped
        check('swap 1 plate', bool(swapped.get('ok')), json.dumps(swapped))

        # cam nudge
        page.evaluate("""() => {
          const x = document.getElementById('nudgeX');
          if(!x) throw new Error('no #nudgeX');
          x.value = String((+x.value||0) + 12);
          x.dispatchEvent(new Event('input', {bubbles:true}));
          x.dispatchEvent(new Event('change', {bubbles:true}));
        }""")
        # timing +0.5 via durP if present
        page.evaluate("""() => {
          const b = document.getElementById('durP');
          if(b) b.click();
          else {
            const a = window.__composer.getShow().atoms[window.__composer.getSel()];
            a.duration_s = (+a.duration_s||1) + 0.5;
            a.plates_needed = Math.round(a.duration_s*2);
          }
        }""")
        page.wait_for_timeout(100)

        page.click('#composeBtn')
        # wait for dock on + toast / composed status
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

        dock_view = page.evaluate("""() => {
          const dock=document.getElementById('playerDock');
          const r=dock.getBoundingClientRect();
          const vh=window.innerHeight;
          const play=(document.getElementById('dockReplay')||{}).textContent;
          const pause=(document.getElementById('dockPause')||{}).textContent;
          return {
            on: dock.classList.contains('on'),
            top: r.top, bottom: r.bottom, vh,
            inView: r.top < vh && r.bottom > 0 && r.height > 40,
            play: (play||'').trim(), pause: (pause||'').trim(),
          };
        }""")
        results['metrics']['dock_after_compose'] = dock_view
        check(
            'after Compose dock visible with Play/Pause',
            dock_view.get('on') and dock_view.get('inView')
            and dock_view.get('play') == 'Play' and dock_view.get('pause') == 'Pause',
            json.dumps(dock_view),
        )
        check(
            'Jack bar ≤60s (swap+cam+timing+compose→dock)',
            wall <= 60.0,
            f'wall_time_s={wall:.2f}',
        )
        page.screenshot(path=str(QA / 'HM-COMPOSE-04_dock-labels.png'), full_page=True)

        # Musts from 03b still intact
        m = page.evaluate('() => window.__composer.plateStripMetrics()')
        results['metrics']['strip_must'] = m
        check(
            'strip still flex 0 0 88px (03b intact)',
            70 <= (m.get('visibleH') or 0) <= 96 and str(m.get('flexShrink')) == '0',
            json.dumps({k: m.get(k) for k in ('visibleH', 'flexShrink', 'flex', 'btnH')}),
        )

    except Exception as e:
        results['ok'] = False
        results['errors'].append(str(e))
        print('ERROR', e)
        try:
            page.screenshot(path=str(QA / 'HM-COMPOSE-04_error.png'), full_page=True)
        except Exception:
            pass
    finally:
        browser.close()

smoke = json.loads((KIT / 'shows/library-smoke.json').read_text())
dry = api('POST', BASE + '/api/compose', {'show': smoke, 'dry': True})
check(
    'library-smoke dry compose ok',
    bool(dry.get('ok')),
    json.dumps({'ok': dry.get('ok'), 'warnings': dry.get('warnings'), 'errors': dry.get('errors')})[:400],
)
is_parity = bool(dry.get('parity_mode') or (dry.get('stats') or {}).get('parity'))
check('library-smoke not parity', not is_parity, json.dumps(dry.get('stats') or {}))

gold_after = gold_fp()
results['gold_after'] = gold_after
check('gold folder untouched', gold_before == gold_after, f'before={gold_before} after={gold_after}')

(QA / 'HM-COMPOSE-04-proof.json').write_text(json.dumps(results, indent=2))
passed = sum(1 for c in results['checks'] if c['pass'])
total = len(results['checks'])
print(f"\nSUMMARY {'ALL PASS' if results['ok'] else 'FAILED'} {passed}/{total}")
if results.get('wall_time_s') is not None:
    print(f"wall_time_s={results['wall_time_s']}")
raise SystemExit(0 if results['ok'] else 1)
