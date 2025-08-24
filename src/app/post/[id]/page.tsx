"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/utils/supabase";

const supabase = createClient();

type MediaType = "image" | "video" | "youtube";

interface Post {
  id: string;
  caption: string;
  media_url: string;
  media_type: MediaType;
  score: number;
  views?: number;
  created_at: string;
}

function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    // youtu.be/<id>
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "");
      return `https://www.youtube.com/embed/${id}`;
    }
    // /shorts/<id>
    if (u.hostname.includes("youtube.com") && u.pathname.startsWith("/shorts/")) {
      const id = u.pathname.split("/")[2];
      return `https://www.youtube.com/embed/${id}`;
    }
    // watch?v=<id>
    if (u.hostname.includes("youtube.com") && u.searchParams.get("v")) {
      const id = u.searchParams.get("v");
      return `https://www.youtube.com/embed/${id}`;
    }
    return url;
  } catch {
    return url;
  }
}

export default function PostPage() {
  const params = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.id) return;
    fetchPost(params.id as string);
  }, [params?.id]);

  async function fetchPost(id: string) {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .eq("id", id)
      .single();

    if (error) console.error("Erreur chargement post:", error);
    setPost(data as Post);
    setLoading(false);
  }

  if (loading) return <p className="p-6">Chargement...</p>;
  if (!post) return <p className="p-6">Post introuvable.</p>;

  const media = (() => {
    if (!post.media_url) return null;
    if (post.media_type === "video") {
      return <video src={post.media_url} controls className="w-full rounded" />;
    }
    if (post.media_type === "youtube") {
      const src = toEmbedUrl(post.media_url);
      return (
        <iframe
          className="w-full aspect-video rounded"
          src={src}
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      );
    }
    return <img src={post.media_url} alt="media" className="w-full rounded" />;
  })();

  return (
    <main className="min-h-screen bg-gray-100 dark:bg-black flex flex-col items-center p-6 text-black dark:text-white">
      <h1 className="text-2xl font-bold mb-4">Détail du post</h1>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 max-w-md w-full">
        <p className="font-semibold mb-2">{post.caption}</p>
        {media}
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Score : {post.score} | Vues : {post.views ?? 0}
        </p>
      </div>
    </main>
  );
}
