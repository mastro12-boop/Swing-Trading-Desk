export default async function handler(req, res) {
  const KEY = process.env.FINNHUB_API_KEY;
  if (!KEY) return res.status(500).json({ error: "FINNHUB_API_KEY not set" });
  const from = new Date().toISOString().split("T")[0];
  const to = new Date(Date.now()+30*86400000).toISOString().split("T")[0];
  try {
    const r = await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${KEY}`);
    const data = await r.json();
    res.json({earnings:(data.earningsCalendar||[]).map(e=>({ticker:e.symbol||"",date:e.date||"",time:e.hour===0?"BMO":e.hour===4?"AMC":"",epsEstimate:e.epsEstimate,quarter:e.quarter,year:e.year}))});
  } catch(err){res.status(500).json({error:err.message})}
}
