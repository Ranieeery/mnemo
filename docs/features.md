# Features

Comportamento esperado de cada área do Mnemo. Tudo aqui deve continuar funcionando, incluindo todos os atalhos de
teclado e mouse (ver `CLAUDE.md`).

## Navegação, player e sidebar (implementação)

- Navegação (`app/navigation/useHistoryNavigation`): voltar/avançar, `Alt+←/→` e botões laterais do mouse em todas
  as telas; no player, voltar fecha e avançar reabre o último vídeo. As entradas do histórico são acompanhadas por
  um rastreador único por `RouterHistory` (a barra superior desmonta no player); entradas `/watch` de um vídeo de
  pasta escondida são puladas quando a tela atual não está dentro dela (`isConcealed`), e uma direção sem outra
  entrada fica desabilitada.
- Player (`features/player`): volume, mudo, velocidade, legendas, modo teatro e largura do "Up next" são preferências
  entre sessões (`get_player_preferences`/`update_player_preferences`), carregadas uma vez por sessão na store e
  salvas 400 ms após a última mudança e ao fechar o player; valem para todo vídeo. Progresso salvo no máximo a cada
  5 s e ao pausar, fechar e terminar; cada gravação invalida a lista de pastas da biblioteca e a home (a ordem
  "Recently watched" acompanha o que se assiste).
- Sidebar (`app/layout/Sidebar`): largura e estado recolhido são preferências entre sessões
  (`get_sidebar_preferences`/`update_sidebar_preferences`, `app/layout/useSidebarPreferences`), mantidas no cache
  do TanStack Query e salvas 400 ms após a última mudança (recolher/expandir salva na hora). A sidebar só aparece
  depois que elas carregam, para não abrir expandida e recolher em seguida; se não puderem ser lidas, valem os padrões.
- Painéis laterais redimensionáveis (sidebar e "Up next") usam `shared/ui/ResizablePanel`; o salvamento com atraso
  usa `shared/lib/debounce`.

## Biblioteca e navegação
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
- Sidebar redimensionável e recolhível:
  - a borda direita pode ser arrastada, ou focada e movida com `←`/`→` (16 px por tecla), entre 200 e 400 px, nunca
    mais de ⅓ da janela; uma janela estreita só a encolhe, sem mudar a largura salva; duplo clique volta a 240 px;
  - o botão no topo (`aria-expanded`, tooltip "Collapse sidebar"/"Expand sidebar") a recolhe para um rail de ícones
    (56 px): Home, History, "Add folder", o ícone de cada pasta (nome no tooltip, status como selo no canto, menu de
    contexto mantido) e Settings. O rail mantém toda a navegação a um clique;
  - a transição da largura usa `--duration-base` (zerada com `prefers-reduced-motion`);
  - largura e estado ficam salvos entre sessões; na primeira abertura ela começa expandida, com 240 px.
- Nomes longos de pastas na sidebar expandida quebram em até duas linhas e terminam com reticências. Só quando o nome
  está cortado (medido de novo ao redimensionar) um tooltip mostra o nome completo e o caminho, ao passar o mouse ou
  focar pelo teclado; sem corte, o caminho continua no `title`.
- Nome da pasta da biblioteca só no app (`domain/folder_name.rs`, `rename_library_folder`); a pasta no disco nunca é
  renomeada. `LibraryFolder.name` é o nome exibido (o personalizado ou o da pasta), com `folderName` (do disco) e
  `customName`; o backend já devolve o nome exibido também em `HiddenFolder.name` e `SubfolderEntry.name` quando o
  caminho é uma pasta da biblioteca, e o frontend usa `shared/lib/folderName` (`useFolderName`) onde só tem o caminho
  (título e "not connected" da tela da pasta, busca, "Up next"/player, histórico, processamento, "Locate folder…"):
  - "Rename" no menu de contexto ou `F2` com a pasta focada: na sidebar expandida, edição no lugar (texto todo
    selecionado, nome da pasta como placeholder); no rail, um `Popover` ao lado do ícone com "Folder on disk: …".
    `Enter` salva, `Esc` cancela (sem propagar), clicar fora salva; `Enter`/`Esc` devolvem o foco à pasta;
  - trim, caracteres de controle viram espaço, até 100 caracteres (`MAX_FOLDER_NAME_CHARS`); vazio ou igual ao nome
    da pasta volta ao nome da pasta; nomes repetidos são permitidos. Valor igual ao atual não chama o backend;
  - otimista, com rollback e toast; invalida `["library"]` (home, escondidas, ordem por nome);
  - "Reset to folder name" no menu só com nome personalizado. Com ele, o tooltip da pasta (sempre visível nesse
    caso, também no rail) mostra "Folder: …" e a tela da pasta mostra "Folder on disk: …";
  - "Name (A–Z/Z–A)" ordena pelo nome exibido; o nome fica na linha (por `id`): sobrevive à realocação e à pasta
    renomeada no disco (o watcher não move pastas da biblioteca: ela fica desconectada até "Locate folder…").
