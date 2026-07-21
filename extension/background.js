chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.source !== 'jenkins-proxy') return;

  const { jenkinsUrl, token, path } = request;
  const auth = 'Basic ' + btoa(token + ':' + token);
  const base = (jenkinsUrl || '').replace(/\/+$/, '');
  const url = base + path;

  fetch(url, { headers: { 'Authorization': auth } })
    .then(r => {
      if (!r.ok) throw new Error('Jenkins returned ' + r.status);
      return r.text();
    })
    .then(body => sendResponse({ ok: true, body }))
    .catch(err => sendResponse({ ok: false, error: err.message }));

  return true;
});
