import { useEffect, useMemo, useRef, useState } from "react";
import { configuracionInicial, crearPagosCes, getMontoCes, tesoreriaInicial } from "../data/tesoreriaInicial";
import { isFirebaseConfigured, readRemoteState, saveRemoteState, subscribeRemoteState } from "../services/firebase";
import type {
  Centro,
  CobroSemanal,
  ConfiguracionCes,
  ConfiguracionSeguridad,
  Emprendedor,
  EstadoAsistencia,
  EstadoPago,
  MetodoPago,
  PagoCes,
  Periodo,
  Reunion,
  TesoreriaState,
} from "../types/tesoreria";

const STORAGE_KEY = "tesoreria-semilla-emprende-v1";

export type CloudSyncStatus = "local" | "connecting" | "synced" | "saving" | "error";

const deriveEstadoPago = (montoPagado: number, totalEsperado: number, current: EstadoPago) => {
  if (current === "atrasado" || current === "revisar") return current;
  if (montoPagado <= 0) return "pendiente";
  return montoPagado >= totalEsperado ? "pagado" : "parcial";
};

const crearAsistenciasBase = (emprendedores: Emprendedor[]) =>
  emprendedores.map((emprendedor) => ({
    emprendedorId: emprendedor.id,
    estado: "pendiente" as const,
    observacion: "",
  }));

const normalizarCorreos = (emails: string[]) =>
  Array.from(
    new Set(
      emails
        .flatMap((email) => email.split(/[,\n;]/))
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

const getCorreosBaseKey = () =>
  normalizarCorreos(configuracionInicial.seguridad.correosAutorizados).join("|");

const normalizarAsistencias = (reunion: Reunion, emprendedores: Emprendedor[]): Reunion => {
  const existentes = new Map((reunion.asistencias ?? []).map((asistencia) => [asistencia.emprendedorId, asistencia]));

  return {
    ...reunion,
    lugar: reunion.lugar ?? "",
    observacion: reunion.observacion ?? "",
    acta: reunion.acta ?? "",
    asistencias: emprendedores.map((emprendedor) => ({
      emprendedorId: emprendedor.id,
      estado: existentes.get(emprendedor.id)?.estado ?? "pendiente",
      observacion: existentes.get(emprendedor.id)?.observacion ?? "",
    })),
  };
};

const migrateState = (state: TesoreriaState): TesoreriaState => {
  const periodosActuales = new Map((state.periodos ?? []).map((periodo) => [periodo.id, periodo]));
  const cobrosActuales = new Map((state.cobros ?? []).map((cobro) => [cobro.id, cobro]));
  const periodosIniciales = new Set(tesoreriaInicial.periodos.map((periodo) => periodo.id));
  const cobrosIniciales = new Set(tesoreriaInicial.cobros.map((cobro) => cobro.id));
  const correosBaseKey = getCorreosBaseKey();
  const seguridadActual = state.configuracion?.seguridad;
  const correosGuardados = seguridadActual?.correosAutorizados ?? [];
  const correosAutorizados =
    seguridadActual?.correosBaseSincronizados === correosBaseKey
      ? normalizarCorreos(correosGuardados)
      : normalizarCorreos([...correosGuardados, ...configuracionInicial.seguridad.correosAutorizados]);
  const configuracion = {
    ...configuracionInicial,
    ...(state.configuracion ?? {}),
    ces: {
      ...configuracionInicial.ces,
      ...(state.configuracion?.ces ?? {}),
      montosPorCredito: {
        ...configuracionInicial.ces.montosPorCredito,
        ...(state.configuracion?.ces?.montosPorCredito ?? {}),
      },
    },
    seguridad: {
      ...configuracionInicial.seguridad,
      ...(state.configuracion?.seguridad ?? {}),
      correosAutorizados,
      correosBaseSincronizados: correosBaseKey,
    },
  };

  return {
    ...state,
    configuracion,
    periodos: [
      ...tesoreriaInicial.periodos.map((periodo) => ({
        ...periodo,
        ...(periodosActuales.get(periodo.id) ?? {}),
      })),
      ...(state.periodos ?? []).filter((periodo) => !periodosIniciales.has(periodo.id)),
    ].sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento)),
    emprendedores: state.emprendedores.map((emprendedor) => ({
      ...emprendedor,
      whatsapp: emprendedor.whatsapp ?? "",
      estado: emprendedor.estado ?? "activa",
      fechaBaja: emprendedor.fechaBaja ?? "",
      motivoBaja: emprendedor.motivoBaja ?? "",
      observacionBaja: emprendedor.observacionBaja ?? "",
    })),
    cobros: [
      ...tesoreriaInicial.cobros.map((cobro) => ({
        ...cobro,
        ...(cobrosActuales.get(cobro.id) ?? {}),
      })),
      ...(state.cobros ?? []).filter((cobro) => !cobrosIniciales.has(cobro.id)),
    ].map((cobro) => ({
      ...cobro,
      fechaAtraso: cobro.fechaAtraso ?? "",
      referenciaPago: cobro.referenciaPago ?? "",
    })),
    pagosCes: state.pagosCes?.length
      ? state.pagosCes.map((pago) => ({
          ...pago,
          fechaVencimiento: pago.fechaVencimiento || configuracion.ces.fechaVencimiento,
          fechaAtraso: pago.fechaAtraso ?? "",
          referenciaPago: pago.referenciaPago ?? "",
        }))
      : crearPagosCes(state.emprendedores, configuracion),
    reuniones: (state.reuniones ?? []).map((reunion) => normalizarAsistencias(reunion, state.emprendedores)),
  };
};

