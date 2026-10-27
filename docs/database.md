# Banco de dados

Detalhes do banco. As regras gerais (WAL, local do `mnemo.db`, settings tipados, migrações, `FolderBounds`) estão
no `CLAUDE.md`.

- Tabelas: `videos`, `tags`, `video_tags` (N:N, `ON DELETE CASCADE`), `library_folders` (com `custom_icon`, `icon_color`,
  `sort_order`, `custom_name`, `group_id` e `pin_order`), `library_groups` (`name`, `sort_order`, `collapsed`,
  `pin_order`), `watch_history`,
  `app_settings`, `folder_settings`, `hidden_folders`.
- Settings: `watched_threshold`, `watch_folders`, `recent_folder_icons`, `player_preferences` (campos ausentes recebem o padrão; campos inválidos, um a um),
  `keyboard_shortcuts` (ações ausentes recebem o padrão; teclas inválidas são descartadas ação por ação),
  `subtitle_style`, `sidebar_preferences` (largura inválida volta ao padrão sem perder o estado recolhido),
  `library_folder_sort` (modo desconhecido vira `custom`). A leitura toma cada campo salvo que ainda é válido para o tipo (`merge_onto_default`), então um
  campo ilegível volta ao padrão sem perder os outros.
- Settings da verificação de atualizações, locais da máquina (não vão no export, e o import não os toca, como as
  preferências do player e da sidebar e o zoom): `check_for_updates` (bool, padrão `true`), `last_update_check` (ms Unix da
  última verificação com resposta, ou `null`; negativo ou não inteiro vira `null`) e `notified_update_version` (tag
  já avisada, ou `null`; o que não for tag `X.Y.Z`, com ou sem `v`, vira `null`). Também local: `interface_zoom` (um
  dos `ZOOM_LEVELS`, padrão `1`; outro valor vira `1`).
- **Migrações versionadas** (`rusqlite_migration`, em `db/migrations.rs`). A `1` é um baseline compatível com bancos
  das versões 1.x (adiciona colunas que versões antigas criavam depois); a `2` limpa órfãos, normaliza `is_watched`
  gravado como texto, cria índices e as tabelas de settings; a `3` indexa `watch_history.watched_at`; a `4` adiciona
  a `videos` `file_size`, `fingerprint` e `missing_since` (vazios em bancos antigos); a `5` adiciona
  `library_folders.icon_color` (nome do token da cor, `NULL` é a cor padrão; nome desconhecido é lido como padrão); a `6` adiciona
  `library_folders.sort_order` (ordem custom, preenchida pela ordem de adição, a mesma de antes); a `7` cria
  `hidden_folders` (`path`, `lower_bound`, `upper_bound` de `FolderBounds`, índice em `lower_bound`; vazia em bancos
  antigos); a `8` adiciona `library_folders.custom_name` (nome dado no app, `NULL` usa o nome da pasta). A `9`
  cria `library_groups` e adiciona `library_folders.group_id` (`ON DELETE SET NULL`, índice; vazio em bancos antigos).
  A `10` renumera `sort_order` para a lista única (pastas sem grupo e grupos numa sequência, as pastas de cada grupo
  em outra), mantendo a ordem exibida antes: as pastas sem grupo, depois os grupos; bancos sem grupos não mudam.
  A `11` adiciona `pin_order` a `library_folders` e `library_groups` (`NULL`: não fixado; vazio em bancos antigos,
  sem tocar no `sort_order`). Ele numera os fixados de cada lista como o `sort_order` (pastas sem grupo e grupos
  juntos, as pastas de cada grupo à parte); o `sort_order` de um fixado é a vaga para onde ele volta ao ser
  desfixado, e só muda quando ele troca de lista (`db/layout.rs`: `read` lista os fixados primeiro; `write` numera os
  fixados na ordem pedida e dá aos outros as vagas que não são de fixados, `folder_order::with_return_slots`).
  `watch_progress_seconds` guarda segundos fracionários.
