# Motor de planejamento (`app/planner`)

Cruza a demanda com a oferta prevista e a capacidade dos secadores (SCB01, SCB02, SCB03) e gera uma proposta de plano de secagem.

É **lógica pura em Python**: não importa SQLAlchemy nem FastAPI. A API converte os models do banco nos dataclasses de `types.py`, chama `simular()` e persiste o resultado.

```python
from app.planner import simular

resultado = simular(entrada)   # EntradaPlanejamento -> ResultadoPlano
resultado.necessidades         # kg de erva fresca por demanda
resultado.alocacoes            # erva × secador × dia
resultado.pendencias           # PARAM_AUSENTE, CAPACIDADE_EXCEDIDA, ATRASO...
resultado.viavel               # True se não houver pendências
```

## Arquivos

| Arquivo          | Responsabilidade                                                    | Status |
| ---------------- | ------------------------------------------------------------------- | ------ |
| `types.py`       | Contrato de entrada e saída (alterar só em conjunto)                | pronto |
| `conversion.py`  | Demanda (moído/desidratado) → kg de erva fresca                     | pronto |
| `validation.py`  | Parâmetros ausentes → `PARAM_AUSENTE` (nunca preencher valor padrão) | pronto |
| `capacity.py`    | Horas e kg disponíveis por secador/dia                              | pronto |
| `engine.py`      | Orquestra o fluxo, faz a alocação gulosa dia a dia e calcula KPIs   | pronto |

## Regras

- Massa em kg e tempo em horas. Campo `None` = não informado.
- A oferta agrícola não é reagendável: o motor aloca os lotes nas datas em que chegam.
- Lote não secado até `data_chegada + espera_maxima_dias` gera `CAPACIDADE_EXCEDIDA`.
- KPI com denominador zero vale `None` ("não aplicável"), nunca `0`.

## Premissas e parâmetros pendentes

Regras de capacidade adotadas no motor. Valores e premissas ainda **precisam ser validados pelo PCP**.

### Calendário

- `EntradaPlanejamento.dias_operacao`: dias da semana em que a fábrica opera (`0` = segunda … `6` = domingo). Ausente, vazio ou com valor fora de 0–6 → `PARAM_AUSENTE`.
- Um secador está indisponível em dia fora de `dias_operacao` ou coberto por um bloqueio. Bloqueios incluem as datas de início e fim.

### Modo de capacidade (`Capacidade.modo`)

| Modo | Campos exigidos | Kg no dia |
| ---- | --------------- | --------- |
| `CONTINUO` | `kg_fresco_por_hora` | horas úteis × kg/h |
| `POR_CARGA` | `kg_por_carga`, `horas_por_carga` (ambos > 0) | só cargas inteiras × kg por carga |

Os dois modos exigem `setup_inicial_h`, `setup_final_h`, `setup_diario_h` e `setup_dentro_do_regime`. Modo ausente → `PARAM_AUSENTE` (o motor não assume `CONTINUO`).

### Setups da campanha

- Setup inicial no 1º dia da campanha, setup diário em todo dia e setup final no dia em que a campanha encerra.
- Troca de erva no secador: o 1º dia da nova erva soma a limpeza (`setup_final_h`) da erva anterior. Nesse caso a erva anterior não paga a limpeza no seu último dia.
- Campanha de 1 dia paga inicial, diário e final no mesmo dia.

### Horas úteis

- Setup dentro do turno (`setup_dentro_do_regime=True`): `max(0, regime − setup)`.
- Setup fora do turno (`False`): `max(0, min(regime, 24 − setup))`.
- `None` é sempre ausência; `0` e `False` são valores informados.
- Parâmetro ausente → `ParametroAusenteError` (e `PARAM_AUSENTE` na validação), nunca zero.

Exemplo (camomila fictícia: 12 h, setups 3/9/1): campanha de 1 dia = 0 h; de 3 dias = 8 + 11 + 2 h; por carga (4 h, 350 kg) num dia intermediário = 2 cargas / 700 kg; setup fora do turno em campanha de 1 dia = 11 h.

### Alocação (`engine._alocar`)

Guloso, dia a dia, do `inicio` ao `fim` do horizonte:

