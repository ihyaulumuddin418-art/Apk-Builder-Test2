'use strict';

// ============================================================
//  STATE
// ============================================================
const S = {
  username: '', token: '', repo: '', visibility: 'public',
  connected: false, iconBase64: null, files: [],
  history: [], currentBuildId: null, currentRunId: null,
  retryCount: 0,
};

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Load saved settings
  document.getElementById('ghUsername').value = localStorage.getItem('gh_u') || '';
  document.getElementById('ghRepo').value = localStorage.getItem('gh_r') || '';

  // Load history
  try { S.history = JSON.parse(localStorage.getItem('apk_h') || '[]'); } catch { S.history = []; }
  renderHistory();

  // Bind events
  document.getElementById('connectBtn').addEventListener('click', connectGitHub);
  document.getElementById('buildBtn').addEventListener('click', startBuild);
  document.getElementById('clearBtn').addEventListener('click', clearHistory);
  document.getElementById('eyeBtn').addEventListener('click', toggleToken);
  document.getElementById('iconBtn').addEventListener('click', () => document.getElementById('iconInput').click());
  document.getElementById('iconPreview').addEventListener('click', () => document.getElementById('iconInput').click());
  document.getElementById('iconInput').addEventListener('change', function() { handleIcon(this); });
  document.getElementById('filesInput').addEventListener('change', function() { handleFiles(this.files); });
  document.getElementById('appVersion').addEventListener('change', handleVersionChange);

  const dz = document.getElementById('dropzone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); handleFiles(e.dataTransfer.files); });
});

// ============================================================
//  GITHUB HELPERS
// ============================================================
function ghH(token) {
  return { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
}

async function ghGet(path) {
  return fetch(`https://api.github.com/${path}`, { headers: ghH(S.token) });
}

async function ghPut(path, body) {
  return fetch(`https://api.github.com/${path}`, { method: 'PUT', headers: ghH(S.token), body: JSON.stringify(body) });
}

async function ghPost(path, body) {
  return fetch(`https://api.github.com/${path}`, { method: 'POST', headers: ghH(S.token), body: JSON.stringify(body) });
}

function repoPath(sub) {
  return `repos/${S.username}/${encodeURIComponent(S.repo)}/${sub}`;
}

// ============================================================
//  CONNECT GITHUB
// ============================================================
async function connectGitHub() {
  const u = document.getElementById('ghUsername').value.trim();
  const t = document.getElementById('ghToken').value.trim();
  const r = document.getElementById('ghRepo').value.trim();
  const v = document.getElementById('ghVisibility').value;

  if (!u) return toast('⚠️ Masukkan username!', 'error');
  if (!t) return toast('⚠️ Masukkan token!', 'error');
  if (!r) return toast('⚠️ Masukkan repo name!', 'error');

  toast('🔄 Menghubungkan...', 'info');

  // Save token temporarily to S for ghGet
  S.token = t;

  try {
    const res = await ghGet(`repos/${u}/${encodeURIComponent(r)}`);
    if (res.ok) {
      setConnected(u, t, r, v);
      toast('✅ Terhubung!', 'success');
    } else if (res.status === 404) {
      toast('📁 Repo tidak ada, membuat baru...', 'info');
      await createRepo(u, t, r, v);
    } else {
      const e = await res.json().catch(() => ({}));
      toast('❌ ' + (e.message || 'Token tidak valid!'), 'error');
    }
  } catch { toast('❌ Network error!', 'error'); }
}

async function createRepo(u, t, r, v) {
  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST', headers: ghH(t),
    body: JSON.stringify({ name: r, private: v === 'private', auto_init: true })
  });
  if (res.status === 201) {
    setConnected(u, t, r, v);
    toast('✅ Repo dibuat & terhubung!', 'success');
  } else {
    const e = await res.json().catch(() => ({}));
    toast('❌ ' + (e.message || 'Gagal buat repo'), 'error');
  }
}

function setConnected(u, t, r, v) {
  S.username = u; S.token = t; S.repo = r; S.visibility = v; S.connected = true;
  localStorage.setItem('gh_u', u); localStorage.setItem('gh_r', r);
  const dot = document.getElementById('connDot');
  const lbl = document.getElementById('connLabel');
  dot.classList.add('on');
  lbl.textContent = 'Terhubung';
  document.getElementById('connStatus').style.color = 'var(--accent)';
}

function toggleToken() {
  const i = document.getElementById('ghToken');
  i.type = i.type === 'password' ? 'text' : 'password';
}

// ============================================================
//  ICON
// ============================================================
function handleIcon(input) {
  const file = input.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    S.iconBase64 = e.target.result;
    const p = document.getElementById('iconPreview');
    p.innerHTML = `<img src="${S.iconBase64}" alt="icon"/>`;
    const n = document.getElementById('iconName');
    n.textContent = file.name; n.style.display = 'block';
  };
  r.readAsDataURL(file);
}

