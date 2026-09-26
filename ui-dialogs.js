/* ============================================================================
   READY-SET-BAG! IN-PAGE DIALOGS (shared by the admin and teacher dashboards)

   Replaces the browser's alert / confirm / prompt boxes, which show the site's
   address as their title, look different on every browser and freeze the page
   (timers included) while open. These match the dashboards and return Promises:

     await RSBDialog.alert('Your session expired.', { title: 'SIGNED OUT' });
     if (await RSBDialog.confirm('Delete Ana?', { okText: 'DELETE', danger: true })) ...
     const name = await RSBDialog.prompt('New section name', { placeholder: 'G6-Sampaguita' });
     // name is null when cancelled

   Escape or the backdrop cancels, Enter confirms, and focus stays inside the box.

   Also the dashboards' notifications, top centre under the top bar:
     RSBDialog.toast('Teacher created.');          // or 'error' / 'info' as a 2nd argument
   ============================================================================ */
(function () {
  const STYLE = `
  .rsbd-overlay {
    position: fixed; inset: 0; z-index: 3000; display: flex; align-items: center; justify-content: center;
    padding: 16px; background: rgba(0,0,0,.72); opacity: 0; transition: opacity .15s ease;
  }
  .rsbd-overlay.show { opacity: 1; }
  .rsbd-box {
    width: 440px; max-width: 100%; max-height: calc(100vh - 32px); overflow: auto;
    background: var(--bg-panel, #333); color: var(--text-primary, #e8e8e8);
    border: 3px solid #4D4D4D; box-shadow: 6px 6px 0 #000; padding: 24px;
    font-family: var(--pixel, 'Poppins', 'Segoe UI', Arial, sans-serif);
    transform: translateY(8px); transition: transform .15s ease;
  }
  .rsbd-overlay.show .rsbd-box { transform: none; }
  .rsbd-box.danger { border-color: var(--btn-delete, #D74040); }
  .rsbd-title { font-weight: 700; font-size: 15px; letter-spacing: 1px; margin: 0 0 10px; display: flex; align-items: center; gap: 8px; }
  .rsbd-title .rsbd-icon { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; flex: none; color: #fff; background: var(--card-blue, #3C7CDD); }
  .rsbd-box.danger .rsbd-icon { background: var(--btn-delete, #D74040); }
  .rsbd-box.warn .rsbd-icon { background: var(--card-orange, #E88630); }
  .rsbd-msg { font-size: 14px; line-height: 1.55; color: var(--text-secondary, #aaa); margin: 0 0 20px; white-space: pre-line; overflow-wrap: anywhere; }
  .rsbd-msg strong { color: var(--text-primary, #e8e8e8); }
  .rsbd-input {
    width: 100%; margin: -6px 0 20px; padding: 10px 12px; font: inherit; font-size: 16px;
    background: var(--bg-panel2, #222); color: var(--text-primary, #e8e8e8); border: 1px solid #444; outline: none;
  }
  .rsbd-input:focus { border-color: var(--card-blue, #3C7CDD); }
  .rsbd-actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
  .rsbd-btn {
    min-height: 40px; padding: 10px 18px; font: inherit; font-weight: 600; font-size: 13px; letter-spacing: 1px;
    cursor: pointer; border: 2px solid transparent;
  }
  .rsbd-btn.cancel { background: none; border-color: #555; color: var(--text-secondary, #aaa); }
  .rsbd-btn.cancel:hover { border-color: #888; color: var(--text-primary, #e8e8e8); }
  .rsbd-btn.ok { background: var(--card-green, #97A329); color: #fff; }
  .rsbd-btn.ok.danger { background: var(--btn-delete, #D74040); }
  .rsbd-btn.ok:hover { filter: brightness(1.08); }
  .rsbd-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  @media (max-width: 480px) {
    .rsbd-box { padding: 18px; }
    .rsbd-actions { flex-direction: column-reverse; }
    .rsbd-btn { width: 100%; }
  }
  @media (prefers-reduced-motion: reduce) { .rsbd-overlay, .rsbd-box { transition: none; } }

  /* ---- notifications: top centre, just under the top bar ---- */
  .rsbn-stack {
    position: fixed; left: 50%; transform: translateX(-50%); z-index: 2900; width: 460px; max-width: calc(100vw - 24px);
    display: flex; flex-direction: column; gap: 8px; pointer-events: none;
  }
  .rsbn {
    pointer-events: auto; display: flex; align-items: flex-start; gap: 12px; padding: 12px 10px 12px 14px;
    background: var(--bg-panel2, #222); color: var(--text-primary, #e8e8e8); border: 1px solid #444;
    border-left: 4px solid var(--card-green, #97A329); box-shadow: 4px 4px 0 #000;
    font-family: var(--pixel, 'Poppins', 'Segoe UI', Arial, sans-serif); font-size: 14px; line-height: 1.45;
    opacity: 0; transform: translateY(-10px); transition: opacity .18s ease, transform .18s ease;
    position: relative; overflow: hidden;
  }
  .rsbn.show { opacity: 1; transform: none; }
  .rsbn-icon {
    flex: none; width: 22px; height: 22px; display: grid; place-items: center; margin-top: 1px;
    font-size: 13px; font-weight: 700; color: #fff; background: var(--card-green, #97A329);
  }
  .rsbn-msg { flex: 1; min-width: 0; overflow-wrap: anywhere; padding-top: 1px; }
  .rsbn-close {
    flex: none; width: 28px; height: 28px; margin: -3px 0 -3px 2px; border: 0; background: none; cursor: pointer;
    color: var(--text-secondary, #aaa); font-size: 18px; line-height: 1;
  }
  .rsbn-close:hover { color: var(--text-primary, #e8e8e8); }
  .rsbn-close:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
  .rsbn-timer { position: absolute; left: 0; bottom: 0; height: 2px; width: 100%; background: currentColor; opacity: .35; transform-origin: left; }
  .rsbn.error { border-left-color: var(--btn-delete, #D74040); }
  .rsbn.error .rsbn-icon { background: var(--btn-delete, #D74040); }
  .rsbn.info { border-left-color: var(--card-blue, #3C7CDD); }
  .rsbn.info .rsbn-icon { background: var(--card-blue, #3C7CDD); }
  @media (prefers-reduced-motion: reduce) { .rsbn { transition: none; } }
  `;

  function injectStyle() {
    if (document.getElementById('rsbd-style')) return;
    const el = document.createElement('style');
    el.id = 'rsbd-style';
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  // One dialog at a time; later calls wait their turn
  let queue = Promise.resolve();

  function open(kind, message, opts) {
    opts = opts || {};
    const run = () => new Promise((resolve) => {
      injectStyle();
      const returnFocus = document.activeElement;
      const tone = opts.danger ? 'danger' : (opts.tone || (kind === 'alert' ? 'info' : 'info'));

      const overlay = document.createElement('div');
      overlay.className = 'rsbd-overlay';
      const box = document.createElement('div');
      box.className = 'rsbd-box ' + tone;
      box.setAttribute('role', kind === 'alert' ? 'alertdialog' : 'dialog');
      box.setAttribute('aria-modal', 'true');
      const titleId = 'rsbd-t-' + Date.now();
      const msgId = titleId + '-m';
      box.setAttribute('aria-labelledby', titleId);
      box.setAttribute('aria-describedby', msgId);

      const title = document.createElement('h2');
      title.className = 'rsbd-title';
      title.id = titleId;
      const icon = document.createElement('span');
      icon.className = 'rsbd-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = tone === 'danger' || tone === 'warn' ? '!' : (kind === 'confirm' ? '?' : 'i');
      title.append(icon, document.createTextNode(opts.title || (kind === 'confirm' ? 'ARE YOU SURE?' : kind === 'prompt' ? 'ENTER A VALUE' : 'NOTICE')));

      const msg = document.createElement('p');
      msg.className = 'rsbd-msg';
      msg.id = msgId;
      msg.textContent = message || '';

      let input = null;
      if (kind === 'prompt') {
        input = document.createElement('input');
        input.className = 'rsbd-input';
        input.type = 'text';
        input.value = opts.value || '';
        input.placeholder = opts.placeholder || '';
        input.setAttribute('aria-labelledby', msgId);
        if (opts.maxLength) input.maxLength = opts.maxLength;
      }

      const actions = document.createElement('div');
      actions.className = 'rsbd-actions';
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'rsbd-btn ok' + (opts.danger ? ' danger' : '');
      ok.textContent = opts.okText || (kind === 'alert' ? 'OK' : kind === 'prompt' ? 'SAVE' : 'CONFIRM');
      let cancel = null;
      if (kind !== 'alert') {
        cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'rsbd-btn cancel';
        cancel.textContent = opts.cancelText || 'CANCEL';
        actions.append(cancel);
      }
      actions.append(ok);

      box.append(title, msg);
      if (input) box.append(input);
      box.append(actions);
      overlay.append(box);
      document.body.append(overlay);
      setTimeout(() => overlay.classList.add('show'), 10);

      function close(result) {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        if (returnFocus && returnFocus.focus && document.contains(returnFocus)) returnFocus.focus();
        resolve(result);
      }
      const cancelled = kind === 'confirm' ? false : kind === 'prompt' ? null : undefined;
      const accept = () => close(kind === 'confirm' ? true : kind === 'prompt' ? input.value.trim() : undefined);

      ok.addEventListener('click', accept);
      if (cancel) cancel.addEventListener('click', () => close(cancelled));
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(cancelled); });

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(cancelled); return; }
        if (e.key === 'Enter' && (e.target === input || e.target === ok || kind === 'alert')) { e.preventDefault(); accept(); return; }
        if (e.key === 'Tab') {
          const f = [input, cancel, ok].filter(Boolean);
          const i = f.indexOf(document.activeElement);
          e.preventDefault();
          f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
        }
      }
      document.addEventListener('keydown', onKey, true);

      // Destructive confirms start on Cancel so Enter can't delete by accident
      (input || (opts.danger && cancel) || ok).focus();
      if (input) input.select();
    });

    const p = queue.then(run);
    queue = p.catch(() => {});
    return p;
  }

  // ---- notifications ---------------------------------------------------------
  // type: 'success' (default) | 'error' | 'info'. Errors stay longer and are announced
  // straight away. Hovering pauses the countdown; × closes early.
  const MAX_SHOWN = 3;
  let signingOut = false;

  function stack() {
    let el = document.getElementById('rsbn-stack');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rsbn-stack';
      el.className = 'rsbn-stack';
      document.body.appendChild(el);
    }
    // Sit just under the top bar, whatever height it has at this screen size
    const bar = document.querySelector('.topbar');
    el.style.top = ((bar ? bar.getBoundingClientRect().bottom : 0) + 12) + 'px';
    return el;
  }

  function toast(message, type) {
    type = type === 'error' || type === 'info' ? type : 'success';
    // Signing out drops access while live listeners are still attached; their
    // "insufficient permissions" errors are expected then and mean nothing
    if (signingOut && type === 'error') return;
    injectStyle();
    const host = stack();

    const item = document.createElement('div');
    item.className = 'rsbn ' + type;
    item.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const icon = document.createElement('span');
    icon.className = 'rsbn-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = type === 'error' ? '!' : type === 'info' ? 'i' : '✓';
    const msg = document.createElement('div');
    msg.className = 'rsbn-msg';
    msg.textContent = message;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'rsbn-close';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    const bar = document.createElement('span');
    bar.className = 'rsbn-timer';
    bar.setAttribute('aria-hidden', 'true');
    item.append(icon, msg, close, bar);
    host.appendChild(item);
    while (host.children.length > MAX_SHOWN) host.firstElementChild.remove();
    setTimeout(() => item.classList.add('show'), 10);

    const life = type === 'error' ? 6000 : 3500;
    let left = life, started = Date.now(), timer;
    const dismiss = () => {
      clearTimeout(timer);
      item.classList.remove('show');
      setTimeout(() => item.remove(), 200);
    };
    const run = () => {
      started = Date.now();
      bar.style.transition = 'transform ' + left + 'ms linear';
      bar.style.transform = 'scaleX(0)';
      timer = setTimeout(dismiss, left);
    };
    const pause = () => {
      clearTimeout(timer);
      left = Math.max(800, left - (Date.now() - started));
      bar.style.transition = 'none';
      bar.style.transform = 'scaleX(' + (left / life) + ')';
    };
    item.addEventListener('mouseenter', pause);
    item.addEventListener('mouseleave', run);
    close.addEventListener('click', dismiss);
    setTimeout(run, 20);
  }

  window.RSBDialog = {
    alert: (message, opts) => open('alert', message, opts),
    confirm: (message, opts) => open('confirm', message, opts),
    prompt: (message, opts) => open('prompt', message, opts),
    toast,
    // Call before signing out: hides the listener errors that signing out causes
    beginSignOut() { signingOut = true; }
  };
})();
