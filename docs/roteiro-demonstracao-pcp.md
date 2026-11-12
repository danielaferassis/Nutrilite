# Roteiro de demonstração para o PCP da Nutrilite

**Para quem apresenta.** A plateia é a equipe da Nutrilite que vai usar o sistema no dia a dia. O objetivo é **mostrar a rotina deles dentro do sistema e colher retorno de uso**: o que está claro, o que confunde, o que falta. Não é a banca: nada de backend, API, testes ou códigos de erro. O roteiro técnico, para a banca, está em `roteiro-demonstracao.md`.

**Duração:** cerca de 40 min (25 de demonstração e 15 de conversa).

## Combinados da equipe

- **Todos os números são fictícios.** Fale isso logo na abertura, para ninguém se prender a valores ("os números não são os de vocês; olhem o caminho").
- **Uma pessoa conduz e outra anota** o retorno na ficha do fim deste documento. Anote as palavras que eles usam: elas viram nomes de botão e de coluna.
- **Pergunte e escute mais do que explica.** Depois de cada tela, faça a pergunta sugerida e espere.
- **Não prometa prazo nem funcionalidade.** Resposta padrão: "anotamos e vamos avaliar com o grupo".
- **Se a equipe mudar o visual antes de sábado**, confira os nomes dos botões citados aqui.

## Preparação (na véspera e no dia)

Rode numa máquina local, **não na VM de produção**: os dados fictícios não podem misturar com o cadastro real.

1. Banco limpo e dados fictícios, **no dia** (as datas são relativas a hoje; conferido com a demo num sábado):
   ```bash
   docker compose down -v && docker compose up -d
   docker compose exec backend alembic upgrade head
   docker compose exec backend python -m app.cli criar-admin --email demo@exemplo.com.br
   docker compose exec backend python -m app.cli dados-ficticios --email demo@exemplo.com.br
   ```
2. Abra http://localhost:5173/login, entre e deixe as telas na ordem das abas abaixo.
3. Faça o roteiro inteiro uma vez antes, de preferência com outra pessoa no papel do PCP. Depois **recarregue o banco** (passo 1) para começar limpo.
4. Tenha um Excel aberto na máquina para mostrar o arquivo exportado.
5. Plano B: tire prints das telas principais (plano simulado, cronograma, matriz). Se algo falhar, siga pelos prints.

## Abertura (2 min, sem tela)

> "Hoje o planejamento da secagem é feito em planilhas. A ideia do sistema é juntar num lugar só o que vai chegar de erva, o que precisa ser entregue e quanto cada secador dá conta, e avisar **antes** quando algo não vai caber, porque a erva fresca não espera. Os números de hoje são inventados. Queremos saber se o caminho faz sentido para o dia a dia de vocês."

## A rotina, passo a passo

### 1. O que está para chegar (Entrada de Previsões)

- Mostre os lotes previstos por origem (Fazenda Própria, Procompete, P&D) e a data de chegada.
- **Edite** uma previsão (por exemplo, mude a data) e salve.
- Conte que o produtor parceiro pode ter um login que **só vê e lança as próprias previsões**.
- **Pergunte:** "Hoje, como essa informação chega até vocês? Quem lançaria isso aqui?"

### 2. O que precisa ser entregue (Gestão de Demandas)

- Mostre as demandas em **moído** e em **desidratado**, com prazo e prioridade.
- Explique: "Vocês lançam no estágio em que pensam. O sistema faz a conta de volta até a erva fresca."
- **Pergunte:** "A demanda chega para vocês em moído, desidratado ou por código de produto? Essa quantidade já vem descontando o estoque?"

### 3. Planejar a semana (Plano de Secagem)

1. Escolha o período de **hoje até daqui a 6 dias** e marque **segunda a sábado** ("vocês disseram que operam 6 dias").
2. Clique em **Simular** e mostre, nesta ordem:
   - **Cronograma dia × secador:** qual erva vai para qual secador em cada dia, com kg e horas.
     - O picão vai **primeiro** para o **SCB01**, porque foi cadastrado como preferido.
     - Procure uma célula com **duas ervas** (por exemplo, fibra ↳ camomila): o secador termina uma, limpa e começa outra no mesmo dia.
   - **Avisos em vermelho:** o lote grande de camomila **não cabe** nos secadores antes de vencer. "É isso que hoje vocês só descobrem quando a erva já chegou."
   - **Ocupação de cada secador** em horas. O SCB02 tem menos horas disponíveis: há uma manutenção cadastrada nele.
   - **Necessidade de erva fresca:** para cada demanda, quanto o plano cobre e quanto falta.
     - "Coberta": tudo certo.
     - "Atraso": vence nesta semana e não vai dar.
     - "Continua no próximo plano": vence **depois** desta semana; a secagem de agora já conta para ela, e o restante fica para o próximo plano. Com os dados fictícios, é a **salsa**. A **fibra** também vence depois, mas já sai coberta.
