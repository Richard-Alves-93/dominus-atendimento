// Friendly error formatter for tag operations.
// Avoids surfacing "[object Object]" when Supabase throws a PostgrestError.
type AnyErr = unknown;

function pickMessage(err: AnyErr): { code?: string; message?: string } {
  if (!err) return {};
  if (typeof err === "string") return { message: err };
  if (err instanceof Error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code = (err as any).code as string | undefined;
    return { code, message: err.message };
  }
  if (typeof err === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any;
    return {
      code: e.code,
      message: e.message || e.error_description || e.error || e.hint || e.details,
    };
  }
  return { message: String(err) };
}

export function formatTagError(err: AnyErr, fallback = "Não foi possível salvar a etiqueta. Tente novamente."): string {
  const { code, message } = pickMessage(err);
  const m = (message || "").toLowerCase();
  const isDup =
    code === "23505" ||
    m.includes("duplicate key") ||
    m.includes("unique") ||
    m.includes("already exists") ||
    m.includes("já existe");
  if (isDup) return "Já existe uma etiqueta com esse nome nesta empresa.";
  if (code === "42501" || m.includes("permission denied") || m.includes("not allowed")) {
    return "Você não tem permissão para essa ação de etiqueta.";
  }
  if (!message) return fallback;
  return message;
}

export function formatTagLinkError(err: AnyErr): string {
  const { code, message } = pickMessage(err);
  const m = (message || "").toLowerCase();
  if (code === "23505" || m.includes("duplicate")) {
    return "Essa etiqueta já está aplicada.";
  }
  if (code === "42501" || m.includes("permission denied")) {
    return "Você não tem permissão para alterar etiquetas deste item.";
  }
  return message || "Não foi possível atualizar a etiqueta.";
}
