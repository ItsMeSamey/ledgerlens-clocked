'use strict';
const $ = id => document.getElementById(id);
let lastResult = null;
let currentRun = null;
let examples = [];
let policyVersion = 1;
const labels = {vendor:'Invoice supplier',invoice_id:'Invoice number',purchase_order_id:'Invoice PO reference',currency:'Invoice currency',subtotal:'Subtotal',tax:'Tax',total:'Invoice total',due_date:'Due date',order_id:'Order number',order_vendor:'Order supplier',order_currency:'Order currency',order_total:'Authorized total'};
labels.payment_terms = 'Invoice payment terms';
function invalidate() {
  currentRun = null;
  lastResult = null;
  $('result').hidden = true;
  $('evidence-panel').hidden = true;
  $('export').hidden = true;
  $('empty').hidden = false;
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
  document.querySelectorAll('.fact').forEach(button => button.classList.toggle('selected', button.dataset.name === name));
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
}
$('invoice').addEventListener('input',invalidate);
$('order').addEventListener('input',invalidate);
$('mode').addEventListener('change',invalidate);
$('example').addEventListener('change',event => {
  const sample = examples.find(item => item.id === event.target.value);
  if (sample) { $('invoice').value = sample.invoice; $('order').value = sample.order; invalidate(); }
});
$('run').addEventListener('click', async () => {
  $('error').hidden = true;
  $('run').disabled = true;
  $('invoice').disabled = $('order').disabled = $('example').disabled = $('mode').disabled = true;
  $('run').textContent = 'Reviewing...';
  try {
    const documentBytes = new TextEncoder().encode(JSON.stringify({invoice:$('invoice').value,order:$('order').value,mode:$('mode').value,policy_version:policyVersion}));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',documentBytes)), n=>n.toString(16).padStart(2,'0')).join('');
    let previous = null;
    try { previous = JSON.parse(sessionStorage.getItem('ledgerlens-run')); } catch (_) { /* Storage may be unavailable. */ }
    if (!currentRun) currentRun = previous?.digest === digest ? previous.run_id : crypto.randomUUID();
    try { sessionStorage.setItem('ledgerlens-run',JSON.stringify({digest,run_id:currentRun})); } catch (_) { /* In-memory recovery still works. */ }
    const response = await fetch('/api/review', {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({invoice:$('invoice').value,order:$('order').value,mode:$('mode').value,run_id:currentRun})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Review failed.');
    render(result);
  } catch (error) {
    $('error').textContent = `${error.message} Retry keeps the same run identifier while these documents stay unchanged.`;
    $('error').hidden = false;
  } finally {
    $('run').disabled = false;
    $('invoice').disabled = $('order').disabled = $('example').disabled = $('mode').disabled = false;
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
  }
  if (config.live_enabled) {
    const live = $('mode').querySelector('option[value=live]');
    live.disabled = false;
    live.textContent = 'Clocked live API';
    $('live-note').textContent = 'Live mode sends both documents to Clocked and consumes account credits. Confirm your remaining free credits before each live run. Recovery facts are saved locally in the server journal.';
    $('mode-pill').textContent = 'Offline default / live available';
  }
}).catch(error => { $('error').hidden=false; $('error').textContent=`Could not load local configuration: ${error.message}`; });
