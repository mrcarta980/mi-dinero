const STORAGE_KEY = "mi-dinero-local-v2";

const defaultCategories = [
  "Ingresos",
  "Vivienda",
  "Servicios",
  "Comida",
  "Transporte",
  "Deudas",
  "Salud",
  "Familia",
  "Ahorro",
  "Ocio",
  "Educacion",
  "Otros",
];

const defaultPaymentTypes = ["Gasto fijo", "Variable", "Deuda", "Ahorro", "Imprevisto"];
const transferCategory = "Transferencia interna";
const owners = ["Pacha", "Aleja"];
const historicalOwners = [...owners, "Sin asignar"];

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const state = loadState();
const editing = {
  movementId: null,
  paymentId: null,
};

const els = {
  monthFilter: document.querySelector("#monthFilter"),
  fortnightFilter: document.querySelector("#fortnightFilter"),
  movementForm: document.querySelector("#movementForm"),
  paymentForm: document.querySelector("#paymentForm"),
  movementRows: document.querySelector("#movementRows"),
  historyDetailFilter: document.querySelector("#historyDetailFilter"),
  historyOwnerFilter: document.querySelector("#historyOwnerFilter"),
  paymentCards: document.querySelector("#paymentCards"),
  movementFormTitle: document.querySelector("#movementFormTitle"),
  paymentFormTitle: document.querySelector("#paymentFormTitle"),
  movementSubmit: document.querySelector("#movementSubmit"),
  paymentSubmit: document.querySelector("#paymentSubmit"),
  cancelMovementEdit: document.querySelector("#cancelMovementEdit"),
  cancelPaymentEdit: document.querySelector("#cancelPaymentEdit"),
  paymentSelect: document.querySelector("#paymentSelect"),
  movementCategory: document.querySelector("#movementCategory"),
  paymentCategory: document.querySelector("#paymentCategory"),
  paymentType: document.querySelector("#paymentType"),
  targetOwner: document.querySelector("#targetOwner"),
  transferTargetField: document.querySelector("#transferTargetField"),
  categoryForm: document.querySelector("#categoryForm"),
  categoryName: document.querySelector("#categoryName"),
  categoryList: document.querySelector("#categoryList"),
  typeForm: document.querySelector("#typeForm"),
  typeName: document.querySelector("#typeName"),
  typeList: document.querySelector("#typeList"),
  incomeTotal: document.querySelector("#incomeTotal"),
  expenseTotal: document.querySelector("#expenseTotal"),
  realBalance: document.querySelector("#realBalance"),
  freeMoney: document.querySelector("#freeMoney"),
  completedPayments: document.querySelector("#completedPayments"),
  activeDebtTotal: document.querySelector("#activeDebtTotal"),
  topExpense: document.querySelector("#topExpense"),
  dashboardStatus: document.querySelector("#dashboardStatus"),
  fortnightDashboard: document.querySelector("#fortnightDashboard"),
  ownerDashboard: document.querySelector("#ownerDashboard"),
  categorySummary: document.querySelector("#categorySummary"),
  emptyTemplate: document.querySelector("#emptyTemplate"),
  resetData: document.querySelector("#resetData"),
};

boot();
registerServiceWorker();

function boot() {
  els.monthFilter.value = currentMonth();
  field(els.movementForm, "date").value = today();
  updateDetectedPeriod();

  updateSelects();
  bindEvents();
  render();
  renderSettings();
  requestAnimationFrame(resetHorizontalScroll);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!["https:", "http:"].includes(window.location.protocol)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // La app sigue funcionando aunque el modo instalable no se registre.
    });
  });
}

