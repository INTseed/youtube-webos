/*global navigate*/
import './spatial-navigation-polyfill.js';
import { configAddChangeListener, configRead, configWrite, configGetDesc, segmentTypes, configGetDefault, shortcutActions, sbModes, sbModesHighlight, forcePreviewModes } from './config.js';
import './ui.css';
import './auto-login.js';
import './return-dislike.js';
// import { initYouTubeFixes } from './yt-fixes.js';
import { initVideoQuality } from './video-quality.js';
import sponsorBlockUI from './Sponsorblock-UI.js';
import { sendKey, REMOTE_KEYS, isGuestMode, isWatchPage, isShortsPage, isSearchPage, SELECTORS, getVideo } from './utils.js';
import { initAdblock, destroyAdblock, initTrackingBlock, destroyTrackingBlock } from './adblock.js';
import { getWebOSVersion } from './webos-utils.js';
import { showNotification as _showNotification, setNotificationOled, setNotificationTheme } from './notifications.js';

// Re-export so existing `import { showNotification } from './ui'` sites keep working.
export const showNotification = _showNotification;

let lastSafeFocus = null;
let oledKeepAliveTimer = null;

let lastShortcutTime = 0;
let lastShortcutKey = -1;
let shortcutDebounceTime = 100;

// Seek Burst Variables
let seekAccumulator = 0;
let pendingSeekOffset = 0;
let seekResetTimer = null;
let seekApplyTimer = null;
let activeSeekNotification = null;

let activePlayPauseNotification = null;
let playPauseNotificationTimer = null;

// Lazy load variable
let optionsPanel = null;
let optionsPanelVisible = false;
let panelInitBlock = false;

const shortcutCache = {};
// Define keys including colors
const shortcutKeys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'red', 'green', 'blue'];

const COLOR_KEYS = new Set(['red', 'green', 'blue']);

const cachedSelectors = {
    comments: null,
    description: null,
    save: null
};

window.addEventListener('ytaf-page-update', (e) => {
    if (e.detail.isWatch) {
        cachedSelectors.comments = null;
        cachedSelectors.description = null;
        cachedSelectors.save = null;
    }
});

const ACTION_SCOPES = {
    config_menu: 'GLOBAL',
    oled_toggle: 'GLOBAL',
    refresh_page: 'NON_VIDEO',
    chapter_skip: 'VIDEO',
    chapter_skip_prev: 'VIDEO',
    seek_15_fwd: 'VIDEO',
    seek_15_back: 'VIDEO',
    play_pause: 'VIDEO',
    toggle_subs: 'VIDEO',
    toggle_comments: 'VIDEO',
    toggle_description: 'VIDEO',
    save_to_playlist: 'VIDEO',
    sb_skip_prev: 'VIDEO',
    sb_manual_skip: 'VIDEO'
};

function updateShortcutCache(key) {
    shortcutCache[key] = configRead(`shortcut_key_${key}`);
}

// Initialize cache and listeners
shortcutKeys.forEach(key => {
    updateShortcutCache(key);
    configAddChangeListener(`shortcut_key_${key}`, () => updateShortcutCache(key));
});

// --- Polyfills & Helpers ---

if (!Element.prototype.matches) {
    Element.prototype.matches = 
        Element.prototype.webkitMatchesSelector || 
        Element.prototype.mozMatchesSelector || 
        Element.prototype.msMatchesSelector || 
        Element.prototype.oMatchesSelector;
}
if (!Element.prototype.closest) {
  Element.prototype.closest = function(s) {
    let el = this;
    do {
      if (Element.prototype.matches.call(el, s)) return el;
      el = el.parentElement || el.parentNode;
    } while (el !== null && el.nodeType === 1);
    return null;
  };
}

const simulateBack = () => { console.log('[Shortcut] Simulating Back/Escape...'); sendKey(REMOTE_KEYS.BACK); };

// Engagement panel detection. The two renderers are alternative shells YouTube
// uses depending on the panel type (comments/description vs. title-header
// panels); we query both and return whichever exists. Centralized here because
// the same chain was inlined in three shortcut handlers.
const ENGAGEMENT_PANEL_SELECTOR =
    'ytlr-engagement-panel-section-list-renderer, ytlr-engagement-panel-title-header-renderer';
