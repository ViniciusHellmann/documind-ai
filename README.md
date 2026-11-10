# DocuMind AI v2

Workspace dark de inteligência documental. Frontend em HTML/CSS/JS e Edge Function Supabase + Gemini.

## Requisitos
- Projeto Supabase existente.
- Chave Gemini do Google AI Studio.
- Node.js instalado (para Supabase CLI).
- VS Code com Live Server (ou outro servidor local HTTP).

## 1. Configurar o frontend
Edite `js/config.js` e substitua:
- `https://SEU_PROJECT_REF.supabase.co` pela Project URL do Supabase.
- `SUA_PUBLISHABLE_KEY` pela Publishable Key do projeto.

A Publishable Key é uma chave pública. A chave `GEMINI_API_KEY` nunca deve ser colocada no frontend.

## 2. Configurar segredo no Supabase
No Dashboard do Supabase: Edge Functions → Secrets.
Crie:
- Name: `GEMINI_API_KEY`
- Value: sua chave do Google AI Studio.

Opcionalmente configure `ALLOWED_ORIGINS` como uma lista separada por vírgulas, por exemplo:
`http://localhost:5500,http://127.0.0.1:5500,https://SEU_USUARIO.github.io`

A lista padrão inclui localhost e o GitHub Pages que constava no projeto anterior. Ajuste para seu domínio real.

## 3. Publicar a Edge Function
Abra o terminal CMD na pasta raiz do projeto:
```cmd
npx.cmd supabase login
npx.cmd supabase link --project-ref SEU_PROJECT_REF
npx.cmd supabase functions deploy analyze-document
```
O `supabase/config.toml` configura `verify_jwt = false`, pois esta demonstração usa uma função pública sem login. Não coloque documentos confidenciais nela. Para produção, implemente autenticação, limites por usuário/IP, proteção contra abuso e políticas de retenção antes de abrir o serviço ao público.

## 4. Executar localmente
Use a extensão Live Server no VS Code e abra `index.html` via servidor HTTP (não abra com `file://`).

## Recursos
- PDF e TXT até 10 MB.
- Extração de texto PDF no navegador via PDF.js.
- Análise Gemini 3.8 Flash pela Edge Function.
- Tentativas automáticas limitadas para erros temporários 429/5xx.
- Timeout e cancelamento na interface.
- Histórico local no navegador (até 30 análises).
- Resumo, classificação, pontos de atenção, próximos passos e informações extraídas.

## Limitações e privacidade
- PDF escaneado sem camada de texto não é processado (OCR não incluído).
- O frontend extrai texto do PDF e envia até 45.000 caracteres para a Edge Function.
- Histórico é local; limpar dados do navegador apaga o histórico.
- A função pública não possui autenticação robusta nem rate limit distribuído. O segredo Gemini fica no servidor, mas a função pode ser abusada por terceiros se o endpoint público for divulgado. Configure ALLOWED_ORIGINS e adicione autenticação/rate limit antes de produção.
- Use apenas arquivos fictícios ou autorizados enquanto o projeto estiver em demonstração.

## Estrutura
```text
documind-ai/
├── index.html
├── css/style.css
├── js/app.js
├── js/config.js
└── supabase/
    ├── config.toml
    ├── schema.sql
    └── functions/analyze-document/index.ts
```
