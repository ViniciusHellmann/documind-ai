(() => {
  const $ = id => document.getElementById(id);
  const views = ["analyze", "history", "settings"];
  let selectedFile = null;
  let activeController = null;
  let progressTimer = null;
  let currentProgress = 10;
  const HISTORY_KEY = "documind_history_v2";

  function bytes(size) { return size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(2)} MB`; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c])); }
  function getHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; } }
  function saveHistory(item) { const list = getHistory(); list.unshift(item); localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 30))); }
  function setView(name) {
    views.forEach(view => $(`view-${view}`).classList.toggle("active", view === name));
    document.querySelectorAll(".nav-link[data-view]").forEach(btn => btn.classList.toggle("active", btn.dataset.view === name));
    $("crumb").textContent = name === "analyze" ? "Nova análise" : name === "history" ? "Histórico" : "Configurações";
    if (name === "history") renderHistory();
    if (name === "settings") renderSettings();
    $("sidebar").classList.remove("open");
  }
  function chooseFile(file) {
    $("error-box").classList.add("hidden");
    if (!file) return;
    const valid = file.type === "application/pdf" || file.type === "text/plain" || /\.(pdf|txt)$/i.test(file.name);
    if (!valid) return showError("Formato não suportado. Selecione um PDF ou TXT.");
    if (file.size > 10 * 1024 * 1024) return showError("O arquivo ultrapassa o limite de 10 MB.");
    selectedFile = file;
    $("file-name").textContent = file.name;
    $("file-size").textContent = bytes(file.size);
    $("file-type").textContent = file.name.toLowerCase().endsWith(".pdf") ? "PDF" : "TXT";
    $("file-card").classList.remove("hidden");
    $("analyze-button").disabled = false;
    $("result-panel").classList.add("hidden");
  }
  function showError(message) { $("error-box").textContent = message; $("error-box").classList.remove("hidden"); }
  function setProgress(percent, title, message) {
    currentProgress = Math.max(currentProgress, Math.min(percent, 96));
    $("progress-bar").style.width = `${currentProgress}%`;
    $("progress-label").textContent = `Processando documento · ${Math.round(currentProgress)}%`;
    if (title) $("loading-title").textContent = title;
    if (message) $("loading-message").textContent = message;
  }
  function startProgress() {
    currentProgress = 10;
    setProgress(10, "Lendo seu documento", "Preparando o conteúdo para análise…");
    progressTimer = setInterval(() => {
      if (currentProgress < 78) setProgress(currentProgress + 2, "Analisando conteúdo", "A IA está interpretando as informações…");
      else if (currentProgress < 88) setProgress(currentProgress + 0.5, "Quase lá", "Organizando os pontos mais importantes…");
    }, 1200);
    $("loading-overlay").classList.remove("hidden");
  }
  function stopProgress() { clearInterval(progressTimer); progressTimer = null; $("loading-overlay").classList.add("hidden"); }
  function listItems(items, fallback) {
    const values = Array.isArray(items) && items.length ? items : [fallback];
    return values.map(item => `<li>${escapeHtml(item)}</li>`).join("");
  }
  function renderResult(data, fileName) {
    $("result-title").textContent = fileName;
    $("result-subtitle").textContent = `Analisado com ${data.model || "Gemini"}${data.truncated ? " · conteúdo inicial do documento" : ""}`;
    $("summary-text").textContent = data.summary || "Não foi gerado resumo.";
    const tags = Array.isArray(data.classification) ? data.classification : [data.classification || "Documento"];
    $("classification").innerHTML = tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
    $("attention-list").innerHTML = listItems(data.attentionPoints, "Nenhum ponto de atenção específico identificado.");
    $("actions-list").innerHTML = listItems(data.nextSteps, "Revise o documento e valide as informações.");
    const extracted = data.extractedInfo && typeof data.extractedInfo === "object" ? data.extractedInfo : {};
    const rows = Object.entries(extracted);
    $("extracted-table").innerHTML = rows.length ? rows.map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(Array.isArray(value) ? value.join(", ") : value)}</td></tr>`).join("") : `<tr><td colspan="2">Nenhuma informação estruturada foi identificada.</td></tr>`;
    $("result-panel").classList.remove("hidden");
    $("result-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function runAnalysis() {
    if (!selectedFile) return;
    $("error-box").classList.add("hidden");
    $("analyze-button").disabled = true;
    activeController = new AbortController();
    startProgress();
    const fileName = selectedFile.name;
    try {
      const result = await window.DocuMindAnalyzer.analyze(selectedFile, $("analysis-type").value, p => setProgress(p.percent, p.title, p.message), activeController.signal);
      setProgress(100, "Análise concluída", "Seu documento foi processado.");
      const record = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), fileName, createdAt: new Date().toISOString(), analysis: result };
      saveHistory(record);
      renderResult(result, fileName);
      await new Promise(resolve => setTimeout(resolve, 350));
    } catch (error) {
      if (error.message !== "Análise cancelada.") showError(error.message || "Não foi possível analisar o documento.");
      else showError("Análise cancelada.");
    } finally {
      stopProgress();
      activeController = null;
      $("analyze-button").disabled = !selectedFile;
    }
  }
  function renderHistory() {
    const list = getHistory();
    $("history-count").textContent = list.length ? `${list.length} análise(s) armazenada(s) neste navegador.` : "Nenhuma análise salva ainda.";
    $("history-list").innerHTML = list.length ? list.map(item => `<div class="history-item"><div class="history-file">${/\.pdf$/i.test(item.fileName) ? "PDF" : "TXT"}</div><div><strong>${escapeHtml(item.fileName)}</strong><small>${new Date(item.createdAt).toLocaleString("pt-BR")} · ${escapeHtml(item.analysis?.classification?.[0] || "Análise")}</small></div><button class="history-open" data-open="${escapeHtml(item.id)}">Ver análise</button></div>`).join("") : `<div class="empty-state">✧<br><br>Suas análises aparecerão aqui depois do primeiro documento processado.</div>`;
    document.querySelectorAll("[data-open]").forEach(btn => btn.addEventListener("click", () => {
      const item = getHistory().find(entry => entry.id === btn.dataset.open);
      if (item) { setView("analyze"); renderResult(item.analysis, item.fileName); }
    }));
  }
  function renderSettings() {
    const c = window.DOCUMIND_CONFIG || {};
    const configured = c.supabaseUrl && !c.supabaseUrl.includes("SEU_PROJECT_REF");
    $("setting-url").textContent = configured ? c.supabaseUrl : "Não configurada";
    $("url-status").textContent = configured ? "Configurada" : "Pendente";
    $("key-status").textContent = c.supabaseAnonKey && !c.supabaseAnonKey.includes("SUA_PUBLISHABLE_KEY") ? "Configurada" : "Pendente";
    $("engine-status").textContent = configured && c.supabaseAnonKey ? "Configuração preenchida" : "Configuração pendente";
  }
  document.querySelectorAll(".nav-link[data-view]").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));
  $("mobile-menu").addEventListener("click", () => $("sidebar").classList.toggle("open"));
  $("file-input").addEventListener("change", e => chooseFile(e.target.files[0]));
  $("remove-file").addEventListener("click", () => { selectedFile = null; $("file-card").classList.add("hidden"); $("file-input").value = ""; $("analyze-button").disabled = true; });
  $("analyze-button").addEventListener("click", runAnalysis);
  $("dropzone").addEventListener("dragover", e => { e.preventDefault(); $("dropzone").classList.add("dragover"); });
  $("dropzone").addEventListener("dragleave", () => $("dropzone").classList.remove("dragover"));
  $("dropzone").addEventListener("drop", e => { e.preventDefault(); $("dropzone").classList.remove("dragover"); chooseFile(e.dataTransfer.files[0]); });
  $("cancel-analysis").addEventListener("click", () => activeController?.abort());
  $("new-analysis").addEventListener("click", () => { $("result-panel").classList.add("hidden"); $("error-box").classList.add("hidden"); window.scrollTo({top:0,behavior:"smooth"}); });
  $("history-new").addEventListener("click", () => setView("analyze"));
  $("clear-history").addEventListener("click", () => { if (confirm("Deseja apagar o histórico salvo neste navegador?")) { localStorage.removeItem(HISTORY_KEY); renderHistory(); } });
  document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setView("analyze"); $("file-input").click(); } });
  renderSettings();
})();