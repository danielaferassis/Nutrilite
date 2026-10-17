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
| `capacity.py`    | Horas e kg disponíveis por secador/dia                              | a fazer |
| `engine.py`      | Orquestra o fluxo e faz a alocação gulosa dia a dia (`_alocar`)     | alocação a fazer |

## Regras

- Massa em kg e tempo em horas. Campo `None` = não informado.
- A oferta agrícola não é reagendável: o motor aloca os lotes nas datas em que chegam.
- Lote não secado até `data_chegada + espera_maxima_dias` gera `CAPACIDADE_EXCEDIDA`.
- KPI com denominador zero vale `None` ("não aplicável"), nunca `0`.

## Testes

```bash
docker compose exec backend pytest tests/planner -v
```

Os valores dos testes (rendimentos 6:1 e 23,3:1, setups da camomila etc.) vêm do relatório da etapa 1 e ainda **não foram validados pelo PCP**.
