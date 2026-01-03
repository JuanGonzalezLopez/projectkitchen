const toastEl = document.getElementById('toast');
const tabsEl = document.getElementById('tabs');
const panelsEl = document.getElementById('panels');
const authStatusEl = document.getElementById('authStatus');

const showToast = (msg, isError = false) => {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.style.background = isError ? '#b23c2d' : '#0f7b3c';
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 3200);
};

const fetchJSON = async (url) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
};

const saveJson = async (path, data) => {
  const res = await fetch('/api/admin/save-json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, json: data })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || `Save failed (${res.status})`);
  return body;
};

const uploadFile = async (file, targetDir) => {
  const form = new FormData();
  form.append('file', file);
  form.append('targetDir', targetDir);
  const res = await fetch('/api/admin/upload', { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || `Upload failed (${res.status})`);
  return body;
};

const state = {
  content: null,
  services: null,
  projects: null,
  manifests: {},
  selectedManifestSlug: null
};

const renderTabs = () => {
  const tabs = [
    { id: 'content', label: 'Site Content' },
    { id: 'services', label: 'Services' },
    { id: 'projects', label: 'Projects Index' },
    { id: 'manifest', label: 'Project Manifests' },
    { id: 'uploads', label: 'Media Uploads' }
  ];
  tabsEl.innerHTML = '';
  panelsEl.innerHTML = '';
  tabs.forEach((tab, idx) => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (idx === 0 ? ' active' : '');
    btn.textContent = tab.label;
    btn.dataset.tab = tab.id;
    btn.onclick = () => setActiveTab(tab.id);
    tabsEl.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = `panel-${tab.id}`;
    panel.className = 'panel' + (idx === 0 ? ' active' : '');
    panelsEl.appendChild(panel);
  });
};

const setActiveTab = (id) => {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === id);
  });
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
  const target = document.getElementById(`panel-${id}`);
  if (target) target.classList.add('active');
};

