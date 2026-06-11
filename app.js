/* =====================================================
   Historia Clínica Electrónica — app.js
   Sin backend. Persistencia en localStorage.
   ===================================================== */

'use strict';

/* =====================================================
   CONFIGURACIÓN
   ===================================================== */
const CONFIG = {
  STORAGE_KEYS: {
    USER:      'hce_user',
    PATIENTS:  'hce_patients',
    HISTORIES: 'hce_histories',
  },
  DEMO_USERS: [
    { username: 'doctor',  password: 'doctor123',  nombre: 'Dr. Yasmine Aurich Rojas',    rol: 'Médico General' },
    { username: 'admin',   password: 'admin123',   nombre: 'Administrador',       rol: 'Administrador' },
    { username: 'medico',  password: 'medico123',  nombre: 'Dra. Ramírez Torres', rol: 'Internista' },
  ],
};

/* =====================================================
   UTILIDADES
   ===================================================== */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const Storage = {
  get:    (key) => { try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; } },
  set:    (key, val) => localStorage.setItem(key, JSON.stringify(val)),
  remove: (key) => localStorage.removeItem(key),
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function calcAge(dob) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

function calcIMC(peso, talla) {
  if (!peso || !talla || talla <= 0) return null;
  return (peso / (talla * talla)).toFixed(2);
}

