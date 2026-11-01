# Cadastro da secagem — modelagem

Persistência inicial de erva, secador, capacidade e rendimento. Não há endpoints neste passo. O motor em `backend/app/planner/` não foi alterado e continua sem SQLAlchemy.

## Objetivo

Guardar os parâmetros que `EntradaPlanejamento` já sabe ler, com ausência explícita (`NULL`). A simulação, a demanda, a previsão e o plano ficam para as próximas entregas.

## Entidades

```mermaid
erDiagram
    ERVA ||--o{ CAPACIDADE : "opera em"
    SECADOR ||--o{ CAPACIDADE : "recebe"
    ERVA ||--o| RENDIMENTO : "converte"

    ERVA {
        int id PK
        string codigo UK
        string nome
        bool ativo
        numeric regime_horas_dia "h/dia, nulo se ausente"
        int espera_maxima_dias "nulo se ausente"
    }
    SECADOR {
        int id PK
        string codigo UK
        string nome
        bool ativo
    }
    CAPACIDADE {
        int id PK
        int erva_id FK
        int secador_id FK
        string modo "continuo ou por_carga, nulo se ausente"
        numeric kg_fresco_por_hora "kg fresco/h"
        numeric kg_por_carga "kg fresco/carga"
        numeric horas_por_carga "h/carga"
        numeric setup_inicial_h
        numeric setup_final_h
        numeric setup_diario_h
        bool setup_dentro_do_regime "nulo se ausente"
        int prioridade "menor = preferido, nulo se ausente"
    }
    RENDIMENTO {
        int id PK
        int erva_id FK UK
        numeric fresco_por_desidratado "kg fresco / kg desidratado"
        numeric desidratado_por_moido "kg desidratado / kg moido"
    }
```

`criado_em` e `atualizado_em` existem nas quatro tabelas. No MySQL, a migration define `atualizado_em` com `ON UPDATE CURRENT_TIMESTAMP`, no mesmo padrão de `usuario`.

### Erva (`erva`)

| Campo | Tipo | Obrigatório | Unidade / regra |
| --- | --- | --- | --- |
| `id` | inteiro | sim | chave |
| `codigo` | texto até 50 | sim | único; o schema grava em maiúsculas |
| `nome` | texto até 150 | sim | descrição cadastral |
| `ativo` | booleano | sim | padrão verdadeiro; não existe no motor |
| `regime_horas_dia` | numérico (6, 2) | não | horas por dia, maior que 0 e até 24 |
| `espera_maxima_dias` | inteiro | não | dias; 0 é valor informado |

### Secador (`secador`)

| Campo | Tipo | Obrigatório | Unidade / regra |
| --- | --- | --- | --- |
| `id` | inteiro | sim | chave |
| `codigo` | texto até 50 | sim | único. Contrato do motor: `SCB01`, `SCB02`, `SCB03` |
| `nome` | texto até 150 | sim | descrição do equipamento |
| `ativo` | booleano | sim | situação cadastral, não calendário |

Bloqueio de manutenção continua fora desta entrega. No motor ele é `BloqueioSecador`.

### Capacidade (`capacidade`)

Uma linha por par erva × secador (`uk_capacidade_erva_secador`). A linha indica que o par faz parte do cadastro. Parâmetro nulo não vira zero.

| Campo | Unidade | Quando o motor usa |
| --- | --- | --- |
| `modo` | `continuo` ou `por_carga` | ausente gera `PARAM_AUSENTE` |
| `kg_fresco_por_hora` | kg de fresco por hora | modo contínuo |
| `kg_por_carga` | kg de fresco por carga inteira | modo por carga |
| `horas_por_carga` | horas por carga inteira | modo por carga |
| `setup_inicial_h` | horas no primeiro dia da campanha | sempre, quando o modo existe |
| `setup_final_h` | horas de limpeza ao encerrar | sempre, quando o modo existe |
| `setup_diario_h` | horas em todo dia da campanha | sempre, quando o modo existe |
| `setup_dentro_do_regime` | booleano | `false` é informado; `null` é ausência |
| `prioridade` | inteiro, menor = preferido | opcional; `null` não é pendência |

Não há coluna de kg por dia nem de kg por semana. Esses totais são resultado da simulação.

### Rendimento (`rendimento`)

Uma linha por erva.

| Campo | Significado |
| --- | --- |
| `fresco_por_desidratado` | kg de fresco necessários para 1 kg desidratado |
| `desidratado_por_moido` | kg desidratado necessários para 1 kg moído |

As duas razões são independentes e opcionais. Não há vigência: o motor guarda um rendimento por erva. Histórico de razão fica para quando a empresa definir qual valor oficial vale e a partir de quando.

## Relacionamentos e integridade

- `capacidade.erva_id` e `capacidade.secador_id` referenciam as chaves primárias, com `ON DELETE RESTRICT`.
- `rendimento.erva_id` é único e também restringe a exclusão da erva.
- Código de erva e código de secador são únicos. A collation MySQL `utf8mb4_unicode_ci` não distingue maiúsculas.
- Razões e vazões, quando preenchidas, precisam ser maiores que zero. Setup pode ser zero. Regime zero é recusado, porque o motor trata 0 como parâmetro ausente.
- Índices: unicidade de `capacidade (erva_id, secador_id)` e índice em `capacidade.secador_id`.

## O que a planilha mostra

Fonte analisada localmente: acompanhamento de produção de ervas de 2026. O arquivo não foi versionado. Os números abaixo são fatores e rótulos vistos nas fórmulas. Não são parâmetros aprovados e não foram gravados em seed.

