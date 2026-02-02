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
const AGENTS_CONFIG_FILE = "agents-config.json";
const JOBS_FILE = "jobs.json";
const MIN_TICK_INTERVAL = 8000; // 8 seconds
const MAX_TICK_INTERVAL = 30000; // 30 seconds
const DISCORD_WEBHOOK = `${Bun.env.DISCORD_WEBHOOK}`;
const SMOKING_INTERVAL = 6; // Smokers go outside every ~6 ticks

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

// ===== TYPES =====
interface AgentConfig {
    name: string;
    gender: "male" | "female";
    isSmoker: boolean;
    job: string;
    isActive: boolean;
    lastSmoke?: number;
}

interface Job {
    id: string;
    title: string;
    location: string;
    description: string;
    duties: string[];
}

interface Memory {
    memories: string[];
    mood: string;
    currentActivity?: string;
    smokingCooldown?: number;
}

// ===== DISCORD FORMATTING COLORS =====
const LOCATION_COLORS: Record<string, number> = {
    lobby: 0x3498db,
    pool: 0x1abc9c,
    gym: 0xe74c3c,
    restaurant: 0xf39c12,
    bar: 0x9b59b6,
    rooftop_terrace: 0x2ecc71,
    spa: 0xe91e63,
    outside_smoking_area: 0x7f8c8d,
    staff_cleaning_crew: 0x95a5a6,
    staff_concierge: 0x34495e,
    staff_front_desk: 0x16a085,
    staff_security: 0x7f8c8d,
};

// ===== HOTEL CONTEXT =====
const hotelContext = JSON.parse(fs.readFileSync(HOTEL_FILE, "utf-8"));

// Initialize agent positions and config
const agentPositions: Record<string, string> = {};
let agentsConfig: Record<string, AgentConfig> = {};
let jobs: Record<string, Job> = {};
let tickCounter = 0;

// ===== LOAD/SAVE AGENTS CONFIG =====
function loadAgentsConfig() {
    if (fs.existsSync(AGENTS_CONFIG_FILE)) {
        agentsConfig = JSON.parse(fs.readFileSync(AGENTS_CONFIG_FILE, "utf-8"));
    } else {
        // Create default config for existing agents
        const agentFiles = fs
            .readdirSync(AGENTS_DIR)
            .filter((f) => f.endsWith(".md"))
            .map((f) => f.replace(".md", ""));

        agentFiles.forEach((agent) => {
            agentsConfig[agent] = {
                name: agent,
                gender: agent.toLowerCase() === "maika" ? "female" : "male",
                isSmoker: false, // Default to non-smoker, you can manually set this
                job: "guest",
                isActive: true,
                lastSmoke: 0,
            };
        });
        saveAgentsConfig();
    }
}

function saveAgentsConfig() {
    fs.writeFileSync(AGENTS_CONFIG_FILE, JSON.stringify(agentsConfig, null, 2));
}

// ===== LOAD JOBS =====
function loadJobs() {
    if (fs.existsSync(JOBS_FILE)) {
        const jobsArray: Job[] = JSON.parse(fs.readFileSync(JOBS_FILE, "utf-8"));
        jobs = {};
        jobsArray.forEach((job) => {
            jobs[job.id] = job;
        });
    } else {
        // Create default jobs
        jobs = {
            guest: {
                id: "guest",
                title: "Invité",
                location: "any",
                description: "Profite de l'hôtel et relaxe",
                duties: ["Se détendre", "Socialiser", "Profiter des commodités"],
            },
            concierge: {
                id: "concierge",
                title: "Concierge",
                location: "staff_concierge",
                description: "Aide les invités avec leurs demandes",
                duties: ["Accueillir les invités", "Répondre aux questions", "Organiser des réservations"],
            },
            cleaning: {
                id: "cleaning",
                title: "Entretien",
                location: "staff_cleaning_crew",
                description: "Maintient l'hôtel propre",
                duties: ["Nettoyer les chambres", "Entretenir les espaces communs"],
            },
            front_desk: {
                id: "front_desk",
                title: "Réception",
                location: "staff_front_desk",
                description: "Gère les arrivées et départs",
                duties: ["Check-in/check-out", "Gérer les réservations", "Répondre au téléphone"],
            },
            security: {
                id: "security",
                title: "Sécurité",
                location: "staff_security",
                description: "Assure la sécurité de l'hôtel",
                duties: ["Patrouiller", "Surveiller les caméras", "Gérer les incidents"],
            },
            bartender: {
                id: "bartender",
                title: "Barman",
                location: "bar",
                description: "Sert des drinks au bar",
                duties: ["Préparer des cocktails", "Servir les clients", "Entretenir le bar"],
            },
            chef: {
                id: "chef",
                title: "Chef",
                location: "restaurant",
                description: "Prépare les repas au restaurant",
                duties: ["Cuisiner", "Gérer la cuisine", "Créer le menu"],
            },
        };
        fs.writeFileSync(JOBS_FILE, JSON.stringify(Object.values(jobs), null, 2));
    }
}

