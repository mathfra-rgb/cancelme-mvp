"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "../../utils/supabase";

/** Supabase client (lit NEXT_PUBLIC_SUPABASE_URL / ANON_KEY) */
const supabase = createClient();

/* ----------------------------- Types ----------------------------- */
type MediaType = "image" | "video" | "youtube";

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

/* --------------------------- Helpers ----------------------------- */
function extractYouTubeId(url: string): string {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&?/]+)/,
  );
  return match ? match[1] : url;
}

function isYouTube(url: string | null | undefined) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be");
  } catch {
    return false;
  }
}

function markViewedOncePerSession(postId: string) {
  if (typeof window === "undefined") return false;
  const key = `cm:viewed:${postId}`;
  if (sessionStorage.getItem(key)) return false;
  sessionStorage.setItem(key, "1");
  return true;
}

/* ------------------------------ Page ----------------------------- */
export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");

  useEffect(() => {
    if (!id) return;
    loadPost(id);
    loadComments(id);
  }, [id]);

  async function loadPost(postId: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from("posts_with_profiles")
      .select("*")
      .eq("id", postId)
      .single();

    if (error) {
      console.error(error);
      setPost(null);
      setLoading(false);
      return;
    }

    const p = (data as unknown as Post) || null;
    setPost(p);
    setLoading(false);

    // Vues +1 par session
    if (p && markViewedOncePerSession(p.id)) {
      setPost((prev) => (prev ? { ...prev, views: (prev.views ?? 0) + 1 } : prev));
      try {
        await supabase.rpc("increment_view", { pid: p.id, delta: 1 });
      } catch {
        /* silencieux */
      }
    }
  }

  async function loadComments(postId: string) {
    const { data, error } = await supabase
      .from("comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    if (!error) setComments(((data as unknown as Comment[]) || []) as Comment[]);
  }

  async function addComment() {
    if (!post || !newComment.trim()) return;
    const payload = {
      post_id: post.id,
      content: newComment.trim(),
      display_name: "Anonyme",
    };

    // Optimiste
    const temp: Comment = {
      id: `temp-${Date.now()}`,
      post_id: post.id,
      content: payload.content,
      display_name: payload.display_name,
      created_at: new Date().toISOString(),
    };
    setComments((prev) => [...prev, temp]);
    setNewComment("");

    try {
      const { data, error } = await supabase
        .from("comments")
        .insert(payload as unknown as Record<string, unknown>)
        .select("*")
        .single();
      if (!error && data) {
        setComments((prev) => [
          ...prev.filter((c) => !c.id.startsWith("temp-")),
          data as unknown as Comment,
        ]);
      }
    } catch (e) {
      console.warn(e);
    }
  }

  async function react(kind: "lol" | "cringe" | "wtf" | "genius") {
    if (!post) return;

    // UI optimiste
    setPost((prev) =>
      prev
        ? {
            ...prev,
            [kind]: (Number(prev[kind] ?? 0) + 1) as number,
            score: (Number(prev.score ?? 0) + 1) as number,
          }
        : prev,
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

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({ url, title: "CancelMe", text: post?.caption || "" });
      } else {
        await navigator.clipboard.writeText(url);
        alert("Lien copié !");
      }
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-100 dark:bg-gray-900 p-6">
        <div className="max-w-2xl mx-auto text-gray-800 dark:text-gray-100">Chargement…</div>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="min-h-screen bg-gray-100 dark:bg-gray-900 p-6">
        <div className="max-w-2xl mx-auto text-gray-800 dark:text-gray-100">Post introuvable.</div>
      </main>
    );
  }

  const isYT = isYouTube(post.media_url);

  return (
    <main className="min-h-screen bg-gray-100 dark:bg-gray-900 p-6">
      <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-100 dark:border-gray-800">
        {/* En-tête */}
        <div className="flex items-center justify-between">
          <a href="/" className="text-sm underline text-gray-700 dark:text-gray-300">
            ← Retour au feed
          </a>
          <div className="text-xs text-gray-500">
            Score: {post.score ?? 0} • Vues: {post.views ?? 0}
          </div>
        </div>

        {/* Auteur + tags */}
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
          {post.is_anonymous ? "🤫 Anonyme" : post.display_name || post.username || "Utilisateur"}
          {post.tags && post.tags.length > 0 && (
            <span className="ml-2 text-xs text-gray-500">
              {post.tags.slice(0, 6).map((t) => `#${t}`).join(" ")}
            </span>
          )}
        </p>

        {/* Légende */}
        {post.caption && (
          <p className="mt-2 text-gray-900 dark:text-gray-100">{post.caption}</p>
        )}

        {/* Média */}
        {post.media_url && (
          isYT ? (
            <div className="mt-3 aspect-video w-full">
              <iframe
                className="w-full h-full rounded"
                src={`https://www.youtube.com/embed/${extractYouTubeId(post.media_url)}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                // Compte une vue au chargement (déjà gérée au mount, ceci est redondant acceptable)
              />
            </div>
          ) : post.media_type === "video" ? (
            <video
              src={post.media_url}
              controls
              className="mt-3 rounded w-full"
            />
          ) : (
            <img
              src={post.media_url}
              alt=""
              className="mt-3 rounded w-full"
            />
          )
        )}

        {/* Réactions */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => react("lol")}
            className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm text-gray-800 dark:text-white"
          >
            😂 LOL {Number(post.lol ?? 0) > 0 ? `(${post.lol})` : ""}
          </button>
          <button
            onClick={() => react("cringe")}
            className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm text-gray-800 dark:text-white"
          >
            😬 Cringe {Number(post.cringe ?? 0) > 0 ? `(${post.cringe})` : ""}
          </button>
          <button
            onClick={() => react("wtf")}
            className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm text-gray-800 dark:text-white"
          >
            🤯 WTF {Number(post.wtf ?? 0) > 0 ? `(${post.wtf})` : ""}
          </button>
          <button
            onClick={() => react("genius")}
            className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm text-gray-800 dark:text-white"
          >
            🧠 Genius {Number(post.genius ?? 0) > 0 ? `(${post.genius})` : ""}
          </button>
        </div>

        {/* Partager */}
        <div className="mt-3">
          <button
            onClick={share}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            🔗 Partager
          </button>
        </div>

        {/* Commentaires */}
        <div className="mt-6">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">Commentaires</h3>
          <ul className="mt-2 space-y-2">
            {comments.map((c) => (
              <li
                key={c.id}
                className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded text-sm text-gray-800 dark:text-white"
              >
                <b>{c.display_name || "Anonyme"}:</b> {c.content}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Écrire un commentaire…"
              className="flex-1 min-w-0 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <button
              onClick={addComment}
              className="px-3 py-2 bg-gray-900 text-white rounded hover:bg-black"
            >
              Publier
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
