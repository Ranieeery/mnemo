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
  `docs/features.md` deve continuar funcionando, incluindo todos os atalhos de teclado e mouse.
- **Compatibilidade de dados:** quem atualiza o app abre o `mnemo.db` atual sem perder nada (inclusive bancos criados
  pelas versões 1.x), e exports JSON antigos continuam importáveis.
- **Git:** não faça commit, push, nem crie branches. Apenas altere os arquivos; a revisão e os commits são feitos por mim.
  Ao fim de um trabalho, passe os comandos `git add` e a mensagem de commit sugerida. **Nunca** commite sem permissão
  explícita para aquele commit, e nunca com linha de autoria (`Co-Authored-By` ou similar).
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
- **Versão e release** (o aviso de atualização compara a versão em execução com a tag da última release publicada no
  GitHub; se algo abaixo falhar, os usuários recebem avisos errados ou eternos):
  1. A mesma versão em `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` e
     no `README.md`; `bun run check:version --tag X.Y.Z` confere (sem rede).
  2. Tag leve igual à versão, sem `v` (`2.5.0`).
  3. Release publicada (nem draft, nem pre-release) e marcada Latest, com o mesmo título; começa com
     `**Full Changelog**: …/compare/<anterior>...<nova>` e leva o `.msi` (`bundle/msi`) e o `-setup.exe`
     (`bundle/nsis`).

  Versões anteriores à primeira com o aviso (2.7.0) não avisam. A skill `release` segue esses passos.
- Skills e plugins (design, React, revisão) são referência geral: em conflito, valem este arquivo, os tokens e os
  componentes de `src/shared/ui`. Regras de Next.js ou de servidor não se aplicam (app Tauri, sem SSR).
- **Documentação por área** (leia a seção da área antes de mexer nela; atualize-a junto com o código):
  - `docs/features.md`: comportamento de cada tela e feature, atalhos, preferências do player e da sidebar;
  - `docs/database.md`: tabelas, settings, migrações, vídeos sumidos, pastas escondidas e campos do export;
  - `docs/media-and-sync.md`: pipeline de mídia, watcher, reconciliação, disponibilidade e realocação.

## Stack

| Camada | Escolha |
|---|---|
| Shell desktop | Tauri 2 (Rust, edição 2024) |
| Backend | Rust: `tokio` (+ `tokio-util` para `CancellationToken`), `serde`, `thiserror`, `tracing`, `rusqlite` (bundled) + `rusqlite_migration` |
| Verificação de atualização | `ureq` 3 (só `rustls`, com `ring` e `webpki-roots`: sem OpenSSL nem `aws-lc`; síncrono, num `spawn_blocking`) e `semver` (já vinha pelo Tauri; `package_info().version` é um `semver::Version`) |
| Monitoramento de pastas | `notify-debouncer-full` (re-exporta `notify`) e `xxhash-rust` (xxh3, hash estável entre versões do Rust, para reconhecer arquivos renomeados ou movidos) |
| Bindings IPC | `tauri-specta` 2 RC, versão fixada com `=` (tipos TypeScript e constantes gerados a partir do Rust) |
| Plugins Tauri | `dialog` (seleção de pasta e de arquivo de backup). `tauri-plugin-opener` só como crate Rust (abrir no player externo / revelar / abrir a página da release), sem plugin nem permissão no webview |
| Frontend | React 19 + TypeScript 7 (strict) + Vite 8 |
| Estilo | Tailwind CSS 4 com tokens via `@theme` (padrões do Tailwind desligados) |
| Primitivos de UI | Radix UI (acessibilidade), compostos no design system próprio em `src/shared/ui` |
| Roteamento | TanStack Router (rotas tipadas, histórico por hash, voltar/avançar) |
| Estado de servidor | TanStack Query (dados vindos do Rust: cache, invalidação, loading/erro) |
| Estado de UI | Estado local; Zustand apenas para estado global de UI (processamento, diálogos, player) |
| Listas grandes | TanStack Virtual |
| Arrastar e soltar | dnd-kit (`@dnd-kit/core`, `sortable`, `utilities`): reordenar as pastas da biblioteca, com teclado e anúncios para leitor de tela. A `@dnd-kit/react` ainda é 0.x |
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
bun run test src/features/player   # só os testes de um caminho
bun run check:version --tag 2.7.0  # as cinco versões iguais (e iguais à tag); fora do check, roda na release

cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test               # também regenera src/shared/ipc/bindings.ts (teste export_typescript_bindings)
cargo test sync::        # só os testes cujo nome contém o filtro
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
├── lib.rs              # setup: tracing (console e `mnemo.log` no app_log_dir, recriado a cada início), estado,
│                       # escopo de assets, registro de comandos; falha no setup vira diálogo nativo e encerra
├── state.rs            # AppState (banco, caminhos, processador em segundo plano, busca em andamento)
├── error.rs            # AppError (thiserror), serializado como { kind, message }
├── commands/           # camada fina: recebe input, chama serviços. Lista de comandos e constantes dos bindings.
├── services/           # regras: biblioteca e navegação, ordem das pastas, scanner, mídia (ffprobe/ffmpeg e pipeline), sync com o
│                       # disco (watcher e reconciliação), busca, visualização, pastas escondidas, grupos, tags, backup, manutenção,
│                       # legendas, sistema, escopo de assets, aviso de atualização (GitHub)
├── db/                 # conexão, migrations.rs e repositórios (videos, presence, watch, orphans, tags, folders,
│                       # settings, history, backup, hidden, groups, layout)
└── domain/             # tipos e regras puras: extensões e mídia, limiar, ordem natural, faixas de pasta, modo de
                        # exibição, ordem, nome e cor das pastas da biblioteca, pastas escondidas, realocação, layout
                        # da janela, player, estilo de legenda, atalhos, tags, versões de release, modelos (models/)

src/
├── app/                # entrada, router, RootLayout, layout (shell), rotas que compõem features, DialogHost
├── features/           # um diretório por domínio: home, browser, player, search, tags, settings, library, history,
│   │                   # shortcuts, dev-catalog (catálogo do design system, só em dev)
│   └── <feature>/      # components/, hooks/, lib/, queries.ts, index.ts e testes ao lado (*.test.ts[x])
└── shared/
    ├── ui/             # design system (agnóstico de domínio) + ScrollContainer, VirtualList, useColumns, useIsTruncated,
    │                   # useFocusAfterRemoval, useRovingFocus
    ├── video/          # UI e ações de vídeo usadas por várias features (card, thumbnail, grade, menu de contexto,
    │                   # visibilidade de pastas escondidas)
    ├── ipc/            # bindings gerados, client (`call()` → CommandError), queryKeys, queryClient, queries comuns
    ├── lib/            # funções puras (duração, bytes, caminhos, classes, parsers de legenda, debounce,
    │                   # capitalize, direção de ordenação)
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
- Dados: tudo o que deriva da biblioteca fica sob a query key `["library"]`; mutações invalidam esse prefixo.
  "Marcar como assistido" é otimista com rollback (`shared/video/replaceVideo` atualiza o vídeo em qualquer cache).
- Navegação, player e sidebar (histórico, preferências salvas, painéis redimensionáveis): `docs/features.md`.

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
- Tabelas: `videos`, `tags`, `video_tags`, `library_folders`, `library_groups`, `watch_history`,
  `app_settings`, `folder_settings`, `hidden_folders` (colunas em `docs/database.md`).
- `app_settings` é chave/valor em JSON com acesso tipado (`db/settings.rs`): cada setting implementa `Setting` (chave,
  tipo, padrão, validação na escrita e reparo na leitura) e é lido com `settings::get::<S>` e gravado com
  `settings::set::<S>`. Valores ilegíveis viram o padrão (com log), nunca erro. A lista de settings e o reparo de
  cada um estão em `docs/database.md`.
- **Migrações versionadas** (`rusqlite_migration`, em `db/migrations.rs`; o que cada uma faz em `docs/database.md`).
- Nunca edite uma migração já existente; crie uma nova.
- Filtros por pasta usam faixas sobre o índice de `file_path` (`domain::paths::FolderBounds`), nunca `LIKE`.
- Remover vídeos ou pastas também remove as thumbnails (só dentro do diretório de thumbnails). Remover uma pasta
  mantém o que outra pasta da biblioteca ainda cobre: tudo, se ela está dentro de outra, e o conteúdo das pastas da
  biblioteca aninhadas nela. Depois de remover, realocar ou importar, os jobs de pastas que saíram da biblioteca são
  cancelados (`Processor::forget_outside`, sem aviso ao usuário), e o escritor do pipeline só grava vídeos que, na
  mesma transação, ainda estão dentro de uma pasta da biblioteca. Adicionar uma pasta sempre
  força a leitura, mesmo que ela já tenha sido lida na sessão antes de ser removida.
