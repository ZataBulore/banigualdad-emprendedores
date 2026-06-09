import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileImage,
  History,
  RotateCcw,
  Search,
  Upload,
  WalletCards,
} from "lucide-react";
import { ChangeEvent, useMemo, useRef, useState } from "react";
import { useTesoreria } from "./hooks/useTesoreria";
import type { CobroSemanal, Emprendedor, EstadoPago, MetodoPago, TesoreriaState } from "./types/tesoreria";
import { formatCurrency, formatDate } from "./utils/currency";
import { getPeriodoTotals } from "./utils/totals";

type Tab = "cobros" | "personas" | "respaldo";
type FiltroEstado = "todos" | EstadoPago;

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

function App() {
  const {
    state,
    personasPorId,
    marcarPagado,
    cambiarEstado,
    registrarMonto,
    actualizarDetalle,
    importar,
    resetear,
  } = useTesoreria();
  const [tab, setTab] = useState<Tab>("cobros");
  const [periodoId, setPeriodoId] = useState(state.periodos[0]?.id ?? "");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [personaActiva, setPersonaActiva] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const periodo = state.periodos.find((item) => item.id === periodoId) ?? state.periodos[0];
  const cobrosPeriodo = state.cobros.filter((cobro) => cobro.periodoId === periodo?.id);
  const totals = getPeriodoTotals(cobrosPeriodo);

  const cobrosFiltrados = useMemo(() => {
    const normalizedSearch = busqueda.trim().toLowerCase();

    return cobrosPeriodo.filter((cobro) => {
      const persona = personasPorId.get(cobro.emprendedorId);
      const matchesEstado = filtroEstado === "todos" || cobro.estadoPago === filtroEstado;
      const matchesSearch =
        !normalizedSearch ||
        persona?.nombre.toLowerCase().includes(normalizedSearch) ||
        persona?.rut.toLowerCase().includes(normalizedSearch);

      return matchesEstado && matchesSearch;
    });
  }, [busqueda, cobrosPeriodo, filtroEstado, personasPorId]);

  const personaSeleccionada = personaActiva
    ? state.emprendedores.find((persona) => persona.id === personaActiva)
    : null;

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
      ["periodo", "vencimiento", "nombre", "rut", "cuota", "seguro", "total", "pagado", "estado", "fecha_pago", "metodo", "observacion"],
      ...state.cobros.map((cobro) => {
        const cobroPeriodo = state.periodos.find((item) => item.id === cobro.periodoId);
        const persona = personasPorId.get(cobro.emprendedorId);
        return [
          cobroPeriodo?.numeroCuota ?? "",
          cobroPeriodo?.fechaVencimiento ?? "",
          persona?.nombre ?? "",
          persona?.rut ?? "",
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
    <main className="app-shell">
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
          <span>Diferencia: <strong>{formatCurrency(periodo.totalCentro - totals.esperado)}</strong></span>
        </div>
      )}

      <nav className="tabbar" aria-label="Secciones">
        <button className={tab === "cobros" ? "active" : ""} onClick={() => setTab("cobros")}>
          <WalletCards size={18} /> Cobros
        </button>
        <button className={tab === "personas" ? "active" : ""} onClick={() => setTab("personas")}>
          <History size={18} /> Personas
        </button>
        <button className={tab === "respaldo" ? "active" : ""} onClick={() => setTab("respaldo")}>
          <Download size={18} /> Respaldo
        </button>
      </nav>

      {tab === "cobros" && (
        <section className="workspace">
          <div className="toolbar">
            <label className="search-box">
              <Search size={18} />
              <input
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Buscar nombre o RUT"
              />
            </label>
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
        <section className="workspace people-layout">
          <aside className="people-list">
            {state.emprendedores.map((persona) => (
              <button
                key={persona.id}
                className={personaActiva === persona.id ? "person-row active" : "person-row"}
                onClick={() => setPersonaActiva(persona.id)}
              >
                <span>{persona.nombre}</span>
                <small>{persona.rut}</small>
              </button>
            ))}
          </aside>
          <PersonaPanel persona={personaSeleccionada ?? state.emprendedores[0]} state={state} />
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

function CobroCard({
  cobro,
  persona,
  onPagar,
  onEstado,
  onMonto,
  onDetalle,
  onPersona,
}: {
  cobro: CobroSemanal;
  persona: Emprendedor;
  onPagar: () => void;
  onEstado: (estado: EstadoPago) => void;
  onMonto: (monto: number) => void;
  onDetalle: (detail: { fechaPago?: string; metodoPago?: MetodoPago; observacion?: string }) => void;
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
        <span className={`badge ${cobro.estadoPago}`}>{estadoLabels[cobro.estadoPago]}</span>
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

function PersonaPanel({ persona, state }: { persona?: Emprendedor; state: TesoreriaState }) {
  if (!persona) {
    return (
      <article className="person-panel empty">
        <History size={28} />
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

  return (
    <article className="person-panel">
      <header>
        <div>
          <p className="eyebrow">Ficha persona</p>
          <h2>{persona.nombre}</h2>
          <span>{persona.rut}</span>
        </div>
        <strong>{formatCurrency(persona.creditoOriginal)}</strong>
      </header>

      {persona.notas && <p className="inline-alert">{persona.notas}</p>}

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

      <div className="source-box">
        <FileImage size={18} />
        <span>Primera carga basada en la captura de la cuota 10. Las siguientes hojas se pueden sumar en la misma estructura.</span>
      </div>
    </article>
  );
}

export default App;
