import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm";

const SUPABASE_URL = "https://unhbtzfscyiqasepodpj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_oBGnnbEX3WFB8Owl2l1x2g_HJGiX5qs";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const $ = (id) => document.getElementById(id);
const authModal = $("authModal");
const postModal = $("postModal");
const authForm = $("authForm");
const postForm = $("postForm");
let authMode = "login";
let currentUser = null;
let generatedPost = null;

function openModal(modal) {
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function prettyDate(value) {
  if (!value) return "Sem data";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sem data" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function combinedCaption(data) {
  const parts = [data.caption?.trim()];
  if (data.cta?.trim()) parts.push(data.cta.trim());
  if (Array.isArray(data.hashtags) && data.hashtags.length) parts.push(data.hashtags.join(" "));
  return parts.filter(Boolean).join("\n\n");
}

function setAuthUI() {
  if (currentUser) {
    $("userStatus").textContent = currentUser.email || "Conectado";
    $("authButton").textContent = "Sair";
  } else {
    $("userStatus").textContent = "Não conectado";
    $("authButton").textContent = "Entrar";
  }
}

async function refreshDashboard() {
  if (!currentUser) {
    $("todayCount").textContent = "0";
    $("groupCount").textContent = "0";
    $("draftCount").textContent = "0";
    $("publishedCount").textContent = "0";
    renderQueue([]);
    return;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [postsRes, groupsRes] = await Promise.all([
    supabase.from("posts").select("id,title,caption,image_url,suggested_at,status,created_at").order("created_at", { ascending: false }),
    supabase.from("groups").select("id", { count: "exact", head: true })
  ]);

  if (postsRes.error) {
    toast("Não consegui carregar os posts. Verifique sua sessão.");
    return;
  }

  const posts = postsRes.data || [];
  $("groupCount").textContent = String(groupsRes.count || 0);
  $("draftCount").textContent = String(posts.filter(p => p.status === "draft").length);
  $("publishedCount").textContent = String(posts.filter(p => p.status === "published").length);
  $("todayCount").textContent = String(posts.filter(p => p.suggested_at && new Date(p.suggested_at) >= todayStart && new Date(p.suggested_at) < tomorrow).length);
  renderQueue(posts);
}

function renderQueue(posts) {
  const queue = $("queue");
  if (!posts.length) {
    queue.className = "empty";
    queue.innerHTML = '<div class="emptyIcon">📝</div><h3>Nenhum post preparado ainda</h3><p>Escolha um tema e deixe a IA preparar a primeira publicação.</p><button class="primary" id="firstPost">Criar primeiro post</button>';
    $("firstPost").addEventListener("click", openPostFlow);
    return;
  }

  queue.className = "queueList";
  queue.innerHTML = "";
  posts.slice(0, 12).forEach(post => {
    const item = document.createElement("div");
    item.className = "postItem";
    item.innerHTML = `
      <div class="postMain">
        ${post.image_url ? `<img class="postThumb" src="${post.image_url}" alt="">` : '<div class="postThumb"></div>'}
        <div class="postInfo"><h3></h3><p></p></div>
      </div>
      <span class="status"></span>`;
    item.querySelector("h3").textContent = post.title || "Post sem título";
    item.querySelector("p").textContent = `${prettyDate(post.suggested_at || post.created_at)} · ${post.status === "published" ? "Publicado" : "Rascunho"}`;
    item.querySelector(".status").textContent = post.status === "published" ? "Publicado" : "Rascunho";
    queue.appendChild(item);
  });
}

function openAuth(mode = "login") {
  authMode = mode;
  $("authTitle").textContent = mode === "login" ? "Entrar" : "Criar conta";
  $("authSubtitle").textContent = mode === "login" ? "Entre para criar e salvar seus conteúdos." : "Crie seu acesso ao Gestor de Posts.";
  $("authSubmit").textContent = mode === "login" ? "Entrar" : "Criar conta";
  $("toggleAuthMode").textContent = mode === "login" ? "Criar conta" : "Já tenho conta";
  $("authMessage").textContent = "";
  openModal(authModal);
  setTimeout(() => $("authEmail").focus(), 50);
}

async function handleAuth(event) {
  event.preventDefault();
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  $("authMessage").textContent = "Aguarde…";
  $("authSubmit").disabled = true;

  const result = authMode === "login"
    ? await supabase.auth.signInWithPassword({ email, password })
    : await supabase.auth.signUp({ email, password });

  $("authSubmit").disabled = false;

  if (result.error) {
    $("authMessage").textContent = result.error.message;
    return;
  }

  if (authMode === "signup" && !result.data.session) {
    $("authMessage").textContent = "Conta criada. Se o Supabase pedir confirmação de e-mail, confirme e depois entre aqui.";
    return;
  }

  closeModal(authModal);
  authForm.reset();
  toast("Login realizado. ✨");
}

async function logout() {
  await supabase.auth.signOut();
  currentUser = null;
  setAuthUI();
  refreshDashboard();
  toast("Você saiu da conta.");
}

function openPostFlow() {
  if (!currentUser) {
    openAuth("login");
    return;
  }
  $("preview").classList.add("hidden");
  $("postForm").reset();
  generatedPost = null;
  openModal(postModal);
  setTimeout(() => $("postTopic").focus(), 50);
}

async function generatePost() {
  const topic = $("postTopic").value.trim();
  const instruction = $("postInstruction").value.trim();
  if (!topic) return;

  const button = $("generateButton");
  button.disabled = true;
  button.textContent = "✨ Criando legenda e imagem…";
  $("preview").classList.remove("hidden");
  $("generationStatus").textContent = "Gerando…";
  $("imageLoading").classList.remove("hidden");
  $("generatedImage").removeAttribute("src");
  $("previewTitle").value = "";
  $("previewCaption").value = "";

  const { data, error } = await supabase.functions.invoke("generate-post", {
    body: { topic, instruction }
  });

  button.disabled = false;
  button.textContent = "✨ Gerar legenda + imagem";
  $("imageLoading").classList.add("hidden");

  if (error) {
    $("generationStatus").textContent = "Erro";
    toast(error.message || "Não foi possível gerar o post.");
    return;
  }

  if (!data?.image_url || !data?.caption) {
    $("generationStatus").textContent = "Erro";
    toast(data?.error || "A IA não retornou um post completo.");
    return;
  }

  generatedPost = data;
  $("previewTitle").value = data.title || "";
  $("previewCaption").value = combinedCaption(data);
  $("generatedImage").src = data.image_url;
  $("generationStatus").textContent = "Gerado pela IA";
}

async function savePost(status) {
  if (!generatedPost) {
    toast("Gere um conteúdo primeiro. ✨");
    return;
  }

  const title = $("previewTitle").value.trim();
  const caption = $("previewCaption").value.trim();
  const suggestedAt = $("postDate").value ? new Date($("postDate").value).toISOString() : null;

  if (!title || !caption) {
    toast("Preencha o título e a legenda antes de salvar.");
    return;
  }

  const { error } = await supabase.from("posts").insert({
    title,
    caption,
    image_url: generatedPost.image_url,
    suggested_at: suggestedAt,
    status
  });

  if (error) {
    toast("Não foi possível salvar: " + error.message);
    return;
  }

  closeModal(postModal);
  generatedPost = null;
  await refreshDashboard();
  toast(status === "ready" ? "Post adicionado à fila. ✨" : "Rascunho salvo. ✨");
}

$("authButton").addEventListener("click", () => currentUser ? logout() : openAuth("login"));
$("closeAuth").addEventListener("click", () => closeModal(authModal));
$("toggleAuthMode").addEventListener("click", () => openAuth(authMode === "login" ? "signup" : "login"));
authForm.addEventListener("submit", handleAuth);

$("newPost").addEventListener("click", openPostFlow);
$("firstPost").addEventListener("click", openPostFlow);
$("closeModal").addEventListener("click", () => closeModal(postModal));
$("generateButton").addEventListener("click", (event) => {
  event.preventDefault();
  generatePost();
});
$("regenerate").addEventListener("click", generatePost);
$("saveDraft").addEventListener("click", () => savePost("draft"));
$("addQueue").addEventListener("click", () => savePost("ready"));
$("refreshPosts").addEventListener("click", refreshDashboard);

document.querySelectorAll("[data-topic]").forEach(button => {
  button.addEventListener("click", () => {
    $("postTopic").value = button.dataset.topic;
    $("postTopic").focus();
  });
});

[authModal, postModal].forEach(modal => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal(modal);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (authModal.classList.contains("open")) closeModal(authModal);
  if (postModal.classList.contains("open")) closeModal(postModal);
});

supabase.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user || null;
  setAuthUI();
  refreshDashboard();
});

const { data: sessionData } = await supabase.auth.getSession();
currentUser = sessionData.session?.user || null;
setAuthUI();
await refreshDashboard();