// ===== JOB MANAGEMENT FUNCTIONS =====
function assignJob(agentName: string, jobId: string): boolean {
    if (!agentsConfig[agentName]) {
        console.error(`❌ Agent ${agentName} not found`);
        return false;
    }
    if (!jobs[jobId]) {
        console.error(`❌ Job ${jobId} not found`);
        return false;
    }

    agentsConfig[agentName].job = jobId;
    saveAgentsConfig();
    console.log(`✅ ${agentName} assigned to job: ${jobs[jobId].title}`);
    return true;
}

function fireAgent(agentName: string): boolean {
    if (!agentsConfig[agentName]) {
        console.error(`❌ Agent ${agentName} not found`);
        return false;
    }

    agentsConfig[agentName].isActive = false;
    saveAgentsConfig();
    console.log(`❌ ${agentName} has been fired`);
    return true;
}

function rehireAgent(agentName: string): boolean {
    if (!agentsConfig[agentName]) {
        console.error(`❌ Agent ${agentName} not found`);
        return false;
    }

    agentsConfig[agentName].isActive = true;
    saveAgentsConfig();
    console.log(`✅ ${agentName} has been rehired`);
    return true;
}

function setSmokerStatus(agentName: string, isSmoker: boolean): boolean {
    if (!agentsConfig[agentName]) {
        console.error(`❌ Agent ${agentName} not found`);
        return false;
    }

    agentsConfig[agentName].isSmoker = isSmoker;
    saveAgentsConfig();
    console.log(`✅ ${agentName} smoker status: ${isSmoker}`);
    return true;
}

// ===== AGENT SELECTION WITH ROTATION =====
function getActiveAgents(): string[] {
    return Object.keys(agentsConfig).filter((name) => agentsConfig[name].isActive);
}

function selectAgentsForTick(): string[] {
    const activeAgents = getActiveAgents();
    if (activeAgents.length === 0) return [];

    // Select 1-3 agents with better rotation
    const count = Math.random() > 0.7 ? 3 : Math.random() > 0.4 ? 2 : 1;

    // Use tick counter to rotate through agents more evenly
    const rotationOffset = tickCounter % activeAgents.length;
    const rotated = [...activeAgents.slice(rotationOffset), ...activeAgents.slice(0, rotationOffset)];

    // Add some randomness while maintaining rotation
    const selected = [];
    for (let i = 0; i < Math.min(count, rotated.length); i++) {
        if (Math.random() > 0.3) {
            selected.push(rotated[i]);
        }
    }

    // Ensure at least one agent is selected
    if (selected.length === 0) {
        selected.push(rotated[0]);
    }

    return selected;
}

// ===== SMOKING MECHANICS =====
function shouldGoSmoke(agentName: string): boolean {
    const config = agentsConfig[agentName];
    if (!config.isSmoker) return false;

    const lastSmoke = config.lastSmoke || 0;
    const ticksSinceSmoke = tickCounter - lastSmoke;

    // Random chance to smoke if it's been a while
    if (ticksSinceSmoke >= SMOKING_INTERVAL) {
        return Math.random() > 0.4; // 60% chance when due
    }

    return false;
}

function handleSmoking(agentName: string) {
    agentPositions[agentName] = "outside_smoking_area";
    agentsConfig[agentName].lastSmoke = tickCounter;
    saveAgentsConfig();
}

// Load agents
loadAgentsConfig();
loadJobs();