function imcCategory(imc) {
  if (!imc) return { label: '—', cls: '' };
  const v = parseFloat(imc);
  if (v < 18.5) return { label: 'Bajo peso',    cls: 'imc-bajo' };
  if (v < 25)   return { label: 'Peso normal',  cls: 'imc-normal' };
  if (v < 30)   return { label: 'Sobrepeso',    cls: 'imc-sobrepeso' };
  return            { label: 'Obesidad',        cls: 'imc-obesidad' };
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* =====================================================
   TOAST
   ===================================================== */
function showToast(msg, type = 'info', duration = 3200) {
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const container = $('#toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'info' ? '' : type}`;
  toast.textContent = `${icons[type] || ''} ${msg}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity .3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* =====================================================
   MODALES
   ===================================================== */
function openModal(id) {
  const m = $(`#${id}`);
  if (m) { m.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
}

function closeModal(id) {
  const m = $(`#${id}`);
  if (m) { m.classList.add('hidden'); document.body.style.overflow = ''; }
}

/* =====================================================
   AUTH
   ===================================================== */
const Auth = {
  login(username, password) {
    const user = CONFIG.DEMO_USERS.find(
      u => u.username === username.trim() && u.password === password
    );
    if (!user) return false;
    Storage.set(CONFIG.STORAGE_KEYS.USER, { username: user.username, nombre: user.nombre, rol: user.rol });
    return true;
  },
  logout() {
    Storage.remove(CONFIG.STORAGE_KEYS.USER);
  },
  current() {
    return Storage.get(CONFIG.STORAGE_KEYS.USER);
  },
};

/* =====================================================
   PACIENTES (CRUD)
   ===================================================== */
const Patients = {
  getAll() {
    return Storage.get(CONFIG.STORAGE_KEYS.PATIENTS) || [];
  },
  save(list) {
    Storage.set(CONFIG.STORAGE_KEYS.PATIENTS, list);
  },
  getById(id) {
    return this.getAll().find(p => p.id === id) || null;
  },
  create(data) {
    const list = this.getAll();
    const patient = { id: uid(), createdAt: new Date().toISOString(), ...data };
    list.push(patient);
    this.save(list);
    return patient;
  },
  update(id, data) {
    const list = this.getAll();
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...data, id, updatedAt: new Date().toISOString() };
    this.save(list);
    return list[idx];
  },
  delete(id) {
    const list = this.getAll().filter(p => p.id !== id);
    this.save(list);
    // también eliminar sus historias
    const histories = Histories.getAll().filter(h => h.patientId !== id);
    Storage.set(CONFIG.STORAGE_KEYS.HISTORIES, histories);
  },
  search(query) {
    const q = query.toLowerCase().trim();
    if (!q) return this.getAll();
    return this.getAll().filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      p.cedula?.toLowerCase().includes(q) ||
      p.telefono?.toLowerCase().includes(q)
    );
  },
};

/* =====================================================
   HISTORIAS CLÍNICAS
   ===================================================== */
const Histories = {
  getAll() {
    return Storage.get(CONFIG.STORAGE_KEYS.HISTORIES) || [];
  },
  getByPatient(patientId) {
    return this.getAll().filter(h => h.patientId === patientId).reverse();
  },
  create(data) {
    const list = this.getAll();
    const history = { id: uid(), date: new Date().toISOString(), ...data };
    list.push(history);
    Storage.set(CONFIG.STORAGE_KEYS.HISTORIES, list);
    return history;
  },
  delete(id) {
    const list = this.getAll().filter(h => h.id !== id);
    Storage.set(CONFIG.STORAGE_KEYS.HISTORIES, list);
  },
};

/* =====================================================
   PDF
   ===================================================== */
function generatePDF(history) {
  if (typeof window.jspdf === 'undefined') {
    showToast('La librería jsPDF no está disponible', 'error');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

  const patient = Patients.getById(history.patientId);
  const user    = Auth.current();
  const pageW   = 210;
  const margin  = 15;
  let y = 20;

  const addText = (text, x, size = 11, style = 'normal', color = [30, 37, 51]) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
    doc.setTextColor(...color);
    doc.text(String(text || '—'), x, y);
  };

  const line = (y1) => {
    doc.setDrawColor(209, 220, 232);
    doc.line(margin, y1, pageW - margin, y1);
  };

  // Encabezado
  doc.setFillColor(15, 76, 117);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('HISTORIA CLÍNICA ELECTRÓNICA', margin, 12);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Generado el ${new Date().toLocaleDateString('es', { dateStyle: 'long' })}`, margin, 20);
  if (user) doc.text(`Atendido por: ${user.nombre} — ${user.rol}`, pageW - margin, 20, { align: 'right' });

  y = 38;

  // Datos del paciente
  addText('DATOS DEL PACIENTE', margin, 11, 'bold', [15, 76, 117]);
  y += 6; line(y); y += 5;

  if (patient) {
    const edad = calcAge(patient.fechaNacimiento);
    const campos = [
      ['Nombre', patient.nombre],
      ['Cédula / ID', patient.cedula || '—'],
      ['Fecha de nacimiento', patient.fechaNacimiento ? formatDate(patient.fechaNacimiento) : '—'],
      ['Edad', edad ? `${edad} años` : '—'],
      ['Sexo', patient.sexo || '—'],
      ['Teléfono', patient.telefono || '—'],
      ['Email', patient.email || '—'],
      ['Dirección', patient.direccion || '—'],
    ];
    campos.forEach(([lbl, val]) => {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 106, 126);
      doc.text(lbl + ':', margin, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(26, 37, 51);
      doc.text(String(val), margin + 45, y);
      y += 6;
    });
  }

  y += 4;

  // Signos vitales
  addText('SIGNOS VITALES Y ANTROPOMETRÍA', margin, 11, 'bold', [15, 76, 117]);
  y += 6; line(y); y += 5;

  const vitals = [
    ['Fecha de consulta', formatDate(history.date?.split('T')[0])],
    ['Peso', history.peso ? `${history.peso} kg` : '—'],
    ['Talla', history.talla ? `${history.talla} m` : '—'],
    ['IMC', history.imc ? `${history.imc} kg/m²` : '—'],
    ['Categoría IMC', history.imcCategoria || '—'],
    ['Presión arterial', history.presionArterial || '—'],
    ['Frecuencia cardíaca', history.frecuenciaCardiaca ? `${history.frecuenciaCardiaca} lpm` : '—'],
    ['Temperatura', history.temperatura ? `${history.temperatura} °C` : '—'],
    ['Saturación O2', history.saturacionO2 ? `${history.saturacionO2}%` : '—'],
  ];

  vitals.forEach(([lbl, val]) => {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 106, 126);
    doc.text(lbl + ':', margin, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(26, 37, 51);
    doc.text(String(val), margin + 55, y);
    y += 6;
  });

  y += 4;

  // Secciones de texto
  const sections = [
    ['MOTIVO DE CONSULTA',        history.motivoConsulta],
    ['ENFERMEDAD ACTUAL',         history.enfermedadActual],
    ['ANTECEDENTES PERSONALES',   history.antecedentePersonal],
    ['ANTECEDENTES FAMILIARES',   history.antecedenteFamiliar],
    ['EXAMEN FÍSICO',             history.examenFisico],
    ['DIAGNÓSTICO',               history.diagnostico],
    ['TRATAMIENTO',               history.tratamiento],
    ['OBSERVACIONES',             history.observaciones],
  ];

  sections.forEach(([titulo, texto]) => {
    if (!texto) return;
    if (y > 260) { doc.addPage(); y = 20; }
    addText(titulo, margin, 11, 'bold', [15, 76, 117]);
    y += 5; line(y); y += 5;
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(26, 37, 51);
    const lines = doc.splitTextToSize(texto, pageW - margin * 2);
    lines.forEach((l) => {
      if (y > 272) { doc.addPage(); y = 20; }
      doc.text(l, margin, y);
      y += 5.5;
    });
    y += 3;
  });

  // Pie de página
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 170, 180);
    doc.text(`Historia Clínica Electrónica — Pág. ${i} de ${pageCount}`, pageW / 2, 290, { align: 'center' });
    doc.text('Documento generado electrónicamente. No requiere firma física.', pageW / 2, 295, { align: 'center' });
  }

  const patName = patient?.nombre?.replace(/\s+/g, '_') || 'paciente';
  const fecha   = new Date().toISOString().split('T')[0];
  doc.save(`HC_${patName}_${fecha}.pdf`);
  showToast('PDF generado correctamente', 'success');
}

/* =====================================================
   VISTAS — Pacientes
   ===================================================== */
let currentEditId = null;

function renderPatients(query = '') {
  const list = Patients.search(query);
  const container = $('#patientsList');

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">👤</span>
        <p>${query ? 'No se encontraron pacientes.' : 'No hay pacientes registrados. ¡Agrega el primero!'}</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(p => {
    const initials = p.nombre.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
    const edad = p.fechaNacimiento ? calcAge(p.fechaNacimiento) : null;
    return `
      <div class="patient-item" data-id="${p.id}">
        <div class="patient-avatar">${escapeHtml(initials)}</div>
        <div class="patient-info">
          <div class="patient-name">${escapeHtml(p.nombre)}</div>
          <div class="patient-meta">
            ${p.cedula ? `ID: ${escapeHtml(p.cedula)} &nbsp;·&nbsp;` : ''}
            ${edad !== null ? `${edad} años &nbsp;·&nbsp;` : ''}
            ${p.sexo ? escapeHtml(p.sexo) : ''}
          </div>
        </div>
        <div class="patient-actions">
          <button class="btn btn-sm btn-accent" onclick="openNewHistory('${p.id}')" title="Nueva consulta">📋</button>
          <button class="btn btn-sm btn-outline" onclick="editPatient('${p.id}')" title="Editar">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="confirmDeletePatient('${p.id}')" title="Eliminar">🗑</button>
        </div>
      </div>`;
  }).join('');
}

function renderStats() {
  const patients  = Patients.getAll();
  const histories = Histories.getAll();
  const today     = new Date().toDateString();
  const todayH    = histories.filter(h => new Date(h.date).toDateString() === today).length;

  $('#statTotal').textContent = patients.length;
  $('#statHistories').textContent = histories.length;
  $('#statToday').textContent = todayH;
}

function openAddPatient() {
  currentEditId = null;
  $('#patientForm').reset();
  $('#patientModalTitle').textContent = 'Nuevo Paciente';
  openModal('patientModal');
}

function editPatient(id) {
  const p = Patients.getById(id);
  if (!p) return;
  currentEditId = id;
  $('#patientModalTitle').textContent = 'Editar Paciente';

  const form = $('#patientForm');
  form.nombre.value         = p.nombre || '';
  form.cedula.value         = p.cedula || '';
  form.fechaNacimiento.value = p.fechaNacimiento || '';
  form.sexo.value           = p.sexo || '';
  form.telefono.value       = p.telefono || '';
  form.email.value          = p.email || '';
  form.direccion.value      = p.direccion || '';
  form.alergias.value       = p.alergias || '';

  openModal('patientModal');
}

function savePatient() {
  const form = $('#patientForm');
  const nombre = form.nombre.value.trim();
  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }

  const data = {
    nombre,
    cedula:          form.cedula.value.trim(),
    fechaNacimiento: form.fechaNacimiento.value,
    sexo:            form.sexo.value,
    telefono:        form.telefono.value.trim(),
    email:           form.email.value.trim(),
    direccion:       form.direccion.value.trim(),
    alergias:        form.alergias.value.trim(),
  };

  if (currentEditId) {
    Patients.update(currentEditId, data);
    showToast('Paciente actualizado', 'success');
  } else {
    Patients.create(data);
    showToast('Paciente registrado', 'success');
  }

  closeModal('patientModal');
  renderPatients($('#searchInput').value);
  renderStats();
}

function confirmDeletePatient(id) {
  const p = Patients.getById(id);
  if (!p) return;
  $('#deletePatientName').textContent = p.nombre;
  $('#confirmDeleteModal').dataset.targetId = id;
  openModal('confirmDeleteModal');
}

function deletePatient() {
  const id = $('#confirmDeleteModal').dataset.targetId;
  if (!id) return;
  Patients.delete(id);
  closeModal('confirmDeleteModal');
  renderPatients($('#searchInput').value);
  renderStats();
  renderHistoryList();
  showToast('Paciente eliminado', 'warning');
}

/* =====================================================
   VISTAS — Historia Clínica
   ===================================================== */
function openNewHistory(patientId) {
  const p = Patients.getById(patientId);
  if (!p) return;

  // Intentar reset del form si existe; si no, limpiar campos uno a uno
  const form = $('#historyForm');
  if (form) {
    form.reset();
  } else {
    const fieldIds = [
      'fieldPeso','fieldTalla','fieldPA','fieldFC','fieldTemp','fieldSatO2',
      'fieldMotivo','fieldEnfActual','fieldAntPersonal','fieldAntFamiliar',
      'fieldExFisico','fieldDiagnostico','fieldTratamiento','fieldObservaciones'
    ];
    fieldIds.forEach(id => { const el = $(`#${id}`); if (el) el.value = ''; });
  }

  $('#historyPatientId').value         = patientId;
  $('#historyPatientName').textContent = p.nombre;
  $('#historyDateLabel').textContent   = new Date().toLocaleDateString('es', { dateStyle: 'long' });
  const imcDisplay = $('#imcDisplay');
  if (imcDisplay) imcDisplay.classList.add('hidden');
  openModal('historyModal');
}

