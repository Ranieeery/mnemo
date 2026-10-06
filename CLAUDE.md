# CLAUDE.md

Este arquivo orienta o Claude Code (e qualquer pessoa desenvolvedora) ao trabalhar neste repositório.

## Visão geral

**Mnemo** é um aplicativo desktop para organizar e assistir uma biblioteca de vídeos **local**. Diferente de media
servers (Plex, Jellyfin), ele não reorganiza nada: a navegação espelha a estrutura real de pastas do disco, como um
explorador de arquivos, com metadados, thumbnails, tags e progresso de reprodução guardados em SQLite.

## Como trabalhar neste repositório

- Atue como uma pessoa desenvolvedora **sênior em Rust e TypeScript**: decisões justificadas, código simples e legível,
  separação clara de responsabilidades, sem over-engineering.
- **Features novas** são planejadas à parte: apresente um plano e aguarde aprovação antes de codar. Tudo em
  "Features" deve continuar funcionando, incluindo todos os atalhos de teclado e mouse.
- **Compatibilidade de dados:** quem atualiza o app abre o `mnemo.db` atual sem perder nada (inclusive bancos criados
  pelas versões 1.x), e exports JSON antigos continuam importáveis.
- **Git:** não faça commit, push, nem crie branches. Apenas altere os arquivos; a revisão e os commits são feitos por mim.
- Para mudanças grandes ou que alterem arquitetura, apresente um plano e aguarde aprovação antes de codar.
- **Testes sempre que possível.** Todo bug corrigido ganha um teste de regressão.
- Não crie arquivos desnecessários, não deixe código morto, não duplique lógica. Antes de criar um utilitário, procure
  se já existe um.
- Converse comigo em português. Código, nomes, comentários, textos da interface e mensagens de commit sugeridas em
  inglês (commits semânticos; versão em semver).
- **Release notes** (quando pedidas, em inglês, Markdown, para quem usa o app, sem detalhes internos):
  `# Mnemo X.Y.Z`, um parágrafo de abertura (o que a versão traz e a compatibilidade com dados de versões
  anteriores), `## Highlights` (3 a 5 itens com início em negrito), uma seção `##` por área com o que mudou para o
  usuário, `## Fixes` quando houver, e `## Upgrading from X.Y` (dados preservados, mudanças de comportamento,
  requisitos). Atalhos e formatos entre crases; nada de nomes de código, comandos ou tabelas.

## Stack

| Camada | Escolha |
|---|---|
| Shell desktop | Tauri 2 (Rust, edição 2024) |
| Backend | Rust: `tokio`, `serde`, `thiserror`, `tracing`, `rusqlite` (bundled) + `rusqlite_migration` |
| Bindings IPC | `tauri-specta` 2 RC, versão fixada com `=` (tipos TypeScript e constantes gerados a partir do Rust) |
| Plugins Tauri | `dialog` (seleção de pasta e de arquivo de backup). `tauri-plugin-opener` só como crate Rust (abrir no player externo / revelar), sem plugin nem permissão no webview |
| Frontend | React 19 + TypeScript 7 (strict) + Vite 8 |
| Estilo | Tailwind CSS 4 com tokens via `@theme` (padrões do Tailwind desligados) |
| Primitivos de UI | Radix UI (acessibilidade), compostos no design system próprio em `src/shared/ui` |
| Roteamento | TanStack Router (rotas tipadas, histórico por hash, voltar/avançar) |
| Estado de servidor | TanStack Query (dados vindos do Rust: cache, invalidação, loading/erro) |
| Estado de UI | Estado local; Zustand apenas para estado global de UI (processamento, diálogos, player) |
| Listas grandes | TanStack Virtual |
| Animações | CSS com tokens de movimento, respeitando `prefers-reduced-motion` |
| Ícones | lucide-react |
| Validação | `serde` no Rust (o JSON de import é lido e validado no backend) |
| Lint/format | Biome 2 (TS) · `clippy` + `rustfmt` (Rust) |
| Testes | Vitest + Testing Library (`mockIPC` do Tauri) · `cargo test` com SQLite em memória e `tempfile` |
| Fonte | Inter Variable embutida (`@fontsource-variable`), por ser app offline com CSP |
| Pacotes | Bun |

