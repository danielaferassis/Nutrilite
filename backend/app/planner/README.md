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
| `engine.py`      | Orquestra o fluxo e faz a alocação gulosa dia a dia (`_alocar`)     | alocação a fazer |

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

### Pendentes de definição

- **Campanha sem sucessora** (acabaram os lotes ou o horizonte): onde cobrar o setup final? A alocação decide; `capacity.py` só cobra quando recebe `encerra_campanha=True`.
- **Pausa no meio da campanha** (dia fora de `dias_operacao` ou bloqueio): a campanha continua ou recomeça, cobrando o setup inicial de novo?
- Valores oficiais de regime, setups, vazão e carga por erva × secador (tabela de capacidade e matriz de trocas).

## Testes

```bash
docker compose exec backend pytest tests/planner -v
```

Os valores dos testes (rendimentos 6:1 e 23,3:1, setups da camomila etc.) vêm do relatório da etapa 1 e ainda **não foram validados pelo PCP**.
