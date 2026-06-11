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
  Eye,
  FileImage,
  History,
  ImagePlus,
  Landmark,
  LogOut,
  LockKeyhole,
  Mail,
  MapPin,
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
  Store,
  Trash2,
  Upload,
  Users,
  WalletCards,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTesoreria } from "./hooks/useTesoreria";
import {
  getFirebaseMissingConfig,
  isFirebaseConfigured,
  createSolicitudEmprendimiento,
  signInFirebaseWithGoogle,
  signOutFirebase,
  subscribeFirebaseAuthState,
  subscribeSolicitudesEmprendimiento,
  updateSolicitudEmprendimiento,
} from "./services/firebase";
import type { Centro, CobroSemanal, ComprobanteAdjunto, ConfiguracionCes, ConfiguracionSeguridad, Emprendedor, Emprendimiento, EmprendimientoFoto, EstadoAsistencia, EstadoEmprendimiento, EstadoPago, EstadoPersona, EstadoSolicitudEmprendimiento, MetodoPago, MovimientoHistorial, PagoCes, Periodo, Reunion, SolicitudEmprendimiento, TesoreriaState } from "./types/tesoreria";
import { formatCurrency, formatDate } from "./utils/currency";
import { getPeriodoTotals } from "./utils/totals";

type Tab = "cobros" | "ces" | "personas" | "emprendimientos" | "asistencias" | "config";
type ConfigTab = "general" | "seguridad" | "historial" | "respaldo";
type PublicRoute = "home" | "form" | "admin";
type FiltroEstado = "todos" | EstadoPago;
type PersonaForm = Pick<Emprendedor, "nombre" | "rut" | "whatsapp" | "whatsappSecundario" | "nombreContactoSecundario" | "estado" | "fechaBaja" | "motivoBaja" | "observacionBaja" | "creditoOriginal" | "anillo" | "notas">;
type EmprendimientoForm = Omit<Emprendimiento, "id" | "createdAt" | "updatedAt">;
type SolicitudReviewForm = Omit<SolicitudEmprendimiento, "id" | "createdAt" | "updatedAt" | "estado" | "origen">;
type CobroEditForm = Pick<CobroSemanal, "cuota" | "seguro" | "montoPagado" | "estadoPago" | "fechaPago" | "metodoPago" | "referenciaPago" | "comprobanteAdjunto" | "observacion">;
type AuthUser = { email: string; nombre: string; foto?: string; authSource?: "google"; sessionVersion?: number };
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
const SUPERADMIN_RESET_PASSWORD = "1q2w3e4r.,*";
const MAX_COMPROBANTE_BYTES = 220 * 1024;
const MAX_IMAGE_BYTES = 120 * 1024;
const MAX_IMAGE_SIDE = 960;
const ACCEPTED_COMPROBANTE_TYPES = "image/*,application/pdf";
const MAX_EMPRENDIMIENTO_FOTOS = 4;
const ACCEPTED_FOTO_TYPES = "image/*";
const IMAGE_EXTENSION_PATTERN = /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i;

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

const emprendimientoEstadoLabels: Record<EstadoEmprendimiento, string> = {
  activo: "Activo",
  pausado: "Pausado",
  cerrado: "Cerrado",
};

const solicitudEstadoLabels: Record<EstadoSolicitudEmprendimiento, string> = {
  nueva: "Ingresada",
  revisada: "Revisada",
  convertida: "Publicada",
  descartada: "Descartada",
};

const emprendimientoEstadoOptions: EstadoEmprendimiento[] = ["activo", "pausado", "cerrado"];

const ANILLO_PERSONA_LABEL = "Anillo";
const PUBLIC_FORM_HASH = "ingresa-tu-emprendimiento";

const rubroSugerencias = [
  "Alimentos",
  "Comida preparada",
  "Pasteleria",
  "Chocolates",
  "Verduras",
  "Belleza y cuidado",
  "Ropa y accesorios",
  "Joyas y bisuteria",
  "Artesania",
  "Servicios",
  "Comercio",
  "Agricultura",
  "Mascotas",
  "Reparaciones",
  "Otro",
] as const;

const canalesVentaSugeridos = ["Local/casa", "Delivery", "A pedido", "Ferias", "Online", "Retiro"] as const;
const horariosSugeridos = ["Manana", "Tarde", "Noche", "Fin de semana", "Coordinar por WhatsApp"] as const;
const necesidadesSugeridas = ["Quiero aparecer en la vitrina", "Necesito actualizar datos", "Quiero agregar fotos", "Busco nuevos clientes", "Puedo recibir encargos"] as const;

type AppDialogTone = "info" | "warning" | "danger" | "success";
type AppDialogRequest = {
  id: number;
  type: "info" | "confirm" | "password";
  title: string;
  message: string;
  tone: AppDialogTone;
  confirmLabel: string;
  cancelLabel?: string;
  passwordLabel?: string;
  passwordPlaceholder?: string;
  resolve: (value: boolean | string | null) => void;
};

let dialogSubscriber: ((request: AppDialogRequest | null) => void) | null = null;
let activeDialog: AppDialogRequest | null = null;
const dialogQueue: AppDialogRequest[] = [];
let dialogId = 0;

const publishDialog = () => dialogSubscriber?.(activeDialog);

const openAppDialog = (request: Omit<AppDialogRequest, "id" | "resolve">) =>
  new Promise<boolean | string | null>((resolve) => {
    const nextRequest: AppDialogRequest = { ...request, id: dialogId += 1, resolve };
    if (activeDialog) {
      dialogQueue.push(nextRequest);
    } else {
      activeDialog = nextRequest;
      publishDialog();
    }
  });

const closeAppDialog = (value: boolean | string | null) => {
  const current = activeDialog;
  if (!current) return;
  activeDialog = null;
  current.resolve(value);
  activeDialog = dialogQueue.shift() ?? null;
  publishDialog();
};

const subscribeAppDialogs = (subscriber: (request: AppDialogRequest | null) => void) => {
  dialogSubscriber = subscriber;
  publishDialog();
  return () => {
    if (dialogSubscriber === subscriber) dialogSubscriber = null;
  };
};

const confirmarAccionCritica = async (
  mensaje: string,
  options?: Partial<Pick<AppDialogRequest, "title" | "tone" | "confirmLabel" | "cancelLabel">>,
) =>
  openAppDialog({
    type: "confirm",
    title: options?.title ?? "Semilla Emprende Negrete dice",
    message: mensaje,
    tone: options?.tone ?? "warning",
    confirmLabel: options?.confirmLabel ?? "Confirmar",
    cancelLabel: options?.cancelLabel ?? "Cancelar",
  }).then(Boolean);

const informarSistema = async (
  mensaje: string,
  options?: Partial<Pick<AppDialogRequest, "title" | "tone" | "confirmLabel">>,
) => {
  await openAppDialog({
    type: "info",
    title: options?.title ?? "Semilla Emprende Negrete informa",
    message: mensaje,
    tone: options?.tone ?? "info",
    confirmLabel: options?.confirmLabel ?? "Entendido",
  });
};

const solicitarPasswordSuperadmin = async (options?: Partial<Pick<AppDialogRequest, "message" | "confirmLabel" | "tone">>) =>
  openAppDialog({
    type: "password",
    title: "Semilla Emprende Negrete solicita autorizacion",
    message: options?.message ?? "Esta accion restablece el sistema con los valores por defecto. Ingresa la clave de superadmin para continuar.",
    tone: options?.tone ?? "danger",
    confirmLabel: options?.confirmLabel ?? "Validar y restablecer",
    cancelLabel: "Cancelar",
    passwordLabel: "Clave superadmin",
    passwordPlaceholder: "Ingresa la clave",
  }).then((value) => (typeof value === "string" ? value : null));

const metodoOptions: { label: string; value: MetodoPago }[] = [
  { label: "Metodo", value: "" },
  { label: "Efectivo", value: "efectivo" },
  { label: "Transferencia", value: "transferencia" },
  { label: "Otro", value: "otro" },
];

const getReferenciaLabel = (metodoPago: MetodoPago) => {
  if (metodoPago === "efectivo") return "N° voucher/boleta";
  if (metodoPago === "otro") return "Referencia del documento";
  return "Referencia";
};

const getReferenciaPlaceholder = (metodoPago: MetodoPago) => {
  if (metodoPago === "efectivo") return "Ej: voucher 1284, boleta 55";
  if (metodoPago === "otro") return "Ej: comprobante, vale, folio";
  return "Opcional";
};

const transferenciaRequiereAdjunto = (metodoPago: MetodoPago) => metodoPago === "transferencia";

const estadoActionClass = (estadoActual: EstadoPago, estadoBoton: EstadoPago, base = "") =>
  ["state-action", base, estadoActual === estadoBoton ? "action-selected" : ""].filter(Boolean).join(" ");

const pressFeedbackSelector = "button, label.secondary-button, .quota-option";

const validarComprobanteTransferencia = async (metodoPago: MetodoPago, comprobanteAdjunto?: ComprobanteAdjunto | null) => {
  if (!transferenciaRequiereAdjunto(metodoPago) || comprobanteAdjunto) return true;
  await informarSistema("Para registrar una transferencia como pagada, adjunta primero el comprobante enviado.", {
    tone: "warning",
  });
  return false;
};

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

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });

const isImageFile = (file: File) =>
  file.type.startsWith("image/") || IMAGE_EXTENSION_PATTERN.test(file.name);

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo preparar la imagen."));
    image.src = src;
  });