- Ícones personalizados para pastas da biblioteca: qualquer ícone do lucide, salvo pelo nome em `custom_icon`. O
  seletor tem a aba "Suggested" (até 40: os 8 últimos usados, guardados em `app_settings`, e uma lista curada) e
  "All icons" (todos, com busca). Emojis salvos pela 1.x aparecem como o ícone padrão de pasta.
- Cor do ícone da pasta, no mesmo diálogo ("Icon and color…" no menu de contexto): "Default" (a cor do texto, como
  antes) ou uma das 10 cores da paleta, com prévia ao vivo sobre o fundo da sidebar e a grade de ícones já pintada.
  "Save" grava ícone e cor (`set_library_folder_appearance`); "Reset to default" volta os dois. A cor aparece na
  sidebar, no rail, na home e em Settings → Library; a pasta atual continua marcada pelo fundo, pela barra `accent`
  e pelo `aria-current`, e uma pasta desconectada mantém a cor (o estado vem do ícone de tomada e do nome
  esmaecido). A cor nunca identifica a pasta sozinha: o nome está sempre no link ou no tooltip.
- Ordem das pastas da biblioteca (`services/folder_order`, regras puras em `domain/folder_order.rs`), aplicada na
  sidebar, no rail, na home e em Settings → Library:
  - o botão de ordenação no cabeçalho "Library" (no rail, abaixo do "Add folder") abre um menu com "Custom order",
    "Name (A–Z)", "Name (Z–A)" (ordem natural), "Newest first", "Oldest first" (data de adição) e "Recently watched";
    o ícone e o nome do botão mostram o modo atual, salvo em `library_folder_sort`;
  - "Recently watched": o `last_watched_at` mais recente dos vídeos de cada pasta (uma faixa sobre o índice de
    `file_path` por pasta, inclusive sumidos e marcações em massa); pastas nunca assistidas ficam no fim, por nome;
  - empates: nome, depois caminho, pasta antes de grupo e id; data de adição, depois pasta antes de grupo e id;
  - a ordem custom muda arrastando a pasta depois de segurá-la por 400 ms (uma barra `accent` enche enquanto ela é segurada; soltar antes é um clique, que abre a pasta, e mover o mouse mais de 5 px desiste; só o eixo vertical; a vaga
    marca com uma linha `accent` onde ela vai cair), pelo teclado (`Space` pega, `↑`/`↓` movem, `Space`/`Enter`
    soltam, `Esc` cancela, com anúncios para leitor de tela) ou por "Move up"/"Move down" no menu de contexto (dentro
    da lista da pasta: o grupo dela, ou a lista principal, onde um grupo conta como uma posição).
    Mover em outro modo troca para custom a partir da ordem na tela (`arrange_library` grava grupos, ordem e modo numa
    transação; o que o pedido deixa de fora fica depois, no grupo em que estava). É otimista, com rollback e toast.
    Com uma pasta só e sem grupos, não há arraste nem "Move up/down";
  - pastas e grupos novos vão para o fim da lista; remover renumera sem lacunas; realocar mantém a posição; uma pasta
    desconectada continua no lugar e pode ser movida.