function bindEvents() {
  window.addEventListener("resize", resetHorizontalScroll);

  els.movementForm.addEventListener("submit", saveMovement);
  els.paymentForm.addEventListener("submit", savePayment);
  els.monthFilter.addEventListener("change", render);
  els.fortnightFilter.addEventListener("change", render);
  els.historyDetailFilter.addEventListener("input", render);
  els.historyOwnerFilter.addEventListener("change", render);
  els.categoryForm.addEventListener("submit", addCategory);
  els.typeForm.addEventListener("submit", addPaymentType);

  field(els.movementForm, "date").addEventListener("change", () => {
    updateDetectedPeriod();
  });

  field(els.movementForm, "owner").addEventListener("change", syncTransferTarget);

  Array.from(els.movementForm.elements.namedItem("kind")).forEach((radio) => {
    radio.addEventListener("change", syncMovementMode);
  });

  els.movementRows.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-movement]");
    const deleteButton = event.target.closest("[data-delete-movement]");

    if (editButton) {
      startEditMovement(editButton.dataset.editMovement);
      return;
    }

    if (deleteButton) {
      state.movements = state.movements.filter((item) => item.id !== deleteButton.dataset.deleteMovement);
      if (editing.movementId === deleteButton.dataset.deleteMovement) cancelMovementEdit();
      persist();
      render();
    }
  });

  els.paymentCards.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-payment]");
    const deleteButton = event.target.closest("[data-delete-payment]");

    if (editButton) {
      startEditPayment(editButton.dataset.editPayment);
      return;
    }

    if (deleteButton) {
      state.payments = state.payments.filter((item) => item.id !== deleteButton.dataset.deletePayment);
      state.movements = state.movements.map((item) => (
        item.paymentId === deleteButton.dataset.deletePayment ? { ...item, paymentId: "", paymentName: "" } : item
      ));
      if (editing.paymentId === deleteButton.dataset.deletePayment) cancelPaymentEdit();
      persist();
      render();
    }
  });

  els.cancelMovementEdit.addEventListener("click", cancelMovementEdit);
  els.cancelPaymentEdit.addEventListener("click", cancelPaymentEdit);

  els.resetData.addEventListener("click", () => {
    if (!confirm("Borrar todos los datos locales de esta app?")) return;
    state.movements = [];
    state.payments = [];
    persist();
    render();
  });

  els.categoryList.addEventListener("click", (event) => handleSettingsClick(event, "category"));
  els.typeList.addEventListener("click", (event) => handleSettingsClick(event, "type"));
}

function resetHorizontalScroll() {
  document.documentElement.scrollLeft = 0;
  document.body.scrollLeft = 0;
  const scrollingElement = document.scrollingElement;
  if (scrollingElement) scrollingElement.scrollLeft = 0;
}

function saveMovement(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const kind = data.get("kind");
  const paymentId = kind === "Gasto" ? data.get("paymentId") : "";
  const payment = state.payments.find((item) => item.id === paymentId);
  const owner = data.get("owner");
  const targetOwner = kind === "Transferencia" ? data.get("targetOwner") : "";

  if (kind === "Transferencia" && owner === targetOwner) {
    alert("En una transferencia, quien entrega y quien recibe deben ser diferentes.");
    return;
  }

  const movementData = {
    id: crypto.randomUUID(),
    date: data.get("date"),
    month: data.get("date").slice(0, 7),
    fortnight: periodFromDate(data.get("date")),
    kind,
    description: data.get("description").trim(),
    category: movementCategoryFor(kind, data),
    amount: Number(data.get("amount")),
    owner,
    targetOwner,
    note: data.get("note").trim(),
    paymentId,
    paymentName: payment ? payment.name : "",
  };

  if (editing.movementId) {
    state.movements = state.movements.map((item) => (
      item.id === editing.movementId ? { ...movementData, id: editing.movementId } : item
    ));
  } else {
    state.movements.push(movementData);
  }

  resetMovementForm();
  persist();
  render();
}

function savePayment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);

  const paymentData = {
    id: crypto.randomUUID(),
    name: data.get("name").trim(),
    type: data.get("type"),
    category: data.get("category"),
    monthlyAmount: Number(data.get("monthlyAmount")),
    debtTotal: Number(data.get("debtTotal")) || 0,
    dueDay: Number(data.get("dueDay")),
    priority: data.get("priority"),
    note: data.get("note").trim(),
    active: true,
    createdAt: new Date().toISOString(),
  };

  if (editing.paymentId) {
    const previous = state.payments.find((item) => item.id === editing.paymentId);
    state.payments = state.payments.map((item) => (
      item.id === editing.paymentId
        ? { ...paymentData, id: editing.paymentId, createdAt: item.createdAt }
        : item
    ));
    state.movements = state.movements.map((item) => (
      item.paymentId === editing.paymentId
        ? { ...item, paymentName: paymentData.name || previous?.name || "" }
        : item
    ));
  } else {
    state.payments.push(paymentData);
  }

  resetPaymentForm();
  persist();
  render();
}

function startEditMovement(id) {
  const movement = state.movements.find((item) => item.id === id);
  if (!movement) return;

  editing.movementId = id;
  const form = els.movementForm;
  form.elements.namedItem("kind").value = movement.kind;
  field(form, "date").value = movement.date;
  updateDetectedPeriod();
  field(form, "description").value = movement.description;
  field(form, "category").value = movement.category;
  field(form, "paymentId").value = movement.paymentId || "";
  field(form, "amount").value = movement.amount;
  field(form, "owner").value = owners.includes(movement.owner) ? movement.owner : "Pacha";
  field(form, "targetOwner").value = owners.includes(movement.targetOwner) ? movement.targetOwner : otherOwner(field(form, "owner").value);
  field(form, "note").value = movement.note || "";
  syncMovementMode();
  setMovementEditMode(true);
  document.querySelector("#registrar").scrollIntoView({ behavior: "smooth", block: "start" });
}

