'use strict';
const frame = document.getElementById('app-frame');
const statusLine = document.getElementById('status');
let loaded = false;
let waitingForFrame = false;
async function frameReady() {
  if (waitingForFrame) return;
  waitingForFrame = true;
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    ready = typeof frame.contentWindow.render === 'function' && frame.contentDocument.getElementById('example')?.options.length > 1;
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (ready) {
    const page = frame.contentDocument;
    for (const id of ['run','mode','example']) page.getElementById(id).disabled = true;
    page.getElementById('invoice').readOnly = page.getElementById('order').readOnly = true;
    page.getElementById('run').textContent = 'Saved example only';
    page.getElementById('mode-pill').textContent = 'Saved example';
    page.getElementById('live-note').textContent = 'This viewer cannot start a review or call Clocked.';
    document.getElementById('load').disabled = false;
  }
  statusLine.textContent = ready ? 'Ready to load the saved review. No API request will be made.' : 'The review desk did not finish loading. Restart the local viewer to try again.';
}
frame.addEventListener('load', frameReady);
if (frame.contentDocument.readyState === 'complete') frameReady();
document.getElementById('load').addEventListener('click', async () => {
  document.getElementById('load').disabled = true;
  try {
    const response = await fetch('/recorded/result.json');
    if (!response.ok) throw new Error('The saved review is unavailable.');
    const recorded = await response.json();
    if (recorded.provenance.kind !== 'recorded_live_result') throw new Error('The example is not labelled as a recorded result.');
    const review = structuredClone(recorded.review);
    review.mode_label = 'RECORDED CLOCKED RESULT — captured October 30; no new API call';
    review.display_provenance = {kind:'recorded_live_result', original_run_id:review.run_id};
    const page = frame.contentDocument;
    const points = Array.from(review.source);
    page.getElementById('invoice').value = points.slice(...review.ranges.invoice).join('');
    page.getElementById('order').value = points.slice(...review.ranges.order).join('');
    page.getElementById('mode-pill').textContent = 'Recorded live result';
    frame.contentWindow.render(review);
    loaded = true;
    for (const id of ['review','highlight','export']) document.getElementById(id).disabled = false;
    statusLine.textContent = 'Saved review loaded: twelve original facts plus invoice payment terms. Human review remains necessary.';
  } catch (error) {
    statusLine.textContent = error.message;
  }
});
document.getElementById('review').addEventListener('click', () => {
  if (loaded) frame.contentDocument.querySelector('.result-panel').scrollIntoView({block:'start'});
});
document.getElementById('highlight').addEventListener('click', () => {
  if (loaded) frame.contentWindow.highlight('order_id');
});
document.getElementById('export').addEventListener('click', () => {
  if (loaded) frame.contentDocument.getElementById('export').click();
});
