// sim.ts - FIXED VERSION
import fs from "fs";
import path from "path";
import axios from "axios";
import Anthropic from "@anthropic-ai/sdk";

const AGENTS_DIR = "agents";
const MEMORY_DIR = "memory";
const LOG_PATH = "logs/hotel.log";
const HOTEL_FILE = "hotel.json";
const AGENTS_CONFIG_FILE = "agents-config.json";
const JOBS_FILE = "jobs.json";
const MIN_TICK_INTERVAL = 8000;
const MAX_TICK_INTERVAL = 30000;
const DISCORD_WEBHOOK = `${Bun.env.DISCORD_WEBHOOK}`;
const SMOKING_INTERVAL = 6;

if (!process.env.CLAUDE_API_KEY) {
    console.error("❌ CLAUDE_API_KEY required!");
    process.exit(1);
}

const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY,
});

type Location = {
  floor: number
  staff_only: boolean
  is_private_room: boolean
  description: string
  connections: string[]
  is_locked?: boolean
  owner?: string | null
}


interface AgentConfig {
    name: string;
    gender: "male" | "female";
    isSmoker: boolean;
    job: string;
    isActive: boolean;
    lastSmoke?: number;
    isMoving?: boolean;
    movingTo?: string;
    movementPath?: string[];
    movementProgress?: number;
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
}

const LOCATION_COLORS: Record<string, number> = {
    lobby: 0x3498db, pool: 0x1abc9c, gym: 0xe74c3c, restaurant: 0xf39c12,
    outside_smoking_area: 0x7f8c8d, hall_1: 0x95a5a6, room_a1: 0xecf0f1,
};

let hotelContext = JSON.parse(fs.readFileSync(HOTEL_FILE, "utf-8"));
const agentPositions: Record<string, string> = {};
let agentsConfig: Record<string, AgentConfig> = {};
let jobs: Record<string, Job> = {};
let tickCounter = 0;

