import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { tagColorHex } from "@/features/tags/tagColors";

type CardRef = {
  id: string;
  card_type: string;
  contact_id: string | null;
  ticket_id: string | null;
  opportunity_id: string | null;
};

export type EntityTagsMap = Record<string, { id: string; name: string; color: string | null }[]>;

function keyOf(c: { card_type: string; contact_id: string | null; ticket_id: string | null; opportunity_id: string | null }) {
  if (c.card_type === "contact" && c.contact_id) return `contact:${c.contact_id}`;
  if (c.card_type === "ticket" && c.ticket_id) return `ticket:${c.ticket_id}`;
  if (c.card_type === "opportunity" && c.opportunity_id) return `opportunity:${c.opportunity_id}`;
  return null;
}

export function useEntityTags(companyId: string | null, cards: CardRef[]) {
  return useQuery({
    queryKey: ["entity_tags", companyId, cards.map((c) => keyOf(c)).filter(Boolean).sort().join("|")],
    enabled: !!companyId && cards.length > 0,
    queryFn: async () => {
      const contactIds = cards.filter((c) => c.card_type === "contact" && c.contact_id).map((c) => c.contact_id!) as string[];
      const ticketIds = cards.filter((c) => c.card_type === "ticket" && c.ticket_id).map((c) => c.ticket_id!) as string[];
      const oppIds = cards.filter((c) => c.card_type === "opportunity" && c.opportunity_id).map((c) => c.opportunity_id!) as string[];

      const result: EntityTagsMap = {};
      const queries: Promise<unknown>[] = [];

      type LinkRow = {
        contact_id: string | null;
        ticket_id: string | null;
        opportunity_id: string | null;
        entity_type: string;
        tag: { id: string; name: string; color: string | null } | null;
      };

      async function fetchFor(col: "contact_id" | "ticket_id" | "opportunity_id", ids: string[], entType: string) {
        if (ids.length === 0) return;
        const { data, error } = await supabase
          .from("tag_links")
          .select(`contact_id,ticket_id,opportunity_id,entity_type,tag:tags!inner(id,name,color,deleted_at)`)
          .eq("company_id", companyId!)
          .eq("entity_type", entType)
          .in(col, ids)
          .is("deleted_at", null);
        if (error) throw error;
        for (const row of ((data ?? []) as unknown as LinkRow[])) {
          if (!row.tag) continue;
          // skip soft-deleted tags
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((row.tag as any).deleted_at) continue;
          const id = row[col];
          if (!id) continue;
          const k = `${entType}:${id}`;
          if (!result[k]) result[k] = [];
          result[k].push({ id: row.tag.id, name: row.tag.name, color: row.tag.color });
        }
      }

      queries.push(fetchFor("contact_id", contactIds, "contact"));
      queries.push(fetchFor("ticket_id", ticketIds, "ticket"));
      queries.push(fetchFor("opportunity_id", oppIds, "opportunity"));
      await Promise.all(queries);
      return result;
    },
    staleTime: 30_000,
  });
}

export function tagsForCard(map: EntityTagsMap | undefined, card: CardRef) {
  if (!map) return [];
  const k = keyOf(card);
  if (!k) return [];
  return map[k] ?? [];
}

export function CardTagsBadges({
  tags, max = 3,
}: { tags: { id: string; name: string; color: string | null }[]; max?: number }) {
  if (!tags || tags.length === 0) return null;
  const visible = tags.slice(0, max);
  const extra = tags.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border"
          style={{
            background: `${tagColorHex(t.color)}1f`,
            color: tagColorHex(t.color),
            borderColor: `${tagColorHex(t.color)}55`,
          }}
          title={t.name}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: tagColorHex(t.color) }} />
          <span className="truncate max-w-[80px]">{t.name}</span>
        </span>
      ))}
      {extra > 0 && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">+{extra}</Badge>
      )}
    </div>
  );
}