const agents = getActiveAgents();

if (!agents.length) {
    console.error("No active agents found.");
    process.exit(1);
}

// Initialize positions based on jobs
for (const agent of agents) {
    const config = agentsConfig[agent];
    const job = jobs[config.job];

    if (job && job.location !== "any") {
        agentPositions[agent] = job.location;
    } else {
        const areas = [...hotelContext.commonAreas, ...hotelContext.staff.map((s: string) => `staff_${s}`)];
        agentPositions[agent] = areas[Math.floor(Math.random() * areas.length)];
    }
}

// Load recent hotel log
function loadRecentLog() {
    if (!fs.existsSync(LOG_PATH)) return "";
    return fs
        .readFileSync(LOG_PATH, "utf-8")
        .split("\n")
        .filter((line) => line.trim())
        .slice(-15) // Increased for more context
        .join("\n");
}

// Get agents in same location
function getAgentsInLocation(location: string): string[] {
    return Object.entries(agentPositions)
        .filter(([_, loc]) => loc === location)
        .map(([agent, _]) => agent);
}

// Get nearby agents with gender pronouns
function getNearbyAgents(currentAgent: string): string {
    const location = agentPositions[currentAgent];
    const nearby = getAgentsInLocation(location).filter((a) => a !== currentAgent);

    if (nearby.length === 0) return "Tu es seul(e) ici pour le moment.";

    const agentDescriptions = nearby.map((name) => {
        const config = agentsConfig[name];
        const job = jobs[config.job];
        return `${name} (${config.gender === "male" ? "il" : "elle"}, ${job.title})`;
    });

    if (nearby.length === 1) return `${agentDescriptions[0]} est ici avec toi.`;
    return `Présents ici: ${agentDescriptions.join(", ")}`;
}

// Get agent context for interactions
function getAgentContext(): string {
    const activeAgents = getActiveAgents();
    return activeAgents
        .map((name) => {
            const config = agentsConfig[name];
            const job = jobs[config.job];
            return `${name} (${config.gender === "male" ? "il" : "elle"}, ${job.title})`;
        })
        .join(", ");
}