function startEditPayment(id) {
  const payment = state.payments.find((item) => item.id === id);
  if (!payment) return;

  editing.paymentId = id;
  const form = els.paymentForm;
  field(form, "name").value = payment.name;
  field(form, "type").value = payment.type;
  field(form, "category").value = payment.category;
  field(form, "monthlyAmount").value = payment.monthlyAmount;
  field(form, "debtTotal").value = payment.debtTotal || "";
  field(form, "dueDay").value = payment.dueDay;
  field(form, "priority").value = payment.priority;
  field(form, "note").value = payment.note || "";
  setPaymentEditMode(true);
  document.querySelector("#registrar").scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelMovementEdit() {
  resetMovementForm();
  render();
}

function cancelPaymentEdit() {
  resetPaymentForm();
  render();
}

function resetMovementForm() {
  editing.movementId = null;
  els.movementForm.reset();
  field(els.movementForm, "date").value = today();
  updateDetectedPeriod();
  els.movementForm.elements.namedItem("kind").value = "Ingreso";
  field(els.movementForm, "owner").value = "Pacha";
  field(els.movementForm, "targetOwner").value = "Aleja";
  syncMovementMode();
  setMovementEditMode(false);
}

function resetPaymentForm() {
  editing.paymentId = null;
  els.paymentForm.reset();
  field(els.paymentForm, "type").value = getPaymentTypes()[0] || "Gasto fijo";
  field(els.paymentForm, "debtTotal").value = "";
  field(els.paymentForm, "priority").value = "Media";
  setPaymentEditMode(false);
}

function setMovementEditMode(isEditing) {
  els.movementFormTitle.textContent = isEditing ? "Editar movimiento" : "Ingresos y salidas";
  els.movementSubmit.lastChild.textContent = isEditing ? " Guardar cambios" : " Guardar movimiento";
  els.cancelMovementEdit.classList.toggle("hidden", !isEditing);
}

function setPaymentEditMode(isEditing) {
  els.paymentFormTitle.textContent = isEditing ? "Editar obligacion" : "Crear obligacion";
  els.paymentSubmit.lastChild.textContent = isEditing ? " Guardar cambios" : " Guardar obligacion";
  els.cancelPaymentEdit.classList.toggle("hidden", !isEditing);
}

function render() {
  updateSelects();
  const month = els.monthFilter.value;
  const fortnight = els.fortnightFilter.value;
  const movements = filteredMovements(month, fortnight);
  const monthMovements = filteredMovements(month, "all");
  const activePayments = state.payments.filter((item) => item.active);
  const paymentProgress = activePayments.map((payment) => getPaymentProgress(payment, month));
  const carryByOwner = getCarryByOwner(month);
  const totalCarry = sum(Object.values(carryByOwner).map((amount) => ({ amount })));

  const income = sum(movements.filter((item) => item.kind === "Ingreso"));
  const expenses = sum(movements.filter((item) => item.kind === "Gasto"));
  const monthBalance = sum(monthMovements.filter((item) => item.kind === "Ingreso")) -
    sum(monthMovements.filter((item) => item.kind === "Gasto"));
  const realBalance = totalCarry + monthBalance;

  els.incomeTotal.textContent = currency.format(income);
  els.expenseTotal.textContent = currency.format(expenses);
  els.realBalance.textContent = currency.format(realBalance);

  renderPaymentSelect(activePayments);
  renderDashboard(month, monthMovements, paymentProgress, realBalance, carryByOwner);
  renderMovements(filterHistoryMovements(movements));
  renderPayments(paymentProgress);
  renderCategorySummary(monthMovements, paymentProgress);
  syncMovementMode();
}

function renderDashboard(month, monthMovements, paymentProgress, realBalance, carryByOwner) {
  const monthIncome = sum(monthMovements.filter((item) => item.kind === "Ingreso"));
  const monthExpenses = sum(monthMovements.filter((item) => item.kind === "Gasto"));
  const completed = paymentProgress.filter((item) => item.remaining === 0).length;
  const totalPayments = paymentProgress.length;
  const activeDebtTotal = sum(paymentProgress
    .filter((item) => item.isDebt)
    .map((item) => ({ amount: item.debtRemaining })));
  const expensesByCategory = groupExpensesByCategory(monthMovements);
  const topExpense = Object.entries(expensesByCategory).sort((a, b) => b[1] - a[1])[0];

  els.freeMoney.textContent = currency.format(realBalance);
  els.completedPayments.textContent = `${completed} / ${totalPayments}`;
  els.activeDebtTotal.textContent = currency.format(activeDebtTotal);
  els.topExpense.textContent = topExpense ? `${topExpense[0]} · ${currency.format(topExpense[1])}` : "Sin datos";
  els.dashboardStatus.textContent = realBalance >= 0 ? "En control" : "Revisar";
  els.dashboardStatus.classList.toggle("bad", realBalance < 0);
  renderOwnerDashboard(month, monthMovements, carryByOwner);

  const q1 = totalsByFortnight(monthMovements, "Q1");
  const q2 = totalsByFortnight(monthMovements, "Q2");
  const other = totalsByFortnight(monthMovements, "Otro");
  const maxTotal = Math.max(q1.income, q1.expense, q2.income, q2.expense, other.income, other.expense, 1);

  els.fortnightDashboard.innerHTML = [dashboardBar("Q1 30-5 ingresos", q1.income, maxTotal, "income"),
    dashboardBar("Q1 30-5 salidas", q1.expense, maxTotal, "expense"),
    dashboardBar("Q2 15-20 ingresos", q2.income, maxTotal, "income"),
    dashboardBar("Q2 15-20 salidas", q2.expense, maxTotal, "expense"),
    dashboardBar("Fuera de corte", other.expense, maxTotal, "expense")].join("");

  if (monthIncome === 0 && monthExpenses === 0) {
    els.fortnightDashboard.innerHTML = `<div class="empty small">Sin datos para este mes.</div>`;
  }
}

function renderOwnerDashboard(month, monthMovements, carryByOwner) {
  const rows = historicalOwners.map((owner) => {
    const ownerMovements = monthMovements.filter((item) => movementTouchesOwner(item, owner));
    const carry = carryByOwner[owner] || 0;
    if (owner === "Sin asignar" && ownerMovements.length === 0 && carry === 0) return "";
    const totals = ownerMovementTotals(monthMovements, owner);
    const transferNet = totals.transferIn - totals.transferOut;
    const available = carry + totals.income - totals.expense + transferNet;
    return `
      <div class="owner-card ${ownerClass(owner)}">
        <span>${owner}</span>
        <div class="owner-metrics">
          <div><small>Saldo anterior</small><b>${currency.format(carry)}</b></div>
          <div><small>Ingresos</small><b>${currency.format(totals.income)}</b></div>
          <div><small>Salidas</small><b>${currency.format(totals.expense)}</b></div>
          <div><small>Transferencias</small><b>${currency.format(transferNet)}</b></div>
          <div><small>Disponible</small><b>${currency.format(available)}</b></div>
        </div>
      </div>
    `;
  });

  els.ownerDashboard.innerHTML = rows.join("");
}

function renderPaymentSelect(payments) {
  const current = els.paymentSelect.value;
  els.paymentSelect.innerHTML = `<option value="">Sin asociar</option>`;

  for (const payment of payments) {
    const option = document.createElement("option");
    option.value = payment.id;
    option.textContent = payment.name;
    els.paymentSelect.append(option);
  }

  els.paymentSelect.value = current;
}

function renderMovements(movements) {
  els.movementRows.innerHTML = "";

  if (!movements.length) {
    els.movementRows.append(els.emptyTemplate.content.cloneNode(true));
    return;
  }

  for (const movement of movements.sort((a, b) => b.date.localeCompare(a.date))) {
    const row = document.createElement("tr");
    const sign = movement.kind === "Ingreso" ? "+" : movement.kind === "Transferencia" ? "" : "-";
    const amountClass = movement.kind === "Ingreso" ? "positive" : movement.kind === "Transferencia" ? "transfer" : "negative";
    const linked = movement.paymentName ? `<small>${escapeHtml(movement.paymentName)}</small>` : "";
    const owner = movement.owner || "Sin asignar";
    const ownerLabel = movement.kind === "Transferencia"
      ? `${escapeHtml(owner)} -> ${escapeHtml(movement.targetOwner || "Sin asignar")}`
      : escapeHtml(owner);

    row.innerHTML = `
      <td>${formatDate(movement.date)}</td>
      <td><span class="tag">${movement.fortnight}</span></td>
      <td>${movement.kind}</td>
      <td><span class="owner-pill ${ownerClass(owner)}">${ownerLabel}</span></td>
      <td>
        <strong>${escapeHtml(movement.description)}</strong>
        ${linked}
      </td>
      <td class="${amountClass}">${sign}${currency.format(movement.amount)}</td>
      <td class="row-actions">
        <button class="icon" data-edit-movement="${movement.id}" type="button" title="Editar" aria-label="Editar movimiento">${iconSvg("edit")}</button>
        <button class="icon" data-delete-movement="${movement.id}" type="button" title="Eliminar" aria-label="Eliminar movimiento">${iconSvg("trash")}</button>
      </td>
    `;
    els.movementRows.append(row);
  }
}

function filterHistoryMovements(movements) {
  const detail = normalizeText(els.historyDetailFilter.value);
  const owner = els.historyOwnerFilter.value;

  return movements.filter((movement) => {
    const movementOwner = movement.owner || "Sin asignar";
    const movementTarget = movement.targetOwner || "";
    const searchable = normalizeText(`${movement.description} ${movement.paymentName || ""} ${movementOwner} ${movementTarget}`);
    const matchesDetail = !detail || searchable.includes(detail);
    const matchesOwner = owner === "all" || movementOwner === owner || movementTarget === owner;
    return matchesDetail && matchesOwner;
  });
}

function renderPayments(progressItems) {
  els.paymentCards.innerHTML = "";

  if (!progressItems.length) {
    els.paymentCards.innerHTML = `<div class="empty">No tienes obligaciones creadas.</div>`;
    return;
  }

  for (const item of progressItems) {
    const percent = item.progressTarget ? Math.min(100, Math.round((item.progressPaid / item.progressTarget) * 100)) : 0;
    const status = item.monthlyRemaining === 0 ? "Cuota del mes completa" : item.aparted > 0 ? "Pago parcial" : "Pendiente";
    const dueLabel = item.payment.dueDay >= 30 || item.payment.dueDay <= 5
      ? "vence en corte Q1"
      : item.payment.dueDay >= 15 && item.payment.dueDay <= 20
        ? "vence en corte Q2"
        : "vence fuera de corte";

    const card = document.createElement("article");
    card.className = "payment-card";
    card.innerHTML = `
      <div class="card-head">
        <div>
          <strong>${escapeHtml(item.payment.name)}</strong>
        <span>${item.payment.type} · dia ${item.payment.dueDay} · ${dueLabel}</span>
        </div>
        <div class="row-actions">
          <button class="icon" data-edit-payment="${item.payment.id}" type="button" title="Editar" aria-label="Editar obligacion">${iconSvg("edit")}</button>
          <button class="icon" data-delete-payment="${item.payment.id}" type="button" title="Eliminar" aria-label="Eliminar obligacion">${iconSvg("trash")}</button>
        </div>
      </div>
      <div class="progress">
        <div class="progress-bar" style="width:${percent}%"></div>
      </div>
      <div class="payment-numbers">
        ${paymentNumbers(item)}
      </div>
      <div class="hint">
        ${status}. Si registras otro abono asociado, baja el saldo correspondiente.
      </div>
    `;
    els.paymentCards.append(card);
  }
}

function paymentNumbers(item) {
  if (item.isDebt) {
    return `
      <span>Cuota mes: <b>${currency.format(item.aparted)} / ${currency.format(item.monthlyTarget)}</b></span>
      <span>Pagado total: <b>${currency.format(item.totalPaid)}</b></span>
      <span>Saldo deuda: <b>${currency.format(item.debtRemaining)}</b></span>
    `;
  }

  return `
    <span>Pagado: <b>${currency.format(item.aparted)}</b></span>
    <span>Saldo pendiente: <b>${currency.format(item.monthlyRemaining)}</b></span>
  `;
}

function renderCategorySummary(monthMovements, progressItems) {
  const expenses = monthMovements.filter((item) => item.kind === "Gasto");
  const byCategory = groupExpensesByCategory(expenses);

  const rows = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => summaryRow(category, amount, "gastado"));

  const pending = progressItems
    .filter((item) => item.remaining > 0)
    .map((item) => summaryRow(item.payment.name, item.remaining, "saldo pendiente"));

  els.categorySummary.innerHTML = [...rows, ...pending].join("") || `<div class="empty">Sin gastos en este mes.</div>`;
}

