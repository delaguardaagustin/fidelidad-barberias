/* EJEMPLO de configuración para el modo real (base compartida en Supabase).
   Copiar este archivo como config.js y reemplazar los dos valores con los del proyecto de Supabase
   (Project Settings > API). Los de abajo son inventados y no funcionan.

   · SUPABASE_CLAVE_PUBLICA es la clave «publishable» (antes «anon»): es pública por diseño y va en el navegador.
     Lo que protege los datos son las reglas de supabase/esquema.sql, no esconder esta clave.
   · La clave «secret» / «service_role» y la contraseña de la base NUNCA van en este archivo ni en el repositorio. */
export const CONFIG = {
  MODO: 'real',
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_CLAVE_PUBLICA: 'sb_publishable_EJEMPLO_reemplazar_por_la_clave_publica'
};
