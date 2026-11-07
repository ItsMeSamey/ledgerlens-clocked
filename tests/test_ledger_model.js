'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../static/ledger-model.js');
const cases = JSON.parse(fs.readFileSync(path.join(__dirname,'../fixtures/balance-cases.json'),'utf8'));
const base = cases[0].ledger;
const clone = value => JSON.parse(JSON.stringify(value));
let count = 0;
function check(name,fn) { fn(); count++; console.log(`PASS ${name}`); }
const edited = model.changeRow(base,0,'amount','400.00');
check('amount edit preserves exact currency, invoice ID, metadata and coverage',() => {
  assert.equal(edited.rows[0].amount,'400.00');
  assert.equal(edited.rows[0].invoice_id,'INV-PRIOR');
  assert.equal(edited.rows[0].currency,'AUD');
  assert.equal(edited.complete,true);
  assert.equal(base.rows[0].amount,'600.00');
  assert.deepEqual(model.inspect(edited).issues,[]);
  const metadata = clone(base); metadata.rows[0].source_note = 'Fictional source row A';
  assert.equal(model.changeRow(metadata,0,'amount','400.00').rows[0].source_note,'Fictional source row A');
});
check('blank input remains explicitly incomplete and distinct from confirmed zero',() => {
  const blank = model.inspect(null);
  assert.equal(blank.editable,true); assert.equal(blank.ledger.complete,false);
  assert.deepEqual(blank.ledger.rows,[]); assert.ok(blank.issues.length);
  assert.deepEqual(model.inspect(cases[1].ledger).issues,[]);
});
check('scope and as-of changes clear confirmation and update row scope explicitly',() => {
  for (const [field,value] of [['vendor','New fictional supplier'],['po_id','PO-OTHER'],['currency','USD'],['as_of','2026-10-30']]) {
    const changed = model.changeScope(base,field,value);
    assert.equal(changed.complete,false);
    if (field !== 'as_of') assert.equal(changed.rows[0][field],value);
    assert.equal(changed.rows[0].amount,'600.00');
  }
});
check('adding/removing/renaming invoice identities clears completeness',() => {
  const added = model.addRow(base);
  assert.equal(added.complete,false); assert.equal(added.rows.length,2);
  assert.equal(added.rows[1].invoice_id,''); assert.equal(added.rows[1].amount,'');
  assert.ok(model.inspect(added).issues.some(s => s.includes('identifier')));
  assert.equal(model.removeRow(base,0).complete,false);
  assert.equal(model.changeRow(base,0,'invoice_id','INV-OTHER').complete,false);
});
const duplicate = clone(base); duplicate.rows.push({...duplicate.rows[0],invoice_id:' inv-prior '});
check('missing and duplicate IDs stay visible as problems, never silently deduplicated',() => {
  assert.equal(model.inspect(duplicate).ledger.rows.length,2);
  assert.ok(model.inspect(duplicate).issues.some(s => s.includes('duplicate')));
  assert.ok(model.inspect(model.changeRow(base,0,'invoice_id','')).issues.some(s => s.includes('identifier')));
});
const mixed = clone(base); mixed.rows[0].currency='USD';
const credit = clone(base); credit.rows[0].kind='credit_note';
check('mixed scopes and credit/reversal/status rows retain exact advanced JSON',() => {
  const variants=[mixed,credit];
  for (const [field,value] of [['po_id','OTHER'],['vendor','Other'],['kind','reversal'],['status','cancelled']]) {
    const item=clone(base); item.rows[0][field]=value; variants.push(item);
  }
  for (const item of variants) {
    const before=JSON.stringify(item);
    assert.equal(model.inspect(item).editable,false);
    assert.throws(() => model.changeRow(item,0,'amount','400.00'));
    assert.equal(JSON.stringify(item),before);
  }
});
check('amount notation and unsupported units are not coerced',() => {
  for (const amount of ['-100.00','1.234','AUD 600','1e3','']) {
    const item=model.changeRow(base,0,'amount',amount);
    assert.ok(model.inspect(item).issues.some(s => s.includes('amount')));
    assert.equal(item.rows[0].amount,amount);
  }
  const numeric=clone(base); numeric.rows[0].amount=600;
  assert.equal(model.inspect(numeric).editable,false);
  const currency=clone(base); currency.currency=currency.rows[0].currency='JPY';
  assert.equal(model.inspect(currency).editable,false);
});
check('malformed scope/date and absent rows remain advanced rather than becoming zero',() => {
  for (const item of [{}, {...base,rows:undefined}, {...base,complete:'true'}, {...base,as_of:'2026-02-30'}])
    assert.equal(model.inspect(item).editable,false);
});
let current = model.addRow(base);
current = model.changeRow(current,1,'invoice_id','INV-CURRENT');
current = model.changeRow(current,1,'amount','600.00');
current = model.changeScope(current,'complete',true);
check('explicit current-invoice row is retained for authoritative exclusion',() => {
  assert.equal(current.rows.length,2); assert.equal(current.complete,true);
  assert.deepEqual(model.inspect(current).issues,[]);
});
check('unchanged recalculation does not resend the prior ledger/audit copies',() => {
  const large=clone(base); large.vendor='Fictional supplier name used solely for the bounded serialization case';
  large.rows=Array.from({length:500},(_,i) => ({...base.rows[0],vendor:large.vendor,invoice_id:`PRIOR-${i}`}));
  const invoice='x'.repeat(40000), order='';
  const result={source:invoice,source_sha256:'retained-digest',trace:[],balance:{ledger:large,contributing_rows:large.rows}};
  const old={invoice,order,result,ledger:large};
  const compact=model.recalculationPayload(invoice,order,result,large);
  assert.ok(Buffer.byteLength(JSON.stringify(old))>250000);
  assert.ok(Buffer.byteLength(JSON.stringify(compact))<250000);
  assert.equal(compact.result.balance,undefined);
  assert.equal(compact.result.source_sha256,'retained-digest');
  assert.deepEqual(compact.result.trace,[]);
  assert.ok(result.balance);
});
if (process.argv[2]) fs.writeFileSync(process.argv[2],JSON.stringify({invoice:cases[0].invoice,order:cases[0].order,edited,duplicate,mixed,credit,current},null,2),{flag:'wx'});
console.log(`${count} focused model checks passed`);
