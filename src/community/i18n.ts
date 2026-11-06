export type Lang = "pt" | "en";

export const TICKET_CATEGORIES = ["support", "billing", "partnership"] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

const pt = {
  policiesTitle: "Políticas da SafeGuard",
  policiesBody:
    "Ao usares os nossos serviços e este servidor aceitas as políticas abaixo. Carrega num botão para abrir a página completa no site.",
  policiesMarker: "SafeGuard · Políticas",

  ticketPanelTitle: "Suporte — abrir um ticket",
  ticketPanelBody:
    "Precisas de ajuda? Escolhe o tipo de pedido abaixo. Abre-se um canal privado só entre ti e a equipa.\n\n" +
    "**Suporte** — instalação, configuração e dúvidas técnicas\n" +
    "**Faturação** — pagamentos, licenças e reembolsos\n" +
    "**Parcerias** — propostas e colaborações",
  ticketPanelMarker: "SafeGuard · Tickets",
  category: { support: "Suporte", billing: "Faturação", partnership: "Parcerias" } satisfies Record<TicketCategory, string>,
  modalTitle: (cat: string) => `Novo ticket — ${cat}`,
  modalSubject: "Descreve o teu pedido",
  modalSubjectPlaceholder: "Explica o que precisas.",
  ticketAlreadyOpen: (channel: string) => `Já tens um ticket aberto: ${channel}`,
  ticketCreated: (channel: string) => `Ticket criado: ${channel}`,
  ticketCreateFailed: "Não foi possível criar o ticket. Avisa a equipa.",
  ticketWelcome: (user: string) => `${user}, obrigado pelo contacto. A equipa responde aqui assim que possível.`,
  ticketSubject: "Pedido",
  ticketCategory: "Categoria",
  ticketOpenedBy: "Aberto por",
  ticketClaim: "Assumir",
  ticketClose: "Fechar",
  ticketClaimed: (staff: string) => `Ticket assumido por ${staff}.`,
  ticketClaimedBy: "Assumido por",
  ticketCloseConfirm: "Fechar este ticket? O canal é apagado e a transcrição fica guardada.",
  ticketCloseYes: "Sim, fechar",
  ticketClosing: (who: string) => `Ticket fechado por ${who}. O canal é apagado dentro de 5 segundos.`,
  ticketClosedLog: "Ticket fechado",
  ticketClosedBy: "Fechado por",
  ticketDm: (guild: string) => `O teu ticket em **${guild}** foi fechado. Segue a transcrição.`,
  staffOnly: "Só a equipa pode fazer isto.",
  notATicket: "Este canal não é um ticket.",

  linkBlocked: (user: string) => `${user}, não são permitidos links neste servidor.`,
  linkTimedOut: (user: string, minutes: number) => `${user} ficou em silêncio durante ${minutes} min por enviar links repetidamente.`,
  linkLogTitle: "Link bloqueado",
  linkLogUser: "Membro",
  linkLogChannel: "Canal",
  linkLogLinks: "Links",
  linkLogMessage: "Mensagem",
  linkLogTimeout: "Silenciado",

  feedTitle: "🛡️ SafeGuard Anticheat",
  feedBody: "Totais em todos os servidores protegidos pelo SafeGuard.",
  feedBans: "🔨 Bans",
  feedDetections: "🛰️ Deteções",
  feedDetections30d: "🛰️ Deteções (30 dias)",
  feedMarker: "SafeGuard · Feed ao vivo",
  numberLocale: "pt-PT",
  autoRoleReason: "Auto role ao entrar no servidor",
};

type Strings = typeof pt;

const en: Strings = {
  policiesTitle: "SafeGuard policies",
  policiesBody: "By using our services and this server you accept the policies below. Press a button to open the full page on the site.",
  policiesMarker: "SafeGuard · Policies",

  ticketPanelTitle: "Support — open a ticket",
  ticketPanelBody:
    "Need help? Pick the kind of request below. A private channel opens between you and the team.\n\n" +
    "**Support** — install, configuration and technical questions\n" +
    "**Billing** — payments, licenses and refunds\n" +
    "**Partnerships** — proposals and collaborations",
  ticketPanelMarker: "SafeGuard · Tickets",
  category: { support: "Support", billing: "Billing", partnership: "Partnerships" },
  modalTitle: (cat) => `New ticket — ${cat}`,
  modalSubject: "Describe your request",
  modalSubjectPlaceholder: "Explain what you need.",
  ticketAlreadyOpen: (channel) => `You already have an open ticket: ${channel}`,
  ticketCreated: (channel) => `Ticket created: ${channel}`,
  ticketCreateFailed: "The ticket could not be created. Please tell the team.",
  ticketWelcome: (user) => `${user}, thanks for reaching out. The team will answer here as soon as possible.`,
  ticketSubject: "Request",
  ticketCategory: "Category",
  ticketOpenedBy: "Opened by",
  ticketClaim: "Claim",
  ticketClose: "Close",
  ticketClaimed: (staff) => `Ticket claimed by ${staff}.`,
  ticketClaimedBy: "Claimed by",
  ticketCloseConfirm: "Close this ticket? The channel is deleted and the transcript is kept.",
  ticketCloseYes: "Yes, close",
  ticketClosing: (who) => `Ticket closed by ${who}. The channel is deleted in 5 seconds.`,
  ticketClosedLog: "Ticket closed",
  ticketClosedBy: "Closed by",
  ticketDm: (guild) => `Your ticket in **${guild}** was closed. Here is the transcript.`,
  staffOnly: "Only the team can do this.",
  notATicket: "This channel is not a ticket.",

  linkBlocked: (user) => `${user}, links are not allowed on this server.`,
  linkTimedOut: (user, minutes) => `${user} was timed out for ${minutes} min for repeatedly posting links.`,
  linkLogTitle: "Link blocked",
  linkLogUser: "Member",
  linkLogChannel: "Channel",
  linkLogLinks: "Links",
  linkLogMessage: "Message",
  linkLogTimeout: "Timed out",

  feedTitle: "🛡️ SafeGuard Anticheat",
  feedBody: "Totals across every server protected by SafeGuard.",
  feedBans: "🔨 Bans",
  feedDetections: "🛰️ Detections",
  feedDetections30d: "🛰️ Detections (30 days)",
  feedMarker: "SafeGuard · Live feed",
  numberLocale: "en-GB",
  autoRoleReason: "Auto role on join",
};

export function strings(lang: Lang): Strings {
  return lang === "en" ? en : pt;
}
export type { Strings };
