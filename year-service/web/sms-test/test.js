const byId = id => document.getElementById(id);
const inviteForm = byId('invite'), verifyForm = byId('verify'), send = byId('send');
const inviteCode = byId('invite-code'), smsCode = byId('sms-code'), status = byId('status');
const countries = {IN: 'India (+91)', NL: 'Netherlands (+31)', US: 'US (+1)'};
let state = null, pendingInvite = '', busy = false, retryAt = 0, timer;

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
    byId('destination').textContent = `The text goes to the ${countries[state.country]} mobile number ending in ${state.phoneHint}.`;
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
  let currentAction = action;
  status.textContent = action === 'send' ? 'Requesting the text…' : action === 'preview' ? 'Checking the test link…' : '';
  if (action !== 'preview' || !location.hash) render();
  try {
    if (action === 'send' && pendingInvite) {
      currentAction = 'open';
      show(await request('open', {token: pendingInvite}));
      pendingInvite = '';
      if (location.hash) history.replaceState(null, '', location.pathname);
      currentAction = 'send';
    }
    const next = await request(action, data);
    if (action === 'preview') {
      pendingInvite = next.resumed ? '' : data.token;
      if (next.resumed && location.hash) history.replaceState(null, '', location.pathname);
    }
    show(next);
    status.textContent = action === 'send' ? 'Text requested. Enter the code when it arrives.' : '';
    return true;
  } catch (error) {
    status.textContent = error.message;
    if (currentAction === 'open') {
      if (error.status === 400 || error.status === 401) {
        pendingInvite = '';
        show(null);
      }
    } else if (currentAction !== 'preview') {
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
  if (await run('preview', {token: inviteCode.value.trim().toLowerCase()})) {
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
  await run('preview', {token: fragment.toLowerCase()}, send);
} else {
  try { show(await request('status')); }
  catch (error) {
    show(null);
    if (error.status !== 401) status.textContent = error.message;
  }
}
