// ==UserScript==
// @name         iCloud Hide My Email Helper
// @namespace    https://account.apple.com/
// @version      1.7.1
// @description  Quickly fill label and note fields when creating iCloud Hide My Email addresses on Apple Account pages.
// @match        https://account.apple.com/*
// @match        https://appleid.apple.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  "use strict";

  const STORE_KEY = "icloud-hide-my-email-helper.settings";
  const SCRIPT_VERSION = "1.7.1";
  const DEFAULT_MAIL_LINK_PREFIX = "http://icloudapi.xyz/show/C0oAEFAZFh8DFE0tEBAJDAcBWggKFFcSAQoHXx0cARxUGRoWE04TAgQG/";
  const LEGACY_GMAIL_LINK_TEMPLATE = "https://mail.google.com/mail/u/0/#search/{encodedEmail}";
  const DEFAULT_MAIL_LINK_TEMPLATE = "http://127.0.0.1:8787/show/{encodedEmail}";
  const LOG_PREFIX = "[iCloud HME Helper]";
  const LEGACY_NOTE_TEMPLATE = "Created from Apple Account on {date}";
  const DEFAULTS = {
    labelPrefix: "alias",
    nextNumber: 1,
    noteTemplate: "\u7528\u9014\uff1a{category} - {purpose}\uff1b\u6807\u7b7e\uff1a{label}\uff1b\u65e5\u671f\uff1a{date}",
    useRandomPurpose: true,
    clickCreate: false,
    openPanel: true,
    batchTarget: 5,
    batchDelayMinSeconds: 20,
    batchDelayMaxSeconds: 60,
    limitBackoffMinSeconds: 300,
    limitBackoffMaxSeconds: 600,
    mailLinkPrefix: DEFAULT_MAIL_LINK_TEMPLATE,
  };

  const TEXT = {
    panelTitle: "iCloud \u5730\u5740\u52a9\u624b",
    openDialog: "\u6253\u5f00\u521b\u5efa\u5f39\u7a97",
    fillOnly: "\u586b\u5165\u5f53\u524d\u5f39\u7a97",
    fillAndCreate: "\u586b\u5165\u5e76\u521b\u5efa",
    rotateAddress: "\u6362\u4e00\u4e2a\u968f\u673a\u5730\u5740",
    copyAddress: "\u590d\u5236\u5f53\u524d\u5730\u5740",
    copyMailLink: "\u590d\u5236\u67e5\u770b\u94fe\u63a5",
    exportMailLinks: "\u5bfc\u51fa\u90ae\u7bb1",
    resetRandomTemplate: "\u6062\u590d\u968f\u673a\u6a21\u677f",
    diagnose: "\u68c0\u6d4b\u9875\u9762",
    startBatch: "\u5f00\u59cb\u6279\u91cf",
    stopBatch: "\u505c\u6b62\u6279\u91cf",
    statusReady: "\u51c6\u5907\u597d\u4e86\u3002\u5148\u6253\u5f00\u201c\u521b\u5efa\u65b0\u5730\u5740\u201d\u5f39\u7a97\uff0c\u6216\u70b9\u4e0a\u9762\u7684\u6309\u94ae\u3002",
    statusNoDialog: "\u6ca1\u6709\u627e\u5230\u521b\u5efa\u5730\u5740\u5f39\u7a97\u3002",
    statusNoFields: "\u627e\u4e0d\u5230\u6807\u7b7e\u6216\u5907\u6ce8\u8f93\u5165\u6846\uff0c\u9875\u9762\u7ed3\u6784\u53ef\u80fd\u53d8\u4e86\u3002",
    statusFilled: "\u5df2\u586b\u5165\uff1a{label}",
    statusCreateSubmitted: "\u5df2\u63d0\u4ea4\u521b\u5efa\u8bf7\u6c42\uff1a{label}",
    statusCreated: "\u5df2\u786e\u8ba4\u521b\u5efa\uff1a{label}",
    statusNoCreateButton: "\u6ca1\u6709\u627e\u5230\u201c\u521b\u5efa\u7535\u5b50\u90ae\u4ef6\u5730\u5740\u201d\u6309\u94ae\u3002",
    statusNoOpenButton: "\u6ca1\u6709\u627e\u5230\u9875\u9762\u4e0a\u7684\u201c\u521b\u5efa\u65b0\u5730\u5740\u201d\u6309\u94ae\u3002",
    statusNoRotate: "\u6ca1\u6709\u627e\u5230\u201c\u4f7f\u7528\u5176\u4ed6\u7535\u5b50\u90ae\u4ef6\u5730\u5740\u201d\u5165\u53e3\u3002",
    statusNoAddress: "\u6ca1\u6709\u8bc6\u522b\u5230\u5f53\u524d iCloud \u5730\u5740\u3002",
    statusCopied: "\u5df2\u590d\u5236\uff1a{address}",
    statusMailLinkCopied: "\u5df2\u590d\u5236\u67e5\u770b\u94fe\u63a5\uff1a{address}",
    statusExported: "\u5df2\u5bfc\u51fa {count} \u884c\u90ae\u7bb1\u5230 txt\u3002",
    statusNoExportAddresses: "\u5f53\u524d\u9875\u9762\u6ca1\u6709\u6536\u96c6\u5230 iCloud \u90ae\u7bb1\u5730\u5740\u3002",
    statusDiagnose: "\u7248\u672c {version}\uff1b\u521b\u5efa\u7a97\u53e3\uff1a{create}\uff1b\u5217\u8868\u7a97\u53e3\uff1a{list}\uff1b\u52a0\u53f7\u6309\u94ae\uff1a{add}\u3002",
    statusBatchStart: "\u6279\u91cf\u5f00\u59cb\uff1a\u76ee\u6807 {target} \u4e2a\u3002",
    statusBatchAlreadyRunning: "\u6279\u91cf\u6b63\u5728\u8fd0\u884c\u3002",
    statusBatchStopped: "\u6279\u91cf\u5df2\u505c\u6b62\uff1a{done}/{target}\u3002",
    statusBatchDone: "\u6279\u91cf\u5b8c\u6210\uff1a{done}/{target}\u3002",
    statusBatchCreated: "\u5df2\u521b\u5efa {done}/{target}\uff1a{label}",
    statusBatchWaiting: "\u7b49\u5f85 Apple \u9875\u9762\u5b8c\u6210\u521b\u5efa...",
    statusBatchDelay: "\u672c\u6b21\u7b49\u5f85 {seconds} \u79d2\u540e\u7ee7\u7eed...",
    statusBatchNeedTarget: "\u76ee\u6807\u6570\u91cf\u81f3\u5c11\u8981\u662f 1\u3002",
    statusCreateTimeout: "\u521b\u5efa\u7b49\u5f85\u8d85\u65f6\uff0c\u5df2\u505c\u6b62\u3002\u53ef\u80fd Apple \u663e\u793a\u4e86\u9519\u8bef\u6216\u9650\u5236\u63d0\u793a\u3002",
    statusAppleLimit: "Apple \u63d0\u793a\u5df2\u8fbe\u4e0a\u9650/\u8bf7\u7a0d\u540e\u518d\u8bd5\uff0c\u5c06\u7b49\u5f85 {seconds} \u79d2\u540e\u7ee7\u7eed\u3002",
    statusAppleLimitCloseFailed: "\u68c0\u6d4b\u5230 Apple \u4e0a\u9650\u5f39\u7a97\uff0c\u6ca1\u627e\u5230\u201c\u597d\u201d\u6309\u94ae\uff0c\u5c06\u7b49\u5f85 {seconds} \u79d2\u540e\u518d\u8bd5\u3002",
    statusNoReturnButton: "\u6ca1\u6709\u627e\u5230\u8fd4\u56de\u3001\u5b8c\u6210\u6216\u5173\u95ed\u6309\u94ae\uff0c\u6279\u91cf\u5df2\u505c\u6b62\u3002",
    statusListDialogDetected: "\u5df2\u56de\u5230\u5217\u8868\uff0c\u6b63\u5728\u6253\u5f00\u4e0b\u4e00\u4e2a\u521b\u5efa\u7a97\u53e3...",
    targetCount: "\u76ee\u6807\u6570\u91cf",
    delayMinSeconds: "\u6700\u5c0f\u95f4\u9694\u79d2",
    delayMaxSeconds: "\u6700\u5927\u95f4\u9694\u79d2",
    backoffMinSeconds: "\u4e0a\u9650\u6700\u5c0f\u7b49\u5f85\u79d2",
    backoffMaxSeconds: "\u4e0a\u9650\u6700\u5927\u7b49\u5f85\u79d2",
    mailLinkPrefix: "\u67e5\u770b\u94fe\u63a5\u6a21\u677f",
    randomPurposeNote: "\u968f\u673a\u7528\u9014\u5907\u6ce8",
    batchProgress: "\u6279\u91cf\u8fdb\u5ea6\uff1a{done}/{target}",
    hotkeyHint: "\u5feb\u6377\u952e\uff1aAlt+I \u586b\u5165\uff0cAlt+Shift+I \u586b\u5165\u5e76\u521b\u5efa\u3002",
  };

  const PURPOSE_GROUPS = [
    {
      category: "\u751f\u6d3b",
      purposes: ["\u5916\u5356\u8ba2\u5355", "\u7f51\u8d2d\u6536\u8d27", "\u751f\u6d3b\u7f34\u8d39", "\u5bb6\u5ead\u670d\u52a1", "\u65c5\u884c\u9884\u8ba2"],
    },
    {
      category: "\u5de5\u4f5c",
      purposes: ["\u9879\u76ee\u6c9f\u901a", "\u5ba2\u6237\u8054\u7cfb", "\u4f1a\u8bae\u5de5\u5177", "\u6587\u6863\u534f\u4f5c", "\u62db\u8058\u6295\u9012"],
    },
    {
      category: "\u5a31\u4e50",
      purposes: ["\u6e38\u620f\u8d26\u53f7", "\u89c6\u9891\u4f1a\u5458", "\u97f3\u4e50\u670d\u52a1", "\u6d3b\u52a8\u62a5\u540d", "\u793e\u533a\u8bba\u575b"],
    },
    {
      category: "\u5b66\u4e60",
      purposes: ["\u8bfe\u7a0b\u5e73\u53f0", "\u8d44\u6599\u4e0b\u8f7d", "\u8003\u8bd5\u62a5\u540d", "\u5b66\u672f\u901a\u8baf", "\u6d4b\u8bd5\u6ce8\u518c"],
    },
    {
      category: "\u8d22\u52a1",
      purposes: ["\u8d26\u5355\u63d0\u9192", "\u4f18\u60e0\u8ba2\u9605", "\u8bd5\u7528\u670d\u52a1", "\u6536\u636e\u5f52\u6863", "\u7968\u52a1\u9884\u8ba2"],
    },
  ];

  let settings = loadSettings();
  let lastStatus = "";
  const batchState = {
    running: false,
    done: 0,
    target: 0,
    loopActive: false,
  };

  function loadSettings() {
    try {
      const loaded = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") };
      if (loaded.noteTemplate === LEGACY_NOTE_TEMPLATE) {
        loaded.noteTemplate = DEFAULTS.noteTemplate;
        loaded.useRandomPurpose = true;
      }
      if (typeof loaded.batchDelaySeconds !== "undefined") {
        const legacyDelay = Math.max(0, Number(loaded.batchDelaySeconds) || 0);
        loaded.batchDelayMinSeconds = legacyDelay;
        loaded.batchDelayMaxSeconds = legacyDelay;
        delete loaded.batchDelaySeconds;
      }
      if (
        !loaded.mailLinkPrefix ||
        String(loaded.mailLinkPrefix).startsWith(DEFAULT_MAIL_LINK_PREFIX) ||
        String(loaded.mailLinkPrefix) === LEGACY_GMAIL_LINK_TEMPLATE
      ) {
        loaded.mailLinkPrefix = DEFAULT_MAIL_LINK_TEMPLATE;
      }
      return loaded;
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings(next = settings) {
    settings = { ...settings, ...next };
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  }

  function today() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function randomPurpose() {
    const group = pickRandom(PURPOSE_GROUPS);
    return {
      category: group.category,
      purpose: pickRandom(group.purposes),
    };
  }

  function normalizeDelayRange(minSeconds = settings.batchDelayMinSeconds, maxSeconds = settings.batchDelayMaxSeconds) {
    const min = Math.max(0, Number(minSeconds) || 0);
    const max = Math.max(0, Number(maxSeconds) || 0);
    return {
      min: Math.min(min, max),
      max: Math.max(min, max),
    };
  }

  function randomDelaySeconds() {
    const { min, max } = normalizeDelayRange();
    if (min === max) return min;
    return Math.round((min + Math.random() * (max - min)) * 10) / 10;
  }

  function randomRangeSeconds(minSeconds, maxSeconds) {
    const min = Math.max(0, Number(minSeconds) || 0);
    const max = Math.max(0, Number(maxSeconds) || 0);
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    if (low === high) return low;
    return Math.round((low + Math.random() * (high - low)) * 10) / 10;
  }

  function normalizeBackoffRange(minSeconds = settings.limitBackoffMinSeconds, maxSeconds = settings.limitBackoffMaxSeconds) {
    const min = Math.max(0, Number(minSeconds) || 0);
    const max = Math.max(0, Number(maxSeconds) || 0);
    return {
      min: Math.min(min, max),
      max: Math.max(min, max),
    };
  }

  function randomLimitBackoffSeconds() {
    const { min, max } = normalizeBackoffRange();
    return randomRangeSeconds(min, max);
  }

  function currentLabel() {
    return `${settings.labelPrefix}-${String(settings.nextNumber).padStart(3, "0")}`;
  }

  function advanceNextNumber() {
    saveSettings({ nextNumber: Number(settings.nextNumber) + 1 });
    updatePanelValues();
  }

  function renderTemplate(template, label, address = "", purposeInfo = randomPurpose()) {
    return template
      .replaceAll("{label}", label)
      .replaceAll("{address}", address)
      .replaceAll("{date}", today())
      .replaceAll("{n}", String(settings.nextNumber))
      .replaceAll("{category}", purposeInfo.category)
      .replaceAll("{purpose}", purposeInfo.purpose);
  }

  function visible(element) {
    if (!element || !(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function* walkDeep(root = document) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = root instanceof Element ? root : walker.nextNode();
    while (node) {
      yield node;
      if (node.shadowRoot) yield* walkDeep(node.shadowRoot);
      node = walker.nextNode();
    }
  }

  function allDeep(selector) {
    const results = [];
    for (const root of [document, ...Array.from(document.querySelectorAll("*")).map((el) => el.shadowRoot).filter(Boolean)]) {
      try {
        results.push(...root.querySelectorAll(selector));
      } catch {
        // Ignore selector failures inside third-party shadow roots.
      }
    }
    return Array.from(new Set(results));
  }

  function textOf(element) {
    return (element?.innerText || element?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function findByText(selector, patterns, options = {}) {
    const nodes = allDeep(selector).filter(visible);
    const matcher = (text) => patterns.some((pattern) => pattern.test(text));
    if (options.preferDialog) {
      const dialog = findCreateDialog();
      const scoped = nodes.filter((node) => dialog && dialog.contains(node));
      const match = scoped.find((node) => matcher(textOf(node) || node.getAttribute("aria-label") || ""));
      if (match) return match;
    }
    return nodes.find((node) => matcher(textOf(node) || node.getAttribute("aria-label") || ""));
  }

  function findCreateDialog() {
    const semanticDialogs = allDeep('[role="dialog"], dialog, [aria-modal="true"]').filter(visible);
    const dialog = semanticDialogs.find(isCreateDialog);
    return dialog || null;
  }

  function isCreateDialog(node) {
    if (!node) return false;
    const text = textOf(node);
    const hasListTitle = /\u9690\u85cf\u90ae\u4ef6\u5730\u5740/i.test(text) || /hide my email/i.test(text);
    const hasListCount = /\u4e2a\u4f7f\u7528\u4e2d/i.test(text) || /in use/i.test(text);
    if (hasListTitle && hasListCount) return false;

    const hasCreateTitle = /\u521b\u5efa\u65b0\u5730\u5740/i.test(text) || /create new address/i.test(text);
    const hasCreateSubmit = allDeep("button,[role='button']")
      .filter((button) => visible(button) && node.contains(button))
      .some((button) => {
        const label = textOf(button) || button.getAttribute("aria-label") || button.title || "";
        return /\u521b\u5efa\u7535\u5b50\u90ae\u4ef6\u5730\u5740/i.test(label) || /\u521b\u5efa\u90ae\u7bb1\u5730\u5740/i.test(label) || /create email address/i.test(label);
      });
    const editableFields = allDeep("input, textarea")
      .filter((field) => !field.closest("#icloud-hme-helper"))
      .filter((field) => visible(field) && !field.disabled && !field.readOnly && node.contains(field));
    return hasCreateTitle && hasCreateSubmit && editableFields.length >= 1;
  }

  function findListDialog() {
    const semanticDialogs = allDeep('[role="dialog"], dialog, [aria-modal="true"]').filter(visible);
    return semanticDialogs.find((node) => {
      if (isCreateDialog(node)) return false;
      const text = textOf(node);
      return (
        /\u9690\u85cf\u90ae\u4ef6\u5730\u5740/i.test(text) ||
        /hide my email/i.test(text)
      ) && (
        /\u4e2a\u4f7f\u7528\u4e2d/i.test(text) ||
        /\u4f7f\u7528\u4e2d\u7684\u7535\u5b50\u90ae\u4ef6\u5730\u5740/i.test(text) ||
        /in use/i.test(text)
      );
    }) || null;
  }

  function findAppleLimitMessage() {
    const patterns = [
      /\u7535\u5b50\u90ae\u4ef6\u5df2\u8fbe\u4e0a\u9650/i,
      /\u5730\u5740\u6570\u91cf\u5df2\u8fbe\u4e0a\u9650/i,
      /\u8bf7\u7a0d\u540e\u518d\u8bd5/i,
      /email.*limit/i,
      /address.*limit/i,
      /try again later/i,
    ];
    return allDeep('[role="dialog"], dialog, [aria-modal="true"], body')
      .filter(visible)
      .some((node) => patterns.some((pattern) => pattern.test(textOf(node))));
  }

  function findAppleLimitDialog() {
    const patterns = [
      /\u7535\u5b50\u90ae\u4ef6\u5df2\u8fbe\u4e0a\u9650/i,
      /\u5730\u5740\u6570\u91cf\u5df2\u8fbe\u4e0a\u9650/i,
      /\u8bf7\u7a0d\u540e\u518d\u8bd5/i,
      /email.*limit/i,
      /address.*limit/i,
      /try again later/i,
    ];
    return allDeep('[role="dialog"], dialog, [aria-modal="true"]')
      .filter(visible)
      .find((node) => patterns.some((pattern) => pattern.test(textOf(node)))) || null;
  }

  function closeAppleLimitDialog() {
    const dialog = findAppleLimitDialog();
    if (!dialog) return true;
    const button = allDeep("button,a,[role='button']")
      .filter((node) => visible(node) && dialog.contains(node))
      .find((node) => {
        const label = textOf(node) || node.getAttribute("aria-label") || node.title || "";
        return /^(\u597d|OK|Okay)$/i.test(label.trim());
      });
    return clickElement(button);
  }

  function findFields() {
    const dialog = findCreateDialog();
    if (!dialog) return { dialog: null, label: null, note: null };

    const inputs = allDeep("input, textarea")
      .filter((node) => !node.closest("#icloud-hme-helper"))
      .filter((node) => visible(node) && !node.disabled && !node.readOnly && dialog.contains(node));

    const label = inputs.find((node) => {
      const hint = [
        node.placeholder,
        node.getAttribute("aria-label"),
        node.id ? dialog.querySelector(`label[for="${CSS.escape(node.id)}"]`)?.textContent : "",
        textOf(node.closest("label")),
        textOf(node.parentElement),
      ].join(" ");
      return /\u6807\u7b7e|label|shopping/i.test(hint);
    }) || inputs[0] || null;

    const note = inputs.find((node) => {
      if (node === label) return false;
      const hint = [
        node.placeholder,
        node.getAttribute("aria-label"),
        node.id ? dialog.querySelector(`label[for="${CSS.escape(node.id)}"]`)?.textContent : "",
        textOf(node.closest("label")),
        textOf(node.parentElement),
      ].join(" ");
      return /\u5907\u6ce8|note|optional/i.test(hint);
    }) || inputs.find((node) => node !== label) || null;

    return { dialog, label, note };
  }

  function setNativeValue(element, value) {
    if (!element) return;
    const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function currentAddress(dialog = findCreateDialog()) {
    if (!dialog) return "";
    const match = textOf(dialog).match(/[A-Z0-9._%+-]+@icloud\.com/i);
    return match ? match[0] : "";
  }

  function findReturnButton() {
    const dialog = findCreateDialog();
    const selector = "button,a,[role='button']";
    const scopedPatterns = [
      /\u8fd4\u56de/i,
      /\u5b8c\u6210/i,
      /\u5173\u95ed/i,
      /\u53d6\u6d88/i,
      /back/i,
      /done/i,
      /close/i,
      /cancel/i,
    ];
    const globalPatterns = [
      /\u8fd4\u56de/i,
      /\u5b8c\u6210/i,
      /back/i,
      /done/i,
    ];

    if (dialog) {
      const buttons = allDeep(selector).filter((node) => visible(node) && dialog.contains(node));
      const match = buttons.find((node) => scopedPatterns.some((pattern) => pattern.test(textOf(node) || node.getAttribute("aria-label") || node.title || "")));
      if (match) return match;
    }

    return findByText(selector, globalPatterns);
  }

  function findDoneButton() {
    const dialog = findCreateDialog();
    if (!dialog) return null;
    const patterns = [/\u5b8c\u6210/i, /^done$/i];
    return allDeep("button,a,[role='button']")
      .filter((node) => visible(node) && dialog.contains(node))
      .find((node) => patterns.some((pattern) => pattern.test(textOf(node) || node.getAttribute("aria-label") || node.title || "")));
  }

  function findListAddButton() {
    const dialog = findListDialog();
    if (!dialog) return null;
    const buttons = allDeep("button,a,[role='button']")
      .filter((node) => visible(node) && dialog.contains(node))
      .filter((node) => {
        const label = [textOf(node), node.getAttribute("aria-label"), node.title].filter(Boolean).join(" ");
        return !/\u641c\u7d22|search/i.test(label);
      });

    const labelled = buttons.find((node) => {
      const label = [textOf(node), node.getAttribute("aria-label"), node.title].filter(Boolean).join(" ");
      return /(^|\s)\+(\s|$)|\u6dfb\u52a0|\u521b\u5efa|add|create/i.test(label);
    });
    if (labelled) return labelled;

    const heading = Array.from(dialog.querySelectorAll("h1,h2,h3,h4,[role='heading'],strong,b,div,span"))
      .filter(visible)
      .find((node) => {
        const text = textOf(node);
        return /\u4f7f\u7528\u4e2d\u7684\u7535\u5b50\u90ae\u4ef6\u5730\u5740/i.test(text) || /email addresses in use/i.test(text);
      });
    if (heading) {
      const headingRect = heading.getBoundingClientRect();
      const sameRow = buttons
        .map((node) => ({ node, rect: node.getBoundingClientRect() }))
        .filter(({ rect }) => Math.abs((rect.top + rect.bottom) / 2 - (headingRect.top + headingRect.bottom) / 2) < 44)
        .filter(({ rect }) => rect.left > headingRect.right)
        .sort((a, b) => a.rect.left - b.rect.left);
      if (sameRow[0]) return sameRow[0].node;
    }

    const dialogRect = dialog.getBoundingClientRect();
    const candidates = buttons
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width <= 80 && rect.height <= 80)
      .filter(({ rect }) => rect.left > dialogRect.left + dialogRect.width * 0.45 && rect.top < dialogRect.top + dialogRect.height * 0.65)
      .sort((a, b) => (b.rect.top + b.rect.left) - (a.rect.top + a.rect.left));
    return candidates[0]?.node || null;
  }

  function clickElement(element) {
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }

  function openCreateDialog(autoFill = true) {
    const button = findListAddButton() || findByText("button,a,[role='button']", [
      /^\u521b\u5efa\u65b0\u5730\u5740$/i,
      /\u521b\u5efa\u65b0\u5730\u5740/i,
      /create new address/i,
      /create new email address/i,
    ]);
    if (!clickElement(button)) return setStatus(TEXT.statusNoOpenButton);
    setStatus("\u5df2\u5c1d\u8bd5\u6253\u5f00\u521b\u5efa\u5f39\u7a97\u3002");
    if (autoFill) setTimeout(() => fillCurrent(false), 700);
    return true;
  }

  function rotateAddress() {
    const link = findByText("button,a,[role='button']", [
      /\u4f7f\u7528\u5176\u4ed6\u7535\u5b50\u90ae\u4ef6\u5730\u5740/i,
      /use a different email address/i,
      /use another email address/i,
    ], { preferDialog: true });
    if (!clickElement(link)) return setStatus(TEXT.statusNoRotate);
    setStatus("\u5df2\u5c1d\u8bd5\u6362\u4e00\u4e2a\u968f\u673a\u5730\u5740\u3002");
  }

  async function copyAddress() {
    const address = currentAddress();
    if (!address) return setStatus(TEXT.statusNoAddress);
    try {
      await navigator.clipboard.writeText(address);
      setStatus(TEXT.statusCopied.replace("{address}", address));
    } catch {
      const area = document.createElement("textarea");
      area.value = address;
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      setStatus(TEXT.statusCopied.replace("{address}", address));
    }
  }

  function mailLinkFor(address) {
    const template = String(settings.mailLinkPrefix || DEFAULT_MAIL_LINK_TEMPLATE).trim();
    const encodedEmail = encodeURIComponent(address);
    if (template.includes("{email}") || template.includes("{encodedEmail}")) {
      return template
        .replaceAll("{email}", address)
        .replaceAll("{encodedEmail}", encodedEmail);
    }
    const normalizedPrefix = template.endsWith("/") ? template : `${template}/`;
    return `${normalizedPrefix}${encodedEmail}`;
  }

  async function copyMailLink() {
    const address = currentAddress() || collectVisibleIcloudAddresses()[0];
    if (!address) return setStatus(TEXT.statusNoAddress);
    const line = `${address}----${mailLinkFor(address)}`;
    try {
      await navigator.clipboard.writeText(line);
    } catch {
      const area = document.createElement("textarea");
      area.value = line;
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setStatus(TEXT.statusMailLinkCopied.replace("{address}", address));
  }

  function collectVisibleIcloudAddresses() {
    const text = textOf(findListDialog() || document.body);
    const matches = text.match(/[A-Z0-9._%+-]+@icloud\.com/gi) || [];
    const seen = new Set();
    return matches.filter((address) => {
      const key = address.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function downloadText(filename, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportMailLinks() {
    const addresses = collectVisibleIcloudAddresses();
    if (!addresses.length) return setStatus(TEXT.statusNoExportAddresses);
    const content = addresses.join("\n");
    downloadText(`icloud-mail-addresses-${today()}.txt`, `${content}\n`);
    setStatus(TEXT.statusExported.replace("{count}", String(addresses.length)));
  }

  function diagnosePage() {
    setStatus(
      TEXT.statusDiagnose
        .replace("{version}", SCRIPT_VERSION)
        .replace("{create}", findCreateDialog() ? "yes" : "no")
        .replace("{list}", findListDialog() ? "yes" : "no")
        .replace("{add}", findListAddButton() ? "yes" : "no")
    );
  }

  function findCreateButton() {
    const dialog = findCreateDialog();
    if (!dialog) return null;
    const buttons = allDeep("button,[role='button']")
      .filter((node) => visible(node) && dialog.contains(node));
    const patterns = [
      /\u521b\u5efa\u7535\u5b50\u90ae\u4ef6\u5730\u5740/i,
      /\u521b\u5efa\u90ae\u7bb1\u5730\u5740/i,
      /create email address/i,
      /^create$/i,
    ];
    return buttons.find((node) => patterns.some((pattern) => pattern.test(textOf(node) || node.getAttribute("aria-label") || "")));
  }

  function fillCurrent(shouldCreate = settings.clickCreate) {
    const { dialog, label, note } = findFields();
    if (!dialog) {
      setStatus(TEXT.statusNoDialog);
      return null;
    }
    if (!label) {
      setStatus(TEXT.statusNoFields);
      return null;
    }

    const labelValue = currentLabel();
    const addressValue = currentAddress(dialog);
    const purposeInfo = settings.useRandomPurpose ? randomPurpose() : { category: "", purpose: "" };
    setNativeValue(label, labelValue);
    if (note) setNativeValue(note, renderTemplate(settings.noteTemplate, labelValue, addressValue, purposeInfo));

    if (shouldCreate) {
      const button = findCreateButton();
      if (!button) {
        setStatus(TEXT.statusNoCreateButton);
        return null;
      }
      clickElement(button);
      setStatus(TEXT.statusCreateSubmitted.replace("{label}", labelValue));
      return { label: labelValue, address: addressValue, purposeInfo, dialog };
    }

    setStatus(TEXT.statusFilled.replace("{label}", labelValue));
    return { label: labelValue, address: addressValue, purposeInfo, dialog };
  }

  async function waitForCreateToSettle(previousDialog, previousAddress) {
    const started = Date.now();
    while (Date.now() - started < 15000) {
      await sleep(500);
      const nextDialog = findCreateDialog();
      const nextAddress = currentAddress(nextDialog);
      const createButton = findCreateButton();
      const elapsed = Date.now() - started;
      if (
        !nextDialog ||
        nextDialog !== previousDialog ||
        (previousAddress && nextAddress && nextAddress !== previousAddress) ||
        findDoneButton() ||
        (elapsed > 5000 && !createButton)
      ) {
        return true;
      }
    }
    return false;
  }

  async function fillAndCreateCurrent() {
    const dialog = findCreateDialog();
    const previousAddress = currentAddress(dialog);
    const result = fillCurrent(true);
    if (!result) return null;

    setStatus(TEXT.statusBatchWaiting);
    const settled = await waitForCreateToSettle(result.dialog || dialog, previousAddress);
    if (findAppleLimitMessage()) {
      setStatus(TEXT.statusAppleLimit.replace("{seconds}", String(randomLimitBackoffSeconds())));
      return null;
    }
    if (!settled) {
      setStatus(TEXT.statusCreateTimeout);
      return null;
    }

    advanceNextNumber();
    setStatus(TEXT.statusCreated.replace("{label}", result.label));
    return result;
  }

  async function closeCreateFlow() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await sleep(500);
      if (findAppleLimitMessage()) return "limit";
      const button = findReturnButton();
      if (clickElement(button)) return "closed";
    }
    return findAppleLimitMessage() ? "limit" : "missing";
  }

  async function waitForDialog(open = true, timeout = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const dialog = findCreateDialog();
      if (open ? dialog : !dialog) return dialog || true;
      await sleep(300);
    }
    return null;
  }

  async function waitForListDialog(timeout = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const dialog = findListDialog();
      if (dialog) return dialog;
      await sleep(300);
    }
    return null;
  }

  async function openCreateFromList() {
    const listDialog = findListDialog() || await waitForListDialog(3000);
    if (!listDialog) return false;
    setStatus(TEXT.statusListDialogDetected);
    const addButton = findListAddButton();
    if (!clickElement(addButton)) return false;
    return Boolean(await waitForDialog(true, 12000));
  }

  function setBatchRunning(running) {
    batchState.running = running;
    const start = document.querySelector("#icloud-hme-helper-start-batch");
    const stop = document.querySelector("#icloud-hme-helper-stop-batch");
    if (start) start.disabled = running;
    if (stop) stop.disabled = !running;
    updatePanelValues();
  }

  function stopBatch(message = TEXT.statusBatchStopped) {
    if (!batchState.running && !batchState.loopActive) return;
    setBatchRunning(false);
    batchState.loopActive = false;
    setStatus(
      message
        .replace("{done}", String(batchState.done))
        .replace("{target}", String(batchState.target))
    );
  }

  async function recoverFromAppleLimit() {
    const backoffSeconds = randomLimitBackoffSeconds();
    if (!closeAppleLimitDialog()) {
      setStatus(TEXT.statusAppleLimitCloseFailed.replace("{seconds}", String(backoffSeconds)));
      await sleep(backoffSeconds * 1000);
      return batchState.running;
    }
    setStatus(TEXT.statusAppleLimit.replace("{seconds}", String(backoffSeconds)));
    await sleep(backoffSeconds * 1000);
    return batchState.running;
  }

  async function runBatchLoop() {
    if (batchState.loopActive) return;
    batchState.loopActive = true;

    while (batchState.running && batchState.done < batchState.target) {
      let dialog = findCreateDialog();
      const listDialog = findListDialog();
      if (listDialog) {
        dialog = null;
      }

      if (!dialog) {
        const openedFromList = await openCreateFromList();
        if (!openedFromList) {
          if (!openCreateDialog(false)) {
            stopBatch(TEXT.statusNoOpenButton);
            break;
          }
        }
        dialog = await waitForDialog(true);
      }

      if (!batchState.running) break;
      if (!dialog) {
        stopBatch(TEXT.statusNoDialog);
        break;
      }

      const previousAddress = currentAddress(dialog);
      const result = fillCurrent(true);
      if (!result) {
        stopBatch(lastStatus || TEXT.statusNoCreateButton);
        break;
      }

      setStatus(TEXT.statusBatchWaiting);
      const settled = await waitForCreateToSettle(dialog, previousAddress);
      if (!batchState.running) break;
      if (findAppleLimitMessage()) {
        const recovered = await recoverFromAppleLimit();
        if (!recovered) break;
        await waitForListDialog(9000);
        continue;
      }
      if (!settled) {
        stopBatch(TEXT.statusCreateTimeout);
        break;
      }

      const closed = await closeCreateFlow();
      if (!batchState.running) break;
      if (closed === "limit") {
        const recovered = await recoverFromAppleLimit();
        if (!recovered) break;
        await waitForListDialog(9000);
        continue;
      }
      if (closed !== "closed") {
        stopBatch(TEXT.statusNoReturnButton);
        break;
      }

      await waitForListDialog(9000);
      advanceNextNumber();
      batchState.done += 1;
      setStatus(
        TEXT.statusBatchCreated
          .replace("{done}", String(batchState.done))
          .replace("{target}", String(batchState.target))
          .replace("{label}", result.label)
      );
      updatePanelValues();

      if (batchState.done >= batchState.target) {
        setBatchRunning(false);
        batchState.loopActive = false;
        setStatus(TEXT.statusBatchDone.replace("{done}", String(batchState.done)).replace("{target}", String(batchState.target)));
        return;
      }

      const delaySeconds = randomDelaySeconds();
      setStatus(TEXT.statusBatchDelay.replace("{seconds}", String(delaySeconds)));
      await sleep(delaySeconds * 1000);
    }

    batchState.loopActive = false;
  }

  function startBatch() {
    if (batchState.running) return setStatus(TEXT.statusBatchAlreadyRunning);
    const target = Math.floor(Number(settings.batchTarget) || 0);
    if (target < 1) return setStatus(TEXT.statusBatchNeedTarget);

    const delayRange = normalizeDelayRange();
    const backoffRange = normalizeBackoffRange();
    saveSettings({
      batchTarget: target,
      batchDelayMinSeconds: delayRange.min,
      batchDelayMaxSeconds: delayRange.max,
      limitBackoffMinSeconds: backoffRange.min,
      limitBackoffMaxSeconds: backoffRange.max,
    });
    batchState.done = 0;
    batchState.target = target;
    setBatchRunning(true);
    setStatus(TEXT.statusBatchStart.replace("{target}", String(target)));
    if (findAppleLimitMessage()) {
      batchState.loopActive = false;
      recoverFromAppleLimit().then((recovered) => {
        if (recovered) runBatchLoop();
      });
      return;
    }
    runBatchLoop();
  }

  function setStatus(message) {
    lastStatus = message;
    const status = document.querySelector("#icloud-hme-helper-status");
    if (status) status.textContent = message;
  }

  function updatePanelValues() {
    const prefix = document.querySelector("#icloud-hme-helper-prefix");
    const number = document.querySelector("#icloud-hme-helper-number");
    const note = document.querySelector("#icloud-hme-helper-note");
    const clickCreate = document.querySelector("#icloud-hme-helper-click-create");
    const randomPurpose = document.querySelector("#icloud-hme-helper-random-purpose");
    const target = document.querySelector("#icloud-hme-helper-target");
    const delayMin = document.querySelector("#icloud-hme-helper-delay-min");
    const delayMax = document.querySelector("#icloud-hme-helper-delay-max");
    const backoffMin = document.querySelector("#icloud-hme-helper-backoff-min");
    const backoffMax = document.querySelector("#icloud-hme-helper-backoff-max");
    const mailLinkPrefix = document.querySelector("#icloud-hme-helper-mail-link-prefix");
    const preview = document.querySelector("#icloud-hme-helper-preview");
    const progress = document.querySelector("#icloud-hme-helper-progress");
    if (prefix) prefix.value = settings.labelPrefix;
    if (number) number.value = settings.nextNumber;
    if (note) note.value = settings.noteTemplate;
    if (clickCreate) clickCreate.checked = settings.clickCreate;
    if (randomPurpose) randomPurpose.checked = settings.useRandomPurpose;
    if (target) target.value = settings.batchTarget;
    if (delayMin) delayMin.value = settings.batchDelayMinSeconds;
    if (delayMax) delayMax.value = settings.batchDelayMaxSeconds;
    if (backoffMin) backoffMin.value = settings.limitBackoffMinSeconds;
    if (backoffMax) backoffMax.value = settings.limitBackoffMaxSeconds;
    if (mailLinkPrefix) mailLinkPrefix.value = settings.mailLinkPrefix;
    if (preview) preview.textContent = currentLabel();
    if (progress) {
      progress.textContent = TEXT.batchProgress
        .replace("{done}", String(batchState.done))
        .replace("{target}", String(batchState.target || settings.batchTarget));
    }
  }

  function makeButton(label, onClick, variant = "secondary") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.variant = variant;
    button.addEventListener("click", onClick);
    return button;
  }

  function injectStyles() {
    if (document.querySelector("#icloud-hme-helper-style")) return;
    const css = `
      #icloud-hme-helper {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        width: min(360px, calc(100vw - 32px));
        color: #141414;
        font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #icloud-hme-helper * {
        box-sizing: border-box;
      }
      #icloud-hme-helper-panel {
        display: grid;
        gap: 10px;
        padding: 14px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.18);
        backdrop-filter: blur(16px);
      }
      #icloud-hme-helper[data-collapsed="true"] #icloud-hme-helper-panel {
        display: none;
      }
      #icloud-hme-helper-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-weight: 700;
      }
      #icloud-hme-helper-toggle {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        border: 1px solid rgba(0, 0, 0, 0.14);
        background: #fff;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.14);
        color: #0a66d8;
        font-weight: 800;
        cursor: pointer;
      }
      #icloud-hme-helper[data-collapsed="false"] #icloud-hme-helper-toggle {
        display: none;
      }
      #icloud-hme-helper-close {
        border: 0;
        background: transparent;
        color: #333;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
      }
      #icloud-hme-helper label {
        display: grid;
        gap: 4px;
        font-size: 12px;
        color: #4b4b4b;
      }
      #icloud-hme-helper input[type="text"],
      #icloud-hme-helper input[type="number"],
      #icloud-hme-helper textarea {
        width: 100%;
        border: 1px solid rgba(0, 0, 0, 0.18);
        border-radius: 8px;
        padding: 8px 9px;
        color: #111;
        background: #fff;
        font: inherit;
      }
      #icloud-hme-helper textarea {
        min-height: 68px;
        resize: vertical;
      }
      #icloud-hme-helper-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .icloud-hme-helper-batch-row {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
      }
      #icloud-hme-helper-batch-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      #icloud-hme-helper button[data-variant] {
        min-height: 34px;
        border-radius: 8px;
        border: 1px solid rgba(0, 0, 0, 0.16);
        padding: 7px 9px;
        cursor: pointer;
        font: inherit;
        font-weight: 650;
      }
      #icloud-hme-helper button[data-variant="primary"] {
        border-color: #006edb;
        background: #0071e3;
        color: #fff;
      }
      #icloud-hme-helper button[data-variant="secondary"] {
        background: #fff;
        color: #0a66d8;
      }
      #icloud-hme-helper button[data-variant="quiet"] {
        background: #f6f6f6;
        color: #222;
      }
      #icloud-hme-helper button[data-variant="danger"] {
        border-color: #d12c2c;
        background: #fff5f5;
        color: #b42318;
      }
      #icloud-hme-helper button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }
      #icloud-hme-helper-row {
        display: grid;
        grid-template-columns: 1fr 92px;
        gap: 8px;
      }
      .icloud-hme-helper-check {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #222;
      }
      .icloud-hme-helper-check input {
        width: 16px;
        height: 16px;
      }
      #icloud-hme-helper-preview {
        display: inline-flex;
        align-items: center;
        width: fit-content;
        min-height: 24px;
        border-radius: 999px;
        padding: 2px 9px;
        background: #eef5ff;
        color: #0757b8;
        font-weight: 700;
      }
      #icloud-hme-helper-progress {
        min-height: 28px;
        border-radius: 8px;
        padding: 6px 8px;
        background: #f2f7f2;
        color: #17633a;
        font-weight: 650;
      }
      #icloud-hme-helper-status {
        min-height: 36px;
        border-radius: 8px;
        padding: 8px 9px;
        background: #f7f7f7;
        color: #333;
      }
      #icloud-hme-helper-hint {
        color: #646464;
        font-size: 12px;
      }
      @media (max-width: 560px) {
        #icloud-hme-helper {
          right: 10px;
          bottom: 10px;
          width: calc(100vw - 20px);
        }
        #icloud-hme-helper-actions {
          grid-template-columns: 1fr;
        }
        #icloud-hme-helper-batch-actions,
        .icloud-hme-helper-batch-row {
          grid-template-columns: 1fr;
        }
      }
    `;

    if (typeof GM_addStyle === "function") {
      const node = GM_addStyle(css);
      if (node) node.id = "icloud-hme-helper-style";
      return;
    }

    const style = document.createElement("style");
    style.id = "icloud-hme-helper-style";
    style.textContent = css;
    document.documentElement.append(style);
  }

  function injectPanel() {
    if (document.querySelector("#icloud-hme-helper")) return;
    injectStyles();

    const root = document.createElement("section");
    root.id = "icloud-hme-helper";
    root.dataset.collapsed = String(!settings.openPanel);

    const toggle = document.createElement("button");
    toggle.id = "icloud-hme-helper-toggle";
    toggle.type = "button";
    toggle.textContent = "@";
    toggle.title = TEXT.panelTitle;
    toggle.addEventListener("click", () => {
      saveSettings({ openPanel: true });
      root.dataset.collapsed = "false";
    });

    const panel = document.createElement("div");
    panel.id = "icloud-hme-helper-panel";

    const header = document.createElement("div");
    header.id = "icloud-hme-helper-header";
    const title = document.createElement("div");
    title.textContent = `${TEXT.panelTitle} ${SCRIPT_VERSION}`;
    const close = document.createElement("button");
    close.id = "icloud-hme-helper-close";
    close.type = "button";
    close.textContent = "x";
    close.title = "\u6536\u8d77";
    close.addEventListener("click", () => {
      saveSettings({ openPanel: false });
      root.dataset.collapsed = "true";
    });
    header.append(title, close);

    const row = document.createElement("div");
    row.id = "icloud-hme-helper-row";

    const prefixLabel = document.createElement("label");
    prefixLabel.textContent = "\u6807\u7b7e\u524d\u7f00";
    const prefixInput = document.createElement("input");
    prefixInput.id = "icloud-hme-helper-prefix";
    prefixInput.type = "text";
    prefixInput.autocomplete = "off";
    prefixInput.addEventListener("input", () => {
      saveSettings({ labelPrefix: prefixInput.value.trim() || DEFAULTS.labelPrefix });
      updatePanelValues();
    });
    prefixLabel.append(prefixInput);

    const numberLabel = document.createElement("label");
    numberLabel.textContent = "\u4e0b\u4e2a\u7f16\u53f7";
    const numberInput = document.createElement("input");
    numberInput.id = "icloud-hme-helper-number";
    numberInput.type = "number";
    numberInput.min = "1";
    numberInput.step = "1";
    numberInput.addEventListener("input", () => {
      saveSettings({ nextNumber: Math.max(1, Number(numberInput.value || 1)) });
      updatePanelValues();
    });
    numberLabel.append(numberInput);
    row.append(prefixLabel, numberLabel);

    const noteLabel = document.createElement("label");
    noteLabel.textContent = "\u5907\u6ce8\u6a21\u677f";
    const noteInput = document.createElement("textarea");
    noteInput.id = "icloud-hme-helper-note";
    noteInput.spellcheck = false;
    noteInput.addEventListener("input", () => saveSettings({ noteTemplate: noteInput.value }));
    noteLabel.append(noteInput);

    const mailLinkPrefixLabel = document.createElement("label");
    mailLinkPrefixLabel.textContent = TEXT.mailLinkPrefix;
    const mailLinkPrefixInput = document.createElement("input");
    mailLinkPrefixInput.id = "icloud-hme-helper-mail-link-prefix";
    mailLinkPrefixInput.type = "text";
    mailLinkPrefixInput.spellcheck = false;
    mailLinkPrefixInput.addEventListener("input", () => {
      saveSettings({ mailLinkPrefix: mailLinkPrefixInput.value.trim() || DEFAULT_MAIL_LINK_TEMPLATE });
      updatePanelValues();
    });
    mailLinkPrefixLabel.append(mailLinkPrefixInput);

    const randomPurposeLabel = document.createElement("label");
    randomPurposeLabel.className = "icloud-hme-helper-check";
    const randomPurposeInput = document.createElement("input");
    randomPurposeInput.id = "icloud-hme-helper-random-purpose";
    randomPurposeInput.type = "checkbox";
    randomPurposeInput.addEventListener("change", () => saveSettings({ useRandomPurpose: randomPurposeInput.checked }));
    const randomPurposeText = document.createElement("span");
    randomPurposeText.textContent = TEXT.randomPurposeNote;
    randomPurposeLabel.append(randomPurposeInput, randomPurposeText);

    const checkLabel = document.createElement("label");
    checkLabel.className = "icloud-hme-helper-check";
    const checkInput = document.createElement("input");
    checkInput.id = "icloud-hme-helper-click-create";
    checkInput.type = "checkbox";
    checkInput.addEventListener("change", () => saveSettings({ clickCreate: checkInput.checked }));
    const checkText = document.createElement("span");
    checkText.textContent = "\u586b\u5165\u540e\u76f4\u63a5\u70b9\u51fb\u521b\u5efa\u6309\u94ae";
    checkLabel.append(checkInput, checkText);

    const preview = document.createElement("div");
    preview.innerHTML = '\u4e0b\u4e00\u4e2a\u6807\u7b7e\uff1a<span id="icloud-hme-helper-preview"></span>';

    const batchRow = document.createElement("div");
    batchRow.className = "icloud-hme-helper-batch-row";

    const targetLabel = document.createElement("label");
    targetLabel.textContent = TEXT.targetCount;
    const targetInput = document.createElement("input");
    targetInput.id = "icloud-hme-helper-target";
    targetInput.type = "number";
    targetInput.min = "1";
    targetInput.step = "1";
    targetInput.addEventListener("input", () => {
      saveSettings({ batchTarget: Math.max(1, Math.floor(Number(targetInput.value || 1))) });
      updatePanelValues();
    });
    targetLabel.append(targetInput);

    const delayMinLabel = document.createElement("label");
    delayMinLabel.textContent = TEXT.delayMinSeconds;
    const delayMinInput = document.createElement("input");
    delayMinInput.id = "icloud-hme-helper-delay-min";
    delayMinInput.type = "number";
    delayMinInput.min = "0";
    delayMinInput.step = "0.5";
    delayMinInput.addEventListener("input", () => {
      const range = normalizeDelayRange(delayMinInput.value, settings.batchDelayMaxSeconds);
      saveSettings({ batchDelayMinSeconds: range.min, batchDelayMaxSeconds: range.max });
      updatePanelValues();
    });
    delayMinLabel.append(delayMinInput);

    const delayMaxLabel = document.createElement("label");
    delayMaxLabel.textContent = TEXT.delayMaxSeconds;
    const delayMaxInput = document.createElement("input");
    delayMaxInput.id = "icloud-hme-helper-delay-max";
    delayMaxInput.type = "number";
    delayMaxInput.min = "0";
    delayMaxInput.step = "0.5";
    delayMaxInput.addEventListener("input", () => {
      const range = normalizeDelayRange(settings.batchDelayMinSeconds, delayMaxInput.value);
      saveSettings({ batchDelayMinSeconds: range.min, batchDelayMaxSeconds: range.max });
      updatePanelValues();
    });
    delayMaxLabel.append(delayMaxInput);
    batchRow.append(targetLabel, delayMinLabel, delayMaxLabel);

    const backoffRow = document.createElement("div");
    backoffRow.className = "icloud-hme-helper-batch-row";

    const backoffMinLabel = document.createElement("label");
    backoffMinLabel.textContent = TEXT.backoffMinSeconds;
    const backoffMinInput = document.createElement("input");
    backoffMinInput.id = "icloud-hme-helper-backoff-min";
    backoffMinInput.type = "number";
    backoffMinInput.min = "0";
    backoffMinInput.step = "1";
    backoffMinInput.addEventListener("input", () => {
      const range = normalizeBackoffRange(backoffMinInput.value, settings.limitBackoffMaxSeconds);
      saveSettings({ limitBackoffMinSeconds: range.min, limitBackoffMaxSeconds: range.max });
      updatePanelValues();
    });
    backoffMinLabel.append(backoffMinInput);

    const backoffMaxLabel = document.createElement("label");
    backoffMaxLabel.textContent = TEXT.backoffMaxSeconds;
    const backoffMaxInput = document.createElement("input");
    backoffMaxInput.id = "icloud-hme-helper-backoff-max";
    backoffMaxInput.type = "number";
    backoffMaxInput.min = "0";
    backoffMaxInput.step = "1";
    backoffMaxInput.addEventListener("input", () => {
      const range = normalizeBackoffRange(settings.limitBackoffMinSeconds, backoffMaxInput.value);
      saveSettings({ limitBackoffMinSeconds: range.min, limitBackoffMaxSeconds: range.max });
      updatePanelValues();
    });
    backoffMaxLabel.append(backoffMaxInput);
    backoffRow.append(backoffMinLabel, backoffMaxLabel);

    const batchProgress = document.createElement("div");
    batchProgress.id = "icloud-hme-helper-progress";

    const batchActions = document.createElement("div");
    batchActions.id = "icloud-hme-helper-batch-actions";
    const startBatchButton = makeButton(TEXT.startBatch, startBatch, "primary");
    startBatchButton.id = "icloud-hme-helper-start-batch";
    const stopBatchButton = makeButton(TEXT.stopBatch, () => stopBatch(), "danger");
    stopBatchButton.id = "icloud-hme-helper-stop-batch";
    stopBatchButton.disabled = true;
    batchActions.append(startBatchButton, stopBatchButton);

    const actions = document.createElement("div");
    actions.id = "icloud-hme-helper-actions";
    actions.append(
      makeButton(TEXT.openDialog, openCreateDialog, "secondary"),
      makeButton(TEXT.fillOnly, () => fillCurrent(false), "secondary"),
      makeButton(TEXT.fillAndCreate, fillAndCreateCurrent, "primary"),
      makeButton(TEXT.rotateAddress, rotateAddress, "quiet"),
      makeButton(TEXT.copyAddress, copyAddress, "quiet"),
      makeButton(TEXT.copyMailLink, copyMailLink, "quiet"),
      makeButton(TEXT.exportMailLinks, exportMailLinks, "quiet"),
      makeButton(TEXT.resetRandomTemplate, () => {
        saveSettings({
          noteTemplate: DEFAULTS.noteTemplate,
          useRandomPurpose: true,
        });
        updatePanelValues();
      }, "quiet"),
      makeButton(TEXT.diagnose, diagnosePage, "quiet")
    );

    const status = document.createElement("div");
    status.id = "icloud-hme-helper-status";

    const hint = document.createElement("div");
    hint.id = "icloud-hme-helper-hint";
    hint.textContent = TEXT.hotkeyHint;

    panel.append(header, row, noteLabel, mailLinkPrefixLabel, randomPurposeLabel, checkLabel, preview, batchRow, backoffRow, batchProgress, batchActions, actions, status, hint);
    root.append(toggle, panel);
    (document.body || document.documentElement).append(root);
    updatePanelValues();
    setStatus(lastStatus || TEXT.statusReady);
  }

  function onHotkey(event) {
    if (!event.altKey || event.key.toLowerCase() !== "i") return;
    event.preventDefault();
    if (event.shiftKey) fillAndCreateCurrent();
    else fillCurrent(false);
  }

  function start() {
    console.info(`${LOG_PREFIX} started on ${location.href}`);
    injectPanel();
    document.addEventListener("keydown", onHotkey, true);
    const observer = new MutationObserver(() => {
      if (!document.querySelector("#icloud-hme-helper")) injectPanel();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