- Vídeos cujo arquivo sumiu não são apagados: recebem `missing_since` (`db/presence.rs`) e voltam com todos os
  dados se o arquivo reaparecer.
- Pastas escondidas (`db/hidden.rs`) são filtradas no SQL pelo fragmento `hidden::VISIBLE` e, nas listagens do disco,
  por `domain::hidden::HiddenFolders`.
- Export/import JSON com `formatVersion` (atual: 2); o import aceita exports das versões 1.x e é atômico. Campos novos
  entram como opcionais, sem mudar o `formatVersion`; exports antigos importam com o padrão, e valores que o app
  recusaria são descartados ou viram o padrão (regras por campo em `docs/database.md`).

## Mídia

- `ffmpeg`/`ffprobe` são exigidos no `PATH`; sem eles o app avisa e explica como instalar.
- Processos externos com `CREATE_NO_WINDOW` no Windows e timeout; saída do `ffprobe` lida como JSON via `serde`.
- Thumbnails em `<appDataDir>/thumbnails/`, exibidas via asset protocol.
- `MediaToolkit` (probe e thumbnail, usado pelo pipeline) e `TrackToolkit` (faixas e extração de legendas) abstraem
  o ffmpeg para os testes. Comandos que entregam caminhos ao ffmpeg ou ao sistema usam `library::library_file`.
- Pipeline (`services/media/processing`): jobs por pasta, um pool fixo de workers e um único escritor em lote,
  cancelável sem deixar nada pela metade.

## Sincronização com o disco

- `services/sync` (`LibrarySync` no `AppState`): um único loop trata tudo em ordem, então duas comparações nunca
  disputam o banco. Ele faz:
  - a comparação de todas as pastas acessíveis ao iniciar (3 s após abrir a janela);
  - os eventos do watcher;
  - as pastas que voltaram a ficar acessíveis;
  - as pastas em verificação periódica;
  - os pedidos de `process_folders`, que compara a pasta antes de enfileirar os vídeos novos;
  - as realocações (`relocate_library_folder` → `LibrarySync::relocate`), aplicadas entre duas comparações.
  - os imports (`import_library` → `LibrarySync::import`), que aplicam o `watch_folders` do arquivo e comparam
    todas as pastas em seguida.
- Um arquivo novo assume um vídeo que desapareceu ou está sumido quando tem o mesmo tamanho e a mesma impressão
  digital (`identity.rs`: xxh3 do tamanho, dos primeiros e dos últimos 64 KiB). Para vídeo ainda sem impressão
  digital, valem mesmo tamanho e mesmo nome de arquivo. O par só vale se for único nos dois sentidos: cópias
  idênticas nunca são adivinhadas.
- Segurança dos dados:
  - nada é marcado sumido abaixo de uma pasta raiz inacessível ou de uma subpasta ilegível;
  - a raiz é conferida de novo logo antes de gravar;
  - arquivos novos que ainda crescem ou estão travados (em cópia) são adiados e conferidos de novo depois.
- O frontend recebe os eventos `libraryChanged` (invalida `["library"]`, no máximo uma vez por segundo, em
  `shared/ipc/followLibrary.ts`, menos a busca em disco, que nunca terminaria com arquivos mudando),
  `libraryFoldersChanged` (invalida os status) e `startupSyncFailed` (toast: a comparação ao iniciar falhou; as
  outras falhas do loop ficam só no log).
- Realocação, watcher, disponibilidade e o resto do fluxo: `docs/media-and-sync.md`.

## Segurança

- CSP real em `tauri.conf.json` (a `devCsp` libera scripts inline e o websocket do Vite).
- Escopo do asset protocol vazio na config e liberado em tempo de execução só para as pastas da biblioteca e as
  thumbnails. Pastas removidas deixam de ser servidas no próximo início (a API do Tauri só amplia escopos).
- WebView2 recebe `--enable-blink-features=AudioVideoTracks` (troca de faixa de áudio) além das flags padrão do wry
  (`--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`), que precisam continuar na lista.
- Capability mínima: `core:default`, `dialog:allow-open`, `dialog:allow-save`. Comandos que recebem caminhos validam
  que eles estão dentro da biblioteca.
