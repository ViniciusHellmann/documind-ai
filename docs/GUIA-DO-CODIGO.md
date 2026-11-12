# DocuMind AI — Guia completo do código

Este guia acompanha o código-fonte comentado. Ele explica a arquitetura, o papel de cada arquivo, as funções principais, o caminho de uma análise e os limites da versão.

## 1. Visão geral: como as peças se conectam

1. **`index.html`** monta a estrutura visual: menu, seleção de arquivo, opções, resultado, histórico e configurações.
2. **`css/style.css`** define cores, tipografia, espaçamentos, cartões, animações e adaptação para telas menores.
3. **`js/config.js`** informa ao navegador a URL do projeto Supabase e sua chave pública (Publishable Key).
4. **`js/app.js`** controla a interface, valida a seleção do arquivo, mostra progresso, chama o analisador e salva o histórico local.
5. **`js/document-analyzer.js`** extrai o texto do PDF/TXT e envia esse texto à Edge Function do Supabase.
6. **`supabase/functions/analyze-document/index.ts`** é o backend seguro: valida a requisição, lê o segredo `GROQ_API_KEY`, prepara o prompt, chama a API Groq e valida o JSON.
7. **`supabase/config.toml`** define que a função de demonstração aceita chamadas sem JWT. Por isso a própria função aplica validações de origem e de conteúdo.
8. **`supabase/schema.sql`** contém uma estrutura opcional para futuro histórico por usuário. A versão atual não usa essa tabela: guarda o histórico no navegador.

### Fluxo de uma análise

```text
Pessoa seleciona PDF/TXT
        |
        v
app.js valida arquivo e inicia o progresso
        |
        v
document-analyzer.js extrai o texto
        |
        v
document-analyzer.js envia POST para Supabase
        |
        v
Edge Function valida origem, método e texto
        |
        v
Edge Function monta o prompt e chama Groq
        |
        v
Groq devolve JSON -> backend valida o formato
        |
        v
document-analyzer.js entrega o resultado ao app.js
        |
        +--> app.js mostra os cartões
        |
        +--> app.js salva até 30 análises no localStorage
```

## 2. Arquivos do frontend

### `index.html` — estrutura da página

É a estrutura semântica da aplicação. Não contém a lógica de análise.

- **Sidebar (`aside`)**: menu para alternar entre Nova análise, Histórico e Configurações.
- **`view-analyze`**: área de envio do documento, seleção do tipo de análise, botão de execução, aviso de privacidade, progresso e resultado.
- **`view-history`**: lista as análises salvas neste navegador.
- **`view-settings`**: mostra URL/Publishable Key e explica os limites da demonstração.
- **`file-input` / `dropzone`**: permitem selecionar ou arrastar um arquivo.
- **`analysis-type`**: envia o tipo de análise escolhido (`complete`, `summary`, `extract` ou `risks`).
- **`result-*`**: elementos que recebem as partes do JSON retornado pela IA.
- **`loading-overlay`**: camada visual durante a execução.
- **Scripts no fim do `body`**: PDF.js é carregado antes dos módulos; depois vêm configuração, analisador e interface. A ordem importa porque os scripts seguintes dependem dos anteriores.

### `css/style.css` — apresentação visual

Centraliza o visual do produto. As regras CSS controlam:
- identidade escura e paleta verde/azulada;
- tipografia, largura e alinhamento;
- sidebar, cabeçalho, painéis e cartões;
- área de upload e estados de arraste;
- listas, tabela de informações extraídas e histórico;
- overlay, barra de progresso e animações;
- estados ocultos/ativos e responsividade.

O CSS não chama a IA nem processa arquivos: ele apenas define como os elementos HTML aparecem.

### `js/config.js` — conexão pública com Supabase

Define `window.DOCUMIND_CONFIG`, objeto global lido pelo analisador e pela tela de configurações.

- `supabaseUrl`: endereço do projeto Supabase.
- `supabaseAnonKey`: Publishable Key usada pelo navegador para identificar o projeto e chamar a função.

