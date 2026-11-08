/* HM-PF-03: human visual review before a standalone costume pack enters HM. */
(function (global) {
  'use strict';
  const CHECKS = Object.freeze({
    identity: 'Face, hair, and silhouette match the locked references.',
    costume: 'Clothes, colors, footwear, and accessories match the locked costume.',
    geometry: 'Body proportions, hands, and limbs have no visible generation drift.',
    sides: 'L/R cast identities and costume IDs are assigned correctly.',
  });
  function refs(value) { return Array.isArray(value) ? value : []; }
  function image(ref, pack, localFiles) {
    const src = typeof ref === 'string' ? ref : ref?.src;
    if (typeof src !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(src) || src.includes('..') || src.startsWith('/')) {
      throw Error('Review requires safe local image paths, not provider URLs.');
    }
    const value = localFiles?.[src] || localFiles?.[src.split('/').pop()] || pack.assets?.[src];
    if (typeof value !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(value)) {
      throw Error('Missing local review image: ' + src + '. Select the JSON, sheets, and locked reference images together.');
    }
    return { src, label: ref.label || src, data: value };
  }
  function plan(pack, localFiles = {}) {
    if (pack?.kind !== 'costume_lock' || pack.version !== 1) throw Error('Review requires a version 1 costume_lock pack.');
    const cast = {};
    for (const side of ['L', 'R']) {
      const ch = pack.cast?.[side];
      if (!ch?.name?.trim() || !ch.costume_id?.trim()) throw Error('Missing ' + side + ' cast name or costume ID.');
      if (!refs(ch.sheets).length) throw Error('Missing ' + side + ' costume sheet.');
      if (!refs(ch.lock_refs).length) throw Error('Missing ' + side + ' lock_refs. Supply approved identity/costume references and re-import; no silent acceptance.');
      cast[side] = { name: ch.name, costume_id: ch.costume_id,
        sheets: ch.sheets.map(ref => image(ref, pack, localFiles)),
        lock_refs: ch.lock_refs.map(ref => image(ref, pack, localFiles)) };
      if (cast[side].sheets.some(sheet => cast[side].lock_refs.some(ref => ref.data === sheet.data))) {
        throw Error(side + ': a candidate sheet cannot serve as its own locked reference. Select the earlier approved reference images.');
      }
    }
    return { pack_id: pack.pack_id, cast };
  }
  async function receipt(reviewPlan, checked, operator) {
    if (!operator?.trim()) throw Error('Enter the reviewer name.');
    reviewPlan = JSON.parse(JSON.stringify(reviewPlan));
    checked = JSON.parse(JSON.stringify(checked || {}));
    operator = operator.trim();
    for (const side of ['L', 'R']) for (const key of Object.keys(CHECKS)) {
      if (checked?.[side]?.[key] !== true) throw Error(side + ': review pending — ' + CHECKS[key]);
    }
    const bytes = new TextEncoder().encode(JSON.stringify(reviewPlan));
    const digest = [...new Uint8Array(await global.crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    return { kind: 'hm-costume-drift-review', version: 1, pack_id: reviewPlan.pack_id,
      decision: 'Approve', reviewer: operator, reviewed_at: new Date().toISOString(),
      sha256: digest, checks: JSON.parse(JSON.stringify(checked)),
      cast: Object.fromEntries(Object.entries(reviewPlan.cast).map(([side, ch]) => [side, {
        costume_id: ch.costume_id, sheets: ch.sheets.map(x => x.src), lock_refs: ch.lock_refs.map(x => x.src),
      }])) };
  }
  function attach(project, reviewPlan, report) {
    project.show.costume_lock.drift_review = report;
    project.show.costume_lock.import_review = 'approved';
    for (const ch of Object.values(reviewPlan.cast)) for (const ref of ch.lock_refs) project.assets[ref.src] = ref.data;
    return project;
  }
  async function review(pack, localFiles) {
    const dialog = document.createElement('dialog');
    dialog.id = 'costumeDriftDialog';
    dialog.setAttribute('aria-label', 'Costume sheet drift review');
    dialog.className = 'costume-review-dialog';
    dialog.innerHTML = '<h2>Review costume sheets before import</h2><p>Compare each candidate sheet with its approved lock references. This is a human visual check, not automatic image recognition.</p><div class="review-cast"></div><label>Reviewer name <input class="reviewer" autocomplete="name"></label><label>Reject / rework reason <textarea class="reject-reason" rows="2"></textarea></label><p class="review-status" role="status" aria-live="polite"></p><div class="review-actions"><button type="button" class="reject">Reject / cancel</button><button type="button" class="approve" disabled>Approve sheets and import</button></div><p>For drift: re-run the operator skill outside HM, then select the replacement PNG + JSON pack again. Sprite Forge and provider login are absent from HM.</p>';
    document.body.append(dialog);
    const status = dialog.querySelector('.review-status');
    const approve = dialog.querySelector('.approve');
    const reviewer = dialog.querySelector('.reviewer');
    const reason = dialog.querySelector('.reject-reason');
    let reviewPlan, imagesReady = false, submitting = false;
    const checked = { L: {}, R: {} };
    const refresh = () => {
      const missing = ['L', 'R'].flatMap(side => Object.keys(CHECKS).filter(key => checked[side][key] !== true).map(key => side + ': ' + CHECKS[key]));
      approve.disabled = submitting || !imagesReady || !reviewer.value.trim() || !!reason.value.trim() || missing.length > 0;
      if (imagesReady && !submitting) status.textContent = reason.value.trim()
        ? 'Import blocked: ' + reason.value.trim()
        : missing.length ? 'Review pending — ' + missing[0]
        : !reviewer.value.trim() ? 'Review pending: reviewer name required.'
        : 'Checks complete. Choose Approve sheets and import to confirm this review.';
    };
    reviewer.addEventListener('input', refresh);
    reason.addEventListener('input', refresh);
    const pending = new Promise((resolve, reject) => {
      const rejectReview = () => {
        const message = reason.value.trim() || status.textContent || 'Operator cancelled sheet review.';
        dialog.close(); reject(Error('Costume pack rejected: ' + message));
      };
      dialog.addEventListener('cancel', e => { e.preventDefault(); rejectReview(); });
      dialog.querySelector('.reject').addEventListener('click', rejectReview);
      approve.addEventListener('click', async () => {
        if (submitting) return;
        submitting = true; approve.disabled = true;
        try {
          if (!imagesReady || reason.value.trim()) throw Error('Review is incomplete or has a rejection reason.');
          const report = await receipt(reviewPlan, checked, reviewer.value);
          dialog.close(); resolve({ plan: reviewPlan, report });
        } catch (e) { submitting = false; status.textContent = e.message; refresh(); }
      });
    });
    // A user can reject while an image is still decoding.
    pending.catch(() => {});
    dialog.showModal();
    try {
      reviewPlan = plan(pack, localFiles);
      const decoding = [];
      for (const [side, ch] of Object.entries(reviewPlan.cast)) {
        const group = document.createElement('fieldset');
        const legend = document.createElement('legend');
        legend.textContent = side + ' · ' + ch.name + ' · ' + ch.costume_id;
        group.append(legend);
        for (const [kind, label] of [['lock_refs', 'Locked references'], ['sheets', 'Candidate sheets']]) {
          const heading = document.createElement('h3'); heading.textContent = label; group.append(heading);
          const strip = document.createElement('div'); strip.className = 'review-images'; group.append(strip);
          for (const ref of ch[kind]) {
            const figure = document.createElement('figure');
            const img = document.createElement('img'); img.src = ref.data; img.alt = side + ' ' + label + ': ' + ref.label;
            const inspect = document.createElement('button'); inspect.type = 'button'; inspect.className = 'inspect-review-image';
            inspect.setAttribute('aria-label', 'Inspect full-size ' + img.alt);
            inspect.append(img);
            inspect.addEventListener('click', () => {
              const zoom = document.createElement('dialog'); zoom.className = 'costume-review-image';
              zoom.setAttribute('aria-label', 'Full-size ' + img.alt);
              const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close image';
              const large = img.cloneNode();
              close.addEventListener('click', () => zoom.close());
              zoom.addEventListener('close', () => zoom.remove(), { once: true });
              zoom.append(close, large); document.body.append(zoom); zoom.showModal();
            });
            const caption = document.createElement('figcaption'); caption.textContent = ref.label;
            figure.append(inspect, caption); strip.append(figure); decoding.push(img.decode());
          }
        }
        for (const [key, text] of Object.entries(CHECKS)) {
          const label = document.createElement('label');
          const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.dataset.side = side; checkbox.dataset.check = key;
          checkbox.addEventListener('change', () => { checked[side][key] = checkbox.checked; refresh(); });
          label.append(checkbox, document.createTextNode(text)); group.append(label);
        }
        dialog.querySelector('.review-cast').append(group);
      }
      await Promise.all(decoding);
      imagesReady = true;
      status.textContent = 'Review pending. Import stays blocked until every check passes for both cast members.';
      refresh();
    } catch (e) { status.textContent = 'Import blocked: ' + e.message; }
    try { return await pending; } finally { dialog.remove(); }
  }
  global.HMCostumeDrift = Object.freeze({ CHECKS, plan, receipt, attach, review });
})(typeof globalThis !== 'undefined' ? globalThis : this);