- Grupos de pastas da biblioteca (`services/library_groups`, `db/groups.rs`; nome validado como o nome personalizado,
  `normalize_group_name`, mas nunca vazio; nomes repetidos são permitidos):
  - pastas sem grupo e grupos formam uma lista só, intercalados (`db/layout.rs`: `sort_order` numera juntos as pastas
    sem grupo e os grupos, e as pastas de cada grupo têm a sua sequência). `get_library_layout` devolve a lista
    (`LibraryEntry`: pasta, ou grupo com as pastas dele) já ordenada; `list_library_folders` é a mesma ordem plana
    (as pastas de um grupo no lugar dele), seguida pela home e por Settings → Library, sem cabeçalhos (Settings mostra
    "Group: …"). Sem grupos, o painel é o de sempre;
  - o modo de ordenação vale na lista e dentro de cada grupo (`folder_order::sort_entries`): o grupo é comparado
    pelo nome, pela data de criação e, em "Recently watched", pela pasta dele assistida mais recentemente (nunca
    assistido vai para o fim, por nome);
  - cabeçalho (`LibraryGroupHeader`): botão com `aria-expanded`, seta, nome e contagem ("Series, 3 folders");
    clique, `Enter` ou `Space` recolhe/expande (salvo em `collapsed`, otimista). Recolhido com a pasta atual dentro,
    leva a barra `accent`. As pastas expandidas ficam recuadas, ao longo de uma linha-guia. Menu: "Rename group"
    (`F2`, vazio mantém o nome), "Move up"/"Move down", "Delete group" (com confirmação só se tiver pastas, que
    ficam sem grupo no lugar onde o grupo estava; toast);
  - "New group…" no menu de ordenação ou em "Move to group" da pasta (que já move a pasta, numa transação): o nome
    é editado no fim da lista (no rail, num popover); `Enter`/blur cria, `Esc` ou vazio desiste. O campo só abre
    depois que o menu fecha (o menu prende o foco);
  - "Move to group" (submenu da pasta): os grupos (o atual marcado e desabilitado), "New group…" e "Remove from
    group"; vai para o fim do grupo (ou, ao sair, para o fim da lista) e mantém o modo de ordenação;
  - arrastar (`GroupedFolderList` e `hooks/useLibraryDrag`, um `SortableContext` só; regras puras em
    `lib/libraryRows.ts`): a lista vira linhas (pasta, cabeçalho de grupo e fim de grupo, `GroupEndRow`), e o
    arraste aplica cada passo a uma cópia da biblioteca, então a vaga mostra onde a pasta cai. Uma pasta pertence ao
    grupo cujo cabeçalho vem antes dela, até o fim dele: soltar antes do fim põe no grupo, depois dele tira. Grupo
    vazio mostra "Drag folders here". Uma pasta segura 500 ms sobre o cabeçalho de um grupo recolhido abre o grupo
    só durante o arraste (`OPEN_GROUP_DELAY_MS`). Segurar o cabeçalho 400 ms arrasta o grupo: só as pastas dele
    somem (o resto fica no lugar, sob o ponteiro), e ele nunca cai dentro de outro grupo (vai para antes ou depois
    dele). Os anúncios dizem quando a pasta entra ou sai de um grupo;
  - rail: cada grupo começa com uma linha discreta (`RailGroupSeparator`, tooltip "Series · 3 folders") e termina
    com outra quando vem algo depois, mostra as pastas mesmo recolhido (navegação a um clique), some quando vazio
    (sem perder o lugar na lista); o tooltip da pasta diz "Group: …";
  - pastas desconectadas, escondidas, renomeadas ou realocadas continuam no grupo; pastas novas entram sem grupo.
- Estatísticas por pasta: total, assistidos e percentual de progresso.
- A biblioteca acompanha o disco sozinha (ver "Sincronização com o disco"):
  - vídeos novos são lidos;
  - renomeados e movidos mantêm progresso, tags, título e histórico;
  - apagados ficam sumidos por 30 dias.
- Pasta desconectada (HD externo, rede offline): aparece com um ícone na sidebar, e a tela da pasta explica e oferece
  "Try again". Os vídeos continuam na home e nada é perdido.