**Segurança:** a Publishable Key é feita para uso no frontend, mas isso não significa que substitua regras de autorização. A chave `GROQ_API_KEY` é privada e deve existir somente nos Secrets do Supabase. Nunca coloque a chave Groq em `config.js`, HTML, JavaScript público ou GitHub.

### `js/app.js` — controle da interface

O arquivo é envolvido por uma função autoexecutável (`(() => { ... })()`), que mantém variáveis internas fora do escopo global.

#### Estado e variáveis

- **`$`**: atalho para `document.getElementById`.
- **`views`**: nomes das três telas.
- **`selectedFile`**: arquivo atualmente selecionado.
- **`activeController`**: permite cancelar uma análise em andamento.
- **`progressTimer`** e **`currentProgress`**: controlam a animação do progresso.
- **`HISTORY_KEY`**: nome da chave usada no `localStorage`.

#### Funções

| Função | Para que serve |
|---|---|
| `bytes(size)` | Converte bytes em KB ou MB para mostrar o tamanho do arquivo. |
| `escapeHtml(value)` | Escapa caracteres especiais antes de inserir dados em HTML, reduzindo risco de injeção de marcação. |
| `getHistory()` | Lê e converte o histórico salvo no navegador; se houver JSON inválido, retorna lista vazia. |
| `saveHistory(item)` | Adiciona a nova análise no início e limita o histórico às 30 mais recentes. |
| `setView(name)` | Alterna a tela ativa, atualiza o menu e o breadcrumb e fecha a sidebar móvel. |
| `chooseFile(file)` | Confere tipo PDF/TXT e limite de 10 MB; atualiza nome, tamanho e botão de análise. |
| `showError(message)` | Mostra uma mensagem de erro na interface. |
| `setProgress(percent, title, message)` | Atualiza barra, percentual e textos do overlay sem mostrar 100% antes da conclusão. |
| `startProgress()` | Inicia o overlay e anima o progresso enquanto a requisição acontece. |
| `stopProgress()` | Para o timer e esconde o overlay. |
| `listItems(items, fallback)` | Converte um array em itens de lista; usa um texto alternativo quando não há itens. |
| `renderResult(data, fileName)` | Preenche os cartões com resumo, classificação, pontos de atenção, próximos passos e informações extraídas. |
| `runAnalysis()` | Coordena a execução: desabilita o botão, chama o analisador, salva histórico, mostra resultado e trata erros/cancelamento. |
| `renderHistory()` | Desenha as análises salvas e conecta os botões para reabrir cada resultado. |
| `renderSettings()` | Lê `DOCUMIND_CONFIG` e exibe se URL e Publishable Key parecem preenchidas. |

#### Eventos da interface

No final do arquivo, `addEventListener` conecta os controles às funções:
- clique nos itens de navegação -> `setView`;
- botão do menu móvel -> abre/fecha a sidebar;
- mudança no input e evento `drop` -> `chooseFile`;
- botão Analisar -> `runAnalysis`;
- botão Cancelar -> chama `abort()` no controlador ativo;
- botão Limpar histórico -> pede confirmação e remove a chave do `localStorage`;
- atalho Ctrl+K ou Cmd+K -> abre a tela de análise e o seletor de arquivo.

A última chamada `renderSettings()` inicializa os indicadores de configuração quando o script é carregado.

### `js/document-analyzer.js` — leitura e envio do documento

Também usa uma função autoexecutável. Expõe somente `window.DocuMindAnalyzer`, evitando espalhar funções auxiliares no escopo global.

#### Constantes

- **`CONFIG`**: referência à configuração pública do Supabase.
- **`MODEL`**: identificador de modelo exibido como referência no frontend. A lista efetivamente tentada está no backend.
- **`MAX_TEXT_CHARS = 45000`**: limita o trecho de texto enviado.
- **`FUNCTION_TIMEOUT_MS = 120000`**: tempo máximo de espera do navegador pela Edge Function.

#### Funções