function updateIMC() {
  const peso  = parseFloat($('#fieldPeso').value);
  const talla = parseFloat($('#fieldTalla').value);
  const imc   = calcIMC(peso, talla);
  const cat   = imcCategory(imc);

  const display = $('#imcDisplay');
  if (imc) {
    $('#imcValue').textContent    = imc;
    $('#imcCat').textContent      = cat.label;
    $('#imcCat').className        = `imc-cat ${cat.cls}`;
    display.classList.remove('hidden');
  } else {
    display.classList.add('hidden');
  }
}

function saveHistory() {
  const patientId = $('#historyPatientId').value;
  if (!patientId) return;

  const peso  = parseFloat($('#fieldPeso').value) || null;
  const talla = parseFloat($('#fieldTalla').value) || null;
  const imc   = calcIMC(peso, talla);
  const cat   = imcCategory(imc);

  const data = {
    patientId,
    peso,
    talla,
    imc,
    imcCategoria:       cat.label,
    presionArterial:    $('#fieldPA').value.trim(),
    frecuenciaCardiaca: $('#fieldFC').value.trim(),
    temperatura:        $('#fieldTemp').value.trim(),
    saturacionO2:       $('#fieldSatO2').value.trim(),
    motivoConsulta:     $('#fieldMotivo').value.trim(),
    enfermedadActual:   $('#fieldEnfActual').value.trim(),
    antecedentePersonal:$('#fieldAntPersonal').value.trim(),
    antecedenteFamiliar:$('#fieldAntFamiliar').value.trim(),
    examenFisico:       $('#fieldExFisico').value.trim(),
    diagnostico:        $('#fieldDiagnostico').value.trim(),
    tratamiento:        $('#fieldTratamiento').value.trim(),
    observaciones:      $('#fieldObservaciones').value.trim(),
  };

  if (!data.motivoConsulta) {
    showToast('El motivo de consulta es obligatorio', 'error');
    return;
  }

  const history = Histories.create(data);
  closeModal('historyModal');
  renderStats();
  renderHistoryList();
  showToast('Historia clínica guardada', 'success');

  // Preguntar si desea generar PDF
  if (confirm('¿Desea generar el PDF de esta historia clínica?')) {
    generatePDF(history);
  }
}

