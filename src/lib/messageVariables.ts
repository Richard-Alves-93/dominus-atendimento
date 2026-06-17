// Utility to substitute variables in quick reply / template text.
// Used by composer when inserting a quick reply. Does NOT alter the
// stored quick_replies template — only the text inserted in the composer.
//
// Supported variables:
//   {{nome_contato}}   -> contact name
//   {{nome_atendente}} -> current attendant name
//   {{empresa}}        -> company name
//   {{data}}           -> current date (dd/MM/yyyy, pt-BR)
//   {{hora}}           -> current time (HH:mm, pt-BR)
//   {{protocolo}}      -> ticket.protocol_number (empty when null/disabled)
//
// Missing values fall back to empty string — substitution must never throw
// nor break the composer.

export interface MessageVariableContext {
  contactName?: string | null;
  agentName?: string | null;
  companyName?: string | null;
  protocol?: string | null;
  now?: Date;
}

const pad = (n: number) => n.toString().padStart(2, "0");

export function applyMessageVariables(template: string, ctx: MessageVariableContext): string {
  if (!template) return "";
  const now = ctx.now ?? new Date();
  const data = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  const hora = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const map: Record<string, string> = {
    nome_contato: (ctx.contactName ?? "").trim(),
    nome_atendente: (ctx.agentName ?? "").trim(),
    empresa: (ctx.companyName ?? "").trim(),
    protocolo: (ctx.protocol ?? "").trim(),
    data,
    hora,
  };

  return template.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_, key: string) => {
    const k = key.toLowerCase();
    return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : "";
  });
}