const renderContentPanel = () => {
  const panel = document.getElementById('panel-content');
  if (!panel || !state.content) return;
  panel.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h3>Site Content</h3>
    <div class="row">
      <div class="col">
        <label>Site URL<input id="siteUrlInput" value="${state.content.siteUrl || ''}"></label>
        <label>Turnstile Site Key<input id="turnstileKeyInput" value="${state.content.turnstileSiteKey || ''}"></label>
      </div>
    </div>
    <h4>Hero</h4>
    <label>Eyebrow<input id="heroEyebrow" value="${state.content.hero.eyebrow || ''}"></label>
    <label>Headline<input id="heroHeadline" value="${state.content.hero.headline || ''}"></label>
    <label>Subhead<textarea id="heroSubhead">${state.content.hero.subhead || ''}</textarea></label>
    <div class="row">
      <div class="col"><label>Primary CTA<input id="heroCtaPrimary" value="${state.content.hero.ctaPrimary || ''}"></label></div>
      <div class="col"><label>Secondary CTA<input id="heroCtaSecondary" value="${state.content.hero.ctaSecondary || ''}"></label></div>
    </div>
    <h4>About</h4>
    <label>Heading<input id="aboutHeading" value="${state.content.about.heading || ''}"></label>
    <label>Subhead<textarea id="aboutSubhead">${state.content.about.subhead || ''}</textarea></label>
    <div class="list" id="pillarsList"></div>
    <button id="addPillarBtn" type="button">Add Pillar</button>
    <h4>Contact</h4>
    <label>Heading<input id="contactHeading" value="${state.content.contact.heading || ''}"></label>
    <label>Subhead<textarea id="contactSubhead">${state.content.contact.subhead || ''}</textarea></label>
    <div style="margin-top:12px; display:flex; gap:8px;">
      <button id="saveContentBtn">Save</button>
      <button class="secondary" id="refreshContentBtn">Reload</button>
    </div>
  `;
  panel.appendChild(card);

  const pillarsList = card.querySelector('#pillarsList');
  const renderPillars = () => {
    pillarsList.innerHTML = '';
    (state.content.about.pillars || []).forEach((p, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'card';
      wrap.innerHTML = `
        <label>Title<input data-idx="${idx}" data-key="title" value="${p.title || ''}"></label>
        <label>Description<textarea data-idx="${idx}" data-key="description">${p.description || ''}</textarea></label>
        <button type="button" data-remove="${idx}" class="secondary">Remove</button>
      `;
      pillarsList.appendChild(wrap);
    });
  };
  renderPillars();

  pillarsList.addEventListener('input', (e) => {
    const idx = Number(e.target.dataset.idx);
    const key = e.target.dataset.key;
    if (Number.isInteger(idx) && key) {
      state.content.about.pillars[idx][key] = e.target.value;
    }
  });
  pillarsList.addEventListener('click', (e) => {
    const idx = Number(e.target.dataset.remove);
    if (Number.isInteger(idx)) {
      state.content.about.pillars.splice(idx, 1);
      renderPillars();
    }
  });
  card.querySelector('#addPillarBtn').onclick = () => {
    state.content.about.pillars.push({ title: '', description: '' });
    renderPillars();
  };

  card.querySelector('#saveContentBtn').onclick = async () => {
    try {
      state.content.siteUrl = document.getElementById('siteUrlInput').value.trim();
      state.content.turnstileSiteKey = document.getElementById('turnstileKeyInput').value.trim();
      state.content.hero.eyebrow = document.getElementById('heroEyebrow').value.trim();
      state.content.hero.headline = document.getElementById('heroHeadline').value.trim();
      state.content.hero.subhead = document.getElementById('heroSubhead').value.trim();
      state.content.hero.ctaPrimary = document.getElementById('heroCtaPrimary').value.trim();
      state.content.hero.ctaSecondary = document.getElementById('heroCtaSecondary').value.trim();
      state.content.about.heading = document.getElementById('aboutHeading').value.trim();
      state.content.about.subhead = document.getElementById('aboutSubhead').value.trim();
      state.content.contact.heading = document.getElementById('contactHeading').value.trim();
      state.content.contact.subhead = document.getElementById('contactSubhead').value.trim();
      await saveJson('data/content.json', state.content);
      showToast('Content saved');
    } catch (err) {
      showToast(err.message, true);
    }
  };
  card.querySelector('#refreshContentBtn').onclick = loadContent;
};

const renderServicesPanel = () => {
  const panel = document.getElementById('panel-services');
  if (!panel || !state.services) return;
  panel.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h3>Services</h3>
    <div class="list" id="servicesList"></div>
    <button id="addServiceBtn" type="button">Add Service</button>
    <div style="margin-top:12px; display:flex; gap:8px;">
      <button id="saveServicesBtn">Save</button>
      <button class="secondary" id="refreshServicesBtn">Reload</button>
    </div>
  `;
  panel.appendChild(card);
  const list = card.querySelector('#servicesList');
  const render = () => {
    list.innerHTML = '';
    (state.services.services || []).forEach((svc, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'card';
      wrap.innerHTML = `
        <label>Tag<input data-idx="${idx}" data-key="tag" value="${svc.tag || ''}"></label>
        <label>Title<input data-idx="${idx}" data-key="title" value="${svc.title || ''}"></label>
        <label>Description<textarea data-idx="${idx}" data-key="description">${svc.description || ''}</textarea></label>
        <button type="button" class="secondary" data-remove="${idx}">Remove</button>
      `;
      list.appendChild(wrap);
    });
  };
  render();
  list.addEventListener('input', (e) => {
    const idx = Number(e.target.dataset.idx);
    const key = e.target.dataset.key;
    if (Number.isInteger(idx) && key) state.services.services[idx][key] = e.target.value;
  });
  list.addEventListener('click', (e) => {
    const idx = Number(e.target.dataset.remove);
    if (Number.isInteger(idx)) {
      state.services.services.splice(idx, 1);
      render();
    }
  });
  card.querySelector('#addServiceBtn').onclick = () => {
    state.services.services.push({ tag: '', title: '', description: '' });
    render();
  };
  card.querySelector('#saveServicesBtn').onclick = async () => {
    try {
      await saveJson('data/services.json', state.services);
      showToast('Services saved');
    } catch (err) {
      showToast(err.message, true);
    }
  };
  card.querySelector('#refreshServicesBtn').onclick = loadServices;
};

