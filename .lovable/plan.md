## Funcionalidade: Responder mensagem específica (estilo WhatsApp)

Implementação em camadas seguras, sem mexer em Evolution/QR/agendamentos/RLS fora do escopo.

### 1. Banco de dados (migration)

Auditei `public.messages` (33 colunas) — **nenhum campo de reply existe hoje**.

Adicionar colunas nullable em `public.messages`:

- `reply_to_message_id uuid REFERENCES messages(id) ON DELETE SET NULL`
- `reply_to_provider_message_id text`
- `reply_to_preview text`
- `reply_to_sender_name text`
- `reply_to_message_type text`

Criar índice: `CREATE INDEX ON public.messages(reply_to_message_id)`.

RLS já existente cobre as novas colunas (mesma tabela). Sem alterar policies.

### 2. UI — ação "Responder" em cada balão

Em `src/pages/Tickets.tsx`, dentro do loop de mensagens (linha ~1982), envolver cada balão com um menu `DropdownMenu` discreto disparado por um botão de três pontos que aparece no `hover` do balão (visível também no mobile via toque). Item único por enquanto: **Responder**.

Sem mudar layout dos balões, apenas botão flutuante na borda superior do bubble com `opacity-0 group-hover:opacity-100`.

### 3. Estado do composer

Novo estado em `Tickets.tsx`:

```ts
const [replyingTo, setReplyingTo] = useState<MessageRow | null>(null);
```

Acima do composer (antes do input/textarea), renderizar prévia compacta quando `replyingTo`:

- fundo `bg-muted/60`, borda esquerda `border-l-2 border-primary/40`
- nome do remetente em `text-xs font-medium`
- preview da mensagem (1 linha, `truncate`) ou rótulo de mídia (`[Imagem]`, `[Áudio]`, etc.)
- botão `X` (`Button` ghost icon) que faz `setReplyingTo(null)`
- some no envio bem-sucedido e ao cancelar

### 4. Envio com vínculo de reply

`MessageRow` ganha campos opcionais `reply_to_*`. O `select` em `loadMessages` (linha 834) e na subscription do realtime passam a incluir esses campos.

`handleSend` (linha 1225) e `handleSendMedia` (linha 1284):

- Construir `replyPayload` a partir de `replyingTo` com: `reply_to_message_id`, `reply_to_provider_message_id` (= `provider_message_id ?? external_id` da original), `reply_to_preview` (corpo recortado a 120 chars, ou rótulo de mídia), `reply_to_sender_name` (`sent_by_name` se outbound, senão nome do contato), `reply_to_message_type` (`msg_type`).
- Enviar `reply` no body da chamada para a edge function `send-whatsapp-message`.
- Linha otimista local inclui os campos `reply_to_*`.
- Limpar `replyingTo` após enviar (independente do retorno do worker).

### 5. Edge function `send-whatsapp-message`

Aceitar `reply` opcional no payload e gravar os 5 campos `reply_to_*` no INSERT de `messages`.

**Quote real na Evolution v2.3.7**: a API aceita `quoted` com `{ key: { id, remoteJid, fromMe }, message: { conversation } }`. Para não arriscar o envio manual já validado, vou implementar com **fallback seguro**:

- Se `reply.provider_message_id` existir, montar `quoted` no payload. 
- Se a Evolution retornar erro relacionado ao quote (HTTP != ok), reenviar **uma vez** sem `quoted`. Vínculo interno permanece salvo no banco.
- Tudo isolado em try/catch para não quebrar fluxo atual.

### 6. Renderização do reply no histórico

Novo componente inline (dentro de `Tickets.tsx`) `ReplyQuoteBlock` renderizado acima do conteúdo do balão quando `m.reply_to_message_id || m.reply_to_preview`:

- bloquinho com borda esquerda colorida, `text-xs`
- linha 1: `reply_to_sender_name`
- linha 2: preview (ou rótulo de mídia derivado de `reply_to_message_type`)
- Se `reply_to_message_id` está no array carregado, usar o body atual; caso contrário, `reply_to_preview`.
- Se nem `reply_to_message_id` resolve nem `reply_to_preview` existe: "Mensagem original indisponível".

### 7. Recebimento de replies vindos do WhatsApp

