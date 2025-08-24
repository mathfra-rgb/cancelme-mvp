"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../utils/supabase";

const supabase = createClient();

/* ----------------------------- Types ----------------------------- */
type MediaType = "image" | "video" | "youtube";
type PanelKey = "ranking" | "categories" | "identity" | "post" | null;

type Post = {
  id: string;
  user_id: string | null;
  caption: string | null;
  media_url: string | null;
  media_type: MediaType | null;
  is_anonymous: boolean | null;
  display_name?: string | null;
  username?: string | null;
  tags?: string[] | null;
  score?: number | null;
  lol?: number | null;
  cringe?: number | null;
  wtf?: number | null;
  genius?: number | null;
  views?: number | null;
  created_at?: string | null;
  hidden?: boolean | null;
};

type Comment = {
  id: string;
  post_id: string;
  content: string;
  display_name?: string | null;
  created_at?: string | null;
};

/* --------------------------- Constantes -------------------------- */
const POPULAR_TAGS = ["gaming", "lol", "cringe", "wtf", "genius", "travail", "food", "tech"];
const CHALLENGE_OF_DAY = "Ton moment le plus cringe de la semaine #cringe";

/* --------------------------- Helpers ----------------------------- */
function cn(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function isYouTubeUrl(url: string) {
  try {
    const u = new URL(url);
    return u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be");
  } catch {
    return false;
  }
}

function youtubeEmbedSrc(url: string) {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith("/shorts/")) {
      const id = u.pathname.split("/")[2];
      return `https://www.youtube.com/embed/${id}`;
    }
    if (u.pathname === "/watch") {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.replace("/", "");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch {}
  return "";
}

function markViewedOncePerSession(postId: string) {
  if (typeof window === "undefined") return false;
  const key = `cm:viewed:${postId}`;
  if (sessionStorage.getItem(key)) return false;
  sessionStorage.setItem(key, "1");
  return true;
}

/* ---------------------------- Page ------------------------------- */
export default function Home() {
  // Panneaux
  const [openPanel, setOpenPanel] = useState<PanelKey>(null);

  // Classement (client-side period filter)
  const [rankRange, setRankRange] = useState<"day" | "week" | "month">("day");

  // Catégories
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState("");

  // Identité
  const [useAnonymous, setUseAnonymous] = useState<boolean>(true);
  const [publicName, setPublicName] = useState<string>("");

  // Nouveau post
  const [caption, setCaption] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [hashtags, setHashtags] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  // Données
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  // Commentaires
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<string, Comment[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});

  /* ------------------------- Chargement feed ------------------------- */
  useEffect(() => {
    loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFirstPage() {
    setLoading(true);
    const { data, error } = await supabase
      .from("posts_with_profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetch posts error", error);
      setPosts([]);
    } else {
      setPosts((data as unknown as Post[]) || []);
    }
    setLoading(false);
  }

  /* ----------------------------- Vues ------------------------------ */
  async function incrementView(post: Post) {
    if (!post.id) return;
    if (markViewedOncePerSession(post.id)) {
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, views: (p.views ?? 0) + 1 } : p)));
      try {
        await supabase.rpc("increment_view", { pid: post.id, delta: 1 });
      } catch {}
    }
  }

  /* --------------------------- Réactions --------------------------- */
  async function react(post: Post, kind: "lol" | "cringe" | "wtf" | "genius") {
    if (!post.id) return;
    // UI optimiste
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              [kind]: (Number(p[kind] ?? 0) + 1) as number,
              score: (Number(p.score ?? 0) + 1) as number,
            }
          : p
      )
    );

    try {
      await supabase.from("reactions").insert({ post_id: post.id, user_id: null, kind } as any);
      await supabase.rpc("increment_post_score", { pid: post.id, delta: 1 });
    } catch (e) {
      console.warn("reaction error", e);
    }
  }

  /* ---------------------------- Partage ---------------------------- */
  async function sharePost(p: Post) {
    const url = `${location.origin}/post/${p.id}`;
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({ url, title: "CancelMe", text: p.caption || "" });
      } else {
        await navigator.clipboard.writeText(url);
        alert("Lien copié !");
      }
    } catch {}
  }

  /* ---------------------------- Report ----------------------------- */
  async function reportPost(p: Post) {
    if (!confirm("Signaler ce contenu ?")) return;
    try {
      await supabase.from("reports").insert({ post_id: p.id, reason: "user_report" } as any);
      alert("Merci pour le signalement.");
    } catch (e) {
      console.warn(e);
      alert("Impossible de signaler pour le moment.");
    }
  }

  /* ----------------------------- Upload ---------------------------- */
  async function uploadToStorage(file: File): Promise<{ url: string; type: "image" | "video" }> {
    const ext = file.name.split(".").pop() || (file.type.startsWith("video") ? "mp4" : "jpg");
    const id = (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : String(Date.now());
    const path = `public/${id}.${ext}`;

    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: false, contentType: file.type });
    if (error) {
      console.error("Upload error details:", error);
      throw error;
    }
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    return { url: data.publicUrl, type: file.type.startsWith("video") ? "video" : "image" };
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) {
      alert("Fichier trop volumineux (max 50 Mo).");
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadToStorage(f);
      setMediaUrl(url);
      setOpenPanel("post");
    } catch {
      alert("Upload impossible (vérifie le bucket 'media').");
    } finally {
      setUploading(false);
    }
  }

  /* --------------------------- Nouveau post ------------------------- */
  function parseTags(input: string): string[] {
    return Array.from(
      new Set(
        input
          .split(/[\s,]+/)
          .map((t) => t.trim().replace(/^#/, ""))
          .filter(Boolean)
          .slice(0, 8)
      )
    );
  }

  async function addPost() {
    if (!caption && !mediaUrl) {
      alert("Ajoute un texte ou un média.");
      return;
    }

    const mt: MediaType =
      mediaUrl && isYouTubeUrl(mediaUrl)
        ? "youtube"
        : mediaUrl && /\.(mp4|webm|mov)$/i.test(mediaUrl)
        ? "video"
        : mediaUrl
        ? "image"
        : "image";

    const payload: Partial<Post> = {
      caption: caption || "",
      media_url: mediaUrl || "",
      media_type: mt,
      is_anonymous: useAnonymous,
      display_name: useAnonymous ? null : publicName || "User",
      tags: parseTags(hashtags),
      score: 0,
      lol: 0,
      cringe: 0,
      wtf: 0,
      genius: 0,
      views: 0,
    };

    const { data, error } = await supabase.from("posts").insert(payload as any).select("*").single();
    if (error) {
      console.error("Erreur ajout post :", error);
      alert("Impossible d’ajouter le post.");
      return;
    }

    setCaption("");
    setMediaUrl("");
    setHashtags("");
    setOpenPanel(null);
    setPosts((prev) => [data as Post, ...prev]);
  }

  /* --------------------------- Commentaires ------------------------- */
  async function toggleComments(postId: string) {
    setOpenComments((prev) => ({ ...prev, [postId]: !prev[postId] }));
    if (!commentsByPost[postId]) {
      const { data } = await supabase.from("comments").select("*").eq("post_id", postId).order("created_at", { ascending: true });
      setCommentsByPost((prev) => ({ ...prev, [postId]: (data as Comment[]) || [] }));
    }
  }

  async function addComment(postId: string) {
    const content = (newComment[postId] || "").trim();
    if (!content) return;
    const payload = { post_id: postId, content, display_name: useAnonymous ? "Anonyme" : publicName || "User" };

    // Optimiste
    const temp: Comment = {
      id: `temp-${Date.now()}`,
      post_id: postId,
      content,
      display_name: payload.display_name,
      created_at: new Date().toISOString(),
    };
    setCommentsByPost((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), temp] }));
    setNewComment((prev) => ({ ...prev, [postId]: "" }));

    try {
      const { data } = await supabase.from("comments").insert(payload as any).select("*").single();
      if (data) {
        setCommentsByPost((prev) => ({
          ...prev,
          [postId]: [...(prev[postId] || []).filter((c) => !c.id.startsWith("temp-")), data as Comment],
        }));
      }
    } catch (e) {
      console.warn(e);
    }
  }

  /* -------------------------- Filtrage client ----------------------- */
  const filteredPosts = useMemo(() => {
    let arr = posts.filter((p) => !p.hidden);

    // Tags
    if (selectedTag) {
      arr = arr.filter((p) => (p.tags || []).includes(selectedTag));
    }

    // Période
    const now = Date.now();
    const ms = rankRange === "day" ? 24 * 3600 * 1000 : rankRange === "week" ? 7 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
    arr = arr.filter((p) => {
      if (!p.created_at) return true;
      const t = new Date(p.created_at).getTime();
      return now - t <= ms;
    });

    // Tri par score
    return arr.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  }, [posts, selectedTag, rankRange]);

  /* ------------------------------ UI ------------------------------- */
  return (
    <div className="min-h-screen">
      {/* BARRE COMPACTE */}
      <div className="sticky top-14 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-100 dark:border-gray-800">
        <div className="mx-auto max-w-4xl px-4 py-2 flex flex-wrap gap-2">
          <button
            onClick={() => setOpenPanel((o) => (o === "ranking" ? null : "ranking"))}
            className={cn(
              "px-3 py-1.5 rounded border text-sm",
              openPanel === "ranking"
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700"
            )}
            title="Classement"
          >
            🏆 Classement
          </button>

          <button
            onClick={() => setOpenPanel((o) => (o === "categories" ? null : "categories"))}
            className={cn(
              "px-3 py-1.5 rounded border text-sm",
              openPanel === "categories"
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700"
            )}
            title="Catégories"
          >
            # Catégories
          </button>

          <button
            onClick={() => setOpenPanel((o) => (o === "identity" ? null : "identity"))}
            className={cn(
              "px-3 py-1.5 rounded border text-sm",
              openPanel === "identity"
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700"
            )}
            title="Pseudo / Anonyme"
          >
            👤 Pseudo
          </button>

          <button
            onClick={() => setOpenPanel((o) => (o === "post" ? null : "post"))}
            className={cn(
              "px-3 py-1.5 rounded border text-sm",
              openPanel === "post"
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700"
            )}
            title="Nouveau post"
          >
            ➕ Nouveau post
          </button>
        </div>

        {/* PANNEAUX */}
        <div className="mx-auto max-w-4xl px-4 pb-3">
          {/* Ranking */}
          {openPanel === "ranking" && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-800">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium text-gray-900 dark:text-gray-100">Période :</span>

                <label className="flex items-center gap-2 text-gray-800 dark:text-gray-100">
                  <input
                    type="radio"
                    name="rankRange"
                    value="day"
                    checked={rankRange === "day"}
                    onChange={() => setRankRange("day")}
                  />
                  Jour
                </label>

                <label className="flex items-center gap-2 text-gray-800 dark:text-gray-100">
                  <input
                    type="radio"
                    name="rankRange"
                    value="week"
                    checked={rankRange === "week"}
                    onChange={() => setRankRange("week")}
                  />
                  Semaine
                </label>

                <label className="flex items-center gap-2 text-gray-800 dark:text-gray-100">
                  <input
                    type="radio"
                    name="rankRange"
                    value="month"
                    checked={rankRange === "month"}
                    onChange={() => setRankRange("month")}
                  />
                  Mois
                </label>
              </div>
            </div>
          )}

          {/* Categories */}
          {openPanel === "categories" && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-800">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {POPULAR_TAGS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setSelectedTag((prev) => (prev === t ? null : t))}
                      className={cn(
                        "px-3 py-1.5 rounded border text-sm",
                        selectedTag === t
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                      )}
                    >
                      #{t}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={tagQuery}
                    onChange={(e) => setTagQuery(e.target.value)}
                    placeholder="Rechercher un #tag"
                    className="flex-1 min-w-0 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                  <button
                    onClick={() => setSelectedTag(tagQuery.replace(/^#/, "").trim() || null)}
                    className="px-3 py-2 rounded bg-gray-900 text-white hover:bg-black text-sm"
                  >
                    Appliquer
                  </button>
                  {selectedTag && (
                    <button
                      onClick={() => setSelectedTag(null)}
                      className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 text-sm text-gray-800 dark:text-gray-100"
                    >
                      Effacer
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Identity */}
          {openPanel === "identity" && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-800">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100">
                  <input type="checkbox" checked={useAnonymous} onChange={(e) => setUseAnonymous(e.target.checked)} />
                  Poster en anonyme
                </label>
                {!useAnonymous && (
                  <input
                    value={publicName}
                    onChange={(e) => setPublicName(e.target.value)}
                    placeholder="Ton pseudo public"
                    className="flex-1 min-w-0 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                )}
              </div>
            </div>
          )}

          {/* Nouveau post */}
          {openPanel === "post" && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-800">
              <div className="flex flex-col gap-3">
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder={CHALLENGE_OF_DAY}
                  className="w-full min-h-[80px] px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
                <input
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="Lien image / vidéo (ou YouTube)"
                  className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  {/* Bouton import + input caché */}
                  <label
                    htmlFor="file-input"
                    className="px-3 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white rounded cursor-pointer text-sm hover:bg-gray-300 dark:hover:bg-gray-500"
                  >
                    📂 Importer un fichier
                  </label>
                  <input
                    id="file-input"
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={onPickFile}
                    className="hidden"
                  />

                  <input
                    value={hashtags}
                    onChange={(e) => setHashtags(e.target.value)}
                    placeholder="#gaming #lol (jusqu'à 8)"
                    className="flex-1 min-w-0 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                  <button
                    onClick={addPost}
                    disabled={uploading}
                    className="px-4 py-2 rounded bg-gray-900 text-white hover:bg-black disabled:opacity-60"
                  >
                    {uploading ? "Upload..." : "Publier"}
                  </button>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Astuce : upload ≤ 50 Mo, ou colle un lien YouTube (shorts/watch).
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FEED */}
      <div className="mx-auto max-w-4xl px-4 py-6">
        {loading ? (
          <p className="text-gray-700 dark:text-gray-300">Chargement…</p>
        ) : filteredPosts.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-100 dark:border-gray-800">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Sois le 1er à cancel quelque chose aujourd’hui</h3>
            <p className="mt-1 text-gray-600 dark:text-gray-300">Inspire-toi d’un prompt 👇</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setCaption("Le move le plus cringe que j’ai vu aujourd’hui :");
                  setHashtags("#cringe");
                  setOpenPanel("post");
                }}
                className="px-3 py-2 rounded bg-gray-900 text-white hover:bg-black text-sm"
              >
                #cringe
              </button>
              <button
                onClick={() => {
                  setCaption("Mon play du jour :");
                  setHashtags("#gaming #lol");
                  setOpenPanel("post");
                }}
                className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100 text-sm"
              >
                #gaming
              </button>
              <button
                onClick={() => {
                  setCaption("Le truc le plus WTF que j’ai vu :");
                  setHashtags("#wtf");
                  setOpenPanel("post");
                }}
                className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100 text-sm"
              >
                #wtf
              </button>
              <button
                onClick={() => {
                  setCaption(CHALLENGE_OF_DAY);
                  setHashtags("#cringe");
                  setOpenPanel("post");
                }}
                className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm"
              >
                🎯 Défi du jour
              </button>
            </div>
          </div>
        ) : (
          <ul className="space-y-4">
            {filteredPosts.map((post) => (
              <li key={post.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-100 dark:border-gray-800">
                {/* En-tête */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    {post.is_anonymous ? "🤫 Anonyme" : post.display_name || post.username || "Utilisateur"}
                    {post.tags && post.tags.length > 0 && (
                      <span className="ml-2 text-xs text-gray-500">{post.tags.slice(0, 4).map((t) => `#${t}`).join(" ")}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">Score: {post.score ?? 0} • Vues: {post.views ?? 0}</div>
                </div>

                {/* Légende */}
                {post.caption && <p className="mt-2 text-gray-900 dark:text-gray-100">{post.caption}</p>}

                {/* Média */}
                {post.media_url && post.media_type === "image" && (
                  <img
                    src={post.media_url}
                    alt=""
                    loading="lazy"
                    className="mt-3 rounded"
                    onLoad={() => incrementView(post)}
                  />
                )}
                {post.media_url && post.media_type === "video" && (
                  <video
                    src={post.media_url}
                    controls
                    className="mt-3 rounded w-full"
                    onPlay={() => incrementView(post)}
                  />
                )}
                {post.media_url && post.media_type === "youtube" && (
                  <div className="mt-3 aspect-video w-full">
                    <iframe
                      className="w-full h-full rounded"
                      src={youtubeEmbedSrc(post.media_url)}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      onLoad={() => incrementView(post)}
                    />
                  </div>
                )}

                {/* Réactions */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => react(post, "lol")}
                    className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm text-gray-800 dark:text-white"
                  >
                    😂 LOL {Number(post.lol ?? 0) > 0 ? `(${post.lol})` : ""}
                  </button>
                  <button
                    onClick={() => react(post, "cringe")}
                    className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm text-gray-800 dark:text-white"
                  >
                    😬 Cringe {Number(post.cringe ?? 0) > 0 ? `(${post.cringe})` : ""}
                  </button>
                  <button
                    onClick={() => react(post, "wtf")}
                    className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm text-gray-800 dark:text-white"
                  >
                    🤯 WTF {Number(post.wtf ?? 0) > 0 ? `(${post.wtf})` : ""}
                  </button>
                  <button
                    onClick={() => react(post, "genius")}
                    className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm text-gray-800 dark:text-white"
                  >
                    🧠 Genius {Number(post.genius ?? 0) > 0 ? `(${post.genius})` : ""}
                  </button>
                </div>

                {/* Actions */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => sharePost(post)}
                    className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Partager
                  </button>
                  <a
                    href={`/post/${post.id}`}
                    className="px-3 py-2 text-sm rounded bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 border-0"
                  >
                    Ouvrir la page
                  </a>
                  <button
                    onClick={() => reportPost(post)}
                    className="px-3 py-2 text-sm rounded border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/30"
                  >
                    Signaler
                  </button>
                </div>

                {/* Commentaires */}
                <div className="mt-4">
                  <button
                    onClick={() => toggleComments(post.id)}
                    className="text-sm text-gray-700 dark:text-gray-300 underline"
                  >
                    {openComments[post.id] ? "Masquer les commentaires" : "Afficher les commentaires"}
                  </button>

                  {openComments[post.id] && (
                    <div className="mt-3 space-y-3">
                      <div className="space-y-2">
                        {(commentsByPost[post.id] || []).map((c) => (
                          <div key={c.id} className="text-sm bg-gray-50 dark:bg-gray-700/50 rounded p-2 text-gray-800 dark:text-white">
                            <span className="font-medium">{c.display_name || "Anonyme"}: </span>
                            <span>{c.content}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          value={newComment[post.id] || ""}
                          onChange={(e) => setNewComment((prev) => ({ ...prev, [post.id]: e.target.value }))}
                          placeholder="Écrire un commentaire…"
                          className="flex-1 min-w-0 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        />
                        <button
                          onClick={() => addComment(post.id)}
                          className="px-3 py-2 bg-gray-900 text-white rounded hover:bg-black"
                        >
                          Publier
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