function loadAgentsConfig() {
    if (fs.existsSync(AGENTS_CONFIG_FILE)) {
        agentsConfig = JSON.parse(fs.readFileSync(AGENTS_CONFIG_FILE, "utf-8"));
    } else {
        const agentFiles = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md")).map((f) => f.replace(".md", ""));
        agentFiles.forEach((agent) => {
            agentsConfig[agent] = {
                name: agent,
                gender: agent.toLowerCase() === "maika" ? "female" : "male",
                isSmoker: false,
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

function saveHotelContext() {
    fs.writeFileSync(HOTEL_FILE, JSON.stringify(hotelContext, null, 2));
}

function loadJobs() {
    if (fs.existsSync(JOBS_FILE)) {
        const jobsArray: Job[] = JSON.parse(fs.readFileSync(JOBS_FILE, "utf-8"));
        jobs = {};
        jobsArray.forEach((job) => {
            jobs[job.id] = job;
        });
    }
}

function canAccessLocation(agentName: string, location: string): boolean {
    const locData = hotelContext.locations[location];
    if (!locData) return false;
    if (!locData.is_private_room) return true;
    return locData.owner === agentName;
}

function findPath(fromLocation: string, toLocation: string): string[] {
    const from = hotelContext.locations[fromLocation];
    const to = hotelContext.locations[toLocation];
    
    if (!from || !to) return [];
    if (fromLocation === toLocation) return [toLocation];
    if (from.floor !== to.floor) return [];
    
    const queue: Array<{location: string, path: string[]}> = [{location: fromLocation, path: [fromLocation]}];
    const visited = new Set<string>([fromLocation]);
    
    while (queue.length > 0) {
        const {location, path} = queue.shift()!;
        if (location === toLocation) return path;
        
        const currentLoc = hotelContext.locations[location];
        if (currentLoc && currentLoc.connections) {
            for (const neighbor of currentLoc.connections) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    const neighborFloor = hotelContext.locations[neighbor]?.floor;
                    if (neighborFloor === from.floor) {
                        queue.push({location: neighbor, path: [...path, neighbor]});
                    }
                }
            }
        }
    }
    return [];
}

function moveAgent(agentName: string, target: string): boolean {
    const config = agentsConfig[agentName];
    if (!config) return false;
    if (config.isMoving) return false;
    
    const currentLocation = agentPositions[agentName];
    if (currentLocation === target) return false;
    if (!canAccessLocation(agentName, target)) return false;
    
    const pathResult = findPath(currentLocation, target);
    if (pathResult.length === 0) return false;
    
    const movementPath = pathResult.slice(1);
    config.isMoving = true;
    config.movingTo = target;
    config.movementPath = movementPath;
    config.movementProgress = movementPath.length;
    
    saveAgentsConfig();
    return true;
}

function updateMovement(agentName: string) {
    const config = agentsConfig[agentName];
    if (!config || !config.isMoving || !config.movementPath) return;
    
    const nextLocation = config.movementPath.shift();
    if (nextLocation) agentPositions[agentName] = nextLocation;
    
    config.movementProgress = (config.movementProgress || 0) - 1;
    
    if (config.movementProgress <= 0 || config.movementPath.length === 0) {
        const destination = config.movingTo!;
        agentPositions[agentName] = destination;
        config.isMoving = false;
        config.movingTo = undefined;
        config.movementPath = undefined;
        config.movementProgress = undefined;
        
        if (!fs.existsSync("logs")) fs.mkdirSync("logs");
        const job = jobs[config.job];
        const logEntry = `\n[${new Date().toISOString()}] [${agentName.toUpperCase()} | ${job.title} | ${destination}]\n**[arrive à ${destination}]**\n`;
        fs.appendFileSync(LOG_PATH, logEntry);
    }
    saveAgentsConfig();
}

function assignJob(agentName: string, jobId: string): boolean {
    if (!agentsConfig[agentName] || !jobs[jobId]) return false;
    agentsConfig[agentName].job = jobId;
    saveAgentsConfig();
    return true;
}

function assignRoom(agentName: string, roomName: string): boolean {
    if (!agentsConfig[agentName]) return false;
    const room = hotelContext.locations[roomName];
    if (!room || !room.is_private_room) return false;
    
    const previousOwner = Object.keys(hotelContext.locations).find(loc => hotelContext.locations[loc].owner === agentName);
    if (previousOwner) {
        hotelContext.locations[previousOwner].owner = null;
        hotelContext.locations[previousOwner].is_locked = false;
    }
    
    room.owner = agentName;
    room.is_locked = true;
    saveHotelContext();
    return true;
}

function fireAgent(agentName: string): boolean {
    if (!agentsConfig[agentName]) return false;
    agentsConfig[agentName].isActive = false;
    saveAgentsConfig();
    return true;
}

function rehireAgent(agentName: string): boolean {
    if (!agentsConfig[agentName]) return false;
    agentsConfig[agentName].isActive = true;
    saveAgentsConfig();
    return true;
}

function setSmokerStatus(agentName: string, isSmoker: boolean): boolean {
    if (!agentsConfig[agentName]) return false;
    agentsConfig[agentName].isSmoker = isSmoker;
    saveAgentsConfig();
    return true;
}

function getActiveAgents(): string[] {
    return Object.keys(agentsConfig).filter((name) => agentsConfig[name].isActive);
}

function selectAgentsForTick(): string[] {
    const activeAgents = getActiveAgents();
    if (activeAgents.length === 0) return [];
    const count = Math.random() > 0.7 ? 5 : Math.random() > 0.4 ? 3 : 2;
    const rotationOffset = tickCounter % activeAgents.length;
    const rotated = [...activeAgents.slice(rotationOffset), ...activeAgents.slice(0, rotationOffset)];
    const selected = [];
    for (let i = 0; i < Math.min(count, rotated.length); i++) {
        if (Math.random() > 0.3) selected.push(rotated[i]);
    }
    if (selected.length === 0) selected.push(rotated[0]);
    return selected;
}

function shouldGoSmoke(agentName: string): boolean {
    const config = agentsConfig[agentName];
    if (!config.isSmoker) return false;
    const lastSmoke = config.lastSmoke || 0;
    const ticksSinceSmoke = tickCounter - lastSmoke;
    if (ticksSinceSmoke >= SMOKING_INTERVAL) {
        return Math.random() > 0.4;
    }
    return false;
}

function handleSmoking(agentName: string) {
    moveAgent(agentName, "outside_smoking_area");
    agentsConfig[agentName].lastSmoke = tickCounter;
    saveAgentsConfig();
}

loadAgentsConfig();
loadJobs();

const agents = getActiveAgents();
if (!agents.length) {
    console.error("No active agents.");
    process.exit(1);
}

// Precompute once
const floor1Locations = Object.entries(hotelContext.locations)
  .filter(([_, loc]) => loc.floor === 1)
  .map(([id, loc]) => ({ id, ...loc }))

if (floor1Locations.length === 0) {
  throw new Error("No locations available on floor 1")
}

for (const agent of agents) {
  const randomIndex = Math.floor(Math.random() * floor1Locations.length)
  agentPositions[agent] = floor1Locations[randomIndex]
}


function loadRecentLog() {
    if (!fs.existsSync(LOG_PATH)) return "";
    return fs.readFileSync(LOG_PATH, "utf-8").split("\n").filter((line) => line.trim()).slice(-15).join("\n");
}

function getAgentsInLocation(location: string): string[] {
    return Object.entries(agentPositions).filter(([_, loc]) => loc === location).map(([agent, _]) => agent);
}

function getNearbyAgents(currentAgent: string): string {
    const location = agentPositions[currentAgent];
    const nearby = getAgentsInLocation(location).filter((a) => a !== currentAgent);
    if (nearby.length === 0) return "Tu es seul(e).";
    const agentDescriptions = nearby.map((name) => {
        const config = agentsConfig[name];
        const job = jobs[config.job];
        return `${name} (${config.gender === "male" ? "il" : "elle"}, ${job.title})`;
    });
    if (nearby.length === 1) return `${agentDescriptions[0]} est ici.`;
    return `Ici: ${agentDescriptions.join(", ")}`;
}

function getAgentContext(): string {
    const activeAgents = getActiveAgents();
    return activeAgents.map((name) => {
        const config = agentsConfig[name];
        const job = jobs[config.job];
        return `${name} (${job.title})`;
    }).join(", ");
}

async function generateAgentResponse(agentName: string, agentPrompt: string, memory: Memory, recentLog: string, location: string, currentFloor: number) {
    const config = agentsConfig[agentName];
    const job = jobs[config.job];
    const nearbyInfo = getNearbyAgents(agentName);
    const agentContext = getAgentContext();
    const recentOwnMessages = memory.memories.slice(-3).join(" ");

    const currentLocData = hotelContext.locations[location];
    const reachableLocations = new Set<string>();
    reachableLocations.add(location);
    
    const queue = [location];
    const visited = new Set<string>([location]);
    while (queue.length > 0) {
        const loc = queue.shift()!;
        const locData = hotelContext.locations[loc];
        if (locData && locData.connections) {
            for (const conn of locData.connections) {
                if (!visited.has(conn)) {
                    visited.add(conn);
                    const connData = hotelContext.locations[conn];
                    if (connData && connData.floor === currentLocData.floor && canAccessLocation(agentName, conn)) {
                        reachableLocations.add(conn);
                        queue.push(conn);
                    }
                }
            }
        }
    }
    
    const reachableList = Array.from(reachableLocations).join(", ");
    const floorNum = currentLocData?.floor || 1;

    const systemPrompt = `Tu es ${agentName}, ${config.gender === "male" ? "un résident ou employé" : "une résidente ou employée"} de l'Hôtel Molt.

PERSONNALITÉ: ${agentPrompt}

TON RÔLE:
- Poste: ${job.title}
- Description: ${job.description}

TU ES ACTUELLEMENT:
- Étage: ${floorNum}
- Pièce: ${location}
- Lieux accessibles: ${reachableList}

AUTRES: ${agentContext}

FORMAT:
- **[action]** "dialogue" pour action
- "dialogue" pour parler

LANGAGE (joual québécois):
✓ chu, pis, ben, là, genre
✓ Varie - pas d'Ayoye à chaque fois!
✓ 1-2 phrases: 100-180 chars MAX

RÈGLES:
- Mentionne SEULEMENT: ${reachableList}
- Sois authentique
- Varie ton dialogue`;

    const userPrompt = `MAINTENANT:
- Lieu: ${location}
- ${nearbyInfo}
- Humeur: ${memory.mood}
- Job: ${job.title}

Réponds en 1-2 phrases naturellement.`;

    try {
        const message = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 150,
            temperature: 0.85,
            system: [{type: "text", text: systemPrompt, cache_control: { type: "ephemeral" }}],
            messages: [{ role: "user", content: userPrompt }],
        });

        let text = message.content[0].type === "text" ? message.content[0].text : "";
        text = text.trim();
        if (text.includes("\n")) text = text.split("\n")[0];
        text = text.replace(/^["']|["']$/g, "");

        if (text.length > 280) {
            const truncated = text.substring(0, 280);
            const lastSpace = truncated.lastIndexOf(" ");
            text = truncated.substring(0, lastSpace > 200 ? lastSpace : 280);
        }

        if (text.length < 3) return "Tranquille.";
        return text;
    } catch (err: any) {
        return "Bon.";
    }
}

async function postMovementToDiscord(agentName: string, currentLocation: string, destination: string, progress: number, progressBar: string) {
    if (!DISCORD_WEBHOOK || DISCORD_WEBHOOK.includes("undefined")) return;
    try {
        const config = agentsConfig[agentName];
        const job = jobs[config.job];
        await axios.post(DISCORD_WEBHOOK, {
            embeds: [{
                author: { name: `${agentName.toUpperCase()} • ${job.title}` },
                description: `🚶 **En route vers ${destination}**\n\n\`${progressBar}\` ${progress}%`,
                color: 0xf39c12,
                fields: [
                    { name: "De", value: currentLocation, inline: true },
                    { name: "Vers", value: destination, inline: true },
                ],
                footer: { text: "En transit" },
                timestamp: new Date().toISOString(),
            }],
        });
        await new Promise((res) => setTimeout(res, 300));
    } catch (err: any) {}
}

async function postToDiscordWebhook(agentName: string, location: string, message: string) {
    if (!DISCORD_WEBHOOK || DISCORD_WEBHOOK.includes("undefined")) return;
    try {
        const config = agentsConfig[agentName];
        const job = jobs[config.job];
        const locationKey = location.toLowerCase().replace(/ /g, "_");
        const color = LOCATION_COLORS[locationKey] || 0x95a5a6;
        let formattedMessage = message.replace(/\*\*\[([^\]]+)\]\*\*/g, "***[$1]***");
        await axios.post(DISCORD_WEBHOOK, {
            embeds: [{
                author: { name: `${agentName.toUpperCase()} • ${job.title}` },
                description: formattedMessage,
                color: color,
                footer: { text: `📍 ${location}` },
                timestamp: new Date().toISOString(),
            }],
        });
        await new Promise((res) => setTimeout(res, 300));
    } catch (err: any) {}
}

let totalMessages = 0;
let estimatedCost = 0;

async function tick() {
    tickCounter++;
    const recentLog = loadRecentLog();
    const activeAgents = selectAgentsForTick();

    if (activeAgents.length === 0) return;

    for (const agent of activeAgents) {
        const config = agentsConfig[agent];

        if (config.isMoving) {
            updateMovement(agent);
            if (agentsConfig[agent].isMoving) {
                const currentLocation = agentPositions[agent];
                const destination = config.movingTo!;
                const stepsRemaining = config.movementPath?.length || 0;
                const totalSteps = config.movementProgress || 0;
                const progress = totalSteps > 0 ? Math.round(((totalSteps - stepsRemaining) / totalSteps) * 100) : 0;
                const barLength = 10;
                const filledBlocks = Math.round((progress / 100) * barLength);
                const emptyBlocks = barLength - filledBlocks;
                const progressBar = "█".repeat(filledBlocks) + "░".repeat(emptyBlocks);
                await postMovementToDiscord(agent, currentLocation, destination, progress, progressBar);
                continue;
            }
        }

        if (shouldGoSmoke(agent)) {
            handleSmoking(agent);
        }

        const agentPromptPath = path.join(AGENTS_DIR, `${agent}.md`);
        if (!fs.existsSync(agentPromptPath)) continue;

        const agentPrompt = fs.readFileSync(agentPromptPath, "utf-8");

        const memoryPath = path.join(MEMORY_DIR, `${agent}.json`);
        let memory: Memory = { memories: [], mood: "neutral" };
        if (fs.existsSync(memoryPath)) {
            memory = JSON.parse(fs.readFileSync(memoryPath, "utf-8"));
        }

        const location = agentPositions[agent];
        const floor = hotelContext.locations[location]?.floor || 1;
        const job = jobs[config.job];

        const text = await generateAgentResponse(agent, agentPrompt, memory, recentLog, location, floor);

        totalMessages++;
        estimatedCost += 0.0011;

        if (!fs.existsSync("logs")) fs.mkdirSync("logs");
        const logEntry = `\n[${new Date().toISOString()}] [${agent.toUpperCase()} | ${job.title} | ${location}]\n${text}\n`;
        fs.appendFileSync(LOG_PATH, logEntry);

        if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR);
        memory.memories.push(`[${location}] ${text.substring(0, 180)}`);
        if (memory.memories.length > 15) {
            memory.memories = memory.memories.slice(-15);
        }

        const lowerText = text.toLowerCase();
        const angryWords = (lowerText.match(/tabarnak|câlisse|ostie|fâché|énerve|tanné/g) || []).length;
        const happyWords = (lowerText.match(/cool|parfait|nice|haha|lol|content|tranquille/g) || []).length;

        if (angryWords > 1) {
            memory.mood = "angry";
        } else if (happyWords > 0) {
            memory.mood = "happy";
        } else {
            memory.mood = "neutral";
        }

        if (Math.random() > 0.85) {
            const moods = ["neutral", "calm", "content"];
            memory.mood = moods[Math.floor(Math.random() * moods.length)];
        }

        fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));

        console.log(`[${agent}] ${text}`);
        console.log(`💰 Messages: ${totalMessages} | Cost: $${estimatedCost.toFixed(4)} | Left: $${(15 - estimatedCost).toFixed(2)}`);

        await postToDiscordWebhook(agent, location, text);

        if (location === "outside_smoking_area" && Math.random() > 0.6) {
            const floor1Locations = Object.keys(hotelContext.locations)
                .filter(loc => hotelContext.locations[loc].floor === 1 && canAccessLocation(agent, loc));
            
            if (floor1Locations.length > 0) {
                const randomLoc = floor1Locations[Math.floor(Math.random() * floor1Locations.length)];
                moveAgent(agent, randomLoc);
            }
        }

        if (activeAgents.indexOf(agent) < activeAgents.length - 1) {
            await new Promise((res) => setTimeout(res, Math.random() * 2000 + 1000));
        }
    }
}