| Função | Para que serve |
|---|---|
| `configError()` | Interrompe o processo se URL ou Publishable Key não estiverem configuradas. |
| `extractText(file)` | Lê TXT diretamente; para PDF, usa PDF.js para percorrer as páginas e juntar os trechos de texto selecionável. |
| `friendlyError(status, payload)` | Converte códigos HTTP (401, 429, 502, 503, 504, 413 etc.) em mensagens compreensíveis. |
| `analyze(file, analysisType, onProgress, signal)` | Extrai texto, limita o conteúdo, chama a Edge Function, valida o retorno e trata timeout/cancelamento. |

#### Detalhes importantes de `extractText`

- TXT: usa `file.text()`.
- PDF: lê o arquivo como `ArrayBuffer`, abre com PDF.js e percorre as páginas com `getPage()` e `getTextContent()`.
- Junta os trechos de texto das páginas.
- Se não encontrar texto selecionável, informa que OCR ainda não está incluído.

#### Detalhes importantes de `analyze`

- `analysisType` escolhe o foco do prompt no backend.
- `onProgress` é um callback para atualizar o progresso da tela.
- `signal` permite que a interface peça cancelamento.
- `AbortController` e `setTimeout` evitam espera indefinida.
- O `finally` sempre limpa o timer e remove o listener de cancelamento, inclusive se houver erro.

## 3. Backend — Supabase Edge Function

### `supabase/functions/analyze-document/index.ts`

Este é o componente que conversa com a Groq. Ele roda no ambiente do Supabase, não no navegador.

#### Configurações principais

- **`MODELS`**: lista de modelos tentados, na ordem definida no código. Se um modelo falha em situações tratadas como temporárias, a função passa ao próximo.
- **`MAX_TEXT_CHARS`**: máximo de 45.000 caracteres aceitos pelo backend.
- **`REQUEST_TIMEOUT_MS`**: limite de tempo de cada chamada individual à API.
- **`ALLOWED_ORIGINS`**: lista de origens permitidas; pode ser sobrescrita pela variável de ambiente `ALLOWED_ORIGINS`.

> Observação: o array de modelos desta versão contém `llama-3.3-70b-versatile` e `openai/gpt-oss-20b`. O código tenta na ordem. A disponibilidade real depende do acesso e dos limites da conta Groq; a presença de um modelo no array não garante que a conta tenha acesso a ele.

#### Funções do backend

| Função | Para que serve |
|---|---|
| `corsHeaders(origin)` | Monta cabeçalhos CORS e libera a origem somente se estiver autorizada. |
| `json(data, status, origin)` | Padroniza respostas HTTP em JSON com status e cabeçalhos CORS. |
| `buildPrompt(text, type, fileName)` | Cria o prompt com tarefa escolhida, regras de precisão e estrutura JSON esperada. |
| `validateAnalysis(value)` | Confere se o retorno tem resumo e normaliza arrays/campos opcionais. |
| `callGroq(model, prompt, apiKey)` | Faz POST para a API Groq, inclui timeout e devolve resposta/dados ou informação de timeout. |
| `serve(async (req) => ...)` | Handler HTTP principal: valida origem/método, lê segredo, valida texto, tenta modelos, valida JSON e responde. |

#### Como `buildPrompt` orienta a IA

O prompt:
- define o papel do DocuMind AI;
- seleciona um dos focos: completo, resumo, extração ou riscos;
- instrui a responder em português brasileiro;
- exige que não invente dados e diferencie fatos de interpretações;
- alerta que o texto do documento é dado não confiável e não pode alterar as regras do assistente;
- exige somente JSON com `summary`, `classification`, `attentionPoints`, `nextSteps` e `extractedInfo`.

#### Como `callGroq` funciona

1. Cria `AbortController` para limitar o tempo da chamada.
2. Faz `fetch` para `https://api.groq.com/openai/v1/chat/completions`.
3. Envia a chave privada no cabeçalho `Authorization: Bearer ...`.
4. Envia mensagens de sistema e usuário, temperatura, limite de tokens e formato JSON.
5. Converte a resposta em JSON.
6. Se houver erro de rede ou timeout, registra a falha e devolve um objeto sem resposta.
7. No `finally`, limpa o timer.

#### Handler HTTP principal