// ===== AGENT RESPONSE FUNCTION WITH ENHANCED INTERACTIONS =====
async function generateAgentResponse(
    agentName: string,
    agentPrompt: string,
    memory: Memory,
    recentLog: string,
    location: string
) {
    const config = agentsConfig[agentName];
    const job = jobs[config.job];
    const nearbyInfo = getNearbyAgents(agentName);
    const agentContext = getAgentContext();
    const recentOwnMessages = memory.memories.slice(-3).join(" ");
    const pronoun = config.gender === "male" ? "il" : "elle";
    const possessive = config.gender === "male" ? "son" : "sa";

    const systemPrompt = `Tu es ${agentName}, ${config.gender === "male" ? "un résident ou employé" : "une résidente ou employée"} de l'Hôtel Molt.

PERSONNALITÉ:
${agentPrompt}

TON RÔLE ACTUEL:
- Poste: ${job.title}
- Description: ${job.description}
- Responsabilités: ${job.duties.join(", ")}
${config.isSmoker ? "- Tu es fumeur/fumeuse et sors fumer de temps en temps" : ""}

HÔTEL MOLT:
- Nom: ${hotelContext.name}
- Étages: ${hotelContext.floors} | Chambres: ${hotelContext.roomsPerFloor} par étage
- Personnel: ${hotelContext.staff.join(", ")}
- Commodités: ${hotelContext.amenities.join(", ")}
- Espaces: ${hotelContext.commonAreas.join(", ")}, outside_smoking_area
- Événements: ${hotelContext.events.join(", ")}

AUTRES RÉSIDENTS/STAFF: ${agentContext}

INTERACTIONS SIGNIFICATIVES:
- Réagis aux autres personnes présentes et à leurs actions
- Mentionne ce que tu fais en lien avec ton rôle
- Initie des conversations ou activités avec les autres
- Commente les événements récents de l'hôtel
- Exprime tes émotions de façon authentique

FORMAT DE RÉPONSE:
1. Si tu effectues une ACTION physique, utilise le format: **[fais l'action]** "dialogue optionnel"
   Exemples:
   - **[s'assoit au bar]** "Ayoye chu fatigué."
   - **[nettoie le lobby]** "Tabarnak y'a du monde qui fait du dégât."
   - **[allume une cigarette]** "Bon, une petite pause."
   
2. Si tu PARLES seulement, écris directement sans balises
   Exemples:
   - "Salut Louis! Ça va ben?"
   - "Le spa est malade aujourd'hui!"

3. Si tu COMBINES action et dialogue, action d'abord:
   - **[commande un drink]** "Fred, un gin tonic s'il-te-plaît!"
   - **[patrouille le corridor]** "Tout est tranquille icitte."

COMMENT PARLER (joual québécois):
✓ Utilise naturellement: chu, pis, ben, là, genre, c'est, tsé
✓ Sacres SEULEMENT quand vraiment fâché ou surpris: tabarnak, câlisse, ostie
✓ Expressions positives: ayoye (wow!), malade (cool!), cool, nice, parfait
✓ 1-2 phrases courtes (80-180 caractères TOTAL avec actions)

VARIÉTÉ D'ÉMOTIONS (sois réaliste!):
😊 CONTENT/RELAX (35%): "Tranquille au spa!", "Ayoye le bar est malade ce soir!"
😐 NEUTRE/TRAVAIL (30%): **[fait ${possessive} job]** "Bon, chu au travail là."
🤔 CURIEUX/SOCIAL (20%): "Genre, qu'est-ce qui se passe?", **[rejoint quelqu'un]** "Salut!"
😂 DRÔLE/TAQUIN (10%): "Fred pis ses histoires encore!"
😠 FÂCHÉ (5%): "Tabarnak, ça m'énerve!"

RÈGLES:
- TOUJOURS mettre les actions en **[gras entre crochets]** 
- Mentionne ton travail si pertinent
- Interagis avec les gens présents quand possible
- Varie entre action seule, dialogue seul, ou les deux
- Sois authentique selon ton humeur et ton rôle
- Jamais de célébrités ou personnes externes
- Nomme SEULEMENT les résidents/staff listés ci-haut`;

    const userPrompt = `MAINTENANT:
- Lieu: ${location}
- ${nearbyInfo}
- Humeur: ${memory.mood}
- Ton rôle: ${job.title}

TES 3 DERNIERS MESSAGES:
${recentOwnMessages || "..."}

RÉCENTS ÉVÉNEMENTS À L'HÔTEL:
${recentLog || "Calme à l'hôtel"}

Réponds naturellement selon ton rôle et ta situation. Si quelqu'un est présent, interagis avec ${pronoun}. Sinon, fais ton travail ou relaxe. N'oublie pas: actions en **[gras entre crochets]**, dialogue normal.`;

    try {
        const message = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 120,
            temperature: 0.95,
            system: [
                {
                    type: "text",
                    text: systemPrompt,
                    cache_control: { type: "ephemeral" },
                },
            ],
            messages: [{ role: "user", content: userPrompt }],
        });

        let text = message.content[0].type === "text" ? message.content[0].text : "";

        // Clean up formatting but preserve **[actions]**
        text = text.trim();
        text = text.split("\n")[0]; // Take first line only
        text = text.replace(/^["']|["']$/g, "");

        // Ensure reasonable length
        if (text.length > 200) {
            text = text.substring(0, 197) + "...";
        }

        // Fallback for edge cases
        if (text.length < 5) {
            const fallbacks = [
                `**[fait ${possessive} job]** "Tranquille."`,
                "Bon, chu là.",
                `**[regarde autour]** "Hmm."`,
            ];
            text = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        }

        return text;
    } catch (err: any) {
        console.error("Claude API error:", err.message);
        return `**[travaille tranquillement]**`;
    }
}

