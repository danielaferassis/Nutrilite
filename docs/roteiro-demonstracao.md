# Roteiro de demonstração (banca)

Percorre o fluxo inteiro, **demanda → previsão → simulação → aprovação → recebimento → nova simulação**, com dados **fictícios**. Cada passo diz o que clicar, o que deve aparecer e qual regra do projeto ele mostra.

Tempo estimado: 15 a 20 minutos.

## Antes da banca (preparação)

Rode na máquina da apresentação, nunca na VM de produção.

1. Banco limpo. **Apaga todos os dados locais**:
   ```bash
   docker compose down -v
   docker compose up -d
   docker compose exec backend alembic upgrade head
   ```
2. Usuário e dados fictícios:
   ```bash
   docker compose exec backend python -m app.cli criar-admin --email banca@exemplo.com.br
   docker compose exec backend python -m app.cli dados-ficticios --email banca@exemplo.com.br
   ```
   As datas são relativas ao dia em que o comando roda. **Rode no dia da banca**, para os lotes caírem nos próximos dias.
3. Abra http://localhost:5173/login e entre.
4. (Opcional, para mostrar perfis) No Swagger (http://localhost:8000/docs), crie um grupo "Fonte Procompete" só com `previsao.propria` e um usuário nesse grupo. Deixe uma segunda janela anônima logada com ele.

## Roteiro

### 1. O problema (1 min, sem tela)

Hoje o PCP planeja a secagem em planilhas. A erva fresca chega quando é colhida, é perecível e **não pode ser reagendada**. Se não houver secador antes de o tempo de espera vencer, ela se perde. O sistema cruza demanda, oferta e capacidade e mostra esses conflitos **antes** de a erva chegar.

### 2. Matriz de Capacidade

- **Mostrar:** cada erva × secador com kg e horas por carga, setups e prioridade.
- **Apontar o agrião:** "não informado" em amarelo.
- **Regra:** parâmetro ausente **nunca** vira valor padrão. Se o agrião entrasse numa simulação, ela pararia com a pendência `PARAM_AUSENTE`, em vez de inventar um número.
- **Contexto:** a estrutura (secagem por carga, setup dentro da campanha) veio das respostas do PCP em 21/10. Os números aqui são fictícios.

### 3. Gestão de Demandas

- **Mostrar:** as demandas em **moído** e em **desidratado**, com prazo e prioridade.
- **Regra:** a demanda vem em produto acabado. O sistema converte para kg de erva fresca pelos rendimentos (cálculo reverso). A conversão aparece no passo 5.

### 4. Entrada de Previsões

- **Mostrar:** os lotes previstos por origem (Fazenda Própria, Procompete, P&D) e a data de chegada.
- **Perfis (se fez o passo 4 da preparação):** na janela do usuário Fonte, ele só vê e altera as **próprias** previsões. A previsão de outra fonte devolve 404, não 403, para nem revelar que existe. **Quem garante isso é o backend**; a tela só esconde botões.

### 5. Plano de Secagem: simular

1. **Sem marcar nenhum dia**, clique em **Simular**.
   - **Resultado:** pendência "Parâmetro ausente: Dias de operação da fábrica não informados".
   - **Regra:** o sistema não supõe que a fábrica opera de segunda a sexta.
2. Marque **Seg a Sáb** (o PCP disse "geralmente 6 dias") e simule com fim em hoje + 13 dias.
3. Mostre, em ordem:
   - **Pendência "Capacidade excedida":** o lote grande de camomila vence sem secador. É o conflito que o sistema existe para antecipar.
   - **Ocupação por secador**, em **horas**. Kg de ervas diferentes não se somam.
   - **Cronograma dia × secador:**
     - o picão vai **primeiro** para o **SCB01**, por causa da **prioridade cadastrada** (política do PCP). Se sobrar volume, outro secador reforça no mesmo dia (o PCP confirmou que um lote pode ir para dois secadores em paralelo);
     - a salsa prefere o SCB03 (maior capacidade), mas no dia em que ele está na campanha de camomila, vai para o SCB02;
     - **troca de erva no mesmo dia:** procure a célula do SCB01 com duas ervas (em geral **fibra ↳ camomila**). O lote de fibra é pequeno e único: ela termina, o secador é limpo e a camomila entra no tempo que sobra. Regra confirmada pelo PCP em 21/10. Em "Detalhe das alocações", o setup da camomila nesse dia é só o dela, porque a limpeza da fibra já foi cobrada quando a fibra encerrou.
   - **SCB02 com 24 h a menos de horas disponíveis** que os outros: a manutenção cadastrada tira um dia.
   - **Necessidade de erva fresca:** o cálculo reverso (moído → desidratado → fresco).

### 6. Salvar e aprovar (rastreabilidade)

1. Clique em **Simular e salvar rascunho**. Aparece o v1, com status Rascunho.
2. Clique em **Aprovar**. A confirmação mostra **o que vai ser substituído**; no primeiro plano, nada.
3. Salve e aprove de novo o mesmo horizonte (v2). A confirmação avisa: "vai substituir o v1, **EM ANDAMENTO**".
4. Abra o v2 e mostre:
   - **quem criou, quem aprovou e quando;**
   - os **dias de operação usados**;
   - a **versão por horizonte**.
5. **Regra:** o plano é uma **fotografia**. Ele guarda a entrada inteira usada (em `parametros`) e o resultado. Alterar o cadastro depois **não muda** um plano aprovado. Há teste para isso: `test_plano_salvo_nao_muda_quando_o_cadastro_muda`.

### 7. Cronograma e Recebimentos

1. **Linha do tempo:** v1 aparece riscado (substituído) e v2 em verde.
2. **Programação de secagem:** só os aprovados.
3. **Chegadas no histórico:**
   - uma chegou com **menos kg** que o previsto (desvio negativo);
   - uma chegou **atrasada**;
   - uma **não veio**;
   - uma **não estava prevista**.
4. Registre a chegada do primeiro lote futuro com **menos kg** que o previsto.
5. Volte ao Plano de Secagem e **simule de novo**. Em "Detalhe das alocações", o lote agora aparece como `#R<n>`, com o kg real.
6. **Regra:** o **recebido substitui o previsto**. A previsão recebida fica travada (tentar excluí-la em Entrada de Previsões devolve "Previsão já recebida não pode ser alterada nem removida").

### 8. Bloqueios

1. Bloqueie o **SCB01** por 2 dias ("Manutenção").
2. Simule de novo. O SCB01 não recebe erva nesses dias, e as horas disponíveis dele caem.

### 9. Dashboard

- **Plano vigente** e pendências.
- **Confiabilidade das fontes:** aderência (recebido ÷ previsto) e pontualidade por origem.
- **Chegadas que não vieram.**
- **Regra:** indicador sem base de cálculo mostra **"n/a"**, nunca 0%.

## Perguntas prováveis da banca

**Por que um algoritmo guloso e não otimização (programação linear)?**
Foi decisão de escopo do MVP: o PCP precisa **entender e confiar** no plano. Cada alocação tem um motivo que dá para explicar:
- o lote mais urgente escolhe primeiro;
- a erva vai para o secador preferido;
- continuar uma campanha sai mais barato que trocar de erva.

Otimização sofisticada fica como trabalho futuro. O contrato do motor (`types.py`) permite trocar o algoritmo sem mexer na API.

**Por que não preencher parâmetro ausente com um valor razoável?**
Um número inventado gera um plano com cara de certo, e é exatamente aí que a fábrica perderia erva. A ausência vira pendência visível (`PARAM_AUSENTE`), e o PCP completa o cadastro.

**Por que ocupação em horas e não em kg?**
1 kg de camomila e 1 kg de picão ocupam o secador por tempos diferentes. Somar kg de ervas diferentes não mede nada.

**O motor depende do banco ou da API?**
Não. `app/planner` é Python puro, sem SQLAlchemy nem FastAPI. A API converte os models em dataclasses (`app/cadastro.py`, `app/simulacao.py`), chama `simular()` e grava o resultado. Isso permite testar o motor isolado (`tests/planner`).

**Como a autorização é garantida?**
Sempre no backend. Cada rota exige uma funcionalidade (`requer_permissao`, `requer_alguma_permissao`), checada na view `vw_permissao_usuario`. A tela só esconde botões por conforto.

**Como o sistema usa IA?**
Não usa. O planejamento é determinístico: a mesma entrada gera sempre o mesmo plano.

**Quantos testes há?**
Rode `docker compose exec backend pytest -q` ao vivo. Os testes cobrem o motor, as regras de permissão, a fotografia do plano, os recebimentos e os dados fictícios.

## Limitações conhecidas

Fale delas antes que perguntem:

- **Guloso enxerga só o dia:** uma erva que começa no fim do dia e deixa a campanha aberta pode atrapalhar outra erva nos dias seguintes. Medimos o efeito em 2.000 cenários aleatórios (README do motor) e ele é raro; otimizar o horizonte inteiro fica como trabalho futuro.
- **Cadastro de erva, secador e capacidade:** ainda não tem tela de edição. Hoje os dados entram direto no banco; os endpoints estão em definição com o Guilherme.
- **Demandas com prazo logo depois do horizonte** não recebem crédito da secagem. Há proposta em `docs/propostas/demandas-alem-do-horizonte.md`.
- **Importação S&OP em lote:** aguarda o formato oficial da planilha.