/* =====================================================
   VISTAS — Historial
   ===================================================== */
function renderHistoryList(query = '') {
  const histories = Histories.getAll().reverse();
  const q = query.toLowerCase().trim();

  const container = $('#historyList');

  const filtered = q
    ? histories.filter(h => {
        const p = Patients.getById(h.patientId);
        return p?.nombre.toLowerCase().includes(q) ||
               (h.diagnostico || '').toLowerCase().includes(q) ||
               (h.motivoConsulta || '').toLowerCase().includes(q);
      })
    : histories;

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📋</span>
        <p>${q ? 'No se encontraron historias.' : 'No hay historias clínicas registradas.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(h => {
    const p     = Patients.getById(h.patientId);
    const fecha = new Date(h.date).toLocaleDateString('es', { dateStyle: 'medium' });
    const hour  = new Date(h.date).toLocaleTimeString('es', { timeStyle: 'short' });

    return `
      <div class="history-item">
        <div class="history-header" onclick="toggleHistory('${h.id}')">
          <span class="history-date">📅 ${fecha} ${hour}</span>
          <span class="history-patient">👤 ${escapeHtml(p?.nombre || 'Paciente eliminado')}</span>
          <div style="display:flex;gap:.4rem">
            <button class="btn btn-sm btn-success" onclick="event.stopPropagation();generatePDF(Histories.getAll().find(x=>x.id==='${h.id}'))" title="Generar PDF">📄 PDF</button>
            <button class="btn btn-sm btn-danger"  onclick="event.stopPropagation();confirmDeleteHistory('${h.id}')" title="Eliminar">🗑</button>
          </div>
        </div>
        <div class="history-body" id="hbody-${h.id}">
          <dl class="history-grid">
            <dt>Motivo</dt><dd>${escapeHtml(h.motivoConsulta || '—')}</dd>
            <dt>Diagnóstico</dt><dd>${escapeHtml(h.diagnostico || '—')}</dd>
            <dt>Peso</dt><dd>${h.peso ? h.peso + ' kg' : '—'}</dd>
            <dt>Talla</dt><dd>${h.talla ? h.talla + ' m' : '—'}</dd>
            <dt>IMC</dt><dd>${h.imc ? h.imc + ' kg/m²' : '—'}</dd>
            <dt>Cat. IMC</dt><dd>${escapeHtml(h.imcCategoria || '—')}</dd>
            <dt>Presión</dt><dd>${escapeHtml(h.presionArterial || '—')}</dd>
            <dt>FC</dt><dd>${h.frecuenciaCardiaca ? h.frecuenciaCardiaca + ' lpm' : '—'}</dd>
            <dt>Temperatura</dt><dd>${h.temperatura ? h.temperatura + ' °C' : '—'}</dd>
            <dt>Sat. O2</dt><dd>${h.saturacionO2 ? h.saturacionO2 + '%' : '—'}</dd>
          </dl>
          ${h.tratamiento ? `<div class="section-title">Tratamiento</div><p style="font-size:.85rem">${escapeHtml(h.tratamiento)}</p>` : ''}
          ${h.observaciones ? `<div class="section-title">Observaciones</div><p style="font-size:.85rem">${escapeHtml(h.observaciones)}</p>` : ''}
        </div>
      </div>`;
  }).join('');
}

