"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "../utils/supabase";

const supabase = createClient();

/* ===================== Types ===================== */
type Post = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  caption?: string | null;
  media_url?: string | null;
  media_type?: "image" | "video" | "youtube" | null;
  is_anonymous?: boolean;
  score?: number | null;
  created_at?: string;
  lol?: number | null;
  cringe?: number | null;
  wtf?: number | null;
  genius?: number | null;
  tags?: string[] | null;
  views?: number | null;
};

type CMComment = {
  id: string;
  post_id: string;
  content: string;
  created_at: string;
  display_name?: string | null;
};

type SortMode = "recent" | "top_day" | "top_week" | "top_month";

/* ===================== Constantes ===================== */
const PAGE_SIZE = 20;
const MAX_IMAGE_MB = 15;
const MAX_VIDEO_MB = 50;

const COMMENTS_PAGE_SIZE = 20;

const MAX_COMMENTS_PER_MINUTE_GLOBAL = 5;
const MAX_COMMENTS_PER_POST_30S = 2;
const COMMENT_WINDOW_GLOBAL_MS = 60 * 1000;
const COMMENT_WINDOW_PER_POST_MS = 30 * 1000;

/** Liste courte d’exemples — remplace/complète par ta vraie liste */
const BANNED_PATTERNS: RegExp[] = [
  /\b(?:insulte1|insulte2|slur1|slur2)\b/i,
];

const POPULAR_TAGS = [
  "gaming",
  "travail",
  "amour",
  "ecole",
  "cringe",
  "lol",
  "wtf",
  "genius",
  "sport",
  "food",
  "voyage",
  "tech",
];

/** Auto-modération communautaire */
const REPORTS_WINDOW_HOURS = 24;      // on compte les signalements des dernières 24h
const REPORTS_AUTOHIDE_THRESHOLD = 3; // à partir de 3 signalements récents, on masque par défaut

/* ===================== Utils ===================== */
function readNumberArray(key: string): number[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((n: unknown): n is number => typeof n === "number")
      : [];
  } catch {
    return [];
  }
}

