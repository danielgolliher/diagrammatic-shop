// Diagrammatic & Co. — settings for the shop window.
// setup.sh writes apiBase (the Worker's address) and contactEmail here.
// While apiBase is empty the shop can be browsed, but checkout stays closed.
export const CONFIG = {
  apiBase: '',
  contactEmail: '',
};

// for local testing only: http://localhost:8772/?api=http://127.0.0.1:8787
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  const api = new URLSearchParams(location.search).get('api');
  if (api) sessionStorage.setItem('dco-api', api);
  CONFIG.apiBase = sessionStorage.getItem('dco-api') || CONFIG.apiBase;
}
