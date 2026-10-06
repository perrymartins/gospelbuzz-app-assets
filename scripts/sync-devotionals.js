const fs = require('fs');
const path = require('path');

const WP_POSTS_URL = 'https://gospelbuzz.com/wp-json/wp/v2/posts';
const DEVOTIONAL_CATEGORY_ID = 19;
const OUT_DIR = path.join(__dirname, '..', 'devotionals');

function trimEmbedded(post) {
  const media = post._embedded?.['wp:featuredmedia']?.[0];
  const sizes = media?.media_details?.sizes ?? {};
  return {
    'wp:featuredmedia': media
      ? [{
          source_url: media.source_url,
          media_details: {
            sizes: {
              medium_large: sizes.medium_large ? { source_url: sizes.medium_large.source_url } : undefined,
              full: sizes.full ? { source_url: sizes.full.source_url } : undefined,
            },
          },
        }]
      : [],
  };
}

function toFullPost(post) {
  return {
    id: post.id,
    date: post.date,
    link: post.link,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    featured_media: post.featured_media,
    _embedded: trimEmbedded(post),
  };
}

function toIndexEntry(full) {
  return { ...full, content: { rendered: '' } };
}

async function fetchAllDevotionals() {
  const posts = [];
  for (let page = 1; ; page++) {
    const url = `${WP_POSTS_URL}?categories=${DEVOTIONAL_CATEGORY_ID}&per_page=100&page=${page}&_embed=true&status=publish`;
    const res = await fetch(url);
    if (res.status === 400) break;
    if (!res.ok) throw new Error(`WordPress returned ${res.status} on page ${page}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    posts.push(...batch.map(toFullPost));
    if (batch.length < 100) break;
  }
  return posts.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function writeIfChanged(file, data) {
  const next = JSON.stringify(data);
  const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (next === previous) return false;
  fs.writeFileSync(file, next);
  return true;
}

async function main() {
  const posts = await fetchAllDevotionals();
  if (posts.length === 0) {
    throw new Error('No devotionals returned; refusing to overwrite existing files');
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let changed = 0;
  for (const post of posts) {
    if (writeIfChanged(path.join(OUT_DIR, `${post.id}.json`), post)) changed++;
  }

  const indexChanged = writeIfChanged(
    path.join(OUT_DIR, 'index.json'),
    posts.map(toIndexEntry),
  );

  console.log(`Synced ${posts.length} devotionals (${changed} changed, index ${indexChanged ? 'updated' : 'unchanged'}).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