function renderSettings() {
  renderSettingsList(els.categoryList, getCategories(), "category");
  renderSettingsList(els.typeList, getPaymentTypes(), "type");
}

function renderSettingsList(container, items, kind) {
  container.innerHTML = items.map((item) => `
    <div class="settings-item">
      <span>${escapeHtml(item)}</span>
      <div class="row-actions">
        <button class="icon" data-edit-setting="${escapeHtml(item)}" data-kind="${kind}" type="button" title="Editar" aria-label="Editar">${iconSvg("edit")}</button>
        <button class="icon" data-delete-setting="${escapeHtml(item)}" data-kind="${kind}" type="button" title="Eliminar" aria-label="Eliminar">${iconSvg("trash")}</button>
      </div>
    </div>
  `).join("");
}

function addCategory(event) {
  event.preventDefault();
  const name = cleanName(els.categoryName.value);
  if (!name) return;
  state.settings.categories = addUnique(getCategories(), name);
  els.categoryName.value = "";
  afterSettingsChange();
}

function addPaymentType(event) {
  event.preventDefault();
  const name = cleanName(els.typeName.value);
  if (!name) return;
  state.settings.paymentTypes = addUnique(getPaymentTypes(), name);
  els.typeName.value = "";
  afterSettingsChange();
}

