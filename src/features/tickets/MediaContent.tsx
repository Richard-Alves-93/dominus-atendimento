import { useEffect, useMemo, useState } from "react";
import { FileText, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Fase E.1 — MediaContent extraído de TicketsDesktopLayout sem alterar lógica.
// Mesma assinatura/comportamento, agora reaproveitado por desktop e mobile.

export interface MediaMessage {
  id: string;
  msg_type: string;
  media_mime_type?: string | null;
  media_file_name?: string | null;
  media_size?: number | null;
  media_duration?: number | null;
  media_caption?: string | null;
  media_storage_path?: string | null;
  media_url?: string | null;
}

export function formatBytes(n?: number | null) {
  if (!n || n <= 0) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export function formatDuration(s?: number | null) {
  if (!s || s <= 0) return "";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function MediaContent({ m, onMime }: { m: MediaMessage; onMime: (mime?: string | null) => string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const path = m.media_storage_path;
  const mediaUrl = m.media_url;
  const type = m.msg_type;

  const safeExternalUrl = useMemo(() => {
    if (!mediaUrl) return null;
    if (mediaUrl.startsWith("blob:")) return mediaUrl;
    try {
      const u = new URL(mediaUrl);
      const params = u.search.toLowerCase();
      if (!["http:", "https:"].includes(u.protocol)) return null;
      if (params.includes("token") || params.includes("apikey") || params.includes("api_key") || params.includes("authorization")) return null;
      return u.toString();
    } catch {
      return null;
    }
  }, [mediaUrl]);

  const fallbackText =
    type === "image" ? "Imagem recebida" :
    type === "audio" ? "Áudio recebido" :
    type === "video" ? "Vídeo recebido" :
    type === "document" ? "Documento recebido" :
    type === "sticker" ? "Figurinha recebida" :
    `[${type}]`;

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setError(false);
    setLoading(false);
    if (!path) {
      if (safeExternalUrl) setUrl(safeExternalUrl);
      return;
    }
    setLoading(true);
    supabase.storage.from("message-media").createSignedUrl(path, 3600).then(({ data, error: err }) => {
      if (cancelled) return;
      if (err || !data?.signedUrl) {
        console.warn("[MEDIA_SIGNED_URL_AUDIT]", {
          messageId: m.id, msg_type: type, media_storage_path: path, media_url: mediaUrl ?? null,
          signedUrlSuccess: false, signedUrlError: err?.message ?? "no_url",
        });
        if (safeExternalUrl) setUrl(safeExternalUrl);
        setError(true);
        setLoading(false);
        return;
      }
      console.debug("[MEDIA_SIGNED_URL_AUDIT]", {
        messageId: m.id, msg_type: type, media_storage_path: path, media_url: mediaUrl ?? null,
        signedUrlSuccess: true, signedUrlError: null,
      });
      setUrl(data.signedUrl);
      setLoading(false);
    }).catch((e: unknown) => {
      if (cancelled) return;
      console.warn("[MEDIA_SIGNED_URL_AUDIT]", {
        messageId: m.id, msg_type: type, media_storage_path: path, media_url: mediaUrl ?? null,
        signedUrlSuccess: false, signedUrlError: (e as Error)?.message,
      });
      if (safeExternalUrl) setUrl(safeExternalUrl);
      setError(true);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [path, m.id, type, mediaUrl, safeExternalUrl]);

  if (!path && !url) return <p className="text-sm italic opacity-80">{fallbackText}</p>;
  if (error && !url) return <p className="text-sm italic opacity-80">{fallbackText}, mas não foi possível carregar.</p>;
  if (loading || !url) {
    return <div className="flex items-center gap-2 text-xs opacity-70"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando mídia...</div>;
  }

  if (type === "image" || type === "sticker") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img
          src={url}
          alt={m.media_file_name ?? "imagem"}
          className={type === "sticker" ? "max-h-32 object-contain" : "max-h-72 max-w-full rounded-lg object-cover"}
          loading="lazy"
          onError={() => setError(true)}
        />
      </a>
    );
  }
  if (type === "audio") {
    return <audio src={url} controls preload="metadata" className="w-64 max-w-full" onError={() => setError(true)} />;
  }
  if (type === "video") {
    return <video src={url} controls preload="metadata" className="max-h-72 max-w-full rounded-lg" onError={() => setError(true)} />;
  }
  if (type === "document") {
    return (
      <a href={url} target="_blank" rel="noreferrer" download={m.media_file_name ?? undefined}
        className="flex items-center gap-3 rounded-lg border border-current/20 bg-background/40 px-3 py-2 hover:bg-background/60 transition-colors">
        <FileText className="w-6 h-6 shrink-0 opacity-80" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{m.media_file_name ?? "Arquivo"}</div>
          <div className="text-[11px] opacity-70">
            {[onMime(m.media_mime_type), formatBytes(m.media_size)].filter(Boolean).join(" · ")}
          </div>
        </div>
        <Download className="w-4 h-4 opacity-70" />
      </a>
    );
  }
  return <a href={url} target="_blank" rel="noreferrer" className="text-sm underline">Baixar mídia</a>;
}

export default MediaContent;
