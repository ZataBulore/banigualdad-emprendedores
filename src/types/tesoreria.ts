export type EstadoPago = "pendiente" | "pagado" | "parcial" | "atrasado" | "revisar";

export type MetodoPago = "efectivo" | "transferencia" | "otro" | "";

export type EstadoAsistencia = "pendiente" | "presente" | "ausente" | "justificado";

export type EstadoPersona = "activa" | "de_baja";

export interface Centro {
  idCentro: string;
  nombreCentro: string;
  zona: string;
  asesor: string;
}

export interface ConfiguracionCes {
  fechaVencimiento: string;
  montosPorCredito: Record<string, number>;
}

export interface ReglaRenovacionAusencia {
  ausenciasNoJustificadas: number;
  consecuencia: string;
}

export interface ConfiguracionMicrocredito {
  interesMensualPorcentaje: number;
  semanasDevolucion: number[];
  montoPrimerCicloMin: number;
  montoPrimerCicloMax: number;
  cesDescripcion: string;
  cesMontoReferencia: number;
  ahorroObligatorioNombre: string;
  ahorroObligatorioSemanal: number;
  ahorroObligatorioDevolucion: string;
  avalSolidario: string;
  microseguroOpcional: boolean;
  microseguroSemanal: number;
  microseguroDescripcion: string;
  requisitosCentro: string[];
  normasInternas: string[];
  reglasRenovacionAusencias: ReglaRenovacionAusencia[];
  atrasosPagoSemanalBloqueoRenovacion: number;
  cajaSosMaximaParaRenovar: number;
  directiva: {
    presidenta: string;
    tesorera: string;
    secretaria: string;
  };
  lugarReunion: string;
  pilaresFundacion: string[];
}

export interface CuentaTransferencia {
  titular: string;
  rut: string;
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  correo: string;
  nota: string;
}

export interface ConfiguracionSistema {
  ces: ConfiguracionCes;
  microcredito: ConfiguracionMicrocredito;
  seguridad: ConfiguracionSeguridad;
  cuentaTransferencia: CuentaTransferencia;
}

export interface ConfiguracionSeguridad {
  correosAutorizados: string[];
  correosBaseSincronizados?: string;
}

export interface Emprendedor {
  id: string;
  nombre: string;
  rut: string;
  whatsapp?: string;
  whatsappSecundario?: string;
  nombreContactoSecundario?: string;
  estado: EstadoPersona;
  fechaBaja?: string;
  motivoBaja?: string;
  observacionBaja?: string;
  anillo: number;
  creditoOriginal: number;
  notas?: string;
}

export interface ComprobanteAdjunto {
  nombre: string;
  tipo: string;
  dataUrl?: string;
  url?: string;
  storagePath?: string;
  storageProvider?: "firebase" | "local";
  tamano: number;
  createdAt: string;
}

export type EstadoEmprendimiento = "activo" | "pausado" | "cerrado";

export interface EmprendimientoFoto {
  id: string;
  nombre: string;
  tipo: string;
  dataUrl?: string;
  url?: string;
  storagePath?: string;
  storageProvider?: "firebase" | "local";
  tamano: number;
  createdAt: string;
}

export interface Emprendimiento {
  id: string;
  emprendedorId: string;
  nombre: string;
  rubro: string;
  descripcion: string;
  direccion: string;
  sector: string;
  whatsapp: string;
  correo: string;
  redesSociales: string;
  estado: EstadoEmprendimiento;
  periodoOrigenId?: string;
  creditoOrigen?: number;
  fotos: EmprendimientoFoto[];
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

export type EstadoSolicitudEmprendimiento = "nueva" | "revisada" | "convertida" | "descartada";

export interface SolicitudEmprendimiento {
  id: string;
  rut: string;
  emprendedorId?: string;
  periodoValidadoId?: string;
  creditoOriginal?: number;
  nombreContacto: string;
  whatsapp: string;
  correo: string;
  nombreEmprendimiento: string;
  rubro: string;
  descripcion: string;
  direccion: string;
  sector: string;
  comuna: string;
  canalesVenta: string[];
  horarios: string[];
  redesSociales: string;
  necesidades: string[];
  fotos: EmprendimientoFoto[];
  emprendimientoPublicadoId?: string;
  estado: EstadoSolicitudEmprendimiento;
  origen: "formulario-publico";
  notas?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CobroSemanal {
  id: string;
  periodoId: string;
  emprendedorId: string;
  cuota: number;
  seguro: number;
  totalEsperado: number;
  montoPagado: number;
  estadoPago: EstadoPago;
  atraso: number;
  fechaAtraso: string;
  fechaPago: string;
  metodoPago: MetodoPago;
  referenciaPago: string;
  comprobanteAdjunto?: ComprobanteAdjunto | null;
  comprobantesAdjuntos?: ComprobanteAdjunto[];
  observacion: string;
  confirmadoPorTesorero: boolean;
}

export interface PagoCes {
  id: string;
  emprendedorId: string;
  creditoBase: number;
  fechaVencimiento: string;
  totalEsperado: number;
  montoPagado: number;
  estadoPago: EstadoPago;
  fechaAtraso: string;
  fechaPago: string;
  metodoPago: MetodoPago;
  referenciaPago: string;
  comprobanteAdjunto?: ComprobanteAdjunto | null;
  comprobantesAdjuntos?: ComprobanteAdjunto[];
  observacion: string;
  confirmadoPorTesorero: boolean;
}

export interface Periodo {
  id: string;
  numeroHoja: number;
  numeroLote: string;
  ciclo: number;
  fechaFirma: string;
  numeroCuota: number;
  fechaVencimiento: string;
  cantidadEmprendedores: number;
  totalCredito: number;
  totalCuotas: number;
  totalSeguro: number;
  totalCentro: number;
  imagenOrigen: string;
  estadoCarga: "completo" | "revisar" | "pendiente";
}

export interface AsistenciaParticipante {
  emprendedorId: string;
  estado: EstadoAsistencia;
  observacion: string;
}

export interface ReunionFoto {
  id: string;
  nombre: string;
  tipo: string;
  dataUrl?: string;
  url?: string;
  storagePath?: string;
  storageProvider?: "firebase" | "local";
  tamano: number;
  createdAt: string;
}

export interface Reunion {
  id: string;
  titulo: string;
  fecha: string;
  lugar: string;
  observacion: string;
  acta: string;
  fotos: ReunionFoto[];
  asistencias: AsistenciaParticipante[];
}

export type TipoMovimiento =
  | "cobro"
  | "ces"
  | "persona"
  | "emprendimiento"
  | "asistencia"
  | "reunion"
  | "notificacion"
  | "configuracion"
  | "respaldo";

export interface MovimientoHistorial {
  id: string;
  fecha: string;
  tipo: TipoMovimiento;
  accion: string;
  detalle: string;
  entidadId?: string;
  personaId?: string;
  personaNombre?: string;
  usuarioEmail: string;
}

export interface TesoreriaState {
  centro: Centro;
  configuracion: ConfiguracionSistema;
  periodos: Periodo[];
  emprendedores: Emprendedor[];
  cobros: CobroSemanal[];
  pagosCes: PagoCes[];
  emprendimientos: Emprendimiento[];
  reuniones: Reunion[];
  historial: MovimientoHistorial[];
  updatedAt: string;
}
