// Consol market intelligence feed: pulls freight trade-press RSS, tags each item by mode, region and category.
const FEEDS = [
  ["FreightWaves", "https://www.freightwaves.com/news/feed"],
  ["The Loadstar", "https://theloadstar.com/feed/"],
  ["Air Cargo News", "https://www.aircargonews.net/feed/"],
  ["gCaptain", "https://gcaptain.com/feed/"],
  ["Splash247", "https://splash247.com/feed/"],
  ["Supply Chain Dive", "https://www.supplychaindive.com/feeds/news/"]
];
const W = words => new RegExp("\\b(" + words + ")\\b", "i");
const TAGS = {
  air: W("air ?cargo|airfreight|air freight|airlines?|freighters?|airports?|belly|skycargo|worldacd"),
  ocean: W("containers?|container ?ships?|box ?ships?|ocean|shipping lines?|vessels?|ports?|teu|maersk|msc|cma cgm|hapag|evergreen|cosco|one|suez|red sea|panama canal|liner"),
  truck: W("trucks?|trucking|truckers?|ltl|truckload|drayage|drivers?|fmcsa|intermodal|freight rail|diesel"),
  customs: W("customs|tariffs?|duty|duties|cbp|section 301|section 232|de minimis|import bans?|sanctions?"),
  asia: W("china|chinese|asia|asian|vietnam|hong kong|shanghai|shenzhen|yantian|korea|japan|india|taiwan|singapore|far east"),
  europe: W("europe|european|eu|germany|rotterdam|hamburg|antwerp|uk|britain|france|italy|spain|milan|geneva"),
  mideast: W("middle east|red sea|suez|houthis?|saudi|dubai|uae|gulf|israel|iran|qatar"),
  canada: W("canada|canadian"), mexico: W("mexico|mexican|laredo|usmca|nearshoring"),
  oversize: W("oversized?|project cargo|heavy lift|breakbulk")
};
const CAT = [
  ["disr", W("strikes?|attacks?|closures?|closed|disrupt\\w*|storms?|hurricanes?|typhoons?|floods?|flooding|fires?|outages?|congestion|delays?|blockade|cyberattacks?|bans?|chaos|knocks down|collision|grounding")],
  ["tariff", W("tariffs?|duty|duties|customs|section 301|section 232|sanctions?|trade war|de minimis")],
  ["fwd", W("forwarders?|forwarding|acquisitions?|acquires?|merger|takeover|kuehne|dsv|expeditors|schenker|robinson|flexport|geodis|freightos")],
  ["air", TAGS.air], ["ocean", TAGS.ocean], ["truck", TAGS.truck]
];
const MEANS = {
  disr: "Check which open jobs run through the affected lane or port and tell those customers before they ask, with a revised ETA.",
  tariff: "Re-screen HTS codes for affected customers and flag shipments that land after the effective date.",
  fwd: "Consolidation unsettles shared customers and agents. Worth a call to accounts that use either firm.",
  air: "Re-check air quotes older than 7 days on affected lanes and keep validity short while rates move.",
  ocean: "Review open ocean bookings and quotes on affected trades; offer customers routing or timing options.",
  truck: "Re-quote open trucking legs on affected corridors and lock capacity early for upcoming peaks."
};
const strip = s => (s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").replace(/&#8217;|&rsquo;/g, "’").replace(/&#8216;/g, "‘").replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#038;/g, "&").replace(/&#8211;|&ndash;/g, "–").replace(/&#8212;|&mdash;/g, "—").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const pick = (x, tag) => { const m = x.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i")); return m ? strip(m[1]) : ""; };
async function grab([src, url]) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": "ConsolNewsBot/1.0 (+https://northline-studio.fit/consol/)" } }); clearTimeout(t);
    if (!r.ok) return [];
    const xml = await r.text();
    return (xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []).slice(0, 12).map(x => {
      const title = pick(x, "title"), desc = pick(x, "description"), link = pick(x, "link"), date = pick(x, "pubDate");
      const text = title + " " + desc;
      const tags = Object.keys(TAGS).filter(k => TAGS[k].test(text));
      const c = CAT.find(([, re]) => re.test(text)); if (!c) return null; const cat = c[0];
      const imp = cat === "disr" || cat === "tariff" ? "High" : tags.length >= 2 ? "Medium" : "Low";
      return { src, url: link, t: title, d: date ? new Date(date).toISOString() : null, cat, imp, tags, m: MEANS[cat] };
    }).filter(i => i && i.t && i.url && (i.tags.some(t => ["air","ocean","truck","customs"].includes(t)) || i.cat === "fwd"));
  } catch (e) { return []; }
}
module.exports = async (req, res) => {
  const all = (await Promise.all(FEEDS.map(grab))).flat();
  const seen = new Set(), items = all.filter(i => { const k = i.t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.d || "").localeCompare(a.d || "")).slice(0, 40);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify({ updated: new Date().toISOString(), sources: FEEDS.map(f => f[0]), count: items.length, items }));
};
