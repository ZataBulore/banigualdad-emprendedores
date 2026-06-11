# Activar guardado en Firebase

Esta app ya tiene implementado el guardado en Firestore. Por defecto siempre guarda una copia local en `localStorage`; cuando Firebase queda configurado, tambien lee y escribe automaticamente en la nube.

## 1. Crear el proyecto en Firebase

1. Entra a [Firebase Console](https://console.firebase.google.com/).
2. Crea un proyecto nuevo, por ejemplo `semilla-emprende-negrete`.
3. En el proyecto, entra a **Build > Firestore Database**.
4. Presiona **Create database**.
5. Elige **Production mode**.
6. Selecciona una ubicacion cercana o la que Firebase recomiende para tu proyecto.

## 2. Activar Google como proveedor de acceso

1. En Firebase, entra a **Build > Authentication**.
2. Presiona **Get started** si aun no esta activado.
3. En **Sign-in method**, habilita **Google**.
4. Configura el correo de soporte del proyecto.
5. Guarda los cambios.

## 3. Registrar la app web

1. En Firebase, abre **Project settings** con el icono de engranaje.
2. En **Your apps**, presiona el icono web `</>`.
3. Ponle un nombre, por ejemplo `Tesoreria Web`.
4. No es necesario activar Hosting para usar GitHub Pages.
5. Firebase mostrara una configuracion parecida a esta:

```ts
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...firebaseapp.com",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

Solo necesitas copiar `apiKey`, `authDomain`, `projectId` y `appId`.

## 4. Configurar variables locales

1. En la raiz del proyecto, crea un archivo `.env.local`.
2. Copia esta plantilla y reemplaza los valores:

```env
VITE_FIREBASE_API_KEY=tu-api-key
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-project-id
VITE_FIREBASE_APP_ID=tu-app-id
VITE_FIREBASE_DATABASE_ID=default
VITE_FIREBASE_COLLECTION=centros
VITE_FIREBASE_DOCUMENT_ID=semilla-emprende-negrete
VITE_FIREBASE_SOLICITUDES_COLLECTION=solicitudesEmprendimientos

VITE_AUTHORIZED_EMAILS=correo1@gmail.com,correo2@gmail.com
VITE_EMAIL_ADMIN_PASSWORD_HASH=hash-sha256-de-la-clave-admin
```

Notas:

- `.env.local` no se sube a Git porque esta ignorado en `.gitignore`.
- `VITE_FIREBASE_DATABASE_ID` debe coincidir con el ID elegido al crear Firestore. En este proyecto es `default`.
- `VITE_FIREBASE_COLLECTION` y `VITE_FIREBASE_DOCUMENT_ID` definen donde se guardara todo el sistema: `centros/semilla-emprende-negrete`.
- Si quieres usar otro documento para pruebas, cambia `VITE_FIREBASE_DOCUMENT_ID`, por ejemplo `semilla-emprende-negrete-test`.

## 5. Autorizar dominios para Firebase Auth

La app inicia sesion directamente con Firebase Authentication y Google. Para que el popup funcione, Firebase debe reconocer el dominio desde donde se abre la app.

1. En Firebase, entra a **Build > Authentication**.
2. Abre **Settings**.
3. En **Authorized domains**, agrega:

```txt
localhost
sergiozata.github.io
```

Si usas un dominio propio, agregalo tambien. Si ves `auth/unauthorized-domain` al iniciar sesion, falta agregar el dominio exacto que muestra el navegador.

## 6. Reglas recomendadas de Firestore

En Firebase, entra a **Firestore Database > Rules** y pega una regla como esta:

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null
        && request.auth.token.email in [
          "correo1@gmail.com",
          "correo2@gmail.com"
        ];
    }

    match /centros/semilla-emprende-negrete {
      allow read: if true;
      allow create, update, delete: if isAdmin();
    }

    match /solicitudesEmprendimientos/{solicitudId} {
      allow create: if request.resource.data.origen == "formulario-publico"
        && request.resource.data.estado == "nueva"
        && request.resource.data.nombreEmprendimiento is string
        && request.resource.data.nombreContacto is string
        && request.resource.data.rut is string
        && request.resource.data.fotos is list
        && request.resource.data.fotos.size() <= 3;
      allow read, update, delete: if isAdmin();
    }
  }
}
```

Importante:

- Reemplaza los correos por los mismos autorizados en `VITE_AUTHORIZED_EMAILS`.
- Si cambias `VITE_FIREBASE_COLLECTION`, `VITE_FIREBASE_DOCUMENT_ID` o `VITE_FIREBASE_SOLICITUDES_COLLECTION`, cambia tambien las rutas de la regla.
- La lectura de `centros/semilla-emprende-negrete` queda publica para que funcione la vitrina sin login; la escritura queda solo para administradores.
- La coleccion `solicitudesEmprendimientos` acepta creaciones desde el formulario publico, pero lectura, revision y eliminacion quedan solo para administradores.
- No uses reglas abiertas como `allow read, write: if true` en produccion.

## 7. Probar localmente

Ejecuta:

```bash
npm install
npm run dev
```

Abre la URL local que entrega Vite, normalmente:

```txt
http://localhost:5173
```

Luego:

1. Ingresa con una cuenta Google autorizada.
2. Entra a **Configuracion > Estado de la nube**.
3. Debe aparecer **Firebase activo**.
4. Haz un cambio pequeno, por ejemplo actualizar una observacion.
5. El estado deberia pasar por **Guardando nube** y volver a **Firebase activo**.
6. En Firebase Console, abre Firestore y confirma que exista el documento:

```txt
centros / semilla-emprende-negrete
```

El documento debe tener los campos `state`, `updatedAt` y `updatedBy`.

## 8. Migrar datos locales actuales a Firebase

El primer usuario autorizado que entre con Firebase configurado subira automaticamente el estado local si el documento remoto aun no existe.

Flujo recomendado:

1. Antes de activar Firebase, entra a **Configuracion > Respaldo** y descarga un JSON.
2. Configura Firebase.
3. Inicia sesion con la cuenta que tenga los datos locales correctos.
4. Revisa que diga **Firebase activo**.
5. Confirma en Firestore que se creo el documento con `state`.
6. En otro navegador o computador, inicia sesion con una cuenta autorizada y verifica que aparezcan los mismos datos.

## 9. Configurar GitHub Pages

Si publicas con GitHub Pages, agrega las mismas variables como secrets o variables de Actions:

1. En GitHub, abre el repositorio.
2. Ve a **Settings > Secrets and variables > Actions**.
3. Agrega las variables:

```txt
VITE_GOOGLE_CLIENT_ID
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_DATABASE_ID
VITE_FIREBASE_COLLECTION
VITE_FIREBASE_DOCUMENT_ID
VITE_AUTHORIZED_EMAILS
VITE_EMAIL_ADMIN_PASSWORD_HASH
```

4. Revisa que el workflow de deploy las pase al build. Si el workflow no las exporta, Vite no las vera durante `npm run build`.

## 10. Como saber si esta funcionando

En la app:

- **Modo local**: faltan variables de Firebase.
- **Conectando nube**: Firebase esta configurado, pero aun no se completo la lectura inicial o falta iniciar sesion.
- **Firebase activo**: lectura/suscripcion remota funcionando.
- **Guardando nube**: se esta escribiendo un cambio.
- **Error nube**: revisar reglas, correos, dominios autorizados o variables.

En Firestore:

- `state` contiene todos los datos de tesoreria.
- `updatedBy` muestra el correo del ultimo usuario que guardo.
- `updatedAt` muestra la fecha del ultimo guardado.