Mudanças nesta tabela exigem justificativa no plano.

## Comandos

```sh
bun install              # instala dependências
bun tauri dev            # app em modo dev (Vite + janela Tauri)
bun tauri build          # instaladores em src-tauri/target/release/bundle/
bun run typecheck        # tsc (app e configs)
bun run lint             # biome check
bun run format           # biome format --write
bun run test             # vitest run
bun run check            # typecheck + lint + test (frontend)

cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test               # também regenera src/shared/ipc/bindings.ts (teste export_typescript_bindings)
cargo test -- --ignored real_ffmpeg                    # requer ffmpeg/ffprobe no PATH
MNEMO_LEGACY_DB=<cópia>/mnemo.db cargo test -- --ignored migrates_a_real_legacy_database   # nunca o arquivo real
```

Uma mudança só está pronta quando `bun run check`, `cargo fmt --check`, `cargo clippy` e `cargo test` passam sem erros
nem warnings (o `bun run build` também não deve ter avisos).

Os bindings TypeScript (`src/shared/ipc/bindings.ts`) são gerados: nunca edite à mão; rode `cargo test` após mudar
comandos ou tipos expostos. Os inteiros que cruzam o IPC são ids, contagens e bytes (exportados como `number`), e
campos `f64` finitos usam `#[specta(type = specta_typescript::Number)]` para não virarem `number | null`.

Formatação: 4 espaços, aspas duplas, ponto e vírgula, largura 120, `trailingComma: es5`, LF; JSON usa 2 espaços
(`biome.json`, `.editorconfig`). Rust: `rustfmt.toml` com `max_width = 120`; `unwrap_used` e `expect_used` do clippy
ativos (permitidos em testes via `clippy.toml`).

## Arquitetura

```
src-tauri/src/
├── lib.rs              # setup: tracing, estado, escopo de assets, registro de comandos
├── state.rs            # AppState (banco, caminhos, fila de processamento, busca em andamento)
├── error.rs            # AppError (thiserror), serializado como { kind, message }
├── commands/           # camada fina: recebe input, chama serviços. Lista de comandos e constantes dos bindings.
├── services/           # regras: biblioteca e navegação, scanner, mídia (ffprobe/ffmpeg e pipeline), busca,
│                       # visualização, tags, backup, manutenção, legendas, sistema, escopo de assets
├── db/                 # conexão, migrations.rs e repositórios (videos, watch, orphans, tags, folders,
│                       # settings, history, backup)
└── domain/             # tipos e regras puras: extensões, limiar, ordem natural, faixas de pasta, modo de exibição

src/
├── app/                # entrada, router, RootLayout, layout (shell), rotas que compõem features, DialogHost
├── features/           # um diretório por domínio: home, browser, player, search, tags, settings, library, history,
│   │                   # shortcuts, dev-catalog (catálogo do design system, só em dev)
│   └── <feature>/      # components/, hooks/, lib/, queries.ts, index.ts e testes ao lado (*.test.ts[x])
└── shared/
    ├── ui/             # design system (agnóstico de domínio) + ScrollContainer, VirtualList, useColumns
    ├── video/          # UI e ações de vídeo usadas por várias features (card, thumbnail, grade, menu de contexto)
    ├── ipc/            # bindings gerados, client (`call()` → CommandError), queryKeys, queryClient, queries comuns
    ├── lib/            # funções puras (duração, bytes, caminhos, classes, parsers de legenda)
    ├── stores/         # Zustand: processamento em segundo plano e diálogos globais
    ├── styles/         # tokens (`@theme`) e estilos globais
    └── test/           # setup do Vitest, helpers, fixtures, stub de mídia
```

- Rotas (`src/app/router.tsx`): `/` home (busca em `?q=`), `/folder?path=` (busca em `?q=`, ordem em `?sort=` e
  filtro em `?status=`, omitidos quando estão no padrão), `/history`,
  `/settings` (aba em `?tab=`) e `/watch?path=` carregados sob demanda, `/dev/catalog` só em dev. Search params validados em
  `app/routes/searchParams.ts`.