Em `supabase/functions/evolution-webhook/index.ts`, dentro do branch que insere mensagem inbound, ler `data.message.extendedTextMessage.contextInfo` (e `data.contextInfo` para mídia) para extrair:

- `stanzaId` → `reply_to_provider_message_id`
- `participant`/`pushName` quando disponível
- `quotedMessage.conversation` ou rótulo de mídia → `reply_to_preview` e `reply_to_message_type`
- Tentar resolver `reply_to_message_id` com `SELECT id FROM messages WHERE provider_message_id = stanzaId OR external_id = stanzaId LIMIT 1` (mesma empresa).

Log seguro: `[WHATSAPP_REPLY_CONTEXT_AUDIT] { message_id, provider_message_id, has_reply_context, reply_to_provider_message_id }`. Sem telefone completo nem conteúdo.

Se o payload não tiver contexto reconhecido, apenas seguir o fluxo atual sem quebrar.

### 8. Mensagens rápidas + Enter

`QuickRepliesPopover` apenas preenche o composer; o `replyingTo` permanece intacto até o envio. `Enter` / `Shift+Enter` permanecem como hoje.

### Arquivos a alterar

- `supabase/migrations/<timestamp>_messages_reply_fields.sql` (novo)
- `src/pages/Tickets.tsx` (estado, UI dos balões, prévia do composer, envio, renderização do quote)
- `supabase/functions/send-whatsapp-message/index.ts` (aceitar `reply`, gravar campos, quote com fallback)
- `supabase/functions/evolution-webhook/index.ts` (captura de contextInfo nos inbound)

### Não mexer

QR/reconexão Evolution, agendamentos, `scheduled_messages`, `process-scheduled-messages`, mídia já validada, checks, protocolo, RLS de outras tabelas. Não alterar `MensagensRapidas.tsx` nem o modal já estabilizado.

### Testes

Roteiro completo de 1 a 14 do pedido após implementação (responder inbound, outbound, mídia, cancelar, mensagem rápida, Enter/Shift+Enter, mobile, envio normal sem reply continua funcionando).

### Pendências previstas

- Confirmar visualmente o quote real chegando no WhatsApp do contato (depende de teste em ambiente real).
- Captura de reply inbound depende do formato exato de `contextInfo` da Evolution v2.3.7; se algum payload real não bater, ajusto numa segunda iteração com base nos logs `[WHATSAPP_REPLY_CONTEXT_AUDIT]`.  
  