const loadState = (): TesoreriaState => {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return tesoreriaInicial;

  try {
    return migrateState(JSON.parse(stored) as TesoreriaState);
  } catch {
    return tesoreriaInicial;
  }
};

export const useTesoreria = (options: { syncEnabled?: boolean; updatedBy?: string } = {}) => {
  const [state, setState] = useState<TesoreriaState>(loadState);
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>(
    isFirebaseConfigured ? "connecting" : "local",
  );
  const [cloudError, setCloudError] = useState("");
  const applyingRemoteRef = useRef(false);
  const remoteReadyRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, updatedAt: new Date().toISOString() }),
    );
  }, [state]);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setCloudStatus("local");
      return;
    }

    if (!options.syncEnabled) {
      setCloudStatus("connecting");
      return;
    }

    let cancelled = false;
    setCloudStatus("connecting");
    setCloudError("");

    readRemoteState()
      .then((remoteState) => {
        if (cancelled) return;
        if (remoteState) {
          applyingRemoteRef.current = true;
          setState(migrateState(remoteState));
        } else {
          void saveRemoteState(state, options.updatedBy);
        }
        remoteReadyRef.current = true;
        setCloudStatus("synced");
      })
      .catch((error) => {
        if (cancelled) return;
        setCloudStatus("error");
        setCloudError(error instanceof Error ? error.message : "No se pudo conectar con Firebase.");
      });

    const unsubscribe = subscribeRemoteState(
      (remoteState) => {
        if (!remoteReadyRef.current || !remoteState) return;
        applyingRemoteRef.current = true;
        setState(migrateState(remoteState));
        setCloudStatus("synced");
      },
      (message) => {
        setCloudStatus("error");
        setCloudError(message);
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [options.syncEnabled, options.updatedBy]);

  useEffect(() => {
    if (!isFirebaseConfigured || !options.syncEnabled || !remoteReadyRef.current) return;

    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    setCloudStatus("saving");
    saveTimeoutRef.current = window.setTimeout(() => {
      saveRemoteState(state, options.updatedBy)
        .then(() => {
          setCloudStatus("synced");
          setCloudError("");
        })
        .catch((error) => {
          setCloudStatus("error");
          setCloudError(error instanceof Error ? error.message : "No se pudo guardar en Firebase.");
        });
    }, 450);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [options.syncEnabled, options.updatedBy, state]);

  const updateCobro = (id: string, patch: Partial<CobroSemanal>) => {
    setState((current) => ({
      ...current,
      cobros: current.cobros.map((cobro) =>
        cobro.id === id ? { ...cobro, ...patch } : cobro,
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateCes = (id: string, patch: Partial<PagoCes>) => {
    setState((current) => ({
      ...current,
      pagosCes: current.pagosCes.map((pago) => (pago.id === id ? { ...pago, ...patch } : pago)),
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateCentro = (patch: Partial<Centro>) => {
    setState((current) => ({
      ...current,
      centro: { ...current.centro, ...patch },
      updatedAt: new Date().toISOString(),
    }));
  };

  const updatePeriodo = (id: string, patch: Partial<Periodo>) => {
    setState((current) => ({
      ...current,
      periodos: current.periodos.map((periodo) =>
        periodo.id === id ? { ...periodo, ...patch } : periodo,
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateEmprendedor = (id: string, patch: Partial<Emprendedor>) => {
    setState((current) => ({
      ...current,
      emprendedores: current.emprendedores.map((emprendedor) =>
        emprendedor.id === id ? { ...emprendedor, ...patch } : emprendedor,
      ),
      pagosCes: current.pagosCes.map((pago) => {
        if (pago.emprendedorId !== id || patch.creditoOriginal === undefined) return pago;
        const totalEsperado = getMontoCes(patch.creditoOriginal, current.configuracion.ces.montosPorCredito);

        return {
          ...pago,
          creditoBase: patch.creditoOriginal,
          totalEsperado,
          estadoPago: deriveEstadoPago(pago.montoPagado, totalEsperado, pago.estadoPago),
          confirmadoPorTesorero: pago.montoPagado >= totalEsperado && totalEsperado > 0,
        };
      }),
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateConfiguracionCes = (patch: Partial<ConfiguracionCes>) => {
    setState((current) => {
      const ces = {
        ...current.configuracion.ces,
        ...patch,
        montosPorCredito: {
          ...current.configuracion.ces.montosPorCredito,
          ...(patch.montosPorCredito ?? {}),
        },
      };

      return {
        ...current,
        configuracion: {
          ...current.configuracion,
          ces,
        },
        pagosCes: current.pagosCes.map((pago) => ({
          ...pago,
          fechaVencimiento: ces.fechaVencimiento,
        })),
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const updateConfiguracionSeguridad = (patch: Partial<ConfiguracionSeguridad>) => {
    setState((current) => ({
      ...current,
      configuracion: {
        ...current.configuracion,
        seguridad: {
          ...current.configuracion.seguridad,
          ...patch,
        },
      },
      updatedAt: new Date().toISOString(),
    }));
  };

  const recalcularPagosCes = () => {
    setState((current) => ({
      ...current,
      pagosCes: current.pagosCes.map((pago) => {
        const emprendedor = current.emprendedores.find((persona) => persona.id === pago.emprendedorId);
        const creditoBase = emprendedor?.creditoOriginal ?? pago.creditoBase;
        const totalEsperado = getMontoCes(creditoBase, current.configuracion.ces.montosPorCredito);

        return {
          ...pago,
          creditoBase,
          fechaVencimiento: current.configuracion.ces.fechaVencimiento,
          totalEsperado,
          estadoPago: deriveEstadoPago(pago.montoPagado, totalEsperado, pago.estadoPago),
          confirmadoPorTesorero: pago.montoPagado >= totalEsperado && totalEsperado > 0,
        };
      }),
      updatedAt: new Date().toISOString(),
    }));
  };

  const marcarPagado = (id: string) => {
    const cobro = state.cobros.find((item) => item.id === id);
    if (!cobro) return;

    updateCobro(id, {
      montoPagado: cobro.totalEsperado,
      estadoPago: "pagado",
      fechaAtraso: "",
      fechaPago: new Date().toISOString().slice(0, 10),
      confirmadoPorTesorero: true,
    });
  };

  const marcarCesPagado = (id: string) => {
    const pago = state.pagosCes.find((item) => item.id === id);
    if (!pago) return;

    updateCes(id, {
      montoPagado: pago.totalEsperado,
      estadoPago: "pagado",
      fechaAtraso: "",
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

    patch.fechaAtraso = estadoPago === "atrasado" ? new Date().toISOString() : "";

    if (estadoPago === "pagado") {
      patch.montoPagado = cobro.totalEsperado;
      patch.fechaPago = new Date().toISOString().slice(0, 10);
      patch.confirmadoPorTesorero = true;
    }

    updateCobro(id, patch);
  };

  const cambiarEstadoCes = (id: string, estadoPago: EstadoPago) => {
    const pago = state.pagosCes.find((item) => item.id === id);
    if (!pago) return;

    const patch: Partial<PagoCes> = { estadoPago };

    if (estadoPago === "pendiente" || estadoPago === "atrasado") {
      patch.montoPagado = 0;
      patch.confirmadoPorTesorero = false;
    }

    patch.fechaAtraso = estadoPago === "atrasado" ? new Date().toISOString() : "";

    if (estadoPago === "pagado") {
      patch.montoPagado = pago.totalEsperado;
      patch.fechaPago = new Date().toISOString().slice(0, 10);
      patch.confirmadoPorTesorero = true;
    }

    updateCes(id, patch);
  };

  const registrarMonto = (id: string, montoPagado: number) => {
    const cobro = state.cobros.find((item) => item.id === id);
    if (!cobro) return;

    const estadoPago =
      montoPagado <= 0 ? "pendiente" : montoPagado >= cobro.totalEsperado ? "pagado" : "parcial";

    updateCobro(id, {
      montoPagado,
      estadoPago,
      fechaAtraso: "",
      confirmadoPorTesorero: estadoPago === "pagado",
      fechaPago: montoPagado > 0 ? cobro.fechaPago || new Date().toISOString().slice(0, 10) : "",
    });
  };

  const registrarMontoCes = (id: string, montoPagado: number) => {
    const pago = state.pagosCes.find((item) => item.id === id);
    if (!pago) return;

    const estadoPago =
      montoPagado <= 0 ? "pendiente" : montoPagado >= pago.totalEsperado ? "pagado" : "parcial";

    updateCes(id, {
      montoPagado,
      estadoPago,
      fechaAtraso: "",
      confirmadoPorTesorero: estadoPago === "pagado",
      fechaPago: montoPagado > 0 ? pago.fechaPago || new Date().toISOString().slice(0, 10) : "",
    });
  };

  const actualizarDetalle = (
    id: string,
    detail: { fechaPago?: string; metodoPago?: MetodoPago; referenciaPago?: string; observacion?: string },
  ) => updateCobro(id, detail);

  const actualizarCobro = (id: string, patch: Partial<CobroSemanal>) => updateCobro(id, patch);

  const actualizarDetalleCes = (
    id: string,
    detail: { fechaPago?: string; metodoPago?: MetodoPago; referenciaPago?: string; observacion?: string },
  ) => updateCes(id, detail);

  const registrarPagoMultiple = (
    ids: string[],
    detail: { fechaPago: string; metodoPago: MetodoPago; referenciaPago: string; observacion?: string },
  ) => {
    const selected = new Set(ids);

    setState((current) => ({
      ...current,
      cobros: current.cobros.map((cobro) => {
        if (!selected.has(cobro.id)) return cobro;

        return {
          ...cobro,
          montoPagado: cobro.totalEsperado,
          estadoPago: "pagado",
          fechaAtraso: "",
          fechaPago: detail.fechaPago,
          metodoPago: detail.metodoPago,
          referenciaPago: detail.metodoPago === "efectivo" ? "" : detail.referenciaPago.trim(),
          observacion: detail.observacion?.trim() || cobro.observacion,
          confirmadoPorTesorero: true,
        };
      }),
      updatedAt: new Date().toISOString(),
    }));
  };

  const crearReunion = (reunion: { titulo: string; fecha: string; lugar?: string; observacion?: string; acta?: string }) => {
    const id = `reunion-${reunion.fecha}-${Date.now()}`;

    setState((current) => ({
      ...current,
      reuniones: [
        ...current.reuniones,
        {
          id,
          titulo: reunion.titulo.trim() || `Reunion ${current.reuniones.length + 1}`,
          fecha: reunion.fecha,
          lugar: reunion.lugar?.trim() ?? "",
          observacion: reunion.observacion?.trim() ?? "",
          acta: reunion.acta?.trim() ?? "",
          asistencias: crearAsistenciasBase(current.emprendedores),
        },
      ],
      updatedAt: new Date().toISOString(),
    }));

    return id;
  };

  const updateReunion = (id: string, patch: Partial<Omit<Reunion, "id" | "asistencias">>) => {
    setState((current) => ({
      ...current,
      reuniones: current.reuniones.map((reunion) =>
        reunion.id === id ? { ...reunion, ...patch } : reunion,
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const eliminarReunion = (id: string) => {
    setState((current) => ({
      ...current,
      reuniones: current.reuniones.filter((reunion) => reunion.id !== id),
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateAsistencia = (
    reunionId: string,
    emprendedorId: string,
    patch: { estado?: EstadoAsistencia; observacion?: string },
  ) => {
    setState((current) => ({
      ...current,
      reuniones: current.reuniones.map((reunion) => {
        if (reunion.id !== reunionId) return reunion;

        return {
          ...reunion,
          asistencias: reunion.asistencias.map((asistencia) =>
            asistencia.emprendedorId === emprendedorId ? { ...asistencia, ...patch } : asistencia,
          ),
        };
      }),
      updatedAt: new Date().toISOString(),
    }));
  };

  const marcarTodosPresentes = (reunionId: string) => {
    setState((current) => ({
      ...current,
      reuniones: current.reuniones.map((reunion) => {
        if (reunion.id !== reunionId) return reunion;

        return {
          ...reunion,
          asistencias: reunion.asistencias.map((asistencia) => ({
            ...asistencia,
            estado: "presente",
          })),
        };
      }),
      updatedAt: new Date().toISOString(),
    }));
  };

  const resetear = () => setState(tesoreriaInicial);

  const importar = (nextState: TesoreriaState) => setState(migrateState(nextState));

  const personasPorId = useMemo(
    () => new Map(state.emprendedores.map((emprendedor) => [emprendedor.id, emprendedor])),
    [state.emprendedores],
  );

  return {
    state,
    cloudStatus,
    cloudError,
    personasPorId,
    updateCentro,
    updatePeriodo,
    updateEmprendedor,
    updateConfiguracionCes,
    updateConfiguracionSeguridad,
    recalcularPagosCes,
    marcarPagado,
    cambiarEstado,
    marcarCesPagado,
    cambiarEstadoCes,
    registrarMonto,
    registrarMontoCes,
    actualizarCobro,
    actualizarDetalle,
    actualizarDetalleCes,
    registrarPagoMultiple,
    crearReunion,
    updateReunion,
    eliminarReunion,
    updateAsistencia,
    marcarTodosPresentes,
    importar,
    resetear,
  };
};