| Aba | Papel aparente | O que entra nesta modelagem |
| --- | --- | --- |
| Agro-Proc - Agrião | Planejado e realizado semanal de agrião, com fórmulas de desidratado e moído | Só a evidência de que existem duas razões distintas. Volumes e semanas são demanda/previsão futuras |
| Simulação - Lavagem-Secagem | Matriz de capacidade por erva, equipamento e quantidade de dias de operação (2 a 6), mais um quadro semanal de desidratação | A matriz é cenário semanal, não cadastro. `SCB01eSCB02` soma dois secadores. Lavadora, centrífuga e fatiadora não são secadores |
| Capacidade Lillian | Cenários de 4, 5 e 6 dias/semana, capacidade semanal por equipamento e razões até o produto acabado | Confirma secadores separados e as duas razões. O total semanal não vira coluna |
| Previsão de Volumes Agrião 2026 | Série semanal de fresco, desidratado, moído, venda e saldo | Fora deste PR (previsão e demanda) |
| AGRIÃO PROCOMPET 2026-2027 | Oferta mensal de produtores, área e totais fresco/desidratado | Fora deste PR (lote previsto). Há divisão por uma razão própria |
| Planilha1 | Poucas linhas de demanda 2027 por produto acabado, processo e código de lote | Fora deste PR (demanda). Código de lote não é código de erva |
| Dados BI | Data e volume apontando para a aba de agrião | Consolidado semanal, não cadastro |
| Simulador-programação | Para cada erva e secador: vazão em kg/h, setup inicial, setup final e setup do dia; o volume do período é calculado | É a origem conceitual dos campos de `capacidade` e de `regime_horas_dia` |
| Especificações | Ficha de produto acabado (umidade, microbiologia, certificações) | Não é rendimento de processo |
| Rascunho | Marca de compatibilidade entre secador de bandeja e erva | Compatibilidade, neste modelo, é a existência da linha em `capacidade` |

A aba de simulação repete cabeçalhos de capacidade por regime de dias. Há células mescladas em Capacidade Lillian, Planilha1 e na faixa de capacidade da simulação. Várias colunas são fórmula (`SUM`, acumulado, divisão pela razão) ou total. A mesma grandeza aparece de novo em Sheet1, Sheet2 e na simulação de ervas.

### Unidades que não podem ser misturadas

- `regime_horas_dia` da erva: horas de operação **por dia**. Na planilha, agrião é calculado sobre 24 h e camomila sobre 12 h.
- Dias por semana (2, 3, 4, 5 ou 6): cenário de calendário. No motor isso se aproxima de `dias_operacao` e do horizonte, que ainda não têm tabela.
- Kg da matriz “6 dias / 5 dias / …”: volume do período, já descontando o tempo parado. Não é vazão.
- `kg_fresco_por_hora`: vazão. No simulador o rótulo é “Vazão (kg/h)”.
- `kg_por_carga` e `horas_por_carga`: ciclo. O simulador de ervas está em vazão contínua; o modo por carga existe no motor e fica disponível, sem valor copiado da planilha.

## Decisões

1. O banco segue `backend/app/planner/types.py`, não cada coluna da planilha.
2. Nenhum valor da planilha foi inserido. Campo desconhecido fica `NULL`.
3. `SCB01`, `SCB02` e `SCB03` são os códigos do motor. Na planilha também aparecem `SB01`, `SB02`, `SB03`, `SC03` e “Secador Bandeja 01/02/03”. Isso é apelido do mesmo equipamento, não um quarto secador. `SCB01eSCB02` é soma e não vira equipamento.
4. Regime fica na erva, como no motor. Não foi copiado para cada linha de capacidade.
5. Prioridade entre secadores fica na capacidade, opcional, como no motor.
6. Não há vigência de rendimento nem tabela de cenário semanal. As duas coisas exigiriam regra que a empresa ainda não fechou.
7. Schemas em `backend/app/schemas.py` normalizam código e nome. Não há router novo.
8. `backend/app/cadastro.py` converte as linhas nos dataclasses do motor. Quem simular deve ignorar `ativo = false`.

## Inconsistências para a empresa

Estas diferenças foram só registradas. O algoritmo não foi ajustado para escolher uma delas.

- Razão fresco → desidratado do agrião aparece como 22, 23 e 23,3 em abas diferentes.
- Razão desidratado → moído aparece como 1,05 e, na camomila da aba de capacidade, 1,02. Outra aba da camomila usa 6 para o fresco e 1,02 para a etapa seguinte.
- O simulador divide agrião desidratado por 22 e, na mesma pasta, a capacidade anual usa 23,3.
- A matriz semanal às vezes junta SCB01 e SCB02; o simulador por equipamento mostra vazões diferentes para cada um.
- Há diferença de kg entre a matriz da aba de lavagem-secagem e a cópia em Sheet2.
- Tempo máximo de espera, modo contínuo versus por carga, e se o setup cabe dentro do regime continuam sem valor oficial. O simulador subtrai os setups das horas do dia, mas isso não foi gravado como `setup_dentro_do_regime = true`.

## Como aplicar e testar

Na raiz, com o Docker do projeto:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend pytest
```

Sem Docker, dentro de `backend/`, com o virtualenv ativo e o MySQL no ar:

```bash
alembic upgrade head
pytest
```

A migration nova é `c4d8f1a6b2e0`. Ela só cria tabelas. Não altera `items`, acesso nem importação.

Os testes de cadastro sobem um SQLite em memória. Eles não substituem a aplicação da migration no MySQL.

## Próxima integração

1. Endpoints de cadastro destas quatro entidades, reutilizando os schemas.
2. Seed das permissões, no padrão já usado por `usuario.gerenciar`.
3. Tabelas de demanda, lote previsto e bloqueio.
4. Serviço que filtre registros ativos, chame `app.cadastro` e então `simular()`.
5. Só depois, com o formato definido pela empresa, importar planilha. Infinity e OEE continuam fora.