- A única requisição de rede do app é a verificação de atualização (`services/updates`), feita pelo Rust: `GET` da
  última release no GitHub, HTTPS com TLS verificado, timeout de 10 s, até 3 redirecionamentos, resposta de até
  1 MiB, sem token e sem identificadores além do user agent `Mnemo/<versão>`. Da resposta só se lê `tag_name`,
  validada como `X.Y.Z`; a URL da página é montada no Rust com as constantes de `domain/updates.rs` e essa tag, e o
  frontend nunca passa URL. CSP e capability não mudam. O setting `check_for_updates` desliga a verificação
  automática; o override `MNEMO_FAKE_LATEST_RELEASE` só existe em build de debug.

## Design system e UX

### Tokens

Em `src/shared/styles/tokens.css` (`@theme` do Tailwind 4, com os padrões do Tailwind desligados) e `base.css`
(estilos globais e `prefers-reduced-motion`). Nunca use valores soltos (hex, px arbitrários, durações avulsas).

- Cores: `background`, `surface`, `surface-raised`, `surface-hover`, `border`, `border-strong`, `control-border`,
  `text`, `text-muted`, `text-subtle`, `accent`, `accent-hover`, `success`, `warning`, `danger`, `danger-text`,
  `focus-ring`, `overlay`, `scrim`, `backdrop` e `*-foreground` para texto sobre cores sólidas. Neutros grafite quase
  sem matiz (não tingem as thumbnails); a profundidade vem do degrau entre as camadas, e `border` fica para separar
  conteúdo (em `shared/ui`, cards e botões usam `border-transparent`, que só aparece no alto contraste do Windows).
  O `accent` (claro, com `accent-foreground` escuro) e o `danger` são para preenchimentos e indicadores, nunca para
  texto pequeno (texto de erro usa `danger-text`). `shared/styles/colors.test.ts` confere: `text`, `text-muted`,
  `text-subtle` e `danger-text` com pelo menos 4,5:1 sobre `background`, `surface`, `surface-raised` e
  `surface-hover`; `accent-foreground` com 4,5:1 sobre `accent` e `accent-hover`; `accent` e `focus-ring` com 3:1
  nas quatro superfícies; `control-border` (borda de campos) com 3:1 nas três primeiras; superfícies em ordem
  crescente de luminosidade.
- Tipografia (Inter Variable com o eixo `opsz`: tamanhos grandes usam o corte display via `font-optical-sizing`;
  a Inter do fontsource não traz as variantes `cv*`): `text-caption` 12/16 · `text-small` 13/20 · `text-body` 14/20 · `text-lead` 16/24 ·
  `text-title` 18/26 · `text-heading` 22/28 · `text-display` 28/34.
- Raio: `rounded-badge` 4 · `rounded-control` 6 · `rounded-card` 10 · `rounded-dialog` 14. Sombras: `shadow-raised`,
  `shadow-overlay`, `shadow-dialog`. Espaçamento: escala do Tailwind (base 4px).
- Movimento: `duration-(--duration-fast|base|slow)` (120/200/320ms), `ease-standard|out|in`, animações
  `animate-appear|disappear|pop-in|pop-out|slide-in|pulse-soft|indeterminate|spin|hold-fill` (`hold-fill` recebe a duração de quem usa). Com `prefers-reduced-motion` as
  durações vão a zero; animações em loop usam `motion-reduce:animate-none`.
- Tema escuro por padrão; um tema claro só precisa redefinir as variáveis de cor.
- O Tailwind só mantém no build as variáveis do `@theme` que aparecem por nome no código. Variáveis montadas em
  tempo de execução (ex.: `var(--color-subtitle-${cor})`) ficam num bloco `@theme static`, e um teste confere que
  estão lá.
- Cores de ícone de pasta da biblioteca: `folder-red|orange|amber|lime|green|teal|cyan|blue|violet|pink`
  (`@theme static`, valores do tema claro em `:root[data-theme="light"]`; a lista vem de `FOLDER_COLORS` nos
  bindings). Cada uma tem pelo menos 3:1 sobre `background`, `surface`, `surface-raised` e `surface-hover` nos dois
  temas; `shared/styles/colors.test.ts` confere (o tema claro ainda não existe: o teste usa fundos de
  referência, a trocar pelos tokens dele).

