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

export interface ConfiguracionSistema {
  ces: ConfiguracionCes;
  seguridad: ConfiguracionSeguridad;
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
  dataUrl: string;
  tamano: number;
  createdAt: string;
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
  comprobanteAdjunto?: ComprobanteAdjunto;
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
  comprobanteAdjunto?: ComprobanteAdjunto;
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

export interface Reunion {
  id: string;
  titulo: string;
  fecha: string;
  lugar: string;
  observacion: string;
  acta: string;
  asistencias: AsistenciaParticipante[];
}

export type TipoMovimiento =
  | "cobro"
  | "ces"
  | "persona"
  | "asistencia"
  | "reunion"
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
  reuniones: Reunion[];
  historial: MovimientoHistorial[];
  updatedAt: string;
}
