#!/usr/bin/env python3
"""HM-COMPOSE-03b acceptance proof — plate strip visible height in real layout."""
from __future__ import annotations
import hashlib, json, os, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

KIT = Path('/workspace/deliverables/html-motion-template-kit-2026-10-19')
GOLD = Path('/workspace/deliverables/fight-daiyu-wang-rooftop-tankshort-codex-html-2026-10-19')
QA = KIT / 'qa'
BASE = 'http://127.0.0.1:8770'
results = {'ok': True, 'checks': [], 'errors': [], 'metrics': {}}


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
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode())


def pick_show(page, sid):
    page.evaluate(
        """(sid) => {
          const el = document.getElementById('example');
          const opt = [...el.options].find(o => o.value.includes(sid));
          if (!opt) throw new Error('missing show ' + sid);
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
    # Short viewport stresses Timeline flex (what collapsed the strip to ~17px)
    page = browser.new_page(viewport={'width': 1400, 'height': 800})
    page.set_default_timeout(45000)
    try:
        page.goto(BASE + '/ui/index.html', wait_until='networkidle')
        page.wait_for_function(
            """() => document.getElementById('example')
              && document.getElementById('example').options.length > 3
              && window.__composer && window.__composer.plateStripMetrics"""
        )

        sid = 'daiyu-wang-codex-retest03'
        has = page.evaluate(
            """(sid) => [...document.getElementById('example').options].some(o => o.value.includes(sid))""",
            sid,
        )
        if not has:
            sid = 'daiyu-wang-codex-import'
        results['show'] = sid
        pick_show(page, sid)
        page.wait_for_selector('#plateStrip.on .pth')
        page.wait_for_timeout(700)

        m = page.evaluate('() => window.__composer.plateStripMetrics()')
        results['metrics']['initial'] = m
        check(
            'plateStrip.on with thumbs',
            bool(m and m.get('on') and m.get('count', 0) >= 10),
            json.dumps(m),
        )
        vh = (m or {}).get('visibleH') or 0
        check(
            'visible strip height ~72–88px (layout)',
            70 <= vh <= 96,
            f'visibleH={vh} btnH={m.get("btnH")} flexShrink={m.get("flexShrink")} minHeight={m.get("minHeight")}',
        )
        check(
            'flex-shrink is 0',
            str((m or {}).get('flexShrink')) == '0',
            json.dumps({k: m.get(k) for k in ('flexShrink', 'flex', 'minHeight', 'height')}),
        )
        check('thumb ~72px', 68 <= (m.get('btnH') or 0) <= 80, f'btnH={m.get("btnH")}')

        before = page.evaluate('() => document.getElementById("plateStrip").scrollLeft')
        page.locator('#plateStrip').hover()
        page.mouse.wheel(0, 400)
        page.wait_for_timeout(200)
        after = page.evaluate('() => document.getElementById("plateStrip").scrollLeft')
        results['metrics']['scroll'] = {
            'before': before,
            'after': after,
            'scrollWidth': m.get('scrollWidth'),
            'clientWidth': m.get('clientWidth'),
        }
        check('wheel over strip scrolls horizontally', after > before + 20, f'scrollLeft {before} → {after}')

        page.wait_for_timeout(400)
        miss = page.evaluate(
            """() => {
          const want=['P09','P30','P60'];
          const out={};
          for(const id of want){
            const b=[...document.querySelectorAll('#plateStrip .pth')].find(x=>x.dataset.pid===id);
            if(!b){ out[id]={missingBtn:true}; continue; }
            const img=b.querySelector('img');
            const ph=b.querySelector('.ph');
            out[id]={src:img&&img.getAttribute('src'), ph:ph&&ph.textContent, empty:!img&&!ph};
          }
          return out;
        }"""
        )
        ok_miss = all(
            (not v.get('missingBtn'))
            and (not v.get('empty'))
            and (v.get('ph') or (v.get('src') and ('plates/' in v['src'] or 'cutout/' in v['src'])))
            for v in miss.values()
        )
        check('missing-cutout placeholders / plates fallback still work', ok_miss, json.dumps(miss)[:400])

        page.locator('#plateStrip .pth').first.dblclick()
        page.wait_for_selector('#platePick.on')
        check('dbl-click still opens Swap (Must 2)', page.is_visible('#platePick.on'))
        page.click('#platePickCancel')
        page.wait_for_function("""() => !document.getElementById('platePick').classList.contains('on')""")

        page.screenshot(path=str(QA / 'HM-COMPOSE-03b_strip.png'), full_page=True)
        page.locator('#plateStrip').screenshot(path=str(QA / 'HM-COMPOSE-03b_strip-crop.png'))
        page.evaluate(
            """() => {
          const s=document.getElementById('stats');
          if(s) s.scrollIntoView({block:'start'});
        }"""
        )
        page.wait_for_timeout(120)
        box = page.evaluate(
            """() => {
          const a=document.getElementById('stats').getBoundingClientRect();
          const b=document.getElementById('tlTools').getBoundingClientRect();
          return {x: Math.min(a.x,b.x), y: a.y, w: Math.max(a.width,b.width), h: (b.bottom-a.y)+8};
        }"""
        )
        page.screenshot(
            path=str(QA / 'HM-COMPOSE-03b_strip-context.png'),
            clip={
                'x': max(0, box['x']),
                'y': max(0, box['y']),
                'width': min(1400, box['w']),
                'height': min(400, max(100, box['h'])),
            },
        )
        check('screenshots written', (QA / 'HM-COMPOSE-03b_strip.png').is_file())

        m2 = page.evaluate('() => window.__composer.plateStripMetrics()')
        results['metrics']['after'] = m2
        check(
            'visible height still ~72–88 after interactions',
            70 <= (m2.get('visibleH') or 0) <= 96,
            json.dumps(m2),
        )

    except Exception as e:
        results['ok'] = False
        results['errors'].append(str(e))
        print('ERROR', e)
        try:
            page.screenshot(path=str(QA / 'HM-COMPOSE-03b_error.png'), full_page=True)
        except Exception:
            pass
    finally:
        browser.close()

smoke = json.loads((KIT / 'shows/library-smoke.json').read_text())
dry = api('POST', BASE + '/api/compose', {'show': smoke, 'dry': True})
check(
    'library-smoke dry compose ok',
    bool(dry.get('ok')),
    json.dumps(
        {
            'ok': dry.get('ok'),
            'warnings': dry.get('warnings'),
            'errors': dry.get('errors'),
            'stats': dry.get('stats'),
        }
    )[:400],
)
is_parity = bool(dry.get('parity_mode') or (dry.get('stats') or {}).get('parity'))
check('library-smoke not parity', not is_parity, json.dumps(dry.get('stats') or {}))

gold_after = gold_fp()
check('gold folder untouched', gold_before == gold_after, f'before={gold_before} after={gold_after}')

(QA / 'HM-COMPOSE-03b-proof.json').write_text(json.dumps(results, indent=2))
passed = sum(1 for c in results['checks'] if c['pass'])
total = len(results['checks'])
print(f"\nSUMMARY {'ALL PASS' if results['ok'] else 'FAILED'} {passed}/{total}")
raise SystemExit(0 if results['ok'] else 1)
