# Mídia e sincronização com o disco

Detalhes do pipeline e do sync. As regras gerais (ffmpeg, toolkits, loop único, identidade dos arquivos, segurança
dos dados) estão no `CLAUDE.md`.

## Pipeline de mídia

- O que é vídeo: a extensão (`domain::media::VIDEO_EXTENSIONS`) e, só para `.ts` (também extensão de TypeScript), o
  início do arquivo: um MPEG-TS tem o byte de sincronia `0x47` no byte 0 e no 188 (`scanner::is_video_file`, usado na
  listagem das pastas e na comparação com o disco). Arquivo vazio ou que não abre (travado em cópia) conta como vídeo,
  para nunca virar sumido por engano. No `ffprobe`, um stream de vídeo marcado `attached_pic` (capa de um áudio) não
  conta; sem outro stream de vídeo, o arquivo é recusado. A thumbnail é gravada com `-update 1`, porque o nome vem do
  vídeo e um `%d` nele seria lido como padrão de sequência.
- Pipeline (`services/media/processing`): serviço de longa duração no `AppState`. Cada pasta pedida
  (`process_folders`, que compara a pasta e retorna sem esperar a leitura) vira um job; pedir uma pasta já na fila, ou
  dentro de uma, não cria job, e um arquivo reivindicado por um job nunca é lido por outro. O comando devolve o id do
  job de cada pasta (o existente, quando ela já está na fila), e o evento do fim do job traz o mesmo id: é assim que
  o "Sync all" espera os seus jobs, e não um mais antigo da mesma pasta que termine no meio. Um pool fixo de workers lê no máximo
  `processing_concurrency` arquivos por vez (metade dos núcleos, de 1 a 4) e um único escritor grava em lote
  (`videos::insert_batch`, transação a cada 25 itens ou 1 s, `ON CONFLICT DO NOTHING`). Prioridades `Normal` e `Low`
  (a baixa é para trabalho futuro como prévias). `cancel_processing` cancela um job ou todos com `CancellationToken`:
  `process::run_until_cancelled` mata o ffmpeg na hora e a thumbnail parcial é apagada. Nada fica pela metade:
  cancelar ou fechar o app só perde o lote não gravado, refeito no próximo pedido. ffmpeg ausente para todos os jobs
  uma vez. O estado vai ao frontend pelos eventos tipados `processingStatusChanged` (no máximo a cada 200 ms) e
  `processingFinished` (um por job), declarados em `commands/events.rs`; `get_processing_status` dá o estado inicial.
- A limpeza de órfãos também apaga thumbnails que nenhum vídeo usa, com mais de 1 h (deixadas por um processamento
  interrompido; as recentes podem ser de um vídeo prestes a ser gravado).

## Sincronização

- Realocação de pasta da biblioteca (`services/relocation.rs`, regras puras em `domain/relocation.rs`): só para
  pastas inacessíveis. `check_folder_relocation` só lê: recusa destino que não é pasta, igual à origem, origem que
  voltou a ficar acessível, ou destino que é, está dentro ou contém outra pasta da biblioteca (as pastas da biblioteca
  dentro da origem vão junto e não contam). Compara cada vídeo guardado pelo caminho relativo e, quando guardado,
  pelo tamanho (só metadados), e classifica (`RelocationMatch`: `empty`, `complete`, `partial` ≥ 50%, `poor`,
  `none`). A aplicação valida de novo e, numa transação, apaga registros fora da biblioteca que ocupariam o caminho
  de um vídeo (com as thumbnails), move vídeos (`presence::move_folder`), modos de exibição, pastas escondidas e
  pastas da biblioteca (`folders::relocate`, mantendo id e ícone). Depois o loop atualiza as raízes (watcher) e compara a pasta nova
  (`read_new`), e o comando libera o asset scope do caminho novo. Thumbnails não dependem do caminho do vídeo.
- Import (`import_library` → `LibrarySync::import`, em `sync/import.rs`): o comando só lê o arquivo
  (`backup::read_file`); o loop o importa entre duas comparações, então nenhuma comparação usa a biblioteca antiga.
  Só se o import der certo: esquece (`Processor::forget_outside`) os jobs das pastas que saíram da biblioteca, aplica o
  `watch_folders` importado, atualiza as raízes e compara todas as pastas acessíveis (`read_new`), como na abertura.
  Depois o comando libera o asset scope das pastas importadas.
- `reconcile.rs` compara o disco com o banco sob os caminhos pedidos:
  - restaura sumidos que voltaram e marca sumidos os que desapareceram;
  - grava o tamanho dos vídeos antigos;
  - reconhece renomeados e movidos (inclusive entre pastas da biblioteca e com o app fechado) e devolve os arquivos
    novos para o pipeline;
  - um caminho que existe mas não pode ser lido (erro diferente de "não encontrado", como um compartilhamento que
    caiu) conta como ilegível, nunca como apagado;
  - um arquivo novo que pode ser um vídeo renomeado ou movido, mas não pode ser lido para a impressão digital, é
    adiado como os que ainda estão em cópia, em vez de virar vídeo novo;
  - os vídeos novos vão ao pipeline arquivo por arquivo (`Processor::enqueue_files`): o job não lista a pasta, então
    um arquivo ainda em cópia ao lado deles espera a sua vez. Se a pasta já tem um job, os arquivos entram nele.
- `process_folders` ("Sync") falha sem enfileirar nada se a comparação falhar: arquivos renomeados ou movidos seriam
  lidos como novos.
- O pipeline grava tamanho e impressão digital dos vídeos novos. Os vídeos antigos recebem os dois depois da
  comparação inicial, um arquivo por vez e só com o pipeline ocioso.
- Watcher (`watch.rs`):
  - `notify-debouncer-full`, recursivo por raiz, debounce de 2 s;
  - renomeações viram pares (o Linux já os entrega; o Windows manda o nome antigo logo antes do novo; no macOS o
    cache de ids de arquivo do debouncer faz o par, e só lá esse cache existe), e pastas renomeadas levam junto o
    modo de exibição, o estado de escondida e as pastas da biblioteca aninhadas nelas (as raízes são atualizadas na
    hora);
  - um registro que ainda ocupe o destino é obsoleto (o arquivo foi sobrescrito, ou a pasta não existia mais) e dá
    lugar ao vídeo renomeado, com a thumbnail apagada; nenhum conflito é ignorado em silêncio;
  - se, ao aplicar a comparação, outro vídeo já foi gravado no caminho novo de um vídeo reconhecido, o reconhecido
    fica sumido em vez de "presente" num caminho que não existe;
  - eventos perdidos (`Rescan`) comparam a área inteira.
- Disponibilidade: as raízes são conferidas a cada 10 s. O status de cada pasta (`FolderWatch`: `watching`, `polling`,
  `off`, `unavailable`, com motivo) sai em `get_library_folder_statuses`. Uma pasta que não pode ser monitorada (limite
  do inotify no Linux, alguns compartilhamentos de rede) passa a ser comparada a cada 10 min. Com o setting
  `watch_folders` desligado, só há a comparação ao iniciar e no "Sync"; ao religá-lo, as pastas são comparadas na hora
  (o que mudou enquanto estava desligado). Uma falha do watcher sem caminho afeta só as pastas monitoradas.