- Vídeos cujo arquivo sumiu não são apagados: recebem `missing_since` (`db/presence.rs`) e somem da home, da busca, das
  estatísticas e das contagens por pasta (o histórico continua mostrando). Voltam com todos os dados se o arquivo
  reaparecer; os com mais de 30 dias são apagados ao iniciar, só abaixo de pastas acessíveis, e Settings → Maintenance
  lista e limpa os sumidos (os de pastas escondidas só são contados).
- Pastas escondidas (`db/hidden.rs`): qualquer pasta dentro da biblioteca, com tudo abaixo dela. Cada linha guarda a
  faixa de `FolderBounds` da pasta, e o fragmento `hidden::VISIBLE` (`NOT EXISTS` por faixa, casamento por
  componente inteiro) filtra no SQL a home (as quatro seções), a busca da home, o histórico e suas estatísticas,
  `folders::last_watched` (ordem "Recently watched") e a lista de sumidos. Progresso e histórico continuam sendo
  gravados. Entradas aninhadas são mantidas (mostrar a de fora mantém a de dentro). Listagens do disco a partir de
  uma pasta acima (modo contínuo, busca por arquivo, playlist) pulam as escondidas que não contêm o escopo
  (`domain::hidden::HiddenFolders`, via `scanner::walk_videos`); de dentro delas tudo aparece. As entradas acompanham
  realocação e renomeações do watcher (`hidden::move_within`) e somem com a pasta da biblioteca
  (`hidden::delete_within`); uma pasta renomeada sem o watcher ver (app fechado) não é seguida: a entrada fica com
  "Not found" em Settings.
- Export/import JSON com `formatVersion` (atual: 2); o import aceita exports das versões 1.x e é atômico. Tamanho,
  impressão digital e `missing_since` não vão no export (são refeitos a partir do disco). `icon_color` vai no export
  (opcional: exports antigos e cores desconhecidas importam como padrão), sem mudar o `formatVersion`. Também vão
  `sort_order` de cada pasta e `libraryFolderSort` (opcionais): pastas sem posição ficam depois das outras, por data
  de adição, e um arquivo sem modo (ou com modo desconhecido) mantém o modo atual. `hiddenFolders` (opcional) vai
  também: exports antigos importam sem nada escondido, e entradas fora das pastas importadas são descartadas.
  `custom_name` (opcional) vai em cada pasta: exports antigos importam sem nome personalizado, e um nome que o app
  recusaria (em branco, longo demais) importa como nenhum. `libraryGroups` (opcional; `id`, `name`, `sort_order`,
  `collapsed`, `created_at`) e `group_id` em cada pasta: exports antigos importam sem grupos, um grupo com nome que o
  app recusaria é descartado e uma pasta com `group_id` que o arquivo não tem fica sem grupo. O `sort_order` segue a
  lista única (ver `db/layout.rs`), e o import renumera tudo (`layout::compact`), resolvendo posições repetidas pela
  data de adição. `pin_order` (opcional, desde a 2.7) vai em cada pasta e grupo: exports antigos importam sem nada
  fixado, um valor que não é inteiro importa como não fixado, e o import renumera os fixados de cada lista (empates
  pelo `sort_order`); a pasta de um grupo descartado fica sem grupo e continua fixada, entre os fixados da lista.
- O import descarta (com log) o que o app recusaria, em vez de falhar inteiro: em `settings`, cada campo ausente
  (`watchFolders` só existe desde a 2.3) ou inválido importa o padrão; `view_mode` desconhecido; tags com nome em
  branco (os nomes são normalizados como no app, sem o limite de tamanho, e tags que viram o mesmo nome se fundem); vídeos com id ou caminho
  repetido (progresso negativo vira 0); `video_tags` e `watch_history` de vídeo ou tag que o arquivo não tem, ou
  repetidos; entradas de histórico com `watched_at` ilegível (as legíveis são gravadas no formato do app). Pastas da
  biblioteca repetidas ainda fazem o import falhar sem mudar nada. Exports de cada versão 2.x ficam em
  `db/backup/fixtures/` e são importados nos testes.