const compressImageFile = async (file: File) => {
  const objectUrl = URL.createObjectURL(file);
  let dataUrl = "";
  try {
    const image = await loadImage(objectUrl);
    const ratio = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * ratio));
    const height = Math.max(1, Math.round(image.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo comprimir la imagen.");
    context.drawImage(image, 0, 0, width, height);

    let quality = 0.76;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length > MAX_IMAGE_BYTES * 1.37 && quality > 0.46) {
      quality -= 0.07;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  if (dataUrl.length > MAX_IMAGE_BYTES * 1.37) {
    throw new Error("La imagen sigue siendo muy pesada. Envia una captura mas liviana o recortada.");
  }

  return {
    dataUrl,
    tipo: "image/jpeg",
    tamano: Math.round((dataUrl.length * 3) / 4),
    nombre: file.name.replace(/\.[^.]+$/, "") + ".jpg",
  };
};

const createComprobanteAdjunto = async (file: File): Promise<ComprobanteAdjunto> => {
  if (isImageFile(file)) {
    const image = await compressImageFile(file);
    return { ...image, createdAt: new Date().toISOString() };
  }

  if (file.type !== "application/pdf") {
    throw new Error("Solo se aceptan imagenes o PDF.");
  }

  if (file.size > MAX_COMPROBANTE_BYTES) {
    throw new Error(`El PDF supera ${formatFileSize(MAX_COMPROBANTE_BYTES)}. Sube una version mas liviana o una captura.`);
  }

  return {
    nombre: file.name,
    tipo: file.type,
    dataUrl: await readFileAsDataUrl(file),
    tamano: file.size,
    createdAt: new Date().toISOString(),
  };
};

const createEmprendimientoFoto = async (file: File): Promise<EmprendimientoFoto> => {
  if (!isImageFile(file)) {
    throw new Error("Solo se aceptan imagenes para la central de emprendimientos.");
  }

  const image = await compressImageFile(file);
  return {
    id: `foto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...image,
    createdAt: new Date().toISOString(),
  };
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const loadAuthSession = () => {
  if (isFirebaseConfigured) return null;
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

const getFirebaseAuthErrorDetail = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  if (code === "auth/unauthorized-domain") {
    return `auth/unauthorized-domain: agrega ${window.location.hostname} en Firebase Authentication > Settings > Authorized domains.`;
  }
  return [code, message].filter(Boolean).join(": ");
};

const clearStoredAuthSession = () => {
  window.sessionStorage.removeItem(AUTH_SESSION_KEY);
  window.localStorage.removeItem(AUTH_SESSION_KEY);
};

const getPublicRoute = (): PublicRoute => {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash === "admin" || hash === "login" || hash === "sistema") return "admin";
  if (hash === PUBLIC_FORM_HASH || hash === "formulario") return "form";
  return "home";
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

const matchesEmprendimientoSearch = (
  emprendimiento: Emprendimiento,
  persona: Emprendedor | undefined,
  query: string,
) =>
  matchesPersonaSearch(persona, query, [
    emprendimiento.nombre,
    emprendimiento.rubro,
    emprendimiento.descripcion,
    emprendimiento.direccion,
    emprendimiento.sector,
    emprendimiento.whatsapp,
    emprendimiento.correo,
    emprendimiento.redesSociales,
    emprendimientoEstadoLabels[emprendimiento.estado],
    emprendimiento.creditoOrigen,
    emprendimiento.notas,
    ...emprendimiento.fotos.map((foto) => foto.nombre),
  ]);

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
  const [dialogRequest, setDialogRequest] = useState<AppDialogRequest | null>(null);
  const [publicRoute, setPublicRoute] = useState<PublicRoute>(() => getPublicRoute());
  const isAdminRoute = publicRoute === "admin";
  const {
    state,
    cloudStatus,
    cloudError,
    personasPorId,
    updateCentro,
    updatePeriodo,
    updateEmprendedor,
    crearEmprendimiento,
    updateEmprendimiento,
    eliminarEmprendimiento,
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
  } = useTesoreria({
    syncEnabled: Boolean(authUser && isAdminRoute),
    publicReadEnabled: !isAdminRoute,
    updatedBy: authUser?.email,
  });
  const [solicitudes, setSolicitudes] = useState<SolicitudEmprendimiento[]>([]);
  const [solicitudesError, setSolicitudesError] = useState("");
  const [tab, setTab] = useState<Tab>("cobros");
  const [periodoId, setPeriodoId] = useState(() => getSemanaCobroInicial(state.periodos));
  const [reunionId, setReunionId] = useState(state.reuniones[0]?.id ?? "");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [personaActiva, setPersonaActiva] = useState<string | null>(null);
  const [personaEditando, setPersonaEditando] = useState<Emprendedor | null>(null);
  const [emprendimientoEditando, setEmprendimientoEditando] = useState<Emprendimiento | null>(null);
  const [solicitudRevisando, setSolicitudRevisando] = useState<SolicitudEmprendimiento | null>(null);
  const [nuevoEmprendimientoAbierto, setNuevoEmprendimientoAbierto] = useState(false);
  const [cobroEditandoId, setCobroEditandoId] = useState<string | null>(null);
  const [pagoMultipleAbierto, setPagoMultipleAbierto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => subscribeAppDialogs(setDialogRequest), []);

  useEffect(() => {
    const handleHash = () => setPublicRoute(getPublicRoute());
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  useEffect(() => {
    if (!authUser || !isFirebaseConfigured) {
      setSolicitudes([]);
      setSolicitudesError("");
      return;
    }

    return subscribeSolicitudesEmprendimiento(
      setSolicitudes,
      setSolicitudesError,
    );
  }, [authUser]);

  useEffect(() => {
    const applyPressFeedback = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return;
      const element = target.closest<HTMLElement>(pressFeedbackSelector);
      if (!element || element.matches(":disabled")) return;

      element.classList.add("press-feedback");
      window.setTimeout(() => element.classList.remove("press-feedback"), 220);
    };

    const handlePointerDown = (event: PointerEvent) => applyPressFeedback(event.target);
    const handlePointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (!(event.target instanceof Element)) return;
      const element = event.target.closest<HTMLElement>(pressFeedbackSelector);
      if (!element || element.matches(":disabled")) return;
      element.classList.add("hover-feedback");
    };
    const handlePointerOut = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (!(event.target instanceof Element)) return;
      const element = event.target.closest<HTMLElement>(pressFeedbackSelector);
      element?.classList.remove("hover-feedback");
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      applyPressFeedback(event.target);
    };

    document.addEventListener("pointerdown", handlePointerDown, { passive: true });
    document.addEventListener("pointerover", handlePointerOver, { passive: true });
    document.addEventListener("pointerout", handlePointerOut, { passive: true });
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerover", handlePointerOver);
      document.removeEventListener("pointerout", handlePointerOut);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const correosAutorizados = useMemo(
    () => normalizeEmailList([
      ...state.configuracion.seguridad.correosAutorizados,
      ...ENV_AUTHORIZED_EMAILS,
    ]),
    [state.configuracion.seguridad.correosAutorizados],
  );

  useEffect(() => {
    if (!isFirebaseConfigured) return;

    return subscribeFirebaseAuthState((firebaseUser) => {
      if (!firebaseUser?.email) {
        clearStoredAuthSession();
        setAuthUser(null);
        return;
      }

      const user: AuthUser = {
        email: firebaseUser.email.toLowerCase(),
        nombre: firebaseUser.displayName ?? firebaseUser.email,
        foto: firebaseUser.photoURL ?? undefined,
        authSource: "google",
        sessionVersion: AUTH_SESSION_VERSION,
      };
      const isAllowed = !correosAutorizados.length || correosAutorizados.includes(user.email);

      if (!isAllowed) {
        clearStoredAuthSession();
        void signOutFirebase();
        setAuthUser(null);
        setAuthError(`La cuenta ${user.email} no esta autorizada para ver este sistema.`);
        return;
      }

      window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(user));
      window.sessionStorage.removeItem(AUTH_SESSION_KEY);
      setAuthUser(user);
      setAuthError("");
    });
  }, [correosAutorizados]);

  const handleGoogleLogin = async () => {
    setAuthError("");
    let credential: Awaited<ReturnType<typeof signInFirebaseWithGoogle>>;
    try {
      credential = await signInFirebaseWithGoogle();
    } catch (error) {
      console.error("Firebase Auth no pudo iniciar sesion con Google.", error);
      const detail = getFirebaseAuthErrorDetail(error);
      setAuthError(`No se pudo activar Firebase Auth. Revisa que Google este habilitado en Firebase Authentication y que el dominio este autorizado.${detail ? ` Detalle: ${detail}` : ""}`);
      return;
    }

    const firebaseUser = credential?.user;
    if (!firebaseUser?.email) {
      setAuthError("Google no entrego un correo valido para activar la sesion.");
      return;
    }

    const user: AuthUser = {
      email: firebaseUser.email.toLowerCase(),
      nombre: firebaseUser.displayName ?? firebaseUser.email,
      foto: firebaseUser.photoURL ?? undefined,
    };
    const email = user.email.toLowerCase();
    const isAllowed = !correosAutorizados.length || correosAutorizados.includes(email);

    if (!isAllowed) {
      clearStoredAuthSession();
      void signOutFirebase();
      setAuthUser(null);
      setAuthError(`La cuenta ${email} no esta autorizada para ver este sistema.`);
      return;
    }

    const sessionUser: AuthUser = { ...user, authSource: "google", sessionVersion: AUTH_SESSION_VERSION };
    window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(sessionUser));
    window.sessionStorage.removeItem(AUTH_SESSION_KEY);
    setAuthUser(sessionUser);
    setAuthError("");
  };

  const handleLogout = async () => {
    const confirmed = await confirmarAccionCritica("Cerrar sesion? Tendras que volver a ingresar con tu cuenta de Google.", {
      title: "Semilla Emprende Negrete dice",
      tone: "warning",
      confirmLabel: "Cerrar sesion",
    });
    if (!confirmed) return;
    clearStoredAuthSession();
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

  const emprendimientosFiltrados = useMemo(
    () =>
      state.emprendimientos.filter((emprendimiento) =>
        matchesEmprendimientoSearch(emprendimiento, personasPorId.get(emprendimiento.emprendedorId), busqueda),
      ),
    [busqueda, personasPorId, state.emprendimientos],
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
      ["tipo", "periodo", "vencimiento", "nombre", "rut", "whatsapp_principal", "whatsapp_secundario", "nombre_contacto_secundario", "estado_persona", "fecha_baja", "motivo_baja", "credito", "cuota", "seguro", "total", "pagado", "estado", "fecha_pago", "metodo", "referencia_pago", "comprobante_adjunto", "observacion", "acta"],
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
          cobro.comprobanteAdjunto?.nombre ?? "",
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
          pago.comprobanteAdjunto?.nombre ?? "",
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
            "",
            asistencia.observacion || reunion.observacion,
            reunion.acta,
          ];
        }),
      ),
      ...state.emprendimientos.map((emprendimiento) => {
        const persona = personasPorId.get(emprendimiento.emprendedorId);
        return [
          "emprendimiento",
          emprendimiento.periodoOrigenId ?? "",
          "",
          persona?.nombre ?? "",
          persona?.rut ?? "",
          persona?.whatsapp ?? "",
          persona?.whatsappSecundario ?? "",
          persona?.nombreContactoSecundario ?? "",
          persona ? personaEstadoLabels[persona.estado] : "",
          persona?.fechaBaja ?? "",
          persona?.motivoBaja ?? "",
          emprendimiento.creditoOrigen ?? persona?.creditoOriginal ?? "",
          "",
          "",
          "",
          "",
          emprendimiento.estado,
          "",
          emprendimiento.rubro,
          `${emprendimiento.direccion}${emprendimiento.sector ? ` · ${emprendimiento.sector}` : ""}`,
          emprendimiento.fotos.map((foto) => foto.nombre).join("; "),
          `${emprendimiento.nombre}. ${emprendimiento.descripcion}${emprendimiento.notas ? ` · ${emprendimiento.notas}` : ""}`,
          [emprendimiento.whatsapp, emprendimiento.correo, emprendimiento.redesSociales].filter(Boolean).join(" · "),
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
    link.download = `sistema-semilla-emprende-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const confirmed = await confirmarAccionCritica("Importar este respaldo reemplazara los datos guardados actualmente en este navegador. Deseas continuar?", {
      title: "Semilla Emprende Negrete advierte",
      tone: "danger",
      confirmLabel: "Importar respaldo",
    });
    if (!confirmed) {
      event.target.value = "";
      return;
    }

    const content = await file.text();
    importar(JSON.parse(content) as TesoreriaState);
    event.target.value = "";
  };

  const handleReset = async () => {
    const confirmed = await confirmarAccionCritica("Restablecer para inicio conservara usuarios, centro, periodos y configuraciones. Se reiniciaran cobros, CES, emprendimientos y reuniones, y la accion quedara registrada en auditoria.", {
      title: "Semilla Emprende Negrete advierte",
      tone: "danger",
      confirmLabel: "Continuar",
    });
    if (!confirmed) return;
    const password = await solicitarPasswordSuperadmin();
    if (password === null) return;
    if (password !== SUPERADMIN_RESET_PASSWORD) {
      await informarSistema("La clave de superadmin no coincide. No se restablecieron los valores.", {
        title: "Semilla Emprende Negrete informa",
        tone: "danger",
      });
      return;
    }
    resetear();
    await informarSistema("El sistema fue restablecido con los valores por defecto.", {
      title: "Semilla Emprende Negrete informa",
      tone: "success",
    });
  };

  const goPublicHome = () => {
    window.location.hash = "";
    setPublicRoute("home");
  };

  const goPublicForm = () => {
    window.location.hash = PUBLIC_FORM_HASH;
    setPublicRoute("form");
    scrollToTop();
  };

  const goAdminLogin = () => {
    window.location.hash = "admin";
    setPublicRoute("admin");
    scrollToTop();
  };

  const resolvePersonaSolicitud = (form: SolicitudReviewForm) =>
    state.emprendedores.find((persona) => persona.id === form.emprendedorId) ??
    state.emprendedores.find((persona) => cleanRut(persona.rut) === cleanRut(form.rut));

  const guardarRevisionSolicitud = async (solicitud: SolicitudEmprendimiento, form: SolicitudReviewForm) => {
    await updateSolicitudEmprendimiento(solicitud.id, {
      ...form,
      estado: solicitud.estado === "nueva" ? "revisada" : solicitud.estado,
    });
    registrarMovimiento({
      tipo: "emprendimiento",
      accion: "Solicitud de emprendimiento corregida",
      detalle: `${form.nombreEmprendimiento || solicitud.nombreEmprendimiento}. Se guardaron correcciones antes de publicar.`,
      entidadId: solicitud.id,
      personaId: form.emprendedorId,
      personaNombre: form.nombreContacto,
    });
    setSolicitudRevisando(null);
  };

  const publicarSolicitud = async (solicitud: SolicitudEmprendimiento, form: SolicitudReviewForm) => {
    const persona = resolvePersonaSolicitud(form);
    if (!persona) {
      await informarSistema("No se puede publicar porque la solicitud no esta asociada a una persona registrada. Revisa el RUT o la persona asociada.", {
        tone: "danger",
      });
      return;
    }

    const confirmed = await confirmarAccionCritica(`Publicar "${form.nombreEmprendimiento}" en la vitrina publica? Se creara un emprendimiento activo visible para cualquier persona que entre al sitio.`, {
      title: "Semilla Emprende Negrete advierte",
      tone: "warning",
      confirmLabel: "Continuar",
    });
    if (!confirmed) return;

    const password = await solicitarPasswordSuperadmin({
      message: "Para publicar un emprendimiento en la vitrina se requiere clave superadmin.",
      confirmLabel: "Autorizar publicacion",
      tone: "warning",
    });
    if (password === null) return;
    if (password !== SUPERADMIN_RESET_PASSWORD) {
      await informarSistema("La clave de superadmin no coincide. El emprendimiento no fue publicado.", {
        tone: "danger",
      });
      return;
    }

    await updateSolicitudEmprendimiento(solicitud.id, {
      ...form,
      emprendedorId: persona.id,
      rut: formatRut(persona.rut),
      creditoOriginal: persona.creditoOriginal,
      estado: "convertida",
    });

    const emprendimientoId = crearEmprendimiento({
      emprendedorId: persona.id,
      nombre: form.nombreEmprendimiento.trim(),
      rubro: form.rubro.trim(),
      descripcion: form.descripcion.trim(),
      direccion: form.direccion.trim(),
      sector: [form.sector.trim(), form.comuna.trim() && form.comuna.trim() !== "Negrete" ? form.comuna.trim() : ""].filter(Boolean).join(" · "),
      whatsapp: formatWhatsapp(form.whatsapp),
      correo: form.correo.trim().toLowerCase(),
      redesSociales: form.redesSociales.trim(),
      estado: "activo",
      periodoOrigenId: form.periodoValidadoId ?? "",
      creditoOrigen: form.creditoOriginal || persona.creditoOriginal,
      fotos: form.fotos,
      notas: [
        form.notas?.trim(),
        form.canalesVenta.length ? `Canales: ${form.canalesVenta.join(", ")}` : "",
        form.horarios.length ? `Horarios: ${form.horarios.join(", ")}` : "",
        form.necesidades.length ? `Necesidades declaradas: ${form.necesidades.join(", ")}` : "",
      ].filter(Boolean).join(" | "),
    });

    registrarMovimiento({
      tipo: "emprendimiento",
      accion: "Solicitud de emprendimiento publicada",
      detalle: `${form.nombreEmprendimiento} fue aprobada desde la tabla de ingresados y publicada en la vitrina. Solicitud origen: ${solicitud.id}.`,
      entidadId: emprendimientoId,
      personaId: persona.id,
      personaNombre: persona.nombre,
    });
    setSolicitudRevisando(null);
    await informarSistema("El emprendimiento fue publicado y ya queda disponible en la pagina principal.", {
      tone: "success",
    });
  };

  if (!isAdminRoute) {
    return (
      <main className="public-shell">
        <AppDialogHost request={dialogRequest} />
        <PublicHome
          route={publicRoute}
          centro={state.centro}
          emprendimientos={state.emprendimientos}
          personasPorId={personasPorId}
          personas={state.emprendedores}
          cobros={state.cobros}
          periodo={periodo}
          onLogin={goAdminLogin}
          onHome={goPublicHome}
          onOpenForm={goPublicForm}
          onSubmitSolicitud={async (payload) => {
            try {
              await createSolicitudEmprendimiento(payload);
              await informarSistema("Recibimos los datos del emprendimiento. El equipo los revisara para agregarlos a la central.", {
                title: "Semilla Emprende Negrete informa",
                tone: "success",
              });
              goPublicHome();
            } catch (error) {
              await informarSistema(error instanceof Error ? error.message : "No se pudo enviar el formulario. Intentalo nuevamente.", {
                title: "Semilla Emprende Negrete informa",
                tone: "danger",
              });
            }
          }}
        />
      </main>
    );
  }

  if (!authUser) {
    return (
      <LoginGate
        allowedEmails={correosAutorizados}
        error={authError}
        onLogin={handleGoogleLogin}
        onPublicHome={goPublicHome}
      />
    );
  }

  return (
    <main className={`app-shell section-${tab}`}>
      <AppDialogHost request={dialogRequest} />
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
        <button className={tab === "emprendimientos" ? "active" : ""} onClick={() => goToTab("emprendimientos")}>
          <Store size={18} /> Central
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
                  onPagar={async () => {
                    if (!(await validarComprobanteTransferencia(cobro.metodoPago, cobro.comprobanteAdjunto))) return;
                    marcarPagado(cobro.id);
                  }}
                  onEstado={async (estado) => {
                    if (estado === "pagado" && !(await validarComprobanteTransferencia(cobro.metodoPago, cobro.comprobanteAdjunto))) return;
                    cambiarEstado(cobro.id, estado);
                  }}
                  onMonto={async (monto) => {
                    if (monto >= cobro.totalEsperado && !(await validarComprobanteTransferencia(cobro.metodoPago, cobro.comprobanteAdjunto))) return;
                    registrarMonto(cobro.id, monto);
                  }}
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
                  onPagar={async () => {
                    if (!(await validarComprobanteTransferencia(pago.metodoPago, pago.comprobanteAdjunto))) return;
                    marcarCesPagado(pago.id);
                  }}
                  onEstado={async (estado) => {
                    if (estado === "pagado" && !(await validarComprobanteTransferencia(pago.metodoPago, pago.comprobanteAdjunto))) return;
                    cambiarEstadoCes(pago.id, estado);
                  }}
                  onMonto={async (monto) => {
                    if (monto >= pago.totalEsperado && !(await validarComprobanteTransferencia(pago.metodoPago, pago.comprobanteAdjunto))) return;
                    registrarMontoCes(pago.id, monto);
                  }}
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
              onRegistrarNotificacion={({ persona, contacto, accion }) => {
                registrarMovimiento({
                  tipo: "notificacion",
                  accion: `WhatsApp ${accion.label}`,
                  detalle: `Se preparo mensaje "${accion.label}" para ${persona.nombre} al contacto ${contacto.label} (${formatWhatsapp(contacto.value)}).`,
                  personaId: persona.id,
                  personaNombre: persona.nombre,
                });
              }}
            />
          </div>
        </section>
      )}

      {tab === "emprendimientos" && (
        <EmprendimientosPanel
          emprendimientos={emprendimientosFiltrados}
          totalEmprendimientos={state.emprendimientos.length}
          personas={state.emprendedores}
          personasPorId={personasPorId}
          periodos={state.periodos}
          solicitudes={solicitudes}
          solicitudesError={solicitudesError}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          onNuevo={() => setNuevoEmprendimientoAbierto(true)}
          onEditar={setEmprendimientoEditando}
          onEliminar={async (emprendimiento) => {
            const confirmed = await confirmarAccionCritica(`Eliminar "${emprendimiento.nombre}" de la central? Se quitaran sus datos y fotos guardadas. Esta accion queda registrada y no se puede deshacer automaticamente.`, {
              title: "Semilla Emprende Negrete advierte",
              tone: "danger",
              confirmLabel: "Eliminar",
            });
            if (!confirmed) return;
            eliminarEmprendimiento(emprendimiento.id);
          }}
          onPersona={(personaId) => {
            setPersonaActiva(personaId);
            goToTab("personas");
          }}
          onSolicitudRevisar={setSolicitudRevisando}
          onSolicitudEstado={async (id, estado) => {
            try {
              await updateSolicitudEmprendimiento(id, { estado });
              const solicitud = solicitudes.find((item) => item.id === id);
              registrarMovimiento({
                tipo: "emprendimiento",
                accion: "Solicitud de emprendimiento actualizada",
                detalle: `${solicitud?.nombreEmprendimiento ?? "Solicitud"} quedo en estado ${estado}. Origen formulario publico.`,
                entidadId: id,
                personaNombre: solicitud?.nombreContacto,
              });
            } catch (error) {
              await informarSistema(error instanceof Error ? error.message : "No se pudo actualizar la solicitud.", {
                tone: "danger",
              });
            }
          }}
        />
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

      {nuevoEmprendimientoAbierto && (
        <EmprendimientoModal
          personas={state.emprendedores}
          periodos={state.periodos}
          onClose={() => setNuevoEmprendimientoAbierto(false)}
          onSave={(payload) => {
            crearEmprendimiento(payload);
            setNuevoEmprendimientoAbierto(false);
          }}
        />
      )}

      {emprendimientoEditando && (
        <EmprendimientoModal
          emprendimiento={emprendimientoEditando}
          personas={state.emprendedores}
          periodos={state.periodos}
          onClose={() => setEmprendimientoEditando(null)}
          onSave={(payload) => {
            updateEmprendimiento(emprendimientoEditando.id, payload);
            setEmprendimientoEditando(null);
          }}
        />
      )}

      {solicitudRevisando && (
        <SolicitudRevisionModal
          solicitud={solicitudRevisando}
          personas={state.emprendedores}
          periodos={state.periodos}
          onClose={() => setSolicitudRevisando(null)}
          onSave={(form) => guardarRevisionSolicitud(solicitudRevisando, form)}
          onPublish={(form) => publicarSolicitud(solicitudRevisando, form)}
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

function PublicHome({
  route,
  centro,
  emprendimientos,
  personasPorId,
  personas,
  cobros,
  periodo,
  onLogin,
  onHome,
  onOpenForm,
  onSubmitSolicitud,
}: {
  route: PublicRoute;
  centro: Centro;
  emprendimientos: Emprendimiento[];
  personasPorId: Map<string, Emprendedor>;
  personas: Emprendedor[];
  cobros: CobroSemanal[];
  periodo?: Periodo;
  onLogin: () => void;
  onHome: () => void;
  onOpenForm: () => void;
  onSubmitSolicitud: (payload: Omit<SolicitudEmprendimiento, "id" | "createdAt" | "updatedAt" | "estado" | "origen">) => Promise<void>;
}) {
  const [busquedaPublica, setBusquedaPublica] = useState("");
  const [rubroActivo, setRubroActivo] = useState("Todos");
  const emprendimientosActivos = emprendimientos.filter((item) => item.estado === "activo");
  const rubros = ["Todos", ...Array.from(new Set(emprendimientosActivos.map((item) => item.rubro).filter(Boolean))).sort()];
  const rubrosPublicados = rubros.length - 1;
  const emprendimientosVisibles = emprendimientosActivos.filter((item) => {
    const persona = personasPorId.get(item.emprendedorId);
    const matchesRubro = rubroActivo === "Todos" || item.rubro === rubroActivo;
    return matchesRubro && matchesEmprendimientoSearch(item, persona, busquedaPublica);
  });

  return (
    <>
      <header className="public-header">
        <button className="public-brand" onClick={onHome}>
          <span><Sprout size={21} /></span>
          <strong>Semilla Emprende Negrete</strong>
        </button>
        <nav>
          <button className="secondary-button" onClick={onOpenForm}>Ingresa tu emprendimiento</button>
          <button className="primary-button" onClick={onLogin}>Login</button>
        </nav>
      </header>

      {route === "form" ? (
        <PublicEmprendimientoForm
          personas={personas}
          cobros={cobros}
          periodo={periodo}
          onHome={onHome}
          onSubmit={onSubmitSolicitud}
        />
      ) : (
        <>
          <section className="public-hero">
            <div>
              <p className="eyebrow">Negrete · Bio Bio</p>
              <h1>Emprendimientos con raiz local</h1>
              <p>Una vitrina comunitaria para conocer oficios, productos y servicios de participantes de {centro.nombreCentro}.</p>
            </div>
            <button className="primary-button" onClick={onOpenForm}>
              <Plus size={18} /> Ingresa tu emprendimiento
            </button>
          </section>

          <section className="public-negrete-panel" aria-label="Informacion de Negrete">
            <div className="public-negrete-copy">
              <p className="eyebrow">Territorio y comunidad</p>
              <h2>Negrete se mueve desde sus barrios, campos y familias emprendedoras.</h2>
              <p>
                Este espacio reune iniciativas locales para que vecinos, compradores y redes de apoyo puedan encontrarlas,
                compartirlas y contactarlas con facilidad.
              </p>
            </div>
            <div className="public-negrete-facts">
              <span><MapPin size={16} /> Comuna de la Provincia de Bio Bio</span>
              <span><Users size={16} /> Red de participantes del centro</span>
              <span><Store size={16} /> Productos, servicios y oficios locales</span>
            </div>
          </section>

          <section className="public-stat-strip" aria-label="Resumen de la vitrina">
            <div>
              <strong>{emprendimientosActivos.length}</strong>
              <span>emprendimientos publicados</span>
            </div>
            <div>
              <strong>{rubrosPublicados}</strong>
              <span>rubros disponibles</span>
            </div>
            <div>
              <strong>{personas.length}</strong>
              <span>participantes del sistema</span>
            </div>
          </section>

          <section className="public-toolbar">
            <div className="public-section-heading">
              <p className="eyebrow">Vitrina local</p>
              <h2>Explora los emprendimientos</h2>
            </div>
            <SearchInput
              value={busquedaPublica}
              onChange={setBusquedaPublica}
              placeholder="Buscar por rubro, nombre, sector o contacto"
            />
            <div className="public-rubro-strip" aria-label="Rubros">
              {rubros.map((rubro) => (
                <button
                  key={rubro}
                  className={rubroActivo === rubro ? "chip active" : "chip"}
                  onClick={() => setRubroActivo(rubro)}
                >
                  {rubro}
                </button>
              ))}
            </div>
          </section>

          <section className="public-venture-grid">
            {emprendimientosVisibles.map((emprendimiento) => (
              <PublicEmprendimientoCard
                key={emprendimiento.id}
                emprendimiento={emprendimiento}
                persona={personasPorId.get(emprendimiento.emprendedorId)}
              />
            ))}
            {!emprendimientosVisibles.length && (
              <article className="public-empty">
                <Store size={24} />
                <strong>Aun no hay emprendimientos publicados para esta busqueda.</strong>
                <span>El primero puede ingresar sus datos desde el formulario publico.</span>
              </article>
            )}
          </section>
        </>
      )}
    </>
  );
}

function PublicEmprendimientoCard({
  emprendimiento,
  persona,
}: {
  emprendimiento: Emprendimiento;
  persona?: Emprendedor;
}) {
  const foto = emprendimiento.fotos[0];
  const shareText = `${emprendimiento.nombre} - ${emprendimiento.rubro || "Emprendimiento"}${emprendimiento.whatsapp ? ` - WhatsApp ${formatWhatsapp(emprendimiento.whatsapp)}` : ""}`;
  const whatsappHref = emprendimiento.whatsapp ? buildWhatsappUrl(emprendimiento.whatsapp, `Hola, vi tu emprendimiento ${emprendimiento.nombre} en la central y quiero consultar.`) : "";

  const copyCard = async () => {
    await navigator.clipboard.writeText(`${shareText}\n${window.location.href}`);
    await informarSistema("Ficha copiada para compartir.", { tone: "success" });
  };

  return (
    <article className="public-venture-card">
      <div className="public-venture-media">
        {foto ? <img src={foto.dataUrl} alt={emprendimiento.nombre} /> : <Store size={34} />}
      </div>
      <div className="public-venture-content">
        <p className="eyebrow">{emprendimiento.rubro || "Emprendimiento"}</p>
        <h2>{emprendimiento.nombre}</h2>
        <span className="public-owner">{persona?.nombre ?? "Participante del centro"}</span>
        {emprendimiento.descripcion && <p>{emprendimiento.descripcion}</p>}
        <div className="public-venture-facts">
          {(emprendimiento.direccion || emprendimiento.sector) && <span><MapPin size={15} /> {[emprendimiento.direccion, emprendimiento.sector].filter(Boolean).join(" · ")}</span>}
          {emprendimiento.whatsapp && <span><Phone size={15} /> {formatWhatsapp(emprendimiento.whatsapp)}</span>}
          {emprendimiento.correo && <span><Mail size={15} /> {emprendimiento.correo}</span>}
          {emprendimiento.redesSociales && <span><MessageCircle size={15} /> {emprendimiento.redesSociales}</span>}
        </div>
        <div className="public-card-actions">
          {whatsappHref && <a className="primary-button" href={whatsappHref} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Contactar</a>}
          <button className="secondary-button" onClick={copyCard}><Send size={16} /> Compartir</button>
        </div>
      </div>
    </article>
  );
}

function PublicEmprendimientoForm({
  personas,
  cobros,
  periodo,
  onHome,
  onSubmit,
}: {
  personas: Emprendedor[];
  cobros: CobroSemanal[];
  periodo?: Periodo;
  onHome: () => void;
  onSubmit: (payload: Omit<SolicitudEmprendimiento, "id" | "createdAt" | "updatedAt" | "estado" | "origen">) => Promise<void>;
}) {
  const [form, setForm] = useState<Omit<SolicitudEmprendimiento, "id" | "createdAt" | "updatedAt" | "estado" | "origen">>({
    rut: "",
    emprendedorId: "",
    periodoValidadoId: "",
    creditoOriginal: 0,
    nombreContacto: "",
    whatsapp: "",
    correo: "",
    nombreEmprendimiento: "",
    rubro: "",
    descripcion: "",
    direccion: "",
    sector: "",
    comuna: "Negrete",
    canalesVenta: [],
    horarios: [],
    redesSociales: "",
    necesidades: ["Quiero aparecer en la vitrina"],
    fotos: [],
    notas: "",
  });
  const [customRubro, setCustomRubro] = useState("");
  const [rutConsultado, setRutConsultado] = useState(false);
  const [personaValidada, setPersonaValidada] = useState<Emprendedor | null>(null);
  const [touched, setTouched] = useState(false);
  const [fotoError, setFotoError] = useState("");
  const [fotoLoading, setFotoLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const personasDelPeriodo = useMemo(() => {
    const idsPeriodo = new Set(cobros.filter((cobro) => cobro.periodoId === periodo?.id).map((cobro) => cobro.emprendedorId));
    const base = idsPeriodo.size ? personas.filter((persona) => idsPeriodo.has(persona.id)) : personas;
    return base.filter((persona) => persona.estado === "activa");
  }, [cobros, periodo?.id, personas]);

  useEffect(() => {
    if (!rutConsultado || !personaValidada) return;
    const personaActualizada =
      personasDelPeriodo.find((persona) => persona.id === personaValidada.id) ??
      personasDelPeriodo.find((persona) => cleanRut(persona.rut) === cleanRut(form.rut));
    if (!personaActualizada) return;

    setPersonaValidada(personaActualizada);
    const whatsappRegistrado = formatWhatsapp(personaActualizada.whatsapp || personaActualizada.whatsappSecundario || "");
    if (!whatsappRegistrado) return;

    setForm((current) => {
      if (current.whatsapp.trim()) return current;
      return { ...current, whatsapp: whatsappRegistrado };
    });
  }, [form.rut, personaValidada, personasDelPeriodo, rutConsultado]);

  const contactoValido = Boolean(form.whatsapp.trim() || form.correo.trim());
  const fichaValidadaSinWhatsapp = Boolean(
    rutConsultado &&
      personaValidada &&
      !form.whatsapp.trim() &&
      !personaValidada.whatsapp &&
      !personaValidada.whatsappSecundario,
  );
  const errors = {
    rut: personaValidada ? "" : "Ingresa un RUT que este registrado en el periodo de pagos vigente.",
    nombreContacto: form.nombreContacto.trim() ? "" : "Indica tu nombre.",
    nombreEmprendimiento: form.nombreEmprendimiento.trim() ? "" : "Indica como se llama el emprendimiento.",
    rubro: form.rubro.trim() ? "" : "Elige o escribe un rubro.",
    contacto: contactoValido ? "" : "Deja al menos WhatsApp o correo.",
    whatsapp: isValidWhatsapp(form.whatsapp) ? "" : "Revisa el WhatsApp.",
    correo: !form.correo.trim() || isValidEmail(form.correo.trim()) ? "" : "Revisa el correo.",
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const updateForm = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const validarRut = () => {
    const rutFormateado = formatRut(form.rut);
    const persona = personasDelPeriodo.find((item) => cleanRut(item.rut) === cleanRut(rutFormateado));
    setRutConsultado(true);
    setPersonaValidada(persona ?? null);

    if (!persona) {
      setForm((current) => ({
        ...current,
        rut: rutFormateado,
        emprendedorId: "",
        periodoValidadoId: "",
        creditoOriginal: 0,
      }));
      return;
    }

    setForm((current) => ({
      ...current,
      rut: formatRut(persona.rut),
      emprendedorId: persona.id,
      periodoValidadoId: periodo?.id ?? "",
      creditoOriginal: persona.creditoOriginal,
      nombreContacto: current.nombreContacto.trim() || persona.nombre,
      whatsapp: formatWhatsapp(persona.whatsapp || persona.whatsappSecundario || current.whatsapp),
    }));
  };

  const toggleOption = (key: "canalesVenta" | "horarios" | "necesidades", value: string) => {
    setForm((current) => {
      const selected = current[key].includes(value);
      return {
        ...current,
        [key]: selected ? current[key].filter((item) => item !== value) : [...current[key], value],
      };
    });
  };

  const handleFotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    if (form.fotos.length + files.length > 3) {
      setFotoError("Puedes enviar hasta 3 fotos en este formulario.");
      return;
    }
    setFotoError("");
    setFotoLoading(true);
    try {
      const fotos = await Promise.all(files.map(createEmprendimientoFoto));
      updateForm("fotos", [...form.fotos, ...fotos]);
    } catch (error) {
      setFotoError(error instanceof Error ? error.message : "No se pudo preparar la foto.");
    } finally {
      setFotoLoading(false);
    }
  };

  const submit = async () => {
    setTouched(true);
    if (hasErrors || submitting) return;
    setSubmitting(true);
    await onSubmit({
      ...form,
      rut: formatRut(form.rut),
      emprendedorId: personaValidada?.id ?? form.emprendedorId,
      periodoValidadoId: periodo?.id ?? form.periodoValidadoId,
      creditoOriginal: personaValidada?.creditoOriginal ?? form.creditoOriginal ?? 0,
      nombreContacto: form.nombreContacto.trim(),
      whatsapp: formatWhatsapp(form.whatsapp),
      correo: form.correo.trim().toLowerCase(),
      nombreEmprendimiento: form.nombreEmprendimiento.trim(),
      rubro: form.rubro === "Otro" ? customRubro.trim() || "Otro" : form.rubro,
      descripcion: form.descripcion.trim(),
      direccion: form.direccion.trim(),
      sector: form.sector.trim(),
      comuna: form.comuna.trim(),
      redesSociales: form.redesSociales.trim(),
      notas: form.notas?.trim() ?? "",
    });
    setSubmitting(false);
  };

  return (
    <section className="public-form-page">
      <button className="secondary-button public-back-button" onClick={onHome}>Volver a la vitrina</button>
      <header>
        <p className="eyebrow">Formulario publico</p>
        <h1>Ingresa tu emprendimiento</h1>
        <p>Completa lo esencial. Las opciones rapidas ayudan a publicar mejor tu ficha.</p>
      </header>

      <section className="public-form-card">
        <div className="public-form-step">
          <span>1</span>
          <strong>Validacion de participante</strong>
        </div>
        <div className="rut-validation-panel">
          <ModalField
            label="RUT de la persona registrada"
            error={rutConsultado && !personaValidada ? errors.rut : undefined}
            hint={periodo ? `Debe coincidir con una persona activa de la cuota ${periodo.numeroCuota}.` : "Debe coincidir con una persona activa del sistema."}
          >
            <input
              value={form.rut}
              onChange={(event) => {
                updateForm("rut", event.target.value.toUpperCase());
                setRutConsultado(false);
                setPersonaValidada(null);
              }}
              onBlur={() => updateForm("rut", formatRut(form.rut))}
              inputMode="text"
              placeholder="12.345.678-9"
            />
          </ModalField>
          <button className="secondary-button" type="button" onClick={validarRut}>
            <Search size={16} /> Validar RUT
          </button>
        </div>
        {personaValidada && (
          <div className="rut-match-card">
            <Check size={17} />
            <div>
              <strong>{personaValidada.nombre}</strong>
              <span>{formatRut(personaValidada.rut)} · credito {formatCurrency(personaValidada.creditoOriginal)}</span>
            </div>
          </div>
        )}
        {fichaValidadaSinWhatsapp && (
          <p className="receipt-help warning">
            El RUT fue validado, pero la ficha cargada no trae WhatsApp. Si el numero existe en el sistema, revisa que la nube este sincronizada; por ahora puedes ingresarlo manualmente.
          </p>
        )}
        {rutConsultado && !personaValidada && (
          <p className="receipt-help warning">No encontramos este RUT en las personas activas del periodo vigente. Revisa el numero o contacta al equipo antes de enviar el emprendimiento.</p>
        )}
      </section>

      <section className="public-form-card">
        <div className="public-form-step">
          <span>2</span>
          <strong>Datos de contacto</strong>
        </div>
        <div className="modal-grid">
          <ModalField label="Tu nombre" error={touched ? errors.nombreContacto : undefined}>
            <input value={form.nombreContacto} onChange={(event) => updateForm("nombreContacto", event.target.value)} />
          </ModalField>
          <ModalField label="WhatsApp" error={touched ? errors.whatsapp || errors.contacto : undefined}>
            <input value={form.whatsapp} onChange={(event) => updateForm("whatsapp", event.target.value)} inputMode="tel" placeholder="+56 9 1234 5678" />
          </ModalField>
          <ModalField label="Correo" error={touched ? errors.correo || errors.contacto : undefined}>
            <input value={form.correo} onChange={(event) => updateForm("correo", event.target.value)} inputMode="email" placeholder="correo@ejemplo.cl" />
          </ModalField>
        </div>
      </section>

      <section className="public-form-card">
        <div className="public-form-step">
          <span>3</span>
          <strong>Emprendimiento</strong>
        </div>
        <div className="modal-grid">
          <ModalField label="Nombre de emprendimiento o negocio" error={touched ? errors.nombreEmprendimiento : undefined}>
            <input value={form.nombreEmprendimiento} onChange={(event) => updateForm("nombreEmprendimiento", event.target.value)} placeholder="Ej: Pan amasado de Maria" />
          </ModalField>
          <ModalField label="Comuna">
            <input value={form.comuna} onChange={(event) => updateForm("comuna", event.target.value)} />
          </ModalField>
          <ModalField label="Sector">
            <input value={form.sector} onChange={(event) => updateForm("sector", event.target.value)} placeholder="Villa, poblacion, rural, centro" />
          </ModalField>
          <ModalField label="Direccion o referencia">
            <input value={form.direccion} onChange={(event) => updateForm("direccion", event.target.value)} placeholder="Opcional" />
          </ModalField>
        </div>

        <div className="guided-field">
          <span>Rubro</span>
          <div className="option-grid">
            {rubroSugerencias.map((rubro) => (
              <button key={rubro} className={form.rubro === rubro ? "chip active" : "chip"} onClick={() => updateForm("rubro", rubro)}>
                {rubro}
              </button>
            ))}
          </div>
          {form.rubro === "Otro" && (
            <input className="guided-extra-input" value={customRubro} onChange={(event) => setCustomRubro(event.target.value)} placeholder="Escribe el rubro" />
          )}
          {touched && errors.rubro && <small className="field-error">{errors.rubro}</small>}
        </div>

        <ModalField label="Que vendes o que servicio ofreces">
          <textarea value={form.descripcion} onChange={(event) => updateForm("descripcion", event.target.value)} rows={4} placeholder="Ej: pan amasado, tortas a pedido, tejidos, reparaciones..." />
        </ModalField>
      </section>

      <section className="public-form-card">
        <div className="public-form-step">
          <span>4</span>
          <strong>Como atiendes</strong>
        </div>
        <GuidedOptions label="Canales de venta" values={canalesVentaSugeridos} selected={form.canalesVenta} onToggle={(value) => toggleOption("canalesVenta", value)} />
        <GuidedOptions label="Horarios" values={horariosSugeridos} selected={form.horarios} onToggle={(value) => toggleOption("horarios", value)} />
        <GuidedOptions label="Que necesitas" values={necesidadesSugeridas} selected={form.necesidades} onToggle={(value) => toggleOption("necesidades", value)} />
        <ModalField label="Redes sociales">
          <input value={form.redesSociales} onChange={(event) => updateForm("redesSociales", event.target.value)} placeholder="@instagram, Facebook o enlace" />
        </ModalField>
      </section>

      <section className="public-form-card">
        <div className="public-form-step">
          <span>5</span>
          <strong>Fotos y nota final</strong>
        </div>
        <label className={fotoLoading || form.fotos.length >= 3 ? "secondary-button disabled public-photo-button" : "secondary-button public-photo-button"}>
          {fotoLoading ? <span className="inline-spinner" aria-hidden="true" /> : <ImagePlus size={16} />}
          {fotoLoading ? "Redimensionando fotos" : "Agregar fotos"}
          <input type="file" accept={ACCEPTED_FOTO_TYPES} multiple disabled={fotoLoading || form.fotos.length >= 3} onChange={handleFotos} />
        </label>
        {fotoLoading && <small className="attachment-help">Optimizando imagenes antes de guardarlas en Firebase.</small>}
        {fotoError && <small className="attachment-error">{fotoError}</small>}
        <div className="public-photo-preview">
          {form.fotos.map((foto) => (
            <figure key={foto.id}>
              <img src={foto.dataUrl} alt={foto.nombre} />
              <button type="button" className="danger-icon-button" onClick={() => updateForm("fotos", form.fotos.filter((item) => item.id !== foto.id))} aria-label={`Quitar ${foto.nombre}`}>
                <Trash2 size={15} />
              </button>
            </figure>
          ))}
        </div>
        <ModalField label="Algo importante que debamos saber">
          <textarea value={form.notas ?? ""} onChange={(event) => updateForm("notas", event.target.value)} rows={3} placeholder="Opcional" />
        </ModalField>
      </section>

      {touched && hasErrors && <div className="modal-error">Revisa los campos marcados para enviar el formulario.</div>}
      <button className="primary-button public-submit-button" onClick={submit} disabled={submitting}>
        <Check size={18} /> {submitting ? "Enviando" : "Enviar emprendimiento"}
      </button>
    </section>
  );
}

function GuidedOptions({
  label,
  values,
  selected,
  onToggle,
}: {
  label: string;
  values: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="guided-field">
      <span>{label}</span>
      <div className="option-grid">
        {values.map((value) => (
          <button key={value} className={selected.includes(value) ? "chip active" : "chip"} onClick={() => onToggle(value)} type="button">
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

function LoginGate({
  allowedEmails,
  error,
  onLogin,
  onPublicHome,
}: {
  allowedEmails: string[];
  error: string;
  onLogin: () => Promise<void> | void;
  onPublicHome: () => void;
}) {
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleLogin = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      await onLogin();
    } finally {
      setIsSigningIn(false);
    }
  };

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
        <button className="secondary-button login-back-button" onClick={onPublicHome}>
          Volver a vitrina publica
        </button>
        <p className="eyebrow">Acceso privado</p>
        <h1>Acceso Administración</h1>
        <p className="login-copy">
          Gestiona cobros, asistencia y acuerdos del centro con una cuenta Google autorizada.
        </p>

        <button className="google-login-button" type="button" onClick={handleLogin} disabled={isSigningIn}>
          {isSigningIn ? <span className="inline-spinner" aria-hidden="true" /> : <span className="google-mark">G</span>}
          {isSigningIn ? "Conectando con Google" : "Acceder con Google"}
        </button>

        {error && <div className="login-error">{error}</div>}

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

function AppDialogHost({ request }: { request: AppDialogRequest | null }) {
  const [password, setPassword] = useState("");

  useEffect(() => {
    setPassword("");
  }, [request?.id]);

  if (!request) return null;

  const isPassword = request.type === "password";
  const isInfo = request.type === "info";
  const confirmClass = request.tone === "danger"
    ? "danger-button"
    : request.tone === "success"
      ? "primary-button success-button"
      : "primary-button";
  const icon =
    request.tone === "success" ? <CheckCircle2 size={22} /> :
      request.tone === "danger" || request.tone === "warning" ? <AlertTriangle size={22} /> :
        <Sprout size={22} />;

  const confirm = () => {
    closeAppDialog(isPassword ? password : true);
  };

  return (
    <div className="modal-backdrop app-dialog-backdrop" role="presentation">
      <section className={`app-dialog ${request.tone}`} role="dialog" aria-modal="true" aria-labelledby={`app-dialog-title-${request.id}`}>
        <header>
          <div className="app-dialog-icon">{icon}</div>
          <div>
            <p className="eyebrow">Sistema</p>
            <h2 id={`app-dialog-title-${request.id}`}>{request.title}</h2>
          </div>
        </header>
        <p className="app-dialog-message">{request.message}</p>
        {isPassword && (
          <label className="modal-field app-dialog-password">
            <span>{request.passwordLabel}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={request.passwordPlaceholder}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter" && password) confirm();
              }}
            />
          </label>
        )}
        <footer>
          {!isInfo && (
            <button className="secondary-button" onClick={() => closeAppDialog(null)}>
              {request.cancelLabel ?? "Cancelar"}
            </button>
          )}
          <button className={confirmClass} onClick={confirm} disabled={isPassword && !password}>
            {request.confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ComprobanteAdjuntoInput({
  adjunto,
  onChange,
}: {
  adjunto?: ComprobanteAdjunto | null;
  onChange: (adjunto: ComprobanteAdjunto | null) => void;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const currentAdjunto = adjunto ?? undefined;

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (currentAdjunto) {
      const confirmed = await confirmarAccionCritica(`Reemplazar "${currentAdjunto.nombre}" por "${file.name}"? El comprobante anterior se quitara de este registro y esta accion quedara en auditoria.`, {
        title: "Semilla Emprende Negrete advierte",
        tone: "warning",
        confirmLabel: "Reemplazar",
      });
      if (!confirmed) return;
    }

    setError("");
    setLoading(true);
    try {
      onChange(await createComprobanteAdjunto(file));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No se pudo adjuntar el comprobante.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!currentAdjunto) return;
    const confirmed = await confirmarAccionCritica(`Quitar "${currentAdjunto.nombre}" de este registro? El comprobante dejara de estar disponible y esta accion quedara en auditoria.`, {
      title: "Semilla Emprende Negrete advierte",
      tone: "danger",
      confirmLabel: "Quitar",
    });
    if (!confirmed) return;
    setPreviewOpen(false);
    onChange(null);
  };

  return (
    <div className="attachment-control">
      <div className={currentAdjunto ? "attachment-card" : "attachment-card empty"}>
        <FileImage size={17} />
        <div>
          <strong>{currentAdjunto ? currentAdjunto.nombre : "Sin archivo adjunto"}</strong>
          <span>
            {currentAdjunto
              ? `${formatFileSize(currentAdjunto.tamano)} · ${formatDateTime(currentAdjunto.createdAt)}`
              : `Imagen o PDF liviano. Maximo ${formatFileSize(MAX_COMPROBANTE_BYTES)}.`}
          </span>
        </div>
      </div>
      <div className="attachment-actions">
        <label className={loading ? "secondary-button disabled" : "secondary-button"}>
          {loading ? <span className="inline-spinner" aria-hidden="true" /> : <Upload size={16} />}
          {loading ? "Redimensionando" : currentAdjunto ? "Cambiar" : "Subir"}
          <input
            type="file"
            accept={ACCEPTED_COMPROBANTE_TYPES}
            onChange={handleFile}
            disabled={loading}
          />
        </label>
        {loading && <small className="attachment-help">Preparando archivo optimizado para sincronizar en Firebase.</small>}
        {currentAdjunto && (
          <>
            <button type="button" className="secondary-button" onClick={() => {
              setZoom(1);
              setPreviewOpen(true);
            }}>
              <Eye size={16} /> Ver
            </button>
            <button type="button" className="danger-button compact" onClick={handleRemove}>
              <Trash2 size={16} /> Quitar
            </button>
          </>
        )}
      </div>
      {error && <small className="attachment-error">{error}</small>}
      {previewOpen && currentAdjunto && (
        <div className="modal-backdrop" role="presentation">
          <section className="attachment-preview-modal" role="dialog" aria-modal="true" aria-labelledby="attachment-preview-title">
            <header>
              <div>
                <p className="eyebrow">Comprobante</p>
                <h2 id="attachment-preview-title">{currentAdjunto.nombre}</h2>
                <span>{formatFileSize(currentAdjunto.tamano)} · {formatDateTime(currentAdjunto.createdAt)}</span>
              </div>
              <button className="icon-button" onClick={() => setPreviewOpen(false)} aria-label="Cerrar comprobante">
                <X size={20} />
              </button>
            </header>
            <div className="preview-toolbar">
              <div className="zoom-controls" aria-label="Zoom del comprobante">
                <button type="button" onClick={() => setZoom((current) => Math.max(current - 0.2, 0.6))} aria-label="Disminuir zoom">
                  <ZoomOut size={18} />
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => setZoom((current) => Math.min(current + 0.2, 2.4))} aria-label="Aumentar zoom">
                  <ZoomIn size={18} />
                </button>
              </div>
              <a className="secondary-button" href={currentAdjunto.dataUrl} download={currentAdjunto.nombre}>
                <Download size={16} /> Descargar
              </a>
            </div>
            <div className="preview-stage">
              {currentAdjunto.tipo.startsWith("image/") ? (
                <img src={currentAdjunto.dataUrl} alt={`Comprobante ${currentAdjunto.nombre}`} style={{ transform: `scale(${zoom})` }} />
              ) : (
                <iframe title={`Comprobante ${currentAdjunto.nombre}`} src={currentAdjunto.dataUrl} style={{ transform: `scale(${zoom})` }} />
              )}
            </div>
          </section>
        </div>
      )}
    </div>
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
    emprendimientos: {
      title: "Central de emprendimientos",
      detail: "Fotos, rubros, direccion y contactos comerciales",
      icon: <Store size={20} />,
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
  onDetalle: (detail: { fechaPago?: string; metodoPago?: MetodoPago; referenciaPago?: string; comprobanteAdjunto?: ComprobanteAdjunto | null; observacion?: string }) => void;
  onEditarCobro: () => void;
  onPersona: () => void;
}) {
  const saldo = Math.max(cobro.totalEsperado - cobro.montoPagado, 0);
  const marcarEfectivo = () => onDetalle({ metodoPago: "efectivo" });

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
        <button className={estadoActionClass(cobro.estadoPago, "pagado", "pay-button")} onClick={onPagar} aria-pressed={cobro.estadoPago === "pagado"}>
          <Check size={18} /> Pagado
        </button>
        <button className={estadoActionClass(cobro.estadoPago, "parcial")} onClick={() => onEstado("parcial")} aria-pressed={cobro.estadoPago === "parcial"}>Parcial</button>
        <button className={estadoActionClass(cobro.estadoPago, "pendiente")} onClick={() => onEstado("pendiente")} aria-pressed={cobro.estadoPago === "pendiente"}>Pendiente</button>
        <button className={estadoActionClass(cobro.estadoPago, "atrasado")} onClick={() => onEstado("atrasado")} aria-pressed={cobro.estadoPago === "atrasado"}>
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
          <button type="button" className={cobro.metodoPago === "efectivo" ? "cash-toggle active" : "cash-toggle"} onClick={marcarEfectivo} aria-pressed={cobro.metodoPago === "efectivo"}>
            <Check size={15} /> Efectivo
          </button>
        </div>
        {cobro.metodoPago === "transferencia" ? (
          <p className={cobro.comprobanteAdjunto ? "receipt-help" : "receipt-help warning"}>Para transferencia basta con adjuntar el comprobante enviado.</p>
        ) : (
          <label className="reference-input">
            <span>{getReferenciaLabel(cobro.metodoPago)}</span>
            <input
              value={cobro.referenciaPago}
              onChange={(event) => onDetalle({ referenciaPago: event.target.value })}
              placeholder={getReferenciaPlaceholder(cobro.metodoPago)}
            />
          </label>
        )}
        <ComprobanteAdjuntoInput
          adjunto={cobro.comprobanteAdjunto}
          onChange={(comprobanteAdjunto) => onDetalle({ comprobanteAdjunto })}
        />
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
  onRegistrarNotificacion,
}: {
  persona?: Emprendedor;
  state: TesoreriaState;
  onEditarPersona: (persona: Emprendedor) => void;
  onRegistrarNotificacion: (input: {
    persona: Emprendedor;
    contacto: { key: string; label: string; value: string };
    accion: { key: string; label: string; message: string };
  }) => void;
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
                  onClick={() => onRegistrarNotificacion({ persona, contacto, accion: action })}
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
  onDetalle: (detail: { fechaPago?: string; metodoPago?: MetodoPago; referenciaPago?: string; comprobanteAdjunto?: ComprobanteAdjunto | null; observacion?: string }) => void;
  onEditarPersona: () => void;
  onPersona: () => void;
}) {
  const saldo = Math.max(pago.totalEsperado - pago.montoPagado, 0);
  const marcarEfectivo = () => onDetalle({ metodoPago: "efectivo" });

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
        <button className={estadoActionClass(pago.estadoPago, "pagado", "pay-button")} onClick={onPagar} aria-pressed={pago.estadoPago === "pagado"}>
          <Check size={18} /> Pagado
        </button>
        <button className={estadoActionClass(pago.estadoPago, "parcial")} onClick={() => onEstado("parcial")} aria-pressed={pago.estadoPago === "parcial"}>Parcial</button>
        <button className={estadoActionClass(pago.estadoPago, "pendiente")} onClick={() => onEstado("pendiente")} aria-pressed={pago.estadoPago === "pendiente"}>Pendiente</button>
        <button className={estadoActionClass(pago.estadoPago, "atrasado")} onClick={() => onEstado("atrasado")} aria-pressed={pago.estadoPago === "atrasado"}>
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
          <button type="button" className={pago.metodoPago === "efectivo" ? "cash-toggle active" : "cash-toggle"} onClick={marcarEfectivo} aria-pressed={pago.metodoPago === "efectivo"}>
            <Check size={15} /> Efectivo
          </button>
        </div>
        {pago.metodoPago === "transferencia" ? (
          <p className={pago.comprobanteAdjunto ? "receipt-help" : "receipt-help warning"}>Para transferencia basta con adjuntar el comprobante enviado.</p>
        ) : (
          <label className="reference-input">
            <span>{getReferenciaLabel(pago.metodoPago)}</span>
            <input
              value={pago.referenciaPago}
              onChange={(event) => onDetalle({ referenciaPago: event.target.value })}
              placeholder={getReferenciaPlaceholder(pago.metodoPago)}
            />
          </label>
        )}
        <ComprobanteAdjuntoInput
          adjunto={pago.comprobanteAdjunto}
          onChange={(comprobanteAdjunto) => onDetalle({ comprobanteAdjunto })}
        />
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

function EmprendimientosPanel({
  emprendimientos,
  totalEmprendimientos,
  personas,
  personasPorId,
  solicitudes,
  solicitudesError,
  busqueda,
  onBusqueda,
  onNuevo,
  onEditar,
  onEliminar,
  onPersona,
  onSolicitudRevisar,
  onSolicitudEstado,
}: {
  emprendimientos: Emprendimiento[];
  totalEmprendimientos: number;
  personas: Emprendedor[];
  personasPorId: Map<string, Emprendedor>;
  periodos: Periodo[];
  solicitudes: SolicitudEmprendimiento[];
  solicitudesError: string;
  busqueda: string;
  onBusqueda: (value: string) => void;
  onNuevo: () => void;
  onEditar: (emprendimiento: Emprendimiento) => void;
  onEliminar: (emprendimiento: Emprendimiento) => void;
  onPersona: (personaId: string) => void;
  onSolicitudRevisar: (solicitud: SolicitudEmprendimiento) => void;
  onSolicitudEstado: (id: string, estado: SolicitudEmprendimiento["estado"]) => void;
}) {
  const activos = emprendimientos.filter((item) => item.estado === "activo").length;

  return (
    <section className="workspace ventures-panel">
      <div className="venture-toolbar">
        <SearchInput
          value={busqueda}
          onChange={onBusqueda}
          placeholder="Buscar emprendimiento, persona, rubro o contacto"
        />
        <button className="primary-button" onClick={onNuevo}>
          <Plus size={18} /> Nuevo emprendimiento
        </button>
      </div>

      <section className="summary-grid compact venture-summary">
        <SummaryCard icon={<Store />} label="Registrados" value={String(totalEmprendimientos)} />
        <SummaryCard icon={<CheckCircle2 />} label="Activos" value={String(activos)} tone="success" />
        <SummaryCard icon={<Users />} label="Personas" value={String(new Set(emprendimientos.map((item) => item.emprendedorId)).size)} tone="info" />
        <SummaryCard icon={<ImagePlus />} label="Fotos" value={String(emprendimientos.reduce((total, item) => total + item.fotos.length, 0))} />
      </section>

      <div className="venture-grid">
        {emprendimientos.map((emprendimiento) => (
          <EmprendimientoCard
            key={emprendimiento.id}
            emprendimiento={emprendimiento}
            persona={personasPorId.get(emprendimiento.emprendedorId)}
            onEditar={() => onEditar(emprendimiento)}
            onEliminar={() => onEliminar(emprendimiento)}
            onPersona={() => onPersona(emprendimiento.emprendedorId)}
          />
        ))}
        {!emprendimientos.length && (
          <section className="empty-state venture-empty">
            <Store size={22} />
            <span>
              {personas.length
                ? "Aun no hay emprendimientos para esta busqueda. Crea el primero desde el boton Nuevo emprendimiento."
                : "Primero deben existir personas registradas para asociar emprendimientos."}
            </span>
          </section>
        )}
      </div>

      <SolicitudesEmprendimientoPanel
        solicitudes={solicitudes}
        error={solicitudesError}
        onRevisar={onSolicitudRevisar}
        onEstado={onSolicitudEstado}
      />
    </section>
  );
}

function SolicitudesEmprendimientoPanel({
  solicitudes,
  error,
  onRevisar,
  onEstado,
}: {
  solicitudes: SolicitudEmprendimiento[];
  error: string;
  onRevisar: (solicitud: SolicitudEmprendimiento) => void;
  onEstado: (id: string, estado: SolicitudEmprendimiento["estado"]) => void;
}) {
  const ingresadas = solicitudes.filter((solicitud) => solicitud.estado === "nueva").length;

  return (
    <section className="venture-requests">
      <header>
        <div>
          <p className="eyebrow">Tabla de ingresados</p>
          <h2>Emprendimientos por revisar</h2>
        </div>
        <span>{ingresadas} ingresada{ingresadas === 1 ? "" : "s"}</span>
      </header>
      {error && <p className="config-note warning-note">{error}</p>}
      <div className="venture-request-list">
        {solicitudes.map((solicitud) => (
          <article className={`venture-request-card ${solicitud.estado}`} key={solicitud.id}>
            <header>
              <div>
                <strong>{solicitud.nombreEmprendimiento}</strong>
                <span>{solicitud.nombreContacto} · {solicitud.rubro}</span>
              </div>
              <span className={`badge ${solicitud.estado}`}>{solicitudEstadoLabels[solicitud.estado]}</span>
            </header>
            <p>{solicitud.descripcion || "Sin descripcion."}</p>
            <div className="venture-request-meta">
              {solicitud.rut && <span><ReceiptText size={14} /> {formatRut(solicitud.rut)}</span>}
              {solicitud.whatsapp && <span><Phone size={14} /> {formatWhatsapp(solicitud.whatsapp)}</span>}
              {solicitud.correo && <span><Mail size={14} /> {solicitud.correo}</span>}
              {solicitud.creditoOriginal ? <span><WalletCards size={14} /> Credito {formatCurrency(solicitud.creditoOriginal)}</span> : null}
              {(solicitud.comuna || solicitud.sector) && <span><MapPin size={14} /> {[solicitud.comuna, solicitud.sector].filter(Boolean).join(" · ")}</span>}
            </div>
            <div className="venture-request-tags">
              {[...solicitud.canalesVenta, ...solicitud.horarios, ...solicitud.necesidades].slice(0, 6).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <footer>
              <small>{formatDateTime(solicitud.createdAt)}</small>
              <div>
                <button className="primary-button" onClick={() => onRevisar(solicitud)}>
                  <Pencil size={15} /> Revisar
                </button>
                <button className="secondary-button" onClick={() => onEstado(solicitud.id, "revisada")}>Revisada</button>
                <button className="danger-button" onClick={() => onEstado(solicitud.id, "descartada")}>Descartar</button>
              </div>
            </footer>
          </article>
        ))}
        {!solicitudes.length && !error && <p className="empty-state">Aun no hay solicitudes recibidas desde el formulario publico.</p>}
      </div>
    </section>
  );
}

function EmprendimientoCard({
  emprendimiento,
  persona,
  onEditar,
  onEliminar,
  onPersona,
}: {
  emprendimiento: Emprendimiento;
  persona?: Emprendedor;
  onEditar: () => void;
  onEliminar: () => void;
  onPersona: () => void;
}) {
  const fotoPrincipal = emprendimiento.fotos[0];
  const whatsappHref = emprendimiento.whatsapp ? buildWhatsappUrl(emprendimiento.whatsapp, `Hola, vi tu emprendimiento ${emprendimiento.nombre} y quiero consultar.`) : "";

  return (
    <article className={`venture-card ${emprendimiento.estado}`}>
      <div className="venture-photo">
        {fotoPrincipal ? (
          <img src={fotoPrincipal.dataUrl} alt={emprendimiento.nombre} />
        ) : (
          <Store size={32} />
        )}
        <span className={`badge ${emprendimiento.estado}`}>{emprendimientoEstadoLabels[emprendimiento.estado]}</span>
      </div>

      <div className="venture-body">
        <header>
          <div>
            <p className="eyebrow">{emprendimiento.rubro || "Sin rubro"}</p>
            <h2>{emprendimiento.nombre}</h2>
          </div>
          <div className="card-header-actions">
            <button className="icon-button" onClick={onEditar} aria-label={`Editar ${emprendimiento.nombre}`}>
              <Pencil size={17} />
            </button>
            <button className="danger-icon-button" onClick={onEliminar} aria-label={`Eliminar ${emprendimiento.nombre}`}>
              <Trash2 size={17} />
            </button>
          </div>
        </header>

        <button className="venture-owner" onClick={onPersona}>
          <Users size={15} />
          <span>{persona?.nombre ?? "Persona no encontrada"}</span>
        </button>

        {emprendimiento.descripcion && <p className="venture-description">{emprendimiento.descripcion}</p>}

        <div className="venture-detail-list">
          {(emprendimiento.direccion || emprendimiento.sector) && (
            <span><MapPin size={15} /> {[emprendimiento.direccion, emprendimiento.sector].filter(Boolean).join(" · ")}</span>
          )}
          {emprendimiento.whatsapp && <span><Phone size={15} /> {formatWhatsapp(emprendimiento.whatsapp)}</span>}
          {emprendimiento.correo && <span><Mail size={15} /> {emprendimiento.correo}</span>}
          {emprendimiento.redesSociales && <span><MessageCircle size={15} /> {emprendimiento.redesSociales}</span>}
        </div>

        <div className="venture-actions">
          {whatsappHref && (
            <a className="secondary-button" href={whatsappHref} target="_blank" rel="noreferrer">
              <MessageCircle size={16} /> WhatsApp
            </a>
          )}
          {emprendimiento.correo && (
            <a className="secondary-button" href={`mailto:${emprendimiento.correo}`}>
              <Mail size={16} /> Correo
            </a>
          )}
        </div>

        {emprendimiento.fotos.length > 1 && (
          <div className="venture-thumbs" aria-label="Fotos del emprendimiento">
            {emprendimiento.fotos.slice(1).map((foto) => (
              <img key={foto.id} src={foto.dataUrl} alt={foto.nombre} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

const splitSolicitudList = (value: string) =>
  value
    .split(/[\n,;]/)
    .map((item) => item.trim())
    .filter(Boolean);

function SolicitudRevisionModal({
  solicitud,
  personas,
  periodos,
  onClose,
  onSave,
  onPublish,
}: {
  solicitud: SolicitudEmprendimiento;
  personas: Emprendedor[];
  periodos: Periodo[];
  onClose: () => void;
  onSave: (form: SolicitudReviewForm) => void | Promise<void>;
  onPublish: (form: SolicitudReviewForm) => void | Promise<void>;
}) {
  const personaInicial =
    personas.find((persona) => persona.id === solicitud.emprendedorId) ??
    personas.find((persona) => cleanRut(persona.rut) === cleanRut(solicitud.rut));
  const [form, setForm] = useState<SolicitudReviewForm>(() => ({
    rut: solicitud.rut || personaInicial?.rut || "",
    emprendedorId: solicitud.emprendedorId || personaInicial?.id || "",
    periodoValidadoId: solicitud.periodoValidadoId || "",
    creditoOriginal: solicitud.creditoOriginal || personaInicial?.creditoOriginal || 0,
    nombreContacto: solicitud.nombreContacto,
    whatsapp: solicitud.whatsapp,
    correo: solicitud.correo,
    nombreEmprendimiento: solicitud.nombreEmprendimiento,
    rubro: solicitud.rubro,
    descripcion: solicitud.descripcion,
    direccion: solicitud.direccion,
    sector: solicitud.sector,
    comuna: solicitud.comuna || "Negrete",
    canalesVenta: solicitud.canalesVenta,
    horarios: solicitud.horarios,
    redesSociales: solicitud.redesSociales,
    necesidades: solicitud.necesidades,
    fotos: solicitud.fotos,
    notas: solicitud.notas ?? "",
  }));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectedPersona = personas.find((persona) => persona.id === form.emprendedorId);
  const errors = {
    emprendedorId: form.emprendedorId ? "" : "Asocia la solicitud a una persona registrada.",
    nombreEmprendimiento: form.nombreEmprendimiento.trim() ? "" : "Ingresa el nombre del emprendimiento.",
    rubro: form.rubro.trim() ? "" : "Ingresa un rubro.",
    whatsapp: isValidWhatsapp(form.whatsapp) ? "" : "Usa un WhatsApp chileno valido o deja el campo vacio.",
    correo: !form.correo.trim() || isValidEmail(form.correo.trim()) ? "" : "Ingresa un correo valido o deja el campo vacio.",
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const updateForm = <K extends keyof SolicitudReviewForm>(key: K, value: SolicitudReviewForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handlePersona = (emprendedorId: string) => {
    const persona = personas.find((item) => item.id === emprendedorId);
    setForm((current) => ({
      ...current,
      emprendedorId,
      rut: persona ? formatRut(persona.rut) : current.rut,
      creditoOriginal: persona?.creditoOriginal ?? current.creditoOriginal,
      nombreContacto: current.nombreContacto || persona?.nombre || "",
      whatsapp: formatWhatsapp(persona?.whatsapp || persona?.whatsappSecundario || current.whatsapp),
    }));
  };

  const submit = async (mode: "save" | "publish") => {
    setTouched(true);
    if (hasErrors || saving) return;
    setSaving(true);
    const normalized: SolicitudReviewForm = {
      ...form,
      rut: selectedPersona ? formatRut(selectedPersona.rut) : formatRut(form.rut),
      emprendedorId: selectedPersona?.id ?? form.emprendedorId,
      creditoOriginal: selectedPersona?.creditoOriginal ?? Number(form.creditoOriginal || 0),
      nombreContacto: form.nombreContacto.trim(),
      whatsapp: formatWhatsapp(form.whatsapp),
      correo: form.correo.trim().toLowerCase(),
      nombreEmprendimiento: form.nombreEmprendimiento.trim(),
      rubro: form.rubro.trim(),
      descripcion: form.descripcion.trim(),
      direccion: form.direccion.trim(),
      sector: form.sector.trim(),
      comuna: form.comuna.trim() || "Negrete",
      redesSociales: form.redesSociales.trim(),
      notas: form.notas?.trim() ?? "",
    };
    try {
      if (mode === "publish") {
        await onPublish(normalized);
      } else {
        await onSave(normalized);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="edit-modal solicitud-review-modal">
        <header>
          <div>
            <p className="eyebrow">Revision de ingresado</p>
            <h2>{solicitud.nombreEmprendimiento || "Solicitud de emprendimiento"}</h2>
            <span className="modal-title-detail">{solicitudEstadoLabels[solicitud.estado]} · {formatDateTime(solicitud.createdAt)}</span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar revision">
            <X size={18} />
          </button>
        </header>

        <section className="review-source-box">
          <ShieldCheck size={18} />
          <span>Corrige la informacion capturada. Al aprobar, se crea el emprendimiento publico asociado a una persona del sistema.</span>
        </section>

        <div className="modal-grid">
          <ModalField label="Persona asociada" error={touched ? errors.emprendedorId : undefined}>
            <select value={form.emprendedorId ?? ""} onChange={(event) => handlePersona(event.target.value)}>
              <option value="">Seleccionar persona</option>
              {personas.map((persona) => (
                <option key={persona.id} value={persona.id}>{persona.nombre} · {persona.rut}</option>
              ))}
            </select>
          </ModalField>
          <ModalField label="RUT">
            <input value={form.rut} onChange={(event) => updateForm("rut", event.target.value.toUpperCase())} onBlur={() => updateForm("rut", formatRut(form.rut))} />
          </ModalField>
          <ModalField label="Nombre contacto">
            <input value={form.nombreContacto} onChange={(event) => updateForm("nombreContacto", event.target.value)} />
          </ModalField>
          <ModalField label="WhatsApp" error={touched ? errors.whatsapp : undefined}>
            <input value={form.whatsapp} onChange={(event) => updateForm("whatsapp", event.target.value)} inputMode="tel" />
          </ModalField>
          <ModalField label="Correo" error={touched ? errors.correo : undefined}>
            <input value={form.correo} onChange={(event) => updateForm("correo", event.target.value)} inputMode="email" />
          </ModalField>
          <ModalField label="Periodo origen">
            <select value={form.periodoValidadoId ?? ""} onChange={(event) => updateForm("periodoValidadoId", event.target.value)}>
              <option value="">Sin periodo</option>
              {periodos.map((periodo) => (
                <option key={periodo.id} value={periodo.id}>Cuota {periodo.numeroCuota} · {formatDate(periodo.fechaVencimiento)}</option>
              ))}
            </select>
          </ModalField>
        </div>

        <div className="modal-grid">
          <ModalField label="Nombre de emprendimiento o negocio" error={touched ? errors.nombreEmprendimiento : undefined}>
            <input value={form.nombreEmprendimiento} onChange={(event) => updateForm("nombreEmprendimiento", event.target.value)} />
          </ModalField>
          <ModalField label="Rubro" error={touched ? errors.rubro : undefined}>
            <input value={form.rubro} onChange={(event) => updateForm("rubro", event.target.value)} />
          </ModalField>
          <ModalField label="Comuna">
            <input value={form.comuna} onChange={(event) => updateForm("comuna", event.target.value)} />
          </ModalField>
          <ModalField label="Sector">
            <input value={form.sector} onChange={(event) => updateForm("sector", event.target.value)} />
          </ModalField>
          <ModalField label="Direccion o referencia">
            <input value={form.direccion} onChange={(event) => updateForm("direccion", event.target.value)} />
          </ModalField>
          <ModalField label="Redes sociales">
            <input value={form.redesSociales} onChange={(event) => updateForm("redesSociales", event.target.value)} />
          </ModalField>
          <ModalField label="Descripcion">
            <textarea value={form.descripcion} onChange={(event) => updateForm("descripcion", event.target.value)} rows={4} />
          </ModalField>
          <ModalField label="Notas internas">
            <textarea value={form.notas ?? ""} onChange={(event) => updateForm("notas", event.target.value)} rows={3} />
          </ModalField>
        </div>

        <div className="review-taxonomy-grid">
          <ModalField label="Canales de venta">
            <textarea value={form.canalesVenta.join("\n")} onChange={(event) => updateForm("canalesVenta", splitSolicitudList(event.target.value))} rows={4} />
          </ModalField>
          <ModalField label="Horarios">
            <textarea value={form.horarios.join("\n")} onChange={(event) => updateForm("horarios", splitSolicitudList(event.target.value))} rows={4} />
          </ModalField>
          <ModalField label="Necesidades declaradas">
            <textarea value={form.necesidades.join("\n")} onChange={(event) => updateForm("necesidades", splitSolicitudList(event.target.value))} rows={4} />
          </ModalField>
        </div>

        <section className="review-photo-strip">
          <strong>Fotos recibidas</strong>
          <div>
            {form.fotos.map((foto) => (
              <figure key={foto.id}>
                <img src={foto.dataUrl} alt={foto.nombre} />
                <figcaption>{foto.nombre}</figcaption>
              </figure>
            ))}
            {!form.fotos.length && <span>Sin fotos recibidas.</span>}
          </div>
        </section>

        {touched && hasErrors && <div className="modal-error">Revisa los campos marcados antes de guardar o publicar.</div>}
        <footer>
          <button className="secondary-button" onClick={() => submit("save")} disabled={saving}>
            <Check size={16} /> Guardar revision
          </button>
          <button className="primary-button" onClick={() => submit("publish")} disabled={saving || solicitud.estado === "convertida"}>
            <ShieldCheck size={16} /> {solicitud.estado === "convertida" ? "Ya publicada" : "Aprobar y publicar"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function EmprendimientoModal({
  emprendimiento,
  personas,
  periodos,
  onClose,
  onSave,
}: {
  emprendimiento?: Emprendimiento;
  personas: Emprendedor[];
  periodos: Periodo[];
  onClose: () => void;
  onSave: (payload: EmprendimientoForm) => void;
}) {
  const firstPersona = personas[0];
  const [form, setForm] = useState<EmprendimientoForm>(() => ({
    emprendedorId: emprendimiento?.emprendedorId ?? firstPersona?.id ?? "",
    nombre: emprendimiento?.nombre ?? "",
    rubro: emprendimiento?.rubro ?? "",
    descripcion: emprendimiento?.descripcion ?? "",
    direccion: emprendimiento?.direccion ?? "",
    sector: emprendimiento?.sector ?? "",
    whatsapp: emprendimiento?.whatsapp ?? firstPersona?.whatsapp ?? "",
    correo: emprendimiento?.correo ?? "",
    redesSociales: emprendimiento?.redesSociales ?? "",
    estado: emprendimiento?.estado ?? "activo",
    periodoOrigenId: emprendimiento?.periodoOrigenId ?? "",
    creditoOrigen: emprendimiento?.creditoOrigen ?? firstPersona?.creditoOriginal ?? 0,
    fotos: emprendimiento?.fotos ?? [],
    notas: emprendimiento?.notas ?? "",
  }));
  const [touched, setTouched] = useState(false);
  const [fotoError, setFotoError] = useState("");
  const [fotoLoading, setFotoLoading] = useState(false);
  const selectedPersona = personas.find((persona) => persona.id === form.emprendedorId);
  const errors = {
    emprendedorId: form.emprendedorId ? "" : "Selecciona una persona.",
    nombre: form.nombre.trim() ? "" : "Ingresa el nombre del emprendimiento.",
    whatsapp: isValidWhatsapp(form.whatsapp) ? "" : "Usa un WhatsApp chileno valido o deja el campo vacio.",
    correo: !form.correo.trim() || isValidEmail(form.correo.trim()) ? "" : "Ingresa un correo valido o deja el campo vacio.",
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const updateForm = <K extends keyof EmprendimientoForm>(key: K, value: EmprendimientoForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handlePersona = (emprendedorId: string) => {
    const persona = personas.find((item) => item.id === emprendedorId);
    setForm((current) => ({
      ...current,
      emprendedorId,
      whatsapp: current.whatsapp || persona?.whatsapp || "",
      creditoOrigen: current.creditoOrigen || persona?.creditoOriginal || 0,
    }));
  };

  const handleFotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    if (form.fotos.length + files.length > MAX_EMPRENDIMIENTO_FOTOS) {
      setFotoError(`Puedes guardar hasta ${MAX_EMPRENDIMIENTO_FOTOS} fotos por emprendimiento.`);
      return;
    }

    setFotoError("");
    setFotoLoading(true);
    try {
      const fotos = await Promise.all(files.map(createEmprendimientoFoto));
      updateForm("fotos", [...form.fotos, ...fotos]);
    } catch (error) {
      setFotoError(error instanceof Error ? error.message : "No se pudo preparar la foto.");
    } finally {
      setFotoLoading(false);
    }
  };

  const quitarFoto = (id: string) => {
    updateForm("fotos", form.fotos.filter((foto) => foto.id !== id));
  };

  const handleSave = () => {
    setTouched(true);
    if (hasErrors) return;

    onSave({
      ...form,
      nombre: form.nombre.trim(),
      rubro: form.rubro.trim(),
      descripcion: form.descripcion.trim(),
      direccion: form.direccion.trim(),
      sector: form.sector.trim(),
      whatsapp: formatWhatsapp(form.whatsapp),
      correo: form.correo.trim().toLowerCase(),
      redesSociales: form.redesSociales.trim(),
      periodoOrigenId: form.periodoOrigenId || "",
      creditoOrigen: Number(form.creditoOrigen || selectedPersona?.creditoOriginal || 0),
      notas: form.notas?.trim() || "",
    });
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="edit-modal venture-modal" role="dialog" aria-modal="true" aria-labelledby="venture-modal-title">
        <header>
          <div>
            <p className="eyebrow">Central de emprendimientos</p>
            <h2 id="venture-modal-title">{emprendimiento ? "Editar emprendimiento" : "Nuevo emprendimiento"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar central de emprendimientos">
            <X size={20} />
          </button>
        </header>

        <div className="modal-grid">
          <ModalField label="Persona asociada" error={touched ? errors.emprendedorId : undefined}>
            <select value={form.emprendedorId} onChange={(event) => handlePersona(event.target.value)}>
              <option value="">Seleccionar persona</option>
              {personas.map((persona) => (
                <option key={persona.id} value={persona.id}>{persona.nombre} · {persona.rut}</option>
              ))}
            </select>
          </ModalField>

          <ModalField label="Nombre del emprendimiento" error={touched ? errors.nombre : undefined}>
            <input value={form.nombre} onChange={(event) => updateForm("nombre", event.target.value)} onBlur={() => setTouched(true)} placeholder="Ej: Amasanderia, bazar, reposteria" />
          </ModalField>

          <ModalField label="Rubro">
            <input value={form.rubro} onChange={(event) => updateForm("rubro", event.target.value)} placeholder="Alimentos, comercio, servicios..." />
          </ModalField>

          <ModalField label="Estado">
            <select value={form.estado} onChange={(event) => updateForm("estado", event.target.value as EstadoEmprendimiento)}>
              {emprendimientoEstadoOptions.map((estado) => (
                <option key={estado} value={estado}>{emprendimientoEstadoLabels[estado]}</option>
              ))}
            </select>
          </ModalField>

          <ModalField label="Direccion">
            <input value={form.direccion} onChange={(event) => updateForm("direccion", event.target.value)} placeholder="Calle, numero o referencia" />
          </ModalField>

          <ModalField label="Sector">
            <input value={form.sector} onChange={(event) => updateForm("sector", event.target.value)} placeholder="Villa, poblacion, rural, centro" />
          </ModalField>

          <ModalField label="WhatsApp del emprendimiento" error={touched ? errors.whatsapp : undefined}>
            <input
              value={form.whatsapp}
              onChange={(event) => updateForm("whatsapp", event.target.value)}
              onBlur={() => {
                updateForm("whatsapp", formatWhatsapp(form.whatsapp));
                setTouched(true);
              }}
              inputMode="tel"
              placeholder="+56 9 1234 5678"
            />
          </ModalField>

          <ModalField label="Correo" error={touched ? errors.correo : undefined}>
            <input value={form.correo} onChange={(event) => updateForm("correo", event.target.value)} inputMode="email" placeholder="correo@ejemplo.cl" />
          </ModalField>

          <ModalField label="Redes sociales">
            <input value={form.redesSociales} onChange={(event) => updateForm("redesSociales", event.target.value)} placeholder="@instagram, Facebook o enlace" />
          </ModalField>

          <ModalField label="Credito origen">
            <input type="number" min="0" inputMode="numeric" value={form.creditoOrigen || ""} onChange={(event) => updateForm("creditoOrigen", Number(event.target.value || 0))} />
          </ModalField>

          <ModalField label="Periodo origen">
            <select value={form.periodoOrigenId ?? ""} onChange={(event) => updateForm("periodoOrigenId", event.target.value)}>
              <option value="">Sin periodo asociado</option>
              {periodos.map((periodo) => (
                <option key={periodo.id} value={periodo.id}>Cuota {periodo.numeroCuota} · {formatDate(periodo.fechaVencimiento)}</option>
              ))}
            </select>
          </ModalField>
        </div>

        <ModalField label="Descripcion">
          <textarea value={form.descripcion} onChange={(event) => updateForm("descripcion", event.target.value)} rows={3} placeholder="Que vende, horarios, encargos o detalles utiles" />
        </ModalField>

        <section className="venture-photo-manager">
          <div className="venture-photo-manager-head">
            <div>
              <p className="eyebrow">Fotos</p>
              <strong>{form.fotos.length}/{MAX_EMPRENDIMIENTO_FOTOS} guardadas</strong>
            </div>
            <label className={fotoLoading || form.fotos.length >= MAX_EMPRENDIMIENTO_FOTOS ? "secondary-button disabled" : "secondary-button"}>
              {fotoLoading ? <span className="inline-spinner" aria-hidden="true" /> : <ImagePlus size={16} />}
              {fotoLoading ? "Redimensionando" : "Agregar foto"}
              <input
                type="file"
                accept={ACCEPTED_FOTO_TYPES}
                multiple
                onChange={handleFotos}
                disabled={fotoLoading || form.fotos.length >= MAX_EMPRENDIMIENTO_FOTOS}
              />
            </label>
          </div>
          {fotoLoading && <small className="attachment-help">Optimizando imagenes antes de guardarlas en Firebase.</small>}
          {fotoError && <small className="attachment-error">{fotoError}</small>}
          <div className="venture-photo-list">
            {form.fotos.map((foto) => (
              <figure key={foto.id}>
                <img src={foto.dataUrl} alt={foto.nombre} />
                <figcaption>
                  <span>{foto.nombre}</span>
                  <button type="button" className="danger-icon-button" onClick={() => quitarFoto(foto.id)} aria-label={`Quitar ${foto.nombre}`}>
                    <Trash2 size={15} />
                  </button>
                </figcaption>
              </figure>
            ))}
            {!form.fotos.length && <p className="empty-state">Puedes guardar fotos de productos, local, trabajos realizados o referencia visual.</p>}
          </div>
        </section>

        <ModalField label="Notas internas">
          <textarea value={form.notas ?? ""} onChange={(event) => updateForm("notas", event.target.value)} rows={2} placeholder="Opcional, solo para gestion interna" />
        </ModalField>

        {touched && hasErrors && (
          <div className="modal-error" role="alert">
            Revisa persona, nombre y datos de contacto antes de guardar.
          </div>
        )}

        <footer>
          <button className="secondary-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" onClick={handleSave}>
            <Check size={18} /> Guardar emprendimiento
          </button>
        </footer>
      </section>
    </div>
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

  const eliminarActual = async () => {
    if (!reunionActiva) return;
    const confirmed = await confirmarAccionCritica(`Eliminar "${reunionActiva.titulo}"? Se borraran su asistencia y acta.`, {
      title: "Semilla Emprende Negrete advierte",
      tone: "danger",
      confirmLabel: "Eliminar",
    });
    if (!confirmed) return;
    onEliminarReunion(reunionActiva.id);
  };

  const marcarTodos = async () => {
    if (!reunionActiva) return;
    const confirmed = await confirmarAccionCritica(`Marcar a todos como presentes en "${reunionActiva.titulo}"?`, {
      title: "Semilla Emprende Negrete dice",
      tone: "warning",
      confirmLabel: "Marcar presentes",
    });
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
          {cloudError ||
            (isFirebaseConfigured
              ? "Firebase esta configurado. Los cambios del sistema se guardan en la nube automaticamente."
              : `Faltan variables Firebase: ${getFirebaseMissingConfig().join(", ")}.`)}
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
        <h2>Restablecer valores por defecto</h2>
        <p>Vuelve a la base inicial del sistema. Requiere confirmacion y clave de superadmin antes de borrar cambios guardados.</p>
        <button className="danger-button" onClick={onReset}>
          <RotateCcw size={18} /> Restablecer valores
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

  const save = async () => {
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

    const confirmed = await confirmarAccionCritica(
      `Guardar cambios en correos autorizados? Se aplicaran ${changes.join(" y ")}. Esta accion modifica quien puede ingresar al sistema.`,
      {
        title: "Semilla Emprende Negrete advierte",
        tone: "warning",
        confirmLabel: "Guardar cambios",
      },
    );
    if (!confirmed) {
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

  const handleSave = async () => {
    setTouched(true);
    if (hasErrors) return;
    if (persona.estado !== "de_baja" && form.estado === "de_baja") {
      const confirmed = await confirmarAccionCritica(`Dar de baja a "${persona.nombre}"? La persona seguira registrada, pero quedara marcada como de baja.`, {
        title: "Semilla Emprende Negrete advierte",
        tone: "warning",
        confirmLabel: "Dar de baja",
      });
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
    comprobanteAdjunto: cobro.comprobanteAdjunto,
    observacion: cobro.observacion,
  });
  const [touched, setTouched] = useState(false);
  const totalEsperado = Math.max(Number(form.cuota || 0), 0) + Math.max(Number(form.seguro || 0), 0);
  const hasInvalidNumbers = [form.cuota, form.seguro, form.montoPagado].some(
    (value) => !Number.isFinite(value) || value < 0,
  );
  const missingTransferAttachment = transferenciaRequiereAdjunto(form.metodoPago) && !form.comprobanteAdjunto;
  const hasErrors = hasInvalidNumbers || missingTransferAttachment;

  const updateForm = <K extends keyof CobroEditForm>(key: K, value: CobroEditForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleMetodo = (metodoPago: MetodoPago) => {
    setForm((current) => ({
      ...current,
      metodoPago,
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
      referenciaPago: form.metodoPago === "transferencia" ? "" : form.referenciaPago.trim(),
      comprobanteAdjunto: form.comprobanteAdjunto ?? null,
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

        <section className={touched && missingTransferAttachment ? "receipt-box modal-receipt invalid" : "receipt-box modal-receipt"}>
          <div className="receipt-heading">
            <span><ReceiptText size={15} /> Comprobante</span>
            <button type="button" className={form.metodoPago === "efectivo" ? "cash-toggle active" : "cash-toggle"} onClick={() => handleMetodo("efectivo")} aria-pressed={form.metodoPago === "efectivo"}>
              <Check size={15} /> Efectivo
            </button>
          </div>
          {form.metodoPago === "transferencia" ? (
            <p className={touched && missingTransferAttachment ? "receipt-help warning" : "receipt-help"}>
              {missingTransferAttachment ? "Adjunta el comprobante de transferencia antes de guardar." : "Para transferencia basta con el comprobante adjunto."}
            </p>
          ) : (
            <label className="reference-input">
              <span>{getReferenciaLabel(form.metodoPago)}</span>
              <input
                value={form.referenciaPago}
                onChange={(event) => updateForm("referenciaPago", event.target.value)}
                placeholder={getReferenciaPlaceholder(form.metodoPago)}
              />
              <small>Este dato queda guardado en el cobro.</small>
            </label>
          )}
          <ComprobanteAdjuntoInput
            adjunto={form.comprobanteAdjunto}
            onChange={(comprobanteAdjunto) => updateForm("comprobanteAdjunto", comprobanteAdjunto)}
          />
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
    detail: { fechaPago: string; metodoPago: MetodoPago; referenciaPago: string; comprobanteAdjunto?: ComprobanteAdjunto | null; observacion?: string },
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
  const [comprobanteAdjunto, setComprobanteAdjunto] = useState<ComprobanteAdjunto | undefined>();
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
  const missingTransferAttachment = transferenciaRequiereAdjunto(metodoPago) && !comprobanteAdjunto;
  const hasErrors = !personaId || !selectedIds.length || !fechaPago || missingTransferAttachment;
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
  };

  const handleSave = () => {
    setTouched(true);
    if (hasErrors) return;

    onSave(selectedIds, {
      fechaPago,
      metodoPago,
      referenciaPago: metodoPago === "transferencia" ? "" : referenciaPago,
      comprobanteAdjunto: comprobanteAdjunto ?? null,
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

          <section className={touched && missingTransferAttachment ? "receipt-box modal-receipt invalid" : "receipt-box modal-receipt"}>
            <div className="receipt-heading">
              <span><ReceiptText size={15} /> Comprobante</span>
              <button type="button" className={metodoPago === "efectivo" ? "cash-toggle active" : "cash-toggle"} onClick={() => handleMetodo("efectivo")} aria-pressed={metodoPago === "efectivo"}>
                <Check size={15} /> Efectivo
              </button>
            </div>
            {metodoPago === "transferencia" ? (
              <p className={touched && missingTransferAttachment ? "receipt-help warning" : "receipt-help"}>
                {missingTransferAttachment ? "Adjunta el comprobante de transferencia antes de guardar." : "El comprobante adjunto se copiara en cada cuota seleccionada."}
              </p>
            ) : (
              <label className="reference-input">
                <span>{getReferenciaLabel(metodoPago)}</span>
                <input
                  value={referenciaPago}
                  onChange={(event) => setReferenciaPago(event.target.value)}
                  placeholder={getReferenciaPlaceholder(metodoPago)}
                />
                <small>Se copiara en cada cuota seleccionada.</small>
              </label>
            )}
            <ComprobanteAdjuntoInput
              adjunto={comprobanteAdjunto}
              onChange={(adjunto) => setComprobanteAdjunto(adjunto ?? undefined)}
            />
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