1. Lote com saldo após o vencimento (`data_chegada + espera_maxima_dias`) → `CAPACIDADE_EXCEDIDA`. Lote que vence no último dia do horizonte e sobra também é perda.
2. Enquanto houver secador disponível e erva com saldo disponível no dia:
   - escolhe primeiro a erva **mais urgente**: menos secadores já usados por ela no dia → vencimento mais próximo → maior prioridade de demanda → maior saldo;
   - ela vai para o secador livre com **menor `prioridade` cadastrada** na capacidade erva × secador. Sem prioridade (ou em empate), vai para o de **maior capacidade líquida no dia**: os kg que ele consegue secar, já descontados os setups, sem limitar ao saldo do lote. Continuar a campanha sai mais barato que trocar de erva.
3. Os kg secos saem dos lotes que vencem primeiro e vão para as demandas ainda no prazo, por maior prioridade e prazo mais próximo. O que sobra fica na alocação sem demanda (`demanda_id=None`).
4. No fim: demanda não coberta até o prazo → `ATRASO`; necessidade maior que a oferta prevista no horizonte → `SALDO_NAO_ALOCADO` (por erva).

A regra do PCP por código de secador (SCB03 maiores volumes, SCB01 picão, SCB02 menores volumes) **não** está fixa no código. Ela é cadastrada na tabela de capacidade (veja "Prioridade entre secadores" abaixo).

KPIs (`resultado.kpis`):

| Chave | Significado |
| ----- | ----------- |
| `horas_ocupadas` | por secador: horas de secagem + setup planejadas |
| `horas_disponiveis` | por secador: 24 h × dias disponíveis (operação sem bloqueio) |
| `ocupacao_planejada_pct` | por secador: ocupadas ÷ disponíveis × 100; `None` se não há dia disponível |
| `saldo_nao_alocado_kg` | por erva: kg de fresco das demandas não cobertos até o prazo |

### Prioridade entre secadores (`Capacidade.prioridade`)

- **Padrão (sem prioridade):** a erva vai para o secador com maior capacidade líquida no dia, isto é, os kg que ele consegue secar depois dos setups. A comparação não limita ao saldo: com um lote pequeno que os dois secadores dariam conta, ainda vence o mais rápido, e o mais lento fica livre. Assim o secador mais rápido fica com o volume maior.
- **Com prioridade:** campo opcional por erva × secador, em que o menor valor é o preferido. Quando informado, decide **antes** da capacidade líquida. A capacidade líquida só desempata secadores de mesma prioridade.
- Secador com prioridade informada vence secador sem prioridade.
- `None` significa "sem preferência" e não gera `PARAM_AUSENTE`: a prioridade é opcional por definição, e nenhum valor é inventado.
- A prioridade só define quem recebe a erva primeiro. Se o preferido não dá conta do volume, os outros secadores livres reforçam no mesmo dia. Secador que não seca nada no dia (0 kg) não é escolhido.
- Exemplo da política atual do PCP: picão × SCB01 com `prioridade=1`. "SCB03 para grandes volumes" já é o comportamento padrão quando o SCB03 é o mais rápido; para garantir, é possível cadastrar `prioridade=1` nas ervas de grande volume × SCB03.

### Premissas adotadas provisoriamente na alocação

- **Uma erva por secador por dia.**
- **Campanha sem sucessora:** se não chega mais lote da erva e o saldo cabe no dia junto com a limpeza, a campanha encerra nesse dia e paga o setup final. Se não cabe, a campanha fica aberta e a limpeza só é cobrada se outra erva entrar depois (troca). Nesse caso, a limpeza não aparece nas horas ocupadas do horizonte.
- **Pausa no meio da campanha** (dia sem trabalho, fora de `dias_operacao` ou com bloqueio): a campanha continua aberta e não paga setup inicial de novo nem setup diário nos dias parados.
- **Demanda só recebe kg secos até o prazo.** O que é seco depois não reduz o `ATRASO`.
- **Horizonte:** lotes que chegam depois do `fim` ou vencem antes do `inicio` são ignorados. Lote que ainda tem prazo depois do `fim` não é perda.
- Carga parcial (por carga) ocupa o tempo de uma carga cheia.

### Pendentes de definição

- Validar com o PCP as premissas provisórias acima, principalmente a campanha sem sucessora e a pausa no meio da campanha.
- Valores oficiais de regime, setups, vazão e carga por erva × secador (tabela de capacidade e matriz de trocas).

## Testes

```bash
docker compose exec backend pytest tests/planner -v
```

Os valores dos testes (rendimentos 6:1 e 23,3:1, setups da camomila etc.) vêm do relatório da etapa 1 e ainda **não foram validados pelo PCP**.