function handleSettingsClick(event, expectedKind) {
  const editButton = event.target.closest("[data-edit-setting]");
  const deleteButton = event.target.closest("[data-delete-setting]");
  const button = editButton || deleteButton;
  if (!button || button.dataset.kind !== expectedKind) return;

  const current = button.dataset.editSetting || button.dataset.deleteSetting;
  if (editButton) {
    editSetting(expectedKind, current);
    return;
  }
  deleteSetting(expectedKind, current);
}

function editSetting(kind, current) {
  if (kind === "category" && current === "Ingresos") {
    alert("Ingresos es una categoria base para registrar entradas.");
    return;
  }
  const list = kind === "category" ? getCategories() : getPaymentTypes();
  const next = cleanName(prompt("Nuevo nombre", current));
  if (!next || next === current) return;
  if (list.some((item) => normalizeText(item) === normalizeText(next))) {
    alert("Ese nombre ya existe.");
    return;
  }

  const updated = list.map((item) => item === current ? next : item);
  if (kind === "category") {
    state.settings.categories = updated;
    state.payments = state.payments.map((payment) => payment.category === current ? { ...payment, category: next } : payment);
    state.movements = state.movements.map((movement) => (
      movement.category === current && movement.kind !== "Transferencia" ? { ...movement, category: next } : movement
    ));
  } else {
    state.settings.paymentTypes = updated;
    state.payments = state.payments.map((payment) => payment.type === current ? { ...payment, type: next } : payment);
  }
  afterSettingsChange();
}

