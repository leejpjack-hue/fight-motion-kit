#!/usr/bin/env python3
"""HM-COMPOSE-03 acceptance proof (Playwright + system Chrome)."""
from __future__ import annotations
import hashlib, json, os, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

KIT = Path('/workspace/deliverables/html-motion-template-kit-2026-10-19')
GOLD = Path('/workspace/deliverables/fight-daiyu-wang-rooftop-tankshort-codex-html-2026-10-19')
QA = KIT / 'qa'
BASE = 'http://127.0.0.1:8770'
results = {'ok': True, 'checks': [], 'errors': []}

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
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={'Content-Type': 'application/json'} if data else {})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode())

def pick_show(page, sid):
    page.evaluate(
        """(sid) => {
          const el = document.getElementById('example');
          const opt = [...el.options].find(o => o.value.includes(sid));
          if (!opt) throw new Error('missing show ' + sid + ' in ' + [...el.options].map(o=>o.value).join(','));
          el.value = opt.value;
        }""",
        sid,
    )
    page.click('#loadEx')
    page.wait_for_function(
        """(sid) => document.getElementById('sId') && document.getElementById('sId').value === sid""",
        arg=sid,
    )

gold_before = gold_fp()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome', args=['--no-sandbox', '--disable-gpu'])
    page = browser.new_page(viewport={'width': 1400, 'height': 900})
    page.set_default_timeout(45000)
    try:
        page.goto(BASE + '/ui/index.html', wait_until='networkidle')
        page.wait_for_function(
            """() => document.getElementById('example') && document.getElementById('example').options.length > 3 && window.__composer"""
        )

        pick_show(page, 'daiyu-wang-codex-import')
        page.wait_for_timeout(600)

        # 1 Save as
        page.click('#dupShowBtn')
        page.wait_for_selector('#dupModal.on')
        compose_default = page.eval_on_selector('#dupCompose', 'el => el.checked')
        check('dup compose default off', compose_default is False, f'checked={compose_default}')
        page.fill('#dupTo', 'daiyu-wang-codex-user-test-b')
        page.click('#dupRun')
        page.wait_for_function(
            """() => document.getElementById('sId') && document.getElementById('sId').value === 'daiyu-wang-codex-user-test-b'""",
            timeout=20000,
        )
        page.wait_for_timeout(400)
        picker_has = page.eval_on_selector(
            '#example',
            'el => [...el.options].some(o => o.value.includes("daiyu-wang-codex-user-test-b"))',
        )
        opts = page.eval_on_selector(
            '#example',
            'el => [...el.options].map(o=>o.value).filter(v=>v.includes("daiyu")).join(",")',
        )
        check('Save as → id in picker', picker_has, opts)
        check('show file exists', (KIT / 'shows/daiyu-wang-codex-user-test-b.json').is_file())

        # 2 strip
        page.wait_for_selector('#plateStrip.on .pth')
        strip = page.evaluate(
            """() => {
          const box = document.getElementById('plateStrip');
          const btn = box.querySelector('.pth');
          const boxCs = getComputedStyle(box);
          const r = btn.getBoundingClientRect();
          return { btnH: r.height, btnW: r.width, wrap: boxCs.flexWrap, overflowX: boxCs.overflowX, count: box.querySelectorAll('.pth').length };
        }"""
        )
        check('plate strip thumb ~72px', 68 <= strip['btnH'] <= 80, json.dumps(strip))
        check(
            'plate strip nowrap + scroll',
            strip['wrap'] == 'nowrap' and strip['overflowX'] in ('auto', 'scroll'),
            json.dumps(strip),
        )
        page.wait_for_timeout(800)
        # Wait for inventory-driven re-render (cutout→plates fallback)
        page.wait_for_function(
            """() => {
          const b=[...document.querySelectorAll('#plateStrip .pth')].find(x=>x.dataset.pid==='P09');
          if(!b) return false;
          const img=b.querySelector('img');
          const ph=b.querySelector('.ph');
          return (img && /plates\//.test(img.src)) || !!ph;
        }"""
        )
        miss = page.evaluate(
            """() => {
          const want=['P09','P10','P11','P30','P34','P43','P44','P60'];
          const out={};
          for(const id of want){
            const b=[...document.querySelectorAll('#plateStrip .pth')].find(x=>x.dataset.pid===id);
            const img=b&&b.querySelector('img');
            const ph=b&&b.querySelector('.ph');
            out[id]={src:img&&img.getAttribute('src'), ph:ph&&ph.textContent, empty:!img&&!ph};
          }
          return out;
            }"""
        )
        ok_miss = all((not v['empty']) and (v['ph'] or (v['src'] and 'plates/' in v['src'])) for v in miss.values())
        check('missing-cutout thumbs not empty (plates fallback or 404 placeholder)', ok_miss, json.dumps(miss)[:500])

        page.locator('#plateStrip .pth').first.dblclick()
        page.wait_for_selector('#platePick.on', timeout=5000)
        check('dbl-click opens Swap dialog', page.eval_on_selector('#platePick', 'el => el.classList.contains("on")'))
        page.click('#platePickCancel')
        page.wait_for_timeout(200)

        # 3 Split → Merge
        before = page.evaluate(
            """() => {
          const S = window.__composer.getShow();
          const a = S.atoms[0];
          return { id: a.id, plates: (a.hero && a.hero.plates) ? a.hero.plates.slice() : [], nAtoms: S.atoms.length };
        }"""
        )
        page.evaluate('() => window.__composer.setSel(0)')
        page.click('#splitAtomBtn')
        page.wait_for_timeout(300)
        mid = page.evaluate(
            """() => {
          const S = window.__composer.getShow();
          const a = S.atoms[0], b = S.atoms[1];
          return { n: S.atoms.length, aId: a && a.id, bId: b && b.id, aOrig: a && a._split_orig };
        }"""
        )
        check(
            'split created pair',
            mid['n'] == before['nAtoms'] + 1 and str(mid['aId']).endswith('__a') and str(mid['bId']).endswith('__b'),
            json.dumps(mid),
        )
        page.evaluate('() => window.__composer.setSel(0)')
        page.click('#mergeAtomBtn')
        page.wait_for_timeout(300)
        after = page.evaluate(
            """() => {
          const S = window.__composer.getShow();
          const a = S.atoms[0];
          return {
            id: a.id,
            plates: (a.hero && a.hero.plates) ? a.hero.plates.slice() : [],
            nAtoms: S.atoms.length,
            hasSplitMeta: !!(a._split_orig || a._split_mate || a._pre_split_plates)
          };
        }"""
        )
        check('merge restores atom count', after['nAtoms'] == before['nAtoms'], json.dumps(after))
        check(
            'merge restores atom id (no __a__m)',
            after['id'] == before['id'] and '__' not in after['id'],
            f"before={before['id']} after={after['id']}",
        )
        check(
            'merge restores plates',
            after['plates'] == before['plates'],
            f"before={before['plates']} after={after['plates']}",
        )
        check('merge cleared split meta', not after['hasSplitMeta'])

        # 4 FX banner
        page.evaluate(
            """() => {
          window.__composer.setSel(0);
          const scrub = document.getElementById('scrub');
          if (scrub) { scrub.value = '0.4'; scrub.dispatchEvent(new Event('input')); }
          const S = window.__composer.getShow();
          const a = S.atoms[0];
          a.fx_hooks = [{ type: 'sparks', t_rel: 0.4 }];
          if (!S.overlays) S.overlays = [];
          S.overlays.push({
            id: 'ov_proof_bang03', kind: 'text', text: '砰',
            t_start: 0.2, t_end: 1.5, x: 640, y: 200, scale: 1, opacity: 1, z: 10,
            style: { fontSize: 96, fill: '#ffe66d', stroke: '#1a0a00', strokeWidth: 8, fontFamily: 'Ma Shan Zheng', fontWeight: 900 }
          });
          window.__composer.setSel(0);
          return window.__composer.paint();
        }"""
        )
        page.wait_for_timeout(800)
        banner_on = page.eval_on_selector('#fxBanner', 'el => el.classList.contains("on")')
        banner_text = page.eval_on_selector('#fxBanner', 'el => el.textContent')
        check('FX banner on when sparks placed', banner_on, banner_text)
        check('FX banner mentions Compose', 'Compose to see FX' in banner_text, banner_text)

        page.locator('#plateStrip').screenshot(path=str(QA / 'HM-COMPOSE-03_plate-strip.png'))
        page.locator('#pvWrap').screenshot(path=str(QA / 'HM-COMPOSE-03_fx-banner.png'))

        dup_label = page.eval_on_selector('label:has(#dupCompose)', 'el => el.textContent.trim()')
        check('dup label says duplicate only', 'duplicate only' in dup_label.lower(), dup_label)

        # 5 Re-prove Save-as → swap → compose (02 path)
        dup_res = page.evaluate(
            """async () => fetch('/api/duplicate', {
            method: 'POST',
            body: JSON.stringify({ from_id: 'daiyu-wang-codex-import', to_id: 'daiyu-wang-codex-proof03', compose: true })
          }).then(x => x.json())"""
        )
        check(
            'proof03 duplicate+compose API',
            bool(dup_res and dup_res.get('ok') and (dup_res.get('compose') or {}).get('ok')),
            json.dumps(dup_res.get('compose') or dup_res)[:300],
        )

        # refresh catalog + load proof03 via composer hook
        page.evaluate(
            """async () => {
          await window.__composer.loadCatalog(true);
          window.__composer.refreshPicker(true);
          const show = await fetch('/shows/daiyu-wang-codex-proof03.json').then(r => r.json());
          window.__composer.loadShow(show);
        }"""
        )
        page.wait_for_function(
            """() => document.getElementById('sId') && document.getElementById('sId').value === 'daiyu-wang-codex-proof03'"""
        )
        page.wait_for_timeout(400)

        swap_res = page.evaluate(
            """() => {
          const atoms = window.__composer.getShow().atoms;
          const swaps = [[0,0,'P12'],[1,0,'P40'],[2,0,'P50']];
          for (const [ai, pi, pid] of swaps) {
            const a = atoms[ai];
            if (!a.hero) a.hero = { plates: [] };
            while (a.hero.plates.length <= pi) a.hero.plates.push(pid);
            a.hero.plates[pi] = pid;
          }
          atoms[0].camera = atoms[0].camera || {};
          atoms[0].camera.nudge = { x: 40, y: -20, s: 0.08, r: 3 };
          atoms[3].camera = atoms[3].camera || {};
          atoms[3].camera.nudge = { x: -30, y: 10, s: -0.05, r: -2 };
          const S = window.__composer.getShow();
          S.chars.R = S.chars.R || {};
          S.chars.R.transform = Object.assign({}, S.chars.R.transform || {}, { scale: 1.15 });
          S.overlays = (S.overlays || []).concat([
            { id: 'ov_p03_bang', kind: 'text', text: '砰', t_start: 1.0, t_end: 2.2, x: 640, y: 180, scale: 1, opacity: 1, z: 10,
              style: { fontSize: 96, fill: '#ffe66d', stroke: '#1a0a00', strokeWidth: 8, fontFamily: 'Ma Shan Zheng', fontWeight: 900 } },
            { id: 'ov_p03_clash', kind: 'text', text: 'CLASH', t_start: 5.0, t_end: 6.0, x: 640, y: 200, scale: 1, opacity: 1, z: 10,
              style: { fontSize: 72, fill: '#ffe66d', stroke: '#1a0a00', strokeWidth: 6, fontFamily: 'Ma Shan Zheng', fontWeight: 900 } },
          ]);
          return { p0: atoms[0].hero.plates[0], p1: atoms[1].hero.plates[0], p2: atoms[2].hero.plates[0],
                   rScale: S.chars.R.transform.scale, nOv: S.overlays.length };
        }"""
        )
        check(
            'proof03 edits applied',
            swap_res['p0'] == 'P12' and swap_res['p1'] == 'P40' and swap_res['p2'] == 'P50' and swap_res['rScale'] == 1.15,
            json.dumps(swap_res),
        )

        page.click('#composeBtn')
        page.wait_for_function(
            """() => { const out = document.getElementById('out'); return out && /^\\u2713|^✓/.test(out.textContent || ''); }""",
            timeout=60000,
        )
        compose_out = page.eval_on_selector('#out', 'el => el.textContent.slice(0, 200)')
        check('proof03 Compose & Preview ok', compose_out.startswith('✓'), compose_out)
        check('docked player shown after compose', page.eval_on_selector('#playerDock', 'el => el.classList.contains("on")'))
        check('dock transport present', page.query_selector('#dockReplay') is not None)

        page.screenshot(path=str(QA / 'HM-COMPOSE-03_composer.png'), full_page=True)
        try:
            page.locator('#playerDock').screenshot(path=str(QA / 'HM-COMPOSE-03_dock.png'))
        except Exception:
            pass

        picker_still = page.eval_on_selector(
            '#example',
            'el => [...el.options].some(o => o.value.includes("daiyu-wang-codex-user-test-b"))',
        )
        check('picker still lists user-test-b after compose', picker_still)
        stats = page.eval_on_selector('#stats', 'el => el.textContent')
        check(
            'parity budget N/A in stats',
            ('parity' in stats.lower() or 'plate-pack' in stats.lower() or 'budget N/A' in stats),
            stats[:180],
        )

        page.click('#swapPlateBtn')
        page.wait_for_selector('#platePick.on')
        check('Swap plate… button opens same dialog', page.eval_on_selector('#platePick', 'el => el.classList.contains("on")'))
        page.click('#platePickCancel')

        # L/R honesty label
        lr = page.evaluate(
            """() => {
          const S = window.__composer.getShow();
          window.__composer.setSel(0);
          const insp = document.getElementById('insp');
          return insp ? insp.textContent : '';
            }"""
        )
        # renderInsp already called by setSel→renderTL
        page.wait_for_timeout(200)
        insp = page.eval_on_selector('#insp', 'el => el.textContent')
        check('L/R whole-plate honesty label', 'whole plate' in insp.lower() or 'scales whole' in insp.lower(), insp[:200])

    except Exception as e:
        results['ok'] = False
        results['errors'].append(str(e))
        print('EXCEPTION', e)
        try:
            page.screenshot(path=str(QA / 'HM-COMPOSE-03_error.png'), full_page=True)
        except Exception:
            pass
    finally:
        browser.close()

smoke = json.loads((KIT / 'shows/library-smoke.json').read_text())
dry = api('POST', BASE + '/api/compose', {'show': smoke, 'dry': True})
check(
    'library-smoke dry compose ok',
    bool(dry.get('ok')),
    json.dumps({'ok': dry.get('ok'), 'warnings': dry.get('warnings'), 'errors': dry.get('errors'), 'stats': dry.get('stats')})[:400],
)
is_parity = bool(dry.get('parity_mode') or (dry.get('stats') or {}).get('parity'))
check('library-smoke not parity', not is_parity, json.dumps(dry.get('stats') or {}))

gold_after = gold_fp()
check('gold folder untouched', gold_before == gold_after, f'before={gold_before} after={gold_after}')

(QA / 'HM-COMPOSE-03-proof.json').write_text(json.dumps(results, indent=2))
passed = sum(1 for c in results['checks'] if c['pass'])
total = len(results['checks'])
print(f"\nSUMMARY {'ALL PASS' if results['ok'] else 'FAILED'} {passed}/{total}")
raise SystemExit(0 if results['ok'] else 1)
