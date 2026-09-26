/* ============================================================================
   READY-SET-BAG! GUIDED TOUR (shared by the admin and teacher dashboards)

   A step-by-step walkthrough that dims the page, spotlights one part of it and
   explains it in a card with BACK / NEXT. Runs once on a user's first visit and
   can be replayed from the profile menu.

     RSBTour.start(steps, { onClose })
     RSBTour.autoStart('teacher:' + teacherId, steps)   // only if not seen yet

   A step: { title, body, target?: selector | () => Element | Element[], before?: () => void }
   Steps without a target (or whose target isn't on screen) show a centred card.
   ============================================================================ */
(function () {
  const SEEN_PREFIX = 'rsb-tour-seen:';
  const PAD = 8;           // space between the spotlight and the element
  const GAP = 14;          // space between the spotlight and the card
  const DOCK_BELOW = 640;  // narrower than this, the card docks to the bottom

  const STYLE = `
  .rsbt-block { position: fixed; inset: 0; z-index: 2500; background: transparent; }
  .rsbt-block.dim { background: rgba(0,0,0,.72); }
  .rsbt-spot {
    position: fixed; z-index: 2501; pointer-events: none; border: 3px solid var(--accent-orange, #FF9A42);
    box-shadow: 0 0 0 9999px rgba(0,0,0,.72); transition: top .25s ease, left .25s ease, width .25s ease, height .25s ease;
  }
  .rsbt-card {
    position: fixed; z-index: 2502; width: 360px; max-width: calc(100vw - 24px);
    background: var(--bg-panel, #333); color: var(--text-primary, #e8e8e8);
    border: 3px solid #4D4D4D; box-shadow: 6px 6px 0 #000; padding: 18px 18px 14px;
    font-family: var(--pixel, 'Poppins', 'Segoe UI', Arial, sans-serif);
    transition: top .25s ease, left .25s ease;
  }
  .rsbt-card:focus { outline: none; }
  .rsbt-card.docked { left: 12px !important; right: 12px; bottom: 12px; top: auto !important; width: auto; max-width: none; }
  .rsbt-step { font-size: 11.5px; font-weight: 700; letter-spacing: 1.5px; color: var(--accent-orange, #FF9A42); margin-bottom: 6px; }
  .rsbt-title { font-size: 16px; font-weight: 700; letter-spacing: .5px; margin: 0 0 8px; line-height: 1.3; }
  .rsbt-body { font-size: 14px; line-height: 1.6; color: var(--text-secondary, #aaa); margin: 0 0 14px; }
  .rsbt-body b { color: var(--text-primary, #e8e8e8); font-weight: 600; }
  .rsbt-dots { display: flex; gap: 5px; margin-bottom: 14px; flex-wrap: wrap; }
  .rsbt-dots i { width: 7px; height: 7px; background: #555; display: block; }
  .rsbt-dots i.on { background: var(--accent-orange, #FF9A42); }
  .rsbt-dots i.past { background: #888; }
  .rsbt-actions { display: flex; align-items: center; gap: 8px; }
  .rsbt-skip { margin-right: auto; background: none; border: 0; color: var(--text-secondary, #aaa); font: inherit; font-size: 12.5px; font-weight: 600; letter-spacing: 1px; cursor: pointer; padding: 8px 4px; min-height: 40px; }
  .rsbt-skip:hover { color: var(--text-primary, #e8e8e8); text-decoration: underline; }
  .rsbt-btn { min-height: 40px; padding: 8px 16px; font: inherit; font-size: 13px; font-weight: 600; letter-spacing: 1px; cursor: pointer; border: 2px solid transparent; }
  .rsbt-btn.back { background: none; border-color: #555; color: var(--text-secondary, #aaa); }
  .rsbt-btn.back:hover { border-color: #888; color: var(--text-primary, #e8e8e8); }
  .rsbt-btn.next { background: var(--card-orange, #E88630); color: #fff; }
  .rsbt-btn.next:hover { filter: brightness(1.08); }
  .rsbt-btn:focus-visible, .rsbt-skip:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .rsbt-spot, .rsbt-card { transition: none; } }
  `;

  function injectStyle() {
    if (document.getElementById('rsbt-style')) return;
    const el = document.createElement('style');
    el.id = 'rsbt-style';
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  // A target is a selector, or a function returning an element or a list of them (the
  // spotlight then covers all of them). Returns the visible ones, or null.
  function resolve(target) {
    if (!target) return null;
    let found = typeof target === 'function' ? target() : document.querySelector(target);
    if (!found) return null;
    found = found.length !== undefined ? Array.from(found) : [found];
    const visible = found.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    return visible.length ? visible : null;
  }

  function rectOf(els) {
    const rs = els.map((el) => el.getBoundingClientRect());
    return {
      top: Math.min(...rs.map((r) => r.top)), bottom: Math.max(...rs.map((r) => r.bottom)),
      left: Math.min(...rs.map((r) => r.left)), right: Math.max(...rs.map((r) => r.right))
    };
  }

  let active = null;

  function start(steps, opts) {
    if (active) active.close(false);
    injectStyle();
    opts = opts || {};
    let index = 0;
    const returnFocus = document.activeElement;

    const block = document.createElement('div');
    block.className = 'rsbt-block';
    const spot = document.createElement('div');
    spot.className = 'rsbt-spot';
    spot.setAttribute('aria-hidden', 'true');
    const card = document.createElement('div');
    card.className = 'rsbt-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'rsbt-title');
    card.setAttribute('aria-describedby', 'rsbt-body');
    card.tabIndex = -1;
    card.innerHTML =
      '<div class="rsbt-step" id="rsbt-step"></div>' +
      '<h2 class="rsbt-title" id="rsbt-title"></h2>' +
      '<p class="rsbt-body" id="rsbt-body"></p>' +
      '<div class="rsbt-dots" aria-hidden="true"></div>' +
      '<div class="rsbt-actions">' +
        '<button type="button" class="rsbt-skip">SKIP TOUR</button>' +
        '<button type="button" class="rsbt-btn back">BACK</button>' +
        '<button type="button" class="rsbt-btn next">NEXT</button>' +
      '</div>';
    document.body.append(block, spot, card);

    const $ = (sel) => card.querySelector(sel);
    const dots = $('.rsbt-dots');
    steps.forEach(() => dots.appendChild(document.createElement('i')));

    let targetEls = null;

    function place() {
      const docked = window.innerWidth < DOCK_BELOW;
      card.classList.toggle('docked', docked);
      const r = targetEls ? rectOf(targetEls) : null;
      const onScreen = r && r.bottom > 0 && r.top < window.innerHeight;

      if (!onScreen) {
        spot.style.display = 'none';
        block.classList.add('dim');
        if (!docked) {
          card.style.left = Math.max(12, (window.innerWidth - card.offsetWidth) / 2) + 'px';
          card.style.top = Math.max(12, (window.innerHeight - card.offsetHeight) / 2) + 'px';
        }
        return;
      }

      block.classList.remove('dim');
      spot.style.display = 'block';
      // Keep the spotlight inside the window when the element is taller than it
      const top = Math.max(4, r.top - PAD);
      const bottom = Math.min(window.innerHeight - 4, r.bottom + PAD);
      const left = Math.max(4, r.left - PAD);
      const right = Math.min(window.innerWidth - 4, r.right + PAD);
      spot.style.top = top + 'px';
      spot.style.left = left + 'px';
      spot.style.width = (right - left) + 'px';
      spot.style.height = (bottom - top) + 'px';
      if (docked) return;

      const cw = card.offsetWidth, ch = card.offsetHeight;
      const vw = window.innerWidth, vh = window.innerHeight;
      const clampX = (x) => Math.min(Math.max(12, x), vw - cw - 12);
      const clampY = (y) => Math.min(Math.max(12, y), vh - ch - 12);
      let x, y;
      if (vh - bottom - GAP >= ch + 12) { x = clampX(left); y = bottom + GAP; }                // below
      else if (top - GAP >= ch + 12) { x = clampX(left); y = top - GAP - ch; }                // above
      else if (vw - right - GAP >= cw + 12) { x = right + GAP; y = clampY(top); }              // right
      else if (left - GAP >= cw + 12) { x = left - GAP - cw; y = clampY(top); }                // left
      else {
        // Too tall to fit beside: spotlight its top part and put the card under that
        const cut = vh - ch - GAP - 12;
        if (cut - top > 80) {
          spot.style.height = (cut - top) + 'px';
          x = clampX(left); y = cut + GAP;
        } else { x = clampX(vw - cw - 24); y = clampY(vh - ch - 24); }
      }
      card.style.left = x + 'px';
      card.style.top = y + 'px';
    }

    function show(i) {
      index = i;
      const step = steps[i];
      if (step.before) { try { step.before(); } catch (e) { console.warn('tour step setup failed', e); } }

      // Let the page switch and lay out before measuring. A timeout rather than
      // requestAnimationFrame, which never fires while the tab isn't being painted.
      clearTimeout(show._t);
      show._t = setTimeout(() => {
        targetEls = resolve(step.target);
        if (targetEls) {
          // Tall elements go to the top so the card can sit under their first part
          const box = rectOf(targetEls);
          const tall = box.bottom - box.top > window.innerHeight * 0.45;
          targetEls[0].scrollIntoView({ block: tall || window.innerWidth < DOCK_BELOW ? 'start' : 'center', behavior: 'auto' });
        }

        $('#rsbt-step').textContent = 'STEP ' + (i + 1) + ' OF ' + steps.length;
        $('#rsbt-title').textContent = step.title;
        $('#rsbt-body').innerHTML = step.body;   // tour text is written in code, never user data
        dots.querySelectorAll('i').forEach((d, n) => { d.className = n === i ? 'on' : n < i ? 'past' : ''; });
        $('.back').style.visibility = i === 0 ? 'hidden' : 'visible';
        $('.next').textContent = i === steps.length - 1 ? 'FINISH' : 'NEXT';
        $('.rsbt-skip').hidden = i === steps.length - 1;
        place();
        card.focus({ preventScroll: true });
      }, 40);
    }

    function close(finished) {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('keydown', onKey, true);
      block.remove(); spot.remove(); card.remove();
      active = null;
      if (opts.onClose) { try { opts.onClose(finished); } catch (e) {} }
      if (returnFocus && returnFocus.focus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); show(index - 1); }
      else if (e.key === 'Tab') {
        const f = [...card.querySelectorAll('button')].filter((b) => !b.hidden && b.style.visibility !== 'hidden');
        const n = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(n + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    }
    const next = () => (index < steps.length - 1 ? show(index + 1) : close(true));

    $('.next').addEventListener('click', next);
    $('.back').addEventListener('click', () => index > 0 && show(index - 1));
    $('.rsbt-skip').addEventListener('click', () => close(false));
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('keydown', onKey, true);

    active = { close };
    show(0);
  }

  window.RSBTour = {
    start,
    // Runs the tour once per user; the key should name the role and the account
    autoStart(key, steps, opts) {
      if (!key || store.get(SEEN_PREFIX + key)) return false;
      store.set(SEEN_PREFIX + key, new Date().toISOString());
      start(steps, opts);
      return true;
    },
    isRunning: () => !!active
  };
})();