function extractTags(text: string): string[] {
  const raw = text.match(/#[\p{L}\d_]+/gu) || [];
  const cleaned = raw.map((t) => t.slice(1).toLowerCase());
  const unique = Array.from(new Set(cleaned));
  return unique.slice(0, 10);
}

function formatDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Détecte si une URL est YouTube (watch, shorts, youtu.be, embed) et renvoie l’ID */
function parseYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") {
        const v = u.searchParams.get("v");
        return v || null;
      }
      const m1 = u.pathname.match(/^\/shorts\/([^/?#]+)/);
      if (m1) return m1[1];
      const m2 = u.pathname.match(/^\/embed\/([^/?#]+)/);
      if (m2) return m2[1];
    }
    if (host === "youtu.be") {
      const m = u.pathname.match(/^\/([^/?#]+)/);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

/** Fingerprint simple stocké en local (anonyme) pour les signalements */
function getReporterFingerprint(): string {
  if (typeof window === "undefined") return "srvr";
  let fp = localStorage.getItem("cm:rid");
  if (!fp) {
    fp = (crypto?.randomUUID?.() || `rid-${Date.now()}-${Math.random()}`).toString();
    localStorage.setItem("cm:rid", fp);
  }
  return fp;
}

/* ===================== Lazy-load hook ===================== */
function useOnScreen<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [isIntersecting, setIntersecting] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIntersecting(true);
        io.disconnect(); // 1 seule fois (performance)
      }
    }, options || { root: null, rootMargin: "200px", threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, [options]);
  return { ref, isIntersecting } as const;
}

/* ===================== Composant média lazy ===================== */
function LazyMedia({
  post,
  onClick,
  onSeen,
}: {
  post: Post;
  onClick?: () => void;
  onSeen?: () => void;
}) {
  const { ref, isIntersecting } = useOnScreen<HTMLDivElement>();
  const calledRef = useRef(false);

  useEffect(() => {
    if (isIntersecting && !calledRef.current) {
      calledRef.current = true;
      onSeen?.();
    }
  }, [isIntersecting, onSeen]);

  const youTubeId =
    post.media_type === "youtube" && post.media_url ? parseYouTubeId(post.media_url) : null;

  return (
    <div ref={ref} className="mt-2">
      {!isIntersecting ? (
        <div className="w-full aspect-video bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      ) : post.media_type === "youtube" && youTubeId ? (
        <div className="w-full aspect-video rounded overflow-hidden">
          <iframe
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${youTubeId}`}
            title="YouTube video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
          />
        </div>
      ) : post.media_type === "video" ? (
        <button onClick={onClick} className="block w-full rounded overflow-hidden">
          <video src={post.media_url || ""} controls muted preload="metadata" className="rounded w-full" />
        </button>
      ) : (
        <button onClick={onClick} className="block w-full rounded overflow-hidden">
          <img src={post.media_url || ""} alt="media" loading="lazy" className="rounded w-full" />
        </button>
      )}
    </div>
  );
}

/* ===================== Page ===================== */
export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const [guestName, setGuestName] = useState<string>("");

  const [caption, setCaption] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [hashtags, setHashtags] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [openFor, setOpenFor] = useState<Record<string, boolean>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CMComment[]>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [loadingComments, setLoadingComments] = useState<Record<string, boolean>>({});
  const [hasMoreComments, setHasMoreComments] = useState<Record<string, boolean>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [moderationErrorByPost, setModerationErrorByPost] = useState<Record<string, string | null>>({});

  // Signalements / auto-modération
  const [reportCounts, setReportCounts] = useState<Record<string, number>>({});
  const [autoHidden, setAutoHidden] = useState<Record<string, boolean>>({});
  const [showHidden, setShowHidden] = useState<Record<string, boolean>>({}); // “afficher quand même”

  // Toast
  const [toast, setToast] = useState<{ msg: string; show: boolean }>({ msg: "", show: false });
  const toastTimer = useRef<number | null>(null);
  function showToast(msg: string, ms = 1800) {
    setToast({ msg, show: true });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast({ msg: "", show: false }), ms);
  }

  // Viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number>(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // FAB
  const newPostRef = useRef<HTMLDivElement | null>(null);
  const captionInputRef = useRef<HTMLInputElement | null>(null);

  // Dark mode
  const [dark, setDark] = useState<boolean>(false);
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("cm:theme") : null;
    if (saved === "dark" || saved === "light") {
      applyTheme(saved === "dark");
      return;
    }
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(!!prefersDark);
  }, []);
  function applyTheme(isDark: boolean) {
    setDark(isDark);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      if (isDark) root.classList.add("dark");
      else root.classList.remove("dark");
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("cm:theme", isDark ? "dark" : "light");
    }
  }
  function toggleTheme() { applyTheme(!dark); }

  // Init
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("cm:guestName") : "";
    if (saved) setGuestName(saved);
    void loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void loadFirstPage(); }, [sortMode, selectedTag]);

  /* ===================== Data ===================== */
  async function fetchPage(from: number, to: number, mode: SortMode, tag: string | null) {
    let query = supabase.from("posts_with_profiles").select("*");
    const now = new Date();
    let fromDate: Date | null = null;
    if (mode === "top_day") fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    else if (mode === "top_week") fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (mode === "top_month") fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (fromDate) query = query.gte("created_at", fromDate.toISOString());
    if (tag) query = query.contains("tags", [tag.toLowerCase()]);
    if (mode === "recent") query = query.order("created_at", { ascending: false });
    else query = query.order("score", { ascending: false }).order("created_at", { ascending: false });
    query = query.range(from, to);
    return query;
  }

  async function loadFirstPage() {
    setLoading(true);
    const { data, error } = await fetchPage(0, PAGE_SIZE - 1, sortMode, selectedTag);
    if (error) console.error(error);
    const list = (data as Post[]) || [];
    setPosts(list);
    setHasMore((list.length ?? 0) === PAGE_SIZE);
    setLoading(false);
    void refreshCommentCounts(list.map((p) => p.id));
    void refreshReports(list.map((p) => p.id));
  }

  async function loadMore() {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    const from = posts.length;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to, sortMode, selectedTag);
    if (error) console.error(error);
    const list = (data as Post[]) || [];
    setPosts((prev) => [...prev, ...list]);
    setHasMore(list.length === PAGE_SIZE);
    setIsLoadingMore(false);
    void refreshCommentCounts(list.map((p) => p.id));
    void refreshReports(list.map((p) => p.id));
  }

  /* ===================== Commentaires ===================== */
  function normalizeCommentText(s: string) { return s.replace(/\s+/g, " ").trim(); }
  function violatesModeration(s: string): string | null {
    if (s.length < 1) return "Commentaire vide.";
    if (s.length > 1000) return "Commentaire trop long (1000 caractères max).";
    for (const re of BANNED_PATTERNS) if (re.test(s)) return "Contenu refusé.";
    return null;
  }
  function checkSpamAllowance(postId: string): string | null {
    if (typeof window === "undefined") return null;
    const now = Date.now();
    const gKey = "cm:comments:global";
    const gArr: number[] = readNumberArray(gKey);
    const gRecent = gArr.filter((t: number) => now - t < COMMENT_WINDOW_GLOBAL_MS);
    if (gRecent.length >= MAX_COMMENTS_PER_MINUTE_GLOBAL) return "Trop de commentaires en peu de temps. Réessaie dans une minute.";
    const pKey = `cm:comments:post:${postId}`;
    const pArr: number[] = readNumberArray(pKey);
    const pRecent = pArr.filter((t: number) => now - t < COMMENT_WINDOW_PER_POST_MS);
    if (pRecent.length >= MAX_COMMENTS_PER_POST_30S) return "Ralentis un peu sur ce post 😉";
    return null;
  }
  function recordSpamEvent(postId: string) {
    if (typeof window === "undefined") return;
    const now = Date.now();
    const gKey = "cm:comments:global";
    const gArr: number[] = readNumberArray(gKey).filter((t: number) => now - t < COMMENT_WINDOW_GLOBAL_MS);
    gArr.push(now);
    localStorage.setItem(gKey, JSON.stringify(gArr));
    const pKey = `cm:comments:post:${postId}`;
    const pArr: number[] = readNumberArray(pKey).filter((t: number) => now - t < COMMENT_WINDOW_PER_POST_MS);
    pArr.push(now);
    localStorage.setItem(pKey, JSON.stringify(pArr));
  }

  async function addComment(postId: string) {
    const raw = commentInputs[postId] || "";
    const content = normalizeCommentText(raw);
    const modErr = violatesModeration(content);
    if (modErr) { setModerationErrorByPost((m) => ({ ...m, [postId]: modErr })); return; }
    const spamErr = checkSpamAllowance(postId);
    if (spamErr) { setModerationErrorByPost((m) => ({ ...m, [postId]: spamErr })); return; }
    setModerationErrorByPost((m) => ({ ...m, [postId]: null }));

    // Optimistic UI
    const tempId = `temp-${Date.now()}`;
    const display = guestName.trim() || null;
    const optimistic: CMComment = {
      id: tempId, post_id: postId, content,
      created_at: new Date().toISOString(),
      display_name: display,
    };
    setCommentsByPost((map) => ({ ...map, [postId]: [optimistic, ...(map[postId] || [])] }));
    setCommentCounts((c) => ({ ...c, [postId]: (c[postId] || 0) + 1 }));
    setCommentInputs((m) => ({ ...m, [postId]: "" }));
    recordSpamEvent(postId);

    const { data, error } = await supabase.from("comments").insert([{
      post_id: postId, content, display_name: display,
    }]).select("*").single();

    if (error) {
      // rollback
      setCommentsByPost((map) => ({
        ...map,
        [postId]: (map[postId] || []).filter((c) => c.id !== tempId),
      }));
      setCommentCounts((c) => ({ ...c, [postId]: Math.max(0, (c[postId] || 1) - 1) }));
      setModerationErrorByPost((m) => ({ ...m, [postId]: "Ajout impossible." }));
    } else if (data) {
      setCommentsByPost((map) => ({
        ...map,
        [postId]: (map[postId] || []).map((c) => (c.id === tempId ? (data as CMComment) : c)),
      }));
    }
  }

  async function refreshCommentCounts(postIds: string[]) {
    const updates: Record<string, number> = {};
    for (const postId of postIds) {
      const { count, error } = await supabase.from("comments").select("*", { count: "exact", head: true }).eq("post_id", postId);
      if (!error && typeof count === "number") updates[postId] = count;
    }
    if (Object.keys(updates).length) setCommentCounts((prev) => ({ ...prev, ...updates }));
  }

  async function fetchComments(postId: string, append = false) {
    setLoadingComments((s) => ({ ...s, [postId]: true }));
    const already = commentsByPost[postId]?.length ?? 0;
    const from = append ? already : 0;
    const to = from + COMMENTS_PAGE_SIZE - 1;

    const { data, error, count } = await supabase
      .from("comments")
      .select("*", { count: "exact" })
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!error) {
      setCommentsByPost((map) => ({
        ...map,
        [postId]: append ? [ ...(map[postId] || []), ...(data as CMComment[]) ] : ((data as CMComment[]) || []),
      }));
      if (typeof count === "number") setCommentCounts((prev) => ({ ...prev, [postId]: count }));
      setHasMoreComments((m) => ({ ...m, [postId]: (data?.length ?? 0) === COMMENTS_PAGE_SIZE }));
    }
    setLoadingComments((s) => ({ ...s, [postId]: false }));
  }

  /* ===================== Vues : TOUT compter ===================== */
  async function incrementViewEveryTime(post: Post) {
    setPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, views: (p.views ?? 0) + 1 } : p))
    );
    const { error } = await supabase.rpc("increment_view", { pid: post.id, delta: 1 });
    if (error) console.error("increment_view error:", error);
  }

  /* ===================== Signalements & auto-modération ===================== */
  async function reportPost(post: Post) {
    const defaultReason = "";
    const reason = window.prompt("Pourquoi signales-tu ce contenu ? (optionnel)", defaultReason);
    if (reason === null) return; // annulé
    const reporter_fingerprint = getReporterFingerprint();
    const reporter_name = (guestName || "").trim() || null;

    // Optimistic : on monte le compteur local
    setReportCounts((prev) => ({ ...prev, [post.id]: (prev[post.id] || 0) + 1 }));

    const { error } = await supabase.from("reports").insert([{
      post_id: post.id,
      reason: reason.trim() || null,
      reporter_fingerprint,
      reporter_name,
    }]);

    if (error) {
      console.error("Erreur signalement:", error);
      // rollback local
      setReportCounts((prev) => ({ ...prev, [post.id]: Math.max(0, (prev[post.id] || 1) - 1) }));
      showToast("Signalement non pris en compte.");
    } else {
      showToast("Merci, nous avons reçu ton signalement ✅");
      evaluateAutoHide([post.id]);
    }
  }

  async function refreshReports(postIds: string[]) {
    if (!postIds.length) return;
    const since = new Date(Date.now() - REPORTS_WINDOW_HOURS * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from("reports")
      .select("post_id, created_at")
      .gte("created_at", since)
      .in("post_id", postIds);

    if (error) {
      console.warn("Impossible de lire les reports (table absente ?)", error);
      return;
    }
    const counts: Record<string, number> = {};
    for (const r of (data || []) as { post_id: string }[]) {
      counts[r.post_id] = (counts[r.post_id] || 0) + 1;
    }
    if (Object.keys(counts).length) {
      setReportCounts((prev) => ({ ...prev, ...counts }));
      evaluateAutoHide(Object.keys(counts));
    }
  }

  function evaluateAutoHide(postIds: string[]) {
    setAutoHidden((prev) => {
      const copy = { ...prev };
      for (const id of postIds) {
        const n = reportCounts[id] || 0;
        copy[id] = n >= REPORTS_AUTOHIDE_THRESHOLD;
      }
      return copy;
    });
  }

  /* ===================== Réactions ===================== */
  async function react(kind: "lol" | "cringe" | "wtf" | "genius", post: Post) {
    const key = `reacted:${post.id}:${kind}`;
    if (typeof window !== "undefined" && localStorage.getItem(key)) return; // 1 clic / device
    localStorage.setItem(key, "1");

    // Optimistic UI
    setPosts((prev) => prev.map((p) => {
      if (p.id !== post.id) return p;
      const copy: Post = { ...p };
      (copy as any)[kind] = ((copy as any)[kind] ?? 0) + 1;
      copy.score = (copy.score ?? 0) + 1;
      return copy;
    }));

    const { error } = await supabase.rpc("increment_reaction", { pid: post.id, kind, delta: 1 });
    if (error) {
      console.error("Erreur reaction:", error);
      // rollback
      localStorage.removeItem(key);
      setPosts((prev) => prev.map((p) => {
        if (p.id !== post.id) return p;
        const copy: Post = { ...p };
        (copy as any)[kind] = Math.max(0, ((copy as any)[kind] ?? 0) - 1);
        copy.score = Math.max(0, (copy.score ?? 0) - 1);
        return copy;
      }));
      showToast("Réaction non prise en compte");
    }
  }

  /* ===================== UI Helpers ===================== */
  function pauseAllVideos() {
    if (typeof document === "undefined") return;
    document.querySelectorAll("video").forEach((v) => { try { v.pause(); } catch {} });
  }

  function toggleComments(postId: string) {
    setOpenFor((map) => {
      const isOpen = !map[postId];
      if (isOpen && !commentsByPost[postId]) { void fetchComments(postId); }
      return { ...map, [postId]: isOpen };
    });
  }

  function sharePost(post: Post) {
    const url = `${window.location.origin}/post/${post.id}`;
    const title = "CancelMe";
    const text = post.caption || "Regarde ce post sur CancelMe";
    const navAny = navigator as any;

    if (typeof navAny.share === "function") {
      navAny.share({ title, text, url }).catch((err: any) => {
        if (!err || err.name === "AbortError") return;
        console.error("Erreur partage:", err);
        showToast("Partage indisponible");
      });
      return;
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(url)
        .then(() => showToast("Lien copié ✅"))
        .catch(() => window.prompt("Copie le lien (Ctrl+C) :", url));
      return;
    }
    window.prompt("Copie le lien (Ctrl+C) :", url);
  }

  // Viewer
  function openViewer(index: number) {
    pauseAllVideos();
    setViewerIndex(index);
    setViewerOpen(true);
    const p = posts[index];
    if (p) void incrementViewEveryTime(p);
    if (typeof window !== "undefined" && p) {
      window.history.pushState({ v: "open" }, "", `/post/${p.id}`);
      window.addEventListener("keydown", onKey);
    }
  }
  function closeViewer() {
    pauseAllVideos();
    setViewerOpen(false);
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", "/");
      window.removeEventListener("keydown", onKey);
    }
  }
  function nextViewer() {
    pauseAllVideos();
    setViewerIndex((i) => {
      const n = i + 1;
      if (n < posts.length) {
        const p = posts[n]; if (p) void incrementViewEveryTime(p);
        if (typeof window !== "undefined" && p) window.history.pushState({ v: "open" }, "", `/post/${p.id}`);
        return n;
      } else {
        if (hasMore && !isLoadingMore) {
          void loadMore().then(() => {
            if (posts.length > n) {
              const p2 = posts[n]; if (p2) void incrementViewEveryTime(p2);
              if (typeof window !== "undefined" && p2) window.history.pushState({ v: "open" }, "", `/post/${p2.id}`);
              setViewerIndex(n);
            }
          });
        }
        return i;
      }
    });
  }
  function prevViewer() {
    pauseAllVideos();
    setViewerIndex((i) => {
      const pIdx = Math.max(0, i - 1);
      const p = posts[pIdx]; if (p) void incrementViewEveryTime(p);
      if (typeof window !== "undefined" && p) window.history.pushState({ v: "open" }, "", `/post/${p.id}`);
      return pIdx;
    });
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") closeViewer();
    if (e.key === "ArrowRight") nextViewer();
    if (e.key === "ArrowLeft") prevViewer();
  }

  function goToNewPost() {
    newPostRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => captionInputRef.current?.focus(), 350);
  }

  /* ===================== Upload / Post ===================== */
  async function uploadToStorage(file: File): Promise<{ url: string; type: "image" | "video" }> {
    const ext = file.name.split(".").pop() || (file.type.startsWith("video") ? "mp4" : "jpg");
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
    const path = `public/${id}.${ext}`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, file, { upsert: false, contentType: file.type });
    if (upErr) { console.error("Upload error details:", upErr); throw upErr; }
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    const media_type: "image" | "video" = file.type.startsWith("video") ? "video" : "image";
    return { url: data.publicUrl, type: media_type };
  }

  async function addPost(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0] || null;

    // Détection YouTube
    const ytId = mediaUrl.trim() ? parseYouTubeId(mediaUrl.trim()) : null;
    const isYouTube = !!ytId;

    if (!caption.trim() && !mediaUrl.trim() && !file && !hashtags.trim()) {
      showToast("Ajoute un texte, un média ou des hashtags.");
      return;
    }
    if (file) {
      const isVideo = file.type.startsWith("video");
      const limitMB = isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB;
      if (file.size > limitMB * 1024 * 1024) { showToast("Fichier trop lourd"); return; }
    }
    const tags = Array.from(new Set([...extractTags(hashtags), ...extractTags(caption)]));

    let finalUrl: string | null = null;
    let finalType: "image" | "video" | "youtube" | null = null;

    try {
      if (file) {
        const up = await uploadToStorage(file);
        finalUrl = up.url; finalType = up.type;
      } else if (isYouTube) {
        finalUrl = mediaUrl.trim(); finalType = "youtube";
      } else if (mediaUrl.trim()) {
        finalUrl = mediaUrl.trim(); finalType = "image"; // par défaut si URL directe
      }

      const pseudo = guestName.trim();
      const { error } = await supabase.from("posts").insert([{
        caption: caption.trim() || null,
        media_url: finalUrl,
        media_type: finalType,
        is_anonymous: !pseudo,
        display_name: pseudo || null,
        tags: tags.length ? tags : [],
      }]);

      if (error) { console.error("Erreur ajout post :", error); showToast("Ajout impossible"); }
      else {
        setCaption(""); setMediaUrl(""); setHashtags(""); if (fileRef.current) fileRef.current.value = "";
        showToast("Post publié ✅"); await loadFirstPage();
      }
    } catch (err) { console.error("Upload failed:", err); showToast("Upload impossible"); }
  }

  /* ===================== Rendu ===================== */
  const filteredPosts = useMemo(() => {
    // masque auto : posts avec autoHidden[id] === true, sauf si l’utilisateur clique "afficher quand même"
    return posts.filter((p) => !autoHidden[p.id] || showHidden[p.id]);
  }, [posts, autoHidden, showHidden]);

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* HEADER */}
      <header className="fixed top-0 inset-x-0 h-16 z-40 bg-white/90 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="h-full max-w-5xl mx-auto px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="CancelMe" className="w-9 h-9 rounded-full" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">CancelMe</h1>
          </div>
          <button
            onClick={() => toggleTheme()}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <span className="text-sm">{dark ? "🌙 Sombre" : "🌞 Clair"}</span>
          </button>
        </div>
      </header>
      <div className="h-16" />

      {/* LAYOUT */}
      <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* SIDEBAR */}
        <aside className="md:sticky md:top-20 md:self-start space-y-4">
          {/* Classement */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 border border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">Classement</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "recent", label: "Récents" },
                { key: "top_day", label: "Top jour" },
                { key: "top_week", label: "Top semaine" },
                { key: "top_month", label: "Top mois" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortMode(key as SortMode)}
                  className={
                    "py-2 rounded text-sm " +
                    (sortMode === key
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Catégories */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 border border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Catégories</h2>
              <button
                onClick={() => setSelectedTag(null)}
                className={
                  "text-xs px-2 py-1 rounded " +
                  (selectedTag === null
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100")
                }
              >
                Tout
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {POPULAR_TAGS.map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedTag(t)}
                  className={
                    "px-3 py-1 rounded text-sm " +
                    (selectedTag === t
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100")
                  }
                >
                  #{t}
                </button>
              ))}
            </div>
          </div>

          {/* Pseudo */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 border border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">Pseudo (optionnel)</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="@tonpseudo"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="flex-1 border p-2 rounded bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                maxLength={24}
              />
              <button
                onClick={() => {
                  const v = guestName.trim();
                  if (!v) { localStorage.removeItem("cm:guestName"); showToast("Pseudo effacé"); }
                  else { localStorage.setItem("cm:guestName", v); showToast("Pseudo enregistré ✅"); }
                }}
                className="px-3 py-2 bg-gray-900 text-white rounded hover:bg-black"
                type="button"
              >
                OK
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Sera affiché sur tes posts et commentaires. Laisse vide pour publier en “Anonyme”.
            </p>
          </div>

          {/* Nouveau post */}
          <div ref={newPostRef} className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 border border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">Nouveau post</h2>
            <form onSubmit={addPost} className="space-y-2">
              <input
                ref={captionInputRef}
                type="text"
                placeholder="Écris ton message…"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full border p-2 rounded bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              />
              <input
                type="text"
                placeholder="Hashtags (ex: #gaming #travail)"
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                className="w-full border p-2 rounded bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              />
              <input
                type="text"
                placeholder="Lien image/vidéo (ou YouTube)"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                className="w-full border p-2 rounded bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              />
              <div className="text-center text-sm text-gray-500 dark:text-gray-400">— ou —</div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                className="w-full border p-2 rounded bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              />
              <button type="submit" className="w-full bg-gray-900 text-white py-2 rounded hover:bg-black">
                Poster
              </button>
            </form>
          </div>
        </aside>

        {/* FEED */}
        <section className="md:col-span-2">
          {loading ? (
            <p className="text-gray-700 dark:text-gray-300">Chargement…</p>
          ) : filteredPosts.length === 0 ? (
            <p className="text-gray-700 dark:text-gray-300">
              Aucun post pour le moment {Object.values(autoHidden).some(Boolean) ? "(des posts sont masqués automatiquement)" : ""}.
            </p>
          ) : (
            <>
              <ul className="space-y-4">
                {filteredPosts.map((post, idx) => {
                  const isSuspect = !!post.caption && BANNED_PATTERNS.some((re) => re.test(post.caption!));
                  const isAutoHidden = autoHidden[post.id] && !showHidden[post.id];
                  return (
                    <li key={post.id} className={"relative bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-100 dark:border-gray-800 " + (isAutoHidden ? "opacity-60" : "")}>
                      {/* Bandeau auto-hide */}
                      {autoHidden[post.id] && !showHidden[post.id] && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
                          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-3 text-center">
                            <p className="text-sm text-gray-800 dark:text-gray-200">
                              Masqué par la communauté ({reportCounts[post.id] || 0} signalement{(reportCounts[post.id] || 0) > 1 ? "s" : ""})
                            </p>
                            <button
                              onClick={() => setShowHidden((m) => ({ ...m, [post.id]: true }))}
                              className="mt-2 px-3 py-1.5 text-sm bg-gray-900 text-white rounded hover:bg-black"
                            >
                              Afficher quand même
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <p className="text-gray-800 dark:text-gray-100 font-semibold flex items-center gap-2">
                          {post.display_name
                            ? post.display_name
                            : post.username
                            ? post.username
                            : post.is_anonymous
                            ? "🤫 Anonyme"
                            : "Utilisateur"}
                          {isSuspect && <span className="text-[11px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">En révision</span>}
                        </p>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(post.created_at)}</span>
                      </div>

                      {post.caption && <p className="mt-2 text-gray-800 dark:text-gray-100">{post.caption}</p>}

                      {/* Média lazy — incrémente vue à la 1re apparition */}
                      {post.media_url && (
                        <LazyMedia
                          post={post}
                          onClick={() => { pauseAllVideos(); openViewer(idx); }}
                          onSeen={() => void incrementViewEveryTime(post)}
                        />
                      )}

                      {/* Actions */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => sharePost(post)}
                          className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Partager
                        </button>
                        <button
                          onClick={() => reportPost(post)}
                          className="px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                          title="Signaler ce contenu"
                        >
                          Signaler
                        </button>
                        <Link
                          href={`/post/${post.id}`}
                          className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 dark:text-gray-100 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                          onClick={() => void incrementViewEveryTime(post)}
                        >
                          Ouvrir la page
                        </Link>
                      </div>

                      {/* Tags */}
                      {post.tags && post.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {post.tags.map((t) => (
                            <button
                              key={t}
                              onClick={() => setSelectedTag(t)}
                              className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 dark:text-gray-100 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                              title={`Filtrer par #${t}`}
                            >
                              #{t}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Score + vues + reports */}
                      <div className="mt-3 mb-2 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                        <span>Score : {post.score ?? 0}</span>
                        <span>•</span>
                        <span>Vues : {post.views ?? 0}</span>
                        {reportCounts[post.id] ? (
                          <>
                            <span>•</span>
                            <span>Signalements (24h) : {reportCounts[post.id]}</span>
                          </>
                        ) : null}
                      </div>

                      {/* Réactions */}
                      <div className="grid grid-cols-4 gap-2 text-center">
                        {[
                          { k: "lol", emoji: "😂" as const },
                          { k: "cringe", emoji: "☠️" as const },
                          { k: "wtf", emoji: "💣" as const },
                          { k: "genius", emoji: "⚡" as const },
                        ].map(({ k, emoji }) => (
                          <button
                            key={k}
                            onClick={() => react(k as any, post)}
                            className="flex flex-col items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded py-2 text-gray-900 dark:text-gray-100"
                            title={k.toUpperCase()}
                          >
                            <span>{emoji}</span>
                            <span className="text-sm mt-1">{(post as any)[k] ?? 0}</span>
                          </button>
                        ))}
                      </div>

                      {/* Commentaires */}
                      <CommentsBlock
                        post={post}
                        openFor={openFor}
                        toggleComments={toggleComments}
                        commentInputs={commentInputs}
                        setCommentInputs={setCommentInputs}
                        addComment={addComment}
                        moderationErrorByPost={moderationErrorByPost}
                        commentsByPost={commentsByPost}
                        loadingComments={loadingComments}
                        hasMoreComments={hasMoreComments}
                        fetchComments={fetchComments}
                        setSelectedTag={setSelectedTag}
                      />
                    </li>
                  );
                })}
              </ul>

              {hasMore && (
                <button onClick={() => void loadMore()} disabled={isLoadingMore} className="mt-6 bg-gray-900 text-white px-4 py-2 rounded hover:bg-black disabled:opacity-60">
                  {isLoadingMore ? "Chargement..." : "Charger plus"}
                </button>
              )}
            </>
          )}
        </section>
      </div>

      {/* Viewer */}
      {viewerOpen && filteredPosts[viewerIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onTouchStart={(e) => { const t = e.touches[0]; touchStartX.current = t.clientX; touchStartY.current = t.clientY; }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null || touchStartY.current === null) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - touchStartX.current; const dy = t.clientY - touchStartY.current;
            touchStartX.current = null; touchStartY.current = null;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) { if (dx < 0) nextViewer(); else prevViewer(); }
          }}
        >
          <button onClick={() => closeViewer()} className="absolute top-4 right-4 bg-white/10 text-white px-3 py-1.5 rounded" aria-label="Fermer">✕</button>
          <button onClick={() => prevViewer()} className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 text-white px-3 py-2 rounded" aria-label="Précédent">←</button>
          <button onClick={() => nextViewer()} className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 text-white px-3 py-2 rounded" aria-label="Suivant">→</button>

          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <p className="text-gray-800 dark:text-gray-100 font-semibold">
                {filteredPosts[viewerIndex].display_name
                  ? filteredPosts[viewerIndex].display_name
                  : filteredPosts[viewerIndex].username
                  ? filteredPosts[viewerIndex].username
                  : filteredPosts[viewerIndex].is_anonymous
                  ? "🤫 Anonyme"
                  : "Utilisateur"}
              </p>
              <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(filteredPosts[viewerIndex].created_at)}</span>
            </div>

            {filteredPosts[viewerIndex].media_url &&
              (filteredPosts[viewerIndex].media_type === "youtube"
                ? (
                  (() => {
                    const id = parseYouTubeId(filteredPosts[viewerIndex].media_url || "");
                    return id ? (
                      <div className="mt-2 w-full aspect-video rounded overflow-hidden">
                        <iframe
                          className="w-full h-full"
                          src={`https://www.youtube.com/embed/${id}`}
                          title="YouTube video"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                          loading="lazy"
                        />
                      </div>
                    ) : null;
                  })()
                )
                : filteredPosts[viewerIndex].media_type === "video"
                ? <video src={filteredPosts[viewerIndex].media_url || ""} controls autoPlay className="mt-2 rounded w-full" />
                : <img src={filteredPosts[viewerIndex].media_url || ""} alt="media" className="mt-2 rounded w-full" />
              )}

            <div className="mt-3 flex gap-2">
              <button onClick={() => sharePost(filteredPosts[viewerIndex])} className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Partager</button>
              <button onClick={() => reportPost(filteredPosts[viewerIndex])} className="px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700">Signaler</button>
              <Link href={`/post/${filteredPosts[viewerIndex].id}`} className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 dark:text-gray-100 rounded hover:bg-gray-200 dark:hover:bg-gray-600">Ouvrir la page</Link>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.show && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-black/80 text-white text-sm" role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => goToNewPost()}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center text-white bg-gray-900 hover:bg-black shadow-lg"
        title="Nouveau post"
        aria-label="Nouveau post"
      >
        +
      </button>
    </main>
  );
}

