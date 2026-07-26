export default async function handler(req, res) {
  const KEY = process.env.FINNHUB_API_KEY;
  if (!KEY) return res.status(500).json({ error: "FINNHUB_API_KEY not set" });
  const symbol = (req.query.symbol||"").toUpperCase().trim();
  if (!symbol) return res.status(400).json({ error: "symbol required" });
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${KEY}`);
    const data = await r.json();
    data.c ? res.json({symbol,price:data.c,high:data.h,low:data.l,open:data.o,prevClose:data.pc,change:data.d,changePercent:data.dp}) : res.status(404).json({error:"Symbol not found"});
  } catch(err){res.status(500).json({error:err.message})}
}