- Telas e diálogos que combinam features (home + botão "Add folder", pasta + resultados de busca, detalhes do vídeo +
  editor de tags, settings + pastas + tags) são compostos em `app/`, nunca por import entre features. Cada feature
  expõe só o seu `index.ts`.
- Navegação (`app/navigation/useHistoryNavigation`): voltar/avançar, `Alt+←/→` e botões laterais do mouse em todas
  as telas; no player, voltar fecha e avançar reabre o último vídeo.
- Dados: tudo o que deriva da biblioteca fica sob a query key `["library"]`; mutações invalidam esse prefixo.
  "Marcar como assistido" é otimista com rollback (`shared/video/replaceVideo` atualiza o vídeo em qualquer cache).
- Player (`features/player`): volume, mudo, velocidade, legendas e modo teatro são preferências entre sessões
  (`get_player_preferences`/`update_player_preferences`), carregadas uma vez por sessão na store e salvas 400 ms após
  a última mudança e ao fechar o player; valem para todo vídeo. Progresso salvo no máximo a cada 5 s e ao pausar,
  fechar e terminar.

### Princípios

- **Rust é dono dos dados e do sistema de arquivos.** Banco, varredura de pastas e processos ffmpeg/ffprobe ficam no
  backend. O frontend nunca executa SQL nem classifica arquivos.
- **Tipos de IPC nunca são escritos à mão:** vêm dos bindings gerados.
- **Fonte única de verdade** para constantes de domínio: definidas em `domain/` no Rust e expostas ao frontend pelos
  bindings quando necessário.
- **Features não importam umas das outras**; o que é compartilhado vai para `shared/`.
- Nenhum arquivo deve virar um "deus": se um componente ou módulo passa de ~300 linhas (sem contar testes), divida.
- Erros nunca são engolidos: são tipados no Rust, chegam ao frontend com mensagem útil e são exibidos com uma ação
  possível quando fizer sentido.

## Banco de dados

- `rusqlite` com `journal_mode=WAL`, `foreign_keys=ON` e `busy_timeout`. Arquivo `mnemo.db` no `app_config_dir` (no
  Windows e macOS coincide com o app data dir), o mesmo local usado pelas versões 1.x. O `identifier` `com.mnemo` não
  pode mudar.
- Tabelas: `videos`, `tags`, `video_tags` (N:N, `ON DELETE CASCADE`), `library_folders` (com `custom_icon`),
  `watch_history`, `app_settings`, `folder_settings`.
- `app_settings` é chave/valor em JSON com acesso tipado (`db/settings.rs`): cada setting implementa `Setting` (chave,
  tipo, padrão, validação na escrita e reparo na leitura) e é lido com `settings::get::<S>` e gravado com
  `settings::set::<S>`. Valores ilegíveis viram o padrão (com log), nunca erro. Settings: `watched_threshold`,
  `recent_folder_icons`, `player_preferences` (campos ausentes recebem o padrão; campos inválidos, um a um),
  `keyboard_shortcuts` (ações ausentes recebem o padrão; teclas inválidas são descartadas ação por ação).
- **Migrações versionadas** (`rusqlite_migration`, em `db/migrations.rs`). A `1` é um baseline compatível com bancos
  das versões 1.x (adiciona colunas que versões antigas criavam depois); a `2` limpa órfãos, normaliza `is_watched`
  gravado como texto, cria índices e as tabelas de settings; a `3` indexa `watch_history.watched_at`.
  `watch_progress_seconds` guarda segundos fracionários.
- Nunca edite uma migração já existente; crie uma nova.
- Filtros por pasta usam faixas sobre o índice de `file_path` (`domain::paths::FolderBounds`), nunca `LIKE`.
- Remover vídeos ou pastas também remove as thumbnails (só dentro do diretório de thumbnails).
- Export/import JSON com `formatVersion` (atual: 2); o import aceita exports das versões 1.x e é atômico.

## Mídia