/* ===================== Sous-composants ===================== */

function CommentsBlock(props: {
  post: Post;
  openFor: Record<string, boolean>;
  toggleComments: (postId: string) => void;
  commentInputs: Record<string, string>;
  setCommentInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  addComment: (postId: string) => Promise<void>;
  moderationErrorByPost: Record<string, string | null>;
  commentsByPost: Record<string, CMComment[]>;
  loadingComments: Record<string, boolean>;
  hasMoreComments: Record<string, boolean>;
  fetchComments: (postId: string, append?: boolean) => Promise<void>;
  setSelectedTag: (t: string | null) => void;
}) {
  const {
    post, openFor, toggleComments, commentInputs, setCommentInputs,
    addComment, moderationErrorByPost, commentsByPost,
    loadingComments, hasMoreComments, fetchComments, setSelectedTag,
  } = props;

  function renderCommentText(str: string) {
    const parts = str.split(/([#@][\p{L}\d_]+)/gu);
    return parts.map((p, i) => {
      if (/^#[\p{L}\d_]+$/u.test(p)) {
        const tag = p.slice(1);
        return (
          <button
            key={i}
            onClick={() => setSelectedTag(tag)}
            className="text-blue-600 dark:text-blue-400 hover:underline"
            title={`Filtrer par #${tag}`}
          >
            {p}
          </button>
        );
      }
      if (/^@[\p{L}\d_]+$/u.test(p)) {
        return <span key={i} className="text-purple-700 dark:text-purple-300">{p}</span>;
      }
      return <span key={i}>{p}</span>;
    });
  }

  return (
    <div className="mt-4">
      <button onClick={() => toggleComments(post.id)} className="text-sm text-gray-700 dark:text-gray-300 underline">
        {openFor[post.id] ? "Masquer les commentaires" : `Afficher les commentaires`}
      </button>

      {openFor[post.id] && (
        <div className="mt-3">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Écrire un commentaire…"
                value={commentInputs[post.id] || ""}
                onChange={(e) => setCommentInputs((m) => ({ ...m, [post.id]: e.target.value }))}
                className="flex-1 border p-2 rounded bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                maxLength={1000}
              />
              <button onClick={() => void addComment(post.id)} className="px-3 py-2 bg-gray-900 text-white rounded hover:bg-black">
                Publier
              </button>
            </div>
            {moderationErrorByPost[post.id] && <p className="text-xs text-red-500">{moderationErrorByPost[post.id]}</p>}
          </div>

          <PostComments
            postId={post.id}
            comments={commentsByPost[post.id] || []}
            loading={!!loadingComments[post.id]}
            hasMore={!!hasMoreComments[post.id]}
            onLoadMore={() => void fetchComments(post.id, true)}
            renderCommentText={renderCommentText}
          />
        </div>
      )}
    </div>
  );
}

function PostComments({
  postId,
  comments,
  loading,
  hasMore,
  onLoadMore,
  renderCommentText,
}: {
  postId: string;
  comments: CMComment[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  renderCommentText: (s: string) => React.ReactNode;
}) {
  return (
    <div className="mt-3 space-y-2">
      {loading && !comments.length ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Chargement…</p>
      ) : comments.length ? (
        <>
          {comments.map((c) => (
            <div key={c.id} className="bg-gray-50 dark:bg-gray-900 rounded p-2 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <p className="text-[13px] text-gray-700 dark:text-gray-200 font-medium">{c.display_name || "Anonyme"}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{new Date(c.created_at).toLocaleString("fr-FR")}</p>
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-100 mt-1">{renderCommentText(c.content)}</p>
            </div>
          ))}
          {hasMore && (
            <button onClick={onLoadMore} className="mt-2 text-sm underline text-gray-700 dark:text-gray-300">
              {loading ? "Chargement..." : "Charger plus"}
            </button>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">Aucun commentaire pour le moment.</p>
      )}
    </div>
  );
}
