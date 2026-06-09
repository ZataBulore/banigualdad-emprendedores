import type { EstadoPago } from "../types/tesoreria";

interface PagoConTotal {
  totalEsperado: number;
  montoPagado: number;
  estadoPago: EstadoPago;
}

export const getPeriodoTotals = (cobros: PagoConTotal[]) => {
  const esperado = cobros.reduce((acc, cobro) => acc + cobro.totalEsperado, 0);
  const pagado = cobros.reduce((acc, cobro) => acc + cobro.montoPagado, 0);
  const pendientes = cobros.filter((cobro) => cobro.estadoPago === "pendiente").length;
  const pagados = cobros.filter((cobro) => cobro.estadoPago === "pagado").length;
  const parciales = cobros.filter((cobro) => cobro.estadoPago === "parcial").length;
  const atrasados = cobros.filter((cobro) => cobro.estadoPago === "atrasado").length;

  return {
    esperado,
    pagado,
    saldo: Math.max(esperado - pagado, 0),
    diferencia: pagado - esperado,
    pendientes,
    pagados,
    parciales,
    atrasados,
    avance: esperado > 0 ? Math.round((pagado / esperado) * 100) : 0,
  };
};