function toggleHistory(id) {
  const body = $(`#hbody-${id}`);
  if (body) body.classList.toggle('open');
}

function confirmDeleteHistory(id) {
  $('#confirmDeleteHistoryModal').dataset.targetId = id;
  openModal('confirmDeleteHistoryModal');
}

function deleteHistory() {
  const id = $('#confirmDeleteHistoryModal').dataset.targetId;
  if (!id) return;
  Histories.delete(id);
  closeModal('confirmDeleteHistoryModal');
  renderHistoryList($('#historySearch').value);
  renderStats();
  showToast('Historia eliminada', 'warning');
}

/* =====================================================
   TABS
   ===================================================== */
function switchTab(tabId) {
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === tabId));
}

/* =====================================================
   INICIALIZACIÓN
   ===================================================== */
function initApp() {
  renderPatients();
  renderStats();
  renderHistoryList();
  switchTab('tabPacientes');
}

function showApp() {
  const user = Auth.current();
  if (!user) return;
  $('#loginScreen').classList.add('hidden');
  $('#appShell').classList.remove('hidden');
  $('#userBadge').textContent = `${user.nombre} (${user.rol})`;
  initApp();
}

function showLogin() {
  $('#loginScreen').classList.remove('hidden');
  $('#appShell').classList.add('hidden');
}

