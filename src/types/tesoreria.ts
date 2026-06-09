export type EstadoPago = "pendiente" | "pagado" | "parcial" | "atrasado" | "revisar";

export type MetodoPago = "efectivo" | "transferencia" | "otro" | "";

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
}

export interface Emprendedor {
  id: string;
  nombre: string;
  rut: string;
  whatsapp?: string;
  anillo: number;
  creditoOriginal: number;
  notas?: string;
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
  fechaPago: string;
  metodoPago: MetodoPago;
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
  fechaPago: string;
  metodoPago: MetodoPago;
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

export interface TesoreriaState {
  centro: Centro;
  configuracion: ConfiguracionSistema;
  periodos: Periodo[];
  emprendedores: Emprendedor[];
  cobros: CobroSemanal[];
  pagosCes: PagoCes[];
  updatedAt: string;
}
