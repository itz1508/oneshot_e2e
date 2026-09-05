/**
 * Web-managed provider configuration UI.
 *
 * Renders the provider catalog with non-secret status, lets the user pick the
 * active provider, and submits/removes credentials (WRITE-ONLY from the
 * browser's perspective — credentials are never retrievable after submit).
 */

const $ = (s, r = document) => r.querySelector(s);

const CREDENTIAL_HINTS = {
  openai: 'OpenAI API key',
  anthropic: 'Anthropic API key',
  gemini: 'Gemini API key',
  featherless: 'Featherless API key',
  api_key: 'API key',
  none: '',
};

// The Gemini (ADK) readiness probe executes one live model generation per
// configured pipeline model — make the paid-quota cost explicit in the UI.
const TEST_HINTS = {
  gemini:
    'Gemini probe runs one live model generation per pipeline model — this consumes paid API quota.',
};

const TEST_LABELS = {
  PROVIDER_AUTH_FAILURE: 'Authentication failed',
  PROVIDER_MODEL_FAILURE: 'Model unavailable',
  PROVIDER_NETWORK_FAILURE: 'Network failure',
  PROVIDER_CONFIGURATION_FAILURE: 'Configuration incomplete',
  PROVIDER_INTERNAL_FAILURE: 'Provider error',
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

export function createProviderPanel({ apiFetch, toast, onChanged } = {}) {
  let items = [];
  let activeProvider = '';
  let revision = 0;
  let busy = false;

  async function refresh() {
    const r = await apiFetch('/api/providers');
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${r.status}`);
    }
    const data = await r.json();
    items = Array.isArray(data.providers) ? data.providers : [];
    activeProvider = String(data.activeProvider || '');
    revision = Number(data.revision || 0);
    return data;
  }

  function statusHTML(p) {
    if (p.credentialType === 'none') {
      return '<span class="pcred none">no credential</span>';
    }
    if (p.configured) {
      return `<span class="pcred ok" title="Stored server-side; cannot be retrieved">configured · ${esc(p.credentialSource)}</span>`;
    }
    return '<span class="pcred missing">credential required</span>';
  }

  function rowHTML(p) {
    const isActive = p.id === activeProvider;
    return `
      <div class="prov-row${isActive ? ' active' : ''}" data-provider="${esc(p.id)}">
        <div class="prov-main">
          <label class="prov-select">
            <input type="radio" name="active-provider" value="${esc(p.id)}" ${isActive ? 'checked' : ''}>
            <span class="prov-name">${esc(p.label)}</span>
            <span class="prov-id">${esc(p.id)} · ${esc(p.type)}</span>
          </label>
          <div class="prov-status">
            ${statusHTML(p)}
            <span class="pmodel">model: ${esc(p.model || '—')}</span>
            <label class="penabled"><input type="checkbox" data-enabled-for="${esc(p.id)}" ${p.enabled !== false ? 'checked' : ''}> enabled</label>
          </div>
        </div>
        ${p.credentialType !== 'none' ? `
        <div class="prov-cred" data-cred-for="${esc(p.id)}">
          <input type="password" autocomplete="off" data-cred-input="${esc(p.id)}"
                 placeholder="${esc(CREDENTIAL_HINTS[p.id] || CREDENTIAL_HINTS[p.credentialType] || 'Credential value')}"
                 aria-label="Credential for ${esc(p.label)}">
          <button class="btn small" data-cred-save="${esc(p.id)}">Save credential</button>
          ${p.configured && p.credentialSource === 'local-secret-store' ? `<button class="btn small danger" data-cred-delete="${esc(p.id)}">Remove</button>` : ''}
        </div>` : ''}
        <div class="prov-test">
          <button class="btn small" data-test-btn="${esc(p.id)}" title="${esc(TEST_HINTS[p.id] || '')}">Test connection</button>
          <span class="ptest-status" data-test-status="${esc(p.id)}" aria-live="polite"></span>
        </div>
      </div>`;
  }

  function render() {
    const root = $('#providers');
    if (!root) return;
    root.innerHTML = items.length
      ? items.map(rowHTML).join('')
      : '<div class="prov-empty">Provider catalog unavailable.</div>';
    wire();
  }

  function wire() {
    const root = $('#providers');
    if (!root) return;

    root.querySelectorAll('input[name="active-provider"]').forEach((el) => {
      el.onchange = async () => {
        if (!el.checked) return;
        const pid = el.value;
        if (pid === activeProvider) return;
        if (busy) { render(); return; }
        busy = true;
        try {
          const r = await apiFetch('/api/providers/runtime-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activeProvider: pid }),
          });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.error || `HTTP ${r.status}`);
          }
          await refresh();
          render();
          toast(`Active provider set to ${pid}`);
          if (onChanged) onChanged();
        } catch (e) {
          toast(`Provider selection failed: ${e.message || e}`);
          render();
        } finally {
          busy = false;
        }
      };
    });

    root.querySelectorAll('[data-cred-save]').forEach((btn) => {
      btn.onclick = async () => {
        const pid = btn.getAttribute('data-cred-save');
        const input = $(`[data-cred-input="${pid}"]`, root);
        const value = input ? input.value : '';
        if (!value.trim()) { toast('Enter a credential value first.'); return; }
        btn.disabled = true;
        try {
          const r = await apiFetch(`/api/providers/${encodeURIComponent(pid)}/credential`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value }),
          });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.error || `HTTP ${r.status}`);
          }
          if (input) input.value = '';
          await refresh();
          render();
          toast(`Credential stored for ${pid} (server-side only)`);
          if (onChanged) onChanged();
        } catch (e) {
          if (input) input.value = '';
          toast(`Credential save failed: ${e.message || e}`);
        } finally {
          btn.disabled = false;
        }
      };
    });

    root.querySelectorAll('[data-cred-delete]').forEach((btn) => {
      btn.onclick = async () => {
        const pid = btn.getAttribute('data-cred-delete');
        btn.disabled = true;
        try {
          const r = await apiFetch(`/api/providers/${encodeURIComponent(pid)}/credential`, { method: 'DELETE' });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.error || `HTTP ${r.status}`);
          }
          await refresh();
          render();
          toast(`Credential removed for ${pid}`);
          if (onChanged) onChanged();
        } catch (e) {
          toast(`Credential removal failed: ${e.message || e}`);
        } finally {
          btn.disabled = false;
        }
      };
    });

    root.querySelectorAll('[data-test-btn]').forEach((btn) => {
      btn.onclick = async () => {
        const pid = btn.getAttribute('data-test-btn');
        const status = $(`[data-test-status="${pid}"]`, root);
        const input = $(`[data-cred-input="${pid}"]`, root);
        const value = input ? input.value : '';
        const set = (cls, text) => {
          if (status) {
            status.className = `ptest-status ${cls}`;
            status.textContent = text;
            status.title = '';
          }
        };
        btn.disabled = true;
        set('testing', 'Testing…');
        try {
          const r = await apiFetch(`/api/providers/${encodeURIComponent(pid)}/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(value ? { value } : {}),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) {
            throw new Error(d.error || `HTTP ${r.status}`);
          }
          if (d.ok) {
            set('ok', 'Connected');
          } else {
            set('fail', TEST_LABELS[d.category] || d.message || 'Test failed');
          }
          if (status && d.detail) status.title = d.detail;
          if (status && d.message) status.title = d.detail ? `${d.message} — ${d.detail}` : d.message;
        } catch (e) {
          set('fail', `Test failed: ${e.message || e}`);
        } finally {
          // A transient credential typed for the probe is never persisted.
          if (input) input.value = '';
          btn.disabled = false;
        }
      };
    });

    root.querySelectorAll('[data-enabled-for]').forEach((el) => {
      el.onchange = async () => {
        if (busy) { render(); return; }
        const pid = el.getAttribute('data-enabled-for');
        busy = true;
        try {
          const r = await apiFetch('/api/providers/runtime-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ providers: { [pid]: { enabled: el.checked } } }),
          });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.error || `HTTP ${r.status}`);
          }
          await refresh();
          render();
          toast(`${pid} ${el.checked ? 'enabled' : 'disabled'}`);
          if (onChanged) onChanged();
        } catch (e) {
          toast(`Update failed: ${e.message || e}`);
          render();
        } finally {
          busy = false;
        }
      };
    });
  }

  return {
    refreshAndRender: async () => {
      try {
        await refresh();
        render();
      } catch (e) {
        const root = $('#providers');
        if (root) root.innerHTML = `<div class="prov-empty">Providers unavailable: ${esc(e.message || e)}</div>`;
      }
    },
    get activeProvider() { return activeProvider; },
    get revision() { return revision; },
  };
}
