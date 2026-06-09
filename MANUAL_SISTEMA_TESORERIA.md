# Manual inicial del Sistema de Tesoreria Banigualdad

## 1. Objetivo del sistema

Crear una aplicacion web mobile responsive para administrar los pagos semanales del Centro Semilla Emprende Negrete de Fundacion Banigualdad.

El sistema debe permitir:

- Registrar cada hoja semanal de cobro.
- Ver una tarjeta por cada persona/emprendedor.
- Controlar montos esperados, pagos recibidos, atrasos y observaciones.
- Revisar totales por periodo y por persona.
- Usar la aplicacion desde celular de forma comoda.
- Publicar el sistema en GitHub Pages.

## 2. Material de origen

La informacion inicial esta en:

`/Users/zataorubulore/Documents/SemillaEmprenseNegrete/CapturasTesoreria`

Actualmente hay 18 capturas. El formato observado corresponde a hojas de Banigualdad tipo:

- Registro de Pagos del Centro - Semanal.
- Centro: 22808 - Centro Semilla Emprende Negrete.
- Zona: Los_Angeles.
- N lote.
- Ciclo.
- Fecha de firma.
- Cantidad de emprendedores.
- Numero de cuota.
- Vencimiento de cuota.
- Tabla con emprendedores, RUT, credito, cuota, seguro, total, atraso y firmas.

## 3. Enfoque tecnico recomendado

Usaremos una aplicacion React estatica, compatible con GitHub Pages.

Stack propuesto:

- Vite + React + TypeScript.
- Tailwind CSS para estilos responsive.
- Lucide React para iconos.
- Zustand o Context API para estado local.
- LocalStorage al comienzo para guardar cambios en el navegador.
- Exportacion/importacion JSON o CSV para respaldo.
- GitHub Pages para publicacion.

Motivo: es liviano, rapido, facil de mantener y no requiere servidor.

## 4. Principios del sistema

1. La captura original sera la fuente visual de respaldo.
2. Los datos digitados o extraidos quedaran estructurados dentro de la app.
3. Cada periodo/cuota tendra su propia vista.
4. Cada persona tendra una ficha historica.
5. Todo pago debe tener estado claro: pendiente, pagado, parcial, atrasado o exento/no aplica.
6. Los totales del sistema deben compararse contra el total de la hoja original.

## 5. Modelo de datos inicial

### 5.1 Centro

Campos:

- idCentro
- nombreCentro
- zona
- asesor

Ejemplo:

- idCentro: 22808
- nombreCentro: Centro Semilla Emprende Negrete
- zona: Los_Angeles

### 5.2 Periodo o hoja semanal

Campos:

- id
- numeroHoja
- numeroLote
- ciclo
- fechaFirma
- numeroCuota
- fechaVencimiento
- cantidadEmprendedores
- totalCredito
- totalCuotas
- totalSeguro
- totalCentro
- imagenOrigen

### 5.3 Emprendedor

Campos:

- id
- nombre
- rut
- anillo
- creditoOriginal

### 5.4 Cobro semanal por emprendedor

Campos:

- id
- periodoId
- emprendedorId
- cuota
- seguro
- totalEsperado
- montoPagado
- estadoPago
- atraso
- fechaPago
- metodoPago
- observacion
- confirmadoPorTesorero

Estados sugeridos:

- pendiente
- pagado
- parcial
- atrasado
- condonado
- revisar

## 6. Pantallas principales

### 6.1 Inicio / Resumen

Debe mostrar:

- Total esperado del periodo actual.
- Total pagado.
- Saldo pendiente.
- Cantidad de personas pagadas.
- Cantidad de personas pendientes.
- Acceso rapido a cada periodo.

### 6.2 Periodos

Lista de hojas/cuotas registradas.

Cada periodo debe mostrar:

- Numero de cuota.
- Fecha de vencimiento.
- Total esperado.
- Total pagado.
- Diferencia.
- Estado general.

### 6.3 Detalle de periodo

Esta sera la pantalla principal de trabajo del tesorero.

Debe mostrar cards por persona con:

- Nombre.
- RUT.
- Credito original.
- Cuota.
- Seguro.
- Total a pagar.
- Monto pagado.
- Estado.
- Botones rapidos: marcar pagado, pago parcial, pendiente, atraso.
- Campo de observacion.

En mobile, cada card debe ser facil de tocar con el dedo. En escritorio, puede mostrarse como grilla o tabla compacta.

### 6.4 Ficha de persona

Debe mostrar el historial de una persona:

- Datos personales.
- Credito original.
- Pagos por periodo.
- Cuotas pagadas.
- Cuotas pendientes.
- Atrasos.
- Observaciones.

### 6.5 Capturas / respaldo

Vista opcional para ver la imagen original asociada a cada periodo.

Sirve para:

- Revisar errores de digitacion.
- Confirmar fechas.
- Comparar totales.

### 6.6 Exportar / respaldar

Debe permitir:

- Descargar respaldo JSON.
- Importar respaldo JSON.
- Exportar CSV para Excel/Google Sheets.

