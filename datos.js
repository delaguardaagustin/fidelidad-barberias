/* Elige de dónde salen los datos, según config.js:
   · MODO 'demo' (lo publicado hoy): todo queda en este navegador, con datos de ejemplo (datos-local.js).
   · MODO 'real': base compartida en Supabase (datos-supabase.js), con cuentas para el personal.
   Con ?demo en la dirección se fuerza la demo aunque config.js diga 'real' (sirve para mostrarla). */
import { CONFIG } from './config.js';

export async function crearDatos() {
  const forzarDemo = new URLSearchParams(location.search).has('demo');
  if (CONFIG.MODO === 'real' && !forzarDemo) {
    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_CLAVE_PUBLICA || /TU-PROYECTO|EJEMPLO/i.test(CONFIG.SUPABASE_URL + CONFIG.SUPABASE_CLAVE_PUBLICA)) {
      throw new Error('Falta completar la conexión en config.js (ver config.ejemplo.js).');
    }
    const { crearDatosSupabase } = await import('./datos-supabase.js');
    return crearDatosSupabase(CONFIG);
  }
  const { crearDatosLocal } = await import('./datos-local.js');
  return crearDatosLocal();
}
