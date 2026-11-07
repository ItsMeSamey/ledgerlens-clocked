'use strict';
(function (host) {
  const currencies = ['AUD','USD','EUR','GBP','NZD','CAD','SGD'];
  const copy = value => JSON.parse(JSON.stringify(value));
  const key = value => value.trim().toLowerCase().replace(/\s+/g,' ');
  function empty() {
    return {vendor:'',po_id:'',currency:'',as_of:'',context:'',complete:false,rows:[]};
  }
  function inspect(input) {
    if (input === null) return {editable:true,ledger:empty(),issues:['History is unknown until its scope and completeness are confirmed.']};
    const reject = message => ({editable:false,issues:[message]});
    if (!input || typeof input !== 'object' || Array.isArray(input)) return reject('The ledger must be an object. Its exact JSON has been preserved.');
    if (!['vendor','po_id','currency','as_of','context'].every(k => typeof input[k] === 'string') || typeof input.complete !== 'boolean' || !Array.isArray(input.rows))
      return reject('This JSON lacks the explicit scope, date, context, completeness or rows needed by the table. Correct it in Advanced JSON; nothing has been inferred.');
    if (input.rows.length > 500) return reject('The table supports at most 500 commitments. Narrow the ledger explicitly.');
    if (input.currency && !currencies.includes(input.currency)) return reject('This currency is unsupported by the table. The exact units remain in Advanced JSON for review.');
    if (input.as_of) {
      const parsed = new Date(`${input.as_of}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.as_of) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== input.as_of)
        return reject('The as-of date is not a valid calendar date. Correct the preserved value in Advanced JSON.');
    }
    for (const [index,row] of input.rows.entries()) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || row.kind !== 'invoice' || row.status !== 'committed')
        return reject(`Row ${index+1} is not a committed invoice. Credits, reversals and other statuses stay in Advanced JSON for review.`);
      if (!['invoice_id','amount','vendor','po_id','currency'].every(k => typeof row[k] === 'string'))
        return reject(`Row ${index+1} has missing or non-text values. Correct the exact JSON; amounts will not be coerced.`);
      if (['vendor','po_id','currency'].some(k => row[k] !== input[k]))
        return reject(`Row ${index+1} has a different supplier, PO or currency. Mixed scopes stay in Advanced JSON; the table will not flatten them.`);
    }
    const issues = [];
    if (!input.vendor.trim() || !input.po_id.trim()) issues.push('Enter the supplier and PO identifier.');
    if (!currencies.includes(input.currency)) issues.push('Choose an explicit supported currency; amounts include tax.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.as_of)) issues.push('Enter the ledger as-of date.');
    if (!input.context.trim()) issues.push('Describe the source and cutoff of this ledger.');
    if (!input.complete) issues.push('Prior history remains unknown until you confirm completeness.');
    const seen = new Set();
    input.rows.forEach((row,index) => {
      const id = key(row.invoice_id);
      if (!id) issues.push(`Row ${index+1}: enter an invoice identifier.`);
      else if (seen.has(id)) issues.push(`Row ${index+1}: duplicate invoice identifier; resolve it before relying on the balance.`);
      seen.add(id);
      if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(row.amount) || row.amount.split('.')[0].replaceAll(',','').length > 12)
        issues.push(`Row ${index+1}: enter a nonnegative final amount with at most two decimals. Credits and reversals require review.`);
    });
    return {editable:true,ledger:copy(input),issues};
  }
  function editable(input) {
    const result = inspect(input);
    if (!result.editable) throw new Error(result.issues[0]);
    return result.ledger;
  }
  function changeScope(input,field,value) {
    if (!['vendor','po_id','currency','as_of','context','complete'].includes(field)) throw new Error('Unsupported scope field.');
    if (typeof value !== (field === 'complete' ? 'boolean' : 'string')) throw new Error('Invalid scope value.');
    const ledger = editable(input);
    if (ledger[field] !== value && ['vendor','po_id','currency','as_of'].includes(field)) ledger.complete = false;
    ledger[field] = value;
    if (['vendor','po_id','currency'].includes(field)) ledger.rows.forEach(row => { row[field] = value; });
    return ledger;
  }
  function changeRow(input,index,field,value) {
    if (!['invoice_id','amount'].includes(field) || typeof value !== 'string') throw new Error('Unsupported row edit.');
    const ledger = editable(input);
    if (!Number.isInteger(index) || !ledger.rows[index]) throw new Error('Unknown row.');
    if (field === 'invoice_id' && ledger.rows[index][field] !== value) ledger.complete = false;
    ledger.rows[index][field] = value;
    return ledger;
  }
  function addRow(input) {
    const ledger = editable(input);
    if (ledger.rows.length >= 500) throw new Error('At most 500 commitments are supported.');
    ledger.rows.push({invoice_id:'',amount:'',vendor:ledger.vendor,po_id:ledger.po_id,currency:ledger.currency,kind:'invoice',status:'committed'});
    ledger.complete = false;
    return ledger;
  }
  function removeRow(input,index) {
    const ledger = editable(input);
    if (!Number.isInteger(index) || !ledger.rows[index]) throw new Error('Unknown row.');
    ledger.rows.splice(index,1);
    ledger.complete = false;
    return ledger;
  }
  function recalculationPayload(invoice,order,result,ledger) {
    // The prior balance duplicates the ledger and contributing rows; the server replaces it.
    const {balance,...retained} = result;
    return {invoice,order,result:retained,ledger};
  }
  const api = {empty,inspect,changeScope,changeRow,addRow,removeRow,recalculationPayload,currencies};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  host.LedgerModel = api;
})(globalThis);