- Rejeita origem que não esteja em `ALLOWED_ORIGINS`.
- Responde `OPTIONS` para a verificação CORS do navegador.
- Aceita somente `POST`.
- Busca `GROQ_API_KEY` com `Deno.env.get()`.
- Lê `text`, `fileName` e `analysisType` do corpo.
- Recusa texto vazio/curto e texto acima de 45.000 caracteres.
- Monta o prompt e percorre `MODELS`.
- Se a Groq responder com sucesso, tenta converter o conteúdo em JSON e passa por `validateAnalysis`.
- Retorna análise, nome do modelo e indicação de truncamento.
- Trata separadamente erros de chave, requisição inválida, limite 429, timeout, falha de rede e indisponibilidade.

## 4. Supabase e persistência

### `supabase/config.toml`

A opção `verify_jwt = false` desativa a exigência de token JWT para esta Edge Function de demonstração. Isso facilita a chamada pelo site estático, mas significa que a função pode ser invocada sem login. CORS não é autenticação e não impede chamadas diretas por outros clientes. Para produção, implemente autenticação, autorização, rate limiting e controles adicionais.

### `supabase/schema.sql`

Cria opcionalmente `public.document_analyses`, com:
- `id`: identificador UUID;
- `user_id`: usuário dono do registro;
- `file_name`: nome do arquivo;
- `summary`: resumo;
- `classification`: categorias;
- `analysis`: JSON completo;
- `created_at`: data de criação.

Ativa RLS e cria políticas para que cada usuário autenticado leia, insira e exclua somente seus próprios registros. **O frontend desta versão não grava nessa tabela**; ele usa `localStorage`.

### Histórico local (`localStorage`)

O histórico é armazenado no próprio navegador, sob `documind_history_v2`. Isso significa:
- não sincroniza entre dispositivos;
- pode ser apagado ao limpar os dados do navegador;
- não é uma conta/backup na nuvem;
- não deve receber documentos confidenciais nesta demonstração.

## 5. Segurança e privacidade

- `GROQ_API_KEY`: segredo exclusivo do Supabase (Secrets). Nunca publicar no GitHub.
- `supabaseAnonKey`: chave pública para o frontend. Ela não substitui políticas de segurança.
- `verify_jwt = false`: função sem autenticação obrigatória nesta versão.
- CORS: controla quais navegadores recebem permissão de origem, mas não é barreira de autenticação.
- O texto do documento é enviado ao backend e ao provedor Groq para processamento. Use somente documentos fictícios ou autorizados nesta demonstração.
- `escapeHtml` protege a renderização de conteúdo dinâmico na interface; a validação do backend também reduz o risco de estruturas inesperadas.

## 6. Limites funcionais conhecidos

- Formatos aceitos: PDF e TXT.
- Limite de seleção no frontend: 10 MB por arquivo.
- Limite de texto enviado: 45.000 caracteres; documentos maiores são truncados no início e o resultado recebe indicação de truncamento.
- PDF digitalizado como imagem: não é processado, pois OCR não está implementado.
- O histórico é local e limitado a 30 itens.
- A análise depende da disponibilidade, quota e limite de tokens por minuto do plano Groq.
- A resposta da IA deve ser revisada por uma pessoa antes de decisões importantes.

## 7. Glossário rápido

- **Frontend**: parte executada no navegador (HTML, CSS e JavaScript).
- **Backend**: parte executada no servidor; neste projeto, a Edge Function.
- **Edge Function**: função serverless executada pelo Supabase.
- **API**: interface pela qual sistemas trocam dados.
- **CORS**: regra de navegador que controla chamadas entre origens diferentes.
- **JSON**: formato estruturado usado para enviar e receber a análise.
- **Prompt**: instruções e contexto enviados ao modelo de IA.
- **Token**: unidade de texto usada para medir entrada/saída e limites dos modelos.
- **Timeout**: tempo máximo de espera antes de cancelar uma operação.
- **localStorage**: armazenamento simples do navegador.
- **RLS**: Row Level Security; políticas que controlam quais linhas do banco cada usuário pode acessar.
- **OCR**: reconhecimento de texto em imagens; não está incluído nesta versão.