## 7. Flujo de trabajo del tesorero

1. Abrir la app desde el celular.
2. Entrar al periodo/cuota vigente.
3. Revisar la lista de personas.
4. Registrar pago recibido:
   - Si pago completo: marcar como pagado.
   - Si pago menos: ingresar monto parcial.
   - Si no pago: dejar pendiente o atrasado.
5. Agregar observacion si corresponde.
6. Verificar que el total pagado y pendiente cuadre.
7. Exportar respaldo al final de la jornada o cuando haya cambios importantes.

## 8. Plan de construccion por etapas

### Etapa 1: Base del proyecto

- Crear proyecto React con Vite.
- Configurar TypeScript.
- Instalar Tailwind CSS.
- Instalar Lucide React.
- Preparar estructura de carpetas.
- Configurar deploy para GitHub Pages.

Resultado esperado: app inicial visible en navegador y lista para publicar.

### Etapa 2: Digitacion estructurada de capturas

- Revisar las 18 capturas.
- Extraer datos de cada periodo:
  - Fecha de firma.
  - Fecha de vencimiento.
  - Numero de lote.
  - Numero de cuota.
  - Totales.
  - Personas y montos.
- Crear archivo de datos inicial, por ejemplo `src/data/periodos.ts`.
- Marcar campos dudosos con estado `revisar`.

Resultado esperado: datos de las hojas cargados en formato usable por la app.

### Etapa 3: UI mobile para periodos y cards

- Crear pantalla de resumen.
- Crear listado de periodos.
- Crear detalle de periodo.
- Crear componente de card por persona.
- Agregar filtros por estado: todos, pagados, pendientes, parciales, atrasados.

Resultado esperado: navegacion comoda desde celular para ver cada cuota y cada persona.

### Etapa 4: Registro de pagos

- Permitir modificar estado de pago.
- Permitir ingresar monto pagado.
- Permitir fecha de pago.
- Permitir observaciones.
- Guardar cambios en LocalStorage.
- Calcular totales en tiempo real.

Resultado esperado: el tesorero puede trabajar directamente desde la app.

### Etapa 5: Historial por persona

- Crear ficha de persona.
- Mostrar pagos de todos los periodos.
- Calcular deuda acumulada.
- Mostrar comportamiento de pago.

Resultado esperado: se puede revisar rapidamente la situacion completa de cada emprendedor.

### Etapa 6: Respaldo y exportacion

- Exportar datos a JSON.
- Importar datos desde JSON.
- Exportar resumen CSV.
- Agregar boton de respaldo visible.

Resultado esperado: los datos no quedan atrapados en un solo navegador.

### Etapa 7: Pulido y validacion

- Revisar responsive en mobile y desktop.
- Verificar totales contra capturas.
- Corregir textos, estados y colores.
- Probar publicacion en GitHub Pages.

Resultado esperado: sistema usable y confiable para operacion real.

## 9. Estructura de carpetas propuesta

```txt
SemillaEmprenseNegrete/
  CapturasTesoreria/
  src/
    components/
      Layout/
      PeriodoCard/
      EmprendedorCard/
      EstadoPagoBadge/
    data/
      periodos.ts
      emprendedores.ts
    hooks/
      usePagos.ts
    pages/
      Dashboard.tsx
      Periodos.tsx
      DetallePeriodo.tsx
      Persona.tsx
      Respaldo.tsx
    types/
      tesoreria.ts
    utils/
      currency.ts
      totals.ts
      storage.ts
  public/
    capturas/
  MANUAL_SISTEMA_TESORERIA.md
```

## 10. Reglas de validacion importantes

- El total esperado por periodo debe coincidir con el total de la hoja.
- El total de cada persona debe ser cuota + seguro, salvo excepciones indicadas.
- Un pago parcial no puede superar el total esperado sin advertencia.
- Una persona marcada como pagada debe tener monto pagado igual al total esperado.
- Si hay atraso, debe poder quedar una observacion.
- Cualquier dato dudoso extraido de imagen debe marcarse como `revisar`.

## 11. Diseno visual sugerido

La app debe ser clara, sobria y rapida de usar.

Colores sugeridos:

- Verde para pagado.
- Amarillo para parcial.
- Rojo para atrasado.
- Gris para pendiente.
- Azul para informacion general.

Componentes clave:

- Barra superior con periodo actual.
- Cards compactas por persona.
- Botones con iconos.
- Filtros tipo tabs.
- Totales siempre visibles en la parte superior.

## 12. Primer entregable recomendado

El primer entregable funcional debe incluir:

- App React creada.
- Datos de al menos una captura cargados manualmente.
- Pantalla de periodo.
- Cards de las 17 personas.
- Boton para marcar pagado.
- Calculo de total pagado y pendiente.
- Persistencia en LocalStorage.

Con eso se valida la experiencia real antes de cargar todos los periodos.

## 13. Siguiente paso

El siguiente paso sera crear la base React/Vite y comenzar con un primer periodo de prueba usando una de las capturas. Despues de validar la experiencia, se traspasara el resto de las hojas al sistema.
