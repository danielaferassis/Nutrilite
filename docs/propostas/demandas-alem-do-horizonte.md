# Proposta: demandas com prazo depois do horizonte

**Status:** aguardando decisão do grupo e do PCP (pergunta 2 respondida) · **Autor:** Gabriel · **Data:** 01/11/2026

## Resumo

Hoje a simulação só considera as demandas cujo prazo cai **dentro** do horizonte simulado. A secagem feita no horizonte não é creditada a uma demanda que vence logo depois dele, e o plano mostra essa produção como "sem demanda". A proposta é enviar ao motor também as demandas que vencem depois do horizonte, sem gerar atraso para elas, e mostrar quanto ainda falta cobrir depois do fim.

O contrato do motor (`app/planner/types.py`) não muda.

## O problema, com um exemplo

Os números abaixo são fictícios (`python -m app.cli dados-ficticios`).

Simulação de **01/11 a 07/11**:

| Demanda | Prazo | Fresco necessário | Entra no motor hoje? |
| --- | --- | --- | --- |
| Picão, 200 kg desidratado | 07/11 | 800 kg | sim |
| Camomila, 150 kg moído | **08/11** | 990 kg | **não** (vence 1 dia depois do fim) |
| Salsa, 80 kg moído | 12/11 | 616 kg | não |

O plano seca 3.200 kg de camomila nesses 7 dias e mostra **tudo como "sem demanda"**. Para quem lê o plano, parece que a camomila foi seca à toa, quando na verdade ela cobre a demanda do dia 08/11.

### Por que é assim hoje

`app/simulacao.py` filtra `inicio <= prazo <= fim`. O filtro existe para evitar um **atraso falso**: o motor marca `ATRASO` para toda demanda não coberta ao fim do horizonte. Uma demanda que vence no dia 20, simulada até o dia 7, apareceria como atrasada só porque o plano acabou antes.

## Opções

### A. Manter como está

- **A favor:** simples; nenhuma mudança no motor.
- **Contra:** a produção para demandas próximas aparece como "sem demanda". O PCP precisa simular horizontes maiores para enxergar a cobertura, o que aumenta o risco de perder de vista o curto prazo.

### B. Enviar também as demandas que vencem depois do fim (proposta)

1. A API passa a enviar todas as demandas com `prazo >= inicio`.
2. O motor credita os kg secos a elas normalmente (mesma regra de hoje: maior prioridade, depois prazo mais próximo).
3. `ATRASO` só para demanda com prazo **até o fim** do horizonte.
4. `SALDO_NAO_ALOCADO` também só conta as demandas com prazo até o fim. Uma demanda que vence depois pode ainda receber oferta que chega depois do horizonte.
5. Novo KPI informativo, **sem virar pendência**: `a_cobrir_apos_horizonte_kg` por erva, com o que essas demandas ainda precisam depois do fim.

No exemplo: a demanda de camomila do dia 08/11 recebe 990 kg dos 3.200 kg secos, e os outros 2.210 kg continuam "sem demanda". A salsa (12/11) recebe os 400 kg secos no dia 04/11, e a tela informa "faltam 216 kg de salsa a cobrir depois de 07/11", sem acusar atraso.

- **A favor:** o plano mostra para quem a erva está sendo seca; não gera atraso falso; o PCP vê o que fica para o próximo horizonte.
- **Contra:**
  - Mexe no motor, em três funções do `engine.py`.
  - Depende de a demanda continuar sendo **líquida**, como já está no contrato (`Demanda.kg`, "já descontado o estoque"). Se o PCP não atualizar o kg depois de produzir, o próximo plano conta de novo o que já foi seco. Isso já vale hoje para demandas dentro do horizonte; a opção B só torna o efeito mais visível.

### C. Janela fixa além do fim

Igual à B, mas só para demandas com prazo até `fim + N dias`.

- **A favor:** limita o alcance.
- **Contra:** cria um parâmetro novo (`N`) que ninguém validou. Pela regra do projeto, ele não pode ter valor padrão; teria de virar cadastro.

## Recomendação

**Opção B.** Ela resolve o problema sem parâmetro novo e mantém as pendências honestas. Com prazo dentro do horizonte, o comportamento é o mesmo de hoje.

## O que muda no código (se aprovado)

| Arquivo | Mudança |
| --- | --- |
| `app/simulacao.py` | Filtro de demandas: `prazo >= inicio` (sai o `prazo <= fim`) |
| `app/planner/engine.py` · `_registrar_atrasos` | Só demandas com `prazo <= fim` |
| `app/planner/engine.py` · `_registrar_sem_oferta` | Necessidade só das demandas com `prazo <= fim` |
| `app/planner/engine.py` · `_calcular_kpis` | `saldo_nao_alocado_kg` só com prazo até o fim; novo `a_cobrir_apos_horizonte_kg` |
| `app/planner/README.md` | Atualizar a premissa de horizonte |
| Tela Plano de Secagem | Mostrar o novo KPI |

`types.py` não muda: o motor já recebe `inicio`, `fim` e o prazo de cada demanda.

**Testes novos:**
- demanda depois do fim recebe kg e não gera `ATRASO`;
- o que falta dessa demanda vai para `a_cobrir_apos_horizonte_kg` e não para `saldo_nao_alocado_kg`;
- demanda dentro do horizonte continua igual (regressão);
- a ordem de atendimento continua: prioridade, depois prazo.

## Perguntas para o PCP

1. Ao olhar um plano semanal, o PCP quer ver a produção creditada a demandas da semana seguinte?
2. Existe um limite prático de antecedência? Por exemplo, não faz sentido secar hoje para uma demanda de daqui a 3 meses por causa da validade do produto seco. Se existir, ele é um parâmetro novo a cadastrar (opção C), não um valor no código.
3. O kg da demanda é sempre atualizado com o estoque (líquido) antes de cada simulação?

### Respostas (Eva, novembro/2026)

1. Pediu para explicar "produção creditada". Reenviamos: se uma semana tiver excedente, ele deve aparecer para a semana seguinte, ou cada semana começa do zero? **Aguardando.**
2. **Não há limite prático**: o desidratado tem validade de 1 ano. A opção C perde o motivo; a B continua sendo a recomendação.
3. Pediu para detalhar. A pergunta reenviada falou em retirar de um estoque a cada secagem, o que é outra coisa. O que precisamos saber é se o kg da demanda cadastrada já desconta o que existe em estoque e o que já foi produzido. **Aguardando.**
