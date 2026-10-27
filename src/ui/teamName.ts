const MAX_LENGTH = 20;

// Simple DOM overlay so mobile keyboards work. Resolves null if cancelled.
export function askTeamName(current: string, cancellable: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(7,10,20,.92);display:flex;align-items:center;justify-content:center;z-index:10;font-family:system-ui,sans-serif;';
    overlay.innerHTML = `
      <form style="background:#151c33;border:2px solid #2a3558;border-radius:12px;padding:24px;width:min(86vw,360px);color:#fff;display:flex;flex-direction:column;gap:14px">
        <div style="font-size:22px;font-weight:600">Name your team</div>
        <input maxlength="${MAX_LENGTH}" style="font-size:18px;padding:10px;border-radius:8px;border:2px solid #2f6bff;background:#0b1020;color:#fff" />
        <div style="display:flex;gap:10px">
          <button type="submit" style="flex:1;font-size:16px;padding:10px;border:0;border-radius:8px;background:#2f6bff;color:#fff">${cancellable ? 'Save' : 'Start'}</button>
          ${cancellable ? '<button type="button" data-cancel style="flex:1;font-size:16px;padding:10px;border:0;border-radius:8px;background:#2a3350;color:#fff">Cancel</button>' : ''}
        </div>
      </form>`;
    const input = overlay.querySelector('input') as HTMLInputElement;
    input.value = current;
    const done = (value: string | null) => {
      overlay.remove();
      resolve(value);
    };
    overlay.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (name) done(name.slice(0, MAX_LENGTH));
    });
    overlay.querySelector('[data-cancel]')?.addEventListener('click', () => done(null));
    document.body.appendChild(overlay);
    input.focus();
    input.select();
  });
}
