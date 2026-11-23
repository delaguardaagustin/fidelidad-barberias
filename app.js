/* Tarjeta de fidelidad para barberías · SENTRY-CODE
   Pantallas (inicio, tarjeta del cliente y panel de la barbería). No sabe dónde se guardan los datos:
   todo pasa por el objeto de datos.js (modo demo en este navegador, o modo real en Supabase).
   Módulo ES sin dependencias salvo qrcodejs (CDN) y html5-qrcode (se carga solo al abrir la cámara). */
import { crearDatos } from './datos.js';

const DIA = 86400000;
const HTML5QR_URL = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
const CLAVE_VISTO = 'fidelidad-barberias:visto';        // sellos que el cliente ya vio animarse (por tarjeta)
const CLAVE_ACTUAL = 'fidelidad-barberias:actual';      // tarjeta elegida en la vista «Cliente» de la demo
const CLAVE_MI_TARJETA = 'fidelidad-barberias:mi-tarjeta'; // última tarjeta abierta con su enlace (para la app instalada)
const RECIENTE = 7;                                      // días en que un recordatorio cuenta como «ya le escribiste»

// ---------- Utilidades ----------
const $ = (sel, raiz) => (raiz || document).querySelector(sel);
const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));
function inicioDia(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
const hoy0 = () => inicioDia(Date.now());
const diasEntre = (a, b) => Math.round((inicioDia(b) - inicioDia(a)) / DIA);
const soloDigitos = (s) => String(s || '').replace(/\D+/g, '');
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const primerNombre = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const minuscula = (s) => { s = String(s || '').trim(); return s.charAt(0).toLowerCase() + s.slice(1); };
const mayuscula = (s) => String(s || '').replace(/^./, (x) => x.toUpperCase());
function escapar(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
const telCompleto = (ocho) => '+569' + soloDigitos(ocho);
function formatoTel(t) {
  const d = soloDigitos(t);
  if (d.length === 11 && d.indexOf('569') === 0) return '+56 9 ' + d.slice(3, 7) + ' ' + d.slice(7);
  return t || '';
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const fechaLarga = (ts) => { const d = new Date(ts); return DIAS_SEMANA[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; };
const hace = (n) => (n === 0 ? 'hoy' : n === 1 ? 'ayer' : 'hace ' + n + ' días');
function leerLocal(k, defecto) { try { const v = window.localStorage.getItem(k); return v ? JSON.parse(v) : defecto; } catch (e) { return defecto; } }
function guardarLocal(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } }
const preferirQuieto = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const suave = () => (preferirQuieto() ? 'auto' : 'smooth');

// ---------- Estado de la pantalla ----------
let datos = null;
let real = false;
let cfg = null;              // ajustes en uso: los del panel o los de la tarjeta abierta
let clientes = [];           // clientes del panel (en la demo, también los de la vista «Cliente»)
let puedeAjustar = true;
let tarjetaAbierta = null;   // { clave, cliente } de la vista del cliente

const cliente = (id) => clientes.find((c) => c.id === id) || null;
function reemplazar(c) { const i = clientes.findIndex((x) => x.id === c.id); if (i >= 0) clientes[i] = c; else clientes.push(c); }
const ultimaVisita = (c) => (c.visitas && c.visitas.length ? c.visitas[c.visitas.length - 1] : null);
const diasSinVenir = (c) => { const u = ultimaVisita(c); return u == null ? null : diasEntre(u, Date.now()); };
function prefijoCodigo() {
  const p = String(cfg.nombre || '').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('');
  return (sinTildes(p).toUpperCase() || 'BC').slice(0, 2);
}
const codigo = (c) => prefijoCodigo() + '-' + String(c.numero).padStart(4, '0');
const faltan = (c) => Math.max(0, cfg.sellos - c.sellos);
const completa = (c) => c.sellos >= cfg.sellos;
const recordadoHace = (c) => (c.recordado == null ? null : diasEntre(c.recordado, Date.now()));
const recordadoReciente = (c) => { const d = recordadoHace(c); return d != null && d < RECIENTE; };

// Cada cuántos días suele venir: promedio entre sus últimas visitas; si hay pocas, el de los ajustes
function intervalo(c) {
  const v = c.visitas || [];
  if (v.length < 2) return cfg.dias;
  const desde = Math.max(0, v.length - 5); let suma = 0, n = 0;
  for (let i = desde + 1; i < v.length; i++) { suma += diasEntre(v[i - 1], v[i]); n++; }
  return Math.min(Math.max(Math.round(suma / n), 7), 45);
}
function proximoCorte(c) {
  const u = ultimaVisita(c), cada = intervalo(c);
  if (u == null) return { dias: 0, fecha: hoy0(), cada };
  const fecha = inicioDia(u) + cada * DIA;
  return { dias: diasEntre(Date.now(), fecha), fecha, cada };
}

// ---------- Tema (color principal con contraste AA) ----------
function hexRgb(h) {
  h = String(h).replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbHex = (r) => '#' + r.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
function luminancia(rgb) {
  const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contraste(a, b) { const la = luminancia(a), lb = luminancia(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
const mezclar = (a, b, t) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t);
function aplicarTema() {
  const marca = hexRgb(cfg.color);
  const carbon = hexRgb('#14120f'), crema = hexRgb('#efe6d3'), tarjeta = hexRgb('#1a1712');
  const sobre = contraste(marca, carbon) >= contraste(marca, crema) ? '#14120f' : '#efe6d3';
  let texto = marca, t = 0;
  while (contraste(texto, tarjeta) < 4.6 && t < 1) { t += 0.05; texto = mezclar(marca, crema, t); }
  const raiz = document.documentElement.style;
  raiz.setProperty('--marca', cfg.color);
  raiz.setProperty('--sobre-marca', sobre);
  raiz.setProperty('--marca-texto', rgbHex(texto));
}

// ---------- Anuncios (aria-live) y aviso flotante ----------
let temporizadorAviso = null;
function anunciar(txt) {
  const el = $('[data-anuncio]');
  el.textContent = '';
  window.setTimeout(() => { el.textContent = txt; }, 30);
}
function aviso(txt, conDeshacer) {
  const caja = $('[data-aviso]');
  $('[data-aviso-texto]').textContent = txt;
  $('[data-aviso-accion]').hidden = !conDeshacer;
  caja.hidden = false;
  window.clearTimeout(temporizadorAviso);
  temporizadorAviso = window.setTimeout(() => { caja.hidden = true; }, conDeshacer ? 8000 : 3500);
}
/* Ejecuta un cambio en los datos; si falla, lo dice en simple y devuelve null. */
async function intentar(fn) {
  try { return await fn(); }
  catch (e) { const m = (e && e.message) || 'No se pudo hacer. Inténtalo de nuevo.'; aviso(m, false); anunciar(m); return null; }
}

// ---------- Tarjeta (se dibuja igual en cliente, panel y portada) ----------
const giroSello = (i) => ((i * 37) % 23) - 11; // giro «a mano», estable por posición
function htmlTarjeta(c, opciones) {
  opciones = opciones || {};
  const total = cfg.sellos, nuevos = opciones.nuevos || [];
  const cols = Math.ceil((total + 1) / 2);
  let sellos = '';
  for (let i = 0; i < total; i++) {
    const lleno = i < c.sellos, nuevo = nuevos.indexOf(i) >= 0;
    const retraso = nuevo ? (nuevos.indexOf(i) * 0.18) + 's' : '0s';
    sellos += '<li class="sello' + (lleno ? ' lleno' : '') + (nuevo ? ' nuevo' : '') +
      '" style="--giro:' + giroSello(i) + 'deg;--retraso:' + retraso + '">' +
      (lleno ? '<svg aria-hidden="true"><use href="#tijera"/></svg>' : '<span aria-hidden="true">' + (i + 1) + '</span>') + '</li>';
  }
  sellos += '<li class="sello premio' + (completa(c) ? ' listo' : '') + '"><span aria-hidden="true">' + escapar(premioCorto()) + '</span></li>';
  const etiqueta = c.nombre + ': ' + Math.min(c.sellos, total) + ' de ' + total + ' sellos' +
    (completa(c) ? '. Tarjeta completa, ' + minuscula(cfg.premio) + ' listo para canjear.' : '. Faltan ' + faltan(c) + ' para ' + minuscula(cfg.premio) + '.');
  return '<article class="tarjeta" aria-label="' + escapar(etiqueta) + '">' +
    '<span class="tarjeta__poste" aria-hidden="true"></span>' +
    '<div class="tarjeta__cabeza"><div><p class="tarjeta__barberia">' + escapar(cfg.nombre) + '</p>' +
    '<p class="tarjeta__tipo">Tarjeta de cliente</p></div>' +
    '<p class="tarjeta__numero">Nº ' + String(c.numero).padStart(4, '0') + '</p></div>' +
    '<p class="tarjeta__titular">A nombre de<strong>' + escapar(c.nombre) + '</strong></p>' +
    '<ol class="sellos" style="--cols:' + cols + '" aria-hidden="true">' + sellos + '</ol>' +
    '<div class="tarjeta__pie"><span><strong>' + Math.min(c.sellos, total) + '/' + total + '</strong> sellos</span>' +
    '<span class="tarjeta__regla">' + escapar(regla()) + '</span></div></article>';
}
function regla() {
  if (/^corte\s+gratis$/i.test(cfg.premio.trim())) return cfg.sellos + ' cortes y el siguiente es gratis';
  return 'Cada ' + cfg.sellos + ' cortes: ' + minuscula(cfg.premio);
}
function premioCorto() { const p = cfg.premio.trim(); return p.length > 14 ? 'Premio' : p; }

// ---------- Enlaces ----------
const enlaceWa = (numero, texto) => 'https://wa.me/' + soloDigitos(numero) + '?text=' + encodeURIComponent(texto);
const urlTarjeta = (c) => location.href.split('#')[0] + '#tarjeta/' + c.token;
function textoReserva(c) {
  return 'Hola ' + cfg.nombre + ', soy ' + c.nombre + '. Quiero reservar hora para un corte. ' +
    'Llevo ' + Math.min(c.sellos, cfg.sellos) + ' de ' + cfg.sellos + ' sellos en mi tarjeta.';
}
function textoRecordatorio(c) {
  const k = faltan(c), d = diasSinVenir(c);
  const cola = k === 0 ? 'Ya tienes tu ' + minuscula(cfg.premio) + ' listo para canjear.'
    : 'Te ' + (k === 1 ? 'falta 1 sello' : 'faltan ' + k + ' sellos') + ' para tu ' + minuscula(cfg.premio) + '.';
  return 'Hola ' + primerNombre(c.nombre) + ', ya pasaron ' + d + ' días desde tu último corte en ' + cfg.nombre +
    '. ¿Te reservo hora esta semana? ' + cola + ' Tu tarjeta: ' + urlTarjeta(c);
}
function textoEnviarTarjeta(c) {
  return 'Hola ' + primerNombre(c.nombre) + ', esta es tu tarjeta de sellos de ' + cfg.nombre + ': ' + urlTarjeta(c) +
    ' . Ábrela cuando quieras, no tienes que instalar nada. Muéstrala al pagar y te marcamos la visita.';
}

// ---------- Rutas ----------
// #inicio · #cliente[/id] (demo) · #tarjeta/<enlace secreto> (cliente) · #barberia (panel)
const VISTAS = ['inicio', 'cliente', 'tarjeta', 'barberia'];
let vistaActual = null;
function leerRuta() {
  const partes = (location.hash || '').replace(/^#/, '').split('/');
  if (VISTAS.indexOf(partes[0]) < 0) return null;
  return { vista: partes[0], id: partes.slice(1).join('/') || null };
}
/* En el modo real no hay portada ni selector de clientes: el cliente entra por su enlace y el personal al panel. */
function rutaPermitida(r) {
  if (!real) return r || { vista: 'inicio' };
  if (r && (r.vista === 'barberia' || (r.vista === 'tarjeta' && r.id))) return r;
  const mia = leerLocal(CLAVE_MI_TARJETA, null);
  return mia ? { vista: 'tarjeta', id: mia } : { vista: 'barberia' };
}
async function irA(ruta, enfocar) {
  ruta = rutaPermitida(ruta);
  vistaActual = ruta.vista;
  const seccion = ruta.vista === 'tarjeta' ? 'cliente' : ruta.vista;
  $$('[data-vista]').forEach((s) => { s.hidden = s.getAttribute('data-vista') !== seccion; });
  $$('[data-nav]').forEach((a) => {
    if (a.getAttribute('data-nav') === seccion) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.body.setAttribute('data-pantalla', ruta.vista);
  if (ruta.vista !== 'barberia') cerrarLector();
  $('[data-aviso]').hidden = true;   // un aviso de otra pantalla no debe quedar encima
  if (ruta.vista === 'inicio') renderInicio();
  if (ruta.vista === 'cliente') { if (ruta.id && cliente(ruta.id)) guardarLocal(CLAVE_ACTUAL, ruta.id); await abrirClienteDemo(); }
  if (ruta.vista === 'tarjeta') await abrirTarjeta(ruta.id);
  if (ruta.vista === 'barberia') await abrirPanel();
  ponerTitulo();
  if (enfocar) { window.scrollTo(0, 0); $('#contenido').focus({ preventScroll: true }); }
}
function ponerTitulo() {
  const titulos = { inicio: 'Tarjeta de fidelidad', cliente: 'Mi tarjeta', tarjeta: 'Mi tarjeta', barberia: 'Panel' };
  document.title = (titulos[vistaActual] || 'Tarjeta de fidelidad') + ' · ' + (cfg ? cfg.nombre : 'Barbería');
}

// ---------- Render general ----------
function renderNombres() { $$('[data-nombre-barberia]').forEach((el) => { el.textContent = cfg.nombre; }); }
function enRiesgo() {
  return clientes.filter((c) => { const d = diasSinVenir(c); return d != null && d > cfg.dias; })
    .sort((a, b) => diasSinVenir(b) - diasSinVenir(a));
}
/* A quién conviene escribirle hoy: le toca volver, aceptó mensajes y no le escribiste esta semana. */
const porEscribir = () => enRiesgo().filter((c) => c.acepta && !recordadoReciente(c));

function renderInicio() {
  const c = cliente('c1') || clientes[0];
  $('[data-tarjeta-portada]').innerHTML = c ? htmlTarjeta(c) : '';
  $('[data-total-volver]').textContent = plural(porEscribir().length, 'cliente', 'clientes');
}

// ---------- Vista del cliente ----------
async function abrirClienteDemo() {
  const sel = $('[data-selector-cliente]');
  sel.innerHTML = clientes.map((c) => '<option value="' + escapar(c.id) + '">' + escapar(c.nombre) + ' · ' + formatoTel(c.telefono) + '</option>').join('');
  const c = cliente(leerLocal(CLAVE_ACTUAL, 'c1')) || clientes[0];
  if (!c) return;
  sel.value = c.id;
  tarjetaAbierta = { clave: c.id, cliente: c };
  pintarCliente(c);
}
async function abrirTarjeta(clave) {
  const error = $('[data-tarjeta-error]'), grid = $('[data-cliente-grid]');
  const t = await intentar(() => datos.tarjeta(clave));
  if (!t) {
    error.hidden = false; grid.hidden = true; tarjetaAbierta = null;
    if (real && leerLocal(CLAVE_MI_TARJETA, null) === clave) guardarLocal(CLAVE_MI_TARJETA, null);
    return;
  }
  error.hidden = true; grid.hidden = false;
  if (real) { cfg = t.config; aplicarTema(); renderNombres(); guardarLocal(CLAVE_MI_TARJETA, clave); }
  else reemplazar(Object.assign({}, cliente(t.cliente.id) || {}, t.cliente));
  tarjetaAbierta = { clave, cliente: t.cliente };
  pintarCliente(t.cliente);
}

function pintarCliente(c, forzarNuevos) {
  $('[data-cliente-grid]').hidden = false;
  // Animar los sellos que el cliente todavía no había visto
  const vistos = leerLocal(CLAVE_VISTO, {});
  const visto = typeof vistos[c.token] === 'number' ? Math.min(vistos[c.token], c.sellos) : c.sellos;
  let nuevos = [];
  if (forzarNuevos) nuevos = forzarNuevos;
  else for (let i = visto; i < c.sellos; i++) nuevos.push(i);
  vistos[c.token] = c.sellos; guardarLocal(CLAVE_VISTO, vistos);

  $('[data-tarjeta-cliente]').innerHTML = htmlTarjeta(c, { nuevos });
  $('[data-estado-tarjeta]').innerHTML = completa(c)
    ? '<strong>Completaste tu tarjeta.</strong> Muéstrala en la barbería y canjea tu ' + escapar(minuscula(cfg.premio)) + '.'
    : 'Te ' + (faltan(c) === 1 ? 'falta <strong>1 sello</strong>' : 'faltan <strong>' + faltan(c) + ' sellos</strong>') + ' para tu ' + escapar(minuscula(cfg.premio)) + '.';

  const p = proximoCorte(c);
  let valor, nota;
  if (p.dias > 1) { valor = 'en ' + p.dias + ' días'; nota = 'Cerca del ' + fechaLarga(p.fecha) + '. Sueles venir cada ' + p.cada + ' días.'; }
  else if (p.dias === 1) { valor = 'mañana'; nota = mayuscula(fechaLarga(p.fecha)) + '. Sueles venir cada ' + p.cada + ' días.'; }
  else if (p.dias === 0) { valor = 'hoy'; nota = 'Ya te toca. Reserva y llega con el pelo a tiempo.'; }
  else { valor = 'ya te toca'; nota = 'Tu corte estaba recomendado hace ' + plural(-p.dias, 'día', 'días') + '.'; }
  if (ultimaVisita(c) == null) { valor = 'cuando quieras'; nota = 'Todavía no tienes visitas marcadas.'; }
  $('[data-proximo-valor]').textContent = valor;
  $('[data-proximo-nota]').textContent = nota;

  const reservar = $('[data-reservar]');
  reservar.hidden = !cfg.whatsapp;
  reservar.href = enlaceWa(telCompleto(cfg.whatsapp), textoReserva(c));
  $('[data-codigo-cliente]').textContent = codigo(c);
  $('[data-simular-sello]').textContent = completa(c) ? 'Probar: me canjean el premio' : 'Probar: me marcan un sello';
  const acepta = $('[data-acepta-avisos]');
  acepta.checked = !!c.acepta;
  dibujarQR(c);

  const hist = (c.visitas || []).slice(-5).reverse();
  $('[data-historial]').innerHTML = hist.length
    ? hist.map((v) => '<li><span>' + mayuscula(fechaLarga(v)) + '</span><span>' + hace(diasEntre(v, Date.now())) + '</span></li>').join('')
    : '<li><span>Aún no hay visitas.</span><span></span></li>';
}

function dibujarQR(c) {
  const caja = $('[data-qr]');
  caja.innerHTML = '';
  caja.setAttribute('aria-label', 'Código QR de la tarjeta de ' + c.nombre + ', código ' + codigo(c));
  if (typeof window.QRCode !== 'function') {
    caja.innerHTML = '<div class="qr__alterno">' + escapar(codigo(c)) + '<br>(QR no disponible sin conexión)</div>';
    return;
  }
  try {
    new window.QRCode(caja, { text: urlTarjeta(c), width: 240, height: 240, colorDark: '#14120f', colorLight: '#efe6d3', correctLevel: window.QRCode.CorrectLevel.M });
    const img = caja.querySelector('img');
    if (img) img.alt = '';
    caja.removeAttribute('title');
  } catch (err) {
    caja.innerHTML = '<div class="qr__alterno">' + escapar(codigo(c)) + '</div>';
  }
}

// ---------- Panel de la barbería ----------
let seleccionadoId = null;
let ultimaAccion = null;     // { id, accion, texto } para «Deshacer»
let bloqueo = { id: null, hasta: 0 };   // evita marcar dos veces al mismo cliente con un doble toque
let registrando = false;
let buscarPorNombre = false;
let panelCargado = false;

async function abrirPanel() {
  if (real) {
    const s = await intentar(() => datos.sesion());
    if (!s) { mostrarLogin(true); return; }
  }
  if (!panelCargado || real) {
    const p = await intentar(() => datos.panel());
    if (!p) return;
    cfg = p.config; clientes = p.clientes; puedeAjustar = p.puedeAjustar !== false;
    if (!panelCargado) datos.alCambiar(recargarPanel);
    panelCargado = true;
  }
  aplicarTema(); renderNombres(); renderPanel();
  mostrarLogin(false);   // el panel se muestra recién con sus datos cargados
}
async function recargarPanel() {
  const p = await intentar(() => datos.panel());
  if (!p) return;
  cfg = p.config; clientes = p.clientes;
  aplicarTema(); renderNombres();
  if (vistaActual === 'barberia') { renderResultados(); renderSeleccionado(); renderVolver(); renderNumeros(); }
  if (vistaActual === 'inicio') renderInicio();
  if (vistaActual === 'cliente') abrirClienteDemo();
}
function mostrarLogin(si) {
  $('[data-login]').hidden = !si;
  $('[data-panel]').hidden = si;
  if (si) window.setTimeout(() => { const c = $('#login-correo'); if (c) c.focus(); }, 0);
}

function renderPanel() {
  renderResultados();
  renderSeleccionado();
  renderVolver();
  renderNumeros();
  llenarAjustes();
  $('[data-bloque-ajustes]').hidden = !puedeAjustar;
  $('[data-saltar-a="bloque-ajustes"]').hidden = !puedeAjustar;
  $('[data-salir]').hidden = !real;
  $('[data-restablecer]').hidden = real;
}

/* Busca por los últimos dígitos del celular (lo normal), por nombre o por el código de la tarjeta. */
function buscar(q) {
  const texto = sinTildes(q).trim(), digitos = soloDigitos(q);
  if (!texto) return clientes.filter((c) => ultimaVisita(c) != null).sort((a, b) => ultimaVisita(b) - ultimaVisita(a)).slice(0, 5);
  const cod = /^[a-z]{1,3}-?\d+$/i.test(q.trim()) ? parseInt(digitos, 10) : null;
  if (cod != null) return clientes.filter((c) => c.numero === cod);
  if (/^[\d\s+-]+$/.test(q.trim())) {
    if (digitos.length <= 4) return clientes.filter((c) => soloDigitos(c.telefono).endsWith(digitos)).slice(0, 8);
    return clientes.filter((c) => soloDigitos(c.telefono).indexOf(digitos) >= 0 || ('569' + digitos).indexOf(soloDigitos(c.telefono)) >= 0).slice(0, 8);
  }
  if (texto.length < 2) return [];
  return clientes.filter((c) => sinTildes(c.nombre).indexOf(texto) >= 0).slice(0, 8);
}

function renderResultados() {
  const q = $('[data-buscar]').value;
  const lista = buscar(q), hay = q.trim().length > 0;
  const rotulo = $('[data-rotulo-resultados]'), ul = $('[data-resultados]');
  // Con un cliente elegido, la lista se esconde para que el botón grande quede a la vista.
  const esconder = !!seleccionadoId;
  rotulo.hidden = esconder; ul.hidden = esconder;
  rotulo.textContent = hay ? (lista.length ? 'Resultados' : 'Sin resultados') : 'Atendidos hace poco';
  if (lista.length) {
    ul.innerHTML = lista.map((c) => '<li><button type="button" class="resultado" data-elegir="' + escapar(c.id) + '" aria-pressed="' + (c.id === seleccionadoId) + '">' +
      '<span class="resultado__nombre">' + escapar(c.nombre) + '</span>' +
      '<span class="resultado__tel">' + formatoTel(c.telefono) + ' · ' + codigo(c) + '</span>' +
      '<span class="resultado__sellos">' + Math.min(c.sellos, cfg.sellos) + '/' + cfg.sellos + '</span></button></li>').join('');
  } else if (hay) {
    const corto = soloDigitos(q).length > 0 && soloDigitos(q).length < 4 && /^[\d\s+-]+$/.test(q.trim());
    ul.innerHTML = '<li class="resultados__vacio"><p>' + (corto ? 'Escribe los 4 últimos dígitos del celular.' : 'No hay nadie con ese dato.') + '</p>' +
      (corto ? '' : '<button type="button" class="btn btn--marca btn--ancho" data-nuevo-desde-busqueda>Registrar cliente nuevo</button>') + '</li>';
  } else {
    ul.innerHTML = '<li class="resultados__vacio"><p>Todavía no hay visitas marcadas.</p></li>';
  }
}

function elegir(id, avisar) {
  const c = cliente(id);
  if (!c) return;
  seleccionadoId = id;
  if (ultimaAccion && ultimaAccion.id !== id) ultimaAccion = null;
  cerrarNuevo(false);
  renderResultados();
  renderSeleccionado();
  if (avisar) anunciar('Cliente: ' + c.nombre + ', ' + Math.min(c.sellos, cfg.sellos) + ' de ' + cfg.sellos + ' sellos. ' + (completa(c) ? 'Tiene el premio listo.' : 'Toca Marcar visita.'));
}
/* Enfoca el botón principal: cierra el teclado del celular y deja el botón a la vista. */
function enfocarAccion() {
  const c = cliente(seleccionadoId);
  if (!c) return;
  const b = completa(c) ? $('[data-canjear]') : $('[data-mas-sello]');
  b.focus({ preventScroll: true });
  const caja = $('[data-seleccionado]');
  const r = caja.getBoundingClientRect();
  if (r.top < 88 || r.top > window.innerHeight * 0.5) caja.scrollIntoView({ block: 'start', behavior: suave() });
}

function renderSeleccionado(nuevos) {
  const caja = $('[data-seleccionado]');
  const c = seleccionadoId ? cliente(seleccionadoId) : null;
  if (!c) { caja.hidden = true; return; }
  caja.hidden = false;
  const d = diasSinVenir(c);
  $('[data-sel-nombre]').textContent = c.nombre;
  $('[data-sel-dato]').textContent = Math.min(c.sellos, cfg.sellos) + ' de ' + cfg.sellos + ' sellos · ' +
    (d == null ? 'sin visitas aún' : 'última visita ' + hace(d)) + ' · ' + codigo(c);
  const yaVino = d === 0 && !(ultimaAccion && ultimaAccion.id === c.id);
  const avisoSel = $('[data-sel-aviso]');
  avisoSel.hidden = !yaVino;
  avisoSel.textContent = yaVino ? 'Ya tiene una visita marcada hoy. Márcale otra solo si volvió.' : '';
  $('[data-tarjeta-panel]').innerHTML = htmlTarjeta(c, { nuevos: nuevos || [] });
  const lleno = completa(c);
  $('[data-mas-sello]').hidden = lleno;
  const canje = $('[data-canjear]');
  canje.hidden = !lleno;
  canje.textContent = 'Canjear ' + minuscula(cfg.premio);
  const dz = $('[data-deshacer-caja]');
  if (ultimaAccion && ultimaAccion.id === c.id) { dz.hidden = false; $('[data-deshacer-texto]').textContent = ultimaAccion.texto; }
  else dz.hidden = true;
  const enviar = $('[data-enviar-tarjeta]');
  enviar.href = enlaceWa(c.telefono, textoEnviarTarjeta(c));
  $('[data-enviar-nombre]').textContent = primerNombre(c.nombre);
  const borrar = $('[data-borrar-cliente]');
  borrar.hidden = !puedeAjustar;
  borrar.classList.remove('confirmar'); borrar.textContent = 'Borrar sus datos';
}

async function marcar(esCanje) {
  const c = cliente(seleccionadoId);
  if (!c || completa(c) !== esCanje) return;
  if (bloqueo.id === c.id && Date.now() < bloqueo.hasta) return;
  bloqueo = { id: c.id, hasta: Infinity };
  const r = await intentar(() => (esCanje ? datos.canjear(c.id) : datos.marcarVisita(c.id)));
  bloqueo = { id: c.id, hasta: r ? Date.now() + 1500 : 0 };
  if (!r) return;
  reemplazar(r.cliente);
  const n = r.cliente, total = cfg.sellos;
  ultimaAccion = { id: n.id, accion: r.accion, texto: esCanje ? mayuscula(minuscula(cfg.premio)) + ' canjeado.' : 'Visita marcada: ' + n.sellos + ' de ' + total + '.' };
  $('[data-buscar]').value = '';
  renderSeleccionado(esCanje ? [] : [n.sellos - 1]);
  renderResultados(); renderVolver(); renderNumeros();
  if (esCanje) {
    $('[data-mas-sello]').focus();
    const t = $('.tarjeta', $('[data-tarjeta-panel]'));
    if (t) t.classList.add('temblor');
    anunciar(cfg.premio + ' canjeado para ' + n.nombre + '. La tarjeta vuelve a cero.');
    aviso('Canjeado · la tarjeta de ' + primerNombre(n.nombre) + ' parte de nuevo', false);
  } else {
    const btn = completa(n) ? $('[data-canjear]') : $('[data-mas-sello]');
    btn.classList.remove('ok'); void btn.offsetWidth; btn.classList.add('ok');
    if (completa(n)) btn.focus(); // el botón de visita se oculta: el foco pasa a «Canjear»
    anunciar(completa(n)
      ? 'Visita marcada a ' + n.nombre + '. Tarjeta completa: ' + total + ' de ' + total + '. La próxima vez canjea su ' + minuscula(cfg.premio) + '.'
      : 'Visita marcada a ' + n.nombre + ': ' + n.sellos + ' de ' + total + '.');
    aviso(completa(n) ? 'Tarjeta completa · ' + n.nombre : 'Visita marcada · ' + n.sellos + ' de ' + total, false);
  }
}

async function deshacer() {
  if (!ultimaAccion) return;
  const a = ultimaAccion;
  const c = await intentar(() => datos.deshacer(a.accion));
  if (!c) return;
  ultimaAccion = null;
  bloqueo = { id: null, hasta: 0 };
  reemplazar(c);
  seleccionadoId = c.id;
  renderSeleccionado(); renderResultados(); renderVolver(); renderNumeros();
  $('[data-aviso]').hidden = true;
  (completa(c) ? $('[data-canjear]') : $('[data-mas-sello]')).focus();
  anunciar('Listo, se deshizo. ' + c.nombre + ' tiene ' + c.sellos + ' de ' + cfg.sellos + ' sellos.');
}

// ---------- Les toca volver ----------
function renderVolver() {
  const lista = enRiesgo();
  // Primero a quienes conviene escribirles; al final los que ya recibieron mensaje o no aceptaron.
  const peso = (c) => (!c.acepta ? 2 : recordadoReciente(c) ? 1 : 0);
  lista.sort((a, b) => peso(a) - peso(b) || diasSinVenir(b) - diasSinVenir(a));
  const pendientes = porEscribir().length;
  $('[data-volver-nota]').textContent = lista.length
    ? 'Llevan más de ' + cfg.dias + ' días sin venir. Toca WhatsApp y el mensaje se abre listo para enviar.'
    : '';
  $('[data-n-volver]').textContent = pendientes ? String(pendientes) : '';
  $('[data-n-volver-chip]').textContent = pendientes ? ' · ' + pendientes : '';
  $('[data-volver]').innerHTML = lista.length ? lista.map((c) => {
    const d = diasSinVenir(c), k = faltan(c), r = recordadoHace(c);
    const dato = '<strong>' + d + ' días</strong> sin venir · ' + (k === 0 ? 'premio listo' : 'le ' + (k === 1 ? 'falta 1 sello' : 'faltan ' + k));
    let accion;
    if (!c.acepta) accion = '<p class="volver__estado">No aceptó mensajes</p>';
    else accion = '<a class="btn ' + (recordadoReciente(c) ? 'btn--suave' : 'btn--whatsapp') + ' btn--chico volver__boton" data-recordar="' + escapar(c.id) + '" target="_blank" rel="noopener" href="' +
      escapar(enlaceWa(c.telefono, textoRecordatorio(c))) + '">' +
      '<svg class="ico" aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Z" opacity=".25"/><path fill="currentColor" d="M16.5 14.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>' +
      (recordadoReciente(c) ? 'Otra vez' : 'WhatsApp') + '<span class="sr"> a ' + escapar(c.nombre) + '</span></a>';
    return '<li class="' + (peso(c) ? 'volver__fila--hecha' : '') + '">' +
      '<div class="volver__info"><p class="volver__nombre">' + escapar(c.nombre) + '</p>' +
      '<p class="volver__dato">' + dato + '</p>' +
      (c.acepta && r != null && r < RECIENTE ? '<p class="volver__hecho">Le escribiste ' + hace(r) + '.</p>' : '') +
      '</div>' + accion + '</li>';
  }).join('') : '<li class="volver__vacio">Nadie lleva más de ' + cfg.dias + ' días sin venir. Buena semana.</li>';
}

function renderNumeros() {
  let activos = 0, riesgo = 0, canjes = 0, mes = 0;
  const ahora = new Date(), m = ahora.getMonth(), a = ahora.getFullYear();
  clientes.forEach((c) => {
    const d = diasSinVenir(c);
    if (d != null && d <= cfg.dias) activos++;
    if (d != null && d > cfg.dias) riesgo++;
    canjes += c.canjes || 0;
    (c.visitas || []).forEach((v) => { const f = new Date(v); if (f.getMonth() === m && f.getFullYear() === a) mes++; });
  });
  $('[data-n-activos]').textContent = activos;
  $('[data-n-riesgo]').textContent = riesgo;
  $('[data-n-canjes]').textContent = canjes;
  $('[data-n-mes]').textContent = mes;
  $('[data-numeros-nota]').textContent = 'Activo: vino en los últimos ' + cfg.dias + ' días. En riesgo: lleva más de ' + cfg.dias + '. Visitas de ' + MESES[m] + ' de ' + a + '.';
}

// ---------- Cliente nuevo (desde la misma búsqueda) ----------
function errorCampo(form, nombre, msg) {
  const input = form.elements[nombre];
  const p = $('[data-error="' + nombre + '"]', form);
  if (p) p.textContent = msg || '';
  if (input) { if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
  return !msg;
}
const formatoOcho = (d) => (d.length > 4 ? d.slice(0, 4) + ' ' + d.slice(4) : d);
function abrirNuevo() {
  const form = $('[data-form-nuevo]'), q = $('[data-buscar]').value.trim();
  form.reset();
  errorCampo(form, 'nombre', ''); errorCampo(form, 'telefono', '');
  // Lo escrito en la búsqueda se aprovecha: un celular completo o un nombre.
  const d = soloDigitos(q);
  if (/^[\d\s+-]+$/.test(q) && d.length >= 8) form.elements.telefono.value = formatoOcho(d.slice(-8));
  else if (/\p{L}/u.test(q)) form.elements.nombre.value = q.replace(/\s+/g, ' ');
  seleccionadoId = null; renderSeleccionado();
  form.hidden = false;
  $('[data-abrir-nuevo]').setAttribute('aria-expanded', 'true');
  form.scrollIntoView({ block: 'nearest', behavior: suave() });
  (form.elements.nombre.value ? form.elements.telefono : form.elements.nombre).focus({ preventScroll: true });
  if (form.elements.nombre.value && form.elements.telefono.value) form.elements.acepta.focus({ preventScroll: true });
}
function cerrarNuevo(enfocar) {
  const form = $('[data-form-nuevo]');
  if (form.hidden) return;
  form.hidden = true;
  $('[data-abrir-nuevo]').setAttribute('aria-expanded', 'false');
  if (enfocar) $('[data-buscar]').focus();
}
async function registrar(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  if (registrando) return;
  const nombre = form.elements.nombre.value.trim().replace(/\s+/g, ' ');
  const ocho = soloDigitos(form.elements.telefono.value);
  let ok = true;
  ok = errorCampo(form, 'nombre', nombre.length < 2 ? 'Escribe el nombre del cliente.' : '') && ok;
  const tel = telCompleto(ocho);
  let errTel = '';
  if (ocho.length !== 8) errTel = 'El celular debe tener 8 dígitos después del +56 9.';
  else if (clientes.some((c) => soloDigitos(c.telefono) === soloDigitos(tel))) errTel = 'Ese celular ya está registrado. Búscalo arriba.';
  ok = errorCampo(form, 'telefono', errTel) && ok;
  if (!ok) { const inv = form.querySelector('[aria-invalid="true"]'); if (inv) inv.focus(); return; }
  registrando = true;
  try {
    let c;
    try { c = await datos.registrar({ nombre, telefono: tel, acepta: form.elements.acepta.checked }); }
    catch (e) {
      if (e.campo) { errorCampo(form, e.campo, e.message); form.elements[e.campo].focus(); }
      else { aviso(e.message, false); anunciar(e.message); }
      return;
    }
    reemplazar(c);
    // Primera visita marcada en el mismo paso: el cliente nuevo viene a cortarse.
    const r = await intentar(() => datos.marcarVisita(c.id));
    if (r) { reemplazar(r.cliente); ultimaAccion = { id: c.id, accion: r.accion, texto: 'Primera visita marcada.' }; bloqueo = { id: c.id, hasta: Date.now() + 1500 }; }
    form.reset(); form.hidden = true;
    $('[data-abrir-nuevo]').setAttribute('aria-expanded', 'false');
    $('[data-buscar]').value = '';
    elegir(c.id);
    renderNumeros(); renderVolver();
    $('[data-seleccionado]').scrollIntoView({ block: 'start', behavior: suave() });
    $('[data-enviar-tarjeta]').focus({ preventScroll: true });
    anunciar('Listo: ' + nombre + ' quedó registrado con su primera visita. Ahora mándale su tarjeta por WhatsApp.');
    aviso('Registrado · ' + codigo(cliente(c.id)) + ' · mándale su tarjeta', false);
  } finally {
    registrando = false;
  }
}

let temporizadorBorrar = null;
async function borrarCliente(ev) {
  const b = ev.currentTarget, c = cliente(seleccionadoId);
  if (!c) return;
  if (!b.classList.contains('confirmar')) {
    b.classList.add('confirmar');
    b.textContent = 'Toca otra vez para borrar a ' + primerNombre(c.nombre);
    anunciar('Toca otra vez para borrar los datos de ' + c.nombre + '. No se puede deshacer.');
    window.clearTimeout(temporizadorBorrar);
    temporizadorBorrar = window.setTimeout(() => { b.classList.remove('confirmar'); b.textContent = 'Borrar sus datos'; }, 5000);
    return;
  }
  window.clearTimeout(temporizadorBorrar);
  const ok = await intentar(async () => { await datos.borrarCliente(c.id); return true; });
  if (!ok) return;
  clientes = clientes.filter((x) => x.id !== c.id);
  seleccionadoId = null; ultimaAccion = null;
  renderSeleccionado(); renderResultados(); renderVolver(); renderNumeros();
  $('[data-buscar]').focus();
  anunciar('Datos de ' + c.nombre + ' borrados.');
  aviso('Datos de ' + primerNombre(c.nombre) + ' borrados', false);
}

// ---------- Ajustes ----------
function llenarAjustes() {
  const f = $('[data-form-ajustes]');
  f.elements.nombre.value = cfg.nombre;
  f.elements.color.value = cfg.color;
  f.elements.whatsapp.value = cfg.whatsapp;
  f.elements.sellos.value = cfg.sellos;
  f.elements.dias.value = cfg.dias;
  f.elements.premio.value = cfg.premio;
  marcarMuestra(cfg.color);
}
function marcarMuestra(color) {
  $$('.muestra').forEach((b) => { b.setAttribute('aria-pressed', String(b.getAttribute('data-color').toLowerCase() === String(color).toLowerCase())); });
}
async function guardarAjustes(ev) {
  ev.preventDefault();
  const f = ev.currentTarget;
  let ok = true;
  const nombre = f.elements.nombre.value.trim().replace(/\s+/g, ' ');
  const wa = soloDigitos(f.elements.whatsapp.value);
  const sellos = parseInt(f.elements.sellos.value, 10);
  const dias = parseInt(f.elements.dias.value, 10);
  const premio = f.elements.premio.value.trim().replace(/\s+/g, ' ');
  const color = /^#[0-9a-f]{6}$/i.test(f.elements.color.value) ? f.elements.color.value : '#c08f55';
  ok = errorCampo(f, 'nombre', nombre.length < 2 ? 'Escribe el nombre de la barbería.' : '') && ok;
  ok = errorCampo(f, 'whatsapp', wa.length !== 8 ? 'Deben ser 8 dígitos después del +56 9.' : '') && ok;
  ok = errorCampo(f, 'sellos', !(sellos >= 4 && sellos <= 15) ? 'Entre 4 y 15 sellos.' : '') && ok;
  ok = errorCampo(f, 'dias', !(dias >= 5 && dias <= 90) ? 'Entre 5 y 90 días.' : '') && ok;
  ok = errorCampo(f, 'premio', premio.length < 3 ? 'Escribe el premio, por ejemplo «Corte gratis».' : '') && ok;
  if (!ok) { const inv = f.querySelector('[aria-invalid="true"]'); if (inv) inv.focus(); return; }
  const nuevo = await intentar(() => datos.guardarAjustes({ nombre, color: color.toLowerCase(), whatsapp: wa, sellos, dias, premio }));
  if (!nuevo) return;
  cfg = nuevo;
  aplicarTema(); renderNombres(); ponerTitulo(); renderPanel();
  anunciar('Ajustes guardados.');
  aviso('Ajustes guardados', false);
}

let temporizadorReset = null;
async function restablecer(ev) {
  const b = ev.currentTarget;
  if (!b.classList.contains('confirmar')) {
    b.classList.add('confirmar');
    b.textContent = 'Toca otra vez para confirmar';
    anunciar('Toca otra vez para confirmar. Se borran los cambios y vuelven los datos de ejemplo.');
    window.clearTimeout(temporizadorReset);
    temporizadorReset = window.setTimeout(() => { b.classList.remove('confirmar'); b.textContent = 'Restablecer datos de ejemplo'; }, 5000);
    return;
  }
  window.clearTimeout(temporizadorReset);
  b.classList.remove('confirmar');
  b.textContent = 'Restablecer datos de ejemplo';
  await intentar(() => datos.restablecer());
  guardarLocal(CLAVE_VISTO, {});
  const p = await datos.panel();
  cfg = p.config; clientes = p.clientes;
  seleccionadoId = null; ultimaAccion = null;
  $('[data-buscar]').value = '';
  aplicarTema(); renderNombres(); renderPanel();
  anunciar('Datos de ejemplo restablecidos.');
  aviso('Datos de ejemplo restablecidos', false);
}

// ---------- Lector de QR (cámara, opcional) ----------
let lector = null;
function cargarScript(url) {
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = url; s.async = true; s.onload = ok; s.onerror = mal;
    document.head.appendChild(s);
  });
}
function idDesdeQR(texto) {
  texto = texto || '';
  const t = /#tarjeta\/([A-Za-z0-9_-]{8,64})/.exec(texto);
  if (t) { const c = clientes.find((x) => x.token === t[1]); if (c) return c.id; }
  const m = /#cliente\/([\w-]+)/.exec(texto);
  if (m && cliente(m[1])) return m[1];
  const cod = /\b[A-Z]{1,3}-?(\d{1,6})\b/i.exec(texto);
  if (cod) { const n = parseInt(cod[1], 10); const c = clientes.find((x) => x.numero === n); if (c) return c.id; }
  return null;
}
function abrirLector() {
  const caja = $('[data-lector-caja]'), nota = $('[data-lector-nota]');
  caja.hidden = false;
  nota.textContent = 'Abriendo la cámara…';
  const listo = window.Html5Qrcode ? Promise.resolve() : cargarScript(HTML5QR_URL);
  listo.then(() => {
    if (!window.Html5Qrcode) throw new Error('sin lector');
    lector = new window.Html5Qrcode('lector-qr');
    return lector.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, (texto) => {
      const id = idDesdeQR(texto);
      if (id) {
        cerrarLector();
        $('[data-buscar]').value = '';
        elegir(id);
        aviso('Cliente encontrado · ' + cliente(id).nombre, false);
        anunciar('Código leído. ' + cliente(id).nombre + '. Toca Marcar visita.');
        enfocarAccion();
      } else {
        nota.textContent = 'Ese código no es de una tarjeta de esta barbería.';
      }
    }, () => { /* cuadro sin código: se ignora */ });
  }).then(() => {
    nota.textContent = 'Apunta la cámara al código del cliente.';
  }).catch(() => {
    nota.textContent = 'No se pudo abrir la cámara. Escribe los 4 últimos dígitos de su celular.';
    lector = null;
  });
}
function cerrarLector() {
  const caja = $('[data-lector-caja]');
  if (lector) {
    const l = lector; lector = null;
    try { l.stop().then(() => { try { l.clear(); } catch (e) { /* nada */ } }).catch(() => {}); } catch (e) { /* nada */ }
  }
  if (caja) caja.hidden = true;
}

// ---------- Instalar como app (opcional) ----------
let pedidoInstalar = null;
function prepararInstalacion() {
  const boton = $('[data-instalar]'), estadoTxt = $('[data-instalar-estado]');
  const instalada = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone;
  if (instalada) estadoTxt.textContent = 'Ya la tienes en tu pantalla de inicio.';
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedidoInstalar = e; boton.hidden = false; });
  boton.addEventListener('click', () => {
    if (!pedidoInstalar) return;
    pedidoInstalar.prompt();
    pedidoInstalar.userChoice.then(() => { pedidoInstalar = null; boton.hidden = true; }).catch(() => {});
  });
  window.addEventListener('appinstalled', () => { boton.hidden = true; estadoTxt.textContent = 'Listo, quedó en tu pantalla de inicio.'; });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------- Eventos ----------
function enlazar() {
  window.addEventListener('hashchange', () => { irA(leerRuta(), true); });

  $('[data-saltar]').addEventListener('click', (e) => { e.preventDefault(); $('#contenido').focus(); });
  $('[data-ir-volver]').addEventListener('click', () => {
    window.setTimeout(() => { const b = $('#bloque-volver'); b.scrollIntoView({ block: 'start' }); b.focus({ preventScroll: true }); }, 60);
  });

  // ----- Cliente -----
  $('[data-selector-cliente]').addEventListener('change', (e) => { guardarLocal(CLAVE_ACTUAL, e.target.value); abrirClienteDemo(); });
  $('[data-simular-sello]').addEventListener('click', async () => {
    if (!tarjetaAbierta) return;
    const c = cliente(tarjetaAbierta.cliente.id) || tarjetaAbierta.cliente;
    const lleno = completa(c);
    const r = await intentar(() => (lleno ? datos.canjear(c.id) : datos.marcarVisita(c.id)));
    if (!r) return;
    reemplazar(r.cliente);
    tarjetaAbierta.cliente = r.cliente;
    pintarCliente(r.cliente);
    const n = r.cliente, total = cfg.sellos;
    if (lleno) { anunciar('La barbería canjeó tu ' + minuscula(cfg.premio) + '. Tu tarjeta parte de nuevo.'); aviso('Premio canjeado · tarjeta nueva', false); }
    else { anunciar(completa(n) ? 'Sello agregado. Completaste tu tarjeta: ' + total + ' de ' + total + '.' : 'Sello agregado: ' + n.sellos + ' de ' + total + '.'); aviso(completa(n) ? '¡Tarjeta completa!' : 'Sello agregado · ' + n.sellos + ' de ' + total, false); }
  });
  $('[data-acepta-avisos]').addEventListener('change', async (e) => {
    if (!tarjetaAbierta) return;
    const quiere = e.target.checked;
    const c = await intentar(() => datos.cambiarAvisos(tarjetaAbierta.clave, quiere));
    if (!c) { e.target.checked = !quiere; return; }
    tarjetaAbierta.cliente.acepta = c.acepta;
    if (!real) { const x = cliente(tarjetaAbierta.cliente.id); if (x) x.acepta = c.acepta; }
    const m = c.acepta ? 'Listo: te avisaremos por WhatsApp cuando te toque corte.' : 'Listo: no te enviaremos recordatorios.';
    anunciar(m); aviso(m, false);
  });

  // ----- Panel: buscar y marcar -----
  const entrada = $('[data-buscar]');
  entrada.addEventListener('input', () => {
    const q = entrada.value;
    if (q.trim() && seleccionadoId) { seleccionadoId = null; renderSeleccionado(); }
    cerrarNuevo(false);
    renderResultados();
    // Con 4 dígitos (o el celular completo) que calzan con UNA persona, se elige sola.
    const r = buscar(q);
    const soloNumeros = /^[\d\s+-]+$/.test(q.trim()) && soloDigitos(q).length >= 4;
    const esCodigo = /^[a-z]{1,3}-?\d{1,6}$/i.test(q.trim());
    if (r.length === 1 && (soloNumeros || esCodigo)) { elegir(r[0].id, true); enfocarAccion(); }
  });
  entrada.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const r = buscar(entrada.value);
    if (r.length === 1) { elegir(r[0].id, true); enfocarAccion(); }
    else if (!r.length && entrada.value.trim()) abrirNuevo();
  });
  $('[data-modo-busqueda]').addEventListener('click', (e) => {
    buscarPorNombre = !buscarPorNombre;
    entrada.setAttribute('inputmode', buscarPorNombre ? 'text' : 'numeric');
    entrada.placeholder = buscarPorNombre ? 'Ej: Matías' : 'Ej: 0001';
    $('[data-rotulo-buscar]').textContent = buscarPorNombre ? 'Nombre del cliente' : 'Últimos 4 dígitos del celular';
    e.currentTarget.textContent = buscarPorNombre ? 'Buscar por celular' : 'Buscar por nombre';
    entrada.value = ''; renderResultados();
    entrada.blur(); entrada.focus();
  });
  $('[data-resultados]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-elegir]');
    if (b) { $('[data-buscar]').value = ''; elegir(b.getAttribute('data-elegir'), true); enfocarAccion(); return; }
    if (e.target.closest('[data-nuevo-desde-busqueda]')) abrirNuevo();
  });
  $('[data-sel-cerrar]').addEventListener('click', () => {
    seleccionadoId = null; ultimaAccion = null;
    renderSeleccionado(); renderResultados();
    entrada.focus();
  });
  $('[data-mas-sello]').addEventListener('click', () => marcar(false));
  $('[data-canjear]').addEventListener('click', () => marcar(true));
  $('[data-deshacer]').addEventListener('click', deshacer);
  $('[data-aviso-accion]').addEventListener('click', deshacer);
  $('[data-borrar-cliente]').addEventListener('click', borrarCliente);
  $('[data-escanear]').addEventListener('click', abrirLector);
  $('[data-cerrar-lector]').addEventListener('click', () => { cerrarLector(); $('[data-escanear]').focus(); });

  // ----- Panel: cliente nuevo -----
  $('[data-abrir-nuevo]').addEventListener('click', () => { if ($('[data-form-nuevo]').hidden) abrirNuevo(); else cerrarNuevo(true); });
  $('[data-cancelar-nuevo]').addEventListener('click', () => cerrarNuevo(true));
  const fNuevo = $('[data-form-nuevo]');
  fNuevo.addEventListener('submit', registrar);
  fNuevo.elements.telefono.addEventListener('input', (e) => { e.target.value = formatoOcho(soloDigitos(e.target.value).slice(-8)); });

  // ----- Panel: les toca volver -----
  $('[data-volver]').addEventListener('click', (e) => {
    const a = e.target.closest('[data-recordar]');
    if (!a) return;
    const id = a.getAttribute('data-recordar');
    // El enlace abre WhatsApp; aquí solo se anota que le escribiste (sin frenar la apertura).
    intentar(() => datos.anotarRecordatorio(id)).then((c) => {
      if (!c) return;
      reemplazar(c);
      renderVolver();
      const mismo = $('[data-recordar="' + id + '"]');
      if (mismo) mismo.focus();
    });
  });

  // ----- Panel: saltos, ajustes, sesión -----
  $$('[data-saltar-a]').forEach((b) => {
    b.addEventListener('click', () => {
      const destino = document.getElementById(b.getAttribute('data-saltar-a'));
      if (destino.id === 'bloque-ajustes') $('[data-ajustes-detalle]').open = true;
      destino.scrollIntoView({ block: 'start', behavior: suave() });
      destino.focus({ preventScroll: true });
    });
  });
  const fAj = $('[data-form-ajustes]');
  fAj.addEventListener('submit', guardarAjustes);
  fAj.elements.color.addEventListener('input', (e) => marcarMuestra(e.target.value));
  $$('.muestra').forEach((b) => {
    b.addEventListener('click', () => { fAj.elements.color.value = b.getAttribute('data-color'); marcarMuestra(b.getAttribute('data-color')); });
  });
  $('[data-restablecer]').addEventListener('click', restablecer);

  $('[data-login]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget, err = $('[data-login-error]');
    err.textContent = '';
    try { await datos.entrar(f.elements.correo.value, f.elements.clave.value); }
    catch (x) { err.textContent = x.message; f.elements.clave.focus(); return; }
    f.reset(); panelCargado = false;
    await abrirPanel();
    $('[data-buscar]').focus();
  });
  $('[data-salir]').addEventListener('click', async () => {
    await intentar(() => datos.salir());
    clientes = []; seleccionadoId = null; ultimaAccion = null; panelCargado = false;
    mostrarLogin(true);
  });

  // La tarjeta del cliente se actualiza sola cuando vuelve a la pestaña (y cada 30 s mientras la mira).
  const refrescarTarjeta = () => {
    if (document.visibilityState !== 'visible' || !tarjetaAbierta) return;
    if (vistaActual === 'tarjeta') abrirTarjeta(tarjetaAbierta.clave);
  };
  document.addEventListener('visibilitychange', refrescarTarjeta);
  if (real) window.setInterval(refrescarTarjeta, 30000);
}

// ---------- Arranque ----------
async function iniciar() {
  try { datos = await crearDatos(); }
  catch (e) {
    $('#contenido').innerHTML = '<p class="falla" role="alert">' + escapar(e.message) + '</p>';
    return;
  }
  real = datos.modo === 'real';
  document.body.setAttribute('data-modo', real ? 'real' : 'demo');
  if (!real) {
    const p = await datos.panel();
    cfg = p.config; clientes = p.clientes; puedeAjustar = true; panelCargado = true;
    datos.alCambiar(recargarPanel);
  } else {
    cfg = { nombre: 'Tarjeta de fidelidad', color: '#c08f55', whatsapp: '', sellos: 8, dias: 15, premio: 'Corte gratis' };
  }
  aplicarTema();
  renderNombres();
  enlazar();
  prepararInstalacion();
  await irA(leerRuta(), false);
  // Si qrcodejs llega después (red lenta), se redibuja el QR
  if (typeof window.QRCode !== 'function') {
    window.addEventListener('load', () => { if (tarjetaAbierta && (vistaActual === 'cliente' || vistaActual === 'tarjeta')) dibujarQR(tarjetaAbierta.cliente); });
  }
  // Acceso mínimo para pruebas automatizadas
  window.__fidelidad = { clientes: () => clientes, config: () => cfg, modo: () => datos.modo };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();
