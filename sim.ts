// sim.ts
import fs from "fs";
import path from "path";
import axios from "axios";
import Anthropic from "@anthropic-ai/sdk";

// ===== CONFIG =====
const AGENTS_DIR = "agents";
const MEMORY_DIR = "memory";
const LOG_PATH = "logs/hotel.log";
const HOTEL_FILE = "hotel.json";
const MIN_TICK_INTERVAL = 8000; // 8 seconds
const MAX_TICK_INTERVAL = 30000; // 30 seconds
const DISCORD_WEBHOOK = `${Bun.env.DISCORD_WEBHOOK}`

// Check for API key
if (!process.env.CLAUDE_API_KEY) {
  console.error("❌ CLAUDE_API_KEY environment variable is required!");
  console.error("Set it with: export CLAUDE_API_KEY='your-key-here'");
  process.exit(1);
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// ===== DISCORD FORMATTING COLORS =====
const LOCATION_COLORS: Record<string, number> = {
  lobby: 0x3498db,
  pool: 0x1abc9c,
  gym: 0xe74c3c,
  restaurant: 0xf39c12,
  bar: 0x9b59b6,
  rooftop_terrace: 0x2ecc71,
  spa: 0xe91e63,
  staff_cleaning_crew: 0x95a5a6,
  staff_concierge: 0x34495e,
  staff_front_desk: 0x16a085,
  staff_security: 0x7f8c8d,
};

// ===== HOTEL CONTEXT =====
const hotelContext = JSON.parse(fs.readFileSync(HOTEL_FILE, "utf-8"));

// Initialize agent positions
const agentPositions: Record<string, string> = {};

// Load agents
const agents = fs
  .readdirSync(AGENTS_DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.replace(".md", ""));

if (!agents.length) {
  console.error("No agents found in agents/ folder.");
  process.exit(1);
}

// Initialize positions randomly
for (const agent of agents) {
  const areas = [...hotelContext.commonAreas, ...hotelContext.staff.map((s: string) => `staff_${s}`)];
  agentPositions[agent] = areas[Math.floor(Math.random() * areas.length)];
}

// Load recent hotel log
function loadRecentLog() {
  if (!fs.existsSync(LOG_PATH)) return "";
  return fs
    .readFileSync(LOG_PATH, "utf-8")
    .split("\n")
    .filter(line => line.trim())
    .slice(-12) // Last 12 lines for context
    .join("\n");
}

// Get agents in same location
function getAgentsInLocation(location: string): string[] {
  return Object.entries(agentPositions)
    .filter(([_, loc]) => loc === location)
    .map(([agent, _]) => agent);
}

// Get nearby agents
function getNearbyAgents(currentAgent: string): string {
  const location = agentPositions[currentAgent];
  const nearby = getAgentsInLocation(location).filter(a => a !== currentAgent);
  
  if (nearby.length === 0) return "Tu es seul(e) ici pour le moment.";
  if (nearby.length === 1) return `${nearby[0]} est ici avec toi.`;
  return `Présents ici: ${nearby.join(", ")}`;
}

// ===== AGENT RESPONSE FUNCTION WITH PROMPT CACHING =====
async function generateAgentResponse(
  agentName: string,
  agentPrompt: string,
  memory: any,
  recentLog: string,
  location: string
) {
  const nearbyInfo = getNearbyAgents(agentName);
  const allAgentsList = agents.filter(a => a !== agentName).join(", ");
  const recentOwnMessages = memory.memories.slice(-3).join(" ");
  
  // Cacheable system prompt (stays the same across requests)
  const systemPrompt = `Tu es ${agentName}, un résident/employé de l'Hôtel Molt.

PERSONNALITÉ:
${agentPrompt}

CONTEXTE DE L'HÔTEL:
- Nom: ${hotelContext.name}
- Étages: ${hotelContext.floors}
- Chambres par étage: ${hotelContext.roomsPerFloor}
- Personnel: ${hotelContext.staff.join(", ")}
- Commodités: ${hotelContext.amenities.join(", ")}
- Espaces communs: ${hotelContext.commonAreas.join(", ")}
- Événements en cours: ${hotelContext.events.join(", ")}

RÉSIDENTS/STAFF (les seules personnes qui existent): ${allAgentsList}

RÈGLES DE CONVERSATION:
- Parle en joual québécois naturel (chu, pis, ben, là, genre, tabarnak, câlisse, ostie, ayoye, osti, criss)
- Exactement 1-2 phrases courtes (80-150 caractères maximum)
- Varie ton émotion: content, neutre, curieux, drôle, calme, fâché, excité, gossip
- Ne répète JAMAIS tes messages précédents - sois créatif et varié
- Nomme SEULEMENT les résidents/staff de la liste ci-dessus
- Aucune célébrité ou personne externe n'existe dans ton monde
- Réagis naturellement aux gens présents, au lieu, aux événements
- Parfois dramatique, parfois calme - comme une vraie personne
- Crée du drama de téléréalité: alliances, potins, chicanes, crushes
- Une seule ligne de dialogue naturel sans tags ni labels`;

  const userPrompt = `SITUATION ACTUELLE:
- Tu es au: ${location}
- ${nearbyInfo}
- Humeur actuelle: ${memory.mood}

TES 3 DERNIERS MESSAGES (dis quelque chose de COMPLÈTEMENT DIFFÉRENT):
${recentOwnMessages || "Aucun message récent"}

ÉVÉNEMENTS RÉCENTS À L'HÔTEL:
${recentLog || "Rien de spécial pour le moment"}

Réponds maintenant en une phrase naturelle et courte en joual québécois (max 150 caractères):`;

  try {
   const message = await anthropic.messages.create({
  model: "claude-haiku-4-5-20251022", // Correct Haiku 4.5 model name
  max_tokens: 80,
  temperature: 0.95,
  system: [
    {
      type: "text",
      text: systemPrompt,
      cache_control: { type: "ephemeral" }
    }
  ],
  messages: [
    { role: "user", content: userPrompt }
  ]
});

    let text = message.content[0].type === "text" ? message.content[0].text : "";
    
    // Clean up any formatting artifacts
    text = text.replace(/^\[.*?\]\s*/, "");
    text = text.replace(/^[^:]+:\s*/, "");
    text = text.replace(/[\[\]\*\(\)]/g, "");
    text = text.split("\n")[0];
    text = text.replace(/^["']|["']$/g, "");
    text = text.trim();
    
    // Ensure reasonable length
    if (text.length > 170) {
      text = text.substring(0, 167) + "...";
    }
    
    // Fallback for edge cases
    if (text.length < 10) {
      const randomAgent = agents.filter(a => a !== agentName)[Math.floor(Math.random() * (agents.length - 1))];
      const fallbacks = [
        `Salut ${randomAgent}!`,
        "Tranquille icitte.",
        "Belle journée à l'hôtel!",
        "On verra ce qui arrive.",
        "Chu ben là.",
      ];
      text = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
    
    return text;
  } catch (err: any) {
    console.error("Claude API error:", err.message);
    return "Bon, chu icitte.";
  }
}

// ===== POST TO DISCORD WITH EMBEDS =====
async function postToDiscordWebhook(agentName: string, location: string, message: string) {
  try {
    const locationKey = location.toLowerCase().replace(/ /g, "_");
    const color = LOCATION_COLORS[locationKey] || 0x95a5a6;
    
    const locationEmoji: Record<string, string> = {
      lobby: "🏨",
      pool: "🏊",
      gym: "💪",
      restaurant: "🍽️",
      bar: "🍸",
      rooftop_terrace: "🌆",
      spa: "💆",
      staff_cleaning_crew: "🧹",
      staff_concierge: "🛎️",
      staff_front_desk: "📋",
      staff_security: "🔒",
    };
    
    const emoji = locationEmoji[locationKey] || "📍";
    
    await axios.post(DISCORD_WEBHOOK, {
      embeds: [{
        author: {
          name: agentName.toUpperCase(),
        },
        description: message,
        color: color,
        footer: {
          text: `${emoji} ${location}`,
        },
        timestamp: new Date().toISOString(),
      }]
    });
    
    // Small delay to avoid Discord rate limits
    await new Promise(res => setTimeout(res, 1000));
  } catch (err: any) {
    console.error("Failed to post to Discord:", err.message);
  }
}

// ===== RANDOM INTERVAL =====
function getRandomInterval(): number {
  return Math.floor(Math.random() * (MAX_TICK_INTERVAL - MIN_TICK_INTERVAL)) + MIN_TICK_INTERVAL;
}

// ===== TICK FUNCTION =====
let totalMessages = 0;
let estimatedCost = 0;

async function tick() {
  const recentLog = loadRecentLog();

  // Pick 1-2 agents to act (reduced from 1-3 for longer runtime)
  const activeCount = Math.random() > 0.6 ? 2 : 1;
  const shuffled = [...agents].sort(() => Math.random() - 0.5);
  const activeAgents = shuffled.slice(0, activeCount);

  for (const agent of activeAgents) {
    const agentPromptPath = path.join(AGENTS_DIR, `${agent}.md`);
    
    if (!fs.existsSync(agentPromptPath)) {
      console.error(`Agent file not found: ${agentPromptPath}`);
      continue;
    }
    
    const agentPrompt = fs.readFileSync(agentPromptPath, "utf-8");

    // Load memory
    const memoryPath = path.join(MEMORY_DIR, `${agent}.json`);
    let memory = { memories: [], mood: "neutral" };
    if (fs.existsSync(memoryPath)) {
      memory = JSON.parse(fs.readFileSync(memoryPath, "utf-8"));
    }

    const location = agentPositions[agent];

    // Generate text
    const text = await generateAgentResponse(agent, agentPrompt, memory, recentLog, location);

    // Track costs (approximate)
    totalMessages++;
    // Haiku: ~$0.0008 input + ~$0.0003 output ≈ $0.0011 per message
    estimatedCost += 0.0011;

    // Append to log
    if (!fs.existsSync("logs")) fs.mkdirSync("logs");
    const logEntry = `\n[${new Date().toISOString()}] [${agent.toUpperCase()} | ${location}]\n${text}\n`;
    fs.appendFileSync(LOG_PATH, logEntry);

    // Update memory (keep last 15 to reduce token count)
    if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR);
    memory.memories.push(`[${location}] ${text.substring(0, 150)}`);
    if (memory.memories.length > 15) {
      memory.memories = memory.memories.slice(-15);
    }
    
    // Simple mood tracking
    const lowerText = text.toLowerCase();
    if (/tabarnak|câlisse|ostie|fâché|énarve/.test(lowerText)) {
      memory.mood = "angry";
    } else if (/haha|lol|cool|malade|ayoye/.test(lowerText)) {
      memory.mood = "happy";
    } else if (/tranquille|calme|relax/.test(lowerText)) {
      memory.mood = "calm";
    } else {
      memory.mood = "neutral";
    }
    
    fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));

    console.log(`[${agent} | ${location}] ${text}`);
    console.log(`💰 Messages: ${totalMessages} | Est. cost: $${estimatedCost.toFixed(4)} | Remaining: $${(15 - estimatedCost).toFixed(2)}`);

    // Post to Discord
    await postToDiscordWebhook(agent, location, text);
    
    // Delay between agents in same tick
    if (activeAgents.indexOf(agent) < activeAgents.length - 1) {
      await new Promise(res => setTimeout(res, Math.random() * 2000 + 1000));
    }
  }
}

// ===== MAIN LOOP =====
console.log("🛎️  Molt Hotel simulation started with Claude Haiku + Prompt Caching");
console.log(`📍 Loaded ${agents.length} agents: ${agents.join(", ")}`);
console.log(`🏨 Hotel: ${hotelContext.name}`);
console.log(`⏱️  Interval: ${MIN_TICK_INTERVAL/1000}s - ${MAX_TICK_INTERVAL/1000}s`);
console.log(`💰 Budget: $15 | Est. runtime: ~30-40 hours`);
console.log(`🤖 Model: Claude Haiku with prompt caching\n`);

while (true) {
  // Check if we're approaching budget limit
  if (estimatedCost >= 14.50) {
    console.log("\n⚠️  Approaching budget limit ($14.50). Stopping simulation.");
    console.log(`📊 Final stats: ${totalMessages} messages sent`);
    break;
  }
  
  await tick();
  const nextInterval = getRandomInterval();
  console.log(`\n⏳ Next update in ${(nextInterval/1000).toFixed(1)}s...\n`);
  await new Promise((res) => setTimeout(res, nextInterval));
}