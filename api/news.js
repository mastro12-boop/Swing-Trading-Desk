export default async function handler(req, res) {
  const KEY = process.env.FINNHUB_API_KEY;
  if (!KEY) return res.status(500).json({ error: "FINNHUB_API_KEY not set" });
  try {
    const r = await fetch(`https://finnhub.io/api/v1/news?category=${req.query.category||"general"}&token=${KEY}`);
    const data = await r.json();
    res.json({articles:(Array.isArray(data)?data:[]).slice(0,20).map(a=>({title:a.headline||"",source:a.source||"",url:a.url||"",time:a.datetime?new Date(a.datetime*1000).toLocaleString():"",summary:a.summary||"",category:a.category||"general"}))});
  } catch(err){res.status(500).json({error:err.message})}
}
