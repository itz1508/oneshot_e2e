/** Provider settings and write-only credential submission; API owns all saved state. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function providerRowHTML(p, activeProvider) {
    const name = esc(p.displayName);
    const pid = esc(p.id);
    const model = esc(p.runtime?.model || p.model);
    return `<section class="prov-row${p.id === activeProvider ? ' active' : ''}" data-provider="${pid}">
      <h3 class="prov-name">${name}${p.id === activeProvider ? ' · Active' : ''}</h3>
      <p class="pcred ${p.configured ? 'ok' : 'missing'}">${p.configured ? 'Configured' : 'Not configured'} · ${esc(p.credentialSource)}</p>
      <label>Model <input data-model list="models-${pid}" value="${model}" aria-label="${name} model">
      <datalist id="models-${pid}"><option value="${model}"></option></datalist></label>
      <label>Base URL <input data-base-url type="url" value="${esc(p.runtime?.apiBase || p.apiBaseUrl || '')}" placeholder="Provider default endpoint" aria-label="${name} base URL"></label>
      ${p.supportsTemperature ? `<label>Temperature <input data-temperature type="number" min="0" max="${p.id === 'anthropic' ? 1 : 2}" step="0.1" value="${esc(p.runtime?.temperature ?? '')}" placeholder="Provider default"></label>` : ''}
      ${p.credentialType !== 'none' ? `<label>API key <span class="provider-key"><input data-key type="password" autocomplete="off" spellcheck="false" aria-label="${name} API key" placeholder="${p.configured ? 'Enter replacement key' : 'Enter API key'}"><button type="button" data-key-visibility aria-label="Show ${name} key" aria-pressed="false">Show</button></span></label>` : ''}
      <div class="prov-actions">
        <button data-action="test">Test Connection</button>
        <button data-action="activate">Save &amp; Activate</button>
        ${p.credentialType !== 'none' ? '<button data-action="replace">Replace Key</button>' : ''}
        ${p.credentialSource === 'local-secret-store' ? '<button data-action="remove">Remove Key</button>' : ''}
      </div>
      ${p.credentialSource === 'env-var' ? '<p>Environment credential is managed on the server and takes precedence over saved keys.</p>' : ''}
      <p data-result role="status"></p>
    </section>`;
}

export function createProviderPanel({ apiFetch, toast, onChanged } = {}) {
    let activeProvider = '<default>';
    let revision = 0;
    let busy = false;
    let selectedProvider;

    async function request(path, method, data) {
        const response = await apiFetch(path, {
            method, headers: { 'Content-Type': 'application/json' },
            ...(data === undefined ? {} : { body: JSON.stringify(data) }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        return result;
    }

    async function refreshAndRender() {
        const root = document.querySelector('#providers');
        if (!root) return;
        try {
            const data = await request('/api/providers', 'GET');
            activeProvider = data.activeProvider;
            revision = data.revision;
            if (!data.providers.some(p => p.id === selectedProvider)) selectedProvider = data.providers.some(p => p.id === activeProvider) ? activeProvider : data.providers[0]?.id;
            const active = data.providers.find(p => p.id === activeProvider);
            const trigger = document.querySelector('#provider-trigger');
            if (trigger) trigger.textContent = active ? `${active.displayName} · ${active.runtime?.model || active.model}` : 'Configure provider';
            root.innerHTML = `<p class="prov-summary">Active provider: ${esc(activeProvider === '<default>' ? '<default>' : data.providers.find(p => p.id === activeProvider)?.displayName)}</p>`
                + `<div class="provider-tiles" role="group" aria-label="Select provider">${data.providers.map(p => `<button type="button" data-select-provider="${esc(p.id)}" aria-pressed="${p.id === selectedProvider}"><strong>${esc(p.displayName)}</strong><small>${p.id === activeProvider ? 'Active' : p.configured ? 'Configured' : 'Not configured'}</small></button>`).join('')}</div>`
                + data.providers.map(p => providerRowHTML(p, activeProvider)).join('')
                + `<details class="prov-advanced"><summary>Advanced Research · Optional</summary><p>Tavily: ${data.advancedResearch?.tavily?.enabled ? 'Enabled' : 'Off'}.</p><p>Configured separately on the server with TAVILY_API_KEY and ONESHOT_TAVILY_MODE.</p></details>`;
            root.querySelectorAll('[data-provider]').forEach(row => {
                const pid = row.dataset.provider;
                row.hidden = pid !== selectedProvider;
                const base = `/api/providers/${encodeURIComponent(pid)}`;
                row.querySelector('[data-key-visibility]')?.addEventListener('click', event => {
                    const input = row.querySelector('[data-key]');
                    const visible = input.type === 'password';
                    input.type = visible ? 'text' : 'password';
                    event.currentTarget.textContent = visible ? 'Hide' : 'Show';
                    event.currentTarget.setAttribute('aria-pressed', String(visible));
                    event.currentTarget.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} ${pid} key`);
                });
                row.querySelectorAll('[data-action]').forEach(button => {
                    button.onclick = async () => {
                        if (busy) return;
                        busy = true;
                        root.querySelectorAll('button').forEach(b => { b.disabled = true; });
                        const input = row.querySelector('[data-key]');
                        const value = input?.value.trim() || '';
                        const action = button.dataset.action;
                        const result = row.querySelector('[data-result]');
                        try {
                            if (action === 'remove') {
                                await request(base + '/credential', 'DELETE');
                            } else if (action === 'replace') {
                                if (!value) throw new Error('Enter a replacement key.');
                                await request(base + '/credential', 'PUT', { value });
                            } else {
                                const temperature = row.querySelector('[data-temperature]')?.value;
                                const settings = { model: row.querySelector('[data-model]').value.trim(),
                                    apiBase: row.querySelector('[data-base-url]').value.trim() || undefined,
                                    ...(temperature ? { temperature: Number(temperature) } : {}) };
                                if (action === 'test') {
                                    const tested = await request(base + '/test', 'POST', { ...settings, ...(value ? { value } : {}) });
                                    result.textContent = tested.ok ? 'Connection verified.' : tested.error || 'Connection failed.';
                                    return;
                                }
                                await request(base, 'PUT', settings);
                                if (value) await request(base + '/credential', 'PUT', { value });
                                await request(base + '/activate', 'POST');
                            }
                            await refreshAndRender();
                            await onChanged?.();
                            toast(action === 'activate' ? 'Provider activated.' : 'Credential updated.');
                        } catch (error) {
                            result.textContent = error.message;
                        } finally {
                            if (input) { input.value = ''; input.type = 'password'; }
                            busy = false;
                            root.querySelectorAll('button').forEach(b => { b.disabled = false; });
                        }
                    };
                });
            });
            root.querySelectorAll('[data-select-provider]').forEach(button => {
                button.onclick = () => {
                    clearSecrets();
                    selectedProvider = button.dataset.selectProvider;
                    root.querySelectorAll('[data-select-provider]').forEach(tile => tile.setAttribute('aria-pressed', String(tile === button)));
                    root.querySelectorAll('[data-provider]').forEach(row => { row.hidden = row.dataset.provider !== selectedProvider; });
                };
            });
        } catch (error) {
            root.innerHTML = `<p class="prov-empty">Providers unavailable: ${esc(error.message)}</p>`;
        }
    }
    function clearSecrets() {
        document.querySelectorAll('#providers [data-key]').forEach(input => { input.value = ''; input.type = 'password'; });
        document.querySelectorAll('#providers [data-key-visibility]').forEach(button => { button.textContent = 'Show'; button.setAttribute('aria-pressed', 'false'); });
    }
    return { refreshAndRender, clearSecrets, get activeProvider() { return activeProvider; }, get revision() { return revision; } };
}
