# Configurar Supabase en produccion

Esta app ya esta preparada para usar Supabase como nube principal cuando existen estas variables en el build de GitHub Pages:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Cuando esas dos existen, la app usa Supabase para:

- guardar el estado del sistema en `public.app_state`;
- guardar solicitudes publicas en `public.venture_requests`;
- subir comprobantes, fotos de emprendimientos y minutas al bucket `comprobantes`;
- mantener Firebase Auth para iniciar sesion con Google.

## 1. Crear o abrir el proyecto Supabase

1. Entra a Supabase.
2. Abre el proyecto de produccion.
3. Ve a **Project Settings > API**.
4. Copia:
   - **Project URL** para `VITE_SUPABASE_URL`;
   - **anon public key** para `VITE_SUPABASE_ANON_KEY`.

No uses la `service_role key` en GitHub Pages ni en variables `VITE_*`.

## 2. Ejecutar SQL

En Supabase, abre **SQL Editor** y ejecuta completo el archivo:

```txt
supabase-transition.sql
```

Ese script crea:

- tabla `public.app_state`;
- tabla `public.venture_requests`;
- bucket publico `comprobantes`;
- politicas RLS transitorias para lectura/escritura desde la app publicada;
- realtime para las tablas.

## 3. Configurar GitHub Actions

En GitHub:

1. Abre el repo `sergiozata/banigualdad`.
2. Ve a **Settings > Secrets and variables > Actions**.
3. En **Secrets**, crea:

```txt
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_ANON_PUBLIC_KEY
```

4. En **Variables**, crea o confirma:

```txt
VITE_SUPABASE_STATE_TABLE=app_state
VITE_SUPABASE_STATE_ID=semilla-emprende-negrete
VITE_SUPABASE_COMPROBANTES_BUCKET=comprobantes
VITE_SUPABASE_SOLICITUDES_TABLE=venture_requests
```

El workflow `.github/workflows/deploy.yml` ya lee esos nombres durante `npm run build`.

## 4. Redeploy

Despues de guardar secrets y variables:

1. Ve a **Actions > Deploy GitHub Pages**.
2. Ejecuta **Run workflow** sobre `main`, o haz un push nuevo.
3. Espera que `build` y `deploy` terminen en verde.

## 5. Validar

En la URL publicada:

1. Entra al admin.
2. Abre **Config > Estado de la nube**.
3. Debe mostrar **Nube activa** y el texto debe indicar Supabase.
4. Sube un comprobante liviano desde un cobro.
5. El comprobante debe mostrar la etiqueta **Supabase**.
6. En Supabase Storage, bucket `comprobantes`, debe aparecer un archivo bajo:

```txt
semilla-emprende-negrete/comprobantes/
```

7. En Supabase Table Editor, `app_state`, debe existir la fila:

```txt
id = semilla-emprende-negrete
```

## Nota de seguridad

Las politicas del archivo SQL son transitorias y abiertas para que GitHub Pages pueda operar con la anon key. Cuando el sistema este estable, el siguiente endurecimiento recomendado es mover escrituras a Edge Functions o validar administradores con Supabase Auth/JWT.
