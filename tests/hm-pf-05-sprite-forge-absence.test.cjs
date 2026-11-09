const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

const BRIEF='/workspace/hr/briefs/sprite-gen-html-motion-2026-11-07.md';
const ADAPT='https://sprite-gen-html-motion-urak.pages.grok.bot/';

test('HM-PF-05 product copy: Sprite Forge absent, operator handoff, cited SoT',()=>{
  const doc=read('docs/product-flow/HM-PF-05-sprite-forge-absence.md');
  const flow=read('docs/product-flow/PRODUCT-FLOW.md');
  const arch=read('docs/FRONTEND-ONLY-2026-10-23.md');

  for(const copy of [doc,flow,arch]){
    assert.match(copy,/Sprite Forge is absent|Sprite Forge \(HM-PF-05\):\*\* absent/);
    assert.match(copy,/OOS for HM FE|out of scope for HM FE|out of scope \(OOS\) for HM FE/);
    assert.match(copy,/no in-FE GenerateImage product path/i);
    assert.match(copy,new RegExp(BRIEF.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }

  const gen=doc.search(/^1\. \*\*Generate outside\.\*\*/m);
  const qa=doc.search(/^2\. \*\*QA\.\*\*/m);
  const hand=doc.search(/^3\. \*\*Local PNG \+ JSON handoff\.\*\*/m);
  assert.ok(gen>=0&&qa>gen&&hand>qa,'checklist order is generate outside, then QA, then local PNG+JSON');
  assert.match(doc,new RegExp(ADAPT.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(flow,new RegExp(ADAPT.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(doc,/skills\/hm-spritegen-handoff\/SKILL\.md/);
  assert.match(flow,/HM-PF-05-sprite-forge-absence\.md/);

  assert.doesNotMatch(doc,/GenerateImage\s*\(|generateImage\s*\(|fetch\s*\(|api\.teqcon\.uk|:8770/);
  assert.doesNotMatch(doc,/click GenerateImage|GenerateImage button|in-FE GenerateImage product path is/i);
});
