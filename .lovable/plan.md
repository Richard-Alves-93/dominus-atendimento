# Fase 2.4 — Eventos, Reuniões, Agendamentos e Follow-ups Multicanal

Arquitetura multicanal (não presa ao WhatsApp), com WhatsApp como único canal de envio real nesta fase.

## 1. Banco de dados (migrations)

### Tabela `scheduled_events`
Campos: `id`, `company_id`, `ticket_id?`, `contact_id?`, `channel_id?`, `channel_type?`, `created_by`, `assigned_user_id`, `title`, `description?`, `start_at`, `end_at?`, `location?`, `meeting_enabled` (bool), `meeting_url?`, `send_confirmation` (bool), `reminder_1h_enabled` (bool), `reminder_5m_enabled` (bool), `status` (`scheduled|completed|cancelled|failed`), `cancelled_at?`, `cancelled_by?`, `created_at`, `updated_at`.

### Tabela `scheduled_messages` (genérica/multicanal)
Campos: `id`, `company_id`, `ticket_id?`, `contact_id?`, `channel_id?`, `channel_type?`, `event_id?`, `created_by`, `type` (`event_confirmation|event_reminder_1h|event_reminder_5m|sales_followup|custom_followup`), `body`, `scheduled_for`, `status` (`pending|processing|sent|cancelled|failed`), `sent_at?`, `failed_at?`, `failure_reason?`, `created_at`, `updated_at`.

### RLS / GRANTs
- `GRANT` para `authenticated` + `service_role`.
- RLS habilitado.
- Policies SELECT/INSERT/UPDATE/DELETE escopadas por `company_id` via `user_belongs_to_company`.
- Visibilidade adicional por usuário:
  - `agent` (role em `company_users`): só vê eventos onde `assigned_user_id = auth.uid()` ou `created_by = auth.uid()`.
  - `manager`: próprios + dos atendentes dos setores que gerencia (via `department_users`).
  - `owner/admin`: todos da empresa.
  - Master: usa `is_master()`.
- Função helper `public.can_view_event(event_id)` security definer com `search_path = public`.

### Índices
`company_id`, `assigned_user_id`, `start_at`, `ticket_id`, `(status, scheduled_for)` para o worker.

## 2. Backend — Edge Functions

### `create-scheduled-event`
- Auth obrigatória; resolve `company_id` ativo do usuário.
- Valida vínculo, role, e que `channel_id`/`ticket_id`/`contact_id` (quando enviados) pertencem à mesma empresa.
- Insere `scheduled_events`.
- Se nasceu de um ticket: insere `message` interna (`source=system`, `from_me=false`, `message_type=system`, sem `external_id`, não envia para Evolution).
- Se `send_confirmation`: cria `scheduled_messages` `event_confirmation` com `scheduled_for = now()`.
- Se `reminder_1h_enabled`: cria `event_reminder_1h` em `start_at - 1h`.
- Se `reminder_5m_enabled`: cria `event_reminder_5m` em `start_at - 5m`.
- Só cria mensagens externas se `channel_id` + `contact_id` existirem.

### `process-scheduled-messages` (cron a cada 1 min via pg_cron + pg_net)
- Pega `pending` com `scheduled_for <= now()` (lock por update `status=processing`).
- Para cada uma, faz dispatch por `channel_type`:
  - `whatsapp` → chama internamente `send-whatsapp-message` (texto).
  - outros canais → marca `failed` com `failure_reason='channel_not_implemented'` (arquitetura preparada).
- Atualiza `sent_at`/`failed_at`.

Nomes neutros — nada com prefixo `whatsapp_`.

## 3. Frontend

### Composer `/app/tickets`
- Adicionar item **Evento** no menu de anexos (Plus) — substitui o toast atual.
- Mantém Documento, Fotos e vídeos, Câmera, Áudio, Contato, Enquete (toast em breve).
- Abre `EventModal` em modo **ticket**: contato/canal pré-preenchidos e ocultos.

### Componente `EventModal`
Modos: `ticket` (contexto fixo) | `standalone` (livre, usado em `/app/agendamentos`).
Campos:
- Título*, Descrição, Data*, Hora início*, Hora fim, Local.
- Toggle "Adicionar reunião online" → mostra campo `meeting_url` + aviso discreto sobre Google Meet futuro.
- Toggles "Enviar confirmação", "Lembrete 1h antes", "Lembrete 5min antes" — ocultos quando não há contato/canal.
- Em `standalone`: campo Contato opcional, seleção de canal (apenas canais conectados da empresa), responsável (apenas para owner/admin/manager).

### Página `/app/agendamentos`
Substituir placeholder por tela real:
- Filtros conforme role (atendente: só "Minha agenda"; gerente: minha/equipe/status/data; admin: todos/usuário/setor/status/data).
- Lista de eventos próximos (cards com título, data/hora, contato, canal badge, status).
- Botão "Novo evento" abre `EventModal` em modo standalone.
- Ações: cancelar evento (cancela também `scheduled_messages` pending vinculadas).

### Render mensagem interna no Tickets
Tratar `message_type='system'` como aviso centralizado (texto cinza, sem balão/check/assinatura).

## 4. Multicanal — preparação
- Sempre persistir `channel_type` junto a `channel_id`.
- Dispatcher por `channel_type`; só `whatsapp` envia de fato.
- UI mostra apenas canais já conectados da empresa.

## 5. Segurança (Guardião Dominus)
- RLS em ambas as tabelas, policies escopadas por empresa + visibilidade por role.
- Edge Functions validam JWT, empresa ativa, pertencimento de ticket/contato/canal.
- Worker usa `service_role` apenas dentro do edge.
- Sem `using(true)`; sem service_role no frontend; sem chamada direta à Evolution.
- Auditoria: insere `audit_logs` para criação/cancelamento de evento.
- Mensagem interna não vaza para Evolution.

## 6. Arquivos a criar/alterar

**Migrations**
- `scheduled_events` + RLS + GRANTs + índices + trigger updated_at
- `scheduled_messages` + RLS + GRANTs + índices + trigger updated_at
- enable `pg_cron`, `pg_net`
- cron `process-scheduled-messages` a cada minuto (via insert tool — contém URL/anon key)

**Edge Functions**
- `supabase/functions/create-scheduled-event/index.ts`
- `supabase/functions/process-scheduled-messages/index.ts`

**Frontend**
- `src/components/events/EventModal.tsx` (novo)
- `src/pages/Agendamentos.tsx` (substitui placeholder)
- `src/pages/Tickets.tsx` (item Evento no menu + render `message_type=system`)
- `src/App.tsx` rota se necessário

## 7. Pendências assumidas (fora do escopo desta fase)
- Envio real por Instagram/Messenger/E-mail/Telegram.
- Integração Google Calendar/Meet automática.
- Envio real de enquete.
- Lembrete interno in-app (push/notification center).

## 8. Como testar
1. Abrir um ticket WhatsApp em `/app/tickets`, menu Plus → Evento, criar com confirmação + lembrete 1h.
2. Verificar `scheduled_events` e `scheduled_messages` no banco; mensagem interna aparece no histórico.
3. Cliente recebe confirmação no WhatsApp imediatamente (worker em ~1 min).
4. Em `/app/agendamentos` criar evento pessoal sem contato — não gera scheduled_messages.
5. Criar evento standalone com contato + canal — gera lembretes.
6. Logar como atendente → vê só os próprios; como admin → vê todos.
7. Cancelar evento → `scheduled_messages` pending viram `cancelled`.

Aprove para eu implementar.
