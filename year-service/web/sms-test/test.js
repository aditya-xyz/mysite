const byId = id => document.getElementById(id);
const inviteForm = byId('invite'), verifyForm = byId('verify'), send = byId('send');
const inviteCode = byId('invite-code'), smsCode = byId('sms-code'), status = byId('status');
let state = null, busy = false, retryAt = 0, timer;

async function request(action, data) {
  const response = await fetch('/api/sms-test/' + action, data === undefined ? {} : {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'Please try again.'), {status: response.status});
  return result;
}

function render() {
  inviteForm.hidden = !!state;
  byId('test').hidden = !state || state.verified;
  byId('complete').hidden = !state?.verified;
  verifyForm.hidden = !state?.codePending;
  if (state) {
    const country = state.country === 'IN' ? 'India (+91)' : 'Netherlands (+31)';
    byId('destination').textContent = `The text goes to the ${country} mobile number ending in ${state.phoneHint}.`;
  }
  const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
  const canSend = !!state?.sendsRemaining && !state?.attemptLimitReached;
  send.hidden = !canSend;
  send.textContent = seconds ? `Send another text in ${seconds}s` : state?.codePending ? 'Send another text' : 'Text me a code';
  byId('send-limit').hidden = canSend || !!state?.codePending;
  send.disabled = busy || !!seconds;
  inviteForm.querySelector('button').disabled = busy;
  verifyForm.querySelector('button').disabled = busy;
  clearTimeout(timer);
  if (seconds) timer = setTimeout(render, 1000);
}

function show(next) {
  state = next;
  retryAt = Date.now() + 1000 * (next?.sendRetryAfter || 0);
  render();
}

async function run(action, data, focus) {
  if (busy) return;
  busy = true;
  status.textContent = action === 'send' ? 'Requesting the text…' : '';
  render();
  try {
    show(await request(action, data));
    status.textContent = action === 'send' ? 'Text requested. Enter the code when it arrives.' : '';
    return true;
  } catch (error) {
    status.textContent = error.message;
    if (action !== 'open') {
      try { show(await request('status')); }
      catch (refreshError) { if (refreshError.status === 401) show(null); }
    }
  } finally {
    busy = false;
    render();
    if (state?.verified) byId('result').focus();
    else if (focus && (action !== 'send' || state?.codePending)) focus.focus();
  }
}

inviteForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (await run('open', {token: inviteCode.value.trim().toLowerCase()})) {
    if (location.hash) history.replaceState(null, '', location.pathname);
    inviteCode.value = '';
    send.focus();
  }
});
send.addEventListener('click', () => run('send', {}, smsCode));
verifyForm.addEventListener('submit', event => {
  event.preventDefault();
  run('verify', {code: smsCode.value});
});

const fragment = location.hash.slice(1);
if (fragment) {
  if (/^[a-f0-9]{64}$/i.test(fragment)) inviteCode.value = fragment;
  show(null);
} else {
  try { show(await request('status')); }
  catch (error) {
    show(null);
    if (error.status !== 401) status.textContent = error.message;
  }
}
