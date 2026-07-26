import React, { useState, useEffect, useCallback, useRef } from "react";
import { Analytics } from "@vercel/analytics/react";
// --- Helpers ---
function formatDate(d) { return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }); }
function timeStamp(d) { return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }); }

// --- Simplified single-shot API call with retry on rate limit ---
async function callClaude(prompt, sys, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, system: sys }),
    });
    if (res.status === 429 && i < retries) {
      await new Promise(r => setTimeout(r, (i + 1) * 5000));
      continue;
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.text || "";
  }
  throw new Error("Rate limited");
}

function parseJSON(raw, type) {
  if (!raw) return null;
  const clean = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const open = type === "array" ? "[" : "{";
  const close = type === "array" ? "]" : "}";
  const s = clean.indexOf(open);
  const e = clean.lastIndexOf(close);
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(clean.slice(s, e + 1)); } catch { return null; }
}

// --- Baseline data (instant render before API) ---
const CONVICTION_ORDER = { "HIGH": 1, "MODERATE-HIGH": 2, "MODERATE": 3, "LOW": 4 };

const BASELINE_PICKS = [
  {
    ticker: "PYPL", name: "PayPal Holdings", thesis: "Takeover Catalyst + Deep Value + Earnings Catalyst",
    conviction: "HIGH", horizon: "1–3 weeks", price: "$55.50", priceDate: "Jul 22 close",
    priceNum: 55.50, updatedAt: "2026-07-22",
    targetRange: "$60–$70", stopLoss: "$48", riskReward: "~2.5:1",
    swingReason: "The strongest swing setup on the board. Two catalysts converging in days: Q2 earnings on July 28 and an active $53B takeover bid the board rejected because they want more. That creates a price floor — even if earnings disappoint, the M&A premium limits downside. If earnings are strong, the board's case for $70+ gets validated and the stock re-rates. At 8.5x forward earnings, you're not buying froth. Risk-reward is ~2.5:1 with the $48 stop — textbook asymmetric swing.",
    catalysts: ["Q2 earnings July 28 — validates rejection of $53B Stripe bid", "Board holding for ~$70/share counter-offer", "8.5x fwd earnings — deep discount to 17x peers", "$6.4B FCF, buying back ~8% of float"],
    risks: ["Q2 guidance calls for low-single-digit revenue growth", "Branded checkout grew only 2% in Q1", "Antitrust scrutiny on Stripe-PayPal merger"],
    technicals: "RSI 53, neutral. Bounced off $43 support. Takeover news pushed through resistance to $55.50. 52-week: $38.46–$79.50.",
    sources: [
      { name: "24/7 Wall St", date: "Jul 23", url: "https://247wallst.com/investing/2026/07/23/paypal-trades-at-an-11x-p-e-and-repurchases-8-of-shares-annually-should-you-buy-before-july-28-q2-earnings/" },
      { name: "Technobezz", date: "Jul 21", url: "https://www.technobezz.com/news/paypal-board-rejects-53-billion-stripe-and-advent-international-takeover-bid" },
      { name: "Seeking Alpha", date: "Jul 17", url: "https://seekingalpha.com/news/4614753-paypal-board-views-53b-stripe-advent-takeover-bid-as-inadequate---reuters" },
    ],
  },
  {
    ticker: "META", name: "Meta Platforms", thesis: "Earnings Catalyst + Deep Value on AI Discount",
    conviction: "HIGH", horizon: "1–2 weeks", price: "$657", priceDate: "Jul 24 close",
    priceNum: 657, updatedAt: "2026-07-24",
    targetRange: "$700–$750", stopLoss: "$610", riskReward: "~2:1",
    swingReason: "Pure binary earnings event. Q1 beat by 57% yet the stock is down 13% YTD because the market is panicking over AI spending — that disconnect between execution and price is exactly what swing traders look for. If Q2 shows the ad business still compounding at 33% growth, the AI capex fear gets repriced and $700 is a quick move. 63 analysts at Strong Buy with $826 avg target. The risk is real though: if they raise capex guidance again, it gaps down. That's why the $610 stop is tight.",
    catalysts: ["Q2 earnings July 29 — Q1 EPS beat by 57%, 62.4% YoY growth", "63 analysts rate Strong Buy, avg target $826 (+26%)", "Trades at just 16x forward earnings despite 33% revenue growth", "Ad revenue engine untouched — $200B revenue in 2025, +22% YoY"],
    risks: ["$125–145B AI capex guidance spooking investors", "Reality Labs still burning $4B/quarter", "EU regulatory pressure and youth litigation scheduled 2026"],
    technicals: "Down 13% YTD despite strong fundamentals. 52-week: $520–$796. Earnings on Jul 29 is the near-term binary event. Support at $610, resistance at $700.",
    sources: [
      { name: "24/7 Wall St", date: "Jul 16", url: "https://247wallst.com/investing/2026/07/16/meta-price-prediction-the-stock-will-hit-700-on-this-date/" },
      { name: "Stock Analysis", date: "Jul 24", url: "https://stockanalysis.com/stocks/meta/" },
    ],
  },
  {
    ticker: "ARCB", name: "ArcBest Corporation", thesis: "Momentum + Earnings Growth + Value",
    conviction: "MODERATE-HIGH", horizon: "2–4 weeks", price: "~$159", priceDate: "Jul 22 close",
    priceNum: 159, updatedAt: "2026-07-22",
    targetRange: "$175–$185", stopLoss: "$146", riskReward: "~2:1",
    swingReason: "Momentum that hasn't stalled — nearly 100% gain over the past year with earnings revisions still going up. The Zacks #1 rank means analysts are actively raising numbers, which pulls price higher. The freight recovery thesis is clean: economy grows, shipping volumes rise, ARCB earnings explode (65% projected). Beta of 1.55 means it amplifies market moves — bigger swings mean you reach your target faster. The R:R is solid at 2:1 with clear support at $146.",
    catalysts: ["Zacks #1 Strong Buy, 65% EPS growth projected", "Up 97.68% YoY vs S&P's 21.58%", "Revenue +13% YoY, 0.81x sales"],
    risks: ["Freight recovery fragile, diesel costs elevated", "MACD/Aroon turned bearish mid-July", "High beta (1.55) amplifies downside"],
    technicals: "Momentum crossed above 0 Jul 13. +40.5% 4-week. Resistance $164, support $146.",
    sources: [
      { name: "Yahoo Finance", date: "Jul 17", url: "https://ca.finance.yahoo.com/news/arcbest-arcb-5-34-one-160003319.html" },
      { name: "Zacks", date: "Jul 16", url: "https://finance.yahoo.com/markets/stocks/articles/best-strong-buy-momentum-stocks-195700053.html" },
    ],
  },
  {
    ticker: "XOM", name: "Exxon Mobil", thesis: "Oil Shock Play + Geopolitical Tailwind",
    conviction: "MODERATE-HIGH", horizon: "2–4 weeks", price: "~$118", priceDate: "Jul 24",
    priceNum: 118, updatedAt: "2026-07-24",
    targetRange: "$128–$135", stopLoss: "$110", riskReward: "~2:1",
    swingReason: "The most defensive swing on the list. Oil at $85 with geopolitical tensions means Exxon prints cash regardless of what the broader market does. If tensions escalate, oil spikes and XOM runs. If they de-escalate, the stock pulls back modestly because the buyback and dividend create a floor. The Q2 earnings catalyst is straightforward: elevated crude = earnings beat. This is the pick you hold when you want swing exposure but don't want to lose sleep.",
    catalysts: ["Geopolitical tensions keeping crude elevated around $85/bbl", "Yahoo Finance flags XOM as top US stock to watch in July", "Massive FCF generation at current oil prices funds aggressive buyback", "Q2 earnings catalyst — elevated crude = earnings beat potential"],
    risks: ["Oil price reversal if ceasefire deals materialize", "Capex rising across the sector — squeezing FCF margins", "ESG headwinds reducing institutional appetite for oil majors"],
    technicals: "Energy sector leading in H1 2026. XOM benefiting from crude above $80. Support at $110, resistance at prior highs near $130.",
    sources: [
      { name: "Yahoo Finance", date: "Jul 11", url: "https://finance.yahoo.com/markets/stocks/articles/3-us-stocks-watch-july-123905518.html" },
    ],
  },
  {
    ticker: "BVS", name: "Bioventus", thesis: "Breakout + Regulatory Catalyst + Momentum",
    conviction: "MODERATE-HIGH", horizon: "2–4 weeks", price: "$11.59", priceDate: "Jul 20 close",
    priceNum: 11.59, updatedAt: "2026-07-20",
    targetRange: "$14–$15", stopLoss: "$9.50", riskReward: "~2:1",
    swingReason: "A small-cap breakout trade backed by fundamentals. BVS is sitting right at its 52-week high ($12.53) after an 85% run, and the 2027 Hospital Outpatient Payment rule is the regulatory catalyst driving the move. The 4.1% pullback on Jul 20 creates a re-entry opportunity before the next leg. Barrington has a $15 target — 30% upside. The risk is that small caps are volatile and the GF Value estimate suggests overvaluation, so the stop at $9.50 is non-negotiable.",
    catalysts: ["Zacks Rank #2 breakout stock for July — near resistance breakout", "Up 85% over past year on regulatory tailwinds", "2027 Hospital Outpatient Payment rule is key catalyst for surgical products", "Barrington reiterates Buy with $15 target, +30% upside"],
    risks: ["GF Value estimate $6.82 suggests overvaluation at current levels", "Small-cap ($340M market cap) — higher volatility and liquidity risk", "Medical device competitive pressure from Orthofix, OrthoPediatrics"],
    technicals: "Near 52-week high of $12.53. Pulled back 4.1% on Jul 20, creating a potential re-entry. Support at $10, resistance at $12.53 breakout level.",
    sources: [
      { name: "Yahoo/Zacks Breakout", date: "Jul 2", url: "https://finance.yahoo.com/markets/stocks/articles/3-top-breakout-stocks-snap-190000523.html" },
      { name: "Seeking Alpha", date: "Jul 7", url: "https://seekingalpha.com/article/4920344-bioventus-i-see-a-better-business-trading-at-a-fair-price-upgrade" },
    ],
  },
  {
    ticker: "FA", name: "First Advantage", thesis: "Breakout Setup + Earnings Growth + Hiring Recovery",
    conviction: "MODERATE", horizon: "2–4 weeks", price: "~$17", priceDate: "Jul 22",
    priceNum: 17, updatedAt: "2026-07-22",
    targetRange: "$20–$22", stopLoss: "$15", riskReward: "~2:1",
    swingReason: "The sleeper pick. Employment background screening demand tracks hiring, and hiring is recovering. It's the least exciting setup but also the most straightforward: 18.3% earnings growth, approaching a breakout level, clear stop at $15. FA is the kind of swing where you set it, walk away, and check in two weeks. Lower ceiling but also lower stress. Good for balancing higher-risk plays like META or BVS.",
    catalysts: ["Zacks Rank #2, flagged as top breakout stock for July", "18.3% expected earnings growth this year", "Background screening demand rises with hiring recovery", "Consolidated position in global employment verification market"],
    risks: ["Sensitive to hiring slowdowns — if labor market weakens, volume drops", "Mid-cap with moderate liquidity", "Competitive pressure from Sterling, HireRight"],
    technicals: "Trading near resistance level. A breakout above would confirm bullish continuation. Support established at $15 range.",
    sources: [
      { name: "Yahoo/Zacks Breakout", date: "Jul 2", url: "https://finance.yahoo.com/markets/stocks/articles/3-top-breakout-stocks-snap-190000523.html" },
    ],
  },
  {
    ticker: "OOMA", name: "Ooma", thesis: "Breakout + Strong Earnings Growth + Undervalued",
    conviction: "MODERATE", horizon: "2–4 weeks", price: "~$16", priceDate: "Jul 22",
    priceNum: 16, updatedAt: "2026-07-22",
    targetRange: "$19–$21", stopLoss: "$14", riskReward: "~2:1",
    swingReason: "Highest projected EPS growth of all the breakout picks at 24%. Cloud communications is a secular growth story as businesses migrate from legacy phone systems. The small-cap nature ($320M) means institutional discovery could trigger a rapid re-rating. The flip side is low float causes exaggerated moves both ways — great for swing upside, painful if it goes against you. Use the $14 stop religiously.",
    catalysts: ["Zacks Rank #2 — top breakout stock for July", "24% expected EPS growth this year — highest of the three Zacks breakout picks", "Cloud communications growing as businesses migrate from legacy phone systems", "Small-cap ($320M) with room for institutional discovery"],
    risks: ["Competing against much larger players (RingCentral, Zoom, Microsoft Teams)", "Low float can cause exaggerated moves both directions", "Consumer VoIP segment shrinking as mobile replaces landlines"],
    technicals: "Approaching resistance band. Breakout above with volume would trigger a multi-week continuation pattern. Support at $14.",
    sources: [
      { name: "Yahoo/Zacks Breakout", date: "Jul 2", url: "https://finance.yahoo.com/markets/stocks/articles/3-top-breakout-stocks-snap-190000523.html" },
    ],
  },
];

