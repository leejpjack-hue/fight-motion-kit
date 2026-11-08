/* HM-PF-30 thin browser verify. Run against an existing loopback server:
 *   python3 -m http.server 8765 --bind 127.0.0.1 --directory public &
 *   TEST_BASE_URL=http://127.0.0.1:8765 node tests/hm-pf-30-browser.cjs
 * Covers only the QA panel surface; the broader SG01 browser suite
 * (tests/sg01-browser.cjs) has a pre-existing openProject lock assertion that
 * fails in this sandbox independent of HM-PF-30. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';
const fixture=require('./fixtures/sg01-final.cjs').finalTransport('periodic');
(async()=>{
  const browser=await chromium.launch({headless:true,chromiumSandbox:true});
  try{
    const context=await browser.newContext(),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/ui/');await page.evaluate(()=>window.ready);
    await page.click('#importStrip');
    assert.equal(await page.locator('#stripDialog').evaluate(e=>e.open),true);
    assert.equal(await page.locator('#stripQaPanel').evaluate(e=>e.hidden),true);
    const pair=[{name:'numbered.strip.png',mimeType:'image/png',buffer:fixture.png},{name:'numbered.strip.json',mimeType:'application/json',buffer:fixture.json}];
    await page.setInputFiles('#stripInput',pair);
    await page.waitForFunction(()=>!document.getElementById('commitStrip').disabled);
    assert.equal(await page.locator('#stripQaPanel').evaluate(e=>e.hidden),false);
    const rows=await page.locator('#stripQaFields .strip-qa-row').allInnerTexts();
    for(const expected of ['Frames','4 exported cells','83.33 ms (raw · sidecar fps 12)','16 px standing · cell h 24 px',
      'repeat · loop true · returns false · hold-last false · end frame 3','Timing source','fps','0.333 s (4 × 0.083 s/cell)'])
      assert.ok(rows.some(row=>row.includes(expected)),expected+' missing in '+JSON.stringify(rows));
    const badges=await page.locator('#stripQaWarnings li').evaluateAll(list=>list.map(li=>li.getAttribute('data-source')+':'+li.textContent));
    assert.ok(badges.some(t=>/^adapter:/.test(t)&&/not reconstructed/.test(t)));
    assert.ok(badges.filter(t=>/^metadata:/.test(t)).length>=3);
    assert.match(await page.locator('#stripQaSummary').innerText(),/1 warning/);
    // Malformed sidecar fails closed: error row, no fields, commit stays disabled.
    const broken=fixture.json.toString('utf8').replace('"frames": 4','"frames": "4"');
    assert.notEqual(broken,fixture.json.toString('utf8'));
    await page.setInputFiles('#stripInput',[{name:'numbered.strip.png',mimeType:'image/png',buffer:fixture.png},{name:'numbered.strip.json',mimeType:'application/json',buffer:Buffer.from(broken)}]);
    await page.waitForFunction(()=>!document.getElementById('stripQaError').hidden);
    assert.equal(await page.locator('#stripQaError').innerText(),'frames must be a positive finite integer.');
    assert.equal(await page.locator('#commitStrip').evaluate(e=>e.disabled),true);
    assert.equal(await page.locator('#stripQaFields .strip-qa-row').count(),0);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#stripDialog').evaluate(e=>e.open),false);
    assert.equal(await page.locator('#stripQaPanel').evaluate(e=>e.hidden),true); // close resets the panel
    assert.deepEqual(errors,[]);
    console.log('PASS HM-PF-30 browser: QA panel rows render, warnings labeled, fail-closed keeps commit disabled, close resets');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
