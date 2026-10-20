# Mídia e sincronização com o disco

Detalhes do pipeline e do sync. As regras gerais (ffmpeg, toolkits, loop único, identidade dos arquivos, segurança
dos dados) estão no `CLAUDE.md`.

## Pipeline de mídia

- Pipeline (`services/media/processing`): serviço de longa duração no `AppState`. Cada pasta pedida
  (`process_folders`, que retorna na hora) vira um job; pedir uma pasta já na fila, ou dentro de uma, não cria job, e
  um arquivo reivindicado por um job nunca é lido por outro. Um pool fixo de workers lê no máximo
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
- `reconcile.rs` compara o disco com o banco sob os caminhos pedidos:
  - restaura sumidos que voltaram e marca sumidos os que desapareceram;
  - grava o tamanho dos vídeos antigos;
  - reconhece renomeados e movidos (inclusive entre pastas da biblioteca e com o app fechado) e devolve os arquivos
    novos para o pipeline.
- O pipeline grava tamanho e impressão digital dos vídeos novos. Os vídeos antigos recebem os dois depois da
  comparação inicial, um arquivo por vez e só com o pipeline ocioso.
- Watcher (`watch.rs`):
  - `notify-debouncer-full`, recursivo por raiz, debounce de 2 s;
  - renomeações viram pares (o Linux já os entrega; o Windows manda o nome antigo logo antes do novo; no macOS o
    cache de ids de arquivo do debouncer faz o par, e só lá esse cache existe), e pastas renomeadas levam junto o
    modo de exibição e o estado de escondida;
  - eventos perdidos (`Rescan`) comparam a área inteira.
- Disponibilidade: as raízes são conferidas a cada 10 s. O status de cada pasta (`FolderWatch`: `watching`, `polling`,
  `off`, `unavailable`, com motivo) sai em `get_library_folder_statuses`. Uma pasta que não pode ser monitorada (limite
  do inotify no Linux, alguns compartilhamentos de rede) passa a ser comparada a cada 10 min. Com o setting
  `watch_folders` desligado, só há a comparação ao iniciar e no "Sync".