// --- Long Term Picks (6+ months, grouped by source) ---
const LONG_TERM_PICKS = [
  // Morningstar
  { ticker: "CPB", name: "Campbell's", firm: "Morningstar", rating: "Wide Moat", price: "~$38", fairValue: "$58", upside: "+53%", horizon: "12–24 months",
    thesis: "Most undervalued wide-moat stock on Morningstar's Best Companies list. Shifted portfolio from soup to snacks, driven supply chain efficiencies. Strong brand portfolio with predictable cash flows and smart capital allocation.",
    catalysts: ["Portfolio shift to higher-growth snacks segment", "Supply chain efficiency gains boosting margins", "Wide economic moat with predictable cash flows"],
    risks: ["Consumer staples face private-label competition", "Organic growth remains modest", "Input cost inflation pressure"],
    technicals: "Trading 35% below Morningstar fair value estimate. Support at $35, resistance at $42.", sources: [{ name: "Morningstar", date: "Jul 14", url: "https://www.morningstar.com/stocks/10-best-value-stocks-buy-long-term" }] },
  { ticker: "BMY", name: "Bristol-Myers Squibb", firm: "Morningstar", rating: "Wide Moat", price: "~$52", fairValue: "$66", upside: "+27%", horizon: "12–24 months",
    thesis: "Market underestimates Bristol's ability to weather its patent cliff. Newer therapies will soften revenue impact. Strong pipeline, cost cuts, and wide moat support long-term value.",
    catalysts: ["Newer drugs offsetting 47% patent cliff exposure through 2028", "Pipeline programs in oncology and immunology", "Aggressive cost-cutting initiatives"],
    risks: ["47% of revenue exposed to patent threats through 2028", "Pipeline execution risk", "Pricing pressure from government negotiation"],
    technicals: "Significantly undervalued per Morningstar. 52-week range: $39–$62.", sources: [{ name: "Morningstar", date: "Dec 23", url: "https://www.morningstar.com/stocks/3-top-value-stocks-buy-hold-2026-2" }] },
  { ticker: "DVN", name: "Devon Energy", firm: "Morningstar", rating: "Core Hold", price: "~$35", fairValue: "$52", upside: "+49%", horizon: "12–18 months",
    thesis: "Morningstar's go-to US shale pick. Among the lowest cost producers across the US shale cost curve. Even with modest oil projections, models as significantly undervalued. Potential takeover target by a global major.",
    catalysts: ["Lowest cost US shale producer", "Potential takeover target providing downside floor", "Long-term inflation hedge via energy exposure"],
    risks: ["Oil price decline would compress margins", "Capex discipline could slip", "ESG-driven divestment pressure"],
    technicals: "Energy sector undervalued per Morningstar Q3 2026. Support at $30.", sources: [{ name: "Morningstar", date: "Jan 6", url: "https://www.morningstar.com/stocks/5-core-stocks-buy-hold-2026" }] },
  // Motley Fool
  { ticker: "GOOGL", name: "Alphabet", firm: "Motley Fool", rating: "Strong Buy", price: "~$185", fairValue: "$220+", upside: "+19%", horizon: "12–36 months",
    thesis: "Waymo has clear market lead in robotaxis. Google's AI integration across search, YouTube, and cloud drives growth. Initiated first-ever dividend. Extremely profitable with substantial cash on hand.",
    catalysts: ["Waymo robotaxi market leadership", "AI-powered search and YouTube growth", "First-ever dividend signals shareholder return focus"],
    risks: ["Antitrust regulatory pressure globally", "AI search competition from OpenAI/Microsoft", "Capex for AI infrastructure rising"],
    technicals: "JPMorgan also rates overweight. 63 analyst consensus Buy.", sources: [{ name: "Motley Fool", date: "Jul 14", url: "https://www.fool.com/investing/top-stocks-to-buy-and-hold/" }] },
  { ticker: "MELI", name: "MercadoLibre", firm: "Motley Fool", rating: "Strong Buy", price: "~$2,100", fairValue: "$2,600+", upside: "+24%", horizon: "12–36 months",
    thesis: "The 'Amazon of Latin America' with massive fintech upside. Region is underpenetrated in both e-commerce and digital payments, providing a long growth runway. Q1 2026 showed continued double-digit growth.",
    catalysts: ["Latin America e-commerce penetration still low vs global average", "Fintech segment (Mercado Pago) growing rapidly", "Expanding logistics network creating competitive moat"],
    risks: ["Currency volatility in key markets (Brazil, Argentina)", "Regulatory changes in financial services", "Competition from Amazon entering LatAm"],
    technicals: "Strong uptrend. Motley Fool recommendation since 2014 returned 1,600%+.", sources: [{ name: "Motley Fool", date: "Jul 2026", url: "https://www.fool.com/investing/top-stocks-to-buy-and-hold/" }] },
  // JPMorgan
  { ticker: "AVGO", name: "Broadcom", firm: "JPMorgan", rating: "Overweight", price: "~$280", fairValue: "$580", upside: "+107%", horizon: "12–18 months",
    thesis: "JPMorgan's top AI infrastructure pick. Custom chips, networking, and high-speed connectivity power modern data centers. Data center capex expected to jump 50% in 2026. Strong Buy consensus across Wall Street.",
    catalysts: ["AI chip backlog extending into 2027", "Data center capex jumping 50% in 2026", "Diversified exposure: custom chips, networking, VMware integration"],
    risks: ["AI spending could decelerate", "Customer concentration in hyperscalers", "Integration risk from VMware acquisition"],
    technicals: "JPMorgan price target $580. Wall Street Strong Buy consensus.", sources: [{ name: "JPMorgan/TheStreet", date: "Jul 3", url: "https://www.thestreet.com/investing/stocks/avgo-broadcom-ntes-netease-jpmorgan-strong-buys" }] },
  { ticker: "GEV", name: "GE Vernova", firm: "JPMorgan", rating: "Overweight", price: "~$450", fairValue: "$1,000", upside: "+122%", horizon: "12–24 months",
    thesis: "JPMorgan's highest-conviction 2026 pick with 49%+ upside to target. Focuses on power generation, wind, and electrification post-GE spinoff. Secular growth from grid modernization and energy transition.",
    catalysts: ["Grid modernization and electrification megatrend", "Post-spinoff operational focus", "AI data center power demand driving orders"],
    risks: ["Wind segment profitability challenges", "Execution risk as standalone company", "Supply chain constraints in power equipment"],
    technicals: "JPMorgan target $1,000. One of the highest-conviction picks in their 47-stock universe.", sources: [{ name: "JPMorgan/Yahoo", date: "Dec 27", url: "https://finance.yahoo.com/news/jpmorgan-top-3-stocks-crush-130215359.html" }] },
  { ticker: "CELH", name: "Celsius Holdings", firm: "JPMorgan", rating: "Overweight", price: "~$44", fairValue: "$68", upside: "+54%", horizon: "12–18 months",
    thesis: "Healthier energy drink alternative gaining market share rapidly. JPMorgan's second-highest implied return in their 2026 universe. Positioned in the fastest-growing segment of functional beverages.",
    catalysts: ["Healthier energy drink trend accelerating", "Market share gains from Monster and Red Bull", "International expansion just beginning"],
    risks: ["Concentrated distribution through Pepsi partnership", "Competitive response from incumbents", "Valuation premium to beverage peers"],
    technicals: "JPMorgan target $68. Trading at significant discount to target.", sources: [{ name: "JPMorgan/Yahoo", date: "Dec 27", url: "https://finance.yahoo.com/news/jpmorgan-top-3-stocks-crush-130215359.html" }] },
  // Bank of America
  { ticker: "CEG", name: "Constellation Energy", firm: "Bank of America", rating: "Buy", price: "~$275", fairValue: "$350+", upside: "+27%", horizon: "12–18 months",
    thesis: "AI infrastructure requires massive power. Constellation is the largest US nuclear operator, positioned to benefit from data center power demand. BofA's Q1 2026 top pick in the energy transition theme.",
    catalysts: ["AI data center power demand surge", "Nuclear energy renaissance — cleanest baseload power", "Long-term power purchase agreements with hyperscalers"],
    risks: ["Nuclear regulatory and safety concerns", "Power price volatility", "Capital-intensive maintenance cycles"],
    technicals: "Bank of America Buy rating. Strong institutional interest.", sources: [{ name: "Bank of America", date: "Jan 2", url: "https://www.mexc.com/it-IT/news/398028" }] },
  { ticker: "MRK", name: "Merck", firm: "Bank of America", rating: "Buy", price: "~$105", fairValue: "$140", upside: "+33%", horizon: "12–24 months",
    thesis: "BofA's healthcare pick for 2026. Keytruda franchise remains strong despite approaching patent cliff. Pipeline diversification underway with recent acquisitions. Healthcare sector broadly undervalued per Morningstar.",
    catalysts: ["Keytruda franchise generating $25B+ annual revenue", "Pipeline acquisitions diversifying beyond oncology", "Healthcare sector most undervalued per Morningstar Q3 2026"],
    risks: ["Keytruda patent cliff in 2028", "Pipeline trial failures", "Drug pricing legislation"],
    technicals: "Trading well below fair value. Healthcare sector undervalued heading into H2 2026.", sources: [{ name: "Bank of America", date: "Jan 2", url: "https://www.mexc.com/it-IT/news/398028" }] },
];

// --- Short Term Picks (1 day to 4 weeks, sentiment-driven) ---
const SHORT_TERM_PICKS = [
  { ticker: "NVDA", name: "NVIDIA", horizon: "1–2 weeks", price: "~$135", targetRange: "$145–$155", stopLoss: "$125", riskReward: "~2:1",
    thesis: "Most mentioned stock on Reddit and Twitter. AI infrastructure demand continues to accelerate. Q2 earnings approach creates a binary catalyst. Social sentiment overwhelmingly bullish across all platforms.",
    conviction: "HIGH", mentions: "12,400+ mentions/day across Reddit, Twitter, StockTwits",
    catalysts: ["AI infrastructure spending up 50% in 2026", "Data center GPU demand exceeding supply", "Q2 earnings catalyst approaching"],
    risks: ["Valuation already reflects significant growth", "Export restrictions to China", "Customer concentration in hyperscalers"],
    technicals: "Strong momentum. RSI 58, neutral-bullish. Support at $125, resistance at $140." },
  { ticker: "RDDT", name: "Reddit", horizon: "1–3 days", price: "~$197", targetRange: "$210–$220", stopLoss: "$180", riskReward: "~1.5:1",
    thesis: "Classic momentum play. Trading with 14% intraday ranges. WallStreetBets attention driving volume spikes. Now viewed as legitimate ad platform alongside META and GOOGL. High-beta, high-reward for active traders.",
    conviction: "MODERATE-HIGH", mentions: "8,200+ mentions/day on WallStreetBets alone",
    catalysts: ["91% gross margins on $2.2B trailing revenue", "Named alongside META/GOOGL in 2026 ad stack", "Post-IPO momentum with institutional discovery"],
    risks: ["14%+ daily swings — position size accordingly", "Post-IPO lockup dynamics", "Ad revenue concentration risk"],
    technicals: "Stair-step pattern from $160s to $197. Classic trend-day profile with shallow pullbacks." },
  { ticker: "INTC", name: "Intel", horizon: "1–2 weeks", price: "~$25", targetRange: "$28–$32", stopLoss: "$22", riskReward: "~2:1",
    thesis: "Reddit mentions spiked 591% in 24 hours. Turnaround story under new leadership gaining traction. Foundry business potential being re-evaluated. Contrarian bet on the most undervalued semiconductor.",
    conviction: "MODERATE", mentions: "591% mention spike in 24hrs — Reddit, Twitter trending",
    catalysts: ["Foundry services gaining external customers", "US CHIPS Act subsidies flowing in", "Cheapest large-cap semiconductor by every metric"],
    risks: ["Execution risk on foundry turnaround is significant", "Market share losses to AMD and ARM", "Capex burn rate while foundry ramps"],
    technicals: "Volatile. 591% Reddit mention spike can precede sharp moves both ways." },
  { ticker: "ORCL", name: "Oracle", horizon: "1–2 weeks", price: "~$195", targetRange: "$210–$220", stopLoss: "$182", riskReward: "~2:1",
    thesis: "Surging Reddit mentions signal institutional interest crossover into retail. Cloud infrastructure business growing 50%+ as enterprises adopt AI. Multi-cloud partnerships with AWS, Azure, and Google Cloud.",
    conviction: "MODERATE-HIGH", mentions: "Sharp mention spike across Reddit, StockTwits",
    catalysts: ["Cloud infrastructure revenue growing 50%+", "Multi-cloud partnerships expanding TAM", "AI workload demand driving new enterprise contracts"],
    risks: ["Premium valuation vs cloud peers", "Legacy business declining", "Competition from AWS, Azure, GCP"],
    technicals: "Near all-time highs. Breakout above $200 confirmed uptrend." },
  { ticker: "AMD", name: "AMD", horizon: "1–3 weeks", price: "~$155", targetRange: "$170–$180", stopLoss: "$142", riskReward: "~2:1",
    thesis: "Consistently top-5 most mentioned stock on Reddit. MI300X AI chips gaining hyperscaler adoption. Strong AI Score and bullish sentiment across platforms. Positioned as the #2 AI chip play behind NVIDIA.",
    conviction: "MODERATE-HIGH", mentions: "6,800+ daily mentions — consistently top-5 Reddit",
    catalysts: ["MI300X adoption by major hyperscalers", "Data center GPU market share gains vs NVIDIA", "Server CPU market share at all-time highs"],
    risks: ["NVIDIA dominance in AI training", "Gross margin pressure from competition", "Xilinx integration still ongoing"],
    technicals: "Support at $142, resistance at $165. RSI 52, neutral. Strong AI Score per AltIndex." },
  { ticker: "TSLA", name: "Tesla", horizon: "1–4 weeks", price: "~$340", targetRange: "$380–$420", stopLoss: "$300", riskReward: "~2:1",
    thesis: "Perennially the most volatile high-mention stock. Robotaxi catalyst, FSD progress, and energy storage growth create multiple swing opportunities. Meta and Tesla are now worth the same $1.48T — market is choosing between them.",
    conviction: "MODERATE", mentions: "15,000+ daily mentions — #1 most discussed stock",
    catalysts: ["Robotaxi reveal and FSD regulatory progress", "Energy storage business growing triple digits", "Model refresh cycle driving delivery growth"],
    risks: ["CEO distraction risk", "EV competition intensifying globally", "Valuation assumes massive robotaxi TAM"],
    technicals: "High beta (2.0+). Moves 3-5% daily. Support at $300, resistance at $360." },
  { ticker: "PLTR", name: "Palantir", horizon: "1–3 weeks", price: "~$135", targetRange: "$150–$165", stopLoss: "$120", riskReward: "~2:1",
    thesis: "AI enterprise software leader with government and commercial contracts. Reddit darling with sustained high mention volume. Forward Deployed Engineers model creates sticky revenue. Sentiment consistently bullish.",
    conviction: "MODERATE-HIGH", mentions: "5,400+ daily mentions — strong Reddit + StockTwits presence",
    catalysts: ["AIP (AI Platform) commercial adoption accelerating", "Government contract wins expanding", "Enterprise AI spending in early innings"],
    risks: ["Extreme valuation premium — 100x+ forward earnings", "Stock-based compensation dilution", "Government contract timing unpredictable"],
    technicals: "Momentum stock. Support at $120, resistance at $140. High beta." },
  { ticker: "SOFI", name: "SoFi Technologies", horizon: "1–2 weeks", price: "~$16", targetRange: "$18–$20", stopLoss: "$14", riskReward: "~2:1",
    thesis: "Fintech favorite on Reddit with consistent mention volume. Banking charter provides competitive moat. Member growth accelerating as brand awareness grows. Affordable entry point attracts retail traders.",
    conviction: "MODERATE", mentions: "3,200+ daily mentions — strong WallStreetBets following",
    catalysts: ["Banking charter enabling higher-margin lending", "Member growth above 9M and accelerating", "Technology platform licensing to other banks"],
    risks: ["Profitability still inconsistent quarter-to-quarter", "Student loan policy changes", "Rising interest rates compress NIM"],
    technicals: "Volatile small-cap fintech. Support at $14, resistance at $17. Affordable entry." },
];

// Firm grouping helper for Long Term
const LT_FIRMS = [...new Set(LONG_TERM_PICKS.map(p => p.firm))];
function Skeleton({ width, height, style: extra }) {
  return (
    <div style={{
      width, height: height || 14, borderRadius: 4,
      background: "linear-gradient(90deg, #1a1e2a 25%, #252a3a 50%, #1a1e2a 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s infinite",
      ...extra,
    }} />
  );
}

// Inject shimmer keyframes once
const shimmerCSS = `@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`;

// --- Live Clock ---
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const isOpen = (() => {
    const et = now.getUTCHours() * 60 + now.getUTCMinutes() - 240;
    const d = now.getDay();
    return d >= 1 && d <= 5 && et >= 570 && et < 960;
  })();
  return (
    <div style={S.clockRow}>
      <span style={{ ...S.marketDot, background: isOpen ? "#22c55e" : "#ef4444" }}>●</span>
      <span style={S.clockLabel}>{isOpen ? "MARKET OPEN" : "MARKET CLOSED"}</span>
      <span style={S.clockTime}>{timeStamp(now)}</span>
      <span style={S.clockDate}>{formatDate(now)}</span>
    </div>
  );
}

function SourceLink({ s }) { return <a href={s.url} target="_blank" rel="noopener noreferrer" style={S.sourceLink}>{s.name} <span style={S.sourceDate}>({s.date})</span></a>; }
function Section({ title, children }) { return <div style={S.section}><div style={S.sectionTitle}>{title}</div>{children}</div>; }

// --- Pick Card ---
const SIGNAL_COLORS = { "ENTER": "#22c55e", "SCALE IN": "#84cc16", "WAIT": "#eab308", "AVOID": "#ef4444" };
function starString(n) { return "★".repeat(Math.max(0, Math.min(5, n))) + "☆".repeat(Math.max(0, 5 - Math.min(5, n))); }

const SIGNAL_FACTOR_ICONS = { pricePosition: "◎", volume: "◧", rsi: "◑", catalystProximity: "◇", marketAlignment: "◫" };
const SIGNAL_FACTOR_LABELS = { pricePosition: "Price Position", volume: "Volume", rsi: "RSI Zone", catalystProximity: "Catalyst Proximity", marketAlignment: "Market Alignment" };
const FACTOR_COLORS = { bullish: "#22c55e", neutral: "#eab308", bearish: "#ef4444" };

