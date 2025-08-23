"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../../utils/supabase";

const supabase = createClient();

export default function PostDetail() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function run() {
      if (!id) return;
      const { data, error } = await supabase.from("posts_with_profiles").select("*").eq("id", id).single();
      if (error) console.error(error);
      setPost(data);
      setLoading(false);
    }
    run();
  }, [id]);

  if (loading) return <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 text-gray-900 dark:text-gray-100">Chargement…</main>;
  if (!post) return <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 text-gray-900 dark:text-gray-100">Post introuvable.</main>;

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 text-gray-900 dark:text-gray-100">
      <Link href="/" className="inline-block mb-4 underline">← Retour</Link>
      <h1 className="text-xl font-bold mb-3">{post.display_name || post.username || (post.is_anonymous ? "🤫 Anonyme" : "Utilisateur")}</h1>
      {post.caption && <p className="mb-3">{post.caption}</p>}
      {post.media_url && (post.media_type === "video"
        ? <video src={post.media_url} controls className="rounded w-full max-w-xl" />
        : <img src={post.media_url} alt="media" className="rounded w-full max-w-xl" />
      )}
      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Score: {post.score ?? 0}</p>
    </main>
  );
}
