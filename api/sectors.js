export default async function handler(req, res) {
  const KEY = process.env.ALPHA_VANTAGE_KEY;
  if (!KEY) return res.status(500).json({ error: "ALPHA_VANTAGE_KEY not set" });
  try {
    const r = await fetch(`https://www.alphavantage.co/query?function=SECTOR&apikey=${KEY}`);
    const data = await r.json();
    if (data["Note"] || data["Information"]) return res.status(429).json({ error: "Alpha Vantage rate limit hit" });
    
    const SECTOR_MAP = {
      "Information Technology": "Technology",
      "Consumer Discretionary": "Consumer Disc.",
      "Communication Services": "Comm Services",
      "Health Care": "Health Care",
      "Financials": "Financials",
      "Industrials": "Industrials",
      "Consumer Staples": "Consumer Staples",
      "Energy": "Energy",
      "Utilities": "Utilities",
      "Real Estate": "Real Estate",
      "Materials": "Materials",
    };

    const timeframes = {
      day: "Rank A: Real-Time Performance",
      week: "Rank C: 5 Day Performance",
      month: "Rank D: 1 Month Performance",
      ytd: "Rank F: Year-to-Date (YTD) Performance",
    };

    const result = {};
    Object.entries(timeframes).forEach(([key, avKey]) => {
      const raw = data[avKey];
      if (!raw) return;
      result[key] = Object.entries(raw)
        .filter(([sector]) => SECTOR_MAP[sector])
        .map(([sector, val]) => ({
          name: SECTOR_MAP[sector],
          value: parseFloat(val) || 0,
          display: val,
        }))
        .sort((a, b) => b.value - a.value);
    });

    res.json({ sectors: result, timestamp: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
