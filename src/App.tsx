import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileImage,
  History,
  Landmark,
  MessageCircle,
  Pencil,
  Phone,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Upload,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { ChangeEvent, useMemo, useRef, useState } from "react";
import { useTesoreria } from "./hooks/useTesoreria";
import type { Centro, CobroSemanal, ConfiguracionCes, Emprendedor, EstadoPago, MetodoPago, PagoCes, Periodo, TesoreriaState } from "./types/tesoreria";
import { formatCurrency, formatDate } from "./utils/currency";
import { getPeriodoTotals } from "./utils/totals";

type Tab = "cobros" | "ces" | "personas" | "respaldo" | "config";
type FiltroEstado = "todos" | EstadoPago;
type PersonaForm = Pick<Emprendedor, "nombre" | "rut" | "whatsapp" | "creditoOriginal" | "anillo" | "notas">;

const estadoLabels: Record<EstadoPago, string> = {
  pendiente: "Pendiente",
  pagado: "Pagado",
  parcial: "Parcial",
  atrasado: "Atrasado",
  revisar: "Revisar",
};

const estadoOptions: FiltroEstado[] = ["todos", "pendiente", "pagado", "parcial", "atrasado", "revisar"];

const metodoOptions: { label: string; value: MetodoPago }[] = [
  { label: "Metodo", value: "" },
  { label: "Efectivo", value: "efectivo" },
  { label: "Transferencia", value: "transferencia" },
  { label: "Otro", value: "otro" },
];

const cleanRut = (rut: string) => rut.replace(/[.\-\s]/g, "").toUpperCase();

const formatRut = (rut: string) => {
  const cleaned = cleanRut(rut);
  if (cleaned.length < 2) return cleaned;
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
};

const isValidRut = (rut: string) => {
  const cleaned = cleanRut(rut);
  if (!/^\d{7,8}[\dK]$/.test(cleaned)) return false;

  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  let sum = 0;
  let multiplier = 2;

  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const result = 11 - (sum % 11);
  const expected = result === 11 ? "0" : result === 10 ? "K" : String(result);
  return dv === expected;
};

const cleanWhatsapp = (value = "") => value.replace(/\D/g, "");

const normalizeWhatsapp = (value = "") => {
  const digits = cleanWhatsapp(value);
  if (!digits) return "";
  if (digits.startsWith("56")) return digits;
  if (digits.length === 9) return `56${digits}`;
  return digits;
};

const formatWhatsapp = (value = "") => {
  const normalized = normalizeWhatsapp(value);
  if (!normalized) return "";
  if (normalized.startsWith("56") && normalized.length === 11) {
    return `+56 ${normalized.slice(2, 3)} ${normalized.slice(3, 7)} ${normalized.slice(7)}`;
  }
  return value;
};

const isValidWhatsapp = (value = "") => {
  const normalized = normalizeWhatsapp(value);
  return !normalized || /^569\d{8}$/.test(normalized);
};

const normalizeSearchText = (value = "") =>
  value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const matchesPersonaSearch = (
  persona: Emprendedor | undefined,
  query: string,
  extraValues: Array<string | number | undefined> = [],
) => {
  const normalizedQuery = normalizeSearchText(query);
  const compactQuery = cleanRut(query);
  const numericQuery = cleanWhatsapp(query);

  if (!normalizedQuery && !compactQuery && !numericQuery) return true;
  if (!persona) return false;

  const values = [
    persona.nombre,
    persona.rut,
    persona.whatsapp,
    persona.creditoOriginal,
    persona.anillo,
    persona.notas,
    ...extraValues,
  ];

  const normalizedHaystack = values.map((value) => normalizeSearchText(String(value ?? ""))).join(" ");
  const compactHaystack = values.map((value) => cleanRut(String(value ?? ""))).join(" ");
  const numericHaystack = values.map((value) => cleanWhatsapp(String(value ?? ""))).join(" ");

  return (
    normalizedHaystack.includes(normalizedQuery) ||
    (!!compactQuery && compactHaystack.includes(compactQuery)) ||
    (!!numericQuery && numericHaystack.includes(numericQuery))
  );
};

const getFirstName = (nombre: string) => {
  const [lastNames, names = nombre] = nombre.split(",");
  return (names || lastNames).trim().split(" ")[0] || "Hola";
};

const buildWhatsappUrl = (telefono: string, message: string) => {
  const normalized = normalizeWhatsapp(telefono);
  if (!normalized) return "";
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
};

const buildWhatsappMessages = (
  persona: Emprendedor,
  cobro?: CobroSemanal,
  periodo?: Periodo,
) => {
  const nombre = getFirstName(persona.nombre);
  const monto = cobro ? formatCurrency(Math.max(cobro.totalEsperado - cobro.montoPagado, 0)) : "el monto pendiente";
  const vencimiento = periodo ? formatDate(periodo.fechaVencimiento) : "la fecha de vencimiento";

  return {
    proximo: `Hola ${nombre}, te recuerdo que tu pago de Banigualdad por ${monto} vence el ${vencimiento}. Si ya pagaste, por favor avisame para registrarlo. Gracias.`,
    atrasado: `Hola ${nombre}, aparece pendiente tu pago de Banigualdad por ${monto}, con vencimiento ${vencimiento}. Por favor regularicemos este pago lo antes posible. Gracias.`,
    ultimoDia: `Hola ${nombre}, hoy es el ultimo dia para registrar tu pago de Banigualdad por ${monto}. Si puedes, enviame confirmacion cuando realices el pago. Gracias.`,
  };
};

