'use strict';

(async () => {

  // ============================================================
  // FIREBASE
  // ============================================================

  const { initializeApp } = await import(
    'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'
  );

  const {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    onSnapshot
  } = await import(
    'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js'
  );

  const {
    getAuth,
    signInAnonymously
  } = await import(
    'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'
  );

  const firebaseConfig = {
    apiKey: "AIzaSyCMwtdv9gJq7RmIjliLK5kM0sOsTmX1zwQ",
    authDomain: "chorizoportuano.firebaseapp.com",
    projectId: "chorizoportuano",
    storageBucket: "chorizoportuano.firebasestorage.app",
    messagingSenderId: "558589054043",
    appId: "1:558589054043:web:c1fc37125a893cedf5837e",
    measurementId: "G-FNCYMGHTM8"
  };

  const firebaseApp = initializeApp(firebaseConfig);
  const db = getFirestore(firebaseApp);
  const auth = getAuth(firebaseApp);

  const CLOUD_DOC = doc(
    db,
    'appData',
    'chorizos'
  );

  // ============================================================
  // CONFIGURACIÓN
  // ============================================================

  const STORAGE_KEY = 'chorizos_manager_v1';

  const PRICES = {
    '5': 17000,
    '7': 22000
  };

  const $ = (id) =>
    document.getElementById(id);

  const money = (n) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(n);

  const intValue = (value) =>
    value === '' ? NaN : Number(value);

  const makeId = () =>
    (
      globalThis.crypto &&
      typeof globalThis.crypto.randomUUID === 'function'
    )
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;

  const now = () =>
    new Date().toISOString();

  const initialState = () => {

    const id = makeId();

    return {
      version: 1,

      stock: {
        '5': 0,
        '7': 0
      },

      activeLotId: id,

      lots: [
        {
          id,
          name: 'Lote 1',
          createdAt: now(),
          clients: []
        }
      ]
    };
  };

  let state;
  let toastTimer;

  let firebaseReady = false;
  let applyingCloudData = false;

  // ============================================================
  // CARGA LOCAL
  // ============================================================

  function loadState() {

    try {

      const raw =
        localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return initialState();
      }

      const parsed =
        JSON.parse(raw);

      if (
        !parsed ||
        parsed.version !== 1 ||
        !parsed.stock ||
        !Array.isArray(parsed.lots) ||
        !parsed.lots.length
      ) {
        throw new Error(
          'Datos no válidos'
        );
      }

      for (const type of ['5', '7']) {

        if (
          !Number.isSafeInteger(
            parsed.stock[type]
          ) ||
          parsed.stock[type] < 0
        ) {
          throw new Error(
            'Inventario no válido'
          );
        }
      }

      if (
        !parsed.lots.some(
          l => l.id === parsed.activeLotId
        )
      ) {

        parsed.activeLotId =
          parsed.lots[
            parsed.lots.length - 1
          ].id;
      }

      parsed.lots.forEach(lot => {

        if (
          !Array.isArray(lot.clients)
        ) {
          lot.clients = [];
        }
      });

      return parsed;

    } catch (error) {

      console.error(
        'No se pudieron cargar los datos guardados:',
        error
      );

      alert(
        'No fue posible leer los datos guardados. ' +
        'Para evitar sobrescribirlos, revisa el almacenamiento del navegador.'
      );

      return initialState();
    }
  }

  // ============================================================
  // GUARDADO LOCAL
  // ============================================================

  function persistLocal() {

    try {

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state)
      );

      return true;

    } catch (error) {

      console.error(error);

      showToast(
        'No se pudieron guardar los cambios en este navegador.'
      );

      return false;
    }
  }

  // ============================================================
  // GUARDADO FIREBASE
  // ============================================================

  async function persist() {

    const localOK =
      persistLocal();

    if (!localOK) {
      return false;
    }

    if (
      !firebaseReady ||
      applyingCloudData
    ) {
      return true;
    }

    try {

      await setDoc(
        CLOUD_DOC,
        {
          ...state,
          updatedAt: now()
        }
      );

      console.log(
        'Datos guardados en Firebase.'
      );

      return true;

    } catch (error) {

      console.error(
        'Error guardando en Firebase:',
        error
      );

      showToast(
        'Guardado local. No se pudo sincronizar con Firebase.'
      );

      return true;
    }
  }

  // ============================================================
  // FIREBASE
  // ============================================================

  async function initializeFirebase() {

    try {

      console.log(
        'Conectando con Firebase...'
      );

      await signInAnonymously(auth);

      console.log(
        'Autenticación anónima correcta.'
      );

      const snapshot =
        await getDoc(CLOUD_DOC);

      if (!snapshot.exists()) {

        console.log(
          'No existe información en Firebase. Subiendo datos actuales...'
        );

        await setDoc(
          CLOUD_DOC,
          {
            ...state,
            updatedAt: now()
          }
        );

      } else {

        const cloudData =
          snapshot.data();

        if (
          cloudData &&
          cloudData.version === 1 &&
          cloudData.stock &&
          Array.isArray(cloudData.lots) &&
          cloudData.lots.length
        ) {

          applyingCloudData = true;

          state = {
            version: 1,

            stock: {
              '5':
                Number(
                  cloudData.stock['5']
                ) || 0,

              '7':
                Number(
                  cloudData.stock['7']
                ) || 0
            },

            activeLotId:
              cloudData.activeLotId ||
              cloudData.lots[
                cloudData.lots.length - 1
              ].id,

            lots:
              cloudData.lots
          };

          persistLocal();

          render();

          applyingCloudData = false;
        }
      }

      firebaseReady = true;

      // ========================================================
      // ESCUCHAR CAMBIOS DE OTROS DISPOSITIVOS
      // ========================================================

      onSnapshot(
        CLOUD_DOC,

        (snapshot) => {

          if (!snapshot.exists()) {
            return;
          }

          const cloudData =
            snapshot.data();

          if (
            !cloudData ||
            cloudData.version !== 1 ||
            !cloudData.stock ||
            !Array.isArray(
              cloudData.lots
            )
          ) {
            return;
          }

          applyingCloudData = true;

          state = {

            version: 1,

            stock: {
              '5':
                Number(
                  cloudData.stock['5']
                ) || 0,

              '7':
                Number(
                  cloudData.stock['7']
                ) || 0
            },

            activeLotId:
              cloudData.activeLotId ||
              cloudData.lots[
                cloudData.lots.length - 1
              ].id,

            lots:
              cloudData.lots
          };

          persistLocal();

          render();

          applyingCloudData = false;

          console.log(
            'Datos actualizados desde Firebase.'
          );
        },

        (error) => {

          console.error(
            'Error escuchando Firebase:',
            error
          );
        }
      );

      console.log(
        'Firebase conectado correctamente.'
      );

      showToast(
        '☁️ Sincronización activada'
      );

    } catch (error) {

      console.error(
        'No se pudo conectar con Firebase:',
        error
      );

      firebaseReady = false;

      showToast(
        'Modo local activo. Firebase no está disponible.'
      );
    }
  }

  // ============================================================
  // FUNCIONES GENERALES
  // ============================================================

  const activeLot = () =>
    state.lots.find(
      lot =>
        lot.id === state.activeLotId
    );

  const orderTotal = client =>
    (
      client.qty5 *
      PRICES['5']
    ) +
    (
      client.qty7 *
      PRICES['7']
    );

  const packCount = client =>
    client.qty5 +
    client.qty7;

  function showToast(message) {

    const el =
      $('toast');

    if (!el) {
      return;
    }

    el.textContent =
      message;

    el.classList.add(
      'show'
    );

    clearTimeout(
      toastTimer
    );

    toastTimer =
      setTimeout(
        () =>
          el.classList.remove(
            'show'
          ),
        2800
      );
  }

  function safeText(value) {

    const div =
      document.createElement(
        'div'
      );

    div.textContent =
      String(value);

    return div.innerHTML;
  }

  // ============================================================
  // RENDER
  // ============================================================

  function render() {

    const lot =
      activeLot();

    if (!lot) {
      return;
    }

    $('lotSelect').innerHTML =
      state.lots
        .map(
          lotItem =>
            `
            <option
              value="${safeText(lotItem.id)}"
              ${
                lotItem.id ===
                state.activeLotId
                  ? 'selected'
                  : ''
              }
            >
              ${safeText(lotItem.name)}
            </option>
            `
        )
        .join('');

    $('stock5').textContent =
      state.stock['5'];

    $('stock7').textContent =
      state.stock['7'];

    const clients =
      lot.clients;

    const sales =
      clients.reduce(
        (sum, client) =>
          sum +
          orderTotal(client),
        0
      );

    const debt =
      clients
        .filter(
          client =>
            client.payment ===
            'debe'
        )
        .reduce(
          (sum, client) =>
            sum +
            orderTotal(client),
          0
        );

    $('statClients').textContent =
      clients.length;

    $('statSales').textContent =
      money(sales);

    $('statDebt').textContent =
      money(debt);

    $('statPending').textContent =
      clients.filter(
        client =>
          client.delivery ===
          'pending'
      ).length;

    renderClients();

    renderLots();

    updateTotal();
  }

  // ============================================================
  // CLIENTES
  // ============================================================

  function renderClients() {

    const query =
      $('clientSearch')
        .value
        .trim()
        .toLocaleLowerCase(
          'es'
        );

    const delivery =
      $('deliveryFilter')
        .value;

    const payment =
      $('paymentFilter')
        .value;

    const clients =
      activeLot()
        .clients
        .filter(
          client =>
            client.name
              .toLocaleLowerCase(
                'es'
              )
              .includes(query) &&

            (
              delivery === 'all' ||
              client.delivery ===
                delivery
            ) &&

            (
              payment === 'all' ||
              client.payment ===
                payment
            )
        );

    const root =
      $('clientsList');

    if (!clients.length) {

      root.innerHTML =
        `
        <div class="empty">

          <strong>
            ${
              activeLot()
                .clients.length
                ? 'No hay resultados'
                : 'Este lote todavía no tiene clientes'
            }
          </strong>

          ${
            activeLot()
              .clients.length
              ? 'Prueba cambiando los filtros.'
              : 'Agrega un cliente para registrar su pedido.'
          }

        </div>
        `;

      return;
    }

    root.innerHTML =
      clients
        .map(
          client =>
            `
            <article class="client-card">

              <div>

                <div class="client-name">
                  ${safeText(client.name)}
                </div>

                <div class="client-meta">
                  ${client.qty5} pack(s) x5 ·
                  ${client.qty7} pack(s) x7
                </div>

                <div class="pills">

                  <span
                    class="pill ${
                      client.delivery ===
                      'delivered'
                        ? 'delivered'
                        : 'pending'
                    }"
                  >
                    ${
                      client.delivery ===
                      'delivered'
                        ? 'Entregado'
                        : 'Pendiente por entregar'
                    }
                  </span>

                  <span
                    class="pill ${
                      client.payment ===
                      'paid'
                        ? 'paid'
                        : 'debe'
                    }"
                  >
                    ${
                      client.payment ===
                      'paid'
                        ? 'Pagado'
                        : 'Debe'
                    }
                  </span>

                </div>

              </div>

              <div>

                <div class="muted">
                  Total del pedido
                </div>

                <div class="client-total">
                  ${money(
                    orderTotal(client)
                  )}
                </div>

                <div class="client-meta">
                  ${packCount(client)}
                  pack(s) en total
                </div>

              </div>

              <div>

                <div class="muted">
                  Registrado
                </div>

                <div>
                  ${new Date(
                    client.createdAt
                  ).toLocaleDateString(
                    'es-CO'
                  )}
                </div>

              </div>

              <div class="card-actions">

                <button
                  class="small-button"
                  data-client-action="delivery"
                  data-id="${safeText(
                    client.id
                  )}"
                >
                  ${
                    client.delivery ===
                    'delivered'
                      ? 'Marcar pendiente'
                      : 'Marcar entregado'
                  }
                </button>

                <button
                  class="small-button"
                  data-client-action="payment"
                  data-id="${safeText(
                    client.id
                  )}"
                >
                  ${
                    client.payment ===
                    'paid'
                      ? 'Marcar debe'
                      : 'Marcar pagado'
                  }
                </button>

                <button
                  class="small-button"
                  data-client-action="edit"
                  data-id="${safeText(
                    client.id
                  )}"
                >
                  Editar
                </button>

                <button
                  class="small-button"
                  data-client-action="delete"
                  data-id="${safeText(
                    client.id
                  )}"
                >
                  Eliminar
                </button>

              </div>

            </article>
            `
        )
        .join('');
  }

  // ============================================================
  // LOTES
  // ============================================================

  function renderLots() {

    $('lotsList').innerHTML =
      state.lots
        .slice()
        .reverse()
        .map(
          lot => {

            const sales =
              lot.clients.reduce(
                (sum, client) =>
                  sum +
                  orderTotal(client),
                0
              );

            return `
              <article class="lot-row">

                <div>

                  <strong>

                    ${safeText(
                      lot.name
                    )}

                    ${
                      lot.id ===
                      state.activeLotId
                        ? '<span class="pill delivered">Activo</span>'
                        : ''
                    }

                  </strong>

                  <p>

                    ${new Date(
                      lot.createdAt
                    ).toLocaleString(
                      'es-CO'
                    )}

                    ·
                    ${lot.clients.length}
                    cliente(s)

                    · Ventas:
                    ${money(sales)}

                  </p>

                </div>

                ${
                  lot.id ===
                  state.activeLotId
                    ? ''
                    : `
                      <button
                        class="button light"
                        data-open-lot="${safeText(
                          lot.id
                        )}"
                      >
                        Abrir lote
                      </button>
                    `
                }

              </article>
            `;
          }
        )
        .join('');
  }

  // ============================================================
  // TOTAL PEDIDO
  // ============================================================

  function updateTotal() {

    const q5 =
      intValue(
        $('orderQty5').value
      );

    const q7 =
      intValue(
        $('orderQty7').value
      );

    $('orderTotal').textContent =
      money(

        (
          Number.isFinite(q5)
            ? q5
            : 0
        ) *
        PRICES['5']

        +

        (
          Number.isFinite(q7)
            ? q7
            : 0
        ) *
        PRICES['7']
      );

    const existing =
      activeLot()
        .clients
        .find(
          client =>
            client.id ===
            $('clientId').value
        );

    const available5 =
      state.stock['5'] +
      (
        existing
          ? existing.qty5
          : 0
      );

    const available7 =
      state.stock['7'] +
      (
        existing
          ? existing.qty7
          : 0
      );

    $('stockHint').textContent =
      `Disponible: ${available5} pack(s) x5 y ${available7} pack(s) x7.`;
  }

  // ============================================================
  // NAVEGACIÓN
  // ============================================================

  function switchView(id) {

    document
      .querySelectorAll('.view')
      .forEach(
        view =>
          view.classList.toggle(
            'hidden',
            view.id !== id
          )
      );

    document
      .querySelectorAll('.tab')
      .forEach(
        button =>
          button.classList.toggle(
            'active',
            button.dataset.view ===
            id
          )
      );
  }

  // ============================================================
  // FORMULARIO CLIENTE
  // ============================================================

  function openClient(
    client = null
  ) {

    $('clientForm').reset();

    $('clientId').value =
      client
        ? client.id
        : '';

    $('clientDialogTitle')
      .textContent =
        client
          ? 'Editar pedido'
          : 'Agregar cliente';

    $('clientName').value =
      client
        ? client.name
        : '';

    $('orderQty5').value =
      client
        ? client.qty5
        : 0;

    $('orderQty7').value =
      client
        ? client.qty7
        : 0;

    updateTotal();

    $('clientDialog')
      .showModal();
  }

  function validQuantity(
    value
  ) {

    return (
      Number.isSafeInteger(
        value
      ) &&
      value >= 0
    );
  }

  // ============================================================
  // LOTES - SELECCIONAR
  // ============================================================

  $('lotSelect')
    .addEventListener(
      'change',
      async () => {

        state.activeLotId =
          $('lotSelect').value;

        if (
          await persist()
        ) {

          render();
        }
      }
    );

  // ============================================================
  // NUEVO LOTE
  // ============================================================

  $('newLotBtn')
    .addEventListener(
      'click',
      async () => {

        const name =
          prompt(
            'Nombre del nuevo lote:',
            `Lote ${
              state.lots.length + 1
            }`
          );

        if (
          name === null
        ) {
          return;
        }

        const clean =
          name.trim();

        if (!clean) {

          return showToast(
            'Escribe un nombre para el lote.'
          );
        }

        if (
          state.lots.some(
            lot =>
              lot.name
                .toLocaleLowerCase(
                  'es'
                ) ===
              clean
                .toLocaleLowerCase(
                  'es'
                )
          )
        ) {

          return showToast(
            'Ya existe un lote con ese nombre.'
          );
        }

        const lot = {

          id:
            makeId(),

          name:
            clean,

          createdAt:
            now(),

          clients:
            []
        };

        state.lots.push(
          lot
        );

        state.activeLotId =
          lot.id;

        if (
          await persist()
        ) {

          render();

          switchView(
            'ordersView'
          );

          showToast(
            'Nuevo lote creado.'
          );
        }
      }
    );

  // ============================================================
  // CLIENTES - BOTONES
  // ============================================================

  $('addClientBtn')
    .addEventListener(
      'click',
      () =>
        openClient()
    );

  $('closeClient')
    .addEventListener(
      'click',
      () =>
        $('clientDialog')
          .close()
    );

  $('cancelClient')
    .addEventListener(
      'click',
      () =>
        $('clientDialog')
          .close()
    );

  $('orderQty5')
    .addEventListener(
      'input',
      updateTotal
    );

  $('orderQty7')
    .addEventListener(
      'input',
      updateTotal
    );

  // ============================================================
  // GUARDAR PEDIDO
  // ============================================================

  $('clientForm')
    .addEventListener(
      'submit',
      async event => {

        event.preventDefault();

        const name =
          $('clientName')
            .value
            .trim();

        const qty5 =
          intValue(
            $('orderQty5')
              .value
          );

        const qty7 =
          intValue(
            $('orderQty7')
              .value
          );

        const id =
          $('clientId').value;

        if (!name) {

          return showToast(
            'Escribe el nombre del cliente.'
          );
        }

        if (
          !validQuantity(qty5) ||
          !validQuantity(qty7) ||
          qty5 + qty7 < 1
        ) {

          return showToast(
            'Ingresa al menos un pack y usa cantidades enteras válidas.'
          );
        }

        const lot =
          activeLot();

        const existingIndex =
          lot.clients.findIndex(
            client =>
              client.id === id
          );

        const existing =
          existingIndex >= 0
            ? lot.clients[
                existingIndex
              ]
            : null;

        const available5 =
          state.stock['5'] +
          (
            existing
              ? existing.qty5
              : 0
          );

        const available7 =
          state.stock['7'] +
          (
            existing
              ? existing.qty7
              : 0
          );

        if (
          qty5 > available5 ||
          qty7 > available7
        ) {

          return showToast(
            'No hay inventario suficiente para ese pedido.'
          );
        }

        const nextStock = {

          '5':
            available5 -
            qty5,

          '7':
            available7 -
            qty7
        };

        const client =
          existing
            ? {

                ...existing,

                name,

                qty5,

                qty7,

                updatedAt:
                  now()
              }

            : {

                id:
                  makeId(),

                name,

                qty5,

                qty7,

                delivery:
                  'pending',

                payment:
                  'debe',

                createdAt:
                  now()
              };

        state.stock =
          nextStock;

        if (existing) {

          lot.clients[
            existingIndex
          ] = client;

        } else {

          lot.clients.push(
            client
          );
        }

        if (
          await persist()
        ) {

          $('clientDialog')
            .close();

          render();

          showToast(
            existing
              ? 'Pedido actualizado.'
              : 'Cliente y pedido guardados.'
          );
        }
      }
    );

  // ============================================================
  // ACCIONES DE CLIENTES
  // ============================================================

  $('clientsList')
    .addEventListener(
      'click',
      async event => {

        const button =
          event.target.closest(
            'button[data-client-action]'
          );

        if (!button) {
          return;
        }

        const lot =
          activeLot();

        const index =
          lot.clients.findIndex(
            client =>
              client.id ===
              button.dataset.id
          );

        if (index < 0) {
          return;
        }

        const client =
          lot.clients[index];

        switch (
          button.dataset.clientAction
        ) {

          case 'delivery':

            client.delivery =
              client.delivery ===
              'delivered'
                ? 'pending'
                : 'delivered';

            break;

          case 'payment':

            client.payment =
              client.payment ===
              'paid'
                ? 'debe'
                : 'paid';

            break;

          case 'edit':

            return openClient(
              client
            );

          case 'delete':

            if (
              !confirm(
                `¿Eliminar el pedido de ${client.name}? Se devolverán ${packCount(client)} pack(s) al inventario.`
              )
            ) {
              return;
            }

            state.stock['5'] +=
              client.qty5;

            state.stock['7'] +=
              client.qty7;

            lot.clients.splice(
              index,
              1
            );

            break;

          default:

            return;
        }

        if (
          await persist()
        ) {

          render();

          showToast(
            'Cambios guardados.'
          );
        }
      }
    );

  // ============================================================
  // INVENTARIO
  // ============================================================

  document
    .querySelectorAll(
      '[data-stock]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          async () => {

            const type =
              button.dataset.stock;

            const action =
              button.dataset.action;

            const qty =
              intValue(
                $(`qty${type}`)
                  .value
              );

            if (
              !Number.isSafeInteger(
                qty
              ) ||
              qty < 1
            ) {

              return showToast(
                'Ingresa una cantidad entera mayor que cero.'
              );
            }

            if (
              action ===
                'remove' &&
              qty >
                state.stock[type]
            ) {

              return showToast(
                'No puedes retirar más packs de los disponibles.'
              );
            }

            state.stock[type] +=
              action === 'add'
                ? qty
                : -qty;

            if (
              await persist()
            ) {

              render();

              showToast(
                action === 'add'
                  ? 'Inventario actualizado.'
                  : 'Packs retirados del inventario.'
              );
            }
          }
        );
      }
    );

  // ============================================================
  // FILTROS
  // ============================================================

  $('clientSearch')
    .addEventListener(
      'input',
      renderClients
    );

  $('deliveryFilter')
    .addEventListener(
      'change',
      renderClients
    );

  $('paymentFilter')
    .addEventListener(
      'change',
      renderClients
    );

  // ============================================================
  // NAVEGACIÓN
  // ============================================================

  document
    .querySelectorAll(
      '.tab'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () =>
            switchView(
              button.dataset.view
            )
        );
      }
    );

  // ============================================================
  // ABRIR LOTE
  // ============================================================

  $('lotsList')
    .addEventListener(
      'click',
      async event => {

        const button =
          event.target.closest(
            '[data-open-lot]'
          );

        if (!button) {
          return;
        }

        state.activeLotId =
          button.dataset.openLot;

        if (
          await persist()
        ) {

          render();

          switchView(
            'ordersView'
          );
        }
      }
    );

  // ============================================================
  // INICIO
  // ============================================================

  state =
    loadState();

  render();

  // ============================================================
  // SERVICE WORKER
  // ============================================================

  if (
    'serviceWorker' in
      navigator &&
    location.protocol !==
      'file:'
  ) {

    window.addEventListener(
      'load',
      () => {

        navigator.serviceWorker
          .register('./sw.js')
          .then(
            registration => {

              console.log(
                'Service Worker registrado:',
                registration.scope
              );
            }
          )
          .catch(
            error => {

              console.warn(
                'Service Worker no registrado:',
                error
              );
            }
          );
      }
    );
  }

  // ============================================================
  // CONECTAR FIREBASE
  // ============================================================

  await initializeFirebase();

})();
