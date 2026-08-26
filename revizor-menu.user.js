// ==UserScript==
// @name         Ревизор Меню (Checker)
// @namespace    starterapp-revizor-menu
// @version      2.0.0
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
    + '    <div class="rv-topbar">'
    + '      <label class="rv-theme-switch" title="Переключить тему">'
    + '        <span class="switch__sr">Тёмная тема</span>'
    + '        <input type="checkbox" class="switch__input" id="themeToggle">'
    + SUN_ICON + MOON_ICON
    + '        <span class="switch__knob"></span>'
    + '      </label>'
    + '      <button class="close-btn" id="closeBtn">✕</button>'
    + '    </div>'
    + '    <div class="wrap">' + BODY_HTML() + '</div>'
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
