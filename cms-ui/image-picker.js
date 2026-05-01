// window.openImagePicker({ folder: 'team'|'sites'|'news', current: 'assets/team/foo.jpg', onPick(path) })
window.openImagePicker = function ({ folder, current, onPick }) {
  const root = document.getElementById('modal-root') || (() => { const d = document.createElement('div'); d.id = 'modal-root'; document.body.appendChild(d); return d; })();
  let chosenFile = null;
  let chosenPath = current || '';

  root.innerHTML = `
    <div class="modal-overlay" data-modal-overlay>
      <div class="modal upload-modal" style="max-width:640px">
        <div class="modal-head">
          <h2>Image &mdash; <code>assets/${folder}/</code></h2>
          <button class="close" data-modal-close>×</button>
        </div>
        <div class="modal-body" style="grid-template-columns:1fr">
          ${current ? `<div><label>Current</label><img class="preview-img" src="/${current}" onerror="this.style.display='none'"/><p style="font-size:12px;color:var(--ink-2);text-align:center;margin:0">${current}</p></div>` : ''}
          <div>
            <label>Upload new</label>
            <div class="drop-zone" id="dz">
              <p style="margin:0 0 8px"><strong>Drop an image here</strong> or click to choose</p>
              <p style="font-size:12px;margin:0">JPG, PNG, WebP, AVIF, SVG &middot; max 8 MB</p>
              <input type="file" id="file-input" accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml" style="display:none" />
            </div>
            <div id="preview-wrap"></div>
            <label style="margin-top:14px">Or enter a path manually</label>
            <input type="text" id="manual-path" value="${(current || '').replace(/"/g, '&quot;')}" placeholder="assets/${folder}/file.jpg" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;font-size:14px" />
          </div>
        </div>
        <div class="modal-foot">
          <span id="up-status" style="font-size:12.5px;color:var(--ink-2);margin-right:auto"></span>
          <button class="btn" data-modal-close>Cancel</button>
          <button class="btn primary" id="up-apply">Apply</button>
        </div>
      </div>
    </div>
  `;

  const close = () => { root.innerHTML = ''; };
  root.querySelector('[data-modal-overlay]').addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });
  root.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', close));

  const dz = document.getElementById('dz');
  const fi = document.getElementById('file-input');
  const previewWrap = document.getElementById('preview-wrap');
  const status = document.getElementById('up-status');
  const manual = document.getElementById('manual-path');

  dz.addEventListener('click', () => fi.click());
  ['dragover', 'dragenter'].forEach(e => dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'dragend', 'drop'].forEach(e => dz.addEventListener(e, () => dz.classList.remove('over')));
  dz.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
  fi.addEventListener('change', () => { if (fi.files[0]) handleFile(fi.files[0]); });

  function handleFile(file) {
    chosenFile = file;
    const url = URL.createObjectURL(file);
    previewWrap.innerHTML = `<img class="preview-img" src="${url}" alt=""/><p style="font-size:12px;color:var(--ink-2);text-align:center;margin:0">${file.name} &middot; ${(file.size/1024).toFixed(0)} KB</p>`;
    manual.value = '';
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(r.error || new Error('read failed'));
      r.readAsDataURL(file);
    });
  }

  document.getElementById('up-apply').addEventListener('click', async () => {
    const applyBtn = document.getElementById('up-apply');
    if (chosenFile) {
      try {
        status.style.color = 'var(--ink-2)';
        status.textContent = 'Reading file…';
        applyBtn.disabled = true;
        const base64 = await fileToBase64(chosenFile);
        status.textContent = `Uploading ${(base64.length * 3 / 4 / 1024).toFixed(0)} KB…`;
        const r = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder, filename: chosenFile.name, base64 }),
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) { status.textContent = 'Upload failed: ' + (body.error || r.status); status.style.color = 'var(--danger)'; applyBtn.disabled = false; return; }
        chosenPath = body.path;
        status.textContent = body.committed ? 'Uploaded ✓' : (body.warning || 'Saved');
        onPick(chosenPath);
        close();
      } catch (err) {
        status.textContent = 'Upload error: ' + (err.message || err);
        status.style.color = 'var(--danger)';
        applyBtn.disabled = false;
      }
    } else if (manual.value && manual.value !== current) {
      onPick(manual.value);
      close();
    } else {
      close();
    }
  });
};
