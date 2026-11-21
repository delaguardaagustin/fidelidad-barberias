/* Tarjeta de fidelidad para barberías · demo de SENTRY-CODE
   Sitio estático: todo se guarda en localStorage de este navegador.
   Script clásico (no módulo), sin dependencias salvo qrcodejs por CDN. */
(function () {
  'use strict';

  var ALMACEN_LOCAL = 'fidelidad-barberias:v1';
  var DIA = 86400000;
  var HTML5QR_URL = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';

  var CONFIG_BASE = {
    nombre: 'Barbería Demo',
    color: '#c08f55',
    whatsapp: '00000000',   // 8 dígitos después de +56 9 (número falso de demo)
    sellos: 8,
    dias: 15,
    premio: 'Corte gratis'
  };

  // ---------- Utilidades ----------
  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function $$(sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function inicioDia(ts) { var d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function hoy0() { return inicioDia(Date.now()); }
  function haceDias(n) { return hoy0() - n * DIA + 11 * 3600000; } // 11:00 de ese día
  function diasEntre(a, b) { return Math.round((inicioDia(b) - inicioDia(a)) / DIA); }
  function soloDigitos(s) { return String(s || '').replace(/\D+/g, ''); }
  function sinTildes(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function primerNombre(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function minuscula(s) { s = String(s || '').trim(); return s.charAt(0).toLowerCase() + s.slice(1); }
  function escapar(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
  function telCompleto(ocho) { return '+569' + soloDigitos(ocho); }
  function formatoTel(t) {
    var d = soloDigitos(t);
    if (d.length === 11 && d.indexOf('569') === 0) return '+56 9 ' + d.slice(3, 7) + ' ' + d.slice(7);
    return t;
  }
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  function fechaLarga(ts) { var d = new Date(ts); return DIAS_SEMANA[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; }
  function fechaCorta(ts) { var d = new Date(ts); return d.getDate() + ' de ' + MESES[d.getMonth()]; }
  function hace(n) {
    if (n === 0) return 'hoy';
    if (n === 1) return 'ayer';
    return 'hace ' + n + ' días';
  }

  // ---------- Datos de ejemplo ----------
  // Teléfonos claramente falsos: +56 9 0000 0001 … 0012
  function datosEjemplo() {
    var base = [
      ['Matías Soto',        [3, 18, 33, 48],      7, 0],
      ['Benjamín Rojas',     [22, 41, 58],         3, 0],
      ['Vicente Muñoz',      [8, 24, 39, 55],      8, 0],
      ['Joaquín Díaz',       [27, 50],             2, 0],
      ['Tomás González',     [5, 19, 34],          5, 0],
      ['Cristóbal Pérez',    [35],                 1, 0],
      ['Diego Contreras',    [12, 26, 44, 59],     4, 0],
      ['Sebastián Silva',    [17, 31, 46],         6, 0],
      ['Felipe Morales',     [1, 14, 29, 43, 57],  2, 1],
      ['Martín Araya',       [44],                 1, 0],
      ['Ignacio Fuentes',    [10, 25],             2, 0],
      ['Camilo Espinoza',    [20, 36, 52],         5, 1]
    ];
    var clientes = base.map(function (f, i) {
      var n = i + 1;
      var visitas = f[1].map(haceDias).sort(function (a, b) { return a - b; });
      return {
        id: 'c' + n,
        numero: n,
        nombre: f[0],
        telefono: '+5690000' + String(n).padStart(4, '0'),
        sellos: f[2],
        canjes: f[3],
        visitas: visitas,
        visto: f[2],
        recordado: null,
        creado: visitas[0] || Date.now()
      };
    });
    return { version: 1, config: copia(CONFIG_BASE), clientes: clientes, siguiente: clientes.length + 1, actual: 'c1' };
  }

  // ---------- Estado y guardado ----------
  var estado;
  function valido(e) {
    return e && e.version === 1 && e.config && Array.isArray(e.clientes) && typeof e.siguiente === 'number';
  }
  function cargar() {
    try {
      var crudo = window.localStorage.getItem(ALMACEN_LOCAL);
      if (crudo) {
        var e = JSON.parse(crudo);
        if (valido(e)) {
          e.config = Object.assign(copia(CONFIG_BASE), e.config);
          return e;
        }
      }
    } catch (err) { /* sin almacenamiento: se usa la demo en memoria */ }
    return datosEjemplo();
  }
  function guardar() {
    try { window.localStorage.setItem(ALMACEN_LOCAL, JSON.stringify(estado)); } catch (err) { /* modo privado o bloqueado */ }
  }

  function cliente(id) {
    for (var i = 0; i < estado.clientes.length; i++) if (estado.clientes[i].id === id) return estado.clientes[i];
    return null;
  }
  function ultimaVisita(c) { return c.visitas.length ? c.visitas[c.visitas.length - 1] : null; }
  function diasSinVenir(c) { var u = ultimaVisita(c); return u == null ? null : diasEntre(u, Date.now()); }
  function codigo(c) { return 'BD-' + String(c.numero).padStart(4, '0'); }
  function faltan(c) { return Math.max(0, estado.config.sellos - c.sellos); }
  function completa(c) { return c.sellos >= estado.config.sellos; }

  // Intervalo habitual del cliente: promedio entre sus visitas; si hay pocas, el de los ajustes
  function intervalo(c) {
    var v = c.visitas;
    if (v.length < 2) return estado.config.dias;
    var desde = Math.max(0, v.length - 5), suma = 0, n = 0;
    for (var i = desde + 1; i < v.length; i++) { suma += diasEntre(v[i - 1], v[i]); n++; }
    var prom = Math.round(suma / n);
    return Math.min(Math.max(prom, 7), 45);
  }
  function proximoCorte(c) {
    var u = ultimaVisita(c);
    var cada = intervalo(c);
    if (u == null) return { dias: 0, fecha: hoy0(), cada: cada };
    var fecha = inicioDia(u) + cada * DIA;
    return { dias: diasEntre(Date.now(), fecha), fecha: fecha, cada: cada };
  }

  // ---------- Tema (color principal con contraste AA) ----------
  function hexRgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join('');
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbHex(r) { return '#' + r.map(function (x) { return Math.round(x).toString(16).padStart(2, '0'); }).join(''); }
  function luminancia(rgb) {
    var c = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contraste(a, b) {
    var la = luminancia(a), lb = luminancia(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function mezclar(a, b, t) { return [0, 1, 2].map(function (i) { return a[i] + (b[i] - a[i]) * t; }); }
  function aplicarTema() {
    var marca = hexRgb(estado.config.color);
    var carbon = hexRgb('#14120f'), crema = hexRgb('#efe6d3'), tarjeta = hexRgb('#1a1712');
    var sobre = contraste(marca, carbon) >= contraste(marca, crema) ? '#14120f' : '#efe6d3';
    var texto = marca, t = 0;
    while (contraste(texto, tarjeta) < 4.6 && t < 1) { t += 0.05; texto = mezclar(marca, crema, t); }
    var raiz = document.documentElement.style;
    raiz.setProperty('--marca', estado.config.color);
    raiz.setProperty('--sobre-marca', sobre);
    raiz.setProperty('--marca-texto', rgbHex(texto));
  }

  // ---------- Anuncios (aria-live) y aviso flotante ----------
  var temporizadorAviso = null;
  function anunciar(txt) {
    var el = $('[data-anuncio]');
    el.textContent = '';
    window.setTimeout(function () { el.textContent = txt; }, 30);
  }
  function aviso(txt, conDeshacer) {
    var caja = $('[data-aviso]');
    $('[data-aviso-texto]').textContent = txt;
    $('[data-aviso-accion]').hidden = !conDeshacer;
    caja.hidden = false;
    window.clearTimeout(temporizadorAviso);
    temporizadorAviso = window.setTimeout(function () { caja.hidden = true; }, conDeshacer ? 8000 : 3500);
  }

  // ---------- Tarjeta (se dibuja igual en cliente, panel y portada) ----------
  function giroSello(i) { return ((i * 37) % 23) - 11; } // giro "a mano", estable por posición
  function htmlTarjeta(c, opciones) {
    opciones = opciones || {};
    var cfg = estado.config;
    var total = cfg.sellos;
    var nuevos = opciones.nuevos || [];
    var cols = Math.ceil((total + 1) / 2);
    var sellos = '';
    for (var i = 0; i < total; i++) {
      var lleno = i < c.sellos;
      var nuevo = nuevos.indexOf(i) >= 0;
      var retraso = nuevo ? (nuevos.indexOf(i) * 0.18) + 's' : '0s';
      sellos += '<li class="sello' + (lleno ? ' lleno' : '') + (nuevo ? ' nuevo' : '') +
        '" style="--giro:' + giroSello(i) + 'deg;--retraso:' + retraso + '">' +
        (lleno ? '<svg aria-hidden="true"><use href="#tijera"/></svg>' : '<span aria-hidden="true">' + (i + 1) + '</span>') +
        '</li>';
    }
    sellos += '<li class="sello premio' + (completa(c) ? ' listo' : '') + '"><span aria-hidden="true">' + escapar(premioCorto()) + '</span></li>';
    var etiqueta = c.nombre + ': ' + Math.min(c.sellos, total) + ' de ' + total + ' sellos' +
      (completa(c) ? '. Tarjeta completa, ' + minuscula(cfg.premio) + ' listo para canjear.' : '. Faltan ' + faltan(c) + ' para ' + minuscula(cfg.premio) + '.');
    return '<article class="tarjeta" aria-label="' + escapar(etiqueta) + '">' +
      '<span class="tarjeta__poste" aria-hidden="true"></span>' +
      '<div class="tarjeta__cabeza"><div><p class="tarjeta__barberia">' + escapar(cfg.nombre) + '</p>' +
      '<p class="tarjeta__tipo">Tarjeta de cliente</p></div>' +
      '<p class="tarjeta__numero">Nº ' + String(c.numero).padStart(4, '0') + '</p></div>' +
      '<p class="tarjeta__titular">A nombre de<strong>' + escapar(c.nombre) + '</strong></p>' +
      '<ol class="sellos" style="--cols:' + cols + '" aria-hidden="true">' + sellos + '</ol>' +
      '<div class="tarjeta__pie"><span><strong>' + Math.min(c.sellos, total) + '/' + total + '</strong> sellos</span>' +
      '<span class="tarjeta__regla">' + escapar(regla()) + '</span></div>' +
      '</article>';
  }
  function regla() {
    var cfg = estado.config;
    if (/^corte\s+gratis$/i.test(cfg.premio.trim())) return cfg.sellos + ' cortes y el siguiente es gratis';
    return 'Cada ' + cfg.sellos + ' cortes: ' + minuscula(cfg.premio);
  }
  function premioCorto() {
    var p = estado.config.premio.trim();
    return p.length > 14 ? 'Premio' : p;
  }

  // ---------- Enlaces de WhatsApp ----------
  function enlaceWa(numero, texto) { return 'https://wa.me/' + soloDigitos(numero) + '?text=' + encodeURIComponent(texto); }
  function textoReserva(c) {
    var cfg = estado.config;
    return 'Hola ' + cfg.nombre + ', soy ' + c.nombre + '. Quiero reservar hora para un corte. ' +
      'Llevo ' + Math.min(c.sellos, cfg.sellos) + ' de ' + cfg.sellos + ' sellos en mi tarjeta.';
  }
  function textoRecordatorio(c) {
    var cfg = estado.config, k = faltan(c), d = diasSinVenir(c);
    var cola = k === 0
      ? 'Ya tienes tu ' + minuscula(cfg.premio) + ' listo para canjear.'
      : 'Te ' + (k === 1 ? 'falta 1 sello' : 'faltan ' + k + ' sellos') + ' para tu ' + minuscula(cfg.premio) + '.';
    return 'Hola ' + primerNombre(c.nombre) + ', ya pasaron ' + d + ' días desde tu último corte en ' + cfg.nombre +
      '. ¿Te reservo hora esta semana? ' + cola;
  }

  // ---------- Router ----------
  var VISTAS = ['inicio', 'cliente', 'barberia'];
  var vistaActual = null;
  function leerRuta() {
    var h = (location.hash || '').replace(/^#/, '');
    var partes = h.split('/');
    if (VISTAS.indexOf(partes[0]) < 0) return null;
    return { vista: partes[0], id: partes[1] || null };
  }
  function irA(ruta, enfocar) {
    if (!ruta) ruta = { vista: vistaActual || 'inicio' };
    if (ruta.vista === 'cliente' && ruta.id && cliente(ruta.id)) { estado.actual = ruta.id; guardar(); }
    vistaActual = ruta.vista;
    $$('[data-vista]').forEach(function (s) { s.hidden = s.getAttribute('data-vista') !== ruta.vista; });
    $$('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === ruta.vista) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    var titulos = { inicio: 'Tarjeta de fidelidad', cliente: 'Mi tarjeta', barberia: 'Panel' };
    document.title = titulos[ruta.vista] + ' · ' + estado.config.nombre;
    if (ruta.vista === 'inicio') renderInicio();
    if (ruta.vista === 'cliente') renderCliente();
    if (ruta.vista === 'barberia') renderPanel();
    if (ruta.vista !== 'barberia') cerrarLector();
    if (enfocar) {
      window.scrollTo(0, 0);
      var main = $('#contenido');
      main.focus({ preventScroll: true });
    }
  }

  // ---------- Render general ----------
  function renderNombres() {
    $$('[data-nombre-barberia]').forEach(function (el) { el.textContent = estado.config.nombre; });
  }
  function enRiesgo() {
    return estado.clientes.filter(function (c) { var d = diasSinVenir(c); return d != null && d > estado.config.dias; })
      .sort(function (a, b) { return diasSinVenir(b) - diasSinVenir(a); });
  }

  function renderInicio() {
    var c = cliente('c1') || estado.clientes[0];
    $('[data-tarjeta-portada]').innerHTML = c ? htmlTarjeta(c) : '';
    var n = enRiesgo().filter(function (x) { return !recordadoHoy(x); }).length;
    $('[data-total-volver]').textContent = plural(n, 'cliente', 'clientes');
  }

  // ---------- Vista cliente ----------
  function renderCliente(forzarNuevos) {
    var sel = $('[data-selector-cliente]');
    sel.innerHTML = estado.clientes.map(function (c) {
      return '<option value="' + c.id + '">' + escapar(c.nombre) + ' · ' + formatoTel(c.telefono) + '</option>';
    }).join('');
    var c = cliente(estado.actual) || estado.clientes[0];
    if (!c) return;
    estado.actual = c.id;
    sel.value = c.id;

    // Animar los sellos que el cliente todavía no había visto
    var nuevos = [];
    var visto = typeof c.visto === 'number' ? c.visto : c.sellos;
    if (forzarNuevos) nuevos = forzarNuevos;
    else if (c.sellos > visto) for (var i = visto; i < c.sellos; i++) nuevos.push(i);
    c.visto = c.sellos;
    guardar();

    $('[data-tarjeta-cliente]').innerHTML = htmlTarjeta(c, { nuevos: nuevos });
    var cfg = estado.config;
    $('[data-estado-tarjeta]').innerHTML = completa(c)
      ? '<strong>Completaste tu tarjeta.</strong> Muéstrala en la barbería y canjea tu ' + escapar(minuscula(cfg.premio)) + '.'
      : 'Te ' + (faltan(c) === 1 ? 'falta <strong>1 sello</strong>' : 'faltan <strong>' + faltan(c) + ' sellos</strong>') +
        ' para tu ' + escapar(minuscula(cfg.premio)) + '.';

    var p = proximoCorte(c);
    var valor, nota;
    if (p.dias > 1) { valor = 'en ' + p.dias + ' días'; nota = 'Cerca del ' + fechaLarga(p.fecha) + '. Sueles venir cada ' + p.cada + ' días.'; }
    else if (p.dias === 1) { valor = 'mañana'; nota = fechaLarga(p.fecha) + '. Sueles venir cada ' + p.cada + ' días.'; }
    else if (p.dias === 0) { valor = 'hoy'; nota = 'Ya te toca. Reserva y llega con el pelo a tiempo.'; }
    else { valor = 'ya te toca'; nota = 'Tu corte estaba recomendado hace ' + plural(-p.dias, 'día', 'días') + '.'; }
    if (ultimaVisita(c) == null) { valor = 'cuando quieras'; nota = 'Todavía no tienes visitas marcadas.'; }
    $('[data-proximo-valor]').textContent = valor;
    $('[data-proximo-nota]').textContent = nota;

    $('[data-reservar]').href = enlaceWa(telCompleto(cfg.whatsapp), textoReserva(c));
    $('[data-codigo-cliente]').textContent = codigo(c);
    $('[data-simular-sello]').textContent = completa(c) ? 'Probar: la barbería me canjea el premio' : 'Probar: la barbería me marca un sello';
    dibujarQR(c);

    var hist = c.visitas.slice(-5).reverse();
    $('[data-historial]').innerHTML = hist.length
      ? hist.map(function (v) { return '<li><span>' + fechaLarga(v).replace(/^./, function (x) { return x.toUpperCase(); }) + '</span><span>' + hace(diasEntre(v, Date.now())) + '</span></li>'; }).join('')
      : '<li><span>Aún no hay visitas.</span><span></span></li>';
  }

  function urlTarjeta(c) {
    var base = location.href.split('#')[0];
    return base + '#cliente/' + c.id;
  }
  function dibujarQR(c) {
    var caja = $('[data-qr]');
    caja.innerHTML = '';
    caja.setAttribute('aria-label', 'Código QR personal de ' + c.nombre + ', código ' + codigo(c));
    if (typeof window.QRCode !== 'function') {
      caja.innerHTML = '<div class="qr__alterno">' + escapar(codigo(c)) + '<br>(QR no disponible sin conexión)</div>';
      return;
    }
    try {
      new window.QRCode(caja, {
        text: urlTarjeta(c),
        width: 240,
        height: 240,
        colorDark: '#14120f',
        colorLight: '#efe6d3',
        correctLevel: window.QRCode.CorrectLevel.M
      });
      var img = caja.querySelector('img');
      if (img) img.alt = '';
      caja.removeAttribute('title');
    } catch (err) {
      caja.innerHTML = '<div class="qr__alterno">' + escapar(codigo(c)) + '</div>';
    }
  }

  // ---------- Panel de la barbería ----------
  var seleccionadoId = null;
  var ultimaAccion = null; // { id, antes, texto }

  function renderPanel() {
    renderNombres();
    renderResultados();
    renderSeleccionado();
    renderVolver();
    renderNumeros();
    llenarAjustes();
  }

  function buscar(q) {
    var digitos = soloDigitos(q), texto = sinTildes(q).trim();
    if (!texto) {
      return estado.clientes.filter(function (c) { return ultimaVisita(c) != null; })
        .sort(function (a, b) { return ultimaVisita(b) - ultimaVisita(a); }).slice(0, 5);
    }
    var cod = /^bd-?\d+$/i.test(q.trim()) ? parseInt(digitos, 10) : null;
    return estado.clientes.filter(function (c) {
      if (cod != null) return c.numero === cod;
      if (digitos.length >= 2 && soloDigitos(c.telefono).indexOf(digitos) >= 0) return true;
      return texto.length >= 2 && sinTildes(c.nombre).indexOf(texto) >= 0;
    }).slice(0, 8);
  }

  function renderResultados() {
    var q = $('[data-buscar]').value;
    var lista = buscar(q);
    $('[data-rotulo-resultados]').textContent = q.trim() ? (lista.length ? 'Resultados' : 'Sin resultados') : 'Visitas recientes';
    $('[data-resultados]').innerHTML = lista.length ? lista.map(function (c) {
      return '<li><button type="button" class="resultado" data-elegir="' + c.id + '" aria-pressed="' + (c.id === seleccionadoId) + '">' +
        '<span class="resultado__nombre">' + escapar(c.nombre) + '</span>' +
        '<span class="resultado__tel">' + formatoTel(c.telefono) + ' · ' + codigo(c) + '</span>' +
        '<span class="resultado__sellos">' + Math.min(c.sellos, estado.config.sellos) + '/' + estado.config.sellos + '</span></button></li>';
    }).join('') : '<li class="resultados__vacio">No encontramos a nadie con ese dato. Puedes registrarlo abajo, en «Cliente nuevo».</li>';
  }

  function elegir(id, avisar) {
    if (!cliente(id)) return;
    seleccionadoId = id;
    if (ultimaAccion && ultimaAccion.id !== id) ultimaAccion = null;
    renderResultados();
    renderSeleccionado();
    var c = cliente(id);
    if (avisar) anunciar('Cliente seleccionado: ' + c.nombre);
    var caja = $('[data-seleccionado]');
    if (caja.getBoundingClientRect().top > window.innerHeight - 160) caja.scrollIntoView({ block: 'start', behavior: preferirQuieto() ? 'auto' : 'smooth' });
  }

  function renderSeleccionado(nuevos) {
    var caja = $('[data-seleccionado]');
    var c = seleccionadoId ? cliente(seleccionadoId) : null;
    if (!c) { caja.hidden = true; return; }
    caja.hidden = false;
    var d = diasSinVenir(c);
    $('[data-sel-nombre]').textContent = c.nombre;
    $('[data-sel-dato]').textContent = formatoTel(c.telefono) + ' · ' + codigo(c) + ' · ' +
      (d == null ? 'sin visitas aún' : 'última visita ' + hace(d)) +
      (c.canjes ? ' · ' + plural(c.canjes, 'canje', 'canjes') : '');
    $('[data-tarjeta-panel]').innerHTML = htmlTarjeta(c, { nuevos: nuevos || [] });
    var lleno = completa(c);
    $('[data-mas-sello]').hidden = lleno;
    var canje = $('[data-canjear]');
    canje.hidden = !lleno;
    canje.textContent = 'Canjear ' + minuscula(estado.config.premio);
    var dz = $('[data-deshacer-caja]');
    if (ultimaAccion && ultimaAccion.id === c.id) {
      dz.hidden = false;
      $('[data-deshacer-texto]').textContent = ultimaAccion.texto;
    } else dz.hidden = true;
  }

  function masSello() {
    var c = cliente(seleccionadoId);
    if (!c || completa(c)) return;
    ultimaAccion = { id: c.id, antes: copia(c), texto: 'Sello ' + (c.sellos + 1) + ' marcado.' };
    c.sellos += 1;
    c.visitas.push(Date.now());
    c.recordado = null;
    guardar();
    var total = estado.config.sellos;
    renderSeleccionado([c.sellos - 1]);
    renderResultados(); renderVolver(); renderNumeros();
    var btn = completa(c) ? $('[data-canjear]') : $('[data-mas-sello]');
    btn.classList.remove('ok'); void btn.offsetWidth; btn.classList.add('ok');
    if (completa(c)) btn.focus(); // el botón +1 se oculta: el foco pasa a «Canjear»
    var msg = completa(c)
      ? 'Sello agregado a ' + c.nombre + '. Tarjeta completa: ' + total + ' de ' + total + '. Ya puede canjear su ' + minuscula(estado.config.premio) + '.'
      : 'Sello agregado a ' + c.nombre + ': ' + c.sellos + ' de ' + total + '.';
    anunciar(msg);
    aviso(completa(c) ? 'Tarjeta completa · ' + c.nombre : 'Sello agregado · ' + c.sellos + ' de ' + total, true);
  }

  function canjear() {
    var c = cliente(seleccionadoId);
    if (!c || !completa(c)) return;
    ultimaAccion = { id: c.id, antes: copia(c), texto: minuscula(estado.config.premio).replace(/^./, function (x) { return x.toUpperCase(); }) + ' canjeado.' };
    c.sellos = 0;
    c.canjes += 1;
    c.visto = 0;
    c.visitas.push(Date.now());
    c.recordado = null;
    guardar();
    renderSeleccionado();
    renderResultados(); renderVolver(); renderNumeros();
    $('[data-mas-sello]').focus();
    var t = $('.tarjeta', $('[data-tarjeta-panel]'));
    if (t) t.classList.add('temblor');
    anunciar(estado.config.premio + ' canjeado para ' + c.nombre + '. La tarjeta vuelve a cero.');
    aviso('Canjeado · la tarjeta de ' + primerNombre(c.nombre) + ' parte de nuevo', true);
  }

  function deshacer() {
    if (!ultimaAccion) return;
    var c = cliente(ultimaAccion.id);
    if (!c) { ultimaAccion = null; return; }
    var antes = ultimaAccion.antes;
    Object.keys(antes).forEach(function (k) { c[k] = antes[k]; });
    ultimaAccion = null;
    guardar();
    seleccionadoId = c.id;
    renderSeleccionado(); renderResultados(); renderVolver(); renderNumeros();
    $('[data-aviso]').hidden = true;
    var foco = completa(c) ? $('[data-canjear]') : $('[data-mas-sello]');
    foco.focus();
    anunciar('Listo, se deshizo la última acción. ' + c.nombre + ' tiene ' + c.sellos + ' de ' + estado.config.sellos + ' sellos.');
  }

  function recordadoHoy(c) { return c.recordado != null && diasEntre(c.recordado, Date.now()) === 0; }

  function renderVolver() {
    var cfg = estado.config;
    var lista = enRiesgo();
    $('[data-volver-nota]').textContent = 'Clientes con más de ' + cfg.dias + ' días sin venir. El mensaje se abre en WhatsApp listo para enviar.';
    $('[data-volver]').innerHTML = lista.length ? lista.map(function (c) {
      var d = diasSinVenir(c), k = faltan(c);
      return '<li>' +
        '<div><p class="volver__nombre">' + escapar(c.nombre) + '</p>' +
        '<p class="volver__dato">' + formatoTel(c.telefono) + ' · ' + (k === 0 ? 'premio listo' : 'le ' + (k === 1 ? 'falta 1 sello' : 'faltan ' + k + ' sellos')) + '</p></div>' +
        '<p class="volver__dias">' + d + '<small>días</small></p>' +
        '<a class="btn btn--whatsapp btn--ancho" data-recordar="' + c.id + '" target="_blank" rel="noopener" href="' +
          escapar(enlaceWa(c.telefono, textoRecordatorio(c))) + '">' +
          '<svg class="ico" aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Z" opacity=".25"/><path fill="currentColor" d="M16.5 14.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>' +
          'Recordar por WhatsApp<span class="sr"> a ' + escapar(c.nombre) + '</span></a>' +
        (recordadoHoy(c) ? '<p class="volver__hecho">Recordatorio abierto hoy.</p>' : '') +
        '</li>';
    }).join('') : '<li class="volver__vacio">Nadie lleva más de ' + cfg.dias + ' días sin venir. Buena semana.</li>';
  }

  function renderNumeros() {
    var cfg = estado.config;
    var activos = 0, riesgo = 0, canjes = 0, mes = 0;
    var ahora = new Date(), m = ahora.getMonth(), a = ahora.getFullYear();
    estado.clientes.forEach(function (c) {
      var d = diasSinVenir(c);
      if (d != null && d <= cfg.dias) activos++;
      if (d != null && d > cfg.dias) riesgo++;
      canjes += c.canjes || 0;
      c.visitas.forEach(function (v) { var f = new Date(v); if (f.getMonth() === m && f.getFullYear() === a) mes++; });
    });
    $('[data-n-activos]').textContent = activos;
    $('[data-n-riesgo]').textContent = riesgo;
    $('[data-n-canjes]').textContent = canjes;
    $('[data-n-mes]').textContent = mes;
    $('[data-numeros-nota]').textContent = 'Activo: vino en los últimos ' + cfg.dias + ' días. En riesgo: lleva más de ' + cfg.dias +
      '. Visitas de ' + MESES[m] + ' de ' + a + '.';
  }

  // ---------- Registrar cliente ----------
  function errorCampo(form, nombre, msg) {
    var input = form.elements[nombre];
    var p = $('[data-error="' + nombre + '"]', form);
    if (p) p.textContent = msg || '';
    if (input) { if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
    return !msg;
  }
  function registrar(ev) {
    ev.preventDefault();
    var form = ev.currentTarget;
    var nombre = form.elements.nombre.value.trim().replace(/\s+/g, ' ');
    var ocho = soloDigitos(form.elements.telefono.value);
    var ok = true;
    if (nombre.length < 2) ok = errorCampo(form, 'nombre', 'Escribe el nombre del cliente.') && ok;
    else errorCampo(form, 'nombre', '');
    var tel = telCompleto(ocho);
    if (ocho.length !== 8) ok = errorCampo(form, 'telefono', 'El teléfono debe tener 8 dígitos después del +56 9.') && ok;
    else if (estado.clientes.some(function (c) { return soloDigitos(c.telefono) === soloDigitos(tel); })) ok = errorCampo(form, 'telefono', 'Ese teléfono ya está registrado. Búscalo arriba.') && ok;
    else errorCampo(form, 'telefono', '');
    if (!ok) { var inv = form.querySelector('[aria-invalid="true"]'); if (inv) inv.focus(); return; }
    var n = estado.siguiente++;
    var c = { id: 'c' + n + '-' + Date.now().toString(36), numero: n, nombre: nombre, telefono: tel, sellos: 0, canjes: 0, visitas: [], visto: 0, recordado: null, creado: Date.now() };
    estado.clientes.push(c);
    guardar();
    form.reset();
    $('[data-buscar]').value = '';
    elegir(c.id);
    renderNumeros(); renderVolver();
    var caja = $('[data-seleccionado]');
    caja.scrollIntoView({ block: 'start', behavior: preferirQuieto() ? 'auto' : 'smooth' });
    $('[data-mas-sello]').focus({ preventScroll: true });
    anunciar('Cliente registrado: ' + nombre + ', código ' + codigo(c) + '. Ya puedes marcarle el primer sello.');
    aviso('Cliente registrado · ' + codigo(c), false);
  }

  // ---------- Ajustes ----------
  function llenarAjustes() {
    var f = $('[data-form-ajustes]'), cfg = estado.config;
    f.elements.nombre.value = cfg.nombre;
    f.elements.color.value = cfg.color;
    f.elements.whatsapp.value = cfg.whatsapp;
    f.elements.sellos.value = cfg.sellos;
    f.elements.dias.value = cfg.dias;
    f.elements.premio.value = cfg.premio;
    marcarMuestra(cfg.color);
  }
  function marcarMuestra(color) {
    $$('.muestra').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-color').toLowerCase() === String(color).toLowerCase())); });
  }
  function guardarAjustes(ev) {
    ev.preventDefault();
    var f = ev.currentTarget, ok = true;
    var nombre = f.elements.nombre.value.trim().replace(/\s+/g, ' ');
    var wa = soloDigitos(f.elements.whatsapp.value);
    var sellos = parseInt(f.elements.sellos.value, 10);
    var dias = parseInt(f.elements.dias.value, 10);
    var premio = f.elements.premio.value.trim().replace(/\s+/g, ' ');
    var color = /^#[0-9a-f]{6}$/i.test(f.elements.color.value) ? f.elements.color.value : CONFIG_BASE.color;
    ok = errorCampo(f, 'nombre', nombre.length < 2 ? 'Escribe el nombre de la barbería.' : '') && ok;
    ok = errorCampo(f, 'whatsapp', wa.length !== 8 ? 'Deben ser 8 dígitos después del +56 9.' : '') && ok;
    ok = errorCampo(f, 'sellos', !(sellos >= 4 && sellos <= 15) ? 'Entre 4 y 15 sellos.' : '') && ok;
    ok = errorCampo(f, 'dias', !(dias >= 5 && dias <= 90) ? 'Entre 5 y 90 días.' : '') && ok;
    ok = errorCampo(f, 'premio', premio.length < 3 ? 'Escribe el premio, por ejemplo «Corte gratis».' : '') && ok;
    if (!ok) { var inv = f.querySelector('[aria-invalid="true"]'); if (inv) inv.focus(); return; }
    estado.config = { nombre: nombre, color: color.toLowerCase(), whatsapp: wa, sellos: sellos, dias: dias, premio: premio };
    estado.clientes.forEach(function (c) { if (c.visto > c.sellos) c.visto = c.sellos; });
    guardar();
    aplicarTema();
    renderNombres();
    document.title = 'Panel · ' + estado.config.nombre;
    renderPanel();
    anunciar('Ajustes guardados.');
    aviso('Ajustes guardados', false);
  }

  var temporizadorReset = null;
  function restablecer(ev) {
    var b = ev.currentTarget;
    if (!b.classList.contains('confirmar')) {
      b.classList.add('confirmar');
      b.textContent = 'Toca otra vez para confirmar';
      anunciar('Toca otra vez para confirmar. Se borran los cambios y vuelven los datos de ejemplo.');
      window.clearTimeout(temporizadorReset);
      temporizadorReset = window.setTimeout(function () { b.classList.remove('confirmar'); b.textContent = 'Restablecer datos de ejemplo'; }, 5000);
      return;
    }
    window.clearTimeout(temporizadorReset);
    b.classList.remove('confirmar');
    b.textContent = 'Restablecer datos de ejemplo';
    estado = datosEjemplo();
    seleccionadoId = null;
    ultimaAccion = null;
    guardar();
    aplicarTema();
    renderNombres();
    $('[data-buscar]').value = '';
    renderPanel();
    anunciar('Datos de ejemplo restablecidos.');
    aviso('Datos de ejemplo restablecidos', false);
  }

  // ---------- Lector de QR (opcional, cámara) ----------
  var lector = null;
  function cargarScript(url) {
    return new Promise(function (ok, mal) {
      var s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = ok; s.onerror = mal;
      document.head.appendChild(s);
    });
  }
  function idDesdeQR(texto) {
    var m = /#cliente\/([\w-]+)/.exec(texto || '');
    if (m && cliente(m[1])) return m[1];
    var cod = /BD-?(\d+)/i.exec(texto || '');
    if (cod) {
      var n = parseInt(cod[1], 10);
      var c = estado.clientes.filter(function (x) { return x.numero === n; })[0];
      if (c) return c.id;
    }
    return null;
  }
  function abrirLector() {
    var caja = $('[data-lector-caja]'), nota = $('[data-lector-nota]');
    caja.hidden = false;
    nota.textContent = 'Abriendo la cámara…';
    var listo = window.Html5Qrcode ? Promise.resolve() : cargarScript(HTML5QR_URL);
    listo.then(function () {
      if (!window.Html5Qrcode) throw new Error('sin lector');
      lector = new window.Html5Qrcode('lector-qr');
      return lector.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, function (texto) {
        var id = idDesdeQR(texto);
        if (id) {
          cerrarLector();
          $('[data-buscar]').value = '';
          elegir(id);
          aviso('Cliente encontrado · ' + cliente(id).nombre, false);
          anunciar('Código leído. Cliente seleccionado: ' + cliente(id).nombre);
          $('[data-mas-sello]').focus();
        } else {
          nota.textContent = 'Ese código no es de una tarjeta de esta barbería.';
        }
      }, function () { /* cuadro sin código: se ignora */ });
    }).then(function () {
      nota.textContent = 'Apunta la cámara al código del cliente.';
    }).catch(function () {
      nota.textContent = 'No pudimos abrir la cámara. Busca al cliente por su teléfono en el campo de arriba.';
      lector = null;
    });
  }
  function cerrarLector() {
    var caja = $('[data-lector-caja]');
    if (lector) {
      var l = lector; lector = null;
      try { l.stop().then(function () { try { l.clear(); } catch (e) {} }).catch(function () {}); } catch (e) {}
    }
    if (caja) caja.hidden = true;
  }

  // ---------- Instalar como app (PWA) ----------
  var pedidoInstalar = null;
  function prepararInstalacion() {
    var boton = $('[data-instalar]'), estadoTxt = $('[data-instalar-estado]');
    var instalada = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone;
    if (instalada) estadoTxt.textContent = 'Ya la tienes en tu pantalla de inicio. Ábrela desde ahí cuando vayas a la barbería.';
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      pedidoInstalar = e;
      boton.hidden = false;
    });
    boton.addEventListener('click', function () {
      if (!pedidoInstalar) return;
      pedidoInstalar.prompt();
      pedidoInstalar.userChoice.then(function () { pedidoInstalar = null; boton.hidden = true; }).catch(function () {});
    });
    window.addEventListener('appinstalled', function () {
      boton.hidden = true;
      estadoTxt.textContent = 'Listo, quedó en tu pantalla de inicio.';
    });
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  function preferirQuieto() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  // ---------- Eventos ----------
  function enlazar() {
    window.addEventListener('hashchange', function () { var r = leerRuta(); if (r) irA(r, true); });

    $('[data-saltar]').addEventListener('click', function (e) {
      e.preventDefault();
      $('#contenido').focus();
    });

    $('[data-ir-volver]').addEventListener('click', function () {
      window.setTimeout(function () {
        var b = $('#bloque-volver');
        b.scrollIntoView({ block: 'start' });
        b.focus({ preventScroll: true });
      }, 0);
    });

    $('[data-selector-cliente]').addEventListener('change', function (e) {
      estado.actual = e.target.value;
      guardar();
      renderCliente();
    });

    $('[data-simular-sello]').addEventListener('click', function () {
      var c = cliente(estado.actual);
      if (!c) return;
      var total = estado.config.sellos;
      if (completa(c)) {
        c.sellos = 0; c.canjes += 1; c.visto = 0; c.visitas.push(Date.now());
        guardar(); renderCliente();
        anunciar('La barbería canjeó tu ' + minuscula(estado.config.premio) + '. Tu tarjeta parte de nuevo.');
        aviso('Premio canjeado · tarjeta nueva', false);
        return;
      }
      c.sellos += 1; c.visitas.push(Date.now()); c.recordado = null;
      guardar();
      renderCliente(); // anima el sello nuevo porque visto < sellos
      anunciar(completa(c)
        ? 'Sello agregado. Completaste tu tarjeta: ' + total + ' de ' + total + '.'
        : 'Sello agregado: ' + c.sellos + ' de ' + total + '.');
      aviso(completa(c) ? '¡Tarjeta completa!' : 'Sello agregado · ' + c.sellos + ' de ' + total, false);
    });

    $$('[data-saltar-a]').forEach(function (b) {
      b.addEventListener('click', function () {
        var destino = document.getElementById(b.getAttribute('data-saltar-a'));
        destino.scrollIntoView({ block: 'start', behavior: preferirQuieto() ? 'auto' : 'smooth' });
        destino.focus({ preventScroll: true });
      });
    });

    var entrada = $('[data-buscar]');
    entrada.addEventListener('input', renderResultados);
    entrada.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var r = buscar(entrada.value);
        if (r.length === 1) elegir(r[0].id, true);
      }
    });
    $('[data-resultados]').addEventListener('click', function (e) {
      var b = e.target.closest('[data-elegir]');
      if (b) elegir(b.getAttribute('data-elegir'), true);
    });
    $('[data-sel-cerrar]').addEventListener('click', function () {
      seleccionadoId = null; ultimaAccion = null;
      renderSeleccionado(); renderResultados();
      entrada.focus();
    });

    $('[data-mas-sello]').addEventListener('click', masSello);
    $('[data-canjear]').addEventListener('click', canjear);
    $('[data-deshacer]').addEventListener('click', deshacer);
    $('[data-aviso-accion]').addEventListener('click', deshacer);

    $('[data-escanear]').addEventListener('click', abrirLector);
    $('[data-cerrar-lector]').addEventListener('click', function () { cerrarLector(); $('[data-escanear]').focus(); });

    $('[data-volver]').addEventListener('click', function (e) {
      var a = e.target.closest('[data-recordar]');
      if (!a) return;
      var c = cliente(a.getAttribute('data-recordar'));
      if (!c) return;
      c.recordado = Date.now();
      guardar();
      window.setTimeout(function () {
        renderVolver();
        var mismo = $('[data-recordar="' + c.id + '"]');
        if (mismo) mismo.focus();
      }, 0);
    });

    var fNuevo = $('[data-form-nuevo]');
    fNuevo.addEventListener('submit', registrar);
    fNuevo.elements.telefono.addEventListener('input', function (e) {
      var d = soloDigitos(e.target.value).slice(0, 8);
      e.target.value = d.length > 4 ? d.slice(0, 4) + ' ' + d.slice(4) : d;
    });

    var fAj = $('[data-form-ajustes]');
    fAj.addEventListener('submit', guardarAjustes);
    fAj.elements.color.addEventListener('input', function (e) { marcarMuestra(e.target.value); });
    $$('.muestra').forEach(function (b) {
      b.addEventListener('click', function () {
        fAj.elements.color.value = b.getAttribute('data-color');
        marcarMuestra(b.getAttribute('data-color'));
      });
    });
    $('[data-restablecer]').addEventListener('click', restablecer);
  }

  // ---------- Arranque ----------
  function iniciar() {
    estado = cargar();
    aplicarTema();
    renderNombres();
    enlazar();
    prepararInstalacion();
    var r = leerRuta();
    irA(r || { vista: 'inicio' }, false);
    // Si qrcodejs llega después (red lenta), redibuja el QR
    if (typeof window.QRCode !== 'function') {
      window.addEventListener('load', function () { if (vistaActual === 'cliente') renderCliente(); });
    }
    // Hook mínimo para pruebas automatizadas
    window.__fidelidad = { estado: function () { return estado; } };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
