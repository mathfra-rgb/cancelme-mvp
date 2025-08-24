"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/utils/supabase";

const supabase = createClient();

interface Post {
  id: string;
  caption: string;
  media_url: string;
  media_type: string;
  username?: string;
  is_anonymous: boolean;
  score: number;
  lol_count?: number;
  cringe_count?: number;
  wtf_count?: number;
  genius_count?: number;
  views?: number;
  created_at: string;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
}

export default function PostPage() {
  const { id } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchPost(id as string);
      fetchComments(id as string);
      incrementView(id as string);
    }
  }, [id]);

  async function fetchPost(postId: string) {
    const { data, error } = await supabase
      .from("posts_with_profiles")
      .select("*")
      .eq("id", postId)
      .single();

    if (!error) setPost(data as Post);
    setLoading(false);
  }

  async function fetchComments(postId: string) {
    const { data, error } = await supabase
      .from("comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (!error) setComments(data as Comment[]);
  }

  async function addComment(postId: string) {
    if (!newComment.trim()) return;
    const { error } = await supabase
      .from("comments")
      .insert({ post_id: postId, content: newComment });

    if (!error) {
      setComments((prev) => [...prev, { id: crypto.randomUUID(), content: newComment, created_at: new Date().toISOString() }]);
      setNewComment("");
    }
  }

  async function react(postId: string, kind: "lol" | "cringe" | "wtf" | "genius") {
    await supabase.from("reactions").insert({ post_id: postId, kind });
    setPost((prev) =>
      prev
        ? { ...prev, [`${kind}_count`]: (prev[`${kind}_count` as keyof Post] as number || 0) + 1 }
        : prev
    );
  }

  async function incrementView(postId: string) {
    await supabase.rpc("increment_view", { pid: postId, delta: 1 });
  }

  function sharePost() {
    if (!post) return;
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    alert("Lien copié dans le presse-papier !");
  }

  if (loading) return <p className="p-6">Chargement...</p>;
  if (!post) return <p className="p-6">Post introuvable</p>;

  return (
    <main className="min-h-screen bg-gray-100 dark:bg-gray-900 p-6">
      <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
        <p className="font-semibold text-gray-800 dark:text-gray-200">
          {post.is_anonymous ? "🤫 Anonyme" : post.username || "Utilisateur"}
        </p>
        <p className="mt-2 text-gray-900 dark:text-gray-100">{post.caption}</p>

        {/* Media */}
        {post.media_url && (
          post.media_type === "video" ? (
            <video src={post.media_url} controls className="mt-2 rounded" />
          ) : (
            <img src={post.media_url} alt="media" className="mt-2 rounded" />
          )
        )}

        {/* Stats */}
        <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Vues : {post.views ?? 0}
        </div>

        {/* Réactions */}
        <div className="mt-3 flex gap-3">
          <button onClick={() => react(post.id, "lol")} className="px-3 py-1 bg-yellow-500 text-white rounded">😂 LOL {post.lol_count ?? 0}</button>
          <button onClick={() => react(post.id, "cringe")} className="px-3 py-1 bg-purple-500 text-white rounded">😬 Cringe {post.cringe_count ?? 0}</button>
          <button onClick={() => react(post.id, "wtf")} className="px-3 py-1 bg-blue-500 text-white rounded">🤯 WTF {post.wtf_count ?? 0}</button>
          <button onClick={() => react(post.id, "genius")} className="px-3 py-1 bg-green-500 text-white rounded">🧠 Genius {post.genius_count ?? 0}</button>
        </div>

        {/* Partager */}
        <div className="mt-3">
          <button onClick={sharePost} className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            🔗 Partager
          </button>
        </div>

        {/* Commentaires */}
        <div className="mt-4">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">Commentaires</h3>
          <ul className="mt-2 space-y-2">
            {comments.map((c) => (
              <li key={c.id} className="p-2 bg-gray-100 dark:bg-gray-700 rounded text-gray-900 dark:text-gray-100">
                {c.content}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Écrire un commentaire..."
              className="flex-1 px-3 py-2 border rounded dark:bg-gray-900 dark:text-white"
            />
            <button onClick={() => addComment(post.id)} className="px-3 py-2 bg-gray-900 text-white rounded hover:bg-black">
              Publier
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