- `ffmpeg`/`ffprobe` são exigidos no `PATH`; sem eles o app avisa e explica como instalar.
- Processos externos com `CREATE_NO_WINDOW` no Windows e timeout; saída do `ffprobe` lida como JSON via `serde`.
- Thumbnails em `<appDataDir>/thumbnails/`, exibidas via asset protocol.
- `MediaToolkit` (probe e thumbnail, usado pelo pipeline) e `TrackToolkit` (faixas e extração de legendas) abstraem
  o ffmpeg para os testes. Comandos que entregam caminhos ao ffmpeg ou ao sistema usam `library::library_file`.
- O pipeline processa um job por vez e envia progresso por `Channel`; a etapa por arquivo é isolada para permitir, no
  futuro, concorrência limitada e cancelamento.

## Segurança

- CSP real em `tauri.conf.json` (a `devCsp` libera scripts inline e o websocket do Vite).
- Escopo do asset protocol vazio na config e liberado em tempo de execução só para as pastas da biblioteca e as
  thumbnails. Pastas removidas deixam de ser servidas no próximo início (a API do Tauri só amplia escopos).
- WebView2 recebe `--enable-blink-features=AudioVideoTracks` (troca de faixa de áudio) além das flags padrão do wry
  (`--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`), que precisam continuar na lista.
- Capability mínima: `core:default`, `dialog:allow-open`, `dialog:allow-save`. Comandos que recebem caminhos validam
  que eles estão dentro da biblioteca.

## Design system e UX

### Tokens

Em `src/shared/styles/tokens.css` (`@theme` do Tailwind 4, com os padrões do Tailwind desligados) e `base.css`
(estilos globais e `prefers-reduced-motion`). Nunca use valores soltos (hex, px arbitrários, durações avulsas).

- Cores: `background`, `surface`, `surface-raised`, `surface-hover`, `border`, `border-strong`, `text`, `text-muted`,
  `text-subtle`, `accent`, `accent-hover`, `success`, `warning`, `danger`, `focus-ring`, `overlay`, `scrim`,
  `backdrop` e `*-foreground` para texto sobre cores sólidas. O `accent` é para preenchimentos e indicadores, nunca
  para texto pequeno sobre o `background`.
- Tipografia (Inter Variable): `text-caption` 12/16 · `text-small` 13/20 · `text-body` 14/20 · `text-lead` 16/24 ·
  `text-title` 18/26 · `text-heading` 22/28 · `text-display` 28/34.
- Raio: `rounded-badge` 4 · `rounded-control` 6 · `rounded-card` 10 · `rounded-dialog` 14. Sombras: `shadow-raised`,
  `shadow-overlay`, `shadow-dialog`. Espaçamento: escala do Tailwind (base 4px).
- Movimento: `duration-(--duration-fast|base|slow)` (120/200/320ms), `ease-standard|out|in`, animações
  `animate-appear|disappear|pop-in|pop-out|slide-in|pulse-soft|indeterminate|spin`. Com `prefers-reduced-motion` as
  durações vão a zero; animações em loop usam `motion-reduce:animate-none`.
- Tema escuro por padrão; um tema claro só precisa redefinir as variáveis de cor.

### Componentes

Em `src/shared/ui` (exportados por `index.ts`), sobre Radix quando há interação: `Button`, `IconButton`, `Input`,
`Textarea`, `SearchInput`, `Dialog`, `ConfirmDialog`, `DropdownMenu`, `ContextMenu`, `Tooltip`, `Toast`, `Progress`,
`Skeleton`, `Card`, `Tabs`, `Slider` (`compact` para volume), `Switch`, `Badge`/`Tag`, `EmptyState`, `ErrorState`, `Kbd`,
`Spinner`, `FolderIcon`, `ScrollToTopButton`.
`toast()` pode ser chamado fora do React. Features compõem esses primitivos; não recriam botões, modais ou menus.

Catálogo do design system em `/dev/catalog` (só em dev): `Ctrl+Shift+D` alterna entre ele e o app, ou abra
`http://localhost:1420/#/dev/catalog` no navegador.

### Diretrizes de UX

- Todo conteúdo assíncrono tem estado de carregamento (skeleton com o formato do conteúdo), vazio (com orientação do
  que fazer) e erro (com ação de recuperação).
