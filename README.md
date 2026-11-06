# Bot de Discord SafeGuard

Um único processo com:

- **Comandos de staff** (`/player`, `/ban`, `/unban`, `/server`, `/detections`, `/screenshot`) — respostas privadas, só para `DISCORD_STAFF_ROLE_IDS`.
- **Tickets** — painel com botões (Suporte, Faturação, Parcerias). Cada botão abre um formulário e cria um canal privado para o membro e a staff, com botões **Assumir** e **Fechar**. Ao fechar, a transcrição `.txt` vai para o canal de logs e por DM ao membro, e o canal é apagado. Cada membro só pode ter um ticket aberto de cada vez.
- **Auto role** — dá os cargos `AUTOROLE_ROLE_IDS` a quem entra (e `AUTOROLE_BOT_ROLE_IDS` a bots, se estiver definido).
- **Painel de políticas** — embed com um botão-link por política (Termos, Privacidade, DPA, Reembolsos, ou os de `POLICY_LINKS`).
- **Anti-links** — apaga mensagens (novas ou editadas) com links fora da lista permitida, incluindo convites de Discord; após `ANTILINK_STRIKES` links em 10 minutos aplica timeout. A staff e quem tem Gerir Mensagens fica isento.
- **Estatísticas globais** — uma única mensagem embed publicada uma vez e editada a cada `FEED_INTERVAL_SECONDS` com o total de bans e de deteções do SafeGuard Anticheat em todos os servidores (endpoint público `/v1/public/stats`). Só é editada quando os números mudam.

Cada função fica desligada até o seu canal/cargo ser configurado. Os painéis e o feed são encontrados depois de um reinício pelo texto do rodapé, por isso não há ficheiro de estado; se apagares a mensagem, o bot publica outra.

## Configuração

1. Em discord.com/developers cria a aplicação e o bot. Liga **Server Members Intent** (auto role) e **Message Content Intent** (anti-links), se as usares.
2. Convida o bot com as permissões: Ver Canais, Enviar Mensagens, Gerir Canais, Gerir Cargos, Gerir Mensagens, Moderar Membros, Anexar Ficheiros, Incorporar Links, Ler Histórico. O cargo do bot tem de ficar **acima** dos cargos que dá.
3. No painel SafeGuard cria uma chave de API da organização (Integrações) com `players.read`, `bans.read`, `bans.manage`, `detections.read`, `servers.read` e `live.actions` (screenshots).
4. Copia `.env.example` para `.env` e preenche-o.
5. `pnpm install` e `pnpm build`, depois `pnpm register` (comandos) e `pnpm start`. Requer Node 24 ou superior.

## Testes

`pnpm test` — cobre os comandos, o filtro de links, o feed, os marcadores de tickets e a configuração.