function deleteSetting(kind, current) {
  const list = kind === "category" ? getCategories() : getPaymentTypes();
  if (kind === "category" && current === "Ingresos") {
    alert("Ingresos es una categoria base para registrar entradas.");
    return;
  }
  if (list.length <= 1) {
    alert("Debe quedar al menos una opcion.");
    return;
  }
  if (!confirm(`Eliminar "${current}" de las opciones nuevas? Los registros existentes se conservan.`)) return;

  if (kind === "category") {
    state.settings.categories = list.filter((item) => item !== current);
  } else {
    state.settings.paymentTypes = list.filter((item) => item !== current);
  }
  afterSettingsChange();
}

function afterSettingsChange() {
  persist();
  updateSelects();
  renderSettings();
  render();
}

function totalsByFortnight(movements, fortnight) {
  const items = movements.filter((item) => item.fortnight === fortnight);
  return {
    income: sum(items.filter((item) => item.kind === "Ingreso")),
    expense: sum(items.filter((item) => item.kind === "Gasto")),
  };
}

function groupExpensesByCategory(movements) {
  return movements
    .filter((item) => item.kind === "Gasto")
    .reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + item.amount;
      return acc;
    }, {});
}

function dashboardBar(label, amount, maxTotal, tone) {
  const width = Math.max(4, Math.round((amount / maxTotal) * 100));
  return `
    <div class="dash-bar ${tone}">
      <div class="bar-copy">
        <span>${label}</span>
        <b>${currency.format(amount)}</b>
      </div>
      <div class="mini-track"><div style="width:${width}%"></div></div>
    </div>
  `;
}

function getPaymentProgress(payment, month) {
  const relatedMonth = state.movements.filter((item) => (
    item.kind === "Gasto" &&
    item.paymentId === payment.id &&
    item.month === month
  ));
  const relatedAll = state.movements.filter((item) => (
    item.kind === "Gasto" &&
    item.paymentId === payment.id
  ));
  const aparted = sum(relatedMonth);
  const totalPaid = sum(relatedAll);
  const isDebt = isDebtPayment(payment);
  const monthlyTarget = payment.monthlyAmount;
  const debtTotal = isDebt ? Number(payment.debtTotal || payment.monthlyAmount || 0) : 0;
  const monthlyRemaining = Math.max(0, monthlyTarget - aparted);
  const debtRemaining = isDebt ? Math.max(0, debtTotal - totalPaid) : 0;

  return {
    payment,
    aparted,
    totalPaid,
    isDebt,
    monthlyTarget,
    debtTotal,
    debtRemaining,
    monthlyRemaining,
    progressPaid: isDebt ? totalPaid : aparted,
    progressTarget: isDebt ? debtTotal : monthlyTarget,
    remaining: monthlyRemaining,
  };
}

