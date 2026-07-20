  const elmHeading = createElement('h1', {},
    createElement('span', { text: 'YouTube Extended' }),
    createLogo('https://raw.githubusercontent.com/NicholasBly/youtube-webos/refs/heads/main/src/icons/NB%20Logo-gigapixel.png', 'logo-blue'),
    createLogo('https://raw.githubusercontent.com/NicholasBly/youtube-webos/refs/heads/main/src/icons/NB%20Logo-gigapixel2.png', 'logo-red'),
    createLogo('https://raw.githubusercontent.com/NicholasBly/youtube-webos/refs/heads/main/src/icons/NB%20Logo-gigapixel4.png', 'logo-dark')
  );
  elmContainer.appendChild(elmHeading);
  elmContainer.appendChild(tabMenu);

  // --- Strona 1: Główna ---
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

  pageMain.appendChild(createSection('Filtrowanie kosmetyczne', cosmeticGroup)); // Zmieniono z 'Cosmetic Filtering'

  // Zarządzanie zależnościami
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

  pageMain.appendChild(createSection('Odtwarzacz wideo', [createConfigCheckbox('forceHighResVideo'), createConfigCheckbox('hideEndcards'), createConfigCheckbox('enableReturnYouTubeDislike')])); // Zmieniono z 'Video Player'
  pageMain.appendChild(createSection('Interfejs', [createConfigCheckbox('enableAutoLogin'), createConfigCheckbox('upgradeThumbnails'), createConfigCheckbox('hideLogo'), createConfigCheckbox('showWatch'), createConfigCheckbox('enableOledCareMode'), createConfigCheckbox('disableNotifications')])); // Zmieniono z 'Interface'
  elmContainer.appendChild(pageMain);

  // --- Strona 2: SponsorBlock ---
  pageSponsor = createElement('div', { class: 'ytaf-settings-page', id: 'ytaf-page-sponsor', style: { display: 'none' }});
  pageSponsor.appendChild(createConfigCheckbox('enableSponsorBlock'));
  
  const elmBlock = createElement('blockquote', {},
    ...['Sponsor', 'Intro', 'Outro', 'Interaction', 'SelfPromo', 'MusicOfftopic', 'Filler', 'Hook', 'Preview'].map(s => createSegmentControl(`sbMode_${s.toLowerCase()}`)),
    createSegmentControl('sbMode_highlight'),
    createConfigCheckbox('enableMutedSegments'),
	createConfigCheckbox('skipSegmentsOnce')
  );
  pageSponsor.appendChild(elmBlock);
  pageSponsor.appendChild(createElement('div', {}, createElement('small', { text: 'Pomijanie segmentów sponsorowanych - https://sponsor.ajay.app' }))); // Zmieniono z 'Sponsor segments skipping'
  elmContainer.appendChild(pageSponsor);

  // --- Strona 3: Skróty (Shortcuts) ---
  pageShortcuts = createElement('div', { class: 'ytaf-settings-page', id: 'ytaf-page-shortcuts', style: { display: 'none' }});
  shortcutKeys.forEach(key => { pageShortcuts.appendChild(createShortcutControl(key)); });
  elmContainer.appendChild(pageShortcuts);
  
  // --- Strona 4: Ulepszenia interfejsu (UI Tweaks) ---
  pageUITweaks = createElement('div', { class: 'ytaf-settings-page', id: 'ytaf-page-ui-tweaks', style: { display: 'none' }});
  
  const playerUITweaks = [
      createOpacityControl('videoShelfOpacity'),
      createElement('div', { text: 'Dostosowuje przezroczystość czarnego tła pod filmami (Wymaga trybu ochrony OLED)', style: { color: '#aaa', fontSize: '18px', padding: '4px 12px 12px' } }), // Zmieniono opis
	  createPreviewControl('forcePreviews'),
	  createElement('div', { text: 'Wymusza włączenie/wyłączenie podglądu miniatur wideo podczas uruchamiania aplikacji', style: { color: '#aaa', fontSize: '18px', padding: '4px 12px 12px' } }), // Zmieniono opis
	  createConfigCheckbox('fixMultilineTitles'),
	  createConfigCheckbox('removeBlackBorders')
  ];

  if (getWebOSVersion() <= 4) {
      playerUITweaks.push(createConfigCheckbox('enableLegacyEmojiFix'));
  }

  pageUITweaks.appendChild(createSection('Ulepszenia interfejsu odtwarzacza', playerUITweaks)); // Zmieniono z 'Player UI Tweaks'
  
  elmContainer.appendChild(pageUITweaks);