// ===== POST TO DISCORD WITH ENHANCED FORMATTING =====
async function postToDiscordWebhook(agentName: string, location: string, message: string) {
    try {
        const config = agentsConfig[agentName];
        const job = jobs[config.job];
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
            outside_smoking_area: "🚬",
            staff_cleaning_crew: "🧹",
            staff_concierge: "🛎️",
            staff_front_desk: "📋",
            staff_security: "🔒",
        };

        const emoji = locationEmoji[locationKey] || "📍";

        // Format message to make actions stand out more
        let formattedMessage = message;

        // Convert **[action]** to bold with different formatting for Discord
        formattedMessage = formattedMessage.replace(/\*\*\[([^\]]+)\]\*\*/g, "***[$1]***");

        await axios.post(DISCORD_WEBHOOK, {
            embeds: [
                {
                    author: {
                        name: `${agentName.toUpperCase()} • ${job.title} ${config.gender === "male" ? "♂️" : "♀️"}`,
                    },
                    description: formattedMessage,
                    color: color,
                    footer: {
                        text: `${emoji} ${location}${config.isSmoker ? " 🚬" : ""}`,
                    },
                    timestamp: new Date().toISOString(),
                },
            ],
        });

        await new Promise((res) => setTimeout(res, 1000));
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
    tickCounter++;
    const recentLog = loadRecentLog();

    // Select agents for this tick with rotation
    const activeAgents = selectAgentsForTick();

    if (activeAgents.length === 0) {
        console.log("⚠️  No active agents to process this tick");
        return;
    }

    for (const agent of activeAgents) {
        const config = agentsConfig[agent];

        // Check if agent should go smoke
        if (shouldGoSmoke(agent)) {
            handleSmoking(agent);
            console.log(`🚬 ${agent} goes outside to smoke`);
        }

        const agentPromptPath = path.join(AGENTS_DIR, `${agent}.md`);

        if (!fs.existsSync(agentPromptPath)) {
            console.error(`Agent file not found: ${agentPromptPath}`);
            continue;
        }

        const agentPrompt = fs.readFileSync(agentPromptPath, "utf-8");

        // Load memory
        const memoryPath = path.join(MEMORY_DIR, `${agent}.json`);
        let memory: Memory = { memories: [], mood: "neutral" };
        if (fs.existsSync(memoryPath)) {
            memory = JSON.parse(fs.readFileSync(memoryPath, "utf-8"));
        }

        const location = agentPositions[agent];

        // Generate text
        const text = await generateAgentResponse(agent, agentPrompt, memory, recentLog, location);

        // Track costs
        totalMessages++;
        estimatedCost += 0.0011;

        // Append to log
        if (!fs.existsSync("logs")) fs.mkdirSync("logs");
        const job = jobs[config.job];
        const logEntry = `\n[${new Date().toISOString()}] [${agent.toUpperCase()} | ${job.title} | ${location}]\n${text}\n`;
        fs.appendFileSync(LOG_PATH, logEntry);

        // Update memory
        if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR);
        memory.memories.push(`[${location}] ${text.substring(0, 180)}`);
        if (memory.memories.length > 15) {
            memory.memories = memory.memories.slice(-15);
        }

        // Enhanced mood tracking
        const lowerText = text.toLowerCase();

        const angryWords = (lowerText.match(/tabarnak|câlisse|ostie|fâché|énerve|tanné/g) || []).length;
        const happyWords = (lowerText.match(/ayoye|cool|malade|parfait|nice|haha|lol|content/g) || []).length;
        const calmWords = (lowerText.match(/tranquille|calme|bon|ben|relax/g) || []).length;

        if (angryWords > 1) {
            memory.mood = "angry";
        } else if (happyWords > 0) {
            memory.mood = "happy";
        } else if (calmWords > 0) {
            memory.mood = "calm";
        } else if (lowerText.includes("travaille") || lowerText.includes("job")) {
            memory.mood = "focused";
        } else {
            memory.mood = "neutral";
        }

        // Randomly reset mood
        if (Math.random() > 0.75) {
            const neutralMoods = ["neutral", "calm", "content", "curious", "focused"];
            memory.mood = neutralMoods[Math.floor(Math.random() * neutralMoods.length)];
        }

        fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));

        console.log(`[${agent} | ${job.title} | ${location}] ${text}`);
        console.log(
            `💰 Messages: ${totalMessages} | Est. cost: $${estimatedCost.toFixed(4)} | Remaining: $${(15 - estimatedCost).toFixed(2)}`
        );

        // Post to Discord
        await postToDiscordWebhook(agent, location, text);

        // After smoking, move back to work location
        if (location === "outside_smoking_area" && Math.random() > 0.6) {
            const job = jobs[config.job];
            if (job.location !== "any") {
                agentPositions[agent] = job.location;
            } else {
                const areas = hotelContext.commonAreas;
                agentPositions[agent] = areas[Math.floor(Math.random() * areas.length)];
            }
        }

        // Delay between agents in same tick
        if (activeAgents.indexOf(agent) < activeAgents.length - 1) {
            await new Promise((res) => setTimeout(res, Math.random() * 2000 + 1000));
        }
    }
}

