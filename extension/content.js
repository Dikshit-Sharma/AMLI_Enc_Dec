window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'JENKINS_PROXY') return;

  chrome.runtime.sendMessage(event.data.payload, (response) => {
    window.postMessage({
      type: 'JENKINS_PROXY_RESULT',
      id: event.data.id,
      response,
    }, '*');
  });
});