const validatePersonaForm = (
  form: PersonaForm,
  personas: Emprendedor[],
  personaId: string,
) => {
  const errors: Partial<Record<keyof PersonaForm, string>> = {};
  const rutNormalizado = cleanRut(form.rut);

  if (form.nombre.trim().length < 3) {
    errors.nombre = "Ingresa un nombre de al menos 3 caracteres.";
  }

  if (!isValidRut(form.rut)) {
    errors.rut = "El RUT no es valido. Revisa numero y digito verificador.";
  } else if (
    personas.some((persona) => persona.id !== personaId && cleanRut(persona.rut) === rutNormalizado)
  ) {
    errors.rut = "Este RUT ya esta registrado en otra persona.";
  }

  if (!Number.isFinite(form.creditoOriginal) || form.creditoOriginal <= 0) {
    errors.creditoOriginal = "El credito debe ser mayor a cero.";
  }

  if (!Number.isInteger(form.anillo) || form.anillo < 0) {
    errors.anillo = "El anillo debe ser un numero entero igual o mayor a cero.";
  }

  if ((form.notas ?? "").length > 200) {
    errors.notas = "La nota no puede superar 200 caracteres.";
  }

  if (!isValidWhatsapp(form.whatsapp)) {
    errors.whatsapp = "Ingresa un WhatsApp chileno valido, por ejemplo +56 9 1234 5678.";
  }

  return errors;
};