function getCarryByOwner(month) {
  return historicalOwners.reduce((acc, owner) => {
    const previousMovements = state.movements.filter((item) => (
      item.month < month &&
      movementTouchesOwner(item, owner)
    ));
    const totals = ownerMovementTotals(previousMovements, owner);
    acc[owner] = totals.income - totals.expense + totals.transferIn - totals.transferOut;
    return acc;
  }, {});
}

function filteredMovements(month, fortnight) {
  return state.movements.filter((item) => (
    item.month === month &&
    (fortnight === "all" || item.fortnight === fortnight)
  ));
}

function updateDetectedPeriod() {
  const date = field(els.movementForm, "date").value || today();
  field(els.movementForm, "periodLabel").value = periodLabel(periodFromDate(date));
}

function syncMovementMode() {
  const kind = new FormData(els.movementForm).get("kind");
  const isIncome = kind === "Ingreso";
  const isTransfer = kind === "Transferencia";
  els.movementCategory.disabled = isIncome || isTransfer;
  els.paymentSelect.disabled = isIncome || isTransfer;
  els.transferTargetField.classList.toggle("hidden", !isTransfer);
  if (kind === "Ingreso") {
    els.movementCategory.value = "Ingresos";
    els.paymentSelect.value = "";
  }
  if (isTransfer) {
    els.movementCategory.value = "";
    els.paymentSelect.value = "";
    syncTransferTarget();
  }
}

function syncTransferTarget() {
  const owner = field(els.movementForm, "owner").value;
  const target = field(els.movementForm, "targetOwner");
  if (!target.value || target.value === owner) target.value = otherOwner(owner);
}

function movementCategoryFor(kind, data) {
  if (kind === "Ingreso") return "Ingresos";
  if (kind === "Transferencia") return transferCategory;
  return data.get("category");
}

function ownerMovementTotals(movements, owner) {
  return movements.reduce((acc, movement) => {
    if (movement.kind === "Ingreso" && movement.owner === owner) acc.income += Number(movement.amount || 0);
    if (movement.kind === "Gasto" && movement.owner === owner) acc.expense += Number(movement.amount || 0);
    if (movement.kind === "Transferencia" && movement.owner === owner) acc.transferOut += Number(movement.amount || 0);
    if (movement.kind === "Transferencia" && movement.targetOwner === owner) acc.transferIn += Number(movement.amount || 0);
    return acc;
  }, { income: 0, expense: 0, transferIn: 0, transferOut: 0 });
}

function movementTouchesOwner(movement, owner) {
  return (movement.owner || "Sin asignar") === owner || movement.targetOwner === owner;
}

function isDebtPayment(payment) {
  return Number(payment.debtTotal || 0) > 0 || normalizeText(payment.type).includes("deuda");
}

function summaryRow(label, amount, caption) {
  return `
    <div class="summary-row">
      <div>
        <strong>${escapeHtml(label)}</strong>
        <span>${caption}</span>
      </div>
      <b>${currency.format(amount)}</b>
    </div>
  `;
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        movements: normalizeMovements(parsed.movements || []),
        payments: normalizePayments(parsed.payments || []),
        settings: normalizeSettings(parsed.settings),
      };
    } catch {
      return emptyState();
    }
  }
  return seedState();
}

function seedState() {
  const month = currentMonth();
  const arriendoId = crypto.randomUUID();
  const serviciosId = crypto.randomUUID();

  return {
    settings: normalizeSettings(),
    payments: [
      {
        id: arriendoId,
        name: "Arriendo",
        type: "Gasto fijo",
        category: "Vivienda",
        monthlyAmount: 850000,
        debtTotal: 0,
        dueDay: 30,
        priority: "Alta",
        note: "Se controla por abonos asociados",
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: serviciosId,
        name: "Servicios publicos",
        type: "Gasto fijo",
        category: "Servicios",
        monthlyAmount: 220000,
        debtTotal: 0,
        dueDay: 30,
        priority: "Media",
        note: "",
        active: true,
        createdAt: new Date().toISOString(),
      },
    ],
    movements: [
      createMovement(`${month}-15`, "Q2", "Ingreso", "Ingreso del corte", "Ingresos", 1962500, "", ""),
      createMovement(`${month}-15`, "Q2", "Gasto", "Abono arriendo", "Vivienda", 425000, "Pago parcial", arriendoId, "Arriendo"),
    ],
  };
}

function createMovement(date, fortnight, kind, description, category, amount, note, paymentId, paymentName = "") {
  return {
    id: crypto.randomUUID(),
    date,
    month: date.slice(0, 7),
    fortnight,
    kind,
    description,
    category,
    amount,
    owner: "Pacha",
    targetOwner: "",
    note,
    paymentId,
    paymentName,
  };
}