- "Locate folder…" (só para pasta desconectada: menu de contexto da sidebar e tela "This folder is not connected")
  aponta a pasta para o lugar novo quando ela foi movida, renomeada ou o drive mudou de letra. Nenhum arquivo é
  movido. Abre o seletor nativo (cancelar não faz nada) e depois o diálogo global (`RelocateFolderDialog`, via
  `openFolderRelocation`) com "Was/Now" e o resultado: "142 of 150 videos found", aviso de que pode não ser a mesma
  pasta abaixo de 50% ("Use anyway"), arquivos com mesmo nome e tamanho diferente, ou o motivo da recusa, com
  "Choose another folder…". Ao aplicar, vídeos, progresso, tags, histórico, ícone, thumbnails e modos de exibição
  são mantidos; os não encontrados ficam sumidos. A pasta volta a ser monitorada sem reiniciar, um toast mostra o
  resultado e a tela de uma pasta dentro do caminho antigo vai para o equivalente no novo.
- Esconder da home e do histórico (privacidade; ver "Pastas escondidas" em Banco de dados): qualquer pasta, pelo menu
  de contexto da sidebar/rail e do card de subpasta, ou pelo "…" da pasta atual ("Hide from home and history" /
  "Show on home and history"; dentro de uma pasta escondida, o item fica desabilitado como "Hidden with “X”"). Os
  vídeos somem da home (as quatro seções), da busca da home, do histórico (lista e estatísticas), da ordem "Recently
  watched", de listagens a partir de pastas acima (modo contínuo, busca por arquivo, playlist) e de voltar/avançar
  vindo de fora; abrindo a pasta, tudo aparece e toca normalmente, e o progresso continua sendo salvo. Indicador
  `EyeOff` discreto (`shared/video/HiddenFolderMark`, com texto para leitor de tela) na pasta escondida: card de
  subpasta, sidebar expandida (no rail, no tooltip) e Settings → Library; o cabeçalho da pasta diz "Hidden from home
  and history", ou "... with “X”" dentro de uma escondida. Settings → Library → "Hidden folders" lista todas
  (caminho a partir da pasta da biblioteca, "Not found" quando inacessível) com "Open" e "Show". Esconder ou mostrar
  dá toast e invalida `["library"]`.

## Processamento de mídia
- Metadados e thumbnail em segundo plano, vários arquivos em paralelo. A barra mostra as pastas, os arquivos em
  leitura, o progresso total e as falhas, com "Cancel" (tudo) e "Details" (progresso e cancelamento por pasta, lista
  de falhas com "Show in file manager"). "Sync folder" e "Sync library" mostram o resultado ao fim, em qualquer tela.
- Vídeos já processados são ignorados; falha na thumbnail não descarta o vídeo.
- Detecção de ffmpeg/ffprobe com instruções de instalação.

## Home
- Continuar assistindo, sugestões (não assistidos), assistidos recentemente e prévia de cada pasta da biblioteca.
  O número de cards se adapta à largura da tela.

## Player embutido
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
- Estilo das legendas (Settings → Playback → Subtitles, com prévia centralizada sobre fundo metade escuro e metade
  claro por padrão, escuro, claro ou uma thumbnail da biblioteca, e texto de exemplo editável que não é salvo; atalho
  "Subtitle style…" no menu de legendas): tamanho 50–200% (relativo à largura do vídeo, `cqw`, então cresce em tela cheia),
  cor (amostras: branco, amarelo, verde, ciano, magenta, nos tokens `--color-subtitle-*`), fundo e sua opacidade,
  contorno (nenhum, sombra, contorno), posição (0–40% da altura a partir da base, mais o espaço dos controles quando
  visíveis) e fonte (a do app ou as famílias genéricas do sistema: sans, serif, mono; nada embutido). Setting tipado
  `subtitle_style` (`domain/subtitle_style.rs`); `shared/lib/subtitleStyle.ts` gera o CSS e `shared/video/SubtitleLine`
  desenha a linha no player e na prévia. Os padrões reproduzem o visual anterior. Estilos próprios de ASS são
  ignorados.