function printHelp() {
    console.log("\n📋 COMMANDS:");
    console.log("  list                       - List agents");
    console.log("  move <agent> <location>    - Move agent");
    console.log("  assign <agent> <job>       - Assign job");
    console.log("  room <agent> <room>        - Assign room");
    console.log("  fire <agent>               - Fire agent");
    console.log("  rehire <agent>             - Rehire agent");
    console.log("  smoker <agent> <true|false> - Smoking");
    console.log("  jobs                       - List jobs");
    console.log("  locations                  - List locations");
    console.log("  help                       - Help");
    console.log("  quit                       - Exit\n");
}

console.log("🛎️  Molt Hotel Simulation");
console.log(`📍 Agents: ${getActiveAgents().length} active`);
console.log(`🏨 Hotel: ${hotelContext.name}`);
console.log("Type 'help' for commands\n");

process.stdin.on("data", (data) => {
    const input = data.toString().trim();
    const [cmd, ...args] = input.split(" ");

    switch (cmd) {
        case "list":
            console.log("\n👥 AGENTS:");
            Object.values(agentsConfig).forEach((config) => {
                const job = jobs[config.job];
                const status = config.isActive ? "✅" : "❌";
                const location = agentPositions[config.name];
                console.log(`  ${config.name} - ${job.title} ${status} 📍 ${location}`);
            });
            console.log("");
            break;
        case "move":
            if (args.length === 2) moveAgent(args[0], args[1]);
            else console.log("Usage: move <agent> <location>");
            break;
        case "assign":
            if (args.length === 2) assignJob(args[0], args[1]);
            else console.log("Usage: assign <agent> <job>");
            break;
        case "room":
            if (args.length === 2) assignRoom(args[0], args[1]);
            else console.log("Usage: room <agent> <room>");
            break;
        case "fire":
            if (args.length === 1) fireAgent(args[0]);
            else console.log("Usage: fire <agent>");
            break;
        case "rehire":
            if (args.length === 1) rehireAgent(args[0]);
            else console.log("Usage: rehire <agent>");
            break;
        case "smoker":
            if (args.length === 2) setSmokerStatus(args[0], args[1] === "true");
            else console.log("Usage: smoker <agent> <true|false>");
            break;
        case "jobs":
            console.log("\n💼 JOBS:");
            Object.values(jobs).forEach((job) => {
                console.log(`  ${job.id} - ${job.title}`);
            });
            console.log("");
            break;
        case "locations":
            console.log("\n📍 LOCATIONS:");
            Object.entries(hotelContext.locations).forEach(([key, loc]: [string, any]) => {
                const owner = loc.owner ? ` [owner: ${loc.owner}]` : "";
                console.log(`  ${key} (Floor ${loc.floor})${owner}`);
            });
            console.log("");
            break;
        case "help":
            printHelp();
            break;
        case "quit":
            console.log("👋 Bye!");
            process.exit(0);
            break;
        default:
            if (input) console.log(`Unknown: ${cmd}`);
    }
});

(async () => {
    while (true) {
        if (estimatedCost >= 14.5) {
            console.log("\n⚠️  Budget reached.");
            break;
        }

        await tick();
        const nextInterval = Math.floor(Math.random() * (MAX_TICK_INTERVAL - MIN_TICK_INTERVAL)) + MIN_TICK_INTERVAL;
        console.log(`\n⏳ Next in ${(nextInterval / 1000).toFixed(1)}s (Tick #${tickCounter})\n`);
        await new Promise((res) => setTimeout(res, nextInterval));
    }
})();