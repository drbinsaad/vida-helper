// VIDA Helper Inspector, Chrome extension build.
// Keep this file in sync with userscripts/vida-helper.user.js behavior.

(function vidaHelperExtension() {
  "use strict";

  const APP = {
    name: "VIDA Helper",
    version: "0.1.0",
    apiHost: "vida.hmg.com:8081",
    maxEvents: 80,
    maxElements: 160,
  };

  const state = {
    open: false,
    events: [],
    lastSnapshot: null,
  };

  const piiPatterns = [
    /\b\d{10,}\b/g,
    /\b05\d{8}\b/g,
    /\b(?:MRN|PatientMRN|patientMRN|National\s*ID|ID)\s*[:#=]?\s*\d+\b/gi,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  ];

  function redact(value) {
    if (value == null) return value;
    let text = String(value);
    for (const pattern of piiPatterns) text = text.replace(pattern, "[redacted]");
    text = text.replace(/([?&][^=]+=)[^&]{4,}/g, "$1[redacted]");
    return text.slice(0, 600);
  }

  function redactUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      const path = parsed.pathname.replace(/\d{4,}/g, "[id]");
      return `${parsed.origin}${path}${parsed.search ? "?[query]" : ""}`;
    } catch (_) {
      return redact(url);
    }
  }

  function pushEvent(event) {
    state.events.unshift({
      time: new Date().toISOString(),
      ...event,
    });
    if (state.events.length > APP.maxEvents) state.events.length = APP.maxEvents;
    updatePanel();
  }

  function patchNetwork() {
    if (window.__vidaHelperNetworkPatched) return;
    window.__vidaHelperNetworkPatched = true;

    const originalFetch = window.fetch;
    if (typeof originalFetch === "function") {
      window.fetch = function patchedFetch(input, init) {
        const url = typeof input === "string" ? input : input && input.url;
        if (url && String(url).includes("vida.hmg.com")) {
          pushEvent({ type: "fetch", method: init && init.method || "GET", url: redactUrl(url) });
        }
        return originalFetch.apply(this, arguments);
      };
    }

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
      this.__vidaHelper = { method, url };
      return originalOpen.apply(this, arguments);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function patchedSend() {
      const meta = this.__vidaHelper;
      if (meta && String(meta.url).includes("vida.hmg.com")) {
        pushEvent({ type: "xhr", method: meta.method || "GET", url: redactUrl(meta.url) });
      }
      return originalSend.apply(this, arguments);
    };
  }

  function getAuthSummary() {
    const memberRaw = localStorage.getItem("memberinfo");
    let member = null;
    try {
      const parsed = memberRaw ? JSON.parse(memberRaw) : null;
      if (parsed) {
        member = {
          hasMemberInfo: true,
          doctorId: parsed.doctorId ? "[present]" : "[empty]",
          memberRoleName: redact(parsed.memberRoleName || ""),
          defaultClinicId: parsed.defaultClinicId ? "[present]" : "[empty]",
        };
      }
    } catch (_) {
      member = { hasMemberInfo: true, parseError: true };
    }

    return {
      hasAccessToken: Boolean(localStorage.getItem("access_token")),
      hasRefreshToken: Boolean(localStorage.getItem("refresh_token")),
      member,
    };
  }

  function visibleText(element) {
    const text = (element.innerText || element.textContent || element.value || element.placeholder || "").trim();
    return redact(text.replace(/\s+/g, " "));
  }

  function cssPath(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return "";
    if (element.id) return `#${CSS.escape(element.id)}`;

    const parts = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      let part = node.localName;
      const stableAttrs = ["formcontrolname", "name", "type", "role", "placeholder", "aria-label", "title"];
      for (const attr of stableAttrs) {
        const value = node.getAttribute(attr);
        if (value) {
          part += `[${attr}="${CSS.escape(value)}"]`;
          break;
        }
      }
      if (node.classList && node.classList.length && !part.includes("[")) {
        part += "." + Array.from(node.classList).slice(0, 2).map((item) => CSS.escape(item)).join(".");
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function collectElements() {
    const selector = [
      "button",
      "a",
      "input",
      "select",
      "textarea",
      "[role='button']",
      "[tabindex]",
      "ng-select",
    ].join(",");

    return Array.from(document.querySelectorAll(selector))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .slice(0, APP.maxElements)
      .map((element) => ({
        tag: element.localName,
        type: element.getAttribute("type") || "",
        role: element.getAttribute("role") || "",
        formControlName: element.getAttribute("formcontrolname") || "",
        text: visibleText(element),
        selector: cssPath(element),
      }));
  }

  function collectSnapshot() {
    const snapshot = {
      app: APP.name,
      version: APP.version,
      capturedAt: new Date().toISOString(),
      url: redactUrl(location.href),
      path: location.pathname,
      hash: location.hash,
      title: redact(document.title),
      auth: getAuthSummary(),
      recentNetwork: state.events.slice(0, 30),
      visibleControls: collectElements(),
    };
    state.lastSnapshot = snapshot;
    return snapshot;
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  }

  function downloadSnapshot() {
    const snapshot = state.lastSnapshot || collectSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vida-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function copySnapshot() {
    const snapshot = collectSnapshot();
    const text = JSON.stringify(snapshot, null, 2);
    copyText(text)
      .then((ok) => showStatus(ok ? "Snapshot copied" : "Copy unavailable; use Download"))
      .catch(() => showStatus("Copy blocked; use Download"));
  }

  function showStatus(message) {
    const status = document.querySelector("#vida-helper-status");
    if (status) status.textContent = message;
  }

  function createPanel() {
    if (document.querySelector("#vida-helper-root")) return;

    const style = document.createElement("style");
    style.textContent = `
      #vida-helper-root {
        position: fixed;
        right: 12px;
        bottom: 12px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #111827;
      }
      #vida-helper-toggle {
        min-width: 54px;
        height: 44px;
        border: 0;
        border-radius: 8px;
        background: #b91c1c;
        color: white;
        font-weight: 700;
        box-shadow: 0 10px 24px rgba(0,0,0,.22);
      }
      #vida-helper-panel {
        display: none;
        width: min(360px, calc(100vw - 24px));
        max-height: min(560px, calc(100vh - 78px));
        overflow: auto;
        margin-bottom: 8px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        box-shadow: 0 18px 48px rgba(0,0,0,.24);
      }
      #vida-helper-root[data-open="true"] #vida-helper-panel { display: block; }
      .vida-helper-head {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        background: #f9fafb;
        border-bottom: 1px solid #e5e7eb;
        font-size: 13px;
        font-weight: 700;
      }
      .vida-helper-body { padding: 10px 12px; font-size: 12px; }
      .vida-helper-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
      .vida-helper-actions button {
        min-height: 36px;
        border: 1px solid #d1d5db;
        border-radius: 7px;
        background: #fff;
        color: #111827;
        font-weight: 600;
      }
      .vida-helper-kv { display: grid; grid-template-columns: 92px 1fr; gap: 4px 8px; margin: 8px 0; }
      .vida-helper-muted { color: #6b7280; }
      .vida-helper-list { padding-left: 16px; margin: 8px 0; }
      .vida-helper-list li { margin: 3px 0; overflow-wrap: anywhere; }
      #vida-helper-status { min-height: 18px; color: #047857; font-weight: 600; }
    `;

    const root = document.createElement("div");
    root.id = "vida-helper-root";
    root.innerHTML = `
      <div id="vida-helper-panel" aria-live="polite">
        <div class="vida-helper-head">
          <span>VIDA Helper</span>
          <span class="vida-helper-muted">v${APP.version}</span>
        </div>
        <div class="vida-helper-body">
          <div class="vida-helper-kv">
            <span class="vida-helper-muted">Path</span><span id="vida-helper-path"></span>
            <span class="vida-helper-muted">Auth</span><span id="vida-helper-auth"></span>
            <span class="vida-helper-muted">Controls</span><span id="vida-helper-controls"></span>
          </div>
          <div class="vida-helper-actions">
            <button type="button" id="vida-helper-copy">Copy Snapshot</button>
            <button type="button" id="vida-helper-download">Download</button>
          </div>
          <div id="vida-helper-status"></div>
          <div class="vida-helper-muted">Recent VIDA API activity</div>
          <ul class="vida-helper-list" id="vida-helper-events"></ul>
        </div>
      </div>
      <button type="button" id="vida-helper-toggle" aria-label="Toggle VIDA Helper">VIDA</button>
    `;

    document.documentElement.appendChild(style);
    document.documentElement.appendChild(root);

    root.querySelector("#vida-helper-toggle").addEventListener("click", () => {
      state.open = !state.open;
      root.dataset.open = String(state.open);
      updatePanel();
    });
    root.querySelector("#vida-helper-copy").addEventListener("click", copySnapshot);
    root.querySelector("#vida-helper-download").addEventListener("click", downloadSnapshot);
    updatePanel();
  }

  function updatePanel() {
    const root = document.querySelector("#vida-helper-root");
    if (!root) return;
    const auth = getAuthSummary();
    const controls = document.querySelectorAll("button,a,input,select,textarea,[role='button'],ng-select").length;
    root.querySelector("#vida-helper-path").textContent = `${location.pathname}${location.hash || ""}`;
    root.querySelector("#vida-helper-auth").textContent = auth.hasAccessToken ? "token present" : "not logged in";
    root.querySelector("#vida-helper-controls").textContent = String(controls);
    const list = root.querySelector("#vida-helper-events");
    list.innerHTML = "";
    for (const event of state.events.slice(0, 8)) {
      const item = document.createElement("li");
      item.textContent = `${event.method || ""} ${event.url}`;
      list.appendChild(item);
    }
  }

  function bootWhenReady() {
    if (document.documentElement) createPanel();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", createPanel, { once: true });
    } else {
      createPanel();
    }
    setInterval(updatePanel, 1500);
  }

  patchNetwork();
  bootWhenReady();
})();
