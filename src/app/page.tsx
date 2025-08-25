"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../utils/supabase";

const supabase = createClient();

/* ----------------------------- Types basiques ----------------------------- */
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

/* ------------------------------ Constantes UI ----------------------------- */
const POPULAR_TAGS = ["gaming", "lol", "cringe", "wtf", "genius", "travail", "food", "tech"];
const CHALLENGE_OF_DAY = "Ton moment le plus cringe de la semaine #cringe";

/* --------------------------- Anti-spam commentaires --------------------------- */
const COMMENT_WINDOW_GLOBAL_MS = 20_000;
const COMMENT_WINDOW_PER_POST_MS = 10_000;

function canCommentNow(postId: string) {
  if (typeof window === "undefined") return true;
  const now = Date.now();
  const gKey = "cm:comments:global";
  const pKey = `cm:comments:post:${postId}`;
  const gArr = JSON.parse(localStorage.getItem(gKey) || "[]") as number[];
  const pArr = JSON.parse(localStorage.getItem(pKey) || "[]") as number[];
  const gOk = gArr.filter((t) => now - t < COMMENT_WINDOW_GLOBAL_MS).length < 3;
  const pOk = pArr.filter((t) => now - t < COMMENT_WINDOW_PER_POST_MS).length < 2;
  return gOk && pOk;
}
function recordCommentEvent(postId: string) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const gKey = "cm:comments:global";
  const pKey = `cm:comments:post:${postId}`;
  const gArr = JSON.parse(localStorage.getItem(gKey) || "[]") as number[];
  const pArr = JSON.parse(localStorage.getItem(pKey) || "[]") as number[];
  gArr.push(now);
  pArr.push(now);
  localStorage.setItem(gKey, JSON.stringify(gArr));
  localStorage.setItem(pKey, JSON.stringify(pArr));
}

/* --------------------------- Anti-spam réactions --------------------------- */
const REACT_WINDOW_GLOBAL_MS = 10_000;
const REACT_WINDOW_PER_POST_MS = 5_000;

function canReactNow(postId: string) {
  if (typeof window === "undefined") return true;
  const now = Date.now();
  const gKey = "cm:react:global";
  const pKey = `cm:react:post:${postId}`;
  const gArr = JSON.parse(localStorage.getItem(gKey) || "[]") as number[];
  const pArr = JSON.parse(localStorage.getItem(pKey) || "[]") as number[];
  const gOk = gArr.filter((t) => now - t < REACT_WINDOW_GLOBAL_MS).length < 5;
  const pOk = pArr.filter((t) => now - t < REACT_WINDOW_PER_POST_MS).length < 2;
  return gOk && pOk;
}
function recordReactEvent(postId: string) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const gKey = "cm:react:global";
  const pKey = `cm:react:post:${postId}`;
  const gArr = JSON.parse(localStorage.getItem(gKey) || "[]") as number[];
  const pArr = JSON.parse(localStorage.getItem(pKey) || "[]") as number[];
  gArr.push(now);
  pArr.push(now);
  localStorage.setItem(gKey, JSON.stringify(gArr));
  localStorage.setItem(pKey, JSON.stringify(pArr));
}

/* ------------------------------ Helpers divers ------------------------------ */
function isYouTubeUrl(url: string) {
  try {
    const u = new URL(url);
    return u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be");
  } catch {
    return false;
  }
}

function youtubeEmbedSrc(url: string, autoplay = false) {
  try {
    const u = new URL(url);
    let id = "";
    if (u.hostname === "youtu.be") id = u.pathname.replace("/", "");
    else if (u.pathname.startsWith("/shorts/")) id = u.pathname.split("/")[2];
    else if (u.pathname === "/watch") id = u.searchParams.get("v") || "";
    if (!id) return "";

    const params = new URLSearchParams({
      rel: "0",
      modestbranding: "1",
      playsinline: "1",
      mute: "1",
      autoplay: autoplay ? "1" : "0",
    });
    return `https://www.youtube.com/embed/${id}?${params.toString()}`;
  } catch {
    return "";
  }
}

function markViewedOncePerSession(postId: string) {
  if (typeof window === "undefined") return false;
  const key = `cm:viewed:${postId}`;
  if (sessionStorage.getItem(key)) return false;
  sessionStorage.setItem(key, "1");
  return true;
}