// ============================================================
//  FILES
// ============================================================
function handleFiles(files) {
  for (const f of files) {
    if (S.files.find(x => x.name === f.name)) continue;
    S.files.push(f);
  }
  renderFiles();
}

function renderFiles() {
  const list = document.getElementById('fileList');
  document.getElementById('fileCount').textContent = S.files.length + ' file';
  if (!S.files.length) { list.innerHTML = ''; return; }
  list.innerHTML = S.files.map((f, i) => {
    const ext = f.name.split('.').pop().toUpperCase();
    const main = f.name === 'index.html';
    return `<div class="file-item">
      <span class="fext">${ext}</span>
      <span class="fname ${main ? 'main' : ''}">${f.name}${main ? ' ⭐' : ''}</span>
      <span class="fsize">${fmtSize(f.size)}</span>
      <button class="frem" data-i="${i}">×</button>
    </div>`;
  }).join('');
  list.querySelectorAll('.frem').forEach(btn => {
    btn.addEventListener('click', () => { S.files.splice(+btn.dataset.i, 1); renderFiles(); });
  });
}

function handleVersionChange() {
  const v = document.getElementById('appVersion').value;
  document.getElementById('customVerGroup').style.display = v === 'custom' ? 'flex' : 'none';
}

function getVersion() {
  const v = document.getElementById('appVersion').value;
  return v === 'custom' ? (document.getElementById('customVersion').value.trim() || '1.0.0') : v;
}

function fmtSize(b) {
  if (b < 1024) return b + 'B';
  if (b < 1048576) return (b / 1024).toFixed(1) + 'KB';
  return (b / 1048576).toFixed(1) + 'MB';
}

// ============================================================
//  WORKFLOW GENERATOR
// ============================================================
function generateWorkflow(appName, pkgName, version) {
  return `name: Build APK

on:
  workflow_dispatch:
    inputs:
      app_name:
        description: 'App Name'
        required: true
        default: '${appName}'
      package_name:
        description: 'Package Name'
        required: true
        default: '${pkgName}'
      version:
        description: 'Version'
        required: true
        default: '${version}'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Install Capacitor CLI
        run: npm install -g @capacitor/cli

      - name: Init npm project
        run: |
          mkdir -p apk_project
          cd apk_project
          npm init -y
          npm install @capacitor/core @capacitor/android

      - name: Copy web files
        run: |
          mkdir -p apk_project/www
          cp -r www/. apk_project/www/
          echo "--- Files in www ---"
          ls apk_project/www/

      - name: Init Capacitor
        run: |
          cd apk_project
          npx cap init "\${{ github.event.inputs.app_name }}" "\${{ github.event.inputs.package_name }}" --web-dir www

      - name: Add Android platform
        run: |
          cd apk_project
          npx cap add android

      - name: Sync web files
        run: |
          cd apk_project
          npx cap sync

      - name: Build APK
        run: |
          cd apk_project/android
          chmod +x gradlew
          ./gradlew assembleDebug --no-daemon --no-build-cache --rerun-tasks --stacktrace 2>&1 | tail -100

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: app-debug
          path: apk_project/android/app/build/outputs/apk/debug/app-debug.apk
          retention-days: 7
`;
}

// ============================================================
//  UPLOAD FILE TO REPO
// ============================================================
async function uploadFileToRepo(path, content, message) {
  let sha = null;
  try {
    const check = await ghGet(repoPath(`contents/${path}`));
    if (check.ok) { const d = await check.json(); sha = d.sha; }
  } catch {}
  const body = { message, content };
  if (sha) body.sha = sha;
  const res = await ghPut(repoPath(`contents/${path}`), body);
  return res.ok || res.status === 201;
}

