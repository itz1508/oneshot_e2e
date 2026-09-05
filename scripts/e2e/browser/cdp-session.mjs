// OneShot E2E CDP session — launch, page tap, network capture, UI launch proof.
import {
  BASE,
  TOKEN,
  evidence,
  launchBrowser,
  sleep,
  waitFor,
} from "./cdp-core.mjs";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { SHOTS } from "./cdp-core.mjs";

export let cdp;

export async function evaluate(expr) {
  const r = await cdp.send("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
  return r.result?.value;
}

export async function screenshot(name) {
  const path = join(SHOTS, name);
  const shot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(path, Buffer.from(shot.data, "base64"));
  evidence.shots.push({ name, path, at: new Date().toISOString() });
  console.log(`[shot] ${name}`);
}

const INJECTED_TAP = `
(function(){
  if (window.__oneshotInstalled) return;
  window.__oneshotInstalled = true;
  window.__oneshotEvents = [];
  window.__oneshotRequests = [];
  window.__oneshotSSE = [];
  const NativeES = window.EventSource;
  function PatchedES(url, cfg){
    const es = new NativeES(url, cfg);
    window.__oneshotSSE.push({url: String(url), openedAt: new Date().toISOString()});
    es.addEventListener('message', function(e){
      try { window.__oneshotEvents.push(JSON.parse(e.data)); } catch (_) {}
    });
    es.addEventListener('error', function(){
      var rec = window.__oneshotSSE.filter(function(s){return s.url===String(url) && !s.closedAt;})[0];
      if (rec) rec.erroredAt = new Date().toISOString();
    });
    return es;
  }
  PatchedES.prototype = NativeES.prototype;
  window.EventSource = PatchedES;
  const NativeFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    const rec = {url: String(url), method: method, ts: new Date().toISOString(), body: (init && init.body) || ''};
    window.__oneshotRequests.push(rec);
    if (window.__oneshotRequests.length > 200) window.__oneshotRequests.shift();
    return NativeFetch(input, init).then(function(res){
      rec.status = res.status;
      try { res.clone().text().then(function(t){ rec.body = (rec.body ? rec.body + ' => ' : '') + t.slice(0, 4000); }).catch(function(){}); } catch(e){}
      return res;
    }, function(err){ rec.error = String(err); throw err; });
  };
})();
`;

export async function startSession() {
  cdp = await launchBrowser();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Network.enable");

  cdp.on("Log.entryAdded", (p) => {
    const e = p.entry;
    const rec = {
      ts: e.timestamp,
      source: e.source,
      text: String(e.text ?? "").slice(0, 500),
      url: e.url,
    };
    if (e.level === "error") evidence.console_errors.push(rec);
    else if (e.level === "warning") evidence.console_warnings.push(rec);
  });
  cdp.on("Runtime.consoleAPICalled", (p) => {
    if (p.type === "error") {
      evidence.console_errors.push({
        ts: new Date().toISOString(),
        source: "console.error",
        text: (p.args ?? [])
          .map((a) => a.value ?? a.description ?? "")
          .join(" ")
          .slice(0, 500),
      });
    }
  });
  cdp.on("Network.requestWillBeSent", (p) => {
    evidence.network.push({
      ts: new Date().toISOString(),
      method: p.request.method,
      url: p.request.url,
      type: p.type,
      post_data: p.request.postData
        ? p.request.postData.slice(0, 4000)
        : undefined,
    });
  });
  cdp.on("Network.responseReceived", (p) => {
    const last = [...evidence.network]
      .reverse()
      .find((x) => x.url === p.response.url && x.status === undefined);
    if (last) last.status = p.response.status;
  });
  cdp.on("Network.loadingFailed", (p) => {
    evidence.network_failures.push({
      ts: new Date().toISOString(),
      errorText: p.errorText,
      canceled: p.canceled,
    });
  });

  // production auth boundary: fresh ONESHOT_API_TOKEN on every app request
  await cdp.send("Fetch.enable", {
    patterns: [{ urlPattern: "*", requestStage: "Request" }],
  });
  cdp.on("Fetch.requestPaused", async (p) => {
    try {
      if (!p.request.url.startsWith(BASE)) {
        await cdp.send("Fetch.continueRequest", { requestId: p.requestId });
        return;
      }
      const headers = Object.entries(p.request.headers)
        .filter(([k]) => k.toLowerCase() !== "authorization")
        .map(([k, v]) => ({ name: k, value: String(v) }));
      headers.push({ name: "authorization", value: `Bearer ${TOKEN}` });
      await cdp.send("Fetch.continueRequest", {
        requestId: p.requestId,
        headers,
      });
    } catch {
      try {
        await cdp.send("Fetch.continueRequest", { requestId: p.requestId });
      } catch {}
    }
  });

  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: INJECTED_TAP,
  });
  console.log("[driver] navigating to", BASE);
  await cdp.send("Page.navigate", { url: BASE });
  await waitFor("page load", async () =>
    (await evaluate("document.readyState")) === "complete" ? true : undefined,
  );
  await waitFor("chat input", async () =>
    (await evaluate(
      `!!document.querySelector('textarea[placeholder="Message OneShot..."]')`,
    )) ? true : undefined,
  );
  await sleep(1500);
  return cdp;
}