function cn(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

/* ---------------------------------- Page ---------------------------------- */
export default function Home() {
  /* ----------------------------- Etats généraux ----------------------------- */
  const [openPanel, setOpenPanel] = useState<PanelKey>(null);

  // 🔥 Ajout de "all" + défaut "all"
  const [rankRange, setRankRange] = useState<"all" | "day" | "week" | "month">("all");

  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState("");

  const [useAnonymous, setUseAnonymous] = useState<boolean>(true);
  const [publicName, setPublicName] = useState<string>("");

  const [caption, setCaption] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [hashtags, setHashtags] = useState("");
  const newPostRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<string, Comment[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});

  // Autoplay & refs pour médias
  const mediaRefs = useRef<Record<string, HTMLVideoElement | HTMLIFrameElement | null>>({});
  const seenOnce = useRef<Record<string, boolean>>({});
  const [currentAudioId, setCurrentAudioId] = useState<string | null>(null);

  // Viewer plein écran
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  function setMediaRef(id: string, el: HTMLVideoElement | HTMLIFrameElement | null) {
    mediaRefs.current[id] = el;
  }

  /* --------- Charger / persister la préférence de période (rankRange) -------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("cm:rankRange");
    if (saved === "all" || saved === "day" || saved === "week" || saved === "month") {
      setRankRange(saved);
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("cm:rankRange", rankRange);
  }, [rankRange]);

  /* ------------------------------ Chargement feed ------------------------------ */
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

  /* --------------------- IntersectionObserver (autoplay) --------------------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLVideoElement | HTMLIFrameElement;
          const postId = el.getAttribute("data-postid") || "";
          const type = el.getAttribute("data-mediatype");

          if (entry.isIntersecting && !seenOnce.current[postId]) {
            if (markViewedOncePerSession(postId)) {
              seenOnce.current[postId] = true;
              setPosts((prev) =>
                prev.map((p) => (p.id === postId ? { ...p, views: (p.views ?? 0) + 1 } : p))
              );
              (async () => {
                try {
                  await supabase.rpc("increment_view", { pid: postId, delta: 1 });
                } catch {}
              })();
            }
          }

          // Autoplay/pause
          if (type === "video") {
            const vid = el as HTMLVideoElement;
            vid.muted = true;
            (async () => {
              try {
                if (entry.isIntersecting) await vid.play();
                else vid.pause();
              } catch {}
            })();
          } else if (type === "youtube") {
            const iframe = el as HTMLIFrameElement;
            const raw = iframe.getAttribute("data-rawurl") || "";
            const srcOn = youtubeEmbedSrc(raw, true);
            const srcOff = youtubeEmbedSrc(raw, false);
            if (entry.isIntersecting && iframe.src !== srcOn) iframe.src = srcOn;
            else if (!entry.isIntersecting && iframe.src !== srcOff) iframe.src = srcOff;
          }
        });
      },
      { threshold: 0.6 }
    );

    Object.values(mediaRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [posts.length]);

  /* ----------------------- Audio exclusif (une seule source) ----------------------- */
  function handleVolumeChange(pid: string, el: HTMLVideoElement) {
    if (!el.muted) {
      setCurrentAudioId(pid);
      for (const [id, node] of Object.entries(mediaRefs.current)) {
        if (id !== pid && node instanceof HTMLVideoElement) {
          node.muted = true;
        }
      }
    }
  }

  /* --------------------------------- Réactions --------------------------------- */
  async function react(post: Post, kind: "lol" | "cringe" | "wtf" | "genius") {
    if (!post.id) return;
    if (!canReactNow(post.id)) {
      alert("Doucement sur les réactions 😉");
      return;
    }
    recordReactEvent(post.id);

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
      await supabase.from("reactions").insert({
        post_id: post.id,
        user_id: null,
        kind,
      } as unknown as Record<string, unknown>);
      await supabase.rpc("increment_post_score", { pid: post.id, delta: 1 });
    } catch (e) {
      console.warn("reaction error", e);
    }
  }

  /* ------------------------------- Partage lien ------------------------------ */
  async function sharePost(p: Post) {
    const url = `${location.origin}/post/${p.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ url, title: "CancelMe", text: p.caption || "" });
      } else {
        await navigator.clipboard.writeText(url);
        alert("Lien copié !");
      }
    } catch {}
  }

  /* ---------------------------------- Report --------------------------------- */
  async function reportPost(p: Post) {
    if (!confirm("Signaler ce contenu ?")) return;
    try {
      await supabase.from("reports").insert({
        post_id: p.id,
        reason: "user_report",
      } as unknown as Record<string, unknown>);
      alert("Merci pour le signalement.");
    } catch (e) {
      console.warn(e);
      alert("Impossible de signaler pour le moment.");
    }
  }

  /* --------------------------------- Upload --------------------------------- */
  async function uploadToStorage(file: File): Promise<{ url: string; type: "image" | "video" }> {
    const ext = file.name.split(".").pop() || (file.type.startsWith("video") ? "mp4" : "jpg");
    const id = "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
    const path = `public/${id}.${ext}`;
    const { error } = await supabase.storage
      .from("media")
      .upload(path, file, { upsert: false, contentType: file.type });
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

  /* ------------------------------- Nouveau post ------------------------------ */
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

    const { data, error } = await supabase
      .from("posts")
      .insert(payload as unknown as Record<string, unknown>)
      .select("*")
      .single();

    if (error) {
      console.error("Erreur ajout post :", error);
      if ((error as any).message?.includes("row-level security")) {
        alert("Insertion refusée par RLS. Vérifie la policy INSERT sur 'posts' pour le rôle public.");
      } else {
        alert("Impossible d’ajouter le post.");
      }
      return;
    }

    setCaption("");
    setMediaUrl("");
    setHashtags("");
    setOpenPanel(null);

    setPosts((prev) => [data as unknown as Post, ...prev]);
  }

  function goToNewPost() {
    setOpenPanel("post");
    setTimeout(() => {
      newPostRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  /* ---------------------- Commentaires (feed & viewer) ---------------------- */
  async function ensureCommentsLoaded(postId: string) {
    if (commentsByPost[postId]) return;
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    setCommentsByPost((prev) => ({
      ...prev,
      [postId]: (data as unknown as Comment[]) || [],
    }));
  }

  async function toggleComments(postId: string) {
    setOpenComments((prev) => ({ ...prev, [postId]: !prev[postId] }));
    if (!commentsByPost[postId]) {
      await ensureCommentsLoaded(postId);
    }
  }

  async function addComment(postId: string) {
    if (!canCommentNow(postId)) {
      alert("Ralentis un peu sur ce post 😉");
      return;
    }
    const content = (newComment[postId] || "").trim();
    if (!content) return;

    const payload = {
      post_id: postId,
      content,
      display_name: useAnonymous ? "Anonyme" : publicName || "User",
    };

    const temp: Comment = {
      id: `temp-${Date.now()}`,
      post_id: postId,
      content,
      display_name: payload.display_name,
      created_at: new Date().toISOString(),
    };
    setCommentsByPost((prev) => ({
      ...prev,
      [postId]: [...(prev[postId] || []), temp],
    }));
    setNewComment((prev) => ({ ...prev, [postId]: "" }));
    recordCommentEvent(postId);

    try {
      const { data, error } = await supabase
        .from("comments")
        .insert(payload as unknown as Record<string, unknown>)
        .select("*")
        .single();
      if (!error && data) {
        setCommentsByPost((prev) => ({
          ...prev,
          [postId]: [
            ...(prev[postId] || []).filter((c) => !c.id.startsWith("temp-")),
            data as unknown as Comment,
          ],
        }));
      }
    } catch (e) {
      console.warn(e);
    }
  }

  /* ------------------------------ Filtrage & tri ------------------------------ */
  const filteredPosts = useMemo(() => {
    let arr = posts.filter((p) => !p.hidden);

    if (selectedTag) arr = arr.filter((p) => (p.tags || []).includes(selectedTag));

    // 🔥 Période : on ne filtre par date que si ≠ "all"
    if (rankRange !== "all") {
      const now = Date.now();
      const ms =
        rankRange === "day"
          ? 24 * 3600 * 1000
          : rankRange === "week"
          ? 7 * 24 * 3600 * 1000
          : 30 * 24 * 3600 * 1000;

      arr = arr.filter((p) => {
        if (!p.created_at) return true;
        const t = new Date(p.created_at).getTime();
        return now - t <= ms;
      });
    }

    // Récents d’abord (comme ton code d’origine)
    arr = arr.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    return arr;
  }, [posts, selectedTag, rankRange]);

  /* ------------------------------ Viewer plein écran ------------------------------ */
  function openViewerWith(postId: string) {
    const idx = filteredPosts.findIndex((p) => p.id === postId);
    if (idx >= 0) {
      setViewerIndex(idx);
      setViewerOpen(true);
      const p = filteredPosts[idx];
      if (p?.id) ensureCommentsLoaded(p.id);
      if (typeof document !== "undefined") document.body.style.overflow = "hidden";
    }
  }
  function closeViewer() {
    setViewerOpen(false);
    if (typeof document !== "undefined") document.body.style.overflow = "";
  }
  function nextInViewer() {
    setViewerIndex((i) => {
      const ni = i + 1 < filteredPosts.length ? i + 1 : i;
      const p = filteredPosts[ni];
      if (p?.id) ensureCommentsLoaded(p.id);
      return ni;
    });
  }
  function prevInViewer() {
    setViewerIndex((i) => {
      const ni = i - 1 >= 0 ? i - 1 : i;
      const p = filteredPosts[ni];
      if (p?.id) ensureCommentsLoaded(p.id);
      return ni;
    });
  }
  useEffect(() => {
    if (!viewerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeViewer();
      if (e.key === "ArrowRight") nextInViewer();
      if (e.key === "ArrowLeft") prevInViewer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerOpen, filteredPosts.length]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > 40) {
      if (dx < 0) nextInViewer();
      else prevInViewer();
    }
  }

  /* --------------------------------- Rendu UI --------------------------------- */
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

                {/* 🔥 Option Tout */}
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="rankRange"
                    value="all"
                    checked={rankRange === "all"}
                    onChange={() => setRankRange("all")}
                  />
                  Tout
                </label>

                <label className="flex items-center gap-2">
                  <input type="radio" name="rankRange" value="day" checked={rankRange === "day"} onChange={() => setRankRange("day")} />
                  Jour
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="rankRange" value="week" checked={rankRange === "week"} onChange={() => setRankRange("week")} />
                  Semaine
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="rankRange" value="month" checked={rankRange === "month"} onChange={() => setRankRange("month")} />
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
                    <button onClick={() => setSelectedTag(null)} className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 text-sm">
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
                <label className="flex items-center gap-2 text-sm">
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
            <div id="new-post-form" ref={newPostRef} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-800">
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
                  <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={onPickFile} className="text-sm" />
                  <input
                    value={hashtags}
                    onChange={(e) => setHashtags(e.target.value)}
                    placeholder="#gaming #lol (jusqu'à 8)"
                    className="flex-1 min-w-0 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                  <button onClick={addPost} disabled={uploading} className="px-4 py-2 rounded bg-gray-900 text-white hover:bg-black disabled:opacity-60">
                    {uploading ? "Upload..." : "Publier"}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Astuce : upload ≤ 50 Mo, ou colle un lien YouTube (shorts/watch).</p>
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
                  goToNewPost();
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
                  goToNewPost();
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
                  goToNewPost();
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
                  goToNewPost();
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

                {/* Média (double-clic → viewer) */}
                {post.media_url && post.media_type === "image" && (
                  <img
                    src={post.media_url}
                    alt=""
                    loading="lazy"
                    className="mt-3 rounded cursor-zoom-in"
                    onDoubleClick={() => openViewerWith(post.id)}
                    onLoad={() => {
                      if (markViewedOncePerSession(post.id)) {
                        setPosts((prev) =>
                          prev.map((p) => (p.id === post.id ? { ...p, views: (p.views ?? 0) + 1 } : p))
                        );
                        (async () => {
                          try {
                            await supabase.rpc("increment_view", { pid: post.id, delta: 1 });
                          } catch {}
                        })();
                      }
                    }}
                  />
                )}

                {post.media_url && post.media_type === "video" && (
                  <video
                    ref={(el) => setMediaRef(post.id, el)}
                    data-postid={post.id}
                    data-mediatype="video"
                    src={post.media_url}
                    muted
                    playsInline
                    controls
                    className="mt-3 rounded w-full cursor-zoom-in"
                    onDoubleClick={() => openViewerWith(post.id)}
                    onVolumeChange={(e) => handleVolumeChange(post.id, e.currentTarget)}
                    onPlay={(e) => handleVolumeChange(post.id, e.currentTarget)}
                  />
                )}

                {post.media_url && post.media_type === "youtube" && (
                  <div className="mt-3 aspect-video w-full cursor-zoom-in" onDoubleClick={() => openViewerWith(post.id)}>
                    <iframe
                      ref={(el) => setMediaRef(post.id, el)}
                      data-postid={post.id}
                      data-mediatype="youtube"
                      data-rawurl={post.media_url}
                      className="w-full h-full rounded"
                      src={youtubeEmbedSrc(post.media_url, false)}
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                )}

                {/* Réactions */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => react(post, "lol")}
                    className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm"
                  >
                    😂 LOL {Number(post.lol ?? 0) > 0 ? `(${post.lol})` : ""}
                  </button>
                  <button
                    onClick={() => react(post, "cringe")}
                    className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm"
                  >
                    😬 Cringe {Number(post.cringe ?? 0) > 0 ? `(${post.cringe})` : ""}
                  </button>
                  <button
                    onClick={() => react(post, "wtf")}
                    className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm"
                  >
                    🤯 WTF {Number(post.wtf ?? 0) > 0 ? `(${post.wtf})` : ""}
                  </button>
                  <button
                    onClick={() => react(post, "genius")}
                    className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm"
                  >
                    🧠 Genius {Number(post.genius ?? 0) > 0 ? `(${post.genius})` : ""}
                  </button>
                </div>

                {/* Actions */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => sharePost(post)} className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                    Partager
                  </button>
                  <button
                    onClick={() => reportPost(post)}
                    className="px-3 py-2 text-sm rounded border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-600 dark:hover:bg-red-900/30"
                  >
                    Signaler
                  </button>
                </div>

                {/* Commentaires */}
                <div className="mt-4">
                  <button onClick={() => toggleComments(post.id)} className="text-sm text-gray-700 dark:text-gray-300 underline">
                    {openComments[post.id] ? "Masquer les commentaires" : "Afficher les commentaires"}
                  </button>

                  {openComments[post.id] && (
                    <div className="mt-3 space-y-3">
                      <div className="space-y-2">
                        {(commentsByPost[post.id] || []).map((c) => (
                          <div key={c.id} className="text-sm bg-gray-50 dark:bg-gray-700/50 rounded p-2">
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
                        <button onClick={() => addComment(post.id)} className="px-3 py-2 bg-gray-900 text-white rounded hover:bg-black">
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

      {/* VIEWER plein écran */}
      {viewerOpen && filteredPosts[viewerIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center overflow-y-auto"
          onDoubleClick={closeViewer}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Top actions */}
          <div className="w-full max-w-3xl px-4 pt-4 flex items-center justify-between">
            <button className="px-3 py-2 rounded bg-white/10 text-white hover:bg-white/20" onClick={closeViewer} aria-label="Fermer">
              ✕
            </button>
            <div className="flex gap-2">
              <button className="px-3 py-2 rounded bg白/10 text-white hover:bg-white/20" onClick={prevInViewer} aria-label="Précédent">
                ←
              </button>
              <button className="px-3 py-2 rounded bg-white/10 text-white hover:bg-white/20" onClick={nextInViewer} aria-label="Suivant">
                →
              </button>
            </div>
          </div>

          {/* Media */}
          <div className="w-full max-w-3xl px-4">
            {(() => {
              const post = filteredPosts[viewerIndex];
              if (!post || !post.media_url) return null;

              if (post.media_type === "image") {
                return <img src={post.media_url} alt="" className="w-full max-h-[70vh] object-contain rounded mt-2" />;
              }
              if (post.media_type === "video") {
                return (
                  <video
                    ref={(el) => setMediaRef(`viewer-${post.id}`, el)}
                    data-postid={`viewer-${post.id}`}
                    data-mediatype="video"
                    src={post.media_url}
                    className="w-full max-h-[70vh] rounded mt-2"
                    controls
                    playsInline
                    onVolumeChange={(e) => handleVolumeChange(`viewer-${post.id}`, e.currentTarget)}
                    onPlay={(e) => handleVolumeChange(`viewer-${post.id}`, e.currentTarget)}
                    autoPlay
                    muted
                  />
                );
              }
              if (post.media_type === "youtube") {
                return (
                  <div className="aspect-video w-full mt-2">
                    <iframe
                      ref={(el) => setMediaRef(`viewer-${post.id}`, el)}
                      data-postid={`viewer-${post.id}`}
                      data-mediatype="youtube"
                      data-rawurl={post.media_url}
                      className="w-full h-full rounded"
                      src={youtubeEmbedSrc(post.media_url, true)}
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                );
              }
              return null;
            })()}

            {/* Caption + tags */}
            {(() => {
              const p = filteredPosts[viewerIndex];
              if (!p) return null;
              const author = p.is_anonymous ? "🤫 Anonyme" : p.display_name || p.username || "Utilisateur";
              return (
                <div className="mt-4 text-gray-200">
                  <div className="text-sm opacity-80">{author}</div>
                  {p.caption && <div className="mt-2 whitespace-pre-wrap">{p.caption}</div>}
                  {p.tags && p.tags.length > 0 && (
                    <div className="mt-2 text-sm opacity-80">{p.tags.slice(0, 8).map((t) => `#${t}`).join(" ")}</div>
                  )}
                </div>
              );
            })()}

            {/* Réactions + Partage/Signaler */}
            {(() => {
              const p = filteredPosts[viewerIndex];
              if (!p) return null;
              return (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => react(p, "lol")} className="px-3 py-2 rounded bg-white/10 text-white hover:bg-white/20 text-sm">
                    😂 LOL {Number(p.lol ?? 0) > 0 ? `(${p.lol})` : ""}
                  </button>
                  <button onClick={() => react(p, "cringe")} className="px-3 py-2 rounded bg-white/10 text-white hover:bg-white/20 text-sm">
                    😬 Cringe {Number(p.cringe ?? 0) > 0 ? `(${p.cringe})` : ""}
                  </button>
                  <button onClick={() => react(p, "wtf")} className="px-3 py-2 rounded bg-white/10 text-white hover:bg-white/20 text-sm">
                    🤯 WTF {Number(p.wtf ?? 0) > 0 ? `(${p.wtf})` : ""}
                  </button>
                  <button onClick={() => react(p, "genius")} className="px-3 py-2 rounded bg-white/10 text-white hover:bg-white/20 text-sm">
                    🧠 Genius {Number(p.genius ?? 0) > 0 ? `(${p.genius})` : ""}
                  </button>

                  <span className="mx-2 opacity-30">|</span>

                  <button onClick={() => sharePost(p)} className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">
                    Partager
                  </button>
                  <button
                    onClick={() => reportPost(p)}
                    className="px-3 py-2 text-sm rounded border border-red-500 text-red-400 hover:bg-red-500/10"
                  >
                    Signaler
                  </button>
                </div>
              );
            })()}

            {/* Commentaires dans le viewer */}
            {(() => {
              const p = filteredPosts[viewerIndex];
              if (!p) return null;
              const list = commentsByPost[p.id] || [];
              return (
                <div className="mt-5 mb-10">
                  <div className="text-gray-300 text-sm mb-2">{list.length} commentaire(s)</div>
                  <div className="space-y-2">
                    {list.map((c) => (
                      <div key={c.id} className="text-sm bg-white/5 rounded p-2 text-gray-100">
                        <span className="font-medium">{c.display_name || "Anonyme"}: </span>
                        <span>{c.content}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <input
                      value={newComment[p.id] || ""}
                      onChange={(e) => setNewComment((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder="Écrire un commentaire…"
                      className="flex-1 min-w-0 px-3 py-2 rounded border border-white/20 bg-white/5 text-white placeholder:text-gray-400"
                    />
                    <button onClick={() => addComment(p.id)} className="px-3 py-2 rounded bg-white/15 text-white hover:bg-white/25">
                      Publier
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