function normalizeMovements(movements) {
  return movements.map((item) => ({
    ...item,
    month: item.date ? item.date.slice(0, 7) : item.month,
    fortnight: item.date ? periodFromDate(item.date) : item.fortnight,
    kind: item.kind || "Gasto",
    owner: normalizeOwner(item.owner),
    targetOwner: item.kind === "Transferencia" ? normalizeOwner(item.targetOwner) : "",
  }));
}

function normalizePayments(payments) {
  return payments.map((payment) => ({
    ...payment,
    monthlyAmount: Number(payment.monthlyAmount || 0),
    debtTotal: normalizeText(payment.type).includes("deuda")
      ? Number(payment.debtTotal || payment.monthlyAmount || 0)
      : Number(payment.debtTotal || 0),
    dueDay: Number(payment.dueDay || 30),
    active: payment.active !== false,
  }));
}

function emptyState() {
  return { movements: [], payments: [], settings: normalizeSettings() };
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function fillSelect(select, items) {
  const current = select.value;
  select.innerHTML = "";
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    select.append(option);
  }
  if (items.includes(current)) select.value = current;
}

function updateSelects() {
  const movementCategory = els.movementCategory.value;
  const paymentCategory = els.paymentCategory.value;
  const paymentType = els.paymentType.value;
  const targetOwner = els.targetOwner.value;
  const paymentCategories = getCategories().filter((item) => item !== "Ingresos");

  fillSelect(els.movementCategory, getCategories());
  fillSelect(els.paymentCategory, paymentCategories.length ? paymentCategories : getCategories());
  fillSelect(els.paymentType, getPaymentTypes());
  fillSelect(els.targetOwner, owners);

  if (movementCategory && getCategories().includes(movementCategory)) els.movementCategory.value = movementCategory;
  if (paymentCategory && getCategories().includes(paymentCategory)) els.paymentCategory.value = paymentCategory;
  if (paymentType && getPaymentTypes().includes(paymentType)) els.paymentType.value = paymentType;
  if (targetOwner && owners.includes(targetOwner)) els.targetOwner.value = targetOwner;
}

function field(form, name) {
  return form.elements.namedItem(name);
}

function sum(items) {
  return items.reduce((total, item) => total + Number(item.amount || item.remaining || 0), 0);
}

function getCategories() {
  return state.settings?.categories?.length ? state.settings.categories : defaultCategories;
}

function getPaymentTypes() {
  return state.settings?.paymentTypes?.length ? state.settings.paymentTypes : defaultPaymentTypes;
}

function normalizeSettings(settings = {}) {
  settings = settings || {};
  return {
    categories: addUniqueList(["Ingresos", ...(settings.categories || defaultCategories)]),
    paymentTypes: addUniqueList(settings.paymentTypes || defaultPaymentTypes),
  };
}

function addUnique(items, name) {
  return addUniqueList([...items, name]);
}

function addUniqueList(items) {
  return items.reduce((acc, item) => {
    const name = cleanName(item);
    if (name && !acc.some((existing) => normalizeText(existing) === normalizeText(name))) acc.push(name);
    return acc;
  }, []);
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function otherOwner(owner) {
  return owners.find((item) => item !== owner) || owners[0];
}

function currentMonth() {
  return today().slice(0, 7);
}

function today() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60000;
  return new Date(now - timezoneOffset).toISOString().slice(0, 10);
}

function periodFromDate(date) {
  const day = Number(date.slice(-2));
  if (day >= 30 || day <= 5) return "Q1";
  if (day >= 15 && day <= 20) return "Q2";
  return "Otro";
}

function periodLabel(period) {
  if (period === "Q1") return "Q1 - 30 al 5";
  if (period === "Q2") return "Q2 - 15 al 20";
  return "Fuera de corte";
}

function ownerClass(owner) {
  if (owner === "Pacha") return "owner-one";
  if (owner === "Aleja") return "owner-two";
  return "owner-unassigned";
}

function iconSvg(name) {
  const paths = {
    edit: "M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",
    trash: "M3 6h18 M8 6V4h8v2 m-9 4 1 10h8l1-10",
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"></path></svg>`;
}

function formatDate(date) {
  const [year, month, day] = date.split("-");
  return `${Number(day)}/${month}/${year.slice(-2)}`;
}

function normalizeOwner(owner) {
  if (owner === "Persona 1") return "Pacha";
  if (owner === "Persona 2") return "Aleja";
  if (owners.includes(owner)) return owner;
  return "Sin asignar";
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
