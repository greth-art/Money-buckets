import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateDataset, upsidePercent, selectPicks } from '../src/model.js';
const data = JSON.parse(await readFile(new URL('../data/picks.json',import.meta.url),'utf8'));
test('demo fixtures satisfy the data contract',()=>assert.equal(validateDataset(data).picks.length,5));
test('upside handles positive, negative, and missing coverage',()=>{
  assert.ok(Math.abs(upsidePercent(data.picks[0])-20)<1e-9);
  assert.ok(upsidePercent(data.picks[4])<0);
  assert.equal(upsidePercent({...data.picks[0],analystTargets:null}),null);
});
test('search and bucket combine without mutating source order',()=>{
  assert.equal(selectPicks(data.picks,{query:'  nvidia ',bucket:'growth'})[0].symbol,'NVDA');
  assert.equal(selectPicks(data.picks,{query:'nvidia',bucket:'core'}).length,0);
  assert.equal(selectPicks(data.picks,{sort:'upside'})[0].symbol,'AMZN');
  assert.equal(data.picks[0].rank,1);
  assert.equal(selectPicks([...data.picks].reverse(),{sort:'rank'})[0].rank,1);
});
test('missing analyst coverage sorts last',()=>{
  const absent={...data.picks[0],analystTargets:null};
  assert.equal(selectPicks([absent,data.picks[4]],{sort:'upside'}).at(-1),absent);
});
test('reject inconsistent or malformed financial inputs',()=>{
  for (const change of [p=>p.quote.price=0,p=>p.entryZone.low=999,p=>p.analystTargets.low=999,p=>p.analystTargets.analystCount=0,p=>p.quote.asOf='yesterday',p=>p.currency='EUR']) {
    const copy=structuredClone(data); change(copy.picks[0]); assert.throws(()=>validateDataset(copy));
  }
});
test('reject duplicate IDs and ranks; allow explicit absent coverage',()=>{
  const copy=structuredClone(data); copy.picks[0].analystTargets=null; assert.doesNotThrow(()=>validateDataset(copy));
  copy.picks[1].id=copy.picks[0].id; assert.throws(()=>validateDataset(copy));
  const ranks=structuredClone(data); ranks.picks[1].rank=ranks.picks[0].rank; assert.throws(()=>validateDataset(ranks));
});
