// ==UserScript==
// @name         VIDA Helper Snapshot Simple
// @namespace    https://vida.hmg.com/
// @version      0.1.0
// @description  Simple VIDA snapshot button for Tampermonkey debugging.
// @match        *://vida.hmg.com/*
// @match        *://*.vida.hmg.com/*
// @include      *://vida.hmg.com/*
// @run-at       document-end
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  "use strict";

  function redact(value) {
    return String(value || "")
      .replace(/\b\d{6,}\b/g, "[number]")
      .replace(/\b05\d{8}\b/g, "[phone]")
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
      .slice(0, 300);
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function getControls() {
    return Array.from(document.querySelectorAll("button,a,input,select,textarea,[role='button'],ng-select"))
      .filter(isVisible)
      .slice(0, 150)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type") || "",
        name: el.getAttribute("name") || "",
        formControlName: el.getAttribute("formcontrolname") || "",
        placeholder: redact(el.getAttribute("placeholder") || ""),
        title: redact(el.getAttribute("title") || ""),
        text: redact((el.innerText || el.textContent || el.value || "").trim().replace(/\s+/g, " ")),
      }));
  }

  function makeSnapshot() {
    return {
      helper: "VIDA Helper Snapshot Simple",
      capturedAt: new Date().toISOString(),
      href: location.href.replace(/\d{6,}/g, "[number]"),
      title: redact(document.title),
      auth: {
        hasAccessToken: Boolean(localStorage.getItem("access_token")),
        hasRefreshToken: Boolean(localStorage.getItem("refresh_token")),
        hasMemberInfo: Boolean(localStorage.getItem("memberinfo")),
      },
      counts: {
        buttons: document.querySelectorAll("button").length,
        links: document.querySelectorAll("a").length,
        inputs: document.querySelectorAll("input").length,
        selects: document.querySelectorAll("select,ng-select").length,
      },
      controls: getControls(),
    };
  }

  function copySnapshot() {
    const text = JSON.stringify(makeSnapshot(), null, 2);
    try {
      if (typeof GM_setClipboard === "function") {
        GM_setClipboard(text, "text");
      } else {
        navigator.clipboard.writeText(text);
      }
      button.textContent = "COPIED";
      setTimeout(() => {
        button.textContent = "VIDA SNAP";
      }, 1500);
    } catch (error) {
      console.log("VIDA snapshot:", text);
      alert("Copy failed. Snapshot printed in Console.");
    }
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "VIDA SNAP";
  button.style.cssText = [
    "position:fixed",
    "left:240px",
    "bottom:24px",
    "z-index:2147483647",
    "height:48px",
    "padding:0 18px",
    "border:0",
    "border-radius:8px",
    "background:#d02127",
    "color:#fff",
    "font:700 14px Arial,sans-serif",
    "box-shadow:0 10px 28px rgba(0,0,0,.3)",
    "cursor:pointer",
  ].join(";");
  button.addEventListener("click", copySnapshot);

  function install() {
    if (!document.body) return;
    if (!document.getElementById("vida-simple-snapshot-button")) {
      button.id = "vida-simple-snapshot-button";
      document.body.appendChild(button);
    }
  }

  install();
  setInterval(install, 1000);
})();