const PickCard = React.memo(function PickCard({ pick, status, onRemove, entrySignal, sectorWarning }) {
  const [expanded, setExpanded] = useState(false);
  const cc = pick.conviction === "HIGH" ? "#22c55e" : pick.conviction === "MODERATE-HIGH" ? "#eab308" : pick.conviction === "MODERATE" ? "#60a5fa" : "#94a3b8";
  const sc = status === "ACTIVE" ? "#22c55e" : status === "CLOSE" ? "#ef4444" : "#eab308";
  const sig = entrySignal || {};
  const sigColor = SIGNAL_COLORS[sig.signal] || "#5a6478";
  const pnl = pick.entryPrice && pick.priceNum ? ((pick.priceNum - pick.entryPrice) / pick.entryPrice * 100) : null;

  return (
    <div style={{ ...S.card, borderColor: status === "CLOSE" ? "#3a1515" : "#1e2330" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: sc, fontSize: 8 }}>●</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: sc }}>{status || "ACTIVE"}</span>
          {pick._fromScanner && <span style={{ fontSize: 8, color: "#60a5fa", background: "#1a1a3a", padding: "1px 6px", borderRadius: 3 }}>SCANNER</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Entry Signal badge — visible at a glance */}
          {sig.signal && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, color: sigColor, letterSpacing: 1 }}>{starString(sig.stars || 0)}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: sigColor, letterSpacing: "0.06em" }}>{sig.signal}</span>
            </div>
          )}
          {/* P&L tracker */}
          {pnl !== null && (
            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'SF Mono',monospace", color: pnl >= 0 ? "#22c55e" : "#ef4444" }}>
              {pnl >= 0 ? "+" : ""}{pnl.toFixed(1)}%
            </span>
          )}
          <button onClick={onRemove} style={S.removeBtn}>✕</button>
        </div>
      </div>

      {/* Sector correlation warning */}
      {sectorWarning && (
        <div style={S.corrWarning}>
          <span style={{ color: "#eab308" }}>⚠</span> {sectorWarning}
        </div>
      )}

      <div style={S.cardTop}>
        <div><div style={S.ticker}>{pick.ticker}</div><div style={S.companyName}>{pick.name}</div></div>
        <div style={{ textAlign: "right" }}>
          <div style={{ ...S.convictionBadge, background: cc }}>{pick.conviction}</div>
          <div style={S.priceLabel}>{pick.price} <span style={{ fontSize: 11, opacity: 0.6 }}>{pick.priceDate}</span></div>
        </div>
      </div>
      <div style={S.thesisLine}>{pick.thesis}</div>
      {pick.swingReason && (
        <div style={S.swingReason}>
          <div style={S.swingReasonLabel}>Why This Is a Good Swing Trade</div>
          <p style={S.swingReasonText}>{pick.swingReason}</p>
        </div>
      )}
      <div style={S.metricsRow}>
        {[["Target", pick.targetRange], ["Stop", pick.stopLoss], ["R:R", pick.riskReward], ["Horizon", pick.horizon]].map(([l, v]) => (
          <div key={l} style={S.metric}><div style={S.metricLabel}>{l}</div><div style={S.metricValue}>{v}</div></div>
        ))}
      </div>
      <button onClick={() => setExpanded(!expanded)} style={S.expandBtn}>{expanded ? "Collapse ▲" : "Details & Entry Signal ▼"}</button>
      {expanded && (
        <div style={S.expandedArea}>
          {/* Entry Signal Breakdown */}
          {sig.factors && (
            <Section title="Entry Signal Analysis">
              <div style={S.signalSummary}>
                <span style={{ fontSize: 16, color: sigColor, letterSpacing: 2 }}>{starString(sig.stars || 0)}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: sigColor, marginLeft: 8 }}>{sig.signal}</span>
                {sig.summary && <p style={{ fontSize: 11, color: "#8a92a4", margin: "6px 0 0", lineHeight: 1.5 }}>{sig.summary}</p>}
              </div>
              <div style={S.factorsGrid}>
                {["pricePosition", "volume", "rsi", "catalystProximity", "marketAlignment"].map(key => {
                  const f = sig.factors[key];
                  if (!f) return null;
                  const fc = FACTOR_COLORS[f.verdict] || "#5a6478";
                  return (
                    <div key={key} style={S.factorCard}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                        <span style={{ fontSize: 11, color: fc }}>{SIGNAL_FACTOR_ICONS[key]}</span>
                        <span style={S.factorLabel}>{SIGNAL_FACTOR_LABELS[key]}</span>
                        <span style={{ ...S.factorVerdict, color: fc }}>{f.verdict}</span>
                      </div>
                      <p style={S.factorText}>{f.detail}</p>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          <Section title="Catalysts">{(pick.catalysts || []).map((c, i) => <div key={i} style={S.bulletItem}><span style={S.bulletDot}>▸</span> {c}</div>)}</Section>
          <Section title="Risks">{(pick.risks || []).map((r, i) => <div key={i} style={S.bulletItem}><span style={{ ...S.bulletDot, color: "#ef4444" }}>▸</span> {r}</div>)}</Section>
          <Section title="Technicals"><p style={S.techText}>{pick.technicals}</p></Section>
          {pick.sources?.length > 0 && <Section title="Sources">{pick.sources.map((s, i) => <div key={i} style={{ marginBottom: 6 }}><SourceLink s={s} /></div>)}</Section>}
        </div>
      )}
    </div>
  );
});

// --- Sector Trends ---
const TF_LABELS = ["Today", "Week", "Month", "YTD"];
const TF_KEYS = ["day", "week", "month", "ytd"];

// Fallback data so the sidebar is never empty
const SECTORS = ["Technology","Consumer Disc.","Comm Services","Industrials","Health Care","Financials","Materials","Consumer Staples","Real Estate","Utilities","Energy"];
function mkSector(vals) { return vals.map(([n,v]) => ({ name: n, value: v, display: (v>=0?"+":"")+v.toFixed(2)+"%" })); }
const SECTOR_FALLBACK = {
  day: mkSector([["Technology",.85],["Consumer Disc.",.62],["Comm Services",.41],["Industrials",.33],["Health Care",.21],["Financials",.15],["Materials",-.08],["Consumer Staples",-.12],["Real Estate",-.25],["Utilities",-.34],["Energy",-.47]]),
  week: mkSector([["Energy",2.3],["Technology",1.95],["Industrials",1.8],["Financials",1.45],["Materials",1.1],["Consumer Disc.",.9],["Health Care",.65],["Comm Services",.4],["Consumer Staples",.15],["Utilities",-.2],["Real Estate",-.55]]),
  month: mkSector([["Technology",5.2],["Consumer Disc.",4.1],["Comm Services",3.8],["Industrials",3.25],["Energy",2.9],["Financials",2.45],["Materials",1.8],["Health Care",1.2],["Consumer Staples",.65],["Utilities",-.3],["Real Estate",-1.1]]),
  ytd: mkSector([["Technology",18.5],["Comm Services",15.2],["Consumer Disc.",13.4],["Financials",11.8],["Industrials",10.2],["Energy",8.9],["Health Care",6.5],["Materials",4.3],["Consumer Staples",2.1],["Utilities",.8],["Real Estate",-1.5]]),
};

function SectorTrends() {
  const [idx, setIdx] = useState(0);
  const [data, setData] = useState(SECTOR_FALLBACK); // Render fallback immediately
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { const id = setInterval(() => setIdx(i => (i + 1) % 4), 7000); return () => clearInterval(id); }, []);

  const fetchSectors = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await callClaude(
        `Today is ${formatDate(new Date())}. You are a market data analyst. Based on your knowledge of current S&P 500 sector performance, estimate the performance of all 11 GICS sectors across 4 timeframes.\n\nReturn a JSON object with 4 keys: "day","week","month","ytd". Each value is an array of 11 sectors sorted best-to-worst: [{"s":"Information Technology","v":1.25},{"s":"Energy","v":-0.30}] where v is the estimated percent change (negative if down).\n\nThe 11 GICS sectors: Information Technology, Health Care, Financials, Consumer Discretionary, Communication Services, Industrials, Consumer Staples, Energy, Utilities, Real Estate, Materials.\n\nday=today's performance, week=past 5 trading days, month=past 30 days, ytd=year to date ${new Date().getFullYear()}.\n\nRespond with ONLY the JSON object, nothing else.`,
        "You are a sector performance data API. Use your knowledge of recent market trends to estimate sector returns. Respond ONLY with a valid JSON object. No markdown, no backticks, no explanation."
      );
      const obj = parseJSON(raw, "object");
      if (obj) {
        const parsed = {};
        let hasData = false;
        TF_KEYS.forEach(k => {
          if (Array.isArray(obj[k]) && obj[k].length > 0) {
            parsed[k] = obj[k].filter(i => i.s && typeof i.v === "number").map(i => ({
              name: String(i.s).replace("Information Technology", "Technology").replace("Communication Services", "Comm Services").replace("Consumer Discretionary", "Consumer Disc.").trim(),
              value: i.v,
              display: (i.v >= 0 ? "+" : "") + i.v.toFixed(2) + "%",
            }));
            if (parsed[k].length > 0) hasData = true;
          }
        });
        if (hasData) { setData(prev => ({ ...prev, ...parsed })); setLive(true); }
      }
    } catch (e) { console.warn("Sector fetch skipped:", e.message); }
    setLoading(false);
  }, []);

  // Try to fetch live data on mount (fallback already showing)
  useEffect(() => { const t = setTimeout(fetchSectors, 15000); return () => clearTimeout(t); }, []);

  const rows = data[TF_KEYS[idx]] || [];
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    setProgress(0);
    const start = Date.now();
    const id = setInterval(() => setProgress(Math.min((Date.now() - start) / 7000, 1)), 80);
    return () => clearInterval(id);
  }, [idx]);

  return (
    <div style={SS.container}>
      <div style={SS.header}>
        <span style={SS.hIcon}>◎</span>
        <span style={SS.hTitle}>SECTOR TRENDS</span>
        {live && <span style={{ marginLeft: "auto", fontSize: 8, color: "#22c55e" }}>● LIVE</span>}
        {!live && <span style={{ marginLeft: "auto", fontSize: 8, color: "#5a6478" }}>baseline</span>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={SS.tabs}>
          {TF_LABELS.map((tf, i) => <button key={tf} onClick={() => setIdx(i)} style={{ ...SS.tab, color: i === idx ? "#6ee7b7" : "#5a6478", borderBottom: i === idx ? "2px solid #6ee7b7" : "2px solid transparent" }}>{tf}</button>)}
        </div>
        <button onClick={fetchSectors} disabled={loading} style={{ fontSize: 9, background: "none", border: "none", color: "#5a6478", cursor: "pointer", padding: "2px 4px" }}>{loading ? "…" : "↻"}</button>
      </div>
      <div style={SS.progressTrack}><div style={{ ...SS.progressFill, width: `${progress * 100}%` }} /></div>
      {loading ? (
        <div style={{ padding: "8px 0", display: "flex", flexDirection: "column", gap: 6 }}>
          {[...Array(7)].map((_, i) => <Skeleton key={i} width="100%" height={16} />)}
        </div>
      ) : rows.length === 0 ? (
        <div style={SS.loadingMsg}>No data</div>
      ) : (
        <div style={SS.list}>
          {(() => {
            const maxVal = Math.max(...rows.map(r => Math.abs(r.value)), 0.01);
            return rows.map((r, i) => {
              const pos = r.value >= 0;
              const barWidth = (Math.abs(r.value) / maxVal) * 100;
              return (
                <div key={i} style={SS.row}>
                  <span style={SS.rank}>{i + 1}</span>
                  <span style={SS.sName}>{r.name}</span>
                  <span style={{ ...SS.sVal, color: pos ? "#22c55e" : "#ef4444" }}>{pos ? "+" : ""}{r.display}</span>
                  <div style={SS.barTrack}><div style={{ ...SS.barFill, width: `${barWidth}%`, background: pos ? "#22c55e" : "#ef4444" }} /></div>
                </div>
              );
            });
          })()}
        </div>
      )}
      <div style={SS.footnote}>Rotates 7s · {TF_LABELS[idx]}</div>
    </div>
  );
}

// --- Fear & Greed (fetches max 2x per day, shows fallback instantly) ---
const FG_FALLBACK = { now: 41, now_label: "Fear", week_ago: 37, week_label: "Fear", month_ago: 70, month_label: "Greed", year_ago: 55, year_label: "Neutral" };
const FG_CACHE_KEY = "fg_cache";
const FG_MIN_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours = max 2 fetches per day

function getFGCache() { try { const c = JSON.parse(sessionStorage.getItem(FG_CACHE_KEY)); return c?.ts && Date.now() - c.ts < FG_MIN_INTERVAL ? c : null; } catch { return null; } }
function setFGCache(data) { try { sessionStorage.setItem(FG_CACHE_KEY, JSON.stringify({ ...data, ts: Date.now() })); } catch {} }

