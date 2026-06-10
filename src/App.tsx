import {
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Cloud,
  CloudOff,
  Download,
  FileImage,
  History,
  Landmark,
  LogOut,
  LockKeyhole,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sprout,
  Trash2,
  Upload,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTesoreria } from "./hooks/useTesoreria";
import { isFirebaseConfigured, signInFirebaseWithGoogleCredential, signOutFirebase } from "./services/firebase";
import type { Centro, CobroSemanal, ConfiguracionCes, ConfiguracionSeguridad, Emprendedor, EstadoAsistencia, EstadoPago, EstadoPersona, MetodoPago, MovimientoHistorial, PagoCes, Periodo, Reunion, TesoreriaState } from "./types/tesoreria";
import { formatCurrency, formatDate } from "./utils/currency";
import { getPeriodoTotals } from "./utils/totals";

type Tab = "cobros" | "ces" | "personas" | "asistencias" | "config";
type ConfigTab = "general" | "seguridad" | "historial" | "respaldo";
type FiltroEstado = "todos" | EstadoPago;
type PersonaForm = Pick<Emprendedor, "nombre" | "rut" | "whatsapp" | "whatsappSecundario" | "nombreContactoSecundario" | "estado" | "fechaBaja" | "motivoBaja" | "observacionBaja" | "creditoOriginal" | "anillo" | "notas">;
type CobroEditForm = Pick<CobroSemanal, "cuota" | "seguro" | "montoPagado" | "estadoPago" | "fechaPago" | "metodoPago" | "referenciaPago" | "observacion">;
type AuthUser = { email: string; nombre: string; foto?: string; authSource?: "google"; sessionVersion?: number };
type GoogleCredentialResponse = { credential?: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, string | number | boolean>) => void;
        };
      };
    };
  }
}

const DEFAULT_GOOGLE_CLIENT_ID = "229981580153-uat1blhskmtti5sc6sadbqsubl274p1p.apps.googleusercontent.com";
const GOOGLE_CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim() || DEFAULT_GOOGLE_CLIENT_ID;
const ENV_AUTHORIZED_EMAILS = String(import.meta.env.VITE_AUTHORIZED_EMAILS ?? "")
  .split(/[,\n;]/)
  .map((email: string) => email.trim().toLowerCase())
  .filter(Boolean);
const DEFAULT_EMAIL_ADMIN_PASSWORD_HASH = "589c28b7d0ad18ffd68f975471d24dd60d78b0a4850524e7540f45f309713b50";
const EMAIL_ADMIN_PASSWORD_HASH =
  String(import.meta.env.VITE_EMAIL_ADMIN_PASSWORD_HASH ?? "").trim().toLowerCase() ||
  DEFAULT_EMAIL_ADMIN_PASSWORD_HASH;
const AUTH_SESSION_KEY = "semilla-emprende-google-user-v2";
const AUTH_SESSION_VERSION = 2;
const APP_VERSION = "1.0.0";

const estadoLabels: Record<EstadoPago, string> = {
  pendiente: "Pendiente",
  pagado: "Pagado",
  parcial: "Parcial",
  atrasado: "Atrasado",
  revisar: "Revisar",
};

const estadoOptions: FiltroEstado[] = ["todos", "pendiente", "pagado", "parcial", "atrasado", "revisar"];

const asistenciaLabels: Record<EstadoAsistencia, string> = {
  pendiente: "Pendiente",
  presente: "Presente",
  ausente: "Ausente",
  justificado: "Justificado",
};

const asistenciaOptions: EstadoAsistencia[] = ["presente", "ausente", "justificado", "pendiente"];

const cloudStatusLabels = {
  local: "Modo local",
  connecting: "Conectando nube",
  synced: "Firebase activo",
  saving: "Guardando nube",
  error: "Error nube",
} as const;

const personaEstadoLabels: Record<EstadoPersona, string> = {
  activa: "Activa",
  de_baja: "De baja",
};

const ANILLO_PERSONA_LABEL = "Anillo";

const confirmarAccionCritica = (mensaje: string) => window.confirm(mensaje);

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

const normalizeEmailList = (emails: string[]) =>
  Array.from(
    new Set(
      emails
        .flatMap((email) => email.split(/[,\n;]/))
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

const parseEmailList = (value: string) => normalizeEmailList(value.split(/[,\n;]/));

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const sha256Hex = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const verifyEmailAdminPassword = async (password: string) => {
  if (!EMAIL_ADMIN_PASSWORD_HASH) return false;
  return (await sha256Hex(password)) === EMAIL_ADMIN_PASSWORD_HASH;
};

const decodeGoogleCredential = (credential: string): AuthUser => {
  const [, payload] = credential.split(".");
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    Array.from(atob(normalized))
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join(""),
  );
  const data = JSON.parse(json) as { email?: string; name?: string; picture?: string };

  return {
    email: (data.email ?? "").toLowerCase(),
    nombre: data.name ?? data.email ?? "Cuenta Google",
    foto: data.picture,
  };
};

const loadAuthSession = () => {
  try {
    const stored = window.localStorage.getItem(AUTH_SESSION_KEY) ?? window.sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!stored) return null;
    const user = JSON.parse(stored) as AuthUser;
    if (user.authSource !== "google" || user.sessionVersion !== AUTH_SESSION_VERSION || !user.email) {
      return null;
    }
    window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(user));
    window.sessionStorage.removeItem(AUTH_SESSION_KEY);
    return user;
  } catch {
    return null;
  }
};