- Ações dão feedback (toast ou mudança visível). Confirmação apenas para ações destrutivas ou em massa.
- Navegação completa por teclado, foco sempre visível, contraste adequado, `aria-*` corretos.
- Animações sutis e funcionais; nunca decorativas ou longas.
- Visual profissional e intencional; o conteúdo (thumbnails) é o protagonista. Evitar estética genérica de IA
  (gradientes decorativos, glassmorphism, glow, emojis como ícones de interface).

## Performance

- Listas e grades longas virtualizadas; thumbnails lazy com dimensões fixas.
- Code splitting por rota (player e settings sob demanda) e chunks separados para `react` e `vendor`. O conjunto
  completo de ícones do lucide (~600 kB) é um chunk lazy (`shared/ui/allIcons`, via `loadAllIcons`) e fica fora do
  `vendor`.
- Consultas limitadas no backend; nada de carregar a biblioteca inteira para filtrar no frontend.
- Seletores no Zustand, query keys estáveis, memoização apenas onde medida.
- Operações pesadas fora da thread principal do Rust (`spawn_blocking` para SQLite e I/O síncrono).

## Testes

- **Rust:** testes nos serviços e repositórios (SQLite em memória, `tempfile`). O pipeline de mídia usa um
  `MediaToolkit` falso; testes com ffmpeg real ou com uma cópia de banco real são `#[ignore]` (ver Comandos). No
  Windows, `build.rs` embute o manifesto de Common Controls em todos os binários (sem ele, os executáveis de teste do
  Tauri falham com `STATUS_ENTRYPOINT_NOT_FOUND`).
- **Frontend:** funções puras em `shared/lib` com cobertura completa; telas e hooks com Testing Library, mockando o
  backend. Testar comportamento, não implementação. Setup em `shared/test/setup.ts` (jest-dom, polyfills do Radix,
  stub de `<video>`, limpeza dos singletons: cache, processamento, toasts e diálogos). Helpers: `renderWithUi`, `renderScreen` (roteador, cache novo e
  providers), `mockCommands`/`callsOf` (comandos não mockados falham), fixtures e `app/testApp.tsx` (app inteiro).
  Componentes que suspendem (como `FolderIcon` com um ícone fora da lista curada) só re-renderizam dentro de
  `act()` nos testes. Em JSX, caminhos do Windows vão entre chaves (`path={"D:\\Videos"}`): atributos com aspas não processam escapes.
- Atalhos do player e da navegação, retomada e gravação de progresso têm testes.

## Convenções de código

- **TypeScript:** `strict`, `noUncheckedIndexedAccess`, sem `any` (use `unknown` + validação), sem `as` para silenciar
  tipos. Componentes como funções nomeadas; props tipadas.
- **Rust:** sem `unwrap`/`expect` fora de testes; erros propagados com `?` e `AppError`. Funções públicas com doc
  comments quando o comportamento não for óbvio.
- Nomes descritivos; nada de abreviações obscuras. Comentários explicam o *porquê*, não o *quê*.

## Features

### Biblioteca e navegação
- Pastas raiz adicionadas pelo diálogo nativo; navegação pela hierarquia real de subpastas, com breadcrumbs.
- Ordenação dos vídeos da pasta por nome (ordem natural), duração ou data de adição (escolher um campo ordena de
  forma crescente; escolhê-lo de novo inverte, e uma seta mostra a direção), e filtro por
  status (unwatched, in progress, watched; não processados contam como unwatched). Feitos no frontend sobre o conteúdo
  já carregado, com a ordem natural do backend como desempate; não processados ficam no fim por duração e data. No
  modo contínuo valem dentro de cada grupo, e grupos vazios somem; subpastas não são afetadas. Ficam na URL
  (`replace`, então voltar sai da pasta) e voltam ao padrão em outra pasta. A playlist do player não muda.
- Arquivos que não são vídeo aparecem no fim da pasta ("Other files"); o cabeçalho avisa quantos são e leva até eles.
- Botão de voltar ao topo nas telas com rolagem, depois de rolar uma tela.
- Modo de exibição por pasta: `folders` (padrão; só os filhos diretos) ou `continuous` (todos os vídeos da árvore
  agrupados por subpasta). Herdado pelas subpastas até ser sobrescrito; no modo contínuo, a playlist cobre a pasta
  onde o modo foi definido.
