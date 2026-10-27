# Features

Comportamento esperado de cada área do Mnemo. Tudo aqui deve continuar funcionando, incluindo todos os atalhos de
teclado e mouse (ver `CLAUDE.md`).

## Navegação, player e sidebar (implementação)

- Navegação (`app/navigation/useHistoryNavigation`): voltar/avançar, `Alt+←/→` e botões laterais do mouse em todas
  as telas, menos com um diálogo ou menu aberto; no player, voltar fecha e avançar reabre o último vídeo. As entradas
  do histórico são acompanhadas por um rastreador único por `RouterHistory` (a barra superior desmonta no player);
  entradas `/watch` de um vídeo de pasta escondida são puladas quando a tela atual não está dentro dela
  (`isConcealed`), e uma direção sem outra entrada fica desabilitada.
- Foco (`app/layout/AppShell`): o primeiro `Tab` mostra "Skip to content", que leva ao título (`h1`) da tela. Ao
  trocar de tela (depois de carregada), o foco vai para o `h1` novo quando estava na tela anterior ou se perdeu com
  ela; na sidebar ou na barra superior ele fica onde está (o `F2` continua renomeando a pasta recém-aberta). Um
  `Dialog` sem campo com `autoFocus` foca o próprio painel ao abrir, para o primeiro `Esc` fechá-lo (focar o X abriria
  o tooltip, que ficaria com o `Esc`). Controles que somem com o foco (tag removida, tecla de atalho removida ou
  gravada, tag excluída) passam o foco ao vizinho ou ao campo da lista (`shared/ui/useFocusAfterRemoval`).
- Grupos de itens (amostras de cor, grades de ícones, colunas do gráfico do histórico) são uma parada de `Tab`
  (`shared/ui/useRovingFocus`): as setas movem (e, nas amostras e ícones, escolhem), `Home`/`End` vão às pontas; nas
  grades de ícones, `↑`/`↓` mudam de linha e `Home`/`End` ficam na linha. A parada é o item escolhido (o primeiro, sem
  escolha) ou, no gráfico, a coluna mais recente. Em "All icons" a linha do ícone escolhido fica sempre renderizada
  (`VirtualList` `keepMounted`), para o `Tab` chegar a ela.
- Anúncios para leitor de tela: o player anuncia o que um atalho fez (o mesmo texto do flash, numa região `status`);
  a barra de leitura de vídeos anuncia só o início (o fim e as falhas chegam pelos toasts), nunca cada arquivo. O
  card de vídeo tem como nome o título (e ", watched") e como descrição o resto do que mostra: progresso, duração,
  linha de detalhe e "Not processed". O botão "Watched" do player é um toggle de texto fixo (`aria-pressed`; o
  tooltip diz a ação). As prévias de pasta da home são cabeçalhos, como as outras seções.
- Player (`features/player`): volume, mudo, velocidade, legendas, modo teatro e largura da playlist são preferências
  entre sessões (`get_player_preferences`/`update_player_preferences`), carregadas uma vez por sessão na store e
  salvas 400 ms após a última mudança e ao fechar o player; valem para todo vídeo. Progresso salvo no máximo a cada
  5 s e ao pausar, fechar e terminar; cada gravação invalida a lista de pastas da biblioteca e a home (a ordem
  "Recently watched" acompanha o que se assiste).
- Sidebar (`app/layout/Sidebar`): largura e estado recolhido são preferências entre sessões
  (`get_sidebar_preferences`/`update_sidebar_preferences`, `app/layout/useSidebarPreferences`), mantidas no cache
  do TanStack Query e salvas 400 ms após a última mudança (recolher/expandir salva na hora). A sidebar só aparece
  depois que elas carregam, para não abrir expandida e recolher em seguida; se não puderem ser lidas, valem os padrões.
- Painéis laterais redimensionáveis (sidebar e playlist do player) usam `shared/ui/ResizablePanel`; o salvamento com atraso
  usa `shared/lib/debounce`.