const formatDateTime = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("es-CL", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "";

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
    persona.whatsappSecundario,
    persona.nombreContactoSecundario,
    personaEstadoLabels[persona.estado],
    persona.fechaBaja,
    persona.motivoBaja,
    persona.observacionBaja,
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

const getSemanaCobroInicial = (periodos: Periodo[]) => {
  const ordenados = [...periodos].sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
  const today = new Date().toISOString().slice(0, 10);
  return ordenados.find((periodo) => periodo.fechaVencimiento >= today)?.id ?? ordenados[ordenados.length - 1]?.id ?? "";
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

const getSecondaryContactName = (persona: Emprendedor) => (persona.nombreContactoSecundario ?? "").trim();

const buildSecondaryAttendanceNote = (persona: Emprendedor) => {
  const nombreContacto = getSecondaryContactName(persona);
  if (!nombreContacto) return "";
  return `Justifica asistencia: asiste ${nombreContacto} en representacion de ${persona.nombre}.`;
};

const getWhatsappContacts = (persona: Emprendedor) =>
  [
    { key: "principal", label: "Principal", value: persona.whatsapp ?? "" },
    { key: "secundario", label: "Secundario", value: persona.whatsappSecundario ?? "" },
  ].filter((contacto) => Boolean(normalizeWhatsapp(contacto.value)));

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

  if (!Number.isFinite(form.anillo) || form.anillo < 0) {
    errors.anillo = "El anillo debe ser igual o mayor a cero.";
  }

  if ((form.notas ?? "").length > 200) {
    errors.notas = "La nota no puede superar 200 caracteres.";
  }

  if ((form.nombreContactoSecundario ?? "").length > 80) {
    errors.nombreContactoSecundario = "El nombre del contacto secundario no puede superar 80 caracteres.";
  }

  if (form.estado === "de_baja") {
    if (!form.fechaBaja) {
      errors.fechaBaja = "Ingresa la fecha de baja.";
    }

    if (!(form.motivoBaja ?? "").trim()) {
      errors.motivoBaja = "Ingresa el motivo de la baja.";
    }
  }

  if ((form.motivoBaja ?? "").length > 120) {
    errors.motivoBaja = "El motivo no puede superar 120 caracteres.";
  }

  if ((form.observacionBaja ?? "").length > 220) {
    errors.observacionBaja = "La observacion no puede superar 220 caracteres.";
  }

  if (!isValidWhatsapp(form.whatsapp)) {
    errors.whatsapp = "Ingresa un WhatsApp principal chileno valido, por ejemplo +56 9 1234 5678.";
  }

  if (!isValidWhatsapp(form.whatsappSecundario)) {
    errors.whatsappSecundario = "Ingresa un WhatsApp secundario chileno valido, por ejemplo +56 9 1234 5678.";
  }

  return errors;
};

function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => loadAuthSession());
  const [authError, setAuthError] = useState("");
  const {
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
    registrarMovimiento,
    importar,
    resetear,
  } = useTesoreria({ syncEnabled: Boolean(authUser), updatedBy: authUser?.email });
  const [tab, setTab] = useState<Tab>("cobros");
  const [periodoId, setPeriodoId] = useState(() => getSemanaCobroInicial(state.periodos));
  const [reunionId, setReunionId] = useState(state.reuniones[0]?.id ?? "");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [personaActiva, setPersonaActiva] = useState<string | null>(null);
  const [personaEditando, setPersonaEditando] = useState<Emprendedor | null>(null);
  const [cobroEditandoId, setCobroEditandoId] = useState<string | null>(null);
  const [pagoMultipleAbierto, setPagoMultipleAbierto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const correosAutorizados = useMemo(
    () => normalizeEmailList([
      ...state.configuracion.seguridad.correosAutorizados,
      ...ENV_AUTHORIZED_EMAILS,
    ]),
    [state.configuracion.seguridad.correosAutorizados],
  );

  const handleGoogleLogin = async (user: AuthUser, credential: string) => {
    const email = user.email.toLowerCase();
    const isAllowed = !correosAutorizados.length || correosAutorizados.includes(email);

    if (!isAllowed) {
      window.sessionStorage.removeItem(AUTH_SESSION_KEY);
      window.localStorage.removeItem(AUTH_SESSION_KEY);
      setAuthUser(null);
      setAuthError(`La cuenta ${email} no esta autorizada para ver este sistema.`);
      return;
    }

    if (isFirebaseConfigured) {
      try {
        await signInFirebaseWithGoogleCredential(credential);
      } catch (error) {
        console.warn("Firebase Auth no pudo enlazar la sesion de Google.", error);
      }
    }

    const sessionUser: AuthUser = { ...user, authSource: "google", sessionVersion: AUTH_SESSION_VERSION };
    window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(sessionUser));
    window.sessionStorage.removeItem(AUTH_SESSION_KEY);
    setAuthUser(sessionUser);
    setAuthError("");
  };

  const handleLogout = () => {
    const confirmed = confirmarAccionCritica("Cerrar sesion? Tendras que volver a ingresar con tu cuenta de Google.");
    if (!confirmed) return;
    window.sessionStorage.removeItem(AUTH_SESSION_KEY);
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    void signOutFirebase();
    setAuthUser(null);
  };

  const scrollToTop = () => {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  };

  const goToTab = (nextTab: Tab) => {
    setTab(nextTab);
    scrollToTop();
  };

  const periodo = state.periodos.find((item) => item.id === periodoId) ?? state.periodos[0];
  const reunionActiva = state.reuniones.find((item) => item.id === reunionId) ?? state.reuniones[0];
  const cobroEditando = state.cobros.find((cobro) => cobro.id === cobroEditandoId) ?? null;
  const periodoCobroEditando = cobroEditando
    ? state.periodos.find((item) => item.id === cobroEditando.periodoId)
    : undefined;
  const personaCobroEditando = cobroEditando ? personasPorId.get(cobroEditando.emprendedorId) : undefined;
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
        cobro.fechaAtraso,
        cobro.fechaPago,
        cobro.metodoPago,
        cobro.referenciaPago,
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
        pago.fechaAtraso,
        pago.fechaPago,
        pago.metodoPago,
        pago.referenciaPago,
        pago.observacion,
      ]);

      return matchesEstado && matchesSearch;
    });
  }, [busqueda, filtroEstado, personasPorId, state.pagosCes]);

  const emprendedoresFiltrados = useMemo(
    () => state.emprendedores.filter((persona) => matchesPersonaSearch(persona, busqueda)),
    [busqueda, state.emprendedores],
  );

  const asistenciasFiltradas = useMemo(() => {
    if (!reunionActiva) return [];

    return reunionActiva.asistencias.filter((asistencia) =>
      matchesPersonaSearch(personasPorId.get(asistencia.emprendedorId), busqueda, [
        asistencia.estado,
        asistencia.observacion,
        reunionActiva.titulo,
        reunionActiva.fecha,
        reunionActiva.lugar,
        reunionActiva.acta,
      ]),
    );
  }, [busqueda, personasPorId, reunionActiva]);

  const asistenciaTotales = useMemo(() => {
    const base = { total: reunionActiva?.asistencias.length ?? 0, presente: 0, ausente: 0, justificado: 0, pendiente: 0 };
    reunionActiva?.asistencias.forEach((asistencia) => {
      base[asistencia.estado] += 1;
    });
    return base;
  }, [reunionActiva]);

  const personaSeleccionada = personaActiva
    ? state.emprendedores.find((persona) => persona.id === personaActiva)
    : null;
  const personaVisible =
    personaSeleccionada && emprendedoresFiltrados.some((persona) => persona.id === personaSeleccionada.id)
      ? personaSeleccionada
      : emprendedoresFiltrados[0];

  const exportarJson = () => {
    const fecha = new Date().toISOString();
    const movimientoExportacion: MovimientoHistorial = {
      id: `mov-${fecha}-export-json`,
      fecha,
      tipo: "respaldo",
      accion: "Respaldo JSON exportado",
      detalle: "Se descargo un respaldo completo en formato JSON.",
      usuarioEmail: authUser?.email ?? "sin usuario",
    };
    const blob = new Blob([
      JSON.stringify({
        ...state,
        historial: [movimientoExportacion, ...(state.historial ?? [])],
        updatedAt: fecha,
      }, null, 2),
    ], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sistema-semilla-emprende-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    registrarMovimiento({
      tipo: "respaldo",
      accion: "Respaldo JSON exportado",
      detalle: "Se descargo un respaldo completo en formato JSON.",
    });
  };

  const exportarCsv = () => {
    registrarMovimiento({
      tipo: "respaldo",
      accion: "Planilla CSV exportada",
      detalle: "Se descargo una planilla CSV con cobros, CES y asistencias.",
    });

    const rows = [
      ["tipo", "periodo", "vencimiento", "nombre", "rut", "whatsapp_principal", "whatsapp_secundario", "nombre_contacto_secundario", "estado_persona", "fecha_baja", "motivo_baja", "credito", "cuota", "seguro", "total", "pagado", "estado", "fecha_pago", "metodo", "referencia_pago", "observacion", "acta"],
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
          persona?.whatsappSecundario ?? "",
          persona?.nombreContactoSecundario ?? "",
          persona ? personaEstadoLabels[persona.estado] : "",
          persona?.fechaBaja ?? "",
          persona?.motivoBaja ?? "",
          persona?.creditoOriginal ?? "",
          cobro.cuota,
          cobro.seguro,
          cobro.totalEsperado,
          cobro.montoPagado,
          cobro.estadoPago,
          cobro.fechaPago,
          cobro.metodoPago,
          cobro.referenciaPago,
          cobro.observacion,
          "",
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
          persona?.whatsappSecundario ?? "",
          persona?.nombreContactoSecundario ?? "",
          persona ? personaEstadoLabels[persona.estado] : "",
          persona?.fechaBaja ?? "",
          persona?.motivoBaja ?? "",
          pago.creditoBase,
          "",
          "",
          pago.totalEsperado,
          pago.montoPagado,
          pago.estadoPago,
          pago.fechaPago,
          pago.metodoPago,
          pago.referenciaPago,
          pago.observacion,
          "",
        ];
      }),
      ...state.reuniones.flatMap((reunion) =>
        reunion.asistencias.map((asistencia) => {
          const persona = personasPorId.get(asistencia.emprendedorId);
          return [
            "asistencia",
            reunion.titulo,
            reunion.fecha,
            persona?.nombre ?? "",
            persona?.rut ?? "",
            persona?.whatsapp ?? "",
            persona?.whatsappSecundario ?? "",
            persona?.nombreContactoSecundario ?? "",
            persona ? personaEstadoLabels[persona.estado] : "",
            persona?.fechaBaja ?? "",
            persona?.motivoBaja ?? "",
            persona?.creditoOriginal ?? "",
            "",
            "",
            "",
            "",
            asistencia.estado,
            "",
            reunion.lugar,
            "",
            asistencia.observacion || reunion.observacion,
            reunion.acta,
          ];
        }),
      ),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sistema-semilla-emprende-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const confirmed = confirmarAccionCritica("Importar este respaldo reemplazara los datos guardados actualmente en este navegador. Deseas continuar?");
    if (!confirmed) {
      event.target.value = "";
      return;
    }

    const content = await file.text();
    importar(JSON.parse(content) as TesoreriaState);
    event.target.value = "";
  };

  const handleReset = () => {
    const confirmed = confirmarAccionCritica("Reiniciar borrara los cambios guardados en este navegador y volvera a los datos iniciales. Deseas continuar?");
    if (!confirmed) return;
    resetear();
  };

  if (!authUser) {
    return (
      <LoginGate
        clientId={GOOGLE_CLIENT_ID}
        allowedEmails={correosAutorizados}
        error={authError}
        onLogin={handleGoogleLogin}
      />
    );
  }

  return (
    <main className={`app-shell section-${tab}`}>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Fundacion Banigualdad</p>
          <h1>Sistema Semilla Emprende</h1>
          <p>{state.centro.nombreCentro} · {state.centro.zona}</p>
        </div>
        <div className="hero-actions">
          <div className="auth-session">
            <span className="auth-avatar">
              {authUser.foto ? <img src={authUser.foto} alt="" /> : <ShieldCheck size={18} />}
            </span>
            <span className="auth-user">
              <strong>{authUser.nombre || "Cuenta Google"}</strong>
            </span>
            <button type="button" onClick={handleLogout} aria-label="Cerrar sesion">
              <LogOut size={16} />
            </button>
          </div>
          <select value={periodo?.id} onChange={(event) => setPeriodoId(event.target.value)} aria-label="Seleccionar semana de cobro">
            {state.periodos.map((item) => (
              <option key={item.id} value={item.id}>
                Semana cuota {item.numeroCuota} · {formatDate(item.fechaVencimiento)}
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
        <button className={tab === "cobros" ? "active" : ""} onClick={() => goToTab("cobros")}>
          <WalletCards size={18} /> Cobros
        </button>
        <button className={tab === "ces" ? "active" : ""} onClick={() => goToTab("ces")}>
          <Landmark size={18} /> CES
        </button>
        <button className={tab === "personas" ? "active" : ""} onClick={() => goToTab("personas")}>
          <Users size={18} /> Personas
        </button>
        <button className={tab === "asistencias" ? "active" : ""} onClick={() => goToTab("asistencias")}>
          <CalendarCheck size={18} /> Reuniones
        </button>
        <button className={tab === "config" ? "active" : ""} onClick={() => goToTab("config")}>
          <SlidersHorizontal size={18} /> Config
        </button>
      </nav>

      <SectionBanner tab={tab} periodo={periodo} totals={totals} cesTotals={cesTotals} />

      {tab === "cobros" && (
        <section className="workspace">
          <div className="week-strip" role="list" aria-label="Semanas de cobro">
            {state.periodos.map((item) => (
              <button
                key={item.id}
                className={item.id === periodo?.id ? "week-pill active" : "week-pill"}
                onClick={() => setPeriodoId(item.id)}
              >
                <strong>Cuota {item.numeroCuota}</strong>
                <span>{formatDate(item.fechaVencimiento)}</span>
              </button>
            ))}
          </div>

          <div className="toolbar">
            <SearchInput
              value={busqueda}
              onChange={setBusqueda}
              placeholder="Buscar nombre, RUT o WhatsApp"
            />
            <div className="toolbar-side">
              <button className="primary-button multi-pay-button" onClick={() => setPagoMultipleAbierto(true)}>
                <ReceiptText size={18} /> Adelantar pagos
              </button>
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
                  periodo={periodo}
                  persona={persona}
                  onPagar={() => marcarPagado(cobro.id)}
                  onEstado={(estado) => cambiarEstado(cobro.id, estado)}
                  onMonto={(monto) => registrarMonto(cobro.id, monto)}
                  onDetalle={(detail) => actualizarDetalle(cobro.id, detail)}
                  onEditarCobro={() => setCobroEditandoId(cobro.id)}
                  onPersona={() => {
                    setPersonaActiva(persona.id);
                    goToTab("personas");
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
                    goToTab("personas");
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
                  <small>{persona.rut} · {personaEstadoLabels[persona.estado]}</small>
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

      {tab === "asistencias" && (
        <AsistenciasPanel
          reuniones={state.reuniones}
          personasPorId={personasPorId}
          personas={state.emprendedores}
          reunionActiva={reunionActiva}
          reunionId={reunionId}
          onReunionActiva={setReunionId}
          onCrearReunion={(payload) => {
            const nextId = crearReunion(payload);
            setReunionId(nextId);
          }}
          onReunion={updateReunion}
          onEliminarReunion={(id) => {
            const remaining = state.reuniones.filter((reunion) => reunion.id !== id);
            eliminarReunion(id);
            setReunionId(remaining[0]?.id ?? "");
          }}
          asistencias={asistenciasFiltradas}
          totals={asistenciaTotales}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          onAsistencia={updateAsistencia}
          onTodosPresentes={marcarTodosPresentes}
        />
      )}

      {tab === "config" && (
        <ConfigPanel
          state={state}
          periodo={periodo}
          onCentro={updateCentro}
          onPeriodo={updatePeriodo}
          onPersona={updateEmprendedor}
          onCes={updateConfiguracionCes}
          onSeguridad={updateConfiguracionSeguridad}
          onRecalcularCes={recalcularPagosCes}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          personasFiltradas={emprendedoresFiltrados}
          onExportJson={exportarJson}
          onExportCsv={exportarCsv}
          fileInputRef={fileInputRef}
          onImport={handleImport}
          onReset={handleReset}
          cloudStatus={cloudStatus}
          cloudError={cloudError}
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

      {cobroEditando && personaCobroEditando && (
        <CobroEditModal
          cobro={cobroEditando}
          persona={personaCobroEditando}
          periodo={periodoCobroEditando}
          onClose={() => setCobroEditandoId(null)}
          onSave={(patch) => {
            actualizarCobro(cobroEditando.id, patch);
            setCobroEditandoId(null);
          }}
        />
      )}

      {pagoMultipleAbierto && (
        <PagoMultipleModal
          state={state}
          personas={emprendedoresFiltrados.length ? emprendedoresFiltrados : state.emprendedores}
          defaultPersonaId={personaVisible?.id}
          onClose={() => setPagoMultipleAbierto(false)}
          onSave={(ids, detail) => {
            registrarPagoMultiple(ids, detail);
            setPagoMultipleAbierto(false);
          }}
        />
      )}
    </main>
  );
}

function LoginGate({
  clientId,
  allowedEmails,
  error,
  onLogin,
}: {
  clientId: string;
  allowedEmails: string[];
  error: string;
  onLogin: (user: AuthUser, credential: string) => Promise<void> | void;
}) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [internalError, setInternalError] = useState("");

  useEffect(() => {
    if (!clientId) return;
    if (window.google?.accounts?.id) {
      setScriptReady(true);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    const script = existing ?? document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptReady(true);
    script.onerror = () => setInternalError("No se pudo cargar Google Identity Services. Revisa la conexion.");
    if (!existing) document.head.appendChild(script);
  }, [clientId]);

  useEffect(() => {
    if (!clientId || !scriptReady || !buttonRef.current || !window.google?.accounts?.id) return;

    buttonRef.current.innerHTML = "";
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (!response.credential) {
          setInternalError("Google no entrego una credencial valida. Intentalo nuevamente.");
          return;
        }

        try {
          void onLogin(decodeGoogleCredential(response.credential), response.credential);
        } catch {
          setInternalError("No se pudo leer la cuenta de Google. Intentalo nuevamente.");
        }
      },
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: "outline",
      size: "large",
      shape: "pill",
      width: 280,
      text: "signin_with",
      locale: "es",
    });
  }, [clientId, onLogin, scriptReady]);

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand">
          <div className="login-icon">
            <Sprout size={31} strokeWidth={2.1} />
          </div>
          <div>
            <span>Negrete</span>
            <strong>Semilla Emprende</strong>
          </div>
        </div>
        <p className="eyebrow">Acceso privado</p>
        <h1>Acceso Administración</h1>
        <p className="login-copy">
          Gestiona cobros, asistencia y acuerdos del centro con una cuenta Google autorizada.
        </p>

        {!clientId ? (
          <div className="login-warning">
            <strong>Falta configurar Google Login</strong>
            <span>Agrega el secreto/variable `VITE_GOOGLE_CLIENT_ID` en GitHub Pages o en el build local.</span>
          </div>
        ) : (
          <div className="google-login-button" ref={buttonRef}>
            {!scriptReady && <span>Cargando Google...</span>}
          </div>
        )}

        {(error || internalError) && <div className="login-error">{error || internalError}</div>}

        <div className="login-allowlist">
          <ShieldCheck size={18} />
          <span>
            {allowedEmails.length
              ? `${allowedEmails.length} correo${allowedEmails.length === 1 ? "" : "s"} autorizado${allowedEmails.length === 1 ? "" : "s"}.`
              : "Aun no hay correos autorizados configurados; el primer acceso queda abierto para configurar la lista."}
          </span>
        </div>
      </section>
      <footer className="login-footer">
        Version {APP_VERSION} - Zata Studio Lab
      </footer>
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
      detail: periodo ? `Semana cuota ${periodo.numeroCuota} · vence ${formatDate(periodo.fechaVencimiento)} · pendiente ${formatCurrency(totals.saldo)}` : "Semana de cobro",
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
    asistencias: {
      title: "Reuniones",
      detail: "Reuniones, asistencia y actas del grupo",
      icon: <CalendarCheck size={20} />,
    },
    config: {
      title: "Configuracion",
      detail: "Datos base, seguridad y respaldo",
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
  periodo,
  persona,
  onPagar,
  onEstado,
  onMonto,
  onDetalle,
  onEditarCobro,
  onPersona,
}: {
  cobro: CobroSemanal;
  periodo?: Periodo;
  persona: Emprendedor;
  onPagar: () => void;
  onEstado: (estado: EstadoPago) => void;
  onMonto: (monto: number) => void;
  onDetalle: (detail: { fechaPago?: string; metodoPago?: MetodoPago; referenciaPago?: string; observacion?: string }) => void;
  onEditarCobro: () => void;
  onPersona: () => void;
}) {
  const saldo = Math.max(cobro.totalEsperado - cobro.montoPagado, 0);
  const marcarEfectivo = () => onDetalle({ metodoPago: "efectivo", referenciaPago: "" });

  return (
    <article className={`payment-card ${cobro.estadoPago}`}>
      <header>
        <button className="person-link" onClick={onPersona}>
          <strong>{persona.nombre}</strong>
          <span>{persona.rut} · {personaEstadoLabels[persona.estado]}</span>
        </button>
        <div className="card-header-actions">
          <button className="icon-button" onClick={onEditarCobro} aria-label={`Editar cobro de ${persona.nombre}`}>
            <Pencil size={17} />
          </button>
          <span className={`badge ${cobro.estadoPago}`}>{estadoLabels[cobro.estadoPago]}</span>
        </div>
      </header>

      <div className="quota-strip">
        <span><CalendarDays size={15} /> Cuota {periodo?.numeroCuota ?? cobro.periodoId}</span>
        <strong>Vence {periodo ? formatDate(periodo.fechaVencimiento) : "sin fecha"}</strong>
      </div>

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

      {cobro.estadoPago === "atrasado" && cobro.fechaAtraso && (
        <div className="late-stamp">
          <AlertTriangle size={15} />
          <span>Atrasado desde {formatDateTime(cobro.fechaAtraso)}</span>
        </div>
      )}

      <div className="detail-grid">
        <label>
          <span>Fecha</span>
          <input type="date" value={cobro.fechaPago} onChange={(event) => onDetalle({ fechaPago: event.target.value })} />
        </label>
        <label>
          <span>Pago</span>
          <select
            value={cobro.metodoPago}
            onChange={(event) => {
              const metodoPago = event.target.value as MetodoPago;
              onDetalle({
                metodoPago,
                referenciaPago: metodoPago === "efectivo" ? "" : cobro.referenciaPago,
              });
            }}
          >
            {metodoOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <section className={cobro.metodoPago === "efectivo" ? "receipt-box cash" : "receipt-box"}>
        <div className="receipt-heading">
          <span><ReceiptText size={15} /> Comprobante</span>
          <button type="button" className="cash-toggle" onClick={marcarEfectivo}>
            <Check size={15} /> Efectivo
          </button>
        </div>
        <label className="reference-input">
          <span>N° transferencia o transaccion</span>
          <input
            value={cobro.referenciaPago}
            onChange={(event) => onDetalle({ referenciaPago: event.target.value })}
            placeholder={cobro.metodoPago === "efectivo" ? "Pago en efectivo" : "Ej: 348921, BancoEstado, comprobante"}
            disabled={cobro.metodoPago === "efectivo"}
          />
        </label>
      </section>

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
  const whatsappContacts = getWhatsappContacts(persona);
  const hasWhatsapp = whatsappContacts.length > 0;
  const messageActions = [
    { key: "proximo", label: "Pago pronto", icon: <MessageCircle size={17} />, message: whatsappMessages.proximo },
    { key: "atrasado", label: "Atraso", icon: <AlertTriangle size={17} />, message: whatsappMessages.atrasado },
    { key: "ultimoDia", label: "Ultimo dia", icon: <Send size={17} />, message: whatsappMessages.ultimoDia },
  ];

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
          <span className={`person-status ${persona.estado}`}>{personaEstadoLabels[persona.estado]}</span>
          <button className="icon-button" onClick={() => onEditarPersona(persona)} aria-label={`Editar ${persona.nombre}`}>
            <Pencil size={17} />
          </button>
        </div>
      </header>

      {persona.estado === "de_baja" && (
        <section className="inactive-panel">
          <strong>Persona dada de baja</strong>
          <span>{persona.fechaBaja ? `Fecha: ${formatDate(persona.fechaBaja)}` : "Sin fecha registrada"}</span>
          <span>Motivo: {persona.motivoBaja || "Sin motivo registrado"}</span>
          {persona.observacionBaja && <p>{persona.observacionBaja}</p>}
        </section>
      )}

      {persona.notas && <p className="inline-alert">{persona.notas}</p>}

      <section className="contact-panel">
        <header>
          <div>
            <p className="eyebrow">Contacto</p>
            <h3>WhatsApp</h3>
            <div className="contact-lines">
              <span>
                <b>Principal</b>
                {persona.whatsapp ? formatWhatsapp(persona.whatsapp) : "Sin numero registrado"}
              </span>
              <span>
                <b>Secundario</b>
                {persona.whatsappSecundario ? formatWhatsapp(persona.whatsappSecundario) : "Sin numero registrado"}
              </span>
              {persona.whatsappSecundario && (
                <span>
                  <b>Usado por</b>
                  {getSecondaryContactName(persona) || "Misma persona"}
                </span>
              )}
            </div>
          </div>
          <Phone size={20} />
        </header>
        {hasWhatsapp ? (
          <div className="whatsapp-actions">
            {messageActions.flatMap((action) =>
              whatsappContacts.map((contacto) => (
                <a
                  key={`${action.key}-${contacto.key}`}
                  href={buildWhatsappUrl(contacto.value, action.message)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {action.icon} {action.label} - {contacto.label}
                </a>
              )),
            )}
          </div>
        ) : (
          <p className="contact-empty">Agrega el numero principal o secundario desde el lapiz de cualquier tarjeta o desde Config.</p>
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
  onDetalle: (detail: { fechaPago?: string; metodoPago?: MetodoPago; referenciaPago?: string; observacion?: string }) => void;
  onEditarPersona: () => void;
  onPersona: () => void;
}) {
  const saldo = Math.max(pago.totalEsperado - pago.montoPagado, 0);
  const marcarEfectivo = () => onDetalle({ metodoPago: "efectivo", referenciaPago: "" });

  return (
    <article className={`payment-card ces-card ${pago.estadoPago}`}>
      <header>
        <button className="person-link" onClick={onPersona}>
          <strong>{persona.nombre}</strong>
          <span>{persona.rut} · {personaEstadoLabels[persona.estado]}</span>
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

      {pago.estadoPago === "atrasado" && pago.fechaAtraso && (
        <div className="late-stamp">
          <AlertTriangle size={15} />
          <span>Atrasado desde {formatDateTime(pago.fechaAtraso)}</span>
        </div>
      )}

      <div className="detail-grid">
        <label>
          <span>Fecha</span>
          <input type="date" value={pago.fechaPago} onChange={(event) => onDetalle({ fechaPago: event.target.value })} />
        </label>
        <label>
          <span>Pago</span>
          <select
            value={pago.metodoPago}
            onChange={(event) => {
              const metodoPago = event.target.value as MetodoPago;
              onDetalle({
                metodoPago,
                referenciaPago: metodoPago === "efectivo" ? "" : pago.referenciaPago,
              });
            }}
          >
            {metodoOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <section className={pago.metodoPago === "efectivo" ? "receipt-box cash" : "receipt-box"}>
        <div className="receipt-heading">
          <span><ReceiptText size={15} /> Comprobante</span>
          <button type="button" className="cash-toggle" onClick={marcarEfectivo}>
            <Check size={15} /> Efectivo
          </button>
        </div>
        <label className="reference-input">
          <span>N° transferencia o transaccion</span>
          <input
            value={pago.referenciaPago}
            onChange={(event) => onDetalle({ referenciaPago: event.target.value })}
            placeholder={pago.metodoPago === "efectivo" ? "Pago en efectivo" : "Ej: 348921, BancoEstado, comprobante"}
            disabled={pago.metodoPago === "efectivo"}
          />
        </label>
      </section>

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

function AsistenciasPanel({
  reuniones,
  personasPorId,
  personas,
  reunionActiva,
  reunionId,
  onReunionActiva,
  onCrearReunion,
  onReunion,
  onEliminarReunion,
  asistencias,
  totals,
  busqueda,
  onBusqueda,
  onAsistencia,
  onTodosPresentes,
}: {
  reuniones: Reunion[];
  personasPorId: Map<string, Emprendedor>;
  personas: Emprendedor[];
  reunionActiva?: Reunion;
  reunionId: string;
  onReunionActiva: (id: string) => void;
  onCrearReunion: (payload: { titulo: string; fecha: string; lugar?: string; observacion?: string; acta?: string }) => void;
  onReunion: (id: string, patch: Partial<Omit<Reunion, "id" | "asistencias">>) => void;
  onEliminarReunion: (id: string) => void;
  asistencias: Reunion["asistencias"];
  totals: { total: number; presente: number; ausente: number; justificado: number; pendiente: number };
  busqueda: string;
  onBusqueda: (value: string) => void;
  onAsistencia: (reunionId: string, emprendedorId: string, patch: { estado?: EstadoAsistencia; observacion?: string }) => void;
  onTodosPresentes: (reunionId: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState(today);
  const [lugar, setLugar] = useState("");
  const [acta, setActa] = useState("");

  const crear = () => {
    onCrearReunion({
      titulo: titulo.trim() || `Reunion ${reuniones.length + 1}`,
      fecha,
      lugar,
      acta,
    });
    setTitulo("");
    setFecha(today);
    setLugar("");
    setActa("");
  };

  const eliminarActual = () => {
    if (!reunionActiva) return;
    const confirmed = confirmarAccionCritica(`Eliminar "${reunionActiva.titulo}"? Se borraran su asistencia y acta.`);
    if (!confirmed) return;
    onEliminarReunion(reunionActiva.id);
  };

  const marcarTodos = () => {
    if (!reunionActiva) return;
    const confirmed = confirmarAccionCritica(`Marcar a todos como presentes en "${reunionActiva.titulo}"?`);
    if (!confirmed) return;
    onTodosPresentes(reunionActiva.id);
  };

  return (
    <section className="workspace attendance-panel">
      <section className="attendance-create">
        <div>
          <p className="eyebrow">Nueva reunion</p>
          <h2>Asistencia y acta</h2>
        </div>
        <div className="attendance-create-grid">
          <label>
            <span>Titulo</span>
            <input value={titulo} onChange={(event) => setTitulo(event.target.value)} placeholder={`Reunion ${reuniones.length + 1}`} />
          </label>
          <label>
            <span>Fecha</span>
            <input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} />
          </label>
          <label>
            <span>Lugar</span>
            <input value={lugar} onChange={(event) => setLugar(event.target.value)} placeholder="Opcional" />
          </label>
          <label className="attendance-acta-create">
            <span>Acta inicial</span>
            <textarea value={acta} onChange={(event) => setActa(event.target.value)} placeholder="Resumen, acuerdos o temas tratados" rows={3} />
          </label>
          <button className="primary-button" onClick={crear}>
            <Plus size={18} /> Crear
          </button>
        </div>
      </section>

      {reuniones.length > 0 ? (
        <>
          <div className="meeting-strip" role="list" aria-label="Reuniones">
            {reuniones.map((reunion) => (
              <button
                key={reunion.id}
                className={reunion.id === reunionId || (!reunionId && reunion.id === reunionActiva?.id) ? "meeting-pill active" : "meeting-pill"}
                onClick={() => onReunionActiva(reunion.id)}
              >
                <strong>{reunion.titulo}</strong>
                <span>{formatDate(reunion.fecha)}</span>
              </button>
            ))}
          </div>

          {reunionActiva && (
            <>
              <section className="attendance-meeting-card">
                <div className="attendance-meeting-title">
                  <div>
                    <p className="eyebrow">Reunion seleccionada</p>
                    <h2>{reunionActiva.titulo}</h2>
                    <span>{formatDate(reunionActiva.fecha)} · {reunionActiva.lugar || "Sin lugar"}</span>
                  </div>
                  <div className="meeting-title-actions">
                    <strong>{totals.presente}/{totals.total}</strong>
                    <button className="danger-icon-button" onClick={eliminarActual} aria-label={`Eliminar ${reunionActiva.titulo}`}>
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
                <div className="attendance-edit-grid">
                  <label>
                    <span>Titulo</span>
                    <input value={reunionActiva.titulo} onChange={(event) => onReunion(reunionActiva.id, { titulo: event.target.value })} />
                  </label>
                  <label>
                    <span>Fecha</span>
                    <input type="date" value={reunionActiva.fecha} onChange={(event) => onReunion(reunionActiva.id, { fecha: event.target.value })} />
                  </label>
                  <label>
                    <span>Lugar</span>
                    <input value={reunionActiva.lugar} onChange={(event) => onReunion(reunionActiva.id, { lugar: event.target.value })} />
                  </label>
                  <label>
                    <span>Nota corta</span>
                    <input value={reunionActiva.observacion} onChange={(event) => onReunion(reunionActiva.id, { observacion: event.target.value })} />
                  </label>
                </div>
                <label className="attendance-acta">
                  <span>Acta de reunion</span>
                  <textarea
                    value={reunionActiva.acta}
                    onChange={(event) => onReunion(reunionActiva.id, { acta: event.target.value })}
                    placeholder="Resumen de la reunion, acuerdos, compromisos y pendientes"
                    rows={5}
                  />
                </label>
                <button className="mark-all-present-button" onClick={marcarTodos}>
                  <CheckCircle2 size={17} /> Marcar a todos presentes
                </button>
              </section>

              <section className="summary-grid compact attendance-summary">
                <SummaryCard icon={<CheckCircle2 />} label="Presentes" value={String(totals.presente)} tone="success" />
                <SummaryCard icon={<AlertTriangle />} label="Ausentes" value={String(totals.ausente)} tone="warning" />
                <SummaryCard icon={<CalendarCheck />} label="Justificados" value={String(totals.justificado)} tone="info" />
                <SummaryCard icon={<History />} label="Pendientes" value={String(totals.pendiente)} />
              </section>

              <SearchInput
                className="people-search"
                value={busqueda}
                onChange={onBusqueda}
                placeholder="Buscar participante, RUT o estado"
              />

              <div className="attendance-list">
                {asistencias.map((asistencia) => {
                  const persona = personasPorId.get(asistencia.emprendedorId);
                  if (!persona) return null;
                  const secondaryAttendanceNote = buildSecondaryAttendanceNote(persona);

                  return (
                    <article key={asistencia.emprendedorId} className={`attendance-row ${asistencia.estado}`}>
                      <header>
                        <div>
                          <strong>{persona.nombre}</strong>
                          <span>{persona.rut}</span>
                          {secondaryAttendanceNote && (
                            <span className="attendance-representative">Representante: {getSecondaryContactName(persona)}</span>
                          )}
                        </div>
                        <span className={`badge ${asistencia.estado}`}>{asistenciaLabels[asistencia.estado]}</span>
                      </header>
                      <div className="attendance-actions">
                        {asistenciaOptions.map((estado) => (
                          <button
                            key={estado}
                            className={asistencia.estado === estado ? "active" : ""}
                            onClick={() => onAsistencia(reunionActiva.id, asistencia.emprendedorId, { estado })}
                          >
                            {asistenciaLabels[estado]}
                          </button>
                        ))}
                      </div>
                      {secondaryAttendanceNote && (
                        <button
                          className="representative-button"
                          onClick={() =>
                            onAsistencia(reunionActiva.id, asistencia.emprendedorId, {
                              estado: "justificado",
                              observacion: secondaryAttendanceNote,
                            })
                          }
                        >
                          <Users size={16} /> Justificar con {getSecondaryContactName(persona)}
                        </button>
                      )}
                      <label className="attendance-note">
                        <span>Observacion</span>
                        <input
                          value={asistencia.observacion}
                          onChange={(event) => onAsistencia(reunionActiva.id, asistencia.emprendedorId, { observacion: event.target.value })}
                          placeholder="Opcional"
                        />
                      </label>
                    </article>
                  );
                })}
                {!asistencias.length && <p className="empty-state">No hay participantes para esta busqueda.</p>}
              </div>
            </>
          )}
        </>
      ) : (
        <section className="empty-state attendance-empty">
          <CalendarCheck size={22} />
          <span>Crea la primera reunion para comenzar a marcar asistencia de los {personas.length} participantes.</span>
        </section>
      )}
    </section>
  );
}

function ConfigPanel({
  state,
  periodo,
  onCentro,
  onPeriodo,
  onPersona,
  onCes,
  onSeguridad,
  onRecalcularCes,
  busqueda,
  onBusqueda,
  personasFiltradas,
  onExportJson,
  onExportCsv,
  fileInputRef,
  onImport,
  onReset,
  cloudStatus,
  cloudError,
}: {
  state: TesoreriaState;
  periodo?: Periodo;
  onCentro: (patch: Partial<Centro>) => void;
  onPeriodo: (id: string, patch: Partial<Periodo>) => void;
  onPersona: (id: string, patch: Partial<Emprendedor>) => void;
  onCes: (patch: Partial<ConfiguracionCes>) => void;
  onSeguridad: (patch: Partial<ConfiguracionSeguridad>) => void;
  onRecalcularCes: () => void;
  busqueda: string;
  onBusqueda: (value: string) => void;
  personasFiltradas: Emprendedor[];
  onExportJson: () => void;
  onExportCsv: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
  cloudStatus: keyof typeof cloudStatusLabels;
  cloudError: string;
}) {
  const [configTab, setConfigTab] = useState<ConfigTab>("general");
  const [emailsModalOpen, setEmailsModalOpen] = useState(false);
  const cesRules = state.configuracion.ces.montosPorCredito;
  const authorizedEmails = state.configuracion.seguridad.correosAutorizados;

  return (
    <section className="workspace config-panel">
      <div className="config-tabs" role="tablist" aria-label="Apartados de configuracion">
        <button className={configTab === "general" ? "active" : ""} onClick={() => setConfigTab("general")}>
          <SlidersHorizontal size={17} /> General
        </button>
        <button className={configTab === "seguridad" ? "active" : ""} onClick={() => setConfigTab("seguridad")}>
          <ShieldCheck size={17} /> Seguridad
        </button>
        <button className={configTab === "historial" ? "active" : ""} onClick={() => setConfigTab("historial")}>
          <History size={17} /> Historial
        </button>
        <button className={configTab === "respaldo" ? "active" : ""} onClick={() => setConfigTab("respaldo")}>
          <Download size={17} /> Respaldo
        </button>
      </div>

      <section className="config-section cloud-config-section">
        <header>
          <div>
            <p className="eyebrow">Sincronizacion</p>
            <h2>Estado de la nube</h2>
          </div>
          {cloudStatus === "local" || cloudStatus === "error" ? <CloudOff size={22} /> : <Cloud size={22} />}
        </header>
        <div className={`cloud-status ${cloudStatus}`}>
          {cloudStatus === "local" || cloudStatus === "error" ? <CloudOff size={15} /> : <Cloud size={15} />}
          <span>{cloudStatusLabels[cloudStatus]}</span>
        </div>
        <p className="config-note">
          {cloudError || "Cuando Firebase este configurado, los cambios del sistema se guardaran en la nube automaticamente."}
        </p>
      </section>

      {configTab === "seguridad" && (
        <section className="config-section security-section">
          <header>
            <div>
              <p className="eyebrow">Seguridad</p>
              <h2>Correos autorizados</h2>
            </div>
            <ShieldCheck size={22} />
          </header>
          <div className="security-summary">
            <div>
              <span>Correos con acceso</span>
              <strong>{authorizedEmails.length}</strong>
            </div>
            <button className="primary-button" onClick={() => setEmailsModalOpen(true)}>
              <LockKeyhole size={18} /> Administrar correos
            </button>
          </div>
          <p className="config-note">
            La lista completa solo se muestra dentro del modal protegido. Para agregar o quitar correos se exige la contraseña administrativa y una confirmacion.
          </p>
          {!EMAIL_ADMIN_PASSWORD_HASH && (
            <p className="config-note warning-note">
              Falta configurar `VITE_EMAIL_ADMIN_PASSWORD_HASH`; mientras no exista, no se podran editar los correos desde el sistema.
            </p>
          )}
          {emailsModalOpen && (
            <AuthorizedEmailsModal
              emails={authorizedEmails}
              onClose={() => setEmailsModalOpen(false)}
              onSave={(correosAutorizados) => onSeguridad({ correosAutorizados })}
            />
          )}
        </section>
      )}

      {configTab === "respaldo" && (
        <BackupPanel
          onExportJson={onExportJson}
          onExportCsv={onExportCsv}
          fileInputRef={fileInputRef}
          onImport={onImport}
          onReset={onReset}
        />
      )}

      {configTab === "historial" && (
        <HistorialPanel movimientos={state.historial ?? []} />
      )}

      {configTab === "general" && (
        <>
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
              <p className="eyebrow">Semana seleccionada</p>
              <h2>Cuota {periodo.numeroCuota}</h2>
            </div>
          </header>
          <div className="settings-grid">
            <ConfigInput label="Numero hoja" type="number" value={String(periodo.numeroHoja)} onChange={(value) => onPeriodo(periodo.id, { numeroHoja: Number(value || 0) })} />
            <ConfigInput label="Numero lote" value={periodo.numeroLote} onChange={(value) => onPeriodo(periodo.id, { numeroLote: value })} />
            <ConfigInput label="Ciclo" type="number" value={String(periodo.ciclo)} onChange={(value) => onPeriodo(periodo.id, { ciclo: Number(value || 0) })} />
            <ConfigInput label="Numero cuota" type="number" value={String(periodo.numeroCuota)} onChange={(value) => onPeriodo(periodo.id, { numeroCuota: Number(value || 0) })} />
            <ConfigInput label="Fecha firma" type="date" value={periodo.fechaFirma} onChange={(value) => onPeriodo(periodo.id, { fechaFirma: value })} />
            <ConfigInput label="Vencimiento semana" type="date" value={periodo.fechaVencimiento} onChange={(value) => onPeriodo(periodo.id, { fechaVencimiento: value })} />
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
          placeholder="Buscar nombre, RUT, WhatsApp, estado, credito o nota"
        />
        <div className="people-config-list">
          {personasFiltradas.map((persona) => (
            <article className="person-config-card" key={persona.id}>
              <ConfigInput label="Nombre" value={persona.nombre} onChange={(value) => onPersona(persona.id, { nombre: value })} />
              <ConfigInput label="RUT" value={persona.rut} onChange={(value) => onPersona(persona.id, { rut: value })} />
              <ConfigInput label="WhatsApp principal" value={persona.whatsapp ?? ""} onChange={(value) => onPersona(persona.id, { whatsapp: value })} />
              <ConfigInput label="WhatsApp secundario" value={persona.whatsappSecundario ?? ""} onChange={(value) => onPersona(persona.id, { whatsappSecundario: value })} />
              <ConfigInput label="Nombre contacto secundario" value={persona.nombreContactoSecundario ?? ""} onChange={(value) => onPersona(persona.id, { nombreContactoSecundario: value })} />
              <label className="config-field">
                <span>Estado</span>
                <select
                  value={persona.estado}
                  onChange={(event) => {
                    const estado = event.target.value as EstadoPersona;
                    onPersona(persona.id, {
                      estado,
                      fechaBaja: estado === "activa" ? "" : persona.fechaBaja,
                      motivoBaja: estado === "activa" ? "" : persona.motivoBaja,
                      observacionBaja: estado === "activa" ? "" : persona.observacionBaja,
                    });
                  }}
                >
                  <option value="activa">Activa</option>
                  <option value="de_baja">De baja</option>
                </select>
              </label>
              {persona.estado === "de_baja" && (
                <>
                  <ConfigInput label="Fecha baja" type="date" value={persona.fechaBaja ?? ""} onChange={(value) => onPersona(persona.id, { fechaBaja: value })} />
                  <ConfigInput label="Motivo baja" value={persona.motivoBaja ?? ""} onChange={(value) => onPersona(persona.id, { motivoBaja: value })} />
                  <ConfigInput label="Observacion baja" value={persona.observacionBaja ?? ""} onChange={(value) => onPersona(persona.id, { observacionBaja: value })} />
                </>
              )}
              <ConfigInput label="Credito original" type="number" value={String(persona.creditoOriginal)} onChange={(value) => onPersona(persona.id, { creditoOriginal: Number(value || 0) })} />
              <ConfigInput
                label={ANILLO_PERSONA_LABEL}
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={String(persona.anillo)}
                onChange={(value) => onPersona(persona.id, { anillo: Number(value || 0) })}
              />
              <ConfigInput label="Notas" value={persona.notas ?? ""} onChange={(value) => onPersona(persona.id, { notas: value })} />
            </article>
          ))}
          {!personasFiltradas.length && <p className="empty-state">No hay personas para esta busqueda.</p>}
        </div>
      </section>
        </>
      )}
    </section>
  );
}

function BackupPanel({
  onExportJson,
  onExportCsv,
  fileInputRef,
  onImport,
  onReset,
}: {
  onExportJson: () => void;
  onExportCsv: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
}) {
  return (
    <section className="backup-panel">
      <div className="backup-card">
        <Download size={24} />
        <h2>Exportar informacion</h2>
        <p>Descarga un respaldo completo JSON o una planilla CSV para revisar en Excel o Google Sheets.</p>
        <div className="button-row">
          <button className="primary-button" onClick={onExportJson}>
            <Download size={18} /> JSON
          </button>
          <button className="secondary-button" onClick={onExportCsv}>
            <Download size={18} /> CSV
          </button>
        </div>
      </div>

      <div className="backup-card">
        <Upload size={24} />
        <h2>Importar respaldo</h2>
        <p>Restaura un JSON exportado por esta misma aplicacion.</p>
        <input ref={fileInputRef} className="hidden-input" type="file" accept="application/json" onChange={onImport} />
        <button className="secondary-button" onClick={() => fileInputRef.current?.click()}>
          <Upload size={18} /> Elegir archivo
        </button>
      </div>

      <div className="backup-card caution">
        <RotateCcw size={24} />
        <h2>Reiniciar datos locales</h2>
        <p>Vuelve al periodo inicial cargado desde la captura. Esto limpia los cambios guardados en este navegador.</p>
        <button className="danger-button" onClick={onReset}>
          <RotateCcw size={18} /> Reiniciar
        </button>
      </div>
    </section>
  );
}

function HistorialPanel({ movimientos }: { movimientos: MovimientoHistorial[] }) {
  const [busquedaHistorial, setBusquedaHistorial] = useState("");
  const [pagina, setPagina] = useState(1);
  const pageSize = 12;
  const query = busquedaHistorial.trim().toLowerCase();
  const movimientosFiltrados = useMemo(
    () =>
      movimientos.filter((movimiento) =>
        [
          movimiento.fecha,
          movimiento.tipo,
          movimiento.accion,
          movimiento.detalle,
          movimiento.personaNombre,
          movimiento.usuarioEmail,
          movimiento.entidadId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      ),
    [movimientos, query],
  );
  const totalPaginas = Math.max(Math.ceil(movimientosFiltrados.length / pageSize), 1);
  const paginaActual = Math.min(pagina, totalPaginas);
  const inicio = (paginaActual - 1) * pageSize;
  const paginaMovimientos = movimientosFiltrados.slice(inicio, inicio + pageSize);
  const rangoDesde = movimientosFiltrados.length ? inicio + 1 : 0;
  const rangoHasta = Math.min(inicio + pageSize, movimientosFiltrados.length);

  useEffect(() => {
    setPagina(1);
  }, [query]);

  return (
    <section className="config-section audit-section">
      <header>
        <div>
          <p className="eyebrow">Auditoria</p>
          <h2>Historial de movimientos</h2>
        </div>
        <History size={22} />
      </header>

      <div className="audit-toolbar">
        <SearchInput
          value={busquedaHistorial}
          onChange={setBusquedaHistorial}
          placeholder="Buscar historial"
        />
        <div className="audit-count">
          <strong>{movimientosFiltrados.length}</strong>
          <span>movimientos</span>
        </div>
      </div>

      <div className="audit-mobile-list" aria-label="Historial de movimientos">
        {paginaMovimientos.map((movimiento) => (
          <article className="audit-card" key={movimiento.id}>
            <header>
              <span className={`audit-type ${movimiento.tipo}`}>{movimiento.tipo}</span>
              <time>{formatDateTime(movimiento.fecha)}</time>
            </header>
            <strong>{movimiento.accion}</strong>
            <dl>
              <div>
                <dt>Para</dt>
                <dd>{movimiento.personaNombre || movimiento.personaId || "Sistema"}</dd>
              </div>
              <div>
                <dt>Usuario</dt>
                <dd>{movimiento.usuarioEmail}</dd>
              </div>
            </dl>
            <p>{movimiento.detalle}</p>
          </article>
        ))}
        {!paginaMovimientos.length && (
          <p className="empty-state">Aun no hay movimientos para mostrar.</p>
        )}
      </div>

      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Accion</th>
              <th>Para quien</th>
              <th>Usuario</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {paginaMovimientos.map((movimiento) => (
              <tr key={movimiento.id}>
                <td>{formatDateTime(movimiento.fecha)}</td>
                <td><span className={`audit-type ${movimiento.tipo}`}>{movimiento.tipo}</span></td>
                <td><strong>{movimiento.accion}</strong></td>
                <td>{movimiento.personaNombre || movimiento.personaId || "Sistema"}</td>
                <td>{movimiento.usuarioEmail}</td>
                <td>{movimiento.detalle}</td>
              </tr>
            ))}
            {!paginaMovimientos.length && (
              <tr>
                <td colSpan={6}>
                  <p className="empty-state">Aun no hay movimientos para mostrar.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="audit-pagination">
        <button className="secondary-button" onClick={() => setPagina((current) => Math.max(current - 1, 1))} disabled={paginaActual <= 1}>
          Anterior
        </button>
        <span>{rangoDesde}-{rangoHasta} de {movimientosFiltrados.length}</span>
        <button className="secondary-button" onClick={() => setPagina((current) => Math.min(current + 1, totalPaginas))} disabled={paginaActual >= totalPaginas}>
          Siguiente
        </button>
      </footer>
    </section>
  );
}

function AuthorizedEmailsModal({
  emails,
  onClose,
  onSave,
}: {
  emails: string[];
  onClose: () => void;
  onSave: (emails: string[]) => void;
}) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [emailsText, setEmailsText] = useState(() => emails.join("\n"));
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  const unlock = async () => {
    setError("");

    if (!EMAIL_ADMIN_PASSWORD_HASH) {
      setError("Falta configurar la contrasena administrativa para editar correos.");
      return;
    }

    if (!password.trim()) {
      setError("Ingresa la contrasena administrativa.");
      return;
    }

    setIsChecking(true);
    const isValidPassword = await verifyEmailAdminPassword(password);
    setIsChecking(false);

    if (!isValidPassword) {
      setError("La contrasena no coincide. No se pueden mostrar ni editar los correos.");
      return;
    }

    setPassword("");
    setEmailsText(emails.join("\n"));
    setIsUnlocked(true);
  };

  const save = () => {
    const rawEmails = emailsText
      .split(/[,\n;]/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    const invalidEmails = rawEmails.filter((email) => !isValidEmail(email));
    const nextEmails = normalizeEmailList(rawEmails);

    if (invalidEmails.length) {
      setError(`Revisa estos correos: ${invalidEmails.join(", ")}`);
      return;
    }

    const added = nextEmails.filter((email) => !emails.includes(email));
    const removed = emails.filter((email) => !nextEmails.includes(email));
    const changes = [
      added.length ? `${added.length} agregado${added.length === 1 ? "" : "s"}` : "",
      removed.length ? `${removed.length} eliminado${removed.length === 1 ? "" : "s"}` : "",
    ].filter(Boolean);

    if (!changes.length) {
      onClose();
      return;
    }

    if (
      !confirmarAccionCritica(
        `Guardar cambios en correos autorizados? Se aplicaran ${changes.join(" y ")}. Esta accion modifica quien puede ingresar al sistema.`,
      )
    ) {
      return;
    }

    onSave(nextEmails);
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="edit-modal security-modal" role="dialog" aria-modal="true" aria-labelledby="authorized-emails-title">
        <header>
          <div>
            <p className="eyebrow">Seguridad</p>
            <h2 id="authorized-emails-title">Correos autorizados</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar correos autorizados">
            <X size={20} />
          </button>
        </header>

        {!isUnlocked ? (
          <section className="security-lock-panel">
            <LockKeyhole size={28} />
            <div>
              <strong>Modal protegido</strong>
              <p>Ingresa la contrasena administrativa para ver, agregar o eliminar correos autorizados.</p>
            </div>
            <label className="modal-field">
              <span>Contrasena administrativa</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void unlock();
                }}
                autoFocus
              />
            </label>
            {error && <div className="modal-error">{error}</div>}
            <footer>
              <button className="secondary-button" onClick={onClose}>
                Cancelar
              </button>
              <button className="primary-button" onClick={() => void unlock()} disabled={isChecking}>
                <ShieldCheck size={18} /> {isChecking ? "Verificando" : "Desbloquear"}
              </button>
            </footer>
          </section>
        ) : (
          <>
            <div className="modal-info">
              <ShieldCheck size={18} />
              <span>Los cambios requieren confirmacion antes de guardarse. Si la lista queda vacia, cualquier cuenta Google podria ingresar.</span>
            </div>
            <label className="modal-field authorized-emails-field">
              <span>Lista de correos Google</span>
              <textarea
                value={emailsText}
                onChange={(event) => {
                  setEmailsText(event.target.value);
                  setError("");
                }}
                rows={8}
                placeholder="correo1@gmail.com&#10;correo2@gmail.com"
              />
              <small>Escribe un correo por linea, separado por coma o punto y coma.</small>
            </label>
            {error && <div className="modal-error">{error}</div>}
            <footer>
              <button className="secondary-button" onClick={onClose}>
                Cancelar
              </button>
              <button className="primary-button" onClick={save}>
                <Check size={18} /> Guardar cambios
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
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
    whatsappSecundario: persona.whatsappSecundario ?? "",
    nombreContactoSecundario: persona.nombreContactoSecundario ?? "",
    estado: persona.estado,
    fechaBaja: persona.fechaBaja ?? "",
    motivoBaja: persona.motivoBaja ?? "",
    observacionBaja: persona.observacionBaja ?? "",
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
    if (persona.estado !== "de_baja" && form.estado === "de_baja") {
      const confirmed = confirmarAccionCritica(`Dar de baja a "${persona.nombre}"? La persona seguira registrada, pero quedara marcada como de baja.`);
      if (!confirmed) return;
    }

    onSave({
      ...form,
      nombre: form.nombre.trim(),
      rut: formatRut(form.rut),
      whatsapp: formatWhatsapp(form.whatsapp),
      whatsappSecundario: formatWhatsapp(form.whatsappSecundario),
      nombreContactoSecundario: form.nombreContactoSecundario?.trim() || "",
      estado: form.estado,
      fechaBaja: form.estado === "de_baja" ? form.fechaBaja : "",
      motivoBaja: form.estado === "de_baja" ? form.motivoBaja?.trim() : "",
      observacionBaja: form.estado === "de_baja" ? form.observacionBaja?.trim() : "",
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

          <ModalField label="WhatsApp principal" error={touched ? errors.whatsapp : undefined} hint="Opcional. Ejemplo: +56 9 1234 5678">
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

          <ModalField label="WhatsApp secundario" error={touched ? errors.whatsappSecundario : undefined} hint="Opcional. Maximo un numero secundario.">
            <input
              value={form.whatsappSecundario ?? ""}
              onChange={(event) => updateForm("whatsappSecundario", event.target.value)}
              onBlur={() => {
                updateForm("whatsappSecundario", formatWhatsapp(form.whatsappSecundario));
                setTouched(true);
              }}
              inputMode="tel"
              placeholder="+56 9 1234 5678"
            />
          </ModalField>

          <ModalField label="Nombre contacto secundario" error={touched ? errors.nombreContactoSecundario : undefined} hint="Opcional. Si queda vacio, se entiende que el segundo numero es de la misma persona.">
            <input
              value={form.nombreContactoSecundario ?? ""}
              onChange={(event) => updateForm("nombreContactoSecundario", event.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="Ej: nombre de esposa, hijo o representante"
            />
          </ModalField>

          <ModalField label="Estado" error={touched ? errors.estado : undefined}>
            <select
              value={form.estado}
              onChange={(event) => {
                const estado = event.target.value as EstadoPersona;
                updateForm("estado", estado);
                if (estado === "activa") {
                  updateForm("fechaBaja", "");
                  updateForm("motivoBaja", "");
                  updateForm("observacionBaja", "");
                }
              }}
              onBlur={() => setTouched(true)}
            >
              <option value="activa">Activa</option>
              <option value="de_baja">De baja</option>
            </select>
          </ModalField>

          {form.estado === "de_baja" && (
            <>
              <ModalField label="Fecha de baja" error={touched ? errors.fechaBaja : undefined}>
                <input
                  type="date"
                  value={form.fechaBaja ?? ""}
                  onChange={(event) => updateForm("fechaBaja", event.target.value)}
                  onBlur={() => setTouched(true)}
                />
              </ModalField>

              <ModalField label="Motivo de baja" error={touched ? errors.motivoBaja : undefined} hint="Obligatorio. Maximo 120 caracteres.">
                <input
                  value={form.motivoBaja ?? ""}
                  onChange={(event) => updateForm("motivoBaja", event.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder="Ej: Renuncia al grupo, cambio de comuna"
                />
              </ModalField>

              <ModalField label="Observacion de baja" error={touched ? errors.observacionBaja : undefined} hint="Opcional. Maximo 220 caracteres.">
                <textarea
                  value={form.observacionBaja ?? ""}
                  onChange={(event) => updateForm("observacionBaja", event.target.value)}
                  onBlur={() => setTouched(true)}
                  rows={3}
                />
              </ModalField>
            </>
          )}

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

          <ModalField label={ANILLO_PERSONA_LABEL} error={touched ? errors.anillo : undefined}>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={form.anillo || ""}
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

function CobroEditModal({
  cobro,
  persona,
  periodo,
  onClose,
  onSave,
}: {
  cobro: CobroSemanal;
  persona: Emprendedor;
  periodo?: Periodo;
  onClose: () => void;
  onSave: (patch: Partial<CobroSemanal>) => void;
}) {
  const [form, setForm] = useState<CobroEditForm>({
    cuota: cobro.cuota,
    seguro: cobro.seguro,
    montoPagado: cobro.montoPagado,
    estadoPago: cobro.estadoPago,
    fechaPago: cobro.fechaPago,
    metodoPago: cobro.metodoPago,
    referenciaPago: cobro.referenciaPago,
    observacion: cobro.observacion,
  });
  const [touched, setTouched] = useState(false);
  const totalEsperado = Math.max(Number(form.cuota || 0), 0) + Math.max(Number(form.seguro || 0), 0);
  const hasInvalidNumbers = [form.cuota, form.seguro, form.montoPagado].some(
    (value) => !Number.isFinite(value) || value < 0,
  );
  const requiresReference = Boolean(form.metodoPago && form.metodoPago !== "efectivo");
  const missingReference = requiresReference && !form.referenciaPago.trim();
  const hasErrors = hasInvalidNumbers || missingReference;

  const updateForm = <K extends keyof CobroEditForm>(key: K, value: CobroEditForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleMetodo = (metodoPago: MetodoPago) => {
    setForm((current) => ({
      ...current,
      metodoPago,
      referenciaPago: metodoPago === "efectivo" ? "" : current.referenciaPago,
    }));
  };

  const handleSave = () => {
    setTouched(true);
    if (hasErrors) return;

    const cuota = Math.max(Number(form.cuota || 0), 0);
    const seguro = Math.max(Number(form.seguro || 0), 0);
    const total = cuota + seguro;
    let montoPagado = Math.max(Number(form.montoPagado || 0), 0);
    let estadoPago = form.estadoPago;

    if (estadoPago === "pendiente" || estadoPago === "atrasado") {
      montoPagado = 0;
    } else if (estadoPago !== "revisar") {
      estadoPago = montoPagado <= 0 ? "pendiente" : montoPagado >= total ? "pagado" : "parcial";
    }

    onSave({
      cuota,
      seguro,
      totalEsperado: total,
      montoPagado,
      estadoPago,
      fechaAtraso: estadoPago === "atrasado" ? cobro.fechaAtraso || new Date().toISOString() : "",
      fechaPago: montoPagado > 0 ? form.fechaPago || new Date().toISOString().slice(0, 10) : "",
      metodoPago: form.metodoPago,
      referenciaPago: form.metodoPago === "efectivo" ? "" : form.referenciaPago.trim(),
      observacion: form.observacion.trim(),
      confirmadoPorTesorero: estadoPago === "pagado" && montoPagado >= total && total > 0,
    });
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="edit-modal payment-modal" role="dialog" aria-modal="true" aria-labelledby="edit-cobro-title">
        <header>
          <div>
            <p className="eyebrow">Editar cobro</p>
            <h2 id="edit-cobro-title">{persona.nombre}</h2>
            <span className="modal-title-detail">
              Cuota {periodo?.numeroCuota ?? cobro.periodoId} · {periodo ? formatDate(periodo.fechaVencimiento) : "sin fecha"}
            </span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar editor de cobro">
            <X size={20} />
          </button>
        </header>

        <div className="modal-grid">
          <ModalField label="Cuota" error={touched && form.cuota < 0 ? "La cuota debe ser igual o mayor a cero." : undefined}>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={form.cuota || ""}
              onChange={(event) => updateForm("cuota", Number(event.target.value || 0))}
              onBlur={() => setTouched(true)}
            />
          </ModalField>

          <ModalField label="Seguro" error={touched && form.seguro < 0 ? "El seguro debe ser igual o mayor a cero." : undefined}>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={form.seguro || ""}
              onChange={(event) => updateForm("seguro", Number(event.target.value || 0))}
              onBlur={() => setTouched(true)}
            />
          </ModalField>

          <ModalField label="Monto recibido" error={touched && form.montoPagado < 0 ? "El monto debe ser igual o mayor a cero." : undefined}>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={form.montoPagado || ""}
              onChange={(event) => updateForm("montoPagado", Number(event.target.value || 0))}
              onBlur={() => setTouched(true)}
            />
          </ModalField>

          <ModalField label="Estado">
            <select value={form.estadoPago} onChange={(event) => updateForm("estadoPago", event.target.value as EstadoPago)}>
              {estadoOptions.filter((estado) => estado !== "todos").map((estado) => (
                <option key={estado} value={estado}>{estadoLabels[estado]}</option>
              ))}
            </select>
          </ModalField>

          <ModalField label="Fecha de pago">
            <input type="date" value={form.fechaPago} onChange={(event) => updateForm("fechaPago", event.target.value)} />
          </ModalField>

          <ModalField label="Metodo">
            <select value={form.metodoPago} onChange={(event) => handleMetodo(event.target.value as MetodoPago)}>
              {metodoOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </ModalField>
        </div>

        <section className={touched && missingReference ? "receipt-box modal-receipt invalid" : "receipt-box modal-receipt"}>
          <div className="receipt-heading">
            <span><ReceiptText size={15} /> Comprobante</span>
            <button type="button" className="cash-toggle" onClick={() => handleMetodo("efectivo")}>
              <Check size={15} /> Efectivo
            </button>
          </div>
          <label className="reference-input">
            <span>N° transferencia o transaccion</span>
            <input
              value={form.referenciaPago}
              onChange={(event) => updateForm("referenciaPago", event.target.value)}
              placeholder={form.metodoPago === "efectivo" ? "Pago en efectivo" : "Ej: 348921, BancoEstado, comprobante"}
              disabled={form.metodoPago === "efectivo"}
            />
            <small>{missingReference ? "Ingresa el numero o descripcion del comprobante." : "Este dato queda guardado en el cobro."}</small>
          </label>
        </section>

        <ModalField label="Observacion">
          <textarea
            value={form.observacion}
            onChange={(event) => updateForm("observacion", event.target.value)}
            rows={3}
          />
        </ModalField>

        <div className="modal-info payment-summary">
          <ReceiptText size={18} />
          <span>
            Total recalculado: {formatCurrency(totalEsperado)}. Saldo estimado: {formatCurrency(Math.max(totalEsperado - Number(form.montoPagado || 0), 0))}.
          </span>
        </div>

        {touched && hasErrors && (
          <div className="modal-error" role="alert">
            Revisa seguro, cuota, monto y comprobante antes de guardar.
          </div>
        )}

        <footer>
          <button className="secondary-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" onClick={handleSave}>
            <Check size={18} /> Guardar cobro
          </button>
        </footer>
      </section>
    </div>
  );
}

function PagoMultipleModal({
  state,
  personas,
  defaultPersonaId,
  onClose,
  onSave,
}: {
  state: TesoreriaState;
  personas: Emprendedor[];
  defaultPersonaId?: string;
  onClose: () => void;
  onSave: (
    ids: string[],
    detail: { fechaPago: string; metodoPago: MetodoPago; referenciaPago: string; observacion?: string },
  ) => void;
}) {
  const firstPersonaId = defaultPersonaId && personas.some((persona) => persona.id === defaultPersonaId)
    ? defaultPersonaId
    : personas[0]?.id ?? "";
  const [personaId, setPersonaId] = useState(firstPersonaId);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().slice(0, 10));
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("transferencia");
  const [referenciaPago, setReferenciaPago] = useState("");
  const [observacion, setObservacion] = useState("");
  const [touched, setTouched] = useState(false);

  const cobrosPersona = state.cobros
    .filter((cobro) => cobro.emprendedorId === personaId)
    .map((cobro) => ({
      cobro,
      periodo: state.periodos.find((periodo) => periodo.id === cobro.periodoId),
    }))
    .sort((a, b) => (a.periodo?.numeroCuota ?? 0) - (b.periodo?.numeroCuota ?? 0));
  const selectedCobros = cobrosPersona.filter(({ cobro }) => selectedIds.includes(cobro.id));
  const totalSeleccionado = selectedCobros.reduce((acc, { cobro }) => acc + cobro.totalEsperado, 0);
  const requiresReference = metodoPago !== "efectivo";
  const hasErrors = !personaId || !selectedIds.length || !fechaPago || (requiresReference && !referenciaPago.trim());
  const personaSeleccionada = personas.find((persona) => persona.id === personaId);
  const comprobanteLabel =
    metodoPago === "efectivo"
      ? "pago en efectivo"
      : metodoPago === "transferencia"
        ? "transferencia"
        : "comprobante";

  const changePersona = (value: string) => {
    setPersonaId(value);
    setSelectedIds([]);
    setTouched(false);
  };

  const toggleCobro = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const handleMetodo = (value: MetodoPago) => {
    setMetodoPago(value);
    if (value === "efectivo") setReferenciaPago("");
  };

  const handleSave = () => {
    setTouched(true);
    if (hasErrors) return;

    onSave(selectedIds, {
      fechaPago,
      metodoPago,
      referenciaPago,
      observacion,
    });
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="edit-modal payment-modal" role="dialog" aria-modal="true" aria-labelledby="multi-pay-title">
        <header>
          <div>
            <p className="eyebrow">Adelanto de pagos</p>
            <h2 id="multi-pay-title">Registrar pagos extra</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar pago por persona">
            <X size={20} />
          </button>
        </header>

        <div className="payment-steps">
          <span className="active">1 Persona</span>
          <span>2 Cuotas</span>
          <span>3 Comprobante</span>
        </div>

        <section className="payment-step-card">
          <div className="payment-step-title">
            <span>1</span>
            <div>
              <strong>Persona que paga</strong>
              <small>El adelanto o pago extra siempre corresponde a una sola persona.</small>
            </div>
          </div>
          <ModalField label="Persona">
            <select value={personaId} onChange={(event) => changePersona(event.target.value)}>
              {personas.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.nombre} · {persona.rut}
                </option>
              ))}
            </select>
          </ModalField>
        </section>

        <section className="payment-step-card multi-pay-list" aria-label="Cuotas disponibles">
          <div className="payment-step-title">
            <span>2</span>
            <div>
              <strong>Cuotas que cubre este pago</strong>
              <small>Selecciona una o varias cuotas de {personaSeleccionada?.nombre ?? "la persona"}.</small>
            </div>
          </div>
          <div className="multi-pay-list-header">
            <span>{selectedIds.length || 0} cuota{selectedIds.length === 1 ? "" : "s"} seleccionada{selectedIds.length === 1 ? "" : "s"}</span>
            <strong>{formatCurrency(totalSeleccionado)}</strong>
          </div>
          {cobrosPersona.map(({ cobro, periodo }) => (
            <label key={cobro.id} className={selectedIds.includes(cobro.id) ? "quota-option active" : "quota-option"}>
              <input
                type="checkbox"
                checked={selectedIds.includes(cobro.id)}
                onChange={() => toggleCobro(cobro.id)}
              />
              <span>
                <strong>Cuota {periodo?.numeroCuota ?? cobro.periodoId}</strong>
                <small>Vence {periodo ? formatDate(periodo.fechaVencimiento) : "sin fecha"} · {estadoLabels[cobro.estadoPago]}</small>
              </span>
              <b>{formatCurrency(cobro.totalEsperado)}</b>
            </label>
          ))}
          {!cobrosPersona.length && <p className="empty-state">Esta persona aun no tiene cuotas cargadas.</p>}
        </section>

        <section className="payment-step-card">
          <div className="payment-step-title">
            <span>3</span>
            <div>
              <strong>Comprobante que se asigna</strong>
              <small>Este mismo dato quedara guardado en todas las cuotas seleccionadas.</small>
            </div>
          </div>

          <div className="modal-grid">
            <ModalField label="Fecha de pago" error={touched && !fechaPago ? "Selecciona la fecha." : undefined}>
              <input type="date" value={fechaPago} onChange={(event) => setFechaPago(event.target.value)} />
            </ModalField>

            <ModalField label="Metodo">
              <select value={metodoPago} onChange={(event) => handleMetodo(event.target.value as MetodoPago)}>
                {metodoOptions.filter((option) => option.value).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </ModalField>
          </div>

          <section className={touched && requiresReference && !referenciaPago.trim() ? "receipt-box modal-receipt invalid" : "receipt-box modal-receipt"}>
            <div className="receipt-heading">
              <span><ReceiptText size={15} /> Comprobante</span>
              <button type="button" className="cash-toggle" onClick={() => handleMetodo("efectivo")}>
                <Check size={15} /> Efectivo
              </button>
            </div>
            <label className="reference-input">
              <span>{metodoPago === "transferencia" ? "N° transferencia" : "Referencia compartida"}</span>
              <input
                value={referenciaPago}
                onChange={(event) => setReferenciaPago(event.target.value)}
                placeholder={metodoPago === "efectivo" ? "Pago en efectivo" : "Ej: transferencia 348921"}
                disabled={metodoPago === "efectivo"}
              />
              <small>
                {touched && requiresReference && !referenciaPago.trim()
                  ? "Ingresa el numero o descripcion del comprobante."
                  : metodoPago === "efectivo"
                    ? "Para efectivo no necesitas numero de transferencia."
                    : "Se copiara en cada cuota seleccionada."}
              </small>
            </label>
          </section>

          <ModalField label="Observacion para estas cuotas">
            <textarea
              value={observacion}
              onChange={(event) => setObservacion(event.target.value)}
              rows={2}
              placeholder="Opcional"
            />
          </ModalField>
        </section>

        <div className="modal-info payment-summary">
          <ReceiptText size={18} />
          <span>
            Se registrara {comprobanteLabel} para {selectedIds.length || 0} cuota{selectedIds.length === 1 ? "" : "s"} de {personaSeleccionada?.nombre ?? "la persona"} por {formatCurrency(totalSeleccionado)}.
          </span>
        </div>

        {touched && hasErrors && (
          <div className="modal-error" role="alert">
            Selecciona al menos una cuota y completa los datos del comprobante.
          </div>
        )}

        <footer>
          <button className="secondary-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" onClick={handleSave} disabled={!selectedIds.length}>
            <Check size={18} /> Guardar pago
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
  min,
  step,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "date";
  min?: string;
  step?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="config-field">
      <span>{label}</span>
      <input
        type={type}
        min={min}
        step={step}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export default App;