- Histórico estilo navegador: voltar/avançar, `Alt+←/→` e botões laterais do mouse (botão 3 fecha o player, botão 4
  reabre o último vídeo).
- Ordenação natural (`Ep 2` antes de `Ep 10`), definida no backend e usada em tudo.
- Ícones personalizados para pastas da biblioteca: qualquer ícone do lucide, salvo pelo nome em `custom_icon`. O
  seletor tem a aba "Suggested" (até 40: os 8 últimos usados, guardados em `app_settings`, e uma lista curada) e
  "All icons" (todos, com busca). Emojis salvos pela 1.x aparecem como o ícone padrão de pasta.
- Estatísticas por pasta: total, assistidos e percentual de progresso.

### Processamento de mídia
- Metadados e thumbnail em segundo plano, com barra de progresso mostrando o arquivo atual; um job por vez.
- Vídeos já processados são ignorados; falha na thumbnail não descarta o vídeo.
- Detecção de ffmpeg/ffprobe com instruções de instalação.

### Home
- Continuar assistindo, sugestões (não assistidos), assistidos recentemente e prévia de cada pasta da biblioteca.
  O número de cards se adapta à largura da tela.

### Player embutido
- Controles com auto-hide, tela cheia, modo teatro (vídeo na largura da janela, detalhes e playlist abaixo), volume,
  velocidade (0.25×–2×), botões ±10s, feedback visual dos atalhos. Volume, mudo, velocidade, legendas e modo teatro
  ficam salvos entre sessões e valem para todo vídeo.
- Legendas externas com o mesmo nome do vídeo (`.srt`, `.vtt`, `.sub`, `.ass`) e legendas embutidas no arquivo
  (MKV, MP4): o ffprobe lista as faixas (`list_media_tracks`) e o ffmpeg extrai a escolhida sob demanda
  (`extract_subtitle`; ASS/SSA como ASS, o resto como WebVTT), com cache na sessão. Menu de legendas: Off, arquivo
  externo e faixas embutidas; padrão: arquivo externo, depois a faixa embutida marcada como padrão, depois a primeira
  de texto. Legendas em imagem (PGS, VobSub, DVB) aparecem desabilitadas, com atalho para o player externo. Nada é
  extraído com as legendas desligadas.
- Faixas de áudio: menu quando o arquivo tem duas ou mais (rótulos do ffprobe). A troca usa `audioTracks` do
  `<video>`: no Windows o WebView2 só o expõe com a flag `AudioVideoTracks` (`additionalBrowserArgs` em
  `tauri.conf.json`, mantendo as flags padrão do wry), no macOS o WebKit sempre. O webview omite faixas que não
  decodifica (AC3, E-AC3, DTS no WebView2), então `matchAudioTracks` casa as listas pela ordem das faixas suportadas
  (e pelo idioma) e marca as demais como "Format not supported here". Sem `audioTracks` ou sem casamento seguro, as
  faixas aparecem desabilitadas com o atalho para o player externo. Quando o webview não decodifica nenhuma faixa
  (ex.: MKV só com E-AC3 no Windows), o vídeo toca mudo sem erro: um aviso fixo sobre o vídeo (`NoSoundNotice`,
  também em tela cheia) explica e oferece abrir no player externo (pausando o do app) ou dispensar, mesmo com uma
  faixa só. Validado no Windows com AAC+AAC (MP4 e MKV), AC3+AAC e E-AC3+E-AC3; macOS e Linux não foram testados.
- Playlist ("Up next") e diálogo "Up next" com contagem regressiva de 5s ao terminar, na mesma ordem.
- Retomada do ponto onde parou.
- Atalhos padrão (configuráveis, ver "Atalhos de teclado"): `Espaço`/`K` play/pause · `J`/`L` ±10s · `←`/`→` ±5s ·
  `↑`/`↓` volume ±5% · `[`/`]` velocidade ±0.25× · `Backspace` volta para 1× · `F` tela cheia · `T` modo teatro ·
  `M` mudo · `C` legendas. `Esc` (fixo) fecha o player ou sai da tela cheia.