- Playlist ("Up next") e diálogo "Up next" com contagem regressiva de 5s ao terminar, na mesma ordem. A coluna
  acompanha a janela (~¼ da largura, 256–448 px) até o usuário arrastar a borda ou usar `←`/`→` nela (240–800 px,
  no máximo metade da janela); duplo clique volta ao automático. A largura fica nas preferências do player.
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

## Status de visualização
- Marcar/desmarcar como assistido por vídeo, ou em massa por pasta (com confirmação).
- Um vídeo vira assistido ao atingir o limiar (padrão 90%, ajustável em Settings de 50% a 100%; não retroativo) ou ao
  terminar. "Assistido" é persistente: rever do início não desmarca.
- Reset global da visualização em Settings (as tags são mantidas).
- `watch_history` registra cada vez que um vídeo passa a assistido (o "Mark as watched" manual também; a marcação em
  massa por pasta, não).

## Histórico
- Tela History (sidebar, `/history`) com duas abas:
  - **Watched videos**: linha do tempo por dia local ("Today", "Yesterday", data), mais recente primeiro, paginada
    (50 por página, "Show older"). Clicar abre o player; o botão direito mostra o menu de vídeo.
  - **Statistics**: tempo assistido por dia (14 dias) ou por semana (12 semanas, de segunda a domingo).
- Uma entrada por vídeo por dia: as linhas duplicadas que a 1.x gravava a cada tick são agrupadas na consulta, nunca
  apagadas. "Tempo assistido" é a soma da duração dos vídeos que viraram assistidos no dia (cada vídeo uma vez).

## Tags
- Tags por vídeo no diálogo de detalhes, onde também se edita título e descrição.
- Operações em massa por pasta: adicionar tag a todos os vídeos, remover todas as tags.
- Gerenciamento em Settings: criar, listar com uso, excluir tag, remover de todos os vídeos, excluir todas, excluir
  não usadas.

## Busca
- Na home: no banco, por título, descrição e tags.
- Dentro de uma pasta: nos nomes de arquivo em disco, recursiva, com progresso, incluindo vídeos ainda não processados.

## Atalhos de teclado
- Configuráveis em Settings → Shortcuts (`/settings?tab=shortcuts`): as ações do player e voltar/avançar do
  histórico, até 2 teclas cada, sem repetir tecla entre ações. Gravação pela própria tecla (`Esc` cancela); conflito
  oferece "Use here instead"; reset por ação e "Restore all defaults" (com confirmação). Salvo na hora, com rollback.
- Fixos: `Esc`, `?` (ajuda), `F2` (renomear a pasta da biblioteca focada, à frente de um atalho na mesma tecla) e os
  botões laterais do mouse. Reservadas (não atribuíveis): `Esc`, `?`, `Tab`,
  `Shift+Tab`, `Enter`.
- `?` em qualquer tela (fora de campos de texto) ou o botão de teclado na barra superior e no player abre a ajuda com
  as teclas atuais; dela, "Customize in Settings" leva à aba.
- Formato: modificadores na ordem `Ctrl+Alt+Shift+Meta` e a tecla do `KeyboardEvent.key` (segue o layout; letras em
  maiúscula, `Space`, `Plus`; `Shift` só com teclas nomeadas). Padrões, teclas reservadas e validação em
  `domain/shortcuts.rs`, expostos pelos bindings; `shared/lib/keyboard.ts` converte eventos e formata para exibição.
  Valores salvos inválidos são reparados ação por ação. Os tooltips mostram a tecla configurada.

## Settings e manutenção
- Estatísticas da biblioteca, pastas da biblioteca (com o status de cada uma: monitorada, verificada a cada 10 min e
  por quê, ou desconectada), sincronizar tudo, exportar/importar em JSON (com confirmação).
- "Watch folders for changes" (ligado por padrão).
- Limiar de "assistido".
- Pastas escondidas da home e do histórico (lista, abrir e mostrar de novo).
- Informações do banco, vídeos sumidos e órfãos (lista e limpeza com confirmação; sumidos de pastas escondidas só
  contados), versão do app.
