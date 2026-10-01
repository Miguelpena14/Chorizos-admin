'use strict';
(() => {
  const STORAGE_KEY = 'chorizos_manager_v1';
  const PRICES = { '5': 17000, '7': 22000 };
  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
  const intValue = (value) => value === '' ? NaN : Number(value);
  const makeId = () => (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = () => new Date().toISOString();
  const initialState = () => { const id = makeId(); return { version: 1, stock: { '5': 0, '7': 0 }, activeLotId: id, lots: [{ id, name: 'Lote 1', createdAt: now(), clients: [] }] }; };
  let state;
  let toastTimer;
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return initialState();
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || !parsed.stock || !Array.isArray(parsed.lots) || !parsed.lots.length) throw new Error('Datos no válidos');
      for (const type of ['5','7']) if (!Number.isSafeInteger(parsed.stock[type]) || parsed.stock[type] < 0) throw new Error('Inventario no válido');
      if (!parsed.lots.some(l => l.id === parsed.activeLotId)) parsed.activeLotId = parsed.lots[parsed.lots.length - 1].id;
      parsed.lots.forEach(l => { if (!Array.isArray(l.clients)) l.clients = []; });
      return parsed;
    } catch (error) { console.error('No se pudieron cargar los datos guardados:', error); alert('No fue posible leer los datos guardados. Para evitar sobrescribirlos, revisa el almacenamiento del navegador.'); return initialState(); }
  }
  function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch (error) { console.error(error); showToast('No se pudieron guardar los cambios en este navegador.'); return false; } }
  const activeLot = () => state.lots.find(l => l.id === state.activeLotId);
  const orderTotal = c => c.qty5 * PRICES['5'] + c.qty7 * PRICES['7'];
  const packCount = c => c.qty5 + c.qty7;
  function showToast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800); }
  function safeText(value) { return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function render() {
    const lot = activeLot();
    $('lotSelect').innerHTML = state.lots.map(l => `<option value="${safeText(l.id)}" ${l.id === state.activeLotId ? 'selected' : ''}>${safeText(l.name)}</option>`).join('');
    $('stock5').textContent = state.stock['5']; $('stock7').textContent = state.stock['7'];
    const clients = lot.clients; const sales = clients.reduce((sum,c) => sum + orderTotal(c), 0); const debt = clients.filter(c => c.payment === 'debe').reduce((sum,c) => sum + orderTotal(c), 0);
    $('statClients').textContent = clients.length; $('statSales').textContent = money(sales); $('statDebt').textContent = money(debt); $('statPending').textContent = clients.filter(c => c.delivery === 'pending').length;
    renderClients(); renderLots(); updateTotal();
  }
  function renderClients() {
    const query = $('clientSearch').value.trim().toLocaleLowerCase('es');
    const delivery = $('deliveryFilter').value, payment = $('paymentFilter').value;
    const clients = activeLot().clients.filter(c => c.name.toLocaleLowerCase('es').includes(query) && (delivery === 'all' || c.delivery === delivery) && (payment === 'all' || c.payment === payment));
    const root = $('clientsList');
    if (!clients.length) { root.innerHTML = `<div class="empty"><strong>${activeLot().clients.length ? 'No hay resultados' : 'Este lote todavía no tiene clientes'}</strong>${activeLot().clients.length ? 'Prueba cambiando los filtros.' : 'Agrega un cliente para registrar su pedido.'}</div>`; return; }
    root.innerHTML = clients.map(c => `<article class="client-card"><div><div class="client-name">${safeText(c.name)}</div><div class="client-meta">${c.qty5} pack(s) x5 · ${c.qty7} pack(s) x7</div><div class="pills"><span class="pill ${c.delivery === 'delivered' ? 'delivered' : 'pending'}">${c.delivery === 'delivered' ? 'Entregado' : 'Pendiente por entregar'}</span><span class="pill ${c.payment === 'paid' ? 'paid' : 'debe'}">${c.payment === 'paid' ? 'Pagado' : 'Debe'}</span></div></div><div><div class="muted">Total del pedido</div><div class="client-total">${money(orderTotal(c))}</div><div class="client-meta">${packCount(c)} pack(s) en total</div></div><div><div class="muted">Registrado</div><div>${new Date(c.createdAt).toLocaleDateString('es-CO')}</div></div><div class="card-actions"><button class="small-button" data-client-action="delivery" data-id="${safeText(c.id)}">${c.delivery === 'delivered' ? 'Marcar pendiente' : 'Marcar entregado'}</button><button class="small-button" data-client-action="payment" data-id="${safeText(c.id)}">${c.payment === 'paid' ? 'Marcar debe' : 'Marcar pagado'}</button><button class="small-button" data-client-action="edit" data-id="${safeText(c.id)}">Editar</button><button class="small-button" data-client-action="delete" data-id="${safeText(c.id)}">Eliminar</button></div></article>`).join('');
  }
  function renderLots() {
    $('lotsList').innerHTML = state.lots.slice().reverse().map(l => { const sales = l.clients.reduce((s,c) => s + orderTotal(c),0); return `<article class="lot-row"><div><strong>${safeText(l.name)} ${l.id === state.activeLotId ? '<span class="pill delivered">Activo</span>' : ''}</strong><p>${new Date(l.createdAt).toLocaleString('es-CO')} · ${l.clients.length} cliente(s) · Ventas: ${money(sales)}</p></div>${l.id === state.activeLotId ? '' : `<button class="button light" data-open-lot="${safeText(l.id)}">Abrir lote</button>`}</article>`; }).join('');
  }
  function updateTotal() { const q5 = intValue($('orderQty5').value), q7 = intValue($('orderQty7').value); $('orderTotal').textContent = money((Number.isFinite(q5) ? q5 : 0) * PRICES['5'] + (Number.isFinite(q7) ? q7 : 0) * PRICES['7']); const existing = activeLot().clients.find(c => c.id === $('clientId').value); const available5 = state.stock['5'] + (existing ? existing.qty5 : 0); const available7 = state.stock['7'] + (existing ? existing.qty7 : 0); $('stockHint').textContent = `Disponible: ${available5} pack(s) x5 y ${available7} pack(s) x7.`; }
  function switchView(id) { document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.id !== id)); document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === id)); }
  function openClient(client = null) { $('clientForm').reset(); $('clientId').value = client ? client.id : ''; $('clientDialogTitle').textContent = client ? 'Editar pedido' : 'Agregar cliente'; $('clientName').value = client ? client.name : ''; $('orderQty5').value = client ? client.qty5 : 0; $('orderQty7').value = client ? client.qty7 : 0; updateTotal(); $('clientDialog').showModal(); }
  function validQuantity(value) { return Number.isSafeInteger(value) && value >= 0; }
  $('lotSelect').addEventListener('change', () => { state.activeLotId = $('lotSelect').value; persist(); render(); });
  $('newLotBtn').addEventListener('click', () => { const name = prompt('Nombre del nuevo lote:', `Lote ${state.lots.length + 1}`); if (name === null) return; const clean = name.trim(); if (!clean) return showToast('Escribe un nombre para el lote.'); if (state.lots.some(l => l.name.toLocaleLowerCase('es') === clean.toLocaleLowerCase('es'))) return showToast('Ya existe un lote con ese nombre.'); const lot = { id: makeId(), name: clean, createdAt: now(), clients: [] }; state.lots.push(lot); state.activeLotId = lot.id; if (persist()) { render(); switchView('ordersView'); showToast('Nuevo lote creado.'); } });
  $('addClientBtn').addEventListener('click', () => openClient()); $('closeClient').addEventListener('click', () => $('clientDialog').close()); $('cancelClient').addEventListener('click', () => $('clientDialog').close());
  $('orderQty5').addEventListener('input', updateTotal); $('orderQty7').addEventListener('input', updateTotal);
  $('clientForm').addEventListener('submit', event => { event.preventDefault(); const name = $('clientName').value.trim(), qty5 = intValue($('orderQty5').value), qty7 = intValue($('orderQty7').value), id = $('clientId').value; if (!name) return showToast('Escribe el nombre del cliente.'); if (!validQuantity(qty5) || !validQuantity(qty7) || qty5 + qty7 < 1) return showToast('Ingresa al menos un pack y usa cantidades enteras válidas.'); const lot = activeLot(), existingIndex = lot.clients.findIndex(c => c.id === id), existing = existingIndex >= 0 ? lot.clients[existingIndex] : null; const available5 = state.stock['5'] + (existing ? existing.qty5 : 0), available7 = state.stock['7'] + (existing ? existing.qty7 : 0); if (qty5 > available5 || qty7 > available7) return showToast('No hay inventario suficiente para ese pedido.'); const nextStock = {'5': available5 - qty5, '7': available7 - qty7}; const client = existing ? {...existing, name, qty5, qty7, updatedAt: now()} : {id: makeId(), name, qty5, qty7, delivery:'pending', payment:'debe', createdAt:now()}; state.stock = nextStock; if (existing) lot.clients[existingIndex] = client; else lot.clients.push(client); if (persist()) { $('clientDialog').close(); render(); showToast(existing ? 'Pedido actualizado.' : 'Cliente y pedido guardados.'); } });
  $('clientsList').addEventListener('click', event => { const btn = event.target.closest('button[data-client-action]'); if (!btn) return; const lot = activeLot(), index = lot.clients.findIndex(c => c.id === btn.dataset.id); if (index < 0) return; const c = lot.clients[index]; switch (btn.dataset.clientAction) { case 'delivery': c.delivery = c.delivery === 'delivered' ? 'pending' : 'delivered'; break; case 'payment': c.payment = c.payment === 'paid' ? 'debe' : 'paid'; break; case 'edit': return openClient(c); case 'delete': if (!confirm(`¿Eliminar el pedido de ${c.name}? Se devolverán ${packCount(c)} pack(s) al inventario.`)) return; state.stock['5'] += c.qty5; state.stock['7'] += c.qty7; lot.clients.splice(index,1); break; default: return; } if (persist()) { render(); showToast('Cambios guardados.'); } });
  document.querySelectorAll('[data-stock]').forEach(btn => btn.addEventListener('click', () => { const type = btn.dataset.stock, action = btn.dataset.action, qty = intValue($(`qty${type}`).value); if (!Number.isSafeInteger(qty) || qty < 1) return showToast('Ingresa una cantidad entera mayor que cero.'); if (action === 'remove' && qty > state.stock[type]) return showToast('No puedes retirar más packs de los disponibles.'); state.stock[type] += action === 'add' ? qty : -qty; if (persist()) { render(); showToast(action === 'add' ? 'Inventario actualizado.' : 'Packs retirados del inventario.'); } }));
  $('clientSearch').addEventListener('input', renderClients); $('deliveryFilter').addEventListener('change', renderClients); $('paymentFilter').addEventListener('change', renderClients);
  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  $('lotsList').addEventListener('click', event => { const btn = event.target.closest('[data-open-lot]'); if (!btn) return; state.activeLotId = btn.dataset.openLot; if (persist()) { render(); switchView('ordersView'); } });
  state = loadState(); render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker no registrado:', err)));
})();