### Componentes

Em `src/shared/ui` (exportados por `index.ts`), sobre Radix quando há interação: `Button`, `IconButton`, `Input`,
`Textarea`, `SearchInput`, `Dialog`, `ConfirmDialog`, `DropdownMenu` (com `DropdownMenuSortItem`: campo de ordenação
num radio group; escolher de novo inverte a direção, mostrada por uma seta e no nome acessível, e o menu fica aberto),
`ContextMenu` (com submenu: `ContextMenuSub`; `ContextMenuItem` desabilitado com `disabledReason` usa `aria-disabled`,
continua alcançável pelas setas, mostra o motivo num tooltip e não age),
`Tooltip`, `Toast`, `Progress`,
`Skeleton`, `Card`, `Tabs`, `Slider` (`compact` para volume), `Switch`, `Badge`/`Tag`, `EmptyState`, `ErrorState`, `Kbd`,
`Spinner`, `FolderIcon`, `ScrollToTopButton`, `Popover` (painel flutuante não modal para uma edição rápida; `Esc` e o clique fora são
tratados por quem usa), `ChoiceGroup` (poucas opções exclusivas em botões, ex.: Days/Weeks),
`ResizablePanel` (painel lateral com a borda livre arrastável ou movida pelas setas, largura controlada pelo chamador,
duplo clique para o padrão; com `collapsed`, anima a largura entre os estados e esconde a alça quando recolhido),
`ColorSwatches` (amostras de cor como radiogroup: uma parada de `Tab`, setas e `Home`/`End`, nome acessível e
tooltip por amostra, a escolhida com anel e ✓; usado nas legendas e nas pastas), `sidebarItemClasses` (estados dos
itens da sidebar: a atual tem fundo elevado, barra `accent` à esquerda e, expandida, nome mais forte).
`toast()` pode ser chamado fora do React. `IconButton` desabilitado usa `aria-disabled`: continua focável e com
tooltip (muitas vezes o único lugar que diz por quê) e não age, nem como gatilho de menu. `Tooltip` aceita
`disabled` (fica fechado sem mudar o gatilho, ex.: só mostrar o texto completo quando `useIsTruncated` indica corte). Features compõem esses primitivos; não recriam botões, modais
ou menus.

Catálogo do design system em `/dev/catalog` (só em dev): `Ctrl+Shift+D` alterna entre ele e o app, ou abra
`http://localhost:1420/#/dev/catalog` no navegador.

### Diretrizes de UX

- Todo conteúdo assíncrono tem estado de carregamento (skeleton com o formato do conteúdo), vazio (com orientação do
  que fazer) e erro (com ação de recuperação).
- Ações dão feedback (toast ou mudança visível). Confirmação apenas para ações destrutivas ou em massa.
- O botão direito mostra só os menus do app (`ContextMenu`). O menu do webview (voltar, recarregar, inspecionar) fica
  bloqueado em todo o app (`RootLayout`), exceto em campos de texto, para recortar, copiar e colar.
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
  `MediaToolkit` falso; o sync com o disco é testado de ponta a ponta com o watcher real sobre diretórios temporários,
  com tempos curtos (`Timing`); testes com ffmpeg real ou com uma cópia de banco real são `#[ignore]` (ver Comandos). No
  Windows, `build.rs` embute o manifesto de Common Controls em todos os binários (sem ele, os executáveis de teste do
  Tauri falham com `STATUS_ENTRYPOINT_NOT_FOUND`).
- **Frontend:** funções puras em `shared/lib` com cobertura completa; telas e hooks com Testing Library, mockando o
  backend. Testar comportamento, não implementação. Setup em `shared/test/setup.ts` (jest-dom, polyfills do Radix,
  stub de `<video>`, limpeza dos singletons: cache, processamento, toasts e diálogos; espera os cleanups assíncronos
  de eventos antes de limpar os mocks). Helpers: `renderWithUi`, `renderScreen` (roteador, cache novo e providers),
  `mockCommands`/`callsOf` (comandos não mockados falham; também simula eventos do backend, enviados nos testes com
  `emit` de `@tauri-apps/api/event`), fixtures e `app/testApp.tsx` (app inteiro).
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

O comportamento de cada área (biblioteca e navegação, grupos de pastas, processamento, home, player, status de
visualização, histórico, tags, busca, atalhos, settings) está em `docs/features.md`.