3. Clique em **Baixar cronograma (Excel)** e abra o arquivo.
4. **Pergunte:**
   - "Esse cronograma é o que vocês montam hoje na planilha? Falta alguma coluna?"
   - "Quando uma secagem desta semana serve a uma demanda da semana que vem, faz sentido mostrar assim (*Continua no próximo plano*)?"
   - "O que vocês olhariam primeiro nesta tela?"

### 4. Aprovar o plano

1. Clique em **Simular e salvar rascunho** e depois em **Aprovar**.
2. Mostre que o plano guarda **versão, quem criou e quem aprovou, e quando**. Um plano novo para o mesmo período substitui o anterior, e o sistema avisa antes.
3. **Pergunte:** "Quem aprova o plano hoje? Um plano novo deve substituir o anterior inteiro ou só os dias que se repetem?"

### 5. A semana andando (Cronograma e Recebimentos)

1. Mostre a **programação aprovada** e as **chegadas**: uma veio com menos kg, uma atrasou, uma não veio e uma não estava prevista.
2. **Registre a chegada** de um lote com **menos kg** que o previsto. Depois use **corrigir** para mostrar que dá para acertar um erro de digitação.
3. Volte ao Plano de Secagem e **simule de novo**: o sistema já usa o que chegou de fato.
4. Mostre **Baixar (Excel)** das chegadas (previsto, recebido e diferença).
5. **Pergunte:** "Quem registraria a chegada? Na balança, no recebimento? Quando chega menos do que o previsto, o restante ainda vem depois?"

### 6. Imprevisto: secador parado (Bloqueios)

1. Bloqueie o **SCB01** por 2 dias com o motivo "Manutenção".
2. Simule de novo: o SCB01 fica vazio nesses dias e a erva vai para outro secador, ou aparece o aviso de que não cabe.
3. **Pergunte:** "Com que antecedência vocês sabem de uma manutenção? Feriados entram aqui também?"

### 7. O cadastro dos secadores (Matriz de Capacidade)

1. Mostre a matriz erva × secador. As colunas correspondem à planilha deles:
   - **kg por carga** e **horas por carga**;
   - **setup inicial** e **setup final** (Setup In / Setup Fn);
   - **setup diário**, que é o **"Interv"** da planilha (uma vez por dia).
2. Aponte o **agrião**: o que falta aparece como **"não informado"**. O sistema não inventa número e avisa na simulação.
3. Clique em **editar** numa célula, mude a prioridade e salve.
4. **Pergunte:** "A coluna *Rendimento* da planilha de vocês é um percentual ou quantos kg de fresco dão 1 kg seco? Quem mantém essa tabela atualizada?"

### 8. Visão geral (Dashboard)

- Mostre o **plano vigente**, os avisos e a **confiabilidade das fontes**: quanto do previsto chegou e se chegou no dia.
- **Pergunte:** "Que número vocês querem ver logo ao abrir o sistema de manhã?"

## Conversa final (15 min)

Perguntas abertas, nesta ordem:

1. "O que mais ajudaria no dia a dia de vocês?"
2. "O que ficou confuso ou difícil de achar?"
3. "Que nome vocês dariam às coisas?" (por exemplo, "pendência", "lote", "setup")
4. "Que informação da planilha de hoje não apareceu aqui?"
5. "Quem da equipe usaria cada tela?"
6. "Topariam testar com dados reais numa próxima etapa?"

## Se perguntarem…

| Pergunta | Resposta |
| --- | --- |
| "Integra com o ERP ou com o Infinity?" | Integração automática com o ERP está fora desta etapa. A importação do Infinity está em andamento. |
| "Dá para importar a planilha de previsões?" | Sim, se houver uma planilha padrão. Peça um modelo **com dados fictícios**. |
| "O sistema decide sozinho?" | Ele propõe um plano e mostra os conflitos. Quem aprova é o PCP. |
| "E se o número cadastrado estiver errado?" | O cadastro é editável, e um plano já aprovado não muda: ele guarda os números que foram usados. |
| "Usa inteligência artificial?" | Não. A mesma informação gera sempre o mesmo plano, e cada decisão pode ser explicada. |

## Ficha de retorno (quem anota preenche)

| Tela | O que gostaram | O que confundiu | O que falta | Quem pediu / importância |
| --- | --- | --- | --- | --- |
| Previsões | | | | |
| Demandas | | | | |
| Plano de Secagem | | | | |
| Aprovação | | | | |
| Cronograma e Recebimentos | | | | |
| Bloqueios | | | | |
| Matriz de Capacidade | | | | |
| Dashboard | | | | |
| Excel exportado | | | | |

**Perguntas que ficaram para a Eva** (anotar e enviar depois, por mensagem curta):

- [ ] O excedente de uma semana deve aparecer para a semana seguinte?
- [ ] O kg da demanda já desconta o estoque e o que já foi produzido?
- [ ] A coluna "Rendimento" é percentual ou razão? Muda de secador para secador?
- [ ] O outro código da fibra (tempos diferentes): o lote já chega destinado a ele?
- [ ] Existe planilha S&OP padrão?