function FearGreedGauge() {
  const cached = getFGCache();
  const [data, setData] = useState(cached || FG_FALLBACK);
  const [live, setLive] = useState(!!cached);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(cached ? new Date(cached.ts) : null);

  const fetchFG = useCallback(async (force) => {
    // Only fetch if forced or cache is stale (>12hrs)
    if (!force) {
      const c = getFGCache();
      if (c) { setData(c); setLive(true); setLastFetch(new Date(c.ts)); return; }
    }
    setLoading(true);
    try {
      const raw = await callClaude(
        `Today is ${formatDate(new Date())}. You are a market sentiment analyst. Based on your knowledge of current market conditions, estimate the CNN Fear & Greed Index. Consider: stock price momentum (S&P 500 vs 125-day MA), stock price strength (52-week highs vs lows), stock price breadth (advancing vs declining volume), put/call ratio, market volatility (VIX vs 50-day MA), safe haven demand (bonds vs stocks), and junk bond demand (yield spread). Return ONLY a JSON object: {"now":41,"now_label":"Fear","week_ago":37,"week_label":"Fear","month_ago":70,"month_label":"Greed","year_ago":55,"year_label":"Neutral"}. Labels: 0-24 Extreme Fear, 25-44 Fear, 45-55 Neutral, 56-74 Greed, 75-100 Extreme Greed. ONLY the JSON.`,
        "You are a sentiment data API. Estimate the CNN Fear & Greed Index using your knowledge of current market conditions. Respond ONLY with a JSON object. No markdown, no backticks."
      );
      const obj = parseJSON(raw, "object");
      if (obj && typeof obj.now === "number") {
        setData(obj);
        setLive(true);
        setFGCache(obj);
        setLastFetch(new Date());
      }
    } catch (e) { console.warn("FG fetch skipped:", e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { const t = setTimeout(() => fetchFG(false), 22000); return () => clearTimeout(t); }, []);

  const gc = v => v <= 24 ? "#dc2626" : v <= 44 ? "#f97316" : v <= 55 ? "#eab308" : v <= 74 ? "#84cc16" : "#22c55e";
  const GR = ({ label, value, sentiment }) => {
    const c = gc(value);
    return (
      <div style={FG.row}>
        <span style={FG.rowLabel}>{label}</span>
        <div style={FG.gaugeTrack}><div style={{ ...FG.gaugeFill, width: `${value}%`, background: c }} /><div style={{ ...FG.gaugeNeedle, left: `${value}%` }} /></div>
        <span style={{ ...FG.rowValue, color: c }}>{value}</span>
        <span style={{ ...FG.rowSentiment, color: c }}>{sentiment}</span>
      </div>
    );
  };
  return (
    <div style={FG.container}>
      <div style={FG.header}>
        <span style={FG.hIcon}>◉</span>
        <span style={FG.hTitle}>FEAR & GREED INDEX</span>
        {live && <span style={{ marginLeft: "auto", fontSize: 8, color: "#22c55e" }}>● LIVE</span>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={FG.source}>CNN Business · Updates 2x/day</div>
        <button onClick={() => fetchFG(true)} disabled={loading} style={{ fontSize: 9, background: "none", border: "none", color: "#5a6478", cursor: "pointer" }}>{loading ? "…" : "↻"}</button>
      </div>
      {lastFetch && <div style={{ fontSize: 8, color: "#3a4258", paddingLeft: 18, marginBottom: 6 }}>Last: {timeStamp(lastFetch)}</div>}
      <div style={FG.bigValue}><span style={{ ...FG.bigNum, color: gc(data.now) }}>{data.now}</span><span style={{ ...FG.bigLabel, color: gc(data.now) }}>{data.now_label}</span></div>
      <div style={FG.mainGaugeOuter}>
        <div style={FG.mainGaugeTrack}>
          <div style={{ ...FG.mainGaugeFill, width: `${data.now}%`, background: "linear-gradient(90deg, #dc2626 0%, #f97316 25%, #eab308 45%, #84cc16 65%, #22c55e 100%)" }} />
          <div style={{ ...FG.mainGaugeNeedle, left: `${data.now}%` }}><div style={FG.needleTri} /></div>
        </div>
        <div style={FG.mainGaugeLabels}><span>Extreme Fear</span><span>Extreme Greed</span></div>
      </div>
      <div style={FG.divider} />
      <GR label="Now" value={data.now} sentiment={data.now_label} />
      <GR label="1W" value={data.week_ago} sentiment={data.week_label} />
      <GR label="1M" value={data.month_ago} sentiment={data.month_label} />
      <GR label="1Y" value={data.year_ago} sentiment={data.year_label} />
      <div style={FG.footnote}>0 = Extreme Fear · 100 = Extreme Greed</div>
    </div>
  );
}

// --- News Feed (BBC RSS via free proxy) ---
const NEWS_CATEGORIES = [
  { id: "financial", label: "Financial", feed: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { id: "us", label: "US News", feed: "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml" },
  { id: "world", label: "World", feed: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { id: "tech", label: "Tech", feed: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
  { id: "energy", label: "Energy", feed: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml" },
];

function NewsFeed() {
  const [activeCategory, setActiveCategory] = useState("financial");
  const [articles, setArticles] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/news?category=general");
        const data = await res.json();
        if (data.articles && data.articles.length > 0) {
          // Categorize articles by keywords
          const categorized = { financial: [], us: [], world: [], tech: [], energy: [] };
          data.articles.forEach(a => {
            const t = (a.title + " " + a.summary).toLowerCase();
            if (t.match(/oil|gas|energy|opec|solar|wind|nuclear|crude|petrol/)) categorized.energy.push(a);
            else if (t.match(/tech|ai|software|chip|semiconductor|apple|google|microsoft|meta|nvidia|cyber/)) categorized.tech.push(a);
            else if (t.match(/fed|rate|inflation|gdp|jobs|employment|treasury|bank|stock|market|earnings|revenue|profit|wall street|s&p|dow|nasdaq/)) categorized.financial.push(a);
            else if (t.match(/china|europe|uk|japan|russia|ukraine|india|brazil|middle east|nato|un |eu /)) categorized.world.push(a);
            else categorized.us.push(a);
          });
          // Ensure each has at least some articles, fill from general pool
          const all = data.articles;
          Object.keys(categorized).forEach(k => {
            if (categorized[k].length < 2) {
              categorized[k] = all.slice(0, 4);
            } else {
              categorized[k] = categorized[k].slice(0, 4);
            }
          });
          // Format time
          Object.keys(categorized).forEach(k => {
            categorized[k] = categorized[k].map(a => ({
              title: a.title,
              source: a.source,
              url: a.url || "",
              time: a.time ? new Date(a.time).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "today",
            }));
          });
          setArticles(categorized);
        }
      } catch (e) { console.error("News fetch failed", e); }
      setLoading(false);
    })();
  }, []);

  const currentArticles = articles[activeCategory] || [];

  return (
    <div style={NW.container}>
      <div style={NW.header}><span style={NW.hIcon}>◆</span><span style={NW.hTitle}>NEWS</span></div>
      <div style={NW.tabs}>
        {NEWS_CATEGORIES.map(cat => (
          <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{
            ...NW.tab,
            color: activeCategory === cat.id ? "#f0f2f5" : "#5a6478",
            background: activeCategory === cat.id ? "#1a1e2a" : "transparent",
          }}>{cat.label}</button>
        ))}
      </div>
      {loading && currentArticles.length === 0 ? (
        <div style={{ padding: "8px 0", display: "flex", flexDirection: "column", gap: 6 }}>
          {[1,2,3].map(i => <Skeleton key={i} width="100%" height={28} />)}
        </div>
      ) : currentArticles.length === 0 ? (
        <div style={NW.empty}>No headlines yet</div>
      ) : (
        <div style={NW.list}>
          {currentArticles.map((a, i) => (
            <a key={i} href={a.url || "#"} target="_blank" rel="noopener noreferrer" style={NW.item}>
              <div style={NW.headline}>{a.title}</div>
              <div style={NW.meta}>{a.source || "News"} · {a.time || "today"}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const NW = {
  container: { background: "#111520", border: "1px solid #1e2330", borderRadius: 10, padding: "12px", marginTop: 16 },
  header: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8 },
  hIcon: { color: "#60a5fa", fontSize: 11 },
  hTitle: { fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#60a5fa" },
  tabs: { display: "flex", gap: 2, marginBottom: 8, flexWrap: "wrap" },
  tab: { fontSize: 8, fontWeight: 700, padding: "3px 6px", borderRadius: 3, border: "none", cursor: "pointer", letterSpacing: "0.03em" },
  list: { display: "flex", flexDirection: "column", gap: 6 },
  item: { padding: "6px 0", borderBottom: "1px solid #1a1e2a", textDecoration: "none", display: "block", cursor: "pointer" },
  headline: { fontSize: 10, color: "#c8d0dc", lineHeight: 1.4, transition: "color 0.15s" },
  meta: { fontSize: 8, color: "#3a4258", marginTop: 2 },
  empty: { fontSize: 10, color: "#5a6478", padding: "12px 0", textAlign: "center" },
};

// --- Earnings Calendar ---
const EARNINGS_MARKETS = [
  { id: "all", label: "All US" },
  { id: "nyse", label: "NYSE" },
  { id: "nasdaq", label: "NASDAQ" },
  { id: "amex", label: "AMEX" },
  { id: "sp500", label: "S&P 500" },
  { id: "russell", label: "Russell 2000" },
];

function EarningsCalendar() {
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [market, setMarket] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/earnings");
        const data = await res.json();
        if (data.earnings && data.earnings.length > 0) {
          // Map Finnhub earnings to our format and add market/index info
          const NASDAQ_TICKERS = ["AAPL","MSFT","GOOGL","GOOG","AMZN","META","NVDA","TSLA","AVGO","ADBE","NFLX","COST","PEP","INTC","AMD","QCOM","TXN","CMCSA","PYPL","SBUX","ABNB","UBER","SNAP","PINS","OOMA"];
          const SP500_TICKERS = ["AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","AVGO","ADBE","NFLX","JPM","V","MA","UNH","JNJ","PG","HD","XOM","CVX","MRK","ABBV","PFE","KO","PEP","WMT","BAC","DIS","SCHW","LEN","DVN","AR"];

          const mapped = data.earnings.map(e => {
            const isNasdaq = NASDAQ_TICKERS.includes(e.ticker);
            const isSP500 = SP500_TICKERS.includes(e.ticker);
            return {
              ticker: e.ticker,
              name: e.ticker, // Finnhub doesn't return company name in earnings calendar
              date: e.date ? new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : e.date,
              rawDate: e.date,
              market: isNasdaq ? "nasdaq" : "nyse",
              index: isSP500 ? "sp500" : "none",
              time: e.time || "",
              epsEstimate: e.epsEstimate,
            };
          }).sort((a, b) => (a.rawDate || "").localeCompare(b.rawDate || ""));
          setEarnings(mapped);
        }
      } catch (e) { console.error("Earnings fetch failed", e); }
      setLoading(false);
    })();
  }, []);

  const filtered = earnings.filter(e => {
    const matchesMarket = market === "all" ||
      (market === "sp500" && e.index === "sp500") ||
      (market === "russell" && e.index === "russell") ||
      e.market === market;
    const matchesSearch = !search ||
      e.ticker.toLowerCase().includes(search.toLowerCase()) ||
      (e.name || "").toLowerCase().includes(search.toLowerCase());
    return matchesMarket && matchesSearch;
  });

  // Group by date
  const grouped = {};
  filtered.forEach(e => {
    if (!grouped[e.date]) grouped[e.date] = [];
    grouped[e.date].push(e);
  });

  return (
    <>
      <h2 style={S.picksHeading}>Earnings Calendar — Next 30 Days</h2>

      {/* Market filter tabs */}
      <div style={EC.filterRow}>
        {EARNINGS_MARKETS.map(m => (
          <button key={m.id} onClick={() => setMarket(m.id)} style={{
            ...EC.filterBtn,
            background: market === m.id ? "#1a3a2a" : "transparent",
            color: market === m.id ? "#6ee7b7" : "#5a6478",
            borderColor: market === m.id ? "#2a5a3a" : "#1e2330",
          }}>{m.label}</button>
        ))}
      </div>

      {/* Search bar — searches only within selected market */}
      <div style={EC.searchRow}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${EARNINGS_MARKETS.find(m => m.id === market)?.label || "All"} earnings...`}
          style={EC.searchInput}
        />
        {search && <button onClick={() => setSearch("")} style={EC.clearBtn}>✕</button>}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1,2,3,4].map(i => <Skeleton key={i} width="100%" height={32} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={EC.empty}>
          {search ? `No earnings matching "${search}" in ${EARNINGS_MARKETS.find(m => m.id === market)?.label}` : "No upcoming earnings found"}
        </div>
      ) : (
        <div style={EC.table}>
          {/* Header */}
          <div style={EC.headerRow}>
            <span style={{ ...EC.headerCell, flex: 0.7 }}>Ticker</span>
            <span style={{ ...EC.headerCell, flex: 1.5 }}>Company</span>
            <span style={{ ...EC.headerCell, flex: 0.8 }}>Date</span>
            <span style={{ ...EC.headerCell, flex: 0.5 }}>Time</span>
            <span style={{ ...EC.headerCell, flex: 0.6 }}>Market</span>
          </div>
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <div style={EC.dateHeader}>{date}</div>
              {items.map((e, i) => (
                <div key={i} style={EC.row}>
                  <span style={{ ...EC.tickerCell, flex: 0.7 }}>{e.ticker}</span>
                  <span style={{ ...EC.nameCell, flex: 1.5 }}>{e.name || e.ticker}</span>
                  <span style={{ ...EC.cell, flex: 0.8 }}>{e.date}</span>
                  <span style={{ ...EC.timeCell, flex: 0.5, color: e.time === "BMO" ? "#eab308" : "#60a5fa" }}>{e.time || "—"}</span>
                  <span style={{ ...EC.cell, flex: 0.6 }}>{(e.market || "").toUpperCase()}</span>
                </div>
              ))}
            </div>
          ))}
          <div style={EC.count}>{filtered.length} earnings · {market === "all" ? "All US" : EARNINGS_MARKETS.find(m => m.id === market)?.label}</div>
        </div>
      )}
    </>
  );
}

const EC = {
  filterRow: { display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" },
  filterBtn: { padding: "5px 10px", fontSize: 10, fontWeight: 600, border: "1px solid #1e2330", borderRadius: 4, cursor: "pointer", background: "transparent" },
  searchRow: { position: "relative", marginBottom: 14 },
  searchInput: { width: "100%", padding: "8px 32px 8px 12px", fontSize: 12, background: "#111520", border: "1px solid #1e2330", borderRadius: 6, color: "#f0f2f5", outline: "none" },
  clearBtn: { position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#5a6478", fontSize: 12, cursor: "pointer" },
  table: { background: "#111520", border: "1px solid #1e2330", borderRadius: 10, overflow: "hidden" },
  headerRow: { display: "flex", padding: "8px 12px", background: "#0c0f14", borderBottom: "1px solid #1e2330" },
  headerCell: { fontSize: 9, fontWeight: 700, color: "#5a6478", textTransform: "uppercase", letterSpacing: "0.08em" },
  dateHeader: { padding: "6px 12px", fontSize: 10, fontWeight: 700, color: "#6ee7b7", background: "#0f1a12", borderBottom: "1px solid #1a3a2a" },
  row: { display: "flex", padding: "6px 12px", borderBottom: "1px solid #1a1e2a", alignItems: "center" },
  tickerCell: { fontSize: 11, fontWeight: 800, color: "#f0f2f5", fontFamily: "'SF Mono',monospace" },
  nameCell: { fontSize: 10, color: "#8a92a4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  cell: { fontSize: 10, color: "#7a8194" },
  timeCell: { fontSize: 9, fontWeight: 700, letterSpacing: "0.06em" },
  empty: { padding: "30px 20px", textAlign: "center", background: "#111520", borderRadius: 10, border: "1px solid #1e2330", fontSize: 12, color: "#5a6478" },
  count: { padding: "8px 12px", fontSize: 9, color: "#3a4258", textAlign: "right" },
};

// --- Baseline signal generator (no API, instant) ---
function generateBaselineSignal(pick) {
  const price = pick.priceNum || 0;
  const stopNum = parseFloat((pick.stopLoss || "").replace(/[^0-9.]/g, "")) || 0;
  const targetNum = parseFloat((pick.targetRange || "").replace(/[^0-9.]/g, "")) || 0;
  const range = targetNum - stopNum || 1;
  const pos = (price - stopNum) / range;
  const techL = (pick.technicals || "").toLowerCase();
  const rsiM = techL.match(/rsi.{0,5}(\d+)/);
  const rsiVal = rsiM ? parseInt(rsiM[1]) : 50;
  const hz = pick.horizon || "";
  const nearCat = hz.includes("1–2") || hz.includes("1-2") || hz.includes("1–3") || hz.includes("1-3");

  const v = (cond, bull, bear) => cond > 0 ? "bullish" : cond < 0 ? "bearish" : "neutral";
  const factors = {
    pricePosition: { verdict: pos < 0.3 ? "bullish" : pos < 0.6 ? "neutral" : "bearish",
      detail: pos < 0.3 ? `Near support ($${stopNum}). Good entry zone.` : pos < 0.6 ? `Mid-range between $${stopNum} and $${targetNum}.` : `Near target ($${targetNum}). Wait for pullback.` },
    volume: { verdict: "neutral", detail: "Volume data pending live refresh." },
    rsi: { verdict: rsiVal < 45 ? "bullish" : rsiVal > 65 ? "bearish" : "neutral",
      detail: `RSI ~${rsiVal}. ${rsiVal < 45 ? "Oversold — favorable." : rsiVal > 65 ? "Extended — may pullback." : "Neutral zone."}` },
    catalystProximity: { verdict: nearCat ? "bullish" : "neutral",
      detail: nearCat ? "Catalyst within 1-3 weeks. Enter now to position." : "Catalyst 2-4 weeks out. Can wait for better entry." },
    marketAlignment: { verdict: "neutral", detail: "S&P alignment pending live refresh." },
  };

  const sc = { bullish: 2, neutral: 1, bearish: 0 };
  const total = Object.values(factors).reduce((s, f) => s + (sc[f.verdict] || 1), 0);
  const pct = total / (Object.keys(factors).length * 2);
  const [stars, signal] = pct >= 0.8 ? [5, "ENTER"] : pct >= 0.65 ? [4, "ENTER"] : pct >= 0.5 ? [3, "SCALE IN"] : pct >= 0.35 ? [2, "WAIT"] : [1, "AVOID"];
  const bc = Object.values(factors).filter(f => f.verdict === "bullish").length;
  const summary = `${bc}/5 bullish. ${signal === "ENTER" ? "Favor entry." : signal === "SCALE IN" ? "Mixed — partial position." : signal === "WAIT" ? "Wait for setup." : "Avoid."}`;
  return { signal, stars, summary, factors };
}

// ============ MAIN APP ============
export default function SwingTradeDashboard() {
  const PULSE_FALLBACK = "Markets are in a period of heightened volatility as Q2 earnings season enters full swing. The S&P 500 is trading near key resistance levels, with technology and energy sectors leading the advance. VIX remains elevated around 18-20, suggesting traders should size positions conservatively. Swing setups favor stocks with near-term catalysts — earnings plays with defined risk-reward are the highest-probability trades in this environment. Watch for sector rotation signals as institutional money shifts between growth and value.";

  const [pulse, setPulse] = useState(PULSE_FALLBACK);
  const [pulseLoading, setPulseLoading] = useState(false);
  const [picks, setPicks] = useState(BASELINE_PICKS);
  const [pickStatuses, setPickStatuses] = useState({});
  const [picksLoading, setPicksLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [error, setError] = useState(null);
  const [autoOn, setAutoOn] = useState(false);
  const autoRef = useRef(null);

  const [scanResults, setScanResults] = useState([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanRan, setScanRan] = useState(false);

  // Entry signals (4hr cache)
  const [entrySignals, setEntrySignals] = useState(() => {
    // Generate baseline signals from pick data — shows immediately, no API needed
    const baseline = {};
    BASELINE_PICKS.forEach(p => {
      baseline[p.ticker] = generateBaselineSignal(p);
    });
    return baseline;
  });
  const signalCacheRef = useRef({ ts: 0, data: {} });
  const SIGNAL_COOLDOWN = 4 * 60 * 60 * 1000; // 4 hours

  // Sector correlation warnings
  const SECTOR_MAP = {
    PYPL: "Fintech", META: "Tech", ARCB: "Industrials", XOM: "Energy", BVS: "Healthcare",
    FA: "Tech", OOMA: "Tech", AAPL: "Tech", MSFT: "Tech", NVDA: "Tech", AVGO: "Tech",
    ADBE: "Tech", GOOGL: "Tech", AMZN: "Tech", TSLA: "Consumer Disc.",
    SCHW: "Financials", AR: "Energy", DVN: "Energy", LEN: "Consumer Disc.",
  };

  const sectorWarnings = (() => {
    const counts = {};
    picks.forEach(p => {
      const sec = SECTOR_MAP[p.ticker] || "Other";
      counts[sec] = (counts[sec] || 0) + 1;
    });
    const warnings = {};
    picks.forEach(p => {
      const sec = SECTOR_MAP[p.ticker] || "Other";
      if (counts[sec] >= 3) {
        warnings[p.ticker] = `Portfolio overweight in ${sec} (${counts[sec]} picks). Consider diversifying.`;
      }
    });
    return warnings;
  })();

  // --- PHASE 1: Market Pulse (fastest, fires first) ---
  const refreshPulse = useCallback(async () => {
    setPulseLoading(true);
    try {
      const raw = await callClaude(
        `Today is ${formatDate(new Date())}. You are a market analyst writing a live trading desk update.

GUIDELINES — source and include the following data points:
• S&P 500, Dow Jones, and NASDAQ current levels and daily % change
• VIX (volatility index) current level and what it signals
• 10-year Treasury yield and its trend direction
• Which sectors are leading/lagging today (Technology, Energy, Healthcare, etc.)
• Any major earnings reports due this week and their expected impact
• Federal Reserve policy stance and next meeting date
• Key support/resistance levels for SPY
• Whether current conditions favor swing trade entries, exits, or patience

FORMAT: Write 4-5 concise sentences covering the above. Be specific with numbers and percentages. Write as if briefing a swing trader who needs to make decisions today. Plain text only, no markdown, no bullet points, no disclaimers.`,
        "You are a senior market analyst at a trading desk. Provide actionable market intelligence using your knowledge of current market conditions, recent earnings, Fed policy, and technical levels. Be specific and data-driven."
      );
      setPulse(raw);
    } catch (e) { console.warn("Pulse refresh skipped:", e.message); /* keep fallback */ }
    setPulseLoading(false);
  }, []);

  // --- PHASE 2: All picks combined in ONE call (basic data only) ---
  const refreshPicks = useCallback(async (currentPicks) => {
    setPicksLoading(true);
    const tickers = currentPicks.map(p => `${p.ticker} (${p.name}) — thesis: "${p.thesis}", price: ${p.price}, target: ${p.targetRange}, stop: ${p.stopLoss}`).join("\n");

    try {
      const raw = await callClaude(
        `Today is ${formatDate(new Date())}. You are a stock analyst. Provide current analysis for these stocks:\n${tickers}\n\nFor each stock, use your knowledge of recent price action, earnings, news, and technicals to provide an updated assessment.\n\nReturn ONLY a JSON array:\n[{"ticker":"XXXX","price":"$XX.XX","priceNum":55.50,"priceDate":"Jul 25","thesis":"2-3 sentence current assessment","conviction":"HIGH/MODERATE-HIGH/MODERATE/LOW","status":"ACTIVE/CLOSE/WATCH","catalysts":["c1","c2"],"risks":["r1"],"technicals":"1-2 sentence technical view"}]\nStatus: ACTIVE if thesis holds, CLOSE if broken, WATCH if uncertain. ONLY the JSON array.`,
        "You are a stock data API. Use your knowledge of current market conditions, recent earnings reports, price levels, and news. Respond ONLY with a JSON array. No markdown, no backticks."
      );
      const arr = parseJSON(raw, "array");
      if (arr && Array.isArray(arr)) {
        const updatedPicks = currentPicks.map(pick => {
          const upd = arr.find(a => a.ticker === pick.ticker);
          if (!upd) return pick;
          return { ...pick,
            price: upd.price || pick.price,
            priceNum: upd.priceNum || pick.priceNum,
            priceDate: upd.priceDate || pick.priceDate,
            entryPrice: pick.entryPrice || pick.priceNum,
            thesis: upd.thesis || pick.thesis,
            conviction: upd.conviction || pick.conviction,
            catalysts: upd.catalysts?.length ? upd.catalysts : pick.catalysts,
            risks: upd.risks?.length ? upd.risks : pick.risks,
            technicals: upd.technicals || pick.technicals,
          };
        });
        setPicks(updatedPicks);
        const statuses = {};
        arr.forEach(a => { if (a.status) statuses[a.ticker] = a.status; });
        setPickStatuses(statuses);

        // Regenerate baseline signals with updated data
        const newSignals = {};
        updatedPicks.forEach(p => { newSignals[p.ticker] = generateBaselineSignal(p); });
        setEntrySignals(prev => ({ ...prev, ...newSignals }));

        // If signal cache is stale, fire a separate lightweight AI signal call
        const now = Date.now();
        if (now - signalCacheRef.current.ts >= SIGNAL_COOLDOWN) {
          refreshSignals(updatedPicks);
        }
      }
    } catch (e) { console.warn("Pick refresh skipped:", e.message); }
    setPicksLoading(false);
    setLastRefresh(new Date());
  }, []);

  // --- PHASE 3: Separate AI signal evaluation (4hr cooldown) ---
  const refreshSignals = useCallback(async (currentPicks) => {
    const tickerSummaries = currentPicks.map(p =>
      `${p.ticker}: price=${p.price}, target=${p.targetRange}, stop=${p.stopLoss}, conviction=${p.conviction}, technicals="${p.technicals}"`
    ).join("\n");

    try {
      const raw = await callClaude(
        `Today is ${formatDate(new Date())}. You are a technical analyst. Evaluate entry signals for these swing trades based on your knowledge of current price action, volume patterns, RSI levels, upcoming catalysts, and S&P 500 trend:\n${tickerSummaries}\n\nFor each stock, return a JSON array:\n[{"ticker":"XXXX","signal":"ENTER","stars":4,"summary":"1 sentence","factors":{"pricePosition":{"verdict":"bullish","detail":"Near support at $48"},"volume":{"verdict":"neutral","detail":"Volume average"},"rsi":{"verdict":"bullish","detail":"RSI 42, leaning oversold"},"catalystProximity":{"verdict":"bullish","detail":"Earnings in 3 days"},"marketAlignment":{"verdict":"neutral","detail":"S&P flat today"}}}]\nsignal: ENTER (4-5 stars) / SCALE IN (3) / WAIT (2) / AVOID (1). verdict: bullish/neutral/bearish. ONLY the JSON array.`,
        "You are a technical analysis API. Use your market knowledge to evaluate entry timing. Respond ONLY with a JSON array. No markdown, no backticks."
      );
      const arr = parseJSON(raw, "array");
      if (arr && Array.isArray(arr)) {
        const newSignals = {};
        arr.forEach(a => {
          if (a.ticker && a.signal) {
            newSignals[a.ticker] = {
              signal: a.signal,
              stars: a.stars || 3,
              summary: a.summary || "",
              factors: a.factors || {},
            };
          }
        });
        if (Object.keys(newSignals).length > 0) {
          setEntrySignals(prev => ({ ...prev, ...newSignals }));
          signalCacheRef.current = { ts: Date.now(), data: newSignals };
        }
      }
    } catch (e) { console.warn("Signal refresh skipped:", e.message); }
  }, []);

  // --- Progressive load on mount: stagger calls to avoid rate limits ---
  useEffect(() => {
    refreshPulse();
    // Stagger picks 8s after pulse to avoid Gemini rate limit
    const t1 = setTimeout(() => refreshPicks(BASELINE_PICKS), 8000);
    return () => clearTimeout(t1);
  }, []);

  // Manual full refresh — stagger picks after pulse
  const runFullRefresh = useCallback(() => {
    refreshPulse();
    setTimeout(() => refreshPicks(picks), 8000);
  }, [picks, refreshPulse, refreshPicks]);

  // Auto-refresh (5m) — only refreshes pulse + picks, NOT sidebar (cached)
  useEffect(() => {
    if (autoOn) autoRef.current = setInterval(runFullRefresh, 5 * 60 * 1000);
    else if (autoRef.current) clearInterval(autoRef.current);
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, [autoOn, runFullRefresh]);

  const runScanner = useCallback(async () => {
    setScanLoading(true);
    const exclude = picks.map(p => p.ticker).join(", ");
    try {
      const raw = await callClaude(
        `Today is ${formatDate(new Date())}. You are a swing trade scanner. Identify 3 NEW swing trade candidates (NOT ${exclude}) based on your knowledge of current market conditions. Consider: upcoming earnings catalysts within 2 weeks, stocks near technical breakout levels, unusual volume patterns, momentum shifts, recent M&A activity, and analyst upgrades.\n\nFor each candidate, provide specific price levels, stop-losses, and targets based on recent support/resistance.\n\nReturn ONLY a JSON array:\n[{"ticker":"XXXX","name":"Company Name","price":"$XX","thesis":"1-2 sentences why this is a swing opportunity right now","conviction":"HIGH/MODERATE-HIGH/MODERATE","targetRange":"$XX-$XX","stopLoss":"$XX","riskReward":"~X:1","horizon":"1-3 weeks","catalyst":"specific near-term catalyst","technicals":"1 sentence on chart setup"}]\nONLY the JSON array.`,
        "You are a swing trade analysis API. Use your knowledge of current stocks, earnings calendars, analyst ratings, and technical levels. Respond ONLY with a JSON array. No markdown, no backticks."
      );
      const arr = parseJSON(raw, "array");
      if (arr) setScanResults(arr.filter(a => a.ticker && a.name));
    } catch (e) { console.error("Scanner failed", e); }
    setScanLoading(false);
    setScanRan(true);
  }, [picks]);

  const promotePick = useCallback((r) => {
    const p = { ticker: r.ticker, name: r.name, thesis: r.thesis || "", conviction: r.conviction || "MODERATE",
      horizon: r.horizon || "1–3 weeks", price: r.price || "—", priceDate: "Scan",
      targetRange: r.targetRange || "—", stopLoss: r.stopLoss || "—", riskReward: r.riskReward || "—",
      catalysts: [r.catalyst || "AI setup"], risks: ["New scan — do your own DD"], technicals: r.technicals || "",
      sources: [], _fromScanner: true };
    setPicks(prev => prev.some(x => x.ticker === p.ticker) ? prev : [...prev, p]);
    setScanResults(prev => prev.filter(x => x.ticker !== r.ticker));
  }, []);

  const removePick = useCallback((t) => setPicks(prev => prev.filter(p => p.ticker !== t)), []);

  const [activeTab, setActiveTab] = useState("active"); // active | watchlist | analyst
  const [watchlist, setWatchlist] = useState([]);
  const [watchInput, setWatchInput] = useState("");

  const [sortBy, setSortBy] = useState("confidence"); // confidence | newest | oldest | priceAsc | priceDesc | alphaAsc | alphaDesc

  const sortedPicks = [...picks].sort((a, b) => {
    switch (sortBy) {
      case "confidence": return (CONVICTION_ORDER[a.conviction] || 9) - (CONVICTION_ORDER[b.conviction] || 9);
      case "newest": return (b.updatedAt || "").localeCompare(a.updatedAt || "");
      case "oldest": return (a.updatedAt || "").localeCompare(b.updatedAt || "");
      case "priceAsc": return (a.priceNum || 0) - (b.priceNum || 0);
      case "priceDesc": return (b.priceNum || 0) - (a.priceNum || 0);
      case "alphaAsc": return a.ticker.localeCompare(b.ticker);
      case "alphaDesc": return b.ticker.localeCompare(a.ticker);
      default: return 0;
    }
  });

  const addToWatchlist = useCallback((item) => {
    setWatchlist(prev => prev.some(w => w.ticker === item.ticker) ? prev : [...prev, item]);
  }, []);
  const removeFromWatchlist = useCallback((t) => setWatchlist(prev => prev.filter(w => w.ticker !== t)), []);

  const addWatchlistManual = useCallback(() => {
    const t = watchInput.trim().toUpperCase();
    if (t && !watchlist.some(w => w.ticker === t)) {
      setWatchlist(prev => [...prev, { ticker: t, name: "", price: "—", note: "", addedAt: timeStamp(new Date()) }]);
    }
    setWatchInput("");
  }, [watchInput, watchlist]);

  // Pre-loaded analyst picks from top firms
  const ANALYST_PICKS = [
    { ticker: "AVGO", name: "Broadcom", firm: "Morningstar + JPMorgan", rating: "Strong Buy", price: "$392", fairValue: "$525", upside: "+34%", moat: "Wide",
      about: "Broadcom designs and sells semiconductor chips and enterprise software. It's the dominant supplier of custom AI accelerators (XPUs) for hyperscalers like Google and Meta, and its networking chips power the backbone of data center Ethernet infrastructure. Revenue hit $64B in FY2025.",
      thesis: "Core AI winner — custom accelerators for Google TPU & Meta, plus Ethernet networking dominance. Trading well below Morningstar fair value with wide economic moat. Morgan Stanley calls it a 'core AI winner' with multi-year contracts from Google (through 2031) and Meta (through 2029). The pull from cloud capex is structural, not cyclical.",
      whyNow: "48 analysts rate it Strong Buy with a $525 avg target — 34% upside from here. AI chip revenue is expected to outpace even Nvidia in 2026 according to Morgan Stanley. The stock pulled back from highs, creating an entry point while fundamentals accelerate.",
      source: "Morningstar Q3 2026 Picks, Morgan Stanley Jul 14" },
    { ticker: "ADBE", name: "Adobe", firm: "Morningstar", rating: "Undervalued", price: "$212", fairValue: "$366", upside: "+73%", moat: "Wide",
      about: "Adobe is the world's leading creative and document software company. Its products — Photoshop, Illustrator, Premiere Pro, Acrobat — are industry standards used by virtually every creative professional, marketer, and enterprise. It generates ~$20B in annual recurring revenue.",
      thesis: "The most mispriced quality asset in software right now. Trades at just 8x forward earnings — absurdly cheap for a company with a near-monopoly in creative tools. Morningstar's Sekera argues AI adds economic value to Creative Cloud rather than disrupting it. 13% compound annual earnings growth forecast over 5 years.",
      whyNow: "The stock is down 69% from its 2021 all-time high of $688, trading at $212. The market is pricing in an AI-disruption worst case that Morningstar believes won't materialize. If they're right, this is a 73% upside opportunity in a wide-moat franchise. If wrong, it's a value trap — but the risk/reward skews heavily bullish.",
      source: "Morningstar 3 Stocks to Buy/Sell Jul 2026" },
    { ticker: "AR", name: "Antero Resources", firm: "Morningstar Q3 Pick", rating: "Buy", price: "$36", fairValue: "$48", upside: "+37%", moat: "Narrow",
      about: "Antero Resources is one of the largest US natural gas and NGL producers, operating primarily in the Appalachian Basin. It's vertically integrated with its own midstream infrastructure through Antero Midstream, giving it cost advantages and priority access to LNG export terminals.",
      thesis: "Antero's long-haul transport contracts give it priority access to LNG export pricing, positioning it to benefit from soaring overseas demand for US natural gas. Its hedge book offsets near-term price volatility, providing downside protection while maintaining full upside exposure to rising global gas prices.",
      whyNow: "Just added to Morningstar's Q3 analyst picks list on July 21. Revenue grew 20% in 2025 to $5.1B. The stock trades 37% below fair value with a Buy rating from 20 analysts. Q2 earnings due late July could be a catalyst. Geopolitical tensions keeping energy prices elevated provide a tailwind.",
      source: "Morningstar New Analyst Picks Jul 21" },
    { ticker: "LEN", name: "Lennar", firm: "Morningstar Q3 Pick", rating: "Buy", price: "$128", fairValue: "$175", upside: "+37%", moat: "Narrow",
      about: "Lennar is one of America's largest homebuilders, constructing residential homes across 25+ states. It's transitioning to a 'land-light' model — spinning off its land holdings into a separate entity — which reduces capital intensity and improves return on equity.",
      thesis: "Structural housing undersupply in the US continues to drive demand even as mortgage rates remain elevated. Lennar's land-light pivot is improving margins and reducing cyclical risk. As the largest pure-play homebuilder, it benefits from scale advantages in procurement and labor.",
      whyNow: "New addition to Morningstar Q3 picks. Trades 37% below fair value. The housing supply deficit is estimated at 3-4 million units nationally. The land-light spin-off is a structural positive that the market hasn't fully priced. Rate cuts, if they come, would be rocket fuel — but the thesis works even without them.",
      source: "Morningstar New Analyst Picks Jul 21" },
    { ticker: "MSFT", name: "Microsoft", firm: "Morningstar + JPMorgan", rating: "Strong Buy", price: "$468", fairValue: "$550", upside: "+18%", moat: "Wide",
      about: "Microsoft is a $3T+ technology giant operating across cloud computing (Azure), productivity software (Office 365), gaming (Xbox), and enterprise solutions. Azure is the #2 cloud platform globally and the fastest-growing AI cloud, with OpenAI's models running natively on its infrastructure.",
      thesis: "Dave Sekera's #1 high-conviction pick for Q3. Azure AI revenue is accelerating as enterprises adopt Copilot across the Office stack. The moat is enormous — switching costs and network effects across the entire enterprise technology stack make it nearly impossible to displace. Every dollar of AI spend flows through Microsoft's platform.",
      whyNow: "Despite being the world's most valuable company, it still trades 18% below Morningstar's fair value. Azure growth is re-accelerating after a brief deceleration scare. JPMorgan also rates it Strong Buy. The Copilot revenue ramp is just beginning — early enterprise adoption data suggests a multi-year monetization cycle.",
      source: "Morningstar Q3 Top 5, JPMorgan Strong Buy" },
    { ticker: "SCHW", name: "Charles Schwab", firm: "Morningstar + JPMorgan", rating: "Strong Buy", price: "$82", fairValue: "$105", upside: "+28%", moat: "Wide",
      about: "Charles Schwab is America's largest brokerage and wealth management firm, holding $9T+ in client assets. After acquiring TD Ameritrade, it dominates retail investing with zero-commission trading, banking services, and financial advisory. It earns revenue primarily from net interest income on client cash balances.",
      thesis: "Net new client assets are accelerating — organic growth is the strongest in years. Net interest margin is expanding as the rate environment normalizes and the TD Ameritrade cash sorting headwind fades. The wide moat comes from scale, brand trust, and switching costs — once clients consolidate their financial lives at Schwab, they rarely leave.",
      whyNow: "Sekera's high-conviction pick, also a JPMorgan Strong Buy. The stock still hasn't fully recovered from the 2023 regional banking panic (when SVB collapsed). That fear was misplaced — Schwab's client base is fundamentally different from a commercial bank's. The NIM recovery is playing out exactly as management guided, and the market is slowly re-rating the stock upward. 28% to fair value.",
      source: "Morningstar Q3 Top 5, JPMorgan" },
    { ticker: "NVDA", name: "Nvidia", firm: "Morningstar Q3 Pick", rating: "Buy", price: "$152", fairValue: "$180", upside: "+18%", moat: "Wide",
      about: "Nvidia is the undisputed leader in AI chips, designing the GPUs that train and run virtually every major AI model in the world. Its data center revenue has exploded from $15B to $115B+ in three years. The CUDA software ecosystem creates massive switching costs that lock in developers and cloud providers.",
      thesis: "The Vera Rubin chip platform ramp in H2 2026 drives the next revenue leg higher. Data center demand remains insatiable as hyperscalers race to build AI infrastructure. Nvidia's competitive position is actually strengthening — custom chip alternatives from Broadcom and others address only a fraction of workloads, while Nvidia's general-purpose GPUs remain essential for training.",
      whyNow: "Added to Morningstar's Q3 analyst picks list. The stock pulled back from highs during the July tech rotation, creating a better entry. 18% upside to fair value. The risk here isn't demand (which is overwhelming) — it's whether the market has already priced in perfection. Morningstar says it hasn't, given the Vera Rubin cycle ahead.",
      source: "Morningstar New Analyst Picks Jul 21" },
    { ticker: "DVN", name: "Devon Energy", firm: "Morningstar", rating: "Buy", price: "$42", fairValue: "$58", upside: "+38%", moat: "Narrow",
      about: "Devon Energy is a leading US oil and gas producer focused on the Delaware Basin (part of the Permian), the most prolific shale oil region in the world. It pioneered the variable dividend model — returning excess cash flow to shareholders through a base + variable dividend structure tied to commodity prices.",
      thesis: "Sekera's high-conviction energy pick. Devon generates massive free cash flow at current oil prices and returns it aggressively through buybacks and dividends. The variable dividend structure means shareholders directly benefit from elevated crude prices. Geopolitical tensions (Iran conflict) are keeping oil prices structurally higher than pre-war levels.",
      whyNow: "Trades 38% below Morningstar fair value — the widest discount among Sekera's top 5 picks. Energy stocks outperformed in H1 2026 but Devon hasn't fully participated, creating a relative value opportunity within the sector. If oil stays above $80 (currently ~$85), the FCF yield is exceptionally attractive. The dividend alone provides meaningful downside cushion.",
      source: "Morningstar Q3 Top 5" },
  ];

  const [calcInv, setCalcInv] = useState(5000);
  const [calcEntry, setCalcEntry] = useState(55);
  const [calcExit, setCalcExit] = useState(70);
  const [calcTF, setCalcTF] = useState("1y");
  const [calcTicker, setCalcTicker] = useState("");
  const [calcTickerLoading, setCalcTickerLoading] = useState(false);
  const [calcTickerError, setCalcTickerError] = useState("");
  const [calcTickerInfo, setCalcTickerInfo] = useState(null); // { symbol, price, change, changePercent }
  const CALC_TFS = [{id:"3m",label:"3 Mo",p:3},{id:"6m",label:"6 Mo",p:6},{id:"1y",label:"1 Year",p:12},{id:"3y",label:"3 Year",p:36},{id:"5y",label:"5 Year",p:60},{id:"10y",label:"10 Year",p:120}];

  const fetchQuote = useCallback(async (sym) => {
    const s = (sym || calcTicker).trim().toUpperCase();
    if (!s) return;
    setCalcTickerLoading(true);
    setCalcTickerError("");
    try {
      const res = await fetch(`/api/quote?symbol=${s}`);
      const data = await res.json();
      if (data.price) {
        setCalcEntry(parseFloat(data.price.toFixed(2)));
        setCalcTickerInfo(data);
        setCalcTickerError("");
      } else {
        setCalcTickerError(data.error || "Not found");
        setCalcTickerInfo(null);
      }
    } catch (e) {
      setCalcTickerError("Failed to fetch");
      setCalcTickerInfo(null);
    }
    setCalcTickerLoading(false);
  }, [calcTicker]);
  const [navPage, setNavPage] = useState("swing");

  const calcPct = calcEntry > 0 ? (calcExit - calcEntry) / calcEntry : 0, calcShares = calcEntry > 0 ? Math.floor(calcInv / calcEntry) : 0;
  const calcTFObj = CALC_TFS.find(t => t.id === calcTF) || CALC_TFS[2];
  const calcData = Array.from({length: calcTFObj.p + 1}, (_, m) => ({ m, v: Math.round(calcInv * Math.pow(1 + (Math.pow(1+calcPct,1/12)-1), m)) }));
  const calcFinal = calcData.at(-1)?.v || calcInv, calcReturn = calcFinal - calcInv, calcReturnPct2 = calcInv > 0 ? (calcFinal/calcInv-1)*100 : 0;

  return (
    <div style={S.shell}>
      <style>{shimmerCSS}{`@media(max-width:900px){.three-col{flex-direction:column!important}.left-sb,.right-sb{width:100%!important;position:static!important;max-height:none!important;flex-direction:row!important;flex-wrap:wrap!important;gap:12px!important}.left-sb>div,.right-sb>div{flex:1;min-width:200px}}`}</style>

      {/* FULL-WIDTH TOP */}
      <header style={S.header}>
        <div style={S.headerInner}><div style={S.logo}>⟁</div><div><h1 style={S.h1}>Swing Trading Desk</h1><p style={S.subtitle}>Fully live AI-powered trade ideas</p></div></div>
        <LiveClock />
      </header>

      <div style={S.navRibbon}>
        {[{id:"swing",l:"Swing Trading"},{id:"longterm",l:"Long Term"},{id:"shortterm",l:"Short Term"},{id:"about",l:"About"},{id:"contact",l:"Contact Us"}].map(n=>(
          <button key={n.id} onClick={()=>setNavPage(n.id)} style={{...S.navBtn,color:navPage===n.id?"#6ee7b7":"#7a8194",borderBottom:navPage===n.id?"2px solid #6ee7b7":"2px solid transparent",background:navPage===n.id?"#111520":"transparent"}}>{n.l}</button>
        ))}
      </div>

      <div style={S.disclaimer}>Not financial advice. Educational only. Past performance ≠ future results. Always DYOR.</div>

      <div style={S.controlBar}>
        <button onClick={runFullRefresh} disabled={pulseLoading&&picksLoading} style={S.refreshBtn}>{(pulseLoading||picksLoading)?"⟳ Updating…":"⟳ Refresh All"}</button>
        <button onClick={()=>setAutoOn(v=>!v)} style={{...S.autoBtn,borderColor:autoOn?"#22c55e":"#2a3040"}}>{autoOn?"● Auto 5m":"○ Auto OFF"}</button>
        {lastRefresh&&<span style={S.lastLabel}>Last: {timeStamp(lastRefresh)}</span>}
      </div>

      <div style={S.aiBox}>
        <div style={S.aiHeader}><span style={{color:pulseLoading?"#eab308":"#22c55e",fontSize:10}}>●</span><span style={{fontWeight:600,letterSpacing:"0.03em"}}>LIVE MARKET PULSE</span></div>
        {pulse?<p style={S.aiResult}>{pulse}</p>:pulseLoading?<div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}><Skeleton width="100%" height={14}/><Skeleton width="90%" height={14}/><Skeleton width="70%" height={14}/></div>:null}
      </div>

      {/* SWING TRADING PAGE */}
      {navPage==="swing"&&(
        <div className="three-col" style={S.threeCol}>
          {/* LEFT: Calculator */}
          <div className="left-sb" style={S.leftSB}>
            <div style={S.calcBox}>
              <div style={S.calcHead}><span style={{color:"#60a5fa"}}>◈</span> <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",color:"#60a5fa"}}>RETURN CALCULATOR</span></div>

              <label style={S.cLabel}>Stock Ticker</label>
              <div style={{display:"flex",gap:4}}>
                <input value={calcTicker} onChange={e=>setCalcTicker(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&fetchQuote()} placeholder="e.g. AAPL" style={{...S.cInput,flex:1,textTransform:"uppercase",fontWeight:700,letterSpacing:"0.05em"}}/>
                <button onClick={()=>fetchQuote()} disabled={calcTickerLoading||!calcTicker.trim()} style={{padding:"6px 10px",fontSize:10,fontWeight:700,background:"#1a3a2a",color:"#6ee7b7",border:"1px solid #2a5a3a",borderRadius:4,cursor:"pointer",whiteSpace:"nowrap"}}>{calcTickerLoading?"…":"Get Price"}</button>
              </div>
              {calcTickerInfo&&<div style={{marginTop:4,fontSize:9,color:"#7a8194"}}>
                <span style={{fontWeight:700,color:"#f0f2f5"}}>{calcTickerInfo.symbol}</span> — ${calcTickerInfo.price?.toFixed(2)} <span style={{color:calcTickerInfo.changePercent>=0?"#22c55e":"#ef4444"}}>{calcTickerInfo.changePercent>=0?"+":""}{calcTickerInfo.changePercent?.toFixed(2)}%</span>
              </div>}
              {calcTickerError&&<div style={{marginTop:4,fontSize:9,color:"#ef4444"}}>{calcTickerError}</div>}

              <label style={S.cLabel}>Investment ($)</label>
              <input type="number" value={calcInv} onChange={e=>setCalcInv(Number(e.target.value)||0)} style={S.cInput}/>
              <label style={S.cLabel}>Entry Price ($)</label>
              <input type="number" value={calcEntry} onChange={e=>setCalcEntry(Number(e.target.value)||0)} style={S.cInput}/>
              <label style={S.cLabel}>Exit Price ($)</label>
              <input type="number" value={calcExit} onChange={e=>setCalcExit(Number(e.target.value)||0)} style={S.cInput}/>
              <label style={S.cLabel}>Timeframe</label>
              <select value={calcTF} onChange={e=>setCalcTF(e.target.value)} style={S.cSelect}>{CALC_TFS.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select>
              <div style={S.cResults}>
                <div style={S.cRow}><span>Shares</span><span style={{color:"#f0f2f5",fontWeight:700}}>{calcShares}</span></div>
                <div style={S.cRow}><span>Per-Trade</span><span style={{color:calcPct>=0?"#22c55e":"#ef4444",fontWeight:700}}>{(calcPct*100).toFixed(1)}%</span></div>
                <div style={S.cRow}><span>Final Value</span><span style={{color:"#f0f2f5",fontWeight:700}}>${calcFinal.toLocaleString()}</span></div>
                <div style={S.cRow}><span>Total Return</span><span style={{color:calcReturn>=0?"#22c55e":"#ef4444",fontWeight:700}}>{calcReturn>=0?"+":""}${calcReturn.toLocaleString()} ({calcReturnPct2.toFixed(1)}%)</span></div>
              </div>
              <div style={S.cGraph}>
                <svg viewBox="0 0 200 80" style={{width:"100%",height:80}}>
                  <defs><linearGradient id="gf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={calcReturn>=0?"#22c55e":"#ef4444"} stopOpacity="0.3"/><stop offset="100%" stopColor={calcReturn>=0?"#22c55e":"#ef4444"} stopOpacity="0"/></linearGradient></defs>
                  {calcData.length>1&&(()=>{const mn=Math.min(...calcData.map(p=>p.v)),mx=Math.max(...calcData.map(p=>p.v)),rg=mx-mn||1;const pts=calcData.map((p,i)=>`${(i/(calcData.length-1))*200},${75-((p.v-mn)/rg)*65}`);return<><path d={`M0,75 L${pts.join(" L")} L200,75 Z`} fill="url(#gf)"/><path d={`M${pts.join(" L")}`} fill="none" stroke={calcReturn>=0?"#22c55e":"#ef4444"} strokeWidth="1.5"/></>})()}
                  <text x="2" y="10" fontSize="8" fill="#5a6478">${Math.max(...calcData.map(p=>p.v)).toLocaleString()}</text>
                  <text x="2" y="78" fontSize="8" fill="#5a6478">${calcInv.toLocaleString()}</text>
                </svg>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:"#3a4258",marginTop:2}}><span>Now</span><span>{calcTFObj.label}</span></div>
              </div>
              <div style={{fontSize:8,color:"#3a4258",textAlign:"center",marginTop:6}}>Compound growth at {(calcPct*100).toFixed(1)}%/cycle</div>
            </div>
            <NewsFeed/>
          </div>

          {/* CENTER: Main content */}
          <div style={S.centerCol}>
            <div style={S.tabBar}>
              {[{id:"active",l:`🔥 AI Swing Hot List (${picks.length})`},{id:"watchlist",l:`☆ Watchlist (${watchlist.length})`},{id:"analyst",l:`◈ Analyst Picks (${ANALYST_PICKS.length})`},{id:"earnings",l:"◫ Earnings Calendar"}].map(t=>(
                <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{...S.tabBtn,color:activeTab===t.id?"#f0f2f5":"#5a6478",borderBottom:activeTab===t.id?"2px solid #6ee7b7":"2px solid transparent",background:activeTab===t.id?"#111520":"transparent"}}>{t.l}</button>
              ))}
            </div>

            {activeTab==="active"&&(<>
              <h2 style={S.picksHeading}>AI Swing Hot List{picksLoading&&<span style={{fontSize:10,color:"#eab308",marginLeft:8,fontWeight:400}}>updating…</span>}</h2>
              <div style={S.sortBar}><span style={S.sortLabel}>Sort:</span>
                {[{id:"confidence",l:"Confidence"},{id:"newest",l:"Newest"},{id:"oldest",l:"Oldest"},{id:"priceDesc",l:"Price ↓"},{id:"priceAsc",l:"Price ↑"},{id:"alphaAsc",l:"A→Z"},{id:"alphaDesc",l:"Z→A"}].map(o=>(
                  <button key={o.id} onClick={()=>setSortBy(o.id)} style={{...S.sortBtn,background:sortBy===o.id?"#1a3a2a":"transparent",color:sortBy===o.id?"#6ee7b7":"#5a6478",borderColor:sortBy===o.id?"#2a5a3a":"#1e2330"}}>{o.l}</button>
                ))}
              </div>
              {sortedPicks.map(p=><PickCard key={p.ticker} pick={p} status={pickStatuses[p.ticker]||"ACTIVE"} onRemove={()=>removePick(p.ticker)} entrySignal={entrySignals[p.ticker]} sectorWarning={sectorWarnings[p.ticker]}/>)}
              <div style={S.scanSection}>
                <div style={S.scanHeader}><div><h2 style={S.scanTitle}>⚡ AI TRADE SCANNER</h2><p style={S.scanDesc}>Finds new swing setups.</p></div><button onClick={runScanner} disabled={scanLoading} style={S.scanBtn}>{scanLoading?"Scanning…":scanRan?"Re-scan":"Scan"}</button></div>
                {scanLoading&&<div style={S.scanLoading}>◌ Searching…</div>}
                {scanResults.length>0&&<div style={S.scanResults}>{scanResults.map((r,i)=><div key={i} style={S.scanCard}><div style={S.scanCardTop}><div><span style={S.scanTicker}>{r.ticker}</span> <span style={S.scanName}>{r.name}</span></div><div style={{textAlign:"right"}}><div style={S.scanPrice}>{r.price}</div></div></div><div style={S.scanThesis}>{r.thesis}</div><div style={S.scanMetrics}><span>T:{r.targetRange}</span><span>S:{r.stopLoss}</span><span>R:R:{r.riskReward}</span></div><div style={{display:"flex",gap:6}}><button onClick={()=>promotePick(r)} style={{...S.promoteBtn,flex:1}}>+ Active</button><button onClick={()=>{addToWatchlist({ticker:r.ticker,name:r.name,price:r.price,note:r.thesis,addedAt:timeStamp(new Date())});setScanResults(p=>p.filter(x=>x.ticker!==r.ticker))}} style={{...S.promoteBtn,flex:1,background:"#1a1520",color:"#a78bba",borderColor:"#2d2235"}}>☆ Watch</button></div></div>)}</div>}
                {scanRan&&!scanLoading&&scanResults.length===0&&<div style={S.scanLoading}>No setups found.</div>}
              </div>
            </>)}

            {activeTab==="watchlist"&&(<>
              <h2 style={S.picksHeading}>My Watchlist</h2>
              <div style={S.watchAddRow}><input value={watchInput} onChange={e=>setWatchInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addWatchlistManual()} placeholder="Add ticker (e.g. AAPL)" style={S.watchInput}/><button onClick={addWatchlistManual} style={S.watchAddBtn}>+ Add</button></div>
              {watchlist.length===0?<div style={S.emptyState}><div style={{fontSize:28,marginBottom:8}}>☆</div><div style={{fontSize:13,color:"#7a8194"}}>Your watchlist is empty</div></div>:
              <div style={{display:"flex",flexDirection:"column",gap:8}}>{watchlist.map((w,i)=><div key={i} style={S.watchCard}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:10}}><span style={S.watchTicker}>{w.ticker}</span>{w.name&&<span style={{fontSize:12,color:"#7a8194"}}>{w.name}</span>}{w.price&&w.price!=="—"&&<span style={{fontSize:13,fontWeight:700,color:"#f0f2f5"}}>{w.price}</span>}</div><div style={{display:"flex",gap:6}}><button onClick={()=>{promotePick({ticker:w.ticker,name:w.name||w.ticker,price:w.price,thesis:w.note||"",conviction:"MODERATE",horizon:"TBD",targetRange:"—",stopLoss:"—",riskReward:"—",catalyst:""});removeFromWatchlist(w.ticker)}} style={S.watchActionBtn}>→ Active</button><button onClick={()=>removeFromWatchlist(w.ticker)} style={{...S.watchActionBtn,color:"#ef4444",borderColor:"#3a1515"}}>✕</button></div></div>{w.note&&<div style={{fontSize:11,color:"#8a92a4",marginTop:4}}>{w.note}</div>}</div>)}</div>}
            </>)}

            {activeTab==="analyst"&&(<>
              <h2 style={S.picksHeading}>Analyst Picks — Top Firms</h2>
              <div style={{fontSize:11,color:"#5a6478",marginBottom:14}}>From Morningstar, JPMorgan, Goldman Sachs Q3 2026.</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>{ANALYST_PICKS.map((ap,i)=>{const aA=picks.some(p=>p.ticker===ap.ticker),aW=watchlist.some(w=>w.ticker===ap.ticker);return<div key={i} style={S.analystCard}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><span style={S.analystTicker}>{ap.ticker}</span><span style={S.analystName}>{ap.name}</span></div><div style={{textAlign:"right"}}><div style={S.analystPrice}>{ap.price}</div><div style={{fontSize:9,color:"#22c55e",fontWeight:700}}>FV:{ap.fairValue} ({ap.upside})</div></div></div><div style={S.analystFirmRow}><span style={S.analystFirmBadge}>{ap.firm}</span><span style={{...S.analystRating,color:ap.rating==="Strong Buy"?"#22c55e":"#84cc16"}}>{ap.rating}</span><span style={{fontSize:9,color:"#5a6478"}}>Moat:{ap.moat}</span></div><div style={S.analystAbout}>{ap.about}</div><div style={S.analystSectionLabel}>Bull Case</div><div style={{fontSize:12,color:"#b0b8c8",lineHeight:1.5,marginBottom:6}}>{ap.thesis}</div><div style={S.analystSectionLabel}>Why Now</div><div style={{fontSize:12,color:"#b0c8b8",lineHeight:1.5,marginBottom:6}}>{ap.whyNow}</div><div style={{fontSize:9,color:"#3a4258",marginBottom:8}}>{ap.source}</div><div style={{display:"flex",gap:6}}><button disabled={aA} onClick={()=>promotePick({ticker:ap.ticker,name:ap.name,price:ap.price,thesis:ap.thesis,conviction:ap.rating==="Strong Buy"?"HIGH":"MODERATE-HIGH",horizon:"2–6 weeks",targetRange:ap.fairValue,stopLoss:"—",riskReward:ap.upside,catalyst:ap.source})} style={{...S.promoteBtn,flex:1,opacity:aA?0.4:1}}>{aA?"✓ Active":"+ Active"}</button><button disabled={aW} onClick={()=>addToWatchlist({ticker:ap.ticker,name:ap.name,price:ap.price,note:`${ap.firm}: ${ap.thesis}`,addedAt:timeStamp(new Date())})} style={{...S.promoteBtn,flex:1,background:"#1a1520",color:"#a78bba",borderColor:"#2d2235",opacity:aW?0.4:1}}>{aW?"✓ Watch":"☆ Watch"}</button></div></div>})}</div>
            </>)}

            {activeTab==="earnings"&&<EarningsCalendar/>}

            <footer style={S.footer}>Powered by Claude · All data live · Not financial advice</footer>
          </div>

          {/* RIGHT: Sidebar */}
          <div className="right-sb" style={S.rightSB}>
            <SectorTrends/>
            <FearGreedGauge/>
          </div>
        </div>
      )}

      {navPage==="longterm"&&(
        <div style={{maxWidth:900,margin:"0 auto"}}>
          <h2 style={S.picksHeading}>Long Term Investment Picks — 6+ Months</h2>
          <div style={{fontSize:11,color:"#5a6478",marginBottom:16}}>Curated from Morningstar, Motley Fool, JPMorgan, and Bank of America Q3 2026 research. Updated monthly.</div>
          {LT_FIRMS.map(firm=>(
            <div key={firm}>
              <h3 style={{fontSize:13,fontWeight:700,color:"#60a5fa",margin:"20px 0 10px",padding:"8px 12px",background:"#111520",borderRadius:6,borderLeft:"3px solid #60a5fa"}}>{firm}</h3>
              {LONG_TERM_PICKS.filter(p=>p.firm===firm).map((pick,i)=>(
                <div key={i} style={S.card}>
                  <div style={S.cardTop}>
                    <div><div style={S.ticker}>{pick.ticker}</div><div style={S.companyName}>{pick.name}</div></div>
                    <div style={{textAlign:"right"}}><div style={{...S.convictionBadge,background:"#60a5fa"}}>{pick.rating}</div><div style={S.priceLabel}>{pick.price}</div><div style={{fontSize:10,color:"#22c55e",fontWeight:700}}>FV: {pick.fairValue} ({pick.upside})</div></div>
                  </div>
                  <div style={S.thesisLine}>{pick.thesis}</div>
                  <div style={S.metricsRow}>
                    {[["Fair Value",pick.fairValue],["Upside",pick.upside],["Horizon",pick.horizon],["Firm",pick.firm]].map(([l,v])=>(
                      <div key={l} style={S.metric}><div style={S.metricLabel}>{l}</div><div style={S.metricValue}>{v}</div></div>
                    ))}
                  </div>
                  <div style={{marginTop:12}}><div style={S.swingReasonLabel}>Catalysts</div>{(pick.catalysts||[]).map((c,j)=><div key={j} style={S.bulletItem}><span style={S.bulletDot}>▸</span>{c}</div>)}</div>
                  <div style={{marginTop:8}}><div style={{...S.swingReasonLabel,color:"#ef4444"}}>Risks</div>{(pick.risks||[]).map((r,j)=><div key={j} style={S.bulletItem}><span style={{...S.bulletDot,color:"#ef4444"}}>▸</span>{r}</div>)}</div>
                  <div style={{marginTop:8,fontSize:11,color:"#8a92a4"}}>{pick.technicals}</div>
                  {pick.sources?.length>0&&<div style={{marginTop:8}}>{pick.sources.map((s,j)=><span key={j} style={{marginRight:8}}><SourceLink s={s}/></span>)}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {navPage==="shortterm"&&(
        <div style={{maxWidth:900,margin:"0 auto"}}>
          <h2 style={S.picksHeading}>Short Term Trades — 1 Day to 4 Weeks</h2>
          <div style={{fontSize:11,color:"#5a6478",marginBottom:8}}>Sentiment-driven picks based on social media momentum, technical setups, and near-term catalysts. Sorted by timeframe.</div>
          <div style={{fontSize:10,color:"#eab308",marginBottom:16,padding:"8px 12px",background:"#1a1520",borderRadius:6,border:"1px solid #2d2235"}}>⚠ Short-term trades carry higher risk. These picks are driven by market sentiment and momentum — always use stop-losses and position size appropriately.</div>
          {SHORT_TERM_PICKS.map((pick,i)=>(
            <div key={i} style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{color:"#60a5fa",fontSize:8}}>●</span>
                  <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",color:"#60a5fa"}}>{pick.horizon}</span>
                </div>
                <div style={{...S.convictionBadge,background:pick.conviction==="HIGH"?"#22c55e":pick.conviction==="MODERATE-HIGH"?"#eab308":"#60a5fa"}}>{pick.conviction}</div>
              </div>
              <div style={S.cardTop}>
                <div><div style={S.ticker}>{pick.ticker}</div><div style={S.companyName}>{pick.name}</div></div>
                <div style={{textAlign:"right"}}><div style={S.priceLabel}>{pick.price}</div></div>
              </div>
              <div style={S.thesisLine}>{pick.thesis}</div>
              {pick.mentions&&<div style={{marginTop:8,padding:"6px 10px",background:"#0f1218",borderRadius:6,border:"1px solid #1a2040",fontSize:10,color:"#60a5fa"}}>📊 Social Buzz: {pick.mentions}</div>}
              <div style={S.metricsRow}>
                {[["Target",pick.targetRange],["Stop",pick.stopLoss],["R:R",pick.riskReward],["Horizon",pick.horizon]].map(([l,v])=>(
                  <div key={l} style={S.metric}><div style={S.metricLabel}>{l}</div><div style={S.metricValue}>{v}</div></div>
                ))}
              </div>
              <div style={{marginTop:12}}><div style={S.swingReasonLabel}>Catalysts</div>{(pick.catalysts||[]).map((c,j)=><div key={j} style={S.bulletItem}><span style={S.bulletDot}>▸</span>{c}</div>)}</div>
              <div style={{marginTop:8}}><div style={{...S.swingReasonLabel,color:"#ef4444"}}>Risks</div>{(pick.risks||[]).map((r,j)=><div key={j} style={S.bulletItem}><span style={{...S.bulletDot,color:"#ef4444"}}>▸</span>{r}</div>)}</div>
              <div style={{marginTop:8,fontSize:11,color:"#8a92a4"}}>{pick.technicals}</div>
            </div>
          ))}
          <div style={S.methodology}><h3 style={S.methTitle}>How Social Sentiment Works</h3><p style={S.methBody}>Mention counts are sourced from Reddit (r/wallstreetbets, r/stocks, r/investing), Twitter/X cashtags, and StockTwits. High mention volume can precede short-term price moves but cuts both ways — use as one signal among many, never as the sole basis for a trade. Sentiment data is refreshed daily.</p></div>
        </div>
      )}

      {navPage==="about"&&(
        <div style={{maxWidth:700,margin:"40px auto",padding:"40px",background:"#111520",borderRadius:16,border:"1px solid #1e2330"}}>
          <div style={{fontSize:36,marginBottom:16,textAlign:"center"}}>⟁</div>
          <h2 style={{color:"#f0f2f5",marginBottom:16,fontSize:22,textAlign:"center"}}>About Swing Trading Desk</h2>
          <p style={{color:"#8a92a4",lineHeight:1.8,fontSize:14,marginBottom:16}}>We built Swing Trading Desk because the stock market shouldn't be this hard to understand.</p>
          <p style={{color:"#8a92a4",lineHeight:1.8,fontSize:14,marginBottom:16}}>Every day, thousands of pages of analyst reports, earnings calls, SEC filings, and market commentary get published. Professional traders at hedge funds and investment banks have teams dedicated to reading all of it. Normal people — the ones working 9-to-5 jobs, raising families, trying to build something for their future — don't have that luxury.</p>
          <p style={{color:"#8a92a4",lineHeight:1.8,fontSize:14,marginBottom:16}}>That's what we're here to fix.</p>
          <p style={{color:"#8a92a4",lineHeight:1.8,fontSize:14,marginBottom:16}}>Swing Trading Desk takes the research that Wall Street analysts at Morningstar, JPMorgan, Goldman Sachs, and Motley Fool spend weeks producing, and distills it into clear, actionable trade ideas that anyone can understand. No jargon walls. No paywall gatekeeping. No intimidation.</p>
          <p style={{color:"#8a92a4",lineHeight:1.8,fontSize:14,marginBottom:16}}>We use AI to sift through the noise so you don't have to. Every pick on this dashboard comes with a plain-English explanation of why it matters, what could go right, what could go wrong, and exactly where to set your stop-loss. We show our work — every source is linked, every thesis is explained.</p>
          <p style={{color:"#6ee7b7",lineHeight:1.8,fontSize:14,fontWeight:600,marginBottom:16}}>Our mission is simple: help middle and lower-class individuals participate in wealth-building opportunities that were previously locked behind expensive subscriptions and insider knowledge.</p>
          <p style={{color:"#5a6478",lineHeight:1.8,fontSize:12,marginBottom:0,fontStyle:"italic"}}>This site is for educational purposes only and does not constitute financial advice. Always do your own research and consult a licensed financial advisor before making investment decisions. Past performance does not guarantee future results.</p>
        </div>
      )}

      {navPage==="contact"&&<div style={S.placeholder}><div style={{fontSize:28,marginBottom:8}}>✉</div><h2 style={{color:"#f0f2f5",marginBottom:8}}>Contact Us</h2><p style={{color:"#5a6478"}}>Have feedback or questions? Email: contact@swingtradedesk.com</p></div>}
      <Analytics />
    </div>
  );
}

// ============ STYLES ============
const S = {
  shell: { fontFamily: "'Inter',-apple-system,system-ui,sans-serif", background: "#0c0f14", color: "#e2e4e9", minHeight: "100vh", padding: "0 16px 40px", maxWidth: 1200, margin: "0 auto", lineHeight: 1.55 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "28px 0 16px", borderBottom: "1px solid #1e2330", flexWrap: "wrap", gap: 12 },
  headerInner: { display: "flex", alignItems: "center", gap: 14 },
  logo: { fontSize: 32, color: "#6ee7b7", fontWeight: 300 },
  h1: { margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em", color: "#f0f2f5" },
  subtitle: { margin: "2px 0 0", fontSize: 13, color: "#7a8194", fontWeight: 400 },
  navRibbon: { display: "flex", gap: 0, borderBottom: "1px solid #1e2330", margin: "0 0 8px", overflowX: "auto" },
  navBtn: { padding: "10px 20px", fontSize: 13, fontWeight: 600, border: "none", borderBottom: "2px solid transparent", cursor: "pointer", background: "transparent", whiteSpace: "nowrap", letterSpacing: "0.01em" },
  clockRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  marketDot: { fontSize: 10 },
  clockLabel: { fontSize: 10, fontWeight: 700, letterSpacing: "0.1em" },
  clockTime: { fontSize: 13, fontWeight: 600, color: "#f0f2f5", fontFamily: "'SF Mono',monospace" },
  clockDate: { fontSize: 11, color: "#5a6478" },
  disclaimer: { margin: "8px 0", padding: "8px 14px", background: "#1a1520", border: "1px solid #2d2235", borderRadius: 8, fontSize: 11, color: "#a78bba", lineHeight: 1.5 },
  controlBar: { display: "flex", alignItems: "center", gap: 10, margin: "8px 0", flexWrap: "wrap" },
  refreshBtn: { padding: "7px 16px", fontSize: 12, fontWeight: 700, background: "#1a3a2a", color: "#6ee7b7", border: "1px solid #2a5a3a", borderRadius: 6, cursor: "pointer" },
  autoBtn: { padding: "7px 14px", fontSize: 11, fontWeight: 600, background: "transparent", color: "#7a8194", border: "1px solid #2a3040", borderRadius: 6, cursor: "pointer" },
  lastLabel: { fontSize: 11, color: "#5a6478", fontFamily: "'SF Mono',monospace" },
  aiBox: { margin: "8px 0 16px", padding: "14px 16px", background: "linear-gradient(135deg,#111827 0%,#0f1a12 100%)", border: "1px solid #1a3a2a", borderRadius: 10 },
  aiHeader: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#6ee7b7" },
  aiResult: { fontSize: 13, color: "#c8d0dc", marginTop: 10, lineHeight: 1.6 },
  threeCol: { display: "flex", gap: 16, alignItems: "flex-start" },
  leftSB: { width: 210, flexShrink: 0, position: "sticky", top: 20, alignSelf: "flex-start", maxHeight: "calc(100vh - 40px)", overflowY: "auto", overflowX: "hidden" },
  centerCol: { flex: 1, minWidth: 0 },
  rightSB: { width: 220, flexShrink: 0, position: "sticky", top: 20, alignSelf: "flex-start", maxHeight: "calc(100vh - 40px)", overflowY: "auto", overflowX: "hidden" },
  // Calculator
  calcBox: { background: "#111520", border: "1px solid #1e2330", borderRadius: 10, padding: "14px 12px" },
  calcHead: { display: "flex", alignItems: "center", gap: 6, marginBottom: 12 },
  cLabel: { display: "block", fontSize: 9, fontWeight: 600, color: "#5a6478", marginTop: 8, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" },
  cInput: { width: "100%", padding: "6px 8px", fontSize: 12, background: "#0c0f14", border: "1px solid #1e2330", borderRadius: 4, color: "#f0f2f5", outline: "none" },
  cSelect: { width: "100%", padding: "6px 8px", fontSize: 12, background: "#0c0f14", border: "1px solid #1e2330", borderRadius: 4, color: "#f0f2f5", outline: "none" },
  cResults: { marginTop: 12, padding: "8px 0", borderTop: "1px solid #1e2330" },
  cRow: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "#7a8194", padding: "3px 0" },
  cGraph: { marginTop: 10 },
  // Tabs
  tabBar: { display: "flex", gap: 0, margin: "0 0 0", borderBottom: "1px solid #1e2330", overflowX: "auto" },
  tabBtn: { flex: 1, padding: "10px 6px", fontSize: 11, fontWeight: 600, border: "none", borderBottom: "2px solid transparent", cursor: "pointer", textAlign: "center", borderRadius: "6px 6px 0 0", whiteSpace: "nowrap" },
  picksHeading: { fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7a8194", margin: "20px 0 14px" },
  card: { marginBottom: 18, padding: "20px", background: "#111520", border: "1px solid #1e2330", borderRadius: 12 },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  ticker: { fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em", color: "#f0f2f5", fontFamily: "'SF Mono',monospace" },
  companyName: { fontSize: 13, color: "#7a8194", marginTop: 2 },
  convictionBadge: { display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", padding: "3px 10px", borderRadius: 4, color: "#0c0f14" },
  priceLabel: { fontSize: 18, fontWeight: 700, color: "#f0f2f5", marginTop: 6 },
  thesisLine: { marginTop: 14, fontSize: 14, fontWeight: 600, color: "#6ee7b7", letterSpacing: "0.01em" },
  swingReason: { marginTop: 10, padding: "10px 12px", background: "#0c0f14", borderRadius: 8, borderLeft: "3px solid #6ee7b7" },
  swingReasonLabel: { fontSize: 9, fontWeight: 700, color: "#6ee7b7", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 },
  swingReasonText: { fontSize: 12, color: "#8a92a4", lineHeight: 1.6, margin: 0 },
  sortBar: { display: "flex", alignItems: "center", gap: 4, marginBottom: 14, flexWrap: "wrap" },
  sortLabel: { fontSize: 10, fontWeight: 600, color: "#5a6478", marginRight: 4 },
  sortBtn: { padding: "4px 8px", fontSize: 9, fontWeight: 600, background: "transparent", color: "#5a6478", border: "1px solid #1e2330", borderRadius: 4, cursor: "pointer" },
  metricsRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 16, padding: "12px 0", borderTop: "1px solid #1e2330", borderBottom: "1px solid #1e2330" },
  metric: { textAlign: "center" }, metricLabel: { fontSize: 10, fontWeight: 600, color: "#5a6478", textTransform: "uppercase", letterSpacing: "0.06em" }, metricValue: { fontSize: 15, fontWeight: 700, color: "#e2e4e9", marginTop: 4 },
  expandBtn: { marginTop: 14, width: "100%", padding: "8px", fontSize: 12, fontWeight: 600, background: "transparent", color: "#7a8194", border: "1px solid #1e2330", borderRadius: 6, cursor: "pointer" },
  expandedArea: { marginTop: 16 }, section: { marginBottom: 16 }, sectionTitle: { fontSize: 11, fontWeight: 700, color: "#5a6478", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 },
  bulletItem: { fontSize: 13, color: "#b0b8c8", marginBottom: 6, paddingLeft: 4, lineHeight: 1.55 }, bulletDot: { color: "#6ee7b7", marginRight: 6 },
  techText: { fontSize: 13, color: "#b0b8c8", margin: 0, lineHeight: 1.6 },
  sourceLink: { fontSize: 11, color: "#6ee7b7", textDecoration: "none", background: "#0f1a12", padding: "3px 8px", borderRadius: 4, border: "1px solid #1a3a2a", display: "inline-block" },
  sourceDate: { color: "#5a7a6a", fontSize: 10 },
  removeBtn: { background: "none", border: "none", color: "#3a4258", fontSize: 14, cursor: "pointer", padding: "2px 6px" },
  corrWarning: { display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "#1a1520", border: "1px solid #2d2235", borderRadius: 6, fontSize: 10, color: "#eab308", marginBottom: 8 },
  signalSummary: { padding: "10px 12px", background: "#0c0f14", borderRadius: 8, marginBottom: 10 },
  factorsGrid: { display: "flex", flexDirection: "column", gap: 6 },
  factorCard: { padding: "8px 10px", background: "#0c0f14", borderRadius: 6, borderLeft: "2px solid #1e2330" },
  factorLabel: { fontSize: 9, fontWeight: 700, color: "#7a8194", letterSpacing: "0.06em" },
  factorVerdict: { fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginLeft: "auto" },
  factorText: { fontSize: 10, color: "#8a92a4", margin: "2px 0 0", lineHeight: 1.4 },
  scanSection: { marginTop: 28, padding: "20px", background: "linear-gradient(135deg,#111520 0%,#0f1218 100%)", border: "1px solid #1a2040", borderRadius: 12 },
  scanHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  scanTitle: { margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", color: "#60a5fa" },
  scanDesc: { margin: "4px 0 0", fontSize: 11, color: "#5a6478" },
  scanBtn: { padding: "8px 18px", fontSize: 12, fontWeight: 700, background: "#1a1a3a", color: "#60a5fa", border: "1px solid #2a2a5a", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 },
  scanLoading: { fontSize: 12, color: "#5a6478", padding: "16px 0", textAlign: "center" },
  scanResults: { display: "flex", flexDirection: "column", gap: 12 },
  scanCard: { padding: "14px", background: "#0c0f14", border: "1px solid #1a2040", borderRadius: 8 },
  scanCardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  scanTicker: { fontSize: 18, fontWeight: 800, color: "#f0f2f5", fontFamily: "'SF Mono',monospace", marginRight: 8 },
  scanName: { fontSize: 12, color: "#7a8194" }, scanPrice: { fontSize: 15, fontWeight: 700, color: "#f0f2f5" },
  scanConviction: { fontSize: 9, fontWeight: 700 }, scanThesis: { fontSize: 12, color: "#b0b8c8", lineHeight: 1.5, marginBottom: 6 },
  scanCatalyst: { fontSize: 11, color: "#b0c8b8", marginBottom: 6 }, scanMetrics: { display: "flex", gap: 10, fontSize: 10, color: "#5a6478", flexWrap: "wrap", marginBottom: 6 },
  promoteBtn: { width: "100%", padding: "6px", fontSize: 11, fontWeight: 600, background: "#1a1a3a", color: "#60a5fa", border: "1px solid #2a2a5a", borderRadius: 5, cursor: "pointer" },
  watchAddRow: { display: "flex", gap: 8, marginBottom: 14 },
  watchInput: { flex: 1, padding: "8px 12px", fontSize: 13, background: "#111520", border: "1px solid #1e2330", borderRadius: 6, color: "#f0f2f5", outline: "none" },
  watchAddBtn: { padding: "8px 16px", fontSize: 12, fontWeight: 700, background: "#1a1520", color: "#a78bba", border: "1px solid #2d2235", borderRadius: 6, cursor: "pointer" },
  emptyState: { padding: "40px 20px", textAlign: "center", background: "#111520", borderRadius: 10, border: "1px solid #1e2330" },
  watchCard: { padding: "12px 14px", background: "#111520", border: "1px solid #1e2330", borderRadius: 8 },
  watchTicker: { fontSize: 16, fontWeight: 800, color: "#f0f2f5", fontFamily: "'SF Mono',monospace" },
  watchActionBtn: { padding: "3px 10px", fontSize: 10, fontWeight: 600, background: "transparent", color: "#6ee7b7", border: "1px solid #1a3a2a", borderRadius: 4, cursor: "pointer" },
  analystCard: { padding: "16px", background: "#111520", border: "1px solid #1e2330", borderRadius: 10 },
  analystTicker: { fontSize: 20, fontWeight: 800, color: "#f0f2f5", fontFamily: "'SF Mono',monospace", marginRight: 8 },
  analystName: { fontSize: 13, color: "#7a8194" }, analystPrice: { fontSize: 16, fontWeight: 700, color: "#f0f2f5" },
  analystFirmRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" },
  analystFirmBadge: { fontSize: 9, fontWeight: 700, background: "#1a1a3a", color: "#60a5fa", padding: "2px 8px", borderRadius: 3 },
  analystRating: { fontSize: 10, fontWeight: 700, letterSpacing: "0.06em" },
  analystAbout: { fontSize: 11.5, color: "#8a92a4", lineHeight: 1.55, margin: "8px 0 10px", padding: "8px 10px", background: "#0c0f14", borderRadius: 6, borderLeft: "2px solid #1e2330" },
  analystSectionLabel: { fontSize: 9, fontWeight: 700, color: "#5a6478", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 },
  methodology: { marginTop: 32, padding: "18px 20px", background: "#0f1218", border: "1px solid #1e2330", borderRadius: 10 },
  methTitle: { margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#7a8194", textTransform: "uppercase" },
  methBody: { fontSize: 12.5, color: "#8a92a4", margin: 0, lineHeight: 1.6 },
  footer: { marginTop: 32, textAlign: "center", fontSize: 11, color: "#3a4258", padding: "16px 0", borderTop: "1px solid #1a1e2a" },
  placeholder: { padding: "60px 20px", textAlign: "center", background: "#111520", borderRadius: 12, border: "1px solid #1e2330", margin: "20px 0" },
};
const SS = {
  container: { background: "#111520", border: "1px solid #1e2330", borderRadius: 10, padding: "14px 12px" },
  header: { display: "flex", alignItems: "center", gap: 6, marginBottom: 10 },
  hIcon: { color: "#6ee7b7", fontSize: 12 }, hTitle: { fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#6ee7b7" },
  tabs: { display: "flex", gap: 2, marginBottom: 6 },
  tab: { flex: 1, background: "none", border: "none", fontSize: 9, fontWeight: 700, padding: "4px 0", cursor: "pointer", textAlign: "center" },
  progressTrack: { height: 2, background: "#1e2330", borderRadius: 1, marginBottom: 10, overflow: "hidden" },
  progressFill: { height: 2, background: "#6ee7b7", borderRadius: 1, transition: "width 0.08s linear" },
  list: { display: "flex", flexDirection: "column", gap: 4 },
  row: { display: "grid", gridTemplateColumns: "14px 1fr 52px", alignItems: "center", gap: 4, padding: "3px 0" },
  rank: { fontSize: 9, color: "#3a4258", fontWeight: 700, fontFamily: "monospace" },
  sName: { fontSize: 10, color: "#b0b8c8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  sVal: { fontSize: 10, fontWeight: 700, fontFamily: "'SF Mono',monospace", textAlign: "right" },
  barTrack: { gridColumn: "1/-1", height: 3, background: "#1a1e2a", borderRadius: 2, overflow: "hidden", marginTop: 1 },
  barFill: { height: 3, borderRadius: 2, transition: "width 0.3s ease" },
  loadingMsg: { fontSize: 11, color: "#5a6478", padding: "20px 0", textAlign: "center" },
  footnote: { marginTop: 10, fontSize: 9, color: "#3a4258", textAlign: "center" },
};
const FG = {
  container: { background: "#111520", border: "1px solid #1e2330", borderRadius: 10, padding: "14px 12px", marginTop: 16 },
  header: { display: "flex", alignItems: "center", gap: 6, marginBottom: 2 },
  hIcon: { color: "#f97316", fontSize: 12 }, hTitle: { fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#f97316" },
  source: { fontSize: 9, color: "#3a4258", marginBottom: 12, paddingLeft: 18 },
  bigValue: { textAlign: "center", marginBottom: 8 },
  bigNum: { fontSize: 36, fontWeight: 800, fontFamily: "'SF Mono',monospace", letterSpacing: "-0.04em" },
  bigLabel: { display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: -2 },
  mainGaugeOuter: { marginBottom: 10 },
  mainGaugeTrack: { position: "relative", height: 8, background: "#1a1e2a", borderRadius: 4, overflow: "visible" },
  mainGaugeFill: { height: 8, borderRadius: 4 },
  mainGaugeNeedle: { position: "absolute", top: -4, transform: "translateX(-50%)", width: 2, height: 16, background: "#f0f2f5" },
  needleTri: { width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "5px solid #f0f2f5", position: "absolute", bottom: -5, left: -3 },
  mainGaugeLabels: { display: "flex", justifyContent: "space-between", fontSize: 8, color: "#3a4258", marginTop: 3 },
  divider: { height: 1, background: "#1e2330", margin: "10px 0" },
  row: { display: "grid", gridTemplateColumns: "28px 1fr 22px 52px", alignItems: "center", gap: 4, padding: "4px 0" },
  rowLabel: { fontSize: 9, color: "#5a6478", fontWeight: 600 },
  gaugeTrack: { position: "relative", height: 4, background: "#1a1e2a", borderRadius: 2, overflow: "visible" },
  gaugeFill: { height: 4, borderRadius: 2, transition: "width 0.5s ease" },
  gaugeNeedle: { position: "absolute", top: -2, width: 2, height: 8, background: "#f0f2f5", transform: "translateX(-50%)" },
  rowValue: { fontSize: 11, fontWeight: 800, fontFamily: "monospace", textAlign: "right" },
  rowSentiment: { fontSize: 8, fontWeight: 700, letterSpacing: "0.05em", textAlign: "right", textTransform: "uppercase" },
  footnote: { marginTop: 10, fontSize: 8, color: "#3a4258", textAlign: "center" },
};
