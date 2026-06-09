import { useEffect, useMemo, useState } from "react";
import { tesoreriaInicial } from "../data/tesoreriaInicial";
import type { CobroSemanal, EstadoPago, MetodoPago, TesoreriaState } from "../types/tesoreria";

const STORAGE_KEY = "tesoreria-semilla-emprende-v1";

const loadState = (): TesoreriaState => {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return tesoreriaInicial;

  try {
    return JSON.parse(stored) as TesoreriaState;
  } catch {
    return tesoreriaInicial;
  }
};

export const useTesoreria = () => {
  const [state, setState] = useState<TesoreriaState>(loadState);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, updatedAt: new Date().toISOString() }),
    );
  }, [state]);

  const updateCobro = (id: string, patch: Partial<CobroSemanal>) => {
    setState((current) => ({
      ...current,
      cobros: current.cobros.map((cobro) =>
        cobro.id === id ? { ...cobro, ...patch } : cobro,
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const marcarPagado = (id: string) => {
    const cobro = state.cobros.find((item) => item.id === id);
    if (!cobro) return;

    updateCobro(id, {
      montoPagado: cobro.totalEsperado,
      estadoPago: "pagado",
      fechaPago: new Date().toISOString().slice(0, 10),
      confirmadoPorTesorero: true,
    });
  };

  const cambiarEstado = (id: string, estadoPago: EstadoPago) => {
    const cobro = state.cobros.find((item) => item.id === id);
    if (!cobro) return;

    const patch: Partial<CobroSemanal> = { estadoPago };

    if (estadoPago === "pendiente" || estadoPago === "atrasado") {
      patch.montoPagado = 0;
      patch.confirmadoPorTesorero = false;
    }

    if (estadoPago === "pagado") {
      patch.montoPagado = cobro.totalEsperado;
      patch.fechaPago = new Date().toISOString().slice(0, 10);
      patch.confirmadoPorTesorero = true;
    }

    updateCobro(id, patch);
  };

  const registrarMonto = (id: string, montoPagado: number) => {
    const cobro = state.cobros.find((item) => item.id === id);
    if (!cobro) return;

    const estadoPago =
      montoPagado <= 0 ? "pendiente" : montoPagado >= cobro.totalEsperado ? "pagado" : "parcial";

    updateCobro(id, {
      montoPagado,
      estadoPago,
      confirmadoPorTesorero: estadoPago === "pagado",
      fechaPago: montoPagado > 0 ? cobro.fechaPago || new Date().toISOString().slice(0, 10) : "",
    });
  };

  const actualizarDetalle = (
    id: string,
    detail: { fechaPago?: string; metodoPago?: MetodoPago; observacion?: string },
  ) => updateCobro(id, detail);

  const resetear = () => setState(tesoreriaInicial);

  const importar = (nextState: TesoreriaState) => setState(nextState);

  const personasPorId = useMemo(
    () => new Map(state.emprendedores.map((emprendedor) => [emprendedor.id, emprendedor])),
    [state.emprendedores],
  );

  return {
    state,
    personasPorId,
    marcarPagado,
    cambiarEstado,
    registrarMonto,
    actualizarDetalle,
    importar,
    resetear,
  };
};