- Usar o frame atual como thumbnail do vídeo (botão na barra de controles). O frame é extraído pelo ffmpeg no
  backend (`services/media/cover.rs`) no tempo enviado pelo player, não por canvas: o vídeo vem do asset protocol, que
  deixaria o canvas bloqueado. A imagem vai para um arquivo novo e a anterior é apagada só depois de gravar no banco.
  "Restore default thumbnail" no diálogo de detalhes volta ao frame automático. Reprocessar a pasta não sobrescreve.
- Abrir no player externo do sistema ou revelar no gerenciador de arquivos; formatos que o webview não toca oferecem
  abrir no player externo.

### Status de visualização
- Marcar/desmarcar como assistido por vídeo, ou em massa por pasta (com confirmação).
- Um vídeo vira assistido ao atingir o limiar (padrão 90%, ajustável em Settings de 50% a 100%; não retroativo) ou ao
  terminar. "Assistido" é persistente: rever do início não desmarca.
- Reset global da visualização em Settings (as tags são mantidas).
- `watch_history` registra cada vez que um vídeo passa a assistido (o "Mark as watched" manual também; a marcação em
  massa por pasta, não).

### Histórico
- Tela History (sidebar, `/history`) com duas abas:
  - **Watched videos**: linha do tempo por dia local ("Today", "Yesterday", data), mais recente primeiro, paginada
    (50 por página, "Show older"). Clicar abre o player; o botão direito mostra o menu de vídeo.
  - **Statistics**: tempo assistido por dia (14 dias) ou por semana (12 semanas, de segunda a domingo).
- Uma entrada por vídeo por dia: as linhas duplicadas que a 1.x gravava a cada tick são agrupadas na consulta, nunca
  apagadas. "Tempo assistido" é a soma da duração dos vídeos que viraram assistidos no dia (cada vídeo uma vez).

### Tags
- Tags por vídeo no diálogo de detalhes, onde também se edita título e descrição.
- Operações em massa por pasta: adicionar tag a todos os vídeos, remover todas as tags.
- Gerenciamento em Settings: criar, listar com uso, excluir tag, remover de todos os vídeos, excluir todas, excluir
  não usadas.

### Busca
- Na home: no banco, por título, descrição e tags.
- Dentro de uma pasta: nos nomes de arquivo em disco, recursiva, com progresso, incluindo vídeos ainda não processados.

### Atalhos de teclado
- Configuráveis em Settings → Shortcuts (`/settings?tab=shortcuts`): as ações do player e voltar/avançar do
  histórico, até 2 teclas cada, sem repetir tecla entre ações. Gravação pela própria tecla (`Esc` cancela); conflito
  oferece "Use here instead"; reset por ação e "Restore all defaults" (com confirmação). Salvo na hora, com rollback.
- Fixos: `Esc`, `?` (ajuda) e os botões laterais do mouse. Reservadas (não atribuíveis): `Esc`, `?`, `Tab`,
  `Shift+Tab`, `Enter`.
- `?` em qualquer tela (fora de campos de texto) ou o botão de teclado na barra superior e no player abre a ajuda com
  as teclas atuais; dela, "Customize in Settings" leva à aba.
- Formato: modificadores na ordem `Ctrl+Alt+Shift+Meta` e a tecla do `KeyboardEvent.key` (segue o layout; letras em
  maiúscula, `Space`, `Plus`; `Shift` só com teclas nomeadas). Padrões, teclas reservadas e validação em
  `domain/shortcuts.rs`, expostos pelos bindings; `shared/lib/keyboard.ts` converte eventos e formata para exibição.
  Valores salvos inválidos são reparados ação por ação. Os tooltips mostram a tecla configurada.

### Settings e manutenção
- Estatísticas da biblioteca, pastas da biblioteca, sincronizar tudo, exportar/importar em JSON (com confirmação).
- Limiar de "assistido".
- Informações do banco, vídeos órfãos e limpeza de órfãos, versão do app.
