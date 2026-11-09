'use strict';
const $ = id => document.getElementById(id);
let lastResult = null;
let currentRun = null;
let examples = [];
let policyVersion = 1;
let ledgerBusy = false;
let ledgerEditable = true;
let ledgerReadOnly = false;
const labels = {vendor:'Invoice supplier',invoice_id:'Invoice number',purchase_order_id:'Invoice PO reference',currency:'Invoice currency',subtotal:'Subtotal',tax:'Tax',total:'Invoice total',due_date:'Due date',order_id:'Order number',order_vendor:'Order supplier',order_currency:'Order currency',order_total:'Authorized total'};
labels.payment_terms = 'Invoice payment terms';
function invalidate() {
  currentRun = null;
  lastResult = null;
  $('result').hidden = true;
  $('evidence-panel').hidden = true;
  $('export').hidden = true;
  $('empty').hidden = false;
  $('balance-run').disabled = true;
  $('balance-result').textContent = 'Review these documents before calculating their PO balance.';
}
function highlight(name) {
  const field = lastResult.fields[name];
  if (field.value === null) return;
  const points = Array.from(lastResult.source);
  const mark = document.createElement('mark');
  mark.textContent = points.slice(field.start, field.end).join('');
  $('source').replaceChildren(document.createTextNode(points.slice(0, field.start).join('')), mark,
    document.createTextNode(points.slice(field.end).join('')));
  $('evidence-label').textContent = `${labels[name]} / characters ${field.start}-${field.end}`;
  document.querySelectorAll('.fact').forEach(button => {
    const selected = button.dataset.name === name;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-current', String(selected));
  });
  mark.scrollIntoView({block:'nearest',behavior:'auto'});
}
function render(result) {
  lastResult = result;
  $('empty').hidden = true;
  $('result').hidden = false;
  $('export').hidden = false;
  $('evidence-panel').hidden = false;
  $('status').textContent = result.status === 'HOLD' ? 'Hold for clarification' : 'Checks consistent - human review next';
  $('status').className = `status ${result.status === 'HOLD' ? 'hold' : 'ready'}`;
  const confidence = result.classification.confidence;
  $('classification').textContent = `Document: ${result.classification.label.replaceAll('_',' ')}${confidence === null ? ' / template classification' : ` / ${(confidence*100).toFixed(1)}% model confidence`}`;
  $('result-mode').textContent = result.mode_label;
  $('invoice-total').textContent = result.fields.total.value ?? 'Missing';
  $('order-total').textContent = result.fields.order_total.value ?? 'Missing';
  $('checks-count').textContent = `${result.checks.filter(c => c.ok).length}/${result.checks.length}`;
  $('checks').replaceChildren(...result.checks.map(check => {
    const li = document.createElement('li');
    li.className = check.ok ? 'passed' : 'failed';
    const icon = document.createElement('span');
    icon.className = 'check-icon';
    icon.textContent = check.ok ? '+' : '!';
    icon.setAttribute('aria-label',check.ok ? 'Passed:' : 'Needs review:');
    li.append(icon, document.createTextNode(check.description));
    return li;
  }));
  $('facts').replaceChildren(...Object.entries(result.fields).map(([name, field]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fact' + (field.value === null ? ' missing' : '');
    button.dataset.name = name;
    button.disabled = field.value === null;
    button.setAttribute('aria-current', 'false');
    const label = document.createElement('small');
    label.textContent = labels[name];
    const value = document.createElement('span');
    value.textContent = field.value ?? 'Not established';
    button.append(label, value);
    button.addEventListener('click', () => highlight(name));
    return button;
  }));
  $('note-kind').textContent = result.handoff.note_source === 'generated'
    ? 'AI-generated purchase-order draft; verify every statement'
    : result.mode === 'live' ? 'Deterministic review policy' : 'Deterministic demo template';
  $('review-team').textContent = result.handoff.review_team;
  $('review-note').textContent = result.handoff.review_note;
  $('limits').textContent = result.limitations;
  $('trace').textContent = JSON.stringify({run_id:result.run_id,mode:result.mode,requests:result.trace},null,2);
  $('source').textContent = result.source;
  $('evidence-label').textContent = 'Select a fact above';
  $('balance-run').disabled = ledgerReadOnly;
  const balance = result.balance;
  const summary = document.createElement('p');
  summary.textContent = balance?.description ?? 'Prior PO commitments are unknown.';
  const metrics = document.createElement('dl');
  metrics.className = 'balance-metrics';
  const established = ['WITHIN_BALANCE','EXCEEDS_BALANCE'].includes(balance?.status);
  for (const [field,label] of [['prior_committed','Prior commitments'],['current_invoice','Current invoice'],['remaining_before','Available before this invoice'],['remaining_after','Remaining after this invoice']]) {
    const cell = document.createElement('div');
    const term = document.createElement('dt'); term.textContent = label;
    const value = document.createElement('dd'); value.textContent = established ? `${balance.currency} ${balance[field]}` : 'Not established';
    cell.append(term,value); metrics.append(cell);
  }
  const evidence = document.createElement('ul'); evidence.className = 'balance-evidence';
  if (established) {
    for (const [rows,excluded] of [[balance.contributing_rows,false],[balance.excluded_current_rows,true]]) {
      for (const row of rows) {
        const item = document.createElement('li');
        const id = document.createElement('strong'); id.textContent = row.invoice_id;
        const reason = document.createElement('small');
        reason.textContent = `Ledger row ${row.row_number}: ${excluded ? 'excluded from prior spend because it is counted as the current invoice' : 'included in prior commitments'}. ${row.vendor} / ${row.po_id}.`;
        item.append(id,document.createTextNode(`${row.currency} ${row.amount} including tax`),reason); evidence.append(item);
      }
    }
    if (!balance.contributing_rows.length) {
      const item = document.createElement('li'); item.textContent = 'No prior commitments in the explicitly confirmed ledger.'; evidence.append(item);
    }
  }
  const details = document.createElement('details');
  const heading = document.createElement('summary'); heading.textContent = 'Exact balance audit';
  const audit = document.createElement('pre');
  audit.textContent = JSON.stringify(balance ?? {},null,2);
  details.append(heading,audit);
  $('balance-result').replaceChildren(summary,metrics,evidence,details);
}
function readLedger() { return $('ledger').value.trim() ? JSON.parse($('ledger').value) : null; }
function markLedgerEdited() {
  if (!lastResult) return;
  const description = 'Ledger edited. Recalculate locally before using or exporting its balance.';
  const checks = lastResult.checks.filter(c => c.code !== 'cumulative_po_balance');
  checks.push({code:'cumulative_po_balance',ok:false,description,fields:[]});
  const handoff = lastResult.handoff.note_source === 'generated' ? lastResult.handoff
    : {...lastResult.handoff,review_team:'Purchasing',review_note:description};
  render({...lastResult,status:'HOLD',checks,handoff,balance:{status:'REVIEW_REQUIRED',description}});
  $('export').hidden = true;
}
function updateLedgerEnabled() { $('ledger-form-fields').disabled = ledgerBusy || ledgerReadOnly || !ledgerEditable; }
function setLedgerReadOnly(value) {
  ledgerReadOnly = value;
  $('ledger').readOnly = value;
  updateLedgerEnabled();
  $('balance-run').disabled = value || !lastResult;
}
function ledgerHints(state) {
  $('ledger-issues').replaceChildren(...state.issues.map(message => {
    const item = document.createElement('li'); item.textContent = message; return item;
  }));
  $('ledger-issues').hidden = !state.issues.length;
  if (state.editable) {
    $('ledger-complete').checked = state.ledger.complete;
    $('ledger-units').textContent = `(${state.ledger.currency || 'currency not established'}; final amounts including tax)`;
    $('ledger-add').disabled = state.ledger.rows.length >= 500;
  }
}
function writeLedger(ledger,rebuild=false) {
  $('ledger').value = JSON.stringify(ledger,null,2);
  markLedgerEdited();
  if (rebuild) syncLedgerEditor(); else ledgerHints(LedgerModel.inspect(ledger));
}
function syncLedgerEditor() {
  let state;
  try { state = LedgerModel.inspect(readLedger()); }
  catch (error) { state = {editable:false,issues:[`JSON needs correction: ${error.message}. Its text has been preserved.`]}; }
  ledgerEditable = state.editable;
  updateLedgerEnabled();
  $('ledger-editor-warning').hidden = state.editable;
  $('ledger-editor-warning').textContent = state.editable ? '' : state.issues[0];
  if (!state.editable) $('ledger-advanced').open = true;
  const ledger = state.editable ? state.ledger : LedgerModel.empty();
  for (const [id,key] of [['ledger-vendor','vendor'],['ledger-po','po_id'],['ledger-currency','currency'],['ledger-date','as_of'],['ledger-context','context']]) $(id).value = ledger[key];
  $('ledger-complete').checked = ledger.complete;
  $('ledger-rows').replaceChildren(...ledger.rows.map((row,index) => {
    const tr = document.createElement('tr');
    for (const field of ['invoice_id','amount']) {
      const cell = document.createElement('td'); const input = document.createElement('input');
      input.type = 'text'; input.value = row[field]; input.autocomplete = 'off';
      input.setAttribute('aria-label',`${field === 'invoice_id' ? 'Invoice identifier' : 'Amount including tax'} for row ${index+1}`);
      if (field === 'amount') input.inputMode = 'decimal';
      input.addEventListener('input',() => writeLedger(LedgerModel.changeRow(readLedger(),index,field,input.value)));
      cell.append(input); tr.append(cell);
    }
    const cell = document.createElement('td'); const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'secondary'; remove.textContent = 'Remove';
    remove.setAttribute('aria-label',`Remove invoice row ${index+1}`);
    remove.addEventListener('click',() => writeLedger(LedgerModel.removeRow(readLedger(),index),true));
    cell.append(remove); tr.append(cell); return tr;
  }));
  ledgerHints(state);
}
for (const [id,key] of [['ledger-vendor','vendor'],['ledger-po','po_id'],['ledger-currency','currency'],['ledger-date','as_of'],['ledger-context','context'],['ledger-complete','complete']]) {
  $(id).addEventListener(key === 'complete' || key === 'currency' ? 'change' : 'input',() => {
    writeLedger(LedgerModel.changeScope(readLedger(),key,key === 'complete' ? $(id).checked : $(id).value));
  });
}
$('ledger-add').addEventListener('click',() => writeLedger(LedgerModel.addRow(readLedger()),true));
$('ledger').addEventListener('input',() => { markLedgerEdited(); syncLedgerEditor(); });
$('balance-run').addEventListener('click', async () => {
  if (!lastResult) return;
  $('error').hidden = true;
  $('balance-run').disabled = $('run').disabled = true;
  ledgerBusy = true; updateLedgerEnabled();
  $('invoice').disabled = $('order').disabled = $('example').disabled = $('mode').disabled = $('ledger').disabled = true;
  try {
    const response = await fetch('/api/balance',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(LedgerModel.recalculationPayload($('invoice').value,$('order').value,lastResult,readLedger()))});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Local balance check failed.');
    render(result);
  } catch (error) { $('error').textContent = error.message; $('error').hidden = false; }
  finally {
    $('balance-run').disabled = $('run').disabled = false;
    $('invoice').disabled = $('order').disabled = $('example').disabled = $('mode').disabled = $('ledger').disabled = false;
    ledgerBusy = false; updateLedgerEnabled();
  }
});
$('invoice').addEventListener('input',invalidate);
$('order').addEventListener('input',invalidate);
$('mode').addEventListener('change',invalidate);
$('example').addEventListener('change',event => {
  const sample = examples.find(item => item.id === event.target.value);
  if (sample) { $('invoice').value = sample.invoice; $('order').value = sample.order; $('ledger').value = sample.ledger ? JSON.stringify(sample.ledger,null,2) : ''; invalidate(); syncLedgerEditor(); }
});
$('run').addEventListener('click', async () => {
  $('error').hidden = true;
  $('run').disabled = true;
  ledgerBusy = true; updateLedgerEnabled();
  $('invoice').disabled = $('order').disabled = $('example').disabled = $('mode').disabled = $('ledger').disabled = $('balance-run').disabled = true;
  $('run').textContent = 'Reviewing...';
  try {
    const ledger = readLedger();
    const documentBytes = new TextEncoder().encode(JSON.stringify({invoice:$('invoice').value,order:$('order').value,mode:$('mode').value,policy_version:policyVersion}));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',documentBytes)), n=>n.toString(16).padStart(2,'0')).join('');
    let previous = null;
    try { previous = JSON.parse(sessionStorage.getItem('ledgerlens-run')); } catch (_) { /* Storage may be unavailable. */ }
    if (!currentRun) currentRun = previous?.digest === digest ? previous.run_id : crypto.randomUUID();
    try { sessionStorage.setItem('ledgerlens-run',JSON.stringify({digest,run_id:currentRun})); } catch (_) { /* In-memory recovery still works. */ }
    const response = await fetch('/api/review', {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({invoice:$('invoice').value,order:$('order').value,mode:$('mode').value,run_id:currentRun,ledger})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Review failed.');
    render(result);
  } catch (error) {
    $('error').textContent = `${error.message} Retry keeps the same run identifier while these documents stay unchanged.`;
    $('error').hidden = false;
  } finally {
    $('run').disabled = false;
    $('invoice').disabled = $('order').disabled = $('example').disabled = $('mode').disabled = $('ledger').disabled = false;
    $('balance-run').disabled = !lastResult;
    ledgerBusy = false; updateLedgerEnabled();
    $('run').textContent = 'Review documents →';
  }
});
$('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(lastResult,null,2)],{type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = `ledgerlens-${lastResult.run_id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
});
Promise.all([fetch('/api/config').then(r=>r.json()),fetch('/api/examples').then(r=>r.json())]).then(([config,cases]) => {
  policyVersion = config.policy_version;
  examples = cases;
  for (const item of cases) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    $('example').append(option);
  }
  if (cases.length) {
    $('invoice').value = cases[0].invoice;
    $('order').value = cases[0].order;
    $('example').value = cases[0].id;
    $('ledger').value = cases[0].ledger ? JSON.stringify(cases[0].ledger,null,2) : '';
    syncLedgerEditor();
  }
  if (config.live_enabled) {
    const live = $('mode').querySelector('option[value=live]');
    live.disabled = false;
    live.textContent = 'Clocked live API';
    $('live-note').textContent = 'Live mode sends both documents to Clocked and consumes account credits. Confirm your remaining free credits before each live run. Recovery facts are saved locally in the server journal.';
    $('mode-pill').textContent = 'Offline default / live available';
  }
}).catch(error => { $('error').hidden=false; $('error').textContent=`Could not load local configuration: ${error.message}`; });
