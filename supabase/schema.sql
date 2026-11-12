-- DocuMind AI
-- O histórico desta versão é local no navegador; este schema é opcional
-- para a próxima etapa com autenticação de usuários.
-- TABELA OPCIONAL PARA UMA FUTURA VERSÃO COM LOGIN: a versão atual salva o histórico no navegador.
-- Cada registro guarda usuário, nome do arquivo, resumo, classificação, JSON completo e data.
create table if not exists public.document_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  summary text not null,
  classification text[] not null default '{}',
  analysis jsonb not null,
  created_at timestamptz not null default now()
);
-- RLS (Row Level Security): impede que usuários autenticados consultem ou alterem registros de outras pessoas.
alter table public.document_analyses enable row level security;
drop policy if exists "Users can read own analyses" on public.document_analyses;
-- Política de leitura: o usuário só pode consultar linhas cujo user_id seja o seu próprio ID autenticado.
create policy "Users can read own analyses" on public.document_analyses
for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert own analyses" on public.document_analyses;
-- Política de inserção: só permite salvar uma análise vinculada ao usuário autenticado.
create policy "Users can insert own analyses" on public.document_analyses
for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can delete own analyses" on public.document_analyses;
-- Política de exclusão: só permite apagar análises pertencentes ao usuário autenticado.
create policy "Users can delete own analyses" on public.document_analyses
for delete to authenticated using (auth.uid() = user_id);