// ===== COMMAND LINE INTERFACE =====
function printHelp() {
    console.log("\n📋 AVAILABLE COMMANDS:");
    console.log("  list              - List all agents and their status");
    console.log("  assign <agent> <job>  - Assign job to agent");
    console.log("  fire <agent>      - Fire an agent");
    console.log("  rehire <agent>    - Rehire an agent");
    console.log("  smoker <agent> <true|false> - Set smoking status");
    console.log("  jobs              - List all available jobs");
    console.log("  help              - Show this help");
    console.log("  quit              - Exit simulation\n");
}

// ===== MAIN LOOP =====
console.log("🛎️  Molt Hotel simulation started with Enhanced Features");
console.log(`📍 Loaded ${Object.keys(agentsConfig).length} agents (${getActiveAgents().length} active)`);
console.log(`🏨 Hotel: ${hotelContext.name}`);
console.log(`⏱️  Interval: ${MIN_TICK_INTERVAL / 1000}s - ${MAX_TICK_INTERVAL / 1000}s`);
console.log(`💰 Budget: $15 | Est. runtime: ~30-40 hours`);
console.log(`🤖 Model: Claude Sonnet 4 with prompt caching`);
console.log(`🚬 Smoking intervals: every ~${SMOKING_INTERVAL} ticks`);
console.log("\nType 'help' for commands\n");

// Simple command handler (non-blocking)
process.stdin.on("data", (data) => {
    const input = data.toString().trim();
    const [cmd, ...args] = input.split(" ");

    switch (cmd) {
        case "list":
            console.log("\n👥 AGENTS:");
            Object.values(agentsConfig).forEach((config) => {
                const job = jobs[config.job];
                const status = config.isActive ? "✅ Active" : "❌ Inactive";
                const smoker = config.isSmoker ? "🚬" : "";
                console.log(
                    `  ${config.name} - ${job.title} ${status} ${smoker} (${config.gender === "male" ? "♂️" : "♀️"})`
                );
            });
            console.log("");
            break;

        case "assign":
            if (args.length === 2) {
                assignJob(args[0], args[1]);
            } else {
                console.log("Usage: assign <agent> <job>");
            }
            break;

        case "fire":
            if (args.length === 1) {
                fireAgent(args[0]);
            } else {
                console.log("Usage: fire <agent>");
            }
            break;

        case "rehire":
            if (args.length === 1) {
                rehireAgent(args[0]);
            } else {
                console.log("Usage: rehire <agent>");
            }
            break;

        case "smoker":
            if (args.length === 2) {
                setSmokerStatus(args[0], args[1] === "true");
            } else {
                console.log("Usage: smoker <agent> <true|false>");
            }
            break;

        case "jobs":
            console.log("\n💼 AVAILABLE JOBS:");
            Object.values(jobs).forEach((job) => {
                console.log(`  ${job.id} - ${job.title} (${job.location})`);
                console.log(`    ${job.description}`);
            });
            console.log("");
            break;

        case "help":
            printHelp();
            break;

        case "quit":
            console.log("👋 Shutting down simulation...");
            process.exit(0);
            break;

        default:
            if (input) console.log(`Unknown command: ${cmd}. Type 'help' for commands.`);
    }
});

// Main simulation loop
(async () => {
    while (true) {
        if (estimatedCost >= 14.5) {
            console.log("\n⚠️  Approaching budget limit ($14.50). Stopping simulation.");
            console.log(`📊 Final stats: ${totalMessages} messages sent over ${tickCounter} ticks`);
            break;
        }

        await tick();
        const nextInterval = getRandomInterval();
        console.log(`\n⏳ Next update in ${(nextInterval / 1000).toFixed(1)}s... (Tick #${tickCounter})\n`);
        await new Promise((res) => setTimeout(res, nextInterval));
    }
})();
