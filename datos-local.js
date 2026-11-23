/* ============================================================
   Tarjeta de fidelidad · capa de datos MODO DEMO (este navegador, localStorage)

   app.js no sabe dónde se guardan los datos: habla solo con el objeto que devuelve crearDatosLocal()
   o crearDatosSupabase() (datos-supabase.js). Las dos tienen las mismas funciones y todas son async,
   así la pantalla funciona igual en la demo y con la base compartida.

   Todos los datos de ejemplo son inventados y los teléfonos son falsos (+56 9 0000 00NN).
   ============================================================ */

const ALMACEN = 'fidelidad-barberias:v1';   // misma clave que la primera versión: se actualiza sola
const DIA = 86400000;

export const CONFIG_BASE = {
  nombre: 'Barbería Demo',
  color: '#c08f55',
  whatsapp: '00000000',   // 8 dígitos después de +56 9 (número falso de demo)
  sellos: 8,
  dias: 15,
  premio: 'Corte gratis'
};

const copia = (o) => JSON.parse(JSON.stringify(o));
const soloDigitos = (s) => String(s || '').replace(/\D+/g, '');
function inicioDia(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function haceDias(n) { return inicioDia(Date.now()) - n * DIA + 11 * 3600000; } // a las 11:00 de ese día

/* Enlace secreto de la tarjeta: 24 bytes al azar en base64url (32 caracteres). */
export function tokenNuevo() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fallo(mensaje, campo) { const e = new Error(mensaje); if (campo) e.campo = campo; return e; }

export function datosEjemplo() {
  // [nombre, días desde cada visita, sellos, canjes, acepta recordatorios]
  const base = [
    ['Matías Soto',        [3, 18, 33, 48],      7, 0, true],
    ['Benjamín Rojas',     [22, 41, 58],         3, 0, true],
    ['Vicente Muñoz',      [8, 24, 39, 55],      8, 0, true],
    ['Joaquín Díaz',       [27, 50],             2, 0, true],
    ['Tomás González',     [5, 19, 34],          5, 0, true],
    ['Cristóbal Pérez',    [35],                 1, 0, false],
    ['Diego Contreras',    [12, 26, 44, 59],     4, 0, true],
    ['Sebastián Silva',    [17, 31, 46],         6, 0, true],
    ['Felipe Morales',     [1, 14, 29, 43, 57],  2, 1, true],
    ['Martín Araya',       [44],                 1, 0, true],
    ['Ignacio Fuentes',    [10, 25],             2, 0, true],
    ['Camilo Espinoza',    [20, 36, 52],         5, 1, true]
  ];
  const clientes = base.map((f, i) => {
    const n = i + 1;
    const visitas = f[1].map(haceDias).sort((a, b) => a - b);
    return {
      id: 'c' + n,
      numero: n,
      nombre: f[0],
      telefono: '+5690000' + String(n).padStart(4, '0'),
      token: 'demo-tarjeta-' + String(n).padStart(4, '0'),
      sellos: f[2],
      canjes: f[3],
      visitas,
      acepta: f[4],
      recordado: null,
      creado: visitas[0] || Date.now()
    };
  });
  return { version: 2, config: copia(CONFIG_BASE), clientes, siguiente: clientes.length + 1 };
}

function valido(e) { return e && (e.version === 1 || e.version === 2) && e.config && Array.isArray(e.clientes) && typeof e.siguiente === 'number'; }

/* Lo guardado por la primera versión (sin enlace secreto ni permiso de WhatsApp) se completa aquí. */
function actualizar(e) {
  e.config = Object.assign(copia(CONFIG_BASE), e.config);
  e.clientes.forEach((c) => {
    if (!c.token) c.token = 'demo-tarjeta-' + String(c.numero).padStart(4, '0');
    if (typeof c.acepta !== 'boolean') c.acepta = true;
    delete c.visto;
  });
  delete e.actual;
  e.version = 2;
  return e;
}

function leer() {
  try {
    const crudo = window.localStorage.getItem(ALMACEN);
    if (crudo) { const e = JSON.parse(crudo); if (valido(e)) return actualizar(e); }
  } catch (err) { /* sin almacenamiento: la demo vive en memoria */ }
  return null;
}

export function crearDatosLocal() {
  let e = leer() || datosEjemplo();
  const guardar = () => { try { window.localStorage.setItem(ALMACEN, JSON.stringify(e)); } catch (err) { /* modo privado */ } };
  const recargar = () => { const x = leer(); if (x) e = x; };
  const porId = (id) => e.clientes.find((c) => c.id === id);
  const necesario = (id) => { const c = porId(id); if (!c) throw fallo('Ese cliente ya no existe.'); return c; };
  const completa = (c) => c.sellos >= e.config.sellos;

  return {
    modo: 'demo',

    /* ---------- Sesión: en la demo no hay cuentas ---------- */
    async sesion() { return { correo: 'demo' }; },
    async entrar() {},
    async salir() {},

    /* ---------- Lectura ---------- */
    async panel() { recargar(); return { config: copia(e.config), clientes: copia(e.clientes), puedeAjustar: true }; },
    /* La tarjeta que ve el cliente, por su enlace secreto. En la demo también sirve el id. */
    async tarjeta(clave) {
      recargar();
      const c = e.clientes.find((x) => x.token === clave || x.id === clave);
      return c ? { config: copia(e.config), cliente: copia(c) } : null;
    },

    /* ---------- Visitas ---------- */
    async marcarVisita(id) {
      recargar();
      const c = necesario(id);
      if (completa(c)) throw fallo('La tarjeta ya está completa: canjea el premio.');
      const antes = copia(c);
      c.sellos += 1; c.visitas.push(Date.now()); c.recordado = null;
      guardar();
      return { cliente: copia(c), accion: { id, antes } };
    },
    async canjear(id) {
      recargar();
      const c = necesario(id);
      if (!completa(c)) throw fallo('Todavía le faltan sellos para el premio.');
      const antes = copia(c);
      c.sellos = 0; c.canjes += 1; c.visitas.push(Date.now()); c.recordado = null;
      guardar();
      return { cliente: copia(c), accion: { id, antes } };
    },
    async deshacer(accion) {
      recargar();
      const c = necesario(accion.id);
      Object.keys(accion.antes).forEach((k) => { c[k] = accion.antes[k]; });
      guardar();
      return copia(c);
    },

    /* ---------- Clientes ---------- */
    async registrar({ nombre, telefono, acepta }) {
      recargar();
      nombre = String(nombre || '').trim().replace(/\s+/g, ' ');
      const tel = '+569' + soloDigitos(telefono).slice(-8);
      if (nombre.length < 2 || nombre.length > 40) throw fallo('Escribe el nombre del cliente.', 'nombre');
      if (!/^\+569\d{8}$/.test(tel)) throw fallo('El celular debe tener 8 dígitos después del +56 9.', 'telefono');
      if (e.clientes.some((c) => c.telefono === tel)) throw fallo('Ese celular ya está registrado. Búscalo arriba.', 'telefono');
      const n = e.siguiente++;
      const c = { id: 'c' + n + '-' + Date.now().toString(36), numero: n, nombre, telefono: tel, token: tokenNuevo(),
        sellos: 0, canjes: 0, visitas: [], acepta: !!acepta, recordado: null, creado: Date.now() };
      e.clientes.push(c);
      guardar();
      return copia(c);
    },
    async anotarRecordatorio(id) { recargar(); const c = necesario(id); c.recordado = Date.now(); guardar(); return copia(c); },
    /* El propio cliente, desde su tarjeta, acepta o quita los recordatorios por WhatsApp. */
    async cambiarAvisos(clave, acepta) {
      recargar();
      const c = e.clientes.find((x) => x.token === clave || x.id === clave);
      if (!c) throw fallo('No encontramos tu tarjeta.');
      c.acepta = !!acepta; guardar();
      return copia(c);
    },
    async borrarCliente(id) { recargar(); necesario(id); e.clientes = e.clientes.filter((c) => c.id !== id); guardar(); },

    /* ---------- Ajustes ---------- */
    async guardarAjustes(cfg) {
      recargar();
      e.config = { nombre: cfg.nombre, color: String(cfg.color).toLowerCase(), whatsapp: cfg.whatsapp, sellos: cfg.sellos, dias: cfg.dias, premio: cfg.premio };
      guardar();
      return copia(e.config);
    },
    async restablecer() { e = datosEjemplo(); guardar(); },

    /* Otra pestaña guardó algo (por ejemplo, el panel abierto al lado de la tarjeta). */
    alCambiar(fn) { window.addEventListener('storage', (ev) => { if (ev.key === ALMACEN) fn(); }); }
  };
}
