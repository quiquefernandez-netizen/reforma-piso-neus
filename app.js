(() => {
  "use strict";

  const STORAGE_KEY = "casa-neus-state-v1";
  const priorityWeight = { alta: 0, media: 1, baja: 2 };
  const phaseLabels = { ahora: "Para entrar", despues: "Después", futuro: "Futuro" };
  const quotes = [
    "Hoy una pequeña tarea, mañana un gran hogar.",
    "Paso a paso, esta casa se convierte en vuestro hogar.",
    "Lo importante no es hacerlo todo hoy, sino saber cuál es el siguiente paso.",
    "Cada check es un poquito menos de reforma y un poquito más de casa.",
    "Orden, calma y una flor por el camino."
  ];

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const defaults = clone(window.CASA_NEUS_DEFAULTS);
  let state = loadState();
  let deferredInstallPrompt = null;
  let toastTimer = null;
  let noteTimer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!stored || !Array.isArray(stored.tasks) || !Array.isArray(stored.milestones) || !Array.isArray(stored.budget)) return clone(defaults);
      return { ...clone(defaults), ...stored };
    } catch {
      return clone(defaults);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid(prefix) {
    return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function dateFromIso(iso) {
    if (!iso) return null;
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }

  function formatDate(iso, options = { day: "numeric", month: "long", year: "numeric" }) {
    const date = dateFromIso(iso);
    return date ? new Intl.DateTimeFormat("es-ES", options).format(date) : "Sin fecha";
  }

  function formatMoney(amount) {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(amount) || 0);
  }

  function formatDuration(minutes) {
    const value = Number(minutes) || 0;
    if (value < 60) return `${value} min`;
    const hours = Math.floor(value / 60);
    const rest = value % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }

  function daysUntil(iso) {
    const target = dateFromIso(iso);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return target ? Math.ceil((target - today) / 86400000) : null;
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2300);
  }

  function celebrate() {
    const host = $("#celebration");
    host.innerHTML = "";
    const symbols = ["✦", "✿", "❀", "★", "🌿"];
    for (let index = 0; index < 22; index += 1) {
      const particle = document.createElement("span");
      particle.textContent = symbols[index % symbols.length];
      particle.style.left = `${Math.random() * 96}%`;
      particle.style.animationDelay = `${Math.random() * 0.35}s`;
      particle.style.fontSize = `${14 + Math.random() * 15}px`;
      particle.style.color = ["#66836f", "#e6b7b0", "#d8ae5d"][index % 3];
      host.appendChild(particle);
    }
    setTimeout(() => { host.innerHTML = ""; }, 2300);
  }

  function renderAll() {
    renderDashboard();
    renderTimeline();
    renderTaskFilters();
    renderTasks();
    renderBudget();
    renderCleaning();
    $("#notes").value = state.notes || "";
  }

  function renderDashboard() {
    const total = state.tasks.length;
    const done = state.tasks.filter((task) => task.completed).length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    $("#progressPercent").textContent = `${percent}%`;
    $("#progressDetail").textContent = `${done} de ${total} tareas`;
    $("#progressBar").style.width = `${percent}%`;
    $(".progress-track").setAttribute("aria-valuenow", percent);

    const activeBudget = state.budget.filter((item) => item.active);
    const planned = activeBudget.reduce((sum, item) => sum + Number(item.planned || 0), 0);
    const actual = activeBudget.reduce((sum, item) => sum + Number(item.actual || 0), 0);
    $("#budgetPlanned").textContent = formatMoney(planned);
    $("#budgetActual").textContent = `Gastado: ${formatMoney(actual)}`;

    const next = [...state.milestones].filter((item) => daysUntil(item.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (next) {
      const days = daysUntil(next.date);
      $("#nextMilestoneTitle").textContent = next.title;
      $("#nextMilestoneDate").textContent = `${formatDate(next.date)} · ${next.description || ""}`;
      $("#nextMilestoneDays").textContent = days === 0 ? "Hoy" : days === 1 ? "Mañana" : `En ${days} días`;
    } else {
      $("#nextMilestoneTitle").textContent = "¡Todos los hitos cumplidos!";
      $("#nextMilestoneDate").textContent = "Es hora de disfrutar del nuevo hogar.";
      $("#nextMilestoneDays").textContent = "✦";
    }
    const quoteIndex = Math.floor((new Date().setHours(0, 0, 0, 0) / 86400000)) % quotes.length;
    $("#dailyQuote").textContent = quotes[Math.abs(quoteIndex)];
  }

  function renderTimeline() {
    const items = [...state.milestones].sort((a, b) => a.date.localeCompare(b.date));
    $("#timeline").innerHTML = items.map((item) => {
      const past = daysUntil(item.date) < 0 ? "past" : "";
      return `<article class="timeline-item ${past}">
        <span class="timeline-dot" aria-hidden="true"></span>
        <div class="timeline-item-card"><button type="button" data-edit-milestone="${escapeHtml(item.id)}">
          <span class="timeline-date">${escapeHtml(formatDate(item.date, { weekday: "short", day: "numeric", month: "short" }))}</span>
          <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description || "Toca para añadir una descripción.")}</p>
        </button></div>
      </article>`;
    }).join("") || `<div class="empty-state">Todavía no hay hitos.</div>`;
    $$('[data-edit-milestone]').forEach((button) => button.addEventListener("click", () => openMilestoneDialog(button.dataset.editMilestone)));
  }

  function areas() {
    return [...new Set(state.tasks.map((task) => task.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  }

  function renderTaskFilters() {
    const filter = $("#taskAreaFilter");
    const previous = filter.value || "all";
    filter.innerHTML = `<option value="all">Todas las zonas</option>${areas().map((area) => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join("")}`;
    filter.value = [...filter.options].some((option) => option.value === previous) ? previous : "all";
    $("#areaSuggestions").innerHTML = areas().map((area) => `<option value="${escapeHtml(area)}"></option>`).join("");
  }

  function filteredTasks() {
    const query = $("#taskSearch").value.trim().toLocaleLowerCase("es");
    const area = $("#taskAreaFilter").value;
    const status = $("#taskStatusFilter").value;
    return state.tasks.filter((task) => {
      const matchesQuery = !query || `${task.title} ${task.area} ${task.phase} ${task.notes}`.toLocaleLowerCase("es").includes(query);
      const matchesArea = area === "all" || task.area === area;
      const matchesStatus = status === "all" || (status === "done" ? task.completed : !task.completed);
      return matchesQuery && matchesArea && matchesStatus;
    });
  }

  function taskCard(task) {
    return `<article class="task-card ${task.completed ? "done" : ""}">
      <label class="task-check" aria-label="${task.completed ? "Marcar pendiente" : "Completar"}: ${escapeHtml(task.title)}">
        <input type="checkbox" data-toggle-task="${escapeHtml(task.id)}" ${task.completed ? "checked" : ""}/><span></span>
      </label>
      <div class="task-main"><button type="button" data-edit-task="${escapeHtml(task.id)}">
        <span class="task-title">${escapeHtml(task.title)}</span>
        <span class="task-meta"><span>${escapeHtml(task.area)}</span><span>${formatDuration(task.duration)}</span>${task.date ? `<span>${escapeHtml(formatDate(task.date, { day: "numeric", month: "short" }))}</span>` : ""}</span>
      </button></div>
      <span class="priority-dot ${escapeHtml(task.priority)}" title="Prioridad ${escapeHtml(task.priority)}"></span>
    </article>`;
  }

  function renderTasks() {
    const list = filteredTasks().sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if ((a.date || "9999") !== (b.date || "9999")) return (a.date || "9999").localeCompare(b.date || "9999");
      return priorityWeight[a.priority] - priorityWeight[b.priority];
    });
    const grouped = Object.groupBy ? Object.groupBy(list, (task) => task.phase) : list.reduce((acc, task) => ((acc[task.phase] ||= []).push(task), acc), {});
    $("#taskSummary").textContent = `${list.length} tareas visibles · ${state.tasks.filter((task) => !task.completed).length} pendientes en total`;
    $("#taskList").innerHTML = Object.entries(grouped).map(([phase, tasks]) => `<section class="task-group">
      <div class="task-group-title"><h3>${escapeHtml(phase)}</h3><span>${tasks.filter((task) => task.completed).length}/${tasks.length}</span></div>
      ${tasks.map(taskCard).join("")}
    </section>`).join("") || `<div class="empty-state">No hay tareas que coincidan con este filtro.</div>`;
    bindTaskControls($("#taskList"));
  }

  function bindTaskControls(root) {
    $$('[data-toggle-task]', root).forEach((input) => input.addEventListener("change", () => toggleTask(input.dataset.toggleTask, input.checked)));
    $$('[data-edit-task]', root).forEach((button) => button.addEventListener("click", () => openTaskDialog(button.dataset.editTask)));
  }

  function toggleTask(id, completed) {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) return;
    task.completed = completed;
    saveState();
    renderDashboard();
    renderTasks();
    renderCleaning();
    if (completed) {
      showToast("¡Tarea completada! Un paso más ✦");
      celebrate();
    }
  }

  function buildTodayPlan(minutes) {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const candidates = state.tasks.filter((task) => !task.completed && task.phase !== "Más adelante").sort((a, b) => {
      const aOverdue = a.date && dateFromIso(a.date) < now ? -1 : 0;
      const bOverdue = b.date && dateFromIso(b.date) < now ? -1 : 0;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      if (priorityWeight[a.priority] !== priorityWeight[b.priority]) return priorityWeight[a.priority] - priorityWeight[b.priority];
      return (a.date || "9999").localeCompare(b.date || "9999");
    });
    let remaining = minutes;
    const selected = [];
    for (const task of candidates) {
      const duration = Math.max(5, Number(task.duration) || 30);
      if (duration <= remaining) {
        selected.push(task);
        remaining -= duration;
      }
      if (remaining < 5) break;
    }
    if (!selected.length && candidates.length) selected.push([...candidates].sort((a, b) => a.duration - b.duration)[0]);
    const used = selected.reduce((sum, task) => sum + Number(task.duration || 0), 0);
    $("#todayPlan").innerHTML = selected.length ? `<div class="plan-meta"><strong>${selected.length} ${selected.length === 1 ? "tarea" : "tareas"}</strong><span>${formatDuration(used)}</span></div>${selected.map((task) => `<label class="mini-task"><input type="checkbox" data-toggle-task="${escapeHtml(task.id)}"><span><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.area)} · ${formatDuration(task.duration)}</small></span></label>`).join("")}` : `<div class="empty-state">No quedan tareas pendientes. ¡A disfrutar! 🌼</div>`;
    bindTaskControls($("#todayPlan"));
  }

  function renderBudget() {
    const active = state.budget.filter((item) => item.active);
    const planned = active.reduce((sum, item) => sum + Number(item.planned || 0), 0);
    const actual = active.reduce((sum, item) => sum + Number(item.actual || 0), 0);
    $("#budgetTotalPlanned").textContent = formatMoney(planned);
    $("#budgetTotalActual").textContent = formatMoney(actual);
    $("#budgetRemaining").textContent = formatMoney(planned - actual);
    const phase = $("#budgetPhaseFilter").value;
    const visible = state.budget.filter((item) => phase === "all" || item.phase === phase);
    $("#budgetList").innerHTML = visible.map((item) => `<article class="budget-card ${item.active ? "" : "inactive"}">
      <label class="budget-toggle" title="Incluir en presupuesto activo"><input type="checkbox" data-toggle-budget="${escapeHtml(item.id)}" ${item.active ? "checked" : ""} /></label>
      <div><button class="task-main" type="button" data-edit-budget="${escapeHtml(item.id)}"><span class="budget-name">${escapeHtml(item.name)}</span><span class="budget-meta"><span class="phase-chip">${escapeHtml(phaseLabels[item.phase] || item.phase)}</span><span class="status-chip ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>${Number(item.planned) === 0 ? "<span>Por presupuestar</span>" : ""}</span></button></div>
      <div class="budget-amount"><strong>${formatMoney(item.planned)}</strong><small>${item.actual ? `Gastado ${formatMoney(item.actual)}` : "Sin gasto"}</small></div>
    </article>`).join("") || `<div class="empty-state">No hay partidas en esta fase.</div>`;
    $$('[data-edit-budget]').forEach((button) => button.addEventListener("click", () => openBudgetDialog(button.dataset.editBudget)));
    $$('[data-toggle-budget]').forEach((input) => input.addEventListener("change", () => {
      const item = state.budget.find((entry) => entry.id === input.dataset.toggleBudget);
      if (item) item.active = input.checked;
      saveState(); renderBudget(); renderDashboard();
    }));
  }

  function renderCleaning() {
    const cleaning = state.tasks.filter((task) => task.cleaning);
    const grouped = cleaning.reduce((acc, task) => ((acc[task.area] ||= []).push(task), acc), {});
    $("#cleaningChecklist").innerHTML = Object.entries(grouped).map(([area, tasks]) => `<section class="cleaning-group"><h3>${escapeHtml(area)}</h3>${tasks.map((task) => `<label class="cleaning-item ${task.completed ? "done" : ""}"><input type="checkbox" data-toggle-task="${escapeHtml(task.id)}" ${task.completed ? "checked" : ""}><span>${escapeHtml(task.title)}</span></label>`).join("")}</section>`).join("");
    bindTaskControls($("#cleaningChecklist"));
  }

  function openTaskDialog(id = "") {
    const task = state.tasks.find((item) => item.id === id);
    $("#taskDialogTitle").textContent = task ? "Editar tarea" : "Nueva tarea";
    $("#taskId").value = task?.id || "";
    $("#taskTitle").value = task?.title || "";
    $("#taskArea").value = task?.area || "Toda la casa";
    $("#taskPhase").value = task?.phase || "Preparativos";
    $("#taskPriority").value = task?.priority || "media";
    $("#taskDuration").value = task?.duration || 30;
    $("#taskDate").value = task?.date || "";
    $("#taskNotes").value = task?.notes || "";
    $("#deleteTaskButton").classList.toggle("hidden", !task);
    $("#taskDialog").showModal();
  }

  function saveTask(event) {
    event.preventDefault();
    const id = $("#taskId").value;
    const existing = state.tasks.find((item) => item.id === id);
    const task = {
      id: id || uid("task"), title: $("#taskTitle").value.trim(), area: $("#taskArea").value.trim(), phase: $("#taskPhase").value,
      priority: $("#taskPriority").value, duration: Number($("#taskDuration").value) || 30, date: $("#taskDate").value,
      notes: $("#taskNotes").value.trim(), completed: existing?.completed || false, cleaning: existing?.cleaning || $("#taskPhase").value === "Limpieza"
    };
    if (existing) Object.assign(existing, task); else state.tasks.push(task);
    saveState(); $("#taskDialog").close(); renderAll(); showToast("Tarea guardada");
  }

  function openMilestoneDialog(id = "") {
    const item = state.milestones.find((entry) => entry.id === id);
    $("#milestoneDialogTitle").textContent = item ? "Editar hito" : "Nuevo hito";
    $("#milestoneId").value = item?.id || "";
    $("#milestoneTitle").value = item?.title || "";
    $("#milestoneDate").value = item?.date || "";
    $("#milestoneDescription").value = item?.description || "";
    $("#deleteMilestoneButton").classList.toggle("hidden", !item);
    $("#milestoneDialog").showModal();
  }

  function saveMilestone(event) {
    event.preventDefault();
    const id = $("#milestoneId").value;
    const existing = state.milestones.find((entry) => entry.id === id);
    const item = { id: id || uid("milestone"), title: $("#milestoneTitle").value.trim(), date: $("#milestoneDate").value, description: $("#milestoneDescription").value.trim() };
    if (existing) Object.assign(existing, item); else state.milestones.push(item);
    saveState(); $("#milestoneDialog").close(); renderDashboard(); renderTimeline(); showToast("Hito guardado");
  }

  function openBudgetDialog(id = "") {
    const item = state.budget.find((entry) => entry.id === id);
    $("#budgetDialogTitle").textContent = item ? "Editar partida" : "Nueva partida";
    $("#budgetId").value = item?.id || "";
    $("#budgetName").value = item?.name || "";
    $("#budgetPlan").value = item?.planned ?? 0;
    $("#budgetSpent").value = item?.actual ?? 0;
    $("#budgetPhase").value = item?.phase || "ahora";
    $("#budgetStatus").value = item?.status || "pendiente";
    $("#budgetActive").checked = item?.active ?? true;
    $("#budgetNotes").value = item?.notes || "";
    $("#deleteBudgetButton").classList.toggle("hidden", !item);
    $("#budgetDialog").showModal();
  }

  function saveBudgetItem(event) {
    event.preventDefault();
    const id = $("#budgetId").value;
    const existing = state.budget.find((entry) => entry.id === id);
    const item = { id: id || uid("budget"), name: $("#budgetName").value.trim(), planned: Number($("#budgetPlan").value) || 0, actual: Number($("#budgetSpent").value) || 0, phase: $("#budgetPhase").value, status: $("#budgetStatus").value, active: $("#budgetActive").checked, notes: $("#budgetNotes").value.trim() };
    if (existing) Object.assign(existing, item); else state.budget.push(item);
    saveState(); $("#budgetDialog").close(); renderBudget(); renderDashboard(); showToast("Partida guardada");
  }

  function setView(target) {
    $$(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === target));
    $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.target === target));
    history.replaceState(null, "", `#${target}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateConnection() {
    const badge = $("#connectionBadge");
    badge.textContent = navigator.onLine ? "En línea" : "Sin conexión";
    badge.classList.toggle("offline", !navigator.onLine);
  }

  function exportState() {
    const blob = new Blob([JSON.stringify({ app: "Casa Neus", exportedAt: new Date().toISOString(), data: state }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `casa-neus-copia-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("Copia exportada");
  }

  async function importState(file) {
    try {
      const payload = JSON.parse(await file.text());
      const incoming = payload.data || payload;
      if (!Array.isArray(incoming.tasks) || !Array.isArray(incoming.milestones) || !Array.isArray(incoming.budget)) throw new Error("Formato incorrecto");
      state = { ...clone(defaults), ...incoming };
      saveState(); renderAll(); showToast("Copia importada correctamente");
    } catch {
      showToast("No se ha podido importar esa copia");
    }
  }

  function openPhotoDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("casa-neus-photos", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("photos", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function resizePhoto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const image = new Image();
        image.onerror = reject;
        image.onload = () => {
          const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(image.width * scale);
          canvas.height = Math.round(image.height * scale);
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", .78));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function addPhotos(files) {
    const db = await openPhotoDb();
    for (const file of [...files].slice(0, 10)) {
      const dataUrl = await resizePhoto(file);
      await new Promise((resolve, reject) => {
        const request = db.transaction("photos", "readwrite").objectStore("photos").put({ id: uid("photo"), name: file.name, createdAt: new Date().toISOString(), dataUrl });
        request.onsuccess = resolve; request.onerror = () => reject(request.error);
      });
    }
    db.close(); await renderPhotos(); showToast("Fotos guardadas en este dispositivo");
  }

  async function renderPhotos() {
    if (!("indexedDB" in window)) return;
    try {
      const db = await openPhotoDb();
      const photos = await new Promise((resolve, reject) => {
        const request = db.transaction("photos").objectStore("photos").getAll();
        request.onsuccess = () => resolve(request.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        request.onerror = () => reject(request.error);
      });
      db.close();
      $("#photoGallery").innerHTML = photos.map((photo) => `<figure class="photo-card"><img src="${photo.dataUrl}" alt="${escapeHtml(photo.name || "Foto de la reforma")}"><small>${escapeHtml(formatDate(photo.createdAt.slice(0, 10), { day: "numeric", month: "short" }))}</small><button type="button" data-delete-photo="${escapeHtml(photo.id)}" aria-label="Eliminar foto">×</button></figure>`).join("");
      $$('[data-delete-photo]').forEach((button) => button.addEventListener("click", () => deletePhoto(button.dataset.deletePhoto)));
    } catch {
      $("#photoGallery").innerHTML = `<p class="muted">Las fotos no están disponibles en este navegador.</p>`;
    }
  }

  async function deletePhoto(id) {
    if (!confirm("¿Eliminar esta foto del dispositivo?")) return;
    const db = await openPhotoDb();
    await new Promise((resolve, reject) => {
      const request = db.transaction("photos", "readwrite").objectStore("photos").delete(id);
      request.onsuccess = resolve; request.onerror = () => reject(request.error);
    });
    db.close(); renderPhotos();
  }

  function bindEvents() {
    $$(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.target)));
    $$(".time-options button").forEach((button) => button.addEventListener("click", () => {
      $$(".time-options button").forEach((item) => item.classList.remove("selected")); button.classList.add("selected"); buildTodayPlan(Number(button.dataset.minutes));
    }));
    $("#taskSearch").addEventListener("input", renderTasks);
    $("#taskAreaFilter").addEventListener("change", renderTasks);
    $("#taskStatusFilter").addEventListener("change", renderTasks);
    $("#budgetPhaseFilter").addEventListener("change", renderBudget);
    $("#addTaskButton").addEventListener("click", () => openTaskDialog());
    $("#addMilestoneButton").addEventListener("click", () => openMilestoneDialog());
    $("#addBudgetButton").addEventListener("click", () => openBudgetDialog());
    $("#taskForm").addEventListener("submit", saveTask);
    $("#milestoneForm").addEventListener("submit", saveMilestone);
    $("#budgetForm").addEventListener("submit", saveBudgetItem);
    $$(".dialog-close").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
    $$('.app-dialog .secondary-button[value="cancel"]').forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
    $("#deleteTaskButton").addEventListener("click", () => {
      const id = $("#taskId").value; if (!id || !confirm("¿Eliminar esta tarea?")) return;
      state.tasks = state.tasks.filter((item) => item.id !== id); saveState(); $("#taskDialog").close(); renderAll();
    });
    $("#deleteMilestoneButton").addEventListener("click", () => {
      const id = $("#milestoneId").value; if (!id || !confirm("¿Eliminar este hito?")) return;
      state.milestones = state.milestones.filter((item) => item.id !== id); saveState(); $("#milestoneDialog").close(); renderAll();
    });
    $("#deleteBudgetButton").addEventListener("click", () => {
      const id = $("#budgetId").value; if (!id || !confirm("¿Eliminar esta partida?")) return;
      state.budget = state.budget.filter((item) => item.id !== id); saveState(); $("#budgetDialog").close(); renderAll();
    });
    $("#notes").addEventListener("input", () => {
      $("#noteSaved").textContent = "Guardando…"; clearTimeout(noteTimer);
      noteTimer = setTimeout(() => { state.notes = $("#notes").value; saveState(); $("#noteSaved").textContent = "Guardado"; }, 450);
    });
    $("#exportButton").addEventListener("click", exportState);
    $("#importInput").addEventListener("change", (event) => { if (event.target.files[0]) importState(event.target.files[0]); event.target.value = ""; });
    $("#resetButton").addEventListener("click", () => {
      if (!confirm("¿Restaurar las tareas, fechas y presupuesto iniciales? Se perderán los cambios de texto de este dispositivo.")) return;
      state = clone(defaults); saveState(); renderAll(); showToast("Datos iniciales restaurados");
    });
    $("#photoInput").addEventListener("change", async (event) => { if (event.target.files.length) await addPhotos(event.target.files); event.target.value = ""; });
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredInstallPrompt = event; $("#installButton").classList.remove("hidden"); });
    $("#installButton").addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $("#installButton").classList.add("hidden");
    });
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents(); renderAll(); renderPhotos(); updateConnection(); registerServiceWorker();
    const initialView = location.hash.slice(1);
    if (["home", "plan", "tasks", "budget", "more"].includes(initialView)) setView(initialView);
  });
})();
