/* ============================================================
   Tarjeta de fidelidad · capa de datos MODO REAL (Supabase)

   Mismas funciones que datos-local.js, para que app.js no cambie. Además: entrar() y salir() del personal.
   · Quién puede qué lo decide la base (supabase/esquema.sql). Aquí solo se traducen los errores a español simple.
   · El cliente final no tiene cuenta: su tarjeta se lee con tarjeta_por_token(), usando el enlace secreto del QR.
   · Los sellos se cambian solo con las funciones de la base (marcar_visita, canjear_premio, deshacer_visita).
   NO está conectado a ningún proyecto todavía: lee la dirección y la clave pública desde config.js.
   ============================================================ */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';

const DIA = 86400000;
const COLUMNAS = 'id, numero, nombre, telefono, token, sellos, canjes, acepta_whatsapp, recordado_en, creado_en';
const POR_PAGINA = 1000;   // Supabase entrega hasta 1.000 filas por consulta: se pide en páginas

const ms = (t) => (t ? new Date(t).getTime() : null);
const soloDigitos = (s) => String(s || '').replace(/\D+/g, '');

function fallo(mensaje, campo) { const e = new Error(mensaje); if (campo) e.campo = campo; return e; }
function traducir(error) {
  const t = (error.code || '') + ' ' + (error.message || '');
  if (/23505|duplicate|unique/i.test(t)) return fallo('Ese celular ya está registrado. Búscalo arriba.', 'telefono');
  if (/42501|row-level security|permission denied|PGRST116/i.test(t)) return fallo('Tu cuenta no tiene permiso para hacer eso.');
  if (/Failed to fetch|NetworkError|network/i.test(t)) return fallo('Sin conexión. Revisa el internet e inténtalo de nuevo.');
  return fallo(error.message || 'No se pudo guardar. Inténtalo de nuevo.');
}
function revisar({ data, error }) { if (error) throw traducir(error); return data; }

