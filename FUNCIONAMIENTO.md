# Cómo funciona de verdad la tarjeta de fidelidad

Escrito el 23-11-2026 para Agustín. Lo publicado hoy es una **demo**: todo queda en el navegador de quien la abre.
El código ya está preparado para el **modo real**, pero no está conectado a nada: no hay proyecto de Supabase,
cuentas ni claves creadas.

## 1. ¿Hace falta Supabase?

Sí, o algo equivalente. Hoy la tarjeta vive en el celular de quien la abre. En la vida real hay dos celulares:
el del cliente (que mira su tarjeta) y el del barbero (que marca el sello). Para que el sello que marca el barbero
aparezca en el celular del cliente, los dos tienen que leer y escribir en **una base de datos compartida en internet**.
Supabase da esa base, las cuentas del personal y las reglas de quién ve qué, sin que tengamos que mantener un servidor.

## 2. Cómo se usa en la vida real

**El dueño de la barbería (una vez)**
- SENTRY-CODE le crea su cuenta (correo y clave) y la barbería en la base.
- Entra a la página, en «Barbería», y en «Ajustes» pone su nombre, color, WhatsApp, cuántos sellos da el premio y
  a los cuántos días quiere recordar. Puede pedir cuentas para sus barberos (ellos marcan visitas, no cambian ajustes).

**El barbero, entre un corte y otro (en su celular)**
1. Abre el panel (queda con la sesión iniciada; puede dejarlo en la pantalla de inicio).
2. Escribe los **4 últimos dígitos** del celular del cliente o toca **Escanear QR**. Si calza con una sola persona, se elige sola.
3. Toca **Marcar visita**. Si se equivocó, **Deshacer** (hasta 24 horas, solo la última visita).
4. Si la tarjeta está llena, el botón cambia a **Canjear corte gratis**.
5. ¿Cliente nuevo? Si no aparece, toca **Registrar cliente nuevo**: nombre, celular y la casilla de si acepta
   recordatorios. Queda registrado con su primera visita y aparece el botón **Mandarle su tarjeta**, que abre
   WhatsApp con el enlace de su tarjeta listo para enviar.
6. En **Les toca volver** ve a quién le conviene escribir, con un botón de WhatsApp por persona.

**El cliente (sin instalar nada)**
- Recibe por WhatsApp un enlace a su tarjeta. Lo abre y ve sus sellos, su código QR, cuándo le toca el próximo corte
  y un botón para reservar por WhatsApp.
- Ese enlace es secreto: lleva un código al azar de 32 caracteres (no su teléfono ni un número que se pueda adivinar).
  Con él solo se ve **esa** tarjeta.
- Si quiere, la agrega a la pantalla de inicio (es opcional y está plegado al final).
- Puede apagar los recordatorios por WhatsApp desde su misma tarjeta.

## 3. Qué hay en el código

| Archivo | Para qué |
|---|---|
| `app.js` | Las pantallas. No sabe dónde se guardan los datos. |
| `datos.js` | Elige el modo según `config.js`. |
| `datos-local.js` | Modo demo: guarda en el navegador (lo de hoy). |
| `datos-supabase.js` | Modo real: las mismas funciones contra Supabase. |
| `config.js` | Hoy dice `MODO: 'demo'`. Sin claves. |
| `config.ejemplo.js` | Modelo para el modo real, con valores inventados. |
| `supabase/esquema.sql` | Tablas, reglas de acceso y funciones. Probado en una base local con 10 pruebas; **no ejecutado** en ninguna base real. |

Con `?demo` en la dirección se fuerza la demo aunque `config.js` diga real (sirve para mostrarla a otros barberos).

**Quién ve qué (lo deciden las reglas de la base, no la página):**
- El personal de una barbería ve y cambia **solo** sus clientes. Un barbero de otra barbería no ve nada.
- Los sellos no se pueden escribir a mano: solo con las funciones «marcar visita», «canjear» y «deshacer», que revisan
  que no se pase de la meta, que no se canjee sin la tarjeta llena y que no se marque dos veces en 2 minutos.
- Sin sesión no se puede leer ninguna tabla. El cliente solo lee su tarjeta con su enlace (función `tarjeta_por_token`),
  que no devuelve su teléfono.
- Cambiar ajustes y borrar clientes: solo el dueño.

## 4. Qué falta para ponerlo en marcha con una barbería real

| Paso | Quién | Tiempo |
|---|---|---|
| Crear el proyecto de Supabase (puede ser uno nuevo o el de `paneles-clientes`) | **Agustín** (es su cuenta) | 10 min |
| Ejecutar `supabase/esquema.sql` en el editor SQL | Agustín, o Claude guiándolo | 5 min |
| Crear la cuenta del dueño en Authentication y apagar el registro libre de usuarios | **Agustín** (lleva clave) | 5 min |
| Dar de alta la barbería y asociar la cuenta (3 líneas SQL, al final de `esquema.sql`) | Agustín, con el texto que deja Claude | 5 min |
| Copiar `config.ejemplo.js` como `config.js` con la dirección y la clave **publishable** del proyecto | Claude | 5 min |
| Publicar en una dirección propia (por ejemplo `tarjeta.sentry-code.cl` o el dominio de la barbería). Si el repositorio sigue público, la clave publishable puede ir ahí (es pública por diseño). | Claude prepara, **Agustín aprueba el push** | 15 min |
| Probar con dos celulares reales: el barbero marca y el cliente ve el sello | Agustín y el barbero | 15 min |
| Poner el aviso de privacidad completo (sección 7) con los datos reales de la barbería | Claude lo arma con el kit Ley 21.719; **el dueño entrega RUT, dirección y correo** | 30 min |
| Precio del servicio | **Agustín decide** | — |

