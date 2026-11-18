const byId = id => document.getElementById(id);
const form = byId('create'), phone = byId('phone'), link = byId('invite-link');
const status = byId('status'), history = byId('history'), refresh = byId('refresh');
const create = form.querySelector('button');
const countries = {IN: 'India', NL: 'Netherlands', US: 'US'};
const dates = new Intl.DateTimeFormat(undefined, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
let busy = false, currentInvite;

async function request(suffix = '', data) {
  const response = await fetch('/api/sms-tests' + suffix, data === undefined ? {} : {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data),
  });
  if (response.status === 401) throw new Error('Sign in to Studio again and reload this page.');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Please try again.');
  return result;
}

async function load() {
  const {tests} = await request();
  byId('empty').hidden = tests.length > 0;
  history.replaceChildren(...tests.map(test => {
    const row = document.createElement('li');
    const name = document.createElement('strong');
    const details = document.createElement('span');
    name.textContent = `${countries[test.country]} · •••• ${test.phoneHint}`;
    details.textContent = `${test.status} · expires ${dates.format(test.expiresAt * 1000)}`;
    row.append(name, details);
    if (!['Verified', 'Revoked', 'Expired'].includes(test.status)) {
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.textContent = 'Revoke';
      revoke.setAttribute('aria-label', `Revoke test for number ending in ${test.phoneHint}`);
      revoke.addEventListener('click', () => run(async () => {
        await request('/' + test.id + '/revoke', {});
        if (currentInvite === test.id) {
          currentInvite = undefined;
          link.value = '';
          byId('new-invite').hidden = true;
        }
        status.textContent = 'Test link revoked.';
        await load();
        refresh.focus();
      }));
      row.append(revoke);
    }
    return row;
  }));
}

async function run(work) {
  if (busy) return;
  busy = true;
  create.disabled = refresh.disabled = true;
  status.textContent = '';
  try { await work(); }
  catch (error) { status.textContent = error.message; }
  finally { create.disabled = refresh.disabled = busy = false; }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    const test = await request('', {phone: phone.value});
    currentInvite = test.id;
    link.value = test.url;
    phone.value = '';
    byId('new-invite').hidden = false;
    status.textContent = 'Test link generated.';
    link.focus();
    link.select();
    await load();
  });
});
byId('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(link.value);
    status.textContent = 'Copied.';
  } catch {
    link.focus();
    link.select();
    status.textContent = 'Copy the selected link.';
  }
});
refresh.addEventListener('click', () => run(load));
run(load);