// ============================================================
//  BUILD
// ============================================================
async function startBuild() {
  const appName = document.getElementById('appName').value.trim();
  const pkgName = document.getElementById('packageName').value.trim();
  const version = getVersion();

  if (!S.connected) return toast('⚠️ Hubungkan GitHub dulu!', 'error');
  if (!appName) return toast('⚠️ Masukkan nama app!', 'error');
  if (!pkgName) return toast('⚠️ Masukkan package name!', 'error');
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(pkgName)) return toast('⚠️ Package name tidak valid!', 'error');
  if (!S.files.length) return toast('⚠️ Upload minimal 1 file!', 'error');
  if (!S.files.find(f => f.name === 'index.html')) return toast('⚠️ Harus ada file index.html!', 'error');

  document.getElementById('buildBtn').disabled = true;
  document.getElementById('statusCard').style.display = 'block';
  document.getElementById('aiCard').style.display = 'none';
  clearLog();

  // Define all steps
  const TOTAL_STEPS = 5 + S.files.length; // upload files + upload workflow + trigger + wait + download
  S.totalSteps = TOTAL_STEPS;
  S.currentStep = 0;

  function step(label, pct) {
    S.currentStep++;
    setProgress(pct, `[${S.currentStep}/${TOTAL_STEPS}] ${pct}% — ${label}`, 'running');
  }

  step('Memulai build...', 5);
  log('info', `→ ${appName} | v${version} | ${pkgName}`);
  log('info', `→ Total langkah: ${TOTAL_STEPS} | File: ${S.files.length}`);

  // STEP 1~N: Upload web files
  for (let i = 0; i < S.files.length; i++) {
    const file = S.files[i];
    const pct = Math.round(10 + (i / S.files.length) * 20);
    step(`Upload file ${i + 1}/${S.files.length}: ${file.name}`, pct);
    const b64 = await toB64(file);
    const content = b64.split(',')[1];
    const ok = await uploadFileToRepo(`www/${file.name}`, content, `Add ${file.name}`);
    if (ok) log('ok', `✓ ${file.name} (${fmtSize(file.size)})`);
    else { log('err', `✗ Gagal upload ${file.name}`); setProgress(0, 'Gagal upload!', 'error'); document.getElementById('buildBtn').disabled = false; return; }
  }

  // STEP: Upload workflow
  step('Menyiapkan workflow otomatis...', 35);
  log('info', '→ Membuat & mengupload workflow...');
  const wf = generateWorkflow(appName, pkgName, version);
  const wfB64 = btoa(unescape(encodeURIComponent(wf)));
  const wfOk = await uploadFileToRepo('.github/workflows/build.yml', wfB64, 'Update build workflow');
  if (wfOk) log('ok', '✓ Workflow berhasil disiapkan!');
  else { log('err', '✗ Gagal upload workflow!'); setProgress(0, 'Gagal!', 'error'); document.getElementById('buildBtn').disabled = false; return; }

  await sleep(3000);

  // STEP: Trigger
  step('Mentrigger GitHub Actions...', 45);
  log('info', '→ Mentrigger build...');
  try {
    const res = await ghPost(repoPath('actions/workflows/build.yml/dispatches'), {
      ref: 'main',
      inputs: { app_name: appName, package_name: pkgName, version }
    });

    if (res.status === 204) {
      log('ok', '✓ Build berhasil di-trigger!');
      setProgress(50, 'Build berjalan di GitHub...', 'running');
      S.retryCount = 0;
      const bid = Date.now();
      S.currentBuildId = bid;
      S.history.unshift({ id: bid, appName, pkgName, version, status: 'building', date: new Date().toLocaleString('id-ID'), runId: null });
      saveHistory(); renderHistory();
      setTimeout(() => pollBuild(bid, 0), 20000);
    } else {
      const e = await res.json().catch(() => ({}));
      log('err', '✗ ' + (e.message || res.status));
      setProgress(0, 'Gagal trigger!', 'error');
      document.getElementById('buildBtn').disabled = false;
    }
  } catch (e) {
    log('err', '✗ ' + e.message);
    setProgress(0, 'Network error!', 'error');
    document.getElementById('buildBtn').disabled = false;
  }
}

// ============================================================
//  POLL BUILD
// ============================================================

// GitHub Actions steps dan estimasi durasinya (detik)
const GH_STEPS = [
  { name: 'Checkout',              pct: 52, est: 10  },
  { name: 'Setup Node.js',         pct: 55, est: 20  },
  { name: 'Setup Java',            pct: 58, est: 30  },
  { name: 'Setup Android SDK',     pct: 62, est: 40  },
  { name: 'Install Capacitor CLI', pct: 65, est: 50  },
  { name: 'Init npm project',      pct: 68, est: 60  },
  { name: 'Copy web files',        pct: 70, est: 65  },
  { name: 'Init Capacitor',        pct: 73, est: 70  },
  { name: 'Add Android platform',  pct: 76, est: 75  },
  { name: 'Sync web files',        pct: 80, est: 80  },
  { name: 'Build APK',             pct: 90, est: 100 },
  { name: 'Upload APK',            pct: 95, est: 110 },
];