Use as skills:
  - **Dominus Atendimento — Habilidade de Arquitetura SaaS**
  - **Dominus Atendimento — Guardião de Integrações Críticas**
  - **Dominus Atendimento — Guardião de Layout, UX e Responsividade**
  O plano técnico para **Responder mensagem específica** está aprovado, mas quero ajustar o comportamento visual e o menu de ações para seguir o estilo do WhatsApp.
  Use as imagens de referência enviadas como base visual: ao interagir com uma mensagem, deve aparecer uma régua de reações acima e um menu flutuante com ações, parecido com o WhatsApp Web/Desktop.
  # Objetivo
  Implementar a funcionalidade de responder mensagem específica e preparar o menu contextual de mensagens no estilo WhatsApp.
  A prioridade funcional agora é:
  ```txt
  1. Responder
  2. Copiar
  3. Reações por emoji, se possível com segurança

  ```
  As demais opções podem ser implementadas funcionalmente se forem simples, ou deixadas preparadas visualmente/estruturalmente sem quebrar nada.
  ---
  # 1. Menu contextual estilo WhatsApp
  Ao passar o mouse sobre uma mensagem ou clicar no menu discreto da mensagem, exibir menu com estas opções, nesta ordem:
  ```txt
  Responder
  Copiar
  Encaminhar
  Fixar
  Favoritar
  Selecionar

  ```
  Não incluir por enquanto:
  ```txt
  Pergunte à Meta AI
  Denunciar
  Apagar

  ```
  Essas opções não fazem sentido agora para o Dominus.
  ---
  # 2. Ícones desejados
  Usar ícones no mesmo estilo do WhatsApp, preferencialmente via `lucide-react` ou biblioteca já usada no projeto.
  Sugestão:
  ```txt
  Responder  → Reply ou CornerUpLeft
  Copiar     → Copy
  Encaminhar → Forward
  Fixar      → Pin
  Favoritar  → Star
  Selecionar → CheckSquare ou SquareCheck

  ```
  O menu deve ser limpo, branco, arredondado, com sombra suave e itens em linha com ícone à esquerda e texto à direita.
  Visual esperado:
  ```txt
  bg-white
  rounded-xl
  shadow-lg
  border border-slate-200/70
  text-sm
  itens com hover:bg-slate-100
  ícones discretos

  ```
  No dark mode, usar equivalente escuro se o sistema já suportar.
  ---
  # 3. Régua de reações acima da mensagem
  Se possível, implementar também a régua de reações no estilo WhatsApp.
  Ao abrir o menu/ações da mensagem, mostrar acima do balão uma pequena barra com emojis:
  ```txt
  👍 ❤️ 😂 😮 😢 🙏 +

  ```
  O botão `+` pode ficar preparado para futuro seletor completo de emojis.
  Visual:
  ```txt
  barra pequena
  fundo branco
  rounded-full
  shadow
  ícones/emojis espaçados
  posicionada acima/próximo da mensagem
  não cobrir o texto da mensagem

  ```
  ---
  # 4. Reações — implementação segura
  Se for simples e seguro, persistir reações no banco.
  Sugestão de tabela:
  ```txt
  message_reactions

  ```
  Campos sugeridos:
  ```txt
  id uuid primary key default gen_random_uuid()
  company_id uuid not null references companies(id) on delete cascade
  message_id uuid not null references messages(id) on delete cascade
  user_id uuid not null references profiles(id) on delete cascade
  emoji text not null
  created_at timestamptz not null default now()

  ```
  Regra:
  ```txt
  Um usuário pode ter no máximo uma reação por mensagem.

  ```
  Índice/constraint:
  ```txt
  unique(message_id, user_id)

  ```
  RLS:
  ```txt
  Usuário só pode ver reações de mensagens da própria empresa.
  Usuário só pode criar/alterar/remover a própria reação.
  Não usar USING(true) ou WITH CHECK(true).

  ```
  Se persistir reações aumentar muito o risco, implementar apenas a UI da régua e deixar persistência como pendência. Mas preferencialmente já deixar persistido se for seguro.
  ---
  # 5. Comportamento das opções
  ## Responder
  Implementar conforme plano aprovado:
  ```txt
  1. Clicar em Responder.
  2. Composer mostra preview da mensagem respondida.
  3. Usuário digita resposta.
  4. Envio salva vínculo reply_to_*.
  5. Histórico renderiza bloco de quote.
  6. Se seguro, enviar quote real para Evolution com fallback sem quote.

  ```
  ## Copiar
  Implementar agora.
  Ao clicar em Copiar:
  ```txt
  1. Copiar texto da mensagem para clipboard.
  2. Se for mídia sem texto, copiar legenda/nome do arquivo, se existir.
  3. Mostrar toast: "Mensagem copiada".

  ```
  ## Encaminhar
  Se for simples, abrir modal/popover para escolher outro atendimento/contato.
  Se isso aumentar escopo, deixar preparado como item desabilitado ou com toast:
  ```txt
  Encaminhamento será implementado em próxima etapa.

  ```
  Não quebrar fluxo atual.
  ## Fixar
  Se já houver estrutura simples, implementar campo em `messages` ou tabela futura.
  Se não houver, deixar preparado com toast:
  ```txt
  Fixar mensagem será implementado em próxima etapa.

  ```
  ## Favoritar
  Se for simples, implementar favorito pessoal por usuário.
  Se não houver estrutura, deixar preparado com toast:
  ```txt
  Favoritos serão implementados em próxima etapa.

  ```
  ## Selecionar
  Pode ficar preparado para futura seleção múltipla.
  Primeira versão pode mostrar toast:
  ```txt
  Seleção múltipla será implementada em próxima etapa.

  ```
  Não precisa implementar multi-select agora se isso aumentar risco.
  ---
  # 6. Banco de dados para reply
  Manter a proposta de migration em `messages`:
  ```txt
  reply_to_message_id uuid references messages(id) on delete set null
  reply_to_provider_message_id text
  reply_to_preview text
  reply_to_sender_name text
  reply_to_message_type text

  ```
  Criar índice:
  ```txt
  messages(reply_to_message_id)

  ```
  Não quebrar mensagens antigas.
  ---
  # 7. Renderização do quote no histórico
  Quando uma mensagem tiver `reply_to_*`, mostrar um bloco compacto acima do conteúdo principal do balão.
  Visual inspirado no WhatsApp:
  ```txt
  borda esquerda suave
  fundo levemente diferente
  nome do remetente em destaque
  prévia da mensagem em uma ou duas linhas

  ```
  Para mídia:
  ```txt
  [Imagem]
  [Áudio]
  [Vídeo]
  [Documento]

  ```
  Se a mensagem original não estiver disponível:
  ```txt
  Mensagem original indisponível

  ```
  ---
  # 8. Preview no composer
  Ao clicar em Responder, mostrar acima do campo de digitação:
  ```txt
  Respondendo {nome}
  {prévia da mensagem}
  [x]

  ```
  Visual:
  ```txt
  compacto
  neutro
  não verde
  borda esquerda suave
  botão X para cancelar

  ```
  Deve funcionar junto com:
  ```txt
  Mensagens rápidas
  Enter para enviar
  Shift + Enter para nova linha
  Mídia
  Texto normal

  ```
  ---
  # 9. Evolution / quote real
  Não quebrar envio manual já validado.
  Se for implementar quote real na Evolution v2.3.7, usar fallback obrigatório:
  ```txt
  1. Tenta enviar com quoted.
  2. Se Evolution rejeitar quote, reenviar sem quoted.
  3. Manter vínculo interno reply_to_* salvo.
  4. Registrar log seguro.

  ```
  Logs:
  ```txt
  [WHATSAPP_REPLY_SEND_AUDIT]
  [WHATSAPP_REPLY_QUOTE_FALLBACK]

  ```
  Não logar telefone completo, API key, service role, tokens ou conteúdo sensível completo.
  ---
  # 10. Recebimento de reply vindo do WhatsApp
  Implementar leitura de `contextInfo` no `evolution-webhook`, conforme plano, sem quebrar mensagens normais.
  Se o payload real não bater, apenas logar de forma segura e seguir fluxo normal.
  ---
  # 11. Layout e UX
  O menu deve parecer com o WhatsApp, mas adaptado ao Dominus.
  Regras:
  ```txt
  Não poluir os balões.
  Não mostrar todos os ícones fixos o tempo todo.
  Usar menu flutuante discreto.
  No mobile, permitir toque/long press ou botão discreto.
  Não usar verde forte em ações secundárias.
  Não quebrar o scroll do chat.
  Não cobrir o composer.

  ```
  ---
  # 12. Não mexer
  Não alterar:
  ```txt
  QR Code
  reconexão Evolution
  agendamentos
  scheduled_messages
  process-scheduled-messages
  mídia já validada
  checks já validados
  protocolo
  quick_replies já validadas
  modal de mensagens rápidas
  RLS fora do necessário para novos campos/tabela de reações

  ```
  ---
  # 13. Testes obrigatórios
  Executar:
  ```txt
  1. Abrir atendimento.
  2. Abrir menu de uma mensagem inbound.
  3. Confirmar menu com: Responder, Copiar, Encaminhar, Fixar, Favoritar, Selecionar.
  4. Confirmar ícones corretos.
  5. Confirmar régua de emojis acima da mensagem, se implementada.
  6. Clicar em Responder.
  7. Confirmar preview no composer.
  8. Cancelar reply com X.
  9. Responder novamente e enviar.
  10. Confirmar quote no histórico do Dominus.
  11. Confirmar mensagem chega no WhatsApp.
  12. Confirmar envio normal sem reply continua funcionando.
  13. Testar Copiar.
  14. Testar reação com emoji, se implementada.
  15. Testar mensagem rápida enquanto há reply ativo.
  16. Testar Enter e Shift+Enter.
  17. Testar mobile.

  ```
  ---
  # 14. Retorno esperado
  Responder com:
  ```txt
  1. Campos/tabelas criadas.
  2. Como ficou o menu contextual.
  3. Quais opções estão funcionais agora.
  4. Quais opções ficaram preparadas para próxima etapa.
  5. Se reações foram persistidas ou só UI.
  6. Como implementou Responder.
  7. Como implementou Copiar.
  8. Se quote real na Evolution foi implementado ou se ficou fallback/interno.
  9. Arquivos alterados.
  10. Testes realizados.
  11. Pendências.

  ```