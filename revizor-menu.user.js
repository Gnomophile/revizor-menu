// ==UserScript==
// @name         Ревизор Меню (Checker)
// @namespace    starterapp-revizor-menu
// @version      2.0.2
// @description  Проверка выгрузки меню по чек-листу прямо на checker.starterapp.ru — с автозахватом ответа "Menu"
// @match        https://checker.starterapp.ru/*
// @grant        none
// @run-at       document-idle
// @homepageURL  https://github.com/Gnomophile/revizor-menu
// @updateURL    https://raw.githubusercontent.com/Gnomophile/revizor-menu/main/revizor-menu.user.js
// @downloadURL  https://raw.githubusercontent.com/Gnomophile/revizor-menu/main/revizor-menu.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ================= сеть: автозахват меню =================

  function looksLikeMenuArray(arr) {
    return Array.isArray(arr) && arr.length > 0 &&
      arr.every(function (x) { return x && typeof x === 'object'; }) &&
      'code' in arr[0] && 'name' in arr[0] &&
      ('toppingGroups' in arr[0] || 'categories' in arr[0] || 'calories' in arr[0]);
  }

  function findMenuIn(data) {
    if (looksLikeMenuArray(data)) return data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (var k in data) {
        if (Object.prototype.hasOwnProperty.call(data, k) && looksLikeMenuArray(data[k])) return data[k];
      }
    }
    return null;
  }

  function extractProjectFromUrl(url) {
    var m = /\/([a-z0-9_-]+)\/meals\//i.exec(String(url || ''));
    return m ? m[1] : null;
  }

  (function patchNetwork() {
    var origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function (input) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        return origFetch.apply(this, arguments).then(function (res) {
          try {
            res.clone().text().then(function (text) {
              try {
                var menu = findMenuIn(JSON.parse(text));
                if (menu) onMenuCaptured(menu, extractProjectFromUrl(url));
              } catch (e) {}
            }).catch(function () {});
          } catch (e) {}
          return res;
        });
      };
    }
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__rvUrl = url;
      return origOpen.apply(this, arguments);
    };
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      var xhrUrl = this.__rvUrl;
      this.addEventListener('load', function () {
        try {
          var menu = findMenuIn(JSON.parse(this.responseText));
          if (menu) onMenuCaptured(menu, extractProjectFromUrl(xhrUrl));
        } catch (e) {}
      });
      return origSend.apply(this, arguments);
    };
  })();

  function onMenuCaptured(menu, project) {
    if (!shadow) return;
    shadow.getElementById('input').value = JSON.stringify(menu);
    if (project) {
      var projInput = shadow.getElementById('projectInput');
      if (projInput.value !== project) {
        projInput.value = project;
        try { localStorage.setItem('revizor_menu_project', project); } catch (e) {}
      }
    }
    run();
    injectPageTrigger();
    updatePageBadge(menu.length);
    var hint = shadow.getElementById('captureHint');
    if (hint) hint.textContent = 'Поймано автоматически: ' + menu.length + ' блюд' + (project ? ' · проект «' + project + '»' : '');
  }

  // ================= UI: shadow-хост =================

  var host = document.createElement('div');
  host.id = '__revizor_menu_host__';
  host.style.cssText = 'all: initial;';
  document.documentElement.appendChild(host);
  var shadow = host.attachShadow({ mode: 'open' });

  var SUN_ICON = '<svg class="switch__icon switch__icon--sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  var MOON_ICON = '<svg class="switch__icon switch__icon--moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  shadow.innerHTML = ''
    + '<style>' + CSS_TEXT() + '</style>'
    + '<div class="overlay" id="overlayRoot">'
    + '  <div class="overlay-modal">'
    + '    <div class="overlay-modal-scroll">'
    + '      <div class="rv-topbar">'
    + '        <label class="rv-theme-switch" title="Переключить тему">'
    + '          <span class="switch__sr">Тёмная тема</span>'
    + '          <input type="checkbox" class="switch__input" id="themeToggle">'
    + SUN_ICON + MOON_ICON
    + '          <span class="switch__knob"></span>'
    + '        </label>'
    + '        <button class="close-btn" id="closeBtn">✕</button>'
    + '      </div>'
    + '      <div class="wrap">' + BODY_HTML() + '</div>'
    + '    </div>'
    + '  </div>'
    + '</div>';

  function closeOverlay() {
    shadow.getElementById('overlayRoot').classList.remove('show');
  }
  function openOverlay() {
    shadow.getElementById('overlayRoot').classList.add('show');
    updatePageBadge(0, true);
  }
  shadow.getElementById('closeBtn').addEventListener('click', closeOverlay);
  shadow.getElementById('overlayRoot').addEventListener('click', function (e) {
    if (e.target.id === 'overlayRoot') closeOverlay();
  });

  // ================= кнопка запуска: встраивается в тулбар страницы рядом с "Maximize" =================

  var PAGE_BTN_ID = '__rv_page_trigger__';
  var PAGE_BADGE_ID = '__rv_page_badge__';

  function findMaximizeBtn() {
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      if (/^maximize$/i.test((btns[i].textContent || '').trim())) return btns[i];
    }
    return null;
  }

  function injectPageTrigger() {
    var maxBtn = findMaximizeBtn();
    if (!maxBtn) return;
    var next = maxBtn.nextElementSibling;
    if (next && next.id === PAGE_BTN_ID) return;
    var mine = document.createElement('button');
    mine.type = 'button';
    mine.id = PAGE_BTN_ID;
    mine.className = maxBtn.className;
    mine.style.position = 'relative';
    mine.innerHTML = '🍣 Ревизор'
      + '<span id="' + PAGE_BADGE_ID + '" style="display:none;position:absolute;top:-6px;right:-6px;background:#a6301f;color:#fff;'
      + 'font-family:ui-monospace,monospace;font-size:10px;font-weight:700;min-width:16px;height:16px;border-radius:8px;'
      + 'align-items:center;justify-content:center;padding:0 4px;line-height:1;"></span>';
    mine.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openOverlay();
    });
    maxBtn.parentElement.insertBefore(mine, maxBtn.nextSibling);
  }

  function updatePageBadge(count, hide) {
    var badge = document.getElementById(PAGE_BADGE_ID);
    if (!badge) return;
    if (hide) { badge.style.display = 'none'; return; }
    badge.textContent = String(count);
    badge.style.display = 'flex';
  }

  injectPageTrigger();
  var rvMoScheduled = false;
  new MutationObserver(function () {
    if (rvMoScheduled) return;
    rvMoScheduled = true;
    (window.requestAnimationFrame || setTimeout)(function () { rvMoScheduled = false; injectPageTrigger(); });
  }).observe(document.body, { childList: true, subtree: true });

  var THEME_KEY = 'revizor_menu_theme';
  var themeToggleEl = shadow.getElementById('themeToggle');
  var storedTheme = null;
  try { storedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
  var initialDark = storedTheme ? storedTheme === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (initialDark) {
    host.setAttribute('data-theme', 'dark');
    themeToggleEl.checked = true;
  }
  themeToggleEl.addEventListener('change', function () {
    var dark = themeToggleEl.checked;
    if (dark) { host.setAttribute('data-theme', 'dark'); } else { host.removeAttribute('data-theme'); }
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (e) {}
  });

  function CSS_TEXT() {
    return '\
  :host {\
    --bg: #fbf9f5;\
    --surface: #fffdfa;\
    --surface-2: #f2ede2;\
    --ink: #2b2620;\
    --ink-soft: #857e6f;\
    --border: #e6dfd0;\
    --accent: #bd5b34;\
    --accent-hover: #9c4a29;\
    --accent-contrast: #FFFFFF;\
    --brand-green: #9c4a29;\
    --ok: #4a7a3d;\
    --ok-bg: #e7f0e0;\
    --warn: #966016;\
    --warn-bg: #FBF0DC;\
    --critical: #a6301f;\
    --critical-bg: #fbe6e1;\
    --font-sans: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;\
    --font-mono: "IBM Plex Mono", "Consolas", monospace;\
  }\
  :host([data-theme="dark"]) {\
    --bg: #211d17; --surface: #2b251d; --surface-2: #332c22; --ink: #f1ece1; --ink-soft: #b8ae9c;\
    --border: #443b2d; --accent: #d97a4f; --accent-hover: #e8956d; --accent-contrast: #FFFFFF; --brand-green: #e8956d;\
    --ok: #8fbf7a; --ok-bg: #263420; --warn: #E7B355; --warn-bg: #332510; --critical: #e97b65; --critical-bg: #34160F;\
  }\
  * { box-sizing: border-box; }\
  .rv-topbar { position: sticky; top: 0; z-index: 6; display: flex; justify-content: flex-end; align-items: center; gap: 10px; padding: 12px 16px 0 16px; background: var(--bg); }\
  .overlay {\
    display: none; position: fixed; inset: 0; background: rgba(20,16,11,.55);\
    z-index: 2147483646; align-items: center; justify-content: center; padding: 24px;\
  }\
  .overlay.show { display: flex; }\
  .overlay-modal {\
    background: var(--bg); width: min(1200px, 100%); max-height: min(92vh, 1000px);\
    border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,.45); overflow: hidden; position: relative;\
    display: flex; flex-direction: column;\
  }\
  .overlay-modal-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; }\
  .close-btn {\
    background: var(--surface); border: 1px solid var(--border); color: var(--ink-soft);\
    width: 34px; height: 34px; border-radius: 50%; cursor: pointer; font-size: 15px; flex-shrink: 0;\
    display: flex; align-items: center; justify-content: center; transition: border-color .12s;\
  }\
  .close-btn:hover { border-color: var(--accent); opacity: 1; }\
  .rv-theme-switch { position: relative; display: inline-flex; align-items: center; cursor: pointer; -webkit-tap-highlight-color: transparent; user-select: none; flex-shrink: 0; }\
  .rv-theme-switch .switch__input { margin: 0; width: 60px; height: 34px; background-color: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; outline: transparent; -webkit-appearance: none; appearance: none; cursor: pointer; }\
  .rv-theme-switch .switch__input:focus-visible { box-shadow: 0 0 0 2px var(--accent); }\
  .rv-theme-switch .switch__icon { position: absolute; top: 50%; width: 14px; height: 14px; transform: translateY(-50%) rotate(0deg); pointer-events: none; z-index: 2; color: var(--ink-soft); transition: color .25s ease, transform .35s ease; }\
  .rv-theme-switch .switch__icon svg { width: 100%; height: 100%; display: block; }\
  .rv-theme-switch .switch__icon--sun { left: 9px; }\
  .rv-theme-switch .switch__icon--moon { right: 9px; }\
  .rv-theme-switch .switch__input:not(:checked) ~ .switch__icon--sun { color: #fff; transform: translateY(-50%) rotate(360deg); }\
  .rv-theme-switch .switch__input:checked ~ .switch__icon--moon { color: #fff; transform: translateY(-50%) rotate(360deg); }\
  .rv-theme-switch .switch__knob { position: absolute; top: 4px; left: 2px; width: 28px; height: 26px; border-radius: 6px; background: var(--accent); pointer-events: none; z-index: 1; transform: translateX(0); transition: transform .3s cubic-bezier(0.65,0,0.35,1); }\
  .rv-theme-switch .switch__input:checked ~ .switch__knob { transform: translateX(28px); }\
  .rv-theme-switch .switch__sr { overflow: hidden; position: absolute; width: 1px; height: 1px; }\
  body, .revizor-root { color: var(--ink); font-family: var(--font-sans); line-height: 1.5; }\
  .wrap { max-width: 1120px; margin: 0 auto; padding: 8px 24px 60px; color: var(--ink); font-family: var(--font-sans); line-height: 1.5; }\
  header.page-head { display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px; }\
  .eyebrow { font-family: var(--font-mono); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--brand-green); }\
  h1 { font-size: 26px; font-weight: 700; margin: 0; letter-spacing: -.01em; }\
  .lede { color: var(--ink-soft); max-width: 68ch; font-size: 14.5px; margin: 0; }\
  section.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 20px; margin-bottom: 20px; }\
  .panel-label { font-size: 13px; font-weight: 600; color: var(--ink-soft); margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }\
  textarea#input { width: 100%; min-height: 160px; resize: vertical; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 14px; color: var(--ink); font-family: var(--font-mono); font-size: 12.5px; line-height: 1.6; }\
  textarea#input::placeholder { color: var(--ink-soft); opacity: .7; }\
  textarea#input.dragover { border-color: var(--brand-green); box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-green) 20%, transparent); }\
  .actions { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; align-items: center; }\
  button { margin: 0; font-family: var(--font-sans); font-size: 14px; font-weight: 600; color: inherit; border-radius: 7px; cursor: pointer; border: 1px solid transparent; transition: opacity .15s ease; }\
  button:focus-visible { outline: 2px solid var(--brand-green); outline-offset: 2px; }\
  button:hover { opacity: .88; }\
  button.primary { background: var(--accent); color: var(--accent-contrast); padding: 10px 18px; }\
  button.ghost { background: transparent; color: var(--ink-soft); border-color: var(--border); padding: 10px 18px; }\
  .hint { font-size: 12.5px; color: var(--ink-soft); }\
  .capture-hint { font-size: 12px; color: var(--brand-green); font-weight: 600; }\
  .banner { display: none; border-radius: 8px; padding: 12px 14px; font-size: 13.5px; margin-top: 14px; border: 1px solid; }\
  .banner.show { display: block; }\
  .banner.warn { background: var(--warn-bg); border-color: var(--warn); color: var(--warn); }\
  .banner.error { background: var(--critical-bg); border-color: var(--critical); color: var(--critical); }\
  .project-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }\
  .project-row label { font-size: 13px; font-weight: 600; color: var(--ink-soft); white-space: nowrap; }\
  .project-row input { flex: 1; min-width: 180px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 7px; padding: 8px 10px; color: var(--ink); font-family: var(--font-mono); font-size: 13px; }\
  #results { display: none; } #results.show { display: block; }\
  .stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 20px; }\
  .stat { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; position: relative; overflow: hidden; }\
  .stat::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--stripe, var(--border)); }\
  .stat.ok { --stripe: var(--ok); } .stat.warn { --stripe: var(--warn); } .stat.critical { --stripe: var(--critical); }\
  .stat .num { font-family: var(--font-mono); font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.1; }\
  .stat .label { font-size: 12px; color: var(--ink-soft); margin-top: 4px; }\
  .workspace { display: grid; grid-template-columns: 210px 1fr; gap: 20px; align-items: start; }\
  .tabs-nav { position: sticky; top: 8px; display: flex; flex-direction: column; gap: 6px; }\
  .tab-btn { display: flex; flex-direction: column; gap: 5px; text-align: left; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; cursor: pointer; font-family: var(--font-sans); }\
  .tab-btn:hover { opacity: .9; }\
  .tab-btn.active { box-shadow: inset 3px 0 0 var(--accent); border-color: var(--accent); }\
  .tab-btn .tt { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; }\
  .tab-btn .ts { font-size: 11px; color: var(--ink-soft); line-height: 1.4; }\
  .tab-btn .tag-mini { font-size: 9.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--ink-soft); background: var(--surface-2); border-radius: 4px; padding: 1px 5px; }\
  .tabpanel { display: none; } .tabpanel.active { display: block; }\
  .cluster { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 12px; overflow: hidden; }\
  .cluster-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border); cursor: pointer; list-style: none; }\
  .cluster-head::-webkit-details-marker { display: none; }\
  details.cluster:not([open]) .cluster-head { border-bottom: none; }\
  .cluster-chev { font-family: var(--font-mono); color: var(--ink-soft); font-size: 12px; transition: transform .15s ease; flex-shrink: 0; }\
  details.cluster[open] .cluster-chev { transform: rotate(90deg); }\
  .cluster-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }\
  .cluster-dot.critical { background: var(--critical); } .cluster-dot.warn { background: var(--warn); }\
  .cluster-title { font-weight: 600; font-size: 13.5px; flex: 1; }\
  .cluster-count { font-family: var(--font-mono); font-size: 12px; color: var(--ink-soft); }\
  .ticket-list { padding: 4px 0; }\
  .ticket { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start; padding: 10px 16px; border-top: 1px dashed var(--border); }\
  .ticket:first-child { border-top: none; }\
  .ticket .body { min-width: 0; } .ticket .meta { font-size: 13px; color: var(--ink); }\
  .ticket .meta code { font-family: var(--font-mono); background: var(--surface-2); padding: 1px 5px; border-radius: 4px; font-size: 11.5px; }\
  .ticket .used-in { font-size: 12px; color: var(--ink-soft); margin-top: 3px; line-height: 1.5; }\
  .used-in-list { display: flex; flex-direction: column; gap: 1px; margin-top: 2px; }\
  .used-in-item.used-in-hidden { display: none; }\
  .used-in-list.expanded .used-in-item.used-in-hidden { display: block; }\
  .used-in-toggle { margin-top: 4px; background: none; border: none; color: var(--brand-green); font-size: 11.5px; font-weight: 600; padding: 0; cursor: pointer; }\
  .used-in-toggle:hover { text-decoration: underline; opacity: 1; }\
  .link-line { margin-top: 5px; }\
  .severity-tag { font-family: var(--font-mono); font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; padding: 3px 8px; border-radius: 4px; white-space: nowrap; align-self: start; }\
  .severity-tag.critical { color: var(--critical); background: var(--critical-bg); }\
  .severity-tag.warn { color: var(--warn); background: var(--warn-bg); }\
  .empty-tab { padding: 22px 18px; color: var(--ink-soft); font-size: 13.5px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }\
  .notice { display: flex; gap: 10px; align-items: flex-start; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; font-size: 13px; margin-bottom: 14px; color: var(--ink); }\
  .notice .ic { font-size: 15px; line-height: 1.3; }\
  .dish-link { color: var(--brand-green); text-decoration: none; font-size: 12.5px; font-weight: 600; }\
  .dish-link:hover { text-decoration: underline; }\
  .disclaimer { font-size: 12px; color: var(--ink-soft); background: var(--surface-2); border-radius: 6px; padding: 4px 8px; }\
  .report-box { margin-top: 18px; }\
  .report-box textarea { width: 100%; min-height: 150px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 12px; color: var(--ink); font-family: var(--font-sans); font-size: 13px; line-height: 1.6; display: none; }\
  .report-box textarea.show { display: block; margin-top: 10px; }\
  footer.note { margin-top: 28px; font-size: 12.5px; color: var(--ink-soft); border-top: 1px solid var(--border); padding-top: 16px; display: flex; flex-direction: column; gap: 6px; }\
  @media (max-width: 820px) { .workspace { grid-template-columns: 1fr; } .tabs-nav { position: static; flex-direction: row; flex-wrap: wrap; } .tab-btn { flex: 1 1 160px; } }\
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }\
    ';
  }

  function BODY_HTML() {
    return ''
      + '<header class="page-head">'
      + '  <span class="eyebrow">Проверка выгрузки · без фото блюд</span>'
      + '  <h1>Ревизор Меню</h1>'
      + '  <p class="lede">Меню подхватывается автоматически, когда на этой странице получаешь ответ «Menu». Можно и вставить/перетащить JSON вручную.</p>'
      + '</header>'
      + '<div id="results">'
      + '  <div class="stat-row" id="statRow"></div>'
      + '  <div class="workspace">'
      + '    <nav class="tabs-nav" id="tabsNav"></nav>'
      + '    <div class="tabpanels">'
      + '      <div class="tabpanel" id="tabpanel-A"></div>'
      + '      <div class="tabpanel" id="tabpanel-B"></div>'
      + '      <div class="tabpanel" id="tabpanel-C"></div>'
      + '      <div class="tabpanel" id="tabpanel-D"></div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="report-box">'
      + '    <button class="ghost" id="copyBtn">Скопировать отчёт для клиента</button>'
      + '    <textarea id="reportText" readonly></textarea>'
      + '  </div>'
      + '</div>'
      + '<footer class="note">'
      + '  <span>Неактивные позиции (status ≠ active) в проверку не попадают.</span>'
      + '  <span>«Объединение в одну карточку» — эвристика по похожим названиям, не источник истины: проверяйте находки руками.</span>'
      + '  <span>«Категории по времени» — определяется по ключевым словам в коде категории (zavtrak/obed/uzhin/lanch/brunch и кириллица), возможны ложные срабатывания.</span>'
      + '  <span>Если фото нет вообще у всех модификаторов проекта — это не считается ошибкой, только предупреждением.</span>'
      + '  <span>Качество и наличие фото самих блюд скрипт не проверяет.</span>'
      + '  <span>Ссылки на карточки появляются только если указано название проекта; используется первая категория блюда.</span>'
      + '  <span>Автозахват — эвристика по форме ответа (есть code/name/toppingGroups); если после «Menu» бейдж на кнопке не появился, вставь JSON вручную.</span>'
      + '</footer>'
      + '<section class="panel">'
      + '  <div class="panel-label">'
      + '    <span>Данные меню (JSON) <span class="capture-hint" id="captureHint"></span></span>'
      + '    <span class="hint">Массив блюд, либо объект {"название ресторана": [...]} · можно перетащить .json файл</span>'
      + '  </div>'
      + '  <textarea id="input" placeholder="Заполнится само после запроса Menu на этой странице. Либо вставь JSON вручную."></textarea>'
      + '  <input type="file" id="fileInput" accept=".json,application/json" style="display:none">'
      + '  <div class="actions">'
      + '    <button class="primary" id="runBtn">Проверить</button>'
      + '    <button class="ghost" id="fileBtn">Выбрать файл</button>'
      + '    <button class="ghost" id="clearBtn">Очистить</button>'
      + '    <span class="hint" id="statusHint"></span>'
      + '  </div>'
      + '  <div class="banner" id="banner"></div>'
      + '  <div class="project-row">'
      + '    <label for="projectInput">Название проекта</label>'
      + '    <input type="text" id="projectInput" placeholder="например: sushistore" autocomplete="off" spellcheck="false">'
      + '    <span class="hint">для ссылок на карточки: project.starterapp.ru/menu/категория/код</span>'
      + '  </div>'
      + '</section>';
  }

  // ================= правила проверки =================

  var TECH_MODIFIER_PATTERNS = [
    'отдать 1 курсом', 'отдать одним курсом', 'на двух тарелках', 'на 2 тарелках',
    'на две тарелки', 'в одну тарелку', 'с собой', 'отдельная упаковка',
    'отдельно упаковать', 'соус отдельно', 'без упаковки', 'не разогревать',
    'разложить по', 'одновременно'
  ];

  var TECH_GROUP_PATTERNS = ['кухня', 'кухонн', 'технич', 'касс'];

  var MEALTIME_PATTERNS = [
    'zavtrak', 'breakfast', 'obed', 'lunch', 'uzhin', 'dinner', 'supper',
    'lanch', 'brunch', 'завтрак', 'обед', 'ужин', 'ланч', 'бранч'
  ];

  var UNIT_TAIL = /(шт|мл|л|литр|г|кг|см)\.?\s*$/i;

  function isAllCaps(name) {
    var letters = String(name || '').replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '');
    if (letters.length < 3) return false;
    return letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  }

  function hasLeadingBullet(name) {
    return /^\s*[-–—*•]\s?/.test(String(name || ''));
  }

  var ABBREV_PATTERNS = [
    { re: /б\s?\/\s?а/i, label: 'сокращение «б/а»' },
    { re: /хол\s?\/\s?(не\s?хол|гор)/i, label: 'сокращение «хол/не хол»' },
    { re: /(^|\s)доп\.?(\s|$)/i, label: 'сокращение «доп»' },
    { re: /\/\s?хол\.?/i, label: 'сокращение «/хол»' }
  ];

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) { if (!seen[x]) { seen[x] = true; out.push(x); } });
    return out;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function tryRepairTruncatedArray(text) {
    var depth = 0, inString = false, escape = false, arrayStarted = false, lastEnd = -1;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inString) {
        if (escape) { escape = false; }
        else if (ch === '\\') { escape = true; }
        else if (ch === '"') { inString = false; }
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '[') { if (depth === 0) arrayStarted = true; depth++; }
      else if (ch === '{') { depth++; }
      else if (ch === ']') { depth--; }
      else if (ch === '}') {
        depth--;
        if (arrayStarted && depth === 1) lastEnd = i;
      }
    }
    if (!arrayStarted || lastEnd === -1) return null;
    var candidate = text.slice(0, lastEnd + 1) + ']';
    try {
      return { data: JSON.parse(candidate), repaired: true };
    } catch (e2) {
      return null;
    }
  }

  function parseInput(text) {
    text = text.trim();
    if (!text) throw new Error('Вставь JSON с данными меню.');
    try {
      return { data: JSON.parse(text), repaired: false };
    } catch (e) {
      var repaired = tryRepairTruncatedArray(text);
      if (repaired) return repaired;
      throw new Error('Не получилось разобрать JSON: ' + e.message);
    }
  }

  function normalizeMenus(parsed) {
    if (Array.isArray(parsed)) {
      return [{ name: 'Меню', items: parsed }];
    }
    if (parsed && typeof parsed === 'object') {
      var keys = Object.keys(parsed);
      var allArrays = keys.length > 0 && keys.every(function (k) { return Array.isArray(parsed[k]); });
      if (allArrays) {
        return keys.map(function (k) { return { name: k, items: parsed[k] }; });
      }
    }
    throw new Error('Ожидался массив блюд или объект {"ресторан": [блюда]}.');
  }

  var SIZE_WORDS = /(маленьк|мини|средн|больш|огромн|макси|стандартн)[а-яё]*/gi;
  var VOLCOUNT_ANYWHERE = /\d+[.,]?\d*\s?(шт\.?|мл\.?|л\.?|литр[а-яё]*|г\.?|кг\.?|см\.?)(?![а-яёa-z])/gi;

  function normalizeBaseName(name) {
    return (name || '')
      .replace(/["«»]/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(VOLCOUNT_ANYWHERE, ' ')
      .replace(SIZE_WORDS, ' ')
      .replace(/[-–—]/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function checkDishes(restaurantName, items, findingsA, findingsC) {
    var active = items.filter(function (d) { return !d.status || d.status === 'active'; });
    var groups = {};

    active.forEach(function (d) {
      var name = d.name || '(без названия)';
      var code = d.code || '—';

      if (!d.description || String(d.description).trim().length < 5) {
        findingsA.push({ severity: 'critical', issue: 'Нет описания', name: name, code: code, restaurant: restaurantName });
      }
      if (!d.weight) {
        findingsA.push({ severity: 'critical', issue: 'Не указан вес', name: name, code: code, restaurant: restaurantName });
      }
      if (d.calories === null || d.calories === undefined) {
        findingsA.push({ severity: 'critical', issue: 'Не заполнено КБЖУ', name: name, code: code, restaurant: restaurantName });
      }
      if (typeof d.name === 'string' && /\d+\s?(мл|л)\.?(?![а-яёa-z])/i.test(d.name)) {
        findingsA.push({ severity: 'warn', issue: 'В названии указан объём — возможно, нужно объединить в карточку с выбором объёма', name: name, code: code, restaurant: restaurantName });
      }

      var cats = Array.isArray(d.categories) ? d.categories.slice().sort().join(',') : '';
      var base = normalizeBaseName(d.name);
      if (base) {
        var key = cats + '||' + base;
        if (!groups[key]) groups[key] = [];
        var hasModifications = !!(d.modifications || d.modificationValues);
        groups[key].push({ name: name, code: code, hasModifications: hasModifications });
      }
    });

    Object.keys(groups).forEach(function (key) {
      var g = groups[key];
      if (g.length >= 2 && g.every(function (x) { return !x.hasModifications; })) {
        findingsC.push({
          severity: 'warn',
          issue: 'Похожие блюда одной категории, возможно нужно объединить в одну карточку',
          items: g.map(function (x) { return x.name; }),
          itemsAreDishes: true,
          restaurant: restaurantName
        });
      }
    });
  }

  function checkToppings(restaurantName, items, findingsB, photoStats, photoCandidates) {
    var active = items.filter(function (d) { return !d.status || d.status === 'active'; });
    var index = {};
    var groupIndex = {};
    var numberIndex = {};

    active.forEach(function (dish) {
      (dish.toppingGroups || []).forEach(function (group) {
        var groupName = group.groupName || '(без названия)';
        var gKey = restaurantName + '||' + groupName;
        if (!groupIndex[gKey]) {
          groupIndex[gKey] = { name: groupName, dishes: [] };
        }
        groupIndex[gKey].dishes.push(dish.name || '(без названия)');

        (group.toppings || []).forEach(function (t) {
          var key = restaurantName + '||' + (t.code || t.name);
          if (!index[key]) {
            index[key] = { name: t.name || '(без названия)', code: t.code || '—', images: t.images || [], dishes: [] };
          }
          index[key].dishes.push(dish.name || '(без названия)');

          var trimmed = (t.name || '').trim();
          var bare = /(\d+)\s*$/.exec(trimmed);
          if (bare && !UNIT_TAIL.test(trimmed)) {
            if (!numberIndex[gKey]) numberIndex[gKey] = {};
            if (!numberIndex[gKey][bare[1]]) numberIndex[gKey][bare[1]] = [];
            numberIndex[gKey][bare[1]].push(t.name);
          }
        });
      });
    });

    Object.keys(index).forEach(function (key) {
      var t = index[key];
      var rawName = t.name || '';
      var lname = rawName.toLowerCase();
      var dishList = uniq(t.dishes);

      if (hasLeadingBullet(rawName)) {
        findingsB.push({ severity: 'critical', issue: 'Название начинается с дефиса/буллита — похоже на техническую копипасту из кассы', name: t.name, code: t.code, restaurant: restaurantName, dishes: dishList });
      }
      if (isAllCaps(rawName)) {
        findingsB.push({ severity: 'critical', issue: 'Название написано КАПСОМ — не для гостя', name: t.name, code: t.code, restaurant: restaurantName, dishes: dishList });
      }
      if (/\d+\s?\*\s?[cс](?![а-яёa-z])/i.test(rawName)) {
        findingsB.push({ severity: 'warn', issue: 'Похоже на температуру со звёздочкой вместо ° — проверь формат', name: t.name, code: t.code, restaurant: restaurantName, dishes: dishList });
      }
      TECH_MODIFIER_PATTERNS.forEach(function (p) {
        if (lname.indexOf(p) !== -1) {
          findingsB.push({ severity: 'critical', issue: 'Технический модификатор, не для гостя ("' + p + '")', name: t.name, code: t.code, restaurant: restaurantName, dishes: dishList });
        }
      });
      ABBREV_PATTERNS.forEach(function (p) {
        if (p.re.test(t.name)) {
          findingsB.push({ severity: 'critical', issue: 'Сокращение в названии — ' + p.label, name: t.name, code: t.code, restaurant: restaurantName, dishes: dishList });
        }
      });
      if (t.name.indexOf('/') !== -1 && !ABBREV_PATTERNS.some(function (p) { return p.re.test(t.name); })) {
        findingsB.push({ severity: 'warn', issue: 'Символ «/» в названии — проверь, не сокращение ли это', name: t.name, code: t.code, restaurant: restaurantName, dishes: dishList });
      }
      if (/\.\s*$/.test(t.name)) {
        findingsB.push({ severity: 'warn', issue: 'Название заканчивается точкой — проверь, нужна ли', name: t.name, code: t.code, restaurant: restaurantName, dishes: dishList });
      }

      photoStats.total++;
      if (!t.images || t.images.length === 0) {
        photoStats.missing++;
        photoCandidates.push({ severity: 'critical', issue: 'Нет фото у модификатора', name: t.name, code: t.code, restaurant: restaurantName, dishes: dishList });
      }
    });

    Object.keys(groupIndex).forEach(function (key) {
      var g = groupIndex[key];
      var dishList = uniq(g.dishes);
      var lname = (g.name || '').toLowerCase();

      if (TECH_GROUP_PATTERNS.some(function (p) { return lname.indexOf(p) !== -1; })) {
        findingsB.push({ severity: 'critical', issue: 'Название группы модификаторов звучит технически (для кухни/кассы, не для гостя)', name: g.name, code: '(группа)', restaurant: restaurantName, dishes: dishList });
      }
      if (isAllCaps(g.name)) {
        findingsB.push({ severity: 'critical', issue: 'Название группы модификаторов написано КАПСОМ', name: g.name, code: '(группа)', restaurant: restaurantName, dishes: dishList });
      }
    });

    Object.keys(numberIndex).forEach(function (gKey) {
      var byNum = numberIndex[gKey];
      var groupName = gKey.split('||')[1];
      var groupDishes = groupIndex[gKey] ? uniq(groupIndex[gKey].dishes) : [];
      Object.keys(byNum).forEach(function (num) {
        var names = uniq(byNum[num]);
        if (names.length >= 2) {
          findingsB.push({
            severity: 'warn',
            issue: 'В группе модификаторов повторяется число «' + num + '» без единицы измерения — допиши единицу или убери число из названия',
            name: groupName,
            code: '(группа)',
            restaurant: restaurantName,
            dishes: groupDishes,
            toppingNames: names
          });
        }
      });
    });
  }

  function checkCategories(restaurantName, items, findingsD) {
    var active = items.filter(function (d) { return !d.status || d.status === 'active'; });
    var catDishes = {};
    active.forEach(function (d) {
      (Array.isArray(d.categories) ? d.categories : []).forEach(function (c) {
        if (!c) return;
        if (!catDishes[c]) catDishes[c] = [];
        catDishes[c].push(d.name || '(без названия)');
      });
    });
    Object.keys(catDishes).forEach(function (cat) {
      var lc = cat.toLowerCase();
      if (MEALTIME_PATTERNS.some(function (p) { return lc.indexOf(p) !== -1; })) {
        findingsD.push({
          severity: 'warn',
          issue: 'Категория похожа на приём пищи по времени — проверь, настроен ли режим работы категории',
          name: cat,
          code: '(категория)',
          restaurant: restaurantName,
          dishes: uniq(catDishes[cat])
        });
      }
    });
  }

  function checkImages(restaurantName, items, findingsA) {
    var active = items.filter(function (d) { return !d.status || d.status === 'active'; });
    var byImage = {};
    active.forEach(function (d) {
      var base = normalizeBaseName(d.name);
      (Array.isArray(d.images) ? d.images : []).forEach(function (img) {
        if (!img) return;
        if (!byImage[img]) byImage[img] = [];
        byImage[img].push({ name: d.name || '(без названия)', base: base });
      });
    });
    Object.keys(byImage).forEach(function (img) {
      var group = byImage[img];
      var uniqueBases = uniq(group.map(function (x) { return x.base; }));
      if (group.length >= 2 && uniqueBases.length >= 2) {
        findingsA.push({
          severity: 'warn',
          issue: 'Одно и то же фото используется для разных блюд — проверь, не перепутано ли',
          items: uniq(group.map(function (x) { return x.name; })),
          itemsAreDishes: true,
          restaurant: restaurantName
        });
      }
    });
  }

  // ================= рендер =================

  var lastDishInfo = {};
  var activeTab = 'A';

  function getProjectName() {
    return (shadow.getElementById('projectInput').value || '').trim();
  }

  function buildDishLink(project, category, code) {
    return 'https://' + encodeURIComponent(project) + '.starterapp.ru/menu/' + encodeURIComponent(category || '') + '/' + encodeURIComponent(code);
  }

  function makeDishLink(restaurant, dishName) {
    var project = getProjectName();
    if (!project || !dishName) return null;
    var info = lastDishInfo[restaurant + '||' + dishName];
    if (!info || !info.code) return null;
    var a = document.createElement('a');
    a.href = buildDishLink(project, info.category, info.code);
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'dish-link';
    a.textContent = dishName;
    return a;
  }

  function renderStat(container, num, label, tone) {
    var s = el('div', 'stat ' + tone);
    s.appendChild(el('div', 'num', String(num)));
    s.appendChild(el('div', 'label', label));
    container.appendChild(s);
  }

  var _multiMenu = false;

  function restaurantPrefix(restaurant) {
    return _multiMenu ? restaurant + ' · ' : '';
  }

  function renderTicket(f) {
    var t = el('div', 'ticket');
    var body = el('div', 'body');

    if (f.itemsAreDishes) {
      body.appendChild(el('div', 'meta', escapeHtml(restaurantPrefix(f.restaurant)) + f.items.length + ' позиции'));
      var wrap = el('div', 'used-in');
      f.items.forEach(function (nm, i) {
        if (i > 0) wrap.appendChild(document.createTextNode(' · '));
        var link = makeDishLink(f.restaurant, nm);
        wrap.appendChild(link || document.createTextNode(nm));
      });
      body.appendChild(wrap);
    } else if (f.toppingNames) {
      var metaLine = el('div', 'meta');
      metaLine.appendChild(document.createTextNode(restaurantPrefix(f.restaurant) + 'группа «' + f.name + '»'));
      body.appendChild(metaLine);
      body.appendChild(el('div', 'used-in', 'Модификаторы: ' + escapeHtml(f.toppingNames.join(', '))));
      appendLinkLine(body, f);
    } else {
      var meta = el('div', 'meta');
      meta.appendChild(document.createTextNode(restaurantPrefix(f.restaurant) + f.name + ' · '));
      meta.appendChild(el('code', '', escapeHtml(f.code)));
      body.appendChild(meta);
      renderUsedIn(body, f.dishes, f.restaurant);
      appendLinkLine(body, f);
    }

    t.appendChild(body);
    t.appendChild(el('span', 'severity-tag ' + f.severity, f.severity === 'critical' ? 'ошибка' : 'проверить'));
    return t;
  }

  function renderUsedIn(body, dishes, restaurant) {
    if (!dishes || !dishes.length) return;
    var VISIBLE = 3;
    var wrap = el('div', 'used-in');
    wrap.appendChild(document.createTextNode('Используется в:'));
    var list = el('div', 'used-in-list');
    dishes.forEach(function (nm, i) {
      var line = el('div', 'used-in-item' + (i >= VISIBLE ? ' used-in-hidden' : ''));
      var link = makeDishLink(restaurant, nm);
      line.appendChild(link || document.createTextNode(nm));
      list.appendChild(line);
    });
    wrap.appendChild(list);
    if (dishes.length > VISIBLE) {
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'used-in-toggle';
      toggle.textContent = 'ещё ' + (dishes.length - VISIBLE);
      toggle.addEventListener('click', function () {
        var expanded = list.classList.toggle('expanded');
        toggle.textContent = expanded ? 'свернуть' : 'ещё ' + (dishes.length - VISIBLE);
      });
      wrap.appendChild(toggle);
    }
    body.appendChild(wrap);
  }

  function appendLinkLine(body, f) {
    var dn = (f.dishes && f.dishes[0]) || f.name;
    var link = makeDishLink(f.restaurant, dn);
    if (link) {
      link.textContent = '↗ Открыть карточку' + (f.dishes && f.dishes.length > 1 ? ' (' + dn + ')' : '');
      var lineWrap = el('div', 'link-line');
      lineWrap.appendChild(link);
      body.appendChild(lineWrap);
    }
  }

  function renderClusteredPanel(container, findings) {
    container.innerHTML = '';
    if (findings.length === 0) {
      container.appendChild(el('div', 'empty-tab', '✓ Замечаний нет'));
      return;
    }
    var order = [];
    var byIssue = {};
    findings.forEach(function (f) {
      if (!byIssue[f.issue]) { byIssue[f.issue] = []; order.push(f.issue); }
      byIssue[f.issue].push(f);
    });
    order.forEach(function (issue) {
      var group = byIssue[issue];
      var severity = group.some(function (f) { return f.severity === 'critical'; }) ? 'critical' : 'warn';
      var cluster = document.createElement('details');
      cluster.className = 'cluster';
      cluster.open = true;
      var head = document.createElement('summary');
      head.className = 'cluster-head';
      head.appendChild(el('span', 'cluster-dot ' + severity));
      head.appendChild(el('span', 'cluster-title', escapeHtml(issue)));
      head.appendChild(el('span', 'cluster-count', String(group.length)));
      head.appendChild(el('span', 'cluster-chev', '▸'));
      cluster.appendChild(head);
      var list = el('div', 'ticket-list');
      group.forEach(function (f) { list.appendChild(renderTicket(f)); });
      cluster.appendChild(list);
      container.appendChild(cluster);
    });
  }

  var TAB_DEFS = [
    { key: 'A', title: 'Названия и описания', sub: 'описания, вес, КБЖУ, объём в названии, дублирующиеся фото' },
    { key: 'B', title: 'Топпинги', sub: 'технические модификаторы, сокращения, фото' },
    { key: 'C', title: 'Объединение карточек', sub: 'похожие блюда без объединения', tag: 'эвристика' },
    { key: 'D', title: 'Категории по времени', sub: 'завтрак/обед/ужин — проверь режим работы', tag: 'по словам' }
  ];

  function severityToneFor(findings) {
    if (findings.length === 0) return 'ok';
    return findings.some(function (f) { return f.severity === 'critical'; }) ? 'critical' : 'warn';
  }

  function selectTab(key) {
    activeTab = key;
    shadow.querySelectorAll('.tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === key);
    });
    shadow.querySelectorAll('.tabpanel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'tabpanel-' + key);
    });
  }

  function renderTabsNav(findingsByKey) {
    var nav = shadow.getElementById('tabsNav');
    nav.innerHTML = '';
    TAB_DEFS.forEach(function (def) {
      var findings = findingsByKey[def.key];
      var btn = el('button', 'tab-btn');
      btn.setAttribute('data-tab', def.key);
      var tt = el('div', 'tt');
      tt.appendChild(document.createTextNode(def.title + ' '));
      var pill = document.createElement('span');
      var tone = severityToneFor(findings);
      pill.style.fontFamily = 'var(--font-mono)';
      pill.style.fontSize = '11px';
      pill.style.padding = '1px 7px';
      pill.style.borderRadius = '100px';
      pill.style.border = '1px solid';
      pill.style.color = 'var(--' + tone + ')';
      pill.style.borderColor = 'var(--' + tone + ')';
      pill.style.background = 'var(--' + tone + '-bg, transparent)';
      pill.textContent = String(findings.length);
      tt.appendChild(pill);
      btn.appendChild(tt);
      var ts = el('div', 'ts', escapeHtml(def.sub) + (def.tag ? ' <span class="tag-mini">' + escapeHtml(def.tag) + '</span>' : ''));
      btn.appendChild(ts);
      btn.addEventListener('click', function () { selectTab(def.key); });
      nav.appendChild(btn);
    });
    selectTab(activeTab);
  }

  function renderPhotoNotice(container, photoStats) {
    if (photoStats.total > 0 && photoStats.missing === photoStats.total) {
      var notice = el('div', 'notice');
      notice.appendChild(el('span', 'ic', 'ℹ'));
      notice.appendChild(el('div', '', 'У модификаторов на проекте нет фотографий совсем (0 из ' + photoStats.total + ') — это похоже на общую настройку, а не ошибку по каждому блюду. Уточните с командой, планируются ли фото.'));
      container.insertBefore(notice, container.firstChild);
    }
  }

  function buildClientReport(findingsA, findingsB, findingsC, findingsD, photoStats) {
    var lines = ['Проверка меню — что стоит поправить', ''];
    var CAP = 15;

    function listNames(arr) {
      var shown = arr.slice(0, CAP).join(', ');
      return arr.length > CAP ? shown + ' и ещё ' + (arr.length - CAP) : shown;
    }

    function section(title, findings) {
      if (findings.length === 0) return;
      lines.push(title + ':');
      var byIssue = {};
      var order = [];
      findings.forEach(function (f) {
        if (!byIssue[f.issue]) { byIssue[f.issue] = []; order.push(f.issue); }
        byIssue[f.issue].push(f);
      });
      order.forEach(function (issue) {
        var names = byIssue[issue].map(function (f) {
          if (f.itemsAreDishes) return f.items.join(' + ');
          return f.name;
        });
        lines.push('— ' + issue + ': ' + listNames(names));
      });
      lines.push('');
    }

    section('Названия и описания', findingsA);
    section('Топпинги', findingsB);
    if (photoStats.total > 0 && photoStats.missing === photoStats.total) {
      lines.push('— У модификаторов на проекте нет фотографий совсем (0 из ' + photoStats.total + ') — уточните, планируются ли.');
      lines.push('');
    }
    section('Стоит объединить в одну карточку', findingsC);
    section('Категории — проверить режим работы по времени', findingsD);

    if (lines.length <= 2) lines.push('Замечаний не найдено.');
    return lines.join('\n');
  }

  // ================= запуск =================

  var _findingsA = [], _findingsB = [], _findingsC = [], _findingsD = [];
  var _photoStats = { total: 0, missing: 0 };
  var _totalDishes = 0;
  var _hasRun = false;

  function showBanner(msg, tone) {
    var b = shadow.getElementById('banner');
    b.textContent = msg;
    b.className = 'banner show ' + tone;
  }
  function hideBanner() {
    shadow.getElementById('banner').className = 'banner';
  }

  function renderAll() {
    var statRow = shadow.getElementById('statRow');
    statRow.innerHTML = '';
    renderStat(statRow, _totalDishes, 'блюд проверено', 'ok');
    renderStat(statRow, _findingsA.length, 'названия/описания', severityToneFor(_findingsA));
    renderStat(statRow, _findingsB.length, 'топпинги', severityToneFor(_findingsB));
    renderStat(statRow, _findingsC.length, 'на объединение', _findingsC.length ? 'warn' : 'ok');
    renderStat(statRow, _findingsD.length, 'категорий по времени', _findingsD.length ? 'warn' : 'ok');

    renderTabsNav({ A: _findingsA, B: _findingsB, C: _findingsC, D: _findingsD });

    renderClusteredPanel(shadow.getElementById('tabpanel-A'), _findingsA);
    renderClusteredPanel(shadow.getElementById('tabpanel-B'), _findingsB);
    renderPhotoNotice(shadow.getElementById('tabpanel-B'), _photoStats);
    renderClusteredPanel(shadow.getElementById('tabpanel-C'), _findingsC);
    renderClusteredPanel(shadow.getElementById('tabpanel-D'), _findingsD);

    shadow.getElementById('reportText').value = buildClientReport(_findingsA, _findingsB, _findingsC, _findingsD, _photoStats);
    shadow.getElementById('results').className = 'show';
  }

  function run() {
    var text = shadow.getElementById('input').value;
    hideBanner();
    var parsed;
    try {
      parsed = parseInput(text);
    } catch (e) {
      showBanner(e.message, 'error');
      shadow.getElementById('results').className = '';
      return;
    }

    if (parsed.repaired) {
      showBanner('JSON был обрезан — прочитана только часть, которая успела закрыться корректно. Проверь, что вставил файл целиком.', 'warn');
    }

    var menus;
    try {
      menus = normalizeMenus(parsed.data);
    } catch (e) {
      showBanner(e.message, 'error');
      shadow.getElementById('results').className = '';
      return;
    }

    var findingsA = [], findingsB = [], findingsC = [], findingsD = [];
    var photoStats = { total: 0, missing: 0 };
    var photoCandidates = [];
    var totalDishes = 0;
    lastDishInfo = {};

    menus.forEach(function (m) {
      var active = m.items.filter(function (d) { return !d.status || d.status === 'active'; });
      totalDishes += active.length;
      active.forEach(function (d) {
        lastDishInfo[m.name + '||' + (d.name || '')] = {
          code: d.code || '',
          category: (Array.isArray(d.categories) && d.categories[0]) || ''
        };
      });
      checkDishes(m.name, m.items, findingsA, findingsC);
      checkToppings(m.name, m.items, findingsB, photoStats, photoCandidates);
      checkCategories(m.name, m.items, findingsD);
      checkImages(m.name, m.items, findingsA);
    });

    if (!(photoStats.total > 0 && photoStats.missing === photoStats.total)) {
      findingsB = findingsB.concat(photoCandidates);
    }

    _findingsA = findingsA;
    _findingsB = findingsB;
    _findingsC = findingsC;
    _findingsD = findingsD;
    _photoStats = photoStats;
    _totalDishes = totalDishes;
    _multiMenu = menus.length > 1;
    _hasRun = true;
    activeTab = 'A';

    renderAll();
    shadow.getElementById('statusHint').textContent = menus.length > 1 ? menus.length + ' ресторан(а/ов) проверено' : '';
  }

  shadow.getElementById('runBtn').addEventListener('click', run);
  shadow.getElementById('clearBtn').addEventListener('click', function () {
    shadow.getElementById('input').value = '';
    shadow.getElementById('results').className = '';
    hideBanner();
    shadow.getElementById('statusHint').textContent = '';
    _hasRun = false;
  });

  var projectInputEl = shadow.getElementById('projectInput');
  try { projectInputEl.value = localStorage.getItem('revizor_menu_project') || ''; } catch (e) {}
  projectInputEl.addEventListener('input', function () {
    try { localStorage.setItem('revizor_menu_project', projectInputEl.value); } catch (e) {}
    if (_hasRun) renderAll();
  });

  function loadFileIntoInput(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      shadow.getElementById('input').value = ev.target.result;
      run();
    };
    reader.onerror = function () {
      showBanner('Не получилось прочитать файл «' + file.name + '».', 'error');
    };
    reader.readAsText(file, 'utf-8');
  }

  var inputEl = shadow.getElementById('input');

  ['dragenter', 'dragover'].forEach(function (evt) {
    inputEl.addEventListener(evt, function (e) {
      e.preventDefault();
      e.stopPropagation();
      inputEl.classList.add('dragover');
    });
  });
  ['dragleave', 'dragend'].forEach(function (evt) {
    inputEl.addEventListener(evt, function (e) {
      e.preventDefault();
      e.stopPropagation();
      inputEl.classList.remove('dragover');
    });
  });
  inputEl.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    inputEl.classList.remove('dragover');
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    loadFileIntoInput(file);
  });

  shadow.getElementById('fileBtn').addEventListener('click', function () {
    shadow.getElementById('fileInput').click();
  });
  shadow.getElementById('fileInput').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    loadFileIntoInput(file);
    e.target.value = '';
  });

  shadow.getElementById('copyBtn').addEventListener('click', function () {
    var box = shadow.getElementById('reportText');
    var text = box.value;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        box.className = 'show';
        shadow.getElementById('copyBtn').textContent = 'Скопировано';
        setTimeout(function () { shadow.getElementById('copyBtn').textContent = 'Скопировать отчёт для клиента'; }, 1500);
      }).catch(function () {
        box.className = 'show';
        box.focus();
        box.select();
      });
    } else {
      box.className = 'show';
      box.focus();
      box.select();
    }
  });
})();
