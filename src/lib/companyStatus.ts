export const ALLOWED_COMPANY_STATUSES = ["active", "trial"] as const;
export const BLOCKED_COMPANY_STATUSES = ["suspended", "canceled", "pending"] as const;

export function isCompanyAllowed(status?: string | null): boolean {
  if (!status) return false;
  return (ALLOWED_COMPANY_STATUSES as readonly string[]).includes(status);
}

export function isCompanyBlocked(status?: string | null): boolean {
  if (!status) return true;
  return (BLOCKED_COMPANY_STATUSES as readonly string[]).includes(status);
}

export function blockedReason(status?: string | null): string {
  if (status === "canceled") return "Sua empresa está cancelada. Entre em contato com o administrador da plataforma.";
  if (status === "pending") return "Sua empresa ainda não foi ativada. Entre em contato com o administrador da plataforma.";
  return "Sua empresa está suspensa. Entre em contato com o administrador da plataforma.";
}