- Modos da janela (`shared/window`, `services/window`, `domain/window.rs`): o Rust é dono do estado (`WindowMode`:
  `pinned`, `mini`, `onTopSupported`), devolvido pelos comandos e enviado pelo evento `windowModeChanged`; o frontend
  o mantém na query `["window-mode"]` e só exibe. Nada é guardado: o tamanho e a posição da janela nunca foram
  persistidos, e o app sempre abre normal e sem pin, mesmo se fechado (ou se travou) no mini player. O `RootLayout`
  segue o evento, anuncia as mudanças numa região `status` (`WindowAnnouncer`: "Window pinned on top", "Window
  unpinned", "Mini player on/off") e encerra o mini player sempre que a rota não é `/watch`
  (`MiniPlayerOnlyInThePlayer`: fechar o player, voltar pelo botão, tecla ou mouse, ou um reload).

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
- Ordenação natural (`Ep 2` antes de `Ep 10`), definida no backend e usada em tudo. Caminhos são comparados pasta a
  pasta, como numa árvore: cada pasta vem logo seguida das suas subpastas (`Course`, `Course\Module 1`, `Course 2`) nos
  grupos do modo contínuo, nas prévias de pasta da home, na ordem de leitura e na busca por arquivo.
- Sidebar redimensionável e recolhível:
  - a borda direita pode ser arrastada, ou focada e movida com `←`/`→` (16 px por tecla), entre 200 e 400 px, nunca
    mais de ⅓ da janela; uma janela estreita só a encolhe, sem mudar a largura salva; duplo clique volta a 240 px;
  - o botão no topo (`aria-expanded`, tooltip "Collapse sidebar"/"Expand sidebar") a recolhe para um rail de ícones
    (56 px): Home, History, "Add folder", o ícone de cada pasta (nome no tooltip, status como selo no canto, menu de
    contexto mantido; os fixados primeiro, separados por uma linha) e Settings. O rail mantém toda a navegação a um
    clique;
  - a transição da largura usa `--duration-base` (zerada com `prefers-reduced-motion`);
  - largura e estado ficam salvos entre sessões; na primeira abertura ela começa expandida, com 240 px;
  - com a janela abaixo de 1000 px (`app/layout/useSidebarDrawer`) ela é sempre o rail, sem mudar o estado salvo, e
    "Expand sidebar" a abre por cima da tela, como gaveta (sombra e `bg-overlay` sobre a tela, que fica `inert`).
    Fecham a gaveta `Esc` (o foco volta ao botão), o clique fora, ir para outra tela e alargar a janela, que volta ao
    estado salvo. A borda continua redimensionável, e a largura escolhida é salva; por cima da tela, a gaveta não
    fica presa a ⅓ da janela (só deixa 64 px da tela à vista).
- A janela abre com 1280×800 (cabe "Also in progress" ao lado do vídeo em destaque da home com a sidebar padrão) e
  a mínima é 640×480 (metade de uma tela de 1366 px). A margem lateral das telas é o token `--spacing-page`
  (`px-page`): 16 px na janela estreita até 40 px em telas largas.
- Nomes longos de pastas e de grupos na sidebar expandida quebram em até duas linhas e terminam com reticências. Só
  quando o nome está cortado (medido de novo ao redimensionar) um tooltip mostra o nome completo (da pasta, também o
  caminho), ao passar o mouse ou focar pelo teclado; sem corte, o caminho da pasta continua no `title`.
- O item atual da sidebar (`sidebarItemClasses`) é uma pílula elevada com a barra `accent` à esquerda; em Home,
  History e Settings o ícone fica na cor `accent` (pastas mantêm a cor escolhida). No alto contraste do Windows, onde
  fundos somem, ele ganha uma borda. Sidebar e barra superior se separam do conteúdo pelo degrau das
  camadas, sem linha; a busca fica centralizada na barra superior, com até 704 px de largura.
- Nome da pasta da biblioteca só no app (`domain/folder_name.rs`, `rename_library_folder`); a pasta no disco nunca é
  renomeada. `LibraryFolder.name` é o nome exibido (o personalizado ou o da pasta), com `folderName` (do disco) e
  `customName`; o backend já devolve o nome exibido também em `HiddenFolder.name` e `SubfolderEntry.name` quando o
  caminho é uma pasta da biblioteca, e o frontend usa `shared/lib/folderName` (`useFolderName`) onde só tem o caminho
  (título e "not connected" da tela da pasta, busca, playlist/player, histórico, processamento, "Locate folder…"):
  - "Rename" no menu de contexto ou `F2` com a pasta focada: na sidebar expandida, edição no lugar (texto todo
    selecionado, nome da pasta como placeholder); no rail, um `Popover` ao lado do ícone com "Folder on disk: …".
    `Enter` salva, `Esc` cancela (sem propagar), clicar fora salva; `Enter`/`Esc` devolvem o foco à pasta;
  - trim, caracteres de controle viram espaço, até 100 caracteres (`MAX_FOLDER_NAME_CHARS`); vazio ou igual ao nome
    da pasta volta ao nome da pasta; nomes repetidos são permitidos. Valor igual ao atual não chama o backend;
  - otimista, com rollback e toast; invalida `["library"]` (home, escondidas, ordem por nome);
  - "Reset to folder name" no menu só com nome personalizado. Com ele, o tooltip da pasta (sempre visível nesse
    caso, também no rail) mostra "Folder: …" e a tela da pasta mostra "Folder on disk: …";
  - a ordem por nome ("Name") usa o nome exibido; o nome fica na linha (por `id`): sobrevive à realocação e à pasta
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
    "Name" (ordem natural), "Date added" e "Recently watched". Como na tela da pasta, escolher "Name" ou "Date added"
    ordena de forma crescente (A–Z; a mais antiga primeiro), escolhê-lo de novo inverte, e uma seta mostra a direção
    (`shared/ui` `DropdownMenuSortItem`, com a direção no nome acessível: "Name, A to Z"); o menu fica aberto para
    inverter na hora. "Custom order" e "Recently watched" não têm direção e fecham o menu. O ícone e o nome do botão
    mostram o modo atual ("Sort folders: Date added, newest first"), salvo em `library_folder_sort` com os mesmos
    valores de antes (`features/library/lib/folderSort.ts` liga cada valor à opção e à direção). Escolhas rápidas são
    gravadas em ordem, e a seta já mostra a que está sendo gravada;
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
    desconectada continua no lugar e pode ser movida;
  - fixar ("Pin"/"Unpin" no menu de contexto da pasta, na sidebar e no rail, e do cabeçalho do grupo; sem atalho
    próprio, sem limite): o item vai para o topo da **sua** lista (a pasta de um grupo, para o topo do grupo, sem
    sair dele; o grupo, para o topo da lista principal). Os fixados seguem entre si o modo ativo (em "Custom order",
    uma ordem manual própria) e os outros, abaixo, a mesma regra à parte (`folder_order::sort_entries`). Fixar põe
    no fim dos fixados; desfixar volta à posição natural do modo (em Custom, à vaga guardada: `sort_order` não muda
    enquanto fixado, nem ao arrastar os outros). O pin é do item: mudar de grupo ou "Remove from group" mantém
    fixada (no fim dos fixados da lista nova, e a vaga de retorno passa a ser o fim dela); excluir um grupo põe as
    pastas fixadas dele no fim dos fixados da lista (num grupo fixado, onde ele estava) e as outras no lugar do grupo
    (num grupo fixado, logo abaixo da linha). Pastas escondidas e desconectadas podem ser fixadas. Um grupo recolhido
    não mostra suas fixadas; para vê-las, fixe o grupo;
  - arrastar e "Move up/down" não cruzam a fronteira: soltar ao lado do outro bloco deixa o item na borda do seu
    (`lib/folderLayout` `pinnedFirst`; a vaga não abre e o anúncio diz "Pinned items stay above the others."), e
    "Move up/down" na borda ficam desabilitados com o motivo num tooltip (`ContextMenuItem` `disabledReason`). Só
    "Pin"/"Unpin" trocam de lado;
  - na sidebar expandida, um `Pin` discreto no item e no cabeçalho, e uma linha (`PinnedDivider`) entre os fixados e
    o resto, na lista e dentro de grupos; no rail, os ícones fixados vêm primeiro e uma linha os separa (quando o
    bloco termina num grupo, a linha de fim dele basta), e o tooltip diz "Pinned". O nome acessível diz ", pinned";
    depois de fixar ou desfixar (não otimista: o backend sabe a vaga de retorno), o foco segue o item até o lugar
    novo e uma região `status` anuncia "Anime pinned to the top." (de um grupo: "... to the top of Series.") ou
    "Anime unpinned.". Sem toast de sucesso (a mudança é visível); a falha dá toast.
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
    (`F2`, vazio mantém o nome), "Pin"/"Unpin", "Move up"/"Move down", "Delete group" (com confirmação só se tiver
    pastas, que ficam sem grupo no lugar onde o grupo estava, as fixadas continuando fixadas; toast);
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
    somem (o resto fica no lugar, sob o ponteiro), e ele nunca cai dentro de outro grupo: sobre as pastas de um grupo
    expandido fica onde está e só passa dele pela borda oposta (o cabeçalho subindo, o fim descendo), senão a vaga
    pularia para o outro lado, o ponteiro voltaria a ficar sobre o grupo e o arraste oscilaria. Os anúncios dizem
    quando a pasta entra ou sai de um grupo;
  - rail: cada grupo começa com uma linha discreta (`RailGroupSeparator`, tooltip "Series · 3 folders") e termina
    com outra quando vem algo depois, mostra as pastas mesmo recolhido (navegação a um clique), some quando vazio
    (sem perder o lugar na lista); o tooltip da pasta diz "Group: …";
  - pastas desconectadas, escondidas, renomeadas ou realocadas continuam no grupo; pastas novas entram sem grupo.
- Estatísticas por pasta: total, assistidos e duração somada (vídeos sumidos não contam).
- Cabeçalho da pasta (`FolderHeader`): título, chips com a contagem de vídeos, a duração total
  (`shared/lib/formatTotalDuration`: "10 h 42 min") e o progresso ("9 of 77 watched", com mini barra), o botão dos
  outros arquivos e, abaixo, "Folder on disk" e o aviso de pasta escondida. As ações ficam sempre à direita, mesmo
  quebrando linha. "Continue" (ou "Play", se nada da pasta foi visto; nome acessível "Continue: <título>") toca o
  vídeo em andamento assistido por último na árvore da pasta ou, sem nenhum, o primeiro não iniciado na ordem de
  leitura (`videos::next_in_folder`, no `get_folder_summary`); com tudo assistido, o botão não aparece.
- Card de subpasta: capa com a thumbnail do primeiro vídeo da árvore, na ordem de leitura, que tenha uma
  (`videos::cover_thumbnail`; fixa, não muda com o progresso), sobre duas folhas empilhadas que aparecem no topo (o
  que separa uma pasta de um vídeo à primeira vista), ícone de pasta e "N videos" numa aba no canto inferior esquerdo,
  na cor da folha da frente (o canto direito é da duração nos vídeos), barra de progresso (por cima da aba, sempre
  inteira) só depois de
  iniciada (verde e esmaecida quando tudo foi assistido), nome e a linha "26 min", "26 min, 1 of 2 watched" ou
  "26 min, all watched" com ✓; "No videos read yet" sem vídeos lidos. Mesmo hover do card de vídeo.
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
- No topo, uma saudação pela hora local ("Good morning" das 5 às 12 h, "Good afternoon" até as 18 h, "Good evening"
  no resto); o `h1` "Home" fica só para leitores de tela (é ele que recebe o foco ao trocar de tela).
- "Continue watching" (`ContinueWatching`): o primeiro vídeo em destaque (thumbnail grande, pasta, título, barra e
  tempo restante, `shared/lib/formatRemaining`: "8 min left", minutos arredondados para cima) é um botão só, com
  "Resume" desenhado dentro, que toca como qualquer card; ao lado, "Also in progress" com até três dos seguintes em
  cards horizontais com o tempo restante. Todos mantêm o menu de contexto do vídeo.
- Os cards de sugestões e de assistidos recentemente mostram a pasta do vídeo abaixo do título (o nome na biblioteca,
  `folderName`); nas prévias de pasta não, pois o cabeçalho já diz.

### Card de vídeo (`shared/video/VideoCard`)
- Hover: a thumbnail sobe 2 px e ganha sombra, a imagem cresce 3% dentro da moldura e a barra de progresso engrossa
  (durações dos tokens, zeradas com `prefers-reduced-motion`). `orientation="horizontal"` põe a thumbnail ao lado do
  texto, para listas compactas.
- Assistido: imagem esmaecida, barra cheia na cor `success` (com "Watched" para leitor de tela, que nomeia as listas
  da playlist e do histórico) e um ✓ na linha abaixo do título, com o detalhe ou "Watched".
- Prévia de pasta (`db/videos.rs` `folder_preview`; as pastas na ordem da sidebar, sem as vazias): vídeos não
  iniciados, depois em andamento, depois assistidos, cada grupo na ordem do modo contínuo (`ReadingKey`: os
  vídeos da pasta, depois cada subpasta seguida das suas), cortados no número de cards. Sem sumidos nem pastas
  escondidas; uma pasta desconectada continua com a prévia.

## Player embutido
- Controles com auto-hide, tela cheia, modo teatro (vídeo na largura da janela, detalhes e playlist abaixo), volume,
  velocidade (0.25×–2×), botões ±10s, feedback visual dos atalhos. Volume, mudo, velocidade, legendas e modo teatro
  ficam salvos entre sessões e valem para todo vídeo. O auto-hide esconde os controles após 3 s sem atividade
  durante a reprodução; foco de teclado dentro do player (`Tab`) os mostra e os mantém visíveis até sair dele. Com o
  vídeo abaixo de 768 px de largura, os botões da direita (áudio, legendas, velocidade, frame, pin, mini, teatro, tela
  cheia) ficam numa segunda linha, alinhados à direita (container query no palco); nada é escondido.
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
- Playlist (`PlaylistPanel`, landmark "Playlist") e diálogo "Up next" com contagem regressiva de 5s ao terminar, na
  mesma ordem; o diálogo e o cartão do mini player mostram a thumbnail do próximo vídeo (com a duração) ao lado do
  título, que continua sendo a descrição acessível (a imagem é decorativa). O painel mostra a playlist inteira: o nome da pasta e "5 of 12" no topo, os anteriores (assistidos com
  ✓), o atual marcado ("Now playing", barra `accent`, `aria-current`, borda no alto contraste; não é botão) e os
  próximos; ao lado do vídeo ele abre rolado até o atual, e no modo teatro (abaixo do vídeo) não rola, para o vídeo
  continuar à vista. A coluna acompanha a janela (~¼ da largura, 256–448 px) até o usuário arrastar a borda ou usar
  `←`/`→` nela (240–800 px, no máximo metade da janela); duplo clique volta ao automático. A largura fica nas
  preferências do player. Com a janela abaixo de 900 px, a playlist vai para baixo dos detalhes, na largura toda e sem
  borda para arrastar (também no modo teatro); a largura salva volta quando a janela alarga.
- Barra do player: a pasta do vídeo (link para ela), sem repetir o título, que fica só abaixo do vídeo, com "Video 5 of
  12, 12:56", as ações ("Watched", "Details and tags", "Open externally" e "Show in file manager") e um bloco com a
  descrição e as tags do vídeo (`VideoTagList` da feature de tags, passada pela rota `app/routes/WatchRoute`), que
  some quando não há nenhuma das duas.
- Controles: a barra de progresso engrossa no hover e mostra acima dela o tempo sob o ponteiro (só para o mouse; o
  teclado ouve o tempo pelo valor do slider); à direita, legendas, áudio e velocidade, um separador e depois frame
  como thumbnail, fixar, mini player, teatro e tela cheia.
- Retomada do ponto onde parou.
- Atalhos padrão (configuráveis, ver "Atalhos de teclado"): `Espaço`/`K` play/pause · `J`/`L` ±10s · `←`/`→` ±5s ·
  `↑`/`↓` volume ±5% · `[`/`]` velocidade ±0.25× · `Backspace` volta para 1× · `F` tela cheia · `T` modo teatro ·
  `M` mudo · `C` legendas · `I` mini player. `Esc` (fixo) sai um nível por vez: um diálogo, menu ou o cartão "Up
  next" ficam com ele; senão sai da tela cheia, depois do mini player, e só então fecha o player.
- Mini player (botão `PictureInPicture2` nos controles ou `I`; não é o PiP do navegador nem uma segunda janela): a
  própria janela encolhe para o vídeo, sempre no topo, no canto inferior direito da área de trabalho do monitor onde
  ela está, com a barra de título nativa.
  - Tamanho (`domain/window.rs`, funções puras em pixels físicos): o vídeo começa com 25% da largura da área de
    trabalho (320–560 lógicos, escalados pelo DPI do monitor), na proporção do vídeo, com no máximo metade da altura
    da área e margem de 16; tudo cabe na área, mesmo em monitores minúsculos. Mínimo 256×144 enquanto dura (o mínimo
    normal, 640×480 do `tauri.conf.json`, volta depois). A largura que o usuário der arrastando a borda vale até o
    fim da sessão (em pixels lógicos, então passa de um monitor a outro com outro DPI). O próximo vídeo com outra
    proporção mantém a largura e muda a altura, presa ao canto da área mais próximo.
  - Só o vídeo e os controles essenciais (`MiniPlayerControls`: barra de progresso, play/pause, tempo, "Expand" e
    "Close player"), que aparecem ao passar o mouse e ficam visíveis com foco de teclado; sem cabeçalho, detalhes nem
    playlist, mas a lista continua decidindo o próximo vídeo: ao terminar, um cartão compacto
    (`NextVideoDialog` `compact`, um `dialog` não modal) faz a mesma contagem de 5 s, com "Play now" focado e `Esc`
    cancelando. Legendas no estilo do usuário, escalando com o vídeo. Todos os atalhos do player continuam; `F` sai
    do mini e entra em tela cheia; `T` muda o modo teatro (que reaparece ao sair) e diz o novo estado no flash.
  - Sai por "Expand", `I`, `Esc`, maximizando a janela (duplo clique na barra ou `Win+↑` contam como "Expand") ou
    saindo do player de qualquer jeito (o botão voltar do mouse sai do mini e fecha o player de uma vez). Ao sair, a
    janela volta exatamente como estava: tamanho, posição, maximizada e pin; se o monitor dela sumiu, ela volta
    centralizada no primário. Minimizada no mini, ela é restaurada ao sair.
  - Entrar em tela cheia sai dela antes (a janela volta janela, não tela cheia, ao sair do mini); o modo teatro não
    muda (é só escondido) e volta junto. Ao trocar os controles, o foco vai para o palco do vídeo (nunca um botão,
    cujo tooltip ficaria com o próximo `Esc`), e o `Tab` segue para os controles.
  - Redimensionamentos feitos pelo próprio app não contam como do usuário: o tratamento do evento da janela só usa
    `try_lock` (o comando que segura o estado está esperando a thread principal) e confere o tamanho pedido.
  - Sem suporte a manter janelas no topo (Linux sob Wayland), o botão fica desabilitado com o motivo no tooltip e `I`
    só explica no flash.
  - Picture-in-Picture nativo (spike no WebView2, Windows, 2.7.0): `requestPictureInPicture()` num clique abre a
    janela flutuante do navegador. Não é usado: ela mostra só o `<video>`, sem as legendas desenhadas pelo app
    (`SubtitleLine`), o estilo delas, o "Up next", a contagem e os controles e atalhos do player. Uma janela
    flutuante separada, com player próprio, seria uma evolução possível e não faz parte desta feature.
- Pin window (botão `Pin`/`PinOff` nos controles do player, ao lado do mini player, `aria-pressed`, tooltip com a
  tecla; atalho configurável, sem tecla padrão, em qualquer tela fora de campos de texto e overlays): a janela inteira
  fica acima das outras, em qualquer tamanho e tela, até desfixar ou fechar o app (não é lembrado). Complementa o
  mini player: o player completo (ou qualquer tela) no topo, do tamanho que o usuário quiser. Sem botão na barra
  superior, onde quase não tem uso. Otimista; se o sistema recusar,
  volta e mostra um toast. No mini player o pin fica inerte (a janela já está no topo) e o do usuário volta ao sair.
  Sem suporte, desabilitado com o motivo no tooltip. Limite conhecido: jogos em tela cheia exclusiva ficam acima de
  qualquer janela.
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
  apagadas; cada página lê só as linhas dos dias que ela mostra (pelo índice de `watched_at`). "Tempo assistido" é a soma da duração dos vídeos que viraram assistidos no dia (cada vídeo uma vez).

## Tags
- Tags por vídeo no diálogo de detalhes, onde também se edita título e descrição. Fechar o diálogo (`Esc`, clique
  fora, "Close" ou X) com título ou descrição alterados e não salvos pede confirmação ("Discard changes?").
- Operações em massa por pasta: adicionar tag a todos os vídeos, remover todas as tags.
- Gerenciamento em Settings: criar, listar com uso, excluir tag, remover de todos os vídeos, excluir todas, excluir
  não usadas.
- Nomes guardados sem espaços nas pontas e em minúsculas (" Anime " e "anime" são a mesma tag); quebras de linha e
  outros caracteres de controle viram espaço; no máximo 100 caracteres (`MAX_TAG_NAME_CHARS`) ao criar ou adicionar.

## Busca
- Na home: no banco, por título, descrição e tags.
- Dentro de uma pasta: nos nomes de arquivo em disco, recursiva, com progresso, incluindo vídeos ainda não processados.
  Mantém a ordem e o filtro da pasta (`sort`, `status`).
- O texto roda 300 ms depois da última tecla, na tela onde foi digitado: sair dela antes disso descarta a busca.

## Atalhos de teclado
- Configuráveis em Settings → Shortcuts (`/settings?tab=shortcuts`): as ações do player, voltar/avançar do
  histórico e as da janela ("Pin window", sem tecla padrão, e "Mini player", `I`), até 2 teclas cada, sem repetir
  tecla entre ações. Ações novas entram no fim de `KeyboardShortcuts::actions()`: um valor salvo sem elas recebe o
  padrão, e uma tecla que o usuário já deu a outra ação fica com ela (a ação nova fica sem tecla). Gravação pela própria tecla (`Esc` cancela); conflito
  oferece "Use here instead"; reset por ação e "Restore all defaults" (com confirmação). Salvo na hora, com rollback.
- Fixos: `Esc`, `?` (ajuda), `F2` (renomear a pasta da biblioteca focada, à frente de um atalho na mesma tecla), os
  botões laterais do mouse e o zoom. Reservadas (não atribuíveis): `Esc`, `?`, `Tab`, `Shift+Tab`, `Enter` e as do zoom
  (`Ctrl+=`, `Ctrl+Plus`, `Ctrl+-`, `Ctrl+0`; um atalho salvo com elas é descartado na leitura).
- Zoom da interface (`domain/zoom.rs`, `shared/window/zoom.ts`), em qualquer tela, também em campos de texto, como no
  navegador: `Ctrl +` (ou `Ctrl Shift =` e o `+` do teclado numérico), `Ctrl -`, `Ctrl 0` e `Ctrl` com a roda do
  mouse (um passo por vez). Níveis 67–300% (`ZOOM_LEVELS`). O Rust grava o nível (`interface_zoom`) e o aplica ao
  webview (`change_zoom`), e o restaura ao abrir o app. O zoom nativo do WebView2 continua desligado, então só esse
  caminho muda o nível. Um toast "Zoom 125%" (com "Reset" fora de 100%) substitui o anterior a cada mudança.
- `?` em qualquer tela (fora de campos de texto) ou o botão de teclado na barra superior e no player abre a ajuda com
  as teclas atuais; dela, "Customize in Settings" leva à aba.
- Formato: modificadores na ordem `Ctrl+Alt+Shift+Meta` e a tecla do `KeyboardEvent.key` (segue o layout; letras em
  maiúscula, exceto as que crescem ao virar maiúscula, como `ß`; `Space`, `Plus`; `Shift` só com teclas nomeadas, e
  não com `Plus`). Padrões, teclas nomeadas (inclusive `Escape`, `Tab` e `Enter`, que valem com modificadores),
  teclas reservadas e validação em `domain/shortcuts.rs`, expostos pelos bindings; `shared/lib/keyboard.ts` converte eventos e formata para exibição.
  Valores salvos inválidos são reparados ação por ação. Os tooltips mostram a tecla configurada.

## Settings e manutenção
- Coluna centralizada de até 1024 px, com as abas na horizontal.
- Estatísticas da biblioteca numa frase ("1,296 videos in 8 folders · 440 h 16 min in total · 1 watched (0%) ·
  0 tags"; duração e assistidos só com vídeos), pastas da biblioteca, sincronizar tudo, exportar/importar em JSON
  (com confirmação).
- Na lista de pastas, o grupo aparece num chip ao lado do nome ("Group: …" para leitor de tela) e só os desvios do
  status aparecem: verificada a cada 10 min (e por quê) ou desconectada (nome esmaecido). "Watching for changes" fica
  só para leitor de tela, e com "Watch folders for changes" desligado uma nota única no cabeçalho do painel avisa.
  "Sync" e "Remove" aparecem com o mouse sobre a linha ou o foco nela (continuam alcançáveis por `Tab`).
- "Watch folders for changes" (ligado por padrão).
- Limiar de "assistido".
- Pastas escondidas da home e do histórico (lista, abrir e mostrar de novo).
- Informações do banco, vídeos sumidos e órfãos (lista e limpeza com confirmação; sumidos de pastas escondidas só
  contados), versão do app.

### Atualizações (Settings → Maintenance → Updates)
- Só avisa: nada é baixado nem instalado. A versão em execução é comparada com a última release publicada no GitHub
  (`/releases/latest`: nunca draft nem pre-release). Avisa só se a tag (`X.Y.Z`, com ou sem `v`) for estritamente
  maior; tags pre-release ou inválidas são ignoradas, e um build pre-release é avisado da estável correspondente.
- "Check for updates automatically" (ligado por padrão): cerca de 10 s depois de abrir, no máximo uma vez a cada
  24 h (contadas da última verificação que teve resposta), sem bloquear o início. Sem rede ou com erro, nada aparece
  (só o log) e a próxima abertura tenta de novo. Desligado, nenhuma requisição é feita.
- Versão nova encontrada: toast "Mnemo X.Y.Z is available" com "View release" (abre a página da release no navegador),
  uma vez por versão, também depois de reiniciar. Quem já viu a versão em Settings não recebe o toast.
- "Check now" (com carregamento) mostra numa região `status` (polite): "Checking for updates…", "You're up to date
  (X.Y.Z)", "Version X.Y.Z is available" ou o erro, com "Retry". Abaixo, "Last checked: …" (data e hora locais) ou
  "Not checked yet"; "View release" aparece enquanto houver versão mais nova que a em execução. Uma verificação que
  não encontra versão mais nova esquece a encontrada antes (release removida), que volta a ser avisada se reaparecer. As notas da release
  não são mostradas no app.
- Para testar sem publicar: em build de debug, `MNEMO_FAKE_LATEST_RELEASE=2.99.0` (ou `fail`) substitui o GitHub.
