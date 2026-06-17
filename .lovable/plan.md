## Diagnóstico (já auditado no código)

1. **Erro `evolution_400`**: worker envia `{ number, text, linkPreview: false }`. O envio normal validado (`send-whatsapp-message`) usa apenas `{ number, text }`. O campo `linkPreview` no nível raiz não é aceito por Evolution v2.3.7 → **toda mensagem agendada falha**.
2. **Mensagem só aparece após F5**: o worker insere em `messages` via service_role. Subscription em `Tickets.tsx` (`messages:{ticketId}`) recebe INSERT, mas o cache TanStack provavelmente não está sendo invalidado para essa subscription quando vem de service_role (RLS de SELECT precisa permitir ao usuário ver a linha — verificar).
3. **Sem ação "Tentar novamente"**: não existe UI nem Edge Function de retry.
4. **Reagendamento sem envio externo**: `manage-scheduled-event` cria `event_rescheduled`, mas só dentro do bloco `if (dateTimeChanged)`. Confirmar; o envio falha pelo mesmo bug do `linkPreview`.
5. **Lembrete 5min**: como o reagendamento falha em criar (ou cria mas worker falha), o `event_reminder_5m` nunca dispara. Pode também estar sendo marcado `past_due` por comparação errada.

## Correções

### A. Worker `process-scheduled-messages` (fix crítico)
- Remover `linkPreview: false` do payload — usar exatamente `{ number, text }` como o envio normal.
- Trocar a ordem: **inserir `messages` como `sending` ANTES do POST**, depois atualizar para `sent`/`failed` (igual ao `send-whatsapp-message`). Isso garante realtime imediato no ticket.
- Melhorar `failure_reason` com texto curto e útil (`evolution_<status>: <message>`).
- Adicionar logs `[SCHEDULED_PIPELINE_AUDIT]` e `[EVOLUTION_PAYLOAD_AUDIT]` (mascarando número e sem secrets).

### B. `manage-scheduled-event`
- Garantir que `event_rescheduled` é enfileirado sempre que `start_at|end_at|meeting_url|meeting_enabled|location` mudar.
- Não cancelar a própria `event_rescheduled` recém-criada: ajustar a query de cancelamento para `updated_at < now()` (ou `created_at < timestamp do início da operação`) — hoje pode sobrescrever a nova ao filtrar por tipo.
- Lembrete 5min: criar sempre que `start_at - 5min > now()`. Logar `[SCHEDULED_TIMING_AUDIT]` com `start_at`, `now`, `scheduled_for`, `decision`.

### C. Nova Edge Function `retry-scheduled-message`
- Body: `{ message_id }` (mensagem `failed` no ticket).
- Valida JWT, company, permissão (Master/Admin/Manager autorizado/responsável do ticket/criador).
- Cria nova `scheduled_messages` com `scheduled_for=now()`, mesmo `type`, `body`, `ticket_id`, `contact_id`, `channel_id`, `channel_type`, `event_id` (se houver).
- Marca a `messages` antiga com `retry_queued_at` (campo a usar se existir, senão apenas log).

### D. Frontend `Tickets.tsx`
- Para mensagens `from_me=true` com `status='failed'`, renderizar botão "Tentar novamente" que chama `retry-scheduled-message`.
- Garantir que o `postgres_changes` em `messages:${ticketId}` invalida o cache `['messages', ticketId]` em INSERT e UPDATE (e não só faz append).

### E. Tela `/app/agendamentos` — Informações
- Em **Informações do evento**, listar status das `scheduled_messages` vinculadas (confirmação, lembretes, reagendamento, cancelamento). Read-only, sem alterar o card.

## Arquivos a alterar / criar

```text
supabase/functions/process-scheduled-messages/index.ts   (fix payload, ordem insert, logs)
supabase/functions/manage-scheduled-event/index.ts       (fix cancelamento de pendentes, 5min)
supabase/functions/retry-scheduled-message/index.ts      (NOVO)
src/pages/Tickets.tsx                                    (botão retry + invalidate cache)
src/pages/Agendamentos.tsx ou EventInfoModal             (status das scheduled_messages)
```

## Segurança preservada

- Nenhum `USING(true)`, nenhum service_role no frontend, Evolution só via Edge Function.
- Retry valida JWT + company + role + propriedade do ticket.
- Realtime continua filtrado por `ticket_id` (canal por ticket, dentro da empresa do usuário).

## Testes que farei

- A: criar evento +20min → confirmar `messages` aparece como `sending` então `sent` sem F5.
- B: reagendar → conferir `event_rescheduled` criado e enviado.
- C: lembrete 5min com evento +20min → conferir disparo no horário.
- D: forçar falha (número inválido) → conferir botão "Tentar novamente" e novo envio.
- Logs `[SCHEDULED_PIPELINE_AUDIT]` mostrando cada etapa.

## Pendências reconhecidas

- Canais não-WhatsApp seguem `channel_not_implemented`.
- Google Meet automático fora de escopo.