export function crearDatosSupabase(CONFIG, opciones = {}) {
  const sb = opciones.cliente || createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_CLAVE_PUBLICA);
  let barberiaId = null, rol = null, canal = null;

  /* Pide todas las filas de una consulta, de a 1.000. armar() debe devolver una consulta nueva cada vez. */
  async function todas(armar) {
    const salida = [];
    for (let desde = 0; ; desde += POR_PAGINA) {
      const parte = revisar(await armar().range(desde, desde + POR_PAGINA - 1)) || [];
      salida.push(...parte);
      if (parte.length < POR_PAGINA) return salida;
    }
  }

  const aCliente = (f, visitas) => ({
    id: f.id, numero: f.numero, nombre: f.nombre, telefono: f.telefono, token: f.token,
    sellos: f.sellos, canjes: f.canjes, visitas: visitas || [], acepta: !!f.acepta_whatsapp,
    recordado: ms(f.recordado_en), creado: ms(f.creado_en)
  });
  const aConfig = (b, a) => ({ nombre: b.nombre, color: a.color, whatsapp: a.whatsapp, sellos: a.sellos_meta, dias: a.dias_recordar, premio: a.premio });

  async function miBarberia() {
    if (barberiaId) return barberiaId;
    const filas = revisar(await sb.from('personal').select('barberia_id, rol').limit(1)) || [];
    if (!filas.length) throw fallo('Tu cuenta no está asociada a ninguna barbería. Avisa a SENTRY-CODE.');
    barberiaId = filas[0].barberia_id; rol = filas[0].rol;
    return barberiaId;
  }
  async function unCliente(id) {
    const [c, v] = await Promise.all([
      sb.from('clientes').select(COLUMNAS).eq('id', id).single(),
      sb.from('visitas').select('fecha').eq('cliente_id', id).order('fecha', { ascending: false }).limit(12)
    ]);
    return aCliente(revisar(c), (revisar(v) || []).map((x) => ms(x.fecha)).reverse());
  }

  const api = {
    modo: 'real',

    /* ---------- Sesión del personal ---------- */
    async sesion() { const { data } = await sb.auth.getSession(); return data.session ? { correo: data.session.user.email } : null; },
    async entrar(correo, clave) {
      const { error } = await sb.auth.signInWithPassword({ email: String(correo || '').trim().toLowerCase(), password: clave });
      if (error) throw fallo(/invalid login/i.test(error.message) ? 'Correo o clave incorrectos.' : /not confirmed/i.test(error.message) ? 'La cuenta todavía no está confirmada. Avisa a SENTRY-CODE.' : traducir(error).message);
      barberiaId = null;
    },
    async salir() { if (canal) { sb.removeChannel(canal); canal = null; } await sb.auth.signOut(); barberiaId = null; rol = null; },

    /* ---------- Lectura ---------- */
    async panel() {
      const id = await miBarberia();
      const desde = new Date(Date.now() - 400 * DIA).toISOString();   // un poco más de un año de visitas
      const [b, a, filas, visitas] = await Promise.all([
        sb.from('barberias').select('id, nombre').eq('id', id).single(),
        sb.from('ajustes').select('*').eq('barberia_id', id).single(),
        todas(() => sb.from('clientes').select(COLUMNAS).eq('barberia_id', id).order('numero')),
        todas(() => sb.from('visitas').select('cliente_id, fecha').eq('barberia_id', id).gte('fecha', desde).order('fecha').order('id'))
      ]);
      const porCliente = {};
      visitas.forEach((v) => { (porCliente[v.cliente_id] ||= []).push(ms(v.fecha)); });
      return { config: aConfig(revisar(b), revisar(a)), clientes: filas.map((f) => aCliente(f, porCliente[f.id])), puedeAjustar: rol === 'dueno' };
    },
    async tarjeta(token) {
      const d = revisar(await sb.rpc('tarjeta_por_token', { p_token: token }));
      if (!d) return null;
      const c = d.cliente;
      return {
        config: { nombre: d.barberia.nombre, color: d.barberia.color, whatsapp: d.barberia.whatsapp, sellos: d.barberia.sellos, dias: d.barberia.dias, premio: d.barberia.premio },
        cliente: { id: token, numero: c.numero, nombre: c.nombre, token, sellos: c.sellos, canjes: c.canjes, acepta: !!c.acepta, visitas: (c.visitas || []).map(ms) }
      };
    },

    /* ---------- Visitas ---------- */
    async marcarVisita(id) { const v = revisar(await sb.rpc('marcar_visita', { p_cliente: id })); return { cliente: await unCliente(id), accion: { visita: v } }; },
    async canjear(id) { const v = revisar(await sb.rpc('canjear_premio', { p_cliente: id })); return { cliente: await unCliente(id), accion: { visita: v } }; },
    async deshacer(accion) { const id = revisar(await sb.rpc('deshacer_visita', { p_visita: accion.visita })); return unCliente(id); },

    /* ---------- Clientes ---------- */
    async registrar({ nombre, telefono, acepta }) {
      const id = await miBarberia();
      const fila = { barberia_id: id, nombre: String(nombre || '').trim(), telefono: '+569' + soloDigitos(telefono).slice(-8), acepta_whatsapp: !!acepta };
      if (fila.nombre.length < 2) throw fallo('Escribe el nombre del cliente.', 'nombre');
      if (!/^\+569\d{8}$/.test(fila.telefono)) throw fallo('El celular debe tener 8 dígitos después del +56 9.', 'telefono');
      return aCliente(revisar(await sb.from('clientes').insert(fila).select(COLUMNAS).single()), []);
    },
    async anotarRecordatorio(id) {
      revisar(await sb.from('clientes').update({ recordado_en: new Date().toISOString() }).eq('id', id).select('id').single());
      return unCliente(id);
    },
    async cambiarAvisos(token, acepta) {
      if (!revisar(await sb.rpc('cambiar_avisos', { p_token: token, p_acepta: !!acepta }))) throw fallo('No encontramos tu tarjeta.');
      return (await api.tarjeta(token)).cliente;
    },
    async borrarCliente(id) {
      const r = revisar(await sb.from('clientes').delete().eq('id', id).select('id'));
      if (!r || !r.length) throw fallo('Solo el dueño de la barbería puede borrar clientes.');
    },

    /* ---------- Ajustes (solo el dueño) ---------- */
    async guardarAjustes(cfg) {
      const id = await miBarberia();
      revisar(await sb.from('barberias').update({ nombre: cfg.nombre }).eq('id', id).select('id').single());
      const a = revisar(await sb.from('ajustes').update({ color: String(cfg.color).toLowerCase(), whatsapp: cfg.whatsapp, sellos_meta: cfg.sellos, dias_recordar: cfg.dias, premio: cfg.premio })
        .eq('barberia_id', id).select('*').single());
      return aConfig({ nombre: cfg.nombre }, a);
    },
    async restablecer() { throw fallo('Esto solo existe en la demo.'); },

    /* Otro barbero marcó algo: el panel se vuelve a cargar (medio segundo después, para juntar cambios). */
    alCambiar(fn) {
      if (canal || !barberiaId) return;
      let pendiente = null;
      canal = sb.channel('clientes-' + barberiaId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes', filter: 'barberia_id=eq.' + barberiaId }, () => { clearTimeout(pendiente); pendiente = setTimeout(fn, 500); })
        .subscribe();
    }
  };
  return api;
}
