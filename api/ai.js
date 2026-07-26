export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { prompt, system } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt required" });
  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) return res.status(500).json({ error: "GEMINI_API_KEY not set" });
  try {
    const text = system ? system + "\n\n" + prompt : prompt;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${KEY}`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({contents:[{role:"user",parts:[{text}]}],generationConfig:{maxOutputTokens:1024,temperature:0.3}})
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({error:data.error?.message||"Gemini error"});
    res.json({text:data.candidates?.[0]?.content?.parts?.map(p=>p.text).join("\n")||""});
  } catch(err){res.status(500).json({error:err.message})}
}