Lo que NO se probó todavía (necesita el proyecto real): entrar con una cuenta de verdad, que dos barberos vean los
cambios del otro en vivo, y el escáner de QR con la cámara de un celular real. El modo real sí se probó con un
Supabase imitado (lectura de la tarjeta, entrada con clave buena y mala, marcar visita, permisos del barbero).

## 5. ¿Sirve el plan gratis de Supabase?

Sí, para empezar sobra. Límites del plan **Free** según supabase.com/pricing, revisado el 22-11-2026:

| Límite | Plan Free | Qué significa para una barbería |
|---|---|---|
| Base de datos | 500 MB por proyecto | Un cliente con 50 visitas ocupa menos de 10 KB: caben decenas de miles de clientes. |
| Usuarios con cuenta | 50.000 activos al mes | Solo tienen cuenta el dueño y los barberos. |
| Tráfico de salida | 5 GB al mes | Cada vez que se abre una tarjeta son unos pocos KB. |
| Conexiones en vivo | 200 simultáneas | Solo el panel las usa. |
| Proyectos activos | 2 | Un proyecto puede atender a **varias barberías** (cada una ve solo lo suyo). |
| **Pausa por inactividad** | **1 semana sin uso** | Si nadie la usa en 7 días, el proyecto se pausa y hay que reactivarlo a mano. |

Los límites honestos:
- **La pausa** es el riesgo real: una barbería que cierra por vacaciones vuelve y la tarjeta no carga. Con uso diario no
  pasa, pero si se venden varias barberías conviene el plan **Pro (desde 25 dólares al mes)**, que no se pausa y tiene
  respaldos diarios. Un solo proyecto Pro alcanza para muchas barberías.
- El plan Free **no tiene respaldos automáticos** que se puedan descargar: hay que exportar a mano de vez en cuando.
- Si el internet de la barbería se corta, el panel no puede marcar visitas hasta que vuelva (avisa «Sin conexión»).

## 6. Recordatorios por WhatsApp: siguen siendo con un toque

En «Les toca volver», el botón abre WhatsApp con el mensaje escrito; **el barbero tiene que apretar enviar**. No sale solo.
Así funciona con el WhatsApp normal o Business del celular, sin costo ni aprobación de Meta.

Para que salgan solos haría falta la **API oficial de WhatsApp Business** (Meta): número dedicado, plantillas de
mensaje aprobadas por Meta y un costo por conversación iniciada por la empresa. Es otro proyecto (un servidor que
revise cada día a quién le toca y envíe). No recomiendo partir por ahí: con el toque del barbero ya funciona y no
arriesga que Meta bloquee el número por mensajes masivos.

## 7. Datos personales y Ley 21.719

**Qué se guarda de cada cliente:** nombre, celular, fechas de visitas, sellos y canjes, si aceptó recordatorios (y cuándo),
y cuándo se le escribió por última vez. Nada más: no se pide RUT, correo, dirección ni fecha de nacimiento.

**Qué pide la ley en lo básico** (Ley 21.719, que reforma la Ley 19.628):
- **Aviso de privacidad**: decirle al cliente quién guarda sus datos (la barbería, con nombre y contacto), para qué,
  cuánto tiempo y cómo pedir verlos, corregirlos o borrarlos. La tarjeta ya trae un resumen en «Cómo usamos tus datos»;
  para el uso real hay que completarlo con los datos de la barbería (el kit `productos/kit-ley-21719` lo genera).
- **Consentimiento** para usar el celular en recordatorios: libre, informado y que se pueda retirar. Por eso:
  - al registrar, la casilla «Acepta que le escribamos por WhatsApp» viene **desmarcada** y el barbero la marca solo si
    el cliente dice que sí (una casilla ya marcada no vale como consentimiento);
  - a quien no aceptó no le aparece el botón de WhatsApp en «Les toca volver»;
  - el cliente puede apagar los recordatorios desde su tarjeta, y queda la fecha del cambio.
- **Borrar cuando lo pidan**: el dueño tiene el botón «Borrar sus datos» en la ficha del cliente.
- **No guardar de más**: al final de `esquema.sql` queda una consulta para borrar clientes sin visitas en 2 años.
- **Seguridad**: las reglas de la base impiden que una barbería vea a otra o que alguien sin sesión lea datos.
- El responsable de los datos es **la barbería**; SENTRY-CODE y Supabase son encargados (procesan por cuenta de ella).
  Conviene que el acuerdo con la barbería lo diga.

**Sobre la fecha:** la ley rige desde el **1-12-2026**. El Congreso aprobó una postergación (Boletín 18.623-07, aprobada
por la Cámara el 17-11-2026, que la movería al 15-10-2027), pero al 22-11-2026 **no estaba publicada en el Diario Oficial**.
Mientras no se publique, la fecha vigente es el 1 de diciembre. Igual conviene hacerlo bien desde el principio: cuesta lo
mismo y es un argumento de venta. Esto no reemplaza la revisión de un abogado.

## 8. Alternativa: Cloudflare D1 + Worker

D1 es una base SQLite de Cloudflare y el Worker sería un pequeño programa propio que hace de puerta (plan gratis:
5 millones de lecturas y 100.000 escrituras al día, 5 GB, y **no se pausa**).
**Recomiendo Supabase** para partir: ya trae las cuentas del personal, las reglas por fila que esta app usa y el mismo
patrón que el panel de clientes que ya tenemos; con D1 habría que programar y mantener a mano el inicio de sesión y
cada permiso. D1 conviene si la pausa de 7 días del plan gratis se vuelve un problema y no se quiere pagar Pro.
