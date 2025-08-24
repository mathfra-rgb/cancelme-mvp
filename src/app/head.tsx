export default function Head() {
  const title = "CancelMe — balance tes moments LOL, cringe, wtf ou géniaux";
  const description = "L'appli anonyme où tu partages des moments drôles, gênants ou brillants. Réagis en LOL / CRINGE / WTF / GENIUS. Essaie maintenant !";
  const url = "https://ton-domaine.vercel.app"; // ← si tu as un domaine custom, mets-le ici
  const ogImage = "/logo.png"; // ton logo dans /public

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:title" content="CancelMe" />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="CancelMe" />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* Favicon */}
      <link rel="icon" href="/favicon.ico" />
    </>
  );
}