const getEngagementPanel = () => document.querySelector(ENGAGEMENT_PANEL_SELECTOR);
const isEngagementPanelVisible = () => {
    const panel = getEngagementPanel();
    return !!(panel && window.getComputedStyle(panel).display !== 'none');
};

window.__spatialNavigation__.keyMode = 'NONE';
const ARROW_KEY_CODE = { 
  [REMOTE_KEYS.LEFT.code]: 'left', 
  [REMOTE_KEYS.UP.code]: 'up', 
  [REMOTE_KEYS.RIGHT.code]: 'right', 
  [REMOTE_KEYS.DOWN.code]: 'down' 
};

const colorCodeMap = new Map([
    [403, 'red'], [166, 'red'], 
    [404, 'green'], [172, 'green'], 
    [405, 'yellow'], [170, 'yellow'], 
    [406, 'blue'], [167, 'blue'], [191, 'blue']
]);
const getKeyColor = (charCode) => colorCodeMap.get(charCode) || null;

// --- DOM Utility Functions ---

const createElement = (tag, props = {}, ...children) => {
  const el = document.createElement(tag);
  
  for (const key in props) {
      if (Object.prototype.hasOwnProperty.call(props, key)) {
          const val = props[key];
          if (key === 'style' && typeof val === 'object') {
              for (const styleKey in val) {
                  if (Object.prototype.hasOwnProperty.call(val, styleKey)) {
                      el.style[styleKey] = val[styleKey];
                  }
              }
          }
          else if (key === 'class') el.className = val;
          else if (key === 'events' && typeof val === 'object') {
              for (const evt in val) {
                  if (Object.prototype.hasOwnProperty.call(val, evt)) {
                      el.addEventListener(evt, val[evt]);
                  }
              }
          }
          else if (key === 'text') el.textContent = val;
          else el[key] = val;
      }
  }

  for (let i = 0; i < children.length; i++) {
      const child = children[i];
      el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
};

// --- UI Construction Functions ---

function createConfigCheckbox(key) {
  const elmInput = createElement('input', { type: 'checkbox', checked: configRead(key), events: { change: (evt) => configWrite(key, evt.target.checked) }});
  
  const labelContent = createElement('div', { class: 'label-content', style: { fontSize: '2.1vh' } }, elmInput, `\u00A0${configGetDesc(key)}`);
  const elmLabel = createElement('label', {}, labelContent);
  
  elmInput.addEventListener('focus', () => elmLabel.classList.add('focused'));
  elmInput.addEventListener('blur', () => elmLabel.classList.remove('focused'));
  configAddChangeListener(key, (evt) => elmInput.checked = evt.detail.newValue);
  
  return elmLabel;
}

function createSection(title, elements) {
  const legend = createElement('div', { text: title, style: { color: '#aaa', fontSize: '2.4vh', marginBottom: '0.4vh', fontWeight: 'bold', textTransform: 'uppercase' }});
  const fieldset = createElement('div', { class: 'ytaf-settings-section', style: { marginTop: '1vh', marginBottom: '0.5vh', padding: '0vh', border: '2px solid #444', borderRadius: '5px' }}, legend, ...elements);
  return fieldset;
}

// --- Generic UI Components Factory ---

function createGenericControlRow(labelText, displayValueGetter, onLeft, onRight, onClick, extraElements = null) {
  const valueText = createElement('span', { class: 'current-value' });
  const updateDisplay = () => valueText.textContent = displayValueGetter();

  const container = createElement('div', { 
    class: 'shortcut-control-row',
    style: { padding: '0.6vh 0', margin: '0.2vh 0' }, 
    tabIndex: 0,
    events: {
      keydown: (e) => {
        if (e.keyCode === REMOTE_KEYS.LEFT.code) { onLeft(); e.stopPropagation(); e.preventDefault(); }
        else if (e.keyCode === REMOTE_KEYS.RIGHT.code || e.keyCode === REMOTE_KEYS.ENTER.code) { onRight(); e.stopPropagation(); e.preventDefault(); }
      },
      click: () => onClick()
    }
  },
    createElement('span', { text: labelText, class: 'shortcut-label', style: { fontSize: '2.1vh' } }),
    createElement('div', { class: 'shortcut-value-container' },
      createElement('span', { text: '<', class: 'arrow-btn', events: { click: (e) => { e.stopPropagation(); onLeft(); } } }),
      valueText,
      createElement('span', { text: '>', class: 'arrow-btn', events: { click: (e) => { e.stopPropagation(); onRight(); } } })
    )
  );

  if (extraElements) {
     container.querySelector('.shortcut-value-container').appendChild(extraElements);
  }

  return { container, updateDisplay };
}

function createCycleControl(configKey, labelText, modesArray, displayMap = null, extraElements = null) {
    const displayValueGetter = () => displayMap ? displayMap[configRead(configKey)] || configRead(configKey) : configRead(configKey);
    const cycle = (dir) => {
        let idx = modesArray.indexOf(configRead(configKey));
        if (idx === -1) idx = 0;
        idx = dir === 'next' ? (idx + 1) % modesArray.length : (idx - 1 + modesArray.length) % modesArray.length;
        configWrite(configKey, modesArray[idx]);
        updateDisplay();
    };

    const { container, updateDisplay } = createGenericControlRow(
        labelText, displayValueGetter,
        () => cycle('prev'), () => cycle('next'), () => cycle('next'),
        extraElements
    );

    configAddChangeListener(configKey, updateDisplay);
    updateDisplay();
    return container;
}

function createSegmentControl(key) {
  const isHighlight = key === 'sbMode_highlight';
  const modesMap = isHighlight ? sbModesHighlight : sbModes;
  const modes = Object.keys(modesMap);
  const colorKey = isHighlight ? 'poi_highlightColor' : key.replace('sbMode_', '') + 'Color';

  const hasColorPicker = segmentTypes[key.replace('sbMode_', '')] || (isHighlight && segmentTypes['poi_highlight']);
  let extraElements = null;

  if (hasColorPicker) {
      const resetButton = createElement('button', { 
          text: 'R', 
          class: 'reset-color-btn', 
          tabIndex: -1,
          events: { 
            click: (evt) => { evt.preventDefault(); evt.stopPropagation(); configWrite(colorKey, configGetDefault(colorKey)); }
          }
      });
      const colorInput = createElement('input', { 
          type: 'color', 
          value: configRead(colorKey), 
          tabIndex: -1,
          events: { 
              click: (evt) => { evt.stopPropagation(); },
              input: (evt) => configWrite(colorKey, evt.target.value) 
          }
      });
      
      configAddChangeListener(colorKey, (evt) => { colorInput.value = evt.detail.newValue; window.sponsorblock?.buildOverlay(); });
      extraElements = createElement('div', { style: { display: 'flex', marginLeft: '10px' } }, resetButton, colorInput);
  }

  return createCycleControl(key, configGetDesc(key), modes, modesMap, extraElements);
}

function createShortcutControl(keyIdentifier) {
  const configKey = `shortcut_key_${keyIdentifier}`;
  const actions = Object.keys(shortcutActions);
  const isColor = COLOR_KEYS.has(keyIdentifier);
  
  const labelText = isColor 
    ? `${keyIdentifier.charAt(0).toUpperCase() + keyIdentifier.slice(1)} Button` 
    : `Key ${keyIdentifier}`;

  return createCycleControl(configKey, labelText, actions, shortcutActions);
}

function createPreviewControl(key) {
  return createCycleControl(key, configGetDesc(key), Object.keys(forcePreviewModes), forcePreviewModes);
}

function createOpacityControl(key) {
  const step = 5;
  const min = 0;
  const max = 100;
  
  const displayValueGetter = () => `${configRead(key)}%`;
  
  const changeValue = (delta) => {
    let val = configRead(key);
    val = Math.min(max, Math.max(min, val + delta));
    configWrite(key, val);
    updateDisplay();
  };

  const { container, updateDisplay } = createGenericControlRow(
      configGetDesc(key), displayValueGetter,
      () => changeValue(-step), () => changeValue(step), () => changeValue(step)
  );
  
  configAddChangeListener(key, updateDisplay);
  updateDisplay();
  return container;
}

// --- Main Options Panel Logic ---

function createOptionsPanel() {
  const elmContainer = createElement('div', { 
    class: isGuestMode() ? 'ytaf-ui-container guest-mode' : 'ytaf-ui-container',
    style: { display: 'none' }, 
    tabIndex: 0,
    events: {
      focus: () => console.info('Options panel focused!'),
      blur: () => console.info('Options panel blurred!')
    }
  });

  let activePage = 0;
  elmContainer.activePage = 0;
  let pageMain, pageSponsor, pageShortcuts, pageUITweaks;

  const tabMenu = createElement('div', { 
    class: 'ytaf-tab-menu',
    events: {
      mouseleave: () => {
        const activeTabBtn = elmContainer.querySelector('.ytaf-tab-btn.active');
        if (activeTabBtn && document.activeElement && document.activeElement.classList.contains('ytaf-tab-btn')) {
            activeTabBtn.focus();
        }
      }
    }
  });
  const tabs = ['Main', 'SponsorBlock', 'Shortcuts', 'UI Tweaks'];
  const tabBtns = tabs.map((name, index) => {
    return createElement('button', {
      class: index === 0 ? 'ytaf-tab-btn active' : 'ytaf-tab-btn',
      text: name,
      tabIndex: 0,
      events: { 
        click: () => setActivePage(index),
        mouseenter: (e) => e.target.focus()
      }
    });
  });
  tabBtns.forEach(btn => tabMenu.appendChild(btn));

	const setActivePage = (pageIndex) => {
	  if (pageIndex === activePage) return; // Don't do work if we are already on this tab
	  const pagesArray = [pageMain, pageSponsor, pageShortcuts, pageUITweaks];
	  const focusSelectors = ['input', '.shortcut-control-row, input', '.shortcut-control-row', '.shortcut-control-row, input'];
	  const hasPopups = [false, true, false, false];

	  // 1. Deactivate old state
	  pagesArray[activePage].style.display = 'none';
	  tabBtns[activePage].classList.remove('active');

	  // 2. Set new state
	  activePage = elmContainer.activePage = pageIndex;
	  pagesArray[activePage].style.display = 'block';
	  tabBtns[activePage].classList.add('active');

	  // 3. Focus management
	  const activeEl = document.activeElement;
	  const isTabFocused = activeEl && activeEl.classList.contains('ytaf-tab-btn');
	  
	  if (!isTabFocused) {
		const focusTarget = pagesArray[activePage].querySelector(focusSelectors[activePage]);
		if (focusTarget) focusTarget.focus();
	  }
	  
	  // 4. Handle SponsorBlock popup state
	  sponsorBlockUI.togglePopup(hasPopups[activePage] && isWatchPage());
	};

  // Keyboard Navigation for the Options Panel
  elmContainer.addEventListener('keydown', (evt) => {
    if (getKeyColor(evt.charCode || evt.keyCode) === 'green') return; // Let global handler handle close if mapped to green (or config_menu logic)

    if (evt.keyCode in ARROW_KEY_CODE) {
      const dir = ARROW_KEY_CODE[evt.keyCode];
      const preFocus = document.activeElement;

      if (dir === 'left' || dir === 'right') {
        // Prevent modifying row from navigating away
        if (preFocus.classList.contains('shortcut-control-row')) return;

        navigate(dir);
        
        // Tab menu wrap-around logic
        if (preFocus === document.activeElement && preFocus.classList.contains('ytaf-tab-btn')) {
			const idx = tabBtns.indexOf(preFocus);
			if (dir === 'right' && idx === tabBtns.length - 1) tabBtns[0].focus();
			else if (dir === 'left' && idx === 0) tabBtns[tabBtns.length - 1].focus();
		}
        
        evt.preventDefault(); evt.stopPropagation(); return;
      } else if (dir === 'up' || dir === 'down') {
        navigate(dir);
        const postFocus = document.activeElement;

        if (dir === 'up' && preFocus !== postFocus) {
            if (preFocus.closest('.ytaf-settings-page') && postFocus.classList.contains('ytaf-tab-btn')) {
                const activeTabBtn = elmContainer.querySelector('.ytaf-tab-btn.active');
                if (activeTabBtn) activeTabBtn.focus();
            }
        }

        if (preFocus === postFocus) {
          const activeTabBtn = tabBtns[activePage];
		  const pagesList = [pageMain, pageSponsor, pageShortcuts, pageUITweaks];
		  const visiblePage = pagesList[activePage]; 
		  let pageFocusables = [];

		  if (visiblePage) {
			  pageFocusables = Array.from(visiblePage.querySelectorAll('input:not([disabled]), .shortcut-control-row, button:not([disabled])'))
				  .filter(el => el.tabIndex !== -1);
		  }
          
          const focusables = [activeTabBtn, ...pageFocusables].filter(Boolean);
          
          if (focusables.length > 0) {
            if (dir === 'up') focusables[focusables.length - 1].focus();
            else if (dir === 'down') focusables[0].focus();
          }
        }
        evt.preventDefault(); evt.stopPropagation(); return;
      }
    } else if (evt.keyCode === REMOTE_KEYS.ENTER.code) {
      if (evt instanceof KeyboardEvent) document.activeElement.click();
    } else if (evt.keyCode === 27) { // Escape
      showOptionsPanel(false);
    }
    evt.preventDefault(); evt.stopPropagation();
  }, true);

  const toggleTheme = (evt) => { 
      evt.preventDefault(); 
      evt.stopPropagation(); 
      configWrite('uiTheme', configRead('uiTheme') === 'blue-force-field' ? 'classic-red' : 'blue-force-field'); 
      const activeTab = elmContainer.querySelector('.ytaf-tab-btn.active');
      if (activeTab) activeTab.focus();
  };
  const createLogo = (src, cls) => createElement('img', { src, alt: 'Logo', class: `ytaf-logo ${cls}`, title: 'Click to switch theme', style: cls !== 'logo-blue' ? { display: 'none' } : {}, events: { click: toggleTheme }});
  
  const elmHeading = createElement('h1', {},
    createElement('span', { text: 'YouTube Extended' }),
    createLogo('https://raw.githubusercontent.com/NicholasBly/youtube-webos/refs/heads/main/src/icons/NB%20Logo-gigapixel.png', 'logo-blue'),
    createLogo('https://raw.githubusercontent.com/NicholasBly/youtube-webos/refs/heads/main/src/icons/NB%20Logo-gigapixel2.png', 'logo-red'),
    createLogo('https://raw.githubusercontent.com/NicholasBly/youtube-webos/refs/heads/main/src/icons/NB%20Logo-gigapixel4.png', 'logo-dark')
  );
  elmContainer.appendChild(elmHeading);
  elmContainer.appendChild(tabMenu);

  // --- Page 1: Main ---
  pageMain = createElement('div', { class: 'ytaf-settings-page', id: 'ytaf-page-main' });
  
  const elAdBlock = createConfigCheckbox('enableAdBlock');
  const elTrackingBlock = createConfigCheckbox('enableTrackingBlock');
  const cosmeticGroup = [elAdBlock, elTrackingBlock];
  let elRemoveGlobalShorts = null, elRemoveTopLiveGames = null, elRemoveMostRelevant = null, elGuestPrompts = null;
  
  elRemoveGlobalShorts = createConfigCheckbox('removeGlobalShorts');
  elRemoveTopLiveGames = createConfigCheckbox('removeTopLiveGames');
  elRemoveMostRelevant = createConfigCheckbox('removeMostRelevant');
  cosmeticGroup.push(elRemoveGlobalShorts, elRemoveTopLiveGames, elRemoveMostRelevant);
  if (isGuestMode()) { elGuestPrompts = createConfigCheckbox('hideGuestSignInPrompts'); cosmeticGroup.push(elGuestPrompts); }

  pageMain.appendChild(createSection('Cosmetic Filtering', cosmeticGroup));

  // Dependency Management
  const setState = (el, enabled) => { if (!el) return; const input = el.querySelector('input'); if (input) { input.disabled = !enabled; el.style.opacity = enabled ? '1' : '0.5'; }};
  const updateDependencyState = () => {
    const isAdBlockOn = configRead('enableAdBlock');
    if (!isAdBlockOn) { [elRemoveGlobalShorts, elRemoveTopLiveGames, elRemoveMostRelevant, elGuestPrompts].forEach(el => { setState(el, false); }); return; }
	[elRemoveGlobalShorts, elRemoveTopLiveGames, elRemoveMostRelevant, elGuestPrompts].forEach(el => { setState(el, true); });
  };
  
  elAdBlock.querySelector('input').addEventListener('change', updateDependencyState);
  if (elRemoveGlobalShorts) {
    elRemoveGlobalShorts.querySelector('input').addEventListener('change', updateDependencyState);
    configAddChangeListener('removeGlobalShorts', updateDependencyState);
  }
  configAddChangeListener('enableAdBlock', updateDependencyState);
  updateDependencyState();

  pageMain.appendChild(createSection('Video Player', [createConfigCheckbox('forceHighResVideo'), createConfigCheckbox('hideEndcards'), createConfigCheckbox('enableReturnYou
