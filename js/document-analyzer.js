(() => {
  // Lê a configuração pública definida em js/config.js.
  const CONFIG = window.DOCUMIND_CONFIG || {};
  // Identificador do modelo enviado como referência ao backend; a seleção efetiva dos modelos ocorre na Edge Function.
  const MODEL = "openai/gpt-oss-20b";
  // Quantidade máxima de caracteres que o navegador envia à função em uma única análise.
  const MAX_TEXT_CHARS = 45000;
  // Tempo máximo de espera do navegador pela resposta da Edge Function (120 segundos).
  const FUNCTION_TIMEOUT_MS = 120000;

  // Confere se a URL do Supabase e a Publishable Key foram preenchidas antes de iniciar uma chamada remota.
  function configError() {
    if (!CONFIG.supabaseUrl || CONFIG.supabaseUrl.includes("SEU_PROJECT_REF")) {
      throw new Error("Configure a URL do projeto Supabase em js/config.js.");
    }
    if (!CONFIG.supabaseAnonKey || CONFIG.supabaseAnonKey.includes("SUA_PUBLISHABLE_KEY")) {
      throw new Error("Configure a Publishable Key em js/config.js.");
    }
  }

  // Extrai texto de TXT diretamente e de PDF usando PDF.js. Não faz OCR de PDFs que sejam apenas imagens.
  async function extractText(file) {
    if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
      return await file.text();
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Formato não suportado. Envie um arquivo PDF ou TXT.");
    }
    if (!window.pdfjsLib) throw new Error("Não foi possível carregar o leitor de PDF. Atualize a página e tente novamente.");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => item.str || "").join(" "));
    }
    const text = pages.join("\n\n").trim();
    if (!text) throw new Error("Não encontramos texto selecionável neste PDF. PDFs digitalizados como imagem precisam de OCR, que ainda não está incluído nesta versão.");
    return text;
  }

  // Traduz códigos HTTP e mensagens da Edge Function em explicações mais claras para quem está usando o site.
  function friendlyError(status, payload) {
    const message = payload?.error || payload?.message || "";
    if (status === 401 || status === 403) return "A função recusou a chamada. Confira a configuração da chave pública e a publicação da Edge Function.";
    if (status === 429) return "O limite de requisições foi atingido. Aguarde um pouco antes de tentar novamente.";
    if (status === 503 || status === 502) return message || "O serviço Groq está temporariamente indisponível. Aguarde e tente novamente.";
    if (status === 504) return "A análise demorou mais que o limite permitido. Tente um documento menor.";
    if (status === 413) return "O documento é muito grande para esta versão. Envie um arquivo menor.";
    return message || `Não foi possível concluir a análise (HTTP ${status}).`;
  }

  // Fluxo principal do navegador: extrai texto, limita o conteúdo, chama a Edge Function e valida o resultado recebido.
  async function analyze(file, analysisType, onProgress, signal) {
    configError();
    onProgress?.({ percent: 12, title: "Lendo documento", message: "Extraindo o texto do arquivo…" });
    const text = await extractText(file);
    if (text.length < 30) throw new Error("O documento contém pouco texto para uma análise confiável.");
    const clipped = text.slice(0, MAX_TEXT_CHARS);
    onProgress?.({ percent: 28, title: "Preparando análise", message: text.length > MAX_TEXT_CHARS ? "O documento é extenso. Vamos analisar o trecho inicial permitido…" : "Organizando o conteúdo para a IA…" });

    const base = CONFIG.supabaseUrl.replace(/\/+$/, "");
    const endpoint = `${base}/functions/v1/analyze-document`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("Tempo limite excedido")), FUNCTION_TIMEOUT_MS);
    const abort = () => controller.abort(signal?.reason || new Error("Análise cancelada"));
    signal?.addEventListener("abort", abort, { once: true });

    try {
      onProgress?.({ percent: 42, title: "Analisando conteúdo", message: "Enviando o texto para o motor de IA…" });
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": CONFIG.supabaseAnonKey
        },
        body: JSON.stringify({
          text: clipped,
          fileName: file.name,
          analysisType,
          truncated: text.length > MAX_TEXT_CHARS,
          model: MODEL
        }),
        signal: controller.signal
      });
      let payload = {};
      try { payload = await response.json(); } catch { payload = {}; }
      if (!response.ok) throw new Error(friendlyError(response.status, payload));
      if (!payload.analysis || !payload.analysis.summary) throw new Error("A IA respondeu, mas o formato do resultado veio incompleto. Tente novamente.");
      onProgress?.({ percent: 92, title: "Organizando resultado", message: "Finalizando os dados da análise…" });
      return { ...payload.analysis, model: payload.model || MODEL, truncated: Boolean(payload.truncated), fileName: file.name };
    } catch (error) {
      if (error.name === "AbortError") {
        if (signal?.aborted) throw new Error("Análise cancelada.");
        throw new Error("A análise excedeu o tempo limite. Tente novamente com um documento menor.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  window.DocuMindAnalyzer = { analyze, MODEL };
})();