const renderProjectsPanel = () => {
  const panel = document.getElementById('panel-projects');
  if (!panel || !state.projects) return;
  panel.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h3>Projects Index</h3>
    <div class="list" id="projectsList"></div>
    <button id="addProjectBtn" type="button">Add Project</button>
    <div style="margin-top:12px; display:flex; gap:8px;">
      <button id="saveProjectsBtn">Save</button>
      <button class="secondary" id="refreshProjectsBtn">Reload</button>
    </div>
  `;
  panel.appendChild(card);
  const list = card.querySelector('#projectsList');
  const render = () => {
    list.innerHTML = '';
    (state.projects.projects || []).forEach((p, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'card';
      wrap.innerHTML = `
        <label>Slug<input data-idx="${idx}" data-key="slug" value="${p.slug || ''}"></label>
        <label>Name<input data-idx="${idx}" data-key="name" value="${p.name || ''}"></label>
        <label>Manifest Path<input data-idx="${idx}" data-key="manifest" value="${p.manifest || ''}"></label>
        <label>Base Path<input data-idx="${idx}" data-key="basePath" value="${p.basePath || ''}"></label>
        <button type="button" class="secondary" data-remove="${idx}">Remove</button>
      `;
      list.appendChild(wrap);
    });
  };
  render();
  list.addEventListener('input', (e) => {
    const idx = Number(e.target.dataset.idx);
    const key = e.target.dataset.key;
    if (Number.isInteger(idx) && key) state.projects.projects[idx][key] = e.target.value;
  });
  list.addEventListener('click', (e) => {
    const idx = Number(e.target.dataset.remove);
    if (Number.isInteger(idx)) {
      state.projects.projects.splice(idx, 1);
      render();
    }
  });
  card.querySelector('#addProjectBtn').onclick = () => {
    state.projects.projects.push({ slug: '', name: '', manifest: '', basePath: '' });
    render();
  };
  card.querySelector('#saveProjectsBtn').onclick = async () => {
    try {
      await saveJson('data/projects.json', state.projects);
      showToast('Projects saved');
    } catch (err) {
      showToast(err.message, true);
    }
  };
  card.querySelector('#refreshProjectsBtn').onclick = loadProjects;
};

const renderManifestPanel = () => {
  const panel = document.getElementById('panel-manifest');
  if (!panel || !state.projects) return;
  panel.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  const options = (state.projects.projects || [])
    .map(p => `<option value="${p.slug}" ${state.selectedManifestSlug === p.slug ? 'selected' : ''}>${p.name} (${p.slug})</option>`)
    .join('');
  card.innerHTML = `
    <h3>Project Manifests</h3>
    <label>Select project
      <select id="manifestSelect"><option value="">Choose a project</option>${options}</select>
    </label>
    <div id="manifestEditor"></div>
  `;
  panel.appendChild(card);

  const selectEl = card.querySelector('#manifestSelect');
  const editor = card.querySelector('#manifestEditor');

  const renderManifest = () => {
    const slug = selectEl.value;
    if (!slug || !state.manifests[slug]) {
      editor.innerHTML = '<p class="small">Select a project to edit its manifest.</p>';
      return;
    }
    const manifest = state.manifests[slug];
    editor.innerHTML = `
      <label>Title<input id="manifestTitle" value="${manifest.title || ''}"></label>
      <label>Location<input id="manifestLocation" value="${manifest.location || ''}"></label>
      <label>Description<textarea id="manifestDescription">${manifest.description || ''}</textarea></label>
      <h4>Images</h4>
      <div class="list" id="imagesList"></div>
      <button id="addImageBtn" type="button">Add Image</button>
      <div style="margin-top:12px; display:flex; gap:8px;">
        <button id="saveManifestBtn">Save</button>
        <button class="secondary" id="refreshManifestBtn">Reload</button>
      </div>
    `;
    const imagesList = editor.querySelector('#imagesList');
    const renderImages = () => {
      imagesList.innerHTML = '';
      (manifest.images || []).forEach((img, idx) => {
        const wrap = document.createElement('div');
        wrap.className = 'card';
        wrap.innerHTML = `
          <label>Src<input data-idx="${idx}" data-key="src" value="${img.src || ''}"></label>
          <label>WebP<input data-idx="${idx}" data-key="webp" value="${img.webp || ''}"></label>
          <label>Alt<textarea data-idx="${idx}" data-key="alt">${img.alt || ''}</textarea></label>
          <button type="button" class="secondary" data-remove="${idx}">Remove</button>
        `;
        imagesList.appendChild(wrap);
      });
    };
    renderImages();
    imagesList.addEventListener('input', (e) => {
      const idx = Number(e.target.dataset.idx);
      const key = e.target.dataset.key;
      if (Number.isInteger(idx) && key) manifest.images[idx][key] = e.target.value;
    });
    imagesList.addEventListener('click', (e) => {
      const idx = Number(e.target.dataset.remove);
      if (Number.isInteger(idx)) {
        manifest.images.splice(idx, 1);
        renderImages();
      }
    });
    editor.querySelector('#addImageBtn').onclick = () => {
      manifest.images.push({ src: '', webp: '', alt: '' });
      renderImages();
    };
    editor.querySelector('#saveManifestBtn').onclick = async () => {
      try {
        manifest.title = document.getElementById('manifestTitle').value.trim();
        manifest.location = document.getElementById('manifestLocation').value.trim();
        manifest.description = document.getElementById('manifestDescription').value.trim();
        await saveJson(`assets/projects/${slug}/manifest.json`, manifest);
        showToast('Manifest saved');
      } catch (err) {
        showToast(err.message, true);
      }
    };
    editor.querySelector('#refreshManifestBtn').onclick = () => loadManifest(slug, true);
  };

  selectEl.onchange = () => {
    state.selectedManifestSlug = selectEl.value || null;
    if (state.selectedManifestSlug) {
      loadManifest(state.selectedManifestSlug);
    } else {
      renderManifest();
    }
  };
  renderManifest();
};

const renderUploadPanel = () => {
  const panel = document.getElementById('panel-uploads');
  if (!panel) return;
  panel.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  const options = (state.projects?.projects || [])
    .map(p => `<option value="assets/projects/${p.slug}">${p.name} (${p.slug})</option>`)
    .join('');
  card.innerHTML = `
    <h3>Media Uploads</h3>
    <label>Target folder
      <select id="uploadTarget">
        <option value="assets/uploads">assets/uploads</option>
        ${options}
      </select>
    </label>
    <div class="upload-drop" id="uploadDrop">Drag & drop or click to upload (png/jpg/webp, max 8MB)</div>
    <input type="file" id="uploadInput" accept=".png,.jpg,.jpeg,.webp" style="display:none">
    <p class="small" id="uploadResult"></p>
  `;
  panel.appendChild(card);

  const drop = card.querySelector('#uploadDrop');
  const input = card.querySelector('#uploadInput');
  const result = card.querySelector('#uploadResult');

  const handleFiles = async (files) => {
    const file = files?.[0];
    if (!file) return;
    result.textContent = 'Uploading...';
    try {
      const targetDir = card.querySelector('#uploadTarget').value;
      const res = await uploadFile(file, targetDir);
      result.textContent = `Uploaded: ${res.path}`;
      showToast('Upload successful');
    } catch (err) {
      result.textContent = '';
      showToast(err.message, true);
    }
  };

  drop.onclick = () => input.click();
  drop.ondragover = (e) => { e.preventDefault(); drop.style.borderColor = '#1f3b2c'; };
  drop.ondragleave = () => { drop.style.borderColor = '#d7d9df'; };
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.style.borderColor = '#d7d9df';
    handleFiles(e.dataTransfer.files);
  };
  input.onchange = (e) => handleFiles(e.target.files);
};

const loadContent = async () => {
  state.content = await fetchJSON('/data/content.json');
  renderContentPanel();
};

const loadServices = async () => {
  state.services = await fetchJSON('/data/services.json');
  renderServicesPanel();
};

const loadProjects = async () => {
  state.projects = await fetchJSON('/data/projects.json');
  renderProjectsPanel();
  renderUploadPanel();
  if (state.selectedManifestSlug) {
    loadManifest(state.selectedManifestSlug, true);
  } else {
    renderManifestPanel();
  }
};

const loadManifest = async (slug, force = false) => {
  if (!slug) return;
  if (!force && state.manifests[slug]) {
    renderManifestPanel();
    return;
  }
  try {
    const manifest = await fetchJSON(`/assets/projects/${slug}/manifest.json`);
    state.manifests[slug] = manifest;
    renderManifestPanel();
  } catch (err) {
    showToast(`Failed to load manifest: ${err.message}`, true);
  }
};

const checkStatus = async () => {
  try {
    const res = await fetch('/api/admin/status', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) {
      authStatusEl.textContent = `Auth OK (${body.authMode || 'access'})`;
      authStatusEl.style.background = '#1f3b2c';
    } else {
      authStatusEl.textContent = 'Auth failed';
      authStatusEl.style.background = '#b23c2d';
      showToast(body.error || 'Auth failed', true);
    }
  } catch (err) {
    authStatusEl.textContent = 'Auth error';
    authStatusEl.style.background = '#b23c2d';
  }
};

const init = async () => {
  renderTabs();
  await checkStatus();
  await Promise.all([loadContent(), loadServices(), loadProjects()]);
};

init().catch((err) => showToast(err.message, true));
