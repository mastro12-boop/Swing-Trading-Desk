export default async function handler(req, res) {
  const KEY = process.env.NEWS_API_KEY;
  if (!KEY) return res.status(500).json({ error: "NEWS_API_KEY not set" });
  const source = req.query.source || "bbc-news";
  try {
    const r = await fetch(`https://newsapi.org/v2/top-headlines?sources=${source}&pageSize=5&apiKey=${KEY}`);
    const data = await r.json();
    if (data.status === "ok") {
      res.json({ articles: (data.articles || []).map(a => ({ title: a.title || "", source: a.source?.name || source, url: a.url || "", publishedAt: a.publishedAt || "", description: a.description || "" })) });
    } else {
      res.status(400).json({ error: data.message || "NewsAPI error" });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
}