/* =====================================================
   EVENT LISTENERS — DOM Ready
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => {

  // Verificar sesión existente
  if (Auth.current()) {
    showApp();
  } else {
    showLogin();
  }

  /* --- Login --- */
  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const username = $('#loginUsername').value;
    const password = $('#loginPassword').value;
    const btn = $('#btnLogin');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Ingresando…';

    setTimeout(() => {
      if (Auth.login(username, password)) {
        showApp();
      } else {
        showToast('Usuario o contraseña incorrectos', 'error');
        btn.disabled = false;
        btn.textContent = 'Ingresar';
      }
    }, 600);
  });

  /* --- Logout --- */
  $('#btnLogout').addEventListener('click', () => {
    Auth.logout();
    showLogin();
    showToast('Sesión cerrada', 'info');
  });

  /* --- Tabs --- */
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      if (btn.dataset.tab === 'tabHistorial') renderHistoryList($('#historySearch').value);
    });
  });

  /* --- Buscar pacientes --- */
  $('#searchInput').addEventListener('input', (e) => {
    renderPatients(e.target.value);
  });

  /* --- Buscar historial --- */
  $('#historySearch').addEventListener('input', (e) => {
    renderHistoryList(e.target.value);
  });

  /* --- Botón nuevo paciente --- */
  $('#btnAddPatient').addEventListener('click', openAddPatient);

  /* --- Guardar paciente --- */
  $('#btnSavePatient').addEventListener('click', savePatient);

  /* --- Confirmar eliminar paciente --- */
  $('#btnConfirmDelete').addEventListener('click', deletePatient);

  /* --- Confirmar eliminar historia --- */
  $('#btnConfirmDeleteHistory').addEventListener('click', deleteHistory);

  /* --- IMC en tiempo real --- */
  $('#fieldPeso').addEventListener('input', updateIMC);
  $('#fieldTalla').addEventListener('input', updateIMC);

  /* --- Guardar historia --- */
  $('#btnSaveHistory').addEventListener('click', saveHistory);

  /* --- Cerrar modales con overlay --- */
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      $$('.modal-overlay:not(.hidden)').forEach(m => closeModal(m.id));
    }
  });

  /* --- Cerrar modales con botón X --- */
  $$('.modal-close, [data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const overlay = btn.closest('.modal-overlay');
      if (overlay) closeModal(overlay.id);
    });
  });

  /* --- Exponer globals para onclick en HTML --- */
  window.openAddPatient         = openAddPatient;
  window.editPatient            = editPatient;
  window.confirmDeletePatient   = confirmDeletePatient;
  window.openNewHistory         = openNewHistory;
  window.generatePDF            = generatePDF;
  window.toggleHistory          = toggleHistory;
  window.confirmDeleteHistory   = confirmDeleteHistory;
  window.Histories              = Histories;
});

/* =====================================================
   SERVICE WORKER
   ===================================================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.info('[SW] Registrado correctamente'))
      .catch((err) => console.warn('[SW] Error de registro:', err));
  });
}
