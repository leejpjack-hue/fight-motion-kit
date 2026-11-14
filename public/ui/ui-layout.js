/* Responsive workspace shell, progressive disclosure drawers, and mobile bottom-tab ergonomics. */
(() => {
  'use strict';
  const S = window.HMStudio;
  if (!S) return;
  const $ = id => document.getElementById(id);

  const MOBILE_MQ = window.matchMedia('(max-width: 900px)');
  const NARROW_MQ = window.matchMedia('(max-width: 600px)');
  let autoMobileFocus = false;
  let autoCollapsedAb = false;
  let userToggledAbOnMobile = false;

  const drawers = new Map();

  function isMobile() {
    return !!(MOBILE_MQ && MOBILE_MQ.matches);
  }

  function registerDrawer(id, container, toggleBtn, opts = {}) {
    if (!container || !toggleBtn) return;
    const entry = {
      id,
      container,
      toggleBtn,
      mobileDefaultOpen: !!opts.mobileDefaultOpen,
      desktopDefaultOpen: opts.desktopDefaultOpen !== undefined ? !!opts.desktopDefaultOpen : true,
      userSetMobile: null,
      userSetDesktop: null,
      labels: opts.labels || { open: 'Collapse', closed: 'Expand' }
    };
    drawers.set(id, entry);
    toggleBtn.addEventListener('click', ev => {
      ev.stopPropagation();
      const currentlyCollapsed = container.dataset.uiCollapsed === 'true';
      const nextOpen = currentlyCollapsed;
      if (isMobile()) entry.userSetMobile = nextOpen;
      else entry.userSetDesktop = nextOpen;
      applyDrawerState(entry, nextOpen);
    });
  }

  function applyDrawerState(entry, open) {
    entry.container.dataset.uiCollapsed = open ? 'false' : 'true';
    entry.toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    entry.toggleBtn.textContent = open ? entry.labels.open : entry.labels.closed;
  }

  function syncAllDrawersForViewport() {
    const mobile = isMobile();
    for (const entry of drawers.values()) {
      if (entry.id === 'exportBake') {
        const narrow = !!(NARROW_MQ && NARROW_MQ.matches);
        const open = narrow ? (entry.userSetMobile ?? false) : (entry.userSetDesktop ?? true);
        applyDrawerState(entry, open);
        continue;
      }
      const open = mobile
        ? (entry.userSetMobile ?? entry.mobileDefaultOpen)
        : (entry.userSetDesktop ?? entry.desktopDefaultOpen);
      applyDrawerState(entry, open);
    }
  }

  function makeToggleButton(id, controlsId) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = id;
    btn.className = 'ui-drawer-toggle';
    if (controlsId) btn.setAttribute('aria-controls', controlsId);
    btn.setAttribute('aria-expanded', 'true');
    btn.textContent = 'Collapse';
    return btn;
  }

  function mountGroupDrawer(id, sectionEl, headSelector, opts = {}) {
    if (!sectionEl) return;
    const head = headSelector ? sectionEl.querySelector(headSelector) : sectionEl.firstElementChild;
    if (!head) return;
    const btn = makeToggleButton('drawerToggle_' + id, sectionEl.id || '');
    head.appendChild(btn);
    head.classList.add('ui-collapsible-head');
    head.addEventListener('click', ev => {
      if (ev.target.closest('button, input, select, a, label')) return;
      btn.click();
    });
    registerDrawer(id, sectionEl, btn, opts);
  }

  function mountDrawers() {
    // Move dynamically injected #cameraGrammar into #camAdvancedBody so it collapses with advanced camera tools
    const camGrammar = $('cameraGrammar');
    const camAdvBody = $('camAdvancedBody');
    if (camGrammar && camAdvBody && camGrammar.parentElement !== camAdvBody) {
      camAdvBody.appendChild(camGrammar);
    }

    // 1. Starter sample packs
    registerDrawer('starterSamples', $('starterSamplesDrawer'), $('starterSamplesToggle'), {
      mobileDefaultOpen: false,
      desktopDefaultOpen: true
    });

    // 2. Scene layers in Media
    mountGroupDrawer('backgroundScene', document.querySelector('.background-panel'), '.background-heading', {
      mobileDefaultOpen: false,
      desktopDefaultOpen: true
    });
    mountGroupDrawer('foregroundProps', $('foregroundPanel'), '#fgStickyTop .background-heading', {
      mobileDefaultOpen: false,
      desktopDefaultOpen: true
    });

    // 3. Clip inspector advanced drawers
    registerDrawer('camAdvanced', $('camAdvancedDrawer'), $('camAdvancedToggle'), {
      mobileDefaultOpen: false,
      desktopDefaultOpen: true
    });
    mountGroupDrawer('rhythmTiming', $('rhythmTimingGroup'), '.group-title', {
      mobileDefaultOpen: false,
      desktopDefaultOpen: true
    });
    mountGroupDrawer('cutTransition', $('cutTransitionGroup'), '.group-title', {
      mobileDefaultOpen: false,
      desktopDefaultOpen: true
    });
    mountGroupDrawer('beatBlocks', $('beatBlockGroup'), '.group-title', {
      mobileDefaultOpen: false,
      desktopDefaultOpen: true
    });
    mountGroupDrawer('catalogSearch', $('catalogQuery'), '.group-title', {
      mobileDefaultOpen: false,
      desktopDefaultOpen: true
    });

    // 4. Pipeline & QA secondary panels (Cantonese board & Notify preview start compact on both viewports)
    const openBoardHash = location.hash === '#hmBoardSurface';
    mountGroupDrawer('hmBoard', $('hmBoardSurface'), '.hm-board-heading', {
      mobileDefaultOpen: openBoardHash,
      desktopDefaultOpen: openBoardHash
    });
    mountGroupDrawer('pf53Notify', $('pf53NotifyPanel'), '.pf53-notify-heading', {
      mobileDefaultOpen: false,
      desktopDefaultOpen: false
    });

    // 5. Export modal Bake & QA section (compact drawer on narrow phones unless Bake QA opened directly)
    const exportBake = document.querySelector('#exportDialog .export-bake');
    if (exportBake) {
      const head = document.createElement('div');
      head.className = 'export-bake-drawer-head';
      head.innerHTML = '<span class="eyebrow">BAKE SETTINGS &amp; QA</span>';
      const btn = makeToggleButton('exportBakeToggle', 'bakeQaDock');
      head.appendChild(btn);
      exportBake.insertBefore(head, exportBake.firstChild);
      registerDrawer('exportBake', exportBake, btn, {
        mobileDefaultOpen: false,
        desktopDefaultOpen: true,
        labels: { open: 'Hide QA ▴', closed: 'Preset · Matrix · QA ▾' }
      });
    }
  }

  function mountFilterBars() {
    // Clip Inspector Quick Filter Bar
    const inspector = document.querySelector('aside.inspector');
    const inspectorHeading = inspector?.querySelector('.panel-heading');
    if (inspector && inspectorHeading) {
      const bar = document.createElement('div');
      bar.id = 'inspectorFilterBar';
      bar.className = 'section-filter-bar';
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', 'Clip settings view');
      bar.innerHTML = [
        ['all', 'All'],
        ['core', 'Quick tweak'],
        ['advanced', 'Rhythm & cuts'],
        ['catalog', 'Catalog']
      ].map(([val, label], idx) =>
        `<button type="button" data-filter="${val}" aria-pressed="${idx === 0 ? 'true' : 'false'}">${label}</button>`
      ).join('');
      inspectorHeading.insertAdjacentElement('afterend', bar);
      inspector.dataset.sectionFilter = 'all';
      bar.addEventListener('click', ev => {
        const btn = ev.target.closest('button[data-filter]');
        if (!btn) return;
        const val = btn.dataset.filter;
        inspector.dataset.sectionFilter = val;
        bar.querySelectorAll('button[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        if (val === 'advanced') {
          ['rhythmTiming', 'cutTransition', 'beatBlocks'].forEach(k => {
            const d = drawers.get(k);
            if (d) applyDrawerState(d, true);
          });
        } else if (val === 'catalog') {
          const d = drawers.get('catalogSearch');
          if (d) applyDrawerState(d, true);
        }
      });
    }

    // Media Library Quick Filter Bar
    const library = document.querySelector('aside.library');
    const libraryHeading = library?.querySelector('.panel-heading');
    if (library && libraryHeading) {
      const bar = document.createElement('div');
      bar.id = 'libraryFilterBar';
      bar.className = 'section-filter-bar';
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', 'Media library view');
      bar.innerHTML = [
        ['all', 'All'],
        ['plates', 'Plates'],
        ['layers', 'BG / FG layers'],
        ['starters', 'Samples']
      ].map(([val, label], idx) =>
        `<button type="button" data-filter="${val}" aria-pressed="${idx === 0 ? 'true' : 'false'}">${label}</button>`
      ).join('');
      libraryHeading.insertAdjacentElement('afterend', bar);
      library.dataset.sectionFilter = 'all';
      bar.addEventListener('click', ev => {
        const btn = ev.target.closest('button[data-filter]');
        if (!btn) return;
        const val = btn.dataset.filter;
        library.dataset.sectionFilter = val;
        bar.querySelectorAll('button[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        if (val === 'layers') {
          ['backgroundScene', 'foregroundProps'].forEach(k => {
            const d = drawers.get(k);
            if (d) applyDrawerState(d, true);
          });
        } else if (val === 'starters') {
          const d = drawers.get('starterSamples');
          if (d) applyDrawerState(d, true);
        }
      });
    }

    // Desktop Timeline Sub-View Pill Bar
    const timelinePanel = document.querySelector('.timeline-panel');
    const timelineHeading = timelinePanel?.querySelector('.timeline-heading');
    if (timelinePanel && timelineHeading) {
      const editBeatBtn = document.createElement('button');
      editBeatBtn.type = 'button';
      editBeatBtn.id = 'mobileEditBeatBtn';
      editBeatBtn.className = 'mobile-edit-beat-btn';
      editBeatBtn.textContent = '✎ Edit beat';
      editBeatBtn.addEventListener('click', () => {
        if ($('shellFocusClip')) {
          $('shellFocusClip').checked = true;
          $('shellFocusClip').dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      timelinePanel.querySelector('.timeline-actions')?.prepend(editBeatBtn);

      const bar = document.createElement('div');
      bar.id = 'timelineFilterBar';
      bar.className = 'section-filter-bar timeline-filter-bar';
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', 'Timeline and QA view');
      bar.innerHTML = [
        ['all', 'All'],
        ['beats', 'Beats only'],
        ['peeks', 'Frame peeks'],
        ['gate', 'Story & gate'],
        ['json', 'Lint & JSON']
      ].map(([val, label], idx) =>
        `<button type="button" data-filter="${val}" aria-pressed="${idx === 0 ? 'true' : 'false'}">${label}</button>`
      ).join('');
      timelineHeading.insertAdjacentElement('afterend', bar);
      timelinePanel.dataset.sectionFilter = 'all';
      bar.addEventListener('click', ev => {
        const btn = ev.target.closest('button[data-filter]');
        if (!btn) return;
        const val = btn.dataset.filter;
        timelinePanel.dataset.sectionFilter = val;
        bar.querySelectorAll('button[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        if (val === 'json') {
          const jsonPanel = $('timelineJsonPanel');
          if (jsonPanel) {
            jsonPanel.open = true;
            S.renderTimelineJsonPanel?.();
          }
        }
      });
    }
  }

  function mountMobileStageScrub() {
    const stageWell = document.querySelector('main.stage-well');
    const scrub = $('scrub');
    const transport = stageWell?.querySelector('.transport');
    if (!stageWell || !scrub || !transport) return;

    const row = document.createElement('div');
    row.className = 'mobile-stage-scrub-row';
    const mobileScrub = document.createElement('input');
    mobileScrub.type = 'range';
    mobileScrub.id = 'mobileStageScrub';
    mobileScrub.className = 'mobile-stage-scrub';
    mobileScrub.min = scrub.min || '0';
    mobileScrub.max = scrub.max || '5';
    mobileScrub.step = scrub.step || '0.0001';
    mobileScrub.value = scrub.value || '0';
    mobileScrub.setAttribute('aria-label', 'Quick scrub preview');
    row.appendChild(mobileScrub);
    transport.insertAdjacentElement('afterend', row);

    const syncFromMain = () => {
      mobileScrub.min = scrub.min || '0';
      mobileScrub.max = String(S.duration || scrub.max || 5);
      if (document.activeElement !== mobileScrub) {
        mobileScrub.value = String(S.time ?? scrub.value ?? 0);
      }
    };

    mobileScrub.addEventListener('input', () => {
      scrub.value = mobileScrub.value;
      scrub.dispatchEvent(new Event('input', { bubbles: true }));
    });
    scrub.addEventListener('input', syncFromMain);
    window.addEventListener('hm:projectchange', syncFromMain);
    const tc = $('timecode');
    if (tc && typeof MutationObserver !== 'undefined') {
      new MutationObserver(syncFromMain).observe(tc, { childList: true, subtree: true, characterData: true });
    }
  }

  function syncLintAutoDisclosure() {
    const lintPanel = $('showLintPanel');
    if (!lintPanel) return;
    const apply = () => {
      const count = Number(lintPanel.dataset.count || 0);
      if (count > 0) lintPanel.open = true;
    };
    apply();
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(apply).observe(lintPanel, { attributes: true, attributeFilter: ['data-count'] });
    }
  }

  function wireCrossPanelShortcuts() {
    $('abToggle')?.addEventListener('click', () => {
      if (isMobile()) userToggledAbOnMobile = true;
    });

    // On mobile, Replace Plate switches straight to Media tab so picker is visible immediately
    $('replaceImage')?.addEventListener('click', () => {
      if (!isMobile()) return;
      const inspector = document.querySelector('.inspector');
      if (inspector?.dataset.replacing === 'true' && $('shellFocusMedia')) {
        $('shellFocusMedia').checked = true;
      }
    });

    // On mobile, opening Timeline JSON / Story / Frame Peek Strip switches to QA tab
    const switchToQaOnMobile = () => {
      if (isMobile() && $('shellFocusQa')) {
        $('shellFocusQa').checked = true;
      }
    };
    $('timelineJsonOpen')?.addEventListener('click', switchToQaOnMobile);
    $('pf09OpenStory')?.addEventListener('click', switchToQaOnMobile);
    $('bakeQaShowStrip')?.addEventListener('click', switchToQaOnMobile);

    // Opening Export resets scrollTop so primary export actions stay in view
    $('exportOpen')?.addEventListener('click', () => {
      const dlg = $('exportDialog');
      if (dlg) dlg.scrollTop = 0;
    });

    // Opening Bake QA explicitly expands the Bake QA drawer inside Export dialog
    $('openBakeQa')?.addEventListener('click', () => {
      const d = drawers.get('exportBake');
      if (d) {
        d.userSetMobile = true;
        applyDrawerState(d, true);
      }
    });

    // Track manual focus radio changes
    document.querySelectorAll('.shell-focus-input').forEach(input => {
      input.addEventListener('change', () => {
        if (input.checked) autoMobileFocus = false;
      });
    });
  }

  function syncViewportMode() {
    const mobile = isMobile();
    document.body.dataset.viewport = mobile ? 'mobile' : 'desktop';

    if (mobile) {
      if ($('shellFocusDeck')?.checked) {
        const active = document.activeElement;
        const target = active?.closest?.('.inspector')
          ? $('shellFocusClip')
          : active?.closest?.('.library')
            ? $('shellFocusMedia')
            : $('shellFocusTimeline');
        if (target) {
          target.checked = true;
          autoMobileFocus = true;
        }
      }
      if (!userToggledAbOnMobile && S.abEnabled) {
        S.toggleAb?.();
        autoCollapsedAb = true;
      }
    } else {
      if (autoMobileFocus && $('shellFocusDeck')) {
        $('shellFocusDeck').checked = true;
        autoMobileFocus = false;
      }
      if (autoCollapsedAb && !S.abEnabled) {
        S.toggleAb?.();
        autoCollapsedAb = false;
      }
    }
    syncAllDrawersForViewport();
  }

  mountDrawers();
  mountFilterBars();
  mountMobileStageScrub();
  syncLintAutoDisclosure();
  wireCrossPanelShortcuts();
  syncViewportMode();

  if (MOBILE_MQ?.addEventListener) {
    MOBILE_MQ.addEventListener('change', syncViewportMode);
    NARROW_MQ?.addEventListener('change', syncAllDrawersForViewport);
  }

  window.HMUiLayout = {
    isMobile,
    syncViewportMode,
    setDrawer(id, open) {
      const entry = drawers.get(id);
      if (!entry) return false;
      if (isMobile()) entry.userSetMobile = !!open;
      else entry.userSetDesktop = !!open;
      applyDrawerState(entry, !!open);
      return true;
    },
    getDrawerState(id) {
      const entry = drawers.get(id);
      return entry ? entry.container.dataset.uiCollapsed !== 'true' : null;
    }
  };
})();