async function pollBuild(bid, attempt) {
  if (attempt > 45) {
    log('err', '✗ Timeout!');
    setProgress(0, 'Timeout', 'error');
    document.getElementById('buildBtn').disabled = false;
    return;
  }

  // Estimasi step GitHub Actions berdasarkan waktu
  const elapsedSec = attempt * 20;
  let currentGhStep = GH_STEPS[0];
  let ghStepIdx = 0;
  for (let i = 0; i < GH_STEPS.length; i++) {
    if (elapsedSec >= GH_STEPS[i].est) { currentGhStep = GH_STEPS[i]; ghStepIdx = i; }
  }
  const ghStepNum = ghStepIdx + 1;
  const pct = currentGhStep.pct;

  setProgress(pct, `[GitHub Step ${ghStepNum}/${GH_STEPS.length}] ${pct}% — ${currentGhStep.name}`, 'running');
  if (attempt % 3 === 0) log('info', `→ ⏱ ${elapsedSec}s | Step: ${currentGhStep.name} (${ghStepNum}/${GH_STEPS.length})`);

  try {
    const res = await ghGet(repoPath('actions/runs?per_page=5'));
    const data = await res.json();
    const run = data.workflow_runs?.find(r => r.name === 'Build APK');
    if (!run) { setTimeout(() => pollBuild(bid, attempt + 1), 20000); return; }

    const idx = S.history.findIndex(b => b.id === bid);
    if (idx >= 0 && !S.history[idx].runId) {
      S.history[idx].runId = run.id;
      S.currentRunId = run.id;
      saveHistory(); renderHistory();
    }

    // Try to get real step info from GitHub
    try {
      const jobsRes = await ghGet(repoPath(`actions/runs/${run.id}/jobs`));
      const jobsData = await jobsRes.json();
      const job = jobsData.jobs?.[0];
      if (job) {
        const runningStep = job.steps?.find(s => s.status === 'in_progress');
        const doneSteps = job.steps?.filter(s => s.status === 'completed').length || 0;
        const totalSteps = job.steps?.length || GH_STEPS.length;
        if (runningStep) {
          const realPct = Math.round(50 + (doneSteps / totalSteps) * 45);
          setProgress(realPct, `[${doneSteps + 1}/${totalSteps}] ${realPct}% — ${runningStep.name}`, 'running');
          log('info', `→ 🔄 Step ${doneSteps + 1}/${totalSteps}: ${runningStep.name}`);
        }
      }
    } catch { /* ignore, use estimate */ }

    if (run.status === 'completed') {
      if (run.conclusion === 'success') {
        log('ok', '✓ Build SUKSES!');
        setProgress(100, '[DONE] 100% — Build selesai!', 'success');
        updateHStatus(bid, 'success');
        await downloadAPK(run.id, document.getElementById('appName').value);
      } else {
        log('err', '✗ Build GAGAL: ' + run.conclusion);
        setProgress(0, '❌ Build gagal — AI sedang menganalisis...', 'error');
        updateHStatus(bid, 'failed');
        await analyzeError(run.id, bid);
      }
    } else {
      setTimeout(() => pollBuild(bid, attempt + 1), 20000);
    }
  } catch (e) {
    log('err', '! ' + e.message);
    setTimeout(() => pollBuild(bid, attempt + 1), 20000);
  }
}

// ============================================================
//  DOWNLOAD APK
// ============================================================
async function downloadAPK(runId, appName) {
  log('info', '→ Mengambil APK...');
  try {
    const res = await ghGet(repoPath(`actions/runs/${runId}/artifacts`));
    const data = await res.json();
    const art = data.artifacts?.find(a => a.name === 'app-debug');
    if (!art) { log('err', '✗ Artifact tidak ditemukan'); document.getElementById('buildBtn').disabled = false; return; }

    const dl = await fetch(`https://api.github.com/repos/${S.username}/${encodeURIComponent(S.repo)}/actions/artifacts/${art.id}/zip`, {
      headers: { 'Authorization': `Bearer ${S.token}` }
    });
    const blob = await dl.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (appName || 'app').replace(/\s+/g, '-') + '-debug.zip';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log('ok', '✓ APK berhasil diunduh!');
    toast('🎉 APK berhasil diunduh!', 'success');
    document.getElementById('buildBtn').disabled = false;
  } catch (e) {
    log('err', '✗ ' + e.message);
    document.getElementById('buildBtn').disabled = false;
  }
}

// ============================================================
//  AI ERROR ANALYZER
// ============================================================
async function analyzeError(runId, bid) {
  const aiCard = document.getElementById('aiCard');
  const aiLog = document.getElementById('aiLog');
  const aiPill = document.getElementById('aiPill');
  const aiActions = document.getElementById('aiActions');

  aiCard.style.display = 'block';
  aiPill.textContent = 'ANALYZING';
  aiPill.className = 'status-pill warn';
  aiLog.innerHTML = '<span style="color:var(--warn)">🤖 AI sedang membaca log error dari GitHub Actions...</span><br>';
  aiActions.style.display = 'none';
  aiActions.innerHTML = '';

  // Fetch logs from GitHub
  let errorLog = '';
  try {
    // Get jobs
    const jobsRes = await ghGet(repoPath(`actions/runs/${runId}/jobs`));
    const jobsData = await jobsRes.json();
    const failedJob = jobsData.jobs?.find(j => j.conclusion === 'failure');

    if (failedJob) {
   
