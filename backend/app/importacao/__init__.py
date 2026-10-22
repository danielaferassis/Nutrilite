"""Importação de arquivos CSV/Excel.

Fluxo: o endpoint POST /api/importacoes salva o arquivo e cria uma linha
"pendente" na tabela importacao (que é a fila). O worker (app/worker.py) pega
a próxima da fila, chama a função do tipo registrado em tipos.py e grava o
resultado. Quem escreve um parser só precisa ler contexto.py e tipos.py.
"""
