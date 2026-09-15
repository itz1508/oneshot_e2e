import { hasVerifiedHash } from "./human-gates.js";
const esc = (value) =>
    String(value ?? "").replace(
        /[&<>"']/g,
        (c) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[c],
    );

function renderMutations(mutations) {
    if (
        !mutations ||
        !Array.isArray(mutations.records) ||
        mutations.records.length === 0
    ) {
        return '<p class="empty-note">No file mutation evidence recorded for this job.</p>';
    }
    const rows = mutations.records
        .map((r) => {
            const hash = r.sha256
                ? `<code title="sha256">${esc(r.sha256.slice(0, 16))}…</code>`
                : "";
            const prev = r.previous_sha256
                ? `<small>was ${esc(r.previous_sha256.slice(0, 16))}… (${r.previous_bytes ?? "?"} bytes)</small>`
                : "";
            return `<tr><td><code>${esc(r.path)}</code></td><td>${esc(r.action)}</td><td>${r.bytes}</td><td>${hash}</td><td>${prev}</td></tr>`;
        })
        .join("");
    return `<table class="mutation-table"><thead><tr><th>Path</th><th>Action</th><th>Bytes</th><th>Hash</th><th>Previous</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function jobSnapshotHTML(snapshot, mutations = null) {
    const events = Array.isArray(snapshot.events) ? snapshot.events : [];
    return `<h3>${esc(snapshot.test_result || snapshot.pipeline_status || "Status unavailable")}</h3><p class="job-id">JobId ${esc(snapshot.run_id)}</p><p>${hasVerifiedHash(snapshot) ? "Created and sandbox hashes match." : "Verified hash equality has not been reported."}</p>${snapshot.root_cause ? `<p>${esc(snapshot.root_cause.issue)}</p>` : ""}<h3>Execution history</h3>${events.length ? `<ol class="job-events">${events.map((event) => `<li><strong>${esc(event.processor)}</strong><span>${esc(event.execution_status)}${event.test_result ? ` · ${esc(event.test_result)}` : ""}</span><p>${esc(event.message || event.activity || "")}</p></li>`).join("")}</ol>` : "<p>No execution events available.</p>"}<h3>Workspace changes</h3>${renderMutations(mutations)}<details><summary>Advanced snapshot</summary><pre>${esc(JSON.stringify(snapshot, null, 2))}</pre></details>`;
}

export function createJobHistory({ apiFetch }) {
    const drawer = document.querySelector("#tasks");
    const current = drawer.querySelector(".drawer-body");
    current.id = "current-job-face";
    const shell = document.createElement("div");
    shell.className = "job-flip";
    current.before(shell);
    shell.append(current);
    const history = document.createElement("section");
    history.id = "history-job-face";
    history.className = "drawer-body job-history-face";
    history.inert = true;
    history.setAttribute("aria-hidden", "true");
    history.innerHTML =
        '<label>Saved jobs<select id="history-job-select"><option value="">Select a job</option></select></label><p id="history-load-state" role="status"></p><div id="history-job-detail"></div>';
    shell.append(history);
    const button = document.createElement("button");
    button.className = "job-flip-toggle";
    button.textContent = "Job History";
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-controls", "history-job-face current-job-face");
    drawer.querySelector("header").after(button);
    let flipped = false,
        selection = 0;
    button.addEventListener("click", async () => {
        flipped = !flipped;
        shell.classList.toggle("is-history", flipped);
        current.inert = flipped;
        history.inert = !flipped;
        current.setAttribute("aria-hidden", String(flipped));
        history.setAttribute("aria-hidden", String(!flipped));
        button.textContent = flipped ? "Current Job" : "Job History";
        button.setAttribute("aria-pressed", String(flipped));
        if (!flipped) return;
        const message = history.querySelector("#history-load-state");
        message.textContent = "Loading saved jobs…";
        try {
            const response = await apiFetch("/api/runs");
            if (!response.ok)
                throw new Error(`Job history unavailable (${response.status})`);
            const data = await response.json();
            const select = history.querySelector("select"),
                selected = select.value;
            select.innerHTML =
                '<option value="">Select a job</option>' +
                (data.runs || [])
                    .map(
                        (run) =>
                            `<option value="${esc(run.run_id)}">${esc(run.run_id)} · ${esc(run.test_result || run.pipeline_status || "Status unavailable")}</option>`,
                    )
                    .join("");
            select.value = selected;
            message.textContent = data.runs?.length
                ? "Saved runtime jobs. Select one to inspect its recorded state."
                : "No saved jobs available.";
        } catch (error) {
            message.textContent = error.message;
        }
    });
    history
        .querySelector("select")
        .addEventListener("change", async (event) => {
            const token = ++selection,
                id = event.target.value,
                detail = history.querySelector("#history-job-detail");
            detail.textContent = id ? "Loading job…" : "";
            if (!id) return;
            try {
                const [runResponse, mutationsResponse] = await Promise.all([
                    apiFetch(`/api/runs/${encodeURIComponent(id)}`),
                    apiFetch(
                        `/api/runs/${encodeURIComponent(id)}/artifacts/file-mutations`,
                    ),
                ]);
                if (!runResponse.ok)
                    throw new Error(
                        `Saved job unavailable (${runResponse.status})`,
                    );
                const data = await runResponse.json();
                const mutations = mutationsResponse.ok
                    ? await mutationsResponse.json()
                    : null;
                if (token === selection)
                    detail.innerHTML = jobSnapshotHTML(data, mutations);
            } catch (error) {
                if (token === selection) detail.textContent = error.message;
            }
        });
    return {
        refreshCurrentLabel(runId) {
            current.setAttribute(
                "aria-label",
                runId ? `Current Job ${runId}` : "Current Job",
            );
        },
    };
}