function App() {
  const {
    state,
    personasPorId,
    updateCentro,
    updatePeriodo,
    updateEmprendedor,
    updateConfiguracionCes,
    recalcularPagosCes,
    marcarPagado,
    cambiarEstado,
    marcarCesPagado,
    cambiarEstadoCes,
    registrarMonto,
    registrarMontoCes,
    actualizarDetalle,
    actualizarDetalleCes,
    importar,
    resetear,
  } = useTesoreria();
  const [tab, setTab] = useState<Tab>("cobros");
  const [periodoId, setPeriodoId] = useState(state.periodos[0]?.id ?? "");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [personaActiva, setPersonaActiva] = useState<string | null>(null);
  const [personaEditando, setPersonaEditando] = useState<Emprendedor | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const periodo = state.periodos.find((item) => item.id === periodoId) ?? state.periodos[0];
  const cobrosPeriodo = state.cobros.filter((cobro) => cobro.periodoId === periodo?.id);
  const totals = getPeriodoTotals(cobrosPeriodo);
  const cesTotals = getPeriodoTotals(state.pagosCes);

  const cobrosFiltrados = useMemo(() => {
    return cobrosPeriodo.filter((cobro) => {
      const persona = personasPorId.get(cobro.emprendedorId);
      const matchesEstado = filtroEstado === "todos" || cobro.estadoPago === filtroEstado;
      const matchesSearch = matchesPersonaSearch(persona, busqueda, [
        cobro.cuota,
        cobro.seguro,
        cobro.totalEsperado,
        cobro.montoPagado,
        cobro.estadoPago,
        cobro.fechaPago,
        cobro.metodoPago,
        cobro.observacion,
      ]);

      return matchesEstado && matchesSearch;
    });
  }, [busqueda, cobrosPeriodo, filtroEstado, personasPorId]);

  const pagosCesFiltrados = useMemo(() => {
    return state.pagosCes.filter((pago) => {
      const persona = personasPorId.get(pago.emprendedorId);
      const matchesEstado = filtroEstado === "todos" || pago.estadoPago === filtroEstado;
      const matchesSearch = matchesPersonaSearch(persona, busqueda, [
        pago.creditoBase,
        pago.fechaVencimiento,
        pago.totalEsperado,
        pago.montoPagado,
        pago.estadoPago,
        pago.fechaPago,
        pago.metodoPago,
        pago.observacion,
      ]);

      return matchesEstado && matchesSearch;
    });
  }, [busqueda, filtroEstado, personasPorId, state.pagosCes]);

  const emprendedoresFiltrados = useMemo(
    () => state.emprendedores.filter((persona) => matchesPersonaSearch(persona, busqueda)),
    [busqueda, state.emprendedores],
  );

  const personaSeleccionada = personaActiva
    ? state.emprendedores.find((persona) => persona.id === personaActiva)
    : null;
  const personaVisible =
    personaSeleccionada && emprendedoresFiltrados.some((persona) => persona.id === personaSeleccionada.id)
      ? personaSeleccionada
      : emprendedoresFiltrados[0];

  const exportarJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tesoreria-semilla-emprende-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportarCsv = () => {
    const rows = [
      ["tipo", "periodo", "vencimiento", "nombre", "rut", "whatsapp", "credito", "cuota", "seguro", "total", "pagado", "estado", "fecha_pago", "metodo", "observacion"],
      ...state.cobros.map((cobro) => {
        const cobroPeriodo = state.periodos.find((item) => item.id === cobro.periodoId);
        const persona = personasPorId.get(cobro.emprendedorId);
        return [
          "cuota",
          cobroPeriodo?.numeroCuota ?? "",
          cobroPeriodo?.fechaVencimiento ?? "",
          persona?.nombre ?? "",
          persona?.rut ?? "",
          persona?.whatsapp ?? "",
          persona?.creditoOriginal ?? "",
          cobro.cuota,
          cobro.seguro,
          cobro.totalEsperado,
          cobro.montoPagado,
          cobro.estadoPago,
          cobro.fechaPago,
          cobro.metodoPago,
          cobro.observacion,
        ];
      }),
      ...state.pagosCes.map((pago) => {
        const persona = personasPorId.get(pago.emprendedorId);
        return [
          "ces",
          "CES",
          pago.fechaVencimiento,
          persona?.nombre ?? "",
          persona?.rut ?? "",
          persona?.whatsapp ?? "",
          pago.creditoBase,
          "",
          "",
          pago.totalEsperado,
          pago.montoPagado,
          pago.estadoPago,
          pago.fechaPago,
          pago.metodoPago,
          pago.observacion,
        ];
      }),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tesoreria-semilla-emprende-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const content = await file.text();
    importar(JSON.parse(content) as TesoreriaState);
    event.target.value = "";
  };

  return (
    <main className={`app-shell section-${tab}`}>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Fundacion Banigualdad</p>
          <h1>Tesoreria Semilla Emprende</h1>
          <p>{state.centro.nombreCentro} · {state.centro.zona}</p>
        </div>
        <div className="hero-actions">
          <select value={periodo?.id} onChange={(event) => setPeriodoId(event.target.value)} aria-label="Seleccionar periodo">
            {state.periodos.map((item) => (
              <option key={item.id} value={item.id}>
                Cuota {item.numeroCuota} · {formatDate(item.fechaVencimiento)}
              </option>
            ))}
          </select>
        </div>
      </section>

      {periodo && (
        <section className="period-strip">
          <div>
            <span>Lote</span>
            <strong>{periodo.numeroLote}</strong>
          </div>
          <div>
            <span>Vence</span>
            <strong>{formatDate(periodo.fechaVencimiento)}</strong>
          </div>
          <div>
            <span>Cuota</span>
            <strong>N° {periodo.numeroCuota}</strong>
          </div>
          <div>
            <span>Hoja</span>
            <strong>{periodo.numeroHoja}</strong>
          </div>
        </section>
      )}

      <section className="summary-grid">
        <SummaryCard icon={<CircleDollarSign />} label="Esperado" value={formatCurrency(totals.esperado)} />
        <SummaryCard icon={<CheckCircle2 />} label="Pagado" value={formatCurrency(totals.pagado)} tone="success" />
        <SummaryCard icon={<WalletCards />} label="Pendiente" value={formatCurrency(totals.saldo)} tone="warning" />
        <SummaryCard icon={<History />} label="Avance" value={`${Math.min(totals.avance, 100)}%`} tone="info" />
      </section>

      <div className="progress-track" aria-label={`Avance ${totals.avance}%`}>
        <div style={{ width: `${Math.min(totals.avance, 100)}%` }} />
      </div>

      {periodo && (
        <div className="reconcile-strip">
          <span>Total hoja: <strong>{formatCurrency(periodo.totalCentro)}</strong></span>
          <span>Suma cards: <strong>{formatCurrency(totals.esperado)}</strong></span>
          <span>Diferencia hoja: <strong>{formatCurrency(periodo.totalCentro - totals.esperado)}</strong></span>
          <span>CES total: <strong>{formatCurrency(cesTotals.esperado)}</strong></span>
        </div>
      )}

      <nav className="tabbar" aria-label="Secciones">
        <button className={tab === "cobros" ? "active" : ""} onClick={() => setTab("cobros")}>
          <WalletCards size={18} /> Cobros
        </button>
        <button className={tab === "ces" ? "active" : ""} onClick={() => setTab("ces")}>
          <Landmark size={18} /> CES
        </button>
        <button className={tab === "personas" ? "active" : ""} onClick={() => setTab("personas")}>
          <Users size={18} /> Personas
        </button>
        <button className={tab === "respaldo" ? "active" : ""} onClick={() => setTab("respaldo")}>
          <Download size={18} /> Respaldo
        </button>
        <button className={tab === "config" ? "active" : ""} onClick={() => setTab("config")}>
          <SlidersHorizontal size={18} /> Config
        </button>
      </nav>

      <SectionBanner tab={tab} periodo={periodo} totals={totals} cesTotals={cesTotals} />

      {tab === "cobros" && (
        <section className="workspace">
          <div className="toolbar">
            <SearchInput
              value={busqueda}
              onChange={setBusqueda}
              placeholder="Buscar nombre, RUT o WhatsApp"
            />
            <div className="chips" role="list" aria-label="Filtrar por estado">
              {estadoOptions.map((estado) => (
                <button
                  key={estado}
                  className={filtroEstado === estado ? "chip active" : "chip"}
                  onClick={() => setFiltroEstado(estado)}
                >
                  {estado === "todos" ? "Todos" : estadoLabels[estado]}
                </button>
              ))}
            </div>
          </div>

          <div className="status-counts">
            <span>{totals.pagados} pagados</span>
            <span>{totals.parciales} parciales</span>
            <span>{totals.pendientes} pendientes</span>
            <span>{totals.atrasados} atrasados</span>
          </div>

          <div className="cards-grid">
            {cobrosFiltrados.map((cobro) => {
              const persona = personasPorId.get(cobro.emprendedorId);
              if (!persona) return null;
              return (
                <CobroCard
                  key={cobro.id}
                  cobro={cobro}
                  persona={persona}
                  onPagar={() => marcarPagado(cobro.id)}
                  onEstado={(estado) => cambiarEstado(cobro.id, estado)}
                  onMonto={(monto) => registrarMonto(cobro.id, monto)}
                  onDetalle={(detail) => actualizarDetalle(cobro.id, detail)}
                  onEditarPersona={() => setPersonaEditando(persona)}
                  onPersona={() => {
                    setPersonaActiva(persona.id);
                    setTab("personas");
                  }}
                />
              );
            })}
          </div>
        </section>
      )}

      {tab === "ces" && (
        <section className="workspace">
          <section className="ces-header">
            <div>
              <p className="eyebrow">Pago CES</p>
              <h2>Montos estaticos por credito</h2>
              <span className="section-subtitle">Vencimiento: {formatDate(state.pagosCes[0]?.fechaVencimiento ?? "2026-06-08")}</span>
            </div>
            <div className="ces-rules">
              {Object.entries(state.configuracion.ces.montosPorCredito).map(([credito, monto]) => (
                <span key={credito}>{formatCurrency(Number(credito))}: {formatCurrency(monto)}</span>
              ))}
            </div>
          </section>

          <section className="summary-grid compact">
            <SummaryCard icon={<Landmark />} label="CES esperado" value={formatCurrency(cesTotals.esperado)} />
            <SummaryCard icon={<CheckCircle2 />} label="CES pagado" value={formatCurrency(cesTotals.pagado)} tone="success" />
            <SummaryCard icon={<WalletCards />} label="CES pendiente" value={formatCurrency(cesTotals.saldo)} tone="warning" />
            <SummaryCard icon={<History />} label="Avance CES" value={`${Math.min(cesTotals.avance, 100)}%`} tone="info" />
          </section>

          <div className="toolbar">
            <SearchInput
              value={busqueda}
              onChange={setBusqueda}
              placeholder="Buscar nombre, RUT o WhatsApp"
            />
            <div className="chips" role="list" aria-label="Filtrar por estado CES">
              {estadoOptions.map((estado) => (
                <button
                  key={estado}
                  className={filtroEstado === estado ? "chip active" : "chip"}
                  onClick={() => setFiltroEstado(estado)}
                >
                  {estado === "todos" ? "Todos" : estadoLabels[estado]}
                </button>
              ))}
            </div>
          </div>

          <div className="status-counts">
            <span>{cesTotals.pagados} pagados</span>
            <span>{cesTotals.parciales} parciales</span>
            <span>{cesTotals.pendientes} pendientes</span>
            <span>{cesTotals.atrasados} atrasados</span>
          </div>

          <div className="cards-grid">
            {pagosCesFiltrados.map((pago) => {
              const persona = personasPorId.get(pago.emprendedorId);
              if (!persona) return null;
              return (
                <CesCard
                  key={pago.id}
                  pago={pago}
                  persona={persona}
                  onPagar={() => marcarCesPagado(pago.id)}
                  onEstado={(estado) => cambiarEstadoCes(pago.id, estado)}
                  onMonto={(monto) => registrarMontoCes(pago.id, monto)}
                  onDetalle={(detail) => actualizarDetalleCes(pago.id, detail)}
                  onEditarPersona={() => setPersonaEditando(persona)}
                  onPersona={() => {
                    setPersonaActiva(persona.id);
                    setTab("personas");
                  }}
                />
              );
            })}
          </div>
        </section>
      )}

      {tab === "personas" && (
        <section className="workspace">
          <SearchInput
            className="people-search"
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar cualquier dato de la persona"
          />
          <div className="people-layout">
            <aside className="people-list">
              {emprendedoresFiltrados.map((persona) => (
                <button
                  key={persona.id}
                  className={personaVisible?.id === persona.id ? "person-row active" : "person-row"}
                  onClick={() => setPersonaActiva(persona.id)}
                >
                  <span>{persona.nombre}</span>
                  <small>{persona.rut}</small>
                </button>
              ))}
              {!emprendedoresFiltrados.length && <p className="empty-state">No hay personas para esta busqueda.</p>}
            </aside>
            <PersonaPanel
              persona={personaVisible}
              state={state}
              onEditarPersona={(persona) => setPersonaEditando(persona)}
            />
          </div>
        </section>
      )}

      {tab === "respaldo" && (
        <section className="workspace backup-panel">
          <div className="backup-card">
            <Download size={24} />
            <h2>Exportar informacion</h2>
            <p>Descarga un respaldo completo JSON o una planilla CSV para revisar en Excel o Google Sheets.</p>
            <div className="button-row">
              <button className="primary-button" onClick={exportarJson}>
                <Download size={18} /> JSON
              </button>
              <button className="secondary-button" onClick={exportarCsv}>
                <Download size={18} /> CSV
              </button>
            </div>
          </div>

          <div className="backup-card">
            <Upload size={24} />
            <h2>Importar respaldo</h2>
            <p>Restaura un JSON exportado por esta misma aplicacion.</p>
            <input ref={fileInputRef} className="hidden-input" type="file" accept="application/json" onChange={handleImport} />
            <button className="secondary-button" onClick={() => fileInputRef.current?.click()}>
              <Upload size={18} /> Elegir archivo
            </button>
          </div>

          <div className="backup-card caution">
            <RotateCcw size={24} />
            <h2>Reiniciar datos locales</h2>
            <p>Vuelve al periodo inicial cargado desde la captura. Esto limpia los cambios guardados en este navegador.</p>
            <button className="danger-button" onClick={resetear}>
              <RotateCcw size={18} /> Reiniciar
            </button>
          </div>
        </section>
      )}

      {tab === "config" && (
        <ConfigPanel
          state={state}
          periodo={periodo}
          onCentro={updateCentro}
          onPeriodo={updatePeriodo}
          onPersona={updateEmprendedor}
          onCes={updateConfiguracionCes}
          onRecalcularCes={recalcularPagosCes}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          personasFiltradas={emprendedoresFiltrados}
        />
      )}

      {personaEditando && (
        <PersonaEditModal
          persona={personaEditando}
          personas={state.emprendedores}
          cesRules={state.configuracion.ces.montosPorCredito}
          onClose={() => setPersonaEditando(null)}
          onSave={(patch) => {
            updateEmprendedor(personaEditando.id, patch);
            setPersonaEditando(null);
          }}
        />
      )}
    </main>
  );
}

function SummaryCard({ icon, label, value, tone = "default" }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <article className={`summary-card ${tone}`}>
      <span className="summary-icon">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function SectionBanner({
  tab,
  periodo,
  totals,
  cesTotals,
}: {
  tab: Tab;
  periodo?: Periodo;
  totals: ReturnType<typeof getPeriodoTotals>;
  cesTotals: ReturnType<typeof getPeriodoTotals>;
}) {
  const meta: Record<Tab, { title: string; detail: string; icon: React.ReactNode }> = {
    cobros: {
      title: "Cobros semanales",
      detail: periodo ? `Cuota ${periodo.numeroCuota} · vence ${formatDate(periodo.fechaVencimiento)} · pendiente ${formatCurrency(totals.saldo)}` : "Periodo semanal",
      icon: <WalletCards size={20} />,
    },
    ces: {
      title: "Pago CES",
      detail: `Monto estatico · pendiente ${formatCurrency(cesTotals.saldo)}`,
      icon: <Landmark size={20} />,
    },
    personas: {
      title: "Personas del grupo",
      detail: "Ficha, historial y contacto por WhatsApp",
      icon: <Users size={20} />,
    },
    respaldo: {
      title: "Respaldo",
      detail: "Exportar, importar y proteger registros",
      icon: <Download size={20} />,
    },
    config: {
      title: "Configuracion",
      detail: "Datos base, reglas CES y periodos",
      icon: <SlidersHorizontal size={20} />,
    },
  };

  return (
    <section className={`section-banner ${tab}`}>
      <span className="section-banner-icon">{meta[tab].icon}</span>
      <div>
        <p>{meta[tab].title}</p>
        <strong>{meta[tab].detail}</strong>
      </div>
    </section>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={`search-box ${className}`.trim()}>
      <Search size={18} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {value && (
        <button type="button" className="search-clear" onClick={() => onChange("")} aria-label="Limpiar busqueda">
          <X size={16} />
        </button>
      )}
    </label>
  );
}

function CobroCard({
  cobro,
  persona,
  onPagar,
  onEstado,
  onMonto,
  onDetalle,
  onEditarPersona,
  onPersona,
}: {
  cobro: CobroSemanal;
  persona: Emprendedor;
  onPagar: () => void;
  onEstado: (estado: EstadoPago) => void;
  onMonto: (monto: number) => void;
  onDetalle: (detail: { fechaPago?: string; metodoPago?: MetodoPago; observacion?: string }) => void;
  onEditarPersona: () => void;
  onPersona: () => void;
}) {
  const saldo = Math.max(cobro.totalEsperado - cobro.montoPagado, 0);

  return (
    <article className={`payment-card ${cobro.estadoPago}`}>
      <header>
        <button className="person-link" onClick={onPersona}>
          <strong>{persona.nombre}</strong>
          <span>{persona.rut}</span>
        </button>
        <div className="card-header-actions">
          <button className="icon-button" onClick={onEditarPersona} aria-label={`Editar ${persona.nombre}`}>
            <Pencil size={17} />
          </button>
          <span className={`badge ${cobro.estadoPago}`}>{estadoLabels[cobro.estadoPago]}</span>
        </div>
      </header>

      <div className="money-grid">
        <div>
          <span>Credito</span>
          <strong>{formatCurrency(persona.creditoOriginal)}</strong>
        </div>
        <div>
          <span>Cuota</span>
          <strong>{formatCurrency(cobro.cuota)}</strong>
        </div>
        <div>
          <span>Seguro</span>
          <strong>{formatCurrency(cobro.seguro)}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{formatCurrency(cobro.totalEsperado)}</strong>
        </div>
      </div>

      <label className="amount-input">
        <span>Monto recibido</span>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          value={cobro.montoPagado || ""}
          onChange={(event) => onMonto(Number(event.target.value || 0))}
          placeholder="0"
        />
      </label>

      <div className="card-actions">
        <button className="pay-button" onClick={onPagar}>
          <Check size={18} /> Pagado
        </button>
        <button onClick={() => onEstado("parcial")}>Parcial</button>
        <button onClick={() => onEstado("pendiente")}>Pendiente</button>
        <button onClick={() => onEstado("atrasado")}>
          <AlertTriangle size={17} /> Atraso
        </button>
      </div>

      <div className="detail-grid">
        <label>
          <span>Fecha</span>
          <input type="date" value={cobro.fechaPago} onChange={(event) => onDetalle({ fechaPago: event.target.value })} />
        </label>
        <label>
          <span>Pago</span>
          <select value={cobro.metodoPago} onChange={(event) => onDetalle({ metodoPago: event.target.value as MetodoPago })}>
            {metodoOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="note-input">
        <span>Observacion</span>
        <textarea value={cobro.observacion} onChange={(event) => onDetalle({ observacion: event.target.value })} rows={2} />
      </label>

      <footer>
        <span>Saldo: {formatCurrency(saldo)}</span>
        {persona.notas && <span className="review-note">Revisar nombre</span>}
      </footer>
    </article>
  );
}

function PersonaPanel({
  persona,
  state,
  onEditarPersona,
}: {
  persona?: Emprendedor;
  state: TesoreriaState;
  onEditarPersona: (persona: Emprendedor) => void;
}) {
  if (!persona) {
    return (
      <article className="person-panel empty">
        <Users size={28} />
        <p>Selecciona una persona para ver su historial.</p>
      </article>
    );
  }

  const historial = state.cobros
    .filter((cobro) => cobro.emprendedorId === persona.id)
    .map((cobro) => ({
      cobro,
      periodo: state.periodos.find((periodo) => periodo.id === cobro.periodoId),
    }));
  const totals = getPeriodoTotals(historial.map(({ cobro }) => cobro));
  const contactoCobro =
    historial.find(({ cobro }) => cobro.estadoPago === "atrasado") ??
    historial.find(({ cobro }) => cobro.estadoPago === "pendiente" || cobro.estadoPago === "parcial") ??
    historial[0];
  const whatsappMessages = contactoCobro
    ? buildWhatsappMessages(persona, contactoCobro.cobro, contactoCobro.periodo)
    : buildWhatsappMessages(persona);
  const hasWhatsapp = Boolean(normalizeWhatsapp(persona.whatsapp));

  return (
    <article className="person-panel">
      <header>
        <div>
          <p className="eyebrow">Ficha persona</p>
          <h2>{persona.nombre}</h2>
          <span>{persona.rut}</span>
        </div>
        <div className="person-panel-actions">
          <strong>{formatCurrency(persona.creditoOriginal)}</strong>
          <button className="icon-button" onClick={() => onEditarPersona(persona)} aria-label={`Editar ${persona.nombre}`}>
            <Pencil size={17} />
          </button>
        </div>
      </header>

      {persona.notas && <p className="inline-alert">{persona.notas}</p>}

      <section className="contact-panel">
        <header>
          <div>
            <p className="eyebrow">Contacto</p>
            <h3>WhatsApp</h3>
            <span>{persona.whatsapp ? formatWhatsapp(persona.whatsapp) : "Sin numero registrado"}</span>
          </div>
          <Phone size={20} />
        </header>
        {hasWhatsapp ? (
          <div className="whatsapp-actions">
            <a href={buildWhatsappUrl(persona.whatsapp ?? "", whatsappMessages.proximo)} target="_blank" rel="noreferrer">
              <MessageCircle size={17} /> Pago pronto
            </a>
            <a href={buildWhatsappUrl(persona.whatsapp ?? "", whatsappMessages.atrasado)} target="_blank" rel="noreferrer">
              <AlertTriangle size={17} /> Atraso
            </a>
            <a href={buildWhatsappUrl(persona.whatsapp ?? "", whatsappMessages.ultimoDia)} target="_blank" rel="noreferrer">
              <Send size={17} /> Ultimo dia
            </a>
          </div>
        ) : (
          <p className="contact-empty">Agrega el numero desde el lapiz de cualquier tarjeta o desde Config.</p>
        )}
      </section>

      <div className="person-stats">
        <div>
          <span>Total esperado</span>
          <strong>{formatCurrency(totals.esperado)}</strong>
        </div>
        <div>
          <span>Pagado</span>
          <strong>{formatCurrency(totals.pagado)}</strong>
        </div>
        <div>
          <span>Saldo</span>
          <strong>{formatCurrency(totals.saldo)}</strong>
        </div>
      </div>

      <div className="history-list">
        {historial.map(({ cobro, periodo }) => (
          <div key={cobro.id} className="history-row">
            <div>
              <strong>Cuota {periodo?.numeroCuota}</strong>
              <span><CalendarDays size={15} /> {periodo ? formatDate(periodo.fechaVencimiento) : "Sin periodo"}</span>
            </div>
            <div>
              <span className={`badge ${cobro.estadoPago}`}>{estadoLabels[cobro.estadoPago]}</span>
              <strong>{formatCurrency(cobro.montoPagado)} / {formatCurrency(cobro.totalEsperado)}</strong>
            </div>
          </div>
        ))}
      </div>

      {state.pagosCes.some((pago) => pago.emprendedorId === persona.id) && (
        <div className="history-list ces-history">
          {state.pagosCes
            .filter((pago) => pago.emprendedorId === persona.id)
            .map((pago) => (
              <div key={pago.id} className="history-row">
                <div>
                  <strong>Pago CES</strong>
                  <span><Landmark size={15} /> Vence {formatDate(pago.fechaVencimiento)}</span>
                </div>
                <div>
                  <span className={`badge ${pago.estadoPago}`}>{estadoLabels[pago.estadoPago]}</span>
                  <strong>{formatCurrency(pago.montoPagado)} / {formatCurrency(pago.totalEsperado)}</strong>
                </div>
              </div>
            ))}
        </div>
      )}

      <div className="source-box">
        <FileImage size={18} />
        <span>Primera carga basada en la captura de la cuota 10. Las siguientes hojas se pueden sumar en la misma estructura.</span>
      </div>
    </article>
  );
}

function CesCard({
  pago,
  persona,
  onPagar,
  onEstado,
  onMonto,
  onDetalle,
  onEditarPersona,
  onPersona,
}: {
  pago: PagoCes;
  persona: Emprendedor;
  onPagar: () => void;
  onEstado: (estado: EstadoPago) => void;
  onMonto: (monto: number) => void;
  onDetalle: (detail: { fechaPago?: string; metodoPago?: MetodoPago; observacion?: string }) => void;
  onEditarPersona: () => void;
  onPersona: () => void;
}) {
  const saldo = Math.max(pago.totalEsperado - pago.montoPagado, 0);

  return (
    <article className={`payment-card ces-card ${pago.estadoPago}`}>
      <header>
        <button className="person-link" onClick={onPersona}>
          <strong>{persona.nombre}</strong>
          <span>{persona.rut}</span>
        </button>
        <div className="card-header-actions">
          <button className="icon-button" onClick={onEditarPersona} aria-label={`Editar ${persona.nombre}`}>
            <Pencil size={17} />
          </button>
          <span className={`badge ${pago.estadoPago}`}>{estadoLabels[pago.estadoPago]}</span>
        </div>
      </header>

      <div className="money-grid">
        <div>
          <span>Credito base</span>
          <strong>{formatCurrency(pago.creditoBase)}</strong>
        </div>
        <div>
          <span>Pago CES</span>
          <strong>{formatCurrency(pago.totalEsperado)}</strong>
        </div>
        <div>
          <span>Vencimiento</span>
          <strong>{formatDate(pago.fechaVencimiento)}</strong>
        </div>
      </div>

      <label className="amount-input">
        <span>Monto recibido CES</span>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          value={pago.montoPagado || ""}
          onChange={(event) => onMonto(Number(event.target.value || 0))}
          placeholder="0"
        />
      </label>

      <div className="card-actions">
        <button className="pay-button" onClick={onPagar}>
          <Check size={18} /> Pagado
        </button>
        <button onClick={() => onEstado("parcial")}>Parcial</button>
        <button onClick={() => onEstado("pendiente")}>Pendiente</button>
        <button onClick={() => onEstado("atrasado")}>
          <AlertTriangle size={17} /> Atraso
        </button>
      </div>

      <div className="detail-grid">
        <label>
          <span>Fecha</span>
          <input type="date" value={pago.fechaPago} onChange={(event) => onDetalle({ fechaPago: event.target.value })} />
        </label>
        <label>
          <span>Pago</span>
          <select value={pago.metodoPago} onChange={(event) => onDetalle({ metodoPago: event.target.value as MetodoPago })}>
            {metodoOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="note-input">
        <span>Observacion</span>
        <textarea value={pago.observacion} onChange={(event) => onDetalle({ observacion: event.target.value })} rows={2} />
      </label>

      <footer>
        <span>Saldo CES: {formatCurrency(saldo)}</span>
      </footer>
    </article>
  );
}

function ConfigPanel({
  state,
  periodo,
  onCentro,
  onPeriodo,
  onPersona,
  onCes,
  onRecalcularCes,
  busqueda,
  onBusqueda,
  personasFiltradas,
}: {
  state: TesoreriaState;
  periodo?: Periodo;
  onCentro: (patch: Partial<Centro>) => void;
  onPeriodo: (id: string, patch: Partial<Periodo>) => void;
  onPersona: (id: string, patch: Partial<Emprendedor>) => void;
  onCes: (patch: Partial<ConfiguracionCes>) => void;
  onRecalcularCes: () => void;
  busqueda: string;
  onBusqueda: (value: string) => void;
  personasFiltradas: Emprendedor[];
}) {
  const cesRules = state.configuracion.ces.montosPorCredito;

  return (
    <section className="workspace config-panel">
      <section className="config-section">
        <header>
          <div>
            <p className="eyebrow">Configuracion</p>
            <h2>Datos del centro</h2>
          </div>
        </header>
        <div className="settings-grid">
          <ConfigInput label="ID centro" value={state.centro.idCentro} onChange={(value) => onCentro({ idCentro: value })} />
          <ConfigInput label="Nombre centro" value={state.centro.nombreCentro} onChange={(value) => onCentro({ nombreCentro: value })} />
          <ConfigInput label="Zona" value={state.centro.zona} onChange={(value) => onCentro({ zona: value })} />
          <ConfigInput label="Asesor" value={state.centro.asesor} onChange={(value) => onCentro({ asesor: value })} />
        </div>
      </section>

      <section className="config-section">
        <header>
          <div>
            <p className="eyebrow">CES</p>
            <h2>Reglas de cobro</h2>
          </div>
          <button className="primary-button" onClick={onRecalcularCes}>
            <RotateCcw size={18} /> Recalcular CES
          </button>
        </header>
        <div className="settings-grid">
          <ConfigInput
            label="Vencimiento CES"
            type="date"
            value={state.configuracion.ces.fechaVencimiento}
            onChange={(value) => onCes({ fechaVencimiento: value })}
          />
          {Object.entries(cesRules).map(([credito, monto]) => (
            <ConfigInput
              key={credito}
              label={`CES credito ${formatCurrency(Number(credito))}`}
              type="number"
              value={String(monto)}
              onChange={(value) =>
                onCes({
                  montosPorCredito: {
                    [credito]: Number(value || 0),
                  },
                })
              }
            />
          ))}
        </div>
        <p className="config-note">Al cambiar montos o creditos, usa recalcular para actualizar los totales CES manteniendo los pagos ya registrados.</p>
      </section>

      {periodo && (
        <section className="config-section">
          <header>
            <div>
              <p className="eyebrow">Periodo seleccionado</p>
              <h2>Cuota {periodo.numeroCuota}</h2>
            </div>
          </header>
          <div className="settings-grid">
            <ConfigInput label="Numero hoja" type="number" value={String(periodo.numeroHoja)} onChange={(value) => onPeriodo(periodo.id, { numeroHoja: Number(value || 0) })} />
            <ConfigInput label="Numero lote" value={periodo.numeroLote} onChange={(value) => onPeriodo(periodo.id, { numeroLote: value })} />
            <ConfigInput label="Ciclo" type="number" value={String(periodo.ciclo)} onChange={(value) => onPeriodo(periodo.id, { ciclo: Number(value || 0) })} />
            <ConfigInput label="Numero cuota" type="number" value={String(periodo.numeroCuota)} onChange={(value) => onPeriodo(periodo.id, { numeroCuota: Number(value || 0) })} />
            <ConfigInput label="Fecha firma" type="date" value={periodo.fechaFirma} onChange={(value) => onPeriodo(periodo.id, { fechaFirma: value })} />
            <ConfigInput label="Vencimiento cuota" type="date" value={periodo.fechaVencimiento} onChange={(value) => onPeriodo(periodo.id, { fechaVencimiento: value })} />
            <ConfigInput label="Cantidad emprendedores" type="number" value={String(periodo.cantidadEmprendedores)} onChange={(value) => onPeriodo(periodo.id, { cantidadEmprendedores: Number(value || 0) })} />
            <ConfigInput label="Total credito" type="number" value={String(periodo.totalCredito)} onChange={(value) => onPeriodo(periodo.id, { totalCredito: Number(value || 0) })} />
            <ConfigInput label="Total cuotas" type="number" value={String(periodo.totalCuotas)} onChange={(value) => onPeriodo(periodo.id, { totalCuotas: Number(value || 0) })} />
            <ConfigInput label="Total seguro" type="number" value={String(periodo.totalSeguro)} onChange={(value) => onPeriodo(periodo.id, { totalSeguro: Number(value || 0) })} />
            <ConfigInput label="Total centro" type="number" value={String(periodo.totalCentro)} onChange={(value) => onPeriodo(periodo.id, { totalCentro: Number(value || 0) })} />
            <label className="config-field">
              <span>Estado carga</span>
              <select value={periodo.estadoCarga} onChange={(event) => onPeriodo(periodo.id, { estadoCarga: event.target.value as Periodo["estadoCarga"] })}>
                <option value="completo">Completo</option>
                <option value="revisar">Revisar</option>
                <option value="pendiente">Pendiente</option>
              </select>
            </label>
            <ConfigInput label="Imagen origen" value={periodo.imagenOrigen} onChange={(value) => onPeriodo(periodo.id, { imagenOrigen: value })} />
          </div>
        </section>
      )}

      <section className="config-section">
        <header>
          <div>
            <p className="eyebrow">Personas</p>
            <h2>Datos base y creditos</h2>
          </div>
        </header>
        <SearchInput
          className="people-search"
          value={busqueda}
          onChange={onBusqueda}
          placeholder="Buscar nombre, RUT, WhatsApp, credito o nota"
        />
        <div className="people-config-list">
          {personasFiltradas.map((persona) => (
            <article className="person-config-card" key={persona.id}>
              <ConfigInput label="Nombre" value={persona.nombre} onChange={(value) => onPersona(persona.id, { nombre: value })} />
              <ConfigInput label="RUT" value={persona.rut} onChange={(value) => onPersona(persona.id, { rut: value })} />
              <ConfigInput label="WhatsApp" value={persona.whatsapp ?? ""} onChange={(value) => onPersona(persona.id, { whatsapp: value })} />
              <ConfigInput label="Credito original" type="number" value={String(persona.creditoOriginal)} onChange={(value) => onPersona(persona.id, { creditoOriginal: Number(value || 0) })} />
              <ConfigInput label="Anillo" type="number" value={String(persona.anillo)} onChange={(value) => onPersona(persona.id, { anillo: Number(value || 0) })} />
              <ConfigInput label="Notas" value={persona.notas ?? ""} onChange={(value) => onPersona(persona.id, { notas: value })} />
            </article>
          ))}
          {!personasFiltradas.length && <p className="empty-state">No hay personas para esta busqueda.</p>}
        </div>
      </section>
    </section>
  );
}

function PersonaEditModal({
  persona,
  personas,
  cesRules,
  onClose,
  onSave,
}: {
  persona: Emprendedor;
  personas: Emprendedor[];
  cesRules: Record<string, number>;
  onClose: () => void;
  onSave: (patch: PersonaForm) => void;
}) {
  const [form, setForm] = useState<PersonaForm>({
    nombre: persona.nombre,
    rut: persona.rut,
    whatsapp: persona.whatsapp ?? "",
    creditoOriginal: persona.creditoOriginal,
    anillo: persona.anillo,
    notas: persona.notas ?? "",
  });
  const [touched, setTouched] = useState(false);
  const errors = validatePersonaForm(form, personas, persona.id);
  const hasErrors = Object.keys(errors).length > 0;
  const cesMonto = cesRules[String(form.creditoOriginal)] ?? 0;

  const updateForm = <K extends keyof PersonaForm>(key: K, value: PersonaForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    setTouched(true);
    if (hasErrors) return;

    onSave({
      ...form,
      nombre: form.nombre.trim(),
      rut: formatRut(form.rut),
      whatsapp: formatWhatsapp(form.whatsapp),
      notas: form.notas?.trim() || undefined,
    });
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-person-title">
        <header>
          <div>
            <p className="eyebrow">Editar persona</p>
            <h2 id="edit-person-title">{persona.nombre}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar editor">
            <X size={20} />
          </button>
        </header>

        <div className="modal-grid">
          <ModalField label="Nombre" error={touched ? errors.nombre : undefined}>
            <input
              value={form.nombre}
              onChange={(event) => updateForm("nombre", event.target.value)}
              onBlur={() => setTouched(true)}
            />
          </ModalField>

          <ModalField label="RUT" error={touched ? errors.rut : undefined} hint="Formato aceptado: 12.345.678-9 o 12345678-9">
            <input
              value={form.rut}
              onChange={(event) => updateForm("rut", event.target.value.toUpperCase())}
              onBlur={() => {
                updateForm("rut", formatRut(form.rut));
                setTouched(true);
              }}
              inputMode="text"
            />
          </ModalField>

          <ModalField label="WhatsApp" error={touched ? errors.whatsapp : undefined} hint="Opcional. Ejemplo: +56 9 1234 5678">
            <input
              value={form.whatsapp ?? ""}
              onChange={(event) => updateForm("whatsapp", event.target.value)}
              onBlur={() => {
                updateForm("whatsapp", formatWhatsapp(form.whatsapp));
                setTouched(true);
              }}
              inputMode="tel"
              placeholder="+56 9 1234 5678"
            />
          </ModalField>

          <ModalField label="Credito original" error={touched ? errors.creditoOriginal : undefined}>
            <input
              type="number"
              min="1"
              inputMode="numeric"
              value={form.creditoOriginal || ""}
              onChange={(event) => updateForm("creditoOriginal", Number(event.target.value || 0))}
              onBlur={() => setTouched(true)}
            />
          </ModalField>

          <ModalField label="Anillo" error={touched ? errors.anillo : undefined}>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={form.anillo}
              onChange={(event) => updateForm("anillo", Number(event.target.value || 0))}
              onBlur={() => setTouched(true)}
            />
          </ModalField>

          <ModalField label="Notas" error={touched ? errors.notas : undefined}>
            <textarea
              value={form.notas ?? ""}
              onChange={(event) => updateForm("notas", event.target.value)}
              onBlur={() => setTouched(true)}
              rows={3}
            />
          </ModalField>
        </div>

        <div className={cesMonto > 0 ? "modal-info" : "modal-info warning"}>
          <Landmark size={18} />
          <span>
            CES segun credito: {cesMonto > 0 ? formatCurrency(cesMonto) : "sin regla configurada para este credito"}
          </span>
        </div>

        {touched && hasErrors && (
          <div className="modal-error" role="alert">
            Revisa los campos marcados antes de guardar.
          </div>
        )}

        <footer>
          <button className="secondary-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" onClick={handleSave}>
            <Check size={18} /> Guardar
          </button>
        </footer>
      </section>
    </div>
  );
}

function ModalField({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={error ? "modal-field invalid" : "modal-field"}>
      <span>{label}</span>
      {children}
      {hint && !error && <small>{hint}</small>}
      {error && <small>{error}</small>}
    </label>
  );
}

function ConfigInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "date";
}) {
  return (
    <label className="config-field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export default App;
